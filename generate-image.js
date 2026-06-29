/* Predict2u — Daily branded image generator (SVG -> PNG).
   Reads data.js, finds the SINGLE strongest pick from each engine, builds a
   branded SVG card and converts it to PNG with sharp (today.png + dated copy). */
const fs = require("fs");
const path = require("path");
const eng = require("./banker-engine.js");

const HERE = __dirname;
const dataTxt = fs.readFileSync(path.join(HERE, "data.js"), "utf8");
const m = dataTxt.match(/window\.MATCHES\s*=\s*(\[[\s\S]*?\]);/);
const MATCHES = m ? JSON.parse(m[1]) : [];

const todayStr = new Date().toISOString().slice(0,10);
const todays = MATCHES.filter(x => (x.matchDate||"").slice(0,10) === todayStr);
const pool = todays.length ? todays : MATCHES;

function confNum(c){ return c==="High"?9:c==="Medium"?7:c==="Low"?5:(typeof c==="number"?c:0); }
function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function trunc(s,n){ s=String(s||""); return s.length>n? s.slice(0,n-1)+"\u2026": s; }

function strongestNormal(){
  const res = eng.analyseAll(pool).results.filter(r=>r.banker);
  res.sort((a,b)=>(b.rankWeight||0)-(a.rankWeight||0));
  const r=res[0]; return r && { home:r.match.home, away:r.match.away, league:r.match.league, market:r.primary, conf:confNum(r.confidence) };
}
function strongestStrict(){
  const {results}=eng.analyseStrict(pool); let b=null,bc=-1;
  for(const s of results){ if(s.bet&&s.confidence>bc){bc=s.confidence; b={home:s.match.home,away:s.match.away,league:s.match.league,market:s.market,conf:s.confidence};} }
  return b;
}
function strongestFn(fn){
  let best=null, bestc=-1;
  for(const mt of pool){ let r; try{ r=fn(mt); }catch(e){ continue; } if(!r||!r.bet) continue;
    const c = typeof r.confidence==="number"? r.confidence : confNum(r.confidence);
    if(c>bestc){ bestc=c; best={ home:mt.home, away:mt.away, league:mt.league, market:(r.market||r.primary), conf:c }; } }
  return best;
}

const picks = [
  { engine:"Normal", pick: strongestNormal() },
  { engine:"Strict", pick: strongestStrict() },
  { engine:"Ultra",  pick: strongestFn(eng.ultraRecommend) },
  { engine:"Elite",  pick: strongestFn(eng.rulesProRecommend) },
  { engine:"Apex",   pick: strongestFn(eng.apexRecommend) },
];

const W=1080, H=1350, pad=70, cw=W-pad*2, cardH=176;
const dstr = new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});

let cards=""; let y=336;
for(const {engine,pick} of picks){
  cards += `<rect x="${pad}" y="${y}" width="${cw}" height="${cardH}" rx="22" fill="rgba(255,255,255,0.04)" stroke="rgba(76,175,39,0.28)" stroke-width="2"/>`;
  cards += `<text x="${pad+34}" y="${y+44}" font-family="Arial,sans-serif" font-weight="bold" font-size="24" fill="#4CAF27">${engine.toUpperCase()} BANKER</text>`;
  if(pick){
    cards += `<text x="${pad+34}" y="${y+96}" font-family="Arial,sans-serif" font-weight="bold" font-size="40" fill="#ffffff">${esc(trunc(pick.home,20)+" v "+trunc(pick.away,20))}</text>`;
    cards += `<text x="${pad+34}" y="${y+140}" font-family="Arial,sans-serif" font-size="24" fill="#8a93a6">${esc(trunc(pick.league,40))}</text>`;
    const label=esc(pick.market); const lw=label.length*18+48; const px=pad+cw-lw-34;
    cards += `<rect x="${px}" y="${y+58}" width="${lw}" height="54" rx="14" fill="rgba(76,175,39,0.18)"/>`;
    cards += `<text x="${px+24}" y="${y+93}" font-family="Arial,sans-serif" font-weight="bold" font-size="30" fill="#7ee05a">${label}</text>`;
    cards += `<text x="${px+24}" y="${y+138}" font-family="Arial,sans-serif" font-weight="600" font-size="22" fill="#8a93a6">conf ${pick.conf}/10</text>`;
  } else {
    cards += `<text x="${pad+34}" y="${y+104}" font-family="Arial,sans-serif" font-style="italic" font-size="30" fill="#8a93a6">No qualifying pick today</text>`;
  }
  y += cardH+20;
}

const disclaimer = "Heuristic picks, not guarantees. A banker fits our rules - not a sure win. Only stake what you can afford to lose. 18+ - Gamble responsibly - predict2u.com";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4CAF27" stop-opacity="0.14"/><stop offset="0.4" stop-color="#0a0e17" stop-opacity="0"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="#0a0e17"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="${pad}" y="124" font-family="Arial,sans-serif" font-weight="bold" font-size="64" fill="#ffffff">Predict<tspan fill="#4CAF27">2u</tspan></text>
  <text x="${pad+2}" y="162" font-family="Arial,sans-serif" font-weight="600" font-size="22" fill="#8a93a6">KNOW THE GAME - PREDICT BETTER</text>
  <text x="${pad}" y="244" font-family="Arial,sans-serif" font-weight="bold" font-size="36" fill="#4CAF27">TODAY'S TOP BANKERS</text>
  <text x="${pad}" y="288" font-family="Arial,sans-serif" font-weight="500" font-size="26" fill="#c7cedb">${esc(dstr)}</text>
  ${cards}
  <text x="${pad}" y="${y+24}" font-family="Arial,sans-serif" font-size="19" fill="#8a93a6">Heuristic picks, not guarantees. A banker fits our rules - not a sure win.</text>
  <text x="${pad}" y="${y+50}" font-family="Arial,sans-serif" font-size="19" fill="#8a93a6">Only stake what you can afford to lose. 18+ - Gamble responsibly - predict2u.com</text>
</svg>`;

fs.writeFileSync(path.join(HERE,"today.svg"), svg);

(async () => {
  try {
    const sharp = require("sharp");
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    fs.writeFileSync(path.join(HERE,"today.png"), buf);
    try { fs.mkdirSync(path.join(HERE,"daily"),{recursive:true}); } catch(e){}
    fs.writeFileSync(path.join(HERE,"daily",`${todayStr}.png`), buf);
    console.log("Generated today.png + daily/"+todayStr+".png ("+picks.filter(p=>p.pick).length+" picks)");
  } catch(e){
    console.log("PNG conversion failed ("+e.message+"); today.svg still written.");
  }
})();
