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
  if (over.score >= OVER_BANKER_MIN) candidates.push({ bet: "Over 2.5", weight: over.score, strength: overStrength, kind: "over" });
  if (under.score >= UNDER_MIN)      candidates.push({ bet: under.line, weight: under.score, strength: underStrength, kind: "under" });
  if (comboOK)                       candidates.push({ bet: "Over 2.5 + BTTS", weight: (over.score + btts.score) / 2, strength: Math.min(overStrength, bttsStrength), kind: "combo" });

  if (candidates.length && !sameTier) {
    // Default ordering is by normalised strength (fairer than raw score).
    candidates.sort((a, b) => b.strength - a.strength);

    // BEST-MARKET RULE: if the top pick is a weak/marginal DNB, and any GOAL
    // market has a clearly stronger normalised case, switch to that goal market.
    let top = candidates[0];
    if ((wdnbWeak || wdnbMarginal)) {
      const goalCands = candidates.filter(c => c.kind !== "wdnb");
      if (goalCands.length) {
        const bestGoal = goalCands[0]; // already strongest by strength sort
        // require the goal market to be meaningfully stronger, not a coin-flip tie
        const topIsDNB = top.kind === "wdnb";
        if (topIsDNB && bestGoal.strength > top.strength + 0.3) {
          top = bestGoal;
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
function settle(primary, homeGoals, awayGoals) {
  if (homeGoals == null || awayGoals == null) return ""; // not played yet
  const total = homeGoals + awayGoals;
  const bothScored = homeGoals > 0 && awayGoals > 0;
  const homeWon = homeGoals > awayGoals;
  const awayWon = awayGoals > homeGoals;
  const draw = homeGoals === awayGoals;

  switch (primary) {
    case "Home Win": return homeWon ? "Won" : "Lost";
    case "Away Win": return awayWon ? "Won" : "Lost";
    case "Home DNB": return draw ? "Void" : (homeWon ? "Won" : "Lost");
    case "Away DNB": return draw ? "Void" : (awayWon ? "Won" : "Lost");
    case "Over 2.5": return total >= 3 ? "Won" : "Lost";
    case "Over 1.5": return total >= 2 ? "Won" : "Lost";
    case "Under 2.5": return total <= 2 ? "Won" : "Lost";
    case "Under 3.5": return total <= 3 ? "Won" : "Lost";
    case "BTTS Yes": return bothScored ? "Won" : "Lost";
    case "Over 2.5 + BTTS": return (total >= 3 && bothScored) ? "Won" : "Lost";
    case "Skip": return ""; // no bet was placed
    case "No Bet": return ""; // strict engine declined
    default: return "";
  }
}

/* ---------------- TOP-LEVEL: analyse all + pick Top 4 -------- */
function analyseAll(matches) {
  const results = matches.map(recommend);
  const bankers = results
    .filter(r => r.banker)
    .sort((a, b) => b.rankWeight - a.rankWeight)
    .slice(0, 4); // Rule 1: max 4
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
    bet: decision === "Bet" && market !== "No Bet" && confidence >= STRICT_CONF_FLOOR,
  });

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
      if (!ppgOk) reasons.push("Home Win blocked by sub-2.5 PPG — protect via DNB.");
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
    if(hGF>=1.2&&aGF>=1.0&&hGA>=1.1&&aGA>=1.1) add("BTTS Yes", clamp(5+(hGF+aGF-2.2)*2+(hGA+aGA-2.2)*1.5,0,10), ["Both score & concede often"], []);
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
  return { match:m, engine:"ultra", primary, confidence, bet:primary!=="No Bet", banker: confidence>=8, passed, failed, blocked, humanChecks, allScores:cand.sort((a,b)=>b.conf-a.conf), verdict };
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

function streakRecommend(m) {
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

if (typeof module !== "undefined") module.exports = {
  analyseAll, recommend, scoreOver25, scoreBTTS, scoreWinDNB, settle,
  analyseStrict, strictRecommend, tierFromRank, streakRecommend, ultraRecommend
};
