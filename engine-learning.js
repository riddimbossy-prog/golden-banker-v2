#!/usr/bin/env node
"use strict";
/* ============================================================================
 * Predict2U v193 — Engine Learning Ledger
 * ----------------------------------------------------------------------------
 * Forward-only learning from recorded pre-kickoff engine decisions and settled
 * results. It builds sample-gated profiles for teams, leagues, matchups,
 * favourite-odds bands and engine/market contexts, then attaches a compact
 * learningContext to upcoming fixtures in data.js.
 *
 * This is deterministic post-match analysis, not opaque machine learning.
 * It never rewrites old predictions, never hides losses and never guarantees
 * future results. Evidence is decayed, sample-gated and Wilson-bounded.
 * ========================================================================== */
const fs=require("fs");
const path=require("path");
const HERE=__dirname;
const VERSION="v193";
const LEDGER_FILE=path.join(HERE,"engine-learning-ledger.json");
const REPORT_FILE=path.join(HERE,"engine-learning-report.json");
const LOG_FILE=path.join(HERE,"track-log.json");
const DATA_FILE=path.join(HERE,"data.js");

const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const num=v=>v===null||v===undefined||v===""||!Number.isFinite(Number(v))?null:Number(v);
const round=(v,p=3)=>v==null?null:Number(Number(v).toFixed(p));
const pct=(w,n)=>n?round(w/n,4):null;
const safe=s=>String(s==null?"":s).trim();
const norm=s=>safe(s).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const uniq=a=>[...new Set((a||[]).filter(Boolean))];
const nowIso=()=>new Date().toISOString();
const DAY=86400000;
const MIN={teamFavorite:5,teamUnderdog:5,league:12,matchup:2,context:6,hardVeto:8};

