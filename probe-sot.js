#!/usr/bin/env node
/* ============================================================================
 * probe-sot.js — STANDALONE probe: does API-Football have Shots-on-Target data
 *                for YOUR leagues, and what would it cost to collect?
 * ----------------------------------------------------------------------------
 * The SOT Integration Module spec needs shots-on-target per match (home/away
 * splits, 1H/2H, conceded, last-5, season avg). API-Football's /teams/statistics
 * endpoint (which the pipeline already uses) does NOT carry shots data. SOT only
 * lives in the PER-FIXTURE endpoint: /fixtures/statistics?fixture=ID.
 *
 * So building the SOT module means one extra API call PER finished fixture, then
 * aggregating. Before committing to that cost, this probe answers:
 *   1. Does /fixtures/statistics actually return "Shots on Goal" for your leagues?
 *   2. What % of finished fixtures have it (coverage varies a lot by league)?
 *   3. Roughly how many API calls per league per season would collection cost?
 *
 * Writes NOTHING. Reads key from THESTATSAPI is NOT used here — this is
 * API-Football. Reads API_KEY from config.txt (same as fetch-data.js) or the
 * API_FOOTBALL_KEY / API_KEY env var. NEVER paste your key into chat.
 *
 * USAGE:
 *   node probe-sot.js                          (samples leagues from data.js)
 *   node probe-sot.js --leagues 39,140,71      (specific API-Football league IDs)
 *   node probe-sot.js --sample 8               (fixtures to test per league; default 6)
 * ==========================================================================*/

const fs = require("fs");
const path = require("path");
const https = require("https");

const HERE = __dirname;

function loadKey() {
  for (const v of ["API_FOOTBALL_KEY", "API_KEY", "APIFOOTBALL_KEY"])
    if (process.env[v] && process.env[v].trim()) return process.env[v].trim();
  try {
    const raw = fs.readFileSync(path.join(HERE, "config.txt"), "utf8");
    const m = raw.match(/(?:API_KEY|API_FOOTBALL_KEY|TOKEN)\s*=\s*(\S+)/i);
    if (m) return m[1].trim();
  } catch (e) {}
  return null;
}

