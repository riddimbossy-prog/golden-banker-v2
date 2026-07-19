#!/usr/bin/env node
/* Predict2U v267 — production performance and architecture budget. */
'use strict';
const fs=require('fs'),path=require('path');const root=__dirname;const errors=[],warnings=[],passed=[];
const exists=f=>fs.existsSync(path.join(root,f));const read=f=>fs.readFileSync(path.join(root,f),'utf8');const size=f=>fs.statSync(path.join(root,f)).size;
const assert=(ok,msg)=>ok?passed.push(msg):errors.push(msg);
const budgets={
  'index.html':90000,'board.html':100000,'bankers.html':100000,'all-engines.html':60000,'team-rankings.html':60000,
  'current-data.js':6*1024*1024,'tailwind-lite-v264.css':16000,'stability-v264.css':24000,'data-freshness-v264.js':18000,
  'engine-governance-v264.js':18000,'app-launch-v264.js':12000,'app-launch-v264.css':12000,'first-run-v264.js':26000,'first-run-v264.css':24000,'team-rankings.js':52000,'mobile-responsive-v265.css':36000,'sw.js':32000
};
for(const [file,limit] of Object.entries(budgets)){
  if(!exists(file)){errors.push(`Missing budgeted file: ${file}`);continue;}
  const bytes=size(file);assert(bytes<=limit,`${file}: ${bytes}/${limit} bytes`);if(bytes>limit)errors[errors.length-1]=`${file} is ${bytes} bytes; budget is ${limit}.`;
}
const primary=['index.html','board.html','bankers.html','engine.html','engines.html','community.html','team-rankings.html','proof.html','scorecards.html','league-dna.html','trust.html'];
for(const page of primary){
  if(!exists(page)){errors.push(`Missing primary page: ${page}`);continue;}
  const html=read(page);
  assert(!/(?:src|href)=["']data\.js["']/.test(html),`${page}: does not load full data.js`);
  assert(/current-data\.js/.test(html),`${page}: loads current-data.js`);
  assert(/data-freshness-v264\.js/.test(html),`${page}: loads freshness guard`);
  assert(!/cdn\.tailwindcss\.com/.test(html),`${page}: no Tailwind browser CDN`);
}
for(const page of ['board.html','bankers.html','engines.html','strict-bankers.html']){
  if(!exists(page))continue;const html=read(page);assert(/tailwind-lite-v264\.css/.test(html),`${page}: local utility CSS loaded`);
}
const index=read('index.html');
assert(/app-launch-v264\.js/.test(index),'Homepage loads branded launch splash');
assert(/first-run-v264\.js/.test(index),'Homepage loads first-run walkthrough');
assert(/View Today’s Picks/.test(index)&&/View Bankers/.test(index)&&/Team Intelligence/.test(index),'Homepage exposes Today, Bankers and Team Intelligence');
assert(!/>News<|>Community</.test(index),'News and Community are not homepage primary cards');
const board=read('board.html'),bankers=read('bankers.html');
assert(/model families agree/.test(board),'Board uses independent-family agreement copy');
assert(/model families agree/.test(bankers),'Bankers uses independent-family agreement copy');
assert(/P2UDataFreshness/.test(board)&&/P2UDataFreshness/.test(bankers),'Board and Bankers block stale publication');
assert(/p2u-team-home-title/.test(index),'Homepage includes the dedicated Team Intelligence panel');
const teams=read('team-rankings.js');
for(const token of ['MIN_SAMPLE=8','HORIZON_DAYS=10','today','Season Power','URLSearchParams'])assert(teams.includes(token),`Team Intelligence includes ${token}`);
const sw=read('sw.js');
for(const token of ["VERSION='v267'",'current-data.js','data-meta.json','data-freshness-v264.js','engine-governance-v264.js','app-launch-v264.js','app-launch-v264.css','first-run-v264.js','tailwind-lite-v264.css','mobile-responsive-v265.css'])assert(sw.includes(token),`Service worker includes ${token}`);
assert(/predict2u-v267/.test(sw),'Service worker cache is v266');
const manifest=JSON.parse(read('manifest.webmanifest'));
assert(String(manifest.description||'').includes('independent model families'),'Manifest uses governed-model description');
assert(Array.isArray(manifest.icons)&&manifest.icons.some(i=>String(i.sizes).includes('192'))&&manifest.icons.some(i=>String(i.sizes).includes('512')),'Manifest includes 192 and 512 app icons');
assert(Array.isArray(manifest.screenshots)&&manifest.screenshots.some(x=>x.src==='pwa-splash-v264.jpg'),'Manifest includes branded splash artwork');
const shell=read('unified-shell-v234.js');for(const label of ['Home','Today','Bankers','Engines','Proof'])assert(shell.includes(label),`Primary shell includes ${label}`);
const mobileBlock=(shell.match(/const mobileLinks=\[[\s\S]*?\];/)||[''])[0];assert(/all-engines\.html/.test(mobileBlock)&&!/proof\.html/.test(mobileBlock),'Mobile dock removes Proof');
assert(/const moreLinks=\[[\s\S]*?proof\.html/.test(shell),'More menu includes Proof');
for(const token of ['Trend lists','Matchup Lab','winless','nodraws','Both Teams to Score'])assert(teams.includes(token)||read('team-rankings.html').includes(token),`Team Intelligence v267 includes ${token}`);
const report={generatedAt:new Date().toISOString(),version:exists('BUILD_VERSION.txt')?read('BUILD_VERSION.txt').trim():'unknown',errors,warnings,passedCount:passed.length,budgets:Object.fromEntries(Object.entries(budgets).map(([f,limit])=>[f,{bytes:exists(f)?size(f):null,limit}]))};
fs.writeFileSync(path.join(root,'performance-budget.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Performance budget: ${errors.length} error(s), ${warnings.length} warning(s), ${passed.length} checks passed.`);for(const x of errors)console.error('ERROR:',x);for(const x of warnings)console.warn('WARNING:',x);if(errors.length)process.exit(1);
