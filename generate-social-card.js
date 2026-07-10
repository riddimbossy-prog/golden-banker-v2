/* Predict2u — SOCIAL card generator (SVG -> PNG, 1080x1350, 4:5 feed-native).
   Built for Telegram/WhatsApp feeds: logo header always visible, giant type
   readable WITHOUT tapping, max 5 picks (consensus-first), honest footer.
   Writes: social-today.png   — today's top consensus picks
           social-results.png — yesterday's settled record, wins AND losses.
   Reuses the site brand: greens #6fd44a/#9be07a on deep dark #06090f. */
const fs = require("fs");
const path = require("path");
const eng = require("./banker-engine.js");
const HERE = __dirname;

let logo = null;
try { logo = "data:image/png;base64," + fs.readFileSync(path.join(HERE, "icon-512.png")).toString("base64"); } catch (e) {}

const dataTxt = fs.readFileSync(path.join(HERE, "data.js"), "utf8");
const mm = dataTxt.match(/window\.MATCHES\s*=\s*(\[[\s\S]*?\]);/);
const MATCHES = mm ? JSON.parse(mm[1]) : [];
const dstr = d => d.toISOString().slice(0, 10);
const TODAY = dstr(new Date()), YDAY = dstr(new Date(Date.now() - 86400000));
const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const trunc = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; };
const shortMk = mk => String(mk || "")
  .replace("Home Team Over 1.5 Goals","Home Over 1.5").replace("Away Team Over 1.5 Goals","Away Over 1.5")
  .replace("Home Team Under 1.5 Goals","Home Under 1.5").replace("Away Team Under 1.5 Goals","Away Under 1.5")
  .replace("Double Chance 1X","DC 1X").replace("Double Chance X2","DC X2").replace("Double Chance 12","DC 12")
  .replace("Home Win Either Half","Home Wins a Half").replace("Away Win Either Half","Away Wins a Half")
  .replace(/ Goals$/,"");

const W = 1080, H = 1350;
const G1 = "#6fd44a", G2 = "#9be07a", BG = "#06090f", PANEL = "#0b1a0c", MUT = "#8a93a6", TXT = "#ffffff";

function frame(title, sub, bodySvg, footerLine) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG}"/><stop offset="1" stop-color="#0b1408"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${G1}"/><stop offset="1" stop-color="#2c7a17"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="14" fill="url(#bar)"/>
  ${logo ? `<image x="64" y="58" width="110" height="110" href="${logo}"/>` : ""}
  <text x="196" y="112" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="900" fill="${TXT}">Predict<tspan fill="${G1}">2u</tspan></text>
  <text x="196" y="152" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="4" fill="${MUT}">KNOW THE GAME — PREDICT BETTER</text>
  <text x="64" y="256" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900" fill="${G1}">${esc(title)}</text>
  <text x="64" y="304" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="${MUT}">${esc(sub)}</text>
  ${bodySvg}
  <rect x="64" y="${H - 150}" width="${W - 128}" height="66" rx="14" fill="${PANEL}" stroke="${G1}" stroke-opacity=".5"/>
  <text x="${W / 2}" y="${H - 106}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="${G2}">${esc(footerLine)}</text>
  <text x="${W / 2}" y="${H - 42}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${MUT}">Heuristic picks, not guarantees · 18+ · Gamble responsibly</text>