function apiGet(endpoint, key) {
  return new Promise((resolve, reject) => {
    const opts = { method: "GET", hostname: "v3.football.api-sports.io", path: endpoint, headers: { "x-apisports-key": key } };
    const req = https.request(opts, res => {
      let body = "";
      res.on("data", d => (body += d));
      res.on("end", () => {
        if (res.statusCode === 429) { reject(new Error("RATE_LIMIT")); return; }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error("Bad JSON from " + endpoint)); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Pull SOT for one fixture. API-Football labels it "Shots on Goal" in the
// statistics array; read defensively in case of "Shots on Target".
function readSOT(statsResponse) {
  const arr = statsResponse && statsResponse.response;
  if (!Array.isArray(arr) || arr.length < 2) return null; // need both teams
  const out = {};
  for (const teamBlock of arr) {
    const side = teamBlock.team && teamBlock.team.id;
    const stats = teamBlock.statistics || [];
    const sot = stats.find(s => /shots on goal|shots on target/i.test(String(s.type||"")));
    if (sot && sot.value != null) out[side] = Number(sot.value);
  }
  return Object.keys(out).length === 2 ? out : null;
}

(async function main() {
  const args = process.argv.slice(2);
  const sampleN = (() => { const i = args.indexOf("--sample"); return i>=0 ? Math.max(2, parseInt(args[i+1])||6) : 6; })();
  const leaguesArg = (() => { const i = args.indexOf("--leagues"); return i>=0 ? (args[i+1]||"").split(",").map(s=>parseInt(s.trim(),10)).filter(Boolean) : null; })();

  const key = loadKey();
  if (!key) { console.error("No API key. Set API_FOOTBALL_KEY env or API_KEY in config.txt. Do NOT paste your key into chat."); process.exit(1); }

  console.log("\nAPI-Football Shots-on-Target coverage probe  (writes nothing)\n");

  // connectivity check
  const ping = await apiGet("/status", key);
  if (ping && ping.errors && Object.keys(ping.errors).length) { console.error("API error:", JSON.stringify(ping.errors)); process.exit(1); }
  const acct = ping && ping.response && ping.response.requests;
  if (acct) console.log(`Auth OK. Requests today: ${acct.current}/${acct.limit_day}.\n`);

  // resolve target leagues + a season
  let targets = leaguesArg;
  let season = new Date().getFullYear();
  if (!targets) {
    try {
      const raw = fs.readFileSync(path.join(HERE, "data.js"), "utf8");
      const M = JSON.parse(raw.match(/window\.MATCHES\s*=\s*(\[[\s\S]*?\]);?\s*$/)[1]);
      const ids = [...new Set(M.map(m => m.leagueId).filter(Boolean))];
      targets = ids.slice(0, 8); // probe first 8 leagues
      const seasons = M.map(m => m.season).filter(Boolean);
      if (seasons.length) season = seasons.sort((a,b)=>b-a)[0];
    } catch (e) {}
  }
  if (!targets || !targets.length) { console.error("No leagues. Pass --leagues 39,140 or run where data.js exists."); process.exit(1); }
  console.log(`Testing ${targets.length} league(s), season ${season}, ${sampleN} fixtures each.\n`);

  let totalCalls = 0;
  const report = [];
  for (const leagueId of targets) {
    // get a page of finished fixtures for this league/season
    let fixtures = [];
    try {
      const r = await apiGet(`/fixtures?league=${leagueId}&season=${season}&status=FT-AET-PEN`, key);
      totalCalls++;
      fixtures = (r && r.response) ? r.response.slice(0, sampleN) : [];
    } catch (e) { report.push({ leagueId, tested:0, withSOT:0, note:e.message }); continue; }

    if (!fixtures.length) { report.push({ leagueId, tested:0, withSOT:0, note:"no finished fixtures" }); await sleep(300); continue; }

    let withSOT = 0; const examples = [];
    for (const fx of fixtures) {
      const id = fx.fixture && fx.fixture.id;
      if (!id) continue;
      try {
        const sr = await apiGet(`/fixtures/statistics?fixture=${id}`, key);
        totalCalls++;
        const sot = readSOT(sr);
        if (sot) { withSOT++; if (examples.length < 2) { const vals = Object.values(sot); examples.push(`${fx.teams.home.name} ${vals[0]}-${vals[1]} ${fx.teams.away.name}`); } }
      } catch (e) { /* count as no-SOT */ }
      await sleep(300); // polite pacing
    }
    const leagueName = (fixtures[0].league && fixtures[0].league.name) || `League ${leagueId}`;
    const pct = fixtures.length ? Math.round((withSOT/fixtures.length)*100) : 0;
    report.push({ leagueId, leagueName, tested: fixtures.length, withSOT, pct, examples });
    console.log(`  ${leagueName} (${leagueId}): ${withSOT}/${fixtures.length} had SOT (${pct}%)${examples.length?"  e.g. "+examples[0]:""}`);
    await sleep(300);
  }

  // ---- verdict ----
  console.log("\n================= SOT COVERAGE VERDICT =================");
  const good = report.filter(r => r.tested>0 && r.pct>=80);
  const partial = report.filter(r => r.tested>0 && r.pct>0 && r.pct<80);
  const none = report.filter(r => r.tested>0 && r.pct===0);
  const empty = report.filter(r => r.tested===0);
  console.log(`Full SOT coverage (>=80%): ${good.length} league(s)` + (good.length?" -> "+good.map(r=>r.leagueName).join(", "):""));
  if (partial.length) console.log(`Partial coverage: ${partial.length} -> ${partial.map(r=>r.leagueName+" ("+r.pct+"%)").join(", ")}`);
  if (none.length) console.log(`NO SOT returned: ${none.length} -> ${none.map(r=>r.leagueName||r.leagueId).join(", ")}`);
  if (empty.length) console.log(`No fixtures to test: ${empty.length} -> ${empty.map(r=>r.leagueId).join(", ")}`);

  // cost estimate
  const avgFixturesPerSeason = 300; // rough for a full league season
  console.log(`\nCOST: SOT needs 1 /fixtures/statistics call PER finished fixture.`);
  console.log(`This probe used ${totalCalls} calls for a ${sampleN}-fixture sample per league.`);
  console.log(`Collecting a full season for ONE league ~= ${avgFixturesPerSeason} calls. For all your leagues, that multiplies fast — weigh against your daily API quota.`);
  console.log("\nIf coverage is good on YOUR leagues, the SOT module is buildable (with a collection step + cost). If it's mostly 0%, the module would stay dormant like an un-fed engine — not worth building.");
  console.log("=======================================================\n");
})().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
