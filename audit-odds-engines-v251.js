#!/usr/bin/env node
"use strict";
const fs=require("fs");
const path=require("path");
const bridge=require("./enrich-odds-api.js");
require("./odds-engine-guard.js");
require("./banker-engine.js");
require("./multi-engine-suite.js");

const root=__dirname;
const raw=fs.readFileSync(path.join(root,"data.js"),"utf8");
const matches=bridge.readMatches(raw).matches;
const registry=Array.isArray(globalThis.P2U_ENGINE_REGISTRY)?globalThis.P2U_ENGINE_REGISTRY:[];
const upcoming=matches.filter(m=>!["FT","AET","PEN","CANC","ABD"].includes(String(m&&m.status||"").toUpperCase())).slice(0,300);
const engines=[];
let totalErrors=0;
for(const item of registry){
  const fn=globalThis[item.fn];
  const row={key:item.key,name:item.name,version:item.version,family:item.family,fixturesTested:0,qualified:0,bankers:0,noBet:0,oddsReviewed:0,errors:[]};
  if(typeof fn!=="function"){row.errors.push(`Missing function ${item.fn}`);totalErrors++;engines.push(row);continue;}
  for(const match of upcoming){
    row.fixturesTested++;
    try{
      const out=fn(match);
      if(out&&out.bet){row.qualified++;if(out.banker)row.bankers++;}
      else row.noBet++;
      if(out&&out.oddsReview)row.oddsReviewed++;
    }catch(error){row.errors.push(`${match.home||"?"} v ${match.away||"?"}: ${error.message}`);totalErrors++;if(row.errors.length>=10)break;}
  }
  engines.push(row);
}
const report={version:"v251",generatedAt:new Date().toISOString(),matchesInData:matches.length,fixturesTested:upcoming.length,engineCount:registry.length,totalErrors,passed:registry.length===20&&totalErrors===0,engines};
fs.writeFileSync(path.join(root,"ENGINE_ODDS_AUDIT_v251.json"),JSON.stringify(report,null,2)+"\n");
console.log(`Engine odds audit: ${registry.length} engines, ${upcoming.length} fixtures, ${totalErrors} errors.`);
if(!report.passed)process.exitCode=1;
