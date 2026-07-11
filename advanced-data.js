/* ============================================================================
 * Predict2U advanced-data.js
 * Derives rolling performance fields from real chronological league fixtures.
 *
 * No values are invented. A field stays null when its minimum evidence is not
 * available. Rows passed here must be pre-match, newest first.
 * ========================================================================== */
"use strict";

const DAY = 86400000;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = v => Number.isFinite(Number(v)) ? Number(v) : null;
const round = (v, p=2) => {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const k = 10 ** p;
  return Math.round(Number(v) * k) / k;
};
const avg = arr => {
  const a = arr.map(finite).filter(v => v != null);
  return a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
};
const std = arr => {
  const a = arr.map(finite).filter(v => v != null);
  if (a.length < 2) return null;
  const m = avg(a);
  return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));
};
const pts = r => r && r.points != null ? Number(r.points)
  : r && r.res === "W" ? 3 : r && r.res === "D" ? 1 : 0;
const ppg = rows => rows && rows.length ? avg(rows.map(pts)) : null;
const mean = (rows, key) => rows && rows.length ? avg(rows.map(r=>r[key])) : null;
const formString = rows => rows && rows.length
  ? rows.slice().reverse().map(r=>r.res||"").join("")
  : null;

function phaseFor(gamesPlayed, tableSize){
  const g = finite(gamesPlayed), n = finite(tableSize);
  if (g == null) return null;
  const schedule = n && n > 2 ? 2 * (n - 1) : null;
  if (g < 8) return "opening";
  if (schedule && g / schedule > .70) return "run-in";
  return "established";
}

function densityFor(rows, cutoff){
  const t = Date.parse(cutoff || "");
  if (!Number.isFinite(t)) return null;
  let d8=0, d12=0;
  for (const r of rows || []){
    const x = Date.parse(r.date || r.kickoff || "");
    if (!Number.isFinite(x) || x >= t) continue;
    const age = (t-x)/DAY;
    if (age <= 8) d8++;
    if (age <= 12) d12++;
  }
  return {
    matchesIn8Days:d8,
    matchesIn12Days:d12,
    severity:d8>=3 || d12>=4 ? "high" : d8>=2 || d12>=3 ? "moderate" : "normal"
  };
}

function restFor(rows, cutoff){
  const t = Date.parse(cutoff || "");
  if (!Number.isFinite(t) || !rows || !rows.length) return null;
  const x = Date.parse(rows[0].date || rows[0].kickoff || "");
  if (!Number.isFinite(x) || x >= t) return null;
  return round((t-x)/DAY, 1);
}

function splitDifference(rows, venue){
  const v = (rows||[]).filter(r=>!venue || r.venue===venue);
  if (v.length < 6) return null;
  const block = v.length >= 8 ? 4 : 3;
  const a = v.slice(0,block), b = v.slice(block,block*2);
  if (b.length < block) return null;
  const pa=ppg(a), pb=ppg(b);
  return pa==null || pb==null ? null : round(Math.abs(pa-pb),2);
}

function similarOpponentPPG(rows, targetOpponentPPG){
  const target = finite(targetOpponentPPG);
  if (target == null) return {ppg:null, sample:0, band:null};
  const valid=(rows||[]).filter(r=>finite(r.opponentPPG)!=null);
  let band=.35, selected=valid.filter(r=>Math.abs(r.opponentPPG-target)<=band);
  if (selected.length < 3){
    band=.55;
    selected=valid.filter(r=>Math.abs(r.opponentPPG-target)<=band);
  }
  if (selected.length < 3) return {ppg:null,sample:selected.length,band};
  return {ppg:round(ppg(selected),2),sample:selected.length,band};
}

function slopeDelta(recent, previous, scale){
  if (recent == null || previous == null) return 0;
  return round(clamp((recent-previous)*scale,-100,100),1);
}

