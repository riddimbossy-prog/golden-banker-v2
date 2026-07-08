/* ============================================================
   POST-SOCIAL — Telegram channel automation for Predict2u
   ------------------------------------------------------------
   Runs daily at 00:50 UTC (after the email workflows commit the
   fresh today*.png / results.png). Posts up to three messages:
     1. YESTERDAY'S RESULTS — honest W-L record with results.png.
        Wins AND losses, always. Skipped only if nothing settled.
     2. TODAY'S PICKS — teaser caption with today.png. Skipped
        honestly when the board has no bankers.
     3. SUNDAYS ONLY — 7-day record recap (text post).
   Captions are also written to social-captions.txt so the same
   text can be copy-forwarded to the WhatsApp Channel in seconds.
   Secrets required: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
   DRY_RUN=1 prints everything instead of posting (safe testing).
   ============================================================ */
const fs = require("fs");
const path = require("path");
const HERE = __dirname;

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT  = process.env.TELEGRAM_CHAT_ID || "";
const DRY   = process.env.DRY_RUN === "1" || !TOKEN || !CHAT;

const SITE = "predict2u.com";
const RG   = "18+ | Bet responsibly. Never stake what you can't afford to lose.";

/* ---------- load the settled-pick ledger ---------- */
let log = { picks: [] };
try { log = JSON.parse(fs.readFileSync(path.join(HERE, "track-log.json"), "utf8")); } catch (e) {}
const picks = Array.isArray(log.picks) ? log.picks : [];

const dstr = d => d.toISOString().slice(0, 10);
const today = new Date();
const yesterday = new Date(today.getTime() - 86400000);
const TODAY = dstr(today), YDAY = dstr(yesterday);

const settledOn = date => picks.filter(p =>
  (p.matchDate || "").slice(0, 10) === date &&
  (p.result === "Won" || p.result === "Lost"));

const record = list => {
  const w = list.filter(p => p.result === "Won").length;
  const l = list.filter(p => p.result === "Lost").length;
  return { w, l, n: w + l, pct: w + l ? Math.round(100 * w / (w + l)) : 0 };
};

/* ---------- captions ---------- */
const esc = t => String(t); // Telegram plain-text captions — no parse_mode, nothing to escape
const messages = []; // { photo: filename|null, caption }

// 1) RESULTS — the honesty-first post. Losses are never hidden.
const yr = record(settledOn(YDAY));
if (yr.n > 0) {
  const tone = yr.pct >= 70 ? "Strong board." : yr.pct >= 50 ? "Mixed board — posted anyway. Every result counts here." : "Rough board. We post the losses too — that's the whole point.";
  messages.push({
    photo: ["social-results.png","results.png"].find(f => fs.existsSync(path.join(HERE, f))) || null,
    caption: `YESTERDAY'S RESULTS — ${YDAY}\n\n${yr.w} WON  •  ${yr.l} LOST  (${yr.pct}%)\n${tone}\n\nFull settled board, every engine: ${SITE}\n\n${RG}`
  });
}

// 2) TODAY'S PICKS — teaser, drive to the site.
const todaysPicks = picks.filter(p => (p.matchDate || "").slice(0, 10) === TODAY);
const todayImg = ["social-today.png", "today.png", "today-1.png"].find(f => fs.existsSync(path.join(HERE, f)));
if (todaysPicks.length && todayImg) {
  const markets = {};
  todaysPicks.forEach(p => { if (p.market) markets[p.market] = (markets[p.market] || 0) + 1; });
  const top = Object.entries(markets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m).join(", ");
  const engines = new Set(todaysPicks.map(p => p.engine)).size;
  messages.push({
    photo: todayImg,
    caption: `TODAY'S BANKERS — ${TODAY}\n\n${todaysPicks.length} picks across ${engines} engines are live.\nLeading markets: ${top}.\n\nEvery pick shows its full reasoning — and No Bet is a real output, not a missing one.\n\nFree, no signup: ${SITE}\n\n${RG}`
  });
} else if (todaysPicks.length === 0) {
  console.log("No picks recorded for today — honest skip, no picks post.");
}

// 3) SUNDAY — 7-day recap.
if (today.getUTCDay() === 0) {
  let w = 0, l = 0;
  for (let i = 1; i <= 7; i++) {
    const d = dstr(new Date(today.getTime() - i * 86400000));
    const r = record(settledOn(d)); w += r.w; l += r.l;
  }
  if (w + l > 0) {
    const pct = Math.round(100 * w / (w + l));
    messages.push({
      photo: null,
      caption: `THE WEEK, IN FULL — last 7 days\n\n${w} WON  •  ${l} LOST  (${pct}%)\n\nEvery result posted daily, wins and losses. That's the record — check it yourself: ${SITE}\n\n${RG}`
    });
  }
}

/* ---------- write the WhatsApp copy-forward file ---------- */
fs.writeFileSync(path.join(HERE, "social-captions.txt"),
  messages.map(m => m.caption).join("\n\n==============================\n\n") || "Nothing to post today.");

/* ---------- post to Telegram ---------- */
async function send(m) {
  if (DRY) { console.log("---- DRY RUN ----\nphoto:", m.photo, "\n" + m.caption + "\n"); return; }
  const url = `https://api.telegram.org/bot${TOKEN}/` + (m.photo ? "sendPhoto" : "sendMessage");
  const form = new FormData();
  form.append("chat_id", CHAT);
  if (m.photo) {
    form.append("photo", new Blob([fs.readFileSync(path.join(HERE, m.photo))]), m.photo);
    form.append("caption", m.caption.slice(0, 1024)); // Telegram caption limit
  } else {
    form.append("text", m.caption.slice(0, 4096));
  }
  const res = await fetch(url, { method: "POST", body: form });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) console.error("Telegram error:", JSON.stringify(j).slice(0, 300));
  else console.log("Posted:", m.photo || "text post");
}

(async () => {
  if (!messages.length) { console.log("Nothing to post today."); return; }
  for (const m of messages) { await send(m); await new Promise(r => setTimeout(r, 1500)); }
  console.log(`Done — ${messages.length} message(s) ${DRY ? "(dry run)" : "posted"}.`);
})();
