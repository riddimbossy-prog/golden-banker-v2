/* ============================================================
   track-log.js — FORWARD TRACKING LOG (the engine's report card).

   The single most important file for proving whether the engines actually
   work. It records every engine's banker pick AT PICK-TIME (before kickoff),
   then settles each once the match finishes — building an append-only,
   per-engine win/loss history in track-log.json.

   Why per-engine: the daily results image collapses all 16 engines into one
   "consensus" number. That hides which engine is carrying the others. This log
   keeps each engine's own record so you can see, after a few weeks, that (say)
   Strict hits 71% while Apex hits 52% — and retire or trust accordingly.

   Honesty-first: records BEFORE kickoff so there's no hindsight bias. A pick is
   logged as "pending", and only its later settlement turns it Won/Lost. Picks
   are keyed so the same fixture+engine+market is never double-counted.

   USAGE:
     node track-log.js record    # log today's & upcoming bankers as pending
     node track-log.js settle    # settle any pending picks whose match finished
     node track-log.js report    # print a per-engine accuracy summary
     node track-log.js           # runs settle then record then report (daily)

   Run it daily (e.g. from the same workflow that updates scores). Safe to run
   repeatedly — it's idempotent.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const eng = require("./banker-engine.js");
const { marketOdds, fairProbability, buildCalibrationLedger, saveLedger, attachToDataFile } = require("./model-calibration");
const HERE = __dirname;
const LOG = path.join(HERE, "track-log.json");

function loadMatches(){
  const raw = fs.readFileSync(path.join(HERE, "data.js"), "utf8");
  const m = raw.match(/window\.MATCHES\s*=\s*([\s\S]*?);\s*$/m);
  if(!m) throw new Error("no MATCHES in data.js");
  return JSON.parse(m[1]);
}
function loadLog(){
  try { return JSON.parse(fs.readFileSync(LOG, "utf8")); }
  catch(e){ return { picks: [], meta: { created: new Date().toISOString() } }; }
}
function saveLog(log){
  log.meta = log.meta || {};
  log.meta.updated = new Date().toISOString();
  fs.writeFileSync(LOG, JSON.stringify(log, null, 2), "utf8");
}

// stable key so a fixture+engine+market is logged once only
function keyOf(p){ return `${p.matchDate}|${p.home}|${p.away}|${p.engine}|${p.market}`; }


function engineEntries(){
  const reg = Array.isArray(eng.P2U_ENGINE_REGISTRY) && eng.P2U_ENGINE_REGISTRY.length
    ? eng.P2U_ENGINE_REGISTRY
    : [
        {name:"Normal",fn:"recommend"},{name:"Strict",fn:"strictRecommend"},
        {name:"Ultra",fn:"ultraRecommend"},{name:"Elite",fn:"eliteRecommend"},
        {name:"Apex",fn:"apexRecommend"},{name:"Prime",fn:"primeRecommend"},
        {name:"Expert",fn:"expertRecommend"},{name:"Pro",fn:"proRecommend"},
        {name:"Trend",fn:"trendRecommend"},{name:"Streaks",fn:"streakRecommend"},
        {name:"Mismatch",fn:"mismatchRecommend"},{name:"Halves",fn:"halvesRecommend"},
        {name:"League Bias",fn:"leagueBiasRecommend"},{name:"Momentum",fn:"momentumRecommend"},
        {name:"Odds Intelligence",fn:"oddsIntelligenceRecommend"},{name:"Value",fn:"valueRecommend"}
      ];
  return reg
    .map(e=>({ name:e.name, key:e.key||null, family:e.family||null, version:e.version||null, fn:eng[e.fn] }))
    .filter(e=>typeof e.fn==="function");
}

// every registered engine's banker pick for one match
function bankersFor(m){
  const out=[];
  for(const e of engineEntries()){
    try{
      const r=e.fn(m);
      if(r&&r.banker&&r.primary&&r.primary!=="No Bet"){
        out.push({
          engine:e.name,
          engineKey:e.key,
          engineFamily:e.family,
          engineVersion:e.version,
          market:r.primary,
          confidence:r.confidence
        });
      }
    }catch(_){}
  }
  return out;
}

// ---- RECORD: log today's & upcoming bankers as pending ----
function record(log, matches){
  const have = new Set(log.picks.map(keyOf));
  let added=0;
  for(const m of matches){
    if(!m.matchDate) continue;
    // only log picks that are still upcoming/unsettled at record-time (no hindsight)
    const settledAlready = m.homeGoals!=null && m.awayGoals!=null;
    if(settledAlready) continue;
    for(const b of bankersFor(m)){
      let lcType=null;
      try { lcType = (m.leagueClass && m.leagueClass.type) || (eng.classifyLeague ? eng.classifyLeague(m).type : null); } catch(e){}
      const p = {
        matchDate: m.matchDate, home: m.home, away: m.away, league: m.league||null,
        engine:b.engine,engineKey:b.engineKey||null,engineFamily:b.engineFamily||null,
        engineVersion:b.engineVersion||null,market:b.market,confidence:b.confidence,
        suiteVersion:eng.ENGINE_SUITE_VERSION||null,leagueClass:lcType,
        oddsAtPick:marketOdds(m,b.market),
        fairMarketProbabilityAtPick:fairProbability(m,b.market),
        recordedAt:new Date().toISOString(),
        status:"pending",result:null,score:null
      };
      const k = keyOf(p);
      if(!have.has(k)){ log.picks.push(p); have.add(k); added++; }
    }
  }
  console.log(`record: +${added} new pending pick(s) (log now ${log.picks.length}).`);
  return added;
}

// ---- SETTLE: fill in results for pending picks whose match has finished ----
function settle(log, matches){
  // index finished matches by fixture for quick lookup
  const fin = {};
  for(const m of matches){
    if(m.homeGoals!=null && m.awayGoals!=null){
      fin[`${m.matchDate}|${m.home}|${m.away}`] = m;
    }
  }
  let settled=0;
  for(const p of log.picks){
    if(p.status!=="pending") continue;
    const m = fin[`${p.matchDate}|${p.home}|${p.away}`];
    if(!m) continue;
    const res=eng.settle(p.market,m.homeGoals,m.awayGoals,m.status,m);
    if(!res || res==="Void") { p.status="void"; p.result="Void"; continue; }
    p.status="settled"; p.result=res; p.score=`${m.homeGoals}-${m.awayGoals}`;
    p.settledAt=new Date().toISOString();
    settled++;
  }
  console.log(`settle: ${settled} pick(s) settled.`);
  return settled;
}

// ---- REPORT: per-engine accuracy summary ----
function report(log, toFile){
  const out=[];
  const log_=(s="")=>{ out.push(s); console.log(s); };
  const byEngine={}, byMarket={}, byLeague={}, byLeagueClass={}, byEngMarket={}, byEngLeague={};
  let totalWon=0, totalLost=0, pending=0;
  const bump=(bucket,key,won)=>{ if(key==null) return; (bucket[key]=bucket[key]||{won:0,lost:0})[won?"won":"lost"]++; };
  for(const p of log.picks){
    if(p.status==="pending"){ pending++; continue; }
    if(p.status!=="settled") continue;
    const won = p.result==="Won";
    bump(byEngine, p.engine, won);
    bump(byMarket, p.market, won);
    bump(byLeague, p.league, won);
    bump(byLeagueClass, p.leagueClass, won);
    bump(byEngMarket, `${p.engine} · ${p.market}`, won);
    bump(byEngLeague, `${p.engine} · ${p.league}`, won);
    if(won) totalWon++; else totalLost++;
  }
  const pct=(w,l)=> (w+l)>0 ? Math.round(w/(w+l)*100) : 0;
  const N=s=>s.won+s.lost;
  const line=(name,s,pad=22)=> `  ${String(name).padEnd(pad)} ${String(N(s)).padStart(4)} · ${String(s.won).padStart(3)}W ${String(s.lost).padStart(3)}L · ${String(pct(s.won,s.lost)).padStart(3)}%`;
  const ranked=(bucket,minN=0)=> Object.entries(bucket)
    .filter(([,s])=>N(s)>=minN)
    .sort((a,b)=> pct(b[1].won,b[1].lost)-pct(a[1].won,a[1].lost) || N(b[1])-N(a[1]));
  const dump=(title,bucket,pad,minN=0)=>{
    const rows=ranked(bucket,minN);
    if(!rows.length) return;
    log_(`\n${title}:`);
    rows.forEach(([k,s])=>log_(line(k,s,pad)));
  };

  const settledTotal=totalWon+totalLost;
  const dstr=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  log_("=== PREDICT2U FORWARD TRACKER ===");
  log_(dstr);
  log_(`Overall: ${totalWon}W ${totalLost}L · ${pct(totalWon,totalLost)}% strike · ${pending} pending\n`);

  dump("By engine", byEngine, 10);
  dump("By market", byMarket, 26);
  dump("By league / competition", byLeague, 26);
  dump("By league context", byLeagueClass, 18);

  const MINc = 10;
  const em = ranked(byEngMarket, MINc), el = ranked(byEngLeague, MINc);
  if(em.length){
    log_(`\n★ Best engine × market (min ${MINc} picks):`);
    em.slice(0,8).forEach(([k,s])=>log_(line(k,s,30)));
    if(em.length>1){
      log_(`\n✗ Weakest engine × market (min ${MINc} picks):`);
      em.slice(-3).reverse().forEach(([k,s])=>log_(line(k,s,30)));
    }
  }
  if(el.length){
    log_(`\n★ Best engine × league (min ${MINc} picks):`);
    el.slice(0,8).forEach(([k,s])=>log_(line(k,s,30)));
  }
  if(!em.length && !el.length){
    log_(`\n(No engine×market or engine×league combo has ${MINc}+ settled picks yet — leaderboards unlock as the log grows.)`);
  }

  log_(settledTotal<30
    ? `\n⚠ Only ${settledTotal} settled picks — too few to trust. Keep logging; aim for 100+ per engine before judging.`
    : `\n${settledTotal} settled picks logged. Trust the trend, not any single day. Combos need ${MINc}+ picks to appear in the leaderboards.`);

  if(toFile){
    try { fs.writeFileSync(path.join(HERE,"track-report.txt"), out.join("\n"), "utf8"); }
    catch(e){ /* file write optional */ }
  }
  return out.join("\n");
}

