#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const HERE=__dirname;
const read=f=>{try{return fs.readFileSync(path.join(HERE,f),"utf8");}catch(_){return"";}};
function readData(){
  const src=read("data.js");if(!src)return{};
  const sandbox={window:{},globalThis:{}};sandbox.globalThis=sandbox.window;
  try{vm.runInNewContext(src,sandbox,{timeout:2500});return sandbox.window||{};}catch(_){return{};}
}
let engineCount=0;
try{
  const base=require("./banker-engine.js");
  globalThis.P2U_ENGINE_REGISTRY=Array.isArray(base.P2U_ENGINE_REGISTRY)?[...base.P2U_ENGINE_REGISTRY]:[];
  delete require.cache[require.resolve("./multi-engine-suite.js")];
  require("./multi-engine-suite.js");
  engineCount=(globalThis.P2U_ENGINE_REGISTRY||[]).length;
}catch(e){console.warn("Engine registry health check failed:",e.message);}
const d=readData(),matches=Array.isArray(d.MATCHES)?d.MATCHES:[];
const live=matches.filter(m=>{const s=String(m.status||"").toUpperCase();return /LIVE|1H|2H|HT|ET|BT|PEN/.test(s)||Number(m.minute)>0&&Number(m.minute)<130;}).length;
const updated=d.DATA_UPDATED||d.SCORES_UPDATED||null;
const build=(read("BUILD_VERSION.txt").trim()||"v251");
let oddsCoverage=null;try{oddsCoverage=JSON.parse(read("odds-api-coverage.json")||"null");}catch(_){}
const health={
  generatedAt:new Date().toISOString(),version:build,label:engineCount===20?"Operational":"Engine registry check needed",
  status:engineCount===20?"operational":"degraded",dataUpdated:d.DATA_UPDATED||updated,scoresUpdated:d.SCORES_UPDATED||updated,
  engineCount,expectedEngineCount:20,multiEngineCount:4,matchCount:matches.length,liveMatches:live,
  components:{baseEngines:Math.max(0,engineCount-4),multiEngineSuite:4,decisionCore:"orchestrator",oddsApi:{
    configured:oddsCoverage?oddsCoverage.keyPresent:null,
    matchesUpdated:oddsCoverage?oddsCoverage.matchesUpdated:null,
    actualHtftMatches:oddsCoverage?oddsCoverage.actualHtftMatches:null,
    derivedHtftMatches:oddsCoverage?oddsCoverage.derivedHtftMatches:null,
    quotaRemaining:oddsCoverage&&oddsCoverage.quota?oddsCoverage.quota.remaining:null
  }}
};
fs.writeFileSync(path.join(HERE,"site-health.json"),JSON.stringify(health,null,2)+"\n");
console.log(`Health generated: ${engineCount}/20 engines, ${matches.length} fixtures, ${live} live.`);
if(engineCount!==20)process.exitCode=1;
