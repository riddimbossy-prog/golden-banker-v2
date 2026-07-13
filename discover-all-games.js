#!/usr/bin/env node
"use strict";

const fs = require("fs");
const https = require("https");

const API_KEY = String(process.env.API_FOOTBALL_KEY || process.env.API_KEY || "").trim();
const SEASON = String(process.env.SEASON || new Date().getUTCFullYear()).replace(/\D/g, "").slice(0, 4);
const DAYS_BACK = Math.max(0, Number.parseInt(process.env.DAYS_BACK || "0", 10) || 0);
const DAYS_FWD = Math.max(0, Number.parseInt(process.env.DAYS_FWD || "6", 10) || 6);
const SHARD_COUNT = Math.max(1, Math.min(12, Number.parseInt(process.env.SHARD_COUNT || "6", 10) || 6));
const DISCOVERY_CONCURRENCY = Math.max(1, Math.min(4, Number.parseInt(process.env.DISCOVERY_CONCURRENCY || "3", 10) || 3));

if (!API_KEY) {
  console.error("Missing API_FOOTBALL_KEY or API_KEY.");
  process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dateString = d => d.toISOString().slice(0, 10);
const dates = [];
for (let offset = -DAYS_BACK; offset <= DAYS_FWD; offset += 1) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  dates.push(dateString(d));
}

function request(endpoint, attempt = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: "GET",
      hostname: "v3.football.api-sports.io",
      path: endpoint,
      headers: { "x-apisports-key": API_KEY }
    }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", async () => {
        if (res.statusCode === 429 && attempt < 5) {
          await sleep(2500 * (attempt + 1));
          try { resolve(await request(endpoint, attempt + 1)); } catch (e) { reject(e); }
          return;
        }
        try {
          const json = JSON.parse(body);
          if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length) {
            reject(new Error(Object.values(json.errors).join("; ")));
            return;
          }
          resolve(json);
        } catch (_) {
          reject(new Error(`Bad JSON from ${endpoint}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchDate(date) {
  // Date-only is the fastest and broadest API-Football query. It returns every
  // competition scheduled that day. Season fallbacks keep compatibility with
  // plans/endpoints that require a season parameter.
  const endpoints = [
    `/fixtures?date=${date}`,
    `/fixtures?date=${date}&season=${SEASON}`,
    `/fixtures?date=${date}&season=${Number(SEASON) - 1}`,
    `/fixtures?date=${date}&season=${Number(SEASON) + 1}`
  ];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const json = await request(endpoint);
      const fixtures = Array.isArray(json.response) ? json.response : [];
      if (fixtures.length || endpoint === endpoints[endpoints.length - 1]) return fixtures;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error(`Could not discover fixtures for ${date}`);
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

(async () => {
  console.log(`Discovering every fixture across ${dates.length} day(s): ${dates[0]} to ${dates[dates.length - 1]}`);
  const perDate = await pool(dates, DISCOVERY_CONCURRENCY, async date => {
    const fixtures = await fetchDate(date);
    console.log(`${date}: ${fixtures.length} fixture(s)`);
    return { date, fixtures };
  });

  const leagueWeights = new Map();
  const seenFixtures = new Set();
  let fixtureCount = 0;
  for (const day of perDate) {
    for (const fx of day.fixtures) {
      const fixtureId = fx && fx.fixture && fx.fixture.id;
      const leagueId = fx && fx.league && fx.league.id;
      if (!leagueId) continue;
      const uniqueKey = fixtureId || `${day.date}|${leagueId}|${fx.teams?.home?.id}|${fx.teams?.away?.id}`;
      if (seenFixtures.has(uniqueKey)) continue;
      seenFixtures.add(uniqueKey);
      fixtureCount += 1;
      leagueWeights.set(Number(leagueId), (leagueWeights.get(Number(leagueId)) || 0) + 1);
    }
  }

  if (!leagueWeights.size) {
    console.error("No active leagues were found in the requested window.");
    process.exit(2);
  }

  // Greedy balancing by fixture count prevents one shard receiving every busy
  // league while another gets only small competitions.
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
  const manifest = {
    generatedAt: new Date().toISOString(),
    dates,
    fixtureCount,
    activeLeagueCount: leagueWeights.size,
    shardCount: include.length,
    shards: include
  };
  fs.writeFileSync("all-games-discovery.json", JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync("all-games-matrix.json", JSON.stringify({ include }) + "\n");
  console.log(`Discovered ${fixtureCount} unique fixture(s) in ${leagueWeights.size} active league(s), balanced across ${include.length} shard(s).`);
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
