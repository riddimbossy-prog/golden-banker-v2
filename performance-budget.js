#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const root=__dirname;
const errors=[],warnings=[],passed=[];
const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const size=f=>fs.statSync(path.join(root,f)).size;
const exists=f=>fs.existsSync(path.join(root,f));

const budgets={
  "index.html":70000,
  "board.html":70000,
  "engines.html":50000,
  "banker-engine.js":110000,
  "p2u-intelligence.js":35000,
  "brand-experience.css":22000,
  "performance-freshness.js":18000,
  "performance-freshness.css":14000,
  "personalization.js":30000,
  "personalization.css":18000,
  "smart-alerts.js":42000,
  "smart-alerts.css":22000
};
for(const [file,limit] of Object.entries(budgets)){
  if(!exists(file)){errors.push(`Missing budgeted file: ${file}`);continue;}
  const bytes=size(file);
  if(bytes>limit)errors.push(`${file} is ${bytes} bytes; budget is ${limit}.`);
  else passed.push(`${file}: ${bytes}/${limit} bytes`);
}

for(const page of ["index.html","board.html"]){
  const html=read(page);
  for(const host of ["cdn.tailwindcss.com","cdnjs.cloudflare.com","cdn.jsdelivr.net"]){
    if(!new RegExp(`rel=["']preconnect["'][^>]+${host.replaceAll(".","\\.")}`).test(html))
      errors.push(`${page}: missing preconnect for ${host}`);
  }
  if(!/performance-freshness\.css/.test(html)||!/performance-freshness\.js[^>]+defer/.test(html))
    errors.push(`${page}: performance/freshness layer is not loaded correctly.`);
  if(!/classList\.add\(['"]p2u-booting['"]\)/.test(html))
    errors.push(`${page}: CSS loading state is not armed in the head.`);
}

const sw=read("sw.js");
const cacheMatch=sw.match(/CACHE_VERSION\s*=\s*["'](predict2u-v\d+)["']/);
if(!cacheMatch)errors.push("sw.js is missing a valid predict2u-vN cache version.");
else passed.push(`sw.js cache: ${cacheMatch[1]}`);
for(const token of ["NETWORK_TIMEOUT_MS","canonicalRequest","performance-freshness.js","performance-freshness.css","personalization.js","personalization.css","smart-alerts.js","smart-alerts.css"]){
  if(!sw.includes(token))errors.push(`sw.js missing ${token}`);
}
for(const page of ["index.html","board.html"]){
  const html=read(page);
  for(const token of ["date-strip","date-chip","date-chip-day","date-chip-date","date-chip-count"]){
    if(!html.includes(token))errors.push(`${page}: mobile date rail missing ${token}`);
  }
}
if(!/content-visibility\s*:\s*auto/.test(read("performance-freshness.css")))
  errors.push("Lower-page content visibility optimization is missing.");
if(!/P2UBoardRefresh/.test(read("index.html"))||!/P2UBoardRefresh/.test(read("board.html")))
  errors.push("In-place board refresh hook is missing.");
if(/p2u-system-alert|Core match data is more than 36 hours old/.test(read("brand-experience.js")))
  errors.push("Removed full-width status banner returned.");


for(const page of ["index.html","board.html"]){
  const html=read(page);
  if(!/personalization\.css/.test(html)||!/personalization\.js/.test(html))errors.push(`${page}: personalization layer is not loaded.`);
}
for(const token of ["favoriteEngines","favoriteLeagues","hiddenLeagues","recentMatches","cardView"]){
  if(!read("personalization.js").includes(token))errors.push(`personalization.js missing ${token}`);
}


for(const page of ["index.html","board.html","community.html"]){
  const html=read(page);
  if(!/smart-alerts\.css/.test(html)||!/smart-alerts\.js[^>]+defer/.test(html))errors.push(`${page}: Smart Alerts layer is not loaded correctly.`);
}
for(const token of ["communityWin","verifiedOnly","followedUsers","trendingWins","p2u:community-win"]){
  if(!read("smart-alerts.js").includes(token))errors.push(`smart-alerts.js missing ${token}`);
}

const buildVersion=exists("BUILD_VERSION.txt")?read("BUILD_VERSION.txt").trim():"unknown";
const report={
  generatedAt:new Date().toISOString(),
  version:buildVersion,
  errors,
  warnings,
  passedCount:passed.length,
  budgets:Object.fromEntries(Object.entries(budgets).map(([f,limit])=>[f,{bytes:exists(f)?size(f):null,limit}]))
};
fs.writeFileSync(path.join(root,"performance-budget.json"),JSON.stringify(report,null,2)+"\n");
console.log(`Performance budget: ${errors.length} error(s), ${warnings.length} warning(s), ${passed.length} checks passed.`);
for(const x of errors)console.error("ERROR:",x);
for(const x of warnings)console.warn("WARNING:",x);
if(errors.length)process.exit(1);
