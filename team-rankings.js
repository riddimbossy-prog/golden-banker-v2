/* Predict2U v266 — team trend explorer and strict matchup lab. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
  const rate=v=>{const n=num(v);return n===null?null:(n>1.00001?n/100:n);};
  const first=(...values)=>{for(const value of values){const n=num(value);if(n!==null)return n;}return null;};
  const div=(a,b)=>num(a)!==null&&num(b)!==null&&Number(b)!==0?Number(a)/Number(b):null;
  const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
  const pct=v=>v===null?'—':`${Math.round(v*100)}%`;
  const fmt=v=>v===null?'—':Number(v).toFixed(2);
  const dateOf=m=>String(m&&m.matchDate||m&&m.kickoff||'').slice(0,10);
  const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'');
  const add=(d,n)=>{const x=new Date(`${d}T00:00:00Z`);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
  const MIN_SAMPLE=8,HORIZON_DAYS=10;
  const today=new Date().toISOString().slice(0,10),windowEnd=add(today,HORIZON_DAYS);
  const terminal=new Set(['FT','AET','PEN','PST','CANC','ABD','AWD','WO']);
  const unresolved=m=>m&&m.homeGoals==null&&!terminal.has(String(m.status||'').toUpperCase());
  const currentFixture=m=>{const d=dateOf(m);return unresolved(m)&&validDate(d)&&d>=today&&d<=windowEnd;};
  const allMatches=Array.isArray(window.MATCHES)?window.MATCHES:[];
  const currentPool=allMatches.filter(currentFixture);
  const loadedPool=allMatches.filter(unresolved).sort((a,b)=>String(dateOf(b)).localeCompare(String(dateOf(a))));
  const fixturePool=currentPool.length?currentPool:loadedPool;
  const usingFallback=!currentPool.length&&loadedPool.length>0;

  function sideRow(m,side){
    const home=side==='home',st=m&&m[`${side}Streaks`]||{},htft=st.htft||{},advanced=st.advanced||{};
    const team=m&&m[side];
    const games=first(m&&m[`${side}VenueGames`],advanced.samples&&advanced.samples.splitVenue,htft.ftSample,st.sample,m&&m[`${side}Profile`]&&m[`${side}Profile`].games);
    const ppg=first(div(m&&m[`${side}VenuePts`],games),m&&m[`${side}Recent10PPG`],advanced.recent10PPG);
    const profile=m&&m[`${side}Profile`]||{};
    const gf=home?first(m&&m.homeScoredAtHome,profile.goalsFor&&profile.goalsFor.v):first(m&&m.awayScoredAway,profile.goalsFor&&profile.goalsFor.v);
    const ga=home?first(m&&m.homeConcededAtHome,profile.goalsAg&&profile.goalsAg.v):first(m&&m.awayConcededAway,profile.goalsAg&&profile.goalsAg.v);
    const cs=rate(first(m&&m[`${side}CleanSheetRate`],htft.ftCS));
    const fts=rate(first(m&&m[`${side}FailedToScoreRate`],htft.ftFTS));
    const win=rate(first(m&&m[`${side}WinRate`],htft.ftWin));
    const draw=rate(first(htft.ftDraw,win!==null&&rate(m&&m[`${side}UnbeatenRate`])!==null?rate(m&&m[`${side}UnbeatenRate`])-win:null));
    const unbeaten=rate(first(m&&m[`${side}UnbeatenRate`],win!==null&&draw!==null?win+draw:null));
    const loss=rate(first(htft.ftLoss,unbeaten!==null?1-unbeaten:null));
    const over15=rate(first(m&&m[`${side}Over15Rate`]));
    const over25=rate(first(m&&m[`${side}Over25Rate`]));
    const over35=rate(first(m&&m[`${side}Over35Rate`]));
    const btts=rate(first(htft.ftBtts));
    const noBtts=btts===null?null:1-btts;
    const scored=fts===null?null:1-fts,conceded=cs===null?null:1-cs;
    const noLoss=first(st.noLoss,0),noWin=first(st.noWin,0),noDraw=first(st.noDraw,0),winStreak=first(st.win,0),lossStreak=first(st.loss,0);
    const position=first(m&&m[`${side}Pos`]),tableSize=first(m&&m.tableSize,m&&m.venueTableSize);
    const odds=first(m&&m.odds&&m.odds[home?'home':'away']);
    return {fixture:m,team,league:m&&m.league||'Unknown league',country:m&&m.country||'',logo:m&&m[`${side}Logo`]||'',side,games,ppg,gf,ga,cs,fts,win,draw,loss,unbeaten,over15,over25,over35,under15:over15===null?null:1-over15,under25:over25===null?null:1-over25,under35:over35===null?null:1-over35,btts,noBtts,scored,conceded,noLoss,noWin,noDraw,winStreak,lossStreak,position,tableSize,odds,opponent:m&&m[home?'away':'home'],kickoff:m&&m.kickoff||'',matchDate:dateOf(m)};
  }
  function latestProfiles(){
    const map=new Map();
    for(const m of fixturePool){
      for(const side of ['home','away']){
        const r=sideRow(m,side);if(!r.team)continue;
        const key=`${r.league}|${r.team}|${r.side}`;const old=map.get(key);
        if(!old||String(r.matchDate)>String(old.matchDate)||(r.games||0)>(old.games||0))map.set(key,r);
      }
    }
    return [...map.values()].filter(r=>r.games!==null&&r.games>=MIN_SAMPLE);
  }
  const top4=r=>r.position!==null&&r.position<=4;
  const bottom4=r=>r.position!==null&&r.tableSize!==null&&r.position>=Math.max(1,r.tableSize-3);

  const trends={
    wins:{label:'Wins',title:'High-win teams',copy:'Venue win rate 60%+, PPG 1.70+ and no weak sample.',filter:r=>r.win!==null&&r.win>=.60&&r.ppg!==null&&r.ppg>=1.70,sort:(a,b)=>b.win-a.win||b.ppg-a.ppg,metrics:r=>[['Win rate',pct(r.win)],['Win streak',r.winStreak],['PPG',fmt(r.ppg)]]},
    losses:{label:'Losses',title:'High-loss teams',copy:'Venue loss rate 55%+ with PPG 1.10 or lower.',filter:r=>r.loss!==null&&r.loss>=.55&&r.ppg!==null&&r.ppg<=1.10,sort:(a,b)=>b.loss-a.loss||a.ppg-b.ppg,metrics:r=>[['Loss rate',pct(r.loss)],['Loss streak',r.lossStreak],['PPG',fmt(r.ppg)]]},
    winless:{label:'Winless',title:'Winless teams',copy:'Five-match winless streak or a venue win rate of 20% or lower.',filter:r=>r.noWin>=5||(r.win!==null&&r.win<=.20),sort:(a,b)=>b.noWin-a.noWin||(a.win??1)-(b.win??1),metrics:r=>[['Winless run',r.noWin],['Win rate',pct(r.win)],['PPG',fmt(r.ppg)]]},
    unbeaten:{label:'Unbeaten',title:'Unbeaten teams',copy:'Five-match unbeaten run or an unbeaten venue rate of 80%+.',filter:r=>r.noLoss>=5||(r.unbeaten!==null&&r.unbeaten>=.80),sort:(a,b)=>b.noLoss-a.noLoss||(b.unbeaten??0)-(a.unbeaten??0),metrics:r=>[['Unbeaten run',r.noLoss],['Unbeaten',pct(r.unbeaten)],['PPG',fmt(r.ppg)]]},
    draws:{label:'Draws',title:'Draw-heavy teams',copy:'Venue draw rate of at least 35%.',filter:r=>r.draw!==null&&r.draw>=.35,sort:(a,b)=>b.draw-a.draw,metrics:r=>[['Draw rate',pct(r.draw)],['No-draw run',r.noDraw],['PPG',fmt(r.ppg)]]},
    nodraws:{label:'No Draws',title:'No-draw teams',copy:'Five matches without a draw or a venue draw rate of 15% or lower.',filter:r=>r.noDraw>=5||(r.draw!==null&&r.draw<=.15),sort:(a,b)=>b.noDraw-a.noDraw||(a.draw??1)-(b.draw??1),metrics:r=>[['No-draw run',r.noDraw],['Draw rate',pct(r.draw)],['Win rate',pct(r.win)]]},
    over15:{label:'Over 1.5',title:'Over 1.5 teams',copy:'Venue Over 1.5 rate of at least 80%.',filter:r=>r.over15!==null&&r.over15>=.80,sort:(a,b)=>b.over15-a.over15,metrics:r=>[['Over 1.5',pct(r.over15)],['Scores',fmt(r.gf)],['Concedes',fmt(r.ga)]]},
    under15:{label:'Under 1.5',title:'Under 1.5 teams',copy:'Venue Under 1.5 rate of at least 55%.',filter:r=>r.under15!==null&&r.under15>=.55,sort:(a,b)=>b.under15-a.under15,metrics:r=>[['Under 1.5',pct(r.under15)],['Scores',fmt(r.gf)],['Concedes',fmt(r.ga)]]},
    over25:{label:'Over 2.5',title:'Over 2.5 teams',copy:'Venue Over 2.5 rate of at least 70%.',filter:r=>r.over25!==null&&r.over25>=.70,sort:(a,b)=>b.over25-a.over25,metrics:r=>[['Over 2.5',pct(r.over25)],['Scores',fmt(r.gf)],['Concedes',fmt(r.ga)]]},
    under25:{label:'Under 2.5',title:'Under 2.5 teams',copy:'Venue Under 2.5 rate of at least 65%.',filter:r=>r.under25!==null&&r.under25>=.65,sort:(a,b)=>b.under25-a.under25,metrics:r=>[['Under 2.5',pct(r.under25)],['Scores',fmt(r.gf)],['Concedes',fmt(r.ga)]]},
    over35:{label:'Over 3.5',title:'Over 3.5 teams',copy:'Venue Over 3.5 rate of at least 55%.',filter:r=>r.over35!==null&&r.over35>=.55,sort:(a,b)=>b.over35-a.over35,metrics:r=>[['Over 3.5',pct(r.over35)],['Scores',fmt(r.gf)],['Concedes',fmt(r.ga)]]},
    under35:{label:'Under 3.5',title:'Under 3.5 teams',copy:'Venue Under 3.5 rate of at least 80%.',filter:r=>r.under35!==null&&r.under35>=.80,sort:(a,b)=>b.under35-a.under35,metrics:r=>[['Under 3.5',pct(r.under35)],['Scores',fmt(r.gf)],['Concedes',fmt(r.ga)]]},
    gg:{label:'GG',title:'Both teams to score profiles',copy:'Direct venue BTTS rate 65%+, scoring 70%+ and conceding 65%+.',filter:r=>r.btts!==null&&r.btts>=.65&&(r.scored??0)>=.70&&(r.conceded??0)>=.65,sort:(a,b)=>b.btts-a.btts,metrics:r=>[['GG rate',pct(r.btts)],['Scoring',pct(r.scored)],['Conceding',pct(r.conceded)]]},
    ng:{label:'NG',title:'BTTS No profiles',copy:'Direct venue BTTS No rate of at least 65%.',filter:r=>r.noBtts!==null&&r.noBtts>=.65,sort:(a,b)=>b.noBtts-a.noBtts,metrics:r=>[['NG rate',pct(r.noBtts)],['Clean sheets',pct(r.cs)],['FTS',pct(r.fts)]]}
  };

  const rankingRules={
    edge:{
      best:{title:'Best Team Edges',copy:'PPG 2.20+, scores 2.00+, top four, unbeaten profile and odds 1.55 or shorter.',filter:r=>r.ppg>=2.20&&r.gf>=2&&top4(r)&&r.odds!==null&&r.odds<=1.55&&(r.noLoss>=5||(r.unbeaten||0)>=.80),sort:(a,b)=>b.ppg-a.ppg||b.gf-a.gf,reasons:r=>[`PPG ${fmt(r.ppg)} ≥ 2.20`,`Scores ${fmt(r.gf)} ≥ 2.00`,`Top ${r.position}`,`Odds ${fmt(r.odds)} ≤ 1.55`,r.noLoss>=5?`${r.noLoss} unbeaten`:`${pct(r.unbeaten)} unbeaten`]},
      worst:{title:'Worst Team Edges',copy:'PPG 0.80 or lower, scores 0.80 or less, bottom four, winless profile and odds 4.50 or bigger.',filter:r=>r.ppg<=.80&&r.gf<=.80&&bottom4(r)&&r.odds!==null&&r.odds>=4.50&&(r.noWin>=5||(r.win??1)<=.20),sort:(a,b)=>a.ppg-b.ppg||a.gf-b.gf,reasons:r=>[`PPG ${fmt(r.ppg)} ≤ 0.80`,`Scores ${fmt(r.gf)} ≤ 0.80`,`Bottom ${r.tableSize-r.position+1}`,`Odds ${fmt(r.odds)} ≥ 4.50`,r.noWin>=5?`${r.noWin} winless`:`${pct(r.win)} win rate`]},
      attackBest:{title:'Best Offensive Edges',copy:'Reliable venue samples with 2.00+ scoring and failed-to-score no higher than 20%.',filter:r=>r.gf>=2&&r.fts!==null&&r.fts<=.20,sort:(a,b)=>b.gf-a.gf||b.ppg-a.ppg,reasons:r=>[`Scores ${fmt(r.gf)}`,`FTS ${pct(r.fts)}`,`Sample ${r.games}`]},
      attackWorst:{title:'Worst Offensive Edges',copy:'Reliable venue samples with 0.80 or lower scoring and failed-to-score at least 40%.',filter:r=>r.gf<=.80&&r.fts!==null&&r.fts>=.40,sort:(a,b)=>a.gf-b.gf||b.fts-a.fts,reasons:r=>[`Scores ${fmt(r.gf)}`,`FTS ${pct(r.fts)}`,`Sample ${r.games}`]},
      defenceBest:{title:'Best Defensive Edges',copy:'Concedes no more than 0.80 with a clean-sheet rate of at least 40%.',filter:r=>r.ga<=.80&&r.cs!==null&&r.cs>=.40,sort:(a,b)=>a.ga-b.ga||b.cs-a.cs,reasons:r=>[`Concedes ${fmt(r.ga)}`,`Clean sheets ${pct(r.cs)}`,`Sample ${r.games}`]},
      defenceWorst:{title:'Worst Defensive Edges',copy:'Concedes at least 2.00 and keeps clean sheets in under 20%.',filter:r=>r.ga>=2&&r.cs!==null&&r.cs<.20,sort:(a,b)=>b.ga-a.ga||a.cs-b.cs,reasons:r=>[`Concedes ${fmt(r.ga)}`,`Clean sheets ${pct(r.cs)}`,`Sample ${r.games}`]}
    },season:{}
  };
  rankingRules.season.best={...rankingRules.edge.best,title:'Season Power — Best',copy:'Strong venue power independent of the next-match price.',filter:r=>r.ppg>=2&&r.gf>=1.70&&top4(r)};
  rankingRules.season.worst={...rankingRules.edge.worst,title:'Season Power — Worst',copy:'Weak venue power independent of the next-match price.',filter:r=>r.ppg<=1&&r.gf<=1&&bottom4(r)};
  rankingRules.season.attackBest={...rankingRules.edge.attackBest,title:'Season Attack — Best'};
  rankingRules.season.attackWorst={...rankingRules.edge.attackWorst,title:'Season Attack — Worst'};
  rankingRules.season.defenceBest={...rankingRules.edge.defenceBest,title:'Season Defence — Best'};
  rankingRules.season.defenceWorst={...rankingRules.edge.defenceWorst,title:'Season Defence — Worst'};

  const params=new URLSearchParams(location.search);
  let mode=['rankings','trends','lab'].includes(params.get('mode'))?params.get('mode'):'rankings';
  let view=['edge','season'].includes(params.get('view'))?params.get('view'):'edge';
  let category=['best','worst','attack','defence'].includes(params.get('category'))?params.get('category'):'best';
  let polarity=['Best','Worst'].includes(params.get('polarity'))?params.get('polarity'):'Best';
  let trend=trends[params.get('trend')]?params.get('trend'):'unbeaten';
  let rankQuery='',rankLeague='all',trendQuery='',trendLeague='all';
  const rankKey=()=>category==='attack'?`attack${polarity}`:category==='defence'?`defence${polarity}`:category;
  const profiles=latestProfiles();

  function setOptions(select,values,current='all'){
    if(!select)return;
    select.innerHTML='<option value="all">All leagues</option>'+values.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    select.value=values.includes(current)?current:'all';
  }
  function rankCard(r,cfg){
    const reason=cfg.reasons(r).map(x=>`<li>${esc(x)}</li>`).join('');
    return `<article class="p2u-team-rank-card"><div class="p2u-team-rank-number">${r.position&&r.tableSize?`${r.position}/${r.tableSize}`:'—'}</div><div class="p2u-team-rank-head">${r.logo?`<img src="${esc(r.logo)}" alt="" loading="lazy">`:''}<div><h3>${esc(r.team)}</h3><p>${esc(r.league)}${r.country?` · ${esc(r.country)}`:''}</p></div></div><div class="p2u-team-rank-metrics"><span><b>${fmt(r.ppg)}</b><small>PPG</small></span><span><b>${fmt(r.gf)}</b><small>Scores</small></span><span><b>${fmt(r.ga)}</b><small>Concedes</small></span><span><b>${pct(r.cs)}</b><small>Clean sheets</small></span><span><b>${r.games}</b><small>Venue sample</small></span><span><b>${r.odds?fmt(r.odds):'—'}</b><small>Next odds</small></span></div><ul class="p2u-team-rank-reasons">${reason}</ul><div class="p2u-team-rank-footer"><span>${esc(r.matchDate||'')}</span><span>${r.side==='home'?'Home':'Away'} vs ${esc(r.opponent||'TBD')}</span></div></article>`;
  }
  function trendCard(r,cfg){
    const metrics=cfg.metrics(r).map(([label,value])=>`<span><b>${esc(value)}</b><small>${esc(label)}</small></span>`).join('');
    return `<article class="p2u-team-rank-card p2u-team-trend-card"><div class="p2u-team-rank-number">${r.side==='home'?'H':'A'}</div><div class="p2u-team-rank-head">${r.logo?`<img src="${esc(r.logo)}" alt="" loading="lazy">`:''}<div><h3>${esc(r.team)}</h3><p>${esc(r.league)} · ${r.side==='home'?'Home split':'Away split'}</p></div></div><div class="p2u-team-rank-metrics">${metrics}<span><b>${r.games}</b><small>Sample</small></span><span><b>${fmt(r.gf)}</b><small>Scores</small></span><span><b>${fmt(r.ga)}</b><small>Concedes</small></span></div><div class="p2u-team-rank-footer"><span>${esc(r.matchDate||'')}</span><span>vs ${esc(r.opponent||'TBD')}</span></div></article>`;
  }

  function renderRankings(){
    const cfg=rankingRules[view][rankKey()];
    let rows=profiles.filter(cfg.filter);
    if(rankLeague!=='all')rows=rows.filter(r=>r.league===rankLeague);
    if(rankQuery)rows=rows.filter(r=>`${r.team} ${r.league} ${r.country}`.toLowerCase().includes(rankQuery));
    rows.sort((a,b)=>String(a.league).localeCompare(String(b.league))||cfg.sort(a,b));
    $('team-rank-title').textContent=cfg.title;$('team-rank-copy').textContent=cfg.copy;$('team-rank-count').textContent=`${rows.length} qualified · sample ${MIN_SAMPLE}+`;
    $('team-rank-grid').innerHTML=rows.length?rows.slice(0,100).map(r=>rankCard(r,cfg)).join(''):'<div class="p2u-team-rank-empty">No teams pass every threshold in the loaded fixture set. That is a valid no-qualification result.</div>';
    document.querySelectorAll('[data-rank-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.rankView===view));
    document.querySelectorAll('[data-rank-category]').forEach(b=>b.classList.toggle('is-active',b.dataset.rankCategory===category));
    (document.querySelector('.p2u-team-polarity-cluster')||document.querySelector('.p2u-team-rank-polarity')).hidden=!['attack','defence'].includes(category);
    document.querySelectorAll('[data-rank-polarity]').forEach(b=>b.classList.toggle('is-active',b.dataset.rankPolarity===polarity));
  }
  function renderTrends(){
    const cfg=trends[trend];let rows=profiles.filter(cfg.filter);
    if(trendLeague!=='all')rows=rows.filter(r=>r.league===trendLeague);
    if(trendQuery)rows=rows.filter(r=>`${r.team} ${r.league} ${r.country}`.toLowerCase().includes(trendQuery));
    rows.sort((a,b)=>String(a.league).localeCompare(String(b.league))||cfg.sort(a,b));
    $('team-trend-title').textContent=cfg.title;$('team-trend-copy').textContent=cfg.copy;$('team-trend-count').textContent=`${rows.length} qualified · split sample ${MIN_SAMPLE}+`;
    $('team-trend-grid').innerHTML=rows.length?rows.slice(0,120).map(r=>trendCard(r,cfg)).join(''):'<div class="p2u-team-rank-empty">No teams pass this trend threshold in the loaded fixture set.</div>';
    document.querySelectorAll('[data-trend]').forEach(b=>b.classList.toggle('is-active',b.dataset.trend===trend));
  }

  function traitPass(row,key){const cfg=trends[key];return !!(cfg&&row&&row.games>=MIN_SAMPLE&&cfg.filter(row));}
  function labMatches(){
    const homeTrait=$('lab-home-trait').value,awayTrait=$('lab-away-trait').value;
    return fixturePool.map(m=>({m,home:sideRow(m,'home'),away:sideRow(m,'away')})).filter(x=>traitPass(x.home,homeTrait)&&traitPass(x.away,awayTrait));
  }
  function populateLabMatches(){
    const rows=labMatches(),homeSelect=$('lab-home-team'),awaySelect=$('lab-away-team');
    homeSelect.innerHTML=rows.length?rows.map(x=>`<option value="${esc(String(x.m.id))}">${esc(x.home.team)} · ${esc(x.m.league)} · ${esc(x.m.matchDate||'')}</option>`).join(''):'<option value="">No loaded match qualifies</option>';
    homeSelect.disabled=!rows.length;$('lab-analyse').disabled=!rows.length;
    const selected=rows.find(x=>String(x.m.id)===homeSelect.value)||rows[0];
    awaySelect.innerHTML=selected?`<option>${esc(selected.away.team)}</option>`:'<option>—</option>';
    $('lab-match-count').textContent=rows.length?`${rows.length} loaded fixture${rows.length===1?'':'s'} match both selected profiles.`:'No loaded fixture currently matches both profiles. Try another combination.';
    if(rows.length)renderLabPlaceholder(selected);else $('lab-result').innerHTML='<div class="p2u-team-rank-empty">No qualifying fixture is available for this profile combination.</div>';
  }
  function oddsValue(m,key){return first(m&&m.odds&&m.odds[key]);}
  function leagueRate(m,key){return rate(m&&m.leagueTrends&&m.leagueTrends.rates&&m.leagueTrends.rates[key]);}
  function average(values){const xs=values.filter(v=>v!==null&&Number.isFinite(v));return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}
  function analyseMatch(m,homeTrait,awayTrait){
    const h=sideRow(m,'home'),a=sideRow(m,'away');
    const candidates=[];const projection=((h.gf??1.2)+(a.ga??1.2))/2+((a.gf??1.1)+(h.ga??1.1))/2;
    const sample=Math.min(h.games||0,a.games||0),sampleScore=clamp((sample-6)*2,0,10);
    const addCandidate=(market,score,oddsKey,reasons,checks=[])=>{
      const odds=oddsValue(m,oddsKey);if(odds===null)return;
      if(checks.some(Boolean))return;
      candidates.push({market,score:clamp(score+sampleScore),odds,reasons});
    };
    const ppgEdge=(h.ppg??1.2)-(a.ppg??1.2),attackEdge=(h.gf??1.2)-(a.ga??1.2),awayEdge=(a.ppg??1.2)-(h.ppg??1.2);
    addCandidate(`${h.team} to win`,64+ppgEdge*12+((h.win??.35)-(a.win??.35))*24+((a.loss??.35)-(h.loss??.35))*12,'home',[`Home split PPG edge ${fmt(ppgEdge)}`,`Home win rate ${pct(h.win)}`,`Away loss rate ${pct(a.loss)}`],[ppgEdge<.55,(h.win??0)<.45,(a.unbeaten??0)>.72,oddsValue(m,'home')>2.20]);
    addCandidate(`${a.team} to win`,64+awayEdge*12+((a.win??.35)-(h.win??.35))*24+((h.loss??.35)-(a.loss??.35))*12,'away',[`Away split PPG edge ${fmt(awayEdge)}`,`Away win rate ${pct(a.win)}`,`Home loss rate ${pct(h.loss)}`],[awayEdge<.55,(a.win??0)<.45,(h.unbeaten??0)>.72,oddsValue(m,'away')>2.20]);
    addCandidate(`${h.team} or Draw`,70+((h.unbeaten??.5)-.65)*40+(.30-(a.win??.3))*25,'dc1x',[`Home unbeaten ${pct(h.unbeaten)}`,`Away win rate ${pct(a.win)}`],[(h.unbeaten??0)<.70,(a.win??1)>.32,oddsValue(m,'dc1x')>1.48]);
    addCandidate(`Draw or ${a.team}`,70+((a.unbeaten??.5)-.65)*40+(.30-(h.win??.3))*25,'dcx2',[`Away unbeaten ${pct(a.unbeaten)}`,`Home win rate ${pct(h.win)}`],[(a.unbeaten??0)<.70,(h.win??1)>.32,oddsValue(m,'dcx2')>1.48]);
    const o15=average([h.over15,a.over15,leagueRate(m,'Over 1.5')]);
    const o25=average([h.over25,a.over25,leagueRate(m,'Over 2.5')]);
    const o35=average([h.over35,a.over35,leagueRate(m,'Over 3.5')]);
    const u15=o15===null?null:1-o15,u25=o25===null?null:1-o25,u35=o35===null?null:1-o35;
    addCandidate('Over 1.5 Goals',(o15??0)*86+Math.min(10,Math.max(0,projection-2.2)*8),'over15',[`Combined Over 1.5 profile ${pct(o15)}`,`Projected total ${fmt(projection)}`,`League Over 1.5 ${pct(leagueRate(m,'Over 1.5'))}`],[(o15??0)<.78,projection<2.25,oddsValue(m,'over15')>1.45]);
    addCandidate('Under 1.5 Goals',(u15??0)*90+Math.min(8,Math.max(0,1.8-projection)*10),'under15',[`Combined Under 1.5 profile ${pct(u15)}`,`Projected total ${fmt(projection)}`],[(u15??0)<.58,projection>1.85,oddsValue(m,'under15')>2.25]);
    addCandidate('Over 2.5 Goals',(o25??0)*90+Math.min(8,Math.max(0,projection-2.7)*8),'over25',[`Combined Over 2.5 profile ${pct(o25)}`,`Projected total ${fmt(projection)}`,`League Over 2.5 ${pct(leagueRate(m,'Over 2.5'))}`],[(o25??0)<.65,projection<2.65,oddsValue(m,'over25')>2.05]);
    addCandidate('Under 2.5 Goals',(u25??0)*90+Math.min(8,Math.max(0,2.45-projection)*8),'under25',[`Combined Under 2.5 profile ${pct(u25)}`,`Projected total ${fmt(projection)}`],[(u25??0)<.65,projection>2.50,oddsValue(m,'under25')>2.05]);
    addCandidate('Over 3.5 Goals',(o35??0)*92+Math.min(8,Math.max(0,projection-3.3)*7),'over35',[`Combined Over 3.5 profile ${pct(o35)}`,`Projected total ${fmt(projection)}`],[(o35??0)<.52,projection<3.20,oddsValue(m,'over35')>3.10]);
    addCandidate('Under 3.5 Goals',(u35??0)*88+Math.min(9,Math.max(0,3.15-projection)*7),'under35',[`Combined Under 3.5 profile ${pct(u35)}`,`Projected total ${fmt(projection)}`,`League Under 3.5 ${pct(leagueRate(m,'Under 3.5'))}`],[(u35??0)<.76,projection>3.20,oddsValue(m,'under35')>1.60]);
    const gg=average([h.btts,a.btts,leagueRate(m,'BTTS Yes')]);
    addCandidate('Both Teams to Score — Yes',(gg??0)*88+average([h.scored,a.scored,h.conceded,a.conceded])*10,'bttsYes',[`Direct split GG profile ${pct(gg)}`,`${h.team} scoring ${pct(h.scored)}`,`${a.team} scoring ${pct(a.scored)}`],[(gg??0)<.65,(h.scored??0)<.70,(a.scored??0)<.70,(h.conceded??0)<.65,(a.conceded??0)<.65,oddsValue(m,'bttsYes')>1.78]);
    const ng=average([h.noBtts,a.noBtts,leagueRate(m,'BTTS No')]);
    addCandidate('Both Teams to Score — No',(ng??0)*90+Math.max(h.fts??0,a.fts??0)*8,'bttsNo',[`Direct split NG profile ${pct(ng)}`,`Highest failed-to-score rate ${pct(Math.max(h.fts??0,a.fts??0))}`,`Best clean-sheet rate ${pct(Math.max(h.cs??0,a.cs??0))}`],[(ng??0)<.64,oddsValue(m,'bttsNo')>1.90]);
    const noDrawStrength=average([h.draw===null?null:1-h.draw,a.draw===null?null:1-a.draw,leagueRate(m,'Draw')===null?null:1-leagueRate(m,'Draw')]);
    addCandidate('No Draw — 12',(noDrawStrength??0)*88+Math.min(10,(h.noDraw+a.noDraw)*1.2),'dc12',[`Home no-draw run ${h.noDraw}`,`Away no-draw run ${a.noDraw}`,`Combined no-draw profile ${pct(noDrawStrength)}`],[(h.draw??1)>.22,(a.draw??1)>.22,h.noDraw+a.noDraw<6,oddsValue(m,'dc12')>1.55]);
    if(homeTrait==='winless'&&awayTrait==='nodraws')for(const c of candidates){if(c.market.includes(a.team)||c.market==='No Draw — 12')c.score=clamp(c.score+4);}
    if(homeTrait==='unbeaten'&&awayTrait==='losses')for(const c of candidates){if(c.market.includes(h.team)||c.market.includes('or Draw'))c.score=clamp(c.score+4);}
    candidates.sort((x,y)=>y.score-x.score);
    const qualified=candidates.filter(c=>c.score>=76);
    const primary=qualified[0]||null;
    const supporting=qualified.slice(1,3).filter(c=>!primary||Math.abs(c.score-primary.score)<=10);
    const warnings=[];
    if(sample<MIN_SAMPLE)warnings.push(`Minimum split sample not met: ${sample}.`);
    if(usingFallback)warnings.push('No current-window fixture was loaded, so this analysis uses the latest unresolved fixture in the public dataset.');
    if(!m.odds||!Object.keys(m.odds).length)warnings.push('Market odds are unavailable.');
    if(primary&&qualified[1]&&primary.score-qualified[1].score<2)warnings.push('Top markets are very close; treat the selection as lower confidence.');
    return {h,a,projection,candidates,primary,supporting,warnings,sample,homeTrait,awayTrait};
  }
  function renderLabPlaceholder(selected){
    $('lab-result').innerHTML=`<div class="p2u-lab-preview"><strong>${esc(selected.home.team)} vs ${esc(selected.away.team)}</strong><span>${esc(selected.m.league)} · ${esc(selected.m.matchDate||'')}</span><small>Tap Analyse matchup to generate the safest qualifying market.</small></div>`;
  }
  function renderAnalysis(m){
    const homeTrait=$('lab-home-trait').value,awayTrait=$('lab-away-trait').value,result=analyseMatch(m,homeTrait,awayTrait),{h,a,primary,supporting,warnings}=result;
    const profileBox=(r,trait)=>`<article><span>${r.side==='home'?'HOME PROFILE':'AWAY PROFILE'}</span><h3>${esc(r.team)}</h3><b>${esc(trends[trait].label)}</b><div><small>PPG <strong>${fmt(r.ppg)}</strong></small><small>W/D/L <strong>${pct(r.win)} / ${pct(r.draw)} / ${pct(r.loss)}</strong></small><small>GF/GA <strong>${fmt(r.gf)} / ${fmt(r.ga)}</strong></small><small>Sample <strong>${r.games}</strong></small></div></article>`;
    const primaryHtml=primary?`<div class="p2u-lab-pick"><span>SAFEST QUALIFYING PICK</span><h2>${esc(primary.market)}</h2><div class="p2u-lab-pick-meta"><b>${Math.round(primary.score)}% model strength</b><b>Odds ${fmt(primary.odds)}</b></div><ul>${primary.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:`<div class="p2u-lab-no-bet"><span>STRICT RESULT</span><h2>No Bet</h2><p>No market cleared the minimum evidence, price and contradiction checks. The Lab will not force a selection.</p></div>`;
    const supportHtml=supporting.length?`<div class="p2u-lab-support"><h3>Supporting markets</h3>${supporting.map(c=>`<div><b>${esc(c.market)}</b><span>${Math.round(c.score)}% · ${fmt(c.odds)}</span></div>`).join('')}</div>`:'';
    const warnHtml=warnings.length?`<div class="p2u-lab-warnings"><strong>Data notes</strong>${warnings.map(x=>`<p>${esc(x)}</p>`).join('')}</div>`:'';
    $('lab-result').innerHTML=`<div class="p2u-lab-result-head"><div><span>${esc(m.league||'')}</span><h2>${esc(h.team)} <i>vs</i> ${esc(a.team)}</h2><p>${esc(m.matchDate||'')} · projected total ${fmt(result.projection)}</p></div></div><div class="p2u-lab-profiles">${profileBox(h,homeTrait)}${profileBox(a,awayTrait)}</div>${primaryHtml}${supportHtml}${warnHtml}<p class="p2u-lab-disclaimer">This is a statistical match classification, not a guarantee. It only uses the currently loaded split data and odds.</p>`;
  }
  function analyseSelected(){const rows=labMatches(),selected=rows.find(x=>String(x.m.id)===$('lab-home-team').value);if(selected)renderAnalysis(selected.m);}
  function setMode(next){
    mode=next;document.querySelectorAll('[data-team-mode]').forEach(b=>b.classList.toggle('is-active',b.dataset.teamMode===mode));
    document.querySelectorAll('[data-team-panel]').forEach(p=>{const active=p.dataset.teamPanel===mode;p.hidden=!active;p.classList.toggle('is-active',active);});
    const url=new URL(location.href);url.searchParams.set('mode',mode);history.replaceState(null,'',url);
  }
  function init(){
    const leagues=[...new Set(profiles.map(r=>r.league))].sort();setOptions($('team-rank-league'),leagues,rankLeague);setOptions($('team-trend-league'),leagues,trendLeague);
    $('team-rank-window').textContent=currentPool.length?`Current fixture window: ${today} to ${windowEnd} · ${currentPool.length} loaded matches`:`Latest loaded unresolved fixtures shown · data source updated ${window.P2U_DATA_META&&window.P2U_DATA_META.sourceUpdatedAt?new Date(window.P2U_DATA_META.sourceUpdatedAt).toLocaleString():'unknown'}`;
    $('team-trend-chips').innerHTML=Object.entries(trends).map(([key,cfg])=>`<button data-trend="${key}">${esc(cfg.label)}</button>`).join('');
    const traitOptions=Object.entries(trends).map(([key,cfg])=>`<option value="${key}">${esc(cfg.label)}</option>`).join('');$('lab-home-trait').innerHTML=traitOptions;$('lab-away-trait').innerHTML=traitOptions;$('lab-home-trait').value='winless';$('lab-away-trait').value='nodraws';
    document.querySelectorAll('[data-team-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.teamMode));
    document.querySelectorAll('[data-rank-view]').forEach(b=>b.onclick=()=>{view=b.dataset.rankView;renderRankings();});
    document.querySelectorAll('[data-rank-category]').forEach(b=>b.onclick=()=>{category=b.dataset.rankCategory;renderRankings();});
    document.querySelectorAll('[data-rank-polarity]').forEach(b=>b.onclick=()=>{polarity=b.dataset.rankPolarity;renderRankings();});
    document.querySelectorAll('[data-trend]').forEach(b=>b.onclick=()=>{trend=b.dataset.trend;renderTrends();});
    $('team-rank-search').oninput=e=>{rankQuery=String(e.target.value||'').trim().toLowerCase();renderRankings();};
    $('team-rank-league').onchange=e=>{rankLeague=e.target.value;renderRankings();};
    $('team-trend-search').oninput=e=>{trendQuery=String(e.target.value||'').trim().toLowerCase();renderTrends();};
    $('team-trend-league').onchange=e=>{trendLeague=e.target.value;renderTrends();};
    $('lab-home-trait').onchange=populateLabMatches;$('lab-away-trait').onchange=populateLabMatches;
    $('lab-home-team').onchange=()=>{const rows=labMatches(),selected=rows.find(x=>String(x.m.id)===$('lab-home-team').value);$('lab-away-team').innerHTML=selected?`<option>${esc(selected.away.team)}</option>`:'<option>—</option>';if(selected)renderLabPlaceholder(selected);};
    $('lab-analyse').onclick=analyseSelected;
    renderRankings();renderTrends();populateLabMatches();setMode(mode);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