</svg>`;
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

/* ---------- TODAY: consensus-first top 5 ---------- */
function todayCard() {
  const pool = MATCHES.filter(x => (x.matchDate || "").slice(0, 10) === TODAY);
  if (!pool.length) return null;
  const engines=engineEntries().map(e=>[e.name,e.fn]);
  const byMatch = {};
  for (const m of pool) for (const [name, fn] of engines) {
    let r; try { r = fn(m); } catch (e) { continue; }
    if (!r || !r.bet || !r.banker) continue;
    const k = m.home + "|" + m.away;
    byMatch[k] = byMatch[k] || { m, markets: {} };
    byMatch[k].markets[r.primary] = (byMatch[k].markets[r.primary] || 0) + 1;
  }
  const rows = Object.values(byMatch).map(x => {
    const [market, n] = Object.entries(x.markets).sort((a, b) => b[1] - a[1])[0];
    return { m: x.m, market, n };
  }).sort((a, b) => b.n - a.n).slice(0, 5);
  if (!rows.length) return null;
  let y = 360, body = "";
  for (const r of rows) {
    body += `<rect x="64" y="${y}" width="${W - 128}" height="128" rx="18" fill="${PANEL}" stroke="#1c2a1a"/>
    <rect x="64" y="${y}" width="8" height="128" rx="4" fill="${G1}"/>
    <text x="100" y="${y + 52}" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="${TXT}">${esc(trunc(r.m.home, 20))} <tspan fill="${G1}">v</tspan> ${esc(trunc(r.m.away, 20))}</text>
    <text x="100" y="${y + 96}" font-family="Arial, Helvetica, sans-serif" font-size="25" fill="${MUT}">${esc(trunc(r.m.league || "", 34))} · ${r.n} engine${r.n > 1 ? "s" : ""} agree</text>
    <rect x="${W - 356}" y="${y + 38}" width="252" height="54" rx="27" fill="#12240f" stroke="${G1}"/>
    <text x="${W - 230}" y="${y + 74}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="800" fill="${G2}">${esc(trunc(shortMk(r.market), 18))}</text>`;
    y += 152;
  }
  const d = new Date();
  return frame("TODAY'S TOP BANKERS", `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · strongest engine consensus`, body, "Full board free at predict2u.com");
}

/* ---------- RESULTS: yesterday's honest record ---------- */
function resultsCard() {
  let log = { picks: [] };
  try { log = JSON.parse(fs.readFileSync(path.join(HERE, "track-log.json"), "utf8")); } catch (e) {}
  const settled = (log.picks || []).filter(p => (p.matchDate || "").slice(0, 10) === YDAY && (p.result === "Won" || p.result === "Lost"));
  if (!settled.length) return null;
  const w = settled.filter(p => p.result === "Won").length, l = settled.length - w;
  const pct = Math.round(100 * w / (w + l));
  let body = `
  <text x="${W / 2}" y="530" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="170" font-weight="900" fill="${G1}">${w}W – ${l}L</text>
  <text x="${W / 2}" y="620" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="800" fill="${TXT}">${pct}% hit rate</text>
  <text x="${W / 2}" y="676" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="${MUT}">every settled pick counted — wins and losses</text>`;
  // up to 4 sample results, wins first
  const sample = [...settled].sort((a, b) => (a.result === "Won" ? -1 : 1)).slice(0, 4);
  let y = 740;
  for (const p of sample) {
    const won = p.result === "Won";
    body += `<rect x="64" y="${y}" width="${W - 128}" height="96" rx="16" fill="${PANEL}" stroke="#1c2a1a"/>
    <text x="100" y="${y + 42}" font-family="Arial, Helvetica, sans-serif" font-size="29" font-weight="700" fill="${TXT}">${esc(trunc(p.home, 18))} v ${esc(trunc(p.away, 18))}</text>
    <text x="100" y="${y + 76}" font-family="Arial, Helvetica, sans-serif" font-size="23" fill="${MUT}">${esc(trunc(shortMk(p.market), 26))}${p.score ? " · " + esc(p.score) : ""}</text>
    <rect x="${W - 260}" y="${y + 24}" width="156" height="48" rx="24" fill="${won ? "#12240f" : "#240f0f"}" stroke="${won ? G1 : "#d44a4a"}"/>
    <text x="${W - 182}" y="${y + 57}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="${won ? G2 : "#e07a7a"}">${won ? "WON" : "LOST"}</text>`;
    y += 112;
  }
  return frame("YESTERDAY'S RESULTS", `${YDAY} · posted in full, the honest way`, body, "Track the full record at predict2u.com");
}

(async () => {
  let sharp = null; try { sharp = require("sharp"); } catch (e) { console.log("sharp unavailable — SVG only"); }
  const jobs = [["social-today", todayCard()], ["social-results", resultsCard()]];
  for (const [name, svg] of jobs) {
    if (!svg) { console.log(name + ": nothing to render (honest skip)"); try { fs.unlinkSync(path.join(HERE, name + ".png")); } catch (e) {} continue; }
    fs.writeFileSync(path.join(HERE, name + ".svg"), svg);
    if (sharp) {
      const buf = await sharp(Buffer.from(svg)).png().toBuffer();
      fs.writeFileSync(path.join(HERE, name + ".png"), buf);
      console.log(name + ".png written");
    }
  }
})();
