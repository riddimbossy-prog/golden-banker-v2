/* ============================================================
   generate-acca.js — TODAY'S BANKERS ACCA image (acca.png).
   Mirrors the site's acca: strongest banker per match across all engines,
   rated by engine-agreement + average confidence, keeping only UPCOMING,
   real-league (no friendlies/table-less) legs rated >= 8. Builds a branded
   image attached to the daily email. Shows honest combined odds + chance.
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
function trunc(s,n){ s=String(s||""); return s.length>n? s.slice(0,n-1)+"…":s; }
function confNum(c){ return c==='High'?8:c==='Medium'?7:c==='Low'?5:(typeof c==='number'?c:0); }

// estimate an odd for a market (rough — non-Win markets have no real odds)
function estOdd(market, m){
  const o=m.odds;
  if(market==="Home Win"&&o&&o.home) return {odd:o.home,est:false};
  if(market==="Away Win"&&o&&o.away) return {odd:o.away,est:false};
  const map={"Over 1.5":1.30,"Under 3.5":1.35,"Over 2.5":1.90,"Under 2.5":1.85,"BTTS Yes":1.85,"BTTS No":1.80,"Double Chance 1X":1.30,"Double Chance X2":1.45,"Home DNB":1.55,"Away DNB":1.95};
  return {odd:map[market]||1.50, est:true};
}
function noStandings(m){ const np=(m.homePos==null&&m.awayPos==null); const l=String(m.league||'').toLowerCase(); return np||l.includes('friendl'); }

function accaLegs(matches){
  const per={};
  function add(m,market,enginez,conf){
    if(!market||market==='No Bet'||market==='Skip')return;
    const k=(String(m.home)+'|'+String(m.away)).toLowerCase();
    if(!per[k])per[k]={m,picks:[],engines:new Set()};
    per[k].picks.push({market,conf:conf||7}); per[k].engines.add(enginez);
  }
  matches.forEach(m=>{
    try{ eng.analyseAll([m]).results.filter(r=>r.banker).forEach(r=>add(m,r.primary,'Normal',confNum(r.confidence))); }catch(e){}
    try{ eng.analyseStrict([m]).results.filter(r=>r.bet).forEach(r=>add(m,r.market,'Strict',r.confidence)); }catch(e){}
    [["Ultra",eng.ultraRecommend],["Elite",eng.rulesProRecommend],["Apex",eng.apexRecommend],["Prime",eng.primeRecommend],["Value",eng.valueRecommend],["Pro",eng.proRecommend]].forEach(([n,fn])=>{
      try{ const r=fn(m); if(r.banker) add(m,r.primary,n,r.confidence); }catch(e){}
    });
  });
  return Object.values(per).map(g=>{
    const best=g.picks.slice().sort((a,b)=>b.conf-a.conf)[0];
    const avg=g.picks.reduce((s,p)=>s+p.conf,0)/g.picks.length;
    const nEng=g.engines.size;
    const rating=Math.min(10, Math.round((avg+(nEng-1)*0.6)*10)/10);
    const eo=estOdd(best.market,g.m);
    return { m:g.m, market:best.market, rating, nEng, odd:eo.odd, est:eo.est };
  }).filter(l=>l.rating>=8 && !noStandings(l.m));
}
function isUpcoming(mt){
  const played=mt.homeGoals!=null&&mt.awayGoals!=null;
  const live=mt.status&&['1H','2H','HT','ET','LIVE','P'].includes(mt.status);
  const ko=mt.kickoff?new Date(mt.kickoff).getTime():null; const koF=ko!=null?ko>Date.now():true;
  return !played&&!live&&koF;
}

(function main(){
  let matches; try{ matches=loadMatches(); }catch(e){ console.log("no data.js:",e.message); process.exit(0); }
  const legs=accaLegs(matches).filter(l=>isUpcoming(l.m)).sort((a,b)=>b.rating-a.rating);
  if(!legs.length){ console.log("No qualifying acca legs today — no acca image."); process.exit(0); }

  let combinedOdds=1, combinedProb=1;
  legs.forEach(l=>{ combinedOdds*=l.odd; combinedProb*=Math.min(0.97,(1/l.odd)*1.05); });
  const pct=Math.round(combinedProb*100);

  const W=1080, pad=70, cw=W-pad*2, rowH=88;
  const H=320 + legs.length*(rowH+14) + 150;
  const dstr=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  let logo=""; try{ const b=fs.readFileSync(path.join(HERE,"icon-512.png")); logo=`data:image/png;base64,${b.toString("base64")}`; }catch(e){}

  let cards=""; let yy=320;
  legs.forEach((l,i)=>{
    cards+=`<rect x="${pad}" y="${yy}" width="${cw}" height="${rowH}" rx="16" fill="rgba(76,175,39,.07)" stroke="rgba(76,175,39,.35)" stroke-width="2"/>`;
    cards+=`<text x="${pad+24}" y="${yy+36}" font-family="Arial,sans-serif" font-weight="bold" font-size="20" fill="#8a93a6">${i+1}</text>`;
    cards+=`<text x="${pad+60}" y="${yy+36}" font-family="Arial,sans-serif" font-weight="bold" font-size="28" fill="#ffffff">${esc(trunc(l.m.home+" v "+l.m.away,30))}</text>`;
    cards+=`<text x="${pad+60}" y="${yy+66}" font-family="Arial,sans-serif" font-size="19" fill="#8a93a6">${esc(trunc((l.m.country?l.m.country+" · ":"")+(l.m.league||""),32))} · ${l.nEng} engines · rated ${l.rating}/10</text>`;
    const lw=l.market.length*15+40; const px=pad+cw-lw-28;
    cards+=`<rect x="${px}" y="${yy+24}" width="${lw}" height="44" rx="12" fill="rgba(76,175,39,.18)"/>`;
    cards+=`<text x="${px+20}" y="${yy+53}" font-family="Arial,sans-serif" font-weight="bold" font-size="24" fill="#7ee05a">${esc(l.market)}</text>`;
    yy+=rowH+14;
  });

  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#0a0e17"/>
    ${logo?`<image href="${logo}" x="${pad}" y="40" width="96" height="96"/>`:""}
    <text x="${pad+(logo?116:0)}" y="92" font-family="Arial,sans-serif" font-weight="bold" font-size="52" fill="#ffffff">Predict<tspan fill="#4CAF27">2u</tspan></text>
    <text x="${pad+(logo?116:0)}" y="124" font-family="Arial,sans-serif" font-weight="bold" font-size="20" fill="#8a93a6" letter-spacing="2">TODAY'S BANKERS ACCA</text>
    <text x="${pad}" y="190" font-family="Arial,sans-serif" font-weight="bold" font-size="32" fill="#4CAF27">${dstr}</text>
    <text x="${pad}" y="240" font-family="Arial,sans-serif" font-weight="bold" font-size="40" fill="#ffffff">${legs.length}-leg acca · ~${combinedOdds.toFixed(2)} odds</text>
    <text x="${pad}" y="278" font-family="Arial,sans-serif" font-size="24" fill="${pct>=25?'#7ee05a':'#e0a458'}">~${pct}% chance all legs land · high risk</text>
    ${cards}
    <text x="${W/2}" y="${H-60}" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#7ee05a">Full board at predict2u.com</text>
    <text x="${pad}" y="${H-28}" font-family="Arial,sans-serif" font-size="18" fill="#5a6478">Accumulator — every leg must win. High risk. Not a guarantee. 18+.</text>
  </svg>`;

  fs.writeFileSync(path.join(HERE,"acca.svg"),svg);
  (async()=>{
    try{
      const sharp=require("sharp");
      const buf=await sharp(Buffer.from(svg)).png().toBuffer();
      fs.writeFileSync(path.join(HERE,"acca.png"),buf);
      console.log(`Acca image: ${legs.length} legs, ~${combinedOdds.toFixed(2)} odds, ~${pct}% chance.`);
    }catch(e){ console.log("PNG conversion failed:",e.message); }
  })();
})();
