#!/usr/bin/env node
"use strict";

/**
 * Predict2U Odds API bridge v251.
 *
 * Primary purpose:
 * - fill missing 1X2, totals, BTTS, DNB, double-chance and half markets
 * - retain multi-book source, freshness and dispersion metadata
 * - capture actual HT/FT combination prices when the provider exposes them
 * - otherwise create a clearly-labelled HT/FT direction signal from separate
 *   first-half and full-time prices (never presented as a bookmaker price)
 *
 * Provider target: The Odds API v4 using ODDS_API_KEY.
 * The script is fail-soft: unsupported markets and uncovered leagues are
 * reported, not treated as fatal fixture-pipeline failures.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data.js");
const REPORT_FILE = path.join(ROOT, "odds-api-coverage.json");
const CACHE_FILE = path.join(ROOT, "odds-api-cache.json");
const BASE_HOST = "api.the-odds-api.com";
const API_KEY = String(process.env.ODDS_API_KEY || "").trim();
const REGIONS = String(process.env.ODDS_API_REGIONS || "uk").trim();
const MAX_SPORTS = Math.max(1, Number(process.env.ODDS_API_MAX_SPORTS || 40));
const MAX_EVENTS = Math.max(0, Number(process.env.ODDS_API_MAX_EVENTS || 120));
const TEAM_MATCH_MIN = Number(process.env.ODDS_API_TEAM_MATCH_MIN || 0.66);
const SPORT_MATCH_MIN = Number(process.env.ODDS_API_SPORT_MATCH_MIN || 0.27);
const CACHE_TTL_MS = Math.max(60_000, Number(process.env.ODDS_API_CACHE_TTL_MS || 10 * 60 * 1000));
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.ODDS_API_SLEEP_MS || 175));

const BASE_MARKETS = String(process.env.ODDS_API_BASE_MARKETS || "h2h,totals,btts,draw_no_bet,double_chance")
  .split(",").map(s => s.trim()).filter(Boolean);
const ADVANCED_MARKETS = String(process.env.ODDS_API_ADVANCED_MARKETS || "h2h_h1,totals_h1,h2h_h2,totals_h2,team_totals,alternate_totals")
  .split(",").map(s => s.trim()).filter(Boolean);
const HTFT_MARKETS = String(process.env.ODDS_API_HTFT_MARKETS || "htft,half_time_full_time,h2h_ht_ft")
  .split(",").map(s => s.trim()).filter(Boolean);

let cache = {};
try {
  const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  if (parsed && typeof parsed === "object") cache = parsed;
} catch (_) {}

const report = {
  version: "v251",
  generatedAt: new Date().toISOString(),
  provider: "The Odds API v4",
  keyPresent: Boolean(API_KEY),
  regions: REGIONS,
  sportsAvailable: 0,
  soccerSportsAvailable: 0,
  sportMappings: [],
  matchesConsidered: 0,
  matchesMatched: 0,
  matchesUpdated: 0,
  fieldsFilled: 0,
  fieldsReconciled: 0,
  actualHtftMatches: 0,
  derivedHtftMatches: 0,
  bookmakerRows: 0,
  unmatched: [],
  unsupportedMarkets: [],
  requestErrors: [],
  quota: { remaining: null, used: null, last: null },
  skipped: false,
  skipReason: null
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) ? null : Number(v);
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));
const median = values => {
  const arr = values.map(num).filter(v => v !== null).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
};

function saveCache() {
  try {
    const now = Date.now();
    const compact = Object.fromEntries(Object.entries(cache)
      .filter(([, v]) => v && Number(v.expiresAt || 0) > now)
      .sort((a, b) => Number(b[1].savedAt || 0) - Number(a[1].savedAt || 0))
      .slice(0, 2500));
    fs.writeFileSync(CACHE_FILE, `${JSON.stringify(compact)}\n`, "utf8");
  } catch (error) {
    console.warn(`Odds API cache save skipped: ${error.message}`);
  }
}

function readMatches(raw) {
  const marker = raw.indexOf("window.MATCHES");
  if (marker < 0) throw new Error("window.MATCHES was not found in data.js");
  const equals = raw.indexOf("=", marker);
  const start = raw.indexOf("[", equals);
  if (equals < 0 || start < 0) throw new Error("window.MATCHES assignment is invalid");
  let depth = 0, inString = false, escaped = false, end = -1;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "[") depth += 1;
    else if (ch === "]" && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) throw new Error("window.MATCHES array is incomplete");
  return { matches: JSON.parse(raw.slice(start, end)), start, end };
}

function writeMatches(raw, parsed, matches) {
  const stamp = new Date().toISOString();
  let head = raw.slice(0, parsed.start);
  head = head.replace(/window\.DATA_UPDATED\s*=\s*"[^"]*"\s*;/, `window.DATA_UPDATED = "${stamp}";`);
  fs.writeFileSync(DATA_FILE, head + JSON.stringify(matches) + raw.slice(parsed.end), "utf8");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bfootball club\b|\bsoccer club\b/g, " ")
    .replace(/\butd\b/g, " united ")
    .replace(/\b(fc|cf|sc|afc|ac|cd|fk|bk|if|sk|sv|calcio)\b/g, " ")
    .replace(/\bwomen\b|\bladies\b/g, " w ")
    .replace(/\breserves?\b/g, " ii ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ");
}
function tokens(value) { return new Set(normalize(value).split(" ").filter(Boolean)); }
function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}
function teamSimilarity(a, b) {
  const A = normalize(a), B = normalize(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return Math.min(A.length, B.length) / Math.max(A.length, B.length) * 0.94;
  const jac = jaccard(A, B);
  const aFirst = A.split(" ")[0], bFirst = B.split(" ")[0];
  const firstExact = aFirst && aFirst === bFirst ? 0.12 : 0;
  const firstPrefix = aFirst && bFirst && aFirst.length >= 3 && bFirst.length >= 3 && (aFirst.startsWith(bFirst) || bFirst.startsWith(aFirst)) ? 0.18 : 0;
  return clamp(jac + Math.max(firstExact, firstPrefix), 0, 1);
}

const LEAGUE_HINTS = [
  [/premier league/i, "english premier league epl"], [/championship/i, "english championship"], [/league one/i, "english league one"], [/league two/i, "english league two"],
  [/la liga|primera division/i, "spain la liga"], [/segunda/i, "spain segunda"], [/bundesliga/i, "germany bundesliga"], [/serie a/i, "italy serie a"],
  [/ligue 1/i, "france ligue 1"], [/eredivisie/i, "netherlands eredivisie"], [/primeira liga/i, "portugal primeira liga"], [/major league soccer|mls/i, "usa major league soccer mls"],
  [/liga mx/i, "mexico liga mx"], [/brasileir[aã]o|serie a/i, "brazil serie a"], [/argentina.*primera|liga profesional/i, "argentina primera division"],
  [/a.?league/i, "australia a league"], [/j1 league/i, "japan j league"], [/k league 1/i, "korea k league"], [/uefa champions/i, "uefa champions league"],
  [/europa league/i, "uefa europa league"], [/conference league/i, "uefa conference league"], [/nws?l/i, "usa nwsl women"], [/super lig/i, "turkey super lig"]
];
function leagueNeedle(match) {
  const raw = `${match.league || ""} ${match.country || ""}`;
  for (const [re, hint] of LEAGUE_HINTS) if (re.test(raw)) return `${hint} ${match.country || ""}`;
  return raw;
}
function sportScore(match, sport) {
  const needle = leagueNeedle(match);
  const hay = `${sport.title || ""} ${sport.description || ""} ${sport.key || ""}`;
  let score = jaccard(needle, hay);
  const country = normalize(match.country);
  if (country && normalize(hay).includes(country)) score += 0.18;
  const league = normalize(match.league);
  if (league && normalize(hay).includes(league)) score += 0.32;
  return clamp(score, 0, 1);
}

function cacheKey(pathname) { return pathname.replace(/apiKey=[^&]+/i, "apiKey=REDACTED"); }
function requestJson(pathname, ttlMs = CACHE_TTL_MS) {
  const key = cacheKey(pathname);
  const hit = cache[key];
  if (hit && Number(hit.expiresAt || 0) > Date.now()) return Promise.resolve(hit.payload);
  return new Promise((resolve, reject) => {
    const req = https.request({ method: "GET", hostname: BASE_HOST, path: pathname, headers: { accept: "application/json" } }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        report.quota.remaining = num(res.headers["x-requests-remaining"]) ?? report.quota.remaining;
        report.quota.used = num(res.headers["x-requests-used"]) ?? report.quota.used;
        report.quota.last = num(res.headers["x-requests-last"]) ?? report.quota.last;
        let payload;
        try { payload = JSON.parse(body || "null"); }
        catch (_) { reject(new Error(`Bad JSON (${res.statusCode})`)); return; }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message = payload && (payload.message || payload.error) || `HTTP ${res.statusCode}`;
          const error = new Error(message); error.statusCode = res.statusCode; reject(error); return;
        }
        const now = Date.now(); cache[key] = { savedAt: now, expiresAt: now + ttlMs, payload };
        resolve(payload);
      });
    });
    req.on("error", reject); req.end();
  });
}

async function safeRequest(pathname, label, ttlMs) {
  try { const data = await requestJson(pathname, ttlMs); await sleep(REQUEST_DELAY_MS); return data; }
  catch (error) {
    report.requestErrors.push({ label, error: error.message, statusCode: error.statusCode || null });
    return null;
  }
}

function makeOddsPath(sportKey, markets, fromIso, toIso) {
  const query = new URLSearchParams({ apiKey: API_KEY, regions: REGIONS, markets: markets.join(","), oddsFormat: "decimal", dateFormat: "iso", commenceTimeFrom: fromIso, commenceTimeTo: toIso });
  return `/v4/sports/${encodeURIComponent(sportKey)}/odds/?${query}`;
}
function makeEventPath(sportKey, eventId, markets) {
  const query = new URLSearchParams({ apiKey: API_KEY, regions: REGIONS, markets: markets.join(","), oddsFormat: "decimal", dateFormat: "iso" });
  return `/v4/sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(eventId)}/odds?${query}`;
}

function mergeEvents(target, rows) {
  for (const event of Array.isArray(rows) ? rows : []) {
    if (!event || !event.id) continue;
    const old = target.get(event.id);
    if (!old) { target.set(event.id, event); continue; }
    const books = new Map((old.bookmakers || []).map(b => [b.key || b.title, b]));
    for (const book of event.bookmakers || []) {
      const id = book.key || book.title;
      const prior = books.get(id);
      if (!prior) books.set(id, book);
      else {
        const markets = new Map((prior.markets || []).map(m => [m.key, m]));
        for (const market of book.markets || []) markets.set(market.key, market);
        books.set(id, { ...prior, ...book, markets: [...markets.values()] });
      }
    }
    target.set(event.id, { ...old, ...event, bookmakers: [...books.values()] });
  }
}

async function fetchSportEvents(sportKey, fromIso, toIso) {
  const map = new Map();
  const combined = await safeRequest(makeOddsPath(sportKey, BASE_MARKETS, fromIso, toIso), `${sportKey}:base-combined`);
  if (combined) mergeEvents(map, combined);
  else {
    const core = await safeRequest(makeOddsPath(sportKey, ["h2h", "totals"], fromIso, toIso), `${sportKey}:base-core`);
    if (core) mergeEvents(map, core);
    for (const market of BASE_MARKETS.filter(x => !["h2h", "totals"].includes(x))) {
      const rows = await safeRequest(makeOddsPath(sportKey, [market], fromIso, toIso), `${sportKey}:${market}`);
      if (rows) mergeEvents(map, rows); else report.unsupportedMarkets.push({ sportKey, market });
    }
  }
  return map;
}

const SPORT_MARKET_CAPABILITY = new Map();
async function probeEventMarkets(sportKey, eventId) {
  const groups = [
    ADVANCED_MARKETS.filter(x => ["h2h_h1", "totals_h1"].includes(x)),
    ADVANCED_MARKETS.filter(x => ["h2h_h2", "totals_h2"].includes(x)),
    ADVANCED_MARKETS.filter(x => /team_totals|alternate_totals/.test(x)),
    HTFT_MARKETS
  ].filter(group => group.length);
  const supported = [];
  const collected = new Map();
  for (const group of groups) {
    const row = await safeRequest(makeEventPath(sportKey, eventId, group), `${sportKey}:${eventId}:probe:${group.join("+")}`);
    if (row) {
      supported.push(...group);
      mergeEvents(collected, [row]);
      continue;
    }
    // Probe individually only on the first event for this sport. The result is
    // reused for every later event, preventing runaway paid API usage.
    for (const market of group) {
      const single = await safeRequest(makeEventPath(sportKey, eventId, [market]), `${sportKey}:${eventId}:probe:${market}`);
      if (single) { supported.push(market); mergeEvents(collected, [single]); }
      else report.unsupportedMarkets.push({ sportKey, market });
    }
  }
  const unique = [...new Set(supported)];
  SPORT_MARKET_CAPABILITY.set(sportKey, unique);
  return collected.get(eventId) || null;
}
async function fetchAdvancedEvent(sportKey, eventId) {
  if (!SPORT_MARKET_CAPABILITY.has(sportKey)) return probeEventMarkets(sportKey, eventId);
  const markets = SPORT_MARKET_CAPABILITY.get(sportKey) || [];
  if (!markets.length) return null;
  const combined = await safeRequest(makeEventPath(sportKey, eventId, markets), `${sportKey}:${eventId}:advanced-supported`);
  if (combined) return combined;
  // A provider can vary market support by event. Retry only compact groups,
  // not one request per market.
  const collected = new Map();
  const groups = [
    markets.filter(x => /_h1$/.test(x)),
    markets.filter(x => /_h2$/.test(x)),
    markets.filter(x => /team_totals|alternate_totals/.test(x)),
    markets.filter(x => HTFT_MARKETS.includes(x))
  ].filter(group => group.length);
  for (const group of groups) {
    const row = await safeRequest(makeEventPath(sportKey, eventId, group), `${sportKey}:${eventId}:advanced-group`);
    if (row) mergeEvents(collected, [row]);
  }
  return collected.get(eventId) || null;
}

function matchEvent(match, events) {
  let best = null;
  const kickoff = Date.parse(match.kickoff || `${match.matchDate || ""}T12:00:00Z`);
  for (const event of events.values()) {
    const direct = (teamSimilarity(match.home, event.home_team) + teamSimilarity(match.away, event.away_team)) / 2;
    const reverse = (teamSimilarity(match.home, event.away_team) + teamSimilarity(match.away, event.home_team)) / 2;
    const swapped = reverse > direct;
    let score = Math.max(direct, reverse);
    const eventTime = Date.parse(event.commence_time || "");
    if (Number.isFinite(kickoff) && Number.isFinite(eventTime)) {
      const hours = Math.abs(kickoff - eventTime) / 36e5;
      if (hours <= 2) score += 0.12;
      else if (hours <= 12) score += 0.07;
      else if (hours > 36) score -= 0.25;
    }
    score = clamp(score, 0, 1);
    if (!best || score > best.score) best = { event, score, swapped };
  }
  return best && best.score >= TEAM_MATCH_MIN ? best : null;
}

function outcomeSide(outcome, event, match, swapped) {
  const name = normalize(outcome && outcome.name);
  const homeName = normalize(swapped ? event.away_team : event.home_team);
  const awayName = normalize(swapped ? event.home_team : event.away_team);
  if (/^(draw|tie|x)$/.test(name)) return "draw";
  if (/^(home|1)$/.test(name)) return swapped ? "away" : "home";
  if (/^(away|2)$/.test(name)) return swapped ? "home" : "away";
  if (teamSimilarity(name, normalize(match.home)) >= 0.82 || teamSimilarity(name, homeName) >= 0.82) return "home";
  if (teamSimilarity(name, normalize(match.away)) >= 0.82 || teamSimilarity(name, awayName) >= 0.82) return "away";
  return null;
}
function setPointKey(prefix, side, point) {
  if (num(point) === null) return null;
  const p = String(Number(point)).replace(".", "");
  const cap = side === "over" ? "Over" : "Under";
  return prefix ? `${prefix}${cap}${p}` : `${side}${p}`;
}
function parseHtftLabel(value, event, match, swapped) {
  let s = String(value || "").trim().toUpperCase()
    .replace(/HOME/g, "1").replace(/AWAY/g, "2").replace(/DRAW|TIE/g, "X")
    .replace(/\s*(?:\/|→|->|-)\s*/g, "/");
  if (/^[12X]\/[12X]$/.test(s)) return s;
  const parts = String(value || "").split(/[\/→>-]/).map(x => ({ name: x }));
  if (parts.length === 2) {
    const a = outcomeSide(parts[0], event, match, swapped), b = outcomeSide(parts[1], event, match, swapped);
    const code = x => x === "home" ? "1" : x === "away" ? "2" : x === "draw" ? "X" : null;
    if (code(a) && code(b)) return `${code(a)}/${code(b)}`;
  }
  return null;
}

