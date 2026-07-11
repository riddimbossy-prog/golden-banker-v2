#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const HERE=__dirname,PACKAGE_MODE=process.argv.includes("--package");
const critical=[],warnings=[],passed=[];
const exists=f=>fs.existsSync(path.join(HERE,f));
const read=f=>{try{return fs.readFileSync(path.join(HERE,f),"utf8");}catch(_){return"";}};
const pages=["index.html","board.html","engines.html","proof.html","scorecards.html","league-dna.html","community.html","trust.html","responsible-gambling.html","terms.html","privacy.html","disclaimer.html","404.html"];
const required=[...pages,"banker-engine.js","p2u-intelligence.js","intelligence.css","site-health-widget.js","site-health.css","sw.js","predict2u-logo.png","brand-experience.js","brand-experience.css","performance-freshness.js","performance-freshness.css","social-preview.png","favicon.ico","favicon-16x16.png","favicon-32x32.png","apple-touch-icon.png","maskable-icon.png","404.html"];
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
  if(!/predict2u-logo\.(?:png|webp)/.test(html)&&page!=="404.html")warnings.push(`${page}: official logo reference not found.`);
  if(!/og:image/.test(html))critical.push(`${page}: Open Graph image metadata missing.`);
  if(!/favicon-32x32\.png/.test(html))critical.push(`${page}: favicon metadata missing.`);
  if(!/brand-experience\.(?:css|js)/.test(html))warnings.push(`${page}: Brand Experience layer not loaded.`);
  if(!/performance-freshness\.(?:css|js)/.test(html))critical.push(`${page}: Performance/Freshness layer not loaded.`);
  let m;while((m=localRef.exec(html))){
    let ref=m[1].split(/[?#]/)[0];
    if(ref.includes("${"))continue;
    if(!ref||/^(?:https?:|mailto:|tel:|javascript:|data:|#)/i.test(ref))continue;
    if(ref.startsWith("/"))ref=ref.slice(1);
    if(!exists(ref)){
      if(PACKAGE_MODE&&["data.js","community.js"].includes(ref))continue;
      if(/\.(?:css|js)$/i.test(ref))critical.push(`${page}: required local asset not found: ${ref}`);
      else warnings.push(`${page}: local reference not found: ${ref}`);
    }
  }
}
const sw=read("sw.js");
const cacheMatch=sw.match(/const\s+CACHE_VERSION\s*=\s*["']([^"']+)["']/);
if(!cacheMatch){
  critical.push("sw.js does not declare CACHE_VERSION.");
}else if(!/^predict2u-v[0-9A-Za-z._-]+$/.test(cacheMatch[1])){
  critical.push(`sw.js CACHE_VERSION has an invalid format: ${cacheMatch[1]}`);
}else{
  passed.push(`Service-worker cache is ${cacheMatch[1]}`);
}
for(const f of ["trust.html","intelligence.css","site-health-widget.js","site-health.css","performance-freshness.js","performance-freshness.css"]){if(!sw.includes(`./${f}`))warnings.push(`sw.js does not precache ${f}.`);}

for(const f of ["favicon.ico","favicon-16x16.png","favicon-32x32.png","apple-touch-icon.png","icon-192.png","icon-512.png","maskable-icon.png","social-preview.png"]){if(!exists(f))critical.push(`Missing brand asset: ${f}`);else passed.push(`Found brand asset ${f}`);}
const board=read("board.html"),full=read("engines.html");
if(!/p2u-onboarding-v157/.test(read("brand-experience.js")))critical.push("First-visit onboarding is missing.");else passed.push("First-visit onboarding is wired");
if(!/board-rank-reason/.test(board)||!/ranked-explainer/.test(full))critical.push("Ranked #1 explanation is incomplete.");else passed.push("Ranked #1 explanation is present on both boards");
if(/p2u-system-alert|Core match data is more than 36 hours old|View system status/.test(read("brand-experience.js")))critical.push("Removed public status banner is still present.");else passed.push("Public status banner is removed; Trust Center status remains available");

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
const report={generatedAt:new Date().toISOString(),auditVersion:"v166",cacheVersion:cacheMatch?cacheMatch[1]:null,engineCount,critical,warnings:uniqueWarnings,passedCount:passed.length};
fs.writeFileSync(path.join(HERE,"site-audit.json"),JSON.stringify(report,null,2)+"\n");
console.log(`Audit: ${critical.length} critical, ${uniqueWarnings.length} warning(s), ${passed.length} checks passed.`);
for(const x of critical)console.error("CRITICAL:",x);
for(const x of uniqueWarnings)console.warn("WARNING:",x);
if(critical.length)process.exit(1);