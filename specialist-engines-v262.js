/* Predict2U v262 — GG Machine + Mismatch Engine (strict specialist extension). */
(function(root,factory){
  const api=factory(root||{});
  Object.keys(api).forEach(key=>{root[key]=api[key];});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
  "use strict";

  const VERSION="2026.07-v262";
  const num=v=>v===null||v===undefined||v===""||!Number.isFinite(Number(v))?null:Number(v);
  const rate=v=>{const n=num(v);return n===null?null:(n>1.00001?n/100:n);};
  const first=(...v)=>{for(const x of v){const n=num(x);if(n!==null)return n;}return null;};
  const get=(o,p)=>String(p).split(".").reduce((x,k)=>x==null?undefined:x[k],o);
  const getNum=(o,paths)=>{for(const p of paths){const n=num(get(o,p));if(n!==null)return n;}return null;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const round=(v,d=1)=>v==null?null:Number(Number(v).toFixed(d));
  const safeDiv=(a,b)=>num(a)!==null&&num(b)!==null&&Number(b)!==0?Number(a)/Number(b):null;
  const formPPG=v=>{const a=String(v||"").toUpperCase().split("").filter(x=>/[WDL]/.test(x));return a.length?a.reduce((s,x)=>s+(x==="W"?3:x==="D"?1:0),0)/a.length:null;};
  const fixtureId=m=>String(m&&m.id!=null?m.id:`${m&&m.home||"home"}|${m&&m.away||"away"}|${m&&m.matchDate||"date"}`);
  const oddsKey={
    "Home Win":"home","Away Win":"away","Home DNB":"homeDnb","Away DNB":"awayDnb",
    "Double Chance 1X":"dc1x","Double Chance X2":"dcx2","Over 1.5 Goals":"over15","Under 3.5 Goals":"under35",
    "BTTS Yes":"bttsYes","BTTS No":"bttsNo","Home Team Over 0.5 Goals":"homeOver05","Away Team Over 0.5 Goals":"awayOver05",
    "Home Team Over 1.5 Goals":"homeOver15","Away Team Over 1.5 Goals":"awayOver15",
    "Home Win Either Half":"homeWinEitherHalf","Away Win Either Half":"awayWinEitherHalf"
  };
  function odd(m,market){const k=oddsKey[market];const n=k&&m&&m.odds?num(m.odds[k]):null;return n!==null?n:null;}
  function profile(m,side){
    const home=side==="home";
    const venueGames=first(m&&m[`${side}VenueGames`],getNum(m,[`${side}Profile.games`,`${side}Streaks.sample`]));
    const totalGames=first(getNum(m,[`${side}Streaks.sample`,`recent10.${side}.sample`]),venueGames?venueGames*2:null);
    const venuePPG=first(getNum(m,[`${side}VenuePPG`]),safeDiv(m&&m[`${side}VenuePts`],venueGames));
    const overallPPG=first(getNum(m,[`${side}OverallPPG`,`${side}PPG`,`${side}Recent10PPG`,`recent10.${side}.ppg`]),safeDiv(m&&m[`${side}Pts`],totalGames),formPPG(m&&m[`${side}Form`]));
    const ppg=first(venuePPG,overallPPG);
    const gf=home?first(m&&m.homeScoredAtHome,getNum(m,["homeProfile.goalsFor.v"])):first(m&&m.awayScoredAway,getNum(m,["awayProfile.goalsFor.v"]));
    const ga=home?first(m&&m.homeConcededAtHome,getNum(m,["homeProfile.goalsAg.v"])):first(m&&m.awayConcededAway,getNum(m,["awayProfile.goalsAg.v"]));
    const cs=rate(first(m&&m[`${side}CleanSheetRate`],getNum(m,[`${side}Streaks.htft.ftCS`])));
    const fts=rate(first(m&&m[`${side}FailedToScoreRate`],getNum(m,[`${side}Streaks.htft.ftFTS`])));
    const unbeaten=rate(first(m&&m[`${side}UnbeatenRate`]));
    const win=rate(first(m&&m[`${side}WinRate`]));
    const scoring=fts===null?null:1-fts;
    const conceding=cs===null?null:1-cs;
    const noLoss=first(getNum(m,[`${side}Streaks.noLoss`]),0);
    const noWin=first(getNum(m,[`${side}Streaks.noWin`]),0);
    const winStreak=first(getNum(m,[`${side}Streaks.win`]),0);
    const lossStreak=first(getNum(m,[`${side}Streaks.loss`]),0);
    const position=first(m&&m[`${side}Pos`]);
    const tableSize=first(m&&m.tableSize,m&&m.venueTableSize);
    const firstHalfFor=rate(first(m&&m[`${side}1HFor`],getNum(m,[`${side}Streaks.htft.fhFor`])));
    const firstHalfAgainst=rate(first(m&&m[`${side}1HAgainst`],getNum(m,[`${side}Streaks.htft.fhAg`])));
    const wonEitherHalf=rate(first(getNum(m,[`${side}Streaks.htft.wonEitherHalf`])));
    return {side,venueGames,totalGames,venuePPG,overallPPG,ppg,gf,ga,cs,fts,unbeaten,win,scoring,conceding,noLoss,noWin,winStreak,lossStreak,position,tableSize,firstHalfFor,firstHalfAgainst,wonEitherHalf};
  }
  function dataQuality(m,h,a){
    const missing=[];
    if(!m||!m.home||!m.away)missing.push("fixture teams");
    if(!m||!m.league)missing.push("league");
    if(h.venueGames===null||h.venueGames<8)missing.push("home split sample >= 8");
    if(a.venueGames===null||a.venueGames<8)missing.push("away split sample >= 8");
    if(h.ppg===null||a.ppg===null)missing.push("split PPG");
    if(h.gf===null||a.gf===null||h.ga===null||a.ga===null)missing.push("split goals for/against");
    return {pass:missing.length===0,missing,score:clamp(100-missing.length*22,0,100)};
  }
  function result(m,id,name,version,market,score,reasons,calculations,warnings=[]){
    const bet=!!market&&score>=82;
    let out={match:m,fixtureId:fixtureId(m),engine:id,engineId:id,engineName:name,version,status:bet?"qualified":"rejected",primary:bet?market:"No Bet",market:bet?market:"No Bet",selection:bet?market:"No Bet",bet,banker:bet&&score>=90,confidence:bet?round(score/10,1):0,finalScore:bet?round(score,1):0,grade:bet?(score>=90?"A1 Banker":"A2 Strong Pick"):"No Bet",reasons:Array.isArray(reasons)?reasons:[],shortReason:Array.isArray(reasons)&&reasons[0]?reasons[0]:"Release gate not met.",warnings,calculations:calculations||{},dataQuality:calculations&&calculations.dataQuality||0};
    const guard=root.P2UOddsGuard;
    if(guard&&typeof guard.reviewDecision==="function")out=guard.reviewDecision(out,m);
    return out;
  }
  function noBet(m,id,name,version,reason,calculations={},warnings=[]){return result(m,id,name,version,null,0,[reason],calculations,warnings);}

  function ggMachineRecommend(m){
    const id="ggMachine",name="GG Machine",version="1.0",h=profile(m,"home"),a=profile(m,"away"),q=dataQuality(m,h,a);
    if(!q.pass)return noBet(m,id,name,version,`Missing mandatory GG split evidence: ${q.missing.join(", ")}.`,{dataQuality:q.score});
    const btts=odd(m,"BTTS Yes"),u35=odd(m,"Under 3.5 Goals");
    const checks=[
      ["Home scores in at least 70%",h.scoring,h.scoring!==null&&h.scoring>=.70],
      ["Away scores in at least 70%",a.scoring,a.scoring!==null&&a.scoring>=.70],
      ["Home concedes in at least 70%",h.conceding,h.conceding!==null&&h.conceding>=.70],
      ["Away concedes in at least 70%",a.conceding,a.conceding!==null&&a.conceding>=.70],
      ["Home clean sheets below 20%",h.cs,h.cs!==null&&h.cs<.20],
      ["Away clean sheets below 20%",a.cs,a.cs!==null&&a.cs<.20],
      ["Home split PPG at least 1.50",h.ppg,h.ppg!==null&&h.ppg>=1.50],
      ["Away split PPG at least 1.50",a.ppg,a.ppg!==null&&a.ppg>=1.50],
      ["Home split scoring average at least 1.00",h.gf,h.gf!==null&&h.gf>=1.00],
      ["Away split scoring average at least 1.00",a.gf,a.gf!==null&&a.gf>=1.00],
      ["BTTS Yes odds no higher than 1.70",btts,btts!==null&&btts<=1.70],
      ["Under 3.5 odds at least 1.57",u35,u35!==null&&u35>=1.57]
    ];
    const failed=checks.filter(x=>!x[2]);
    if(failed.length)return noBet(m,id,name,version,`GG Machine rejected: ${failed[0][0]} failed.`,{dataQuality:q.score,failed:failed.map(x=>({rule:x[0],actual:round(x[1],2)})),home:h,away:a,bttsYesOdds:btts,under35Odds:u35});
    const margins=(h.scoring-.70)+(a.scoring-.70)+(h.conceding-.70)+(a.conceding-.70)+(1.70-btts)+(u35-1.57);
    const score=clamp(86+margins*8+(h.ppg>=1.8&&a.ppg>=1.8?2:0),86,94);
    return result(m,id,name,version,"BTTS Yes",score,[
      `Both split profiles score and concede at the required 70% floor.`,
      `Clean-sheet rates are ${Math.round(h.cs*100)}% and ${Math.round(a.cs*100)}%, both below 20%.`,
      `Split PPG is ${round(h.ppg,2)} vs ${round(a.ppg,2)}; BTTS ${round(btts,2)}, Under 3.5 ${round(u35,2)}.`
    ],{dataQuality:q.score,home:h,away:a,bttsYesOdds:btts,under35Odds:u35,checks:checks.map(x=>({rule:x[0],actual:round(x[1],2),pass:x[2]}))});
  }

  function isTop4(p){return p.position!==null&&p.position<=4;}
  function isBottom4(p){return p.position!==null&&p.tableSize!==null&&p.position>=Math.max(1,p.tableSize-3);}
  function bestProfile(p,price){return p.ppg!==null&&p.ppg>=2.20&&p.gf!==null&&p.gf>=2.00&&isTop4(p)&&price!==null&&price<=1.55&&(p.noLoss>=5||(p.unbeaten!==null&&p.unbeaten>=.80));}
  function worstProfile(p,price){return p.ppg!==null&&p.ppg<=.80&&p.gf!==null&&p.gf<=.80&&isBottom4(p)&&price!==null&&price>=4.50&&(p.noWin>=5||(p.win!==null&&p.win<=.20));}
  function all(v){return v.every(Boolean);}
  function mismatchEngineRecommend(m){
    const id="mismatchEngine",name="Mismatch Engine",version="2.0",h=profile(m,"home"),a=profile(m,"away"),q=dataQuality(m,h,a);
    if(!q.pass)return noBet(m,id,name,version,`Mismatch requires complete opposite split data: ${q.missing.join(", ")}.`,{dataQuality:q.score});
    const ho=odd(m,"Home Win"),ao=odd(m,"Away Win");
    const homeBest=bestProfile(h,ho),awayWorst=worstProfile(a,ao),awayBest=bestProfile(a,ao),homeWorst=worstProfile(h,ho);
    const candidates=[];
    const add=(market,score,conditions,why)=>{if(all(conditions)&&odd(m,market)!==null)candidates.push({market,score,why,conditions});};

    add("Home Win",94,[homeBest,awayWorst,h.ga<=1.10,a.ga>=1.80,(h.ppg-a.ppg)>=1.40],"Top-four home side meets the Best Team profile while the visitor meets the opposite Worst Team profile.");
    add("Away Win",94,[awayBest,homeWorst,a.ga<=1.10,h.ga>=1.80,(a.ppg-h.ppg)>=1.40],"Top-four away side meets the Best Team profile while the host meets the opposite Worst Team profile.");
    add("Double Chance 1X",88,[h.ppg>=1.80,a.ppg<=1.00,(h.unbeaten||0)>=.80,(a.win||0)<=.20,odd(m,"Double Chance 1X")<=1.35],"Home resilience and away weakness are clear opposites.");
    add("Double Chance X2",88,[a.ppg>=1.80,h.ppg<=1.00,(a.unbeaten||0)>=.80,(h.win||0)<=.20,odd(m,"Double Chance X2")<=1.35],"Away resilience and home weakness are clear opposites.");
    add("Home Team Over 0.5 Goals",87,[h.scoring>=.85,a.conceding>=.80,h.fts<=.15,a.cs<.20,h.ppg>=1.50,odd(m,"Home Team Over 0.5 Goals")<=1.35],"Elite home scoring frequency faces a defence that rarely keeps clean sheets.");
    add("Away Team Over 0.5 Goals",87,[a.scoring>=.85,h.conceding>=.80,a.fts<=.15,h.cs<.20,a.ppg>=1.50,odd(m,"Away Team Over 0.5 Goals")<=1.35],"Elite away scoring frequency faces a defence that rarely keeps clean sheets.");
    add("Home Team Over 1.5 Goals",89,[h.gf>=1.80,a.ga>=1.60,h.scoring>=.80,a.conceding>=.80,odd(m,"Home Team Over 1.5 Goals")>=1.40,odd(m,"Home Team Over 1.5 Goals")<=2.00],"Strong home attack and weak away defence pass every team-goal mismatch gate.");
    add("Away Team Over 1.5 Goals",89,[a.gf>=1.80,h.ga>=1.60,a.scoring>=.80,h.conceding>=.80,odd(m,"Away Team Over 1.5 Goals")>=1.40,odd(m,"Away Team Over 1.5 Goals")<=2.00],"Strong away attack and weak home defence pass every team-goal mismatch gate.");
    add("Over 1.5 Goals",86,[h.gf+a.gf>=2.20,h.ga+a.ga>=2.20,(h.scoring>=.75||a.scoring>=.75),(h.conceding>=.70||a.conceding>=.70),odd(m,"Over 1.5 Goals")<=1.35],"Attacking and conceding directions are clearly aligned for the safer total.");
    add("Under 3.5 Goals",86,[h.gf+a.gf<=2.40,h.ga+a.ga<=2.60,h.gf<=2.00,a.gf<=2.00,odd(m,"Under 3.5 Goals")<=1.45],"Both profiles are clearly compressed below the four-goal line.");
    add("BTTS No",88,[((h.cs>=.50&&a.fts>=.55&&a.gf<=.80&&h.ga<=.90)||(a.cs>=.50&&h.fts>=.55&&h.gf<=.80&&a.ga<=.90)),odd(m,"BTTS No")<=1.75],"One attack is clearly weak while the opposing defence is clearly strong.");
    add("Home Win Either Half",88,[h.wonEitherHalf>=.70,a.wonEitherHalf!==null&&a.wonEitherHalf<=.35,h.ppg>=1.65,a.ppg<=1.10,h.firstHalfFor>=.55,a.firstHalfAgainst>=.55,odd(m,"Home Win Either Half")<=1.70],"Home half dominance and away half weakness are opposite without a borderline signal.");
    add("Away Win Either Half",88,[a.wonEitherHalf>=.70,h.wonEitherHalf!==null&&h.wonEitherHalf<=.35,a.ppg>=1.65,h.ppg<=1.10,a.firstHalfFor>=.55,h.firstHalfAgainst>=.55,odd(m,"Away Win Either Half")<=1.70],"Away half dominance and home half weakness are opposite without a borderline signal.");

    candidates.sort((x,y)=>y.score-x.score);
    const c=candidates[0];
    if(!c)return noBet(m,id,name,version,"No market produced a complete opposite-stat profile; borderline and partial mismatches are rejected.",{dataQuality:q.score,home:h,away:a,homeOdds:ho,awayOdds:ao,bestWorst:{homeBest,awayWorst,awayBest,homeWorst}});
    return result(m,id,name,version,c.market,c.score,[c.why,`PPG ${round(h.ppg,2)} vs ${round(a.ppg,2)}; goals scored ${round(h.gf,2)} vs ${round(a.gf,2)}.`,`No partial-credit or fallback market was used.`],{dataQuality:q.score,home:h,away:a,homeOdds:ho,awayOdds:ao,bestWorst:{homeBest,awayWorst,awayBest,homeWorst},qualifiedMarkets:candidates.map(x=>({market:x.market,score:x.score}))});
  }

  const ADDITIONS=[
    {key:"ggMachine",name:"GG Machine",fn:"ggMachineRecommend",family:"Specialist",version:"1.0",description:"Strict BTTS Yes machine using 70% split scoring/conceding, low clean sheets, PPG and odds confirmation."},
    {key:"mismatchEngine",name:"Mismatch Engine",fn:"mismatchEngineRecommend",family:"Specialist",version:"2.0",description:"No-borderline opposite-stat engine across result, team-goal, total-goal, BTTS and half markets."}
  ];
  const existing=Array.isArray(root.P2U_ENGINE_REGISTRY)?root.P2U_ENGINE_REGISTRY:[];
  const keys=new Set(ADDITIONS.map(x=>x.key));
  const merged=[...existing.filter(x=>!keys.has(x&&x.key)),...ADDITIONS];
  root.P2U_ENGINE_REGISTRY=merged;
  root.P2U_SPECIALIST_V262_REGISTRY=ADDITIONS;
  root.P2U_ENGINE_COUNT=merged.length;
  return {VERSION,ggMachineRecommend,mismatchEngineRecommend,P2U_SPECIALIST_V262_REGISTRY:ADDITIONS,P2U_ENGINE_REGISTRY:merged,profile,bestProfile,worstProfile};
});
