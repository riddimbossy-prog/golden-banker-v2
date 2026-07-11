#!/usr/bin/env node
"use strict";
const path=require("path");
const {attachToDataFile}=require("./model-calibration");
try{
  const r=attachToDataFile(path.join(__dirname,"data.js"),{writeLedger:true});
  console.log(`Calibration attached: ${r.attached} market interval(s) across ${r.matches} match(es); ${r.groups} validated group(s).`);
}catch(e){
  console.error("attach-calibration:",e.message);
  process.exitCode=1;
}
