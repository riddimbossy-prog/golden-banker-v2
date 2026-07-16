#!/usr/bin/env node
"use strict";

/**
 * Predict2U v253 rate-limit-safe seven-day fixture snapshot.
 *
 * Improvements:
 * - Sends date requests sequentially by default.
 * - Enforces a configurable gap between requests.
 * - Retries HTTP 429/5xx responses and API-Sports rate-limit errors that are
 *   returned inside an HTTP 200 JSON response.
 * - Honors Retry-After when supplied.
 * - Preserves the previous fixtures for a date when the provider remains
 *   temporarily rate-limited, preventing future tabs from disappearing.
 */

const fs = require("fs");
const https = require("https");

const API_KEY = String(process.env.API_FOOTBALL_KEY || process.env.API_KEY || "").trim();
const DAYS_BACK = clampInt(process.env.DAYS_BACK, 0, 7, 0);
const DAYS_FWD = clampInt(process.env.DAYS_FWD, 0, 14, 6);
const CONCURRENCY = clampInt(process.env.FIXTURE_CONCURRENCY, 1, 2, 1);
const REQUEST_GAP_MS = clampInt(process.env.FIXTURE_REQUEST_GAP_MS, 1000, 120000, 13000);
const RATE_LIMIT_WAIT_MS = clampInt(process.env.FIXTURE_RATE_LIMIT_WAIT_MS, 5000, 180000, 65000);
const MAX_RETRIES = clampInt(process.env.FIXTURE_MAX_RETRIES, 0, 10, 6);
const REQUEST_TIMEOUT_MS = clampInt(process.env.FIXTURE_REQUEST_TIMEOUT_MS, 10000, 120000, 45000);

if (!API_KEY) {
  console.error("Missing API_FOOTBALL_KEY or API_KEY.");
  process.exit(1);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value == null ? "" : value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isoDate = date => date.toISOString().slice(0, 10);
let nextRequestAt = 0;

async function waitForRequestSlot() {
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait > 0) {
    console.log(`Rate guard: waiting ${Math.ceil(wait / 1000)}s before the next fixture request.`);
    await sleep(wait);
  }
  nextRequestAt = Date.now() + REQUEST_GAP_MS;
}

function datesInWindow() {
  const dates = [];
  for (let offset = -DAYS_BACK; offset <= DAYS_FWD; offset += 1) {
    const date = new Date();
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offset);
    dates.push(isoDate(date));
  }
  return dates;
}

