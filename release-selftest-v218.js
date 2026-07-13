#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const root=__dirname; const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const checks=[]; const check=(name,ok,detail='')=>{checks.push({name,ok:!!ok,detail});if(!ok)console.error('FAIL:',name,detail)};
const sw=read('sw.js'), engines=read('engines.html'), css=read('engines-rescue-v218.css'), slip=read('slip.js'), board=read('board.html'), index=read('index.html');
const version=read('BUILD_VERSION.txt').trim();
check('service worker version',sw.includes(`const VERSION='${version}';`)&&sw.includes(`predict2u-${version}`));
check('new rescue assets cached',sw.includes('p2u-utilities-v218.css')&&sw.includes('engines-rescue-v218.css'));
check('global v217 overhaul removed',!engines.includes('ui-foundation-v217.css')&&!engines.includes('ui-experience-v217.js'));
check('full-board rescue loaded',engines.includes('engines-rescue-v218.css')&&engines.includes('p2u-utilities-v218.css'));
check('header classes present',engines.includes('p2u-engines-nav')&&engines.includes('p2u-engines-nav-inner'));
check('logo hard cap',/\.p2u-engines-nav \.nav-logo\{[\s\S]*?max-width:188px!important/.test(css));
check('desktop links hide before crowding',/@media\(max-width:1180px\)[\s\S]*?\.p2u-engines-links\{display:none!important\}/.test(css));
check('phone board one column',/@media\(max-width:640px\)[\s\S]*?#top-bankers-grid\{grid-template-columns:1fr!important/.test(css));
check('320px narrow protection',/@media\(max-width:360px\)/.test(css));
check('active engine count logic retained',board.includes("$('s-engines').textContent=`${active.length}/${TOTAL}`;")&&index.includes("$('s-engines').textContent=`${active.length}/${TOTAL}`;"));
check('all active picks retained',board.includes("if(mode==='top') return activityFor(list).picks;")&&index.includes("if(mode==='top') return activityFor(list).picks;"));
check('slip addMany implemented',slip.includes('function addMany(items,defaultEngine)'));
check('slip addMany exported',slip.includes('return {btn, add, addMany, open, init, render,'));
check('delegated click ignores Acca button',slip.includes("closest('.slip-add[data-slipreg]')"));
for(const [name,src] of [['board',board],['index',index]]){
  check(`${name} Acca uses addMany`,src.includes("P2USlip.addMany(legs.map"));
  check(`${name} Acca opens slip`,src.includes("P2USlip.open==='function'"));
  check(`${name} Acca busy feedback`,src.includes("button.setAttribute('aria-busy','true')"));
}
for(const file of ['board.html','index.html','engines.html']){
  const html=read(file);const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,i=0,ok=true,detail='';
  while((m=re.exec(html))){i++;try{new Function(m[1])}catch(e){ok=false;detail=`inline ${i}: ${e.message}`;break}}
  check(`${file} inline scripts parse`,ok,detail);
}
const failed=checks.filter(x=>!x.ok);
const report={version,generatedAt:new Date().toISOString(),passed:checks.length-failed.length,failed:failed.length,checks};
fs.writeFileSync(path.join(root,'release-report-v218.json'),JSON.stringify(report,null,2));
if(failed.length){console.error(`${failed.length} checks failed`);process.exit(1)}
console.log(`${version} release self-test passed: ${checks.length} checks.`);
