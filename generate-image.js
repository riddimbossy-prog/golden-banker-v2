/* Predict2u — Daily branded image generator (SVG -> PNG).
   Reads data.js, finds the SINGLE strongest pick from each engine, builds a
   branded SVG card and converts it to PNG with sharp (today.png + dated copy). */
const fs = require("fs");
const path = require("path");
const eng = require("./banker-engine.js");

const HERE = __dirname;

// Load the real logo (icon-512.png) as base64 for embedding. Falls back to
// text-only branding if the file can't be read, so the pipeline never breaks.
let logoDataUri = null;
try {
  const logoBuf = fs.readFileSync(path.join(HERE, "icon-512.png"));
  logoDataUri = "data:image/png;base64," + logoBuf.toString("base64");
} catch(e) { logoDataUri = null; }

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
  const r=res[0]; return r && { home:r.match.home, away:r.match.away, league:r.match.league, country:r.match.country, market:r.primary, conf:confNum(r.confidence) };
}
function strongestStrict(){
  const {results}=eng.analyseStrict(pool); let b=null,bc=-1;
  for(const s of results){ if(s.bet&&s.confidence>bc){bc=s.confidence; b={home:s.match.home,away:s.match.away,league:s.match.league,country:s.match.country,market:s.market,conf:s.confidence};} }
  return b;
}
function strongestFn(fn){
  let best=null, bestc=-1;
  for(const mt of pool){ let r; try{ r=fn(mt); }catch(e){ continue; } if(!r||!r.bet) continue;
    const c = typeof r.confidence==="number"? r.confidence : confNum(r.confidence);
    if(c>bestc){ bestc=c; best={ home:mt.home, away:mt.away, league:mt.league, country:mt.country, market:(r.market||r.primary), conf:c }; } }
  return best;
}

const rawPicks = [
  { engine:"Normal", pick: strongestNormal() },
  { engine:"Strict", pick: strongestStrict() },
  { engine:"Ultra",  pick: strongestFn(eng.ultraRecommend) },
  { engine:"Elite",  pick: strongestFn(eng.rulesProRecommend) },
  { engine:"Apex",   pick: strongestFn(eng.apexRecommend) },
  { engine:"Prime",  pick: strongestFn(eng.primeRecommend) },
  { engine:"Value",  pick: strongestFn(eng.valueRecommend) },
].filter(p=>p.pick);

// Group by match: same game from multiple engines combos into one card.
const groups = [];
const byMatch = {};
for(const {engine,pick} of rawPicks){
  const key = (pick.home+"|"+pick.away).toLowerCase();
  if(!byMatch[key]){ byMatch[key]={ home:pick.home, away:pick.away, league:pick.league, country:pick.country, lines:[] }; groups.push(byMatch[key]); }
  byMatch[key].lines.push({ engine, market:pick.market, conf:pick.conf });
}

const W=1080, pad=70, cw=W-pad*2, lineH=46;
// each card height depends on how many engine-lines it has
function cardHeightFor(g){ return 96 + g.lines.length*lineH + 24; }
const totalCardsH = groups.reduce((s,g)=>s+cardHeightFor(g)+20, 0);
const H = 336 + totalCardsH + 200;
const dstr = new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});

let cards=""; let y=336;
for(const g of groups){
  const ch = cardHeightFor(g);
  const combo = g.lines.length>1;
  cards += `<rect x="${pad}" y="${y}" width="${cw}" height="${ch}" rx="22" fill="rgba(255,255,255,0.04)" stroke="rgba(76,175,39,${combo?0.5:0.28})" stroke-width="2"/>`;
  // match title
  const matchLine = trunc(g.home+" v "+g.away, 34);
  cards += `<text x="${pad+34}" y="${y+50}" font-family="Arial,sans-serif" font-weight="bold" font-size="38" fill="#ffffff">${esc(matchLine)}</text>`;
  cards += `<text x="${pad+34}" y="${y+84}" font-family="Arial,sans-serif" font-size="22" fill="#8a93a6">${esc(trunc((g.country?g.country+' · ':'')+g.league,40))}${combo?`  ·  ${g.lines.length} engines agree`:''}</text>`;
  // engine lines
  let ly = y+96+30;
  for(const ln of g.lines){
    cards += `<text x="${pad+34}" y="${ly}" font-family="Arial,sans-serif" font-weight="bold" font-size="20" fill="#4CAF27">${ln.engine.toUpperCase()}</text>`;
    const label=esc(ln.market); const lw=label.length*17+44; const px=pad+cw-lw-34;
    cards += `<rect x="${px}" y="${ly-30}" width="${lw}" height="44" rx="12" fill="rgba(76,175,39,0.18)"/>`;
    cards += `<text x="${px+22}" y="${ly}" font-family="Arial,sans-serif" font-weight="bold" font-size="26" fill="#7ee05a">${label}</text>`;
    ly += lineH;
  }
  y += ch+20;
}

const disclaimer = "Heuristic picks, not guarantees. A banker fits our rules - not a sure win. Only stake what you can afford to lose. 18+ - Gamble responsibly - predict2u.com";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4CAF27" stop-opacity="0.14"/><stop offset="0.4" stop-color="#0a0e17" stop-opacity="0"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="#0a0e17"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${logoDataUri ? `<image x="${pad}" y="56" width="92" height="92" href="${logoDataUri}"/>` : ""}
  <text x="${logoDataUri ? pad+108 : pad}" y="124" font-family="Arial,sans-serif" font-weight="bold" font-size="64" fill="#ffffff">Predict<tspan fill="#4CAF27">2u</tspan></text>
  <text x="${logoDataUri ? pad+110 : pad+2}" y="162" font-family="Arial,sans-serif" font-weight="600" font-size="22" fill="#8a93a6">KNOW THE GAME - PREDICT BETTER</text>
  <text x="${pad}" y="244" font-family="Arial,sans-serif" font-weight="bold" font-size="36" fill="#4CAF27">TODAY'S TOP BANKERS</text>
  <text x="${pad}" y="288" font-family="Arial,sans-serif" font-weight="500" font-size="26" fill="#c7cedb">${esc(dstr)}</text>
  ${cards}
  <rect x="${pad}" y="${y+8}" width="${cw}" height="64" rx="16" fill="rgba(76,175,39,0.16)" stroke="rgba(76,175,39,0.45)" stroke-width="2"/>
  <text x="${W/2}" y="${y+48}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="30" fill="#7ee05a">Want more banker tips? Visit predict2u.com</text>
  <text x="${pad}" y="${y+110}" font-family="Arial,sans-serif" font-size="19" fill="#8a93a6">Heuristic picks, not guarantees. A banker fits our rules - not a sure win.</text>
  <text x="${pad}" y="${y+136}" font-family="Arial,sans-serif" font-size="19" fill="#8a93a6">Only stake what you can afford to lose. 18+ - Gamble responsibly - predict2u.com</text>
</svg>`;

fs.writeFileSync(path.join(HERE,"today.svg"), svg);

(async () => {
  try {
    const sharp = require("sharp");
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    fs.writeFileSync(path.join(HERE,"today.png"), buf);
    try { fs.mkdirSync(path.join(HERE,"daily"),{recursive:true}); } catch(e){}
    fs.writeFileSync(path.join(HERE,"daily",`${todayStr}.png`), buf);
    console.log("Generated today.png + daily/"+todayStr+".png ("+rawPicks.length+" picks, "+groups.length+" cards)");
  } catch(e){
    console.log("PNG conversion failed ("+e.message+"); today.svg still written.");
  }
})();