function wilson(w,n,z=1.96){
  if(!n)return{lower:null,mid:null,upper:null};
  const p=w/n,z2=z*z,den=1+z2/n;
  const centre=(p+z2/(2*n))/den;
  const margin=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/den;
  return{lower:round(clamp(centre-margin,0,1),4),mid:round(p,4),upper:round(clamp(centre+margin,0,1),4)};
}
function oddsBand(o){
  o=num(o); if(o===null)return"unknown";
  if(o<=1.35)return"1.01-1.35";
  if(o<=1.60)return"1.36-1.60";
  if(o<=1.85)return"1.61-1.85";
  if(o<=2.25)return"1.86-2.25";
  return"2.26+";
}
function fixtureKey(x){return [x.matchDate||safe(x.kickoff).slice(0,10),norm(x.home),norm(x.away)].join("|");}
function teamKey(name,leagueId,league){return [leagueId==null?norm(league):String(leagueId),norm(name)].join("|");}
function leagueKey(x){return x.leagueId!=null?String(x.leagueId):norm(x.league);}
function matchupKey(x){return [leagueKey(x),norm(x.home),norm(x.away)].join("|");}
function parseScore(score){
  const m=String(score||"").match(/(-?\d+)\s*[-:]\s*(-?\d+)/); return m?{home:+m[1],away:+m[2]}:null;
}
function matchResult(h,a){return h>a?"home":a>h?"away":"draw";}
function favoriteFromOdds(h,a,d){
  h=num(h);a=num(a);d=num(d);
  if(h===null||a===null)return{side:null,odds:null,gap:null,balanced:true};
  const side=h<a?"home":a<h?"away":null;
  const fav=side==="home"?h:side==="away"?a:null;
  const gap=Math.abs(h-a);
  const balanced=!side||gap<0.12||fav>2.25;
  return{side:balanced?null:side,odds:fav,gap:round(gap,3),balanced};
}
function marketDirection(market){
  const s=safe(market);
  if(/^Home Win|Home DNB|Double Chance 1X|Home Team Over|Away Team Under/.test(s))return"home";
  if(/^Away Win|Away DNB|Double Chance X2|Away Team Over|Home Team Under/.test(s))return"away";
  if(/^Over|BTTS Yes/.test(s))return"over";
  if(/^Under|BTTS No/.test(s))return"under";
  return"neutral";
}
function marketFamily(market){
  const s=safe(market);
  if(/^Home Win|Home DNB|Double Chance 1X/.test(s))return"HOME_RESULT";
  if(/^Away Win|Away DNB|Double Chance X2/.test(s))return"AWAY_RESULT";
  if(/^Home Team Over/.test(s))return"HOME_SCORING";
  if(/^Away Team Over/.test(s))return"AWAY_SCORING";
  if(/^Home Team Under/.test(s))return"HOME_SUPPRESSION";
  if(/^Away Team Under/.test(s))return"AWAY_SUPPRESSION";
  if(/^Over/.test(s))return"MATCH_OVER";
  if(/^Under/.test(s))return"MATCH_UNDER";
  if(s==="BTTS Yes")return"BTTS_YES";
  if(s==="BTTS No")return"BTTS_NO";
  return"NEUTRAL";
}
function snapshotForMatch(m){
  const o=m&&m.odds||{};
  const fav=favoriteFromOdds(o.home,o.away,o.draw);
  return{
    fixtureId:m.id??m.fixtureId??null,leagueId:m.leagueId??null,round:m.round??null,
    competitionType:/cup|playoff|round of|quarter|semi|final/i.test(`${m.league||""} ${m.round||""}`)?"knockout":"league",
    homeOdds:num(o.home),drawOdds:num(o.draw),awayOdds:num(o.away),
    favoriteSide:fav.side,favoriteOdds:fav.odds,favoriteGap:fav.gap,
    homeOverallPPG:num(m.homeOverallPPG??m.homePPG),awayOverallPPG:num(m.awayOverallPPG??m.awayPPG),
    homeVenuePPG:num(m.homeVenuePPG??m.homeHomePPG),awayVenuePPG:num(m.awayVenuePPG??m.awayAwayPPG),
    homeRecent5PPG:num(m.homeRecent5PPG),awayRecent5PPG:num(m.awayRecent5PPG),
    homeForm:safe(m.homeForm)||null,awayForm:safe(m.awayForm)||null,
    leagueGoalsPerGame:num(m.leagueAvg&&m.leagueAvg.goalsPerGame),
    leagueDrawRate:num(m.leagueAvg&&m.leagueAvg.drawRate),
    dataFields:[o.home,o.draw,o.away,m.homeOverallPPG??m.homePPG,m.awayOverallPPG??m.awayPPG,m.homeRecent5PPG,m.awayRecent5PPG].filter(v=>num(v)!==null).length
  };
}
function loadJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch(_){return fallback;}}
function loadMatches(file=DATA_FILE){
  const raw=fs.readFileSync(file,"utf8");
  const m=raw.match(/window\.MATCHES\s*=\s*([\s\S]*?);\s*$/m);
  if(!m)throw new Error("Could not parse window.MATCHES in "+file);
  return{raw,matches:JSON.parse(m[1])};
}
function saveMatches(raw,matches,file=DATA_FILE){
  const replacement=`window.MATCHES = ${JSON.stringify(matches,null,2)};`;
  fs.writeFileSync(file,raw.replace(/window\.MATCHES\s*=\s*[\s\S]*?;\s*$/m,replacement+"\n"),"utf8");
}
function stat(){return{sample:0,wins:0,draws:0,losses:0,weight:0,winWeight:0,drawWeight:0,lossWeight:0};}
function decayWeight(date,halfLifeDays=120){
  const t=Date.parse(date||""); if(!Number.isFinite(t))return 1;
  const age=Math.max(0,(Date.now()-t)/DAY); return Math.pow(.5,age/halfLifeDays);
}
function bumpOutcome(s,result,date){
  const w=decayWeight(date);s.sample++;s.weight+=w;
  if(result==="win"){s.wins++;s.winWeight+=w;}
  else if(result==="draw"){s.draws++;s.drawWeight+=w;}
  else{s.losses++;s.lossWeight+=w;}
}
function finalizeOutcome(s){
  const n=s.sample||0,w=s.wins||0,d=s.draws||0,l=s.losses||0,non=w+d;
  const weightedTotal=s.weight||0;
  const winRate=weightedTotal?round(s.winWeight/weightedTotal,4):pct(w,n);
  const drawRate=weightedTotal?round(s.drawWeight/weightedTotal,4):pct(d,n);
  const upsetRate=weightedTotal?round(s.lossWeight/weightedTotal,4):pct(l,n);
  return{sample:n,wins:w,draws:d,losses:l,winRate,drawRate,nonLossRate:round((winRate||0)+(drawRate||0),4),upsetRate,
    nonLossWilson:wilson(non,n),winWilson:wilson(w,n),decayedWeight:round(weightedTotal,2)};
}
function addCounter(obj,key){obj[key]=(obj[key]||0)+1;}

