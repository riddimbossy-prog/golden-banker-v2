#!/usr/bin/env node
'use strict';
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const checks=[];
const check=(name,ok,detail='')=>{checks.push({name,ok:!!ok,detail});if(!ok)console.error(`FAIL: ${name}${detail?` — ${detail}`:''}`);};
const slip=read('slip.js');
const board=read('board.html');
const index=read('index.html');
check('bulk API is exported',/return \{btn, add, addMany, open, init, render,/.test(slip));
check('single-pick delegate only captures registered buttons',slip.includes("closest('.slip-add[data-slipreg]')"));
check('board Acca uses addMany',board.includes('P2USlip.addMany')&&board.includes('P2USlip.open'));
check('landing Acca uses addMany',index.includes('P2USlip.addMany')&&index.includes('P2USlip.open'));
check('Acca button is not a registered single-pick button',!/<button id="acca-add"[^>]*data-slipreg/.test(board));

// Execute the shared module without mounting the visual drawer. This confirms
// that bulk addition writes all unique fixtures and preserves one-pick-per-match.
const source=slip.replace(/if\(document\.body\) P2USlip\.init\(\); else document\.addEventListener\('DOMContentLoaded', P2USlip\.init\);?\s*$/,'');
const storage=new Map();
const body={appendChild(){}};
const document={
  body:null,
  head:{appendChild(){}},
  getElementById(){return null;},
  createElement(){return {style:{},classList:{add(){},remove(){}},setAttribute(){},appendChild(){},querySelector(){return null;}};},
  addEventListener(){}
};
const sandbox={
  console,
  document,
  window:{MATCHES:[],dispatchEvent(){},addEventListener(){},matchMedia(){return {matches:false};}},
  localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail;},
  setTimeout(){return 1;},clearTimeout(){},Date,Math,JSON,String,Number,Array,Object,
  settle(){return '';}
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'slip.js'});
document.body=body;
const result=vm.runInContext(`P2USlip.addMany([
  {m:{id:101,home:'Alpha',away:'Beta',league:'Test',matchDate:'2026-07-13',odds:{over15:1.25}},market:'Over 1.5',engine:'consensus'},
  {m:{id:102,home:'Gamma',away:'Delta',league:'Test',matchDate:'2026-07-13',odds:{over15:1.30}},market:'Over 1.5',engine:'consensus'},
  {m:{id:103,home:'Epsilon',away:'Zeta',league:'Test',matchDate:'2026-07-13',odds:{over15:1.35}},market:'Over 1.5',engine:'consensus'}
],'consensus')`,sandbox);
check('three Acca legs are added together',result.added===3,String(result.added));
check('slip contains three legs',vm.runInContext('P2USlip.legs.length',sandbox)===3);
const duplicate=vm.runInContext(`P2USlip.addMany([{m:{id:101,home:'Alpha',away:'Beta'},market:'Home Win'}],'consensus')`,sandbox);
check('existing fixture is skipped',duplicate.added===0&&duplicate.duplicates===1,JSON.stringify(duplicate));
check('bulk add persists once to local storage',JSON.parse(storage.get('p2u_slip_v1')||'[]').length===3);
const failed=checks.filter(c=>!c.ok);
const report={build:'v217',generated_at:new Date().toISOString(),passed:checks.length-failed.length,failed:failed.length,checks};
fs.writeFileSync(path.join(root,'acca-add-all-report-v217.json'),JSON.stringify(report,null,2));
if(failed.length){console.error(`${failed.length} of ${checks.length} Acca add-all checks failed.`);process.exit(1);}
console.log(`Acca add-all self-test passed: ${checks.length} checks.`);