function refreshCalibration(log){
  try{
    const ledger=buildCalibrationLedger(log);
    saveLedger(ledger);
    const validated=Object.values(ledger.groups||{}).filter(g=>g.validated).length;
    console.log(`calibration: ${validated} validated group(s) written.`);
    try{
      const r=attachToDataFile(path.join(HERE,"data.js"),{log,ledger,writeLedger:false});
      console.log(`calibration: attached ${r.attached} interval(s) across ${r.matches} match(es).`);
    }catch(e){ console.log("calibration attach skipped:",e.message); }
  }catch(e){ console.log("calibration refresh skipped:",e.message); }
}

(function main(){
  const mode = (process.argv[2]||"all").toLowerCase();
  let matches;
  try { matches = loadMatches(); }
  catch(e){ console.log("track-log: no data.js —", e.message); process.exit(0); }
  const log = loadLog();

  if(mode==="record"){ record(log,matches); saveLog(log); refreshCalibration(log); }
  else if(mode==="settle"){ settle(log,matches); saveLog(log); refreshCalibration(log); }
  else if(mode==="report"){ report(log, true); }
  else { // daily default: settle finished, record new, then report
    settle(log, matches);
    record(log, matches);
    saveLog(log);
    refreshCalibration(log);
    report(log,true);
  }
})();
