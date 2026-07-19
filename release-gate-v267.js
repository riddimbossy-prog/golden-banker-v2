/* Predict2U v267 — deterministic release gate for the stabilized product. */
'use strict';
const fs=require('fs'),path=require('path');const ROOT=__dirname;const errors=[];
const need=['index.html','board.html','bankers.html','all-engines.html','proof.html','team-rankings.html','current-data.js','data-meta.json','data-freshness-v264.js','engine-governance-v264.js','first-run-v264.js','manifest.webmanifest','sw.js','mobile-responsive-v265.css'];
for(const f of need)if(!fs.existsSync(path.join(ROOT,f)))errors.push(`Missing ${f}`);
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
if(fs.existsSync(path.join(ROOT,'index.html'))&&!/first-run-v264\.js/.test(read('index.html')))errors.push('Homepage walkthrough not loaded.');
if(fs.existsSync(path.join(ROOT,'board.html'))&&!/current-data\.js/.test(read('board.html')))errors.push('Board still loads the full data bundle.');
if(fs.existsSync(path.join(ROOT,'manifest.webmanifest'))){const m=JSON.parse(read('manifest.webmanifest'));if(!String(m.description||'').includes('independent model families'))errors.push('Manifest description is outdated.');}
if(fs.existsSync(path.join(ROOT,'current-data.js'))&&fs.statSync(path.join(ROOT,'current-data.js')).size>9*1024*1024)errors.push('current-data.js exceeds 9 MB.');
const old=[];for(const f of fs.readdirSync(ROOT).filter(x=>!['release-gate-v264.js','release-gate-v265.js','release-gate-v266.js','release-gate-v267.js'].includes(x)&&/\.(js|json|md|yml|yaml|html|txt)$/.test(x))){const full=path.join(ROOT,f);if(fs.statSync(full).size<2e6&&read(f).includes('riddimbossy-prog/golden-banker-v2'))old.push(f);}if(old.length)errors.push(`Old repository slug remains in: ${old.join(', ')}`);
if(fs.existsSync(path.join(ROOT,'index.html'))&&!/p2u-team-home-title/.test(read('index.html')))errors.push('Team Intelligence homepage panel is missing.');
if(fs.existsSync(path.join(ROOT,'index.html'))&&!/mobile-responsive-v265\.css/.test(read('index.html')))errors.push('v265 responsive CSS is missing from the homepage.');
if(fs.existsSync(path.join(ROOT,'team-rankings.js'))&&!/URLSearchParams/.test(read('team-rankings.js')))errors.push('Team Intelligence deep links are not enabled.');

if(fs.existsSync(path.join(ROOT,'team-rankings.html'))&&!/Matchup Lab/.test(read('team-rankings.html')))errors.push('Matchup Lab is missing.');
if(fs.existsSync(path.join(ROOT,'team-rankings.js'))&&!/const trends=/.test(read('team-rankings.js')))errors.push('Team trend definitions are missing.');
if(fs.existsSync(path.join(ROOT,'unified-shell-v234.js'))){const shell=read('unified-shell-v234.js');const mobile=(shell.match(/const mobileLinks=\[[\s\S]*?\];/)||[''])[0];const more=(shell.match(/const moreLinks=\[[\s\S]*?\];/)||[''])[0];if(/proof\.html/.test(mobile))errors.push('Proof remains in the mobile dock.');if(!/proof\.html/.test(more))errors.push('Proof is missing from More.');}
if(fs.existsSync(path.join(ROOT,'data-freshness-v264.js'))&&/Predictions temporarily paused/.test(read('data-freshness-v264.js')))errors.push('Old paused-predictions banner text remains.');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log('Predict2U v267 release gate passed.');
