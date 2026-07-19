/* Predict2U v262 — Best/Worst and attack/defence team lists. */
(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num=v=>v===null||v===undefined||v===""||!Number.isFinite(Number(v))?null:Number(v);
  const rate=v=>{const n=num(v);return n===null?null:(n>1.00001?n/100:n);};
  const first=(...v)=>{for(const x of v){const n=num(x);if(n!==null)return n;}return null;};
  const div=(a,b)=>num(a)!==null&&num(b)!==null&&Number(b)!==0?Number(a)/Number(b):null;
  const dateOf=m=>String(m&&m.matchDate||m&&m.kickoff||"").slice(0,10);
  const upcoming=m=>m&&m.homeGoals==null&&!["FT","AET","PEN","PST","CANC"].includes(String(m.status||"").toUpperCase());
  function sideRow(m,side){
    const home=side==="home",team=m&&m[side],games=first(m&&m[`${side}VenueGames`],m&&m[`${side}Streaks`]&&m[`${side}Streaks`].sample);
    const ppg=first(div(m&&m[`${side}VenuePts`],games),m&&m[`${side}Recent10PPG`]);
    const gf=home?first(m&&m.homeScoredAtHome,m&&m.homeProfile&&m.homeProfile.goalsFor&&m.homeProfile.goalsFor.v):first(m&&m.awayScoredAway,m&&m.awayProfile&&m.awayProfile.goalsFor&&m.awayProfile.goalsFor.v);
    const ga=home?first(m&&m.homeConcededAtHome,m&&m.homeProfile&&m.homeProfile.goalsAg&&m.homeProfile.goalsAg.v):first(m&&m.awayConcededAway,m&&m.awayProfile&&m.awayProfile.goalsAg&&m.awayProfile.goalsAg.v);
    const cs=rate(first(m&&m[`${side}CleanSheetRate`],m&&m[`${side}Streaks`]&&m[`${side}Streaks`].htft&&m[`${side}Streaks`].htft.ftCS));
    const fts=rate(first(m&&m[`${side}FailedToScoreRate`],m&&m[`${side}Streaks`]&&m[`${side}Streaks`].htft&&m[`${side}Streaks`].htft.ftFTS));
    const unbeaten=rate(m&&m[`${side}UnbeatenRate`]);
    const win=rate(m&&m[`${side}WinRate`]);
    const noLoss=first(m&&m[`${side}Streaks`]&&m[`${side}Streaks`].noLoss,0),noWin=first(m&&m[`${side}Streaks`]&&m[`${side}Streaks`].noWin,0);
    const position=first(m&&m[`${side}Pos`]),tableSize=first(m&&m.tableSize,m&&m.venueTableSize);
    const odds=first(m&&m.odds&&m.odds[home?"home":"away"]);
    return {team,league:m&&m.league||"Unknown league",country:m&&m.country||"",logo:m&&m[`${side}Logo`]||"",side,ppg,gf,ga,cs,fts,unbeaten,win,noLoss,noWin,position,tableSize,odds,opponent:m&&m[home?"away":"home"],kickoff:m&&m.kickoff||"",matchDate:dateOf(m)};
  }
  function uniqueTeams(){
    const map=new Map();
    for(const m of (window.MATCHES||[])){
      if(!upcoming(m))continue;
      for(const side of ["home","away"]){const r=sideRow(m,side);if(!r.team)continue;const k=`${r.league}|${r.team}`;const old=map.get(k);if(!old||String(r.kickoff)<String(old.kickoff))map.set(k,r);}
    }
    return [...map.values()];
  }
  const top4=r=>r.position!==null&&r.position<=4;
  const bottom4=r=>r.position!==null&&r.tableSize!==null&&r.position>=Math.max(1,r.tableSize-3);
  const best=r=>r.ppg!==null&&r.ppg>=2.20&&r.gf!==null&&r.gf>=2.00&&top4(r)&&r.odds!==null&&r.odds<=1.55&&(r.noLoss>=5||(r.unbeaten!==null&&r.unbeaten>=.80));
  const worst=r=>r.ppg!==null&&r.ppg<=.80&&r.gf!==null&&r.gf<=.80&&bottom4(r)&&r.odds!==null&&r.odds>=4.50&&(r.noWin>=5||(r.win!==null&&r.win<=.20));
  const configs={
    best:{title:"Best Teams",copy:"PPG 2.20+, scores 2.00+ per match, top four, unbeaten profile and match odds 1.55 or shorter.",filter:best,sort:(a,b)=>b.ppg-a.ppg||b.gf-a.gf},
    worst:{title:"Worst Teams",copy:"PPG 0.80 or lower, scores 0.80 or less, bottom four, winless profile and match odds 4.50 or bigger.",filter:worst,sort:(a,b)=>a.ppg-b.ppg||a.gf-b.gf},
    attack:{title:"Best Offensive Teams",copy:"Highest verified split scoring averages with reliable scoring frequency.",filter:r=>r.gf!==null&&r.gf>=2.00&&r.fts!==null&&r.fts<=.20,sort:(a,b)=>b.gf-a.gf||b.ppg-a.ppg},
    weakAttack:{title:"Worst Offensive Teams",copy:"Lowest split scoring averages and frequent failed-to-score records.",filter:r=>r.gf!==null&&r.gf<=.80&&r.fts!==null&&r.fts>=.40,sort:(a,b)=>a.gf-b.gf||b.fts-a.fts},
    defence:{title:"Best Defensive Teams",copy:"Concedes no more than 0.80 per split match with at least a 40% clean-sheet rate.",filter:r=>r.ga!==null&&r.ga<=.80&&r.cs!==null&&r.cs>=.40,sort:(a,b)=>a.ga-b.ga||b.cs-a.cs},
    weakDefence:{title:"Worst Defensive Teams",copy:"Concedes at least 2.00 per split match and keeps clean sheets in under 20%.",filter:r=>r.ga!==null&&r.ga>=2.00&&r.cs!==null&&r.cs<.20,sort:(a,b)=>b.ga-a.ga||a.cs-b.cs}
  };
  let mode="best",query="";
  function pct(v){return v===null?"—":`${Math.round(v*100)}%`;}
  function n(v){return v===null?"—":Number(v).toFixed(2);}
  function card(r,i){return `<article class="p2u-team-rank-card"><div class="p2u-team-rank-number">${i+1}</div><div class="p2u-team-rank-head">${r.logo?`<img src="${esc(r.logo)}" alt="" loading="lazy">`:""}<div><h3>${esc(r.team)}</h3><p>${esc(r.league)}${r.country?` · ${esc(r.country)}`:""}</p></div></div><div class="p2u-team-rank-metrics"><span><b>${n(r.ppg)}</b><small>PPG</small></span><span><b>${n(r.gf)}</b><small>Scores</small></span><span><b>${n(r.ga)}</b><small>Concedes</small></span><span><b>${pct(r.cs)}</b><small>Clean sheets</small></span><span><b>${r.position&&r.tableSize?`${r.position}/${r.tableSize}`:"—"}</b><small>Position</small></span><span><b>${r.odds?Number(r.odds).toFixed(2):"—"}</b><small>Next odds</small></span></div><div class="p2u-team-rank-footer"><span>${r.noLoss?`${r.noLoss} unbeaten`:r.noWin?`${r.noWin} winless`:"Current split form"}</span><span>vs ${esc(r.opponent||"TBD")}</span></div></article>`;}
  function render(){
    const all=uniqueTeams(),cfg=configs[mode];let rows=all.filter(cfg.filter).sort(cfg.sort);
    if(query)rows=rows.filter(r=>`${r.team} ${r.league} ${r.country}`.toLowerCase().includes(query));
    $("team-rank-title").textContent=cfg.title;$("team-rank-copy").textContent=cfg.copy;$("team-rank-count").textContent=`${rows.length} qualified`;
    $("team-rank-grid").innerHTML=rows.length?rows.slice(0,60).map(card).join(""):`<div class="p2u-team-rank-empty">No teams meet every strict threshold in the current seven-day fixture window.</div>`;
    document.querySelectorAll("[data-rank-mode]").forEach(b=>b.classList.toggle("is-active",b.dataset.rankMode===mode));
  }
  document.addEventListener("DOMContentLoaded",()=>{
    document.querySelectorAll("[data-rank-mode]").forEach(b=>b.addEventListener("click",()=>{mode=b.dataset.rankMode;render();}));
    $("team-rank-search").addEventListener("input",e=>{query=String(e.target.value||"").trim().toLowerCase();render();});
    render();
  });
})();
