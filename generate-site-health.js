#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const HERE=__dirname,VERSION="v155";
const read=f=>{try{return fs.readFileSync(path.join(HERE,f),"utf8");}catch(_){return"";}};
const mtime=f=>{try{return fs.statSync(path.join(HERE,f)).mtime.toISOString();}catch(_){return null;}};
const capture=(text,re)=>{const m=text.match(re);return m?m[1]:null;};
const data=read("data.js");
let matches=[];
const mm=data.match(/window\.MATCHES\s*=\s*([\s\S]*?);\s*$/m);
if(mm){try{matches=JSON.parse(mm[1]);}catch(_){}}
let engineCount=null;
try{const eng=require("./banker-engine.js");engineCount=Array.isArray(eng.P2U_ENGINE_REGISTRY)?eng.P2U_ENGINE_REGISTRY.length:null;}catch(_){}
const LIVE=new Set(["1H","HT","2H","ET","BT","P","LIVE"]);
const dataUpdated=capture(data,/window\.DATA_UPDATED\s*=\s*["']([^"']+)/)||mtime("data.js");
const scoresUpdated=capture(data,/window\.SCORES_UPDATED\s*=\s*["']([^"']+)/)||null;
const required=["board.html","engines.html","proof.html","scorecards.html","league-dna.html","community.html","trust.html","banker-engine.js","p2u-intelligence.js","site-health-widget.js"];
const missing=required.filter(f=>!fs.existsSync(path.join(HERE,f)));
const now=Date.now(),age=v=>{const t=Date.parse(v||"");return Number.isFinite(t)?now-t:Infinity;};
let state="healthy",label="System operational";
if(missing.length||(engineCount!=null&&engineCount!==16)||age(dataUpdated)>36*3600000){state="critical";label="Action needed";}
else if(age(dataUpdated)>12*3600000){state="stale";label="Data stale";}
else if(matches.some(m=>LIVE.has(String(m.status||"").toUpperCase()))&&age(scoresUpdated)>20*60000){state="degraded";label="Live scores delayed";}
const out={version:VERSION,generatedAt:new Date().toISOString(),state,label,dataUpdated,scoresUpdated,engineCount,matchCount:matches.length,liveMatches:matches.filter(m=>LIVE.has(String(m.status||"").toUpperCase())).length,missingRequiredFiles:missing};
fs.writeFileSync(path.join(HERE,"site-health.json"),JSON.stringify(out,null,2)+"\n");
console.log(`site-health.json: ${label}; ${matches.length} matches; ${engineCount==null?"?":engineCount} engines.`);