#!/usr/bin/env node
'use strict';
const fs=require('fs');
const read=f=>fs.readFileSync(f,'utf8');
const manifest=JSON.parse(read('manifest.webmanifest'));
const checks=[
  ['build version is v207',read('BUILD_VERSION.txt').trim()==='v207'],
  ['PWA starts on Board',manifest.start_url==='./board.html?source=pwa'],
  ['standalone is first display override',Array.isArray(manifest.display_override)&&manifest.display_override[0]==='standalone'],
  ['window controls overlay removed',!manifest.display_override.includes('window-controls-overlay')],
  ['existing mobile install redirect present',read('index.html').includes("location.replace('./board.html?source=pwa')")],
  ['v207 responsive stylesheet exists',fs.existsSync('device-responsive-v207.css')],
  ['index loads v207 stylesheet',read('index.html').includes('device-responsive-v207.css')],
  ['board loads v207 stylesheet',read('board.html').includes('device-responsive-v207.css')],
  ['worker cache is v207',read('sw.js').includes("CACHE_VERSION='predict2u-v207'")],
  ['Board is in the core app shell',read('sw.js').includes("'./board.html'")]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed++;}
if(failed){console.error(`${failed} mobile launch checks failed.`);process.exit(1);}
console.log(`Mobile launch self-test passed: ${checks.length} checks.`);
