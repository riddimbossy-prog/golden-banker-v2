/* ============================================================
   fetch-scores.js — LIGHTWEIGHT scores-only updater.
   Reads the existing data.js, fetches fixtures for a small date window
   (cheap: one call per date), and updates ONLY homeGoals / awayGoals / status
   on matches it can match by fixture id (or team names + date). It does NOT
   refetch stats, odds, standings, or rebuild anything — so it runs in ~1-2 min
   and is safe to schedule every 5 minutes for current score snapshots.
   It NEVER removes matches or fields; if it can't match a fixture it leaves the
   existing row untouched.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { buildOddsCalib } = require("./calib");
const { updateTeamProfiles, attachProfiles } = require("./team-profiles");
const engineLearning = require("./engine-learning.js");
const { attachModelCalibration } = require("./model-calibration");
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
const FINISHED = new Set(["FT","AET","PEN","AWD","WO"]);
const LIVE_CODES = new Set(["1H","HT","2H","ET","BT","P","LIVE"]);
function isLiveCode(status){ return LIVE_CODES.has(String(status||"").toUpperCase()); }
// statuses that mean "this match is over" but the API sometimes leaves stuck
// on a live code (2H/ET/P/etc.) for obscure leagues. We treat a match as over
// if it's already FINISHED, OR it has a final score and kicked off long ago.
const STALE_MINUTES = 150; // ~90 min play + HT + stoppage + buffer
function kickoffMsAgo(mt) {
  const t = mt && mt.kickoff ? Date.parse(mt.kickoff) : NaN;
  return Number.isFinite(t) ? (Date.now() - t) : NaN;
}
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
  const liveByKey = {}; // home|away|date -> current fixture snapshot
  const snapshotAt = new Date().toISOString();
  let calls = 0;
  for (const date of dates) {
    try {
      const res = await apiGet(`/fixtures?date=${date}`, cfg.API_KEY);
      calls++;
      const arr = (res && res.response) || [];
      for (const fx of arr) {
        const id = fx.fixture && fx.fixture.id;
        const statusBlock = fx.fixture && fx.fixture.status || {};
        const st = statusBlock.short;
        const statusLong = statusBlock.long || null;
        const el = statusBlock.elapsed;
        const extra = statusBlock.extra;
        const gh = fx.goals ? fx.goals.home : null;
        const ga = fx.goals ? fx.goals.away : null;
        const __ht = fx.score && fx.score.halftime;
        const rec = {
          homeGoals:gh,
          awayGoals:ga,
          status:st,
          statusLong,
          elapsed:(el!=null?Number(el):null),
          elapsedExtra:(extra!=null?Number(extra):null),
          liveUpdatedAt:isLiveCode(st)?snapshotAt:null,
          htHome:(__ht&&__ht.home!=null)?__ht.home:null,
          htAway:(__ht&&__ht.away!=null)?__ht.away:null
        };
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
    const newH=rec.homeGoals,newA=rec.awayGoals,newS=rec.status,newE=rec.elapsed;
    const changed =
      mt.homeGoals!==newH || mt.awayGoals!==newA || mt.status!==newS ||
      mt.statusLong!==rec.statusLong || mt.elapsed!==newE ||
      mt.elapsedExtra!==rec.elapsedExtra ||
      (rec.htHome!=null&&mt.htHome!==rec.htHome) ||
      (rec.htAway!=null&&mt.htAway!==rec.htAway);
    if(changed){
      // only overwrite goals if the API actually has them (don't blank existing)
      if(newH!=null)mt.homeGoals=newH;
      if(newA!=null)mt.awayGoals=newA;
      if(rec.htHome!=null)mt.htHome=rec.htHome;
      if(rec.htAway!=null)mt.htAway=rec.htAway;
      if(newS)mt.status=newS;
      mt.statusLong=rec.statusLong||mt.statusLong||null;

      if(FINISHED.has(String(newS||"").toUpperCase())){
        mt.elapsed=null;
        mt.elapsedExtra=null;
        mt.liveUpdatedAt=null;
      }else{
        mt.elapsed=newE!=null?newE:null;
        mt.elapsedExtra=rec.elapsedExtra!=null?rec.elapsedExtra:null;
        mt.liveUpdatedAt=isLiveCode(newS)?rec.liveUpdatedAt:null;
      }
      updated++;
    }
  }

  // SAFETY NET — fix the "stuck on LIVE" bug.
  // API-Football occasionally never flips obscure-league fixtures to FT.
  // If a match already has a final score AND kicked off more than
  // STALE_MINUTES ago AND is not already a finished status, force it to FT.
  // This only PROMOTES clearly-over games; it never blanks goals or rebuilds.
  let promoted = 0;
  for (const mt of matches) {
    const hasScore = mt.homeGoals != null && mt.awayGoals != null;
    const overdue = kickoffMsAgo(mt) >= STALE_MINUTES * 60 * 1000;
    const notFinished = !FINISHED.has(String(mt.status || "").toUpperCase());
    if (hasScore && overdue && notFinished) {
      mt.status="FT";
      mt.statusLong="Match Finished";
      mt.elapsed=null;
      mt.elapsedExtra=null;
      mt.liveUpdatedAt=null;
      promoted++;
      updated++;
    }
  }
  if (promoted) console.log(`Promoted ${promoted} stale-live match(es) to FT (overdue + final score).`);

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

  // Just settled games -> rebuild the calibration ledger so this write carries
  // it too. Without this, the 30-min scores writer overwrites data.js WITHOUT
  // a ledger and silently wipes calibration off every match (the bug fix).
  {
    const r = buildOddsCalib(matches);
    const tp = updateTeamProfiles(matches); const ta = attachProfiles(matches);
    console.log(`Team profiles refreshed on scores write: ${tp.teams} teams, attached to ${ta.attached} match-sides.`);
    console.log(`Odds calibration rebuilt on scores write: ${r.leagues} leagues, attached to ${r.attached} matches.`);
  }

  const out =
    `window.DATA_UPDATED = ${JSON.stringify(existingUpdated)};\n` +
    `window.SCORES_UPDATED = "${new Date().toISOString()}";\n` +
    `window.MATCHES = ${JSON.stringify(matches, null, 2)};\n`;
  fs.writeFileSync(path.join(HERE, "data.js"), out, "utf8");
  try {
    const lr = engineLearning.runBuild();
    console.log(`Engine learning refreshed: ${lr.ledger.summary.reviewedLosses} reviewed losses; ${lr.attached} upcoming contexts.`);
  } catch(e) { console.log("Engine learning refresh skipped:", e.message); }
  const liveCount=matches.filter(m=>isLiveCode(m.status)).length;
  console.log(`Updated ${updated} match snapshot(s) in ${calls} calls; ${liveCount} currently live.`);
})();
