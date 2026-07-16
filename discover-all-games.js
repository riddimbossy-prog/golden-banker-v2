#!/usr/bin/env node
"use strict";

/**
 * Predict2U v254 rate-limit-safe all-games discovery.
 *
 * Key changes:
 * - exactly one API-Football request per date (no season retry fan-out)
 * - sequential requests with a configurable minimum gap
 * - detects request-limit errors returned as HTTP 200 payloads
 * - waits for the minute window to reset and retries automatically
 * - falls back to already published fixtures.js/data.js rows for a date when
 *   the provider is temporarily unavailable
 */

const fs = require("fs");
const https = require("https");

const API_KEY = String(process.env.API_FOOTBALL_KEY || process.env.API_KEY || "").trim();
const DAYS_BACK = Math.max(0, Math.min(14, Number.parseInt(process.env.DAYS_BACK || "0", 10) || 0));
const DAYS_FWD = Math.max(0, Math.min(14, Number.parseInt(process.env.DAYS_FWD || "6", 10) || 6));
const SHARD_COUNT = Math.max(1, Math.min(12, Number.parseInt(process.env.SHARD_COUNT || "6", 10) || 6));
const REQUEST_GAP_MS = Math.max(1000, Number.parseInt(process.env.DISCOVERY_REQUEST_GAP_MS || "13000", 10) || 13000);
const RATE_LIMIT_WAIT_MS = Math.max(30000, Number.parseInt(process.env.DISCOVERY_RATE_LIMIT_WAIT_MS || "70000", 10) || 70000);
const MAX_RETRIES = Math.max(1, Math.min(10, Number.parseInt(process.env.DISCOVERY_MAX_RETRIES || "6", 10) || 6));

if (!API_KEY) {
  console.error("Missing API_FOOTBALL_KEY or API_KEY.");
  process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isoDate = date => date.toISOString().slice(0, 10);
const dates = [];
for (let offset = -DAYS_BACK; offset <= DAYS_FWD; offset += 1) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  dates.push(isoDate(date));
}

function flattenErrors(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenErrors).filter(Boolean).join("; ");
  if (typeof value === "object") return Object.values(value).map(flattenErrors).filter(Boolean).join("; ");
  return String(value);
}

function isRateLimitMessage(message) {
  return /too many requests|rate[ -]?limit|requests per minute|exceeded the (?:number|limit) of requests/i.test(String(message || ""));
}

function extractAssignedArray(file, marker) {
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, "utf8");
    const markerIndex = raw.indexOf(marker);
    if (markerIndex < 0) return [];
    const equalsIndex = raw.indexOf("=", markerIndex);
    const start = raw.indexOf("[", equalsIndex);
    if (equalsIndex < 0 || start < 0) return [];

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let index = start; index < raw.length; index += 1) {
      const character = raw[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === "[") depth += 1;
      if (character === "]") {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }
    if (end < 0) return [];
    const rows = JSON.parse(raw.slice(start, end));
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn(`Could not read local fallback ${file}: ${error.message}`);
    return [];
  }
}

function normalizedToApiFixture(row) {
  if (!row || typeof row !== "object") return null;
  const matchDate = String(row.matchDate || row.kickoff || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) return null;
  const kickoff = row.kickoff || `${matchDate}T12:00:00+00:00`;
  const status = String(row.status || "NS").toUpperCase();
  return {
    fixture: {
      id: row.id != null ? Number(row.id) : null,
      date: kickoff,
      timezone: row.timezone || "UTC",
      referee: row.referee || null,
      venue: row.venue || null,
      status: {
        long: row.statusLong || null,
        short: status,
        elapsed: row.elapsed != null ? Number(row.elapsed) : null
      }
    },
    league: {
      id: row.leagueId != null ? Number(row.leagueId) : null,
      name: row.league || null,
      country: row.country || null,
      logo: row.leagueLogo || null,
      flag: row.flag || null,
      season: row.season != null ? Number(row.season) || row.season : null,
      round: row.round || null
    },
    teams: {
      home: {
        id: row.homeTeamId != null ? Number(row.homeTeamId) : null,
        name: row.home || null,
        logo: row.homeLogo || null,
        winner: row.homeGoals != null && row.awayGoals != null ? Number(row.homeGoals) > Number(row.awayGoals) : null
      },
      away: {
        id: row.awayTeamId != null ? Number(row.awayTeamId) : null,
        name: row.away || null,
        logo: row.awayLogo || null,
        winner: row.homeGoals != null && row.awayGoals != null ? Number(row.awayGoals) > Number(row.homeGoals) : null
      }
    },
    goals: {
      home: row.homeGoals != null ? Number(row.homeGoals) : null,
      away: row.awayGoals != null ? Number(row.awayGoals) : null
    },
    score: {
      halftime: {
        home: row.htHome != null ? Number(row.htHome) : null,
        away: row.htAway != null ? Number(row.htAway) : null
      },
      fulltime: {
        home: row.homeGoals != null ? Number(row.homeGoals) : null,
        away: row.awayGoals != null ? Number(row.awayGoals) : null
      },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null }
    }
  };
}