function buildFixtureEvents(log,matches){
  const byFixture=new Map(matches.map(m=>[fixtureKey(m),m]));
  const events=new Map();
  for(const p of (log&&log.picks)||[]){
    if(p.status!=="settled"||!(p.result==="Won"||p.result==="Lost"))continue;
    const k=fixtureKey(p); if(events.has(k))continue;
    const m=byFixture.get(k)||{};
    const snap=p.snapshot||{};
    const score=(p.finalHomeGoals!=null&&p.finalAwayGoals!=null)?{home:+p.finalHomeGoals,away:+p.finalAwayGoals}:
      (m.homeGoals!=null&&m.awayGoals!=null?{home:+m.homeGoals,away:+m.awayGoals}:parseScore(p.score));
    if(!score)continue;
    const hOdd=num(snap.homeOdds??(m.odds&&m.odds.home));
    const aOdd=num(snap.awayOdds??(m.odds&&m.odds.away));
    const dOdd=num(snap.drawOdds??(m.odds&&m.odds.draw));
    const fav=favoriteFromOdds(hOdd,aOdd,dOdd);
    events.set(k,{
      key:k,matchDate:p.matchDate||m.matchDate,home:p.home||m.home,away:p.away||m.away,
      league:p.league||m.league||null,leagueId:snap.leagueId??m.leagueId??null,
      homeGoals:score.home,awayGoals:score.away,result:matchResult(score.home,score.away),
      homeOdds:hOdd,awayOdds:aOdd,drawOdds:dOdd,favorite:fav,
      oddsBand:oddsBand(fav.odds),snapshot:{...snapshotForMatch(m),...snap}
    });
  }
  return[...events.values()];
}

