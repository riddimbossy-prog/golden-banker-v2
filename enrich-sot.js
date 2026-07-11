#!/usr/bin/env node
/* ============================================================================
 * Predict2U enrich-sot.js
 *
 * Optional API-Football SOT collector. One /fixtures/statistics call is needed
 * per historical fixture, so a hard call budget is enforced.
 *
 * Config:
 *   SOT_LOOKBACK=8
 *   SOT_CALL_BUDGET=120
 *   SOT_SLEEP_MS=250
 * ========================================================================== */
"use strict";
const fs=require("fs"),path=require("path"),https=require("https");
const HERE=__dirname,LEDGER=path.join(HERE,"sot-history.json");

function config(){
  const raw=fs.readFileSync(path.join(HERE,"config.txt"),"utf8");
  const out={API_KEY:"",SEASON:"",SOT_LOOKBACK:8,SOT_CALL_BUDGET:120,SOT_SLEEP_MS:250};
  for(const line0 of raw.split(/\r?\n/)){
    const line=line0.trim(); if(!line||line.startsWith("#")||!line.includes("="))continue;
    const i=line.indexOf("="),k=line.slice(0,i).trim().toUpperCase(),v=line.slice(i+1).trim().replace(/['"]/g,"");
    if(k in out)out[k]=k==="API_KEY"||k==="SEASON"?v:Number(v)||out[k];
  }
  return out;
}
function apiGet(ep,key){
  return new Promise((resolve,reject)=>{
    const req=https.request({method:"GET",hostname:"v3.football.api-sports.io",path:ep,headers:{"x-apisports-key":key}},res=>{
      let b="";res.on("data",d=>b+=d);res.on("end",()=>{if(res.statusCode===429)return reject(new Error("RATE_LIMIT"));try{resolve(JSON.parse(b));}catch(_){reject(new Error("Bad JSON"));}});
    });req.on("error",reject);req.end();
  });
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function loadData(){
  const raw=fs.readFileSync(path.join(HERE,"data.js"),"utf8");
  const m=raw.match(/window\.MATCHES\s*=\s*([\s\S]*?);\s*$/m);
  if(!m)throw new Error("Could not parse data.js");
  return {raw,matches:JSON.parse(m[1])};
}
function loadLedger(){try{return JSON.parse(fs.readFileSync(LEDGER,"utf8"));}catch(_){return{updated:null,fixtures:{},teams:{}};}}
function statValue(block){
  const stats=block&&block.statistics||[];
  const row=stats.find(x=>/shots on (goal|target)/i.test(String(x.type||"")));
  const n=Number(row&&row.value); return Number.isFinite(n)?n:null;
}
function readSOT(r){
  const arr=r&&r.response;
  if(!Array.isArray(arr)||arr.length<2)return null;
  const a=arr[0],b=arr[1],av=statValue(a),bv=statValue(b);
  if(av==null||bv==null)return null;
  return {aTeamId:a.team&&a.team.id,a:av,bTeamId:b.team&&b.team.id,b:bv};
}
function teamKey(id,league){return `${id}|${league}`;}
function pushTeam(ledger,id,league,row){
  if(id==null)return;
  const k=teamKey(id,league),t=ledger.teams[k]||(ledger.teams[k]={teamId:id,leagueId:league,rows:[]});
  if(t.rows.some(x=>x.fixtureId===row.fixtureId))return;
  t.rows.push(row);t.rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)));t.rows=t.rows.slice(0,24);
}
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;}
function profile(ledger,id,league,venue){
  const t=ledger.teams[teamKey(id,league)];if(!t)return null;
  const split=t.rows.filter(r=>r.venue===venue),use=split.length>=4?split:t.rows;
  if(use.length<3)return null;
  const f=use.map(r=>r.sotFor).filter(Number.isFinite),a=use.map(r=>r.sotAgainst).filter(Number.isFinite);
  const r5=use.slice(0,5);
  return {
    sotFor:f.length?Math.round(mean(f)*100)/100:null,
    sotAgainst:a.length?Math.round(mean(a)*100)/100:null,
    recent5SOT:r5.length>=3?Math.round(mean(r5.map(r=>r.sotFor))*100)/100:null,
    recent5SOTAgainst:r5.length>=3?Math.round(mean(r5.map(r=>r.sotAgainst))*100)/100:null,
    sample:use.length,usedSplit:split.length>=4?venue:"all(fallback)"
  };
}
(async()=>{
  const cfg=config();if(!cfg.API_KEY)throw new Error("API_KEY missing");
  const {raw,matches}=loadData(),ledger=loadLedger();
  let calls=0,collected=0;
  const upcoming=matches.filter(m=>m.homeGoals==null&&m.awayGoals==null&&m.homeTeamId&&m.awayTeamId&&m.leagueId);
  const jobs=new Map();
  for(const m of upcoming){
    const season=m.season||cfg.SEASON;
    for(const [id,venue] of [[m.homeTeamId,"H"],[m.awayTeamId,"A"]]){
      const k=`${id}|${m.leagueId}|${season}`;
      if(!jobs.has(k))jobs.set(k,{id,leagueId:m.leagueId,season,cutoff:m.kickoff,venue});
    }
  }
  for(const j of jobs.values()){
    if(calls>=cfg.SOT_CALL_BUDGET)break;
    let list;
    try{
      const r=await apiGet(`/fixtures?team=${j.id}&league=${j.leagueId}&season=${j.season}&status=FT-AET-PEN`,cfg.API_KEY);calls++;
      list=(r.response||[]).filter(x=>x.fixture&&x.goals&&x.goals.home!=null&&x.goals.away!=null)
        .filter(x=>!j.cutoff||Date.parse(x.fixture.date)<Date.parse(j.cutoff))
        .sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date))
        .slice(0,cfg.SOT_LOOKBACK);
      await sleep(cfg.SOT_SLEEP_MS);
    }catch(e){if(e.message==="RATE_LIMIT")break;continue;}
    for(const f of list){
      if(calls>=cfg.SOT_CALL_BUDGET)break;
      const fid=f.fixture.id;
      let rec=ledger.fixtures[fid];
      if(!rec){
        try{
          const r=await apiGet(`/fixtures/statistics?fixture=${fid}`,cfg.API_KEY);calls++;
          const got=readSOT(r);await sleep(cfg.SOT_SLEEP_MS);
          if(!got)continue;
          const homeId=f.teams.home.id,awayId=f.teams.away.id;
          const homeSOT=got.aTeamId===homeId?got.a:got.bTeamId===homeId?got.b:null;
          const awaySOT=got.aTeamId===awayId?got.a:got.bTeamId===awayId?got.b:null;
          if(homeSOT==null||awaySOT==null)continue;
          rec=ledger.fixtures[fid]={fixtureId:fid,date:f.fixture.date,leagueId:j.leagueId,homeId,awayId,homeSOT,awaySOT};
          collected++;
        }catch(e){if(e.message==="RATE_LIMIT")break;continue;}
      }
      pushTeam(ledger,rec.homeId,rec.leagueId,{fixtureId:fid,date:rec.date,venue:"H",sotFor:rec.homeSOT,sotAgainst:rec.awaySOT});
      pushTeam(ledger,rec.awayId,rec.leagueId,{fixtureId:fid,date:rec.date,venue:"A",sotFor:rec.awaySOT,sotAgainst:rec.homeSOT});
    }
  }
  let attached=0;
  for(const m of matches){
    const rec=m.id&&ledger.fixtures[m.id];
    if(rec){m.homeSOTActual=rec.homeSOT;m.awaySOTActual=rec.awaySOT;}
    if(!m.homeTeamId||!m.awayTeamId||!m.leagueId)continue;
    const h=profile(ledger,m.homeTeamId,m.leagueId,"H"),a=profile(ledger,m.awayTeamId,m.leagueId,"A");
    if(h){
      m.homeSOTFor=h.sotFor;m.homeSOTAgainst=h.sotAgainst;m.homeRecent5SOT=h.recent5SOT;m.homeRecent5SOTAgainst=h.recent5SOTAgainst;
      m.homeProfile=m.homeProfile||{};m.homeProfile.sotFor={v:h.sotFor,n:h.sample};m.homeProfile.sotAg={v:h.sotAgainst,n:h.sample};attached++;
    }
    if(a){
      m.awaySOTFor=a.sotFor;m.awaySOTAgainst=a.sotAgainst;m.awayRecent5SOT=a.recent5SOT;m.awayRecent5SOTAgainst=a.recent5SOTAgainst;
      m.awayProfile=m.awayProfile||{};m.awayProfile.sotFor={v:a.sotFor,n:a.sample};m.awayProfile.sotAg={v:a.sotAgainst,n:a.sample};attached++;
    }
  }
  ledger.updated=new Date().toISOString();fs.writeFileSync(LEDGER,JSON.stringify(ledger,null,2),"utf8");
  const out=raw.replace(/window\.MATCHES\s*=\s*[\s\S]*?;\s*$/m,`window.SOT_ENRICHED_AT = "${new Date().toISOString()}";\nwindow.MATCHES = ${JSON.stringify(matches,null,2)};\n`);
  fs.writeFileSync(path.join(HERE,"data.js"),out,"utf8");
  console.log(`SOT enrichment: ${collected} new fixture(s), ${attached} team-side profile attachment(s), ${calls}/${cfg.SOT_CALL_BUDGET} API calls.`);
})().catch(e=>{console.error("enrich-sot:",e.message);process.exitCode=1;});
