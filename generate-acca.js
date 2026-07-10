/* ============================================================
   generate-acca.js — TODAY'S BANKERS ACCA images.
   v2: * splits legs into PAGES OF 6 (acca.png = page 1, plus
        acca-1.png, acca-2.png, ... for every page) so email
        images stay large and readable
      * one appearance per match (deduped before paging)
      * league country FLAG on every leg (downloaded once per
        country, rasterized, embedded; falls back to a country
        chip if the flag can't be fetched — never breaks)
      * consults all 16 registered engines
      * refreshed modern card design
   ============================================================ */
const fs = require("fs");
const path = require("path");
const https = require("https");
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

function confNum(c){
  if(typeof c==="number") return c>10 ? c/10 : c;
  return c==="High"?9:c==="Medium"?7:c==="Low"?5:0;
}

// ---- flag fetch + embed (base64 PNG data URIs, cached per URL) ----
function fetchBuf(url, timeoutMs){
  return new Promise((resolve)=>{
    try{
      const req=https.get(url,{timeout:timeoutMs||4000},res=>{
        if(res.statusCode!==200){ res.resume(); return resolve(null); }
        const chunks=[]; res.on("data",c=>chunks.push(c));
        res.on("end",()=>resolve(Buffer.concat(chunks)));
      });
      req.on("timeout",()=>{ req.destroy(); resolve(null); });
      req.on("error",()=>resolve(null));
    }catch(e){ resolve(null); }
  });
}
async function buildFlagCache(urls){
  const cache={};
  let sharp=null; try{ sharp=require("sharp"); }catch(e){}
  for(const u of urls){
    if(!u || cache[u]!==undefined) continue;
    let dataUri=null;
    const buf=await fetchBuf(u);
    if(buf && sharp){
      try{
        const png=await sharp(buf).resize(56,40,{fit:"cover"}).png().toBuffer();
        dataUri="data:image/png;base64,"+png.toString("base64");
      }catch(e){ dataUri=null; }
    }
    cache[u]=dataUri; // null = fallback chip
  }
  return cache;
}

function estOdd(market, m){
  const o=m.odds||{};
  const mk=String(market||"").replace(/ Goals$/,"");
  const realMap={
    "Home Win":o.home,"Away Win":o.away,"Draw":o.draw,
    "Over 1.5":o.over15,"Over 2.5":o.over25,"Over 3.5":o.over35,
    "Under 1.5":o.under15,"Under 2.5":o.under25,"Under 3.5":o.under35,
    "BTTS Yes":o.bttsYes,"BTTS No":o.bttsNo,
    "Double Chance 1X":o.dc1x,"Double Chance 12":o.dc12,"Double Chance X2":o.dcx2,
    "First Half Over 0.5":o.fhOver05,"First Half Under 1.5":o.fhUnder15
  };
  const real=realMap[mk];
  if(typeof real==="number"&&real>1) return {odd:real,est:false};
  const fallback={
    "Over 1.5":1.30,"Under 3.5":1.35,"Over 2.5":1.90,"Under 2.5":1.85,
    "BTTS Yes":1.85,"BTTS No":1.80,"Double Chance 1X":1.30,
    "Double Chance X2":1.45,"Home DNB":1.55,"Away DNB":1.95,
    "Home Team Over 0.5":1.30,"Away Team Over 0.5":1.35,
    "Home Team Under 1.5":1.55,"Away Team Under 1.5":1.55
  };
  return {odd:fallback[mk]||1.50,est:true};
}
function noStandings(m){ const np=(m.homePos==null&&m.awayPos==null); const l=String(m.league||'').toLowerCase(); return np||l.includes('friendl'); }

function accaLegs(matches){
  const per={};
  function add(m,market,enginez,conf){
    if(!market||market==='No Bet'||market==='Skip')return;
    const k=(String(m.home)+'|'+String(m.away)).toLowerCase(); // one entry per MATCH — no repeats
    if(!per[k])per[k]={m,picks:[],engines:new Set()};
    per[k].picks.push({market,conf:conf||7}); per[k].engines.add(enginez);
  }
  matches.forEach(m=>{
    for(const e of engineEntries()){
      try{
        const r=e.fn(m);
        if(r&&r.banker&&r.primary&&r.primary!=="No Bet"){
          add(m,r.primary,e.name,confNum(r.confidence));
        }
      }catch(_){}
    }
  });
  return Object.values(per).map(g=>{
    const byMarket={};
    for(const p of g.picks){
      const x=byMarket[p.market]||(byMarket[p.market]={market:p.market,confs:[],engines:new Set()});
      x.confs.push(p.conf);
      x.engines.add(p.engine);
    }
    const best=Object.values(byMarket).sort((a,b)=>{
      const ac=a.engines.size, bc=b.engines.size;
      const aa=a.confs.reduce((x,y)=>x+y,0)/a.confs.length;
      const ba=b.confs.reduce((x,y)=>x+y,0)/b.confs.length;
      return bc-ac || ba-aa;
    })[0];
    const avg=best.confs.reduce((x,y)=>x+y,0)/best.confs.length;
    const nEng=best.engines.size;
    const rating=Math.min(10,Math.round((avg+(nEng-1)*0.30)*10)/10);
    const eo=estOdd(best.market,g.m);
    return {m:g.m,market:best.market,rating,nEng,odd:eo.odd,est:eo.est};
  }).filter(l=>l.rating>=8 && !noStandings(l.m));
}
function isUpcoming(mt){
  const played=mt.homeGoals!=null&&mt.awayGoals!=null;
  const live=mt.status&&['1H','2H','HT','ET','LIVE','P'].includes(mt.status);
  const ko=mt.kickoff?new Date(mt.kickoff).getTime():null; const koF=ko!=null?ko>Date.now():true;
  return !played&&!live&&koF;
}

