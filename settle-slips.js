/* ============================================================
   PREDICT2U — SETTLEMENT WORKER
   ------------------------------------------------------------
   Grades every OPEN public slip using the SAME settle() that grades
   the engines. Runs in GitHub Actions with the Supabase SECRET key,
   which is the only credential allowed past the slips_guard trigger.
   Users cannot influence grading; the browser cannot write these
   columns at all.

   Rules honored here:
   - A slip is LOST the moment any leg loses. No waiting.
   - A slip is WON only when every non-void leg has won.
   - Void legs are excluded from the verdict (a postponed game does not
     kill a slip, nor does it win one).
   - A slip with any leg still open stays OPEN. Nothing is guessed.

   Env: SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY (optional)
        DRY_RUN=1 to compute and print without writing.
   ============================================================ */
const fs = require("fs");
const path = require("path");

const SUPA_URL = process.env.SUPABASE_URL || "";
const SECRET   = process.env.SUPABASE_SECRET_KEY || "";
const RESEND   = process.env.RESEND_API_KEY || "";
const DRY      = process.env.DRY_RUN === "1";
if (!SUPA_URL || !SECRET) { console.error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY"); process.exit(1); }

/* ---------- load settle() from the engine, and today's data ---------- */
const eng = require("./banker-engine.js");
if (typeof eng.settle !== "function") { console.error("settle() not exported from banker-engine.js"); process.exit(1); }
const settle = eng.settle;

const dataTxt = fs.readFileSync(path.join(__dirname, "data.js"), "utf8");
const mm = dataTxt.match(/window\.MATCHES\s*=\s*(\[[\s\S]*?\]);/);
const MATCHES = mm ? JSON.parse(mm[1]) : [];
console.log(`Loaded ${MATCHES.length} matches.`);

// Fixture ids only started landing in data.js recently, so most historical
// matches have m.id === undefined. "f" + undefined === "fundefined", which would
// match EVERY id-less match and settle a leg against the wrong game. The id branch
// therefore only applies when the match actually HAS an id.
const findMatch = k => MATCHES.find(m =>
  (m.id != null && ("f" + m.id) === k) ||
  ((m.home + "|" + m.away + "|" + m.matchDate) === k)) || null;

/* ---------- supabase REST helpers (secret key: server only) ---------- */
const H = {
  "apikey": SECRET,
  "Authorization": "Bearer " + SECRET,
  "Content-Type": "application/json",
};
async function sbGet(pathq){
  const r = await fetch(`${SUPA_URL}/rest/v1/${pathq}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${pathq} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function sbPatch(pathq, body){
  const r = await fetch(`${SUPA_URL}/rest/v1/${pathq}`, {
    method: "PATCH", headers: { ...H, "Prefer": "return=minimal" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${pathq} -> ${r.status} ${await r.text()}`);
}

/* ---------- grade one slip ---------- */
// A match that will never be played cannot leave a leg open forever.
// API-Football marks these PST (postponed), CANC (cancelled), ABD (abandoned),
// SUSP (suspended), INT (interrupted). They carry no goals, so settle() correctly
// returns "" — the worker voids the leg instead, exactly as a bookmaker would.
const DEAD = ["PST","CANC","ABD","SUSP","INT"];

function gradeSlip(slip){
  let won = 0, lost = 0, voided = 0, open = 0;
  for (const leg of (slip.legs || [])) {
    const m = findMatch(leg.k);
    if (!m) { open++; continue; }                        // fixture unknown: never guess
    if (DEAD.includes(String(m.status))) { voided++; continue; }  // never played -> void
    if (m.homeGoals == null) { open++; continue; }       // not finished yet
    let r = "";
    try { r = settle(leg.market, m.homeGoals, m.awayGoals, m.status, m) || ""; } catch (e) { r = ""; }
    if (r === "Won") won++;
    else if (r === "Lost") lost++;
    else if (r === "Void") voided++;
    else open++;                       // unsettleable/live: still open, never guess
  }
  let status = "open";
  if (lost > 0) status = "lost";                       // one losing leg kills the slip immediately
  else if (open === 0) status = (won > 0) ? "won" : "void"; // all decided, none lost
  return { status, won, lost, voided, open };
}

(async () => {
  const open = await sbGet("slips?status=eq.open&is_public=eq.true&select=id,user_id,legs,stake,combined_odds");
  console.log(`${open.length} open public slips.`);
  if (!open.length) { console.log("Nothing to settle."); return; }

  const winnersByUser = {};   // user_id -> [slip ids won this run]
  let settledCount = 0;

  for (const slip of open) {
    const g = gradeSlip(slip);
    if (g.status === "open") continue;
    settledCount++;
    console.log(`slip ${slip.id.slice(0,8)} -> ${g.status.toUpperCase()} (${g.won}W ${g.lost}L ${g.voided}V)`);
    if (DRY) continue;
    await sbPatch(`slips?id=eq.${slip.id}`, {
      status: g.status, legs_won: g.won, legs_lost: g.lost, legs_void: g.voided,
      settled_at: new Date().toISOString(),
    });
    if (g.status === "won") (winnersByUser[slip.user_id] = winnersByUser[slip.user_id] || []).push(slip);
  }
  console.log(`Settled ${settledCount} slip(s).`);
  if (DRY) { console.log("DRY RUN — nothing written."); return; }

  /* ---------- instant win email: ONE per user per 24h, batched ---------- */
  if (!RESEND) { console.log("No RESEND_API_KEY — skipping win emails."); return; }
  const userIds = Object.keys(winnersByUser);
  if (!userIds.length) { console.log("No winners this run."); return; }

  const profs = await sbGet(`profiles?id=in.(${userIds.join(",")})&select=id,handle,email_wins,last_win_email_at`);
  const cutoff = Date.now() - 24 * 3600 * 1000;

  for (const p of profs) {
    if (!p.email_wins) { console.log(`@${p.handle}: opted out.`); continue; }
    if (p.last_win_email_at && new Date(p.last_win_email_at).getTime() > cutoff) {
      console.log(`@${p.handle}: already emailed within 24h — batching, not sending again.`); continue;
    }
    const users = await sbGet(`profiles?id=eq.${p.id}&select=id`);
    if (!users.length) continue;
    const email = await authEmail(p.id);
    if (!email) { console.log(`@${p.handle}: no email on record.`); continue; }

    const slips = winnersByUser[p.id];
    const ok = await sendWinEmail(email, p.handle, slips);
    if (ok) await sbPatch(`profiles?id=eq.${p.id}`, { last_win_email_at: new Date().toISOString() });
  }
})().catch(e => { console.error("Worker failed:", e.message); process.exit(1); });

/* ---------- auth email lookup (admin API, secret key only) ---------- */
async function authEmail(userId){
  const r = await fetch(`${SUPA_URL}/auth/v1/admin/users/${userId}`, { headers: H });
  if (!r.ok) return null;
  const j = await r.json();
  return j.email || null;
}

/* ---------- branded win email via Resend ---------- */
async function sendWinEmail(to, handle, slips){
  const n = slips.length;
  const lines = slips.slice(0,5).map(s => {
    const legs = (s.legs||[]).length;
    const ret  = (s.combined_odds && s.stake) ? ` · returned ${(s.stake*s.combined_odds).toFixed(2)} units` : "";
    return `<tr><td style="color:#8fa093;font-size:14px;padding:6px 0;border-bottom:1px solid #1b2a1c">${legs}-leg slip${ret}</td></tr>`;
  }).join("");
  const html = `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#070d08;padding:32px 0;font-family:Arial,Helvetica,sans-serif">
 <tr><td align="center">
  <table width="440" cellpadding="0" cellspacing="0" style="background:#0d150e;border:1px solid #1b2a1c;border-radius:16px;padding:32px">
   <tr><td align="center" style="padding-bottom:26px">
     <img src="https://predict2u.com/email-logo.png" alt="Predict2u" width="300" style="display:block;width:300px;max-width:100%;height:auto;border:0"/>
   </td></tr>
   <tr><td style="color:#f2f7f0;font-size:20px;font-weight:700;padding-bottom:6px">${n===1?"Your slip won":`${n} of your slips won`}</td></tr>
   <tr><td style="color:#8fa093;font-size:15px;line-height:22px;padding-bottom:18px">Settled today, @${handle}. Your public record has been updated.</td></tr>
   <tr><td><table width="100%" cellpadding="0" cellspacing="0">${lines}</table></td></tr>
   <tr><td align="center" style="padding:24px 0">
     <a href="https://predict2u.com/community.html" style="background:#3ecf6e;color:#06120a;font-size:15px;font-weight:800;text-decoration:none;padding:14px 32px;border-radius:10px;display:inline-block">See your record</a>
   </td></tr>
   <tr><td style="color:#5c6f5f;font-size:12px;line-height:18px;border-top:1px solid #1b2a1c;padding-top:18px">
     Losses are posted here too — that's the point. One email a day at most.<br/>
     18+ only. <a href="https://predict2u.com/community.html" style="color:#5c6f5f">Turn these emails off</a> · predict2u.com
   </td></tr>
  </table>
 </td></tr>
</table>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + RESEND, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Predict2u <noreply@predict2u.com>", to: [to],
      subject: n===1 ? "Your slip won" : `${n} of your slips won`, html }),
  });
  if (!r.ok) { console.error("Resend error:", await r.text()); return false; }
  console.log(`Win email sent to @${handle} (${n} slip${n>1?"s":""}).`);
  return true;
}
