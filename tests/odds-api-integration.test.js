#!/usr/bin/env node
"use strict";
const assert=require("assert");
const bridge=require("../enrich-odds-api.js");
const guard=require("../odds-engine-guard.js");

const match={
  id:1,home:"Arsenal",away:"Chelsea",league:"Premier League",country:"England",kickoff:"2026-07-16T19:00:00Z",
  odds:{home:1.78,draw:3.8,away:4.5},
  homeStreaks:{htft:{holdLeadRate:.82}},awayStreaks:{htft:{holdLeadRate:.55}}
};
const event={id:"e1",home_team:"Arsenal",away_team:"Chelsea",commence_time:"2026-07-16T19:00:00Z",bookmakers:[
  {key:"a",title:"Book A",last_update:"2026-07-15T12:00:00Z",markets:[
    {key:"h2h",outcomes:[{name:"Arsenal",price:1.80},{name:"Draw",price:3.75},{name:"Chelsea",price:4.4}]},
    {key:"totals",outcomes:[{name:"Over",point:2.5,price:1.83},{name:"Under",point:2.5,price:2.01}]},
    {key:"h2h_h1",outcomes:[{name:"Arsenal",price:2.20},{name:"Draw",price:2.10},{name:"Chelsea",price:4.9}]},
    {key:"totals_h1",outcomes:[{name:"Over",point:.5,price:1.42},{name:"Under",point:.5,price:2.75}]},
    {key:"htft",outcomes:[{name:"Home/Home",price:2.7},{name:"Draw/Home",price:4.6},{name:"Away/Away",price:7.5}]}
  ]},
  {key:"b",title:"Book B",last_update:"2026-07-15T12:02:00Z",markets:[
    {key:"h2h",outcomes:[{name:"Arsenal",price:1.76},{name:"Draw",price:3.85},{name:"Chelsea",price:4.6}]},
    {key:"totals",outcomes:[{name:"Over",point:2.5,price:1.86},{name:"Under",point:2.5,price:1.98}]},
    {key:"h2h_h1",outcomes:[{name:"Arsenal",price:2.18},{name:"Draw",price:2.12},{name:"Chelsea",price:5.0}]},
    {key:"totals_h1",outcomes:[{name:"Over",point:.5,price:1.40},{name:"Under",point:.5,price:2.82}]},
    {key:"htft",outcomes:[{name:"Home/Home",price:2.75},{name:"Draw/Home",price:4.7},{name:"Away/Away",price:7.7}]}
  ]},
  {key:"c",title:"Book C",last_update:"2026-07-15T12:04:00Z",markets:[
    {key:"h2h",outcomes:[{name:"Arsenal",price:1.79},{name:"Draw",price:3.78},{name:"Chelsea",price:4.5}]},
    {key:"totals",outcomes:[{name:"Over",point:2.5,price:1.84},{name:"Under",point:2.5,price:2.0}]}
  ]},
  {key:"d",title:"Book D",last_update:"2026-07-15T12:06:00Z",markets:[
    {key:"h2h",outcomes:[{name:"Arsenal",price:1.77},{name:"Draw",price:3.82},{name:"Chelsea",price:4.55}]},
    {key:"totals",outcomes:[{name:"Over",point:2.5,price:1.85},{name:"Under",point:2.5,price:1.99}]}
  ]}
]};

assert(bridge.teamSimilarity("Man Utd","Manchester United")>.45);
assert(bridge.matchEvent(match,new Map([[event.id,event]])));
const rows=event.bookmakers.map(b=>bridge.extractBook(b,event,match,false));
const agg=bridge.aggregateBooks(rows);
assert.equal(agg.meta.home.bookCount,4);
assert(agg.odds.over25>1.8&&agg.odds.over25<1.9);
const htft=bridge.aggregateHtft(rows);
assert(htft&&htft.prices["1/1"]);
assert(bridge.reconcile(match,event,"soccer_epl",.99,false));
assert(match.odds.fhHome&&match.odds.fhOver05);
assert(match.htftOdds.actual);
assert(match.oddsBooks.length===4);

const supported=guard.reviewDecision({match,engine:"Test",primary:"Home Win",market:"Home Win",bet:true,banker:true,score:86,confidence:86,warnings:[],reasons:[]},match);
assert(supported.bet);
assert(supported.oddsReview.bookCount>=4);
assert(supported.score>=86);

const upset={...match,odds:{home:5.2,draw:3.8,away:1.62},oddsMarketMeta:{home:{bookCount:5,dispersionPct:4}}};
const blocked=guard.reviewDecision({match:upset,engine:"Test",primary:"Home Win",market:"Home Win",bet:true,banker:true,score:80,confidence:80,warnings:[],reasons:[]},upset);
assert(!blocked.bet);
assert.equal(blocked.primary,"No Bet");

console.log("Odds API bridge and all-engine market guard tests passed.");