function fixtureKey(raw, requestedDate) {
  const fixtureId = raw && raw.fixture && raw.fixture.id;
  if (fixtureId != null) return `id:${fixtureId}`;
  const leagueId = raw && raw.league && raw.league.id;
  const homeId = raw && raw.teams && raw.teams.home && (raw.teams.home.id || raw.teams.home.name);
  const awayId = raw && raw.teams && raw.teams.away && (raw.teams.away.id || raw.teams.away.name);
  const date = String((raw && raw.fixture && raw.fixture.date) || requestedDate || "").slice(0, 10);
  return `${date}|${leagueId || ""}|${homeId || ""}|${awayId || ""}`;
}

function buildLocalFallback() {
  const byDate = new Map(dates.map(date => [date, new Map()]));
  const sources = [
    { file: "fixtures.js", marker: "window.FIXTURES" },
    { file: "data.js", marker: "window.MATCHES" }
  ];

  for (const source of sources) {
    const rows = extractAssignedArray(source.file, source.marker);
    let accepted = 0;
    for (const row of rows) {
      const date = String(row && (row.matchDate || row.kickoff) || "").slice(0, 10);
      if (!byDate.has(date)) continue;
      const raw = normalizedToApiFixture(row);
      if (!raw || !raw.league || !raw.league.id || !raw.teams.home.name || !raw.teams.away.name) continue;
      const key = fixtureKey(raw, date);
      if (!byDate.get(date).has(key)) {
        byDate.get(date).set(key, raw);
        accepted += 1;
      }
    }
    if (accepted) console.log(`Loaded ${accepted} local fallback fixture(s) from ${source.file}.`);
  }
  return byDate;
}

let lastRequestStartedAt = 0;
async function waitForRequestSlot() {
  const elapsed = Date.now() - lastRequestStartedAt;
  const wait = Math.max(0, REQUEST_GAP_MS - elapsed);
  if (wait > 0) await sleep(wait);
  lastRequestStartedAt = Date.now();
}

function rawRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      method: "GET",
      hostname: "v3.football.api-sports.io",
      path: endpoint,
      headers: {
        "x-apisports-key": API_KEY,
        "accept": "application/json"
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
    request.setTimeout(45000, () => request.destroy(new Error(`Timeout for ${endpoint}`)));
    request.on("error", reject);
    request.end();
  });
}

async function fetchDate(date) {
  const endpoint = `/fixtures?date=${encodeURIComponent(date)}&timezone=UTC`;
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await waitForRequestSlot();
      const result = await rawRequest(endpoint);
      let payload = null;
      try {
        payload = JSON.parse(result.body || "{}");
      } catch (_) {
        throw new Error(`Invalid JSON returned for ${date}`);
      }

      const errorText = flattenErrors(payload && payload.errors);
      const rateLimited = result.statusCode === 429 || isRateLimitMessage(errorText);
      if (rateLimited) {
        if (attempt >= MAX_RETRIES) throw new Error(errorText || `HTTP ${result.statusCode} rate limit`);
        const wait = RATE_LIMIT_WAIT_MS + (attempt * 5000);
        console.warn(`${date}: provider minute limit reached; waiting ${Math.round(wait / 1000)}s before retry ${attempt + 1}/${MAX_RETRIES}.`);
        await sleep(wait);
        continue;
      }

      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(`HTTP ${result.statusCode}: ${String(result.body || "").slice(0, 300)}`);
      }
      if (errorText) throw new Error(errorText);

      return Array.isArray(payload && payload.response) ? payload.response : [];
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES) break;
      const wait = Math.min(30000, 3000 * (attempt + 1));
      console.warn(`${date}: ${error.message}; retrying in ${Math.round(wait / 1000)}s (${attempt + 1}/${MAX_RETRIES}).`);
      await sleep(wait);
    }
  }

  throw lastError || new Error(`Could not discover fixtures for ${date}`);
}

