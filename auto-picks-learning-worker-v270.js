/* Predict2U v270 — private Auto Picks learning supervisor.
   Detailed profile/rule performance stays in Supabase and a private workflow artifact.
   Only a compact public summary and hashed guard decisions are written to the website. */
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const crypto=require('crypto');
const ROOT=__dirname;
const MODEL_VERSION='Auto Profile v1.1';
const BUILD='v270';
const DRY=process.env.DRY_RUN==='1'||process.argv.includes('--dry-run');
const SUPA_URL=process.env.SUPABASE_URL||'';
const SECRET=process.env.SUPABASE_SECRET_KEY||'';
function loadPolicy(){try{const raw=process.env.AUTO_LEARNING_POLICY_B64||'';if(!raw)return null;return JSON.parse(Buffer.from(raw,'base64').toString('utf8'));}catch(_){return null;}}
const POLICY=loadPolicy();
const PRIVATE_REPORT=process.env.PRIVATE_REPORT_PATH||path.join(ROOT,'.private','auto-picks-learning-report-v270.json');
const PUBLIC_JSON=path.join(ROOT,'auto-picks-learning-public-v270.json');
const GUARD_JS=path.join(ROOT,'auto-picks-learning-guard-v270.js');

function loadMatches(){
  const file=fs.existsSync(path.join(ROOT,'current-data.js'))?'current-data.js':'data.js';
  const sandbox={window:{},console};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),sandbox,{filename:file});
  return Array.isArray(sandbox.window.MATCHES)?JSON.parse(JSON.stringify(sandbox.window.MATCHES)):[];
}
function headlessSelections(matches){
  const sandbox={window:{MATCHES:matches,P2U_HEADLESS_AUTO_V270:true},location:{search:'',href:'https://predict2u.com/team-rankings.html'},URLSearchParams,URL,console,Date,Set,Map,Math,Number,String,Object,Array,RegExp,JSON};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(ROOT,'team-rankings.js'),'utf8'),sandbox,{filename:'team-rankings.js'});
  const api=sandbox.window.P2UAutoHeadlessV270;if(!api||typeof api.automaticSelections!=='function')throw new Error('Headless auto-pick export is unavailable.');
  return JSON.parse(JSON.stringify(api.automaticSelections()));
}
function fixtureKey(m){return m&&m.id!=null?`f${m.id}`:`${m.home}|${m.away}|${String(m.matchDate||m.kickoff||'').slice(0,10)}`;}
function oddsBand(v){const n=Number(v);if(!Number.isFinite(n))return 'na';if(n<1.30)return 'a';if(n<1.45)return 'b';if(n<1.60)return 'c';if(n<1.81)return 'd';return 'e';}
function fnv(value){let h=0x811c9dc5;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,'0');}
function signature(row){return fnv([row.homeTrait,row.awayTrait,row.primary.market,row.m.league||'',oddsBand(row.primary.odds)].join('|').toLowerCase());}
function settleMarket(row){const m=row.m,market=String(row.primary.market||'');if(market===`${m.home} to win`)return'Home Win';if(market===`${m.away} to win`)return'Away Win';if(market===`${m.home} or Draw`)return'Double Chance 1X';if(market===`Draw or ${m.away}`)return'Double Chance X2';if(market==='No Draw — 12')return'Double Chance 12';if(market==='Both Teams to Score — Yes')return'BTTS Yes';if(market==='Both Teams to Score — No')return'BTTS No';return market;}
function pickPayload(row){const m=row.m;return{fixture_key:fixtureKey(m),fixture_id:m.id==null?null:String(m.id),model_version:MODEL_VERSION,match_date:String(m.matchDate||m.kickoff||'').slice(0,10)||null,kickoff:m.kickoff||null,league:m.league||'',home_team:m.home||'',away_team:m.away||'',home_profile:row.homeTrait,away_profile:row.awayTrait,market:row.primary.market,settle_market:settleMarket(row),odds:Number(row.primary.odds)||null,model_strength:Number(row.primary.score)||null,signature_hash:signature(row),status:'open',context:{sample:row.sample,margin:row.margin}};}
function matchIndex(matches){const map=new Map();for(const m of matches)map.set(fixtureKey(m),m);return map;}
const H=()=>({'apikey':SECRET,'Authorization':`Bearer ${SECRET}`,'Content-Type':'application/json'});
async function sb(method,route,body,prefer){const r=await fetch(`${SUPA_URL}/rest/v1/${route}`,{method,headers:{...H(),...(prefer?{'Prefer':prefer}:{})},body:body==null?undefined:JSON.stringify(body)});if(!r.ok)throw new Error(`${method} ${route} -> ${r.status} ${await r.text()}`);if(r.status===204)return null;const t=await r.text();return t?JSON.parse(t):null;}
async function upsertPicks(picks){if(!picks.length)return;await sb('POST','auto_pick_snapshots?on_conflict=fixture_key,model_version',picks,'resolution=ignore-duplicates,return=minimal');}
async function patchById(id,body){await sb('PATCH',`auto_pick_snapshots?id=eq.${encodeURIComponent(id)}`,body,'return=minimal');}
function settleOne(m,market){if(!m||m.homeGoals==null||m.awayGoals==null)return'';const status=String(m.status||'');if(['PST','CANC','ABD','SUSP','INT'].includes(status))return'Void';const eng=require('./banker-engine.js');return eng.settle(market,m.homeGoals,m.awayGoals,status,m)||'';}
function buildGuard(settled){
  const groups=new Map();
  for(const r of settled){
    if(r.result==='Void'||!r.signature_hash)continue;
    const g=groups.get(r.signature_hash)||{hash:r.signature_hash,wins:0,losses:0,total:0};
    g.total++;if(r.result==='Won')g.wins++;else if(r.result==='Lost')g.losses++;groups.set(r.signature_hash,g);
  }
  const entries={},privateGroups=[];
  for(const g of groups.values()){
    let s='s',d=0,score=null;
    if(POLICY){
      score=(g.wins+Number(POLICY.pw))/(g.total+Number(POLICY.ps));
      if(g.total>=Number(POLICY.mb)&&score<Number(POLICY.bb)){s='b';d=-99;}
      else if(g.total>=Number(POLICY.mw)&&score<Number(POLICY.wb)){s='w';d=Number(POLICY.wd);}
      else if(g.total>=Number(POLICY.mp)&&score>Number(POLICY.ba)){s='p';d=Number(POLICY.bd);}
      entries[g.hash]={s,d};
    }
    privateGroups.push({...g,score:score===null?null:Number(score.toFixed(4)),decision:s,delta:d});
  }
  return{entries,privateGroups,policyLoaded:!!POLICY};
}
function publicSummary(settled){const decided=settled.filter(r=>r.result==='Won'||r.result==='Lost'),wins=decided.filter(r=>r.result==='Won').length,losses=decided.filter(r=>r.result==='Lost').length,voids=settled.filter(r=>r.result==='Void').length;return{schema:1,build:BUILD,modelVersion:MODEL_VERSION,generatedAt:new Date().toISOString(),status:decided.length>=50?'stable':decided.length>=20?'active':'monitoring',settled:decided.length,wins,losses,voids,recent:settled.slice(0,8).map(r=>({fixtureKey:r.fixture_key,home:r.home_team,away:r.away_team,market:r.market,result:r.result,score:r.home_goals==null?'':`${r.home_goals}-${r.away_goals}`,date:r.match_date}))};}
function writeOutputs(summary,guard,privateData){fs.writeFileSync(PUBLIC_JSON,JSON.stringify(summary,null,2)+'\n');fs.writeFileSync(GUARD_JS,`/* Auto-generated by the private learning workflow. Public file contains only hashed guard decisions. */\nwindow.P2U_AUTO_LEARNING_GUARD_V270=${JSON.stringify({schema:1,modelVersion:MODEL_VERSION,generatedAt:summary.generatedAt,entries:guard.entries})};\n`);fs.mkdirSync(path.dirname(PRIVATE_REPORT),{recursive:true});fs.writeFileSync(PRIVATE_REPORT,JSON.stringify(privateData,null,2)+'\n');}

