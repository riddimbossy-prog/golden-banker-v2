/* Predict2U v270 release gate. */
'use strict';
const fs=require('fs'),path=require('path'),ROOT=__dirname,errors=[];
const need=['team-rankings.html','team-rankings.js','auto-picks-learning-v270.js','auto-picks-learning-v270.css','auto-picks-learning-guard-v270.js','auto-picks-learning-public-v270.json','auto-picks-learning-worker-v270.js','supabase/auto-picks-learning-v270.sql','.github/workflows/auto-picks-learning.yml','sw.js'];
for(const f of need)if(!fs.existsSync(path.join(ROOT,f)))errors.push(`Missing ${f}`);
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const html=read('team-rankings.html'),js=read('team-rankings.js'),sw=read('sw.js');
if(!html.includes('id="team-auto-learning"'))errors.push('Public learning status is missing.');
if(!html.includes('auto-picks-learning-guard-v270.js'))errors.push('Hashed learning guard is not loaded.');
if(!js.includes('P2U_HEADLESS_AUTO_V270'))errors.push('Headless workflow export is missing.');
if(!js.includes('learningDecision'))errors.push('Learning guard is not applied to Auto Picks.');
if(!sw.includes("const VERSION='v270'"))errors.push('Service worker cache was not bumped.');
if(/smoothed rate|rule weight|threshold adjustment/i.test(html))errors.push('Private learning detail leaked into public Team Intelligence HTML.');
try{JSON.parse(read('auto-picks-learning-public-v270.json'));}catch(e){errors.push('Public learning JSON is invalid.');}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log('Predict2U v270 release gate passed.');
