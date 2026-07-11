/* ============================================================================
 * team-profiles.js — PERSISTENT TEAM PROFILE LEDGER (shared module)
 * ----------------------------------------------------------------------------
 * THE PROBLEM IT SOLVES: per-fixture xG/SOT coverage is thin (xG ~5% of
 * matches; SOT only in big competitions). But teams CARRY their quality with
 * them. A team measured in a handful of matches has a usable profile that can
 * inform every future fixture it plays — even fixtures with no direct data.
 *
 * WHAT IT DOES: mines every SETTLED match for per-team evidence:
 *   - goals for/against (every settled match — 100% coverage)
 *   - xG for/against   (matches where enrich-xg populated it)
 *   - conversion proxy (goals ÷ xG, where both known)
 *   - SOT slot         (empty today; fills automatically when an SOT collector
 *                       lands in August — same accumulation, zero redesign)
 * Profiles persist in team-profiles.json and are keyed by `${name}|${leagueId}`
 * (matches carry no team IDs, so name+league is the stable key). Rolling window
 * caps at the most recent MAX_GAMES entries per team so profiles stay current.
 *
 * HONESTY RULES (mirrors the SOT spec's own discipline):
 *   - a profile reports its own sample sizes; consumers must gate on them
 *   - never invent: fields with no measurements stay null
 *   - one outlier can't dominate: window-capped, and consumers get means only
 *     with n, so they can require n>=X before acting
 *
 * Both fetch-data.js and fetch-scores.js call updateTeamProfiles() after
 * settling — same pattern as calib.js, so the ledger can never be starved by
 * whichever script writes last.
 * ==========================================================================*/

const fs = require("fs");
const path = require("path");

const LEDGER_FILE = "team-profiles.json";
const MAX_GAMES = 12;   // rolling window per team per venue-side
const HERE = __dirname;

function keyOf(name, leagueId){ return `${String(name||"").trim()}|${leagueId==null?"?":leagueId}`; }

function loadLedger(){
  try { return JSON.parse(fs.readFileSync(path.join(HERE, LEDGER_FILE), "utf8")); }
  catch(e){ return { updated:null, teams:{} }; }
}
function saveLedger(ledger){
  ledger.updated = new Date().toISOString();
  fs.writeFileSync(path.join(HERE, LEDGER_FILE), JSON.stringify(ledger), "utf8");
}

// one team's raw entry lists per-match evidence rows, newest last:
// { d:"2026-07-05", venue:"H"|"A", gf, ga, xg, xga, sot, sotc }
// xg/xga/sot/sotc are null when unmeasured. Window-capped at MAX_GAMES per venue.
function pushGame(team, row){
  team.games = team.games || [];
  // de-dupe: same date+venue+scoreline counts once (scores runs re-settle)
  const dup = team.games.some(g => g.d===row.d && g.venue===row.venue && g.gf===row.gf && g.ga===row.ga);
  if (dup) return;
  team.games.push(row);
  // cap per venue-side
  const H = team.games.filter(g=>g.venue==="H");
  const A = team.games.filter(g=>g.venue==="A");
  const trim = arr => arr.length>MAX_GAMES ? arr.slice(arr.length-MAX_GAMES) : arr;
  team.games = [...trim(H), ...trim(A)].sort((a,b)=> String(a.d).localeCompare(String(b.d)));
}

/* Update the ledger from an array of match objects (the board's data).
 * Only settled matches contribute per-match evidence rows, but EVERY match
 * (including upcoming) refreshes each team's season-seed: the venue-split
 * season aggregates the fetcher already pulls from /teams/statistics
 * (homeScoredAtHome etc., 100% fill). The seed is what makes profiles usable
 * on day one; the rows add per-match precision (goals, xG, later SOT) on top.
 * Returns stats for logging. */
function updateTeamProfiles(matches){
  const ledger = loadLedger();
  const T = ledger.teams;
  let rows = 0, xgRows = 0, sotRows = 0, seeded = 0;
  for (const m of matches){
    const hk = keyOf(m.home, m.leagueId), ak = keyOf(m.away, m.leagueId);
    const H = T[hk] = T[hk] || { name:m.home, leagueId:m.leagueId, league:m.league, games:[] };
    const A = T[ak] = T[ak] || { name:m.away, leagueId:m.leagueId, league:m.league, games:[] };

    // --- season seed refresh (any match, newest wins) ---
    if (m.homeScoredAtHome!=null && m.homeConcededAtHome!=null){
      H.seed = { venue:"H", gfPm:Number(m.homeScoredAtHome), gaPm:Number(m.homeConcededAtHome),
                 n: m.homeVenueGames!=null?Number(m.homeVenueGames):null };
      seeded++;
    }
    if (m.awayScoredAway!=null && m.awayConcededAway!=null){
      A.seed = { venue:"A", gfPm:Number(m.awayScoredAway), gaPm:Number(m.awayConcededAway),
                 n: m.awayVenueGames!=null?Number(m.awayVenueGames):null };
      seeded++;
    }

    // --- per-match evidence rows (settled only) ---
    if (m.homeGoals==null || m.awayGoals==null) continue;
    const d = String(m.matchDate || m.kickoff || "").slice(0,10);
    if (!d) continue;
    const hxg = m.xgHomeReal!=null ? Number(m.xgHomeReal) : null;
    const axg = m.xgAwayReal!=null ? Number(m.xgAwayReal) : null;
    const hsot = m.homeSOTActual!=null ? Number(m.homeSOTActual) : null;
    const asot = m.awaySOTActual!=null ? Number(m.awaySOTActual) : null;
    pushGame(H, { d, venue:"H", gf:m.homeGoals, ga:m.awayGoals, xg:hxg, xga:axg, sot:hsot, sotc:asot });
    pushGame(A, { d, venue:"A", gf:m.awayGoals, ga:m.homeGoals, xg:axg, xga:hxg, sot:asot, sotc:hsot });
    rows += 2;
    if (hxg!=null || axg!=null) xgRows++;
    if (hsot!=null || asot!=null) sotRows++;
  }
  saveLedger(ledger);
  return { teams:Object.keys(T).length, rowsAdded:rows, settledWithXg:xgRows, settledWithSot:sotRows, seeded };
}