(async()=>{
  const matches=loadMatches();const rows=headlessSelections(matches);const picks=rows.map(pickPayload);console.log(`Loaded ${matches.length} matches and generated ${picks.length} current auto pick(s).`);
  if((!SUPA_URL||!SECRET)&&!DRY)throw new Error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY. Apply the v270 SQL migration and configure the existing Supabase secrets.');
  let settled=[];
  if(SUPA_URL&&SECRET){
    if(!DRY)await upsertPicks(picks);
    const open=await sb('GET','auto_pick_snapshots?status=eq.open&select=*');const index=matchIndex(matches);
    for(const r of open||[]){const m=index.get(r.fixture_key);const result=settleOne(m,r.settle_market);if(!result)continue;const body={result,status:result==='Void'?'void':'settled',home_goals:m.homeGoals,away_goals:m.awayGoals,settled_at:new Date().toISOString()};if(!DRY)await patchById(r.id,body);Object.assign(r,body);}
    settled=await sb('GET','auto_pick_snapshots?status=in.(settled,void)&select=*&order=settled_at.desc&limit=5000')||[];
    if(DRY)settled=[...(settled||[]),...(open||[]).filter(x=>x.result)];
  }
  const guard=buildGuard(settled);const summary=publicSummary(settled);const privateData={generatedAt:summary.generatedAt,modelVersion:MODEL_VERSION,policyLoaded:guard.policyLoaded,currentPickCount:picks.length,settledCount:settled.length,groups:guard.privateGroups,currentPicks:picks};
  writeOutputs(summary,guard,privateData);console.log(`Public learning status written: ${summary.settled} settled, ${Object.keys(guard.entries).length} hashed guard entries, private policy ${guard.policyLoaded?'loaded':'not loaded'}.`);
})().catch(e=>{console.error(`Auto Picks learning worker failed: ${e.message}`);process.exit(1);});
