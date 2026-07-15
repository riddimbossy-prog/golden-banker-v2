/* ============================================================================
 * Predict2U Odds Market Guard v251
 * Cross-provider confirmation layer shared by every public engine.
 *
 * Rules:
 * - Statistical engines remain primary; odds never manufacture a pick.
 * - Missing prices add no confidence.
 * - Multi-book agreement can add a small confirmation bonus.
 * - Strong multi-book contradiction removes banker status and can reject a pick.
 * - Derived HT/FT scenarios are labelled and never treated as bookmaker prices.
 * ========================================================================== */
(function(root,factory){
  const api=factory();
  root.P2UOddsGuard=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";
  const VERSION="2026.07-v251";
  const num=v=>(v===null||v===undefined||v===""||!Number.isFinite(Number(v)))?null:Number(v);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
  const round=(n,d=1)=>n==null?null:Number(Number(n).toFixed(d));
  const ODDS_KEYS={
    "Home Win":"home","Away Win":"away","Draw":"draw",
    "Home DNB":"homeDnb","Away DNB":"awayDnb",
    "Double Chance 1X":"dc1x","Double Chance X2":"dcx2","Double Chance 12":"dc12",
    "Over 1.5 Goals":"over15","Over 2.5 Goals":"over25","Over 3.5 Goals":"over35",
    "Under 1.5 Goals":"under15","Under 2.5 Goals":"under25","Under 3.5 Goals":"under35",
    "BTTS Yes":"bttsYes","BTTS No":"bttsNo",
    "Home Team Over 0.5 Goals":"homeOver05","Away Team Over 0.5 Goals":"awayOver05",
    "Home Team Over 1.5 Goals":"homeOver15","Away Team Over 1.5 Goals":"awayOver15",
    "First Half Over 0.5":"fhOver05","First Half Under 1.5":"fhUnder15",
    "Second Half Over 0.5":"shOver05","Second Half Over 1.5":"shOver15",
    "Home Win Either Half":"homeWinEitherHalf","Away Win Either Half":"awayWinEitherHalf",
    "Draw at Either Half":"drawEitherHalf"
  };
  const OPPOSITE={over15:"under15",under15:"over15",over25:"under25",under25:"over25",over35:"under35",under35:"over35",bttsYes:"bttsNo",bttsNo:"bttsYes",fhOver05:"fhUnder05",fhUnder05:"fhOver05",fhOver15:"fhUnder15",fhUnder15:"fhOver15",shOver05:"shUnder05",shUnder05:"shOver05",shOver15:"shUnder15",shUnder15:"shOver15"};
  const RANGES={
    home:[1.12,6],away:[1.12,6],draw:[2.2,6.5],homeDnb:[1.08,4],awayDnb:[1.08,4],dc1x:[1.02,2.15],dcx2:[1.02,2.15],dc12:[1.02,2.15],
    over15:[1.05,2.4],under15:[1.3,5],over25:[1.2,4],under25:[1.15,4],over35:[1.35,7],under35:[1.03,2.6],bttsYes:[1.25,4],bttsNo:[1.25,4],
    fhOver05:[1.05,3.2],fhUnder15:[1.05,3],shOver05:[1.03,2.5],shOver15:[1.15,5],homeOver05:[1.02,2.8],awayOver05:[1.02,2.8],homeOver15:[1.15,5],awayOver15:[1.15,5]
  };
  function fair3(o){
    const h=num(o&&o.home),d=num(o&&o.draw),a=num(o&&o.away);
    if(!h||!d||!a)return null;
    const ih=1/h,id=1/d,ia=1/a,s=ih+id+ia;
    return{home:ih/s,draw:id/s,away:ia/s};
  }
  function fair2(a,b){
    a=num(a);b=num(b);if(!a||!b)return null;const ia=1/a,ib=1/b,s=ia+ib;return[ia/s,ib/s];
  }
  function marketDirection(market){
    const s=String(market||"");
    if(/^Home Win|Home DNB|Double Chance 1X|Home Team/.test(s))return"HOME";
    if(/^Away Win|Away DNB|Double Chance X2|Away Team/.test(s))return"AWAY";
    if(/^Over|BTTS Yes|First Half Over|Second Half Over/.test(s))return"OVER";
    if(/^Under|BTTS No|First Half Under|Second Half Under/.test(s))return"UNDER";
    return"NEUTRAL";
  }
  function selectedPrice(m,market){const k=ODDS_KEYS[market];return k&&m&&m.odds?num(m.odds[k]):null;}
  function marketMeta(m,key){return m&&m.oddsMarketMeta&&m.oddsMarketMeta[key]||null;}
  function classifyConflict(m,market,key){
    const dir=marketDirection(market),o=m&&m.odds||{},fair=fair3(o);
    if(fair&&(dir==="HOME"||dir==="AWAY")){
      const selected=dir==="HOME"?fair.home:fair.away,other=dir==="HOME"?fair.away:fair.home;
      const gap=other-selected;
      if(gap>=.13)return{level:"strong",reason:`Consensus prices the opposite side ${Math.round(gap*100)} probability points higher.`};
      if(gap>=.07)return{level:"moderate",reason:`Consensus leans to the opposite side by ${Math.round(gap*100)} probability points.`};
    }
    const opp=OPPOSITE[key];
    if(opp&&o){
      const p=fair2(o[key],o[opp]);
      if(p&&p[0]<=.34)return{level:"strong",reason:"The selected market is strongly opposed by its paired market price."};
      if(p&&p[0]<=.41)return{level:"moderate",reason:"The selected market is the less-supported side of its paired price."};
    }
    return{level:"none",reason:""};
  }
  function htftSupport(m,market){
    const dir=marketDirection(market),actual=m&&m.htftOdds&&m.htftOdds.actual;
    if(actual&&actual.normalized&&["HOME","AWAY"].includes(dir)){
      const endHome=(actual.normalized["1/1"]||0)+(actual.normalized["X/1"]||0)+(actual.normalized["2/1"]||0);
      const endAway=(actual.normalized["1/2"]||0)+(actual.normalized["X/2"]||0)+(actual.normalized["2/2"]||0);
      const wanted=dir==="HOME"?endHome:endAway,other=dir==="HOME"?endAway:endHome;
      if(wanted>=other+.12)return{adjustment:2,label:"Actual HT/FT combination prices support the selected full-time direction."};
      if(other>=wanted+.15)return{adjustment:-2,label:"Actual HT/FT combination prices oppose the selected full-time direction."};
    }
    const derived=m&&m.htftSignal;
    if(derived&&derived.source==="derived-from-separate-markets"&&["HOME","AWAY"].includes(dir)){
      if(derived.favoriteDirection===dir&&num(derived.persistenceScore)>=65)return{adjustment:1,label:"First-half and full-time prices point in the same direction."};
      if(derived.favoriteDirection&&derived.favoriteDirection!==dir&&num(derived.persistenceScore)>=70)return{adjustment:-1,label:"First-half/full-time direction conflicts with the selection."};
    }
    return{adjustment:0,label:""};
  }
  function recalc(out,score,severe){
    const wasBet=!!out.bet;
    out.score=score;
    if(num(out.finalScore)!==null)out.finalScore=score;
    if(num(out.specialist_score)!==null)out.specialist_score=score;
    if(typeof out.confidence==="number")out.confidence=score;
    if(severe||score<78){
      if(wasBet)out.candidateBeforeOdds=out.primary||out.market;
      out.bet=false;out.banker=false;out.primary="No Bet";out.market="No Bet";out.candidate_market="No Bet";out.final_status="NO BET";out.status="rejected";
      out.grade="No Bet";out.summary=`No Bet — odds conflict blocked ${out.candidateBeforeOdds||"the candidate"}`;
    }else{
      if(out.banker&&(score<84||severe))out.banker=false;
      if(typeof out.signal_strength==="string")out.signal_strength=score>=88?"PRIME":score>=84?"ELITE":score>=81?"STRONG":"QUALIFIED";
      if(out.status==="qualified")out.confidence=score>=88?"A1":score>=82?"A2":"watchlist";
      out.summary=out.bet?`${out.engineName||out.engine}: ${out.primary} (${score})`:out.summary;
    }
    return out;
  }
  function reviewDecision(input,m){
    if(!input||typeof input!=="object")return input;
    const out={...input,warnings:[...(input.warnings||[])],reasons:[...(input.reasons||[])]};
    const match=m||out.match;
    if(!out.bet||!match)return out;
    const market=out.primary||out.market,key=ODDS_KEYS[market],price=selectedPrice(match,market),meta=key?marketMeta(match,key):null;
    const books=num(meta&&meta.bookCount)||num(match.oddsMeta&&match.oddsMeta.bookCount)||0;
    const dispersion=num(meta&&meta.dispersionPct);
    let adjustment=0;const evidence=[];const flags=[];
    if(price!==null){
      evidence.push(`Selected price ${price.toFixed(2)}${books?` across ${books} book(s)`:""}.`);
      const range=RANGES[key];if(range&&(price<range[0]||price>range[1])){adjustment-=1;flags.push("PRICE_OUTSIDE_NORMAL_RELEASE_RANGE");}
    }else{
      flags.push("SELECTED_MARKET_PRICE_MISSING");
      out.warnings.push("Selected-market price is still pending; no odds bonus was added.");
    }
    if(books>=6&&dispersion!==null&&dispersion<=6){adjustment+=3;evidence.push("Six-plus-book consensus is tightly aligned.");}
    else if(books>=4&&dispersion!==null&&dispersion<=10){adjustment+=2;evidence.push("Four-plus-book consensus supports the market.");}
    else if(books>=2&&dispersion!==null&&dispersion<=14){adjustment+=1;evidence.push("Multi-book pricing is reasonably aligned.");}
    if(books>=4&&dispersion!==null&&dispersion>22){adjustment-=5;flags.push("HIGH_BOOKMAKER_DISPERSION");out.warnings.push("Bookmaker prices are widely split.");}
    else if(books>=4&&dispersion!==null&&dispersion>15){adjustment-=3;flags.push("BOOKMAKER_DISPERSION");}
    const conflict=classifyConflict(match,market,key);
    if(conflict.level==="strong"&&books>=3){adjustment-=7;flags.push("STRONG_MARKET_CONTRADICTION");out.warnings.push(conflict.reason);}
    else if(conflict.level==="moderate"&&books>=3){adjustment-=3;flags.push("MARKET_CONTRADICTION");out.warnings.push(conflict.reason);}
    const half=htftSupport(match,market);adjustment+=half.adjustment;if(half.label)evidence.push(half.label);
    adjustment=clamp(adjustment,-10,4);
    const oldScore=num(out.finalScore)??num(out.score)??num(out.confidence)??0;
    const newScore=round(clamp(oldScore+adjustment,0,94),1);
    const severe=flags.includes("STRONG_MARKET_CONTRADICTION")||flags.includes("HIGH_BOOKMAKER_DISPERSION")&&newScore<80;
    out.oddsReview={version:VERSION,market,key,price,bookCount:books,dispersionPct:dispersion,adjustment,flags,evidence,provider:match.oddsMeta&&match.oddsMeta.provider||null,actualHtft:!!(match.htftOdds&&match.htftOdds.actual)};
    if(adjustment>0)out.reasons.push(`Odds confirmation +${adjustment}: ${evidence[evidence.length-1]||"market agreement"}`);
    if(adjustment<0)out.warnings.push(`Odds guard adjustment ${adjustment}.`);
    return recalc(out,newScore,severe);
  }
  return{VERSION,ODDS_KEYS,reviewDecision,selectedPrice};
});