function buildProfiles(events){
  const teams={},leagues={},matchups={},oddsBands={};
  const getTeam=(name,e)=>teams[teamKey(name,e.leagueId,e.league)]||(teams[teamKey(name,e.leagueId,e.league)]={name,league:e.league,leagueId:e.leagueId,favorite:stat(),underdog:stat(),favoriteBands:{},underdogUpsets:0});
  for(const e of events){
    if(!e.favorite.side)continue;
    const favName=e.favorite.side==="home"?e.home:e.away;
    const dogName=e.favorite.side==="home"?e.away:e.home;
    const favOutcome=e.result===e.favorite.side?"win":e.result==="draw"?"draw":"loss";
    const dogOutcome=favOutcome==="loss"?"win":favOutcome==="draw"?"draw":"loss";
    const ft=getTeam(favName,e),dt=getTeam(dogName,e);
    bumpOutcome(ft.favorite,favOutcome,e.matchDate);
    bumpOutcome(dt.underdog,dogOutcome,e.matchDate);
    if(dogOutcome==="win")dt.underdogUpsets++;
    const b=ft.favoriteBands[e.oddsBand]||(ft.favoriteBands[e.oddsBand]=stat());bumpOutcome(b,favOutcome,e.matchDate);
    const lk=leagueKey(e),lp=leagues[lk]||(leagues[lk]={league:e.league,leagueId:e.leagueId,favorite:stat(),bands:{},homeFavorites:stat(),awayFavorites:stat()});
    bumpOutcome(lp.favorite,favOutcome,e.matchDate);bumpOutcome(lp[e.favorite.side==="home"?"homeFavorites":"awayFavorites"],favOutcome,e.matchDate);
    const lb=lp.bands[e.oddsBand]||(lp.bands[e.oddsBand]=stat());bumpOutcome(lb,favOutcome,e.matchDate);
    const mk=matchupKey(e),mp=matchups[mk]||(matchups[mk]={home:e.home,away:e.away,league:e.league,leagueId:e.leagueId,favorite:stat()});
    bumpOutcome(mp.favorite,favOutcome,e.matchDate);
    const ob=oddsBands[e.oddsBand]||(oddsBands[e.oddsBand]=stat());bumpOutcome(ob,favOutcome,e.matchDate);
  }
  for(const t of Object.values(teams)){
    t.favorite=finalizeOutcome(t.favorite);t.underdog=finalizeOutcome(t.underdog);
    for(const [k,v] of Object.entries(t.favoriteBands))t.favoriteBands[k]=finalizeOutcome(v);
    const flags=[];
    if(t.favorite.sample>=MIN.teamFavorite){
      if(t.favorite.upsetRate>=.34)flags.push("FAVORITE_TRAP");
      if((1-t.favorite.winRate)>=.50)flags.push("PATTERN_BREAKER");
      if(t.favorite.nonLossRate>=.88&&t.favorite.upsetRate<=.12)flags.push("UPSET_RESISTANT");
      if(t.favorite.winRate>=.72&&t.favorite.winWilson.lower>=.45)flags.push("FAVORITE_RELIABLE");
      if(t.favorite.drawRate>=.32)flags.push("DRAW_MAGNET_AS_FAVORITE");
    }
    if(t.underdog.sample>=MIN.teamUnderdog&&t.underdog.winRate>=.30)flags.push("DANGEROUS_UNDERDOG");
    t.flags=flags;
    t.patternStability=round(clamp(100-(t.favorite.upsetRate||0)*70-(t.favorite.drawRate||0)*30,0,100),1);
    t.favoriteReliability=round(clamp((t.favorite.winRate||0)*60+(t.favorite.nonLossRate||0)*40,0,1)*100,1);
  }
  for(const l of Object.values(leagues)){
    l.favorite=finalizeOutcome(l.favorite);l.homeFavorites=finalizeOutcome(l.homeFavorites);l.awayFavorites=finalizeOutcome(l.awayFavorites);
    for(const [k,v] of Object.entries(l.bands))l.bands[k]=finalizeOutcome(v);
    const flags=[];
    if(l.favorite.sample>=MIN.league){
      if(l.favorite.upsetRate>=.30)flags.push("VOLATILE_LEAGUE");
      if(l.favorite.drawRate>=.30)flags.push("DRAW_TRAP_LEAGUE");
      if(l.favorite.nonLossRate>=.84&&l.favorite.upsetRate<=.16)flags.push("FAVORITE_STABLE_LEAGUE");
    }
    l.flags=flags;
    l.stabilityScore=round(clamp(100-(l.favorite.upsetRate||0)*75-(l.favorite.drawRate||0)*25,0,100),1);
  }
  for(const m of Object.values(matchups)){
    m.favorite=finalizeOutcome(m.favorite);m.flags=[];
    if(m.favorite.sample>=3&&m.favorite.nonLossRate===1)m.flags.push("NO_UPSET_MATCHUP");
    if(m.favorite.sample>=MIN.matchup&&m.favorite.upsetRate>=.5)m.flags.push("VOLATILE_MATCHUP");
  }
  for(const [k,v] of Object.entries(oddsBands))oddsBands[k]=finalizeOutcome(v);
  return{teams,leagues,matchups,oddsBands};
}