function momentumFor(rows){
  const r=(rows||[]).slice(0,10);
  if (r.length < 8) return null;

  const l3=r.slice(0,3), l5=r.slice(0,5), l8=r.slice(0,8);
  const p5=r.slice(5,10);
  const prior=p5.length>=3 ? p5 : r.slice(3,8);

  const last3PPG=ppg(l3), last5PPG=ppg(l5), last8PPG=ppg(l8), previous5PPG=ppg(prior);
  const gd=x=>mean(x,"gd");
  const gf=x=>mean(x,"gf");
  const ga=x=>mean(x,"ga");
  const q=x=>avg(x.map(row=>pts(row)*((finite(row.opponentPPG)??1.5)/1.5)));

  const recentOpp=mean(l5,"opponentPPG");
  const oppStd=std(l5.map(x=>x.opponentPPG));
  const opponentConsistency = recentOpp==null ? 50 :
    clamp(50 + (recentOpp-1.5)*25 + (oppStd==null?0:(.6-oppStd)*20),0,100);

  const ppgSlope=slopeDelta(last3PPG,previous5PPG,35);
  const gdSlope=slopeDelta(gd(l3),gd(prior),30);
  const qualitySlope=slopeDelta(q(l3),q(prior),28);
  const scoringSlope=slopeDelta(gf(l3),gf(prior),35);
  const defensiveSlope=slopeDelta(ga(prior),ga(l3),35); // lower recent GA = positive

  const gd5=gd(l5);
  const reversal = last3PPG!=null && last5PPG!=null &&
    (last3PPG <= last5PPG-.70 || (last3PPG<1 && last5PPG>=1.6));
  const regression = last5PPG!=null &&
    ((last5PPG>=2 && gd5!=null && gd5<.50) ||
     (last3PPG!=null && last3PPG <= last5PPG-.80));

  return {
    last3PPG:round(last3PPG,2),
    last5PPG:round(last5PPG,2),
    last8PPG:round(last8PPG,2),
    previous5PPG:round(previous5PPG,2),
    ppgSlope,
    gdSlope,
    qualitySlope,
    scoringSlope,
    defensiveSlope,
    opponentConsistency:round(opponentConsistency,1),
    reversal,
    regression,
    sample:r.length
  };
}

function buildTeamAdvanced(rows, opts={}){
  const clean=(rows||[])
    .filter(r=>r && r.res && Number.isFinite(Date.parse(r.date||r.kickoff||"")))
    .sort((a,b)=>Date.parse(b.date||b.kickoff)-Date.parse(a.date||a.kickoff));

  const last10=clean.slice(0,10);
  const validOpp=last10.map(r=>finite(r.opponentPPG)).filter(v=>v!=null);
  const similar=similarOpponentPPG(clean.slice(0,14),opts.targetOpponentPPG);
  const restDays=restFor(clean,opts.cutoff);
  const fixtureDensity=densityFor(clean,opts.cutoff);
  const difference=splitDifference(clean,opts.venue);
  const momentum=momentumFor(clean);

  return {
    recent10PPG:last10.length>=8?round(ppg(last10),2):null,
    recent10Form:last10.length>=8?formString(last10):null,
    opponentAvgPPG:validOpp.length>=5?round(avg(validOpp),2):null,
    similarOpponentPPG:similar.ppg,
    similarOpponentSample:similar.sample,
    similarOpponentBand:similar.band,
    restDays,
    fixtureDensity,
    splitBlockDifference:difference,
    momentum,
    seasonPhase:phaseFor(opts.gamesPlayed,opts.tableSize),
    samples:{
      chronological:clean.length,
      recent10:last10.length,
      opponentStrength:validOpp.length,
      similarOpponents:similar.sample,
      splitVenue:(clean||[]).filter(r=>!opts.venue||r.venue===opts.venue).length
    }
  };
}

module.exports = {
  buildTeamAdvanced,
  phaseFor,
  densityFor,
  restFor,
  splitDifference,
  similarOpponentPPG,
  momentumFor
};
