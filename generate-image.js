/* Predict2u — Daily branded image generator (SVG -> PNG).
   v3: * TOP 2 bankers from EACH of the 16 registered engines
      * matches never repeat — engines backing the same game merge into
        one card listing every engine + market
      * league country flags embedded (downloaded once, base64; country
        chip fallback so the pipeline never breaks)
      * refreshed modern dark design, larger type for email readability
   Writes today.svg / today.png / daily/<date>.png as before. */
const fs = require("fs");
const path = require("path");
const https = require("https");
const eng = require("./banker-engine.js");
const HERE = __dirname;

let logoDataUri = null;
try { logoDataUri = "data:image/png;base64," + fs.readFileSync(path.join(HERE,"icon-512.png")).toString("base64"); } catch(e){}

const dataTxt = fs.readFileSync(path.join(HERE, "data.js"), "utf8");
const mm = dataTxt.match(/window\.MATCHES\s*=\s*(\[[\s\S]*?\]);/);
const MATCHES = mm ? JSON.parse(mm[1]) : [];
const todayStr = new Date().toISOString().slice(0,10);
const todays = MATCHES.filter(x => (x.matchDate||"").slice(0,10) === todayStr);
const pool = todays.length ? todays : MATCHES;

function confNum(c){ return c==="High"?9:c==="Medium"?7:c==="Low"?5:(typeof c==="number"?c:0); }
function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function trunc(s,n){ s=String(s||""); return s.length>n? s.slice(0,n-1)+"\u2026": s; }
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
  const cache={}; let sharp=null; try{ sharp=require("sharp"); }catch(e){}
  for(const u of urls){
    if(!u || cache[u]!==undefined) continue;
    let dataUri=null; const buf=await fetchBuf(u);
    if(buf && sharp){ try{ const png=await sharp(buf).resize(56,40,{fit:"cover"}).png().toBuffer(); dataUri="data:image/png;base64,"+png.toString("base64"); }catch(e){} }
    cache[u]=dataUri;
  }
  return cache;
}


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

// ---- TOP 2 per registered engine ----
function top2Fn(fn){
  const picks=[];
  for(const mt of pool){
    let r;
    try{ r=fn(mt); }catch(_){ continue; }
    if(!r||!r.bet||!r.banker||!r.primary||r.primary==="No Bet") continue;
    const c=typeof r.confidence==="number"?r.confidence:confNum(r.confidence);
    picks.push({m:mt,market:r.primary,conf:c});
  }
  return picks.sort((a,b)=>b.conf-a.conf).slice(0,2);
}
const ENGINES=engineEntries().map(e=>[e.name,()=>top2Fn(e.fn)]);

