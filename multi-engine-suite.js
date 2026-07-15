/* ============================================================================
 * Predict2U Multi-Engine Suite v243
 * Adds four independent engines to the existing Predict2U engine registry:
 *   - Control Edge Engine v1.0
 *   - League Signal Matrix Engine v2.0
 *   - Market Flow Engine v2.0
 *   - Goal Compression Engine v1.0
 *
 * The Predict2U Decision Core is exposed as P2UMultiEngineDecisionCore.
 * It is intentionally NOT added as a fifth public engine.
 *
 * Load order in browsers:
 *   banker-engine.js
 *   multi-engine-suite.js
 *   data.js / p2u-intelligence.js
 * ========================================================================== */
(function(root,factory){
  const api=factory(root||{});
  Object.keys(api).forEach(k=>{ root[k]=api[k]; });
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
  "use strict";

  const VERSION="2026.07-v251";
  let OddsGuard=root&&root.P2UOddsGuard||null;
  try{if(typeof module!=="undefined"&&module.exports)OddsGuard=require("./odds-engine-guard.js");}catch(_){OddsGuard=OddsGuard||null;}
  const now=()=>new Date().toISOString();
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
  const num=v=>(v===null||v===undefined||v===""||!Number.isFinite(Number(v)))?null:Number(v);
  const rate=v=>{const n=num(v);return n===null?null:(n>1.00001?n/100:n);};
  const round=(n,d=1)=>n===null||n===undefined?null:Number(Number(n).toFixed(d));
  const avg=a=>{const v=a.map(num).filter(x=>x!==null);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null;};
  const safeDiv=(a,b)=>num(a)!==null&&num(b)!==null&&Number(b)!==0?Number(a)/Number(b):null;
  const first=(...values)=>{for(const v of values){const n=num(v);if(n!==null)return n;}return null;};
  const get=(obj,path)=>{try{return String(path).split(".").reduce((o,k)=>o==null?undefined:o[k],obj);}catch(_){return undefined;}};
  const getNum=(obj,paths)=>{for(const p of paths){const n=num(get(obj,p));if(n!==null)return n;}return null;};
  const fixtureId=m=>String((m&&m.id)!=null?m.id:`${m&&m.home||"home"}|${m&&m.away||"away"}|${m&&m.matchDate||"date"}`);
  const formPPG=v=>{const a=String(v||"").toUpperCase().split("").filter(x=>/[WDL]/.test(x));return a.length?a.reduce((s,x)=>s+(x==="W"?3:x==="D"?1:0),0)/a.length:null;};
  const pct=v=>v==null?"—":`${Math.round(v*100)}%`;

  const MARKET_CODES={
    "Home Win":"HOME_WIN","Away Win":"AWAY_WIN","Home DNB":"HOME_DNB","Away DNB":"AWAY_DNB","Draw":"DRAW",
    "Over 1.5 Goals":"OVER_15","Over 2.5 Goals":"OVER_25","Over 3.5 Goals":"OVER_35",
    "Under 1.5 Goals":"UNDER_15","Under 2.5 Goals":"UNDER_25","Under 3.5 Goals":"UNDER_35",
    "BTTS Yes":"BTTS_YES","BTTS No":"BTTS_NO",
    "Home Team Over 0.5 Goals":"HOME_TEAM_OVER_05","Away Team Over 0.5 Goals":"AWAY_TEAM_OVER_05",
    "Home Team Over 1.5 Goals":"HOME_TEAM_OVER_15","Away Team Over 1.5 Goals":"AWAY_TEAM_OVER_15"
  };
  const MARKET_LABELS=Object.fromEntries(Object.entries(MARKET_CODES).map(([k,v])=>[v,k]));
  const ODDS_KEYS={
    "Home Win":"home","Away Win":"away","Draw":"draw",
    "Over 1.5 Goals":"over15","Over 2.5 Goals":"over25","Over 3.5 Goals":"over35",
    "Under 1.5 Goals":"under15","Under 2.5 Goals":"under25","Under 3.5 Goals":"under35",
    "BTTS Yes":"bttsYes","BTTS No":"bttsNo",
    "Double Chance 1X":"dc1x","Double Chance X2":"dcx2","Double Chance 12":"dc12"
  };
  const marketOdds=(m,market)=>{const k=ODDS_KEYS[market];return k&&m&&m.odds?num(m.odds[k]):null;};

  function teamSnapshot(m,side){
    const home=side==="home";
    const venueGames=first(m&&m[`${side}VenueGames`],getNum(m,[`${side}Streaks.sample`]));
    const overallGames=first(getNum(m,[`${side}Streaks.sample`,`recent10.${side}.sample`]),venueGames?venueGames*2:null);
    const pts=first(m&&m[`${side}Pts`]);
    const overallPPG=first(getNum(m,[`${side}OverallPPG`,`${side}PPG`]),safeDiv(pts,overallGames),formPPG(m&&m[`${side}Form`]));
    const venuePPG=first(getNum(m,[`${side}VenuePPG`]),safeDiv(m&&m[`${side}VenuePts`],venueGames),overallPPG);
    const recentPPG=first(getNum(m,[`${side}Recent10PPG`,`recent10.${side}.ppg`]),formPPG(m&&m[`${side}Form`]));
    const gf=home?first(m&&m.homeScoredAtHome):first(m&&m.awayScoredAway);
    const ga=home?first(m&&m.homeConcededAtHome):first(m&&m.awayConcededAway);
    const winRate=rate(first(m&&m[`${side}WinRate`]));
    const unbeatenRate=rate(first(m&&m[`${side}UnbeatenRate`]));
    const cleanSheetRate=rate(first(m&&m[`${side}CleanSheetRate`]));
    const failedToScoreRate=rate(first(m&&m[`${side}FailedToScoreRate`]));
    const over15Rate=rate(first(m&&m[`${side}Over15Rate`]));
    const over25Rate=rate(first(m&&m[`${side}Over25Rate`]));
    const over35Rate=rate(first(m&&m[`${side}Over35Rate`]));
    const gd=first(m&&m[`${side}GD`],0);
    const gdpg=safeDiv(gd,overallGames);
    const xg=first(getNum(m,[`${side}XG`,`${side}xG`,`${side}Profile.xgFor`,`teamProfiles.${side}.xgFor`]));
    const xga=first(getNum(m,[`${side}XGA`,`${side}xGA`,`${side}Profile.xgAgainst`,`teamProfiles.${side}.xgAgainst`]));
    return {side,venueGames,overallGames,overallPPG,venuePPG,recentPPG,gf,ga,winRate,unbeatenRate,cleanSheetRate,failedToScoreRate,over15Rate,over25Rate,over35Rate,gdpg,xg,xga,
      position:first(m&&m[`${side}Pos`]),venueRank:first(m&&m[`${side}VenueRank`])};
  }

  function leagueSnapshot(m){
    const tr=m&&m.leagueTrends||{};const la=m&&m.leagueAvg||{};const rates=tr.rates||{};
    const gpg=first(la.goalsPerGame,tr.gpg);
    const homeGoals=first(la.homeGoals,gpg!==null?gpg/2:null);
    const awayGoals=first(la.awayGoals,gpg!==null?gpg/2:null);
    const sample=first(tr.sample,la.gamesPlayed);
    const lr=name=>rate(first(rates[name]));
    return {sample,gpg,homeGoals,awayGoals,drawRate:rate(first(la.drawRate,rates.Draw)),homeWinRate:rate(first(la.homeWinRate,rates["Home Win"])),awayWinRate:rate(first(rates["Away Win"])),
      over15:lr("Over 1.5"),over25:lr("Over 2.5"),over35:lr("Over 3.5"),under15:lr("Under 1.5"),under25:lr("Under 2.5"),under35:lr("Under 3.5"),
      bttsYes:lr("BTTS Yes"),bttsNo:lr("BTTS No"),top3:Array.isArray(tr.top3)?tr.top3:[],identity:tr.identity||null,currentSample:first(tr.sampleCurrent),currentShare:rate(first(tr.currentShare))};
  }

  function contextSnapshot(m){
    const s=`${m&&m.league||""} ${m&&m.round||""}`.toLowerCase();
    const status=String(m&&m.status||"").toUpperCase();
    return {isFriendly:/friendly/.test(s),isYouth:/\bu\d{2}\b|youth/.test(s),isReserve:/reserve|\bii\b/.test(s),isCup:/cup|round of|quarter|semi|final|knockout/.test(s)||!!(m&&m.isKnockout),
      cancelled:/PST|CANC|ABD|AWD/.test(status),lineupKnown:!!(m&&m.lineupKnown),motivationRisk:!!(m&&m.motivationRisk)};
  }

  function qualityGate(m,{requireOdds=true,compression=false}={}){
    const home=teamSnapshot(m,"home"),away=teamSnapshot(m,"away"),league=leagueSnapshot(m),context=contextSnapshot(m);
    const missing=[],warnings=[];
    if(!m||!m.home||!m.away)missing.push("fixture teams");
    if(!m||!m.league)missing.push("league");
    if(context.cancelled)missing.push("active fixture status");
    if(home.overallGames!==null&&home.overallGames<8)missing.push("home overall sample >= 8");
    if(away.overallGames!==null&&away.overallGames<8)missing.push("away overall sample >= 8");
    if(home.venueGames!==null&&home.venueGames<6)missing.push("home venue sample >= 6");
    if(away.venueGames!==null&&away.venueGames<6)missing.push("away venue sample >= 6");
    if(league.sample!==null&&league.sample<30)missing.push("league sample >= 30");
    if(compression&&(home.position===null||away.position===null||num(m&&m.tableSize)===null))missing.push("table positions for compression");
    if(requireOdds&&(!m.odds||Object.values(m.odds).filter(v=>num(v)!==null).length<2))missing.push("required odds");
    if(context.isFriendly&&(home.venueGames===null||away.venueGames===null||league.sample===null))missing.push("stable friendly data");
    if(context.isYouth||context.isReserve)warnings.push("Youth/reserve competition requires extra caution.");
    if(!m.statsReal)warnings.push("Some team rates use standings/history fallbacks.");
    let score=100-missing.length*18-warnings.length*5;
    if(home.overallGames===null||away.overallGames===null){score-=8;warnings.push("Overall sample inferred from available history.");}
    if(home.venueGames===null||away.venueGames===null){score-=10;warnings.push("Venue sample unavailable.");}
    return {passed:missing.length===0&&score>=65,score:clamp(score,0,100),missingFields:missing,warnings,home,away,league,context};
  }

  function rule(ruleId,label,actual,required,passed,weight=1){return{ruleId,label,actual,required,passed:!!passed,weight};}
  function makeResult({m,id,name,version,market=null,score=0,rawScore=score,passedRules=[],failedRules=[],warnings=[],penalties=[],calculations={},shortReason="",internalReason="",side="none",quality=0}){
    score=round(clamp(score,0,94),1);rawScore=round(clamp(rawScore,0,100),1);
    const qualified=!!market&&score>=78&&failedRules.filter(r=>r.weight>=2).length===0;
    const publish=qualified&&score>=82;
    const confidence=score>=88?"A1":score>=82?"A2":score>=76?"watchlist":"rejected";
    const primary=publish?market:"No Bet";
    const reason=shortReason||(!publish?(failedRules[0]&&failedRules[0].label)||warnings[0]||"Release gate not met.":`${name} qualified ${market}.`);
    let result={match:m,engine:id,engineId:id,engineName:name,version,fixtureId:fixtureId(m),status:publish?"qualified":"rejected",candidateMarket:publish?(MARKET_CODES[market]||market):null,candidateSide:side,
      rawScore,finalScore:score,confidence,primary,market:primary,bet:publish,banker:publish&&score>=88,grade:confidence==="A1"?"A1 Banker":confidence==="A2"?"A2 Strong Pick":confidence==="watchlist"?"Watchlist":"No Bet",
      passedRules,failedRules,warnings,penalties,calculations,shortReason:reason,internalReason:internalReason||reason,reasons:[reason,...passedRules.slice(0,3).map(r=>r.label)],summary:publish?`${name}: ${market} (${score})`:`No Bet — ${reason}`,generatedAt:now()};
    if(OddsGuard&&typeof OddsGuard.reviewDecision==="function")result=OddsGuard.reviewDecision(result,m);
    return result;
  }
  function reject(m,id,name,version,reason,q,extra={}){return makeResult({m,id,name,version,score:0,quality:q&&q.score||0,warnings:q&&q.warnings||[],failedRules:[rule("DATA_QUALITY_FAILED",reason,q&&q.missingFields&&q.missingFields.join(", ")||null,"valid mandatory data",false,3)],shortReason:reason,...extra});}

  function tier(pos,size){if(num(pos)===null||num(size)===null)return"UNKNOWN";const p=pos/size;return p<=.2?"TOP":p>=.8?"BOTTOM":"MIDDLE";}
  function drawRisk(m,h,a,l){
    const fav=Math.min(num(m&&m.odds&&m.odds.home)||99,num(m&&m.odds&&m.odds.away)||99);
    const spread=Math.abs((num(m&&m.odds&&m.odds.home)||0)-(num(m&&m.odds&&m.odds.away)||0));
    return clamp(35*(l.drawRate||.27)+35*clamp(1-Math.abs((h.venuePPG||0)-(a.venuePPG||0))/1.2,0,1)+20*(fav>1.8?1:.4)+10*(spread<.45?1:0),0,100);
  }

  function controlEdgeRecommend(m){
    const id="controlEdge",name="Control Edge",version="1.0";const q=qualityGate(m,{requireOdds:true});
    if(!q.passed)return reject(m,id,name,version,`Data quality failed: ${q.missingFields.join(", ")||"insufficient evidence"}.`,q);
    const h=q.home,a=q.away,l=q.league;const size=num(m.tableSize),gap=Math.abs((h.position||0)-(a.position||0));
    const hFav=(num(m.odds.home)||99)<(num(m.odds.away)||99),aFav=(num(m.odds.away)||99)<(num(m.odds.home)||99);
    const metrics=[
      ["PPG_EDGE","Overall PPG advantage",(h.overallPPG||0)-(a.overallPPG||0),.50],
      ["VENUE_EDGE","Venue PPG advantage",(h.venuePPG||0)-(a.venuePPG||0),.60],
      ["GD_EDGE","Goal-difference/game advantage",(h.gdpg||0)-(a.gdpg||0),.70],
      ["XG_EDGE","xG difference advantage",h.xg!==null&&a.xg!==null?h.xg-a.xg:null,.50],
      ["WIN_EDGE","Win-rate advantage",h.winRate!==null&&a.winRate!==null?h.winRate-a.winRate:null,.20],
      ["FORM_EDGE","Recent form advantage",h.recentPPG!==null&&a.recentPPG!==null?h.recentPPG-a.recentPPG:null,.35],
      ["TABLE_EDGE","Table superiority",gap,gap>=Math.max(3,(size||20)*.18)?gap:999],
      ["ODDS_EDGE","Odds confirm home favorite",hFav, true]
    ];
    const reverse=metrics.map(([r,lbl,actual,req])=>[r,lbl,typeof actual==="number"?-actual:(r==="ODDS_EDGE"?aFav:actual),req]);
    const scoreSide=(rows)=>rows.filter(([, ,actual,req])=>actual!==null&&(typeof req==="boolean"?actual===req:actual>=req)).length;
    const hp=scoreSide(metrics),ap=scoreSide(reverse);const side=hp>=ap?"home":"away",fav=side==="home"?h:a,opp=side==="home"?a:h,rows=side==="home"?metrics:reverse,passes=Math.max(hp,ap);
    const dominant=passes>=5&&Math.abs((h.overallPPG||0)-(a.overallPPG||0))>=.75&&Math.abs((h.venuePPG||0)-(a.venuePPG||0))>=.80&&Math.abs((h.gdpg||0)-(a.gdpg||0))>=1;
    const clear=passes>=4;const attackStrong=(fav.gf||0)>=1.45||(fav.xg||0)>=1.45;const defenceSolid=(fav.ga||99)<=1.05||(fav.cleanSheetRate||0)>=.35;const oppPoor=(opp.gf||99)<=1.05||(opp.failedToScoreRate||0)>=.35;
    const openFavourite=(fav.ga||0)>=1.35&&((opp.gf||0)>=.9);const dr=drawRisk(m,h,a,l);
    let market=null,base=0,reason="";
    if(dominant&&attackStrong&&defenceSolid&&oppPoor){market=side==="home"?"Home Win":"Away Win";base=82+passes*1.5+(dr<=48?3:0);reason=`${side==="home"?"Home":"Away"} side is dominant with attacking control and defensive protection.`;}
    else if(clear&&dr<=72){market=side==="home"?"Home DNB":"Away DNB";base=79+passes*1.4+(defenceSolid?2:0);reason=`Clear ${side} superiority remains, but draw protection is safer than a straight win.`;}
    else if(clear&&attackStrong&&openFavourite&&marketOdds(m,"Over 2.5 Goals")){market="Over 2.5 Goals";base=80+passes+(l.over25!==null&&l.over25>=.55?3:0);reason="The stronger attack is open enough for the opponent to contribute to the total.";}
    const passed=rows.filter(([, ,a0,r])=>a0!==null&&(typeof r==="boolean"?a0===r:a0>=r)).map(([r,lbl,a0,req])=>rule(r,lbl,round(a0,2),req,true,1));
    const failed=rows.filter(([, ,a0,r])=>a0===null||!(typeof r==="boolean"?a0===r:a0>=r)).map(([r,lbl,a0,req])=>rule(r,lbl,round(a0,2),req,false,1));
    if(!market)failed.push(rule("CONTROL_ROUTE","A safe control route must qualify",passes,"4+ plus market confirmation",false,3));
    const penalty=dr>65?4:0;return makeResult({m,id,name,version,market,score:base-penalty,rawScore:base,quality:q.score,passedRules:passed,failedRules:failed,warnings:q.warnings,penalties:penalty?[{code:"DRAW_RISK",label:"Elevated draw risk",points:-penalty}]:[],
      calculations:{strongerSide:side,conditionsPassed:passes,dominant,drawRisk:round(dr),attackStrong,defenceSolid,opponentAttackPoor:oppPoor},shortReason:reason,internalReason:`${reason} ${passes}/8 superiority checks passed; draw risk ${round(dr)}.`,side});
  }

  function leagueMarketRate(l,market){const map={"Over 1.5 Goals":"over15","Over 2.5 Goals":"over25","Over 3.5 Goals":"over35","Under 1.5 Goals":"under15","Under 2.5 Goals":"under25","Under 3.5 Goals":"under35","BTTS Yes":"bttsYes","BTTS No":"bttsNo","Home Win":"homeWinRate","Away Win":"awayWinRate"};return l[map[market]]??null;}
  function normalizeTrendMarket(v){const s=String(v||"");const map={"Over 1.5":"Over 1.5 Goals","Over 2.5":"Over 2.5 Goals","Over 3.5":"Over 3.5 Goals","Under 1.5":"Under 1.5 Goals","Under 2.5":"Under 2.5 Goals","Under 3.5":"Under 3.5 Goals","Home Team Over 0.5":"Home Team Over 0.5 Goals","Away Team Over 0.5":"Away Team Over 0.5 Goals"};return map[s]||s;}
  function triggerFor(m,market){const o=m.odds||{},dc12=num(o.dc12),dc1x=num(o.dc1x),dcx2=num(o.dcx2),h=num(o.home),a=num(o.away);let pass=false,type="NO_SPECIAL_TRIGGER",actual=null,required=null;
    if(/^Over|BTTS Yes/.test(market)){type="TWELVE_MAX";actual=dc12;required=market.includes("3.5")?1.10:market.includes("2.5")?1.28:1.34;pass=actual!==null&&actual<=required;}
    else if(/^Under|BTTS No/.test(market)){type="TWELVE_MIN";actual=dc12;required=1.40;pass=actual!==null&&actual>=required;}
    else if(market==="Home Win"){type="ONE_X_MAX";actual=dc1x;required=1.10;pass=actual!==null&&actual<=required;}
    else if(market==="Away Win"){type="X_TWO_MAX";actual=dcx2;required=1.10;pass=actual!==null&&actual<=required;}
    else if(market==="Draw"){type="BALANCED_1X2_SPREAD";actual=h!==null&&a!==null?Math.abs(h-a):null;required=.20;pass=actual!==null&&actual<=required;}
    return{pass,type,actual,required};}

  function leagueSignalMatrixRecommend(m){
    const id="leagueSignalMatrix",name="League Signal Matrix",version="2.0";const q=qualityGate(m,{requireOdds:true});
    if(!q.passed)return reject(m,id,name,version,`League profile data failed: ${q.missingFields.join(", ")||"insufficient evidence"}.`,q);
    const l=q.league;const profiles=[];
    if(Array.isArray(m.leagueSignalProfiles))profiles.push(...m.leagueSignalProfiles);
    if(!profiles.length)for(const x of l.top3){const mk=normalizeTrendMarket(x.market);if(MARKET_CODES[mk])profiles.push({market:mk,rate:rate(x.rate),source:"current league top-three profile",enabled:true,avoid:false});}
    if(!profiles.length)return reject(m,id,name,version,"No approved or current league-market profile is available.",q,{failedRules:[rule("NO_LEAGUE_PROFILE","Exact league profile is required",null,"profile",false,3)]});
    const candidates=[];
    for(const p of profiles){if(p.enabled===false||p.avoid===true)continue;const market=normalizeTrendMarket(p.market);const r=rate(first(p.rate,leagueMarketRate(l,market)));if(r===null)continue;const trig=triggerFor(m,market);const strongNoTrigger=r>=.76&&marketOdds(m,market)!==null;const pass=trig.pass||strongNoTrigger;if(!pass)continue;
      const currentOkay=l.currentSample===null||l.currentSample>=30||l.currentShare>=.45;const teamConfirm=/^Over/.test(market)?avg([q.home.over25Rate,q.away.over25Rate])>=.48:/^Under/.test(market)?((q.home.over25Rate??.5)+(q.away.over25Rate??.5))/2<=.55:true;
      const score=72+r*17+(trig.pass?5:0)+(currentOkay?3:0)+(teamConfirm?2:0);candidates.push({market,score,r,trig,currentOkay,teamConfirm,source:p.source||"versioned profile"});}
    candidates.sort((a,b)=>b.score-a.score);const c=candidates[0];if(!c)return reject(m,id,name,version,"No league profile passed its odds trigger and confirmation rules.",q,{failedRules:[rule("TRIGGER_FAILED","Required league-profile odds trigger",null,"pass",false,3)]});
    const passed=[rule("LEAGUE_SAMPLE","League sample",l.sample,30,l.sample>=30,2),rule("PROFILE_RATE","League market rate",round(c.r,2),.68,c.r>=.68,2),rule("ODDS_TRIGGER",c.trig.type,round(c.trig.actual,2),c.trig.required,c.trig.pass||c.r>=.76,2),rule("CURRENT_SEASON","Current-season profile validation",l.currentSample,"30 or stable backfill",c.currentOkay,1),rule("TEAM_CONFIRM","Team statistics confirm direction",c.teamConfirm,true,c.teamConfirm,1)];
    return makeResult({m,id,name,version,market:c.market,score:c.score,rawScore:c.score,quality:q.score,passedRules:passed.filter(x=>x.passed),failedRules:passed.filter(x=>!x.passed),warnings:q.warnings,calculations:{profileSource:c.source,leagueRate:round(c.r,3),triggerType:c.trig.type,triggerValue:c.trig.actual},shortReason:`${c.market} is supported by the exact league profile (${pct(c.r)}) and its odds trigger.`,internalReason:`Profile source ${c.source}; ${c.trig.type} ${c.trig.actual} vs ${c.trig.required}.`});
  }

  function marketFlowRecommend(m){
    const id="marketFlow",name="Market Flow",version="2.0";const q=qualityGate(m,{requireOdds:true});
    if(!q.passed)return reject(m,id,name,version,`Market-flow data failed: ${q.missingFields.join(", ")||"insufficient evidence"}.`,q);
    const o=m.odds||{},l=q.league,h=q.home,a=q.away;const dc12=num(o.dc12),dc1x=num(o.dc1x),dcx2=num(o.dcx2);const cand=[];
    const goalIndex=avg([h.gf,h.ga,a.gf,a.ga]);
    const add=(market,base,confirmed,why,actual,required)=>{if(confirmed&&marketOdds(m,market)!==null)cand.push({market,score:base,why,actual,required});};
    if(dc12!==null){
      if(dc12<=1.10)add("Over 3.5 Goals",86,(l.over35||0)>=.48&&goalIndex>=1.35,"Very short 12 price with high-goal confirmation.",dc12,"<= 1.10");
      else if(dc12<=1.18)add("Over 2.5 Goals",85,(l.over25||0)>=.55&&avg([h.over25Rate,a.over25Rate])>=.48,"Short 12 price with league/team Over 2.5 confirmation.",dc12,"<= 1.18");
      else if(dc12<=1.28)add("Over 2.5 Goals",82,(l.over25||0)>=.53&&goalIndex>=1.18,"12 price routes to Over 2.5 and statistics agree.",dc12,"<= 1.28");
      else if(dc12<=1.34)add("Over 1.5 Goals",83,(l.over15||0)>=.67||goalIndex>=1.05,"Moderately short 12 price supports the safer Over 1.5 line.",dc12,"<= 1.34");
      else if(dc12>=1.40)add("Under 3.5 Goals",82,(l.under35||0)>=.63&&goalIndex<=1.35,"High 12 price plus compressed scoring data supports Under 3.5.",dc12,">= 1.40");
    }
    if(dc1x!==null&&dc1x<=1.10&&((h.venuePPG||0)-(a.venuePPG||0))>=.45)add("Home DNB",82,true,"1X control is statistically confirmed by the home strength edge.",dc1x,"<= 1.10");
    if(dcx2!==null&&dcx2<=1.10&&((a.venuePPG||0)-(h.venuePPG||0))>=.45)add("Away DNB",82,true,"X2 control is statistically confirmed by the away strength edge.",dcx2,"<= 1.10");
    cand.sort((x,y)=>y.score-x.score);const c=cand[0];if(!c)return reject(m,id,name,version,"Odds direction did not receive enough statistical confirmation.",q,{failedRules:[rule("FLOW_CONFIRM","Odds signal requires statistical confirmation",dc12,"confirmed route",false,3)]});
    const pass=[rule("FLOW_ROUTE","Market-flow odds route",c.actual,c.required,true,2),rule("STATS_CONFIRM","League/team statistics confirm the route",true,true,true,2),rule("MARKET_ODDS","Selected market odds available",marketOdds(m,c.market),"available",marketOdds(m,c.market)!==null,2)];
    return makeResult({m,id,name,version,market:c.market,score:c.score,rawScore:c.score,quality:q.score,passedRules:pass,failedRules:[],warnings:q.warnings,calculations:{dc12,dc1x,dcx2,goalIndex:round(goalIndex,2)},shortReason:c.why,internalReason:`Market Flow routed ${c.actual} to ${c.market}; confirmation passed.`});
  }

  function goalCompressionRecommend(m){
    const id="goalCompression",name="Goal Compression",version="1.0";const q=qualityGate(m,{requireOdds:true,compression:true});
    if(!q.passed)return reject(m,id,name,version,`Compression data failed: ${q.missingFields.join(", ")||"insufficient evidence"}.`,q);
    const h=q.home,a=q.away,l=q.league,size=num(m.tableSize);const latg=l.gpg;const leagueTeam=latg!==null?latg/2:null;
    const hAR=leagueTeam?safeDiv(h.gf,leagueTeam)*100:null,hDR=leagueTeam?safeDiv(h.ga,leagueTeam)*100:null,aAR=leagueTeam?safeDiv(a.gf,leagueTeam)*100:null,aDR=leagueTeam?safeDiv(a.ga,leagueTeam)*100:null;
    const gi=latg?safeDiv((h.gf||0)+(h.ga||0)+(a.gf||0)+(a.ga||0),2*latg)*100:null;
    const hLeaky=hDR!==null&&hDR>=110&&(h.ga||0)>=1.25,aLeaky=aDR!==null&&aDR>=110&&(a.ga||0)>=1.25;
    const ht=tier(h.position,size),at=tier(a.position,size),sameTier=ht!=="UNKNOWN"&&ht===at,topClash=ht==="TOP"&&at==="TOP",positionGap=h.position!==null&&a.position!==null?Math.abs(h.position-a.position):null;
    const balanced=num(m.odds.home)!==null&&num(m.odds.away)!==null&&Math.abs(m.odds.home-m.odds.away)<=.35;let risk=0;const flags=[];
    if(sameTier){risk++;flags.push("same-tier");}if(topClash){risk++;flags.push("top-tier clash");}if(balanced){risk++;flags.push("balanced market");}if(positionGap!==null&&positionGap<=2){risk++;flags.push("compressed table gap");}if(latg!==null&&latg>3.40){risk++;flags.push("chaos league");}
    const cls=latg<2.40?"Low Scoring":latg<=3?"Medium Scoring":latg<=3.40?"High Scoring":"Inflated / Chaos";
    const candidates=[];const add=(market,score,ok,why)=>{if(ok&&marketOdds(m,market)!==null)candidates.push({market,score,why});};
    add("Over 2.5 Goals",80+(gi>=115?5:0)+(hLeaky&&aLeaky?3:0)-risk*2,latg>=2.70&&gi>=108&&(hLeaky||aLeaky)&&(h.gf||0)>=.9&&(a.gf||0)>=.8&&risk<=3,"Goal Index, attacks and dual defensive confirmation support Over 2.5.");
    add("Over 1.5 Goals",82+(gi>=100?3:0)-risk,latg>=2.35&&gi>=92&&((h.gf||0)+(a.gf||0))>=1.75,"The scoring environment supports the safer Over 1.5 line.");
    add("Under 3.5 Goals",83+(sameTier?2:0)+(topClash?1:0),latg<=3.10&&gi<=112,"League environment and competitive compression protect Under 3.5.");
    add("BTTS Yes",81+(hLeaky&&aLeaky?4:0)-risk,latg>=2.65&&(l.bttsYes||0)>=.54&&(h.gf||0)>=.95&&(a.gf||0)>=.85&&hLeaky&&aLeaky,"Both teams have verified scoring routes against leaky defences.");
    add("BTTS No",82+(sameTier?1:0),latg<=2.70&&(l.bttsNo||0)>=.52&&(((h.gf||99)<=.9&&(a.ga||99)<=1.05)||((a.gf||99)<=.9&&(h.ga||99)<=1.05)),"One attack is weak and the opposing defence is structurally solid.");
    candidates.sort((x,y)=>y.score-x.score);const c=candidates[0];if(!c||risk>=6)return reject(m,id,name,version,risk>=6?"Compression risk reached the automatic No Bet tier.":"No goal market passed league, ratio and raw-defence confirmation.",q,{failedRules:[rule("GOAL_ROUTE","Goal market must pass compression gates",risk,"risk <= 5 plus market rules",false,3)],calculations:{LATG:latg,goalIndex:gi,riskPoints:risk}});
    const score=c.score;const passed=[rule("LATG","League average total goals",latg,"market-specific",true,2),rule("GOAL_INDEX","Goal Index",round(gi,1),"market-specific",true,2),rule("DUAL_DEFENCE","Leaky defence requires ratio and raw GA",`${hLeaky}/${aLeaky}`,"confirmed where needed",true,2),rule("RISK_TIER","Compression risk points",risk,"<= 3 for aggressive goals; <= 5 otherwise",risk<=5,2)];
    return makeResult({m,id,name,version,market:c.market,score,rawScore:score,quality:q.score,passedRules:passed.filter(x=>x.passed),failedRules:passed.filter(x=>!x.passed),warnings:[...q.warnings,...flags.map(x=>`Compression flag: ${x}.`)],penalties:risk?[{code:"COMPRESSION_RISK",label:`${risk} compression risk point(s)`,points:-risk}]:[],calculations:{LATG:latg,classification:cls,homeAttackRatio:round(hAR),homeDefenceRatio:round(hDR),awayAttackRatio:round(aAR),awayDefenceRatio:round(aDR),goalIndex:round(gi),riskPoints:risk,homeTier:ht,awayTier:at,positionGap},shortReason:c.why,internalReason:`${c.why} LATG ${latg}; Goal Index ${round(gi)}; risk ${risk}.`});
  }

  const WEIGHTS={
    result:{controlEdge:.45,leagueSignalMatrix:.25,marketFlow:.15,goalCompression:.15},
    over:{goalCompression:.40,leagueSignalMatrix:.30,marketFlow:.20,controlEdge:.10},
    under:{goalCompression:.45,leagueSignalMatrix:.30,controlEdge:.15,marketFlow:.10},
    btts:{goalCompression:.35,leagueSignalMatrix:.35,controlEdge:.20,marketFlow:.10},
    team:{controlEdge:.35,goalCompression:.35,leagueSignalMatrix:.20,marketFlow:.10}
  };
  const family=market=>/^Home Win|^Away Win|DNB/.test(market)?"result":/^Over/.test(market)?"over":/^Under/.test(market)?"under":/^BTTS/.test(market)?"btts":/^Home Team|^Away Team/.test(market)?"team":"result";
  const conflictPairs=[["Over 2.5 Goals","Under 2.5 Goals"],["Over 3.5 Goals","Under 3.5 Goals"],["BTTS Yes","BTTS No"],["Home Win","Away DNB"],["Away Win","Home DNB"]];
  function runMultiEngineDecisionCore(m,provided){
    const results=provided||[controlEdgeRecommend(m),leagueSignalMatrixRecommend(m),marketFlowRecommend(m),goalCompressionRecommend(m)];const candidates={};
    for(const r of results){if(!r.bet||!r.primary||r.primary==="No Bet")continue;const f=family(r.primary),w=WEIGHTS[f][r.engineId]||0;const c=candidates[r.primary]||(candidates[r.primary]={market:r.primary,weighted:0,weight:0,engines:[],scores:[]});c.weighted+=r.finalScore*w;c.weight+=w;c.engines.push(r.engineId);c.scores.push(r.finalScore);}
    const markets=Object.keys(candidates);for(const [a,b] of conflictPairs){if(markets.includes(a)&&markets.includes(b))return{status:"no_bet",reason:"CONTRADICTORY_ENGINES",engineResults:results,candidates:[]};}
    const ranked=Object.values(candidates).map(c=>({...c,finalScore:c.weight?c.weighted/c.weight:0})).sort((a,b)=>b.finalScore-a.finalScore);if(!ranked.length)return{status:"no_bet",reason:"NO_QUALIFIED_ENGINE",engineResults:results,candidates:ranked};
    const best=ranked[0],second=ranked[1];if(best.finalScore<82)return{status:"no_bet",reason:"FINAL_SCORE_TOO_LOW",engineResults:results,candidates:ranked};if(second&&best.finalScore-second.finalScore<6)return{status:"no_bet",reason:"CANDIDATE_MARGIN_TOO_SMALL",engineResults:results,candidates:ranked};
    return{status:"published",prediction:{fixtureId:fixtureId(m),market:MARKET_CODES[best.market]||best.market,selection:best.market,confidence:best.finalScore>=88?"A1":"A2",finalScore:round(best.finalScore),decimalOdds:marketOdds(m,best.market),primaryEngine:best.engines[0],supportingEngines:best.engines.slice(1),shortReason:`${best.engines.length} multi-engine confirmation(s).`,riskFlags:[],engineVersions:Object.fromEntries(results.map(r=>[r.engineId,r.version])),publishedAt:now()},engineResults:results,candidates:ranked};
  }

  const ADDITIONS=[
    {key:"controlEdge",name:"Control Edge",fn:"controlEdgeRecommend",family:"Multi-Engine",version:"1.0",description:"Team superiority, attack/defence quality, Straight Win and DNB routing."},
    {key:"leagueSignalMatrix",name:"League Signal Matrix",fn:"leagueSignalMatrixRecommend",family:"Multi-Engine",version:"2.0",description:"Exact league-market tendencies activated by odds and current team confirmation."},
    {key:"marketFlow",name:"Market Flow",fn:"marketFlowRecommend",family:"Multi-Engine",version:"2.0",description:"Fast 12, 1X and X2 odds routing with mandatory statistical confirmation."},
    {key:"goalCompression",name:"Goal Compression",fn:"goalCompressionRecommend",family:"Multi-Engine",version:"1.0",description:"League-adjusted goal ratios, Goal Index, table compression and risk protection."}
  ];
  const existing=Array.isArray(root.P2U_ENGINE_REGISTRY)?root.P2U_ENGINE_REGISTRY:[];
  const keys=new Set(ADDITIONS.map(x=>x.key));
  const merged=[...existing.filter(x=>!keys.has(x&&x.key)),...ADDITIONS];
  root.P2U_ENGINE_REGISTRY=merged;
  root.P2U_MULTI_ENGINE_COUNT=ADDITIONS.length;

  return {VERSION,controlEdgeRecommend,leagueSignalMatrixRecommend,marketFlowRecommend,goalCompressionRecommend,runMultiEngineDecisionCore,P2UMultiEngineDecisionCore:{run:runMultiEngineDecisionCore,weights:WEIGHTS,version:"1.0"},P2U_MULTI_ENGINE_REGISTRY:ADDITIONS,P2U_ENGINE_REGISTRY:merged,qualityGate,MARKET_CODES,MARKET_LABELS};
});