function rootCauses(p,e,profiles){
  const causes=[];const market=safe(p.market);const dir=marketDirection(market);const fam=marketFamily(market);
  if(e){
    if(dir==="home"||dir==="away"){
      if(e.result==="draw")causes.push("DRAW_TRAP");
      else if(e.favorite.side===dir&&e.result!==dir)causes.push("FAVORITE_PATTERN_BREAK");
      else if(e.favorite.side&&e.favorite.side!==dir&&e.result===e.favorite.side)causes.push("UNDERDOG_OVERREACH");
      else causes.push("RESULT_DIRECTION_MISS");
    }
    const total=e.homeGoals+e.awayGoals;
    if(fam==="MATCH_OVER")causes.push(total<=1?"TEMPO_COLLAPSE":"GOAL_LINE_MISS");
    if(fam==="MATCH_UNDER")causes.push(total>=4?"GOAL_SPIKE":"GOAL_LINE_MISS");
    if(fam==="BTTS_YES")causes.push("ONE_TEAM_FAILED_TO_SCORE");
    if(fam==="BTTS_NO")causes.push("BOTH_ATTACKS_BROKE_SUPPRESSION");
    const lk=leagueKey(e),lp=profiles.leagues[lk];if(lp&&lp.flags.includes("VOLATILE_LEAGUE"))causes.push("VOLATILE_LEAGUE_CONTEXT");
    if(e.favorite.side){
      const favName=e.favorite.side==="home"?e.home:e.away;
      const tp=profiles.teams[teamKey(favName,e.leagueId,e.league)];
      if(tp&&tp.flags.includes("FAVORITE_TRAP"))causes.push("KNOWN_FAVORITE_TRAP_TEAM");
      const dogName=e.favorite.side==="home"?e.away:e.home;
      const dp=profiles.teams[teamKey(dogName,e.leagueId,e.league)];
      if(dp&&dp.flags.includes("DANGEROUS_UNDERDOG"))causes.push("DANGEROUS_UNDERDOG_CONTEXT");
    }
  }
  const fields=(p.snapshot&&p.snapshot.dataFields)||0;if(fields<4)causes.push("INPUT_COVERAGE_GAP");
  if(!causes.length)causes.push("UNCLASSIFIED_VARIANCE");
  return uniq(causes);
}

function contextKey(p,e,global=false){
  const align=e&&e.favorite.side&&marketDirection(p.market)===e.favorite.side?"fav-aligned":"other";
  return [global?"*":norm(p.league),safe(p.engine),safe(p.market),e?e.oddsBand:"unknown",align].join("|");
}
function buildContexts(log,eventMap,profiles){
  const raw={};
  const bump=(k,won)=>{const s=raw[k]||(raw[k]={sample:0,wins:0,losses:0});s.sample++;if(won)s.wins++;else s.losses++;};
  const reviews=[];const causeCounts={};
  for(const p of (log&&log.picks)||[]){
    if(p.status!=="settled"||!(p.result==="Won"||p.result==="Lost"))continue;
    const e=eventMap.get(fixtureKey(p));const won=p.result==="Won";
    bump(contextKey(p,e,false),won);bump(contextKey(p,e,true),won);
    if(!won){const causes=rootCauses(p,e,profiles);causes.forEach(c=>addCounter(causeCounts,c));reviews.push({matchDate:p.matchDate,home:p.home,away:p.away,league:p.league,engine:p.engine,market:p.market,score:p.score||null,causes});}
  }
  const contexts={};
  for(const [k,s] of Object.entries(raw)){
    const ci=wilson(s.wins,s.sample),winRate=pct(s.wins,s.sample);let adjustment=0,hardVeto=false;
    if(s.sample>=MIN.context){
      if(winRate<.40)adjustment=-8;else if(winRate<.50)adjustment=-4;
      else if(s.sample>=12&&ci.lower>=.62)adjustment=2;
      if(s.sample>=12&&ci.upper<.50)hardVeto=true;
    }
    contexts[k]={...s,winRate,lossRate:round(1-winRate,4),wilson:ci,adjustment,hardVeto};
  }
  reviews.sort((a,b)=>String(b.matchDate).localeCompare(String(a.matchDate)));
  return{contexts,reviews:reviews.slice(0,150),causeCounts};
}