function extractBook(book, event, match, swapped) {
  const current = {}, htft = {};
  let timestamp = book.last_update || null;
  for (const market of book.markets || []) {
    const key = String(market.key || "").toLowerCase();
    timestamp = market.last_update || timestamp;
    for (const outcome of market.outcomes || []) {
      const price = num(outcome.price); if (!price) continue;
      const name = String(outcome.name || "").toLowerCase();
      const side = outcomeSide(outcome, event, match, swapped);
      const point = num(outcome.point);
      if (key === "h2h" || key === "h2h_3_way") {
        if (side) current[side] = price;
      } else if (key === "totals" || key === "alternate_totals") {
        const ou = /over/i.test(name) ? "over" : /under/i.test(name) ? "under" : null;
        const target = ou && setPointKey("", ou, point); if (target) current[target] = price;
      } else if (key === "btts" || /both.*score/.test(key)) {
        if (/yes/.test(name)) current.bttsYes = price; else if (/no/.test(name)) current.bttsNo = price;
      } else if (key === "draw_no_bet" || key === "dnb") {
        if (side === "home") current.homeDnb = price; else if (side === "away") current.awayDnb = price;
      } else if (key === "double_chance") {
        const n = normalize(outcome.name);
        if ((/home/.test(n) && /draw/.test(n)) || /1 x|1x/.test(n)) current.dc1x = price;
        else if ((/away/.test(n) && /draw/.test(n)) || /x 2|x2/.test(n)) current.dcx2 = price;
        else if ((/home/.test(n) && /away/.test(n)) || /1 2|12/.test(n)) current.dc12 = price;
      } else if (key === "h2h_h1" || key === "h2h_1st_half" || key === "h2h_3_way_h1") {
        if (side === "home") current.fhHome = price; else if (side === "draw") current.fhDraw = price; else if (side === "away") current.fhAway = price;
      } else if (key === "totals_h1" || key === "alternate_totals_h1") {
        const ou = /over/i.test(name) ? "over" : /under/i.test(name) ? "under" : null;
        const target = ou && setPointKey("fh", ou, point); if (target) current[target] = price;
      } else if (key === "h2h_h2" || key === "h2h_2nd_half" || key === "h2h_3_way_h2") {
        if (side === "home") current.shHome = price; else if (side === "draw") current.shDraw = price; else if (side === "away") current.shAway = price;
      } else if (key === "totals_h2" || key === "alternate_totals_h2") {
        const ou = /over/i.test(name) ? "over" : /under/i.test(name) ? "under" : null;
        const target = ou && setPointKey("sh", ou, point); if (target) current[target] = price;
      } else if (key === "team_totals" || key === "alternate_team_totals") {
        const description = normalize(outcome.description || "");
        let team = null;
        if (teamSimilarity(description, match.home) >= 0.8) team = "home";
        else if (teamSimilarity(description, match.away) >= 0.8) team = "away";
        const ou = /over/i.test(name) ? "Over" : /under/i.test(name) ? "Under" : null;
        if (team && ou && point !== null) current[`${team}${ou}${String(Number(point)).replace(".", "")}`] = price;
      } else if (HTFT_MARKETS.includes(key) || /half.*time.*full|ht.?ft/.test(key)) {
        const label = parseHtftLabel(outcome.name, event, match, swapped); if (label) htft[label] = price;
      }
    }
  }
  return { bookmaker: book.title || book.key || "Bookmaker", key: book.key || null, timestamp, current, htft };
}

