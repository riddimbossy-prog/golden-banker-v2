/* Predict2U v269 — deterministic release gate for the stabilized product. */
'use strict';
const fs=require('fs'),path=require('path');const ROOT=__dirname;const errors=[];
const need=['index.html','board.html','bankers.html','all-engines.html','proof.html','team-rankings.html','current-data.js','data-meta.json','data-freshness-v264.js','engine-governance-v264.js','first-run-v264.js','manifest.webmanifest','sw.js','mobile-responsive-v265.css'];
for(const f of need)if(!fs.existsSync(path.join(ROOT,f)))errors.push(`Missing ${f}`);
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
if(fs.existsSync(path.join(ROOT,'index.html'))&&!/first-run-v264\.js/.test(read('index.html')))errors.push('Homepage walkthrough not loaded.');
if(fs.existsSync(path.join(ROOT,'board.html'))&&!/current-data\.js/.test(read('board.html')))errors.push('Board still loads the full data bundle.');
if(fs.existsSync(path.join(ROOT,'manifest.webmanifest'))){const m=JSON.parse(read('manifest.webmanifest'));if(!String(m.description||'').includes('independent model families'))errors.push('Manifest description is outdated.');}
if(fs.existsSync(path.join(ROOT,'current-data.js'))&&fs.statSync(path.join(ROOT,'current-data.js')).size>9*1024*1024)errors.push('current-data.js exceeds 9 MB.');
const old=[];for(const f of fs.readdirSync(ROOT).filter(x=>!['release-gate-v264.js','release-gate-v265.js','release-gate-v266.js','release-gate-v267.js','release-gate-v268.js','release-gate-v269.js'].includes(x)&&/\.(js|json|md|yml|yaml|html|txt)$/.test(x))){const full=path.join(ROOT,f);if(fs.statSync(full).size<2e6&&read(f).includes('riddimbossy-prog/golden-banker-v2'))old.push(f);}if(old.length)errors.push(`Old repository slug remains in: ${old.join(', ')}`);
if(fs.existsSync(path.join(ROOT,'index.html'))&&!/p2u-team-home-title/.test(read('index.html')))errors.push('Team Intelligence homepage panel is missing.');
if(fs.existsSync(path.join(ROOT,'index.html'))&&!/mobile-responsive-v265\.css/.test(read('index.html')))errors.push('v265 responsive CSS is missing from the homepage.');
if(fs.existsSync(path.join(ROOT,'team-rankings.js'))&&!/URLSearchParams/.test(read('team-rankings.js')))errors.push('Team Intelligence deep links are not enabled.');

if(fs.existsSync(path.join(ROOT,'team-rankings.html'))&&!/Matchup Lab/.test(read('team-rankings.html')))errors.push('Matchup Lab is missing.');
if(fs.existsSync(path.join(ROOT,'team-rankings.js'))&&!/const trends=/.test(read('team-rankings.js')))errors.push('Team trend definitions are missing.');
if(fs.existsSync(path.join(ROOT,'unified-shell-v234.js'))){const shell=read('unified-shell-v234.js');const mobile=(shell.match(/const mobileLinks=\[[\s\S]*?\];/)||[''])[0];const more=(shell.match(/const moreLinks=\[[\s\S]*?\];/)||[''])[0];if(/proof\.html/.test(mobile))errors.push('Proof remains in the mobile dock.');if(!/proof\.html/.test(more))errors.push('Proof is missing from More.');}
if(fs.existsSync(path.join(ROOT,'data-freshness-v264.js'))&&/Predictions temporarily paused/.test(read('data-freshness-v264.js')))errors.push('Old paused-predictions banner text remains.');
const teamsHtml=read('team-rankings.html'),teamsJs=read('team-rankings.js');
if(!teamsHtml.includes('id="team-date-filter"'))errors.push('Team Intelligence date filter is missing.');
if(!teamsHtml.includes('team-date-filter-v268.css'))errors.push('Team date-filter stylesheet is not linked.');
if(!teamsJs.includes('selectedFixturePool'))errors.push('Team date filter is not wired into fixture selection.');
if(!read('sw.js').includes('team-date-filter-v268.css'))errors.push('Team date-filter stylesheet is not cached by the service worker.');

if(!teamsHtml.includes('data-team-mode="auto"'))errors.push('Daily Auto Picks tab is missing.');
if(!teamsHtml.includes('id="team-panel-auto"'))errors.push('Daily Auto Picks panel is missing.');
if(!teamsHtml.includes('team-auto-picks-v269.css'))errors.push('Daily Auto Picks stylesheet is not linked.');
if(!teamsJs.includes('automaticSelections'))errors.push('Automatic profile selection engine is missing.');
if(!teamsJs.includes('profileMarketCompatibility'))errors.push('Automatic picks do not validate profile-to-market relevance.');
if(!read('sw.js').includes('team-auto-picks-v269.css'))errors.push('Daily Auto Picks stylesheet is not cached by the service worker.');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log('Predict2U v269 release gate passed.');