function profileReason(label,p){
  if(!p)return null;
  if(label==="team")return`${p.name}: ${p.favorite.sample} recorded favourite appearances, ${Math.round((p.favorite.upsetRate||0)*100)}% defeats and ${Math.round((p.favorite.drawRate||0)*100)}% draws.`;
  if(label==="underdog")return`${p.name}: ${p.underdog.sample} underdog appearances, ${Math.round((p.underdog.winRate||0)*100)}% outright upsets.`;
  if(label==="league")return`${p.league}: ${p.favorite.sample} measured favourites, ${Math.round((p.favorite.upsetRate||0)*100)}% defeats.`;
  return null;
}
function buildLearningContext(m,ledger){
  const o=m.odds||{},fav=favoriteFromOdds(o.home,o.away,o.draw),band=oddsBand(fav.odds),lk=leagueKey(m),mp=ledger.matchups[matchupKey(m)],lp=ledger.leagues[lk];
  const favName=fav.side==="home"?m.home:fav.side==="away"?m.away:null;
  const dogName=fav.side==="home"?m.away:fav.side==="away"?m.home:null;
  const ft=favName?ledger.teams[teamKey(favName,m.leagueId,m.league)]:null;
  const dt=dogName?ledger.teams[teamKey(dogName,m.leagueId,m.league)]:null;
  const ob=ledger.oddsBands[band];
  const flags=[],reasons=[];let risk=12,stability=50;
  if(!fav.side){flags.push("BALANCED_ODDS");risk+=8;reasons.push("No clear favourite: 1X2 prices are balanced or outside the supported favourite range.");}
  if(ft&&ft.favorite.sample>=MIN.teamFavorite){
    risk+=(ft.favorite.upsetRate||0)*36+(ft.favorite.drawRate||0)*16;
    stability+=(ft.favorite.nonLossRate-.70)*38;
    flags.push(...ft.flags);reasons.push(profileReason("team",ft));
  }else if(fav.side){flags.push("LOW_TEAM_SAMPLE");}
  if(dt&&dt.underdog.sample>=MIN.teamUnderdog){
    risk+=(dt.underdog.winRate||0)*22;
    if(dt.flags.includes("DANGEROUS_UNDERDOG")){flags.push("DANGEROUS_UNDERDOG");reasons.push(profileReason("underdog",dt));}
  }
  if(lp&&lp.favorite.sample>=MIN.league){
    risk+=(lp.favorite.upsetRate||0)*24+(lp.favorite.drawRate||0)*10;
    stability+=(lp.favorite.nonLossRate-.72)*28;
    flags.push(...lp.flags);reasons.push(profileReason("league",lp));
  }else flags.push("LOW_LEAGUE_SAMPLE");
  if(mp&&mp.favorite.sample>=MIN.matchup){
    risk+=(mp.favorite.upsetRate||0)*12;
    stability+=(mp.favorite.nonLossRate-.65)*10;
    flags.push(...mp.flags);
    reasons.push(`${m.home} vs ${m.away}: ${mp.favorite.sample} comparable matchup result(s), ${Math.round((mp.favorite.upsetRate||0)*100)}% favourite defeats.`);
  }
  if(ob&&ob.sample>=MIN.league){risk+=(ob.upsetRate||0)*12;stability+=(ob.nonLossRate-.72)*12;}
  if(fav.odds!=null&&fav.odds>1.85)risk+=8;
  risk=round(clamp(risk,0,100),1);stability=round(clamp(stability-risk*.18,0,100),1);
  let favoriteMarketAdjustment=0,goalMarketAdjustment=0,hardVetoFavorite=false;
  if(risk>=78)favoriteMarketAdjustment=-14;else if(risk>=65)favoriteMarketAdjustment=-9;else if(risk>=52)favoriteMarketAdjustment=-5;else if(risk<=26&&stability>=72)favoriteMarketAdjustment=2;
  if(flags.includes("VOLATILE_LEAGUE")||flags.includes("PATTERN_BREAKER"))goalMarketAdjustment=-2;
  hardVetoFavorite=!!(fav.side&&risk>=78&&ft&&ft.favorite.sample>=MIN.hardVeto&&lp&&lp.favorite.sample>=20&&(ft.flags.includes("FAVORITE_TRAP")||dt&&dt.flags.includes("DANGEROUS_UNDERDOG")));
  const riskLevel=risk>=78?"high":risk>=60?"elevated":risk>=40?"monitored":"low";
  const engineRules={};
  for(const [k,c] of Object.entries(ledger.contexts||{})){
    if(c.sample<MIN.context||(!c.adjustment&&!c.hardVeto))continue;
    const parts=k.split("|");if(parts.length<5)continue;
    const [leaguePart,engine,market,ctxBand,align]=parts;
    if(!(leaguePart==="*"||leaguePart===norm(m.league)))continue;
    if(!(ctxBand===band||ctxBand==="unknown"))continue;
    const dir=marketDirection(market),thisAlign=fav.side&&dir===fav.side?"fav-aligned":"other";
    if(align!==thisAlign)continue;
    engineRules[engine]=engineRules[engine]||{};
    const prev=engineRules[engine][market];
    if(!prev||c.sample>prev.sample)engineRules[engine][market]={sample:c.sample,winRate:c.winRate,adjustment:c.adjustment,hardVeto:c.hardVeto};
  }
  return{
    version:VERSION,generatedAt:ledger.updated,favorite:{side:fav.side,team:favName,odds:fav.odds,band,gap:fav.gap},
    underdog:dogName?{team:dogName}:null,riskScore:risk,stabilityScore:stability,riskLevel,
    flags:uniq(flags),reasons:uniq(reasons).slice(0,6),
    decision:{favoriteMarketAdjustment,goalMarketAdjustment,hardVetoFavorite},engineRules,
    samples:{favoriteTeam:ft?ft.favorite.sample:0,underdogTeam:dt?dt.underdog.sample:0,league:lp?lp.favorite.sample:0,matchup:mp?mp.favorite.sample:0}
  };
}

