/* ============================================================
   fetch-scores.js — LIGHTWEIGHT scores-only updater.
   Reads the existing data.js, fetches fixtures for a small date window
   (cheap: one call per date), and updates ONLY homeGoals / awayGoals / status
   on matches it can match by fixture id (or team names + date). It does NOT
   refetch stats, odds, standings, or rebuild anything — so it runs in ~1-2 min
   and is safe to schedule every 30 minutes for fast score settling.
   It NEVER removes matches or fields; if it can't match a fixture it leaves the
   existing row untouched.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const https = require("https");
const HERE = __dirname;

function readConfig() {
  const raw = fs.readFileSync(path.join(HERE, "config.txt"), "utf8");
  const cfg = { API_KEY: "", SEASON: "" };
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toUpperCase();
    const val = line.slice(eq + 1).trim();
    if (key === "API_KEY") cfg.API_KEY = val.replace(/['"*]/g, "").replace(/[^A-Za-z0-9\-]/g, "");
    else if (key === "SEASON") cfg.SEASON = val.replace(/[^0-9]/g, "");
    else if (key === "DAYS_BACK") cfg.DAYS_BACK = parseInt(val.replace(/[^0-9]/g,""),10);
  }
  return cfg;
}

function apiGet(endpoint, key) {
  return new Promise((resolve, reject) => {
    const opts = { method:"GET", hostname:"v3.football.api-sports.io", path:endpoint, headers:{ "x-apisports-key":key } };
    const req = https.request(opts, res => {
      let body = "";
      res.on("data", d => (body += d));
      res.on("end", () => {
        if (res.statusCode === 429) { reject(new Error("RATE_LIMIT")); return; }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// status codes the API uses for a finished match
const FINISHED = new Set(["FT","AET","PEN"]);
const sleep = ms => new Promise(r=>setTimeout(r, ms));

function loadExistingMatches() {
  const p = path.join(HERE, "data.js");
  const raw = fs.readFileSync(p, "utf8");
  const m = raw.match(/window\.MATCHES\s*=\s*([\s\S]*?);\s*$/m);
  if (!m) throw new Error("Could not parse window.MATCHES from data.js");
  return JSON.parse(m[1]);
}

(async function main(){
  const cfg = readConfig();
  const placeholder = "PASTE_YOUR_REAL_KEY_HERE";
  if (!cfg.API_KEY || cfg.API_KEY === placeholder) { console.log("ERROR: no API key."); process.exit(1); }

  let matches;
  try { matches = loadExistingMatches(); }
  catch(e){ console.log("Could not read existing data.js — aborting (will not overwrite):", e.message); process.exit(0); }

  // build the small date window: today + a few days back to catch recently-finished games
  const daysBack = Number.isFinite(cfg.DAYS_BACK) ? Math.min(3, Math.abs(cfg.DAYS_BACK)) : 2;
  const dates = [];
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(); d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0,10));
  }

  // fetch fixtures for each date, build a lookup of id -> {goals,status}
  const liveById = {};
  const liveByKey = {}; // home|away|date -> {goals,status}
  let calls = 0;
  for (const date of dates) {
    try {
      const res = await apiGet(`/fixtures?date=${date}`, cfg.API_KEY);
      calls++;
      const arr = (res && res.response) || [];
      for (const fx of arr) {
        const id = fx.fixture && fx.fixture.id;
        const st = fx.fixture && fx.fixture.status && fx.fixture.status.short;
        const gh = fx.goals ? fx.goals.home : null;
        const ga = fx.goals ? fx.goals.away : null;
        const rec = { homeGoals: gh, awayGoals: ga, status: st };
        if (id != null) liveById[id] = rec;
        const hn = fx.teams && fx.teams.home && fx.teams.home.name;
        const an = fx.teams && fx.teams.away && fx.teams.away.name;
        if (hn && an) liveByKey[(hn+"|"+an+"|"+date).toLowerCase()] = rec;
      }
    } catch(e) {
      console.log(`fixtures fetch failed for ${date}: ${e.message} (skipping)`);
    }
    await sleep(400);
  }

  // update ONLY scores/status on existing matches; never remove or rebuild
  let updated = 0;
  for (const mt of matches) {
    let rec = null;
    if (mt.fixtureId != null && liveById[mt.fixtureId]) rec = liveById[mt.fixtureId];
    else if (mt.id != null && liveById[mt.id]) rec = liveById[mt.id];
    else {
      const key = (String(mt.home)+"|"+String(mt.away)+"|"+String(mt.matchDate)).toLowerCase();
      if (liveByKey[key]) rec = liveByKey[key];
    }
    if (!rec) continue;
    // only write when there's something new (avoids needless commits)
    const newH = rec.homeGoals, newA = rec.awayGoals, newS = rec.status;
    if (mt.homeGoals !== newH || mt.awayGoals !== newA || mt.status !== newS) {
      // only overwrite goals if the API actually has them (don't blank existing)
      if (newH != null) mt.homeGoals = newH;
      if (newA != null) mt.awayGoals = newA;
      if (newS) mt.status = newS;
      updated++;
    }
  }

  if (updated === 0) {
    console.log(`No score changes (${calls} calls, ${dates.length} dates). Leaving data.js as-is.`);
    process.exit(0);
  }

  // preserve the existing DATA_UPDATED (this is NOT a full refresh, just scores)
  let existingUpdated = new Date().toISOString();
  try {
    const raw = fs.readFileSync(path.join(HERE,"data.js"),"utf8");
    const mm = raw.match(/window\.DATA_UPDATED\s*=\s*"([^"]+)"/);
    if (mm) existingUpdated = mm[1];
  } catch(e){}

  const out =
    `window.DATA_UPDATED = ${JSON.stringify(existingUpdated)};\n` +
    `window.SCORES_UPDATED = "${new Date().toISOString()}";\n` +
    `window.MATCHES = ${JSON.stringify(matches, null, 2)};\n`;
  fs.writeFileSync(path.join(HERE, "data.js"), out, "utf8");
  console.log(`Updated scores on ${updated} match(es) in ${calls} calls.`);
})();
