#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const checks=[];
function check(name,ok,detail=''){
  checks.push({name,ok:!!ok,detail});
  if(!ok) console.error(`FAIL: ${name}${detail?` — ${detail}`:''}`);
}

const board=read('board.html');
const index=read('index.html');
const full=read('engines.html');
const sw=read('sw.js');

for(const [name,src] of [['board',board],['index',index]]){
  check(`${name}: activity function`,src.includes('function activityFor(list)'));
  check(`${name}: top board uses all active picks`,src.includes("if(mode==='top') return activityFor(list).picks;"));
  check(`${name}: acca keeps consensus`,src.includes("if(mode==='acca') return consensus(list);"));
  check(`${name}: active counter`,src.includes("$('s-engines').textContent=`${active.length}/${TOTAL}`;"));
  check(`${name}: inactive pills excluded`,src.includes("activity.active.map(x=>[x.engine[0],x.engine[1]])"));
  check(`${name}: all-active label`,src.includes('All Active Engines'));
  check(`${name}: top board untruncated`,src.includes("const view=(mode==='top'||showAll)?rows:rows.slice(0,LIMIT);"));
  check(`${name}: no full-board redirect`,!src.includes("if(mode==='top'&&!showAll){ location.href='engines.html'"));
  check(`${name}: date recalculates pills`,src.includes('renderDates(); renderLeagues(); renderPills(); syncBoard(); renderStats();'));
  check(`${name}: active engine cards only`,src.includes("activity.active.map(({engine:[k,n,fnName,d],count:c})"));
}

check('full board: active helper',full.includes('function activeEngines()'));
check('full board: active filters only',full.includes("const efs=[['all','All active engines']].concat(active.map"));
check('full board: inactive selected engine resets',full.includes("if(engineF!=='all'&&!active.some(e=>e[0]===engineF)) engineF='all';"));
check('service worker v217',sw.includes("const VERSION='v217';")&&sw.includes("const CACHE_VERSION='predict2u-v217';"));

// Parse every inline script so release checks catch syntax errors.
for(const file of ['board.html','index.html','engines.html']){
  const html=read(file);
  const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match,count=0,ok=true,detail='';
  while((match=re.exec(html))){
    count++;
    try{new Function(match[1]);}catch(error){ok=false;detail=`inline script ${count}: ${error.message}`;break;}
  }
  check(`${file}: inline scripts parse`,ok,detail);
}

// Execute the actual activityFor function from board.html against synthetic data.
const extracted=board.match(/  function activityFor\(list\)\{([\s\S]*?)\n  \}\n\n  function picksFor\(\)/);
check('activity function extractable',Boolean(extracted));
if(extracted){
  try{
    const fnText=`function activityFor(list){${extracted[1]}\n  }`;
    const ENG=Array.from({length:16},(_,i)=>[`e${i+1}`,`Engine ${i+1}`,`engine${i+1}`,'']);
    const matches=Array.from({length:10},(_,i)=>({id:i+1,kickoff:`2026-07-13T${String(10+i).padStart(2,'0')}:00:00Z`}));
    const votes=new Map(matches.map(m=>[m.id,[
      {key:'e1',name:'Engine 1',bet:true,market:'Over 1.5 Goals',confidence:80,out:{bet:true,primary:'Over 1.5 Goals',banker:true,confidence:80}},
      ...(m.id===1?[{key:'e2',name:'Engine 2',bet:true,market:'Over 1.5 Goals',confidence:78,out:{bet:true,primary:'Over 1.5 Goals',banker:true,confidence:78}}]:[]),
      ...(m.id===2?[{key:'e3',name:'Engine 3',bet:true,market:'Home Win',confidence:70,out:{bet:true,primary:'Home Win',banker:false,confidence:70}}]:[])
    ]]));
    const intelFor=m=>({votes:votes.get(m.id)});
    const keyOf=m=>`f${m.id}`;
    const activity=(new Function('ENG','intelFor','keyOf',`return (${fnText});`))(ENG,intelFor,keyOf)(matches);
    check('synthetic active count is 3/16',activity.active.length===3,String(activity.active.length));
    check('all exact-market picks included',activity.picks.length===11,String(activity.picks.length));
    check('matching exact markets merge supporters',activity.picks.some(p=>p.m.id===1&&p.market==='Over 1.5 Goals'&&p.engines.length===2));
    check('inactive engines excluded',activity.active.every(x=>['e1','e2','e3'].includes(x.engine[0])));
  }catch(error){
    check('activity function executes',false,error.stack||error.message);
  }
}

const failed=checks.filter(x=>!x.ok);
const report={build:'v217',generated_at:new Date().toISOString(),passed:checks.length-failed.length,failed:failed.length,checks};
fs.writeFileSync(path.join(root,'active-engine-board-report-v217.json'),JSON.stringify(report,null,2));
if(failed.length){
  console.error(`${failed.length} active-engine board checks failed.`);
  process.exit(1);
}
console.log(`Active-engine board self-test passed: ${checks.length} checks.`);