function buildReport(ledger){
  const teams=Object.values(ledger.teams||{}),leagues=Object.values(ledger.leagues||{});
  const patternBreakers=teams.filter(t=>t.flags.includes("PATTERN_BREAKER")||t.flags.includes("FAVORITE_TRAP")).sort((a,b)=>(b.favorite.upsetRate-a.favorite.upsetRate)||b.favorite.sample-a.favorite.sample).slice(0,20);
  const upsetResistant=teams.filter(t=>t.flags.includes("UPSET_RESISTANT")||t.flags.includes("FAVORITE_RELIABLE")).sort((a,b)=>(b.favoriteReliability-a.favoriteReliability)||b.favorite.sample-a.favorite.sample).slice(0,20);
  const dangerousUnderdogs=teams.filter(t=>t.flags.includes("DANGEROUS_UNDERDOG")).sort((a,b)=>(b.underdog.winRate-a.underdog.winRate)||b.underdog.sample-a.underdog.sample).slice(0,20);
  const volatileLeagues=leagues.filter(l=>l.flags.includes("VOLATILE_LEAGUE")||l.flags.includes("DRAW_TRAP_LEAGUE")).sort((a,b)=>(b.favorite.upsetRate-a.favorite.upsetRate)||b.favorite.sample-a.favorite.sample).slice(0,15);
  const stableLeagues=leagues.filter(l=>l.flags.includes("FAVORITE_STABLE_LEAGUE")).sort((a,b)=>b.stabilityScore-a.stabilityScore).slice(0,15);
  const causes=Object.entries(ledger.causeCounts||{}).sort((a,b)=>b[1]-a[1]).map(([cause,count])=>({cause,count}));
  return{version:VERSION,updated:ledger.updated,summary:{settledFixtures:ledger.summary.settledFixtures,settledDecisions:ledger.summary.settledDecisions,reviewedLosses:ledger.summary.reviewedLosses,teamProfiles:teams.length,leagueProfiles:leagues.length,matchupProfiles:Object.keys(ledger.matchups||{}).length,activePatternBreakers:patternBreakers.length,upsetResistantTeams:upsetResistant.length},patternBreakers,upsetResistant,dangerousUnderdogs,volatileLeagues,stableLeagues,commonMissCauses:causes.slice(0,15),recentLossReviews:(ledger.lossReviews||[]).slice(0,30),methodology:{forwardOnly:true,minimumSamples:MIN,decayHalfLifeDays:120,positiveAdjustmentCap:2,oneMarketOnly:true}};
}

