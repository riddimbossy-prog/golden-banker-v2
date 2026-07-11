/* ============================================================================
 * Predict2U model-calibration.js
 *
 * Builds honest forward calibration from track-log.json. It never converts raw
 * bookmaker hit-rates into model probabilities. Only pre-kickoff engine picks
 * that later settled Won/Lost are used.
 *
 * A calibration interval is attached only after 300 comparable selections.
 * ========================================================================== */
"use strict";
const fs=require("fs");
const path=require("path");
const HERE=__dirname;
const LOG_FILE="track-log.json";
const LEDGER_FILE="model-calibration.json";
const MIN_SAMPLE=300;

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const round=(v,p=4)=>{if(v==null)return null;const k=10**p;return Math.round(v*k)/k;};

function confidenceNumber(c){
  if(typeof c==="number") return c<=10?c*10:c;
  if(c==="High")return 85;
  if(c==="Medium")return 72;
  if(c==="Low")return 55;
  return null;
}
function scoreBand(c){
  const n=confidenceNumber(c);
  if(n==null)return "unknown";
  const lo=Math.floor(n/10)*10;
  return `${lo}-${lo+9}`;
}
function safeKey(v){return String(v==null?"*":v).replace(/\|/g,"/");}
function groupKey(scope,league,engine,market,band){
  return [scope,safeKey(league),safeKey(engine),safeKey(market),safeKey(band)].join("|");
}
function wilson(w,n,z=1.96){
  if(!n)return {lower:null,mid:null,upper:null};
  const p=w/n, z2=z*z, den=1+z2/n;
  const centre=(p+z2/(2*n))/den;
  const margin=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/den;
  return {lower:clamp(centre-margin,0,1),mid:p,upper:clamp(centre+margin,0,1)};
}
function bump(map,key,won){
  const g=map[key]||(map[key]={n:0,w:0,l:0});
  g.n++; if(won)g.w++; else g.l++;
}
function loadLog(logPath=path.join(HERE,LOG_FILE)){
  try{return JSON.parse(fs.readFileSync(logPath,"utf8"));}
  catch(_){return {picks:[]};}
}
function buildCalibrationLedger(log){
  const groups={};
  for(const p of (log&&log.picks)||[]){
    if(p.result!=="Won"&&p.result!=="Lost")continue;
    if(!p.market||!p.engine)continue;
    const won=p.result==="Won";
    const engine=p.engineKey||p.engine;
    const band=scoreBand(p.confidence);
    const league=p.league||"*";
    bump(groups,groupKey("LEM",league,engine,p.market,band),won);
    bump(groups,groupKey("EM","*",engine,p.market,band),won);
    bump(groups,groupKey("LM",league,"*",p.market,band),won);
    bump(groups,groupKey("M","*","*",p.market,band),won);
  }
  const out={updated:new Date().toISOString(),minSample:MIN_SAMPLE,groups:{}};
  for(const [k,g] of Object.entries(groups)){
    const ci=wilson(g.w,g.n);
    const parts=k.split("|");
    const leagueSpecific=parts[1]!=="*";
    const width=ci.upper-ci.lower;
    const reliability=clamp(
      58 + (leagueSpecific?8:0) + Math.min(22,Math.log10(Math.max(g.n,1)/MIN_SAMPLE+1)*18) - width*30,
      0,95
    );
    out.groups[k]={
      sample:g.n,wins:g.w,losses:g.l,
      lower:round(ci.lower),mid:round(ci.mid),upper:round(ci.upper),
      grade:g.n>=1500?"Mature":g.n>=750?"Validated":g.n>=MIN_SAMPLE?"Provisional":"Learning",
      leagueReliability:round(reliability,1),
      validated:g.n>=MIN_SAMPLE
    };
  }
  return out;
}
function saveLedger(ledger,file=path.join(HERE,LEDGER_FILE)){
  fs.writeFileSync(file,JSON.stringify(ledger,null,2),"utf8");
}
function marketOdds(m,market){
  const o=m&&m.odds||{};
  const map={
    "Home Win":"home","Away Win":"away","Draw":"draw",
    "Over 1.5 Goals":"over15","Over 2.5 Goals":"over25","Over 3.5 Goals":"over35",
    "Under 1.5 Goals":"under15","Under 2.5 Goals":"under25","Under 3.5 Goals":"under35",
    "BTTS Yes":"bttsYes","BTTS No":"bttsNo",
    "Double Chance 1X":"dc1x","Double Chance 12":"dc12","Double Chance X2":"dcx2",
    "First Half Over 0.5":"fhOver05","First Half Under 1.5":"fhUnder15"
  };
  const k=map[String(market||"").replace(/ Goals$/,"") ]||map[market];
  return k&&num(o[k])>1?num(o[k]):null;
}
function fairProbability(m,market){
  const o=m&&m.odds||{};
  if(market==="Home Win"||market==="Away Win"||market==="Draw"){
    const h=num(o.home),d=num(o.draw),a=num(o.away);
    if(h&&d&&a){const H=1/h,D=1/d,A=1/a,s=H+D+A;return market==="Home Win"?H/s:market==="Away Win"?A/s:D/s;}
  }
  const price=marketOdds(m,market);
  return price?1/price:null;
}
function chooseGroup(ledger,league,engine,market,band){
  const keys=[
    groupKey("LEM",league,engine,market,band),
    groupKey("EM","*",engine,market,band),
    groupKey("LM",league,"*",market,band),
    groupKey("M","*","*",market,band)
  ];
  for(const k of keys){
    const g=ledger.groups[k];
    if(g&&g.validated&&g.sample>=MIN_SAMPLE)return {...g,key:k};
  }
  return null;
}
function engineCandidates(m){
  let eng;
  try{eng=require("./banker-engine.js");}catch(_){return [];}
  const blocked=new Set(["prime","expert","value","oddsintel"]);
  const rows=[];
  for(const e of eng.P2U_ENGINE_REGISTRY||[]){
    if(blocked.has(e.key))continue;
    const fn=eng[e.fn];
    if(typeof fn!=="function")continue;
    try{
      const r=fn(m);
      if(r&&r.bet&&r.primary&&r.primary!=="No Bet"){
        rows.push({engine:e.key||e.name,market:r.primary,confidence:r.confidence});
      }
    }catch(_){}
  }
  return rows;
}
function attachModelCalibration(matches,opts={}){
  const log=opts.log||loadLog(opts.logPath);
  const ledger=opts.ledger||buildCalibrationLedger(log);
  if(opts.writeLedger!==false)saveLedger(ledger,opts.ledgerPath||path.join(HERE,LEDGER_FILE));
  let attached=0,matchCount=0;
  for(const m of matches||[]){
    const modelCalibration={},modelProbabilities={};
    for(const c of engineCandidates(m)){
      const g=chooseGroup(ledger,m.league||"*",c.engine,c.market,scoreBand(c.confidence));
      if(!g)continue;
      const fair=fairProbability(m,c.market);
      const obj={
        sample:g.sample,lower:g.lower,mid:g.mid,upper:g.upper,
        grade:g.grade,leagueReliability:g.leagueReliability,
        source:"Predict2U forward track-log",groupKey:g.key,
        fairMarketProbability:fair
      };
      const prev=modelCalibration[c.market];
      if(!prev||obj.sample>prev.sample){
        modelCalibration[c.market]=obj;
        modelProbabilities[c.market]={...obj};
      }
    }
    if(Object.keys(modelCalibration).length){
      m.modelCalibration=modelCalibration;
      m.modelProbabilities=modelProbabilities;
      attached+=Object.keys(modelCalibration).length;
      matchCount++;
    }else{
      delete m.modelCalibration;
      delete m.modelProbabilities;
    }
  }
  const validated=Object.values(ledger.groups).filter(g=>g.validated).length;
  return {groups:validated,attached,matches:matchCount,ledger};
}
function attachToDataFile(dataFile=path.join(HERE,"data.js"),opts={}){
  const raw=fs.readFileSync(dataFile,"utf8");
  const m=raw.match(/window\.MATCHES\s*=\s*([\s\S]*?);\s*$/m);
  if(!m)throw new Error("Could not parse window.MATCHES in "+dataFile);
  const matches=JSON.parse(m[1]);
  const result=attachModelCalibration(matches,opts);
  const replacement=`window.MATCHES = ${JSON.stringify(matches,null,2)};`;
  const out=raw.replace(/window\.MATCHES\s*=\s*[\s\S]*?;\s*$/m,replacement+"\n");
  fs.writeFileSync(dataFile,out,"utf8");
  return result;
}
module.exports={
  MIN_SAMPLE,confidenceNumber,scoreBand,wilson,buildCalibrationLedger,
  attachModelCalibration,attachToDataFile,marketOdds,fairProbability,loadLog,saveLedger
};