const FONT='Arial, DejaVu Sans, sans-serif';
function legRow(l, i, y, pad, cw, flagUri){
  const rh=104; let s='';
  s+=`<rect x="${pad}" y="${y}" width="${cw}" height="${rh}" rx="20" fill="rgba(255,255,255,.035)" stroke="rgba(110,212,74,.30)" stroke-width="1.5"/>`;
  s+=`<rect x="${pad}" y="${y}" width="6" height="${rh}" rx="3" fill="#6fd44a"/>`;
  // number chip
  s+=`<circle cx="${pad+46}" cy="${y+rh/2}" r="20" fill="rgba(110,212,74,.15)" stroke="rgba(110,212,74,.5)"/>`;
  s+=`<text x="${pad+46}" y="${y+rh/2+7}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="20" fill="#9be07a">${i}</text>`;
  // flag or country chip
  const fx=pad+84, fy=y+rh/2-20;
  if(flagUri){
    s+=`<clipPath id="f${i}${y}"><rect x="${fx}" y="${fy}" width="56" height="40" rx="8"/></clipPath>`;
    s+=`<image href="${flagUri}" x="${fx}" y="${fy}" width="56" height="40" clip-path="url(#f${i}${y})"/>`;
    s+=`<rect x="${fx}" y="${fy}" width="56" height="40" rx="8" fill="none" stroke="rgba(255,255,255,.25)"/>`;
  }else{
    const cc=String(l.m.country||'??').slice(0,3).toUpperCase();
    s+=`<rect x="${fx}" y="${fy}" width="56" height="40" rx="8" fill="rgba(255,255,255,.08)"/>`;
    s+=`<text x="${fx+28}" y="${fy+27}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="16" fill="#c7cedb">${esc(cc)}</text>`;
  }
  // teams + league
  s+=`<text x="${fx+76}" y="${y+42}" font-family="${FONT}" font-weight="bold" font-size="27" fill="#ffffff">${esc(trunc(l.m.home+"  v  "+l.m.away,30))}</text>`;
  s+=`<text x="${fx+76}" y="${y+74}" font-family="${FONT}" font-size="18" fill="#8a93a6">${esc(trunc((l.m.country?l.m.country+" · ":"")+(l.m.league||""),34))} · ${l.nEng} eng · ${l.rating}/10</text>`;
  // market pill + odd
  const label=esc(l.market); const lw=label.length*13.5+40; const px=pad+cw-lw-26;
  s+=`<rect x="${px}" y="${y+18}" width="${lw}" height="40" rx="20" fill="rgba(110,212,74,.16)" stroke="rgba(110,212,74,.55)"/>`;
  s+=`<text x="${px+lw/2}" y="${y+45}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="21" fill="#9be07a">${label}</text>`;
  s+=`<text x="${px+lw/2}" y="${y+84}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="19" fill="${l.est?'#e0a458':'#c7cedb'}">@ ${l.odd.toFixed(2)}${l.est?' est':''}</text>`;
  return s;
}

