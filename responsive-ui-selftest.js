#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=__dirname;
const pages=fs.readdirSync(root).filter(name=>name.endsWith('.html')).sort();
const css=fs.readFileSync(path.join(root,'responsive-core.css'),'utf8');
const errors=[];
const checks=[];
const pass=(name,ok,detail='')=>{checks.push({name,ok,detail});if(!ok)errors.push(`${name}${detail?`: ${detail}`:''}`)};

pass('all root HTML pages discovered',pages.length>=20,String(pages.length));
for(const page of pages){
  const source=fs.readFileSync(path.join(root,page),'utf8');
  pass(`${page} loads responsive core`,/responsive-core\.css/.test(source));
  pass(`${page} uses safe viewport`,/name=["']viewport["'][^>]+viewport-fit=cover/i.test(source));
}
for(const token of [
  '@media (max-width:1024px)','@media (max-width:820px)','@media (max-width:599px)',
  '@media (max-width:380px)','@media (max-height:540px) and (orientation:landscape)',
  '@media (pointer:coarse)','100dvh','safe-area-inset-bottom','overflow-x:clip',
  'prefers-reduced-motion','prefers-contrast:more','horizontal-viewport-segments:2'
]) pass(`responsive token ${token}`,css.includes(token));
pass('responsive CSS remains lightweight',Buffer.byteLength(css)<=14000,`${Buffer.byteLength(css)} bytes`);
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
pass('service worker precaches responsive core',sw.includes("'./responsive-core.css'"));
pass('v203 cache active',/CACHE_VERSION='predict2u-v203'/.test(sw));

const report={version:'v203',generatedAt:new Date().toISOString(),pages:pages.length,passed:checks.filter(x=>x.ok).length,failed:errors.length,checks};
fs.writeFileSync(path.join(root,'responsive-ui-report.json'),JSON.stringify(report,null,2)+'\n');
if(errors.length){console.error(`Responsive UI self-test failed: ${errors.length} error(s).`);errors.forEach(x=>console.error('ERROR:',x));process.exit(1)}
console.log(`Responsive UI self-test passed: ${checks.length} checks across ${pages.length} pages.`);