function canonicalize(raw) {
  const map = {};
  for (const [key, value] of Object.entries(raw || {})) {
    let target = key;
    target = target.replace(/^over15$/, "over15").replace(/^under15$/, "under15")
      .replace(/^over25$/, "over25").replace(/^under25$/, "under25")
      .replace(/^over35$/, "over35").replace(/^under35$/, "under35")
      .replace(/^fhOver05$/, "fhOver05").replace(/^fhUnder05$/, "fhUnder05")
      .replace(/^fhOver15$/, "fhOver15").replace(/^fhUnder15$/, "fhUnder15")
      .replace(/^shOver05$/, "shOver05").replace(/^shUnder05$/, "shUnder05")
      .replace(/^shOver15$/, "shOver15").replace(/^shUnder15$/, "shUnder15");
    map[target] = value;
  }
  return map;
}

function aggregateBooks(bookRows) {
  const fieldValues = {};
  for (const row of bookRows) for (const [key, value] of Object.entries(canonicalize(row.current))) {
    if (num(value) === null) continue;
    (fieldValues[key] ||= []).push({ value: Number(value), bookmaker: row.bookmaker, timestamp: row.timestamp });
  }
  const odds = {}, meta = {};
  for (const [key, rows] of Object.entries(fieldValues)) {
    const values = rows.map(x => x.value), med = median(values), min = Math.min(...values), max = Math.max(...values);
    odds[key] = Number(med.toFixed(3));
    meta[key] = {
      source: "the-odds-api",
      bookCount: rows.length,
      median: odds[key], min, max,
      dispersionPct: med ? Number((((max - min) / med) * 100).toFixed(2)) : null,
      lastUpdate: rows.map(x => x.timestamp).filter(Boolean).sort().pop() || null,
      bookmakers: rows.slice(0, 12).map(x => x.bookmaker)
    };
  }
  return { odds, meta };
}

