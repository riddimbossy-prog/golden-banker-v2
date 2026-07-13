/* ============================================================================
 * Predict2U Transparency Intelligence v150
 * Shared by Proof Mode, Engine Conflict Detector, Engine Scorecards,
 * and League DNA.
 *
 * Browser-only, read-only. It never changes a prediction. It explains the
 * engine outputs and the data available at prediction time.
 * ========================================================================== */
(function(root){
  "use strict";

  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const avg=a=>{
    const x=(a||[]).map(num).filter(v=>v!=null);
    return x.length?x.reduce((s,v)=>s+v,0)/x.length:null;
  };
  const pct=v=>v==null?"—":`${Math.round(v*100)}%`;
  const esc=s=>String(s==null?"":s).replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
  const keyOf=m=>m&&m.id!=null?`f${m.id}`:`${m&&m.home||""}|${m&&m.away||""}|${m&&m.matchDate||""}`;
  const LIVE_CODES=new Set(["1H","HT","2H","ET","BT","P","LIVE"]);
  const FINISHED_CODES=new Set(["FT","AET","PEN","AWD","WO"]);
  const isLive=m=>LIVE_CODES.has(String(m&&m.status||"").toUpperCase());
  const isFinished=m=>FINISHED_CODES.has(String(m&&m.status||"").toUpperCase());
  function liveClock(m){
    const st=String(m&&m.status||"").toUpperCase();
    if(st==="HT")return"HT";
    if(st==="BT")return"BREAK";
    if(st==="P")return"PENALTIES";
    const el=num(m&&m.elapsed),ex=num(m&&m.elapsedExtra);
    if(el!=null)return `${Math.round(el)}${ex&&ex>0?`+${Math.round(ex)}`:""}'`;
    if(st==="1H")return"1ST HALF";
    if(st==="2H")return"2ND HALF";
    if(st==="ET")return"EXTRA TIME";
    return m&&m.statusLong?String(m.statusLong).toUpperCase():"LIVE";
  }
  function liveScore(m){
    if(!m||m.homeGoals==null||m.awayGoals==null)return"";
    return `${m.homeGoals}–${m.awayGoals}`;
  }
  function liveStatusText(m){
    if(!isLive(m))return"";
    const score=liveScore(m);
    const clock=liveClock(m);
    return [score,clock].filter(Boolean).join(" · ");
  }

  const shortMarket=mk=>String(mk||"")
    .replace("Home Team Over 1.5 Goals","Home Over 1.5")
    .replace("Away Team Over 1.5 Goals","Away Over 1.5")
    .replace("Home Team Under 1.5 Goals","Home Under 1.5")
    .replace("Away Team Under 1.5 Goals","Away Under 1.5")
    .replace("Home Team Over 0.5 Goals","Home Over 0.5")
    .replace("Away Team Over 0.5 Goals","Away Over 0.5")
    .replace(/ Goals$/,"");

  function registry(){
    return (root.P2U_ENGINE_REGISTRY||[])
      .map(e=>({...e,fnRef:root[e.fn]}))
      .filter(e=>typeof e.fnRef==="function");
  }

  function confidence(v){
    if(typeof v==="number") return v<=10?v*10:v;
    if(v==="High")return 85;
    if(v==="Medium")return 72;
    if(v==="Low")return 55;
    return null;
  }

  function marketFamily(market){
    if(typeof root.marketFamily==="function"){
      try{return root.marketFamily(market);}catch(_){}
    }
    const s=String(market||"").toLowerCase();
    if(s.includes("first half")||s.includes("second half")||s.includes("either half")||s.includes(" ht"))return"HALF";
    if(s.includes("btts"))return"BTTS";
    if(s.includes("team over")||s.includes("team under"))return"TEAM_GOALS";
    if(s.includes("over")||s.includes("under"))return"TOTAL_GOALS";
    if(s.includes("double chance"))return"DOUBLE_CHANCE";
    if(s.includes("dnb"))return"DNB";
    if(s.includes("win")||s==="draw")return"RESULT";
    return"OTHER";
  }

  function direction(market){
    if(typeof root.marketDirection==="function"){
      try{return root.marketDirection(market);}catch(_){}
    }
    const s=String(market||"").toLowerCase();
    if(s.includes("over"))return"OVER";
    if(s.includes("under"))return"UNDER";
    if(s.includes("btts yes"))return"YES";
    if(s.includes("btts no"))return"NO";
    if(s.includes("home")||s.includes("1x"))return"HOME";
    if(s.includes("away")||s.includes("x2"))return"AWAY";
    if(s==="draw"||s.includes("ht draw"))return"DRAW";
    return"NEUTRAL";
  }

  function incompatible(a,b){
    const fa=marketFamily(a),fb=marketFamily(b),da=direction(a),db=direction(b);
    if(fa===fb&&((da==="OVER"&&db==="UNDER")||(da==="UNDER"&&db==="OVER")))return true;
    if(fa==="BTTS"&&fb==="BTTS"&&da!==db)return true;
    const resultish=new Set(["RESULT","DNB","DOUBLE_CHANCE"]);
    if(resultish.has(fa)&&resultish.has(fb)){
      if((da==="HOME"&&db==="AWAY")||(da==="AWAY"&&db==="HOME"))return true;
      if((da==="DRAW"&&db!=="DRAW")||(db==="DRAW"&&da!=="DRAW"))return true;
    }
    return false;
  }

  function getPath(obj,path){
    return String(path).split(".").reduce((o,k)=>o==null?null:o[k],obj);
  }
  function present(v){
    if(v==null)return false;
    if(typeof v==="number")return Number.isFinite(v);
    if(typeof v==="string")return v.trim()!=="";
    if(Array.isArray(v))return v.length>0;
    if(typeof v==="object")return Object.keys(v).length>0;
    return false;
  }
  function both(m,a,b){return present(getPath(m,a))&&present(getPath(m,b));}

  function coverageFor(m){
    const checks=[
      {key:"standings",label:"Standings",weight:10,ok:both(m,"homePos","awayPos"),detail:"League positions and table context"},
      {key:"recent10",label:"Recent 10",weight:12,ok:both(m,"homeRecent10PPG","awayRecent10PPG"),detail:"Rolling last-ten PPG and form"},
      {key:"leagueTrend",label:"League trend",weight:12,ok:present(getPath(m,"leagueTrends.sample"))&&Number(m.leagueTrends.sample)>=30,detail:"Finished-match league sample"},
      {key:"opponent",label:"Opponent strength",weight:10,ok:both(m,"homeOpponentAvgPPG","awayOpponentAvgPPG"),detail:"Strength of recent opponents"},
      {key:"rest",label:"Rest & density",weight:7,ok:both(m,"homeRestDays","awayRestDays")&&both(m,"fixtureDensity.home","fixtureDensity.away"),detail:"Rest days and schedule congestion"},
      {key:"similar",label:"Similar opponents",weight:7,ok:both(m,"homeSimilarOpponentPPG","awaySimilarOpponentPPG"),detail:"Results against comparable opposition"},
      {key:"stability",label:"Split stability",weight:6,ok:both(m,"homeSplitBlockDifference","awaySplitBlockDifference"),detail:"Home/away block consistency"},
      {key:"momentum",label:"Momentum",weight:10,ok:both(m,"momentum.home","momentum.away"),detail:"Chronological improvement or decline"},
      {key:"odds",label:"Market odds",weight:9,ok:present(m.odds)&&["home","draw","away"].every(k=>num(m.odds[k])>1),detail:"Current market prices"},
      {key:"books",label:"Multi-book movement",weight:5,ok:Array.isArray(m.oddsBooks)&&m.oddsBooks.length>=4,detail:"Four independent bookmaker snapshots"},
      {key:"xg",label:"Expected goals",weight:5,ok:both(m,"homeProfile.xgFor","awayProfile.xgFor")||both(m,"xgHomeReal","xgAwayReal"),detail:"Direct or profile xG"},
      {key:"sot",label:"Shots on target",weight:3,ok:both(m,"homeSOTFor","awaySOTFor")||both(m,"homeProfile.sotFor","awayProfile.sotFor"),detail:"SOT profiles"},
      {key:"halves",label:"Half data",weight:2,ok:both(m,"homeStreaks.htft","awayStreaks.htft")||both(m,"htHome","htAway"),detail:"First/second-half evidence"},
      {key:"calibration",label:"Model calibration",weight:2,ok:present(m.modelCalibration)||present(m.modelProbabilities),detail:"Forward-tracked probability intervals"}
    ];
    const total=checks.reduce((s,c)=>s+c.weight,0);
    const earned=checks.reduce((s,c)=>s+(c.ok?c.weight:0),0);
    const score=Math.round(100*earned/total);
    const label=score>=85?"Verified Data":score>=70?"Strong Coverage":score>=50?"Partial Coverage":score>=30?"Thin Data":"Insufficient Data";
    return {score,label,checks,available:checks.filter(c=>c.ok).length,total:checks.length};
  }

  function runVotes(m){
    return registry().map(e=>{
      let out=null,error=null;
      try{out=e.fnRef(m);}catch(x){error=x&&x.message?x.message:String(x);}
      const bet=!!(out&&out.bet&&out.primary&&out.primary!=="No Bet");
      return {
        key:e.key,name:e.name,family:e.family,version:e.version,description:e.description,
        bet,market:bet?out.primary:null,confidence:confidence(out&&out.confidence),
        dataQuality:num(out&&out.dataQuality),
        grade:out&&out.grade||null,score:num(out&&out.score),
        finalStatus:out&&out.final_status||null,veto:out&&out.veto||null,
        reasons:Array.isArray(out&&out.reasons)?out.reasons:[],
        warnings:Array.isArray(out&&out.warnings)?out.warnings:[],
        humanChecks:Array.isArray(out&&out.humanChecks)?out.humanChecks:[],
        error,out
      };
    });
  }

  function conflictFor(votes,coverage){
    const active=(votes||[]).filter(v=>v.bet);
    const silent=(votes||[]).filter(v=>!v.bet);
    const groups={};
    for(const v of active){
      const g=groups[v.market]||(groups[v.market]={market:v.market,family:marketFamily(v.market),direction:direction(v.market),supporters:[],scores:[]});
      g.supporters.push(v);
      if(v.confidence!=null)g.scores.push(v.confidence);
    }
    const ranked=Object.values(groups).map(g=>({
      ...g,count:g.supporters.length,avgConfidence:avg(g.scores)
    })).sort((a,b)=>b.count-a.count||(b.avgConfidence||0)-(a.avgConfidence||0));
    const top=ranked[0]||null;
    const share=top&&active.length?top.count/active.length:0;
    let hostile=false;
    for(let i=0;i<ranked.length;i++)for(let j=i+1;j<ranked.length;j++){
      if(incompatible(ranked[i].market,ranked[j].market))hostile=true;
    }

    let code,label,level,reason;
    if(!active.length){
      code="NO_BET";label="No Bet";level="quiet";
      reason="All engines abstained or lacked enough qualified evidence.";
    }else if(coverage.score<35&&active.length<=2){
      code="DATA_CONFLICT";label="Data Conflict";level="danger";
      reason="A small number of picks appeared while the fixture data remained thin.";
    }else if(ranked.length===1&&active.length>=4){
      code="FULL_AGREEMENT";label="Full Agreement";level="strong";
      reason=`All ${active.length} active engines selected the exact same market.`;
    }else if(ranked.length===1){
      code="EXACT_AGREEMENT";label="Exact Agreement";level="good";
      reason=`Every active engine selected ${top.market}.`;
    }else if(hostile){
      code="MARKET_CONFLICT";label="Market Conflict";level="danger";
      reason="Engines selected markets pointing in opposing directions.";
    }else if(top&&top.count>=3&&share>=.67){
      code="STRONG_AGREEMENT";label="Strong Agreement";level="strong";
      reason=`${top.count} of ${active.length} active engines selected the same exact market.`;
    }else if(top&&share>=.50){
      code="SPLIT_DECISION";label="Split Decision";level="warn";
      reason="A leading market exists, but meaningful engine disagreement remains.";
    }else{
      code="MARKET_CONFLICT";label="Market Conflict";level="danger";
      reason="No exact market controls a majority of active engine votes.";
    }
    return {
      code,label,level,reason,active:active.length,silent:silent.length,
      groups:ranked,top,topShare:share,hostile,total:votes.length
    };
  }

  function analyseMatch(m){
    const coverage=coverageFor(m);
    const votes=runVotes(m);
    const conflict=conflictFor(votes,coverage);
    return {match:m,key:keyOf(m),votes,coverage,conflict,generatedAt:new Date().toISOString()};
  }

  function findMatch(matches,key){
    return (matches||[]).find(m=>keyOf(m)===key)||null;
  }

  function proofHref(m){
    return `proof.html?match=${encodeURIComponent(keyOf(m))}`;
  }

  function resultOf(m,market){
    if(!m||m.homeGoals==null||typeof root.settle!=="function")return"";
    try{return root.settle(market,m.homeGoals,m.awayGoals,m.status,m)||"";}catch(_){return"";}
  }

  function oddsFor(m,market){
    const o=m&&m.odds||{};
    const map={
      "Home Win":"home","Draw":"draw","Away Win":"away",
      "Over 1.5":"over15","Over 1.5 Goals":"over15",
      "Over 2.5":"over25","Over 2.5 Goals":"over25",
      "Over 3.5":"over35","Over 3.5 Goals":"over35",
      "Under 1.5":"under15","Under 1.5 Goals":"under15",
      "Under 2.5":"under25","Under 2.5 Goals":"under25",
      "Under 3.5":"under35","Under 3.5 Goals":"under35",
      "BTTS Yes":"bttsYes","BTTS No":"bttsNo",
      "Double Chance 1X":"dc1x","Double Chance 12":"dc12","Double Chance X2":"dcx2",
      "First Half Over 0.5":"fhOver05","First Half Under 1.5":"fhUnder15"
    };
    const k=map[market],v=k?num(o[k]):null;
    return v&&v>1?v:null;
  }

  function isoTime(v){
    if(!v)return"—";
    try{return new Date(v).toLocaleString([],{dateStyle:"medium",timeStyle:"short"});}catch(_){return String(v);}
  }

  async function fetchJSON(url,fallback){
    try{
      const r=await fetch(url,{cache:"no-store"});
      if(!r.ok)return fallback;
      return await r.json();
    }catch(_){return fallback;}
  }

  function buildScorecards(log,calibration){
    const picks=Array.isArray(log&&log.picks)?log.picks:[];
    const groups=calibration&&calibration.groups||{};
    return registry().map(e=>{
      const all=picks.filter(p=>(p.engineKey===e.key||p.engine===e.name));
      const settled=all.filter(p=>p.result==="Won"||p.result==="Lost")
        .sort((a,b)=>Date.parse(b.recordedAt||b.matchDate||0)-Date.parse(a.recordedAt||a.matchDate||0));
      const won=settled.filter(p=>p.result==="Won").length,lost=settled.length-won;
      const now=Date.now(),since7=now-7*86400000,since30=now-30*86400000,since90=now-90*86400000;
      const seven=settled.filter(p=>Date.parse(p.recordedAt||p.matchDate||0)>=since7);
      const thirty=settled.filter(p=>Date.parse(p.recordedAt||p.matchDate||0)>=since30);
      const ninety=settled.filter(p=>Date.parse(p.recordedAt||p.matchDate||0)>=since90);
      const w7=seven.filter(p=>p.result==="Won").length;
      const w30=thirty.filter(p=>p.result==="Won").length;
      const w90=ninety.filter(p=>p.result==="Won").length;
      const by=(field)=>{
        const map={};
        for(const p of settled){
          const k=p[field]||"Unknown";
          const x=map[k]||(map[k]={name:k,n:0,w:0});
          x.n++;if(p.result==="Won")x.w++;
        }
        return Object.values(map).filter(x=>x.n>=5).sort((a,b)=>(b.w/b.n)-(a.w/a.n)||b.n-a.n)[0]||null;
      };
      const form=settled.slice(0,5).map(p=>p.result==="Won"?"W":"L").join("-")||"—";
      const cal=Object.entries(groups).filter(([k,g])=>k.includes(`|${e.key}|`)&&g&&g.validated);
      const bestCal=cal.sort((a,b)=>(b[1].sample||0)-(a[1].sample||0))[0];
      return {
        ...e,total:all.length,settled:settled.length,won,lost,
        hitPct:settled.length?won/settled.length:null,
        sevenN:seven.length,sevenW:w7,sevenL:seven.length-w7,sevenPct:seven.length?w7/seven.length:null,
        thirtyN:thirty.length,thirtyW:w30,thirtyL:thirty.length-w30,thirtyPct:thirty.length?w30/thirty.length:null,
        ninetyN:ninety.length,ninetyW:w90,ninetyL:ninety.length-w90,ninetyPct:ninety.length?w90/ninety.length:null,
        form,bestMarket:by("market"),bestLeague:by("league"),
        calibration:bestCal?{status:bestCal[1].grade||"Validated",sample:bestCal[1].sample,key:bestCal[0]}:{status:"Learning",sample:0}
      };
    });
  }

  function buildLeagueDNA(matches,trackLog){
    const by={};
    for(const m of matches||[]){
      const name=m.league||"Unknown league";
      const x=by[name]||(by[name]={league:name,country:m.country||"",flag:m.flag||"",matches:[],trend:null});
      x.matches.push(m);
      if(m.leagueTrends&&(!x.trend||Number(m.leagueTrends.sample||0)>Number(x.trend.sample||0)))x.trend=m.leagueTrends;
    }
    const picks=Array.isArray(trackLog&&trackLog.picks)?trackLog.picks:[];
    return Object.values(by).map(x=>{
      const t=x.trend||{},rates=t.rates||{};
      const rateRows=Object.entries(rates).filter(([,v])=>num(v)!=null).sort((a,b)=>b[1]-a[1]);
      const safe=rateRows.filter(([k])=>!/Over 0\.5|Under 4\.5/.test(k));
      const best=(safe[0]||rateRows[0]||[null,null]);
      const low=rateRows.filter(([k])=>/Home Win|Away Win|Draw|Over 2\.5|BTTS/.test(k)).sort((a,b)=>a[1]-b[1])[0]||[null,null];
      const coverage=Math.round(avg(x.matches.map(m=>coverageFor(m).score))||0);
      const leagueSettled=picks.filter(p=>p.league===x.league&&(p.result==="Won"||p.result==="Lost"));
      const engineMap={};
      for(const p of leagueSettled){
        const k=p.engineKey||p.engine||"Unknown";
        const e=engineMap[k]||(engineMap[k]={name:p.engine||k,n:0,w:0});
        e.n++;if(p.result==="Won")e.w++;
      }
      const bestEngine=Object.values(engineMap).filter(e=>e.n>=5).sort((a,b)=>(b.w/b.n)-(a.w/a.n)||b.n-a.n)[0]||null;
      const current=x.matches.filter(m=>m.homeGoals==null).length;
      let volatility="Medium";
      if(!t.sample||t.sample<30||t.smallSample)volatility="High";
      else if(t.sample>=100&&Math.abs((rates.Draw||.27)-.27)<.08)volatility="Low";
      const gpg=num(t.gpg)||num(x.matches[0]&&x.matches[0].leagueAvg&&x.matches[0].leagueAvg.goalsPerGame);
      return {
        ...x,sample:num(t.sample)||0,identity:t.identity||"Unclassified",
        gpg,coverage,current,bestMarket:best[0],bestRate:best[1],
        dangerMarket:low[0],dangerRate:low[1],volatility,rates,
        bestEngine,top3:Array.isArray(t.top3)?t.top3:rateRows.slice(0,3).map(([market,rate])=>({market,rate}))
      };
    }).sort((a,b)=>b.sample-a.sample||a.league.localeCompare(b.league));
  }

  root.P2UIntelligence={
    registry,confidence,marketFamily,direction,incompatible,coverageFor,runVotes,
    conflictFor,analyseMatch,findMatch,keyOf,proofHref,resultOf,oddsFor,
    shortMarket,esc,pct,isoTime,fetchJSON,buildScorecards,buildLeagueDNA,
    isLive,isFinished,liveClock,liveScore,liveStatusText
  };
})(typeof window!=="undefined"?window:globalThis);
