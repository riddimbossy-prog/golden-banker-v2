/* ============================================================
   PREDICTO ENGINE
   Applies the Final Predicto Rules to match data.

   INPUT: an array of match objects (see SCHEMA below).
   OUTPUT: scored matches + the Top 4 Bankers selection.

   This is heuristic scoring, not a statistical model. It turns
   the written rules into numbers so the UI can rank picks. It
   does NOT make betting safe — see the notes in the README.
   ============================================================ */

/* ------------------------------------------------------------
   SCHEMA — this is the shape your backend must produce per match
   (map your API response onto this object).

   {
     home: "Team A",
     away: "Team B",
     league: "Premier League",

     // table / quality (lower position number = higher in table)
     homePos: 2,            // league position 1..N
     awayPos: 18,
     tableSize: 20,
     homePts: 55,
     awayPts: 21,
     homeGD: 30,            // goal difference
     awayGD: -25,

     // form: last ~5-6 games as a string of W/D/L, most recent last
     homeForm: "WWDWW",
     awayForm: "LLDLL",

     // venue-specific (per game averages over the season)
     homeScoredAtHome: 2.1,    // avg goals scored at home
     homeConcededAtHome: 0.8,  // avg goals conceded at home
     awayScoredAway: 0.9,      // avg goals scored away
     awayConcededAway: 2.2,    // avg goals conceded away

     // draw tendency (share of games drawn, 0..1) — optional
     homeDrawRate: 0.20,
     awayDrawRate: 0.35,

     // motivation flags — optional, set true if applicable
     homeMotivation: true,   // title race / survival / playoff push
     awayMotivation: false
   }
   ------------------------------------------------------------ */

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// ============================================================
// LEAGUE-CONTEXT CLASSIFIER  (shared, goals-based — no xG required)
// ------------------------------------------------------------
// Implements Section 2 of the League-Context Threshold rule: classify the
// league environment BEFORE any market is judged, so every engine can reason
// "is this team strong RELATIVE TO ITS LEAGUE". Uses leagueAvg.goalsPerGame,
// which the fetcher already provides for every match — works on the obscure
// leagues that have no xG (i.e. ~90% of the board).
//
// Returns { type, gpg, reliable, multiplier, volatile } where:
//   type        one of the six spec classes, or "Unknown"
//   gpg         league goals per match (null if unknown)
//   reliable    whether the league sample is trustworthy
//   volatile    true when the sample is too thin / unstable to trust
//   multiplier  a single Over-strictness dial engines MAY use (1.00 = neutral;
//               <1 = goals come easier, ease Over; >1 = goals scarce, tighten Over)
//
// IMPORTANT: this only DESCRIBES the league. It never forces a pick or a No Bet
// on its own — each engine decides how much to lean on it. That keeps every
// engine's existing, tested market logic intact (Section 9: context can
// downgrade a pick, but cannot rescue a weak one).
function classifyLeague(m){
  const la = m && m.leagueAvg;
  const gpg = (la && la.goalsPerGame != null) ? la.goalsPerGame : null;
  const reliable = !!(la && la.reliable && gpg != null);
  // sample too thin to trust the environment at all
  const games = la && la.gamesPlayed != null ? la.gamesPlayed : null;
  const volatile = !reliable || (games != null && games < 6);

  if (gpg == null) return { type:"Unknown", gpg:null, reliable:false, volatile:true, multiplier:1.00 };

  let type;
  if (gpg >= 3.10)      type = "Very High-Scoring";
  else if (gpg >= 2.80) type = "High-Scoring";
  else if (gpg >= 2.40) type = "Balanced";
  else if (gpg >= 2.10) type = "Low-Scoring";
  else                  type = "Very Low-Scoring";

  // Over-strictness multiplier per spec Section 3 (applied to Over thresholds).
  // <1 eases Over (goals plentiful), >1 tightens Over (goals scarce).
  const MULT = {
    "Very High-Scoring": 0.95,
    "High-Scoring":      0.97,
    "Balanced":          1.00,
    "Low-Scoring":       1.08,
    "Very Low-Scoring":  1.12,
  };
  let multiplier = MULT[type] ?? 1.00;

  // Volatile overlay: the spec treats unreliable leagues as their own class —
  // tighten everything and never let them carry an elite banker. We surface
  // this as a flag + a stricter multiplier; engines apply the downgrade.
  if (volatile) {
    type = reliable ? type : "Volatile";
    multiplier = Math.max(multiplier, 1.10);
  }

  return { type, gpg, reliable, volatile, multiplier };
}

// ============================================================
// LEAGUE-CONTEXT POST-FILTER  (goals-based — Sections 3, 5, 8, 9)
// ------------------------------------------------------------
// Applies the spec's league-adjusted RULES to an engine's chosen pick, using
// goals as the xG proxy (xG isn't available on most of this board). Per the
// spec's own law (Section 9): context can DOWNGRADE or REJECT a pick, never
// upgrade a weak one. So this only ever makes a pick safer — it can turn a
// banker into a non-banker, or a pick into No Bet, but never the reverse.
//
// It reads the same goal fields every engine already has:
//   homeScoredAtHome / homeConcededAtHome / awayScoredAway / awayConcededAway
// and the league class from classifyLeague(m).
//
// Returns { downgrade:bool, reject:bool, reason:string } — the caller applies it.
function leagueContextVerdict(m, market){
  const lc = classifyLeague(m);
  if (lc.type === "Unknown") {
    // Spec: "If league context is unknown: FINAL PICK = NO BET." We honour this
    // only for table-less/unknown leagues, where a banker was never safe anyway.
    return { downgrade:true, reject:hasNoStandings(m), reason:"League context unknown — cannot confirm market fits the environment." };
  }
  const mk = String(market||'').toLowerCase();
  const hGF=m.homeScoredAtHome, hGA=m.homeConcededAtHome, aGF=m.awayScoredAway, aGA=m.awayConcededAway;
  const combined = (hGF!=null && aGF!=null) ? (hGF+aGF) : null;       // goals-proxy for "combined xG"
  const t = lc.type;

  let downgrade=false, reject=false, reason="";

  // --- Section 9 OVERRIDES: market fights the league environment ---
  const isOver  = mk.includes("over");
  const isUnder = mk.includes("under");
  const isBTTSy = mk.includes("btts") && mk.includes("yes");
  const isBTTSn = mk.includes("btts") && mk.includes("no");

  if (combined != null) {
    // Over markets in low/very-low-scoring leagues need elite goal proof (Sec 3/4).
    if (isOver && (t==="Low-Scoring" || t==="Very Low-Scoring")) {
      const need = t==="Very Low-Scoring" ? 3.30 : 3.20;            // adjusted Over 2.5 goal floor
      if (mk.includes("2.5") && combined < need) { downgrade=true; reason=`Over in a ${t} league needs combined ${need}+ goals/game (have ${combined.toFixed(2)}).`; }
      // Real hit-rate check (Sec 4): if we have both teams' Over 2.5 rates and the
      // average is below the league-adjusted hit-rate floor, downgrade too.
      if (mk.includes("2.5") && m.homeOver25Rate!=null && m.awayOver25Rate!=null) {
        const hr = (m.homeOver25Rate + m.awayOver25Rate)/2;
        const floor = t==="Very Low-Scoring" ? 0.68 : 0.65;
        if (hr < floor) { downgrade=true; reason=`Over 2.5 in a ${t} league needs ${Math.round(floor*100)}%+ Over hit-rate (have ${Math.round(hr*100)}%).`; }
      }
      if (mk.includes("3.5")) { downgrade=true; reason=`Over 3.5 is not a default banker in a ${t} league.`; }
    }
    // Under markets in high-scoring leagues need very low combined goals (Sec 9).
    if (isUnder && (t==="Very High-Scoring" || t==="High-Scoring")) {
      const cap = t==="Very High-Scoring" ? 1.90 : 2.00;            // adjusted Under 2.5 cap
      if (mk.includes("2.5") && combined > cap) { downgrade=true; reason=`Under in a ${t} league needs combined ${cap} or fewer goals/game (have ${combined.toFixed(2)}).`; }
    }
    // BTTS Yes in defensive leagues needs both sides to score reliably (Sec 9).
    if (isBTTSy && (t==="Low-Scoring" || t==="Very Low-Scoring")) {
      const each = t==="Very Low-Scoring" ? 1.45 : 1.35;
      if (!(hGF>=each && aGF>=each)) { downgrade=true; reason=`BTTS Yes in a ${t} league needs both teams scoring ${each}+ /game.`; }
    }
    // BTTS No in very high-scoring leagues needs strong defensive proof (Sec 9).
    if (isBTTSn && t==="Very High-Scoring") {
      downgrade=true; reason="BTTS No in a very high-scoring league needs elite defensive numbers.";
    }

    // --- Over 1.5 (Sec 4): softer Over — only hostile in low-scoring leagues,
    //     with a lower goal floor than Over 2.5. ---
    if (isOver && mk.includes("1.5") && (t==="Low-Scoring" || t==="Very Low-Scoring")) {
      const need = t==="Very Low-Scoring" ? 2.75 : 2.65;        // adjusted Over 1.5 goal floor
      if (combined < need) { downgrade=true; reason=`Over 1.5 in a ${t} league needs combined ${need}+ goals/game (have ${combined.toFixed(2)}).`; }
    }
  }

  // --- Section 5: STRAIGHT WIN — wants a clear favourite. Hostile in low-scoring
  //     (goals hard to find) and volatile (upsets common). Goals-proxy for the
  //     "gap": stronger team's win rate minus weaker side, plus table position. ---
  const isWin = (mk==="home win" || mk==="away win" || mk.includes(" win") && !mk.includes("dnb") && !mk.includes("draw"));
  if (isWin && (t==="Low-Scoring" || t==="Very Low-Scoring")) {
    // The engine already vetted the favourite; we only ADD the spec's extra gap
    // demand in leagues where straight wins are genuinely harder. Balanced and
    // high-scoring leagues keep the engine's own judgement (no double-gating).
    const hWR=m.homeWinRate, aWR=m.awayWinRate;
    const wrGap = (hWR!=null && aWR!=null) ? Math.abs(hWR-aWR) : null;
    const posGap = (m.homePos!=null && m.awayPos!=null) ? Math.abs(m.homePos-m.awayPos) : null;
    const needWR = t==="Very Low-Scoring" ? 0.45 : 0.38;
    const needPos = t==="Very Low-Scoring" ? 6 : 5;
    const gapOK = (wrGap!=null && wrGap>=needWR) || (posGap!=null && posGap>=needPos);
    if (!gapOK) { downgrade=true; reason=`Straight win in a ${t} league needs a clearer favourite (bigger quality gap).`; }
  }

  // --- Section 6: DNB — protective, SAFER in compressed/low-scoring leagues, so
  //     only lightly tightened; volatile still demands a real gap. ---
  const isDNB = mk.includes("dnb");
  if (isDNB && (t==="Very High-Scoring" || t==="High-Scoring")) {
    // DNB is protective and already safe in low/balanced leagues; the spec only
    // demands a clearer edge where goals are plentiful (a draw is likelier to be
    // broken, so the backed side must be the more probable winner).
    const hWR=m.homeWinRate, aWR=m.awayWinRate;
    const wrGap = (hWR!=null && aWR!=null) ? Math.abs(hWR-aWR) : null;
    const need = t==="Very High-Scoring" ? 0.28 : 0.22;
    if (wrGap!=null && wrGap < need) { downgrade=true; reason=`DNB in a ${t} league needs a clearer edge for the backed side.`; }
  }

  // --- Section 6: DOUBLE CHANCE — wants a side that rarely loses. Check the
  //     backed side's unbeaten rate against the league-adjusted floor. ---
  const isDC = mk.includes("double chance") || mk.startsWith("dc");
  if (isDC) {
    const ub = Math.max(m.homeUnbeatenRate??0, m.awayUnbeatenRate??0);
    let need = 0.72;
    if (t==="Very High-Scoring") need=0.75;
    else if (t==="High-Scoring") need=0.74;
    else if (t==="Very Low-Scoring") need=0.75;
    if (ub < need) { downgrade=true; reason=`Double Chance in a ${t} league needs the backed side unbeaten ${Math.round(need*100)}%+ of games.`; }
  }

  // --- TEAM-TO-SCORE markets (Sec 2 "Team Over/Under Goals"). A single side's
  //     goal expectation must fit the league. "Team Over 1.5" wants that side
  //     scoring freely (hostile in low-scoring leagues); "Team Under 1.5"/"Team
  //     Under 0.5" wants them kept quiet (hostile in high-scoring leagues). We
  //     use the relevant side's goals-for average as the proxy. ---
  const isHomeTeam = mk.includes("home team");
  const isAwayTeam = mk.includes("away team");
  if (isHomeTeam || isAwayTeam) {
    const gf = isHomeTeam ? hGF : aGF;          // that side's goals-for /game
    if (gf != null) {
      const teamOver15  = mk.includes("over 1.5");
      const teamOver05  = mk.includes("over 0.5");
      const teamUnder15 = mk.includes("under 1.5");
      if (teamOver15 && (t==="Low-Scoring" || t==="Very Low-Scoring")) {
        const need = t==="Very Low-Scoring" ? 1.75 : 1.55;
        if (gf < need) { downgrade=true; reason=`Team Over 1.5 in a ${t} league needs that side scoring ${need}+ /game (have ${gf.toFixed(2)}).`; }
      }
      if (teamOver05 && t==="Very Low-Scoring") {
        if (gf < 1.05) { downgrade=true; reason=`Team Over 0.5 in a very low-scoring league needs that side scoring 1.05+ /game (have ${gf.toFixed(2)}).`; }
      }
      if (teamUnder15 && (t==="High-Scoring" || t==="Very High-Scoring")) {
        const cap = t==="Very High-Scoring" ? 0.85 : 1.00;
        if (gf > cap) { downgrade=true; reason=`Team Under 1.5 in a ${t} league needs that side scoring ${cap} or fewer /game (have ${gf.toFixed(2)}).`; }
      }
    }
  }

  // --- FIRST-HALF / SECOND-HALF goal markets. Uses REAL half-time goal
  //     averages from the H2H sample (m.h2h.avg1H / avg2H) where available; if
  //     not present (no HT data yet for this fixture), we DON'T guess — the
  //     market is downgraded as unconfirmed (honesty-first: no fabricated half
  //     splits). Thresholds scale with league scoring like the full-game ones. ---
  const isFirstHalf  = mk.includes("1st half") || mk.includes("first half");
  const isSecondHalf = mk.includes("2nd half") || mk.includes("second half");
  if (isFirstHalf || isSecondHalf) {
    const h2h = m.h2h || {};
    // Prefer real per-team HT/FT half-splits (from /teams/statistics goals-by-
    // minute) when present; fall back to the H2H sample average; else unknown.
    const teamHalf = isFirstHalf
      ? (m.home1HFor!=null && m.away1HFor!=null ? (m.home1HFor + m.away1HFor) : null)
      : (m.home2HFor!=null && m.away2HFor!=null ? (m.home2HFor + m.away2HFor) : null);
    const avg = teamHalf != null ? teamHalf : (isFirstHalf ? h2h.avg1H : h2h.avg2H);
    if (avg == null) {
      downgrade = true;
      reason = `${isFirstHalf?'First':'Second'}-half market — no half-time goal data for this fixture yet (not confirmed).`;
    } else {
      const halfIsOver  = mk.includes("over");
      const halfIsUnder = mk.includes("under");
      // baseline half-goal floors, tightened in low-scoring / loosened in high.
      const bump = (t==="Low-Scoring") ? 0.15 : (t==="Very Low-Scoring") ? 0.25 : 0;
      const ease = (t==="High-Scoring") ? 0.10 : (t==="Very High-Scoring") ? 0.20 : 0;
      if (halfIsOver && mk.includes("0.5")) {
        const need = 0.80 + bump - ease;   // expect ~0.8 goals in the half to back Over 0.5
        if (avg < need) { downgrade=true; reason=`${isFirstHalf?'1st':'2nd'}-half Over 0.5 needs ~${need.toFixed(2)}+ half-goals (have ${avg.toFixed(2)}).`; }
      }
      if (halfIsOver && mk.includes("1.5")) {
        const need = 1.70 + bump - ease;
        if (avg < need) { downgrade=true; reason=`${isFirstHalf?'1st':'2nd'}-half Over 1.5 needs ~${need.toFixed(2)}+ half-goals (have ${avg.toFixed(2)}).`; }
      }
      if (halfIsUnder && mk.includes("1.5")) {
        const cap = 1.10 - bump + ease;
        if (avg > cap) { downgrade=true; reason=`${isFirstHalf?'1st':'2nd'}-half Under 1.5 needs ~${cap.toFixed(2)} or fewer half-goals (have ${avg.toFixed(2)}).`; }
      }
      if (halfIsUnder && mk.includes("0.5")) {
        const cap = 0.55 - bump + ease;
        if (avg > cap) { downgrade=true; reason=`${isFirstHalf?'1st':'2nd'}-half Under 0.5 needs ~${cap.toFixed(2)} or fewer half-goals (have ${avg.toFixed(2)}).`; }
      }
    }
  }
  if (lc.volatile || t==="Volatile") {
    downgrade=true;
    reason = reason || "Volatile/unreliable league — confidence downgraded a tier (Section 8).";
  }

  return { downgrade, reject, reason };
}

// NO-STANDINGS DETECTOR — a matchup with no real league table (friendlies,
// exhibition games, brand-new competitions). Both league positions null = no
// table to judge the teams' real environment. Engines may still offer a LEAN
// here, but must NEVER mark it a confident banker — the league-based premise
// that justifies a banker doesn't exist.
function hasNoStandings(m){
  const noPos = (m.homePos == null && m.awayPos == null);
  const lname = String(m.league||'').toLowerCase();
  const isFriendly = lname.includes('friendl');
  return noPos || isFriendly;
}

// SHARED FRIENDLY APPROACH — used by every engine so friendlies are handled
// the same way everywhere (no more blanket Under 3.5). Returns {market, conf,
// reason} or null if no goal data. Logic:
//   both teams score freely  -> Over 1.5 lean
//   one side CLEARLY better  -> that side's DNB lean
//   modest combined scoring  -> Under 3.5 lean (only when genuinely low)
//   nothing clear            -> No Bet
// Always low/medium confidence; NEVER a banker (callers enforce that).
function friendlyLean(m){
  const hGF=m.homeScoredAtHome, hGA=m.homeConcededAtHome, aGF=m.awayScoredAway, aGA=m.awayConcededAway;
  if(hGF==null||aGF==null) return null;
  const combined = hGF + aGF;
  const hWR=m.homeWinRate ?? null, aWR=m.awayWinRate ?? null;
  const hQual=(hGF-(hGA??1))+(hWR!=null?hWR*2:0);
  const aQual=(aGF-(aGA??1))+(aWR!=null?aWR*2:0);
  const gap=Math.abs(hQual-aQual);

  // Odds read: is the game OPEN or TIGHT/closed?
  // Close 1X2 prices (no strong favourite) = evenly-matched, tends open → Over.
  // A heavy mismatch (one side very short) can mean a controlled walkover → less open.
  const o=m.odds;
  let oddsOpen=null; // null = unknown, true = open, false = tight
  if(o && o.home && o.away){
    const short=Math.min(o.home,o.away), long=Math.max(o.home,o.away);
    const ratio=long/short;            // ~1 = even, large = big mismatch
    if(ratio>=4.5) oddsOpen=false;     // heavy favourite → possibly controlled (takes priority)
    else if(ratio<=2.2) oddsOpen=true; // fairly even → open, goals likely
    // draw price as a secondary hint, only when NOT already a clear mismatch:
    if(oddsOpen!==false && o.draw && o.draw>=3.6) oddsOpen=true;
  }

  // Clear quality gap → back the stronger side (kept — distinct useful case)
  if(gap>=1.6){
    const homeBetter=hQual>aQual;
    return { market: homeBetter?"Home DNB":"Away DNB", conf:5,
      reason:`Friendly lean — ${homeBetter?m.home:m.away} clearly stronger (quality gap ${gap.toFixed(1)}). Squads may rotate; not a banker.` };
  }

  // DEFAULT: Over 1.5 — friendlies tend open and goal-friendly.
  // Override to Under 3.5 ONLY when BOTH signals point low: genuinely low
  // combined scoring AND odds NOT indicating an open game.
  const scoringLow = combined<=2.4;
  const oddsTight = (oddsOpen===false);   // odds explicitly suggest a closed game
  if(scoringLow && (oddsTight || oddsOpen===null && combined<=2.0)){
    return { market:"Under 3.5", conf:5,
      reason:`Friendly lean — low combined scoring (${combined.toFixed(1)}/game)${oddsTight?' and odds point to a tight game':''}. Squads may rotate; not a banker.` };
  }

  // Otherwise Over 1.5 (stronger confidence when odds confirm an open game).
  const conf = (oddsOpen===true || combined>=3.0) ? 6 : 5;
  return { market:"Over 1.5", conf,
    reason:`Friendly lean — friendlies tend open${oddsOpen===true?', and the odds point to an open game':''} (combined ${combined.toFixed(1)}/game). Squads may rotate; not a banker.` };
}
// A pick built on a handful of games is noise, not signal. Engines call this
// first and return No Bet when the data isn't solid enough.
function dataQualityOK(m){
  // not enough games played in the season → unreliable rates
  const gp = m.gamesPlayed;
  if (gp != null && gp < 5) return false;
  // venue (home/away) sample too thin → home/away splits unreliable
  const hvg = m.homeVenueGames, avg = m.awayVenueGames;
  if (hvg != null && hvg < 3) return false;
  if (avg != null && avg < 3) return false;
  // core goal data missing entirely → can't model anything
  if (m.homeScoredAtHome == null && m.awayScoredAway == null) return false;
  // league baseline unreliable AND we have no team goal data to fall back on
  const la = m.leagueAvg;
  if ((!la || !la.reliable) && m.homeScoredAtHome == null) return false;
  return true;
}

function formPoints(form) {
  if (!form) return 0;
  let pts = 0, n = 0;
  for (const c of form.toUpperCase()) {
    if (c === "W") pts += 3;
    else if (c === "D") pts += 1;
    n++;
  }
  return n ? pts / (n * 3) : 0; // 0..1, share of max points
}

/* ---------------- OVER 2.5 SCORING (Rule 7) ---------------- */
function scoreOver25(m) {
  const reasons = [];
  // expected goals proxy: blend of both teams' venue scoring + opp conceding
  const homeExp = ((m.homeScoredAtHome ?? 1.3) + (m.awayConcededAway ?? 1.3)) / 2;
  const awayExp = ((m.awayScoredAway ?? 1.0) + (m.homeConcededAtHome ?? 1.0)) / 2;
  const totalExp = homeExp + awayExp;

  let score = clamp((totalExp - 1.5) * 3.2, 0, 10); // ~2.5 total -> ~3.2; 3.6 -> ~6.7; 4.5 -> 9.6

  // LEAGUE CALIBRATION: judge this game's goal expectation against the league's
  // OWN average, not a global one. In a low-scoring league, beating the baseline
  // matters more; in a high-scoring league, a big number is just normal. Shifts
  // the score up/down by how far totalExp sits from the league norm.
  const la = m.leagueAvg;
  if (la && la.reliable && la.goalsPerGame) {
    const delta = totalExp - la.goalsPerGame;        // +ve: more goals than league norm
    score += clamp(delta * 1.6, -2, 2);              // nudge, capped so it can't dominate
    if (delta >= 0.6) reasons.push(`Well above this league's ${la.goalsPerGame} goals/game norm`);
    else if (delta <= -0.6) reasons.push(`Below this league's ${la.goalsPerGame} goals/game norm`);
    score = clamp(score, 0, 10);
  }

  if ((m.homeConcededAtHome ?? 0) >= 1.6 || (m.awayConcededAway ?? 0) >= 1.8) {
    reasons.push("A defence concedes heavily at this venue");
    score += 1;
  }
  if (totalExp >= 3.2) reasons.push(`High combined goal expectation (~${totalExp.toFixed(1)})`);
  else if (totalExp >= 2.7) reasons.push(`Moderate combined goal expectation (~${totalExp.toFixed(1)})`);
  else reasons.push(`Low combined goal expectation (~${totalExp.toFixed(1)})`);

  // Rule 7: avoid if it relies on a poor attacking team
  if ((m.awayScoredAway ?? 1) < 0.8 || (m.homeScoredAtHome ?? 1) < 0.9) {
    reasons.push("Relies partly on a weak attack — capped");
    score = Math.min(score, 6.5);
  }

  score = clamp(Math.round(score * 10) / 10, 0, 10);
  return { score, verdict: verdictFor(score, 8, 6), reasons, totalExp };
}

/* ---------------- UNDER SCORING (defensive games) ----------------
   Mirror of Over: a LOW combined goal expectation makes Under strong.
   Returns scores for both Under 3.5 (safer) and Under 2.5 (tighter),
   plus which line is the better pick. Reuses the same venue-goal blend
   as scoreOver25 so the two are directly comparable.
   ----------------------------------------------------------------- */
function scoreUnder(m) {
  const reasons = [];
  const homeExp = ((m.homeScoredAtHome ?? 1.3) + (m.awayConcededAway ?? 1.3)) / 2;
  const awayExp = ((m.awayScoredAway ?? 1.0) + (m.homeConcededAtHome ?? 1.0)) / 2;
  const totalExp = homeExp + awayExp;

  // Under 2.5 strong when total expectation is well below 2.5; Under 3.5 when below ~3.0.
  // Map: 2.5 exp -> ~5 for U2.5; 1.8 -> ~8.4; 1.4 -> ~10.   3.5 line is more forgiving.
  let u25 = clamp((2.6 - totalExp) * 4.0 + 5, 0, 10);
  let u35 = clamp((3.4 - totalExp) * 3.2 + 5, 0, 10);

  // LEAGUE CALIBRATION: being below the LEAGUE's own goal norm is the real Under
  // signal. 2.4 goals expected is strong Under in a 3.1-goal league, weak in a
  // 2.2-goal one. Nudge by distance below the league average when reliable.
  const la = m.leagueAvg;
  if (la && la.reliable && la.goalsPerGame) {
    const below = la.goalsPerGame - totalExp;        // +ve: fewer goals than league norm
    // Only reward "below league norm" when the game is ALSO absolutely low-scoring.
    // Being below a HIGH baseline (e.g. 2.7 in a 3.2 league) is not an Under signal —
    // 2.7 expected goals is still a coin-flip. Gate the boost on a real low total.
    if (totalExp <= 2.7) {
      u25 += clamp(below * 1.6, -2, 2);
      u35 += clamp(below * 1.2, -1.5, 1.5);
      if (below >= 0.6) reasons.push(`Below this league's ${la.goalsPerGame} goals/game norm`);
    } else if (below < 0) {
      // game projects MORE goals than the league norm -> dampen Under
      u25 += clamp(below * 1.4, -2, 0);
      u35 += clamp(below * 1.0, -1.5, 0);
    }
    u25 = clamp(u25, 0, 10); u35 = clamp(u35, 0, 10);
  }

  if (totalExp <= 2.0) reasons.push(`Low combined goal expectation (~${totalExp.toFixed(1)}) — defensive profile`);
  else if (totalExp <= 2.6) reasons.push(`Modest goal expectation (~${totalExp.toFixed(1)})`);
  else reasons.push(`Goals expectation (~${totalExp.toFixed(1)}) is not low — Under is risky`);

  // both attacks weak strengthens Under further (Rule: tactical/low-scoring)
  if ((m.homeScoredAtHome ?? 1.5) < 1.1 && (m.awayScoredAway ?? 1.5) < 1.0) {
    reasons.push("Both attacks are weak");
    u25 += 1; u35 += 0.6;
  }
  // a strong attacker present caps Under (they can break a tight game open)
  if ((m.homeScoredAtHome ?? 0) >= 2.0 || (m.awayScoredAway ?? 0) >= 1.8) {
    reasons.push("A strong attack present — Under capped");
    u25 = Math.min(u25, 5.5); u35 = Math.min(u35, 7);
  }

  u25 = clamp(Math.round(u25 * 10) / 10, 0, 10);
  u35 = clamp(Math.round(u35 * 10) / 10, 0, 10);
  // pick the better Under line: prefer the safer 3.5 unless 2.5 is clearly stronger
  const bestLine = (u25 >= u35 - 0.5) ? "Under 2.5" : "Under 3.5";
  const bestScore = bestLine === "Under 2.5" ? u25 : u35;
  return { score: bestScore, line: bestLine, u25, u35,
           verdict: verdictFor(bestScore, 8, 6), reasons, totalExp };
}

/* ---------------- BTTS SCORING (Rule 8) ---------------- */
function scoreBTTS(m) {
  const reasons = [];
  const homeScores = clamp(((m.homeScoredAtHome ?? 1.2) / 1.6) * 5, 0, 5);
  const awayScores = clamp(((m.awayScoredAway ?? 1.0) / 1.4) * 5, 0, 5);
  let score = homeScores + awayScores;

  if ((m.awayScoredAway ?? 1) >= 1.2 && (m.homeScoredAtHome ?? 1) >= 1.2)
    reasons.push("Both sides score regularly at this venue");
  if ((m.homeConcededAtHome ?? 0) >= 1.2 && (m.awayConcededAway ?? 0) >= 1.2)
    reasons.push("Both defences leak at this venue");

  // Rule 8: avoid if underdog may fail to score
  const weakerScores = Math.min(m.homeScoredAtHome ?? 1, m.awayScoredAway ?? 1);
  if (weakerScores < 0.8) {
    reasons.push("One side struggles to score — BTTS risk");
    score = Math.min(score, 5.5);
  }
  if (reasons.length === 0) reasons.push("Scoring profile is mixed");

  score = clamp(Math.round(score * 10) / 10, 0, 10);
  return { score, verdict: verdictFor(score, 7.5, 6), reasons };
}

/* ---------------- WIN / DNB SCORING (Rules 1,2,3,5,6,10,11,12) --------
   Now venue-aware for leagues, and group/knockout-aware for tournaments.
   ---------------------------------------------------------------------- */
// How much venue (home/away table) outweighs overall table for leagues.
// 0.6 = 60% venue, 40% overall. Raise toward 1 to lean more on venue.
const VENUE_WEIGHT = 0.6;

function scoreWinDNB(m) {
  const reasons = [];
  const size = m.tableSize ?? 20;

  // ---- Is this a tournament match where the overall table can't be trusted? ----
  // Cross-group or knockout: positions aren't comparable -> ignore table, use
  // form + venue goals, and stay cautious (lean DNB / Skip).
  const tournamentUncomparable = !!(m.isTournament && (m.isKnockout || (m.sameGroup === false)));

  // ---- overall table gap (normalised) ----
  const posGapOverall = ((m.awayPos ?? size/2) - (m.homePos ?? size/2)) / size; // +ve favours home
  const ptsGapOverall = ((m.homePts ?? 0) - (m.awayPts ?? 0)) / 30;
  const gdGap = ((m.homeGD ?? 0) - (m.awayGD ?? 0)) / 30;

  // ---- venue table gap: home team's HOME rank vs away team's AWAY rank ----
  const vSize = m.venueTableSize ?? size;
  let posGapVenue = posGapOverall, ptsGapVenue = ptsGapOverall, haveVenue = false;
  if (m.homeVenueRank != null && m.awayVenueRank != null) {
    posGapVenue = ((m.awayVenueRank) - (m.homeVenueRank)) / vSize; // +ve favours home
    haveVenue = true;
  }
  if (m.homeVenuePts != null && m.awayVenuePts != null) {
    ptsGapVenue = ((m.homeVenuePts) - (m.awayVenuePts)) / 20; // venue seasons are shorter
    haveVenue = true;
  }

  // ---- blend overall + venue (venue weighted heavier), unless tournament ----
  let posGap, ptsGap, usedVenue = false;
  if (tournamentUncomparable) {
    posGap = 0; ptsGap = 0; // table position carries no signal here
  } else if (haveVenue) {
    posGap = posGapOverall*(1-VENUE_WEIGHT) + posGapVenue*VENUE_WEIGHT;
    ptsGap = ptsGapOverall*(1-VENUE_WEIGHT) + ptsGapVenue*VENUE_WEIGHT;
    usedVenue = true;
  } else {
    posGap = posGapOverall; ptsGap = ptsGapOverall;
  }

  // form edge (always available, the main signal for tournaments)
  const formEdge = formPoints(m.homeForm) - formPoints(m.awayForm); // -1..1

  // goal-strength edge from venue scoring (helps when table is absent)
  const goalEdge = ((m.homeScoredAtHome ?? 1.3) - (m.awayConcededAway ?? 1.4))
                 - ((m.awayScoredAway ?? 1.0) - (m.homeConcededAtHome ?? 1.1));

  // Decide favourite + strength. For tournaments, weight form & goals more.
  let aggregate;
  if (tournamentUncomparable) {
    aggregate = formEdge * 3 + goalEdge * 1.2;
  } else {
    aggregate = posGap * 4 + ptsGap * 2 + gdGap * 1.5 + formEdge * 2;
  }
  const homeIsFav = aggregate >= 0;
  const favSide = homeIsFav ? "Home" : "Away";
  const favTeam = homeIsFav ? m.home : m.away;

  let score = clamp(5 + Math.abs(aggregate) * 1.3, 0, 10);

  // ---- gap reporting (use venue gap for leagues, note tournament separately) ----
  const absPosGap = tournamentUncomparable
    ? 0
    : Math.abs((m.homePos ?? 0) - (m.awayPos ?? 0));
  if (tournamentUncomparable) {
    reasons.push(m.isKnockout ? "Knockout tie — table gap not used" : "Different groups — table gap not used");
  } else if (absPosGap >= size * 0.5) reasons.push(`Large table gap (${absPosGap} places)`);
  else if (absPosGap >= size * 0.3) reasons.push(`Moderate table gap (${absPosGap} places)`);
  else reasons.push(`Small table gap (${absPosGap} places)`);

  // venue insight note (leagues only, when we have venue data)
  if (usedVenue && m.homeVenueRank != null && m.awayVenueRank != null) {
    reasons.push(`Venue form: ${m.home} ${ordinal(m.homeVenueRank)} at home, ${m.away} ${ordinal(m.awayVenueRank)} away`);
  }

  // Rule 12: defensive weakness of underdog
  const underdogConceded = homeIsFav ? (m.awayConcededAway ?? 0) : (m.homeConcededAtHome ?? 0);
  if (underdogConceded >= 1.8) { reasons.push("Underdog defence is leaky"); score += 0.7; }

  // form note
  if (Math.abs(formEdge) >= 0.25)
    reasons.push(`${formEdge > 0 ? m.home : m.away} has the stronger recent form`);

  // ---- DNB protection logic (Rules 2, 6) ----
  let drawRisk = 0;
  const favDrawRate = homeIsFav ? (m.homeDrawRate ?? 0.25) : (m.awayDrawRate ?? 0.25);
  // Calibrate "draw-heavy" against the LEAGUE's own draw rate when known: a 30%
  // draw rate is high in a decisive league but normal in a draw-prone one.
  const la2 = m.leagueAvg;
  const drawHeavyBar = (la2 && la2.reliable && la2.drawRate) ? Math.max(0.27, la2.drawRate + 0.05) : 0.30;
  if (favDrawRate >= drawHeavyBar) { drawRisk += 1; reasons.push("Favourite is draw-heavy for this league"); }
  if (!homeIsFav) { drawRisk += 1; reasons.push("Favourite is away — draw risk higher"); }
  if (!tournamentUncomparable && absPosGap < size * 0.3) drawRisk += 1;
  if (score < 7) drawRisk += 1;
  // tournaments are inherently less predictable -> extra caution
  if (tournamentUncomparable) { drawRisk += 1; reasons.push("Cup/knockout — extra caution applied"); }

  // Motivation (Rule 10) — only nudges, never creates a banker alone
  const favMotivation = homeIsFav ? m.homeMotivation : m.awayMotivation;
  if (favMotivation) { reasons.push("Favourite has a motivation edge"); score += 0.4; }

  score = clamp(Math.round(score * 10) / 10, 0, 10);

  // choose market: straight win only for clear mismatch (Rule 3,5,6)
  // For tournaments we require an even stronger signal AND never call it a
  // "clear mismatch" off table (there's no trustworthy table), so it leans DNB.
  let clearMismatch;
  if (tournamentUncomparable) {
    clearMismatch = score >= 8.5 && Math.abs(formEdge) >= 0.4 && drawRisk <= 2;
  } else {
    clearMismatch = score >= 7.0 && absPosGap >= size * 0.33 && drawRisk <= 2;
  }
  const strongHomeMismatch = homeIsFav && clearMismatch && (m.homeScoredAtHome ?? 0) >= 1.4;

  // TOP-4 WIN GATE (applies to all engines): a straight Win is only allowed if
  // the FAVOURITE sits in the actual league top 4. Below that — even on an
  // extreme mismatch — we cap at DNB. Reason: outside the top few, a "favourite"
  // is rarely dominant enough to trust the win outright; DNB protects the draw.
  const favPos = homeIsFav ? m.homePos : m.awayPos;
  const winAllowed = (favPos != null && favPos <= 4);

  let market;
  if (clearMismatch && homeIsFav)  market = winAllowed ? "Home Win" : "Home DNB";
  else if (clearMismatch && !homeIsFav) market = winAllowed ? "Away Win" : "Away DNB";
  else market = homeIsFav ? "Home DNB" : "Away DNB"; // default protection
  if (market === "Home Win" && !winAllowed) market = "Home DNB";
  if (market === "Away Win" && !winAllowed) market = "Away DNB";

  return {
    score, verdict: verdictFor(score, 7.5, 6), reasons,
    favSide, favTeam, homeIsFav, drawRisk, market, absPosGap, clearMismatch,
    usedVenue, tournamentUncomparable
  };
}

