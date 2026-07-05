/* ============================================================================
 * calib.js — ODDS CALIBRATION LEDGER (shared, single source of truth)
 * ----------------------------------------------------------------------------
 * Mines the board's OWN accumulated history: every finished match whose
 * pre-match odds we captured. Buckets by league -> market -> price band and
 * records the real hit rate. Self-accumulating: sharper every day the board
 * runs. API-Football does NOT sell historical odds, so THIS ledger — grown
 * from settled fixtures we already saved — is the historical-odds database.
 *
 * Both fetch-data.js AND fetch-scores.js import this and call buildOddsCalib()
 * right before writing data.js. That is the fix for the bug where the 30-min
 * scores writer used to overwrite data.js WITHOUT a ledger, silently wiping
 * calibration off every match. Whoever writes last now rebuilds it.
 *
 * Keep band boundaries, market list, and thresholds IDENTICAL to what the
 * engine's oddsCalibFor() expects (banker-engine.js) — they must agree.
 * ==========================================================================*/

// price band from decimal odds — MUST match banker-engine.js oddsCalibFor()
function band(o){
  return o < 1.45 ? "1.20-1.44"
       : o < 1.70 ? "1.45-1.69"
       : o < 2.00 ? "1.70-1.99"
       : o < 2.50 ? "2.00-2.49"
       : "2.50+";
}

// [displayMarket, oddsField, wonPredicate(homeGoals, awayGoals)]
const MARKETS = [
  ["Home Win",       "home",    (h,a)=> h>a],
  ["Away Win",       "away",    (h,a)=> a>h],
  ["Over 1.5 Goals", "over15",  (h,a)=> h+a>=2],
  ["Over 2.5 Goals", "over25",  (h,a)=> h+a>=3],
  ["Under 2.5 Goals","under25", (h,a)=> h+a<=2],
  ["Under 3.5 Goals","under35", (h,a)=> h+a<=3],
  ["BTTS Yes",       "bttsYes", (h,a)=> h>0 && a>0],
  ["BTTS No",        "bttsNo",  (h,a)=> !(h>0 && a>0)],
];

const MIN_BAND_SAMPLE = 5; // never trust a price band with fewer settled games

/* Build the per-league ledger from an array of match objects and ATTACH the
 * relevant league's ledger onto every match as `oddsCalib`. Mutates in place
 * and also returns { calib, attached, leagues } for logging.
 *
 * A match contributes to the ledger when it is settled (homeGoals/awayGoals
 * present) AND carried captured odds for that market. */
function buildOddsCalib(matches){
  const perLg = {};
  for(const x of matches){
    if(x.homeGoals == null || x.awayGoals == null || !x.odds) continue;
    const L = x.league || "?";
    const C = perLg[L] = perLg[L] || {};
    for(const [mk, field, won] of MARKETS){
      const o = x.odds[field];
      if(o == null || o < 1.05) continue;
      const b  = band(o);
      const cm = C[mk] = C[mk] || {};
      const cb = cm[b] = cm[b] || { n:0, hit:0 };
      cb.n++;
      if(won(x.homeGoals, x.awayGoals)) cb.hit++;
    }
  }

  // collapse to leagues/markets/bands that clear the min sample
  const calib = {};
  for(const [L, C] of Object.entries(perLg)){
    const outL = {}; let any = false;
    for(const [mk, bands] of Object.entries(C)){
      const bo = {};
      for(const [b, v] of Object.entries(bands)){
        if(v.n >= MIN_BAND_SAMPLE){
          bo[b] = { n:v.n, hit: Math.round((v.hit / v.n) * 100) / 100 };
          any = true;
        }
      }
      if(Object.keys(bo).length) outL[mk] = bo;
    }
    if(any) calib[L] = outL;
  }

  // attach each league's ledger onto its matches (clear stale ones)
  let attached = 0;
  for(const x of matches){
    const c = calib[x.league || "?"];
    if(c){ x.oddsCalib = c; attached++; }
    else if(x.oddsCalib) delete x.oddsCalib;
  }

  return { calib, attached, leagues: Object.keys(calib).length };
}

/* Look up a single match's ledger entry for one market, at that match's own
 * current price. Returns { n, hit, band, price } or null. This is the exact
 * shape banker-engine.js consumes — exported so the engine (and Trend engine)
 * share ONE lookup rather than re-deriving bands. */
function oddsCalibFor(m, market){
  if(!m || !m.oddsCalib || !m.odds) return null;
  const F = {
    "Home Win":"home", "Away Win":"away",
    "Over 1.5 Goals":"over15", "Over 2.5 Goals":"over25",
    "Under 2.5 Goals":"under25", "Under 3.5 Goals":"under35",
    "BTTS Yes":"bttsYes", "BTTS No":"bttsNo",
  };
  const f = F[market]; if(!f) return null;
  const o = m.odds[f]; if(o == null) return null;
  const b = band(o);
  const c = m.oddsCalib[market] && m.oddsCalib[market][b];
  return c ? { ...c, band:b, price:o } : null;
}

module.exports = { buildOddsCalib, oddsCalibFor, band, MARKETS, MIN_BAND_SAMPLE };