(async () => {
  console.log(`Discovering every fixture across ${dates.length} day(s): ${dates[0]} to ${dates[dates.length - 1]}`);
  console.log(`Discovery policy: 1 request/date, ${REQUEST_GAP_MS}ms minimum gap, ${Math.round(RATE_LIMIT_WAIT_MS / 1000)}s rate-limit wait.`);

  const localByDate = buildLocalFallback();
  const perDate = [];
  const fallbackDates = [];
  const apiDateCounts = {};
  const localFallbackCounts = {};

  for (const date of dates) {
    const localMap = localByDate.get(date) || new Map();
    let apiFixtures = [];
    let usedFallback = false;
    try {
      apiFixtures = await fetchDate(date);
    } catch (error) {
      if (!localMap.size) throw error;
      usedFallback = true;
      fallbackDates.push(date);
      console.warn(`${date}: API discovery failed after retries; preserving ${localMap.size} fixture(s) from the published local feed. Reason: ${error.message}`);
    }

    const combined = new Map();
    for (const raw of localMap.values()) combined.set(fixtureKey(raw, date), raw);
    for (const raw of apiFixtures) combined.set(fixtureKey(raw, date), raw);

    apiDateCounts[date] = apiFixtures.length;
    localFallbackCounts[date] = localMap.size;
    perDate.push({ date, fixtures: [...combined.values()], usedFallback });
    console.log(`${date}: ${combined.size} fixture(s) (${apiFixtures.length} API, ${localMap.size} local${usedFallback ? ", fallback active" : ""})`);
  }

  const leagueWeights = new Map();
  const seenFixtures = new Set();
  const discoveredFixtures = [];
  const dateCounts = Object.fromEntries(dates.map(date => [date, 0]));
  let fixtureCount = 0;

  for (const day of perDate) {
    for (const raw of day.fixtures) {
      const fixtureId = raw && raw.fixture && raw.fixture.id;
      const leagueId = raw && raw.league && raw.league.id;
      if (!leagueId) continue;
      const uniqueKey = fixtureKey(raw, day.date);
      if (seenFixtures.has(uniqueKey)) continue;
      seenFixtures.add(uniqueKey);
      fixtureCount += 1;
      dateCounts[day.date] = (dateCounts[day.date] || 0) + 1;
      discoveredFixtures.push({ date: day.date, fixture: raw });
      leagueWeights.set(Number(leagueId), (leagueWeights.get(Number(leagueId)) || 0) + 1);
    }
  }

  if (!leagueWeights.size) {
    throw new Error("No active leagues were found in the requested window.");
  }

  const bins = Array.from({ length: SHARD_COUNT }, (_, index) => ({ index, load: 0, leagues: [] }));
  const leagues = [...leagueWeights.entries()].sort((a, b) => b[1] - a[1]);
  for (const [leagueId, weight] of leagues) {
    bins.sort((a, b) => a.load - b.load || a.index - b.index);
    bins[0].leagues.push(leagueId);
    bins[0].load += weight;
  }
  bins.sort((a, b) => a.index - b.index);

  const include = bins.filter(bin => bin.leagues.length).map(bin => ({
    index: bin.index,
    leagues: bin.leagues.join(","),
    expectedFixtures: bin.load
  }));

  const generatedAt = new Date().toISOString();
  const manifest = {
    generatedAt,
    dates,
    fixtureCount,
    dateCounts,
    apiDateCounts,
    localFallbackCounts,
    fallbackDates,
    activeLeagueCount: leagueWeights.size,
    shardCount: include.length,
    requestPolicy: {
      requestsPerDate: 1,
      sequential: true,
      requestGapMs: REQUEST_GAP_MS,
      rateLimitWaitMs: RATE_LIMIT_WAIT_MS,
      maxRetries: MAX_RETRIES
    },
    shards: include
  };

  fs.writeFileSync("all-games-discovery.json", JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync("all-games-fixtures.json", JSON.stringify({
    generatedAt,
    dates,
    fixtureCount,
    fallbackDates,
    fixtures: discoveredFixtures
  }) + "\n");
  fs.writeFileSync("all-games-matrix.json", JSON.stringify({ include }) + "\n");

  console.log(`Discovered ${fixtureCount} unique fixture(s) in ${leagueWeights.size} active league(s), balanced across ${include.length} shard(s).`);
  if (fallbackDates.length) console.log(`Local fallback protected ${fallbackDates.length} date(s): ${fallbackDates.join(", ")}`);
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