/* Read a team's profile for prediction. venue "H"/"A" narrows to the relevant
 * split. The season SEED (venue-split per-match averages from /teams/statistics)
 * provides the base; per-match ROWS (goals + xG where measured) refine it,
 * weighted by how much row evidence exists. Every figure carries its effective
 * n so consumers can gate honestly. Returns null when nothing is known. */
function profileFor(name, leagueId, venue){
  const ledger = loadLedger();
  const t = ledger.teams[keyOf(name, leagueId)];
  if (!t) return null;
  const games = t.games || [];
  const split = venue ? games.filter(g=>g.venue===venue) : games;
  const use = split.length >= 4 ? split : games;
  const mean = (arr, f) => {
    const v = arr.map(f).filter(x=>x!=null && isFinite(x));
    return v.length ? { v: Math.round((v.reduce((a,b)=>a+b,0)/v.length)*100)/100, n: v.length } : null;
  };
  const rowGf = mean(use, g=>g.gf), rowGa = mean(use, g=>g.ga);
  const seed = t.seed && (!venue || t.seed.venue===venue) ? t.seed : (t.seed || null);
  const seedN = seed && seed.n!=null ? seed.n : (seed ? 4 : 0);

  // blend: seed base + row refinement, weighted by evidence volume.
  const blend = (seedV, rowStat) => {
    if (seedV==null && !rowStat) return null;
    if (seedV==null) return { v: rowStat.v, n: rowStat.n, src:"rows" };
    if (!rowStat)    return { v: Math.round(seedV*100)/100, n: seedN, src:"season" };
    const w = Math.min(0.5, rowStat.n * 0.1); // each row adds 10% weight, cap 50%
    const v = seedV*(1-w) + rowStat.v*w;
    return { v: Math.round(v*100)/100, n: seedN + rowStat.n, src:"blend" };
  };

  const goalsFor = blend(seed ? seed.gfPm : null, rowGf);
  const goalsAg  = blend(seed ? seed.gaPm : null, rowGa);
  if (!goalsFor && !goalsAg) return null;

  return {
    name: t.name, league: t.league, leagueId: t.leagueId,
    usedSplit: use===split ? (venue||"all") : "all(fallback)",
    games: use.length, seedGames: seedN,
    goalsFor, goalsAg,
    xgFor:     mean(use, g=>g.xg),
    xgAg:      mean(use, g=>g.xga),
    // conversion proxy: goals per xG on matches where both were measured.
    // >1.15 = hot finishing (may regress), <0.85 = wasteful (may regress up).
    conversion: (()=>{
      const both = use.filter(g=>g.xg!=null && g.xg>0);
      if (both.length < 2) return null;
      const g = both.reduce((a,b)=>a+b.gf,0), x = both.reduce((a,b)=>a+b.xg,0);
      return x>0 ? { v: Math.round((g/x)*100)/100, n: both.length } : null;
    })(),
    // SOT slot — null until a collector fills sot/sotc rows (August plan)
    sotFor:    mean(use, g=>g.sot),
    sotAg:     mean(use, g=>g.sotc),
  };
}

/* Attach each match's two team profiles onto the match object itself
 * (m.homeProfile / m.awayProfile) so the BROWSER engine can read them from
 * data.js — the engine has no filesystem, so profiles must travel with the
 * data, exactly like oddsCalib does. Call AFTER updateTeamProfiles. */
function attachProfiles(matches){
  let attached = 0;
  for (const m of matches){
    const h = profileFor(m.home, m.leagueId, "H");
    const a = profileFor(m.away, m.leagueId, "A");
    if (h) { m.homeProfile = h; attached++; } else if (m.homeProfile) delete m.homeProfile;
    if (a) { m.awayProfile = a; attached++; } else if (m.awayProfile) delete m.awayProfile;
  }
  return { attached };
}

module.exports = { updateTeamProfiles, attachProfiles, profileFor, keyOf, LEDGER_FILE, MAX_GAMES };