(async ()=>{
  const rawPicks=[];
  for(const [name,fn] of ENGINES){
    let picks=[]; try{ picks=fn()||[]; }catch(e){}
    picks.forEach(p=>rawPicks.push({ engine:name, ...p }));
  }
  if(!rawPicks.length){ console.log("No banker picks today — no image."); process.exit(0); }

  // group by MATCH — a game never repeats; engines merge into one card
  const byMatch={}, groups=[];
  for(const p of rawPicks){
    const key=(p.m.home+"|"+p.m.away).toLowerCase();
    if(!byMatch[key]){ byMatch[key]={ m:p.m, lines:[] }; groups.push(byMatch[key]); }
    // engine+market dedupe inside the card too
    if(!byMatch[key].lines.some(l=>l.engine===p.engine&&l.market===p.market))
      byMatch[key].lines.push({ engine:p.engine, market:p.market, conf:p.conf });
  }
  groups.sort((a,b)=>b.lines.length-a.lines.length || Math.max(...b.lines.map(l=>l.conf))-Math.max(...a.lines.map(l=>l.conf)));

  const flagUrls=[...new Set(groups.map(g=>g.m.flag).filter(Boolean))];
  const flags=await buildFlagCache(flagUrls);
  console.log(`Flags: ${Object.values(flags).filter(Boolean).length}/${flagUrls.length} embedded.`);

  const FONT='Arial, DejaVu Sans, sans-serif';
  const W=1080, pad=64, cw=W-pad*2, lineH=48;
  const cardH=g=>110+g.lines.length*lineH+18;
  const dstr=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});

  // ---- 6 GAMES PER IMAGE (owner request) ----
  const PER=6, pages=Math.ceil(groups.length/PER);

  function buildPage(pageGroups, pageNo){
  const totalCardsH=pageGroups.reduce((s,g)=>s+cardH(g)+20,0);
  const H=330+totalCardsH+210;
  let cards=""; let y=330; let ci=(pageNo-1)*PER;
  for(const g of pageGroups){
    ci++;
    const ch=cardH(g); const combo=g.lines.length>1;
    cards+=`<rect x="${pad}" y="${y}" width="${cw}" height="${ch}" rx="22" fill="rgba(255,255,255,.035)" stroke="rgba(110,212,74,${combo?0.55:0.28})" stroke-width="${combo?2:1.5}"/>`;
    cards+=`<rect x="${pad}" y="${y}" width="6" height="${ch}" rx="3" fill="${combo?'#ffd54a':'#6fd44a'}"/>`;
    const fx=pad+30, fy=y+30, flagUri=flags[g.m.flag]||null;
    if(flagUri){
      cards+=`<clipPath id="tf${ci}"><rect x="${fx}" y="${fy}" width="56" height="40" rx="8"/></clipPath>`;
      cards+=`<image href="${flagUri}" x="${fx}" y="${fy}" width="56" height="40" clip-path="url(#tf${ci})"/>`;
      cards+=`<rect x="${fx}" y="${fy}" width="56" height="40" rx="8" fill="none" stroke="rgba(255,255,255,.25)"/>`;
    }else{
      const cc=String(g.m.country||'??').slice(0,3).toUpperCase();
      cards+=`<rect x="${fx}" y="${fy}" width="56" height="40" rx="8" fill="rgba(255,255,255,.08)"/>`;
      cards+=`<text x="${fx+28}" y="${fy+27}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="16" fill="#c7cedb">${esc(cc)}</text>`;
    }
    cards+=`<text x="${fx+76}" y="${y+56}" font-family="${FONT}" font-weight="bold" font-size="34" fill="#ffffff">${esc(trunc(g.m.home+" v "+g.m.away,32))}</text>`;
    cards+=`<text x="${fx+76}" y="${y+92}" font-family="${FONT}" font-size="21" fill="#8a93a6">${esc(trunc((g.m.country?g.m.country+' · ':'')+(g.m.league||''),40))}${combo?`  ·  ${g.lines.length} engine picks`:''}</text>`;
    let ly=y+110+32;
    for(const ln of g.lines){
      cards+=`<text x="${pad+36}" y="${ly}" font-family="${FONT}" font-weight="bold" font-size="20" fill="#6fd44a" letter-spacing="1">${esc(ln.engine.toUpperCase())}</text>`;
      const label=esc(ln.market); const lw=label.length*14+44; const px=pad+cw-lw-30;
      cards+=`<rect x="${px}" y="${ly-30}" width="${lw}" height="42" rx="21" fill="rgba(110,212,74,.15)" stroke="rgba(110,212,74,.5)"/>`;
      cards+=`<text x="${px+lw/2}" y="${ly-1}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="23" fill="#9be07a">${label}</text>`;
      ly+=lineH;
    }
    y+=ch+20;
  }

  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
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
  ${logoDataUri?`<image x="${pad}" y="52" width="88" height="88" href="${logoDataUri}"/>`:""}
  <text x="${logoDataUri?pad+106:pad}" y="112" font-family="${FONT}" font-weight="bold" font-size="58" fill="#ffffff">Predict<tspan fill="#6fd44a">2u</tspan></text>
  <text x="${logoDataUri?pad+108:pad+2}" y="146" font-family="${FONT}" font-weight="600" font-size="20" fill="#8a93a6" letter-spacing="2">KNOW THE GAME — PREDICT BETTER</text>
  <text x="${pad}" y="226" font-family="${FONT}" font-weight="bold" font-size="38" fill="#6fd44a">TODAY'S TOP BANKERS</text>
  <text x="${pad}" y="268" font-family="${FONT}" font-size="24" fill="#c7cedb">${esc(dstr)} · top 2 picks from all registered engines${pages>1?` · card ${pageNo} of ${pages}`:''}</text>
  ${cards}
  <rect x="${pad}" y="${y+8}" width="${cw}" height="66" rx="18" fill="rgba(110,212,74,.14)" stroke="rgba(110,212,74,.45)" stroke-width="1.5"/>
  <text x="${W/2}" y="${y+50}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="28" fill="#9be07a">Want more banker tips? Visit predict2u.com</text>
  <text x="${pad}" y="${y+116}" font-family="${FONT}" font-size="19" fill="#8a93a6">Heuristic picks, not guarantees. A banker fits our rules — not a sure win.</text>
  <text x="${pad}" y="${y+142}" font-family="${FONT}" font-size="19" fill="#8a93a6">Only stake what you can afford to lose. 18+ · Gamble responsibly · predict2u.com</text>
</svg>`;
  return svg;
  } // end buildPage

  let sharp=null; try{ sharp=require("sharp"); }catch(e){}
  try { fs.mkdirSync(path.join(HERE,"daily"),{recursive:true}); } catch(e){}
  for(let p=1;p<=pages;p++){
    const svg=buildPage(groups.slice((p-1)*PER,p*PER), p);
    fs.writeFileSync(path.join(HERE, p===1?"today.svg":`today-${p}.svg`), svg);
    if(!sharp){ if(p===1) console.log("sharp missing — SVGs only."); continue; }
    try{
      const buf=await sharp(Buffer.from(svg)).png().toBuffer();
      if(p===1){ fs.writeFileSync(path.join(HERE,"today.png"),buf);
                 fs.writeFileSync(path.join(HERE,"daily",`${todayStr}.png`),buf); }
      fs.writeFileSync(path.join(HERE,`today-${p}.png`),buf);
      if(p>1) fs.writeFileSync(path.join(HERE,"daily",`${todayStr}-${p}.png`),buf);
    }catch(e){ console.log(`PNG failed page ${p}:`,e.message); }
  }
  console.log(`Generated ${pages} top-bankers card image(s) of up to ${PER} games (${rawPicks.length} picks, ${groups.length} matches, top-2 per engine).`);
})();
