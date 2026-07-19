#!/usr/bin/env node
"use strict";
const fs=require('fs'),vm=require('vm');
const base=require('./banker-engine.js');
globalThis.P2U_ENGINE_REGISTRY=[...(base.P2U_ENGINE_REGISTRY||[])];
require('./multi-engine-suite.js');
const ext=require('./specialist-engines-v262.js');
const registry=globalThis.P2U_ENGINE_REGISTRY||[];
const checks={engineCount:registry.length,hasGG:registry.some(e=>e.key==='ggMachine'),hasMismatch:registry.some(e=>e.key==='mismatchEngine'),teamPage:fs.existsSync('team-rankings.html'),teamScript:fs.existsSync('team-rankings.js'),teamCss:fs.existsSync('team-rankings.css')};
let tested=0,errors=0,qualifiedGG=0,qualifiedMismatch=0;
if(fs.existsSync('data.js')){
  const sandbox={window:{},globalThis:{}};sandbox.globalThis=sandbox.window;
  try{vm.runInNewContext(fs.readFileSync('data.js','utf8'),sandbox,{timeout:8000});
    for(const m of (sandbox.window.MATCHES||[]).slice(0,300)){
      tested++;
      try{if(ext.ggMachineRecommend(m).bet)qualifiedGG++;}catch(_){errors++;}
      try{if(ext.mismatchEngineRecommend(m).bet)qualifiedMismatch++;}catch(_){errors++;}
    }
  }catch(e){errors++;}
}
const report={generatedAt:new Date().toISOString(),version:'v262',checks,testedFixtures:tested,runtimeErrors:errors,qualifiedGG,qualifiedMismatch,passed:checks.engineCount===22&&checks.hasGG&&checks.hasMismatch&&checks.teamPage&&checks.teamScript&&checks.teamCss&&errors===0};
fs.writeFileSync('VALIDATION_v262.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exit(1);