function aggregateHtft(bookRows) {
  const values = {};
  for (const row of bookRows) for (const [label, price] of Object.entries(row.htft || {})) {
    if (num(price) !== null) (values[label] ||= []).push(Number(price));
  }
  const prices = {};
  for (const [label, rows] of Object.entries(values)) prices[label] = Number(median(rows).toFixed(3));
  if (!Object.keys(prices).length) return null;
  const implied = Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, 1 / v]));
  const sum = Object.values(implied).reduce((a, b) => a + b, 0);
  const normalized = sum ? Object.fromEntries(Object.entries(implied).map(([k, v]) => [k, Number((v / sum).toFixed(4))])) : {};
  return { prices, normalized, bookCount: Math.max(...Object.values(values).map(a => a.length)), source: "the-odds-api" };
}

function fair3(odds, prefix = "") {
  const h = num(odds[`${prefix}Home`] ?? odds.home), d = num(odds[`${prefix}Draw`] ?? odds.draw), a = num(odds[`${prefix}Away`] ?? odds.away);
  if (!h || !d || !a) return null;
  const ih = 1 / h, id = 1 / d, ia = 1 / a, sum = ih + id + ia;
  return { home: ih / sum, draw: id / sum, away: ia / sum };
}
function deriveHtft(odds, match) {
  const ft = fair3(odds, ""), fh = fair3(odds, "fh");
  if (!ft || !fh) return null;
  const ftSide = ft.home >= ft.away ? "HOME" : "AWAY", fhSide = fh.home >= fh.away ? "HOME" : "AWAY";
  const aligned = ftSide === fhSide;
  const holdHome = num(match.homeStreaks && match.homeStreaks.htft && match.homeStreaks.htft.holdLeadRate);
  const holdAway = num(match.awayStreaks && match.awayStreaks.htft && match.awayStreaks.htft.holdLeadRate);
  const hold = ftSide === "HOME" ? holdHome : holdAway;
  const persistenceScore = clamp((aligned ? 58 : 38) + Math.abs((ft.home - ft.away) * 55) + Math.abs((fh.home - fh.away) * 35) + (hold !== null ? hold * 12 : 0), 0, 100);
  return {
    source: "derived-from-separate-markets",
    disclaimer: "Directional signal only; not an actual HT/FT bookmaker price.",
    favoriteDirection: aligned ? ftSide : null,
    fullTimeFavorite: ftSide,
    firstHalfFavorite: fhSide,
    aligned,
    persistenceScore: Number(persistenceScore.toFixed(1)),
    fairProbabilities: { fullTime: ft, firstHalf: fh }
  };
}

