const fs=require("fs");
const path=require("path");
const file=path.join(__dirname,"config.txt");
let raw=process.argv.slice(2).join(" ");
const token=raw.replace(/['"*]/g,"").replace(/[^A-Za-z0-9\-]/g,"");
if(!token){console.log("No token detected. Run set-key.bat again and paste your token.");process.exit(1);}

let old="";
try{old=fs.readFileSync(file,"utf8");}catch(_){}
const defaults={
  SEASON:"2026",
  LEAGUES:"1,2,3,39,140,135,78,61,88,94,144,203,71,128,253,307",
  DAYS_BACK:"1",DAYS_FWD:"3",ODDS:"true",H2H:"true",STATS:"true",
  SOT_LOOKBACK:"8",SOT_CALL_BUDGET:"120",SOT_SLEEP_MS:"250"
};
const values={...defaults};
for(const line of old.split(/\r?\n/)){
  const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
  if(m&&m[1].toUpperCase()!=="API_KEY")values[m[1].toUpperCase()]=m[2];
}
values.API_KEY=token;

const order=[
  "API_KEY","STATS_API_KEY","SEASON","LEAGUES","DAYS_BACK","DAYS_FWD",
  "ODDS","H2H","STATS","SOT_LOOKBACK","SOT_CALL_BUDGET","SOT_SLEEP_MS",
  "MAX_LEAGUES","REQUEST_BUDGET","MAX_PROBES","SLEEP_MS"
];
const lines=[
  "# ============================================================",
  "# PREDICT2U CONFIG",
  "# API keys are local/GitHub Secrets. Never commit config.txt.",
  "# ============================================================",
  ""
];
for(const k of order){
  if(values[k]!=null&&String(values[k]).trim()!=="")lines.push(`${k}=${values[k]}`);
}
for(const [k,v] of Object.entries(values)){
  if(!order.includes(k)&&v!=null&&String(v).trim()!=="")lines.push(`${k}=${v}`);
}
fs.writeFileSync(file,lines.join("\n")+"\n","utf8");
console.log(`Saved config.txt. API token ${token.length<=8?token:token.slice(0,4)+"…"+token.slice(-4)}; preserved ${Object.keys(values).length-1} other setting(s).`);