function pageSVG(legs, pageNo, pages, dstr, logo, flags, totals){
  const W=1080, pad=64, cw=W-pad*2, rh=104, gap=16;
  const H=340 + legs.length*(rh+gap) + 170;
  let cards=""; let y=340;
  legs.forEach((l,idx)=>{ cards+=legRow(l, (pageNo-1)*6+idx+1, y, pad, cw, flags[l.m.flag]||null); y+=rh+gap; });
  let pageOdds=1; legs.forEach(l=>pageOdds*=l.odd);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1a0c"/><stop offset=".5" stop-color="#06090f"/><stop offset="1" stop-color="#0a0e17"/>
    </linearGradient>
    <linearGradient id="hd" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6fd44a"/><stop offset="1" stop-color="#2c7a17"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="url(#hd)"/>
  ${logo?`<image href="${logo}" x="${pad}" y="44" width="84" height="84"/>`:""}
  <text x="${pad+(logo?102:0)}" y="94" font-family="${FONT}" font-weight="bold" font-size="50" fill="#ffffff">Predict<tspan fill="#6fd44a">2u</tspan></text>
  <text x="${pad+(logo?104:2)}" y="126" font-family="${FONT}" font-weight="bold" font-size="18" fill="#8a93a6" letter-spacing="3">TODAY'S BANKERS ACCA</text>
  <text x="${W-pad}" y="94" text-anchor="end" font-family="${FONT}" font-weight="bold" font-size="26" fill="#6fd44a">${esc(dstr)}</text>
  <text x="${W-pad}" y="126" text-anchor="end" font-family="${FONT}" font-size="20" fill="#8a93a6">Slip ${pageNo} of ${pages}</text>
  <rect x="${pad}" y="168" width="${cw}" height="110" rx="22" fill="rgba(110,212,74,.08)" stroke="rgba(110,212,74,.35)" stroke-width="1.5"/>
  <text x="${pad+30}" y="214" font-family="${FONT}" font-weight="bold" font-size="34" fill="#ffffff">${legs.length} legs on this slip · ~${pageOdds.toFixed(2)} odds</text>
  <text x="${pad+30}" y="252" font-family="${FONT}" font-size="21" fill="#c7cedb">Full acca: ${totals.legs} legs · ~${totals.odds.toFixed(2)} odds · ~${totals.pct}% chance all land · high risk</text>
  ${cards}
  <text x="${W/2}" y="${H-96}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="26" fill="#9be07a">Full board at predict2u.com</text>
  <text x="${W/2}" y="${H-56}" text-anchor="middle" font-family="${FONT}" font-size="18" fill="#5a6478">Accumulator — every leg must win. High risk. Not a guarantee. 18+. Gamble responsibly.</text>
</svg>`;
}

(async function main(){
  let matches; try{ matches=loadMatches(); }catch(e){ console.log("no data.js:",e.message); process.exit(0); }
  let legs=accaLegs(matches).filter(l=>isUpcoming(l.m)).sort((a,b)=>b.rating-a.rating);
  if(!legs.length){ console.log("No qualifying acca legs today — no acca image."); process.exit(0); }
  // HARD CAP: an acca email should be a curated slip, not the whole board.
  // Keep only the TOP-rated legs (3 slips of 6 max). Everything else lives on the site.
  const MAX_LEGS=18;
  if(legs.length>MAX_LEGS){ console.log(`Capping acca: ${legs.length} qualifying legs -> top ${MAX_LEGS}.`); legs=legs.slice(0,MAX_LEGS); }

  let combinedOdds=1, combinedProb=1;
  legs.forEach(l=>{ combinedOdds*=l.odd; combinedProb*=Math.min(0.97,(1/l.odd)*1.05); });
  const totals={legs:legs.length, odds:combinedOdds, pct:Math.round(combinedProb*100)};

  const flagUrls=[...new Set(legs.map(l=>l.m.flag).filter(Boolean))];
  const flags=await buildFlagCache(flagUrls);
  const flagOk=Object.values(flags).filter(Boolean).length;
  console.log(`Flags: ${flagOk}/${flagUrls.length} embedded (fallback chips for the rest).`);

  const dstr=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  let logo=""; try{ const b=fs.readFileSync(path.join(HERE,"icon-512.png")); logo=`data:image/png;base64,${b.toString("base64")}`; }catch(e){}

  const PER=6, pages=Math.ceil(legs.length/PER);
  let sharp=null; try{ sharp=require("sharp"); }catch(e){}
  for(let p=1;p<=pages;p++){
    const slice=legs.slice((p-1)*PER, p*PER);
    const svg=pageSVG(slice, p, pages, dstr, logo, flags, totals);
    const svgName=p===1?"acca.svg":`acca-${p}.svg`;
    fs.writeFileSync(path.join(HERE,svgName),svg);
    if(sharp){
      try{
        const buf=await sharp(Buffer.from(svg)).png().toBuffer();
        // acca.png stays page 1 (backward compatible); every page also gets acca-N.png
        if(p===1) fs.writeFileSync(path.join(HERE,"acca.png"),buf);
        fs.writeFileSync(path.join(HERE,`acca-${p}.png`),buf);
      }catch(e){ console.log(`PNG failed page ${p}:`,e.message); }
    }
  }
  console.log(`Acca: ${legs.length} legs over ${pages} slip image(s) of up to ${PER}, ~${combinedOdds.toFixed(2)} total odds, ~${totals.pct}% chance.`);
})();