function ordinal(n){
  const s=["th","st","nd","rd"], v=n%100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

function verdictFor(score, strongAt, modAt) {
  if (score >= strongAt) return "Strong";
  if (score >= modAt) return "Moderate";
  return "Weak";
}

/* ---------------- ODDS VALUE CHECK ----------------
   Compares the engine's confidence in its pick against the bookmaker's
   implied probability. Honest by design: most efficiently-priced markets
   will show "no edge", because bookmaker odds already bake in the margin.
   Returns null if no odds, else { sidePct, modelPct, verdict, oddsUsed }.
   --------------------------------------------------------------------- */
function assessValue(m, primary, confidence, wdnb, over, btts) {
  const o = m.odds;
  if (!o || !o.home || !o.away) return null;

  // bookmaker implied probabilities (raw, includes margin)
  const inv = x => x ? 1 / x : 0;
  const rawH = inv(o.home), rawD = inv(o.draw), rawA = inv(o.away);
  const sum = rawH + rawD + rawA;
  if (sum <= 0) return null;
  // de-vig (normalise) so probabilities sum to 100% — fairer comparison
  const pH = rawH / sum, pD = rawD / sum, pA = rawA / sum;

  // implied prob for the SIDE the engine picked
  let impliedPct = null, oddsUsed = null;
  if (primary === "Home Win") { impliedPct = pH; oddsUsed = o.home; }
  else if (primary === "Away Win") { impliedPct = pA; oddsUsed = o.away; }
  else if (primary === "Home DNB") { impliedPct = pH / (pH + pA); oddsUsed = o.home; } // DNB ~ win given no draw
  else if (primary === "Away DNB") { impliedPct = pA / (pH + pA); oddsUsed = o.away; }
  else return null; // over/btts: no 1X2 comparison available here

  // engine's own probability estimate from its score (rough mapping)
  const score = wdnb.score; // 0..10
  const modelPct = clamp(0.40 + (score - 5) * 0.06, 0.05, 0.95); // 5->40%, 8->58%, 10->70%

  const edge = modelPct - impliedPct;
  let verdict;
  if (edge >= 0.08) verdict = "Possible value";
  else if (edge >= -0.04) verdict = "Fairly priced";
  else verdict = "No edge — bookie priced tighter";

  return {
    sidePct: Math.round(impliedPct * 100),
    modelPct: Math.round(modelPct * 100),
    edge: Math.round(edge * 100),
    verdict, oddsUsed
  };
}

/* ---------------- SAME-TIER / COIN-FLIP LEAGUE LEAN ----------------
   For games the engine SKIPS (no result edge — typically same-tier), the
   GOALS profile still tends to follow the league's character. This derives a
   goals LEAN from the league's own averages:
     • high-scoring league  -> Over 1.5 (or BTTS if both attacks lively)
     • low-scoring league    -> Under 3.5 (or Under 2.5 if very low)
     • draw-prone + low      -> Under 2.5
   IMPORTANT: this is a LEAN, not a banker. It is an unproven, league-profile
   suggestion that the performance tracker should measure before it's trusted.
   Returns null unless the league average is reliable AND the signal is clear.
   ------------------------------------------------------------------- */
function leagueLean(m) {
  const la = m.leagueAvg;
  if (!la || !la.reliable || la.goalsPerGame == null) return null; // need trustworthy league data

  const gpg = la.goalsPerGame;
  const draws = la.drawRate ?? null;
  // this game's own goal expectation (same blend the scorers use)
  const homeExp = ((m.homeScoredAtHome ?? 1.3) + (m.awayConcededAway ?? 1.3)) / 2;
  const awayExp = ((m.awayScoredAway ?? 1.0) + (m.homeConcededAtHome ?? 1.0)) / 2;
  const totalExp = homeExp + awayExp;

  let market = null, note = "";
  if (gpg >= 2.9) {
    // high-scoring league: lean to goals. BTTS if both sides actually score.
    if ((m.homeScoredAtHome ?? 1) >= 1.1 && (m.awayScoredAway ?? 1) >= 1.0) {
      market = "BTTS Yes"; note = `High-scoring league (${gpg}/game) — both teams scoring is the league trend.`;
    } else {
      market = "Over 1.5"; note = `High-scoring league (${gpg}/game) — goals are the league trend.`;
    }
  } else if (gpg <= 2.4) {
    // low-scoring league: lean Under. Tighter Under if very low / draw-prone.
    if (gpg <= 2.1 || (draws != null && draws >= 0.30)) {
      market = "Under 2.5"; note = `Low-scoring${draws>=0.30?' / draw-prone':''} league (${gpg}/game) — tight games are the trend.`;
    } else {
      market = "Under 3.5"; note = `Low-scoring league (${gpg}/game) — Under is the league trend.`;
    }
  } else {
    return null; // mid-range league: no clear profile lean
  }

  // sanity: don't lean Over in a game that itself projects very few goals, or
  // Under in a game projecting a hatful — the league trend shouldn't override a
  // strong individual signal pointing the other way.
  if (market.startsWith("Over") || market === "BTTS Yes") {
    if (totalExp < 2.0) return null;
  } else if (market.startsWith("Under")) {
    if (totalExp > 3.4) return null;
  }

  return { market, note };
}

/* ---------------- FINAL RECOMMENDATION (Rules 1,9,13) -------- */
function recommend(m) {
  if(!dataQualityOK(m)){
    return { match:m, over:null, btts:null, under:null, wdnb:null, primary:"Skip", confidence:"Low", banker:false, rankWeight:0, summary:"Low-quality data — skipped.", value:null, chosenKind:null, lean:null };
  }
  // Friendlies: shared friendly approach, never blanket Under 3.5; never a banker.
  if(String(m.league||'').toLowerCase().includes('friendl')){
    const fl=friendlyLean(m);
    if(!fl||fl.market==="No Bet"){
      return { match:m, over:null, btts:null, under:null, wdnb:null, primary:"Skip", confidence:"Low", banker:false, rankWeight:0, summary:(fl?fl.reason:"Friendly — no goal data."), value:null, chosenKind:null, lean:null };
    }
    return { match:m, over:null, btts:null, under:null, wdnb:null, primary:fl.market, confidence:(fl.conf>=6?"Medium":"Low"), banker:false, rankWeight:fl.conf, summary:fl.reason, value:null, chosenKind:"friendly", lean:null };
  }
  const over = scoreOver25(m);
  const btts = scoreBTTS(m);
  const wdnb = scoreWinDNB(m);

  let primary = "Skip";
  let confidence = "Low";
  let banker = false;
  let chosenKind = null;

  // ---- SAME-TIER GATE ----
  // Same-tier (and same-position) matchups are coin-flips on every market that
  // matters; per design they must NEVER be bankers. We detect it here so the
  // qualification logic below can be hard-blocked, leaving only a tracked
  // league LEAN. Needs both ranks to judge; if a rank is missing we don't gate.
  const _size = m.tableSize ?? 20;
  const _homeTier = tierFromProfile(m, 'home');
  const _awayTier = tierFromProfile(m, 'away');
  const sameTier = (_homeTier != null && _awayTier != null && _homeTier === _awayTier);

  // ---- QUALIFYING THRESHOLDS (tuning dials) ----
  // Lowered from 7/8 to 6.5/7.5 to catch more "obvious safe" picks the
  // stricter settings were skipping. Raise these back toward 7/8 if you
  // start seeing too many weak bankers in the performance tracker.
  const WDNB_BANKER_MIN = 6.5;   // was 7
  const OVER_BANKER_MIN = 7.5;   // was 8

  // Rule 9: combo only if both legs strong
  const comboOK = over.score >= 7 && btts.score >= 7;

  const under = scoreUnder(m);

  // ---- NORMALISED STRENGTH ----------------------------------------
  // Each market's raw score means something different, so we can't compare
  // them directly. Convert to "how far above its own qualifying bar" so a
  // DNB barely over its 6.5 bar reads as weaker than an Over well clear of
  // its 7.5 bar. strength = (score - bar) capped at 0; bigger = stronger case.
  // Standalone goal-market bars are deliberately HIGH (8.0) so an average
  // game doesn't manufacture a goals banker — that would break the "when
  // unsure, Skip" discipline. They only qualify on a genuinely strong profile.
  const BTTS_MIN  = 8.0;
  const UNDER_MIN = 8.0;
  const wdnbStrength  = wdnb.score  - WDNB_BANKER_MIN;
  const overStrength  = over.score  - OVER_BANKER_MIN;
  const bttsStrength  = btts.score  - BTTS_MIN;
  const underStrength = under.score - UNDER_MIN;

  // Is the result market (Win/DNB) only weak or marginal? A genuine straight-win
  // mismatch is left alone; it's the protective DNBs that should yield to a
  // clearly stronger goal market. "Marginal" = a DNB below 7.5.
  const isDNB = wdnb.market.includes("DNB");
  const wdnbMarginal = isDNB && wdnb.score < 7.5;
  const wdnbWeak = wdnb.score < WDNB_BANKER_MIN;

  // Build qualifying candidates with a comparable "strength" field.
  // NOTE: BTTS is intentionally NOT a standalone candidate — its scorer
  // over-rates average games (both ordinary teams "both score"), so a flat
  // match could masquerade as a BTTS banker. It competes only via the combo.
  const candidates = [];
  if (wdnb.score >= WDNB_BANKER_MIN) candidates.push({ bet: wdnb.market, weight: wdnb.score, strength: wdnbStrength, kind: "wdnb" });
  // When a straight Win was blocked (result fell to DNB), let goal markets in at
  // the SAME bar as the DNB (6.5) so they compete fairly, instead of being held
  // to the higher 7.5/Under bar that silently excluded them and handed it to DNB.
  const goalBar    = isDNB ? WDNB_BANKER_MIN : OVER_BANKER_MIN;
  const underBarEff = isDNB ? WDNB_BANKER_MIN : UNDER_MIN;
  if (over.score >= goalBar)     candidates.push({ bet: "Over 2.5", weight: over.score, strength: over.score - goalBar, kind: "over" });
  if (under.score >= underBarEff) candidates.push({ bet: under.line, weight: under.score, strength: under.score - underBarEff, kind: "under" });
  if (comboOK)                   candidates.push({ bet: "Over 2.5 + BTTS", weight: (over.score + btts.score) / 2, strength: Math.min(overStrength, bttsStrength), kind: "combo" });

  if (candidates.length && !sameTier) {
    // Default ordering is by normalised strength (fairer than raw score).
    candidates.sort((a, b) => b.strength - a.strength);

    let top = candidates[0];

    // WIN-BLOCKED → PREFER GOALS RULE: when the result market is only a DNB
    // (i.e. a straight Win was blocked — the favourite isn't dominant enough),
    // the old logic defaulted to that DNB and only switched to goals if a goal
    // market was *clearly* stronger. That biased toward DNB, because DNB enters
    // the pool at a lower bar (6.5) than goals (7.5). Inverted now: when the Win
    // was blocked, we PREFER the strongest goal market and only keep the DNB if
    // the DNB is CLEARLY stronger (by a real margin), not merely tied.
    if (isDNB) {
      const goalCands = candidates.filter(c => c.kind !== "wdnb");
      const dnbCand   = candidates.find(c => c.kind === "wdnb");
      if (goalCands.length) {
        const bestGoal = goalCands[0]; // strongest goal market by normalised strength
        if (!dnbCand) {
          top = bestGoal; // no qualifying DNB anyway → goals
        } else {
          // keep DNB ONLY if it's clearly stronger than the best goal market;
          // otherwise the goal market wins. "Clearly" = +0.5 normalised margin.
          top = (dnbCand.strength >= bestGoal.strength + 0.5) ? dnbCand : bestGoal;
        }
      }
    }

    primary = top.bet;
    banker = true;

    // confidence reflects the chosen market's own clearance above its bar
    if (top.kind === "wdnb") {
      confidence = (wdnb.clearMismatch && wdnb.score >= 8) ? "High"
                 : wdnb.score >= 7 ? "Medium" : "Low";
    } else if (top.kind === "over") {
      confidence = over.score >= 8.5 ? "High" : over.score >= 8 ? "Medium" : "Low";
    } else if (top.kind === "btts") {
      confidence = btts.score >= 8.5 ? "High" : "Medium";
    } else if (top.kind === "under") {
      confidence = under.score >= 8.5 ? "High" : "Medium";
    } else {
      confidence = (over.score >= 7.5 && btts.score >= 7.5) ? "High" : "Medium";
    }
    // expose which market won, for the UI / summary
    chosenKind = top.kind;

    // HIGH-CONFIDENCE-ONLY BANKERS: a Medium pick no longer counts as a banker.
    // Only High-confidence edges get the banker tag; Medium picks fall through
    // to a non-banker recommendation (still shown, just not flagged a banker).
    if (confidence !== "High") banker = false;
    // No real league table → never a confident banker (still shown as a pick).
    if (hasNoStandings(m)) banker = false;
  }

  // Skip rule (Rule 13): nothing qualified at all (no pick was chosen).
  // A demoted Medium pick (had a primary, just isn't High) is kept and shown
  // as a non-banker recommendation — only a true no-pick becomes Skip.
  let lean = null;
  const hadPick = primary && primary !== "Skip";
  if (!hadPick) {
    primary = "Skip"; confidence = "Low";
    lean = leagueLean(m);
  }

  // a single ranking weight for Top-4 selection (Rule 14)
  let rankWeight = 0;
  if (banker) {
    rankWeight = candidates[0].weight;
    if (primary === "Home Win" && wdnb.clearMismatch) rankWeight += 1.5;
    else if (primary.includes("DNB") && wdnb.absPosGap >= (m.tableSize ?? 20) * 0.4) rankWeight += 1.0;
    else if (primary === "Away Win") rankWeight += 0.8;
    else if (primary === "Over 2.5") rankWeight += 0.3;
    if (confidence === "High") rankWeight += 0.6;
  }

  const marketReason = {
    wdnb: `${wdnb.favTeam} edge — ${primary} is the safest read.`,
    over: `Goals expected — ${primary} has the strongest case here.`,
    under: `Low-scoring profile — ${primary} has the strongest case here.`,
    btts: `Both teams scoring looks the strongest case here.`,
    combo: `Goals + both-teams-score both look strong.`,
  };
  const summary = banker
    ? (marketReason[chosenKind] || `${primary} is the strongest read.`)
    : "No clear edge; protect the stake and skip.";

  const value = assessValue(m, primary, confidence, wdnb, over, btts);

  return { match: m, over, btts, under, wdnb, primary, confidence, banker, rankWeight, summary, value, chosenKind, lean };
}

/* ---------------- SETTLE: grade a pick against a final score ----
   Returns "Won" / "Lost" / "Void" / "" (empty = not finished yet).
   homeGoals/awayGoals are the final score numbers.
   ---------------------------------------------------------------- */
function settle(primary, homeGoals, awayGoals, status, m) {
  // Normalise totals labels: engines emit both "Over 2.5" and "Over 2.5 Goals"
  // for the same market. Without this, the "Goals"-suffixed form hit the switch
  // default and NEVER settled (no Won/Lost chip, never counted) — a silent
  // honesty gap across Mismatch/Halves/Value totals picks. One market, one grade.
  primary = String(primary==null?"":primary).replace(/^((?:Over|Under) \d(?:\.\d)?) Goals$/, "$1");
  if (homeGoals == null || awayGoals == null) return ""; // not played yet
  // If a status is provided, only settle FINISHED matches. Live/in-play games
  // (1H, 2H, HT, ET, LIVE, P, etc.) are NOT decided yet — never settle them.
  if (status != null) {
    const FINISHED = ["FT", "AET", "PEN", "AWD", "WO"];
    if (!FINISHED.includes(String(status))) return ""; // live or scheduled → no result yet
  }
  const total = homeGoals + awayGoals;
  const bothScored = homeGoals > 0 && awayGoals > 0;
  const homeWon = homeGoals > awayGoals;
  const awayWon = awayGoals > homeGoals;
  const draw = homeGoals === awayGoals;

  // HALF-TIME MARKETS settle from the stored half-time score (m.htHome/htAway).
  // Without it they stay UNSETTLED ("") — never guessed from the FT score.
  const HT = (m && m.htHome!=null && m.htAway!=null) ? {h:+m.htHome, a:+m.htAway} : null;
  switch (primary) {
    case "HT Draw": return HT ? (HT.h===HT.a ? "Won" : "Lost") : "";
    case "Over 0.5 Goals HT": return HT ? (HT.h+HT.a>=1 ? "Won" : "Lost") : "";
    case "Under 1.5 Goals HT": return HT ? (HT.h+HT.a<=1 ? "Won" : "Lost") : "";
    case "Home Win Either Half": return HT ? ((HT.h>HT.a || (homeGoals-HT.h)>(awayGoals-HT.a)) ? "Won" : "Lost") : "";
    case "Away Win Either Half": return HT ? ((HT.a>HT.h || (awayGoals-HT.a)>(homeGoals-HT.h)) ? "Won" : "Lost") : "";
    case "Draw HT or FT": return draw ? "Won" : (HT ? (HT.h===HT.a ? "Won" : "Lost") : "");
    case "Home Win": return homeWon ? "Won" : "Lost";
    case "Away Win": return awayWon ? "Won" : "Lost";
    case "Home DNB": return draw ? "Void" : (homeWon ? "Won" : "Lost");
    case "Away DNB": return draw ? "Void" : (awayWon ? "Won" : "Lost");
    case "Double Chance 1X": return (homeWon || draw) ? "Won" : "Lost";
    case "Double Chance X2": return (awayWon || draw) ? "Won" : "Lost";
    case "Double Chance 12": return !draw ? "Won" : "Lost";
    case "Over 1.5": return total >= 2 ? "Won" : "Lost";
    case "Over 2.5": return total >= 3 ? "Won" : "Lost";
    case "Over 3.5": return total >= 4 ? "Won" : "Lost";
    case "Under 2.5": return total <= 2 ? "Won" : "Lost";
    case "Under 3.5": return total <= 3 ? "Won" : "Lost";
    case "Under 4.5": return total <= 4 ? "Won" : "Lost";
    case "BTTS Yes": return bothScored ? "Won" : "Lost";
    case "BTTS No": return !bothScored ? "Won" : "Lost";
    case "Over 2.5 + BTTS": return (total >= 3 && bothScored) ? "Won" : "Lost";
    case "Home Team Over 0.5 Goals": return homeGoals >= 1 ? "Won" : "Lost";
    case "Away Team Over 0.5 Goals": return awayGoals >= 1 ? "Won" : "Lost";
    case "Home Team Over 1.5 Goals": return homeGoals >= 2 ? "Won" : "Lost";
    case "Away Team Over 1.5 Goals": return awayGoals >= 2 ? "Won" : "Lost";
    case "Home Team Under 1.5 Goals": return homeGoals <= 1 ? "Won" : "Lost";
    case "Away Team Under 1.5 Goals": return awayGoals <= 1 ? "Won" : "Lost";
    case "Skip": return ""; // no bet was placed
    case "No Bet": return ""; // engine declined
    default: return "";
  }
}

/* ---------------- TOP-LEVEL: analyse all + pick Top 4 -------- */
function analyseAll(matches) {
  const results = matches.map(recommend);
  // spec §1: MAX 4 BANKERS PER LEAGUE — rank by confidence, demote the rest
  const perLg={};
  results.filter(r=>r.banker).sort((a,b)=>b.rankWeight-a.rankWeight).forEach(r=>{
    const k=(r.match&&r.match.league)||'?'; perLg[k]=(perLg[k]||0)+1;
    if(perLg[k]>4){ r.banker=false;
      r.summary=`No Bet — Quota Exceeded. League already has 4 stronger bankers. (was: ${r.primary}, ${(r.rankWeight||0).toFixed(1)}/10)`; }
  });
  const bankers = results.filter(r=>r.banker).sort((a,b)=>b.rankWeight-a.rankWeight);
  return { results, bankers };
}

/* ============================================================
   STRICT BANKERS ENGINE  (separate, opt-in)
   ------------------------------------------------------------
   A conservative second engine that implements the strict spec:
   reject most matches, output ONE clean market or "No Bet".

   It reads the SAME match objects the main engine uses, and
   AUTO-DERIVES the inputs the strict rules need:
     • tier (1..5)  -> from league position, even 5 bands
     • home/away PPG -> from venue points & games where available,
                        else approximated from venue rank
     • split goals   -> existing homeScoredAtHome etc.
     • cleanSheet% / failedToScore% -> if the fetcher provides them
   RED FLAGS it can see (cup/knockout) are applied. The ones no
   API can know (derby, injuries, rotation, motivation, odds moves)
   are returned as a `humanChecks` list so a person can veto the
   pick before betting. This is AUTO-STRICT, not fully automatic.
   ============================================================ */

// Even 5-band tier from league position (1 = strongest .. 5 = weakest).
// Kept as the BASELINE; tierFromProfile refines it with team habits.
function tierFromRank(pos, size) {
  if (pos == null || !size) return null;
  const band = Math.ceil((pos / size) * 5);
  return clamp(band, 1, 5);
}

/* ---------------- COMPOSITE PROFILE TIER ----------------
   A tier is not just table position — it's a team's overall quality AND
   character: where they sit, how they score & concede, and their W/D/L form.
   DESIGN (per your spec): position LEADS (it already reflects a season of
   results), and the goals/concede/form profile NUDGES a team up or down by at
   most one tier when its habits clearly diverge from its rank. So a leaky
   high-scoring mid-table side and a tight low-scoring one land in DIFFERENT
   tiers even at the same position. Falls back to pure position when the extra
   stats are missing, so nothing breaks on sparse data.

   side = 'home' or 'away' (uses the venue-appropriate scoring rates).
   ------------------------------------------------------------------- */
function tierFromProfile(m, side) {
  const size = m.tableSize ?? 20;
  const pos = side === 'home' ? m.homePos : m.awayPos;
  const base = tierFromRank(pos, size);
  if (base == null) return null;

  // gather the habit components for this side (venue-appropriate)
  const gf   = side === 'home' ? m.homeScoredAtHome   : m.awayScoredAway;
  const ga   = side === 'home' ? m.homeConcededAtHome : m.awayConcededAway;
  const form = side === 'home' ? formPoints(m.homeForm) : formPoints(m.awayForm); // 0..1
  const la   = m.leagueAvg;

  // Need enough signal to refine; otherwise return the position tier as-is.
  if (gf == null && ga == null && (form == null)) return base;

  // Build a small -1..+1 "profile delta": positive = better than rank suggests.
  let delta = 0, parts = 0;
  // attack vs league norm
  if (gf != null) {
    const norm = (la && la.reliable && la.goalsPerGame) ? la.goalsPerGame / 2 : 1.3;
    delta += clamp((gf - norm) / norm, -1, 1); parts++;
  }
  // defence vs league norm (fewer conceded = better -> positive)
  if (ga != null) {
    const norm = (la && la.reliable && la.goalsPerGame) ? la.goalsPerGame / 2 : 1.3;
    delta += clamp((norm - ga) / norm, -1, 1); parts++;
  }
  // recent form (0.5 is neutral)
  if (form != null) { delta += clamp((form - 0.5) * 2, -1, 1); parts++; }

  if (!parts) return base;
  const avgDelta = delta / parts; // -1..+1

  // Shift a tier when the profile diverges from the rank. Threshold 0.33 (not
  // 0.5) so a clearly strong or weak profile nudges the tier even when one trait
  // (e.g. leaky defence on a high-scoring side) partly offsets another.
  let shift = 0;
  if (avgDelta >= 0.33) shift = -1;       // better profile -> stronger tier
  else if (avgDelta <= -0.33) shift = +1; // worse profile -> weaker tier
  return clamp(base + shift, 1, 5);
}

// Derive a venue PPG. Prefer real venue points if present; else approximate
// from venue rank (top of the venue table ~ high PPG, bottom ~ low).
function venuePPG(venuePts, venueGames, venueRank, venueSize) {
  if (venuePts != null && venueGames) return venuePts / venueGames;
  // approximation when we lack played-counts: map rank to a 0.4..2.6 band
  if (venueRank != null && venueSize) {
    const frac = 1 - ((venueRank - 1) / Math.max(1, venueSize - 1)); // 1 at top, 0 at bottom
    return clamp(0.4 + frac * 2.2, 0.3, 2.8);
  }
  return null;
}

function strictRecommend(m) {
  const reasons = [];
  const blocked = [];
  const humanChecks = []; // red flags no API can verify — human must check
  const block = (mkt, why) => blocked.push({ market: mkt, why });

  // ---- ELITE-ONLY TIGHTENING (tuning dials) ----
  // The strict engine is deliberately the high-conviction view. These raise
  // the bar well above the normal board: only very strong, well-separated,
  // league-beating mismatches survive. Loosen by lowering these if it rejects
  // everything for too long.
  const STRICT_CONF_FLOOR = 8;   // was 7 — only 8+ picks count as a strict bet
  const STRICT_MIN_GAP    = 3;   // was 2 — require a 3-tier chasm, not just 2

  const size = m.tableSize ?? 20;
  const homeTier = tierFromProfile(m, 'home');
  const awayTier = tierFromProfile(m, 'away');

  // venue PPG (real if available, else approximated from venue rank)
  const homePPG = venuePPG(m.homeVenuePts, m.homeVenueGames, m.homeVenueRank, m.venueTableSize ?? size);
  const awayPPG = venuePPG(m.awayVenuePts, m.awayVenueGames, m.awayVenueRank, m.venueTableSize ?? size);

  const homeGF = m.homeScoredAtHome, homeGA = m.homeConcededAtHome;
  const awayGF = m.awayScoredAway,   awayGA = m.awayConcededAway;
  const homeFormS = formPoints(m.homeForm), awayFormS = formPoints(m.awayForm);

  const result = (market, decision, confidence) => ({
    match: m, engine: "strict",
    homeTier, awayTier,
    tierGap: (homeTier != null && awayTier != null) ? Math.abs(homeTier - awayTier) : null,
    homePPG: homePPG != null ? Math.round(homePPG * 100) / 100 : null,
    awayPPG: awayPPG != null ? Math.round(awayPPG * 100) / 100 : null,
    market, decision, confidence, reasons, blocked, humanChecks,
    // ELITE-ONLY: a strict bet now needs confidence >= 8 (was 7).
    bet: decision === "Bet" && market !== "No Bet" && confidence >= STRICT_CONF_FLOOR && !hasNoStandings(m),
  });

  // ---- DATA QUALITY GATE ----
  if(!dataQualityOK(m)){
    block("All markets", "Low-quality data — not enough reliable games.");
    return result("No Bet", "Avoid", 0);
  }

  // ---- need tiers to proceed ----
  if (homeTier == null || awayTier == null) {
    block("All markets", "League position missing — cannot tier the teams.");
    return result("No Bet", "Avoid", 0);
  }

  // ---- STEP 2: red flags the data CAN see (cup / knockout) ----
  if (m.isKnockout) {
    block("All markets", "Cup knockout tie — strict rules force No Bet.");
    reasons.push("Knockout match: strict engine declines (Rule 6).");
    return result("No Bet", "Avoid", 0);
  }
  // Red flags the data CANNOT see — surface for human veto.
  humanChecks.push("Derby / rivalry?", "Key striker or keeper out?", "Heavy rotation likely?",
                   "Motivation unclear / dead rubber?", "Suspicious odds movement?");

  // ---- STEP 4: same tier ----
  if (homeTier === awayTier) {
    reasons.push("Same-tier matchup — avoided regardless of stats.");
    block("All markets", "Same-tier rule.");
    return result("No Bet", "Avoid", 0);
  }

  const gap = Math.abs(homeTier - awayTier);
  const strongerIsHome = homeTier < awayTier;
  const strongerName = strongerIsHome ? m.home : m.away;

  // extreme-mismatch probe for the gap=1 exception
  const strongerPPG = strongerIsHome ? homePPG : awayPPG;
  const weakerRank = strongerIsHome ? m.awayVenueRank : m.homeVenueRank;
  const vSize = m.venueTableSize ?? size;
  const weakBottom5 = weakerRank != null && weakerRank > (vSize - 5);
  const extremeMismatch = (strongerPPG != null && strongerPPG >= 2.5) && weakBottom5;

  // ---- STEP 5: tier gap of 1 ----
  if (gap === 1 && !extremeMismatch) {
    reasons.push("Tier gap of only 1 with no extreme mismatch — avoided.");
    block("All markets", "Near-tier (gap 1) with no extreme mismatch.");
    return result("No Bet", "Avoid", 0);
  }

  // ---- ELITE GATE A: require a big tier chasm (gap >= 3), unless an extreme
  // venue mismatch already proves the separation. Gap-2 games — fine for the
  // normal board — are rejected here as not elite enough. ----
  if (gap < STRICT_MIN_GAP && !extremeMismatch) {
    reasons.push(`Tier gap ${gap} is below the elite minimum of ${STRICT_MIN_GAP}.`);
    block("All markets", `Strict mode requires a ${STRICT_MIN_GAP}-tier gap (or extreme mismatch).`);
    return result("No Bet", "Avoid", 0);
  }

  // ---- ELITE GATE B: league calibration. In a draw-heavy or upset-prone
  // league (low home-win rate, high draw rate), even a clear favourite is
  // riskier — so strict mode demands the league itself be favourite-friendly,
  // or it declines. Only applies when the league's averages are reliable. ----
  const la = m.leagueAvg;
  if (la && la.reliable) {
    const drawProne = la.drawRate != null && la.drawRate >= 0.30;
    const upsetProne = la.homeWinRate != null && la.homeWinRate < 0.38;
    if (drawProne && upsetProne) {
      reasons.push(`This league is draw-heavy (${la.drawRate}) and upset-prone (home wins ${la.homeWinRate}) — strict mode declines.`);
      block("All markets", "League profile too unpredictable for an elite-only pick.");
      return result("No Bet", "Avoid", 0);
    }
  }

  reasons.push(`${strongerName} is the stronger side by tier (gap ${gap}).`);

  // ================= STRONGER TEAM HOME =================
  if (strongerIsHome) {
    const ppgOk = homePPG != null && homePPG >= 2.5;
    const twoTierOrExtreme = gap >= 2 || extremeMismatch;
    const awayWeak = (awayPPG != null && awayPPG < 1.0) || (m.awayVenueRank != null && m.awayVenueRank > (vSize - 5));
    const homeScoresWell = homeGF != null && homeGF >= 1.6;
    const awayLeaks = awayGA != null && awayGA >= 1.5;

    if (!ppgOk) block("Home Win", `Home PPG ${homePPG == null ? "unknown" : homePPG.toFixed(2)} is below the required 2.5.`);

    if (ppgOk && twoTierOrExtreme && awayWeak && homeScoresWell && awayLeaks) {
      let conf = 7;
      if (gap >= 3) conf++;
      if (homeGF >= 2.0) conf++;
      if (awayGA >= 2.0) conf++;
      if (homeFormS >= 0.6) conf++;
      conf = clamp(conf, 0, 10);
      reasons.push(`${m.home} has ≥2.5 home PPG and scores well; ${m.away} is weak and leaks away.`);
      block("Home DNB", "Not needed — full Home Win conditions met.");
      // TOP-4 WIN GATE: straight Win only if home is in the league top 4.
      const homeTop4 = m.homePos != null && m.homePos <= 4;
      if (conf >= 7 && !homeTop4) { reasons.push("Home outside top 4 — capping at DNB, not a straight win."); }
      return result((conf >= 7 && homeTop4) ? "Home Win" : "Home DNB", "Bet", conf);
    }

    // Home DNB
    const dnbOk = homeGF != null && homeGA != null && homeGF >= homeGA && (awayPPG == null || awayPPG < 2.5);
    if (dnbOk) {
      let conf = 7;
      if (gap >= 3) conf++;
      if (homeFormS >= 0.6) conf++;
      conf = clamp(conf, 0, 10);

      // WIN-BLOCKED → PREFER GOALS: if the Win was blocked by sub-2.5 PPG, the
      // favourite isn't dominant, so don't auto-default to DNB. Compare against
      // the goals option — but fairly: the DNB's `conf` is inflated by gap/form
      // bonuses that measure "how much better the team is", NOT how safe the
      // draw-protection is. So we compare goals against the DNB's BASE merit (7),
      // and prefer the goal market unless DNB's base genuinely beats it.
      if (!ppgOk) {
        const goalsTry = strictGoals(m, { homeGF, homeGA, awayGF, awayGA, reasons: [], blocked: [], humanChecks, result: (mk, act, c) => ({ market: mk, action: act, confidence: c }) });
        const goalsConf = (goalsTry && goalsTry.action === "Bet") ? goalsTry.confidence : 0;
        const dnbBase = 7; // base before gap/form bonuses
        if (goalsConf > 0 && goalsConf >= dnbBase) {
          // goals at least as strong as the DNB's real (draw-relevant) base → back goals
          reasons.push("Home Win blocked by sub-2.5 PPG; the goal market is at least as strong as the (non-dominant) DNB — backing goals.");
          return strictGoals(m, { homeGF, homeGA, awayGF, awayGA, reasons, blocked, humanChecks, result });
        }
        reasons.push("Home Win blocked by sub-2.5 PPG; no goal market is as clean as the DNB here, so protect via DNB.");
      }

      reasons.push(`${m.home} has a positive home profile; ${m.away} inferior but not extreme.`);
      return result(conf >= STRICT_CONF_FLOOR ? "Home DNB" : "No Bet", conf >= STRICT_CONF_FLOOR ? "Bet" : "Avoid", conf);
    }
    return strictGoals(m, { homeGF, homeGA, awayGF, awayGA, reasons, blocked, humanChecks, result });
  }

  // ================= STRONGER TEAM AWAY =================
  const checks = [
    m.homeVenueRank != null && m.homeVenueRank > (vSize - 5), // bottom 5 at home
    homeGF != null && homeGF < 1.0,                            // low home scoring
    homeGA != null && homeGA >= 1.6,                           // high home conceding
    homeFormS != null && homeFormS < 0.4,                     // poor form
    !(m.homeMotivation),                                       // motivation/squad proxy
    gap >= 2,                                                  // away has 2+ tier edge
  ];
  const weaknessCount = checks.filter(Boolean).length;
  const homeVeryWeak = weaknessCount >= 4;
  const awayPpgOk = awayPPG != null && awayPPG >= 2.5;

  if (!awayPpgOk) block("Away Win", `Away PPG ${awayPPG == null ? "unknown" : awayPPG.toFixed(2)} is below the required 2.5.`);
  if (!homeVeryWeak) block("Away Win", `${m.home} not weak enough at home (${weaknessCount}/6 signals; needs 4).`);

  if (gap >= 2 && awayPpgOk && homeVeryWeak) {
    let conf = 7;
    if (gap >= 3) conf++;
    if (awayGF >= 2.0) conf++;
    if (homeGA >= 2.0) conf++;
    if (awayFormS >= 0.6) conf++;
    conf = clamp(conf, 0, 10);
    reasons.push(`${m.away} has a major tier edge, ≥2.5 away PPG; ${m.home} passes the weakness test.`);
    block("Away DNB", "Not selected — full Away Win conditions met.");
    // TOP-4 WIN GATE: straight Win only if away is in the league top 4.
    const awayTop4 = m.awayPos != null && m.awayPos <= 4;
    if (conf >= 7 && !awayTop4) { reasons.push("Away outside top 4 — capping at DNB, not a straight win."); }
    return result((conf >= 7 && awayTop4) ? "Away Win" : "Away DNB", "Bet", conf);
  }

  const awayDnbOk = awayGF != null && awayGA != null && awayGF >= awayGA;
  if (awayDnbOk) {
    let conf = 7;
    if (gap >= 3) conf++;
    if (awayFormS >= 0.6) conf++;
    if (!(m.awayMotivation)) conf--;
    conf = clamp(conf, 0, 10);
    reasons.push(`${m.away} stronger away but ${m.home} not weak enough for Away Win — DNB protects.`);
    return result(conf >= STRICT_CONF_FLOOR ? "Away DNB" : "No Bet", conf >= STRICT_CONF_FLOOR ? "Bet" : "Avoid", conf);
  }

  // controlled stronger-away game → Under 3.5
  if (homeGF != null && awayGF != null && (homeGF + awayGF) < 2.6) {
    reasons.push("Stronger team away with a controlled scoring profile → Under 3.5.");
    return result("Under 3.5", "Bet", 7);
  }

  return strictGoals(m, { homeGF, homeGA, awayGF, awayGA, reasons, blocked, humanChecks, result });
}

function strictGoals(m, ctx) {
  const { homeGF, homeGA, awayGF, awayGA, reasons, blocked, result } = ctx;
  const comb = (homeGF != null && awayGF != null) ? homeGF + awayGF : null;
  if (comb != null && comb >= 3.2 && homeGF >= 1.6 && awayGF >= 1.2 && (homeGA >= 1.4 || awayGA >= 1.4)) {
    reasons.push("Strong combined goal profile with clear leaks → Over 2.5.");
    return result("Over 2.5", "Bet", comb >= 3.6 ? 8 : 7);
  }
  if (comb != null && comb >= 2.6 && (homeGF >= 1.4 || awayGF >= 1.2)) {
    reasons.push("Attack-vs-defence edge, safer line → Over 1.5.");
    return result("Over 1.5", "Bet", 7);
  }
  if (comb != null && comb <= 2.0 && homeGF < 1.2 && awayGF < 1.1) {
    reasons.push("Both attacks weak, low combined goals → Under 2.5.");
    return result("Under 2.5", "Bet", 7);
  }
  reasons.push("No single market is clean enough to back.");
  blocked.push({ market: "Goals markets", why: "No clear, dominant goal profile." });
  return result("No Bet", "Avoid", 4);
}

// Analyse all matches with the strict engine.
function analyseStrict(matches) {
  const results = matches.map(strictRecommend);
  const bets = results.filter(r => r.bet).sort((a, b) => b.confidence - a.confidence);
  return { results, bets };
}

/* ============================================================
   UNIVERSAL FOOTBALL BETTING MARKET ENGINE (v1.0) — "Ultra Bankers"
   Evaluates every market it has data for, scores each independently
   (0-10), applies the conflict rules, and outputs exactly ONE market
   or No Bet. Faithful to the pasted spec:
   • One match = one market (Rule 1)
   • No edge / same tier / red flag / confidence<7 = No Bet (Rules 2-5)
   • Top two markets within 1 point = No Bet (conflict engine)
   • Modules needing data we don't fetch (First Half, Corners, Cards)
     are BLOCKED and labelled, not faked.
   ------------------------------------------------------------------- */
function ultraRecommend(m) {
  const size = m.tableSize ?? 20;
  const blocked = [];
  if(!dataQualityOK(m)) return { match:m, engine:"ultra", primary:"No Bet", confidence:0, bet:false, banker:false, passed:[], failed:["Low-quality data — skipped."], blocked:[], humanChecks:[], allScores:[], verdict:"Low-quality data — skipped." };
  const humanChecks = [];

  const homeTier = tierFromProfile(m, 'home');
  const awayTier = tierFromProfile(m, 'away');
  const gap = (homeTier != null && awayTier != null) ? Math.abs(homeTier - awayTier) : null;
  const homePPG = venuePPG(m.homeVenuePts, m.homeVenueGames, m.homeVenueRank, m.venueTableSize ?? size);
  const awayPPG = venuePPG(m.awayVenuePts, m.awayVenueGames, m.awayVenueRank, m.venueTableSize ?? size);
  const hGF = m.homeScoredAtHome ?? null, hGA = m.homeConcededAtHome ?? null;
  const aGF = m.awayScoredAway ?? null,   aGA = m.awayConcededAway ?? null;
  const la = m.leagueAvg;
  const leagueGpg = (la && la.reliable && la.goalsPerGame) ? la.goalsPerGame : 2.6;

  const homeExp = (hGF != null && aGA != null) ? (hGF + aGA) / 2 : null;
  const awayExp = (aGF != null && hGA != null) ? (aGF + hGA) / 2 : null;
  const totalExp = (homeExp != null && awayExp != null) ? homeExp + awayExp : null;

  let hardRedFlag = false;
  if (m.isKnockout) { blocked.push({ market: "All", why: "Cup/knockout tie — Rule 4 red flag." }); hardRedFlag = true; }
  humanChecks.push("Verify manually: derby, heavy rotation, suspicious odds movement, weather, neutral venue, dead rubber, motivation.");

  const sameTier = (homeTier != null && awayTier != null && homeTier === awayTier);
  // Rule 3: same tier = No Bet, FULL STOP — no module may score. We still list
  // blocked modules below for transparency, but no candidate is added.
  const canScore = !hardRedFlag && !sameTier;

  const cand = [];
  const add = (market, conf, passed, failed) => cand.push({ market, conf: clamp(Math.round(conf),0,10), passed: passed||[], failed: failed||[] });

  if (!hardRedFlag && !sameTier && gap != null) {
    const strongerHome = homeTier < awayTier;
    { const passed=[], failed=[];
      const c1=strongerHome; c1?passed.push("Home tier stronger"):failed.push("Home not stronger");
      const c2=gap>=2; c2?passed.push("Tier gap >=2"):failed.push("Tier gap <2");
      const c3=homePPG!=null&&homePPG>=2.5; c3?passed.push("Home PPG >=2.5"):failed.push("Home PPG <2.5");
      const c4=hGF!=null&&hGF>=1.6; c4?passed.push("Strong home attack"):failed.push("Home attack not strong");
      const c5=aGF!=null&&aGF<=1.0; c5?passed.push("Away weak away"):failed.push("Away not weak away");
      const c6=aGA!=null&&aGA>=1.5; c6?passed.push("Away concedes often"):failed.push("Away solid defensively");
      const c7=m.homePos!=null&&m.homePos<=4; c7?passed.push("Home in top 4"):failed.push("Home outside top 4 — Win capped to DNB");
      if(c1&&c2&&c3&&c4&&c5&&c6&&c7){ let conf=7; if(gap>=3)conf++; if(hGF>=2.0)conf++; if(formPoints(m.homeForm)>=0.7)conf=Math.min(10,conf+1); add("Home Win",conf,passed,failed);
      } else blocked.push({market:"Home Win", why:failed.join("; ")}); }
    { const passed=[], failed=[];
      const c1=!strongerHome; c1?passed.push("Away tier stronger"):failed.push("Away not stronger");
      const c2=gap>=2; c2?passed.push("Tier gap >=2"):failed.push("Tier gap <2");
      const c3=awayPPG!=null&&awayPPG>=2.5; c3?passed.push("Away PPG >=2.5"):failed.push("Away PPG <2.5");
      const c4=aGF!=null&&aGF>=1.5; c4?passed.push("Strong away attack"):failed.push("Away attack not strong");
      const c5=hGF!=null&&hGF<=1.1; c5?passed.push("Home weak at home"):failed.push("Home not weak at home");
      const c6=hGA!=null&&hGA>=1.5; c6?passed.push("Home concedes often"):failed.push("Home solid at home");
      const c7=m.awayPos!=null&&m.awayPos<=4; c7?passed.push("Away in top 4"):failed.push("Away outside top 4 — Win capped to DNB");
      if(c1&&c2&&c3&&c4&&c5&&c6&&c7){ let conf=7; if(gap>=3)conf++; if(aGF>=1.9)conf++; if(formPoints(m.awayForm)>=0.7)conf=Math.min(10,conf+1); add("Away Win",conf,passed,failed);
      } else blocked.push({market:"Away Win", why:failed.join("; ")}); }
    { const winBlocked=!cand.find(c=>c.market==="Home Win");
      if(strongerHome&&gap>=2&&winBlocked){ let conf=7; if(gap>=3)conf++; if(homePPG!=null&&homePPG>=2.0)conf++; add("Home DNB",conf,["Home superior","Win blocked -> DNB protects draw risk"],[]); } }
    { const winBlocked=!cand.find(c=>c.market==="Away Win");
      if(!strongerHome&&gap>=2&&winBlocked){ let conf=7; if(gap>=3)conf++; if(awayPPG!=null&&awayPPG>=2.0)conf++; add("Away DNB",conf,["Away superior","Win blocked -> DNB protects draw risk"],[]); } }
    { if(strongerHome&&gap>=1) add("Double Chance 1X", clamp(6+gap,0,9), ["Home unlikely to lose","Draw cover"], []);
      if(!strongerHome&&gap>=1) add("Double Chance X2", clamp(6+gap,0,9), ["Away unlikely to lose"], []); }
  }

  if (totalExp != null && canScore) {
    const vsLeague = totalExp - leagueGpg;
    // Tighter multipliers + ceilings so markets SPREAD instead of all maxing at
    // 10 (which made everything tie and the conflict rule reject all). The
    // near-certain "safe" totals (Under 4.5, Over 0.5-type) are capped lower —
    // they're high-probability but low-edge, not strong recommendations.
    add("Over 1.5", clamp(4 + (totalExp-2.1)*2.4, 0, 9), totalExp>=2.4?["Goals expected (~"+totalExp.toFixed(1)+")"]:[], totalExp<2.1?["Low goal expectation"]:[]);
    add("Over 2.5", clamp(3 + (totalExp-2.7)*2.4 + vsLeague*1.0, 0, 10), totalExp>=3.1?["High combined goals"]:[], totalExp<2.8?["Not high-scoring enough"]:[]);
    add("Over 3.5", clamp(1 + (totalExp-3.3)*2.4, 0, 9), totalExp>=3.9?["Very open, elite tempo"]:[], totalExp<3.6?["Tempo not explosive"]:[]);
    add("Under 2.5", clamp(3 + (2.4-totalExp)*2.6 - Math.max(0,vsLeague)*1.0, 0, 10), totalExp<=2.1?["Low goals, tight game"]:[], totalExp>2.5?["Too many goals expected"]:[]);
    add("Under 3.5", clamp(3 + (3.2-totalExp)*2.2, 0, 9), totalExp<=2.8?["Controlled match"]:[], totalExp>3.4?["Open game risks Under 3.5"]:[]);
    add("Under 4.5", clamp(3 + (4.0-totalExp)*1.6, 0, 8), totalExp<=3.4?["No goal explosion expected"]:[], []);
  }

  if (hGF!=null&&aGF!=null&&hGA!=null&&aGA!=null&&canScore) {
    if(hGF>=1.2&&aGF>=1.0&&hGA>=1.1&&aGA>=1.1){
      // Tighter scoring: spread across the range, cap at 9 (a goals-market call
      // is never a "perfect 10" certainty), and require a genuinely strong
      // both-ends profile to score high — prevents BTTS saturating every
      // high-scoring lower-league game at 10 and dominating the board.
      const bttsScore = 4 + (hGF+aGF-2.4)*1.6 + (Math.min(hGA,aGA)-1.1)*1.4;
      add("BTTS Yes", clamp(bttsScore,0,9), ["Both score & concede often"], []);
    }
    if((hGF<=0.9||aGF<=0.8)&&(hGA<=0.9||aGA<=0.9)) add("BTTS No", clamp(5+(1.0-Math.min(hGF,aGF))*3+(1.0-Math.min(hGA,aGA))*2,0,10), ["A weak attack vs a strong defence"], []);
  }

  if (hGF!=null&&aGA!=null&&canScore) {
    add("Home Team Over 0.5 Goals", clamp(4 + (hGF-1.2)*2.0 + (aGA-1.3)*1.2, 0, 8), hGF>=1.3?["Home scores regularly"]:[], []);
    if(hGF>=1.7&&aGA>=1.5) add("Home Team Over 1.5 Goals", clamp(4+(hGF-1.7)*2.6+(aGA-1.5)*1.8,0,9), ["High home goals vs leaky away D"], []);
    if(hGF<=0.9&&aGA<=1.0) add("Home Team Under 1.5 Goals", clamp(4+(1.0-hGF)*2.6,0,9), ["Weak home attack, strong away D"], []);
  }
  if (aGF!=null&&hGA!=null&&canScore) {
    add("Away Team Over 0.5 Goals", clamp(4 + (aGF-1.1)*2.0 + (hGA-1.3)*1.2, 0, 8), aGF>=1.2?["Away scores consistently"]:[], []);
    if(aGF>=1.6&&hGA>=1.5) add("Away Team Over 1.5 Goals", clamp(4+(aGF-1.6)*2.6+(hGA-1.5)*1.8,0,9), ["Elite away attack vs weak home D"], []);
    if(aGF<=0.8&&hGA<=1.0) add("Away Team Under 1.5 Goals", clamp(4+(0.9-aGF)*2.6,0,9), ["Weak away attack, strong home D"], []);
  }

  blocked.push({market:"First Half markets", why:"No first-half data fetched - blocked (Module G)."});
  blocked.push({market:"Corners", why:"No corner data - blocked (Module I)."});
  blocked.push({market:"Cards", why:"No card/referee data - blocked (Module J)."});

  const playable = cand.filter(c=>c.conf>=7).sort((a,b)=>b.conf-a.conf);

  // CONFLICT REFINEMENT: markets that AGREE directionally shouldn't cancel each
  // other. If a DNB and a Double Chance for the SAME side both rank top, drop
  // the Double Chance and keep the DNB (tighter, higher-value bet). Same for a
  // Win and its own DNB/DC. Only genuinely CONTRADICTORY markets (e.g. Over vs
  // Under, Home vs Away) within 1 point trigger the No-Bet rule.
  function sideOf(mkt){
    if (/Home Win|Home DNB|Double Chance 1X|Home Team Over/.test(mkt)) return "home";
    if (/Away Win|Away DNB|Double Chance X2|Away Team Over/.test(mkt)) return "away";
    if (/Over|BTTS Yes/.test(mkt)) return "goals";
    if (/Under|BTTS No/.test(mkt)) return "nogoals";
    return "other";
  }
  // remove a redundant Double Chance when its same-side DNB is also present & >=
  const hasHomeDNB = playable.find(c=>c.market==="Home DNB");
  const hasAwayDNB = playable.find(c=>c.market==="Away DNB");
  const refined = playable.filter(c=>{
    if (c.market==="Double Chance 1X" && hasHomeDNB && hasHomeDNB.conf>=c.conf) return false;
    if (c.market==="Double Chance X2" && hasAwayDNB && hasAwayDNB.conf>=c.conf) return false;
    return true;
  });

  let primary="No Bet", confidence=0, passed=[], failed=[], verdict="";
  if (!refined.length) {
    verdict = sameTier ? "Same tier - No Bet (Rule 3)." : hardRedFlag ? "Red flag - No Bet (Rule 4)." : "No market reached confidence 7 - No Bet (Rule 5).";
  } else if (refined.length>=2 && (refined[0].conf - refined[1].conf) < 1 && sideOf(refined[0].market) !== sideOf(refined[1].market)) {
    // top two within 1 point AND they point different directions -> genuine conflict
    verdict = "Conflict: " + refined[0].market + " (" + refined[0].conf + ") vs " + refined[1].market + " (" + refined[1].conf + ") within 1 point, opposing markets - No Bet.";
  } else {
    const top = refined[0];
    primary = top.market; confidence = top.conf; passed = top.passed; failed = top.failed;
    const tierName = confidence>=10?"Elite Banker":confidence>=9?"Banker":confidence>=8?"Strong":"Playable";
    verdict = primary + " - " + tierName + " (confidence " + confidence + "). Single strongest edge.";
  }
  return { match:m, engine:"ultra", primary, confidence, bet:primary!=="No Bet", banker: confidence>=8 && !hasNoStandings(m), passed, failed, blocked, humanChecks, allScores:cand.sort((a,b)=>b.conf-a.conf), verdict };
}

/* ============================================================
   PREDICT2U RULES ENGINE v2.0 — "Rules Pro"
   Implements the Universal Thresholds spec with EXACT numeric gates
   per market. Where the spec needs stats we don't fetch (Win%, Clean
   Sheet%, Failed-to-Score%, Unbeaten%), we ESTIMATE them from PPG /
   goals and FLAG the pick as using estimates (est:true) so it's honest.
   One match = one strongest qualifying market, else No Bet.
   ------------------------------------------------------------------- */

// --- estimation helpers (proxies from data we DO have) ---
// Win rate % estimated from PPG. PPG 3.0 -> ~100% wins, 1.5 -> ~38%, 1.0 -> ~22%.
function estWinRate(ppg){ if(ppg==null) return null; return clamp((ppg-0.4)/2.7,0,1); }
// Unbeaten % from PPG (draws+wins). Higher PPG -> rarely loses.
function estUnbeaten(ppg){ if(ppg==null) return null; return clamp((ppg-0.2)/2.6,0,1); }
// Clean sheet % from goals conceded/game. 0.6->~55%, 1.0->~38%, 1.8->~12%.
function estCleanSheet(gc){ if(gc==null) return null; return clamp(0.62-(gc-0.6)*0.30,0,0.75); }
// Failed-to-score % from goals scored/game. 2.2->~8%, 1.4->~22%, 0.8->~42%.
function estFTS(gf){ if(gf==null) return null; return clamp(0.50-(gf-0.7)*0.22,0.05,0.7); }

// ---- GENUINE-FAVORITE FILTER (v80) ----------------------------------------
// Distinguishes a RELATIVE favorite (only better than a weak opponent) from a
// GENUINE strong favorite with absolute quality. Used to withhold Team Over 1.5
// from teams that are merely relatively better (the "Bentleigh Greens" problem:
// big table edge, but PPG < 1.0 — the standings alone don't prove they score 2+).
// Absolute thresholds: PPG 1.50+, win rate 45%+, GD/game > 0, scoring 1.40+,
// form 7+/15. Returns true only when EVERY available metric passes; a metric
// that's missing (null) does not count as a pass, so we fail safe (withhold).
function genuineFavorite(ppg, winRate, gdPerGame, scoreAvg, form15){
  if(ppg==null || winRate==null || gdPerGame==null || scoreAvg==null || form15==null) return false;
  return ppg>=1.50 && winRate>=0.45 && gdPerGame>0 && scoreAvg>=1.40 && form15>=7;
}

function rulesProRecommend(m){
  const size = m.tableSize ?? 20;
  const blocked = [];
  if(!dataQualityOK(m)) return { match:m, engine:"rulespro", primary:"No Bet", confidence:0, bet:false, banker:false, note:"", usedEstimates:false, blocked:[], humanChecks:[], verdict:"Low-quality data — skipped." };
  const humanChecks = ["Verify manually: derby, rotation, suspicious odds movement, weather, neutral venue, dead rubber, motivation."];
  let usedEstimates = false;

  const homeTier = tierFromProfile(m,'home');
  const awayTier = tierFromProfile(m,'away');
  const gap = (homeTier!=null&&awayTier!=null) ? Math.abs(homeTier-awayTier) : null;
  const sameTier = (homeTier!=null&&awayTier!=null&&homeTier===awayTier);

  const hPPG = venuePPG(m.homeVenuePts,m.homeVenueGames,m.homeVenueRank,m.venueTableSize??size);
  const aPPG = venuePPG(m.awayVenuePts,m.awayVenueGames,m.awayVenueRank,m.venueTableSize??size);
  const hGF=m.homeScoredAtHome??null, hGA=m.homeConcededAtHome??null;
  const aGF=m.awayScoredAway??null,   aGA=m.awayConcededAway??null;
  const hForm=m.homeForm?formPoints(m.homeForm)*15:null; // 0-1 -> 0-15 pts scale
  const aForm=m.awayForm?formPoints(m.awayForm)*15:null;
  const hGD=m.homeGD!=null&&m.gamesPlayed?m.homeGD/m.gamesPlayed:(m.homeGDpg??null);
  const aGD=m.awayGD!=null&&m.gamesPlayed?m.awayGD/m.gamesPlayed:(m.awayGDpg??null);
  const la=m.leagueAvg; const lgGpg=(la&&la.reliable&&la.goalsPerGame)?la.goalsPerGame:2.6;
  const combGoals=(hGF!=null&&aGF!=null)?hGF+aGF:null;

  // estimated percentages — but PREFER REAL stats from the fetcher when present.
  const hWin=m.homeWinRate??estWinRate(hPPG), aWin=m.awayWinRate??estWinRate(aPPG);
  const hUnb=m.homeUnbeatenRate??estUnbeaten(hPPG), aUnb=m.awayUnbeatenRate??estUnbeaten(aPPG);
  const hCS=m.homeCleanSheetRate??estCleanSheet(hGA), aCS=m.awayCleanSheetRate??estCleanSheet(aGA);
  const hFTS=m.homeFailedToScoreRate??estFTS(hGF), aFTS=m.awayFailedToScoreRate??estFTS(aGF);
  const statsAreReal = !!m.statsReal;
  const combFTS=(hFTS!=null&&aFTS!=null)?(hFTS+aFTS)/2:null;
  const combBTTS=(hGF!=null&&aGF!=null&&hGA!=null&&aGA!=null)
    ? clamp(((hGF>=1.2?0.55:0.4)+(aGF>=1.0?0.5:0.35)+(hGA>=1.1?0.55:0.4)+(aGA>=1.1?0.55:0.4))/4,0,1) : null;
  const markEst=()=>{ if(!statsAreReal) usedEstimates=true; };

  const cand=[];
  const add=(market,conf,note,est)=>{ if(est)markEst(); cand.push({market,conf:clamp(Math.round(conf),0,10),note:note||""}); };

  let hardRedFlag=false;
  if(m.isKnockout){ blocked.push({market:"All",why:"Cup/knockout — red flag."}); hardRedFlag=true; }

  const canScore = !hardRedFlag && !sameTier;
  const strongerHome = (gap!=null) && homeTier<awayTier;

  if(canScore && gap!=null){
    // ---- HOME WIN (all required) ----
    if(strongerHome){
      const ok = gap>=2 && hPPG!=null&&hPPG>=2.50 && hGF!=null&&hGF>=1.80 && aGA!=null&&aGA>=1.40
        && hWin!=null&&hWin>=0.70 && hForm!=null&&hForm>=10 && hGD!=null&&hGD>=0.70;
      if(ok){ let c=8; if(gap>=3)c++; if(hGF>=2.2)c++; add("Home Win",c,"All Home Win thresholds met (win% & form estimated).",true); }
      else blocked.push({market:"Home Win",why:"One or more Home Win thresholds not met."});
    }
    // ---- AWAY WIN (all required) ----
    if(!strongerHome){
      // home weakness test (≥4 of 6)
      const wk=[ m.homeVenueRank!=null&&m.homeVenueRank>(size-5), hGF!=null&&hGF<1.0, hGA!=null&&hGA>=1.6,
                 hForm!=null&&hForm<6, !(m.homeMotivation), gap>=2 ].filter(Boolean).length;
      const ok = gap>=2 && aPPG!=null&&aPPG>=2.50 && aGF!=null&&aGF>=1.70 && hGA!=null&&hGA>=1.50
        && aWin!=null&&aWin>=0.65 && aForm!=null&&aForm>=10 && wk>=4;
      if(ok){ let c=8; if(gap>=3)c++; if(aGF>=2.0)c++; add("Away Win",c,`All Away Win thresholds met; home weakness ${wk}/6 (win% & form estimated).`,true); }
      else blocked.push({market:"Away Win",why:"One or more Away Win thresholds not met."});
    }
    // ---- HOME DNB ----
    if(strongerHome && !cand.find(c=>c.market==="Home Win")){
      const ok = hPPG!=null&&hPPG>=1.80 && gap>=1 && hWin!=null&&hWin>=0.55 && hForm!=null&&hForm>=9 && hGF!=null&&hGF>=1.50;
      if(ok){ let c=7; if(gap>=3)c++; if(hPPG>=2.2)c++; add("Home DNB",c,"Home DNB thresholds met (win% estimated).",true); }
    }
    // ---- AWAY DNB ----
    if(!strongerHome && !cand.find(c=>c.market==="Away Win")){
      const ok = aPPG!=null&&aPPG>=1.80 && gap>=1 && aWin!=null&&aWin>=0.50 && aForm!=null&&aForm>=9 && aGF!=null&&aGF>=1.40;
      if(ok){ let c=7; if(gap>=3)c++; if(aPPG>=2.2)c++; add("Away DNB",c,"Away DNB thresholds met (win% estimated).",true); }
    }
    // ---- DOUBLE CHANCE 1X / X2 / 12 ----
    if(strongerHome && hUnb!=null&&hUnb>=0.80 && aWin!=null&&aWin<=0.30 && hPPG!=null&&hPPG>=1.80)
      add("Double Chance 1X",7,"1X thresholds met (unbeaten% & win% estimated).",true);
    if(!strongerHome && aUnb!=null&&aUnb>=0.75 && hWin!=null&&hWin<=0.35 && aPPG!=null&&aPPG>=1.80)
      add("Double Chance X2",7,"X2 thresholds met (unbeaten% & win% estimated).",true);
    const combDraw=(m.homeDrawRate!=null&&m.awayDrawRate!=null)?(m.homeDrawRate+m.awayDrawRate)/2:(la&&la.drawRate?la.drawRate:null);
    if(combDraw!=null&&combDraw<=0.20 && combGoals!=null&&combGoals>=2.80)
      add("Double Chance 12",7,"12 thresholds met (low draw rate, high goals).",false);
  }

  // ---- GOALS MARKETS (tier-independent, but blocked on same-tier per spec safety) ----
  if(canScore){
    const favScores = strongerHome ? hGF : aGF;
    const oppConcedes = strongerHome ? aGA : hGA;
    // OVER 1.5
    if(combGoals!=null && combGoals>=2.30 && (hGF>=1.5||aGF>=1.5) && (hGA>=1.30||aGA>=1.30) && combFTS!=null&&combFTS<=0.45)
      add("Over 1.5",7+(combGoals>=2.8?1:0),"Over 1.5 thresholds met (FTS% estimated).",true);
    // OVER 2.5
    if(combGoals!=null && combGoals>=3.00 && combBTTS!=null&&combBTTS>=0.60 && favScores!=null&&favScores>=1.80 && oppConcedes!=null&&oppConcedes>=1.50)
      add("Over 2.5",7+(combGoals>=3.4?1:0)+(combGoals>=3.8?1:0),"Over 2.5 thresholds met (BTTS% estimated).",true);
    // UNDER 2.5
    if(combGoals!=null && combGoals<=2.10 && combBTTS!=null&&combBTTS<=0.40 && hGF!=null&&hGF<=1.20 && aGF!=null&&aGF<=1.20 && (hGA<=1.00||aGA<=1.00))
      add("Under 2.5",7+(combGoals<=1.8?1:0),"Under 2.5 thresholds met (BTTS% estimated).",true);
    // UNDER 3.5
    const underdogScores = strongerHome ? aGF : hGF;
    if(combGoals!=null && combGoals<=2.80 && (strongerHome?hPPG:aPPG)>=1.8 && underdogScores!=null&&underdogScores<=1.00)
      add("Under 3.5",7,"Under 3.5 thresholds met (favourite controls, weak underdog attack).",false);
    // ---- BTTS YES / NO ----
    if(hGF!=null&&aGF!=null&&hGA!=null&&aGA!=null){
      if(hGF>=1.40 && aGF>=1.20 && hGA>=1.00 && aGA>=1.00 && (hCS+aCS)/2<=0.60 && combFTS<=0.35)
        add("BTTS Yes",7+(hGF>=1.7&&aGF>=1.5?1:0),"BTTS Yes thresholds met (CS% & FTS% estimated).",true);
      const oneWeakAtt=Math.min(hGF,aGF), oppConc=(hGF<aGF?aGA:hGA), oppCS=(hGF<aGF?aCS:hCS), weakFTS=(hGF<aGF?hFTS:aFTS);
      if(oneWeakAtt<=0.90 && oppConc<=1.00 && weakFTS>=0.40 && oppCS>=0.40)
        add("BTTS No",7,"BTTS No thresholds met (FTS% & CS% estimated).",true);
    }
    // ---- TEAM GOALS ----
    if(hGF!=null&&aGA!=null){
      if(hGF>=2.00 && aGA>=1.50 && hFTS!=null&&hFTS<=0.20){
        if(genuineFavorite(hPPG,hWin,hGD,hGF,hForm)) add("Home Team Over 1.5 Goals",7,"Home O1.5 thresholds met, home is a genuine favorite (FTS% estimated).",true);
        else blocked.push({market:"Home Team Over 1.5 Goals",why:"Relative favorite only (fails absolute quality: PPG/win%/GD/scoring/form) — Over 1.5 withheld; standings edge alone doesn't prove 2+ goals."});
      }
      if(hGF<=1.10 && aGA<=1.00 && hFTS!=null&&hFTS>=0.35) add("Home Team Under 1.5 Goals",7,"Home U1.5 thresholds met (FTS% estimated).",true);
    }
    if(aGF!=null&&hGA!=null){
      if(aGF>=1.80 && hGA>=1.50 && aFTS!=null&&aFTS<=0.20){
        if(genuineFavorite(aPPG,aWin,aGD,aGF,aForm)) add("Away Team Over 1.5 Goals",7,"Away O1.5 thresholds met, away is a genuine favorite (FTS% estimated).",true);
        else blocked.push({market:"Away Team Over 1.5 Goals",why:"Relative favorite only (fails absolute quality: PPG/win%/GD/scoring/form) — Over 1.5 withheld; standings edge alone doesn't prove 2+ goals."});
      }
      if(aGF<=1.00 && hGA<=1.00 && aFTS!=null&&aFTS>=0.35) add("Away Team Under 1.5 Goals",7,"Away U1.5 thresholds met (FTS% estimated).",true);
    }
  }

  blocked.push({market:"First Half / Corners / Cards",why:"No data — blocked."});

  // ---- FINAL DECISION ----
  const playable=cand.filter(c=>c.conf>=7).sort((a,b)=>b.conf-a.conf);
  let primary="No Bet", confidence=0, note="", verdict="";
  if(!playable.length){
    verdict = sameTier?"Same tier — No Bet.":hardRedFlag?"Red flag — No Bet.":"No market met its full threshold set — No Bet.";
  } else if(playable.length>=2 && (playable[0].conf-playable[1].conf)<1){
    verdict = `Conflict: ${playable[0].market} (${playable[0].conf}) vs ${playable[1].market} (${playable[1].conf}) within 1 pt — No Bet.`;
  } else {
    const top=playable[0]; primary=top.market; confidence=top.conf; note=top.note;
    const tier=confidence>=10?"Elite Banker":confidence>=9?"Banker":confidence>=8?"Strong":"Playable";
    verdict=`${primary} — ${tier} (confidence ${confidence}). ${note}`;
  }

  return { match:m, engine:"rulespro", primary, confidence, bet:primary!=="No Bet",
           banker:confidence>=8 && !hasNoStandings(m), note, usedEstimates, blocked, humanChecks,
           allScores:cand.sort((a,b)=>b.conf-a.conf), verdict };
}

/* ============================================================
   APEX BANKERS — Elite thresholds + HOME ADVANTAGE UPSET PROTECTION
   Runs the Elite (rulesPro) engine, then applies the Home Advantage
   layer: away markets must prove MORE; home markets get natural
   protection. Resistant home sides block/penalise away picks.
   (Win%, unbeaten%, clean-sheet%, FTS% are ESTIMATED — flagged.)
   ------------------------------------------------------------------- */
function apexRecommend(m){
  if(!dataQualityOK(m)) return { match:m, engine:"apex", primary:"No Bet", confidence:0, bet:false, banker:false, usedEstimates:false, blocked:[], humanChecks:[], allScores:[], homeResistant:false, resistScore:0, verdict:"Low-quality data — skipped." };
  const base = rulesProRecommend(m); // Elite pick first
  const size = m.tableSize ?? 20;

  // home stats + estimates
  const hPPG = venuePPG(m.homeVenuePts,m.homeVenueGames,m.homeVenueRank,m.venueTableSize??size);
  const aPPG = venuePPG(m.awayVenuePts,m.awayVenueGames,m.awayVenueRank,m.venueTableSize??size);
  const hGF=m.homeScoredAtHome??null, hGA=m.homeConcededAtHome??null;
  const aGF=m.awayScoredAway??null;
  const hForm=m.homeForm?formPoints(m.homeForm)*15:null;
  const hUnb=m.homeUnbeatenRate??estUnbeaten(hPPG), aUnb=m.awayUnbeatenRate??estUnbeaten(aPPG);
  const hWin=m.homeWinRate??estWinRate(hPPG), aWin=m.awayWinRate??estWinRate(aPPG);
  const hCS=m.homeCleanSheetRate??estCleanSheet(hGA), hFTS=m.homeFailedToScoreRate??estFTS(hGF);
  const apexStatsReal = !!m.statsReal;
  const homeTier=tierFromProfile(m,'home'), awayTier=tierFromProfile(m,'away');
  const awayTierAdv=(homeTier!=null&&awayTier!=null)?(homeTier-awayTier):0; // away stronger => positive

  // ---- HOME RESISTANCE TEST (≥3 of 6) ----
  const resist=[
    hPPG!=null&&hPPG>=1.50,
    hUnb!=null&&hUnb>=0.60,
    hGF!=null&&hGF>=1.20,
    hGA!=null&&hGA<=1.30,
    hFTS!=null&&hFTS<=0.30,
    hForm!=null&&hForm>=7
  ].filter(Boolean).length;
  const homeResistant = resist>=3;
  const homeDefResistant = (hGA!=null&&hGA<=1.20) && (hCS!=null&&hCS>=0.35);

  const notes=[];
  let primary=base.primary, confidence=base.confidence, verdict=base.verdict, bet=base.bet;
  const isAwayMkt = /Away Win|Away DNB|Double Chance X2|Away Team Over/.test(primary);
  const isHomeMkt = /Home Win|Home DNB|Double Chance 1X|Home Team Over/.test(primary);

  if(homeResistant && isAwayMkt){
    notes.push(`Home resistant (${resist}/6) — away market scrutinised.`);
    if(primary==='Away Win'){
      // block away win -> downgrade to Away DNB or No Bet
      primary='Away DNB'; verdict='Away Win blocked by home resistance → downgraded to Away DNB.';
    }
    if(primary==='Away DNB'){
      const survive = awayTierAdv>=2 && aPPG!=null&&aPPG>=1.80 && aUnb!=null&&aUnb>=0.70 && aGF!=null&&aGF>=1.40;
      if(!survive){ primary='No Bet'; bet=false; confidence=0; verdict=`Away DNB blocked — home resistant and away edge not strong enough (needs tier+2, PPG≥1.8, unbeaten≥70%, GF≥1.4).`; }
    }
    if(primary==='Double Chance X2'){
      const survive = aUnb!=null&&aUnb>=0.75 && hWin!=null&&hWin<=0.35 && aPPG!=null&&aPPG>=1.70;
      if(!survive){ primary='No Bet'; bet=false; confidence=0; verdict='X2 blocked — home resistant and away not dominant enough.'; }
    }
    if(/Away Team Over/.test(primary) && homeDefResistant){
      primary='No Bet'; bet=false; confidence=0; verdict='Away Over 1.5 blocked — home defence resistant (concedes ≤1.20, clean-sheet ≥35%).';
    }
  }

  // ---- HOME ADVANTAGE BOOST (home markets) ----
  if(bet && isHomeMkt){
    const boost = hPPG!=null&&hPPG>=1.80 && hUnb!=null&&hUnb>=0.70 && hGF!=null&&hGF>=1.50 && (m.awayConcededAway!=null&&m.awayConcededAway>=1.40) && aWin!=null&&aWin<=0.30;
    if(boost){ confidence=Math.min(10,confidence+1); notes.push('Home advantage boost (+1): strong home, weak away.'); }
  }

  // ---- AWAY MARKET PENALTY ----
  if(bet && isAwayMkt && primary!=='No Bet'){
    const penalise = hPPG!=null&&hPPG>=1.50 && hUnb!=null&&hUnb>=0.60 && hGF!=null&&hGF>=1.20 && hGA!=null&&hGA<=1.30;
    if(penalise){
      confidence=Math.max(0,confidence-1.5);
      notes.push('Away penalty (−1.5): home has natural advantage.');
      if(confidence<8){ primary='No Bet'; bet=false; verdict='Away confidence fell below 8 after home-advantage penalty → No Bet.'; }
    }
  }

  if(primary==='No Bet'){ bet=false; confidence=0; }
  const banker = bet && confidence>=8 && !hasNoStandings(m);
  const extra = notes.length?(' '+notes.join(' ')):'';

  return {
    match:m, engine:'apex', primary, confidence, bet,
    banker, usedEstimates: !apexStatsReal,
    blocked: base.blocked, humanChecks: base.humanChecks,
    allScores: base.allScores,
    homeResistant, resistScore:resist,
    verdict: (verdict||base.verdict)+extra
  };
}

/* ============================================================
   PRIME BANKERS ENGINE 1.0 — "Only true teams qualify."
   Ratio-based strict filter. Classifies the league by LATG, applies
   per-league Prime thresholds, computes attack/defence RATIOS (vs league
   avg) AND raw floors (ratio must be confirmed by raw GA — no ratio-only
   upgrades), runs true-team / true-defence checks, compression filters,
   a market-confirmation overlay (when odds exist), then a risk-point
   tiering. Outputs ONE market or No Bet.
   Probability/market parts are DERIVED from win-rate/odds and flagged.
   ------------------------------------------------------------------- */
function primeRecommend(m){
  const size = m.tableSize ?? 20;
  if(!dataQualityOK(m)) return primeOut(m,"No Bet","No Bet",99,["Low-quality data — skipped."],"Unknown",null);
  // FRIENDLIES / table-less: use the shared friendly approach (never a banker).
  const lname = String(m.league||'').toLowerCase();
  const isFriendly = lname.includes('friendl');
  if(isFriendly){
    const fl = friendlyLean(m);
    if(!fl) return primeOut(m,"No Bet","No Bet",99,["Friendly with no goal data — no lean."],"Friendly",null);
    if(fl.market==="No Bet") return primeOut(m,"No Bet","No Bet",99,[fl.reason],"Friendly",null);
    return primeOut(m, fl.market, "Friendly Lean", 10-fl.conf, [fl.reason], "Friendly", null);
  }
  const la = m.leagueAvg;
  // league average team goals (per team per game)
  const latgTeam = (la && la.reliable && la.goalsPerGame) ? la.goalsPerGame/2 : 1.35;
  const LATG = latgTeam*2;

  // ---- league classification ----
  let leagueType, T;
  if (LATG < 2.30) leagueType="Low-Scoring";
  else if (LATG <= 2.85) leagueType="Medium-Scoring";
  else if (LATG <= 3.30) leagueType="High-Scoring";
  else leagueType="Inflated-Chaos";

  // ---- Prime thresholds per league (strongAtt, eliteAtt, leaky, vleaky, o15, o25, u35, rawLeaky, rawVleaky) ----
  const TBL = {
    "Low-Scoring":    {sa:1.35,ea:1.65,lk:1.45,vl:1.80,o15:1.10,o25:1.45,u35:1.05,rlk:1.65,rvl:2.00},
    "Medium-Scoring": {sa:1.30,ea:1.60,lk:1.35,vl:1.70,o15:1.05,o25:1.40,u35:1.02,rlk:1.55,rvl:1.90},
    "High-Scoring":   {sa:1.25,ea:1.55,lk:1.30,vl:1.65,o15:1.00,o25:1.35,u35:0.98,rlk:1.80,rvl:2.25},
    "Inflated-Chaos": {sa:1.25,ea:1.55,lk:1.30,vl:1.60,o15:1.05,o25:1.40,u35:0.95,rlk:2.30,rvl:2.75},
  };
  T = TBL[leagueType];

  // ---- core rates ----
  const hGF=m.homeScoredAtHome, hGA=m.homeConcededAtHome, aGF=m.awayScoredAway, aGA=m.awayConcededAway;
  if(hGF==null||hGA==null||aGF==null||aGA==null){
    return primeOut(m,"No Bet","No Bet",99,["Insufficient goal data."],leagueType,null);
  }
  // ratios vs league avg team goals
  const hAR=hGF/latgTeam, aAR=aGF/latgTeam;          // attack ratios
  const hDR=hGA/latgTeam, aDR=aGA/latgTeam;          // defensive ratios (higher=concedes more)

  // ---- EXPECTED GOALS spine (opponent-adjusted, replaces the muddy index) ----
  // home attack vs away defence, away attack vs home defence — geometric blend
  // anchored to the league baseline (same proven form as the Value engine).
  const xgHome = latgTeam * Math.sqrt((hGF/latgTeam) * (aGA/latgTeam));
  const xgAway = latgTeam * Math.sqrt((aGF/latgTeam) * (hGA/latgTeam));
  const xgTotal = xgHome + xgAway;
  // goalIndex now reflects the EXPECTED total for THIS match vs the league total
  // (1.0 = a league-average match), not a flat sum of all four rates.
  const goalIndex = xgTotal / LATG;

  // ---- true defence checks (ratio AND raw must both confirm) ----
  const homeDefLeaky  = (hDR>=T.lk && hGA>=T.rlk);
  const homeDefVleaky = (hDR>=T.vl && hGA>=T.rvl);
  const awayDefLeaky  = (aDR>=T.lk && aGA>=T.rlk);
  const awayDefVleaky = (aDR>=T.vl && aGA>=T.rvl);

  // ---- probabilities (DERIVED — real win-rate biased by table gap, refined by odds) ----
  const o=m.odds;
  const impl = (x)=> x? 1/x : null;
  let pHome = impl(o&&o.home), pDraw=impl(o&&o.draw), pAway=impl(o&&o.away);
  if(pHome&&pDraw&&pAway){ const s=pHome+pDraw+pAway; pHome/=s; pDraw/=s; pAway/=s; } // normalise
  const hasMarket = !!(pHome&&pAway);
  // When no odds: derive an OPPONENT-AWARE probability from the expected-goals
  // gap (a +1.0 xG edge ≈ strong favourite), blended with the team's win-rate.
  // This no longer ignores the opponent the way raw win-rate did.
  const xgEdge = xgHome - xgAway;                 // + = home favoured
  const xgToProb = (edge)=> 1/(1+Math.exp(-edge*0.9)); // logistic on goal-diff
  const hWinR = m.homeWinRate ?? null, aWinR=m.awayWinRate ?? null;
  const derivedHome = hWinR!=null ? (0.5*xgToProb(xgEdge)+0.5*hWinR) : xgToProb(xgEdge);
  const derivedAway = aWinR!=null ? (0.5*xgToProb(-xgEdge)+0.5*aWinR) : xgToProb(-xgEdge);
  const homeWinProb = hasMarket? pHome : derivedHome;
  const awayWinProb = hasMarket? pAway : derivedAway;

  // ---- tiers / positions / compression ----
  const tier=(pos)=>{
    if(pos==null) return null;
    if(size>=18){ if(pos<=4)return 1; if(pos<=8)return 2; if(pos<=14)return 3; if(pos<=17)return 4; return 5; }
    if(size>=15){ if(pos<=3)return 1; if(pos<=6)return 2; if(pos<=11)return 3; if(pos<=14)return 4; return 5; }
    if(size>=12){ if(pos<=3)return 1; if(pos<=5)return 2; if(pos<=8)return 3; if(pos<=10)return 4; return 5; }
    if(size>=10){ if(pos<=2)return 1; if(pos<=4)return 2; if(pos<=7)return 3; if(pos<=9)return 4; return 5; }
    if(pos<=2)return 1; if(pos<=5)return 2; return 3;
  };
  const hTier=tier(m.homePos), aTier=tier(m.awayPos);
  const sameTier = (hTier!=null&&aTier!=null&&hTier===aTier);
  const topClash = (hTier===1&&aTier===1);
  const posGap = (m.homePos!=null&&m.awayPos!=null)? Math.abs(m.homePos-m.awayPos) : null;

  // ---- candidate evaluation with risk points ----
  // helper: count true conditions
  const cnt = (...c)=>c.filter(Boolean).length;
  const cands=[]; // {market, risk, reasons[]}
  const homeStronger = (m.homePos!=null&&m.awayPos!=null) ? m.homePos<m.awayPos : hAR>aAR;
  const favWinProb = homeStronger? homeWinProb : awayWinProb;

  // base risk from sample/compression that applies broadly
  function baseRisk(market, aggressive){
    let r=0;
    if(m.gamesPlayed!=null && m.gamesPlayed<6) r+=1;
    if(m.gamesPlayed!=null && m.gamesPlayed<5) r+=1;
    if(sameTier) r+=1;
    if(topClash && aggressive) r+=2;
    if(posGap!=null && posGap<=2) r+=1;
    else if(posGap!=null && posGap<=5) r+=1;
    return r;
  }

  // ---- OVER 1.5 ----
  {
    const weakerAR=Math.min(hAR,aAR);
    const oneTeamDep = weakerAR<0.85;
    const conds = cnt(hAR>=T.sa||aAR>=T.sa, homeDefLeaky||awayDefLeaky, (hGF+aGF)>=LATG*0.9, favWinProb>=0.55, hasMarket&&((pHome+pAway)>0.6), !sameTier, weakerAR>=0.85);
    // tighter: expected total must genuinely support 2+ goals, not just clear the index
    let ok = goalIndex>=T.o15 && xgTotal>=2.05 && conds>=2;
    if(oneTeamDep){
      const trig = cnt((Math.max(hAR,aAR))>=T.ea, homeDefLeaky||awayDefLeaky, favWinProb>=0.60, goalIndex>=1.20);
      if(trig<1) ok=false;
    }
    if(ok){
      let r=baseRisk("Over 1.5",true);
      if(oneTeamDep) r+=2;
      if(xgTotal<2.4) r+=1; // thinner cushion → more risk
      cands.push({market:"Over 1.5", risk:r, reasons:[`Expected goals ${xgTotal.toFixed(2)} (index ${(goalIndex*100|0)}%); ${conds} confirmations.`]});
    }
  }

  // ---- OVER 2.5 (hard) ----
  {
    const conds = cnt(hAR>=T.sa&&aAR>=T.sa, hAR>=T.ea||aAR>=T.ea, homeDefVleaky||awayDefVleaky, homeDefLeaky&&awayDefLeaky, hasMarket&&((pHome+pAway)>0.62), !sameTier, !topClash, (hGA>=T.rlk||aGA>=T.rlk), (hAR>=1.0&&aAR>=1.0));
    let ok = goalIndex>=T.o25 && xgTotal>=2.85 && conds>=3;
    if(sameTier){ ok = goalIndex>=1.50 && xgTotal>=3.1 && (homeDefVleaky||awayDefVleaky) && (hAR>=1.0&&aAR>=1.0); }
    if(ok){
      let r=baseRisk("Over 2.5",true);
      if(sameTier) r+=3;
      cands.push({market:"Over 2.5", risk:r, reasons:[`Goal Index ${(goalIndex*100|0)}% with ${conds} aggressive confirmations.`]});
    }
  }

  // ---- UNDER 3.5 (protection) ----
  {
    const highScoring = (leagueType==="High-Scoring"||leagueType==="Inflated-Chaos"||
                         (leagueType==="Medium-Scoring" && goalIndex>=1.00));
    let ok = (goalIndex<=T.u35 && xgTotal<=2.7) || (sameTier && goalIndex<1.10 && xgTotal<=2.9);
    // In high-scoring leagues, goals are the natural state — Under 3.5 only
    // qualifies if the game is GENUINELY extreme (very controlled).
    if(highScoring){
      ok = (goalIndex<=T.u35*0.92) && xgTotal<=2.6 && (sameTier || (hAR<0.85 && aAR<0.85));
    }
    // avoid conditions
    if(goalIndex>1.20 || xgTotal>3.0 || homeDefVleaky||awayDefVleaky || hAR>=T.ea) ok=false;
    if(ok){
      let r=baseRisk("Under 3.5",false);
      r-=1; // under in compressed match relief
      if(highScoring) r+=1; // less relief in goal-friendly leagues
      cands.push({market:"Under 3.5", risk:Math.max(0,r), reasons:[`Controlled profile (Goal Index ${(goalIndex*100|0)}%)${highScoring?' — extreme control in a high-scoring league':''}.`]});
    }
  }

  // ---- TEAM OVER 1.5 (true team) ----
  function teamOver15(side){
    const AR=side==='home'?hAR:aAR, oppLeaky=side==='home'?awayDefLeaky:homeDefLeaky, oppVleaky=side==='home'?awayDefVleaky:homeDefLeaky;
    const winP=side==='home'?homeWinProb:awayWinProb, oppAR=side==='home'?aAR:hAR;
    const tableAdv=side==='home'?(homeStronger):(!homeStronger);
    const conds=cnt(AR>=T.sa, AR>=T.ea, oppLeaky, oppVleaky, winP>=0.58, tableAdv&&posGap!=null&&posGap>=6, oppAR<0.80, goalIndex>=1.20, hasMarket&&winP>=0.5);
    let ok=conds>=3;
    if(sameTier||topClash){ ok = AR>=T.ea && oppLeaky && winP>=0.60; }
    if(ok){
      let r=baseRisk("Team Over 1.5",true);
      if(sameTier||topClash) r+=3;
      cands.push({market:(side==='home'?"Home":"Away")+" Team Over 1.5 Goals", risk:r, reasons:[`True-team check ${conds} confirmations.`]});
    }
  }
  teamOver15('home'); teamOver15('away');

  // ---- TEAM OVER 0.5 (safer substitute) ----
  function teamOver05(side){
    const AR=side==='home'?hAR:aAR, oppElite=(side==='home'?aDR:hDR)<0.7; // opponent elite defence
    const ok = AR>=1.0 && !oppElite && goalIndex>=0.90;
    if(ok){
      let r=baseRisk("Team Over 0.5",false);
      cands.push({market:(side==='home'?"Home":"Away")+" Team Over 0.5 Goals", risk:r, reasons:[`Attack ratio ${(AR*100|0)}% with scoring route.`]});
    }
  }
  teamOver05('home'); teamOver05('away');

  // ---- BTTS ----
  {
    const bothRoute = hAR>=0.85 && aAR>=0.85;
    const extra = cnt(homeDefLeaky||awayDefLeaky, (hGF>=latgTeam||aGF>=latgTeam), hasMarket, goalIndex>=1.20);
    if(bothRoute && extra>=1 && !(hAR<0.75||aAR<0.75)){
      let r=baseRisk("BTTS Yes",true);
      if(sameTier&&topClash) r+=1;
      if(leagueType==="Low-Scoring") r+=1;
      cands.push({market:"BTTS Yes", risk:r, reasons:[`Both attacks ≥85% with ${extra} support.`]});
    }
    const oneWeak = hAR<0.75||aAR<0.75;
    if(oneWeak && goalIndex<1.00){
      let r=baseRisk("BTTS No",false);
      cands.push({market:"BTTS No", risk:r, reasons:[`One weak attack; low goal index.`]});
    }
  }

  // ---- WIN / DNB / DOUBLE CHANCE ----
  {
    const favSide=homeStronger?'home':'away';
    const favAR=homeStronger?hAR:aAR, oppLeaky=homeStronger?awayDefLeaky:homeDefLeaky;
    const clearGap = posGap!=null && posGap>=6;
    // straight win
    if(favWinProb>=0.60 && (favAR>=T.sa) && oppLeaky && clearGap && !sameTier){
      let r=baseRisk("Win",false);
      cands.push({market:(homeStronger?"Home":"Away")+" Win", risk:r, reasons:[`Win prob ${(favWinProb*100|0)}%, strong attack, leaky opp, clear gap.`]});
    }
    // DNB
    if(favWinProb>=0.50 && favWinProb<0.60 && favAR>=aAR && !sameTier){
      let r=baseRisk("DNB",false);
      cands.push({market:(homeStronger?"Home":"Away")+" DNB", risk:r, reasons:[`Edge present, win not clean (prob ${(favWinProb*100|0)}%).`]});
    }
    // double chance
    if((sameTier || (posGap!=null&&posGap<=5)) && favAR>aAR*0.0 && favWinProb>=0.45){
      let r=baseRisk("DC",false);
      cands.push({market:(homeStronger?"Double Chance 1X":"Double Chance X2"), risk:r, reasons:[`Edge but compression/risk — cover via DC.`]});
    }
  }

  // ---- market disagreement overlay (+2) ----
  cands.forEach(c=>{
    if(hasMarket){
      if(/Home Team|Home Win|Double Chance 1X/.test(c.market) && pHome<0.45) c.risk+=2;
      if(/Away Team|Away Win|Double Chance X2/.test(c.market) && pAway<0.30) c.risk+=2;
      if(/Over 2.5/.test(c.market) && Math.abs(pHome-pAway)<0.08 && sameTier) c.risk+=2;
    }
    // strong favourite relief
    const reliefAR = homeStronger? hAR : aAR;
    const reliefOppDR = homeStronger? aDR : hDR;
    if(favWinProb>=0.60 && (reliefAR>=1.40 || reliefOppDR>=1.40)) c.risk=Math.max(0,c.risk-1);
  });

  // ---- select by final market priority among those within risk budget ----
  if(!cands.length){
    return primeOut(m,"No Bet","No Bet",99,["No market qualified."],leagueType,goalIndex);
  }
  // Over 1.5 leads in any league that isn't genuinely low-scoring — goals are
  // the natural state in medium/high/inflated leagues. Only truly low-scoring
  // leagues keep Under 3.5 as the default protective pick.
  const highScoringLeague = (leagueType==="High-Scoring"||leagueType==="Inflated-Chaos"||
                             (leagueType==="Medium-Scoring" && goalIndex>=1.00));
  const priority = highScoringLeague
    ? ["Over 1.5","Under 3.5","Double Chance 1X","Double Chance X2","Home DNB","Away DNB","Home Team Over 0.5 Goals","Away Team Over 0.5 Goals","Home Win","Away Win","Home Team Over 1.5 Goals","Away Team Over 1.5 Goals","Over 2.5","BTTS Yes","BTTS No"]
    : ["Under 3.5","Over 1.5","Double Chance 1X","Double Chance X2","Home DNB","Away DNB","Home Team Over 0.5 Goals","Away Team Over 0.5 Goals","Home Win","Away Win","Home Team Over 1.5 Goals","Away Team Over 1.5 Goals","Over 2.5","BTTS Yes","BTTS No"];
  cands.sort((a,b)=> a.risk-b.risk || (priority.indexOf(a.market)-priority.indexOf(b.market)));
  const best=cands[0];
  const tierName = best.risk===0?"Elite Banker":best.risk===1?"Tier A Banker":best.risk===2?"Strong Tier B":best.risk===3?"Soft Tier B":best.risk<=5?"Tier C":"No Bet";
  if(best.risk>=6){
    return primeOut(m,"No Bet","No Bet",best.risk,["Best market exceeded risk budget."],leagueType,goalIndex);
  }
  return primeOut(m,best.market,tierName,best.risk,best.reasons,leagueType,goalIndex,!hasMarket);
}

function primeOut(m,market,tierName,risk,reasons,leagueType,goalIndex,derived){
  const banker = (tierName==="Elite Banker"||tierName==="Tier A Banker"||tierName==="Strong Tier B") && !hasNoStandings(m);
  return {
    match:m, engine:"prime", primary:market, bet:market!=="No Bet",
    banker, confidence: Math.max(0,10-risk), riskPoints:risk, tier:tierName,
    leagueType, goalIndex: goalIndex!=null? Math.round(goalIndex*100):null,
    usedEstimates: !!derived,
    verdict: `${market}${market!=="No Bet"?" — "+tierName+" (risk "+risk+")":""}. ${reasons.join(' ')}${derived?' [market derived from win-rate, no odds]':''}`,
    reasons, humanChecks:["Verify: injuries, rotation, motivation, weather."]
  };
}

/* ============================================================
   ULTRA-STRICT: STREAK ENGINE (separate path)
   Fires on STREAK signals alone, independent of the tier engines.
   HONESTY NOTES baked into the labels:
   • Win/Loss streaks are REAL — read from actual recent results (form string).
   • "Scoring/Under trends" are AVG-BASED approximations, NOT true streaks —
     we don't yet fetch per-game goals, so these are labelled "(trend)" so an
     inconsistent average is never mistaken for a hot streak.
   This is the most speculative engine in the app: streaks are weak predictors
   the bookmaker already prices in. Every output is flagged unproven — TRACK
   before trusting.
   ------------------------------------------------------------------- */
function trailingStreak(form, ch) {
  if (!form) return 0;
  const s = String(form).replace(/[^WDL]/gi, "").toUpperCase();
  let n = 0;
  for (let i = s.length - 1; i >= 0; i--) { if (s[i] === ch) n++; else break; }
  return n;
}

/* ============================================================
   VALUE BANKERS — Dixon-Coles / Poisson goal model.
   Estimates each team's expected goals (lambda) for THIS match, applies the
   Dixon-Coles low-score correction, builds the full scoreline probability
   matrix, and reads real probabilities for every market. Safety-optimised:
   picks the highest-probability market clearing a confidence floor. When real
   odds exist, also flags VALUE (model probability beats the bookmaker's).
   Every pick carries a genuine probability, not a threshold pass/fail.
   ------------------------------------------------------------------- */
function factorial(n){ let r=1; for(let i=2;i<=n;i++) r*=i; return r; }
function poissonP(k, lambda){ return Math.pow(lambda,k)*Math.exp(-lambda)/factorial(k); }

function valueRecommend(m){
  if(!dataQualityOK(m)) return valueOut(m,"No Bet",0,null,["Insufficient/low-quality data — skipped."]);
  // Friendlies: use the shared friendly approach, never the blanket model pick.
  if(String(m.league||'').toLowerCase().includes('friendl')){
    const fl=friendlyLean(m);
    if(!fl||fl.market==="No Bet") return valueOut(m,"No Bet",0,null,[fl?fl.reason:"Friendly — no goal data."]);
    return valueOut(m, fl.market, fl.conf, {friendly:true}, [fl.reason]);
  }
  const la = m.leagueAvg;
  const leagueAvgTeam = (la && la.reliable && la.goalsPerGame) ? la.goalsPerGame/2 : 1.35;

  // team rates (home perspective uses home splits; away uses away splits)
  const hGF=m.homeScoredAtHome, hGA=m.homeConcededAtHome, aGF=m.awayScoredAway, aGA=m.awayConcededAway;
  if(hGF==null||hGA==null||aGF==null||aGA==null){
    return valueOut(m,"No Bet",0,null,["Insufficient goal data for the model."]);
  }

  // --- regression to the mean on low samples ---
  // few games => trust league average more (shrink toward it).
  const gp = m.gamesPlayed!=null ? m.gamesPlayed : 12;
  const w = Math.min(1, gp/12);            // 0..1 weight on team's own numbers
  const shrink = (rate)=> w*rate + (1-w)*leagueAvgTeam;
  const hAtt = shrink(hGF), hDef = shrink(hGA), aAtt = shrink(aGF), aDef = shrink(aGA);

  // --- expected goals (lambda) for this match ---
  // Standard form: league baseline × home attack strength × away defence
  // factor. Attack strength = team's rate / league rate. Defence factor =
  // opponent's conceding rate / league rate. The baseline anchors the scale so
  // two strong factors don't compound into unrealistic totals — we take the
  // geometric blend of attack and opponent-defence rather than a raw product.
  const hAttRatio = hAtt/leagueAvgTeam, aDefRatio = aDef/leagueAvgTeam;
  const aAttRatio = aAtt/leagueAvgTeam, hDefRatio = hDef/leagueAvgTeam;
  let lambdaHome = leagueAvgTeam * Math.sqrt(hAttRatio * aDefRatio);
  let lambdaAway = leagueAvgTeam * Math.sqrt(aAttRatio * hDefRatio);
  lambdaHome = Math.min(3.6, Math.max(0.15, lambdaHome));
  lambdaAway = Math.min(3.6, Math.max(0.12, lambdaAway));

  // Real xG nudge (heavy weight) + regression signal, matching Pro.
  let usedXg=false; const xgReg=xgRegression(m);
  if(m.xgReal && m.xgHomeReal!=null && m.xgAwayReal!=null){
    lambdaHome = 0.45*lambdaHome + 0.55*Math.max(0.1, m.xgHomeReal);
    lambdaAway = 0.45*lambdaAway + 0.55*Math.max(0.1, m.xgAwayReal);
    if(xgReg){
      if(xgReg.home.flag==="fade") lambdaHome*=0.90;
      if(xgReg.home.flag==="back") lambdaHome*=1.08;
      if(xgReg.away.flag==="fade") lambdaAway*=0.90;
      if(xgReg.away.flag==="back") lambdaAway*=1.08;
    }
    usedXg=true;
  }

  // --- build scoreline matrix 0..8 with Dixon-Coles low-score correction ---
  const MAX=8;
  const rho = -0.05; // Dixon-Coles dependence parameter (typical small negative)
  function dcTau(i,j,lh,la_){
    if(i===0&&j===0) return 1 - lh*la_*rho;
    if(i===0&&j===1) return 1 + lh*rho;
    if(i===1&&j===0) return 1 + la_*rho;
    if(i===1&&j===1) return 1 - rho;
    return 1;
  }
  let matrix=[], norm=0;
  for(let i=0;i<=MAX;i++){ matrix[i]=[]; for(let j=0;j<=MAX;j++){
    let p = poissonP(i,lambdaHome)*poissonP(j,lambdaAway)*dcTau(i,j,lambdaHome,lambdaAway);
    if(p<0) p=0; matrix[i][j]=p; norm+=p;
  }}
  // normalise
  for(let i=0;i<=MAX;i++) for(let j=0;j<=MAX;j++) matrix[i][j]/=norm;

  // --- read market probabilities from the matrix ---
  let pHomeWin=0,pDraw=0,pAwayWin=0,pBTTS=0,pOver15=0,pOver25=0,pOver35=0;
  for(let i=0;i<=MAX;i++) for(let j=0;j<=MAX;j++){
    const p=matrix[i][j], tot=i+j;
    if(i>j)pHomeWin+=p; else if(i===j)pDraw+=p; else pAwayWin+=p;
    if(i>=1&&j>=1)pBTTS+=p;
    if(tot>=2)pOver15+=p;
    if(tot>=3)pOver25+=p;
    if(tot>=4)pOver35+=p;
  }
  const pUnder35=1-pOver35, pUnder25=1-pOver25, pBTTSNo=1-pBTTS;
  const pHomeDNB = pHomeWin/(pHomeWin+pAwayWin);
  const pAwayDNB = pAwayWin/(pHomeWin+pAwayWin);
  const p1X = pHomeWin+pDraw, pX2 = pAwayWin+pDraw;

  // --- candidate markets with their model probability + confidence floor ---
  const cand = [
    {market:"Over 1.5",        p:pOver15, floor:0.80},
    {market:"Under 3.5",       p:pUnder35, floor:0.80},
    {market:"Over 2.5",        p:pOver25, floor:0.62},
    {market:"Under 2.5",       p:pUnder25, floor:0.62},
    {market:"BTTS Yes",        p:pBTTS, floor:0.62},
    {market:"BTTS No",         p:pBTTSNo, floor:0.62},
    {market:"Double Chance 1X",p:p1X, floor:0.78},
    {market:"Double Chance X2",p:pX2, floor:0.78},
    {market:"Home DNB",        p:pHomeDNB, floor:0.64},
    {market:"Away DNB",        p:pAwayDNB, floor:0.64},
    {market:"Home Win",        p:pHomeWin, floor:0.60},
    {market:"Away Win",        p:pAwayWin, floor:0.60},
  ].filter(c=>c.p>=c.floor);

  // RULE: a Win or DNB requires the BACKED team to be expected to actually
  // score — at least 2 expected goals (lambda >= 2.0). A team that can't be
  // expected to put 2 away can be held to a draw or nicked 1-0 even against a
  // weak opponent, so backing it to WIN (which is what both Win and DNB need)
  // is not safe regardless of how poor the opponent looks.
  const LAMBDA_WIN_FLOOR = 2.0;
  const winDnbBlocked = [];
  const filtered = cand.filter(c=>{
    const isHomeBack = (c.market==="Home Win"||c.market==="Home DNB");
    const isAwayBack = (c.market==="Away Win"||c.market==="Away DNB");
    if(isHomeBack && lambdaHome < LAMBDA_WIN_FLOOR){ winDnbBlocked.push(c.market); return false; }
    if(isAwayBack && lambdaAway < LAMBDA_WIN_FLOOR){ winDnbBlocked.push(c.market); return false; }
    return true;
  });
  cand.length = 0; Array.prototype.push.apply(cand, filtered);

  if(!cand.length){
    const why = winDnbBlocked.length
      ? `Win/DNB blocked — backed team not expected to score 2+ (λ ${lambdaHome.toFixed(2)}/${lambdaAway.toFixed(2)}); no other market cleared the floor.`
      : "No market cleared its probability floor — model sees no safe edge.";
    return valueOut(m,"No Bet",0,{lambdaHome,lambdaAway},[why]);
  }

  // safety: prefer the market with the biggest cushion above its floor,
  // tie-break toward the protective/likely lines via floor height.
  cand.forEach(c=>{ c.cushion = c.p - c.floor; });
  cand.sort((a,b)=> b.cushion-a.cushion || b.p-a.p);
  const best = cand[0];

  // --- value check vs bookmaker (only where odds exist) ---
  const o=m.odds; let valueNote="", isValue=false, edge=null;
  if(o){
    const impl = mk=> {
      if(mk==="Home Win"&&o.home) return 1/o.home;
      if(mk==="Away Win"&&o.away) return 1/o.away;
      if(mk==="Double Chance 1X"&&o.home&&o.draw) return Math.min(0.97,1/o.home+1/o.draw);
      if(mk==="Double Chance X2"&&o.away&&o.draw) return Math.min(0.97,1/o.away+1/o.draw);
      return null;
    };
    const bm = impl(best.market);
    if(bm!=null){
      edge = best.p - bm;
      if(edge>=0.05){ isValue=true; valueNote=` VALUE: model ${(best.p*100|0)}% vs market ${(bm*100|0)}% (+${(edge*100|0)}pts).`; }
      else valueNote=` Market agrees (model ${(best.p*100|0)}% vs ${(bm*100|0)}%) — safe, limited edge.`;
    }
  }

  // confidence from probability; widen caution on thin data
  let conf = Math.round(best.p*10);
  if(gp<6) conf=Math.max(0,conf-1);
  conf=Math.min(10,conf);

  const reasons = [
    `Model: expected goals ${lambdaHome.toFixed(2)} - ${lambdaAway.toFixed(2)} (Dixon-Coles).`,
    `P(${best.market}) = ${(best.p*100).toFixed(0)}%.${valueNote}`
  ];
  return valueOut(m, best.market, conf, {lambdaHome,lambdaAway,isValue,edge,prob:best.p,usedXg}, reasons, gp<6);
}

function valueOut(m, market, conf, model, reasons, lowSample){
  const banker = market!=="No Bet" && conf>=8 && !hasNoStandings(m);
  return {
    match:m, engine:"value", primary:market, bet:market!=="No Bet",
    banker, confidence: market==="No Bet"?0:conf,
    model: model||null, isValue: !!(model&&model.isValue),
    lowSample: !!lowSample,
    verdict: `${market}${market!=="No Bet"?` (model pick, ${conf}/10`+(model&&model.isValue?", VALUE":"")+")":""}. ${reasons.join(' ')}`,
    reasons, humanChecks:["Model assumes goals ~ Poisson; verify injuries, motivation, weather."]
  };
}

function streakRecommendLegacy(m) {
  const reasons = [];
  const signals = [];
  const MIN_STREAK = 4; // ultra-strict: need 4+ in a row (of max 5)

  const hWin = trailingStreak(m.homeForm, "W");
  const hLoss = trailingStreak(m.homeForm, "L");
  const aWin = trailingStreak(m.awayForm, "W");
  const aLoss = trailingStreak(m.awayForm, "L");

  // REAL win/loss streaks (from results)
  if (hWin >= MIN_STREAK) signals.push({ kind: "winStreak", side: "home", len: hWin,
    market: "Home Win", real: true, note: `${m.home} won last ${hWin} (real streak)` });
  if (aWin >= MIN_STREAK) signals.push({ kind: "winStreak", side: "away", len: aWin,
    market: "Away Win", real: true, note: `${m.away} won last ${aWin} (real streak)` });
  if (hWin >= MIN_STREAK && aLoss >= MIN_STREAK) reasons.push(`${m.away} also lost last ${aLoss} — reinforcing.`);
  if (aWin >= MIN_STREAK && hLoss >= MIN_STREAK) reasons.push(`${m.home} also lost last ${hLoss} — reinforcing.`);

  // AVG-BASED goals trends (NOT real streaks — labelled honestly)
  const bothScoreLots = (m.homeScoredAtHome ?? 0) >= 1.8 && (m.awayScoredAway ?? 0) >= 1.5;
  const bothTight     = (m.homeScoredAtHome ?? 9) <= 1.0 && (m.awayScoredAway ?? 9) <= 0.9
                     && (m.homeConcededAtHome ?? 9) <= 1.0 && (m.awayConcededAway ?? 9) <= 1.0;
  if (bothScoreLots) signals.push({ kind: "goalsTrend", market: "Over 1.5", real: false,
    note: `Both sides average high scoring (trend, not a streak)` });
  if (bothTight) signals.push({ kind: "underTrend", market: "Under 2.5", real: false,
    note: `Both sides average low scoring (trend, not a streak)` });

  // ultra-strict: only a REAL win streak can qualify a bet; trends are shown, never qualify alone
  const realQualifier = signals.find(s => s.real && s.kind === "winStreak");
  const qualifies = !!realQualifier;
  const primary = qualifies ? realQualifier.market : "No Bet";
  const confidence = qualifies ? clamp(5 + realQualifier.len, 0, 10) : 0;

  return {
    match: m, engine: "ultra-streak",
    primary, qualifies, confidence, signals, reasons,
    bet: qualifies,
    disclaimer: "Streak-based & unproven — track before trusting.",
  };
}


/* ============================================================
   PRO BANKERS — the disciplined, xG-aware engine.
   Runs every game through a Poisson/Dixon-Coles probability model. When real
   xG is present (xgReal flag from enrichment) it sharpens the expected-goals
   estimate; otherwise it falls back to the goals-based estimate. Then applies
   strict discipline: no banker without standings, widen uncertainty on thin
   data, Win/DNB only if the backed team is expected to score 2+, and bet only
   where probability clears a real floor — else No Bet.
   ------------------------------------------------------------------- */
// ============================================================
// xG OVERPERFORMANCE SIGNAL  (shared — the real power of xG)
// ------------------------------------------------------------
// Compares a team's actual goals to its rolling xG. Sustained OVERperformance
// (goals >> xG) regresses to the mean → a FADE signal. UNDERperformance
// (xG >> goals — dominating but not scoring) → a BACK signal (a positive
// correction is likely coming). This is the edge only xG can see: results that
// are lying about a team. Returns { home:{delta,flag}, away:{delta,flag} } with
// flag 'fade' | 'back' | null.
function xgRegression(m){
  if(!m || !m.xgReal) return null;
  const judge=(realXg, actualScore)=>{
    if(realXg==null || actualScore==null) return {delta:null, flag:null};
    const delta = Math.round((actualScore - realXg)*100)/100; // + = scoring above xG (lucky)
    let flag=null;
    if(delta >= 0.45) flag="fade";
    else if(delta <= -0.45) flag="back";
    return {delta, flag};
  };
  return {
    home: judge(m.xgHomeReal, m.homeScoredAtHome),
    away: judge(m.xgAwayReal, m.awayScoredAway)
  };
}

function proRecommend(m){
  const la = m.leagueAvg;
  const leagueAvgTeam = (la && la.reliable && la.goalsPerGame) ? la.goalsPerGame/2 : 1.35;
  const hGF=m.homeScoredAtHome, hGA=m.homeConcededAtHome, aGF=m.awayScoredAway, aGA=m.awayConcededAway;
  if(typeof dataQualityOK==='function' && !dataQualityOK(m)) return proOut(m,"No Bet",0,null,["Low-quality data — skipped."]);
  if(hGF==null||hGA==null||aGF==null||aGA==null) return proOut(m,"No Bet",0,null,["Insufficient goal data."]);
  // Friendlies: shared friendly approach, never blanket model pick.
  if(String(m.league||'').toLowerCase().includes('friendl')){
    const fl=friendlyLean(m);
    if(!fl||fl.market==="No Bet") return proOut(m,"No Bet",0,null,[fl?fl.reason:"Friendly — no goal data."]);
    return proOut(m, fl.market, fl.conf, {friendly:true}, [fl.reason]);
  }

// low-sample regression toward league mean
  const gp = m.gamesPlayed!=null ? m.gamesPlayed : 12;
  const w = Math.min(1, gp/12);
  const shrink = r => w*r + (1-w)*leagueAvgTeam;
  let hAtt=shrink(hGF), hDef=shrink(hGA), aAtt=shrink(aGF), aDef=shrink(aGA);

  // base expected goals (opponent-adjusted, geometric blend)
  let lambdaHome = leagueAvgTeam * Math.sqrt((hAtt/leagueAvgTeam)*(aDef/leagueAvgTeam));
  let lambdaAway = leagueAvgTeam * Math.sqrt((aAtt/leagueAvgTeam)*(hDef/leagueAvgTeam));

  // REAL xG sharpening: blend real rolling xG into λ, weighted heavily (xG
  // predicts future goals better than past results). Also apply the regression
  // signal — fade a team scoring above its xG, lean into one scoring below.
  let usedXg=false; const xgReg=xgRegression(m); let xgNote="";
  if(m.xgReal && m.xgHomeReal!=null && m.xgAwayReal!=null){
    lambdaHome = 0.45*lambdaHome + 0.55*Math.max(0.1, m.xgHomeReal);
    lambdaAway = 0.45*lambdaAway + 0.55*Math.max(0.1, m.xgAwayReal);
    // regression: nudge λ toward the xG-implied level a team is over/under-shooting
    if(xgReg){
      if(xgReg.home.flag==="fade"){ lambdaHome*=0.90; xgNote+=`Home has been scoring above xG (+${xgReg.home.delta}) — regression risk. `; }
      if(xgReg.home.flag==="back"){ lambdaHome*=1.08; xgNote+=`Home creating more than scoring (${xgReg.home.delta}) — positive regression likely. `; }
      if(xgReg.away.flag==="fade"){ lambdaAway*=0.90; xgNote+=`Away over-performing xG (+${xgReg.away.delta}) — regression risk. `; }
      if(xgReg.away.flag==="back"){ lambdaAway*=1.08; xgNote+=`Away under-performing xG (${xgReg.away.delta}) — due a correction. `; }
    }
    usedXg=true;
  }
  lambdaHome=Math.min(3.6,Math.max(0.12,lambdaHome));
  lambdaAway=Math.min(3.6,Math.max(0.12,lambdaAway));

  // Dixon-Coles scoreline matrix
  const MAX=8, rho=-0.05;
  function tau(i,j,lh,la_){ if(i===0&&j===0)return 1-lh*la_*rho; if(i===0&&j===1)return 1+lh*rho; if(i===1&&j===0)return 1+la_*rho; if(i===1&&j===1)return 1-rho; return 1; }
  let matrix=[], norm=0;
  for(let i=0;i<=MAX;i++){matrix[i]=[];for(let j=0;j<=MAX;j++){let p=poissonP(i,lambdaHome)*poissonP(j,lambdaAway)*tau(i,j,lambdaHome,lambdaAway); if(p<0)p=0; matrix[i][j]=p; norm+=p;}}
  for(let i=0;i<=MAX;i++)for(let j=0;j<=MAX;j++)matrix[i][j]/=norm;

  let pH=0,pD=0,pA=0,pBTTS=0,pO15=0,pO25=0,pO35=0;
  for(let i=0;i<=MAX;i++)for(let j=0;j<=MAX;j++){const p=matrix[i][j],t=i+j; if(i>j)pH+=p;else if(i===j)pD+=p;else pA+=p; if(i>=1&&j>=1)pBTTS+=p; if(t>=2)pO15+=p; if(t>=3)pO25+=p; if(t>=4)pO35+=p;}
  const pU35=1-pO35,pU25=1-pO25,pBTTSNo=1-pBTTS;
  const pHomeDNB=pH/(pH+pA), pAwayDNB=pA/(pH+pA), p1X=pH+pD, pX2=pA+pD;

  // uncertainty: widen (raise floors) on thin data or volatile profiles
  let floorBump=0;
  if(gp<6) floorBump+=0.04;
  if(!usedXg) floorBump+=0.01; // tiny: estimate-only is slightly less certain
  if(la && !la.reliable) floorBump+=0.03;

  const LAMBDA_WIN_FLOOR=2.0;
  let cand=[
    {market:"Over 1.5",p:pO15,floor:0.80+floorBump},
    {market:"Under 3.5",p:pU35,floor:0.80+floorBump},
    {market:"Over 2.5",p:pO25,floor:0.63+floorBump},
    {market:"Under 2.5",p:pU25,floor:0.63+floorBump},
    {market:"BTTS Yes",p:pBTTS,floor:0.63+floorBump},
    {market:"BTTS No",p:pBTTSNo,floor:0.63+floorBump},
    {market:"Double Chance 1X",p:p1X,floor:0.78+floorBump},
    {market:"Double Chance X2",p:pX2,floor:0.78+floorBump},
    {market:"Home DNB",p:pHomeDNB,floor:0.64+floorBump},
    {market:"Away DNB",p:pAwayDNB,floor:0.64+floorBump},
    {market:"Home Win",p:pH,floor:0.60+floorBump},
    {market:"Away Win",p:pA,floor:0.60+floorBump},
  ].filter(c=>c.p>=c.floor);

  // Win/DNB require backed team expected to score 2+
  cand=cand.filter(c=>{
    const homeBack=(c.market==="Home Win"||c.market==="Home DNB");
    const awayBack=(c.market==="Away Win"||c.market==="Away DNB");
    if(homeBack && lambdaHome<LAMBDA_WIN_FLOOR) return false;
    if(awayBack && lambdaAway<LAMBDA_WIN_FLOOR) return false;
    return true;
  });

  if(!cand.length) return proOut(m,"No Bet",0,{lambdaHome,lambdaAway,usedXg},["No market cleared the confidence floor — no safe edge."]);

  cand.forEach(c=>c.cushion=c.p-c.floor);
  cand.sort((a,b)=>b.cushion-a.cushion||b.p-a.p);
  const best=cand[0];

  let conf=Math.round(best.p*10);
  if(gp<6)conf=Math.max(0,conf-1);
  conf=Math.min(10,conf);

  const reasons=[
    `Model: expected goals ${lambdaHome.toFixed(2)} - ${lambdaAway.toFixed(2)}${usedXg?' (sharpened with real xG)':' (estimated)'}.`,
    `P(${best.market}) = ${(best.p*100).toFixed(0)}%.`
  ];
  if(xgNote) reasons.push(xgNote.trim());
  return proOut(m,best.market,conf,{lambdaHome,lambdaAway,usedXg,prob:best.p},reasons,gp<6);
}

function proOut(m,market,conf,model,reasons,lowSample){
  // never a banker without real standings (friendlies/table-less games)
  const noStand = (typeof hasNoStandings==='function') && hasNoStandings(m);
  const banker = market!=="No Bet" && conf>=8 && !noStand;
  return {
    match:m, engine:"pro", primary:market, bet:market!=="No Bet",
    banker, confidence: market==="No Bet"?0:conf,
    model:model||null, usedXg: !!(model&&model.usedXg), lowSample: !!lowSample,
    verdict: `${market}${market!=="No Bet"?` (Pro model, ${conf}/10${model&&model.usedXg?', xG-backed':''})`:""}. ${reasons.join(' ')}`,
    reasons, humanChecks:["Model-based; verify injuries, motivation, lineups."]
  };
}
// ============================================================
// LEAGUE-CONTEXT WRAPPER — make every engine league-aware in ONE place.
// ------------------------------------------------------------
// Wraps each engine so its output object carries a `leagueClass` field
// (the classifyLeague result for that match). This does NOT change any
// engine's market decision — it ADDS context the UI can display and that
// future tuning can read, without editing 20 scattered return statements.
// Done before exports so the exported references point at the WRAPPED fns,
// and so it covers every call site at once as a single, safe paste.
// Prime already computes its own leagueType internally; we don't disturb that,
// we just also attach the shared classification for consistency across tabs.
(function attachLeagueContext(){
  if (typeof recommend !== "function") return;
  const wrap = fn => function(m){
    const out = fn(m);
    try {
      if (out && typeof out === "object" && m) {
        const lc = classifyLeague(m);
        out.leagueClass = lc;

        // Apply the spec's league-adjusted RULES (Sections 3,5,8,9) using goals
        // as the xG proxy. Only ever makes a pick SAFER (downgrade or reject) —
        // never upgrades. Skips No-Bet/blank picks and friendly leans.
        const market = out.primary;
        const isRealPick = market && market !== "No Bet" && !/lean/i.test(out.tier||out.tierName||"");
        if (isRealPick && lc.type !== "Friendly") {
          const v = leagueContextVerdict(m, market);
          if (v.reject) {
            // turn into No Bet
            out.banker = false; out.bet = false;
            if ("primary" in out) out.primary = "No Bet";
            if ("confidence" in out && typeof out.confidence==="number") out.confidence = 0;
            if (Array.isArray(out.reasons)) out.reasons = out.reasons.concat([`League context: rejected — ${v.reason}`]);
          } else if (v.downgrade) {
            // drop banker status; pull numeric confidence down one tier
            if (out.banker) out.banker = false;
            if (typeof out.confidence === "number") out.confidence = Math.max(0, out.confidence - 1);
            else if (out.confidence === "High") out.confidence = "Medium";
            else if (out.confidence === "Medium") out.confidence = "Low";
            if (Array.isArray(out.reasons) && v.reason) out.reasons = out.reasons.concat([`League context: downgraded — ${v.reason}`]);
          }
        }

        if (Array.isArray(out.reasons) && lc.type !== "Unknown" && !out.reasons.some(r=>/League context:/.test(r))) {
          out.reasons = out.reasons.concat([`League context: ${lc.type}${lc.volatile ? " (volatile — treat with caution)" : ""}.`]);
        }

        // FINAL VALIDATION — Universal Odds Ladder Gate. Runs LAST, after the
        // engine and league context have settled on a market. The odds must
        // confirm the pick; if they contradict it (or are absent), the pick is
        // blocked → No Bet. This is the mandatory-odds policy: no confirmation,
        // no bet. Applies to every engine via this shared wrapper. Handles both
        // out.primary (most engines) and out.market (Strict).
        const mkField = ("primary" in out) ? "primary" : ("market" in out ? "market" : null);
        const finalMk = mkField ? out[mkField] : null;
        if (finalMk && finalMk !== "No Bet" && !/lean/i.test(out.tier||out.tierName||"")) {
          const g = oddsLadderGate(m, finalMk);
          if (g.block) {
            out.banker = false; if ("bet" in out) out.bet = false;
            out[mkField] = "No Bet";
            if ("confidence" in out && typeof out.confidence==="number") out.confidence = 0;
            if (Array.isArray(out.reasons)) out.reasons = out.reasons.concat([`Odds gate: blocked — ${g.reason}${g.suggest?` (odds favour ${g.suggest})`:""}`]);
          } else if (g.reason && Array.isArray(out.reasons)) {
            out.reasons = out.reasons.concat([`Odds gate: ${g.reason}`]);
          }
        }
      }
    } catch(e){}
    return out;
  };
  recommend          = wrap(recommend);
  strictRecommend    = wrap(strictRecommend);
  ultraRecommend     = wrap(ultraRecommend);
  rulesProRecommend  = wrap(rulesProRecommend);
  apexRecommend      = wrap(apexRecommend);
  primeRecommend     = wrap(primeRecommend);
  valueRecommend     = wrap(valueRecommend);
  proRecommend       = wrap(proRecommend);
})();

// ============================================================
// LEAGUE TREND BANKER ENGINE  (70% Market Trend + Candidate Team Filter)
// ------------------------------------------------------------
// Studies the league FIRST (real league-wide hit-rates from m.leagueTrends),
// keeps only markets hitting 70%+, ranks the top 3, then filters the fixture's
// teams against that trend. A pick needs all three 70-70-70 layers to agree:
//   Layer 1 League trend ≥70% · Layer 2 Team trend ≥70% · Layer 3 Match pass ≥70%
// If the league data is missing/thin, or no layer passes → NO BET.
// Confidence tiers escalate at 70/75/80/85 (Section 10). Output carries the
// spec's full breakdown for the UI.
function trendOut(m, market, tier, decision, layers, reasons, extra){
  const noStand = (typeof hasNoStandings==='function') && hasNoStandings(m);
  const banker = market!=="No Bet" && (tier==="Banker"||tier==="Strong Banker"||tier==="Elite Banker") && !noStand;
  const confMap = { "Value Pick":6, "Banker":8, "Strong Banker":9, "Elite Banker":10 };
  return {
    match:m, engine:"trend", primary:market, bet:market!=="No Bet",
    banker, confidence: market==="No Bet"?0:(confMap[tier]||6),
    tier: tier||null, decision: decision||"NO BET",
    layers: layers||null,   // {league, team, match} percentages
    identity: (m.leagueTrends && m.leagueTrends.identity) || null,
    topTrends: (m.leagueTrends && m.leagueTrends.top3) || null,
    verdict: `${market}${market!=="No Bet"?` (League Trend — ${tier}, ${decision})`:` — ${decision}`}. ${reasons.join(' ')}`,
    reasons, humanChecks:["Trend-based; verify lineups, motivation, and that the league trend still holds."],
    ...(extra||{})
  };
}

// team's own hit-rate for a market, from the per-team stats we fetch (0..1) or null
function teamTrendFor(m, market){
  const mk = String(market||"");
  // use the real per-team rates captured in fetch-data where available
  const avg=(a,b)=> (a!=null&&b!=null)?(a+b)/2 : (a!=null?a:(b!=null?b:null));
  if(/Over 2\.5/i.test(mk))  return avg(m.homeOver25Rate, m.awayOver25Rate);
  if(/Over 1\.5/i.test(mk))  return avg(m.homeOver15Rate, m.awayOver15Rate);
  // BTTS Yes proxy: both teams' scoring reliability
  if(/BTTS Yes/i.test(mk)){
    const hs = m.homeScoredAtHome!=null ? Math.min(1, m.homeScoredAtHome/1.5) : null;
    const as = m.awayScoredAway!=null ? Math.min(1, m.awayScoredAway/1.5) : null;
    return avg(hs, as);
  }
  // Under markets proxy: prefer REAL over-rates (inverted) when captured, else
  // estimate from Over 2.5. Under 3.5 = 1 − Over 3.5 rate; Under 2.5 = 1 − Over 2.5.
  if(/Under 3\.5/i.test(mk)){
    if(m.homeOver35Rate!=null && m.awayOver35Rate!=null) return 1 - avg(m.homeOver35Rate, m.awayOver35Rate);
    const o=avg(m.homeOver25Rate,m.awayOver25Rate); return o!=null?Math.max(0,1-o*0.6):null;
  }
  if(/Under 2\.5/i.test(mk)){ const o=avg(m.homeOver25Rate,m.awayOver25Rate); return o!=null?1-o:null; }
  // Home/Away win proxy from win rates
  if(/Home Win/i.test(mk))   return m.homeWinRate!=null?m.homeWinRate:null;
  if(/Away Win/i.test(mk))   return m.awayWinRate!=null?m.awayWinRate:null;
  if(/Home Team Over 0\.5/i.test(mk)) return m.homeScoredAtHome!=null?Math.min(1,m.homeScoredAtHome/1.3):null;
  if(/Away Team Over 0\.5/i.test(mk)) return m.awayScoredAway!=null?Math.min(1,m.awayScoredAway/1.3):null;
  // 1X / Double chance proxy from unbeaten
  if(/1X|Double Chance/i.test(mk)) return Math.max(m.homeUnbeatenRate??0, m.awayUnbeatenRate??0)||null;
  return null;
}

// match-threshold pass: reuse the existing engines' judgement as the Layer-3
// signal. If the strong Normal engine already likes this market on this match,
// treat it as a high match-pass; otherwise moderate/low.
function matchPassFor(m, market){
  try {
    const r = recommend(m);
    if(r && r.primary===market){
      const c = typeof r.confidence==="number"?r.confidence:7;
      return Math.min(1, 0.60 + c*0.04); // conf 10 → 1.00, conf 7 → 0.88, conf 5 → 0.80
    }
  } catch(e){}
  // market not the Normal pick — give partial credit via team trend
  const tt = teamTrendFor(m, market);
  return tt!=null ? Math.min(0.85, tt) : 0.5;
}

function trendRecommend(m){
  // POSITIONAL PATTERN ENGINE (owner spec): what matches between teams of these
  // TABLE TIERS historically produce in THIS league — leader-at-home records,
  // mid-table meeting totals, top-4 clashes, etc. Fires only on strong,
  // well-sampled tier patterns.
  const lt=m&&m.leagueTrends, tp=lt&&lt.tierPatterns;
  if(!tp) return trendOut(m,"No Bet",null,"NO BET",null,
    ["Positional pattern data not in this data build yet — arrives with the next full run."]);
  const hP=m.homePos, aP=m.awayPos, size=m.tableSize;
  if(hP==null||aP==null||!size) return trendOut(m,"No Bet",null,"NO BET",null,
    ["Table positions unavailable — tier patterns need standings."]);
  const tierOf=p=>p===1?"LDR":p<=4?"TOP":p>size-4?"BOT":"MID";
  const th=tierOf(hP), ta=tierOf(aP);
  const NAME={LDR:"the leader",TOP:"a top-4 side",MID:"a mid-table side",BOT:"a bottom-4 side"};
  // pattern buckets that apply to THIS fixture, most specific first
  const buckets=[];
  const push=(k,label)=>{ if(tp[k]) buckets.push({k,b:tp[k],label}); };
  push(`${th}v${ta}`, `${NAME[th]} at home vs ${NAME[ta]}`);
  if((th==="LDR"||th==="TOP")&&(ta==="LDR"||ta==="TOP")) push("TOP4vTOP4","top-4 clashes");
  if(th==="LDR") push("LDR_HOME","the leader at home");
  if(!buckets.length) return trendOut(m,"No Bet",null,"NO BET",null,
    [`No sampled history for ${NAME[th]}-hosts-${NAME[ta]} meetings in this league yet.`]);
  const noOdds=!m.odds||(m.odds.home==null&&m.odds.over15==null&&m.odds.under35==null);
  if(noOdds&&!isUpcomingNoScore(m)) return trendOut(m,"No Bet",null,"NO BET",null,
    ["No bookmaker odds on a settled game."]);
  // candidate markets from each applicable bucket
  const cands=[];
  for(const {b,label} of buckets){
    const r=b.rates, n=b.n;
    const add=(mk,rate,text)=>{ if(rate==null)return;
      let sc=0;
      if(rate>=0.90&&n>=10) sc=11; else if(rate>=0.85&&n>=8) sc=10;
      else if(rate>=0.78&&n>=8) sc=9; else if(rate>=0.72&&n>=12) sc=8;
      if(!sc) return;
      cands.push({mk,sc,rate,n,why:`Pattern — ${label} in this league: ${text} in ${Math.round(rate*n)}/${n} (${Math.round(rate*100)}%).`}); };
    add("Double Chance 1X", r["Home No Loss"], "the home side avoided defeat");
    add("Home Win",        r["Home Win"],     "home won");
    add("Away Win",        r["Away Win"],     "away won");
    add("Under 2.5 Goals", r["Under 2.5"],    "under 2.5 goals");
    add("Under 3.5 Goals", r["Under 3.5"],    "under 3.5 goals");
    add("Over 1.5 Goals",  r["Over 1.5"],     "2+ goals");
    add("Over 2.5 Goals",  r["Over 2.5"],     "over 2.5 goals");
    add("BTTS Yes",        r["BTTS Yes"],     "both teams scored");
    add("BTTS No",         r["BTTS No"],      "at least one side blanked");
  }
  if(!cands.length) return trendOut(m,"No Bet",null,"NO BET",null,
    [`This tier pairing exists in the data (${buckets.map(x=>x.b.n).join("/")} games) but no market repeats strongly enough — honest No Bet.`]);
  cands.sort((x,y)=>y.sc-x.sc||y.rate*Math.min(y.n,20)-x.rate*Math.min(x.n,20));
  if(noOdds){ const c=cands[0];
    return provisionalize(trendOut(m,c.mk,"PATTERN","PROVISIONAL",null,[c.why]), c.mk, [c.why]); }
  let best=null;
  for(const c of cands){
    const g=(typeof oddsLadderGate==='function')?oddsLadderGate(m,c.mk):{block:false};
    if(!g.block){ best=c; best.gateNote=g.reason||null; break; }
  }
  if(!best) return trendOut(m,"No Bet",null,"NO BET",null,
    [`${cands[0].why} But the odds ladder rejected every pattern market.`]);
  const grade=best.sc>=11?"Elite Banker":best.sc>=9?"Banker":"Strong Pick";
  const reasons=[best.why]; if(best.gateNote)reasons.push(best.gateNote);
  reasons.push(`Sample ${best.n} matches; hit rate ${Math.round(best.rate*100)}%.`);

  // Calibration is applied universally by withIntlFrame (applyCalibration) as the
  // final transform, so the Trend engine — like every other — is graded by real
  // price-band history without a bespoke block here.
  const out=trendOut(m,best.mk,grade,grade.toUpperCase(),null,reasons);
  out.bet=true; out.banker=(grade!=="Strong Pick"); out.grade=grade;
  out.confidence=best.sc>=11?10:best.sc>=9?8:7;
  // real numbers for the card chips (replaces the old 70-70-70 layers, which
  // this tier-pattern rewrite no longer computes — chips were showing 0%)
  out.pattern={ pct: Math.round(best.rate*100), n: best.n };
  return out;
}

// ============================================================
// UNIVERSAL ODDS LADDER GATE  (final validation for EVERY engine)
// ------------------------------------------------------------
// Every engine's pick runs through this before publishing. It reads the real
// bookmaker odds and checks the pick sits in the zone the odds justify (spec:
// Win 1.20–1.59, DNB 1.60–2.10, DC >2.10; Over/Under ladders off U3.5 / O1.5;
// GG 1.20–1.55). If the odds CONTRADICT the pick, it is blocked (→ No Bet) or
// downgraded. Per the chosen policy: NO ODDS → NO BET (odds are mandatory).
//
// Returns { ok:bool, block:bool, reason:string, suggest:string|null }.
//   ok=true    → pick is confirmed by the odds
//   block=true → pick contradicts the odds (or no odds) → caller sets No Bet
//   suggest    → the market the odds ladder would have chosen (for the reason)
function oddsLadderGate(m, market){
  const o = m && m.odds;
  const mk = String(market||"");
  if (mk==="No Bet" || mk==="") return { ok:true, block:false, reason:"" };

  // MANDATORY ODDS: no odds block present → No Bet (user policy).
  if (!o || (o.home==null && o.over15==null && o.under35==null && o.bttsYes==null)) {
    return { ok:false, block:true, reason:"No bookmaker odds to confirm this pick — odds are required.", suggest:null };
  }

  const inRange=(v,lo,hi)=> v!=null && v>=lo && v<=hi;

  // ----- WIN / DNB / DOUBLE CHANCE zone (spec §1, §2) -----
  const isHomeSide = /home|^1x$|1x|home win|home dnb/i.test(mk) && !/away/i.test(mk);
  const isAwaySide = /away|x2|away win|away dnb/i.test(mk);
  if (/win|dnb|double chance|1x|x2|dc/i.test(mk)) {
    const teamOdd = isAwaySide ? o.away : o.home;
    const oppOdd  = isAwaySide ? o.home : o.away;
    const drawOdd = o.draw;
    if (teamOdd==null) return { ok:false, block:true, reason:"No win-market odds to confirm this pick.", suggest:null };

    // which zone do the odds put this team in?
    let zone;
    if (inRange(teamOdd,1.20,1.59)) zone="win";
    else if (inRange(teamOdd,1.60,2.10)) zone="dnb";
    else if (teamOdd>2.10) zone="dc";
    else zone="tooshort"; // < 1.20: no value / not laddered

    const isStraightWin = /win/i.test(mk) && !/dnb|double|1x|x2|dc/i.test(mk);
    const isDNB = /dnb/i.test(mk);
    const isDC  = /double chance|1x|x2|dc/i.test(mk);

    if (isStraightWin) {
      // spec §2: straight win needs zone AND opponent ≥5.00 AND draw >3.60
      if (zone!=="win") return { ok:false, block:true, reason:`Odds put this in the ${zone==="dnb"?"DNB":zone==="dc"?"Double Chance":"too-short"} zone (win odd ${teamOdd}), not a straight-win price.`, suggest: zone==="dnb"?"DNB":zone==="dc"?"Double Chance":null };
      if (!(oppOdd!=null && oppOdd>=5.00)) return { ok:false, block:true, reason:`Straight win blocked — opponent priced ${oppOdd} (needs ≥5.00).`, suggest:"DNB" };
      if (!(drawOdd!=null && drawOdd>3.60)) return { ok:false, block:true, reason:`Straight win blocked — draw priced ${drawOdd} (needs >3.60).`, suggest:"DNB" };
      return { ok:true, block:false, reason:`Straight win confirmed by odds (${teamOdd}, opp ${oppOdd}, draw ${drawOdd}).` };
    }
    if (isDNB) {
      if (zone==="win") return { ok:true, block:false, reason:`DNB safe — team is actually a strong favourite (${teamOdd}).` };
      if (zone==="dnb") return { ok:true, block:false, reason:`DNB confirmed by odds (${teamOdd} in 1.60–2.10).` };
      return { ok:false, block:true, reason:`Odds put this team above the DNB zone (${teamOdd} > 2.10) — too risky for DNB.`, suggest:"Double Chance" };
    }
    if (isDC) {
      // double chance is the safety market — valid at dnb/dc prices, redundant (but safe) at win price
      return { ok:true, block:false, reason:`Double Chance confirmed (team odd ${teamOdd}).` };
    }
  }

  // ----- OVER GOALS ladder off Under-3.5 odds (spec §3) -----
  if (/over/i.test(mk) && /[0-9]\.5/.test(mk)) {
    const u35 = o.under35;
    if (u35==null) return { ok:false, block:true, reason:"No Under-3.5 odds to confirm an Over pick.", suggest:null };
    let ladder = u35>2.00 ? "Over 3.5" : u35>1.63 ? "Over 2.5" : u35>1.40 ? "Over 1.5" : null;
    if (!ladder) return { ok:false, block:true, reason:`Under-3.5 priced ${u35} — market doesn't support any Over line.`, suggest:null };
    // pick is fine if it is AT or BELOW the ladder-justified line (safer is ok)
    const lineOf = s => parseFloat((String(s).match(/([0-9]\.5)/)||[])[1]);
    if (lineOf(mk) <= lineOf(ladder)) return { ok:true, block:false, reason:`Over confirmed — U3.5 ${u35} supports up to ${ladder}.` };
    return { ok:false, block:true, reason:`Odds only support ${ladder} (U3.5 ${u35}); ${mk} is too high.`, suggest:ladder };
  }

  // ----- UNDER GOALS ladder off Over-1.5 odds (spec §4) -----
  if (/under/i.test(mk) && /[0-9]\.5/.test(mk)) {
    const o15 = o.over15;
    if (o15==null) return { ok:false, block:true, reason:"No Over-1.5 odds to confirm an Under pick.", suggest:null };
    let ladder = o15>2.00 ? "Under 1.5" : o15>1.63 ? "Under 2.5" : o15>1.40 ? "Under 3.5" : null;
    if (!ladder) return { ok:false, block:true, reason:`Over-1.5 priced ${o15} — market doesn't support any Under line.`, suggest:null };
    const lineOf = s => parseFloat((String(s).match(/([0-9]\.5)/)||[])[1]);
    // for Under, a HIGHER line is safer, so pick is fine if at or ABOVE the ladder line
    if (lineOf(mk) >= lineOf(ladder)) return { ok:true, block:false, reason:`Under confirmed — O1.5 ${o15} supports ${ladder} or safer.` };
    return { ok:false, block:true, reason:`Odds only support ${ladder} (O1.5 ${o15}); ${mk} is too tight.`, suggest:ladder };
  }

  // ----- GG / BTTS Yes (spec §5) -----
  if (/btts yes|gg/i.test(mk)) {
    const gg = o.bttsYes;
    if (gg==null) return { ok:false, block:true, reason:"No BTTS odds to confirm this pick.", suggest:null };
    if (inRange(gg,1.20,1.55)) return { ok:true, block:false, reason:`BTTS Yes confirmed by odds (${gg} in 1.20–1.55).` };
    return { ok:false, block:true, reason:`BTTS Yes priced ${gg} — outside the 1.20–1.55 confirmation zone.`, suggest:null };
  }

  // markets the ladder doesn't cover (e.g. Team Over, half markets): don't block,
  // but they still needed odds to exist (checked above).
  return { ok:true, block:false, reason:"" };
}

// ============================================================
// STREAKS BANKER ENGINE  (League Trend + Team Streak + Opponent Weakness)
// ------------------------------------------------------------
// Filters teams on strong streaks (win / no-loss / no-draw / no-win / loss /
// over / under) confirmed by the league trend, the opponent's goals profile,
// an opponent-weakness score, and the odds ladder. Rejects streak collisions.
// Skeptical by design (spec §25: a good streak alone is never enough — league
// trend + team streak + opponent profile + odds must ALL agree). Streaks are
// read from last-5 form strings, so the max streak length is 5 (no 6+ tier).
//
// Streak helpers — count the current run at the END of a form string "WWDLW".
function tailStreak(form, pred){
  const s=String(form||"").replace(/[^WDL]/gi,"").toUpperCase();
  let n=0; for(let i=s.length-1;i>=0;i--){ if(pred(s[i])) n++; else break; } return n;
}
const winStreak    = f=>tailStreak(f,c=>c==="W");
const lossStreak   = f=>tailStreak(f,c=>c==="L");
const noLossStreak = f=>tailStreak(f,c=>c!=="L");   // W or D
const noWinStreak  = f=>tailStreak(f,c=>c!=="W");   // D or L
const noDrawStreak = f=>tailStreak(f,c=>c!=="D");   // W or L

function streakOut(m, market, grade, score, side, reasons, extra){
  const noStand = (typeof hasNoStandings==='function') && hasNoStandings(m);
  const banker = market!=="No Bet" && (grade==="Banker"||grade==="Elite Banker") && !noStand;
  const confMap = { "Strong Pick":7, "Banker":8, "Elite Banker":10 };
  return {
    match:m, engine:"streaks", primary:market, bet:market!=="No Bet",
    banker, confidence: market==="No Bet"?0:(confMap[grade]||6),
    grade: grade||null, score: score!=null?`${score}/18`:null, side: side||null,
    verdict: `${market}${market!=="No Bet"?` (Streaks — ${grade}, ${score}/18)`:" — No Bet"}. ${reasons.join(' ')}`,
    reasons, humanChecks:["Streak-based; verify the streak isn't stale, and check lineups/motivation."],
    ...(extra||{})
  };
}

function streakRecommend(m){
  if(!m) return streakOut(m,"No Bet",null,null,null,["No match data."]);
  const o=m.odds;
  // odds are required (mandatory-odds policy) and the ladder confirms markets
  if(!o || (o.home==null && o.over15==null && o.under35==null)){
    if(!isUpcomingNoScore(m)) return streakOut(m,"No Bet",null,null,null,["No bookmaker odds — streak picks need odds confirmation."]);
  var __streakNoOdds=true;
  }

  // ---- team streaks: prefer REAL streaks (any length, from season history);
  // fall back to last-5 form strings when history wasn't fetched. ----
  const hs=m.homeStreaks, as=m.awayStreaks;
  const hWin    = hs ? hs.win    : winStreak(m.homeForm);
  const aWin    = as ? as.win    : winStreak(m.awayForm);
  const hNoLoss = hs ? hs.noLoss : noLossStreak(m.homeForm);
  const aNoLoss = as ? as.noLoss : noLossStreak(m.awayForm);
  const hNoWin  = hs ? hs.noWin  : noWinStreak(m.homeForm);
  const aNoWin  = as ? as.noWin  : noWinStreak(m.awayForm);
  const hLoss   = hs ? hs.loss   : lossStreak(m.homeForm);
  const aLoss   = as ? as.loss   : lossStreak(m.awayForm);
  const hNoDraw = hs ? hs.noDraw : noDrawStreak(m.homeForm);
  const aNoDraw = as ? as.noDraw : noDrawStreak(m.awayForm);

  // ---- league trend (League First rule §1-2) ----
  const lt=m.leagueTrends;
  const leagueRate = mk => { if(!lt||!lt.rates) return null; return lt.rates[mk]!=null?lt.rates[mk]:null; };
  const leagueWinTrend = Math.max(leagueRate("Home Win")||0, leagueRate("Away Win")||0);

  // ---- opponent goals profile + venue split (§4-5) ----
  // For a HOME pick, opponent is AWAY → use away scoring/conceding, and vice versa.
  const prof = homeSide => homeSide
    ? { oppScore:m.awayScoredAway, oppConcede:m.awayConcededAway, teamScore:m.homeScoredAtHome, teamConcede:m.homeConcededAtHome }
    : { oppScore:m.homeScoredAtHome, oppConcede:m.homeConcededAtHome, teamScore:m.awayScoredAway, teamConcede:m.awayConcededAway };

  // ---- opponent weakness score (§18) ----
  function oppWeakness(homeSide){
    const p=prof(homeSide); let s=0;
    if(p.oppScore!=null){ if(p.oppScore<0.70)s+=3; else if(p.oppScore<1.00)s+=2; }
    if(p.oppConcede!=null){ if(p.oppConcede>=1.60)s+=3; else if(p.oppConcede>=1.30)s+=2; }
    const oppNoWin = homeSide? aNoWin : hNoWin;
    const oppLoss  = homeSide? aLoss : hLoss;
    if(oppNoWin>=5)s+=3; if(oppLoss>=4)s+=2;
    const oppCS = homeSide? m.awayCleanSheetRate : m.homeCleanSheetRate;
    if(oppCS!=null && oppCS<0.25)s+=1;
    // HT/FT signal: an opponent that COLLAPSES from HT (loses when trailing) is
    // weaker; one that's a DRAW-SPECIALIST is LESS exploitable for a straight win.
    const oppHtft = homeSide ? (as&&as.htft) : (hs&&hs.htft);
    if(oppHtft){
      if(oppHtft.collapseRate!=null && oppHtft.collapseRate>=0.60) s+=2; // folds when behind
      if(oppHtft.drawEndRate!=null && oppHtft.drawEndRate>=0.45) s-=2;   // draw-magnet: HARDER to beat outright
    }
    return s;
  }

  // ---- streak collision rejection (§17) ----
  function collision(homeSide){
    const teamWin  = homeSide? hWin : aWin;
    const oppNoLoss= homeSide? aNoLoss : hNoLoss;
    const oppWin   = homeSide? aWin : hWin;
    if(teamWin>=4 && oppNoLoss>=5) return true;        // win streak vs opp no-loss
    if(hNoWin>=5 && aNoWin>=5) return true;             // both on no-win
    if(oppWin>=4 && (homeSide?hWin:aWin)<3) return true;// opp on a stronger win run
    return false;
  }

  // ---- banker score (§19) ----
  function bankerScore(homeSide, teamStreak, oddsConfirms){
    let s=0;
    const lw=leagueWinTrend;
    if(lw>=0.70)s+=3; else if(lw>=0.65)s+=1;
    if(teamStreak>=6)s+=4; else if(teamStreak>=5)s+=3; else if(teamStreak>=4)s+=2;
    const ow=oppWeakness(homeSide);
    if(ow>=7)s+=3; else if(ow>=5)s+=1;
    if(oddsConfirms)s+=2;
    if(homeSide)s+=1; // home advantage
    if(!collision(homeSide))s+=2;
    // market odds in safe zone (team priced as a real favourite)
    const teamOdd=o?(homeSide?o.home:o.away):null;
    if(teamOdd!=null && teamOdd>=1.20 && teamOdd<=2.10)s+=2;
    return s;
  }

  // choose which side (if any) has the qualifying streak — prefer the stronger run
  const candidates=[];
  // WIN / NO-LOSS streaks → win-family markets (§6,§7)
  [[true,hWin,hNoLoss],[false,aWin,aNoLoss]].forEach(([homeSide,wStreak,nlStreak])=>{
    const streak=Math.max(wStreak,nlStreak);
    if(streak<4) return;
    if(collision(homeSide)) return;
    const teamOdd=o?(homeSide?o.home:o.away):null;
    if(teamOdd==null) return;
    // pick market by odds ladder zone (validated by oddsLadderGate below)
    let market;
    if(teamOdd>=1.20 && teamOdd<=1.59) market = homeSide?"Home Win":"Away Win";
    else if(teamOdd>=1.60 && teamOdd<=2.10) market = homeSide?"Home DNB":"Away DNB";
    else if(teamOdd>2.10) market = homeSide?"Double Chance 1X":"Double Chance X2";
    else return; // < 1.20 no value
    const score=bankerScore(homeSide, streak, true);
    candidates.push({ homeSide, market, streak, score, kind: wStreak>=4?"win":"no-loss" });
  });

  // ---- MARKET STREAKS (beyond wins) — team streak in a market only counts
  // when the OPPONENT'S record in the SAME market agrees (owner request). All
  // fields are the new fetcher extensions; absent on old data → skips honestly.
  const lr = mk => { if(!lt||!lt.rates) return null; return lt.rates[mk]!=null?lt.rates[mk]:null; };
  function mkCand(market, score, streak, why){ if(score>=10) candidates.push({homeSide:null, market, streak, score, kind:"market", why}); }
  if(hs&&as){
    const trendBoost = mk => { const r=lr(mk); return r==null?0 : r>=0.70?3 : r>=0.60?1 : r<=0.40?-3 : 0; };
    // OVER 2.5 — both teams on over runs, league not an under-league
    if((hs.over25||0)>=4 && (as.over25||0)>=3)
      mkCand("Over 2.5 Goals", 8+Math.min(hs.over25+as.over25-7,4)+trendBoost("Over 2.5"), Math.min(hs.over25,as.over25),
        `Both sides trending over: home ${hs.over25} straight O2.5, away ${as.over25}.`);
    // UNDER — both on under runs
    if((hs.under25||0)>=4 && (as.under25||0)>=3)
      mkCand("Under 2.5 Goals", 8+Math.min(hs.under25+as.under25-7,4)+trendBoost("Under 2.5"), Math.min(hs.under25,as.under25),
        `Both sides trending under: home ${hs.under25} straight U2.5, away ${as.under25}.`);
    else if((hs.under35||0)>=4 && (as.under35||0)>=4)
      mkCand("Under 3.5 Goals", 8+trendBoost("Under 3.5"), Math.min(hs.under35,as.under35),
        `Both sides ${hs.under35}/${as.under35} straight U3.5.`);
    // OVER 1.5 — the safest over line; both sides seeing 2+ goal games
    if((hs.over15||0)>=5 && (as.over15||0)>=4)
      mkCand("Over 1.5 Goals", 9+trendBoost("Over 1.5"), Math.min(hs.over15,as.over15),
        `Every recent game has had 2+ goals: home ${hs.over15} straight O1.5, away ${as.over15}.`);
    // OVER 3.5 — goal-fest streaks on both sides (rarer, demands more)
    if((hs.over35||0)>=3 && (as.over35||0)>=3)
      mkCand("Over 3.5 Goals", 8+trendBoost("Over 3.5"), Math.min(hs.over35,as.over35),
        `Goal-fest pattern: home ${hs.over35} straight 4+ goal games, away ${as.over35}.`);
    // UNDER 1.5 — extreme low-scoring alignment (very strict)
    if((hs.under15||0)>=3 && (as.under15||0)>=3 && (hs.failedToScore||0)>=1 && (as.failedToScore||0)>=1)
      mkCand("Under 1.5 Goals", 8, Math.min(hs.under15,as.under15),
        `Both sides in 0-1 goal games ${hs.under15}/${as.under15} straight, both struggling to score.`);
    // GG — both scoring AND both conceding streaks agree
    if((hs.btts||0)>=3 && (as.btts||0)>=3 && (hs.concededEvery||0)>=3 && (as.concededEvery||0)>=3)
      mkCand("BTTS Yes", 8+Math.min(hs.btts+as.btts-5,4)+trendBoost("BTTS Yes"), Math.min(hs.btts,as.btts),
        `GG streaks align: home ${hs.btts} straight BTTS, away ${as.btts}; both concede every game.`);
    // NG — one side shutting teams out vs an opponent that can't score
    if((hs.cleanSheet||0)>=3 && (as.failedToScore||0)>=2)
      mkCand("BTTS No", 8+trendBoost("BTTS No"), hs.cleanSheet,
        `Home ${hs.cleanSheet} straight clean sheets vs away failing to score (${as.failedToScore} straight).`);
    else if((as.cleanSheet||0)>=3 && (hs.failedToScore||0)>=2)
      mkCand("BTTS No", 8+trendBoost("BTTS No"), as.cleanSheet,
        `Away ${as.cleanSheet} straight clean sheets vs home failing to score.`);
    // TEAM OVER 1.5 — scoring streak vs an opponent conceding EVERY game
    if((hs.teamOver15||0)>=3 && (as.concededEvery||0)>=4)
      mkCand("Home Team Over 1.5 Goals", 10, hs.teamOver15,
        `Home scored 2+ in ${hs.teamOver15} straight; away conceded in ${as.concededEvery} straight.`);
    if((as.teamOver15||0)>=3 && (hs.concededEvery||0)>=4)
      mkCand("Away Team Over 1.5 Goals", 10, as.teamOver15,
        `Away scored 2+ in ${as.teamOver15} straight; home conceded in ${hs.concededEvery} straight.`);
  }

  // ---- LEAGUE-TREND ALIGNMENT — ship games that FIT the league's identity:
  // low-scoring defensive teams in a low-scoring league, GG teams in a GG
  // league, over-teams in a goal-friendly league (owner request).
  if(lt&&lt.rates){
    const hAtt=m.homeScoredAtHome, aAtt=m.awayScoredAway, hDef=m.homeConcededAtHome, aDef=m.awayConcededAway;
    const u25=lr("Under 2.5"), gg=lr("BTTS Yes"), o25=lr("Over 2.5");
    const u35=lr("Under 3.5"), o15=lr("Over 1.5");
    if(u25!=null&&u25>=0.55 && hAtt!=null&&aAtt!=null&&hAtt<=1.35&&aAtt<=1.25 && hDef!=null&&aDef!=null&&hDef<=1.25&&aDef<=1.35)
      mkCand("Under 2.5 Goals", 10+(u25>=0.62?2:0), null,
        `League-trend fit: ${Math.round(u25*100)}% of this league goes under, and both teams are low-scoring/defensive.`);
    if(u35!=null&&u35>=0.72 && hAtt!=null&&aAtt!=null&&(hAtt+aAtt)<=2.60)
      mkCand("Under 3.5 Goals", 10+(u35>=0.80?2:0), null,
        `League-trend fit: ${Math.round(u35*100)}% of this league stays under 3.5, and neither side is prolific.`);
    if(gg!=null&&gg>=0.55 && hAtt!=null&&aAtt!=null&&hAtt>=1.10&&aAtt>=0.95 && hDef!=null&&aDef!=null&&hDef>=0.95&&aDef>=0.95)
      mkCand("BTTS Yes", 10+(gg>=0.62?2:0), null,
        `League-trend fit: ${Math.round(gg*100)}% GG league, and both teams score and concede freely.`);
    if(o25!=null&&o25>=0.56 && hAtt!=null&&aAtt!=null&&(hAtt+aAtt)>=2.60)
      mkCand("Over 2.5 Goals", 10+(o25>=0.64?2:0), null,
        `League-trend fit: ${Math.round(o25*100)}% of games go over in a goal-friendly league, and these attacks average ${(hAtt+aAtt).toFixed(1)} between them.`);
    if(o15!=null&&o15>=0.78 && hAtt!=null&&aAtt!=null&&(hAtt+aAtt)>=2.20)
      mkCand("Over 1.5 Goals", 10+(o15>=0.85?2:0), null,
        `League-trend fit: ${Math.round(o15*100)}% of this league sees 2+ goals, and these sides can score.`);
  }

  if(!candidates.length){
    return streakOut(m,"No Bet",null,null,null,["No qualifying streak in any market (win, totals, GG, clean-sheet) and no league-trend fit — honest No Bet."]);
  }
  candidates.sort((a,b)=>b.score-a.score||b.streak-a.streak);
  const best=candidates[0];

  // FINAL: odds ladder must confirm the chosen market (§16, reuse the gate)
  if(typeof __streakNoOdds!=='undefined'&&__streakNoOdds)
    return provisionalize(streakOut(m,best.market,"Strong Pick",Math.min(best.score,18),best.homeSide!=null?(best.homeSide?"home":"away"):null,[best.why]), best.market, [best.why]);
  const gate = (typeof oddsLadderGate==='function') ? oddsLadderGate(m, best.market) : {ok:true,block:false};
  if(gate.block){
    const lead = best.kind==="market" ? best.why : `Streak found (${best.streak} games).`;
    return streakOut(m,"No Bet",null,best.score,best.homeSide?"home":"away",
      [`${lead} But the odds ladder rejected ${best.market}: ${gate.reason}`]);
  }

  // risk grade from banker score (§19)
  let grade;
  if(best.score>=15) grade="Elite Banker";
  else if(best.score>=12) grade="Banker";
  else if(best.score>=10) grade="Strong Pick";
  else return streakOut(m,"No Bet",null,best.score,best.homeSide?"home":"away",
    [`Streak candidate scored only ${best.score}/18 — below the 10-point banker floor.`]);

  // MARKET/TREND candidates have no single backed side — emit directly.
  if(best.kind==="market"){
    const g2=(typeof oddsLadderGate==='function')?oddsLadderGate(m,best.market):{ok:true,block:false};
    if(g2.block) return streakOut(m,"No Bet",null,best.score,null,[`${best.why} But the odds ladder rejected ${best.market}: ${g2.reason}`]);
    const grade2 = best.score>=14?"Elite Banker":best.score>=12?"Banker":"Strong Pick";
    return streakOut(m,best.market,grade2,Math.min(best.score,18),null,
      [best.why, `Opponent-confirmed market streak / league-trend fit. Score ${Math.min(best.score,18)}/18.`],
      { streakLen:best.streak||null });
  }
  const teamName = best.homeSide? m.home : m.away;
  const ow=oppWeakness(best.homeSide);
  // HT/FT context on the backed team and opponent, for the reason line + a
  // straight-win caution: a team that THROWS leads is riskier to back to win.
  const teamHtft = best.homeSide ? (hs&&hs.htft) : (as&&as.htft);
  const oppHtft  = best.homeSide ? (as&&as.htft) : (hs&&hs.htft);
  const htftNotes=[];
  if(teamHtft && teamHtft.holdLeadRate!=null) htftNotes.push(`holds leads ${Math.round(teamHtft.holdLeadRate*100)}%`);
  if(oppHtft && oppHtft.drawEndRate!=null && oppHtft.drawEndRate>=0.45) htftNotes.push(`opponent is a draw-specialist (${Math.round(oppHtft.drawEndRate*100)}% end drawn)`);
  if(oppHtft && oppHtft.collapseRate!=null && oppHtft.collapseRate>=0.60) htftNotes.push(`opponent collapses when behind (${Math.round(oppHtft.collapseRate*100)}%)`);

  const reasons=[
    `${teamName} on a ${best.streak}-game ${best.kind} streak.`,
    `League win trend ${Math.round(leagueWinTrend*100)}%, opponent weakness ${ow}/17.`,
    `Odds ladder confirms ${best.market}. Banker score ${best.score}/18.`
  ];
  if(htftNotes.length) reasons.push(`HT/FT: ${htftNotes.join('; ')}.`);
  return streakOut(m, best.market, grade, best.score, best.homeSide?"home":"away", reasons,
    { streakLen:best.streak, oppWeak:ow, htft: teamHtft||null });
}

// ============================================================
// INTERNATIONAL FRAME  (INTERNATIONAL COMPETITION STREAKS spec as a LAYER)
// ------------------------------------------------------------
// NOT a standalone engine. This is a shared frame — like oddsLadderGate and
// leagueContextVerdict — that wraps EVERY engine's pick whenever the match is
// a national-team competition game (World Cup, WC qualifiers, friendlies,
// continental champs + qualifiers, Nations League, Olympics, youth,
// invitationals). Club matches pass through completely untouched.
//
// What the frame enforces on international picks (owner's 27-section spec):
//   §3/§4  Knockout protection — Over/GG picks need a proven extreme
//          mismatch (6+ of 9 checks) or they are rejected/downgraded.
//   §10-13 Scoring-class conflicts — aggressive Overs in low-scoring /
//          draw-prone competitions and tight Unders in high-scoring ones
//          are downgraded one notch unless the stats justify them.
//   §15/§21 Friendlies NEVER carry banker status (motivation unverifiable).
//   §20    Streak collisions — one collision downgrades, two rejects.
//   §17    Every downgraded market is re-run through oddsLadderGate; if the
//          safer market fails the ladder too, the pick becomes No Bet.
//   Thin/absent competition sample → pick kept, banker status stripped.
//
// Pedigree is HYBRID (agreed approach): manual override from pedigree.js
// (window.PEDIGREE / require) when the team is listed, otherwise an auto
// proxy computed from real stats + market odds. Squad news / rotation is
// NOT in the data feed, so knockout/friendly picks carry a humanChecks note.

// ---- eligibility: national-team competition, NOT a club competition ----
function isInternationalComp(m){
  if(!m) return false;
  if(m.leagueId===1 || m.leagueId==="1") return true;               // World Cup
  const L=String(m.league||m.competition||"").toLowerCase();
  // explicit CLUB internationals are excluded even though country="World"
  if(/champions league|europa|conference league|libertadores|sudamericana|club world cup|club friendl|afc champions|caf champions|concacaf champions|intercontinental|super cup/.test(L)) return false;
  if(/world cup|fifa|friendl|nations league|qualif|euro(pean championship)?\b|copa am[eé]rica|africa cup|afcon|african nations|asian cup|gold cup|olympi|confederations|\bu-?1[6-9]\b|\bu-?2[0-3]\b|youth|toulon|kirin|king's cup|baltic cup|cosafa|wafu|gulf cup|arab cup/.test(L)) return true;
  // API-Football marks national-team comps with country "World"
  if(String(m.country||"").toLowerCase()==="world") return true;
  return false;
}

// ---- match type / stage (spec §2, §25 step 2) ----
function intlMatchType(m){
  const L=String(m.league||"").toLowerCase();
  const R=String(m.round||"").toLowerCase();
  const isFinal = /(^|\s)final(s)?($|\s)/.test(R) && !/semi|quarter/.test(R);
  if(m.isKnockout || /final|semi|quarter|round of|knockout|play-?off|1\/8|1\/4|1\/2/.test(R))
    return { type: isFinal ? "Final" : "Knockout", knockout:true, final:isFinal,
             semi:/semi/.test(R) };
  if(/friendl/.test(L)) return { type:"Friendly", knockout:false, friendly:true };
  if(/qualif/.test(L)||/qualif/.test(R)) return { type:"Qualifier", knockout:false, qualifier:true };
  if(m.sameGroup || /group/.test(R)) return { type:"Group Stage", knockout:false, group:true };
  return { type:"Group Stage", knockout:false, group:true }; // tournament default
}

// ---- competition scoring classification (spec §1) ----
function intlScoringClass(m){
  const t=m.leagueTrends, r=t&&t.rates;
  const la=m.leagueAvg||{};
  const gpg = (t&&t.gpg!=null)?t.gpg : (la.goalsPerGame!=null? la.goalsPerGame*2 : null); // leagueAvg gpg is per-team
  const drawR = (r&&r["Draw"]!=null)?r["Draw"] : (la.drawRate!=null? la.drawRate : null);
  const o15=r?r["Over 1.5"]:null, o25=r?r["Over 2.5"]:null,
        u25=r?r["Under 2.5"]:null, btts=r?r["BTTS Yes"]:null;
  const sample=t?t.sample:null;
  if(gpg==null) return null; // no data → caller decides No Bet
  let cls;
  if(gpg>=2.80 && (o15==null||o15>=0.75) && (o25==null||o25>=0.55) && (btts==null||btts>=0.52))
    cls="High-Scoring";
  else if(gpg>=2.40 && (o15==null||o15>=0.68))
    cls="Middle-Scoring";
  else if(gpg<2.40 || (u25!=null&&u25>=0.55) || (o25!=null&&o25<0.45))
    cls="Low-Scoring";
  else cls="Middle-Scoring";
  // draw-prone overlays low/middle when the draw rate is high (spec §1D)
  if(drawR!=null && drawR>=0.30 && cls!=="High-Scoring") cls="Draw-Prone";
  return { cls, gpg:Math.round(gpg*100)/100, drawR, o15, o25, u25, btts, sample, thin:!(sample>=50) };
}

// ---- real per-team scoring / conceding averages ----
// Prefer the REAL half-split sums (goals-by-minute) over venue splits, which
// carry defaults (1.3/1.0) when data is missing. Flags quality.
function intlAtt(m, side){
  const f1=m[side+"1HFor"], f2=m[side+"2HFor"];
  if(f1!=null&&f2!=null) return { v:Math.round((f1+f2)*100)/100, real:true };
  const v = side==="home"?m.homeScoredAtHome:m.awayScoredAway;
  return v!=null?{v, real:!!m.statsReal}:null;
}
function intlDef(m, side){
  const a1=m[side+"1HAgainst"], a2=m[side+"2HAgainst"];
  if(a1!=null&&a2!=null) return { v:Math.round((a1+a2)*100)/100, real:true };
  const v = side==="home"?m.homeConcededAtHome:m.awayConcededAway;
  return v!=null?{v, real:!!m.statsReal}:null;
}

// ---- pedigree (spec §5) — HYBRID: manual pedigree.js else stats proxy ----
function intlPedigree(m, side){
  const name = side==="home"?m.home:m.away;
  // 1) manual override
  let map=null;
  try{ map = (typeof window!=="undefined"&&window.PEDIGREE)||(typeof PEDIGREE!=="undefined"?PEDIGREE:null); }catch(e){}
  if(!map){ try{ map = require("./pedigree.js"); }catch(e){} }
  if(map){
    const key=Object.keys(map).find(k=>k.toLowerCase()===String(name||"").toLowerCase());
    if(key!=null){ const p=map[key];
      return { pts:p, grade:p>=12?"Elite":p>=9?"Strong":p>=6?"Usable":"Weak", source:"manual" }; }
  }
  // 2) auto proxy from real stats + market odds
  let pts=0;
  const wr = side==="home"?m.homeWinRate:m.awayWinRate;
  const ur = side==="home"?m.homeUnbeatenRate:m.awayUnbeatenRate;
  const att=intlAtt(m,side), def=intlDef(m,side);
  const o=m.odds, own = o?(side==="home"?o.home:o.away):null;
  const form = String(side==="home"?m.homeForm:m.awayForm||"").replace(/[^WDL]/gi,"");
  if(wr!=null){ pts += wr>=0.65?4:wr>=0.55?3:wr>=0.45?2:wr>=0.30?1:0; }
  if(ur!=null){ pts += ur>=0.70?2:ur>=0.55?1:0; }
  if(att){ pts += att.v>=1.8?2:att.v>=1.4?1:0; }
  if(def){ pts += def.v<=0.9?2:def.v<=1.2?1:0; }
  if(own!=null){ pts += own<=1.50?2:own<=2.10?1:0; }
  if((form.match(/W/g)||[]).length>=4) pts += 1;
  return { pts, grade:pts>=12?"Elite":pts>=9?"Strong":pts>=6?"Usable":"Weak", source:"auto" };
}

// ---- streak strength (spec §6) ----
function intlStreakTier(n){
  if(n>=6) return "Elite streak"; if(n>=5) return "Banker streak";
  if(n>=4) return "Strong streak"; if(n>=3) return "Watchlist"; return null;
}

// ---- extreme-mismatch test (spec §4) — needs 6+ of the checks ----
function intlMismatch(m, sPed, wPed, sAtt, wDef, strongSide){
  const o=m.odds||{};
  const fav = strongSide==="home"?o.home:o.away;
  const dog = strongSide==="home"?o.away:o.home;
  const sStk = strongSide==="home"?m.homeStreaks:m.awayStreaks;
  const wStk = strongSide==="home"?m.awayStreaks:m.homeStreaks;
  const checks=[
    sPed&&sPed.pts>=12,                                 // strong pedigree 12+
    wPed&&wPed.pts<=5,                                  // weak pedigree ≤5
    sAtt!=null&&sAtt>=2.00,                             // strong scores 2.00+
    wDef!=null&&wDef>=1.70,                             // weak concedes 1.70+
    !!(sStk&&sStk.win>=4),                              // proxy: scored/won run
    !!(wStk&&(wStk.loss>=3||wStk.noWin>=4)),            // weak team sinking
    fav!=null&&fav>=1.20&&fav<=1.45,                    // favourite 1.20–1.45
    dog!=null&&dog>=7.00,                               // opponent 7.00+
    o.draw!=null&&o.draw>=4.50                          // draw 4.50+
  ];
  const passed=checks.filter(Boolean).length;
  return { passed, pass:passed>=6, strong:passed>=7 };
}

// ---- THE FRAME ITSELF ----
// intlFrameApply(m, out): takes any engine's output object and, if the match
// is an international, validates/downgrades/rejects the pick per the spec.
// Idempotent (out._intlFramed) because some engines call others internally.
function intlFrameApply(m, out){
  try{
    if(!out || out._intlFramed || !m) return out;
    if(!isInternationalComp(m)) return out;
    out._intlFramed = true;

    const isNormalShape = out.rankWeight !== undefined;   // the Normal engine
    let market = out.primary != null ? out.primary : out.market;
    if(!market || market === "No Bet" || market === "Skip") return out;
    const setMkt = nm => { if(out.primary !== undefined) out.primary = nm;
                           if(out.market  !== undefined) out.market  = nm; market = nm; };

    // --- context ---
    const stage = intlMatchType(m);
    const sc    = intlScoringClass(m);                    // may be null
    const hPed  = intlPedigree(m,"home"), aPed = intlPedigree(m,"away");
    const homeStronger = hPed.pts >= aPed.pts;
    const sSide = homeStronger ? "home" : "away", wSide = homeStronger ? "away" : "home";
    const sPed  = homeStronger ? hPed : aPed,  wPed = homeStronger ? aPed : hPed;
    const wName = homeStronger ? m.away : m.home;
    const sAttO = intlAtt(m,sSide), wAttO = intlAtt(m,wSide);
    const wDefO = intlDef(m,wSide);
    const sAtt = sAttO ? sAttO.v : null, wAtt = wAttO ? wAttO.v : null;
    const wDef = wDefO ? wDefO.v : null;
    const combined = (sAtt != null && wAtt != null) ? Math.round((sAtt + wAtt) * 100) / 100 : null;
    const mm   = intlMismatch(m, sPed, wPed, sAtt, wDef, sSide);
    const sStk = (sSide === "home" ? m.homeStreaks : m.awayStreaks) || null;
    const wStk = (wSide === "home" ? m.homeStreaks : m.awayStreaks) || null;

    const notes = [];
    let dropBanker = false, rejected = false;

    const reject = why => { rejected = true; notes.push(why + " → No Bet."); };
    const SAFER = { "Over 3.5":"Over 2.5", "Over 2.5":"Over 1.5", "Over 2.5 + BTTS":"Over 1.5",
                    "Under 1.5":"Under 2.5", "Under 2.5":"Under 3.5", "BTTS Yes":"Over 1.5",
                    "Home Win":"Home DNB", "Away Win":"Away DNB",
                    "Home DNB":"Double Chance 1X", "Away DNB":"Double Chance X2" };
    const downgrade = why => {
      const nm = SAFER[market];
      if(!nm){ dropBanker = true; notes.push(why + " — pick held, banker status off."); return; }
      const g = oddsLadderGate(m, nm);
      if(g.block){ reject(why + `; safer ${nm} also fails the odds ladder (${g.reason})`); return; }
      notes.push(why + ` → downgraded to ${nm}.`); setMkt(nm); dropBanker = true;
    };

    const overFam   = /over|btts/i.test(market);
    const underFam  = /under/i.test(market);
    const resultFam = /win|dnb|double chance|1x|x2/i.test(market);

    // --- 1) KNOCKOUT PROTECTION (§3/§4/§24) ---
    if(stage.knockout && !rejected){
      if(/btts/i.test(market)){
        reject(`Knockout protection (§3/§24): GG is not in the knockout market hierarchy`);
      } else if(overFam){
        if(!mm.pass){
          reject(`Knockout protection (§3): no proven extreme mismatch (${mm.passed}/9 checks) to justify an Over`);
        } else {
          notes.push(`Extreme mismatch confirmed (${mm.passed}/9) — Over may stand in a knockout (§4).`);
          if(market === "Over 3.5" &&
             !(mm.strong && combined != null && combined >= 3.40 && sAtt != null && sAtt >= 2.30 && wDef != null && wDef >= 1.90)){
            downgrade("Over 3.5 needs the strongest mismatch stats (§4) — never from reputation alone");
          } else if(/Over 2.5/.test(market) && !mm.strong){
            downgrade("Over 2.5 in a knockout needs a STRONG mismatch (7+/9, §4)");
          }
        }
      } else if(resultFam && !rejected){
        const gap = sPed.pts - wPed.pts;
        if(!(mm.pass || gap >= 5)){
          if(/win/i.test(market) && !/dnb|double|1x|x2/i.test(market)){
            downgrade(`Knockout result pick without a clear pedigree gap (${sPed.pts} v ${wPed.pts}, §24)`);
          } else { dropBanker = true; notes.push(`Knockout caution (§24): result pick kept, banker status off (pedigree gap ${gap}).`); }
        }
      }
      if(stage.final && !rejected){ dropBanker = true; notes.push("Tournament FINAL — banker status withheld (§23)."); }
      else if(stage.semi && !rejected){ dropBanker = true; notes.push("Semifinal — banker status withheld (§23)."); }
    }

    // --- 2) SCORING-CLASS CONFLICTS (§10–§13, non-knockout, class known) ---
    if(!stage.knockout && sc && !rejected){
      if(sc.cls === "Low-Scoring" || sc.cls === "Draw-Prone"){
        if(/^Over (2\.5|3\.5)/.test(market) &&
           !(mm.pass || (sAtt != null && sAtt >= 2.00 && wDef != null && wDef >= 1.70))){
          downgrade(`${sc.cls} competition (${sc.gpg} goals/game): aggressive Over unsupported (§12/§13)`);
        } else if(/btts/i.test(market) && !(sAtt != null && sAtt >= 1.20 && wAtt != null && wAtt >= 1.20)){
          dropBanker = true; notes.push(`${sc.cls} competition: GG kept but banker status off (§19).`);
        }
      }
      if((sc.cls === "High-Scoring" || sc.cls === "Middle-Scoring") && underFam && market !== "Under 3.5"){
        const okU = combined != null && combined < 2.40 && ((sAtt != null && sAtt < 1.00) || (wAtt != null && wAtt < 1.00));
        if(!okU) downgrade(`${sc.cls} competition (${sc.gpg} goals/game) contradicts a tight Under (§10/§11)`);
      }
    }

    // --- 3) FRIENDLIES: never a banker (§15/§21) ---
    if(stage.friendly && !rejected){
      dropBanker = true;
      notes.push("International friendly — motivation and rotation unverifiable, never a banker (§15/§21).");
    }

    // --- 4) STREAK COLLISIONS (§20) ---
    if(!rejected){
      const collisions = [];
      if(overFam  && wStk && wStk.under25 >= 4) collisions.push(`${wName} on a ${wStk.under25}-game Under 2.5 run`);
      if(underFam && ((sStk && sStk.over25 >= 4) || (wStk && wStk.over25 >= 4))) collisions.push("an Over 2.5 streak contradicts the Under");
      if(resultFam && wStk && wStk.noLoss >= 4) collisions.push(`${wName} unbeaten in ${wStk.noLoss}`);
      if(overFam  && wDef != null && wDef < 0.90 && wPed.pts < 6) collisions.push(`${wName} concedes only ${wDef} despite weak pedigree`);
      if(collisions.length >= 2) reject(`Streak collisions (§20): ${collisions.join("; ")}`);
      else if(collisions.length === 1) downgrade(`Streak collision (§20): ${collisions[0]}`);
    }

    // --- 5) SAMPLE CAUTION ---
    if(!rejected && (!sc || sc.thin)){
      dropBanker = true;
      notes.push(sc ? `Thin competition sample (${sc.sample || 0} games) — banker status off.`
                    : "No competition-wide sample — stage rules applied only, banker status off.");
    }

    // --- APPLY ---
    if(rejected){
      setMkt(isNormalShape ? "Skip" : "No Bet");
      if(out.bet !== undefined) out.bet = false;
      out.banker = false;
      if(typeof out.confidence === "number") out.confidence = 0;
      else if(typeof out.confidence === "string") out.confidence = "Low";
      if(out.rankWeight !== undefined) out.rankWeight = 0;
    } else if(dropBanker && out.banker){ out.banker = false; }
    else if(dropBanker) out.banker = false;

    if(notes.length){
      const tag = " ⚑ INTL FRAME: " + notes.join(" ");
      if(out.verdict !== undefined) out.verdict = (out.verdict || "") + tag;
      if(out.summary !== undefined) out.summary = (out.summary || "") + tag;
      if(Array.isArray(out.reasons)) out.reasons.push("INTL FRAME: " + notes.join(" "));
      if(Array.isArray(out.failed) && rejected) out.failed.push("INTL FRAME: " + notes.join(" "));
    }
    if(!rejected && Array.isArray(out.humanChecks) && (stage.friendly || stage.knockout)){
      out.humanChecks.push("International: verify lineups, rotation and motivation before staking — squad news is not in the data feed.");
    }
    out.intlFrame = { applied:true, stage:stage.type, scoringClass: sc ? sc.cls : null,
                      mismatch: mm.pass ? (mm.strong ? "Extreme (strong)" : "Extreme") : "None",
                      changed: notes.length > 0, rejected, notes };
    return out;
  }catch(e){ return out; }
}

// ---- wrap EVERY engine so the frame runs automatically ----
/* ============================== HALVES ENGINE ==============================
   HT/FT-driven engine ("halves"). Predicts across all markets purely from
   half-time/full-time behaviour. FAIL-SAFE BY DESIGN: if the htft blocks are
   absent or the sample is under 8 matches (spec minimum), it returns an honest
   No Bet — it never guesses from season averages.

   DATA CONTRACT — fetch-data.js must emit, per team, on
   m.homeStreaks.htft / m.awayStreaks.htft (team-perspective rates 0..1):
     sample        matches where both HT and FT results are known (int)
     htWin/htDraw/htLoss     share of matches leading/level/trailing at HT
     ftWin/ftDraw/ftLoss     share of matches won/drawn/lost at FT
     drawToWin     P(FT win | HT draw)
     holdLeadRate  P(FT win | HT lead)
     throwLeadRate P(FT not-win | HT lead)
     collapseRate  P(FT loss | HT trailing)   (matches Streaks-engine semantics)
     comebackRate  P(FT win or draw | HT trailing)
     drawEndRate   share of matches drawn at FT
     fhFor/fhAg    avg 1st-half goals scored/conceded
     shFor/shAg    avg 2nd-half goals scored/conceded
     fhBtts        share of matches where both teams scored in the 1st half
     htCleanSheet  share of matches with opponent scoreless at HT
   All computable from API-Football score.halftime/score.fulltime on the
   team's last ~12-18 fixtures.
============================================================================ */
function halvesOut(m, market, grade, score, reasons, extra){
  const noStand=(typeof hasNoStandings==='function')&&hasNoStandings(m);
  const banker = market!=="No Bet" && (grade==="Banker"||grade==="Elite Banker") && !noStand;
  const confMap={ "Strong Pick":7, "Banker":8, "Elite Banker":10 };
  return { match:m, engine:"halves", primary:market, bet:market!=="No Bet",
    banker, confidence: market==="No Bet"?0:(confMap[grade]||6),
    grade:grade||null, score:score!=null?`${score}/12`:null,
    verdict:`${market}${market!=="No Bet"?` (Halves — ${grade}, ${score}/12)`:" — No Bet"}. ${reasons.join(' ')}`,
    reasons, humanChecks:["HT/FT-pattern based; confirm lineups and that the sample isn't stale."],
    ...(extra||{}) };
}
function halvesRecommend(m){
  if(!m) return halvesOut(m,"No Bet",null,null,["No match data."]);
  const o=m.odds;
  const noOdds=!o||(o.home==null&&o.over15==null&&o.under35==null);
  if(noOdds&&!isUpcomingNoScore(m)){
    return halvesOut(m,"No Bet",null,null,["No bookmaker odds — HT/FT picks need odds confirmation."]);
  }
  const H=m.homeStreaks&&m.homeStreaks.htft, A=m.awayStreaks&&m.awayStreaks.htft;
  if(!H||!A) return halvesOut(m,"No Bet",null,null,["No HT/FT data for one or both teams — engine stands down (honest No Bet)."]);
  if((H.sample||0)<8||(A.sample||0)<8){
    return halvesOut(m,"No Bet",null,null,[`HT/FT sample too small (${H.sample||0}/${A.sample||0}, need 8+) — no reliable pattern.`]);
  }
  const n=v=>v==null?null:+v;
  // expected goals per half from both teams' half splits
  const expFH=((n(H.fhFor)||0)+(n(A.fhAg)||0))/2 + ((n(A.fhFor)||0)+(n(H.fhAg)||0))/2;
  const expSH=((n(H.shFor)||0)+(n(A.shAg)||0))/2 + ((n(A.shFor)||0)+(n(H.shAg)||0))/2;
  const expT=expFH+expSH;
  const cands=[]; const C=(market,score,why)=>cands.push({market,score,why});

  // ---- RESULT MARKETS: lead-and-hold vs comeback profiles ----
  if(n(H.htWin)>=0.45&&n(H.holdLeadRate)>=0.75&&n(H.ftWin)>=0.50&&n(A.comebackRate)!=null&&A.comebackRate<0.35)
    C("Home Win",8+(H.holdLeadRate>=0.85?2:0),`Home leads at HT ${Math.round(H.htWin*100)}% and holds ${Math.round(H.holdLeadRate*100)}% of leads; away rarely comes back.`);
  if(n(A.htWin)>=0.45&&n(A.holdLeadRate)>=0.75&&n(A.ftWin)>=0.50&&n(H.comebackRate)!=null&&H.comebackRate<0.35)
    C("Away Win",8+(A.holdLeadRate>=0.85?2:0),`Away leads at HT ${Math.round(A.htWin*100)}% and holds ${Math.round(A.holdLeadRate*100)}% of leads.`);
  if(n(H.htWin)>=0.40&&n(H.throwLeadRate)!=null&&H.throwLeadRate<=0.25&&n(H.ftLoss)<=0.25)
    C("Home DNB",7,`Home rarely throws a lead (${Math.round(H.throwLeadRate*100)}%) and loses only ${Math.round(H.ftLoss*100)}% overall.`);
  if(n(A.htWin)>=0.40&&n(A.throwLeadRate)!=null&&A.throwLeadRate<=0.25&&n(A.ftLoss)<=0.25)
    C("Away DNB",7,`Away rarely throws a lead and loses only ${Math.round(A.ftLoss*100)}% overall.`);
  // second-half surge → safer DNB rather than straight win
  if(n(H.htDraw)>=0.45&&n(H.drawToWin)>=0.35&&n(H.shFor)>n(H.fhFor)&&n(A.shAg)>=0.8)
    C("Home DNB",7,`Home converts HT draws to wins ${Math.round(H.drawToWin*100)}% of the time and is stronger after the break.`);

  // ---- HT/FT COMBO (spec Priority 8: strict) ----
  if(n(H.htDraw)>=0.45&&n(H.drawToWin)>=0.35&&n(H.ftWin)>=0.50&&n(H.shFor)>n(H.fhFor)&&n(A.shAg)>=0.9)
    C("HT Draw / FT Home Win",6,`Strong X/1 pattern: HT draw ${Math.round(H.htDraw*100)}%, converts ${Math.round(H.drawToWin*100)}%, second-half dominant.`);

  // ---- TOTALS from half splits ----
  if(expT<=2.40&&n(H.fhFor)<=0.60&&n(A.fhFor)<=0.60&&Math.max(n(H.drawEndRate)||0,n(A.drawEndRate)||0)>=0.30)
    C("Under 2.5 Goals",8,`Both sides quiet in first halves; expected total ${expT.toFixed(2)}.`);
  if(expT<3.00&&expFH<=1.20)
    C("Under 3.5 Goals",7,`Half-split expectancy ${expT.toFixed(2)} with slow first halves (${expFH.toFixed(2)}).`);
  if(expT>=3.20&&n(H.fhBtts)>=0.35&&n(A.fhBtts)>=0.35)
    C("Over 2.5 Goals",8,`Open halves on both sides; expected total ${expT.toFixed(2)}, first-half BTTS ${Math.round(H.fhBtts*100)}%/${Math.round(A.fhBtts*100)}%.`);
  if(expFH>=1.30&&n(H.fhFor)>=0.70&&n(A.fhFor)>=0.50)
    C("Over 1.5 Goals",7,`Fast starts: expected first-half goals ${expFH.toFixed(2)} alone.`);

  // ---- BTTS: HT behaviour TRIGGERS, full-time evidence must CONFIRM ----
  // HT-only stats stretched to a 90-minute market was this board's weakest
  // reasoning (second halves add goals). Now: the HT pattern only nominates a
  // BTTS candidate; it must be confirmed by full-time rates (ftBtts/ftCS/ftFTS,
  // in the data from the next full run) or, failing that, by the two teams'
  // profile projections. HT-only with no confirmation available = low-score
  // lean, explicitly labelled. FT evidence that DISAGREES = no candidate.
  const prof=p=>p&&p.goalsFor&&p.goalsFor.n>=4?p:null;
  const hp=prof(m.homeProfile), ap=prof(m.awayProfile);
  if(n(H.fhBtts)>=0.40&&n(A.fhBtts)>=0.40&&n(H.htCleanSheet)<=0.35&&n(A.htCleanSheet)<=0.35){
    const ht=`${Math.round(H.fhBtts*100)}%/${Math.round(A.fhBtts*100)}% first-half BTTS`;
    if(n(H.ftBtts)!=null&&n(A.ftBtts)!=null){
      if(H.ftBtts>=0.45&&A.ftBtts>=0.45)
        C("BTTS Yes",8,`Both nets ripple early (${ht}) and full time confirms: BTTS lands in ${Math.round(H.ftBtts*100)}%/${Math.round(A.ftBtts*100)}% of their matches.`);
      // else: FT rates disagree with the HT pattern -> honest silence
    } else if(hp&&ap){
      if(hp.goalsFor.v>=1.0&&ap.goalsFor.v>=1.0)
        C("BTTS Yes",7,`Both nets ripple early (${ht}); team profiles confirm both sides score (${hp.goalsFor.v}/${ap.goalsFor.v} goals per game).`);
    } else {
      C("BTTS Yes",5,`Early-goals pattern (${ht}) but no full-time confirmation available yet — HT-only evidence, treat as a lean.`);
    }
  }
  {
    const sides=[
      { cs:n(H.htCleanSheet), oppFh:n(A.fhFor), csFt:n(H.ftCS), oppFtsFt:n(A.ftFTS), oppProf:ap, who:"Home keeps", opp:"away" },
      { cs:n(A.htCleanSheet), oppFh:n(H.fhFor), csFt:n(A.ftCS), oppFtsFt:n(H.ftFTS), oppProf:hp, who:"Away keeps", opp:"home" },
    ];
    for(const S of sides){
      if(!(S.cs>=0.55&&S.oppFh<=0.40)) continue;
      const ht=`HT clean sheets ${Math.round(S.cs*100)}% while the ${S.opp} side starts scoreless`;
      if(S.csFt!=null||S.oppFtsFt!=null){
        const csOk=S.csFt!=null&&S.csFt>=0.35, ftsOk=S.oppFtsFt!=null&&S.oppFtsFt>=0.40;
        if(csOk||ftsOk)
          C("BTTS No",8,`${S.who} ${ht} — and full time confirms: ${csOk?`clean sheets held in ${Math.round(S.csFt*100)}% of matches`:``}${csOk&&ftsOk?`, `:``}${ftsOk?`${S.opp} side fails to score in ${Math.round(S.oppFtsFt*100)}%`:``}.`);
        // FT data present but below thresholds -> the 90-minute record does not
        // support the HT pattern -> no candidate.
      } else if(S.oppProf){
        if(S.oppProf.goalsFor.v<=0.90)
          C("BTTS No",7,`${S.who} ${ht}; profile confirms the ${S.opp} side manages only ${S.oppProf.goalsFor.v} goals per game.`);
      } else {
        C("BTTS No",5,`${S.who} ${ht} — no full-time confirmation available yet; HT-only evidence, treat as a lean.`);
      }
      break; // one BTTS No candidate max
    }
  }

  // ---- NATIVE HALF-TIME MARKETS (owner spec): HT evidence answering HT
  // questions — no stretch to full time. Both teams must confirm the same
  // pattern. These have NO bookmaker odds in our data, so they bypass the
  // odds ladder as clearly-labelled pattern-only picks, and they settle
  // against the stored half-time score (htHome/htAway).
  const HT_MARKETS=new Set(["HT Draw","Over 0.5 Goals HT","Under 1.5 Goals HT","Home Win Either Half","Away Win Either Half","Draw HT or FT"]);
  if(n(H.fhOver05)!=null&&n(A.fhOver05)!=null){
    if(H.fhOver05>=0.78&&A.fhOver05>=0.78&&expFH>=1.05)
      C("Over 0.5 Goals HT",8,`A first-half goal lands in ${Math.round(H.fhOver05*100)}%/${Math.round(A.fhOver05*100)}% of their games; expected first-half goals ${expFH.toFixed(2)}.`);
    if(H.fhUnder15>=0.72&&A.fhUnder15>=0.72&&expFH<=0.95)
      C("Under 1.5 Goals HT",8,`Slow starts both sides: first halves stay under 1.5 in ${Math.round(H.fhUnder15*100)}%/${Math.round(A.fhUnder15*100)}% of games (expected FH goals ${expFH.toFixed(2)}).`);
  }
  if(n(H.htDraw)!=null&&n(A.htDraw)!=null&&H.htDraw>=0.55&&A.htDraw>=0.55&&expFH<=1.05)
    C("HT Draw",7,`Both sides level at the break in ${Math.round(H.htDraw*100)}%/${Math.round(A.htDraw*100)}% of matches, with slow first halves.`);
  if(n(H.wonEitherHalf)!=null&&H.wonEitherHalf>=0.75&&n(A.wonEitherHalf)!=null&&A.wonEitherHalf<=0.45&&n(H.ftLoss)<=0.30)
    C("Home Win Either Half",8,`Home wins at least one half in ${Math.round(H.wonEitherHalf*100)}% of games while away manages it only ${Math.round(A.wonEitherHalf*100)}%.`);
  if(n(A.wonEitherHalf)!=null&&A.wonEitherHalf>=0.75&&n(H.wonEitherHalf)!=null&&H.wonEitherHalf<=0.45&&n(A.ftLoss)<=0.30)
    C("Away Win Either Half",8,`Away wins at least one half in ${Math.round(A.wonEitherHalf*100)}% of games while home manages it only ${Math.round(H.wonEitherHalf*100)}%.`);
  if(n(H.drawHTorFT)!=null&&n(A.drawHTorFT)!=null&&H.drawHTorFT>=0.62&&A.drawHTorFT>=0.62)
    C("Draw HT or FT",7,`A draw shows at half-time or full-time in ${Math.round(H.drawHTorFT*100)}%/${Math.round(A.drawHTorFT*100)}% of their matches — the safety net when the total-goals read is unclear.`);

  if(!cands.length) return halvesOut(m,"No Bet",null,null,["No HT/FT pattern strong enough — honest No Bet."]);
  cands.sort((x,y)=>y.score-x.score);
  if(noOdds) return provisionalize(halvesOut(m,cands[0].market,"Strong Pick",cands[0].score,[cands[0].why]), cands[0].market, [cands[0].why]);
  let best=cands[0];
  // universal odds ladder must confirm; try next candidates if blocked
  for(const c of cands){
    if(HT_MARKETS.has(c.market)){ best=c; best.gateNote="Half-time market — no bookmaker HT odds in our data, pattern-only pick."; break; }
    const g=(typeof oddsLadderGate==='function')?oddsLadderGate(m,c.market):{ok:true,block:false};
    if(g.ok){ best=c; best.gateNote=g.reason||null; break; }
    best=null;
  }
  if(!best) return halvesOut(m,"No Bet",null,null,["HT/FT pattern found but the odds ladder rejected every candidate market."]);
  const grade = best.score>=10?"Elite Banker":best.score>=8?"Banker":"Strong Pick";
  const reasons=[best.why]; if(best.gateNote) reasons.push(best.gateNote);
  reasons.push(`Samples: home ${H.sample}, away ${A.sample} matches.`);
  return halvesOut(m,best.market,grade,best.score,reasons);
}

/* ============================== MISMATCH ENGINE ==============================
   Fires ONLY when both teams' venue profiles point the SAME direction in a
   market: home's home-record and away's away-record agreeing. A true mismatch
   is two arrows aligned — not one strong team vs an unknown. Fail-safe: any
   missing venue stat = honest No Bet. */
function mismatchOut(m, market, grade, score, reasons){
  const noStand=(typeof hasNoStandings==='function')&&hasNoStandings(m);
  const banker= market!=="No Bet" && (grade==="Banker"||grade==="Elite Banker") && !noStand;
  const confMap={ "Strong Pick":7, "Banker":8, "Elite Banker":10 };
  return { match:m, engine:"mismatch", primary:market, bet:market!=="No Bet",
    banker, confidence: market==="No Bet"?0:(confMap[grade]||6), grade:grade||null,
    score:score!=null?`${score}/12`:null,
    verdict:`${market}${market!=="No Bet"?` (Mismatch — ${grade}, ${score}/12)`:" — No Bet"}. ${reasons.join(' ')}`,
    reasons, humanChecks:["Direction-alignment pick; confirm lineups and motivation."] };
}
function mismatchRecommend(m){
  if(!m) return mismatchOut(m,"No Bet",null,null,["No match data."]);
  const noOdds=!m.odds;
  if(noOdds&&!isUpcomingNoScore(m)) return mismatchOut(m,"No Bet",null,null,["No bookmaker odds — alignment needs price confirmation."]);
  const hA=m.homeScoredAtHome, hD=m.homeConcededAtHome, aA=m.awayScoredAway, aD=m.awayConcededAway;
  if(hA==null||hD==null||aA==null||aD==null)
    return mismatchOut(m,"No Bet",null,null,["Venue profiles incomplete — no alignment read (honest No Bet)."]);
  const gdH=m.homeGD, gdA=m.awayGD, posGap=(m.homePos!=null&&m.awayPos!=null)?(m.awayPos-m.homePos):null;
  // ---- league context: the environment steers WHICH line we take ----
  const lt=m.leagueTrends, LR=k=>(lt&&lt.rates&&lt.rates[k]!=null)?lt.rates[k]:null;
  const gpg=(lt&&lt.gpg!=null)?lt.gpg:null;
  const highLg=(LR("Over 2.5")!=null&&LR("Over 2.5")>=0.55)||(gpg!=null&&gpg>=2.90);
  const lowLg =(LR("Under 2.5")!=null&&LR("Under 2.5")>=0.55)||(gpg!=null&&gpg<=2.40);
  const lgB=mk=>{ const r=LR(mk); return r==null?0 : r>=0.62?2 : r>=0.52?1 : r<=0.40?-2 : 0; };
  const cands=[]; const C=(mk,sc,why)=>{ sc+=lgB(mk); if(sc>=8) cands.push({market:mk,score:Math.min(sc,12),why}); };

  // RESULT — home arrow UP and away arrow DOWN (or the reverse)
  const homeUp = hA>=1.50&&hD<=1.00&&(gdH==null||gdH>0);
  const awayDown = aA<=0.90&&aD>=1.50&&(gdA==null||gdA<0);
  if(homeUp&&awayDown)
    C("Home Win", 9+(posGap!=null&&posGap>=6?2:0)+((hA-aA)>=1.0?1:0),
      `Both arrows aligned: home scores ${hA}/concedes ${hD} at home while away manages ${aA} and ships ${aD} on the road.`);
  const awayUp = aA>=1.40&&aD<=1.00&&(gdA==null||gdA>0);
  const homeDown = hA<=0.90&&hD>=1.40&&(gdH==null||gdH<0);
  if(awayUp&&homeDown)
    C("Away Win", 9+(posGap!=null&&posGap<=-6?2:0),
      `Both arrows aligned the other way: away travels well (${aA} for, ${aD} against) into a home side leaking ${hD}.`);

  // TOTALS — both profiles pointing low / high; LEAGUE decides the line
  if(hA<=1.10&&hD<=1.00&&aA<=1.00&&aD<=1.10){
    if(highLg){
      // low-scoring pair in a HIGH-scoring league: the league inflates goals —
      // take the SAFER line and outrank BTTS No (owner rule)
      C("Under 3.5 Goals", 10+((hA+aA)<=1.7?1:0), `Low-scoring pair (${hA}/${aA} for) in a high-scoring league — safer Under 3.5 over the tight line.`);
      C("Under 2.5 Goals", 8, `All four venue numbers point low, but the league runs hot — U2.5 is second choice.`);
    } else if(lowLg){
      // low pair in a LOW league: environment supports the tight line
      C("Under 2.5 Goals", 10+((hA+aA)<=1.7?2:0), `All four venue numbers point low (${hA}/${hD}, ${aA}/${aD}) in a league that stays under — U2.5 preferred.`);
    } else {
      C("Under 2.5 Goals", 9+((hA+aA)<=1.7?2:0), `All four venue numbers point low: ${hA}/${hD} home, ${aA}/${aD} away.`);
    }
  }
  else if((hA+aA)<=2.30&&(hD+aD)<=2.30)
    C("Under 3.5 Goals", 8+(highLg?1:0), `Combined attack ${(hA+aA).toFixed(1)} and defence ${(hD+aD).toFixed(1)} both point to a quiet game.`);
  if(hA>=1.60&&hD>=1.20&&aA>=1.20&&aD>=1.40){
    if(lowLg){
      // attacking pair in a LOW-scoring league: don't fight the environment — safer over line
      C("Over 1.5 Goals", 10, `Both sides attack, but the league runs cold — Over 1.5 preferred over 2.5.`);
      C("Over 2.5 Goals", 8, `Goal alignment in a low-scoring league — O2.5 second choice.`);
    } else {
      C("Over 2.5 Goals", 9+((hA+aA)>=3.2?2:0)+(highLg?1:0), `Every arrow points to goals: both attack, both concede.`);
    }
  }
  else if((hA+aA)>=2.60&&(hD+aD)>=2.40)
    C("Over 1.5 Goals", 8, `Attacks total ${(hA+aA).toFixed(1)} into defences shipping ${(hD+aD).toFixed(1)} — 2+ goals aligned.`);

  // BTTS — a COMPLETE argument, not half of one. BTTS No needs the blanked side
  // weak in attack AND the OTHER side not a reliable scorer (else it's BTTS Yes),
  // confirmed by the team profiles' goal projections where available. Owner audit:
  // the old rule only checked the away attack + home defence and ignored whether
  // the home side scores — half an argument for a two-sided market.
  const mp=p=>p&&p.goalsFor&&p.goalsFor.n>=4?p:null;
  const mhp=mp(m.homeProfile), map=mp(m.awayProfile);
  if(hA>=1.30&&hD>=1.00&&aA>=1.00&&aD>=1.00){
    // BTTS Yes: both attacks live AND both defences leak — confirm both score.
    const bothProjScore = (!mhp||!map) || (mhp.goalsFor.v>=0.95 && map.goalsFor.v>=0.95);
    if(bothProjScore)
      C("BTTS Yes", 8+((hA>=1.6&&aA>=1.2)?1:0), `Both score and both concede at their venues${mhp&&map?` (profiles ${mhp.goalsFor.v}/${map.goalsFor.v} goals per game)`:``} — GG alignment.`);
  }
  // BTTS No: identify the side likely blanked, and REQUIRE the other side is not
  // a dependable scorer (the missing half of the old rule).
  {
    // case A: AWAY blanked — away weak attack + home tight defence, AND home not
    // so prolific that it drags in a goal-fest making BTTS Yes anyway is irrelevant
    // (BTTS No only needs ONE side to fail; the risk is the BLANKED side scoring).
    const awayBlanked = aA<=0.80 && hD<=0.85 && (map ? map.goalsFor.v<=0.90 : true);
    const homeBlanked = hA<=0.80 && aD<=0.85 && (mhp ? mhp.goalsFor.v<=0.90 : true);
    if(awayBlanked){
      const conf = map ? ` — profile confirms away manages only ${map.goalsFor.v} goals per game` : (aA<=0.80?"":"");
      C("BTTS No", 8-(highLg?2:0), `Away side is the one likely blanked: scores just ${aA} on the road into a home defence conceding ${hD}${conf}. Home scoring makes it 1-0-type, not both-net.`);
    } else if(homeBlanked){
      const conf = mhp ? ` — profile confirms home manages only ${mhp.goalsFor.v} goals per game` : "";
      C("BTTS No", 8-(highLg?2:0), `Home side is the one likely blanked: scores just ${hA} at home into an away defence conceding ${aD}${conf}.`);
    }
    // if profiles exist and say the "blanked" side actually scores >=1.0/game,
    // neither branch fires -> honest No candidate rather than a half-argument.
  }

  // TEAM GOALS — strong attack into a leaking defence, both pointing the same way
  if(hA>=1.80&&aD>=1.60)
    C("Home Team Over 1.5 Goals", 8+(hA>=2.1?1:0), `Home banging in ${hA} at home into a defence conceding ${aD} away.`);

  if(!cands.length) return mismatchOut(m,"No Bet",null,null,["No directional alignment — the teams' profiles disagree (honest No Bet)."]);
  cands.sort((x,y)=>y.score-x.score);
  if(noOdds) return provisionalize(mismatchOut(m,cands[0].market,"Strong Pick",cands[0].score,[cands[0].why]), cands[0].market, [cands[0].why]);
  let best=null;
  for(const c of cands){
    const g=(typeof oddsLadderGate==='function')?oddsLadderGate(m,c.market):{ok:true,block:false};
    if(!g.block){ best=c; best.gateNote=g.reason||null; break; }
  }
  if(!best) return mismatchOut(m,"No Bet",null,cands[0].score,[`${cands[0].why} But the odds ladder rejected every aligned market.`]);
  const grade=best.score>=11?"Elite Banker":best.score>=9?"Banker":"Strong Pick";
  const reasons=[best.why]; if(best.gateNote)reasons.push(best.gateNote);
  return mismatchOut(m,best.market,grade,best.score,reasons);
}

/* ==================== NORMAL ENGINE v3.0 (spec replacement) ====================
   STRICT FOOTBALL BETTING MARKET FILTER ENGINE — Integrated PPG + Goals + HT/FT
   Transition Model. DEFAULT DECISION = NO BET. Replaces the legacy Normal
   engine; same return contract so the board, tracker, WC consensus and image
   generators keep working unchanged. Uses only data the fetcher provides —
   never invents statistics (spec Final Command). */
function v3Recommend(m){
  const NB=(why,cls)=>({ match:m, over:null,btts:null,under:null,wdnb:null,
    primary:"No Bet", confidence:"Low", banker:false, rankWeight:0,
    summary:`No Bet${cls?` — ${cls}`:""}. ${why}`, value:null, chosenKind:"v3", lean:null,
    reasons:[why], grade:null, bet:false });
  if(!m) return NB("No match data.","Insufficient Data");
  if(String(m.league||'').toLowerCase().includes('friendl'))
    return NB("Friendlies carry no reliable competitive data.","Insufficient Data");
  // ---- gather (venue-split first: spec data priority) ----
  const hPPG=(m.homeVenuePts!=null&&m.homeVenueGames)?m.homeVenuePts/m.homeVenueGames:null;
  const aPPG=(m.awayVenuePts!=null&&m.awayVenueGames)?m.awayVenuePts/m.awayVenueGames:null;
  const hGP=m.homeVenueGames||0, aGP=m.awayVenueGames||0;
  const hA=m.homeScoredAtHome, hD=m.homeConcededAtHome, aA=m.awayScoredAway, aD=m.awayConcededAway;
  const gdH=m.homeGD, gdA=m.awayGD;
  const fH=(typeof formPoints==='function')?formPoints(m.homeForm):null;
  const fA=(typeof formPoints==='function')?formPoints(m.awayForm):null;
  const hCS=m.homeCleanSheetRate, aCS=m.awayCleanSheetRate, hFTS=m.homeFailedToScoreRate, aFTS=m.awayFailedToScoreRate;
  const HS=m.homeStreaks&&m.homeStreaks.htft, AS=m.awayStreaks&&m.awayStreaks.htft;
  const cell=(T,k)=>(T&&T.cells&&(T.sample||T.samples))?( (T.cells[k]||0)/(T.sample||T.samples) ):null;
  const R=(T,k)=>T&&T[k]!=null?T[k]:null;
  const sMin=Math.min(HS?(HS.sample||HS.samples||0):0, AS?(AS.sample||AS.samples||0):0);
  const lt=m.leagueTrends, LR=k=>(lt&&lt.rates&&lt.rates[k]!=null)?lt.rates[k]:null;
  if(hPPG==null||aPPG==null||hA==null||hD==null||aA==null||aD==null)
    return NB("Relevant home/away split statistics are missing.","Insufficient Data");
  if(hGP<4||aGP<4) return NB(`Venue samples too small (${hGP}/${aGP} games).`,"Insufficient Data");
  const expT=((hA+aD)/2)+((aA+hD)/2);
  const diff=hPPG-aPPG, adiff=Math.abs(diff);
  // ---- ABSOLUTE REJECTIONS (spec §9) ----
  if(hPPG<1.50&&aPPG<1.00&&gdH!=null&&gdA!=null&&gdH<0&&gdA<0)
    return NB(`Home ${hPPG.toFixed(2)} / away ${aPPG.toFixed(2)} PPG, both negative goal difference — a weak-versus-weak trap.`,"Weak vs Weak");
  const sameTier = adiff<0.35 && (gdH==null||gdA==null||Math.abs(gdH-gdA)<=5) && (fH==null||fA==null||Math.abs(fH-fA)<=3);
  // ---- HT/FT derived (only what exists; never assumed) ----
  const D={
    hWW:cell(HS,'WW'),hWD:cell(HS,'WD'),hWL:cell(HS,'WL'),hDW:cell(HS,'DW'),hDL:cell(HS,'DL'),hLL:cell(HS,'LL'),hLW:cell(HS,'LW'),
    aWW:cell(AS,'WW'),aWD:cell(AS,'WD'),aWL:cell(AS,'WL'),aDW:cell(AS,'DW'),aDL:cell(AS,'DL'),aLL:cell(AS,'LL'),aLW:cell(AS,'LW'),
    hHT:R(HS,'htWin'),aHT:R(AS,'htWin'),hHTD:R(HS,'htDraw'),aHTD:R(AS,'htDraw'),
    hFTW:R(HS,'ftWin'),aFTW:R(AS,'ftWin'),hFTL:R(HS,'ftLoss'),aFTL:R(AS,'ftLoss'),
    hHold:R(HS,'holdLeadRate'),aHold:R(AS,'holdLeadRate'),hThr:R(HS,'throwLeadRate'),aThr:R(AS,'throwLeadRate'),
    hRec:R(HS,'comebackRate'),aRec:R(AS,'comebackRate'),hD2W:R(HS,'drawToWin'),aD2W:R(AS,'drawToWin'),
    hDE:R(HS,'drawEndRate'),aDE:R(AS,'drawEndRate'),hSH:R(HS,'shFor'),aSH:R(AS,'shFor'),hFH:R(HS,'fhFor'),aFH:R(AS,'fhFor')
  };
  const hFTR=D.aRec!=null?null:null; // placeholder clarity
  const aFail=D.aRec!=null?1-D.aRec:null, hFail=D.hRec!=null?1-D.hRec:null;
  const htOK=sMin>=5; // §8: <5 blocks HT/FT-dependent markets
  // §8 caps apply to HT/FT-INFORMED analysis. With no HT/FT data at all the
  // other six confirmation layers (splits, PPG, goals, form, league, odds)
  // still work — capped at 8.4 (Qualified Banker ceiling; Strong/Elite Banker
  // requires real HT/FT support). Partial samples (1-4) cap below banker.
  const capBySample = sMin>=10?10 : sMin>=7?8.5 : sMin>=5?7.0 : sMin>=1?7.4 : 8.4;
  const ge=(x,t)=>x!=null&&x>=t, le=(x,t)=>x!=null&&x<=t;
  const two=arr=>arr.filter(Boolean).length>=2;
  const anyT=arr=>arr.some(Boolean);
  const noOddsV3=!m.odds||(m.odds.home==null&&m.odds.over15==null&&m.odds.under35==null);
  const provisionalOK=noOddsV3&&isUpcomingNoScore(m);
  const gate=mk=>{ if(provisionalOK) return true; const g=(typeof oddsLadderGate==='function')?oddsLadderGate(m,mk):{block:false}; return !g.block; };
  // confidence (§37) — components scored from what exists
  function conf(side, market, goalsFit, htDirect, htTrans, conflict){
    let c=0;
    c+=Math.min(Math.max(side==='H'?diff:side==='A'?-diff:adiff,0)/1.25,1)*1.5;         // PPG advantage
    const wr=side==='H'?(D.hFTW!=null&&D.aFTL!=null?(D.hFTW+D.aFTL)/2:null):side==='A'?(D.aFTW!=null&&D.hFTL!=null?(D.aFTW+D.hFTL)/2:null):null;
    c+=wr!=null?Math.min(wr/0.65,1)*1.0:0.3;                                             // win/loss rates
    c+=Math.min(Math.max(goalsFit,0),1)*1.5;                                             // goals data
    c+=0;                                                                                 // xG unavailable
    c+=Math.min(Math.max(htDirect,0),1)*1.5;                                             // HT/FT direct
    c+=Math.min(Math.max(htTrans,0),1)*1.0;                                              // HT/FT transition
    if((side==='H'||side==='A') && adiff>=1.75) c+=0.5;                                  // §39 extreme mismatch
    c+=(fH!=null&&fA!=null)?Math.min(Math.max((side==='H'?fH-fA:side==='A'?fA-fH:8)/8,0),1)*0.75:0.3; // form
    const lr=LR(market); c+=lr!=null?Math.min(Math.max((lr-0.4)/0.3,0),1)*0.5:0.2;       // league context
    c+=gate(market)?0.75:0;                                                              // odds confirmation
    c+=Math.min(sMin,10)/10*0.5;                                                         // sample reliability
    if(conflict) c-=1.0;                                                                  // §37 conflict deduction
    return Math.min(Math.round(c*10)/10, capBySample);
  }
  const out=[];
  function put(mk,side,mand,confPairs,blocks,goalsFit,why){
    if(!mand.every(Boolean)) return;
    if(blocks.some(Boolean)) return;
    const known=confPairs.filter(x=>x!=null);
    const passed=known.filter(Boolean).length;
    if(htOK && known.length>=2 && passed<2) return;   // §10: HT/FT must support
    const htDirect=known.length?passed/Math.max(known.length,2):0.3;
    const sc=conf(side,mk,Math.max(goalsFit,0.8),htDirect,htDirect,false); // mandatory pass floors goals support
    if(sc<7.0) return;
    if(!gate(mk)) return;
    // §38: never pick an extremely short market merely because it looks safe
    const OMAP={"Home Win":"home","Away Win":"away","Double Chance 1X":"dc1x","Double Chance X2":"dcx2","Over 1.5 Goals":"over15","Over 2.5 Goals":"over25","Under 2.5 Goals":"under25","Under 3.5 Goals":"under35","BTTS Yes":"bttsYes","BTTS No":"bttsNo"};
    const real=m.odds&&OMAP[mk]?m.odds[OMAP[mk]]:null;
    if(real!=null&&real<1.22) return;
    out.push({mk,sc,why});
  }
  const teamBlockedBySameTier = sameTier; // §9: no team market without a clear mismatch
  // ---- MARKETS in the safety hierarchy (§38), feasible subset ----
  if(!teamBlockedBySameTier){
    // DOUBLE CHANCE 1X (§13)
    put("Double Chance 1X",'H',
      [ge(1-(D.hFTL==null?1:D.hFTL),0.75)||le(D.hFTL,0.25), hPPG>=1.50, aPPG<=1.30, (D.aFTW==null||D.aFTW<=0.25)],
      [ge(D.hRec,0.35), D.aWW!=null?D.aWW<0.35:null, D.aHold!=null?D.aHold<0.75:null, le(D.hLL,0.20)],
      [], Math.min((hPPG-aPPG)/1.0,1),
      `Home unbeaten profile (${D.hFTL!=null?Math.round((1-D.hFTL)*100)+'%':'n/a'}) vs a side winning ${D.aFTW!=null?Math.round(D.aFTW*100)+'%':'little'} away.`);
    // HOME DNB (§12)
    put("Home DNB",'H',
      [hPPG>=1.80, aPPG<=1.20, diff>=0.60, le(D.hFTL,0.20)],
      [ge(D.hDW,0.20)||ge(D.hWW,0.35)||ge(D.hRec,0.40), (D.aDL!=null&&D.aLL!=null)?(D.aDL+D.aLL)>=0.45:null, D.aLW!=null?D.aLW<=0.15:null],
      [], Math.min(diff/1.0,1),
      `Home ${hPPG.toFixed(2)} PPG at home vs away ${aPPG.toFixed(2)} on the road; home loses only ${D.hFTL!=null?Math.round(D.hFTL*100)+'%':'few'} here.`);
    // AWAY DNB
    put("Away DNB",'A',
      [aPPG>=1.80, hPPG<=1.20, -diff>=0.60, le(D.aFTL,0.20)],
      [ge(D.aDW,0.20)||ge(D.aWW,0.35)||ge(D.aRec,0.40), (D.hDL!=null&&D.hLL!=null)?(D.hDL+D.hLL)>=0.45:null, D.hLW!=null?D.hLW<=0.15:null],
      [], Math.min(-diff/1.0,1),
      `Away ${aPPG.toFixed(2)} PPG on the road against a home side at ${hPPG.toFixed(2)}.`);
  }
  // OVER 1.5 (§16)
  put("Over 1.5 Goals",'N',
    [expT>=2.30, (hA>=1.50&&aD>=1.20)||(aA>=1.50&&hD>=1.20)],
    [ (D.hWW!=null||D.aWW!=null)?(Math.max(D.hWW||0,D.aWW||0)>=0.35):null,
      (D.hDW!=null&&D.hDL!=null)?(D.hDW+D.hDL>=0.30)||(D.aDW+D.aDL>=0.30):null,
      (D.hDE!=null&&D.aDE!=null)?((D.hDE+D.aDE)/2<0.30):null,
      (D.hSH!=null&&D.aSH!=null)?(D.hSH>=0.9||D.aSH>=0.9):null ],
    [ (D.hDE!=null&&D.aDE!=null&&D.hDE>=0.40&&D.aDE>=0.40), (D.hSH!=null&&D.aSH!=null&&D.hSH<0.6&&D.aSH<0.6) ],
    Math.min((expT-1.8)/1.0,1),
    `Expected ${expT.toFixed(2)} goals from the venue splits.`);
  // UNDER 3.5 (§21)
  put("Under 3.5 Goals",'N',
    [expT<=2.60, (hA+aA)<=2.60],
    [ le(D.hThr,0.25)&&le(D.aThr,0.25), le(D.hRec,0.35)&&le(D.aRec,0.35), (D.hSH!=null&&D.aSH!=null)?(D.hSH<=1.0&&D.aSH<=1.0):null ],
    [], Math.min((3.0-expT)/1.0,1),
    `Half-controlled profile: expected total ${expT.toFixed(2)}, low reversal rates.`);
  if(!teamBlockedBySameTier){
    // HOME WIN (§11)
    put("Home Win",'H',
      [hPPG>=2.50, (D.hFTW==null?m.homeWinRate!=null&&m.homeWinRate>=0.75:D.hFTW>=0.75), hA>=1.80, aPPG<=1.00, ge(D.aFTL,0.60), diff>=1.25, gdH!=null&&gdA!=null?gdH>gdA+6:true, fH==null||fA==null||fH>=fA],
      [ge(D.hWW,0.40), ge(D.hDW,0.20), ge(D.hHold,0.75), ge(D.aDL,0.20), ge(D.aLL,0.35), ge(aFail,0.65)],
      [ (D.hWD!=null&&D.hWL!=null&&(D.hWD+D.hWL)>0.30), ge(D.aRec,0.45), ge(D.aLW,0.151) ],
      Math.min((hA-1.5)/1.0,1)*0.5+Math.min(diff/1.75,1)*0.5,
      `Extreme mismatch: home ${hPPG.toFixed(2)} vs away ${aPPG.toFixed(2)} PPG (gap ${diff.toFixed(2)}).`);
    // AWAY WIN with §9 away protection
    put("Away Win",'A',
      [aPPG>=2.50, ge(D.aFTW,0.75), aA>=1.80, hPPG<=1.00, ge(D.hFTL,0.55), -diff>=1.25, gdH!=null&&gdA!=null?gdA>gdH+6:true, fH==null||fA==null||fA>=fH],
      [ge(D.aWW,0.40), ge(D.aDW,0.20), ge(D.aHold,0.75), ge(D.hDL,0.20), ge(D.hLL,0.35), ge(hFail,0.65)],
      [ hPPG>1.20, ge(D.hRec,0.40), ge(D.hLW,0.151), ge(D.aThr,0.301) ],
      Math.min((aA-1.5)/1.0,1)*0.5+Math.min(-diff/1.75,1)*0.5,
      `Road mismatch: away ${aPPG.toFixed(2)} vs home ${hPPG.toFixed(2)} PPG.`);
    // TEAM OVER 1.5 — HOME (§25)
    put("Home Team Over 1.5 Goals",'H',
      [hA>=2.00, aD>=1.60],
      [ge(D.hWW,0.40)||ge(D.hDW,0.25), ge(D.aLL,0.35), ge(aFail,0.65), ge(D.hSH,0.9)],
      [], Math.min((hA-1.6)/0.8,1),
      `Home averaging ${hA} at home into a defence shipping ${aD} away.`);
    put("Away Team Over 1.5 Goals",'A',
      [aA>=2.00, hD>=1.60],
      [ge(D.aWW,0.40)||ge(D.aDW,0.25), ge(D.hLL,0.35), ge(hFail,0.65), ge(D.aSH,0.9)],
      [], Math.min((aA-1.6)/0.8,1),
      `Away averaging ${aA} on the road into a home defence shipping ${hD}.`);
  }
  // BTTS YES (§22)
  put("BTTS Yes",'N',
    [hA>=1.20, aA>=1.20, hD>=1.10, aD>=1.10, hFTS==null||hFTS<=0.30, aFTS==null||aFTS<=0.30],
    [ (D.hDW!=null&&D.aDW!=null)?(D.hDW>=0.15&&D.aDW>=0.10):null,
      (D.hRec!=null&&D.aRec!=null)?(D.hRec>=0.30&&D.aRec>=0.30):null,
      le(D.hLL,0.30)&&le(D.aLL,0.30),
      (D.hSH!=null&&D.aSH!=null)?(D.hSH>=0.8&&D.aSH>=0.7):null,
      (D.hHold!=null&&D.aHold!=null)?(D.hHold<0.90&&D.aHold<0.90):null ],
    [ ge(hFail,0.751)||ge(aFail,0.751), ge(hFTS,0.401)||ge(aFTS,0.401), ge(D.hLL,0.55)||ge(D.aLL,0.55), (ge(hCS,0.45)&&ge(D.hWW,0.45)) ],
    Math.min((Math.min(hA,aA)-1.0)/0.6,1),
    `Both score and both concede at their venues (${hA}/${hD} home, ${aA}/${aD} away).`);
  // BTTS NO (§23)
  put("BTTS No",'N',
    [ge(hCS,0.45)||ge(aCS,0.45), ge(hFTS,0.40)||ge(aFTS,0.40), (hA<1.00||aA<1.00)],
    [ (D.hWW!=null&&D.aLL!=null)?(D.hWW>=0.35&&D.aLL>=0.35)||(D.aWW!=null&&D.hLL!=null&&D.aWW>=0.35&&D.hLL>=0.35):null,
      ge(aFail,0.65)||ge(hFail,0.65),
      le(D.aLW,0.10)||le(D.hLW,0.10),
      ge(D.hHold,0.80)||ge(D.aHold,0.80) ],
    [], Math.min((0.45-(Math.min(hA,aA)-0.55))/0.45,1),
    `One-way traffic: clean sheets one side, blanks the other.`);
  // OVER 2.5 (§17)
  put("Over 2.5 Goals",'N',
    [expT>=3.00, (hA>=1.70||aA>=1.70), (hD>=1.40||aD>=1.40)],
    [ (D.hWW!=null&&Math.max(D.hWW,D.aWW||0)>=0.35&&(hA>=1.8||aA>=1.8)),
      (D.hDW!=null&&D.hDL!=null)?((D.hDW+D.hDL>=0.35)||(D.aDW+D.aDL>=0.35)):null,
      ge(D.hLW,0.15)||ge(D.aLW,0.15),
      ge(D.hSH,1.0)||ge(D.aSH,1.0),
      (D.hDE!=null&&D.aDE!=null)?((D.hDE+D.aDE)/2<0.25):null ],
    [ (D.hDE!=null&&D.aDE!=null&&D.hDE>=0.40&&D.aDE>=0.40),
      (le(D.hRec,0.20)&&le(D.aRec,0.20)&&le(D.hThr,0.15)&&le(D.aThr,0.15)) ],
    Math.min((expT-2.6)/0.8,1),
    `Open-game alignment: expected total ${expT.toFixed(2)}.`);
  // UNDER 2.5 (§20)
  put("Under 2.5 Goals",'N',
    [expT<=2.10, hA<=1.40, aA<=1.40],
    [ (D.hHTD!=null&&D.aHTD!=null)?(D.hHTD>=0.40&&D.aHTD>=0.35):null,
      le(D.hSH,0.75)&&le(D.aSH,0.75),
      le(D.hLW,0.12)&&le(D.aLW,0.12),
      (D.hDE!=null&&D.aDE!=null)?((D.hDE+D.aDE)/2>=0.28):null ],
    [ ge(D.hD2W,0.451)||ge(D.aD2W,0.451), ge(D.hSH,1.01)||ge(D.aSH,1.01) ],
    Math.min((2.4-expT)/0.8,1),
    `Closed-game alignment: expected total ${expT.toFixed(2)}, both attacks quiet.`);
  // X/1 (§14, feasible clauses)
  if(!teamBlockedBySameTier&&htOK)
    put("HT Draw / FT Home Win",'H',
      [ge(D.hHTD,0.40), ge(D.hDW,0.25), ge(D.hD2W,0.45), hPPG>=2.00, aPPG<=1.00, ge(D.aDL,0.25)],
      [ (D.hSH!=null&&D.hFH!=null)?(D.hSH>D.hFH):null, ge(D.hSH,0.9) ],
      [], 0.7, `Slow-starting winner profile: converts ${Math.round((D.hD2W||0)*100)}% of half-time draws.`);

  if(!out.length){
    const cls = sameTier?"Same Tier":"Statistical Conflict";
    const why = sameTier?`PPG gap only ${adiff.toFixed(2)} with similar profiles — no clear market-specific mismatch.`
      : `No market passed all mandatory thresholds (expected total ${expT.toFixed(2)}, PPG ${hPPG.toFixed(2)} v ${aPPG.toFixed(2)}${sMin>=1&&sMin<5?`, thin HT/FT sample ${sMin}`:''}).`;
    return NB(why,cls);
  }
  // §38 hierarchy selection among qualified
  const HIER=["Double Chance 1X","Home DNB","Away DNB","Over 1.5 Goals","Under 3.5 Goals","Home Win","Away Win","Home Team Over 1.5 Goals","Away Team Over 1.5 Goals","BTTS Yes","BTTS No","Over 2.5 Goals","Under 2.5 Goals","HT Draw / FT Home Win"];
  // safest market wins only among near-equals: first in hierarchy within 0.5 of the top score
  const best=Math.max(...out.map(o=>o.sc));
  out.sort((a,b)=>HIER.indexOf(a.mk)-HIER.indexOf(b.mk));
  const pick=out.find(o=>o.sc>=best-0.5)||out[0];
  if(provisionalOK){
    return provisionalize({ match:m, over:null,btts:null,under:null,wdnb:null, value:null, chosenKind:"v3", lean:null,
      rankWeight:Math.min(pick.sc,7.4), summary:`Awaiting odds — provisional ${pick.mk} (${pick.sc.toFixed(1)}/10 on stats). ${pick.why}` },
      pick.mk, [pick.why]);
  }
  const cls = pick.sc>=9.0?"Elite Banker":pick.sc>=8.5?"Strong Banker":pick.sc>=8.0?"Qualified Banker":pick.sc>=7.5?"Value Selection":"Borderline";
  const banker=pick.sc>=8.0;
  return { match:m, over:null,btts:null,under:null,wdnb:null,
    primary:pick.mk, bet:true,
    confidence: pick.sc>=8.5?"High":pick.sc>=7.5?"Medium":"Low",
    banker, grade: banker?(pick.sc>=9?"Elite Banker":"Banker"):null,
    rankWeight: pick.sc,
    summary:`${cls} (${pick.sc.toFixed(1)}/10). ${pick.why}`,
    reasons:[pick.why, `v3 confidence ${pick.sc.toFixed(1)}/10 — ${cls}.`],
    value:null, chosenKind:"v3", lean:null };
}

function isUpcomingNoScore(m){
  if(!m) return false;
  if(m.homeGoals!=null&&m.awayGoals!=null) return false;
  const live=m.status&&['1H','2H','HT','ET','LIVE','P'].includes(m.status);
  if(live) return false;
  return true;
}
function provisionalize(res, market, reasons){
  return { ...res, primary:market, market, bet:true, banker:false, awaitingOdds:true,
    grade:"Awaiting Odds", confidence:5,
    verdict:`${market} (AWAITING ODDS — provisional). Stats support this market but no bookmaker price exists yet; it becomes actionable only when odds arrive and confirm.`,
    reasons:[...(reasons||[]), "Awaiting odds — provisional, never a banker, not tracked."] };
}
/* ===================== UNIVERSAL OVERLAY (all 12 engines) =====================
   Two owner rules applied AFTER every engine (and after the intl frame):
   1) TABLE PROXIMITY — never back a TEAM (Win/DNB/DC/team-goals) when the two
      sides sit fewer than 3 places apart in the same table. Totals/BTTS are
      match markets, not team-backed, so they pass.
   2) VENUE-SPLIT CONFIRMATION — the pick must not contradict the home/away
      split data (home's record AT HOME, away's record ON THE ROAD). Hard
      contradictions are vetoed; lukewarm splits strip banker status. */
function oddsCalibFor(m, market){
  if(!m||!m.oddsCalib||!m.odds) return null;
  const F={"Home Win":"home","Away Win":"away","Over 1.5 Goals":"over15","Over 2.5 Goals":"over25",
    "Under 2.5 Goals":"under25","Under 3.5 Goals":"under35","BTTS Yes":"bttsYes","BTTS No":"bttsNo"};
  const f=F[market]; if(!f) return null;
  const o=m.odds[f]; if(o==null) return null;
  const band=o<1.45?"1.20-1.44":o<1.70?"1.45-1.69":o<2.00?"1.70-1.99":o<2.50?"2.00-2.49":"2.50+";
  const c=m.oddsCalib[market]&&m.oddsCalib[market][band];
  return c?{...c,band,price:o}:null;
}
function overlayIsTeamMarket(mk){
  return /(home|away).*(win|dnb)|^(home|away) win|dnb|double chance|ht draw.*win|team over|team under/i.test(mk)
         && !/^over|^under|^btts/i.test(mk);
}
// ============================================================================
// UNIFIED CALIBRATION — the single, authoritative way price-band history shapes
// EVERY engine's prediction. Called as the FINAL transform on every pick (via
// withIntlFrame), so all 12 engines are graded by the same real-history input
// rather than each annotating differently. Tiers, from the board's own settled
// results for THIS market at THIS price band in THIS league:
//   VETO   n>=12 & hit<=0.45  -> pick is a proven trap here; No Bet.
//   STRIP  n>=10 & hit<=0.58  -> demote off banker, cut confidence.
//   TRIM   n>=8  & hit< impliedPlus -> underperforms its price; -1 confidence.
//   BOOST  n>=8  & hit>=0.80  -> strongly confirmed; +1 confidence, allow banker.
//   BACK   n>=8  & hit>=0.72  -> confirmed; small note, no downgrade.
//   NOTE   otherwise          -> cite the number, no score change.
// Sample-gated so thin history never moves a pick. Confidence stays within 0..10.
// ============================================================================
function applyCalibration(m, mk, res){
  if(!res || res.bet===false || !mk || mk==="No Bet") return res;
  if(res.overlay && res.overlay.calibApplied) return res; // idempotent — never double-apply
  const c = (typeof oddsCalibFor==='function') ? oddsCalibFor(m, mk) : null;
  if(!c) return res;
  const pct = Math.round(c.hit*100);
  const implied = 1 / c.price;                 // what the price says should happen
  const impPct = Math.round(implied*100);
  const conf = typeof res.confidence==='number' ? res.confidence : (res.banker?8:6);
  const tag = t => ({ ...(res.overlay||{}), calib:t, calibApplied:true });
  const note = (extra=[]) => [...(res.reasons||[]), ...extra];

  // VETO — a proven trap: lands far below even a coin-flip on a real sample.
  if(c.n>=12 && c.hit<=0.45){
    return { ...res, bet:false, banker:false, primary:"No Bet", market:"No Bet",
      grade:null, confidence:0,
      verdict:`No Bet — league odds history: ${mk} at ${c.band} has landed only ${pct}% across ${c.n} settled games here (price implies ${impPct}%). A proven trap in this league.`,
      reasons:note([`Calibration veto: ${mk} at ${c.band} = ${pct}% over ${c.n} games (implied ${impPct}%).`]),
      overlay:tag("veto") };
  }
  // STRIP — reliably underperforms: keep as a pick but off banker, cut conviction.
  if(c.n>=10 && c.hit<=0.58){
    return { ...res, banker:false,
      grade:(res.grade==="Elite Banker"||res.grade==="Banker")?"Strong Pick":res.grade,
      confidence: Math.max(4, conf-2),
      reasons:note([`Calibration: ${mk} at ${c.band} lands only ${pct}% here (${c.n} games, implied ${impPct}%) — banker stripped, conviction cut.`]),
      overlay:tag("stripped") };
  }
  // BOOST — strongly confirmed by history: raise conviction, allow banker status.
  if(c.n>=8 && c.hit>=0.80){
    const boosted = Math.min(10, conf+1);
    const promote = !res.banker && c.hit>=0.85 && c.n>=10;
    return { ...res,
      banker: res.banker || promote,
      grade: promote && (res.grade==="Strong Pick"||!res.grade) ? "Banker" : res.grade,
      confidence: boosted,
      reasons:note([`Calibration backs it: ${mk} at ${c.band} lands ${pct}% here vs ${impPct}% implied (${c.n} games)${promote?" — promoted to banker.":"."}`]),
      overlay:tag("backed") };
  }
  // TRIM — below what its price implies (with a margin) on a decent sample: -1.
  if(c.n>=8 && c.hit < (implied - 0.08)){
    return { ...res, confidence: Math.max(4, conf-1),
      reasons:note([`Calibration: ${mk} at ${c.band} lands ${pct}% here, under its ${impPct}% price (${c.n} games) — conviction trimmed.`]),
      overlay:tag("trimmed") };
  }
  // BACK — solidly confirmed, no change beyond the cite.
  if(c.n>=8 && c.hit>=0.72){
    return { ...res,
      reasons:note([`Calibration confirms: ${mk} at ${c.band} lands ${pct}% here (${c.n} games).`]),
      overlay:tag("backed") };
  }
  // NOTE — enough sample to mention, not enough signal to move the pick.
  if(c.n>=8){
    return { ...res,
      reasons:note([`League odds history: ${mk} at ${c.band} lands ${pct}% here (${c.n} games).`]),
      overlay:tag("noted") };
  }
  return res;
}
function overlayApply(m, res){
  if(!res || res.bet===false || res.awaitingOdds) return res;
  const mk=String(res.primary||res.market||""); if(!mk||mk==="No Bet") return res;
  const hA=m&&m.homeScoredAtHome, hD=m&&m.homeConcededAtHome, aA=m&&m.awayScoredAway, aD=m&&m.awayConcededAway;
  const gateOk=x=>{ const g=(typeof oddsLadderGate==='function')?oddsLadderGate(m,x):{block:false}; return !g.block; };
  // ---- RULE 1: table proximity — team-backed picks REVERT to a goals/BTTS market ----
  if(m && m.homePos!=null && m.awayPos!=null && m.sameGroup!==false && overlayIsTeamMarket(mk)){
    const gap=Math.abs(m.homePos-m.awayPos);
    if(gap<3){
      // Bossman's fix: a CONFIRMED Double Chance price in a high-scoring league
      // shouldn't be tossed for a BTTS reversion just because the table gap is
      // tight. DC already covers two of three outcomes — in an environment
      // that produces goals anyway, that's the safer honest pick. Keep it.
      const isDC=/double chance/i.test(mk);
      if(isDC && gateOk(mk)){
        const lg=classifyLeague(m);
        if(lg && (lg.type==="High-Scoring" || lg.type==="Very High-Scoring")){
          return { ...res,
            reasons:[...(res.reasons||[]), `Overlay: table gap only ${gap}, but ${mk} odds are confirmed in a ${lg.type.toLowerCase()} league (${lg.gpg?.toFixed?.(2)||'?'} gpg) — kept over a BTTS reversion.`],
            overlay:{rule:"gap-dc-kept",gap,leagueType:lg.type} };
        }
      }
      let fb=null;
      if(hA!=null&&hD!=null&&aA!=null&&aD!=null){
        const att=hA+aA, def=hD+aD, cands=[];
        if(att>=3.00&&hA>=1.3&&aA>=1.1) cands.push("Over 2.5 Goals");
        // BTTS Yes now needs ELITE scoring from BOTH sides (not just decent) and a
        // MEDIUM-TO-LEAKY defense band on both sides — a floor so it isn't a lockdown
        // defense, and a ceiling so we're not reading a blowout's leakiness as a
        // genuine both-teams-score shape. Elite defenses and one-sided routs both
        // undermine the honest case for GG.
        if(hA>=1.5&&aA>=1.3&&hD>=0.9&&hD<=2.2&&aD>=0.9&&aD<=2.2) cands.push("BTTS Yes");
        if(att>=2.40) cands.push("Over 1.5 Goals");
        if(hD<=0.80&&aA<=0.80) cands.push("BTTS No");
        if(att<=2.00&&def<=2.00) cands.push("Under 2.5 Goals");
        if(att<=2.70) cands.push("Under 3.5 Goals");
        fb=cands.find(gateOk)||null;
      }
      if(fb){
        return { ...res, primary:fb, market:fb, banker:false,
          grade:"Strong Pick", confidence:Math.min(res.confidence||7,7),
          verdict:`${fb} (overlay switch). Table gap only ${gap} — too close to back a side, so the pick moves to the goals market the venue splits support. (engine wanted ${mk})`,
          reasons:[...(res.reasons||[]), `Overlay: gap ${gap} < 3 — reverted ${mk} to ${fb} (goals/BTTS).`],
          overlay:{rule:"gap-revert",from:mk,to:fb,gap} };
      }
      return { ...res, bet:false, banker:false, primary:"No Bet", market:"No Bet", grade:null, confidence:0,
        verdict:`No Bet — overlay: only ${gap} place${gap===1?'':'s'} between them and no goals/BTTS market qualified as a fallback. (engine wanted ${mk})`,
        reasons:[...(res.reasons||[]), `Overlay: gap ${gap} < 3 and no viable goals fallback.`], overlay:{rule:"gap-nobet",gap} };
    }
  }
  // ---- RULE 2: venue-split confirmation — WINS / DNB / DC ONLY ----
  if(hA==null||hD==null||aA==null||aD==null) return res;
  const backsHome=/(^|\s)home (win|dnb)|double chance 1x|ht draw \/ ft home/i.test(mk);
  const backsAway=/(^|\s)away (win|dnb)|double chance x2|ht draw \/ ft away/i.test(mk);
  if(!backsHome&&!backsAway){
    return applyCalibration(m, mk, res);
  }
  const veto=(why)=>({ ...res, bet:false, banker:false, primary:"No Bet", market:"No Bet", grade:null, confidence:0,
    verdict:`No Bet — overlay: ${why} (engine wanted ${mk}).`,
    reasons:[...(res.reasons||[]), `Overlay veto (venue-split): ${why}.`], overlay:{rule:"venue-split"} });
  let soft=null;
  if(backsHome){
    if(hA<0.90||hD>=1.70) return veto(`home's own split (${hA} for, ${hD} against at home) argues against backing them`);
    if(hA<1.10||hD>=1.40) soft=`home venue split is lukewarm (${hA} for, ${hD} against)`;
  }
  if(backsAway){
    if(aA<0.80||aD>=1.70) return veto(`away's road split (${aA} for, ${aD} against) argues against backing them`);
    if(aA<1.00||aD>=1.40) soft=`away road split is lukewarm (${aA} for, ${aD} against)`;
  }
  if(soft){
    if(res.banker) return calibPass({ ...res, banker:false, grade:(res.grade==="Elite Banker"||res.grade==="Banker")?"Strong Pick":res.grade,
      reasons:[...(res.reasons||[]), `Overlay: ${soft} — banker stripped, kept as a pick.`], overlay:{rule:"venue-soft"} });
    return calibPass({ ...res, reasons:[...(res.reasons||[]), `Overlay: ${soft} — proceed with caution.`], overlay:{rule:"venue-soft"} });
  }
  return calibPass({ ...res, reasons:[...(res.reasons||[]), `Overlay: venue splits confirm ${mk}.`], overlay:{rule:"confirmed"} });
  // ---- ODDS-CALIBRATION LAYER: delegates to the single unified applyCalibration
  // so venue-split picks are graded by the SAME price-band history logic as every
  // other path. NOTE: reached via JS function hoisting by the calibPass(...) calls
  // above — it is NOT dead code. Do not move or convert to a const expression.
  function calibPass(r){
    return applyCalibration(m, mk, r);
  }
}
// ============================================================================
// QUALITY CROSS-CHECK (SOT-spec core, adapted to available data) — projects
// expected goals from the two teams' PROFILES (season venue seed refined by
// settled rows + xG where measured; attached by the pipeline as m.homeProfile /
// m.awayProfile) and grades goals-market picks against the projection.
// Spec principles kept: never invent data (silent when profiles are thin),
// reject aggressive goals markets that quality disagrees with, sample-gated,
// one layer applied identically to every engine. SOT slots into the same
// profiles in August with zero redesign here.
// ============================================================================
function applyQualityCheck(m, mk, res){
  if(!res || res.bet===false || !mk || mk==="No Bet") return res;
  if(res.overlay && res.overlay.qualApplied) return res; // idempotent
  const h=m && m.homeProfile, a=m && m.awayProfile;
  if(!h || !a || !h.goalsFor || !h.goalsAg || !a.goalsFor || !a.goalsAg) return res;
  if(h.goalsFor.n<4 || a.goalsFor.n<4) return res; // sample gate — stay silent when thin

  // projected goals: each attack vs the opposing defense, averaged.
  const expH = (h.goalsFor.v + a.goalsAg.v)/2;
  const expA = (a.goalsFor.v + h.goalsAg.v)/2;
  let total = expH + expA;
  // conversion regression nudge (xG-derived, only when measured): a hot
  // finisher (>1.2 goals/xG) is projected slightly down, a wasteful one up.
  const regress = p => p && p.conversion && p.conversion.n>=2
    ? (p.conversion.v>1.2 ? -0.15 : p.conversion.v<0.8 ? +0.15 : 0) : 0;
  total += regress(h) + regress(a);
  const T = Math.round(total*100)/100;
  const tag = t => ({ ...(res.overlay||{}), qual:t, qualApplied:true });
  const note = extra => [...(res.reasons||[]), ...extra];
  const conf = typeof res.confidence==='number' ? res.confidence : (res.banker?8:6);
  const cite = `Quality check: projected ${T} total goals (H ${Math.round(expH*100)/100} / A ${Math.round(expA*100)/100}) from team profiles (n=${h.goalsFor.n}/${a.goalsFor.n}).`;

  // strong-disagreement rules — conservative bands, veto only at extremes.
  const strip = why => ({ ...res, banker:false,
    grade:(res.grade==="Elite Banker"||res.grade==="Banker")?"Strong Pick":res.grade,
    confidence: Math.max(4, conf-2), reasons: note([why+" "+cite]), overlay: tag("stripped") });
  const trim = why => ({ ...res, confidence: Math.max(4, conf-1),
    reasons: note([why+" "+cite]), overlay: tag("trimmed") });
  const back = why => ({ ...res, reasons: note([why+" "+cite]), overlay: tag("backed") });

  if(/^Over 2\.5/.test(mk)){
    if(T < 2.1) return strip("Profiles project a LOW-scoring game — Over 2.5 banker stripped.");
    if(T < 2.5) return trim("Projection sits under the 2.5 line — conviction trimmed.");
    if(T >= 3.1) return back("Profiles back a high-scoring game.");
  } else if(/^Over 1\.5/.test(mk)){
    if(T < 1.7) return strip("Profiles project a very low-scoring game — Over 1.5 banker stripped.");
    if(T >= 2.6) return back("Comfortably clears the 1.5 line on projection.");
  } else if(/^Under 2\.5/.test(mk)){
    if(T > 3.0) return strip("Profiles project a HIGH-scoring game — Under 2.5 banker stripped.");
    if(T > 2.6) return trim("Projection sits above the 2.5 line — conviction trimmed.");
    if(T <= 2.0) return back("Profiles back a low-scoring game.");
  } else if(/^Under 3\.5/.test(mk)){
    if(T > 3.9) return strip("Profiles project a goal-fest — Under 3.5 banker stripped.");
    if(T <= 2.6) return back("Well under the 3.5 line on projection.");
  } else if(/^BTTS Yes/.test(mk)){
    if(expH < 0.75 || expA < 0.75) return strip("One side projects too few goals for BTTS — banker stripped.");
    if(expH >= 1.1 && expA >= 1.1) return back("Both sides project to score.");
  } else if(/^BTTS No/.test(mk)){
    if(expH >= 1.2 && expA >= 1.2) return strip("Both sides project to score — BTTS No banker stripped.");
  }
  return res; // markets we don't quality-grade (win/DNB/DC) pass through untouched
}
// ============================================================================
// HT RISK ARBITRATION (owner spec) — before a pick is final, ask: is a
// HALF-TIME market the SAFER expression of this same read? Only steps down when
// (a) the FT pick is MARGINAL — the quality/calibration layer flagged it, or the
// goals projection sits near the line — AND (b) a matching HT market clears a
// high confirmation bar. One pick per match: the HT market REPLACES the FT pick,
// it is not shown alongside. Strong, well-supported FT picks are never touched.
// Needs the HT rate fields (from the pipeline) + team half splits; silent without.
// ============================================================================
function applyHTArbitration(m, mk, res){
  if(!res || res.bet===false || !mk || mk==="No Bet") return res;
  if(res.overlay && res.overlay.htArb) return res; // idempotent
  const H=m && m.homeStreaks && m.homeStreaks.htft, A=m && m.awayStreaks && m.awayStreaks.htft;
  if(!H || !A) return res;                          // no HT evidence -> leave FT pick
  const n=v=> v==null?null:+v;

  // Is the FT pick MARGINAL? Two signals: the layers already flagged it
  // (stripped/trimmed), or the profile goals-projection sits near the market line.
  const flagged = res.overlay && (res.overlay.calib==="stripped"||res.overlay.calib==="trimmed"||res.overlay.qual==="stripped"||res.overlay.qual==="trimmed");
  const hp=m.homeProfile, ap=m.awayProfile;
  let proj=null;
  if(hp&&ap&&hp.goalsFor&&ap.goalsFor&&hp.goalsAg&&ap.goalsAg&&hp.goalsFor.n>=4&&ap.goalsFor.n>=4){
    proj=((hp.goalsFor.v+ap.goalsAg.v)/2)+((ap.goalsFor.v+hp.goalsAg.v)/2);
  }
  const near=(line)=> proj!=null && Math.abs(proj-line)<=0.35; // projection hugging the line
  const marginal = flagged || (proj!=null);
  if(!marginal) return res;                          // confident FT pick -> untouched

  const conf = typeof res.confidence==='number' ? res.confidence : (res.banker?8:6);
  const swap=(htMk, why, minConf)=> ({ ...res, primary:htMk, market:htMk,
    banker:false, grade: res.grade==="Elite Banker"||res.grade==="Banker"?"Strong Pick":res.grade,
    confidence: Math.max(minConf||6, conf-1),
    reasons:[...(res.reasons||[]), why],
    overlay:{...(res.overlay||{}), htArb:true, htFrom:mk} });

  // GOALS DOWN: Over X.5 -> Over 0.5 HT when both sides reliably score early
  if(/^Over (1\.5|2\.5)/.test(mk) && n(H.fhOver05)!=null && n(A.fhOver05)!=null){
    if((flagged || near(mk.includes("2.5")?2.5:1.5)) && H.fhOver05>=0.80 && A.fhOver05>=0.80)
      return swap("Over 0.5 Goals HT",
        `Risk step-down: ${mk} was marginal${proj!=null?` (projected ${proj.toFixed(2)} goals)`:``}; a first-half goal is the safer expression — lands in ${Math.round(H.fhOver05*100)}%/${Math.round(A.fhOver05*100)}% of both sides' games.`, 7);
  }
  // GOALS UP (unders): Under X.5 -> Under 1.5 HT when both start slow
  if(/^Under (2\.5|3\.5)/.test(mk) && n(H.fhUnder15)!=null && n(A.fhUnder15)!=null){
    if((flagged || near(mk.includes("2.5")?2.5:3.5)) && H.fhUnder15>=0.74 && A.fhUnder15>=0.74)
      return swap("Under 1.5 Goals HT",
        `Risk step-down: ${mk} was marginal; a quiet first half is the safer expression — first halves stay under 1.5 in ${Math.round(H.fhUnder15*100)}%/${Math.round(A.fhUnder15*100)}% of games.`, 7);
  }
  // RESULT (marginal win): -> Win Either Half when the side reliably wins a half
  if(/^Home Win$/.test(mk) && flagged && n(H.wonEitherHalf)!=null && H.wonEitherHalf>=0.78)
    return swap("Home Win Either Half",
      `Risk step-down: straight Home Win was flagged; winning at least one half is safer — home does it in ${Math.round(H.wonEitherHalf*100)}% of games.`, 7);
  if(/^Away Win$/.test(mk) && flagged && n(A.wonEitherHalf)!=null && A.wonEitherHalf>=0.78)
    return swap("Away Win Either Half",
      `Risk step-down: straight Away Win was flagged; winning at least one half is safer — away does it in ${Math.round(A.wonEitherHalf*100)}% of games.`, 7);
  // DRAWISH: a flagged DNB/DC on a draw-heavy pair -> Draw HT or FT safety net
  if(/(DNB|Double Chance)/.test(mk) && flagged && n(H.drawHTorFT)!=null && n(A.drawHTorFT)!=null && H.drawHTorFT>=0.62 && A.drawHTorFT>=0.62)
    return swap("Draw HT or FT",
      `Risk step-down: ${mk} was flagged and both sides draw often at HT or FT (${Math.round(H.drawHTorFT*100)}%/${Math.round(A.drawHTorFT*100)}%) — the safety-net market.`, 6);

  return res; // no safer HT expression cleared the bar -> keep the FT pick
}
/* ============================================================
   MARKET INDICATOR ODDS ENGINE  (owner spec v1.0 — 13th engine)
   ------------------------------------------------------------
   Cross-market prediction: one market's ODDS indicate a DIFFERENT
   final market. 10 rules in the spec's strict priority order, a
   master similarity rejection, balanced/unbalanced classification,
   a minimum of THREE statistical confirmations for every pick, and
   pairwise conflict resolution. Goals-streak markets aren't offered
   by API-Football (probe-markets.js result), so Rules 4/8/9 use
   transparent statistical PROXIES from venue data + team profiles,
   labelled "(proxy)" in the reasoning. New odds fields consumed:
   fhHome/fhDraw/fhAway, fhOver05/fhOver15/fhUnder15, gg, ng, gg2
   (parsed by fetch-data.js from the same odds response). Every
   price is null-guarded: a missing market is "no signal", never a
   guessed pick. Honest No Bet whenever the odds picture, the
   statistics, or the spec's no-bet list says so.
   NOTE (honesty): the spec's derby detection and sharp-odds-movement
   no-bet checks aren't implementable from this data (no rivalry map,
   no per-match odds timeline) — they remain a human check.
   ============================================================ */
function indicatorOut(m, market, grade, score, reasons, rule){
  const noStand=(typeof hasNoStandings==='function')&&hasNoStandings(m);
  const banker= market!=="No Bet" && (grade==="Banker"||grade==="Elite Banker") && !noStand;
  const confMap={ "Strong Pick":7, "Banker":8, "Elite Banker":10 };
  return { match:m, engine:"indicator", primary:market, bet:market!=="No Bet",
    banker, confidence: market==="No Bet"?0:(confMap[grade]||6), grade:grade||null,
    score:score!=null?`${score}/12`:null, rule:rule||null,
    verdict:`${market}${market!=="No Bet"?` (Market Indicators ${rule||""} — ${grade}, ${score}/12)`:" — No Bet"}. ${reasons.join(' ')}`,
    reasons, humanChecks:["Cross-market odds read; confirm lineups, derby context and late odds moves before kickoff."] };
}
function indicatorRecommend(m){
  const OUT=(mk,g,s,r,rule)=>indicatorOut(m,mk,g,s,r,rule);
  if(!m) return OUT("No Bet",null,null,["No match data."]);
  const o=m.odds||{};
  if(o.home==null||o.away==null||o.draw==null)
    return OUT("No Bet",null,null,["Cross-market engine needs the full 1X2 price picture — none published yet."]);

  /* ---------- odds inputs (new fields + graceful fallbacks) ---------- */
  const gg =o.gg!=null?o.gg:(o.bttsYes!=null?o.bttsYes:null);
  const ng =o.ng!=null?o.ng:(o.bttsNo!=null?o.bttsNo:null);
  const gg2=o.gg2!=null?o.gg2:null;
  const fhH=o.fhHome, fhA=o.fhAway, fhD=o.fhDraw;
  const fhO15=o.fhOver15, fhU15=o.fhUnder15;
  const o15=o.over15;

  /* ---------- favorite / classification (spec §4) ---------- */
  const favHome=o.home<=o.away, fav=favHome?o.home:o.away, dog=favHome?o.away:o.home;
  const favName=favHome?m.home:m.away;
  const fhFav=(fhH!=null&&fhA!=null)?(favHome?fhH:fhA):null;
  const balanced   =(dog-fav)<=1.20 && fav>=1.90;
  const unbalanced = fav<1.90 && (dog-fav)>1.20;

  /* ---------- statistics ---------- */
  const hA=m.homeScoredAtHome, hD=m.homeConcededAtHome, aA=m.awayScoredAway, aD=m.awayConcededAway;
  const favFor=favHome?hA:aA, dogFor=favHome?aA:hA, dogAg=favHome?aD:hD;
  const favFTS=favHome?m.homeFailedToScoreRate:m.awayFailedToScoreRate;
  const dogFTS=favHome?m.awayFailedToScoreRate:m.homeFailedToScoreRate;
  const dogCS =favHome?m.awayCleanSheetRate:m.homeCleanSheetRate;
  const favWR =favHome?m.homeWinRate:m.awayWinRate, dogWR=favHome?m.awayWinRate:m.homeWinRate;
  const dogUB =favHome?m.awayUnbeatenRate:m.homeUnbeatenRate;
  const favGD =favHome?m.homeGD:m.awayGD, dogGD=favHome?m.awayGD:m.homeGD;
  const favForm=favHome?m.homeForm:m.awayForm, dogForm=favHome?m.awayForm:m.homeForm;
  const posGap=(m.homePos!=null&&m.awayPos!=null)?Math.abs(m.homePos-m.awayPos):null;
  const hPPG=venuePPG(m.homeVenuePts,m.homeVenueGames,m.homeVenueRank,m.venueTableSize!=null?m.venueTableSize:m.tableSize);
  const aPPG=venuePPG(m.awayVenuePts,m.awayVenueGames,m.awayVenueRank,m.venueTableSize!=null?m.venueTableSize:m.tableSize);
  const ppgGap=(hPPG!=null&&aPPG!=null)?Math.abs(hPPG-aPPG):null;
  const favPPG=favHome?hPPG:aPPG, dogPPG=favHome?aPPG:hPPG;
  const formPts=f=>{ if(!f) return null; let p=0,n=0; for(const c of String(f)){ if(c==='W')p+=3; else if(c==='D')p+=1; if('WDL'.indexOf(c)>=0)n++; } return n?p/n:null; };
  const favFP=formPts(favForm), dogFP=formPts(dogForm);
  const projTotal=(hA!=null&&hD!=null&&aA!=null&&aD!=null)?((hA+aD)/2+(aA+hD)/2):null;
  const lt=m.leagueTrends, LR=k=>(lt&&lt.rates&&lt.rates[k]!=null)?lt.rates[k]:null;
  const gpg=(lt&&lt.gpg!=null)?lt.gpg:null;
  const lowLg =(LR("Under 2.5")!=null&&LR("Under 2.5")>=0.58)||(gpg!=null&&gpg<=2.35);
  const highLg=(LR("Over 2.5")!=null&&LR("Over 2.5")>=0.58)||(gpg!=null&&gpg>=3.00);
  const prof=p=>p&&p.goalsFor&&p.goalsFor.n>=4?p:null;
  const hp=prof(m.homeProfile), ap=prof(m.awayProfile);
  const favProf=favHome?hp:ap;
  const winLbl=favHome?"Home Win":"Away Win", dnbLbl=favHome?"Home DNB":"Away DNB";
  const dcLbl =favHome?"Double Chance 1X":"Double Chance X2";
  const wehLbl=favHome?"Home Win Either Half":"Away Win Either Half";
  const to15Lbl=favHome?"Home Team Over 1.5 Goals":"Away Team Over 1.5 Goals";

  /* ---------- MASTER SIMILARITY REJECTION (spec §3) ---------- */
  let simSignals=0; const simWhy=[];
  if(posGap!=null&&posGap<=3){simSignals++;simWhy.push(`position gap ${posGap}`);}
  if(ppgGap!=null&&ppgGap<0.30){simSignals++;simWhy.push(`PPG gap ${ppgGap.toFixed(2)}`);}
  if(favFP!=null&&dogFP!=null&&Math.abs(favFP-dogFP)<=0.40){simSignals++;simWhy.push("near-identical form");}
  if(favWR!=null&&dogWR!=null&&Math.abs(favWR-dogWR)<=0.10){simSignals++;simWhy.push("similar win rates");}
  if(favGD!=null&&dogGD!=null&&Math.abs(favGD-dogGD)<=4){simSignals++;simWhy.push("similar goal difference");}
  const similar=simSignals>=3;

  /* ---------- rule evaluation → candidates ---------- */
  // C(priority, rule, market, balancedRule, whyParts[]) — lower priority number wins
  const cands=[]; const C=(pr,rule,mk,balRule,why)=>cands.push({pr,rule,mk,balRule,why});

  // RULE 10 (priority 2) — full GG confirmation combination
  if(gg!=null&&gg>=1.20&&gg<=1.55 && fhU15!=null&&fhU15>1.55 && balanced && o.draw>3.60 && gg2!=null&&gg2>1.30){
    if(posGap!=null&&posGap>4){
      const rej= (favFor!=null&&favFor<1.60) || (projTotal!=null&&projTotal<2.60) || lowLg;
      if(!rej) C(2,"R10","Over 2.5",true,[`GG ${gg} + open first half (FHU1.5 ${fhU15}) + unprotected draw ${o.draw}, but a ${posGap}-place gap means the favorite may supply the goals — spec switches GG to Over 2.5.`]);
    } else {
      const rej=(favFTS!=null&&favFTS>0.35)||(dogFTS!=null&&dogFTS>0.35)||(dogCS!=null&&dogCS>0.45);
      if(!rej) C(2,"R10","BTTS Yes",true,[`Full GG combination: GG ${gg}, first half not closed (FHU1.5 ${fhU15}), draw unprotected at ${o.draw}, GG2+ ${gg2} — balanced match where both sides contribute.`]);
    }
  }
  // RULE 1 (priority 3) — FH favorite + FH Over 1.5 → Over 2.5
  if(fhFav!=null&&fhFav>=1.20&&fhFav<=1.50 && fhO15!=null&&fhO15<=1.95){
    const favSideO25=favHome?m.homeOver25Rate:m.awayOver25Rate;
    const rej=(favSideO25!=null&&favSideO25<=0.40)||(dogAg!=null&&dogAg<=0.90&&dogCS!=null&&dogCS>=0.40)||lowLg;
    if(!rej) C(3,"R1","Over 2.5",false,[`Very short first-half favorite (${favName} at ${fhFav}) plus first-half Over 1.5 at ${fhO15} — the book expects early superiority and a high goal ceiling.`]);
  }
  // RULE 4 (priority 4, PROXY) — strong favorite + streak proxy → favorite team Over 1.5
  if(dog>5.00 && o.draw>3.60 && favFor!=null&&favFor>=1.70 && (!favProf||favProf.goalsFor.v>=1.50)){
    // mandatory 3-of-6 confirmations (spec §8)
    let c4=0; const w4=[];
    if(favFor>=1.70){c4++;w4.push(`favorite averages ${favFor} at this venue`);}
    if(dogAg!=null&&dogAg>=1.50){c4++;w4.push(`opponent concedes ${dogAg} per match`);}
    if(favProf&&favProf.goalsFor.v>=1.60){c4++;w4.push(`profile projects ${favProf.goalsFor.v} goals`);}
    if(dogCS!=null&&dogCS<=0.25){c4++;w4.push("opponent rarely keeps clean sheets");}
    if(dogUB!=null&&dogUB<=0.45){c4++;w4.push("opponent loses regularly");}
    if(favWR!=null&&favWR>=0.55){c4++;w4.push("strong favorite win rate");}
    const rej=(favFTS!=null&&favFTS>=0.30)||(dogCS!=null&&dogCS>=0.40);
    if(!rej&&c4>=3) C(4,"R4",to15Lbl,false,[`Streak proxy (goals-streak odds not offered): dominant price shape (opponent ${dog}, draw ${o.draw}) with ${c4} scoring confirmations — ${w4.join(', ')}.`]);
  }
  // RULE 7 (priority 5) — FH draw compression → Under 2.5 / mid-table Draw HT or FT
  if(fhD!=null&&fhD<2.90 && ng!=null&&ng>=1.20&&ng<=1.50 && o15!=null&&o15>1.50 && balanced){
    const size=m.tableSize||20;
    const midTable=posGap!=null&&posGap<=4 && m.homePos>Math.ceil(size*0.2)&&m.awayPos>Math.ceil(size*0.2) && m.homePos<=size-Math.ceil(size*0.2)&&m.awayPos<=size-Math.ceil(size*0.2);
    if(midTable && fhD<2.90){
      const rej=(favWR!=null&&favWR>=0.60)||(favFP!=null&&dogFP!=null&&Math.abs(favFP-dogFP)>0.8);
      if(!rej) C(5,"R7","Draw HT or FT",true,[`First-half draw compressed to ${fhD} in a true mid-table clash — cautious tempo, limited separation; the spec's mid-table variation takes Draw HT or FT.`]);
    } else {
      const hO25=m.homeOver25Rate, aO25=m.awayOver25Rate;
      const rej=(hO25!=null&&aO25!=null&&hO25>=0.55&&aO25>=0.55)||(hA!=null&&aA!=null&&hA>=1.50&&aA>=1.50)||(gg!=null&&gg<=1.45)||highLg;
      if(!rej) C(5,"R7","Under 2.5",true,[`Compressed first-half draw (${fhD}) + NG at ${ng} + Over 1.5 not automatic (${o15}) — slow tempo with one side likely blanked points Under 2.5.`]);
    }
  }
  // RULE 3 (priority 6) — GG2+ as GG / Over 2.5 indicator
  if(gg2!=null&&gg2>=1.35){
    if(balanced){
      const rej=(favFTS!=null&&favFTS>0.35)||(dogFTS!=null&&dogFTS>0.35)||(dogCS!=null&&dogCS>=0.45)||(hA!=null&&aA!=null&&hA<1.10&&aA<1.10)||(LR("BTTS Yes")!=null&&LR("BTTS Yes")<0.42);
      if(!rej) C(6,"R3","BTTS Yes",true,[`GG2+ priced ${gg2} signals a high-goal environment; balanced odds mean both teams are expected to contribute.`]);
    } else if(unbalanced){
      const favSideO25=favHome?m.homeOver25Rate:m.awayOver25Rate;
      const rej=(favSideO25!=null&&favSideO25<=0.40)||(projTotal!=null&&projTotal<2.50)||lowLg;
      if(!rej) C(6,"R3","Over 2.5",false,[`GG2+ priced ${gg2} in an unbalanced match — the favorite carries the scoring burden, so Over 2.5 is safer than GG.`]);
    }
  }
  // RULE 8 (priority 7, PROXY) — dominance → straight win
  if(unbalanced && favFor!=null&&favFor>=1.60 && dogAg!=null&&dogAg>=1.30){
    let c8=0; const w8=[];
    if(favPPG!=null&&dogPPG!=null&&favPPG-dogPPG>=0.40){c8++;w8.push("clear PPG advantage");}
    if(favFP!=null&&dogFP!=null&&favFP-dogFP>=0.50){c8++;w8.push("better recent form");}
    if(favWR!=null&&dogWR!=null&&favWR-dogWR>=0.15){c8++;w8.push("better win rate");}
    if(favGD!=null&&dogGD!=null&&favGD-dogGD>=6){c8++;w8.push("better goal difference");}
    if(favPPG!=null&&favPPG>=1.80){c8++;w8.push("strong venue record");}
    if(dogUB!=null&&dogUB<=0.50){c8++;w8.push("opponent has a meaningful loss rate");}
    const rej=fav<1.30||(dogUB!=null&&dogUB>=0.70)||o.draw<=3.20||similar;
    if(!rej&&c8>=4) C(7,"R8",winLbl,false,[`Dominance proxy (streak market not offered): sustained scoring (${favFor} per game) into a leaking opponent, with ${c8}/6 superiority confirmations — ${w8.join(', ')}.`]);
  }
  // RULE 5 (priority 8) — FH favorite + low NG → win either half
  if(fhFav!=null&&fhFav>=1.60&&fhFav<=1.90 && ng!=null&&ng<1.55){
    const fav1H=favHome?m.home1HFor:m.away1HFor, fav2H=favHome?m.home2HFor:m.away2HFor;
    const rej=(favWR!=null&&favWR<0.35)||(dogCS!=null&&dogCS>=0.45)||(fav1H!=null&&fav2H!=null&&fav1H<0.40&&fav2H<0.40);
    if(!rej) C(8,"R5",wehLbl,false,[`First-half price ${fhFav} shows the favorite may not dominate immediately, but NG at ${ng} says the opponent may not score at all — strong chance ${favName} takes at least one half.`]);
  }
  // RULE 2 (priority 9) — NG as favorite protection → DC / DNB
  if(ng!=null&&ng>=1.20&&ng<=1.50 && (unbalanced||fav<=1.75)){
    const rej=(favFTS!=null&&favFTS>=0.35)||(dogUB!=null&&dogUB>=0.65)||similar||(favFP!=null&&favFP<1.0);
    if(!rej){
      if(fav>1.60) C(9,"R2",dcLbl,false,[`NG priced ${ng} indicates one side may fail to score; with the favorite at ${fav}, Double Chance is the protected expression.`]);
      else C(9,"R2",dnbLbl,false,[`NG priced ${ng} indicates the opponent may be blanked; favorite at ${fav} makes DNB the value-protected pick.`]);
    }
  }
  // RULE 9 (priority 10, PROXY) — balanced + low GG → Over 1.5
  if(gg!=null&&gg<1.60 && balanced && projTotal!=null&&projTotal>=2.20){
    const hO15=m.homeOver15Rate, aO15=m.awayOver15Rate;
    const comb15=(hO15!=null&&aO15!=null)?(hO15+aO15)/2:null;
    const rej=(favFTS!=null&&favFTS>=0.40)||(dogFTS!=null&&dogFTS>=0.40)||(comb15!=null&&comb15<0.70)||(hA!=null&&aA!=null&&hA<1.0&&aA<1.0)||lowLg;
    if(!rej) C(10,"R9","Over 1.5",true,[`Streak proxy: goal expectation not strong enough for Over 2.5, but GG at ${gg} in a balanced match says both attacks are live — Over 1.5 is the safer line.`]);
  }
  // RULE 6 (priority 11) — general Over 1.5 indicator
  if(fhFav!=null&&fhFav>=1.60&&fhFav<=1.95 && dog<=4.90){
    const hO15=m.homeOver15Rate, aO15=m.awayOver15Rate;
    const comb15=(hO15!=null&&aO15!=null)?(hO15+aO15)/2:null;
    const rej=(projTotal!=null&&projTotal<2.20)||(comb15!=null&&comb15<0.70)||lowLg||(favFTS!=null&&favFTS>=0.45)||(dogFTS!=null&&dogFTS>=0.45)||(similar&&!balanced);
    if(!rej) C(11,"R6","Over 1.5",false,[`Favorite not dominant (FH ${fhFav}) and the weaker side not helpless (${dog}) — both contribute or the favorite scores twice; two total goals indicated.`]);
  }

  /* ---------- similarity gate: non-balanced rules invalid ---------- */
  const usable=similar?cands.filter(c=>c.balRule):cands;
  if(!usable.length){
    if(similar) return OUT("No Bet",null,null,[`Master similarity rejection: teams too alike (${simWhy.join(', ')}) and no balanced-match rule fires. Spec final decision: No Bet.`]);
    return OUT("No Bet",null,null,["No indicator rule triggered — the cross-market odds picture doesn't reveal a hidden relationship today. Honest No Bet."]);
  }

  /* ---------- no-bet: more than two conflicting markets ---------- */
  const distinct=[...new Set(usable.map(c=>c.mk))];
  if(distinct.length>2)
    return OUT("No Bet",null,null,[`Conflicting signals: ${usable.length} rules point at ${distinct.length} different markets (${distinct.join(', ')}). Spec no-bet condition — the odds structure disagrees with itself.`]);

  /* ---------- conflict resolution (spec §16) for known pairs ---------- */
  usable.sort((a,b)=>a.pr-b.pr);
  let chosenList=usable;
  if(distinct.length===2){
    const has=mk=>usable.find(c=>c.mk===mk);
    const pair=(a,b)=>has(a)&&has(b);
    if(pair("BTTS Yes","Over 2.5")){
      const takeGG=balanced&&(posGap==null||posGap<=4)&&(favFTS==null||favFTS<0.35)&&(dogFTS==null||dogFTS<0.35);
      chosenList=usable.filter(c=>c.mk===(takeGG?"BTTS Yes":"Over 2.5"));
      chosenList[0].why.push(takeGG?"Conflict resolved GG-over-O2.5: balanced, tight position gap, both sides score reliably.":"Conflict resolved O2.5-over-GG: gap/imbalance means the favorite can carry the total alone.");
    } else if(pair(winLbl,dnbLbl)){
      const takeWin=unbalanced&&o.draw>3.60&&(dogUB==null||dogUB<=0.50);
      chosenList=usable.filter(c=>c.mk===(takeWin?winLbl:dnbLbl));
    } else if(pair(dnbLbl,dcLbl)){
      chosenList=usable.filter(c=>c.mk===(fav<1.60?dnbLbl:dcLbl));
    } else if(pair("Under 2.5","Draw HT or FT")){
      const takeDraw=fhD!=null&&fhD<2.90&&posGap!=null&&posGap<=4;
      chosenList=usable.filter(c=>c.mk===(takeDraw?"Draw HT or FT":"Under 2.5"));
    }
  }

  /* ---------- minimum THREE statistical confirmations (spec §18) ---------- */
  const confirms=mk=>{
    const n=[]; const A=(ok,t)=>{ if(ok)n.push(t); };
    if(mk==="Over 2.5"){
      A(m.homeOver25Rate!=null&&m.awayOver25Rate!=null&&m.homeOver25Rate>=0.50&&m.awayOver25Rate>=0.50,"both sides over 2.5 half the time or more");
      A(projTotal!=null&&projTotal>=2.70,`projected total ${projTotal!=null?projTotal.toFixed(2):""}`);
      A(LR("Over 2.5")!=null&&LR("Over 2.5")>=0.52,"league runs over 2.5");
      A(hp&&ap&&(hp.goalsFor.v+ap.goalsFor.v)>=2.50,"profiles project 2.5+ combined goals");
      A(hD!=null&&aD!=null&&hD>=1.00&&aD>=1.00,"both defences concede");
    } else if(mk==="Over 1.5"){
      A(m.homeOver15Rate!=null&&m.awayOver15Rate!=null&&(m.homeOver15Rate+m.awayOver15Rate)/2>=0.70,"combined over 1.5 rate 70%+");
      A(projTotal!=null&&projTotal>=2.30,`projected total ${projTotal!=null?projTotal.toFixed(2):""}`);
      A(LR("Over 1.5")!=null&&LR("Over 1.5")>=0.70,"league clears 1.5 regularly");
      A((favFTS==null||favFTS<0.40)&&(dogFTS==null||dogFTS<0.40),"neither side blanks often");
      A(hp&&ap&&(hp.goalsFor.v+ap.goalsFor.v)>=2.20,"profiles support 2+ goals");
    } else if(mk==="Under 2.5"){
      A(projTotal!=null&&projTotal<=2.35,`projected total only ${projTotal!=null?projTotal.toFixed(2):""}`);
      A(hA!=null&&aA!=null&&hA<=1.15&&aA<=1.15,"both attacks quiet");
      A(LR("Under 2.5")!=null&&LR("Under 2.5")>=0.52,"league stays under");
      A(m.homeCleanSheetRate!=null&&m.awayCleanSheetRate!=null&&(m.homeCleanSheetRate+m.awayCleanSheetRate)/2>=0.30,"clean sheets common");
      A(m.homeOver25Rate!=null&&m.awayOver25Rate!=null&&m.homeOver25Rate<=0.45&&m.awayOver25Rate<=0.45,"both sides under 2.5 most weeks");
    } else if(mk==="BTTS Yes"){
      A((favFTS!=null&&favFTS<=0.30)&&(dogFTS!=null&&dogFTS<=0.30),"both sides score consistently");
      A(hA!=null&&aA!=null&&hA>=1.00&&aA>=1.00,"both attacks average a goal");
      A(LR("BTTS Yes")!=null&&LR("BTTS Yes")>=0.50,"league BTTS rate supports it");
      A(hp&&ap&&hp.goalsFor.v>=0.95&&ap.goalsFor.v>=0.95,"profiles confirm both score");
      A(hD!=null&&aD!=null&&hD>=1.00&&aD>=1.00,"both defences leak");
    } else if(mk==="Draw HT or FT"){
      A(fhD!=null&&fhD<2.90,"first-half draw compressed");
      A(ppgGap!=null&&ppgGap<0.40,"strength near-level");
      A(LR("Draw")!=null&&LR("Draw")>=0.26,"league draws often");
      A(favWR!=null&&dogWR!=null&&Math.abs(favWR-dogWR)<=0.12,"win rates near-level");
      A(projTotal!=null&&projTotal<=2.60,"low goal expectation");
    } else if(mk===to15Lbl){
      A(favFor!=null&&favFor>=1.70,`favorite averages ${favFor} at venue`);
      A(dogAg!=null&&dogAg>=1.50,`opponent concedes ${dogAg}`);
      A(favProf&&favProf.goalsFor.v>=1.50,"profile confirms scoring output");
      A(dogCS!=null&&dogCS<=0.25,"opponent rarely blanks anyone");
      A(favFTS!=null&&favFTS<=0.20,"favorite almost always scores");
    } else { // winLbl / dnbLbl / dcLbl / wehLbl — favorite-result family
      A(favPPG!=null&&dogPPG!=null&&favPPG-dogPPG>=0.30,"clear PPG advantage");
      A(favFP!=null&&dogFP!=null&&favFP>dogFP+0.40,"form advantage");
      A(favWR!=null&&dogWR!=null&&favWR-dogWR>=0.12,"win-rate advantage");
      A(favGD!=null&&dogGD!=null&&favGD-dogGD>=5,"goal-difference gap");
      A(dogUB!=null&&dogUB<=0.50,"opponent loses regularly");
      A(favWR!=null&&favWR>=0.50,"favorite wins half its matches or more");
    }
    return n;
  };

  for(const c of chosenList){
    const cf=confirms(c.mk);
    if(cf.length>=3){
      const grade=cf.length>=5?"Elite Banker":cf.length>=4?"Banker":"Strong Pick";
      const score=Math.min(12,6+cf.length+(c.pr<=4?1:0));
      return OUT(c.mk,grade,score,[...c.why,`Statistical confirmations (${cf.length}): ${cf.join('; ')}.`],c.rule);
    }
  }
  const top=chosenList[0];
  return OUT("No Bet",null,null,[`${top.rule} triggered ${top.mk} from the odds, but only ${confirms(top.mk).length} statistical confirmations found — spec forbids selecting a market from odds alone (minimum three). Honest No Bet.`]);
}

function withIntlFrame(fn){
  return function(m){
    const res = overlayApply(m, intlFrameApply(m, fn(m)));
    // FINAL word: unified calibration grades every engine's pick by real
    // price-band history. Idempotent — if the overlay already applied it, this
    // is a no-op; otherwise it applies here so no engine is missed.
    const mk = res && String(res.primary||res.market||"");
    const calibrated = applyCalibration(m, mk, res);
    const mk2 = calibrated && String(calibrated.primary||calibrated.market||"");
    const quality = applyQualityCheck(m, mk2, calibrated);
    // FINAL step: is a half-time market the safer expression of this pick?
    const mk3 = quality && String(quality.primary||quality.market||"");
    return applyHTArbitration(m, mk3, quality);
  };
}
const legacyRecommend = recommend;
recommend = v3Recommend;                     // spec v3.0 replaces the Normal engine
recommend        = withIntlFrame(recommend);
strictRecommend  = withIntlFrame(strictRecommend);
ultraRecommend   = withIntlFrame(ultraRecommend);
rulesProRecommend= withIntlFrame(rulesProRecommend);
apexRecommend    = withIntlFrame(apexRecommend);
primeRecommend   = withIntlFrame(primeRecommend);
valueRecommend   = withIntlFrame(valueRecommend);
proRecommend     = withIntlFrame(proRecommend);
trendRecommend   = withIntlFrame(trendRecommend);
streakRecommend  = withIntlFrame(streakRecommend);
halvesRecommend  = withIntlFrame(halvesRecommend);
mismatchRecommend = withIntlFrame(mismatchRecommend);
indicatorRecommend = withIntlFrame(indicatorRecommend);

if (typeof module !== "undefined") module.exports = {
  analyseAll, recommend, scoreOver25, scoreBTTS, scoreWinDNB, settle,
  analyseStrict, strictRecommend, tierFromRank, streakRecommend, ultraRecommend, rulesProRecommend, apexRecommend, primeRecommend, valueRecommend, proRecommend,
  classifyLeague, leagueContextVerdict, trendRecommend, halvesRecommend, mismatchRecommend, oddsLadderGate, indicatorRecommend,
  intlFrameApply, isInternationalComp
};