function buildLearning(log,matches){
  const events=buildFixtureEvents(log,matches),profiles=buildProfiles(events),eventMap=new Map(events.map(e=>[e.key,e]));
  const contexts=buildContexts(log,eventMap,profiles);
  const settledDecisions=((log&&log.picks)||[]).filter(p=>p.status==="settled"&&(p.result==="Won"||p.result==="Lost")).length;
  const ledger={version:VERSION,schemaVersion:1,updated:nowIso(),minimumSamples:MIN,decayHalfLifeDays:120,summary:{settledFixtures:events.length,settledDecisions,reviewedLosses:contexts.reviews.length},...profiles,contexts:contexts.contexts,lossReviews:contexts.reviews,causeCounts:contexts.causeCounts};
  let attached=0,highRisk=0,stable=0;
  for(const m of matches){
    if(m.homeGoals!=null&&m.awayGoals!=null)continue;
    m.learningContext=buildLearningContext(m,ledger);attached++;
    if(m.learningContext.riskLevel==="high")highRisk++;
    if(m.learningContext.stabilityScore>=72&&m.learningContext.riskScore<=30)stable++;
  }
  ledger.summary.attachedUpcoming=attached;ledger.summary.highRiskUpcoming=highRisk;ledger.summary.stableUpcoming=stable;
  return{ledger,report:buildReport(ledger),attached,highRisk,stable};
}
function saveBuild(result,{ledgerFile=LEDGER_FILE,reportFile=REPORT_FILE}={}){
  fs.writeFileSync(ledgerFile,JSON.stringify(result.ledger,null,2),"utf8");
  fs.writeFileSync(reportFile,JSON.stringify(result.report,null,2),"utf8");
}
function runBuild({logFile=LOG_FILE,dataFile=DATA_FILE,ledgerFile=LEDGER_FILE,reportFile=REPORT_FILE}={}){
  const log=loadJson(logFile,{picks:[]});const loaded=loadMatches(dataFile);const result=buildLearning(log,loaded.matches);
  saveBuild(result,{ledgerFile,reportFile});saveMatches(loaded.raw,loaded.matches,dataFile);
  return result;
}

if(require.main===module){
  try{
    const mode=(process.argv[2]||"build").toLowerCase();
    if(mode!=="build")throw new Error(`Unknown mode: ${mode}. Use: node engine-learning.js build`);
    const r=runBuild();
    console.log(`Engine learning ${VERSION}: ${r.ledger.summary.settledFixtures} settled fixture(s), ${r.ledger.summary.reviewedLosses} reviewed loss(es), ${r.attached} upcoming context(s), ${r.highRisk} high-risk flag(s), ${r.stable} stable context(s).`);
  }catch(e){console.error("engine-learning:",e.message);process.exitCode=1;}
}
module.exports={VERSION,MIN,wilson,oddsBand,fixtureKey,teamKey,leagueKey,matchupKey,favoriteFromOdds,marketDirection,marketFamily,snapshotForMatch,buildFixtureEvents,buildProfiles,rootCauses,buildContexts,buildLearningContext,buildLearning,buildReport,runBuild};