function requestOnce(path) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      method: "GET",
      hostname: "v3.football.api-sports.io",
      path,
      headers: {
        "x-apisports-key": API_KEY,
        accept: "application/json"
      }
    }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({
        statusCode: Number(response.statusCode || 0),
        headers: response.headers || {},
        body
      }));
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Timeout for ${path}`));
    });
    request.on("error", reject);
    request.end();
  });
}

function stringifyErrors(errors) {
  if (!errors) return "";
  if (typeof errors === "string") return errors;
  try { return JSON.stringify(errors); }
  catch (_) { return String(errors); }
}

function hasApiErrors(errors) {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(String(errors).trim());
}

function isRateLimitError(statusCode, errors, body) {
  if (statusCode === 429) return true;
  const message = `${stringifyErrors(errors)} ${String(body || "")}`.toLowerCase();
  return [
    "too many requests",
    "rate limit",
    "ratelimit",
    "requests per minute",
    "limit of requests per minute",
    "exceeded the limit"
  ].some(token => message.includes(token));
}

function retryDelay(headers, attempt, rateLimited) {
  const retryAfter = Number.parseInt(String(headers && headers["retry-after"] || ""), 10);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(180000, retryAfter * 1000);
  }
  if (rateLimited) return RATE_LIMIT_WAIT_MS + (attempt * 2000);
  return Math.min(45000, 3000 * Math.pow(2, attempt));
}

async function apiRequest(path) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await waitForRequestSlot();

    let response;
    try {
      response = await requestOnce(path);
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES) break;
      const wait = retryDelay({}, attempt, false);
      console.warn(`Network error for ${path}: ${error.message}. Retrying in ${Math.ceil(wait / 1000)}s (${attempt + 1}/${MAX_RETRIES}).`);
      await sleep(wait);
      continue;
    }

    let payload = null;
    try { payload = JSON.parse(response.body); }
    catch (_) {
      lastError = new Error(`Invalid JSON returned for ${path}`);
      if (attempt >= MAX_RETRIES) break;
      const wait = retryDelay(response.headers, attempt, false);
      console.warn(`${lastError.message}. Retrying in ${Math.ceil(wait / 1000)}s (${attempt + 1}/${MAX_RETRIES}).`);
      await sleep(wait);
      continue;
    }

    const errors = payload && payload.errors;
    const rateLimited = isRateLimitError(response.statusCode, errors, response.body);
    const retryableStatus = response.statusCode === 429 || response.statusCode >= 500;
    const retryablePayload = rateLimited;

    if (retryableStatus || retryablePayload) {
      lastError = new Error(`API rate/service error for ${path}: ${stringifyErrors(errors) || `HTTP ${response.statusCode}`}`);
      if (attempt >= MAX_RETRIES) break;
      const wait = retryDelay(response.headers, attempt, rateLimited);
      // Move the shared gate forward too, so another worker cannot immediately
      // consume the same minute bucket.
      nextRequestAt = Math.max(nextRequestAt, Date.now() + wait);
      console.warn(`${lastError.message}. Retrying in ${Math.ceil(wait / 1000)}s (${attempt + 1}/${MAX_RETRIES}).`);
      await sleep(wait);
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`API request failed (${response.statusCode}) for ${path}: ${response.body.slice(0, 500)}`);
    }

    if (hasApiErrors(errors)) {
      throw new Error(`API error for ${path}: ${stringifyErrors(errors)}`);
    }

    return payload;
  }

  throw lastError || new Error(`Fixture request failed for ${path}`);
}

async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return results;
}

function normalize(raw, requestedDate) {
  const fixture = raw && raw.fixture || {};
  const league = raw && raw.league || {};
  const teams = raw && raw.teams || {};
  const goals = raw && raw.goals || {};
  const score = raw && raw.score || {};
  const status = fixture.status || {};
  const kickoff = fixture.date || null;
  const matchDate = String(kickoff || requestedDate || "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) return null;
  if (!teams.home || !teams.away) return null;

  return {
    id: fixture.id != null ? Number(fixture.id) : null,
    home: teams.home.name || "Home",
    away: teams.away.name || "Away",
    league: league.name || `League ${league.id || ""}`.trim(),
    leagueId: league.id != null ? Number(league.id) : null,
    season: league.season != null ? String(league.season) : null,
    round: league.round || null,
    country: league.country || null,
    flag: league.flag || null,
    homeTeamId: teams.home.id != null ? Number(teams.home.id) : null,
    awayTeamId: teams.away.id != null ? Number(teams.away.id) : null,
    homeLogo: teams.home.logo || null,
    awayLogo: teams.away.logo || null,
    status: status.short || "NS",
    statusLong: status.long || null,
    elapsed: status.elapsed != null ? Number(status.elapsed) : null,
    kickoff,
    timezone: fixture.timezone || "UTC",
    matchDate,
    venue: fixture.venue || null,
    referee: fixture.referee || null,
    homeGoals: goals.home != null ? Number(goals.home) : null,
    awayGoals: goals.away != null ? Number(goals.away) : null,
    htHome: score.halftime && score.halftime.home != null ? Number(score.halftime.home) : null,
    htAway: score.halftime && score.halftime.away != null ? Number(score.halftime.away) : null,
    fixtureOnly: true,
    analysisPending: true,
    enrichmentStatus: "fixture-only",
    dataCoverage: 0
  };
}

function fixtureKey(row) {
  if (row.id != null) return `id:${row.id}`;
  return [row.matchDate, row.kickoff, row.homeTeamId || row.home, row.awayTeamId || row.away].join("|");
}

function parseArrayAssignment(raw, name) {
  const marker = `window.${name}`;
  const markerIndex = raw.indexOf(marker);
  if (markerIndex < 0) return [];
  const equalsIndex = raw.indexOf("=", markerIndex);
  const start = raw.indexOf("[", equalsIndex);
  if (equalsIndex < 0 || start < 0) return [];

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(raw.slice(start, index + 1));
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      }
    }
  }
  return [];
}

function loadPreviousFixtures() {
  if (!fs.existsSync("fixtures.js")) return [];
  return parseArrayAssignment(fs.readFileSync("fixtures.js", "utf8"), "FIXTURES");
}

function preserveRow(row, requestedDate) {
  if (!row || String(row.matchDate || "").slice(0, 10) !== requestedDate) return null;
  if (!row.home || !row.away) return null;
  return {
    ...row,
    matchDate: requestedDate,
    staleFixtureSnapshot: true,
    staleFixtureReason: "Provider rate limit; retained from previous successful snapshot"
  };
}

(async () => {
  const dates = datesInWindow();
  const previousFixtures = loadPreviousFixtures();
  console.log(`Fetching fixture snapshot: ${dates[0]} through ${dates[dates.length - 1]}`);
  console.log(`Rate guard: concurrency=${CONCURRENCY}, gap=${REQUEST_GAP_MS}ms, retries=${MAX_RETRIES}.`);

  const perDay = await pool(dates, CONCURRENCY, async date => {
    const endpoint = `/fixtures?date=${encodeURIComponent(date)}&timezone=UTC`;
    try {
      const payload = await apiRequest(endpoint);
      const response = Array.isArray(payload && payload.response) ? payload.response : [];
      const rows = response.map(item => normalize(item, date)).filter(Boolean);
      console.log(`${date}: ${rows.length} fixture(s) from API.`);
      return { date, rows, source: "api", error: null };
    } catch (error) {
      const fallbackRows = previousFixtures
        .map(row => preserveRow(row, date))
        .filter(Boolean);
      console.warn(`${date}: API unavailable after retries: ${error.message}`);
      if (fallbackRows.length) {
        console.warn(`${date}: preserving ${fallbackRows.length} fixture(s) from the previous snapshot.`);
        return { date, rows: fallbackRows, source: "stale-fallback", error: error.message };
      }
      return { date, rows: [], source: "unresolved", error: error.message };
    }
  });

  const unresolvedDates = perDay.filter(day => day.source === "unresolved").map(day => day.date);
  if (unresolvedDates.length) {
    throw new Error(`Could not retrieve or preserve fixtures for: ${unresolvedDates.join(", ")}`);
  }

  const map = new Map();
  const dateCounts = Object.fromEntries(dates.map(date => [date, 0]));
  const leagueCounts = {};

  for (const day of perDay) {
    for (const row of day.rows) {
      const key = fixtureKey(row);
      if (map.has(key)) continue;
      map.set(key, row);
      dateCounts[row.matchDate] = (dateCounts[row.matchDate] || 0) + 1;
      const leagueKey = `${row.leagueId || ""}|${row.league}`;
      leagueCounts[leagueKey] = (leagueCounts[leagueKey] || 0) + 1;
    }
  }

  const fixtures = [...map.values()].sort((a, b) =>
    String(a.matchDate).localeCompare(String(b.matchDate)) ||
    String(a.kickoff || "").localeCompare(String(b.kickoff || "")) ||
    String(a.league || "").localeCompare(String(b.league || ""))
  );

  if (!fixtures.length) throw new Error("The fixture snapshot contains zero fixtures.");

  const generatedAt = new Date().toISOString();
  const staleFallbackDates = perDay.filter(day => day.source === "stale-fallback").map(day => day.date);
  const apiFailedDates = perDay.filter(day => day.error).map(day => ({
    date: day.date,
    recoveredWithPreviousSnapshot: day.source === "stale-fallback",
    error: day.error
  }));

  const metadata = {
    generatedAt,
    windowStart: dates[0],
    windowEnd: dates[dates.length - 1],
    totalFixtures: fixtures.length,
    daysRequested: dates.length,
    requestGapMs: REQUEST_GAP_MS,
    staleFallbackDates,
    unresolvedDates: [],
    dateCounts
  };

  const js = [
    `/* AUTO-GENERATED by Predict2U v253 fixture snapshot on ${generatedAt}. */`,
    `window.FIXTURE_DATA_UPDATED = ${JSON.stringify(generatedAt)};`,
    `window.FIXTURE_WINDOW = ${JSON.stringify(metadata, null, 2)};`,
    `window.FIXTURES = ${JSON.stringify(fixtures, null, 2)};`,
    ""
  ].join("\n");

  fs.writeFileSync("fixtures.js", js, "utf8");
  fs.writeFileSync("fixture-snapshot-report.json", JSON.stringify({
    ...metadata,
    apiFailedDates,
    dates: perDay.map(day => ({
      date: day.date,
      games: day.rows.length,
      source: day.source
    })),
    leagues: Object.entries(leagueCounts)
      .map(([key, games]) => {
        const [leagueId, league] = key.split("|");
        return { leagueId: leagueId ? Number(leagueId) : null, league, games };
      })
      .sort((a, b) => b.games - a.games || a.league.localeCompare(b.league))
  }, null, 2) + "\n", "utf8");

  console.log(`Published ${fixtures.length} fixture(s) to fixtures.js.`);
  if (staleFallbackDates.length) {
    console.warn(`Stale fallback used for: ${staleFallbackDates.join(", ")}.`);
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
