#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const HERE=__dirname,PACKAGE_MODE=process.argv.includes("--package");
const critical=[],warnings=[],passed=[];
const exists=f=>fs.existsSync(path.join(HERE,f));
const read=f=>{try{return fs.readFileSync(path.join(HERE,f),"utf8");}catch(_){return"";}};
const pages=["board.html","bankers.html","engines.html","proof.html","scorecards.html","league-dna.html","community.html","trust.html"];
const required=[...pages,"banker-engine.js","multi-engine-suite.js","specialist-engines-v262.js","p2u-intelligence.js","site-health-widget.js","site-health.css","sw.js","predict2u-logo.png"];
for(const f of required){if(!exists(f))critical.push(`Missing required file: ${f}`);else passed.push(`Found ${f}`);}
let engineCount=null;
try{
  const base=require("./banker-engine.js");
  globalThis.P2U_ENGINE_REGISTRY=Array.isArray(base.P2U_ENGINE_REGISTRY)?[...base.P2U_ENGINE_REGISTRY]:[];
  delete require.cache[require.resolve("./multi-engine-suite.js")];
  require("./multi-engine-suite.js");
  delete require.cache[require.resolve("./specialist-engines-v262.js")];
  require("./specialist-engines-v262.js");
  engineCount=(globalThis.P2U_ENGINE_REGISTRY||[]).length;
  if(engineCount!==22)critical.push(`Engine registry has ${engineCount}; expected 22.`);
  else passed.push("Engine registry has 22 engines");
  const additions=(globalThis.P2U_MULTI_ENGINE_REGISTRY||[]).length;
  if(additions!==4)critical.push(`Multi-engine extension has ${additions}; expected 4 engines.`);
  else passed.push("Multi-engine extension has 4 engines");
  if((globalThis.P2U_ENGINE_REGISTRY||[]).some(e=>/decision core/i.test(String(e&&e.name||""))))critical.push("Decision Core must remain an orchestrator, not a public engine.");
  else passed.push("Decision Core is not registered as an engine");
}catch(e){critical.push(`Cannot load integrated engine registry: ${e.message}`);}
const localRef=/\b(?:href|src)=["']([^"']+)["']/gi;
for(const page of pages){
  const html=read(page);if(!html)continue;
  const ids=[...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(m=>m[1]);
  const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
  if(dup.length)critical.push(`${page}: duplicate IDs: ${dup.join(", ")}`);else passed.push(`${page}: no duplicate IDs`);
  if(!/multi-engine-suite\.js/.test(html))critical.push(`${page}: multi-engine extension is not loaded.`);else passed.push(`${page}: multi-engine extension loaded`);
  if(!/specialist-engines-v262\.js/.test(html))warnings.push(`${page}: v262 specialist extension is not loaded.`);
  if(/\b(?:13|16)\s+engines\b|\b(?:thirteen|sixteen)\s+(?:specialized\s+)?engines\b/i.test(html))warnings.push(`${page}: old engine-count wording remains.`);
  let m;while((m=localRef.exec(html))){
    let ref=m[1].split(/[?#]/)[0];
    if(ref.includes("${"))continue;
    if(!ref||/^(?:https?:|mailto:|tel:|javascript:|data:|#)/i.test(ref))continue;
    if(ref.startsWith("/"))ref=ref.slice(1);
    if(!exists(ref)){
      if(PACKAGE_MODE&&["data.js","community.js","banker-engine.js","p2u-intelligence.js","site-health-widget.js","site-health.css","sw.js","predict2u-logo.png"].includes(ref))continue;
      warnings.push(`${page}: local reference not found: ${ref}`);
    }
  }
}
const sw=read("sw.js");
if(sw){
  const ver=sw.match(/CACHE_VERSION\s*=\s*["'](predict2u-v[^"']+)["']/);
  if(!ver)warnings.push("sw.js does not expose a recognizable Predict2U cache version.");
  else passed.push(`Service-worker cache is ${ver[1]}`);
}
if(exists("data.js")){
  const data=read("data.js"),mm=data.match(/window\.MATCHES\s*=\s*([\s\S]*?);\s*(?:window\.|$)/m);
  if(!mm)warnings.push("data.js could not be parsed by the package audit.");
  else try{
    const rows=JSON.parse(mm[1]),seen=new Set(),dups=[];
    for(const m of rows){const k=m.id!=null?`f${m.id}`:`${m.home}|${m.away}|${m.matchDate}`;if(seen.has(k))dups.push(k);seen.add(k);}
    if(dups.length)warnings.push(`data.js contains ${dups.length} duplicate fixture key(s).`);else passed.push(`data.js contains ${rows.length} unique fixtures`);
  }catch(e){warnings.push(`data.js MATCHES JSON cannot be parsed: ${e.message}`);}
}else if(!PACKAGE_MODE)warnings.push("data.js is not present; live repository audit cannot validate fixtures.");
const uniqueWarnings=[...new Set(warnings)];
const report={generatedAt:new Date().toISOString(),engineCount,expectedEngineCount:22,multiEngineCount:4,critical,warnings:uniqueWarnings,passedCount:passed.length};
fs.writeFileSync(path.join(HERE,"site-audit.json"),JSON.stringify(report,null,2)+"\n");
console.log(`Audit: ${critical.length} critical, ${uniqueWarnings.length} warning(s), ${passed.length} checks passed.`);
for(const x of critical)console.error("CRITICAL:",x);
for(const x of uniqueWarnings)console.warn("WARNING:",x);
if(critical.length)process.exit(1);
