/* ============================================================================
 * Predict2U Engine Suite — July 2026 replacement build
 *
 * Implements the supplied specifications:
 *   PurePPG Normal v1.0 → Pro v8.0
 *   Trend, Streaks, Mismatch, Halves, League Bias, Momentum,
 *   Odds Intelligence and Value v1.0
 *   Pro Consensus Integration v1.0
 *
 * Design rules:
 * - One engine returns one market or No Bet.
 * - Missing mandatory data is never invented.
 * - Every output retains the legacy browser contract used by Predict2U pages:
 *     { bet, banker, primary, confidence, grade, reasons, warnings }
 * - Specialist outputs additionally follow the supplied specialist schema.
 * - Scores describe rule reliability, not guaranteed outcome probability.
 * ========================================================================== */
(function (root, factory) {
  const api = factory();
  Object.keys(api).forEach(k => { root[k] = api[k]; });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = "2026.07-new-family";
  let P2ULearningSupervisor=null;
  try{
    P2ULearningSupervisor=(typeof module!=="undefined"&&module.exports)?require("./learning-supervisor.js"):(typeof globalThis!=="undefined"?globalThis.P2ULearningSupervisor:null);
  }catch(_){ P2ULearningSupervisor=null; }
  const EPS = 1e-9;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n)));
  const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) ? null : Number(v);
  const avg = arr => { const a = arr.filter(v => num(v) !== null).map(Number); return a.length ? a.reduce((x,y)=>x+y,0)/a.length : null; };
  const hmean = (a,b) => (a>0 && b>0) ? 2*a*b/(a+b) : 0;
  const pct = v => v == null ? null : (v <= 1.00001 ? v*100 : v);
  const rate = v => v == null ? null : (v > 1.00001 ? v/100 : v);
  const round = (n,d=2) => n == null ? null : Number(Number(n).toFixed(d));
  const safeDiv = (a,b) => num(a)!==null && num(b)!==null && Number(b)!==0 ? Number(a)/Number(b) : null;
  const first = (...vals) => { for (const v of vals) if (num(v)!==null) return Number(v); return null; };
  const textFirst = (...vals) => { for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim(); return null; };

  function path(obj, p) {
    try { return p.split(".").reduce((o,k)=>o==null?undefined:o[k], obj); } catch (_) { return undefined; }
  }
  function getNum(obj, paths) {
    for (const p of paths) { const v=num(path(obj,p)); if(v!==null) return v; }
    return null;
  }
  function getText(obj, paths) {
    for (const p of paths) { const v=path(obj,p); if(typeof v==="string"&&v.trim()) return v.trim(); }
    return null;
  }

  function formArray(form) {
    if (Array.isArray(form)) return form.map(x=>String(x).toUpperCase()).filter(x=>/^[WDL]$/.test(x));
    return String(form||"").toUpperCase().split("").filter(x=>/^[WDL]$/.test(x));
  }
  function formPPG(form, n) {
    const a=formArray(form); const s=n?a.slice(-n):a;
    if(!s.length) return null;
    return s.reduce((t,x)=>t+(x==="W"?3:x==="D"?1:0),0)/s.length;
  }
  function formRate(form, pred, n=5) {
    const a=formArray(form).slice(-n); if(!a.length) return null;
    return a.filter(pred).length/a.length;
  }
  function resultStd(form) {
    const a=formArray(form).map(x=>x==="W"?3:x==="D"?1:0); if(a.length<5) return null;
    const mu=avg(a); return Math.sqrt(avg(a.map(x=>(x-mu)**2)));
  }
  function trailing(form, predicate) {
    const a=Array.isArray(form)?form:String(form||"").split(""); let n=0;
    for(let i=a.length-1;i>=0;i--){ if(predicate(a[i])) n++; else break; }
    return n;
  }

  function competitionType(m) {
    const s=((m&&m.league)||"")+" "+((m&&m.round)||"");
    if(/friendly/i.test(s)) return "Friendly";
    if(/youth|u\d\d|reserve/i.test(s)) return "Youth/Reserve";
    if(/playoff|play-off/i.test(s)) return "Playoff";
    if(/cup|knockout|round of|quarter|semi|final/i.test(s) || m&&m.isKnockout) return "Cup";
    return "League";
  }

  function gamesFor(m, side) {
    return first(
      getNum(m,[`${side}Games`,`${side}Played`,`${side}MatchesPlayed`]),
      getNum(m,[`${side}Streaks.htft.ftSample`,`${side}Streaks.sample`])
    );
  }
  function venueGames(m, side) { return getNum(m,[`${side}VenueGames`,`${side}HomeGames`,`${side}AwayGames`]); }
  function venuePPG(m, side) {
    return first(getNum(m,[`${side}VenuePPG`,`${side}HomePPG`,`${side}AwayPPG`]), safeDiv(m&&m[`${side}VenuePts`], venueGames(m,side)));
  }
  function overallPPG(m, side) {
    return first(getNum(m,[`${side}OverallPPG`,`${side}PPG`]), safeDiv(m&&m[`${side}Pts`], gamesFor(m,side)));
  }
  function recent5PPG(m, side) {
    return first(getNum(m,[`${side}Recent5PPG`,`${side}Last5PPG`,`recent5.${side}.ppg`]), formPPG(m&&m[`${side}Form`],5));
  }
  function recent10PPG(m, side) {
    return first(getNum(m,[`${side}Recent10PPG`,`${side}Last10PPG`,`recent10.${side}.ppg`,`rolling.${side}.last10.ppg`]));
  }
  function recent10Results(m, side) {
    const v=getText(m,[`${side}Recent10Form`,`${side}Last10Form`,`recent10.${side}.form`,`rolling.${side}.last10.form`]);
    return v&&formArray(v).length>=8?v:null;
  }
  function leagueVenuePPG(m, side) {
    const explicit=getNum(m,[`leagueAvg.${side}PPG`,`leagueAvg.${side}VenuePPG`, `leagueAverages.${side}PPG`]);
    if(explicit!==null) return explicit;
    const hw=rate(getNum(m,["leagueAvg.homeWinRate"]));
    const dr=rate(getNum(m,["leagueAvg.drawRate"]));
    if(hw===null||dr===null) return null;
    const aw=clamp(1-hw-dr,0,1);
    return side==="home" ? 3*hw+dr : 3*aw+dr;
  }
  function leagueSample(m){ return first(getNum(m,["leagueAvg.gamesPlayed","leagueTrends.sampleCurrent","leagueTrends.sample"])); }
  function leagueRate(m, market) {
    const aliases={
      "Over 1.5 Goals":["Over 1.5","Over 1.5 Goals"], "Over 2.5 Goals":["Over 2.5","Over 2.5 Goals"],
      "Under 2.5 Goals":["Under 2.5","Under 2.5 Goals"], "Under 3.5 Goals":["Under 3.5","Under 3.5 Goals"],
      "BTTS Yes":["BTTS Yes"], "BTTS No":["BTTS No"], "Home Win":["Home Win"], "Away Win":["Away Win"],
      "Home Team Over 0.5 Goals":["Home Team Over 0.5","Home Team Over 0.5 Goals"],
      "Away Team Over 0.5 Goals":["Away Team Over 0.5","Away Team Over 0.5 Goals"],
      "First Half Over 0.5":["First Half Over 0.5"], "First Half Under 1.5":["First Half Under 1.5"],
      "Second Half Over 0.5":["Second Half Over 0.5"], "Second Half Over 1.5":["Second Half Over 1.5"],
      "Draw at Either Half":["Draw at Either Half"]
    };
    const rs=m&&m.leagueTrends&&m.leagueTrends.rates||{};
    for(const k of (aliases[market]||[market])) if(num(rs[k])!==null) return rate(rs[k]);
    if(market==="Home non-loss"){
      const h=leagueRate(m,"Home Win"),d=rate(rs.Draw); return h!==null&&d!==null?h+d:null;
    }
    if(market==="Away non-loss"){
      const a=leagueRate(m,"Away Win"),d=rate(rs.Draw); return a!==null&&d!==null?a+d:null;
    }
    return null;
  }
  function opponentAvgPPG(m, side){ return getNum(m,[`${side}OpponentAvgPPG`,`${side}ScheduleStrengthPPG`,`opponentStrength.${side}.avgPPG`]); }
  function similarOpponentPPG(m, side){ return getNum(m,[`${side}SimilarOpponentPPG`,`similarOpponents.${side}.ppg`]); }
  function splitStability(m, side){ return getNum(m,[`${side}SplitBlockDifference`,`splitStability.${side}.difference`]); }
  function restDays(m, side){ return getNum(m,[`${side}RestDays`,`rest.${side}.days`]); }
  function fixtureDensity(m, side){ return path(m,`fixtureDensity.${side}`)||path(m,`${side}FixtureDensity`)||null; }

  function marketFamily(market){
    const s=String(market||"");
    if(/^Home Win|Home DNB|Double Chance 1X/.test(s)) return "HOME_RESULT";
    if(/^Away Win|Away DNB|Double Chance X2/.test(s)) return "AWAY_RESULT";
    if(/^Home Team Over/.test(s)) return "HOME_SCORING";
    if(/^Away Team Over/.test(s)) return "AWAY_SCORING";
    if(/^Home Team Under/.test(s)) return "HOME_SUPPRESSION";
    if(/^Away Team Under/.test(s)) return "AWAY_SUPPRESSION";
    if(/^Over/.test(s)) return "MATCH_OVER";
    if(/^Under/.test(s)) return "MATCH_UNDER";
    if(s==="BTTS Yes") return "BTTS_YES";
    if(s==="BTTS No") return "BTTS_NO";
    if(/First Half/.test(s)) return "FIRST_HALF";
    if(/Second Half|Either Half|Draw at Either Half|Draw Both Halves/.test(s)) return "SECOND_HALF";
    return "NEUTRAL";
  }
  function marketDirection(market){
    const f=marketFamily(market);
    if(["HOME_RESULT","HOME_SCORING","AWAY_SUPPRESSION"].includes(f)) return "HOME";
    if(["AWAY_RESULT","AWAY_SCORING","HOME_SUPPRESSION"].includes(f)) return "AWAY";
    if(f==="MATCH_OVER"||f==="BTTS_YES") return "OVER";
    if(f==="MATCH_UNDER"||f==="BTTS_NO") return "UNDER";
    return "NEUTRAL";
  }
  function saferRank(mk){
    const ranks={"Double Chance 1X":1,"Double Chance X2":1,"Home DNB":2,"Away DNB":2,
      "Home Team Over 0.5 Goals":3,"Away Team Over 0.5 Goals":3,
      "Home Team Under 1.5 Goals":4,"Away Team Under 1.5 Goals":4,
      "Over 1.5 Goals":5,"Under 3.5 Goals":5,"First Half Under 1.5":6,"Second Half Over 0.5":6,
      "Over 2.5 Goals":7,"Under 2.5 Goals":7,"BTTS Yes":7,"BTTS No":7,"Home Win":8,"Away Win":8};
    return ranks[mk]||9;
  }
  function signalStrength(score){ return score>=88?"PRIME":score>=84?"ELITE":score>=81?"STRONG":score>=78?"QUALIFIED":score>=74?"WATCHLIST":"NONE"; }
  function gradeFor(score, specialist=false){
    if(specialist) return score>=88?"Prime specialist signal":score>=84?"Elite specialist signal":score>=81?"Strong specialist signal":score>=78?"Qualified specialist signal":score>=74?"Watchlist":"No Bet";
    return score>=90?"Prime":score>=87?"Elite":score>=84?"Strong":score>=78?"Qualified":"No Bet";
  }

  function makeOutput({m,engine,version,market="No Bet",score=0,dq=0,reasons=[],warnings=[],veto="NONE",vetoScope="",safer=[],status,rule="",bankerFloor=84,specialist=false,extra={}}){
    score=round(clamp(score,0,specialist?92:94),1); dq=round(clamp(dq,0,100),1);
    const qualified=status ? status==="QUALIFIED" : (market!=="No Bet" && score>=78 && veto!=="HARD");
    const finalStatus=status || (qualified?"QUALIFIED":score>=74&&market!=="No Bet"?"WATCHLIST":"NO BET");
    const bet=qualified && market!=="No Bet";
    const primary=bet?market:"No Bet";
    let out={
      match:m, engine, version, primary, candidate_market:primary, market:primary,
      market_family:marketFamily(primary), direction:marketDirection(primary),
      score, specialist_score:specialist?score:undefined, confidence:score, dataQuality:dq, data_quality:dq,
      signal_strength:signalStrength(score), grade:gradeFor(score,specialist),
      reasons:[...reasons], exact_triggers:[...reasons], warnings:[...warnings],
      veto, veto_level:veto, veto_scope:vetoScope||"NONE", compatible_safer_markets:[...safer],
      final_status:finalStatus, bet, banker:bet&&score>=bankerFloor&&veto==="NONE", rule,
      summary:bet?`${engine}: ${primary} (${score})`:`No Bet — ${reasons[0]||warnings[0]||"requirements not met"}`,
      ...extra
    };
    if(!bet && out.reasons.length===0) out.reasons.push("No supported market reached the required threshold.");
    if(P2ULearningSupervisor&&typeof P2ULearningSupervisor.reviewDecision==="function") out=P2ULearningSupervisor.reviewDecision(out,m);
    return out;
  }
  function noBet(m,engine,version,reason,{dq=0,warnings=[],veto="HARD",scope="FIXTURE",specialist=false,extra={}}={}){
    return makeOutput({m,engine,version,market:"No Bet",score:0,dq,reasons:[reason],warnings,veto,vetoScope:scope,status:"NO BET",specialist,extra});
  }

  // --------------------------------------------------------------------------
  // PurePPG family
  // --------------------------------------------------------------------------
  const PPG_LEVELS={
    normal:{name:"PurePPG Normal",version:"1.0",w:[.50,.25,.25],min:78,winH:82,winA:82,cap:94,sampleMin:0},
    strict:{name:"PurePPG Strict",version:"2.0",w:[.55,.25,.20],min:80,winH:84,winA:85,cap:93,sampleMin:6},
    ultra:{name:"PurePPG Ultra",version:"3.0",min:81,winH:85,winA:86,cap:93,sampleMin:8},
    elite:{name:"PurePPG Elite",version:"4.0",min:82,winH:86,winA:87,cap:93,sampleMin:8},
    apex:{name:"PurePPG Apex",version:"5.0",min:83,winH:87,winA:88,cap:93,sampleMin:8},
    prime:{name:"PurePPG Prime",version:"6.0",min:84,winH:88,winA:89,cap:92,sampleMin:8},
    expert:{name:"PurePPG Expert",version:"7.0",min:85,winH:89,winA:90,cap:93,sampleMin:8}
  };

  const PPG_THRESH={
    normal:{HW:[1.95,1.25,.70],AW:[2.00,1.20,.80],HD:[1.65,1.45,.45],AD:[1.70,1.40,.50],HDC:[1.45,1.55,.30],ADC:[1.50,1.50,.35],HO:[1.55,1.35,.35],AO:[1.65,1.30,.40],AU:[1.85,1.10,.75],HU:[1.95,1.05,.85],U35:[.65,1.00,1.75,1.65]},
    strict:{HW:[2.00,1.20,.80],AW:[2.05,1.15,.90],HD:[1.72,1.38,.52],AD:[1.78,1.35,.58],HDC:[1.55,1.48,.36],ADC:[1.60,1.42,.42],HO:[1.65,1.28,.45],AO:[1.72,1.22,.50],AU:[1.95,1.00,.90],HU:[2.05,.95,1.00],U35:[.80,1.00,1.90,1.58]},
    ultra:{HW:[2.02,1.16,.84],AW:[2.08,1.10,.96],HD:[1.75,1.35,.56],AD:[1.82,1.30,.63],HDC:[1.58,1.42,.40],ADC:[1.64,1.36,.46],HO:[1.70,1.22,.50],AO:[1.78,1.16,.56],AU:[2.00,.95,.95],HU:[2.10,.90,1.05],U35:[.85,.95,1.95,1.55]},
    elite:{HW:[2.05,1.15,.88],AW:[2.12,1.08,1.00],HD:[1.78,1.32,.60],AD:[1.85,1.27,.68],HDC:[1.62,1.38,.43],ADC:[1.68,1.32,.50],HO:[1.74,1.18,.54],AO:[1.82,1.12,.60],AU:[2.02,.92,1.00],HU:[2.12,.88,1.10],U35:[.90,.92,1.98,1.52]},
    apex:{HW:[2.08,1.12,.55],AW:[2.15,1.05,.65],HD:[1.80,1.30,.32],AD:[1.88,1.25,.38],HDC:[1.65,1.35,.20],ADC:[1.72,1.28,.24],HO:[1.78,1.15,.30],AO:[1.86,1.10,.35],AU:[2.05,.90,.60],HU:[2.15,.85,.70],U35:[.58,.90,2.00,1.50]},
    prime:null, expert:null
  };

  function ppgTier(v){ return v>=2.20?"Elite":v>=2.00?"Banker":v>=1.75?"Strong":v>=1.45?"Competitive":v>=1.20?"Average":v>=.90?"Weak":"Poor"; }
  function countAgreement(c, side){
    const other=side==="home"?"away":"home"; let n=0;
    for(const k of ["venue","overall","r10","r5"]){ const a=c[side][k],b=c[other][k]; if(a!==null&&b!==null&&a>=b) n++; }
    return n;
  }
  function volatilityClass(std){
    if(std===null) return {name:"Unknown",adj:0};
    if(std<=.85)return{name:"Very stable",adj:3}; if(std<=1.05)return{name:"Stable",adj:2};
    if(std<=1.25)return{name:"Moderate",adj:0}; if(std<=1.40)return{name:"Volatile",adj:-5}; return{name:"Extreme",adj:-9};
  }
  function dataQualityPPG(m,c,level){
    let dq=100; const warnings=[];
    for(const side of ["home","away"]){
      const s=c[side].sample;
      if(s<6) dq-=18; else if(s<8)dq-=10; else if(s<10)dq-=4;
      const vo=Math.abs((c[side].venue??0)-(c[side].overall??0));
      if(vo>=.65&&vo<.90)dq-=6; else if(vo>=.90)dq-=12;
      if(c[side].vol.name==="Volatile")dq-=5; if(c[side].vol.name==="Extreme")dq-=12;
    }
    if(["Cup","Playoff"].includes(c.comp))dq-=8;
    if(level==="normal"&&(!c.home.overall||!c.away.overall))dq-=5;
    return {dq:clamp(dq,0,100),warnings};
  }
  function buildPPGContext(m,level){
    const cfg=PPG_LEVELS[level], comp=competitionType(m);
    const c={m,level,cfg,comp,home:{},away:{},warnings:[],missing:[]};
    if(comp==="Friendly") c.missing.push("Friendly competition is excluded.");
    if(level!=="normal"&&level!=="strict"&&comp==="Youth/Reserve") c.missing.push("Youth/Reserve is excluded at this level.");
    if(level==="strict"&&comp==="Youth/Reserve") c.missing.push("Strict excludes Youth/Reserve competitions.");
    for(const side of ["home","away"]){
      const x=c[side];
      x.venue=venuePPG(m,side); x.overall=overallPPG(m,side); x.r5=recent5PPG(m,side); x.r10=recent10PPG(m,side);
      x.sample=venueGames(m,side)||0; x.league=leagueVenuePPG(m,side); x.games=gamesFor(m,side)||0; x.vol={name:"Unknown",adj:0};
      if(x.venue===null)c.missing.push(`${side} venue PPG missing`);
      if(x.overall===null&&level!=="normal")c.missing.push(`${side} overall PPG missing`);
      if(x.r5===null&&level!=="normal")c.missing.push(`${side} recent-five PPG missing`);
      if(level==="normal"){
        if(x.overall!==null&&x.r5!==null)x.eff=.50*x.venue+.25*x.overall+.25*x.r5;
        else if(x.overall!==null){x.eff=.65*x.venue+.35*x.overall;c.warnings.push(`${side}: recent-five missing; −3 applied.`);}
        else {x.eff=x.venue;c.warnings.push(`${side}: venue PPG only; −6 applied.`);}
      } else if(level==="strict") x.eff=.55*x.venue+.25*x.overall+.20*x.r5;
      if(["ultra","elite","apex","prime","expert"].includes(level)){
        if(x.r10===null)c.missing.push(`${side} recent-ten PPG missing`);
        if(x.league===null)c.missing.push(`${side} league venue PPG baseline missing`);
      }
      if(level==="ultra"){
        x.eff=.45*x.venue+.20*x.overall+.20*x.r10+.15*x.r5;
      }
      x.lsi=(x.venue!==null&&x.league)?x.venue/x.league:null;
      if(["elite","apex","prime","expert"].includes(level)){
        x.opp=opponentAvgPPG(m,side);
        x.r10form=recent10Results(m,side);
        if(x.opp===null)c.missing.push(`${side} opponent-strength average missing`);
        if(!x.r10form)c.missing.push(`${side} last-ten result sequence missing`);
        if(x.venue!==null&&x.overall!==null&&x.league!==null){
          const rel=x.sample/(x.sample+6), prior=.60*x.overall+.40*x.league;
          x.shrunk=rel*x.venue+(1-rel)*prior;
          const leagueTeam=avg([leagueVenuePPG(m,"home"),leagueVenuePPG(m,"away")]);
          const ratio=leagueTeam?clamp(x.opp/leagueTeam,.88,1.12):null;
          x.oppAdjusted=ratio?x.shrunk*ratio:null;
          const recent=.40*x.r10+.35*x.r5+.25*x.overall;
          x.eff=.35*x.shrunk+.25*x.oppAdjusted+.20*x.overall+.20*recent;
          x.vol=volatilityClass(resultStd(x.r10form));
        }
      } else x.vol={name:"Unknown",adj:0};
    }
    if(["ultra","elite","apex","prime","expert"].includes(level)&&leagueSample(m)<50)c.missing.push("League sample below 50.");
    c.delta=(c.home.eff!==undefined&&c.away.eff!==undefined)?c.home.eff-c.away.eff:null;
    c.absDelta=c.delta===null?null:Math.abs(c.delta); c.avgPPG=c.delta===null?null:(c.home.eff+c.away.eff)/2;
    c.home.agree=countAgreement(c,"home"); c.away.agree=countAgreement(c,"away");
    const dq=dataQualityPPG(m,c,level); c.dq=dq.dq; c.warnings.push(...dq.warnings);
    if(["apex","prime","expert"].includes(level)&&!c.missing.length){
      for(const side of ["home","away"]){
        const x=c[side]; let u=.16;
        if(x.sample>=8&&x.sample<=9)u+=.04; else if(x.sample>=6&&x.sample<=7)u+=.08;
        if(x.vol.name==="Volatile")u+=.05; if(x.vol.name==="Extreme")u+=.10;
        if(["Cup","Playoff"].includes(c.comp))u+=.07;
        if(m[`${side}Promoted`]||m[`${side}Relegated`])u+=.05;
        if(Math.abs(x.venue-x.overall)>=.65)u+=.05;
        if(x.sample>=15)u-=.03; if(x.vol.name==="Very stable")u-=.03; if(x.agree===4)u-=.03;
        x.uncertainty=clamp(u,.10,.40); x.lower=x.eff-x.uncertainty; x.upper=x.eff+x.uncertainty;
      }
      c.homeCE=c.home.lower-c.away.upper; c.awayCE=c.away.lower-c.home.upper;
      const dr=rate(getNum(m,["leagueAvg.drawRate"]))??.28;
      const balance=clamp(1-(c.absDelta/1.2),0,1);
      const stabSim=c.home.vol.name===c.away.vol.name?1:.5;
      const lsiSim=c.home.lsi&&c.away.lsi?clamp(1-Math.abs(c.home.lsi-c.away.lsi),0,1):.5;
      c.drawRisk=100*(.35*clamp(dr/.35,0,1)+.35*balance+.15*stabSim+.15*lsiSim);
    }
    return c;
  }

  function ppgBaseScore(market,edge,fav,opp,recentAgree){
    if(market==="Home Win")return 60+20*edge+(fav>=2?8:0)+(fav>=2.2?5:0)+(opp<=1?6:0)+(recentAgree?4:0);
    if(market==="Away Win")return 58+20*edge+(fav>=2.05?8:0)+(fav>=2.2?5:0)+(opp<=.95?6:0)+(recentAgree?4:0);
    if(/DNB/.test(market))return 62+18*edge+(fav>=1.75?5:0)+(opp<1.2?4:0)+(recentAgree?4:0);
    if(/Double Chance/.test(market))return 66+14*edge+(fav>=1.75?5:0)+(opp<=1.44?4:0)+(recentAgree?3:0);
    if(/Over 0.5 Team Goals/.test(market))return 63+12*edge+(fav>=1.75?5:0)+(opp<1.2?4:0)+(recentAgree?3:0);
    if(/Under 1.5 Team Goals/.test(market))return 62+13*edge+(opp<.9?5:0)+(fav>=2?4:0)+(recentAgree?3:0);
    if(market==="Under 3.5 Goals")return 61+10*edge+(opp<.9?4:0)+(fav>=2?3:0);
    return 0;
  }

  function ppgCandidates(c){
    const l=c.level, t=PPG_THRESH[l==="prime"?"apex":l==="expert"?"apex":l], h=c.home.eff,a=c.away.eff,d=c.delta;
    const res=[]; const add=(market,ok,score,why,extra={})=>{ if(ok)res.push({market,score,why,extra}); };
    if(!t||h==null||a==null||d==null)return res;
    const homeEdge=l==="apex"||l==="prime"||l==="expert"?c.homeCE:d;
    const awayEdge=l==="apex"||l==="prime"||l==="expert"?c.awayCE:-d;
    const recentH=(c.home.r5??-9)>=(c.away.r5??9), recentA=(c.away.r5??-9)>=(c.home.r5??9);
    const allH=[c.home.venue,c.home.overall,c.home.r5].every((v,i)=>v!==null&&v>=[c.away.venue,c.away.overall,c.away.r5][i]);
    const allA=[c.away.venue,c.away.overall,c.away.r5].every((v,i)=>v!==null&&v>=[c.home.venue,c.home.overall,c.home.r5][i]);
    const straightSample=(l==="normal"?7:l==="strict"?8:10);
    const winH=t.HW, winA=t.AW;
    let hWin=h>=winH[0]&&a<=winH[1]&&homeEdge>=winH[2]&&c.home.sample>=straightSample;
    let aWin=a>=winA[0]&&h<=winA[1]&&awayEdge>=winA[2]&&c.away.sample>=straightSample;
    if(l==="normal")hWin=hWin&&(h>=2.10||a<=1.00||d>=.90),aWin=aWin&&(a>=2.15||h<=.95||-d>=1);
    if(l==="strict")hWin=hWin&&(h>=2.15||a<=.95||d>=1)&&allH,aWin=aWin&&(a>=2.2||h<=.9||-d>=1.1)&&allA;
    if(["ultra","elite"].includes(l)){
      hWin=hWin&&c.home.lsi>=(l==="ultra"?1.15:1.17)&&c.away.lsi<=(l==="ultra"?.92:.91)&&c.home.agree===4;
      aWin=aWin&&c.away.lsi>=(l==="ultra"?1.18:1.20)&&c.home.lsi<=(l==="ultra"?.90:.89)&&c.away.agree===4;
    }
    if(["apex","prime","expert"].includes(l)){
      hWin=hWin&&c.drawRisk<=54&&c.dq>=82&&c.home.uncertainty<=.24&&c.away.uncertainty<=.24;
      aWin=aWin&&c.drawRisk<=49&&c.dq>=84&&c.home.uncertainty<=.24&&c.away.uncertainty<=.24;
    }
    if(l==="expert"){hWin=hWin&&c.homeCE>=.62;aWin=aWin&&c.awayCE>=.72;}
    add("Home Win",hWin,ppgBaseScore("Home Win",Math.max(d,0),h,a,recentH),`Home strength ${h.toFixed(2)} vs ${a.toFixed(2)}; edge ${d.toFixed(2)}.`);
    add("Away Win",aWin,ppgBaseScore("Away Win",Math.max(-d,0),a,h,recentA),`Away strength ${a.toFixed(2)} vs ${h.toFixed(2)}; edge ${(-d).toFixed(2)}.`);

    const H=t.HD,A=t.AD;
    let hd=h>=H[0]&&a<=H[1]&&homeEdge>=H[2], ad=a>=A[0]&&h<=A[1]&&awayEdge>=A[2];
    if(l==="normal"){hd=hd&&(d<=.79)&&(recentH||h-a>=.55||a<=1.2);ad=ad&&(-d<=.84)&&(recentA||a-h>=.6||h<=1.1);}
    if(l==="strict"){hd=hd&&d<=.84&&c.home.agree>=2;ad=ad&&-d<=.89&&c.away.agree>=2;}
    if(["ultra","elite"].includes(l)){hd=hd&&c.home.agree>=3;ad=ad&&c.away.agree>=3;}
    if(["apex","prime","expert"].includes(l)){hd=hd&&c.drawRisk<=69&&c.dq>=80;ad=ad&&c.drawRisk<=64&&c.dq>=80;}
    if(l==="expert"){hd=hd&&c.homeCE>=.38;ad=ad&&c.awayCE>=.44;}
    add("Home DNB",hd,ppgBaseScore("Home DNB",Math.max(d,0),h,a,recentH),`Home DNB edge ${round(homeEdge)} with ${c.home.agree}/4 trend agreement.`);
    add("Away DNB",ad,ppgBaseScore("Away DNB",Math.max(-d,0),a,h,recentA),`Away DNB edge ${round(awayEdge)} with ${c.away.agree}/4 trend agreement.`);

    const HC=t.HDC,AC=t.ADC;
    let hdc=h>=HC[0]&&a<=HC[1]&&homeEdge>=HC[2], adc=a>=AC[0]&&h<=AC[1]&&awayEdge>=AC[2];
    if(l==="normal"){hdc=hdc&&d<=.59;adc=adc&&-d<=.64;}
    if(l==="strict"){hdc=hdc&&d<=.64&&c.home.agree>=2;adc=adc&&-d<=.69&&c.away.agree>=2;}
    if(["ultra","elite"].includes(l)){hdc=hdc&&c.home.agree>=3;adc=adc&&c.away.agree>=3;}
    if(l==="expert"){hdc=hdc&&c.homeCE>=.24;adc=adc&&c.awayCE>=.28;}
    add("Double Chance 1X",hdc,ppgBaseScore("Double Chance 1X",Math.max(d,0),h,a,recentH),`Home non-loss structure supported by edge ${round(homeEdge)}.`);
    add("Double Chance X2",adc,ppgBaseScore("Double Chance X2",Math.max(-d,0),a,h,recentA),`Away non-loss structure supported by edge ${round(awayEdge)}.`);

    const HO=t.HO,AO=t.AO;
    let ho=h>=HO[0]&&a<=HO[1]&&homeEdge>=HO[2]&&(c.home.r5??0)>=(l==="normal"?1.2:l==="strict"?1.3:0);
    let ao=a>=AO[0]&&h<=AO[1]&&awayEdge>=AO[2]&&(c.away.r5??0)>=(l==="normal"?1.25:l==="strict"?1.35:0);
    if(["ultra","elite"].includes(l)){ho=ho&&c.home.agree===4;ao=ao&&c.away.agree===4;}
    if(l==="expert"){ho=ho&&c.homeCE>=.35;ao=ao&&c.awayCE>=.40;}
    add("Home Team Over 0.5 Goals",ho,ppgBaseScore("Home Team Over 0.5 Goals",Math.max(d,0),h,a,recentH),`Home scoring support follows a ${round(homeEdge)} conservative edge.`);
    add("Away Team Over 0.5 Goals",ao,ppgBaseScore("Away Team Over 0.5 Goals",Math.max(-d,0),a,h,recentA),`Away scoring support follows a ${round(awayEdge)} conservative edge.`);

    const AU=t.AU,HU=t.HU;
    let au=h>=AU[0]&&a<=AU[1]&&homeEdge>=AU[2]&&c.home.sample>=7;
    let hu=a>=HU[0]&&h<=HU[1]&&awayEdge>=HU[2]&&c.away.sample>=7;
    if(l==="expert"){au=au&&c.homeCE>=.65;hu=hu&&c.awayCE>=.75;}
    add("Away Team Under 1.5 Goals",au,ppgBaseScore("Away Team Under 1.5 Goals",Math.max(d,0),h,a,recentH),`Weak away profile is protected by the stronger home direction.`);
    add("Home Team Under 1.5 Goals",hu,ppgBaseScore("Home Team Under 1.5 Goals",Math.max(-d,0),a,h,recentA),`Weak home profile is protected by the stronger away direction.`);

    const U=t.U35; const ceAbs=["apex","prime","expert"].includes(l)?Math.max(c.homeCE,c.awayCE):Math.abs(d);
    let u35=ceAbs>=U[0]&&Math.min(h,a)<=U[1]&&Math.max(h,a)>=U[2]&&c.avgPPG<=U[3]&&Math.min(c.home.sample,c.away.sample)>=7;
    if(l==="normal"&&c.home.r5>=1.8&&c.away.r5>=1.8)u35=false;
    if(l==="expert")u35=u35&&ceAbs>=.65&&(leagueRate(c.m,"Under 3.5 Goals")??0)>=.70;
    add("Under 3.5 Goals",u35,ppgBaseScore("Under 3.5 Goals",Math.abs(d),Math.max(h,a),Math.min(h,a),true),`Large quality gap plus low average PPG (${c.avgPPG.toFixed(2)}) supports the safety total.`);
    return res;
  }

  function applyPPGScore(c,cand){
    let s=cand.score, warnings=[...c.warnings];
    const l=c.level, comp=c.comp;
    for(const side of ["home","away"]){
      const x=c[side];
      if(x.sample>=7&&x.sample<=9)s-=3; else if(x.sample>=5&&x.sample<=6)s-=7; else if(x.sample<5)s-=12;
      if(x.overall!==null&&Math.abs(x.venue-x.overall)>=.40&&Math.abs(x.venue-x.overall)<.65)s-=3;
    }
    if(comp==="Cup")s-=8; if(comp==="Playoff")s-=6; if(comp==="Youth/Reserve")s-=10;
    if(l==="strict"){
      const side=marketDirection(cand.market)==="AWAY"?c.away:c.home;
      s+=side.agree===4?2:side.agree>=3?-4:-8;
    }
    if(l==="ultra"){
      const side=marketDirection(cand.market)==="AWAY"?c.away:c.home;
      s+=side.agree===4?4:side.agree===3?2:0; if(side.lsi>=1.2)s+=3;
      const opp=side===c.home?c.away:c.home; if(opp.lsi<=.88)s+=2;
    }
    if(["elite","apex","prime","expert"].includes(l)){
      const side=marketDirection(cand.market)==="AWAY"?c.away:c.home;
      s+=side.vol.adj;
    }
    if(["apex","prime","expert"].includes(l)){
      const ce=Math.max(c.homeCE,c.awayCE); if(ce>=.6)s+=4;
      if(c.home.uncertainty<=.18&&c.away.uncertainty<=.18)s+=2;
      if(c.drawRisk>=55)s-=5;
      if(c.home.uncertainty>.28||c.away.uncertainty>.28)s-=8;
    }
    if(/Team|Under 3.5/.test(cand.market)) s=Math.min(s,l==="normal"?86:l==="strict"?84:l==="ultra"?84:l==="elite"?83:82);
    return {score:clamp(s,0,c.cfg.cap),warnings};
  }

  function primeCalibration(m,market){
    const obj=path(m,`modelCalibration.${market}`)||path(m,`calibratedMarkets.${market}`)||null;
    if(!obj)return null;
    return {sample:first(obj.sample,obj.n),lower:first(obj.lower,obj.lowerBound,obj.pLow),mid:first(obj.mid,obj.probability,obj.p),upper:first(obj.upper,obj.upperBound,obj.pHigh),grade:obj.grade||"Provisional",leagueReliability:first(obj.leagueReliability,path(m,"leagueReliability")),decay:!!obj.suspended||!!obj.decaySuspended};
  }
  const PRIME_FLOOR={"Home Win":.66,"Away Win":.64,"Home DNB":.72,"Away DNB":.72,"Double Chance 1X":.76,"Double Chance X2":.76,"Home Team Over 0.5 Goals":.78,"Away Team Over 0.5 Goals":.78,"Away Team Under 1.5 Goals":.74,"Home Team Under 1.5 Goals":.74,"Under 3.5 Goals":.75};

  function expertContext(m,c,market){
    const hGames=gamesFor(m,"home"),aGames=gamesFor(m,"away");
    const schedule=(m.tableSize&&m.tableSize>2)?2*(m.tableSize-1):null;
    const played=avg([hGames,aGames]);
    const phase=path(m,"seasonPhase")||(schedule&&played<8?"opening":schedule&&played/schedule>.7?"run-in":"established");
    if(!phase)return {ok:false,reason:"Season phase unavailable."};
    if(phase==="opening")return {ok:false,reason:"Opening phase: fewer than eight league matches."};
    const dir=marketDirection(market), side=dir==="AWAY"?"away":"home",opp=side==="home"?"away":"home";
    const sim=similarOpponentPPG(m,side), rest=restDays(m,side),oppRest=restDays(m,opp), stab=splitStability(m,side), dens=fixtureDensity(m,side);
    if(sim===null||rest===null||oppRest===null||stab===null||!dens)return {ok:false,reason:"Expert context inputs missing (similar-opponent PPG, rest, density or split stability)."};
    let points=0,major=0,warnings=[];
    const ce=side==="home"?c.homeCE:c.awayCE; if(ce>=.24)points++;
    if(c[side].agree>=3)points++;
    if(c[side].lsi>c[opp].lsi)points++;
    if(c[side].oppAdjusted>c[opp].oppAdjusted)points++;
    if(sim>=c[side].overall-.35)points++; else major++;
    if(stab<=.35)points++; else if(stab>.65){major++;warnings.push("Venue split is unstable.");}
    if((c[side].r10??0)>=(c[opp].r10??9))points++;
    const dense=typeof dens==="object"?(dens.matchesIn8Days>=3||dens.matchesIn12Days>=4):/severe|high/i.test(String(dens));
    if(!dense&&rest+2>=oppRest)points++; else {major++;warnings.push("Rest/density is adverse.");}
    const req=/Win$/.test(market)?8:/DNB/.test(market)?7:/Double Chance/.test(market)?6:7;
    return {ok:points>=req&&major<2,points,major,warnings,reason:`Expert confirmation ${points}/8; ${major} major contradiction(s).`};
  }

  function runPPG(m,level){
    const c=buildPPGContext(m,level),cfg=c.cfg;
    if(c.missing.length)return noBet(m,cfg.name,cfg.version,c.missing[0],{dq:c.dq,warnings:[...new Set(c.missing.slice(1).concat(c.warnings))],veto:"HARD",scope:"DATA"});
    if(Math.min(c.home.sample,c.away.sample)<cfg.sampleMin)return noBet(m,cfg.name,cfg.version,`Venue sample below ${cfg.sampleMin}.`,{dq:c.dq,warnings:c.warnings});
    if(level==="strict"&&c.home.eff<1.2&&c.away.eff<1.2)return noBet(m,cfg.name,cfg.version,"Both Effective PPG values are below 1.20.",{dq:c.dq});
    const minDelta=level==="normal"?0:level==="strict"?.28:level==="ultra"?.30:.12;
    if(c.absDelta<minDelta)return noBet(m,cfg.name,cfg.version,`Strength gap ${c.absDelta.toFixed(2)} is below the ${minDelta.toFixed(2)} gate.`,{dq:c.dq});
    if(["apex","prime","expert"].includes(level)){
      if(c.dq<78)return noBet(m,cfg.name,cfg.version,`Data Quality ${c.dq} is below 78.`,{dq:c.dq});
      if(c.home.uncertainty>.34||c.away.uncertainty>.34)return noBet(m,cfg.name,cfg.version,"Uncertainty exceeds 0.34.",{dq:c.dq});
      if(Math.max(c.homeCE,c.awayCE)<.12)return noBet(m,cfg.name,cfg.version,"Conservative Edge is below 0.12.",{dq:c.dq});
    }
    let candidates=ppgCandidates(c).map(x=>({...x,...applyPPGScore(c,x)}));
    if(!candidates.length)return noBet(m,cfg.name,cfg.version,"No supported market passed the engine thresholds.",{dq:c.dq,warnings:c.warnings,veto:"NONE",scope:"NONE"});

    if(level==="prime"||level==="expert"){
      candidates=candidates.filter(x=>{
        const cal=primeCalibration(m,x.market); x.calibration=cal;
        if(!cal||cal.lower===null||cal.leagueReliability===null)return false;
        if(cal.decay||cal.leagueReliability<63)return false;
        const floor=PRIME_FLOOR[x.market]??.75; if(cal.lower<floor)return false;
        x.score=Math.min(x.score+(cal.leagueReliability-70)/2,cal.sample<300?81:cfg.cap);
        return true;
      });
      if(!candidates.length)return noBet(m,cfg.name,cfg.version,"No candidate has the mandatory calibrated probability interval and league reliability.",{dq:c.dq,warnings:["Provide modelCalibration[market] with sample, lower/mid/upper probability, grade and leagueReliability."],scope:"CALIBRATION"});
    }
    if(level==="expert"){
      candidates=candidates.filter(x=>{x.expert=expertContext(m,c,x.market);return x.expert.ok;});
      if(!candidates.length)return noBet(m,cfg.name,cfg.version,"No candidate passed the eight-point Expert context matrix.",{dq:c.dq,scope:"CONTEXT"});
    }

    candidates.sort((a,b)=>b.score-a.score||saferRank(a.market)-saferRank(b.market));
    let chosen=candidates[0];
    const dir=marketDirection(chosen.market), same=candidates.filter(x=>marketDirection(x.market)===dir);
    if(/Win$/.test(chosen.market)){
      const safer=same.find(x=>/DNB/.test(x.market))||same.find(x=>/Double Chance/.test(x.market));
      const margin=/DNB/.test(safer&&safer.market)?(level==="normal"?3:4):(level==="normal"?4:5);
      if(safer&&chosen.score<safer.score+margin)chosen=safer;
    }
    const floor=/Home Win/.test(chosen.market)?cfg.winH:/Away Win/.test(chosen.market)?cfg.winA:cfg.min;
    if(chosen.score<floor)return noBet(m,cfg.name,cfg.version,`${chosen.market} scored ${round(chosen.score,1)}, below its ${floor} minimum.`,{dq:c.dq,warnings:chosen.warnings,veto:"NONE",scope:"NONE"});
    const extra={effective_ppg:{home:round(c.home.eff),away:round(c.away.eff),delta:round(c.delta)},trend_agreement:{home:c.home.agree,away:c.away.agree}};
    if(c.homeCE!==undefined)extra.conservative_edge={home:round(c.homeCE),away:round(c.awayCE),drawRisk:round(c.drawRisk,1),homeUncertainty:round(c.home.uncertainty),awayUncertainty:round(c.away.uncertainty)};
    if(chosen.calibration)extra.calibration=chosen.calibration;
    if(chosen.expert)extra.expert_confirmation=chosen.expert;
    return makeOutput({m,engine:cfg.name,version:cfg.version,market:chosen.market,score:chosen.score,dq:c.dq,reasons:[chosen.why],warnings:[...new Set(chosen.warnings||[])],veto:"NONE",bankerFloor:floor,specialist:false,extra});
  }

  function recommend(m){return runPPG(m,"normal");}
  function strictRecommend(m){return runPPG(m,"strict");}
  function ultraRecommend(m){return runPPG(m,"ultra");}
  function eliteRecommend(m){return runPPG(m,"elite");}
  function apexRecommend(m){return runPPG(m,"apex");}
  function primeRecommend(m){return runPPG(m,"prime");}
  function expertRecommend(m){return runPPG(m,"expert");}

  function proRecommend(m){
    const engine="PurePPG Pro",version="8.0";
    const runs=[recommend(m),strictRecommend(m),ultraRecommend(m),eliteRecommend(m),apexRecommend(m),primeRecommend(m),expertRecommend(m)];
    const valid=runs.filter(r=>r.bet); const high=runs.slice(3);
    if(valid.length<5)return noBet(m,engine,version,`Only ${valid.length}/7 generations produced a qualified market; Pro requires 5.`,{dq:avg(runs.map(r=>r.dataQuality))||0,warnings:runs.filter(r=>!r.bet).map(r=>`${r.engine}: ${r.reasons[0]}`),scope:"CONSENSUS"});
    const votes={}; valid.forEach(r=>{const d=marketDirection(r.primary);votes[d]=(votes[d]||0)+1;});
    const [direction,count]=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0]||[];
    if(count<5)return noBet(m,engine,version,"Fewer than five generations agree on one direction.",{dq:avg(runs.map(r=>r.dataQuality))||0,scope:"CONSENSUS"});
    const topAgree=high.filter(r=>r.bet&&marketDirection(r.primary)===direction);
    if(topAgree.length<3)return noBet(m,engine,version,"Fewer than three top-four engines support the direction.",{dq:avg(runs.map(r=>r.dataQuality))||0,scope:"CONSENSUS"});
    if(!runs[4].bet||!runs[6].bet||marketDirection(runs[4].primary)!==marketDirection(runs[6].primary))return noBet(m,engine,version,"Apex and Expert do not supply aligned qualified support.",{dq:avg(runs.map(r=>r.dataQuality))||0,scope:"CONSENSUS"});
    const exact={}; valid.filter(r=>marketDirection(r.primary)===direction).forEach(r=>exact[r.primary]=(exact[r.primary]||0)+1);
    let choices=Object.entries(exact).map(([market,n])=>({market,n})).sort((a,b)=>b.n-a.n||saferRank(a.market)-saferRank(b.market));
    let market=choices[0].market;
    if(direction==="HOME"&&new Set(choices.map(x=>x.market)).size>1&&!topAgree.every(r=>r.primary==="Home Win"))market="Double Chance 1X";
    if(direction==="AWAY"&&new Set(choices.map(x=>x.market)).size>1&&!topAgree.every(r=>r.primary==="Away Win"))market="Double Chance X2";
    if(direction==="UNDER"&&!choices.some(x=>x.market==="Under 3.5 Goals"&&x.n>=5))return noBet(m,engine,version,"Neutral safety family lacks five exact/neutral votes.",{dq:avg(runs.map(r=>r.dataQuality))||0,scope:"CONSENSUS"});
    const weights=[.05,.08,.12,.15,.18,.20,.22];
    const weighted=100*runs.reduce((s,r,i)=>s+(r.bet&&marketDirection(r.primary)===direction?weights[i]:0),0);
    const score=clamp(.40*weighted+.20*(runs[5].confidence||0)+.15*(runs[6].confidence||0)+.15*(runs[4].confidence||0)+.10*(avg(runs.map(r=>r.dataQuality))||0),0,94);
    const floor=/Home Win/.test(market)?90:/Away Win/.test(market)?91:/DNB/.test(market)?88:/Double Chance/.test(market)?86:/Under 3.5/.test(market)?87:86;
    if(score<floor)return noBet(m,engine,version,`Pro Confidence ${round(score,1)} is below the ${floor} market floor.`,{dq:avg(runs.map(r=>r.dataQuality))||0,scope:"CONFIDENCE"});
    return makeOutput({m,engine,version,market,score,dq:avg(runs.map(r=>r.dataQuality))||0,reasons:[`${count}/7 generations support ${direction}; ${topAgree.length}/4 top engines agree.`,`Safest common denominator: ${market}.`],warnings:[],bankerFloor:floor,extra:{generation_outputs:runs.map(r=>({engine:r.engine,market:r.primary,confidence:r.confidence,bet:r.bet}))}});
  }

  // --------------------------------------------------------------------------
  // Specialist helpers
  // --------------------------------------------------------------------------
  function teamSample(m,side){return gamesFor(m,side)||getNum(m,[`${side}Streaks.sample`])||0;}
  function adjustedTrend(raw,sample,league){ if(raw===null||league===null||!sample)return null; return (raw*sample+6*league)/(sample+6); }
  function specialistDQ(samples,missing=0,competition="League"){let d=100;for(const s of samples){if(s<6)d-=25;else if(s<8)d-=10;else if(s<12)d-=4;}d-=missing*7;if(competition==="Cup"||competition==="Playoff")d-=7;if(competition==="Friendly")d=0;return clamp(d,0,100);}
  function candidateSort(cands){return cands.sort((a,b)=>b.score-a.score||saferRank(a.market)-saferRank(b.market));}

  function trendRecommend(m){
    const engine="Trend",version="1.0",comp=competitionType(m),hs=teamSample(m,"home"),as=teamSample(m,"away");
    if(comp==="Friendly")return noBet(m,engine,version,"Friendlies are blocked by the Trend Engine.",{specialist:true});
    const c=[]; const add=(market,ok,agreement,league,recent,sampleQ,why,strict=78)=>{
      if(!ok)return; const edge=(agreement-league)*100; let score=.45*(agreement*100)+.20*recent+.15*(league*100)+.10*sampleQ+.10*Math.min(100,agreement*100+edge);
      if(hs<8||as<8)score-=5;if(["Cup","Playoff"].includes(comp))score-=7;
      if(score>=strict)c.push({market,score,why,dq:specialistDQ([hs,as],0,comp),agreement,league});
    };
    const hScore=1-(m.homeFailedToScoreRate??1), aConcede=1-(m.awayCleanSheetRate??1), lH=leagueRate(m,"Home Team Over 0.5 Goals");
    if(lH!==null){const ha=adjustedTrend(hScore,hs,lH),aa=adjustedTrend(aConcede,as,lH),ag=hmean(ha,aa),rec=(m.homeStreaks&&m.homeStreaks.scored>=4)?90:70;add("Home Team Over 0.5 Goals",hScore>=.80&&aConcede>=.75&&ag>=.78&&lH>=.70&&(m.homeStreaks?.scored||0)>=4,ag,lH,rec,hs>=12?100:85,`Home scoring ${pct(hScore).toFixed(0)}%, away conceding ${pct(aConcede).toFixed(0)}%, agreement ${pct(ag).toFixed(0)}%.`);}
    const aScore=1-(m.awayFailedToScoreRate??1), hConcede=1-(m.homeCleanSheetRate??1), lA=leagueRate(m,"Away Team Over 0.5 Goals");
    if(lA!==null){const ag=hmean(adjustedTrend(aScore,as,lA),adjustedTrend(hConcede,hs,lA));add("Away Team Over 0.5 Goals",aScore>=.75&&hConcede>=.72&&ag>=.80&&lA>=.68&&(m.awayStreaks?.scored||0)>=4,ag,lA,(m.awayStreaks?.scored||0)>=5?90:75,as>=12?100:85,`Away scoring ${pct(aScore).toFixed(0)}%, home conceding ${pct(hConcede).toFixed(0)}%, agreement ${pct(ag).toFixed(0)}%.`);}
    const hO15=rate(m.homeOver15Rate),aO15=rate(m.awayOver15Rate),lO15=leagueRate(m,"Over 1.5 Goals");
    if(hO15!==null&&aO15!==null&&lO15!==null){const ag=hmean(adjustedTrend(hO15,hs,lO15),adjustedTrend(aO15,as,lO15)),rc=Math.min(100,50+5*((m.homeStreaks?.over15||0)+(m.awayStreaks?.over15||0)));add("Over 1.5 Goals",hO15>=.75&&aO15>=.75&&ag>=.77&&lO15>=.70&&((m.homeStreaks?.over15||0)>=5||(m.awayStreaks?.over15||0)>=5),ag,lO15,rc,90,`Both O1.5 split rates pass; harmonic agreement ${pct(ag).toFixed(0)}%.`);}
    const hU35=1-(rate(m.homeOver35Rate)??1),aU35=1-(rate(m.awayOver35Rate)??1),lU35=leagueRate(m,"Under 3.5 Goals");
    if(lU35!==null){const ag=hmean(adjustedTrend(hU35,hs,lU35),adjustedTrend(aU35,as,lU35));add("Under 3.5 Goals",hU35>=.78&&aU35>=.78&&ag>=.80&&lU35>=.72&&(m.homeStreaks?.under35||0)>=4&&(m.awayStreaks?.under35||0)>=4,ag,lU35,90,90,`Both U3.5 split rates pass; harmonic agreement ${pct(ag).toFixed(0)}%.`);}
    const hO25=rate(m.homeOver25Rate),aO25=rate(m.awayOver25Rate),lO25=leagueRate(m,"Over 2.5 Goals");
    if(hO25!==null&&aO25!==null&&lO25!==null){const ag=hmean(adjustedTrend(hO25,hs,lO25),adjustedTrend(aO25,as,lO25));add("Over 2.5 Goals",hO25>=.65&&aO25>=.65&&ag>=.68&&lO25>=.55,ag,lO25,80,90,`O2.5 fixture agreement ${pct(ag).toFixed(0)}% with league ${pct(lO25).toFixed(0)}%.`,82);}
    const hBT=rate(path(m,"homeStreaks.htft.ftBtts")),aBT=rate(path(m,"awayStreaks.htft.ftBtts")),lBT=leagueRate(m,"BTTS Yes");
    if(hBT!==null&&aBT!==null&&lBT!==null){const ag=hmean(hBT,aBT);add("BTTS Yes",hBT>=.60&&aBT>=.60&&ag>=.63&&lBT>=.52&&hScore>=.70&&aScore>=.70&&hConcede>=.65&&aConcede>=.65,ag,lBT,80,90,`BTTS split agreement ${pct(ag).toFixed(0)}%; both scoring and conceding counterparts pass.`,82);}
    const hNL=rate(m.homeUnbeatenRate),aWin=rate(m.awayWinRate),lNL=leagueRate(m,"Home non-loss");
    if(hNL!==null&&aWin!==null&&lNL!==null){const support=hmean(hNL,1-aWin);add("Double Chance 1X",hNL>=.75&&aWin<=.30&&support>=.74&&formRate(m.homeForm,x=>x!=="L")>=.8&&lNL>=.67,support,lNL,90,90,`Home non-loss ${pct(hNL).toFixed(0)}%, away win ${pct(aWin).toFixed(0)}%.`);}
    const aNL=rate(m.awayUnbeatenRate),hWin=rate(m.homeWinRate),lANL=leagueRate(m,"Away non-loss");
    if(aNL!==null&&hWin!==null&&lANL!==null){const support=hmean(aNL,1-hWin);add("Double Chance X2",aNL>=.72&&hWin<=.35&&support>=.72&&formRate(m.awayForm,x=>x!=="L")>=.8,support,lANL,90,90,`Away non-loss ${pct(aNL).toFixed(0)}%, home win ${pct(hWin).toFixed(0)}%.`);}
    if(!c.length)return noBet(m,engine,version,"Insufficient two-sided trend agreement.",{dq:specialistDQ([hs,as],0,comp),specialist:true,veto:"NONE",scope:"NONE"});
    const x=candidateSort(c)[0];return makeOutput({m,engine,version,market:x.market,score:x.score,dq:x.dq,reasons:[x.why],warnings:[],specialist:true,bankerFloor:84,extra:{fixture_agreement:round(x.agreement,3),league_rate:round(x.league,3)}});
  }

  function lengthScore(n){return n>=8?92:n===7?87:n===6?82:n===5?75:n===4?65:n===3?55:Math.max(0,n*12);}
  function streakReliability(active,venue,recurrence,counter,league,repeat=60){return .25*lengthScore(active)+.20*lengthScore(venue)+.20*100*recurrence+.15*100*counter+.10*100*league+.10*repeat;}
  function streakRecommend(m){
    const engine="Streaks",version="1.0",comp=competitionType(m),h=m.homeStreaks||{},a=m.awayStreaks||{},hs=h.sample||0,as=a.sample||0;
    if(comp==="Friendly")return noBet(m,engine,version,"Friendlies are blocked by the Streaks Engine.",{specialist:true});
    const c=[]; const add=(market,ok,rel,why)=>{if(ok&&rel>=78)c.push({market,score:clamp(rel,0,92),why});};
    const lHS=leagueRate(m,"Home Team Over 0.5 Goals")??0,lAS=leagueRate(m,"Away Team Over 0.5 Goals")??0;
    const hScoreRate=1-(m.homeFailedToScoreRate??1),aScoreRate=1-(m.awayFailedToScoreRate??1),hConcede=1-(m.homeCleanSheetRate??1),aConcede=1-(m.awayCleanSheetRate??1);
    let rel=streakReliability(h.scored||0,Math.min(h.scored||0,4),hScoreRate,a.concededEvery?Math.min(1,a.concededEvery/7):aConcede,lHS)-5;
    add("Home Team Over 0.5 Goals",(h.scored||0)>=5&&hScoreRate>=.8&&(a.concededEvery||0)>=4&&aConcede>=.7&&lHS>=.68&&rel>=78,rel,`Home scoring streak ${h.scored||0}; opponent concession streak ${a.concededEvery||0}; reliability ${round(rel,1)}.`);
    rel=streakReliability(a.scored||0,Math.min(a.scored||0,4),aScoreRate,h.concededEvery?Math.min(1,h.concededEvery/7):hConcede,lAS)-5;
    add("Away Team Over 0.5 Goals",(a.scored||0)>=5&&aScoreRate>=.8&&(h.concededEvery||0)>=4&&hConcede>=.7&&lAS>=.68&&rel>=78,rel,`Away scoring streak ${a.scored||0}; opponent concession streak ${h.concededEvery||0}; reliability ${round(rel,1)}.`);
    const lO15=leagueRate(m,"Over 1.5 Goals")??0,hO15=rate(m.homeOver15Rate)??0,aO15=rate(m.awayOver15Rate)??0;
    rel=avg([streakReliability(h.over15||0,Math.min(h.over15||0,4),hO15,aO15,lO15),streakReliability(a.over15||0,Math.min(a.over15||0,4),aO15,hO15,lO15)])-5;
    add("Over 1.5 Goals",(((h.over15||0)>=4&&(a.over15||0)>=4)||((h.over15||0)>=6&&(a.over15||0)>=3)||((a.over15||0)>=6&&(h.over15||0)>=3))&&hO15>=.75&&aO15>=.75&&lO15>=.70&&rel>=80,rel,`O1.5 active runs ${h.over15||0}/${a.over15||0}; reliability ${round(rel,1)}.`);
    const lO25=leagueRate(m,"Over 2.5 Goals")??0,hO25=rate(m.homeOver25Rate)??0,aO25=rate(m.awayOver25Rate)??0;
    rel=avg([streakReliability(h.over25||0,Math.min(h.over25||0,3),hO25,aO25,lO25),streakReliability(a.over25||0,Math.min(a.over25||0,3),aO25,hO25,lO25)])-5;
    add("Over 2.5 Goals",(h.over25||0)>=3&&(a.over25||0)>=3&&hO25>=.60&&aO25>=.60&&lO25>=.53&&rel>=84,rel,`O2.5 active runs ${h.over25||0}/${a.over25||0}; reliability ${round(rel,1)}.`);
    const lU35=leagueRate(m,"Under 3.5 Goals")??0,hU35=1-(rate(m.homeOver35Rate)??1),aU35=1-(rate(m.awayOver35Rate)??1);
    rel=avg([streakReliability(h.under35||0,Math.min(h.under35||0,5),hU35,aU35,lU35),streakReliability(a.under35||0,Math.min(a.under35||0,5),aU35,hU35,lU35)])-5;
    add("Under 3.5 Goals",(h.under35||0)>=5&&(a.under35||0)>=5&&hU35>=.80&&aU35>=.80&&lU35>=.70&&rel>=80,rel,`U3.5 active runs ${h.under35||0}/${a.under35||0}; reliability ${round(rel,1)}.`);
    const ppg=recommend(m); const homeConfirm=ppg.bet&&marketDirection(ppg.primary)==="HOME",awayConfirm=ppg.bet&&marketDirection(ppg.primary)==="AWAY";
    const hNL=rate(m.homeUnbeatenRate)??0,aNL=rate(m.awayUnbeatenRate)??0;
    rel=streakReliability(h.noLoss||0,Math.min(h.noLoss||0,4),hNL,Math.min(1,(a.noWin||0)/6),leagueRate(m,"Home non-loss")??.67)-5;
    add("Double Chance 1X",(h.noLoss||0)>=6&&(a.noWin||0)>=4&&hNL>=.8&&rel>=80,rel,`Home unbeaten ${h.noLoss||0}; away winless ${a.noWin||0}; reliability ${round(rel,1)}.`);
    rel=streakReliability(a.noLoss||0,Math.min(a.noLoss||0,4),aNL,Math.min(1,(h.noWin||0)/6),leagueRate(m,"Away non-loss")??.66)-5;
    add("Double Chance X2",(a.noLoss||0)>=6&&(h.noWin||0)>=4&&aNL>=.8&&rel>=82,rel,`Away unbeaten ${a.noLoss||0}; home winless ${h.noWin||0}; reliability ${round(rel,1)}.`);
    if(homeConfirm){rel=streakReliability(h.win||0,Math.min(h.win||0,3),rate(m.homeWinRate)??0,Math.min(1,(a.loss||0)/5),leagueRate(m,"Home Win")??.4)-5;add("Home Win",(h.win||0)>=4&&(a.loss||0)>=3&&(m.homeWinRate??0)>=.7&&rel>=87,rel,`Win/loss counter-streak confirmed by PurePPG; reliability ${round(rel,1)}.`);}
    if(awayConfirm){rel=streakReliability(a.win||0,Math.min(a.win||0,3),rate(m.awayWinRate)??0,Math.min(1,(h.loss||0)/5),leagueRate(m,"Away Win")??.3)-5;add("Away Win",(a.win||0)>=4&&(h.loss||0)>=3&&(m.awayWinRate??0)>=.7&&rel>=87,rel,`Win/loss counter-streak confirmed by PurePPG; reliability ${round(rel,1)}.`);}
    if(!c.length)return noBet(m,engine,version,"Streaks are not sufficiently supported by recurrence, opponent and league context.",{dq:specialistDQ([hs,as],0,comp),specialist:true,veto:"NONE",scope:"NONE"});
    const x=candidateSort(c)[0];return makeOutput({m,engine,version,market:x.market,score:x.score,dq:specialistDQ([hs,as],1,comp),reasons:[x.why],warnings:["Venue-specific streak length is unavailable; a five-point reliability penalty was applied."],specialist:true,bankerFloor:84});
  }

  function boundedGap(diff,scale){return clamp(diff/scale*25,-50,50);}
  function profileMetric(m,side,key){return getNum(m,[`${side}Profile.${key}.v`,`${side}Profile.${key}`,`${side}${key[0].toUpperCase()+key.slice(1)}`]);}
  function mismatchCore(m){
    const hg=gamesFor(m,"home")||1,ag=gamesFor(m,"away")||1; const dims=[];
    const hppg=venuePPG(m,"home"),appg=venuePPG(m,"away"); if(hppg!==null&&appg!==null)dims.push({name:"PPG",gap:boundedGap(hppg-appg,1.2),w:.20});
    if(num(m.homeGD)!==null&&num(m.awayGD)!==null)dims.push({name:"Goal difference",gap:boundedGap(m.homeGD/hg-m.awayGD/ag,2),w:.18});
    const hxgf=profileMetric(m,"home","xgFor"),hxga=profileMetric(m,"home","xgAg"),axgf=profileMetric(m,"away","xgFor"),axga=profileMetric(m,"away","xgAg");
    if([hxgf,hxga,axgf,axga].every(v=>v!==null))dims.push({name:"xG quality",gap:boundedGap((hxgf-hxga)-(axgf-axga),1.5),w:.18});
    const hsot=profileMetric(m,"home","sotFor"),hsota=profileMetric(m,"home","sotAg"),asot=profileMetric(m,"away","sotFor"),asota=profileMetric(m,"away","sotAg");
    if([hsot,hsota,asot,asota].every(v=>v!==null))dims.push({name:"SOT",gap:boundedGap((hsot-hsota)-(asot-asota),4),w:.14});
    const hf=formPPG(m.homeForm,5),af=formPPG(m.awayForm,5); if(hf!==null&&af!==null)dims.push({name:"Recent form",gap:boundedGap(hf-af,1.5),w:.14});
    const hAtt=avg([m.homeScoredAtHome,m.awayConcededAway]),aAtt=avg([m.awayScoredAway,m.homeConcededAtHome]); if(hAtt!==null&&aAtt!==null)dims.push({name:"Attack-defense",gap:boundedGap(hAtt-aAtt,1.5),w:.16});
    const ws=dims.reduce((s,d)=>s+d.w,0)||1,weighted=dims.reduce((s,d)=>s+d.gap*d.w,0)/ws;
    return {dims,weighted,index:50+weighted,dms:Math.abs(weighted)*2,dir:weighted>=0?"HOME":"AWAY",breadth:dims.filter(d=>Math.sign(d.gap)===Math.sign(weighted)&&Math.abs(d.gap)>=10).length,hAtt,aAtt};
  }
  function mismatchRecommend(m){
    const engine="Mismatch",version="1.0",core=mismatchCore(m),comp=competitionType(m);
    if(comp==="Friendly")return noBet(m,engine,version,"Friendlies are blocked by the Mismatch Engine.",{specialist:true});
    if(core.dims.length<5)return noBet(m,engine,version,`Only ${core.dims.length}/6 independent mismatch dimensions are available; five are required.`,{dq:55,specialist:true,scope:"DATA"});
    const dq=clamp(72+5*core.dims.length-(core.dims.some(d=>d.name==="SOT")?0:4),0,100),side=core.dir==="HOME"?"home":"away",opp=side==="home"?"away":"home";
    const scoreBase=.50*core.dms+.15*(core.breadth/6*100)+.15*clamp(50+Math.abs(core.hAtt-core.aAtt)*20,0,100)+.10*dq+.10*80;
    const c=[]; const add=(market,ok,min,why)=>{const s=clamp(scoreBase+(saferRank(market)<=2?2:0),0,92);if(ok&&s>=min)c.push({market,score:s,why});};
    const attack=side==="home"?core.hAtt:core.aAtt, oppDef=side==="home"?m.awayConcededAway:m.homeConcededAtHome;
    const recentGap=core.dims.find(d=>d.name==="Recent form")?.gap||0;
    if(side==="home"){
      add("Home Win",core.dms>=78&&core.breadth>=5&&recentGap>=0&&dq>=82,85,`Home leads ${core.breadth}/${core.dims.length} dimensions; DMS ${round(core.dms,1)}.`);
      add("Home DNB",core.dms>=68&&core.breadth>=4&&dq>=76,81,`Broad home mismatch (${core.breadth}/${core.dims.length}); DMS ${round(core.dms,1)}.`);
      add("Double Chance 1X",core.dms>=60&&core.breadth>=4,78,`Home venue direction passes four-dimensional breadth.`);
      add("Home Team Over 0.5 Goals",attack>=1.2&&oppDef>=1.2&&core.dms>=64&&(1-(m.homeFailedToScoreRate??1))>=.7&&(1-(m.awayCleanSheetRate??1))>=.7,80,`Home attack-opponent defense fit is positive with DMS ${round(core.dms,1)}.`);
      add("Away Team Under 1.5 Goals",core.dms>=72&&(m.awayFailedToScoreRate??0)>=.28&&(1-(m.homeCleanSheetRate??0))<=.7,82,`Away attack is suppressed by the broad home mismatch.`);
    } else {
      add("Away Win",core.dms>=82&&core.breadth>=5&&recentGap<=0&&dq>=85,86,`Away leads ${core.breadth}/${core.dims.length} dimensions; DMS ${round(core.dms,1)}.`);
      add("Away DNB",core.dms>=72&&core.breadth>=4&&dq>=76,82,`Broad away mismatch (${core.breadth}/${core.dims.length}); DMS ${round(core.dms,1)}.`);
      add("Double Chance X2",core.dms>=64&&core.breadth>=4,79,`Away venue direction passes four-dimensional breadth.`);
      add("Away Team Over 0.5 Goals",attack>=1.2&&oppDef>=1.2&&core.dms>=64&&(1-(m.awayFailedToScoreRate??1))>=.7&&(1-(m.homeCleanSheetRate??1))>=.7,80,`Away attack-opponent defense fit is positive with DMS ${round(core.dms,1)}.`);
      add("Home Team Under 1.5 Goals",core.dms>=72&&(m.homeFailedToScoreRate??0)>=.28,82,`Home attack is suppressed by the broad away mismatch.`);
    }
    const lu=leagueRate(m,"Under 3.5 Goals")??0;if(core.dms>=70&&Math.min(core.hAtt,core.aAtt)<=1.05&&lu>=.68)add("Under 3.5 Goals",true,80,`DMS ${round(core.dms,1)} plus weak-side attack and league U3.5 ${pct(lu).toFixed(0)}%.`);
    if(!c.length)return noBet(m,engine,version,"Mismatch exists but is not broad enough for a supported market.",{dq,specialist:true,veto:"SOFT",scope:"AGGRESSIVE_RESULT",warnings:[`Dimension gaps: ${core.dims.map(d=>`${d.name} ${round(d.gap,1)}`).join(", ")}`]});
    const x=candidateSort(c)[0];return makeOutput({m,engine,version,market:x.market,score:x.score,dq,reasons:[x.why],warnings:[`Dimension gaps: ${core.dims.map(d=>`${d.name} ${round(d.gap,1)}`).join(", ")}`],specialist:true,bankerFloor:84,extra:{mismatch_index:round(core.index,1),dms:round(core.dms,1),breadth:core.breadth,dimensions:core.dims}});
  }

  function halvesRecommend(m){
    const engine="Halves",version="1.0",comp=competitionType(m),h=path(m,"homeStreaks.htft"),a=path(m,"awayStreaks.htft");
    if(comp==="Friendly")return noBet(m,engine,version,"Friendlies are blocked by the Halves Engine.",{specialist:true});
    if(!h||!a)return noBet(m,engine,version,"Direct half-specific data is missing.",{dq:0,specialist:true,scope:"HALF_MARKETS"});
    const hs=h.samples||h.sample||0,as=a.samples||a.sample||0;if(Math.min(hs,as)<8)return noBet(m,engine,version,"Fewer than eight relevant half-data matches.",{dq:specialistDQ([hs,as],0,comp),specialist:true,scope:"HALF_MARKETS"});
    const dq=specialistDQ([hs,as],0,comp),c=[];const add=(market,ok,agreement,league,stability,min,why)=>{if(!ok)return;const score=.40*agreement*100+.20*80+.15*league*100+.15*stability+.10*dq;if(score>=min)c.push({market,score,why});};
    const lFH=leagueRate(m,"First Half Over 0.5")??0,hFH=rate(h.fhOver05),aFH=rate(a.fhOver05);if(hFH!==null&&aFH!==null){const ag=hmean(hFH,aFH),stab=85;add("First Half Over 0.5",hFH>=.68&&aFH>=.68&&ag>=.70&&lFH>=.62&&Math.max(h.fhFor||0,a.fhFor||0)>=.45&&Math.max(h.fhAg||0,a.fhAg||0)>=.45,ag,lFH,stab,81,`1H O0.5 agreement ${pct(ag).toFixed(0)}%; league ${pct(lFH).toFixed(0)}%.`);}
    const lFU=leagueRate(m,"First Half Under 1.5")??0,hFU=rate(h.fhUnder15),aFU=rate(a.fhUnder15);if(hFU!==null&&aFU!==null){const ag=hmean(hFU,aFU),gavg=avg([(h.fhFor||0)+(h.fhAg||0),(a.fhFor||0)+(a.fhAg||0)]);add("First Half Under 1.5",hFU>=.76&&aFU>=.76&&ag>=.78&&lFU>=.70&&gavg<=1.25,ag,lFU,85,80,`1H U1.5 agreement ${pct(ag).toFixed(0)}%; combined half average ${round(gavg)}.`);}
    const hAH=rate(h.wonEitherHalf),aLoss=rate(a.collapseRate),aAH=rate(a.wonEitherHalf),hLoss=rate(h.collapseRate);
    if(hAH!==null&&aLoss!==null){const ag=hmean(hAH,aLoss);add("Home Win Either Half",hAH>=.72&&aLoss>=.62&&ag>=.68,ag,.65,82,82,`Home any-half win ${pct(hAH).toFixed(0)}%; away any-half loss proxy ${pct(aLoss).toFixed(0)}%.`);}
    if(aAH!==null&&hLoss!==null){const ag=hmean(aAH,hLoss);add("Away Win Either Half",aAH>=.74&&hLoss>=.64&&ag>=.70,ag,.65,82,83,`Away any-half win ${pct(aAH).toFixed(0)}%; home any-half loss proxy ${pct(hLoss).toFixed(0)}%.`);}
    const lSH=leagueRate(m,"Second Half Over 0.5")??0;const hSH=clamp(Math.max(h.shFor||0,h.shAg||0),0,1),aSH=clamp(Math.max(a.shFor||0,a.shAg||0),0,1);if(hSH&&aSH){const ag=hmean(hSH,aSH);add("Second Half Over 0.5",hSH>=.76&&aSH>=.76&&ag>=.78&&lSH>=.70,ag,lSH,82,80,`2H O0.5 counterpart agreement ${pct(ag).toFixed(0)}%.`);}
    const hDraw=rate(h.drawHTorFT),aDraw=rate(a.drawHTorFT),lDraw=leagueRate(m,"Draw at Either Half")??.65;if(hDraw!==null&&aDraw!==null){const ag=hmean(hDraw,aDraw);add("Draw at Either Half",hDraw>=.72&&aDraw>=.72&&ag>=.72&&lDraw>=.65,ag,lDraw,85,82,`Direct draw-at-either-half agreement ${pct(ag).toFixed(0)}%.`);}
    if(!c.length)return noBet(m,engine,version,"Half-specific evidence is insufficient for an official selection.",{dq,specialist:true,veto:"NONE",scope:"HALF_MARKETS"});
    const x=candidateSort(c)[0];return makeOutput({m,engine,version,market:x.market,score:x.score,dq,reasons:[x.why],warnings:["Recent-ten venue half splits are not separately supplied; no aggressive 2H O1.5 or draw-both-halves market was evaluated."],specialist:true,bankerFloor:84});
  }

  function biasStability(m,market,base){
    const pats=path(m,"leagueTrends.tierPatterns")||{},vals=[];
    const key=market.replace(" Goals","");
    Object.values(pats).forEach(p=>{if(p&&p.rates&&num(p.rates[key])!==null&&p.n>=5)vals.push(rate(p.rates[key]));});
    if(!vals.length)return null;return clamp(100-avg(vals.map(v=>Math.abs(v-base)*100)),0,100);
  }
  function leagueBiasRecommend(m){
    const engine="League Bias",version="1.0",sample=leagueSample(m)||0,comp=competitionType(m);
    if(sample<50)return noBet(m,engine,version,"League sample below 50.",{dq:40,specialist:true,scope:"LEAGUE_BASELINE"});
    if(comp==="Friendly")return noBet(m,engine,version,"Friendlies are blocked by the League Bias Engine.",{specialist:true});
    const dq=clamp(75+(sample>=80?10:0),0,100),c=[];const add=(market,league,fit,team1,team2,minLeague,minFit,minStab,minScore,why)=>{if(league===null||fit===null)return;const stab=biasStability(m,market,league)??72;const exc=0;let score=.30*league*100+.20*stab+.25*fit*100+.10*80+.10*(100-exc*100)+.05*dq;if(sample<80)score-=5;if(league>=minLeague&&stab>=minStab&&team1&&team2&&fit>=minFit&&score>=minScore)c.push({market,score,why:`${why}; league ${pct(league).toFixed(0)}%, stability ${round(stab,1)}, fit ${pct(fit).toFixed(0)}%.`,stab,fit,league});};
    const hO15=rate(m.homeOver15Rate),aO15=rate(m.awayOver15Rate),lO15=leagueRate(m,"Over 1.5 Goals");if(hO15!==null&&aO15!==null)add("Over 1.5 Goals",lO15,hmean(hO15,aO15),hO15>=.75,aO15>=.75,.72,.77,.78,80,"Both teams fit the league O1.5 bias");
    const hU35=1-(rate(m.homeOver35Rate)??1),aU35=1-(rate(m.awayOver35Rate)??1),lU35=leagueRate(m,"Under 3.5 Goals");add("Under 3.5 Goals",lU35,hmean(hU35,aU35),hU35>=.78,aU35>=.78,.75,.80,.80,80,"Both teams fit the league U3.5 bias");
    const hScore=1-(m.homeFailedToScoreRate??1),aCon=1-(m.awayCleanSheetRate??1),lH=leagueRate(m,"Home Team Over 0.5 Goals");add("Home Team Over 0.5 Goals",lH,hmean(hScore,aCon),hScore>=.80,aCon>=.75,.75,.78,.78,80,"Home scoring and away conceding fit the league bias");
    const aScore=1-(m.awayFailedToScoreRate??1),hCon=1-(m.homeCleanSheetRate??1),lA=leagueRate(m,"Away Team Over 0.5 Goals");add("Away Team Over 0.5 Goals",lA,hmean(aScore,hCon),aScore>=.75,hCon>=.72,.68,.75,.78,81,"Away scoring and home conceding fit the league bias");
    const hNL=rate(m.homeUnbeatenRate),aWin=rate(m.awayWinRate),lNL=leagueRate(m,"Home non-loss");if(hNL!==null&&aWin!==null)add("Double Chance 1X",lNL,hmean(hNL,1-aWin),hNL>=.75,aWin<=.30,.72,.74,.78,81,"Home non-loss structure fits the league");
    const aNL=rate(m.awayUnbeatenRate),hWin=rate(m.homeWinRate),lANL=leagueRate(m,"Away non-loss");if(aNL!==null&&hWin!==null)add("Double Chance X2",lANL,hmean(aNL,1-hWin),aNL>=.75,hWin<=.30,.66,.74,.78,81,"Away non-loss structure fits the league");
    if(!c.length)return noBet(m,engine,version,"No fixture passes both the league bias and two-team candidate filter.",{dq,specialist:true,veto:"NONE",scope:"NONE"});
    const x=candidateSort(c)[0];return makeOutput({m,engine,version,market:x.market,score:x.score,dq,reasons:[x.why],warnings:[sample<80?"League status is provisional (50–79 current fixtures).":"Stability uses available tier-pattern dispersion because rolling round blocks are not supplied."],specialist:true,bankerFloor:84,extra:{league_rate:round(x.league,3),stability:round(x.stab,1),fixture_fit:round(x.fit,3)}});
  }

  function momentumRecommend(m){
    const engine="Momentum",version="1.0",comp=competitionType(m);
    if(comp==="Friendly")return noBet(m,engine,version,"Friendlies are blocked by the Momentum Engine.",{specialist:true});
    const H=path(m,"momentum.home")||path(m,"rolling.home"),A=path(m,"momentum.away")||path(m,"rolling.away");
    if(!H||!A)return noBet(m,engine,version,"Eight-match chronological rolling momentum inputs are missing.",{dq:0,specialist:true,scope:"DATA",warnings:["Provide momentum.home/away with last3, last5, last8, previous5 and component slopes."]});
    const components=["ppgSlope","gdSlope","qualitySlope","scoringSlope","defensiveSlope","opponentConsistency"];
    if(components.some(k=>num(H[k])===null||num(A[k])===null))return noBet(m,engine,version,"One or more mandatory momentum component slopes are missing.",{dq:55,specialist:true,scope:"DATA"});
    const scoreSide=x=>.30*x.ppgSlope+.20*x.gdSlope+.20*x.qualitySlope+.10*x.scoringSlope+.10*x.defensiveSlope+.10*x.opponentConsistency;
    const hs=clamp(scoreSide(H),-100,100),as=clamp(scoreSide(A),-100,100),edge=hs-as,dir=edge>=0?"HOME":"AWAY",sel=dir==="HOME"?H:A,opp=dir==="HOME"?A:H;
    const baseH=venuePPG(m,"home")??overallPPG(m,"home"),baseA=venuePPG(m,"away")??overallPPG(m,"away");const baseOK=dir==="HOME"?baseH+0.2>=baseA:baseA+0.2>=baseH;
    const agree=components.filter(k=>dir==="HOME"?H[k]>A[k]:A[k]>H[k]).length,dq=90;
    const abs=Math.abs(edge),baseScore=.40*clamp(abs,0,100)+.20*(agree/6*100)+.15*(baseOK?100:0)+.10*80+.10*dq+.05*70;
    let market=null,min=0;
    if(abs>=55&&sel.last5PPG>=2&&opp.last5PPG<=.8&&baseOK&&agree>=5&&!sel.reversal){market=dir==="HOME"?"Home Win":"Away Win";min=87;}
    else if(abs>=40&&sel.last5PPG>=1.6&&opp.last5PPG<=1.1&&agree>=5&&baseOK){market=dir==="HOME"?"Home DNB":"Away DNB";min=82;}
    else if(abs>=(dir==="HOME"?25:30)&&sel.last5PPG>=1.4&&opp.last5PPG<=1.2&&agree>=4&&baseOK){market=dir==="HOME"?"Double Chance 1X":"Double Chance X2";min=dir==="HOME"?78:79;}
    if(!market||baseScore<min)return noBet(m,engine,version,"Momentum does not clear a supported market with the base-strength gate.",{dq,specialist:true,veto:"NONE",scope:"NONE",extra:{home_momentum:hs,away_momentum:as,edge}});
    return makeOutput({m,engine,version,market,score:baseScore,dq,reasons:[`${dir} Momentum Edge ${round(abs,1)} with ${agree}/6 components aligned and base strength confirmed.`],warnings:sel.regression?["Regression warning: aggressive result blocked."]:[],specialist:true,bankerFloor:84,extra:{home_momentum:hs,away_momentum:as,edge,component_agreement:agree}});
  }

  function normalized1X2(o){const h=1/o.home,d=1/o.draw,a=1/o.away,s=h+d+a;return{home:h/s,draw:d/s,away:a/s,overround:s};}
  function oddsIntelligenceRecommend(m){
    const engine="Odds Intelligence",version="1.0";
    const books=path(m,"oddsBooks")||path(m,"bookmakers")||[];
    if(!Array.isArray(books)||books.length<4)return noBet(m,engine,version,`Only ${Array.isArray(books)?books.length:0} independent bookmaker snapshots are available; four are required.`,{dq:0,specialist:true,scope:"ODDS_DATA",warnings:["Aggregated one-book odds are not sufficient for Odds Intelligence."]});
    const rows=[];for(const b of books){const cur=b.current||b.odds,open=b.opening||b.open;if(!cur||!open||![cur.home,cur.draw,cur.away,open.home,open.draw,open.away].every(x=>num(x)!==null))continue;if(!b.timestamp&&!b.currentTimestamp)return noBet(m,engine,version,"Odds timestamps are missing.",{specialist:true,scope:"ODDS_DATA"});const C=normalized1X2(cur),O=normalized1X2(open);rows.push({C,O,b});}
    if(rows.length<4)return noBet(m,engine,version,"Fewer than four valid timestamped 1X2 books remain.",{specialist:true,scope:"ODDS_DATA"});
    const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)]; const cand=m.statisticalCandidate || (proConsensusRecommend._statisticalCandidate?proConsensusRecommend._statisticalCandidate(m):null);
    if(!cand)return noBet(m,engine,version,"Odds Intelligence requires an already-qualified statistical candidate.",{dq:75,specialist:true,veto:"NONE",scope:"NONE"});
    const dir=marketDirection(cand.primary||cand),key=dir==="HOME"?"home":dir==="AWAY"?"away":null;if(!key)return noBet(m,engine,version,"Candidate is not a supported result direction for the available 1X2 books.",{dq:75,specialist:true,scope:"ODDS_DATA"});
    const current=median(rows.map(r=>r.C[key])),opening=median(rows.map(r=>r.O[key])),move=(current-opening)*100,disp=(Math.max(...rows.map(r=>r.C[key]))-Math.min(...rows.map(r=>r.C[key])))*100,breadth=rows.filter(r=>r.C[key]-r.O[key]>=.015).length/rows.length;
    if(disp>8)return noBet(m,engine,version,"Market consensus split exceeds eight probability points.",{dq:60,specialist:true,scope:"EXACT_PRICE"});
    const consistency=first(path(m,"oddsCrossMarketPoints"),3);let score=.25*(100-disp*8)+.25*(consistency/5*100)+.20*(breadth*100)+.15*80+.15*90;
    const adverse=move<=-5;if(adverse&&consistency<=1)return noBet(m,engine,version,"Five-point adverse move with cross-market contradiction.",{dq:80,specialist:true,scope:"DIRECTION"});
    const market=cand.primary||cand;if(score<78)return noBet(m,engine,version,"Odds structure does not reach the support threshold.",{dq:80,specialist:true,veto:move<=-3?"SOFT":"NONE",scope:"AGGRESSIVE_MARKET",extra:{opening, current, movement:move, dispersion:disp}});
    return makeOutput({m,engine,version,market,score,dq:90,reasons:[`Fair probability moved ${round(move,1)} points; ${Math.round(breadth*100)}% of books aligned; dispersion ${round(disp,1)} points.`],warnings:move<=-3?["Adverse price drift: straight win should be downgraded."]:[],veto:move<=-3?"SOFT":"NONE",vetoScope:move<=-3?"STRAIGHT_WIN":"NONE",safer:move<=-3?[dir==="HOME"?"Home DNB":"Away DNB",dir==="HOME"?"Double Chance 1X":"Double Chance X2"]:[],specialist:true,bankerFloor:84,extra:{opening_fair_probability:opening,current_fair_probability:current,movement:move,dispersion:disp,breadth}});
  }

  const ODDS_KEYS={"Home Win":"home","Away Win":"away","Over 1.5 Goals":"over15","Over 2.5 Goals":"over25","Under 2.5 Goals":"under25","Under 3.5 Goals":"under35","BTTS Yes":"bttsYes","BTTS No":"bttsNo","Double Chance 1X":"dc1x","Double Chance X2":"dcx2"};
  function valueRecommend(m){
    const engine="Value",version="1.0",models=path(m,"modelProbabilities")||path(m,"calibratedMarkets")||{},c=[];
    for(const [market,model] of Object.entries(models)){
      const sample=first(model.sample,model.n),lower=first(model.lower,model.lowerBound),mid=first(model.mid,model.probability),upper=first(model.upper,model.upperBound);if(sample===null||lower===null||mid===null||upper===null||sample<300)continue;
      const key=ODDS_KEYS[market],odds=key&&m.odds?num(m.odds[key]):num(model.odds);if(!odds||odds<1.15||odds>3)continue;
      let fair=first(model.fairMarketProbability,model.fair);if(fair===null)fair=1/odds;const edge=lower-fair,cev=lower*odds-1,ev=mid*odds-1,width=upper-lower;
      const fam=marketFamily(market);const req=fam==="HOME_RESULT"?(market.includes("Win")?.04:.03):fam==="AWAY_RESULT"?(market.includes("Win")?.05:.03):["MATCH_OVER","MATCH_UNDER","BTTS_YES","BTTS_NO"].includes(fam)?(/2.5|BTTS/.test(market)?.05:.04):.04;const evReq=req>=.05?.04:req>=.04?.03:.02;
      if(edge<req||cev<evReq||width>.18)continue;
      let score=.30*clamp(edge/.12*100,0,100)+.20*clamp(cev/.18*100,0,100)+.20*(sample>=1500?100:sample>=750?88:75)+.10*clamp((.18-width)/.18*100,0,100)+.10*85+.10*80;if(sample<750)score-=6;
      if(score>=78)c.push({market,score,edge,cev,ev,width,odds,sample,lower,mid,upper,fair});
    }
    if(!c.length)return noBet(m,engine,version,"No market has at least 300 calibrated selections and positive conservative value.",{dq:0,specialist:true,scope:"VALUE_LABEL",warnings:["Raw confidence scores and oddsCalib price-band samples are not treated as calibrated model probabilities."]});
    const x=candidateSort(c)[0];return makeOutput({m,engine,version,market:x.market,score:x.score,dq:x.sample>=750?90:78,reasons:[`Conservative probability ${pct(x.lower).toFixed(1)}% vs fair market ${pct(x.fair).toFixed(1)}%; edge ${pct(x.edge).toFixed(1)} points; conservative EV ${pct(x.cev).toFixed(1)}%.`],warnings:x.sample<750?["Calibration is provisional (300–749 selections)."]:[],specialist:true,bankerFloor:88,extra:{model_midpoint:x.mid,interval:[x.lower,x.upper],fair_market_probability:x.fair,probability_edge:x.edge,ev:x.ev,conservative_ev:x.cev,calibration_sample:x.sample,odds:x.odds}});
  }

  // Statistical candidate helper for Odds Intelligence (avoids recursive consensus).
  function baseStatisticalCandidate(m){
    const outs=[proRecommend(m),mismatchRecommend(m),trendRecommend(m),streakRecommend(m),halvesRecommend(m),leagueBiasRecommend(m),momentumRecommend(m)].filter(r=>r.bet);
    return outs.sort((a,b)=>b.confidence-a.confidence)[0]||null;
  }
  proConsensusRecommend._statisticalCandidate=baseStatisticalCandidate;

  function proConsensusRecommend(m){
    const engine="Pro Consensus Integration",version="1.0";
    const outputs=[proRecommend(m),trendRecommend(m),streakRecommend(m),mismatchRecommend(m),halvesRecommend(m),leagueBiasRecommend(m),momentumRecommend(m)];
    const candidate=outputs.filter(r=>r.bet).sort((a,b)=>b.confidence-a.confidence)[0]||null;
    let odds=noBet(m,"Odds Intelligence","1.0","No statistical candidate.",{specialist:true}),value=noBet(m,"Value","1.0","No statistical candidate.",{specialist:true});
    if(candidate){m.statisticalCandidate=candidate;odds=oddsIntelligenceRecommend(m);value=valueRecommend(m);delete m.statisticalCandidate;}
    outputs.push(odds,value);
    const hard=outputs.filter(r=>r.veto==="HARD"&&r.veto_scope==="FIXTURE");if(hard.length)return noBet(m,engine,version,"Fixture-level hard veto from a component engine.",{dq:avg(outputs.map(r=>r.dataQuality))||0,scope:"CONSENSUS"});
    const exact={};outputs.filter(r=>r.bet&&r.dataQuality>=72).forEach(r=>{exact[r.primary]=exact[r.primary]||[];exact[r.primary].push(r);});
    const weights={"PurePPG Pro":1.2,"Mismatch":1.1,"Trend":1,"Halves":1,"League Bias":.9,"Streaks":.85,"Momentum":.85,"Odds Intelligence":1,"Value":1.15};
    const cands=Object.entries(exact).map(([market,rs])=>({market,rs,support:rs.reduce((s,r)=>s+(weights[r.engine]||1)*((r.confidence-70)/22),0)})).filter(x=>x.rs.length>=3&&x.support>=2.2);
    if(!cands.length)return noBet(m,engine,version,"Consensus requirements not met: no exact market has three qualified engines and 2.20 support.",{dq:avg(outputs.map(r=>r.dataQuality))||0,warnings:outputs.filter(r=>!r.bet).map(r=>`${r.engine}: ${r.reasons[0]}`),scope:"CONSENSUS"});
    cands.sort((a,b)=>b.support-a.support||saferRank(a.market)-saferRank(b.market));const x=cands[0];
    const domain=/Half/.test(x.market)?x.rs.some(r=>r.engine==="Halves"):true;if(!domain)return noBet(m,engine,version,"Required domain owner did not approve the market.",{dq:avg(outputs.map(r=>r.dataQuality))||0,scope:"DOMAIN"});
    const avgDQ=avg(x.rs.map(r=>r.dataQuality)),avgScore=avg(x.rs.map(r=>r.confidence));const exactAgreement=clamp(x.rs.length/5*100,0,100),domainStrength=Math.max(...x.rs.map(r=>r.confidence));const valueOdds=(x.rs.some(r=>r.engine==="Value")?100:50)+(x.rs.some(r=>r.engine==="Odds Intelligence")?20:0);const score=clamp(.45*clamp(x.support/4*100,0,100)+.20*avgDQ+.15*exactAgreement+.10*domainStrength+.10*clamp(valueOdds,0,100),0,92);
    if(score<82||avgDQ<78)return noBet(m,engine,version,`Pro Score ${round(score,1)} or average data quality ${round(avgDQ,1)} is below the official floor.`,{dq:avgDQ,scope:"CONSENSUS"});
    return makeOutput({m,engine,version,market:x.market,score,dq:avgDQ,reasons:[`${x.rs.length} engines support the exact market with combined support ${round(x.support,2)}.`,`Supporters: ${x.rs.map(r=>r.engine).join(", ")}.`],warnings:outputs.flatMap(r=>r.warnings||[]).slice(0,6),specialist:true,bankerFloor:88,extra:{consensus_type:"EXACT_MARKET",exact_supporters:x.rs.map(r=>r.engine),combined_support:x.support,component_outputs:outputs.map(r=>({engine:r.engine,market:r.primary,status:r.final_status,veto:r.veto}))}});
  }

  // --------------------------------------------------------------------------
  // Settlement and compatibility
  // --------------------------------------------------------------------------
  function settle(primary,homeGoals,awayGoals,status,m){
    primary=String(primary??"")
      .replace(/^((?:Over|Under) \d(?:\.\d)?) Goals$/,"$1")
      .replace("Home Draw No Bet","Home DNB").replace("Away Draw No Bet","Away DNB")
      .replace("First Half Over 0.5","Over 0.5 Goals HT").replace("First Half Under 1.5","Under 1.5 Goals HT");
    if(homeGoals==null||awayGoals==null)return"";
    if(status!=null&&!['FT','AET','PEN','AWD','WO'].includes(String(status)))return"";
    const h=+homeGoals,a=+awayGoals,total=h+a,draw=h===a,HW=h>a,AW=a>h,btts=h>0&&a>0;
    const HT=m&&m.htHome!=null&&m.htAway!=null?{h:+m.htHome,a:+m.htAway}:null;
    const SH=HT?{h:h-HT.h,a:a-HT.a}:null;
    switch(primary){
      case"Home Win":return HW?"Won":"Lost";case"Away Win":return AW?"Won":"Lost";case"Home DNB":return draw?"Void":HW?"Won":"Lost";case"Away DNB":return draw?"Void":AW?"Won":"Lost";
      case"Double Chance 1X":return HW||draw?"Won":"Lost";case"Double Chance X2":return AW||draw?"Won":"Lost";case"Double Chance 12":return !draw?"Won":"Lost";
      case"Over 1.5":return total>=2?"Won":"Lost";case"Over 2.5":return total>=3?"Won":"Lost";case"Over 3.5":return total>=4?"Won":"Lost";case"Under 2.5":return total<=2?"Won":"Lost";case"Under 3.5":return total<=3?"Won":"Lost";case"Under 4.5":return total<=4?"Won":"Lost";
      case"BTTS Yes":return btts?"Won":"Lost";case"BTTS No":return !btts?"Won":"Lost";
      case"Home Team Over 0.5 Goals":return h>=1?"Won":"Lost";case"Away Team Over 0.5 Goals":return a>=1?"Won":"Lost";case"Home Team Over 1.5 Goals":return h>=2?"Won":"Lost";case"Away Team Over 1.5 Goals":return a>=2?"Won":"Lost";case"Home Team Under 1.5 Goals":return h<=1?"Won":"Lost";case"Away Team Under 1.5 Goals":return a<=1?"Won":"Lost";
      case"HT Draw":return HT?(HT.h===HT.a?"Won":"Lost"):"";case"Over 0.5 Goals HT":return HT?(HT.h+HT.a>=1?"Won":"Lost"):"";case"Under 1.5 Goals HT":return HT?(HT.h+HT.a<=1?"Won":"Lost"):"";
      case"First Half 1X":return HT?(HT.h>=HT.a?"Won":"Lost"):"";case"First Half X2":return HT?(HT.a>=HT.h?"Won":"Lost"):"";
      case"Home Win Either Half":return HT?((HT.h>HT.a||SH.h>SH.a)?"Won":"Lost"):"";case"Away Win Either Half":return HT?((HT.a>HT.h||SH.a>SH.h)?"Won":"Lost"):"";
      case"Second Half Over 0.5":return SH?(SH.h+SH.a>=1?"Won":"Lost"):"";case"Second Half Over 1.5":return SH?(SH.h+SH.a>=2?"Won":"Lost"):"";
      case"Draw at Either Half":return HT?((HT.h===HT.a||SH.h===SH.a)?"Won":"Lost"):"";case"Draw Both Halves":return HT?((HT.h===HT.a&&SH.h===SH.a)?"Won":"Lost"):"";
      default:return"";
    }
  }

  function analyseAll(matches){return (matches||[]).map(recommend);}
  function analyseStrict(matches){return (matches||[]).map(strictRecommend);}
  function scoreOver25(m){const r=trendRecommend(m);return r.primary==="Over 2.5 Goals"?r.confidence:0;}
  function scoreBTTS(m){const r=trendRecommend(m);return /^BTTS/.test(r.primary)?r.confidence:0;}
  function scoreWinDNB(m){const r=recommend(m);return /Win|DNB|Double Chance/.test(r.primary)?r.confidence:0;}
  function classifyLeague(m){const g=getNum(m,["leagueAvg.goalsPerGame"]),games=leagueSample(m);if(g===null)return{type:"Unknown",gpg:null,reliable:false,volatile:true,multiplier:1};let type=g>=3.1?"Very High-Scoring":g>=2.8?"High-Scoring":g>=2.4?"Balanced":g>=2.1?"Low-Scoring":"Very Low-Scoring";return{type,gpg:g,reliable:games>=50,volatile:games<50,multiplier:type.includes("Low")?1.08:type.includes("High")?.97:1};}
  function leagueContextVerdict(m,market){const lc=classifyLeague(m),r=leagueRate(m,market);if(!lc.reliable)return{downgrade:true,reject:false,reason:"League sample is not yet reliable."};if(r!==null&&r<.45)return{downgrade:true,reject:false,reason:`League rate for ${market} is only ${pct(r).toFixed(0)}%.`};return{downgrade:false,reject:false,reason:"League context does not contradict the market."};}
  function tierFromRank(pos,size){if(!pos||!size)return"UNKNOWN";const p=pos/size;return p<=.2?"TOP":p>=.8?"BOTTOM":"MIDDLE";}
  function oddsLadderGate(m,market){const key=ODDS_KEYS[market],o=key&&m.odds?num(m.odds[key]):null;return{pass:o!==null,odds:o,reason:o!==null?"Price available.":"Price unavailable."};}

  // Legacy names retained so older board.html versions do not break.
  const rulesProRecommend=eliteRecommend;
  const indicatorRecommend=oddsIntelligenceRecommend;
  const v3Recommend=recommend;

  const P2U_ENGINE_REGISTRY=[
    {key:"normal",name:"Normal",fn:"recommend",family:"PurePPG",version:"1.0",description:"Baseline venue, overall and recent-form PPG."},
    {key:"strict",name:"Strict",fn:"strictRecommend",family:"PurePPG",version:"2.0",description:"Tighter thresholds, samples and agreement."},
    {key:"ultra",name:"Ultra",fn:"ultraRecommend",family:"PurePPG",version:"3.0",description:"Recent-ten and league-normalized strength."},
    {key:"elite",name:"Elite",fn:"eliteRecommend",family:"PurePPG",version:"4.0",description:"Bayesian, opponent-adjusted and volatility controlled."},
    {key:"apex",name:"Apex",fn:"apexRecommend",family:"PurePPG",version:"5.0",description:"Uncertainty intervals and Conservative Edge."},
    {key:"prime",name:"Prime",fn:"primeRecommend",family:"PurePPG",version:"6.0",description:"Calibrated probability and league reliability."},
    {key:"expert",name:"Expert",fn:"expertRecommend",family:"PurePPG",version:"7.0",description:"Context, rest, similar opponents and stability."},
    {key:"pro",name:"Pro",fn:"proRecommend",family:"PurePPG",version:"8.0",description:"Seven-generation maximum-abstention consensus."},
    {key:"trend",name:"Trend",fn:"trendRecommend",family:"Specialist",version:"1.0",description:"Split, recent, season and league trend agreement."},
    {key:"streaks",name:"Streaks",fn:"streakRecommend",family:"Specialist",version:"1.0",description:"Active sequences, recurrence and counter-streaks."},
    {key:"mismatch",name:"Mismatch",fn:"mismatchRecommend",family:"Specialist",version:"1.0",description:"Multi-dimensional strength-gap analysis."},
    {key:"halves",name:"Halves",fn:"halvesRecommend",family:"Specialist",version:"1.0",description:"First and second-half direct-data specialist."},
    {key:"league-bias",name:"League Bias",fn:"leagueBiasRecommend",family:"Specialist",version:"1.0",description:"League tendency discovery plus team fit."},
    {key:"momentum",name:"Momentum",fn:"momentumRecommend",family:"Specialist",version:"1.0",description:"Improvement, decline, acceleration and reversal."},
    {key:"odds-iq",name:"Odds Intelligence",fn:"oddsIntelligenceRecommend",family:"Specialist",version:"1.0",description:"De-vigged movement and cross-market consistency."},
    {key:"value",name:"Value",fn:"valueRecommend",family:"Specialist",version:"1.0",description:"Calibrated probability versus fair market price."}
  ];

  return {
    ENGINE_SUITE_VERSION:VERSION,P2U_ENGINE_REGISTRY,
    recommend,strictRecommend,ultraRecommend,eliteRecommend,rulesProRecommend,apexRecommend,primeRecommend,expertRecommend,proRecommend,
    trendRecommend,streakRecommend,mismatchRecommend,halvesRecommend,leagueBiasRecommend,momentumRecommend,oddsIntelligenceRecommend,indicatorRecommend,valueRecommend,proConsensusRecommend,
    settle,analyseAll,analyseStrict,scoreOver25,scoreBTTS,scoreWinDNB,classifyLeague,leagueContextVerdict,tierFromRank,oddsLadderGate,v3Recommend,
    marketFamily,marketDirection
  };
});
