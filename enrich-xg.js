/* ============================================================
   enrich-xg.js — ENRICHMENT PASS (runs AFTER fetch-data.js).
   Reads the existing data.js (built by API-Football), then queries TheStatsAPI
   for the SAME fixtures and writes premium fields onto matches where it can
   confidently match them:
     - xgHomeReal / xgAwayReal      (match-level expected goals)
     - npxgHomeReal / npxgAwayReal  (non-penalty xG — better for modelling)
     - lineupConfirmed              (true once official XI is announced)
     - oddsOpen / oddsLast          (line movement: opening vs last-seen)
     - xgReal: true                 (flag so engines know to trust real xG)
   SAFETY: this is purely ADDITIVE. If it can't match a fixture, or the API has
   no data, it leaves the match exactly as API-Football built it. It NEVER
   removes matches or existing fields. If anything fails, the site runs as today.
   Auth: reads STATS_API_KEY from config.txt (kept in GitHub Secrets).
   ============================================================ */
const fs = require("fs");
const path = require("path");
const https = require("https");
const HERE = __dirname;

function readConfig() {
  const raw = fs.readFileSync(path.join(HERE, "config.txt"), "utf8");
  const cfg = { STATS_API_KEY: "" };
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toUpperCase();
    const val = line.slice(eq + 1).trim();
    if (key === "STATS_API_KEY") cfg.STATS_API_KEY = val.replace(/['"]/g, "").trim();
  }
  return cfg;
}

// TheStatsAPI GET with Bearer auth
function api(endpoint, key) {
  return new Promise((resolve, reject) => {
    const opts = {
      method: "GET", hostname: "api.thestatsapi.com",
      path: "/api" + endpoint,
      headers: { "Authorization": "Bearer " + key, "Accept": "application/json" }
    };
    const req = https.request(opts, res => {
      let body = ""; res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode === 401) { reject(new Error("UNAUTHORIZED — check STATS_API_KEY")); return; }
        if (res.statusCode === 429) { reject(new Error("RATE_LIMIT")); return; }
        if (res.statusCode >= 400) { reject(new Error("HTTP " + res.statusCode)); return; }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject); req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// normalise team names so "Man Utd" ~ "Manchester United" can match
function stripAccents(s){ return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function normName(s){
  return stripAccents(s).toLowerCase()
    .replace(/\b(fc|cf|sc|ac|afc|cd|sv|ss|us|if|bk|fk|cp|ca|sd|ud)\b/g," ")
    .replace(/\bmanchester\b/g,"man")
    .replace(/\bunited\b/g,"utd")
    .replace(/\b(women|ladies|fem|feminino|femenino)\b/g,"w")
    .replace(/[^a-z0-9 ]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function tokens(s){ return normName(s).split(" ").filter(t=>t.length>=2); }
// fuzzy: do two names refer to the same club?
function sameTeam(a,b){
  const x=normName(a).replace(/ /g,""), y=normName(b).replace(/ /g,"");
  if(!x||!y) return false;
  if(x===y) return true;
  if(x.length>=4 && y.length>=4 && (x.includes(y)||y.includes(x))) return true;
  // token overlap: if they share the main distinguishing word(s)
  const ta=tokens(a), tb=tokens(b);
  if(!ta.length||!tb.length) return false;
  const shared = ta.filter(t=>tb.includes(t));
  // require sharing the longest token (the club's core name) or 2+ tokens
  const longestA = ta.slice().sort((p,q)=>q.length-p.length)[0];
  if(shared.includes(longestA) && longestA.length>=4) return true;
  if(shared.length>=2) return true;
  return false;
}

function loadMatches(){
  const raw = fs.readFileSync(path.join(HERE,"data.js"),"utf8");
  const m = raw.match(/window\.MATCHES\s*=\s*([\s\S]*?);\s*$/m);
  if(!m) throw new Error("Could not parse window.MATCHES");
  const updated = (raw.match(/window\.DATA_UPDATED\s*=\s*"([^"]+)"/)||[])[1] || new Date().toISOString();
  return { matches: JSON.parse(m[1]), updated, raw };
}

(async function main(){
  const cfg = readConfig();
  if(!cfg.STATS_API_KEY){ console.log("No STATS_API_KEY set — skipping enrichment (site unaffected)."); process.exit(0); }

  let loaded;
  try { loaded = loadMatches(); }
  catch(e){ console.log("Could not read data.js — skipping enrichment:", e.message); process.exit(0); }
  const { matches, updated } = loaded;

  // only enrich UPCOMING + recently-finished games (today +/- a couple days)
  const dates = new Set();
  matches.forEach(m=>{ if(m.matchDate) dates.add(m.matchDate); });
  const dateList = [...dates].sort().slice(-6); // cap the window

  // build a lookup of TheStatsAPI matches by date -> [{home,away,id,xg_available}]
  const tsaByDate = {};
  const teamFormCache = {};      // rolling xG form per TSA team id (cached per run)
  const XG_LOOKBACK = 10;        // recent finished matches to average for form
  let calls = 0, enriched = 0, matchedGames = 0, multiBookMatches = 0;
  for(const date of dateList){
    try{
      // page through matches for the date
      let page=1, more=true;
      while(more && page<=5){
        const res = await api(`/football/matches?date_from=${date}&date_to=${date}&per_page=100&page=${page}`, cfg.STATS_API_KEY);
        calls++;
        const arr = (res && res.data) || [];
        tsaByDate[date] = (tsaByDate[date]||[]).concat(arr);
        const tp = res && res.meta && res.meta.total_pages || 1;
        more = page < tp; page++;
        await sleep(300);
      }
    }catch(e){
      console.log(`TSA match list failed for ${date}: ${e.message}`);
      if(/UNAUTHORIZED/.test(e.message)){ console.log("Auth failed — aborting enrichment, site unaffected."); process.exit(0); }
    }
  }

  // for each of OUR matches, find the TSA equivalent + pull its premium data
  for(const m of matches){
    const candidates = tsaByDate[m.matchDate] || [];
    const tsa = candidates.find(c =>
      c.home_team && c.away_team &&
      sameTeam(c.home_team.name, m.home) && sameTeam(c.away_team.name, m.away)
    );
    if(!tsa) continue;
    matchedGames++;

    // line movement from odds (cheap, 1 call) — opening vs last-seen
    try{
      if(tsa.odds_available){
        const o = await api(`/football/matches/${tsa.id}/odds`, cfg.STATS_API_KEY); calls++;
        const books=(o&&o.data&&o.data.bookmakers)||[];
        const price=x=>{
          if(x==null)return null;
          if(typeof x==="number"||typeof x==="string"){const n=Number(x);return Number.isFinite(n)?n:null;}
          const n=Number(x.last_seen??x.closing??x.current??x.price??x.opening);
          return Number.isFinite(n)?n:null;
        };
        const opening=x=>{const n=Number(x&&x.opening);return Number.isFinite(n)?n:null;};
        const fetchedAt=new Date().toISOString();
        const snapshots=[];
        for(const bm of books){
          const mo=bm&&bm.markets&&(bm.markets.match_odds||bm.markets["1x2"]||bm.markets.match_result);
          if(!mo)continue;
          const open={home:opening(mo.home),draw:opening(mo.draw),away:opening(mo.away)};
          const current={home:price(mo.home),draw:price(mo.draw),away:price(mo.away)};
          if(![open.home,open.draw,open.away,current.home,current.draw,current.away].every(Number.isFinite))continue;
          const vendorTs=bm.updated_at||bm.last_updated||bm.timestamp||(o.data&&o.data.updated_at)||null;
          snapshots.push({
            bookmaker:bm.bookmaker||bm.name||bm.slug||`Book ${snapshots.length+1}`,
            timestamp:vendorTs||fetchedAt,
            timestampSource:vendorTs?"vendor":"retrieved",
            opening:open,
            current
          });
        }
        if(snapshots.length){
          const pref=["Pinnacle","Betfair Exchange","Bet365","Kambi"];
          snapshots.sort((a,b)=>{
            const ai=pref.indexOf(a.bookmaker),bi=pref.indexOf(b.bookmaker);
            return (ai<0?99:ai)-(bi<0?99:bi);
          });
          m.oddsBooks=snapshots;
          const bm=snapshots[0];
          m.oddsOpen={...bm.opening};
          m.oddsLast={...bm.current};
          if(snapshots.length>=4)multiBookMatches++;
        }
        await sleep(250);
      }
    }catch(e){ /* leave odds as-is */ }

    // xG / np_xG (only meaningful for finished games; pre-match it's absent)
    try{
      if(tsa.xg_available){
        const s = await api(`/football/matches/${tsa.id}/stats`, cfg.STATS_API_KEY); calls++;
        const ov = s && s.data && s.data.overview;
        const xg = ov && ov.expected_goals && ov.expected_goals.all;
        const np = s && s.data && s.data.np_expected_goals && s.data.np_expected_goals.all;
        if(xg && (xg.home!=null || xg.away!=null)){
          m.xgHomeReal = xg.home; m.xgAwayReal = xg.away; m.xgReal = true;
        }
        if(np && (np.home!=null || np.away!=null)){
          m.npxgHomeReal = np.home; m.npxgAwayReal = np.away;
        }
        if(m.xgReal) enriched++;
        await sleep(250);
      }
    }catch(e){ /* leave xG absent */ }

    // ROLLING TEAM xG FORM (for UPCOMING matches). The per-match xG above is
    // null before kickoff, but the engines need each team's recent xG form to
    // sharpen pre-match. So when this match has no xG yet, pull each team's last
    // finished matches from TheStatsAPI and average their xG-for/against, then
    // stamp that as the team's expected-goals level. Cached per team per run.
    if(!m.xgReal){
      const teamXgForm = async (tsaTeamId, teamName)=>{
        if(tsaTeamId==null) return null;
        if(teamFormCache[tsaTeamId]!==undefined) return teamFormCache[tsaTeamId];
        let form=null;
        try{
          const r=await api(`/football/matches?team_id=${tsaTeamId}&status=finished&per_page=${XG_LOOKBACK}`, cfg.STATS_API_KEY); calls++;
          const list=(r&&r.data)||[]; const fors=[], againsts=[];
          for(const g of list.slice(0, XG_LOOKBACK)){
            const mid=g.match_id||g.id; if(!mid) continue;
            // xG may be on the row, else fetch stats
            let hx=(g.home&&g.home.xg), ax=(g.away&&g.away.xg);
            if(hx==null||ax==null){
              try{ const s=await api(`/football/matches/${mid}/stats`, cfg.STATS_API_KEY); calls++;
                const eg=s&&s.data&&s.data.overview&&s.data.overview.expected_goals&&s.data.overview.expected_goals.all;
                if(eg){ hx=eg.home; ax=eg.away; } await sleep(200);
              }catch(_){}
            }
            if(hx==null||ax==null) continue;
            const homeIsTeam = g.home && (g.home.id===tsaTeamId || g.home.team_id===tsaTeamId);
            fors.push(homeIsTeam?+hx:+ax); againsts.push(homeIsTeam?+ax:+hx);
          }
          if(fors.length){
            const avg=a=>Math.round((a.reduce((s,x)=>s+x,0)/a.length)*100)/100;
            form={ xgFor:avg(fors), xgAgainst:avg(againsts), samples:fors.length };
          }
          await sleep(200);
        }catch(e){ /* leave form null */ }
        teamFormCache[tsaTeamId]=form;
        return form;
      };
      try{
        const hForm = await teamXgForm(tsa.home_team&&tsa.home_team.id, m.home);
        const aForm = await teamXgForm(tsa.away_team&&tsa.away_team.id, m.away);
        if(hForm){ m.xgHomeReal=hForm.xgFor; m.homeXgAgainst=hForm.xgAgainst; m.xgReal=true; }
        if(aForm){ m.xgAwayReal=aForm.xgFor; m.awayXgAgainst=aForm.xgAgainst; m.xgReal=true; }
        if(m.xgReal) enriched++;
      }catch(e){ /* form optional */ }
    }

    // confirmed lineups (announced ~1h pre-kickoff; 404 before that)
    try{
      const lu = await api(`/football/matches/${tsa.id}/lineups`, cfg.STATS_API_KEY); calls++;
      if(lu && lu.data && lu.data.confirmed){ m.lineupConfirmed = true; }
      await sleep(250);
    }catch(e){ /* no lineup yet — fine */ }
  }

  // write back: preserve DATA_UPDATED, add ENRICHED_AT marker
  const out =
    `window.DATA_UPDATED = ${JSON.stringify(updated)};\n` +
    `window.ENRICHED_AT = "${new Date().toISOString()}";\n` +
    `window.MATCHES = ${JSON.stringify(matches, null, 2)};\n`;
  fs.writeFileSync(path.join(HERE,"data.js"), out, "utf8");
  console.log(`Enrichment done: ${matchedGames} games matched, ${enriched} got real xG, ${multiBookMatches} got 4+ timestamped books, in ${calls} calls.`);
})();