function reconcile(match, event, sportKey, score, swapped) {
  const books = (event.bookmakers || []).map(book => extractBook(book, event, match, swapped)).filter(row => Object.keys(row.current).length || Object.keys(row.htft).length);
  if (!books.length) return false;
  const aggregated = aggregateBooks(books), htft = aggregateHtft(books);
  const existing = { ...(match.odds || {}) }, merged = { ...existing };
  let changed = false;
  for (const [key, value] of Object.entries(aggregated.odds)) {
    const old = num(existing[key]);
    if (old === null) { merged[key] = value; report.fieldsFilled += 1; changed = true; }
    else if ((aggregated.meta[key].bookCount || 0) >= 2) {
      const blended = Number(median([old, value]).toFixed(3));
      if (Math.abs(blended - old) >= 0.005) { merged[key] = blended; report.fieldsReconciled += 1; changed = true; }
    }
  }
  if (merged.bttsYes != null) merged.gg = merged.bttsYes;
  if (merged.bttsNo != null) merged.ng = merged.bttsNo;
  match.odds = merged;
  match.oddsSources = { ...(match.oddsSources || {}), apiFootball: existing, oddsApi: aggregated.odds };
  match.oddsBooks = books.map(row => ({ bookmaker: row.bookmaker, key: row.key, timestamp: row.timestamp, current: row.current, source: "the-odds-api" }));
  match.oddsMarketMeta = { ...(match.oddsMarketMeta || {}), ...aggregated.meta };
  match.oddsMeta = {
    provider: "blended-api-football-and-the-odds-api",
    matchedSportKey: sportKey,
    matchedEventId: event.id,
    matchScore: Number(score.toFixed(3)),
    bookCount: books.length,
    lastUpdate: books.map(x => x.timestamp).filter(Boolean).sort().pop() || null,
    regions: REGIONS
  };
  if (htft) {
    match.htftOdds = { actual: htft, derived: null };
    report.actualHtftMatches += 1;
  }
  const signal = deriveHtft(merged, match);
  if (signal) {
    match.htftSignal = signal;
    if (!htft) { match.htftOdds = { actual: null, derived: signal }; report.derivedHtftMatches += 1; }
  }
  let cross = 0;
  const ft = fair3(merged, ""), fh = fair3(merged, "fh");
  if (ft && merged.dc1x && merged.dcx2) cross += 1;
  if (ft && fh && ((ft.home >= ft.away) === (fh.home >= fh.away))) cross += 1;
  if (merged.over25 && merged.under25 && merged.bttsYes && merged.bttsNo) cross += 1;
  const lowDisp = Object.values(aggregated.meta).filter(x => x.bookCount >= 3 && num(x.dispersionPct) !== null && x.dispersionPct <= 10).length;
  if (lowDisp >= 3) cross += 1;
  if (htft) cross += 1;
  match.oddsCrossMarketPoints = cross;
  match.oddsAgreementScore = Math.round(clamp(50 + cross * 8 + Math.min(books.length, 8) * 3 - Object.values(aggregated.meta).filter(x => (x.dispersionPct || 0) > 18).length * 4, 0, 100));
  report.bookmakerRows += books.length;
  return changed || true;
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) throw new Error("Missing data.js");
  if (!API_KEY) {
    report.skipped = true; report.skipReason = "ODDS_API_KEY is not available.";
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    console.log("Odds API enrichment skipped: ODDS_API_KEY is missing.");
    return;
  }
  const raw = fs.readFileSync(DATA_FILE, "utf8"), parsed = readMatches(raw), matches = parsed.matches;
  const now = Date.now(), min = now - 12 * 60 * 60 * 1000, max = now + 8 * 24 * 60 * 60 * 1000;
  const candidates = matches.filter(m => {
    const t = Date.parse(m.kickoff || "");
    return Number.isFinite(t) && t >= min && t <= max && !["FT", "AET", "PEN", "CANC", "ABD"].includes(String(m.status || "").toUpperCase());
  });
  report.matchesConsidered = candidates.length;
  if (!candidates.length) {
    report.skipped = true; report.skipReason = "No upcoming matches in the active window.";
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`); return;
  }

  const sports = await safeRequest(`/v4/sports/?apiKey=${encodeURIComponent(API_KEY)}`, "sports", 24 * 60 * 60 * 1000);
  if (!Array.isArray(sports)) throw new Error("The Odds API sports list was unavailable.");
  report.sportsAvailable = sports.length;
  const soccer = sports.filter(s => s && s.active !== false && (/soccer/i.test(s.group || "") || /^soccer_/.test(s.key || "")));
  report.soccerSportsAvailable = soccer.length;

  const leagueGroups = new Map();
  for (const match of candidates) {
    const key = `${match.league || ""}|${match.country || ""}`;
    if (!leagueGroups.has(key)) leagueGroups.set(key, []);
    leagueGroups.get(key).push(match);
  }
  const mapping = new Map();
  for (const [leagueKey, rows] of leagueGroups) {
    const representative = rows[0];
    const ranked = soccer.map(s => ({ sport: s, score: sportScore(representative, s) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best && best.score >= SPORT_MATCH_MIN) {
      mapping.set(leagueKey, best.sport);
      report.sportMappings.push({ league: representative.league, country: representative.country || null, sportKey: best.sport.key, sportTitle: best.sport.title, score: Number(best.score.toFixed(3)), matches: rows.length });
    } else {
      report.unmatched.push({ league: representative.league, country: representative.country || null, reason: "No matching soccer sport key", bestScore: best ? Number(best.score.toFixed(3)) : 0 });
    }
  }

  const sportToMatches = new Map();
  for (const [leagueKey, sport] of mapping) {
    const rows = leagueGroups.get(leagueKey) || [];
    if (!sportToMatches.has(sport.key)) sportToMatches.set(sport.key, []);
    sportToMatches.get(sport.key).push(...rows);
  }
  const selectedSports = [...sportToMatches.keys()].slice(0, MAX_SPORTS);
  const fromIso = new Date(Math.min(...candidates.map(m => Date.parse(m.kickoff)))-3*60*60*1000).toISOString();
  const toIso = new Date(Math.max(...candidates.map(m => Date.parse(m.kickoff)))+3*60*60*1000).toISOString();

  let advancedCount = 0;
  for (const sportKey of selectedSports) {
    const events = await fetchSportEvents(sportKey, fromIso, toIso);
    for (const match of sportToMatches.get(sportKey) || []) {
      const hit = matchEvent(match, events);
      if (!hit) {
        report.unmatched.push({ league: match.league, home: match.home, away: match.away, reason: "No event/team match" });
        continue;
      }
      report.matchesMatched += 1;
      let event = hit.event;
      const needsAdvanced = advancedCount < MAX_EVENTS && (!match.odds || ["fhHome","fhDraw","fhAway","fhOver05","fhUnder15"].some(k => num(match.odds[k]) === null));
      if (needsAdvanced) {
        const extra = await fetchAdvancedEvent(sportKey, event.id);
        if (extra) {
          const mergedMap = new Map([[event.id, event]]); mergeEvents(mergedMap, [extra]); event = mergedMap.get(event.id);
        }
        advancedCount += 1;
      }
      if (reconcile(match, event, sportKey, hit.score, hit.swapped)) report.matchesUpdated += 1;
    }
  }

  report.unsupportedMarkets = [...new Map(report.unsupportedMarkets.map(x => [`${x.sportKey}|${x.market}`, x])).values()];
  report.unmatched = report.unmatched.slice(0, 250);
  report.requestErrors = report.requestErrors.slice(0, 250);
  report.completedAt = new Date().toISOString();
  writeMatches(raw, parsed, matches);
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  saveCache();
  console.log(`Odds API v251: ${report.matchesUpdated}/${report.matchesConsidered} upcoming matches updated; ${report.actualHtftMatches} actual HT/FT markets; ${report.derivedHtftMatches} derived HT/FT direction signals.`);
  console.log(`Fields filled: ${report.fieldsFilled}; reconciled: ${report.fieldsReconciled}; bookmaker rows: ${report.bookmakerRows}.`);
  if (report.quota.remaining !== null) console.log(`Odds API quota remaining: ${report.quota.remaining}.`);
}

if (require.main === module) {
  main().catch(error => {
    report.completedAt = new Date().toISOString();
    report.requestErrors.push({ label: "fatal", error: error.message });
    try { fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8"); saveCache(); } catch (_) {}
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = { normalize, teamSimilarity, sportScore, matchEvent, extractBook, aggregateBooks, aggregateHtft, deriveHtft, reconcile, readMatches };
