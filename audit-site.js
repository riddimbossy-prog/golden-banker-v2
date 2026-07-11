#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const HERE=__dirname,PACKAGE_MODE=process.argv.includes("--package");
const critical=[],warnings=[],passed=[];
const exists=f=>fs.existsSync(path.join(HERE,f));
const read=f=>{try{return fs.readFileSync(path.join(HERE,f),"utf8");}catch(_){return"";}};
const pages=["board.html","engines.html","proof.html","scorecards.html","league-dna.html","community.html","trust.html"];
const required=[...pages,"banker-engine.js","p2u-intelligence.js","site-health-widget.js","site-health.css","sw.js","predict2u-logo.png"];
for(const f of required){if(!exists(f))critical.push(`Missing required file: ${f}`);else passed.push(`Found ${f}`);}
let engineCount=null;
try{const eng=require("./banker-engine.js");engineCount=(eng.P2U_ENGINE_REGISTRY||[]).length;if(engineCount!==16)critical.push(`Engine registry has ${engineCount}; expected 16.`);else passed.push("Engine registry has 16 engines");}catch(e){critical.push(`Cannot load banker-engine.js: ${e.message}`);}
const localRef=/\b(?:href|src)=["']([^"']+)["']/gi;
for(const page of pages){
  const html=read(page);if(!html)continue;
  const ids=[...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(m=>m[1]);
  const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
  if(dup.length)critical.push(`${page}: duplicate IDs: ${dup.join(", ")}`);else passed.push(`${page}: no duplicate IDs`);
  if(/\b13\s+engines\b|\bthirteen\s+(?:specialized\s+)?engines\b/i.test(html))critical.push(`${page}: obsolete 13-engine wording remains.`);
  if(!/site-health-widget\.js/.test(html))critical.push(`${page}: health widget not loaded.`);
  if(!/trust\.html/.test(html))warnings.push(`${page}: no visible Trust Center link.`);
  if(!/predict2u-logo\.(?:png|webp)/.test(html))warnings.push(`${page}: official logo reference not found.`);
  let m;while((m=localRef.exec(html))){
    let ref=m[1].split(/[?#]/)[0];
    if(ref.includes("${"))continue;
    if(!ref||/^(?:https?:|mailto:|tel:|javascript:|data:|#)/i.test(ref))continue;
    if(ref.startsWith("/"))ref=ref.slice(1);
    if(!exists(ref)){
      if(PACKAGE_MODE&&["data.js","community.js"].includes(ref))continue;
      warnings.push(`${page}: local reference not found: ${ref}`);
    }
  }
}
const sw=read("sw.js");
if(!/predict2u-v155/.test(sw))critical.push("sw.js cache version is not predict2u-v155.");else passed.push("Service-worker cache is v155");
for(const f of ["trust.html","site-health-widget.js","site-health.css"]){if(!sw.includes(`./${f}`))warnings.push(`sw.js does not precache ${f}.`);}
const proof=read("proof.html");
if(!/p2u-intelligence\.js/.test(proof)||!/proof-root/.test(proof))critical.push("Proof page wiring is incomplete.");
if(exists("data.js")){
  const data=read("data.js");
  const mm=data.match(/window\.MATCHES\s*=\s*([\s\S]*?);\s*$/m);
  if(!mm)critical.push("data.js does not expose window.MATCHES.");
  else try{
    const rows=JSON.parse(mm[1]),seen=new Set(),dups=[];
    for(const m of rows){const k=m.id!=null?`f${m.id}`:`${m.home}|${m.away}|${m.matchDate}`;if(seen.has(k))dups.push(k);seen.add(k);}
    if(dups.length)warnings.push(`data.js contains ${dups.length} duplicate fixture key(s).`);else passed.push(`data.js contains ${rows.length} unique fixtures`);
  }catch(e){critical.push(`data.js MATCHES JSON cannot be parsed: ${e.message}`);}
}else if(!PACKAGE_MODE)warnings.push("data.js is not present; live repository audit cannot validate fixtures.");
const uniqueWarnings=[...new Set(warnings)];
const report={generatedAt:new Date().toISOString(),engineCount,critical,warnings:uniqueWarnings,passedCount:passed.length};
fs.writeFileSync(path.join(HERE,"site-audit.json"),JSON.stringify(report,null,2)+"\n");
console.log(`Audit: ${critical.length} critical, ${uniqueWarnings.length} warning(s), ${passed.length} checks passed.`);
for(const x of critical)console.error("CRITICAL:",x);
for(const x of uniqueWarnings)console.warn("WARNING:",x);
if(critical.length)process.exit(1);