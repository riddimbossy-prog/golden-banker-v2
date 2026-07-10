/* ============================================================
   generate-results.js — NEXT-DAY RESULTS + ACCA summary.
   Reads data.js, finds YESTERDAY's banker picks across all engines, settles
   each (Won/Lost) using the same settle() logic, and builds a branded results
   image (today-results.png) you can post + that gets emailed. Also builds the
   day's Bankers Acca summary (strong consensus legs).
   Honest by design: shows BOTH wins and losses.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const eng = require("./banker-engine.js");
const HERE = __dirname;

function loadMatches(){
  const raw = fs.readFileSync(path.join(HERE,"data.js"),"utf8");
  const m = raw.match(/window\.MATCHES\s*=\s*([\s\S]*?);\s*$/m);
  if(!m) throw new Error("no MATCHES");
  return JSON.parse(m[1]);
}
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function engineEntries(){
  const reg = Array.isArray(eng.P2U_ENGINE_REGISTRY) && eng.P2U_ENGINE_REGISTRY.length
    ? eng.P2U_ENGINE_REGISTRY
    : [
        {name:"Normal",fn:"recommend"},{name:"Strict",fn:"strictRecommend"},
        {name:"Ultra",fn:"ultraRecommend"},{name:"Elite",fn:"eliteRecommend"},
        {name:"Apex",fn:"apexRecommend"},{name:"Prime",fn:"primeRecommend"},
        {name:"Expert",fn:"expertRecommend"},{name:"Pro",fn:"proRecommend"},
        {name:"Trend",fn:"trendRecommend"},{name:"Streaks",fn:"streakRecommend"},
        {name:"Mismatch",fn:"mismatchRecommend"},{name:"Halves",fn:"halvesRecommend"},
        {name:"League Bias",fn:"leagueBiasRecommend"},{name:"Momentum",fn:"momentumRecommend"},
        {name:"Odds Intelligence",fn:"oddsIntelligenceRecommend"},{name:"Value",fn:"valueRecommend"}
      ];
  return reg
    .map(e=>({ name:e.name, key:e.key||null, family:e.family||null, version:e.version||null, fn:eng[e.fn] }))
    .filter(e=>typeof e.fn==="function");
}

function trunc(s,n){ s=String(s||""); return s.length>n? s.slice(0,n-1)+"…":s; }

// gather every registered engine's banker pick for a match
function bankersFor(m){
  const out=[];
  for(const e of engineEntries()){
    try{
      const r=e.fn(m);
      if(r&&r.banker&&r.primary&&r.primary!=="No Bet"){
        out.push({engine:e.name,market:r.primary,confidence:r.confidence});
      }
    }catch(_){}
  }
  return out;
}

(function main(){
  let matches; try{ matches=loadMatches(); }catch(e){ console.log("no data.js:",e.message); process.exit(0); }

  // YESTERDAY in UTC
  const y=new Date(); y.setUTCDate(y.getUTCDate()-1);
  const yStr=y.toISOString().slice(0,10);

  // finished matches from yesterday that had at least one banker
  const rows=[];
  for(const m of matches){
    if(m.matchDate!==yStr) continue;
    if(m.homeGoals==null||m.awayGoals==null) continue; // not settled
    const bankers=bankersFor(m);
    if(!bankers.length) continue;
    // collapse to the strongest/agreed market per match (most common market)
    const tally={};
    bankers.forEach(b=>{ tally[b.market]=(tally[b.market]||0); tally[b.market]++; });
    const market=Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
    const result=eng.settle(market,m.homeGoals,m.awayGoals,m.status,m);
    if(!result||result==="Void") continue;
    rows.push({ home:m.home, away:m.away, league:m.league, country:m.country,
      score:`${m.homeGoals}-${m.awayGoals}`, market, result, nEng:tally[market] });
  }

  if(!rows.length){ console.log(`No settled banker picks for ${yStr} — no results image.`); process.exit(0); }

  rows.sort((a,b)=> (a.result==="Won"?0:1)-(b.result==="Won"?0:1)); // wins first
  const won=rows.filter(r=>r.result==="Won").length;
  const lost=rows.filter(r=>r.result==="Lost").length;
  const rate=Math.round(won/(won+lost)*100);

  // build SVG
  const W=1080, pad=70, cw=W-pad*2, rowH=92;
  const H = 300 + rows.length*(rowH+16) + 160;
  const dstr = y.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  let logo=""; try{ const b=fs.readFileSync(path.join(HERE,"icon-512.png")); logo=`data:image/png;base64,${b.toString("base64")}`; }catch(e){}

  let cards=""; let yy=300;
  for(const r of rows){
    const win=r.result==="Won";
    const col = win? "#4CAF27":"#c0392b";
    const bg = win? "rgba(76,175,39,.12)":"rgba(192,57,49,.12)";
    cards += `<rect x="${pad}" y="${yy}" width="${cw}" height="${rowH}" rx="16" fill="${bg}" stroke="${col}" stroke-width="2"/>`;
    cards += `<text x="${pad+28}" y="${yy+38}" font-family="Arial,sans-serif" font-weight="bold" font-size="30" fill="#ffffff">${esc(trunc(r.home+" v "+r.away,32))}</text>`;
    cards += `<text x="${pad+28}" y="${yy+70}" font-family="Arial,sans-serif" font-size="20" fill="#8a93a6">${esc(trunc((r.country?r.country+" · ":"")+r.league,34))} · ${r.score}</text>`;
    cards += `<rect x="${pad+cw-260}" y="${yy+22}" width="150" height="48" rx="12" fill="rgba(255,255,255,.06)"/>`;
    cards += `<text x="${pad+cw-185}" y="${yy+54}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="22" fill="#cfd6e4">${esc(r.market)}</text>`;
    cards += `<rect x="${pad+cw-95}" y="${yy+22}" width="95" height="48" rx="12" fill="${col}"/>`;
    cards += `<text x="${pad+cw-47}" y="${yy+54}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="22" fill="#ffffff">${r.result.toUpperCase()}</text>`;
    yy += rowH+16;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#0a0e17"/>
    ${logo?`<image href="${logo}" x="${pad}" y="40" width="96" height="96"/>`:""}
    <text x="${pad+(logo?116:0)}" y="92" font-family="Arial,sans-serif" font-weight="bold" font-size="52" fill="#ffffff">Predict<tspan fill="#4CAF27">2u</tspan></text>
    <text x="${pad+(logo?116:0)}" y="124" font-family="Arial,sans-serif" font-weight="bold" font-size="20" fill="#8a93a6" letter-spacing="2">YESTERDAY'S RESULTS</text>
    <text x="${pad}" y="190" font-family="Arial,sans-serif" font-weight="bold" font-size="34" fill="#4CAF27">${dstr}</text>
    <text x="${pad}" y="232" font-family="Arial,sans-serif" font-size="26" fill="#cfd6e4">${won} won · ${lost} lost · ${rate}% strike rate</text>
    ${cards}
    <text x="${W/2}" y="${H-70}" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#7ee05a">We post every result — win or lose. predict2u.com</text>
    <text x="${pad}" y="${H-30}" font-family="Arial,sans-serif" font-size="18" fill="#5a6478">Heuristic picks, not guarantees. 18+ - Gamble responsibly.</text>
  </svg>`;

  fs.writeFileSync(path.join(HERE,"results.svg"), svg);
  (async()=>{
    try{
      const sharp=require("sharp");
      const buf=await sharp(Buffer.from(svg)).png().toBuffer();
      fs.writeFileSync(path.join(HERE,"results.png"), buf);
      try{ fs.mkdirSync(path.join(HERE,"results"),{recursive:true}); fs.writeFileSync(path.join(HERE,"results",`${yStr}.png`), buf); }catch(e){}
      console.log(`Results image: ${won} won, ${lost} lost (${rate}%) for ${yStr}.`);
    }catch(e){ console.log("PNG conversion failed:", e.message, "(results.svg still written)"); }
  })();
})();
