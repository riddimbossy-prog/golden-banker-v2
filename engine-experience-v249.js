/* Predict2U v249 — shared engine page and per-engine banker helpers. */
(function(root,factory){
  const api=factory();
  root.P2UEngineExperience=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";

  const PALETTES={
    normal:["#55d98a","#0b2a1d"],strict:["#5fc7ff","#0b2432"],ultra:["#a68cff","#21163e"],
    elite:["#ffca62","#35250d"],apex:["#ff7d9c","#3a1420"],prime:["#73e5d1","#0b302b"],
    expert:["#e6a8ff","#2b1635"],pro:["#f5f7ff","#262a36"],trend:["#70c8ff","#10293a"],
    streaks:["#ff9c63","#3c1c0d"],mismatch:["#f3d45c","#362e0d"],halves:["#8cf1ff","#0b3034"],
    "league-bias":["#7ca7ff","#14203d"],momentum:["#ff7d62","#3d190f"],"odds-iq":["#c9ff66","#26370d"],
    value:["#f6b84e","#3a2809"],controlEdge:["#52e0a4","#0d3125"],leagueSignalMatrix:["#8f9dff","#20254a"],
    marketFlow:["#5dd7ff","#0b2d3b"],goalCompression:["#ff8f71","#3b1c14"]
  };
  const ODDS={
    "Home Win":"home","Draw":"draw","Away Win":"away","Over 1.5":"over15","Over 2.5":"over25","Over 3.5":"over35",
    "Under 1.5":"under15","Under 2.5":"under25","Under 3.5":"under35","BTTS Yes":"bttsYes","BTTS No":"bttsNo",
    "Double Chance 1X":"dc1x","Double Chance 12":"dc12","Double Chance X2":"dcx2","Home DNB":"homeDnb","Away DNB":"awayDnb",
    "First Half Over 0.5":"fhOver05","First Half Under 1.5":"fhUnder15","Second Half Over 0.5":"shOver05","Second Half Over 1.5":"shOver15",
    "Home Team Over 0.5":"homeOver05","Away Team Over 0.5":"awayOver05","Home Team Over 1.5":"homeOver15","Away Team Over 1.5":"awayOver15"
  };

  function dateOf(match){
    const direct=String(match&&match.matchDate||"").slice(0,10);
    if(/^\d{4}-\d{2}-\d{2}$/.test(direct))return direct;
    const kickoff=String(match&&match.kickoff||"").slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(kickoff)?kickoff:"";
  }
  function normaliseMarket(market){return String(market||"").replace(/ Goals$/,'').trim();}
  function oddFor(match,market){
    const key=ODDS[normaliseMarket(market)];
    const value=key&&match&&match.odds?Number(match.odds[key]):NaN;
    return Number.isFinite(value)&&value>1?value:null;
  }
  function confidenceOf(out){
    if(!out)return 0;
    const raw=out.confidence!=null?out.confidence:(out.finalScore!=null?out.finalScore:out.score);
    if(typeof raw==="number"&&Number.isFinite(raw)){
      if(raw<=1)return Math.max(0,Math.min(10,raw*10));
      if(raw>10)return Math.max(0,Math.min(10,raw/10));
      return Math.max(0,Math.min(10,raw));
    }
    const text=String(raw||out.grade||"").toUpperCase();
    if(/A\+|A1|ELITE|MAX/.test(text))return 9.6;
    if(/A2|HIGH|STRONG|BANKER/.test(text))return 8.8;
    if(/A|B\+/.test(text))return 8.2;
    if(/MEDIUM|B/.test(text))return 7.2;
    if(/LOW|C/.test(text))return 6;
    return out.banker?8.4:7;
  }
  function isQualified(out){
    if(!out||out.bet===false)return false;
    const market=String(out.primary||out.market||out.selection||"").trim();
    return !!market&&!/^(NO BET|SKIP|PASS)$/i.test(market);
  }
  function reasonsOf(out){
    const rows=[];
    if(Array.isArray(out&&out.reasons))rows.push(...out.reasons);
    if(Array.isArray(out&&out.warnings))rows.push(...out.warnings.map(x=>`Warning: ${x}`));
    if(out&&out.shortReason)rows.push(out.shortReason);
    return rows.filter(Boolean).map(String).slice(0,4);
  }
  function pickKey(match){return match&&match.id!=null?`f${match.id}`:`${match&&match.home||''}|${match&&match.away||''}|${dateOf(match)}`;}
  function runEngine(matches,engine,date){
    const fn=engine&&typeof globalThis[engine.fn]==="function"?globalThis[engine.fn]:null;
    if(!fn)return [];
    const rows=[];
    for(const match of (Array.isArray(matches)?matches:[])){
      if(date&&dateOf(match)!==date)continue;
      let out=null;
      try{out=fn(match);}catch(_){continue;}
      if(!isQualified(out))continue;
      const market=String(out.primary||out.market||out.selection).trim();
      rows.push({
        key:pickKey(match),match,out,market,banker:!!out.banker,confidence:confidenceOf(out),odd:oddFor(match,market),reasons:reasonsOf(out)
      });
    }
    return rows.sort((a,b)=>(b.banker?1:0)-(a.banker?1:0)||b.confidence-a.confidence||String(a.match.kickoff||'').localeCompare(String(b.match.kickoff||'')));
  }
  function topPicks(matches,engine,date,limit=3){
    const rows=runEngine(matches,engine,date);
    const bankers=rows.filter(row=>row.banker);
    const others=rows.filter(row=>!row.banker);
    const selected=bankers.slice(0,limit);
    for(const row of others){if(selected.length>=limit)break;selected.push(row);}
    return selected;
  }
  function paletteFor(key){return PALETTES[key]||["#55d98a","#0b2a1d"];}
  function initials(name){return String(name||"E").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
  function dateLabel(date){
    try{return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});}catch(_){return date;}
  }
  function timeLabel(match){
    if(!match||!match.kickoff)return 'Time TBD';
    try{return new Date(match.kickoff).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false})+' GMT';}catch(_){return 'Time TBD';}
  }

  return {dateOf,normaliseMarket,oddFor,confidenceOf,isQualified,reasonsOf,pickKey,runEngine,topPicks,paletteFor,initials,dateLabel,timeLabel};
});
