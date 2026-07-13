#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const html=fs.readdirSync(__dirname).filter(f=>f.endsWith('.html'));
const css=read('device-responsive-v207.css');
const checks=[];
const check=(name,ok)=>checks.push({name,ok:Boolean(ok)});
check('engine rail cannot wrap',/#engine-pills[^}]*flex-wrap:nowrap!important/s.test(css));
check('engine pills cannot shrink',/#engine-pills>\.pill[^}]*flex:0 0 auto!important/s.test(css));
check('engine labels keep intrinsic width',/#engine-pills>\.pill[^}]*min-width:max-content!important/s.test(css));
check('engine rail scrolls horizontally',/#engine-pills[^}]*overflow-x:auto!important/s.test(css));
check('date rail negative margins removed',/#date-strip[^}]*margin-left:0!important[^}]*margin-right:0!important/s.test(css));
check('board clears sticky header',/#board,#engines,#top\{scroll-margin-top:76px\}/.test(css));
check('board date uses nearest alignment',read('board.html').includes("inline:'nearest'"));
check('index date uses nearest alignment',read('index.html').includes("inline:'nearest'"));
check('all responsive pages use v207 CSS',html.every(f=>!read(f).includes('device-responsive-v205.css')));
check('public pages reference v207 CSS',html.filter(f=>read(f).includes('device-responsive-v207.css')).length>=18);
check('service worker cache bumped',read('sw.js').includes("CACHE_VERSION='predict2u-v207'"));
check('service worker precaches v207 CSS',read('sw.js').includes("'./device-responsive-v207.css'"));
const failed=checks.filter(x=>!x.ok);
const report={version:'v207',generated_at:new Date().toISOString(),passed:checks.length-failed.length,failed:failed.length,checks};
fs.writeFileSync(path.join(__dirname,'VALIDATION_v207.json'),JSON.stringify(report,null,2));
if(failed.length){failed.forEach(x=>console.error('FAIL:',x.name));process.exit(1)}
console.log(`Phone UI self-test passed: ${checks.length} checks.`);
