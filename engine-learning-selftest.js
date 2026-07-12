#!/usr/bin/env node
"use strict";
const assert=require("assert");
const learning=require("./engine-learning.js");
const supervisor=require("./learning-supervisor.js");

function pick(i,home,away,league,score,result,homeOdds,awayOdds,engine="PurePPG Normal",market="Home Win"){
  const [hg,ag]=score.split("-").map(Number);
  return{matchDate:`2026-06-${String(i).padStart(2,"0")}`,home,away,league,engine,market,
    status:"settled",result,score,finalHomeGoals:hg,finalAwayGoals:ag,
    snapshot:{leagueId:99,homeOdds,drawOdds:3.6,awayOdds,favoriteSide:homeOdds<awayOdds?"home":"away",favoriteOdds:Math.min(homeOdds,awayOdds),dataFields:7}};
}
const picks=[];
// Eight favourite appearances for Pattern FC: 2 wins, 2 draws, 4 losses.
const patternScores=["2-0","1-0","1-1","0-0","0-1","1-2","0-2","1-3"];
patternScores.forEach((s,idx)=>picks.push(pick(idx+1,"Pattern FC",`Dog ${idx+1}`,"Test League",s,idx<2?"Won":"Lost",1.45,6.2)));
// Stable FC: six favourite appearances, five wins and one draw.
const stableScores=["2-0","3-1","1-0","2-1","4-0","1-1"];
stableScores.forEach((s,idx)=>picks.push(pick(idx+12,"Stable FC",`Visitor ${idx+1}`,"Stable League",s,idx<5?"Won":"Lost",1.40,6.8)));
// Fill Test League sample so league-level gates activate.
for(let i=0;i<6;i++)picks.push(pick(i+20,`Other Fav ${i}`,`Other Dog ${i}`,"Test League",i<4?"2-0":"0-1",i<4?"Won":"Lost",1.55,5.5,"Strict","Home Win"));
const matches=[
  {matchDate:"2026-07-20",home:"Pattern FC",away:"New Dog",league:"Test League",leagueId:99,odds:{home:1.42,draw:4.0,away:6.6}},
  {matchDate:"2026-07-20",home:"Stable FC",away:"New Visitor",league:"Stable League",leagueId:99,odds:{home:1.38,draw:4.2,away:7.0}}
];
const result=learning.buildLearning({picks},matches);
const pattern=result.ledger.teams[learning.teamKey("Pattern FC",99,"Test League")];
const stable=result.ledger.teams[learning.teamKey("Stable FC",99,"Stable League")];
assert(pattern.flags.includes("FAVORITE_TRAP"),"Pattern FC should be marked favourite trap");
assert(pattern.flags.includes("PATTERN_BREAKER"),"Pattern FC should be marked pattern breaker");
assert(stable.flags.includes("UPSET_RESISTANT"),"Stable FC should be marked upset resistant");
assert(matches[0].learningContext.riskScore>matches[1].learningContext.riskScore,"Pattern team should carry more future risk");
const reviewed=supervisor.reviewDecision({engine:"PurePPG Normal",primary:"Home Win",market:"Home Win",market_family:"HOME_RESULT",score:86,confidence:86,bet:true,banker:true,reasons:[],warnings:[]},matches[0]);
assert(reviewed.learning_review.applied,"Supervisor should apply learning review");
assert(reviewed.score<=86,"High-risk history must not inflate confidence");
assert(reviewed.primary==="No Bet"||reviewed.score<86,"Pattern risk should reduce or veto the candidate");
console.log("Engine learning self-test passed: pattern breaker, upset resistance, future risk and supervisor adjustment verified.");
