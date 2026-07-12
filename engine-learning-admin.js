/* Predict2U v193 — protected Engine Learning dashboard */
(function(){
  "use strict";
  const $=s=>document.querySelector(s);
  const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const pct=v=>Number.isFinite(Number(v))?`${Math.round(Number(v)*100)}%`:'—';
  const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString():'0';
  const flagText=(a=[])=>a.map(x=>String(x).replace(/_/g,' ')).join(' · ')||'Learning';
  let loading=false;

  function rows(items,kind){
    if(!items||!items.length)return '<tr><td colspan="5" class="learning-empty">Not enough settled evidence yet.</td></tr>';
    return items.slice(0,12).map(x=>{
      if(kind==='team')return `<tr><td><strong>${esc(x.name)}</strong><small>${esc(x.league||'')}</small></td><td>${fmt(x.favorite&&x.favorite.sample)}</td><td>${pct(x.favorite&&x.favorite.winRate)}</td><td>${pct(x.favorite&&x.favorite.upsetRate)}</td><td><span class="learning-flag">${esc(flagText(x.flags))}</span></td></tr>`;
      if(kind==='dog')return `<tr><td><strong>${esc(x.name)}</strong><small>${esc(x.league||'')}</small></td><td>${fmt(x.underdog&&x.underdog.sample)}</td><td>${pct(x.underdog&&x.underdog.winRate)}</td><td>${pct(x.underdog&&x.underdog.nonLossRate)}</td><td><span class="learning-flag amber">${esc(flagText(x.flags))}</span></td></tr>`;
      return `<tr><td><strong>${esc(x.league)}</strong></td><td>${fmt(x.favorite&&x.favorite.sample)}</td><td>${pct(x.favorite&&x.favorite.winRate)}</td><td>${pct(x.favorite&&x.favorite.upsetRate)}</td><td><span class="learning-flag ${x.flags&&x.flags.includes('FAVORITE_STABLE_LEAGUE')?'good':'danger'}">${esc(flagText(x.flags))}</span></td></tr>`;
    }).join('');
  }
  function causes(items){
    const host=$('#learning-causes');if(!host)return;
    host.innerHTML=(items||[]).length?(items||[]).slice(0,10).map(x=>`<div class="learning-cause"><span>${esc(String(x.cause).replace(/_/g,' '))}</span><strong>${fmt(x.count)}</strong></div>`).join(''):'<div class="learning-empty">Miss causes appear after settled losses are reviewed.</div>';
  }
  function reviews(items){
    const host=$('#learning-reviews-body');if(!host)return;
    host.innerHTML=(items||[]).length?(items||[]).slice(0,20).map(x=>`<tr><td>${esc(x.matchDate||'')}</td><td><strong>${esc(x.home)} vs ${esc(x.away)}</strong><small>${esc(x.league||'')}</small></td><td>${esc(x.engine)}</td><td>${esc(x.market)}</td><td>${esc((x.causes||[]).map(c=>c.replace(/_/g,' ')).join(' · '))}</td></tr>`).join(''):'<tr><td colspan="5" class="learning-empty">No reviewed losses yet.</td></tr>';
  }
  function render(r){
    const s=r.summary||{};
    $('#learning-settled').textContent=fmt(s.settledDecisions);
    $('#learning-losses').textContent=fmt(s.reviewedLosses);
    $('#learning-breakers').textContent=fmt(s.activePatternBreakers);
    $('#learning-stable').textContent=fmt(s.upsetResistantTeams);
    $('#learning-updated').textContent=r.updated?new Date(r.updated).toLocaleString():'Not built yet';
    $('#learning-breaker-body').innerHTML=rows(r.patternBreakers,'team');
    $('#learning-resistant-body').innerHTML=rows(r.upsetResistant,'team');
    $('#learning-underdog-body').innerHTML=rows(r.dangerousUnderdogs,'dog');
    $('#learning-league-body').innerHTML=rows([...(r.volatileLeagues||[]),...(r.stableLeagues||[])],'league');
    causes(r.commonMissCauses);reviews(r.recentLossReviews);
    $('#learning-state').textContent=s.settledDecisions?`Forward ledger active · ${fmt(s.teamProfiles)} team profiles · ${fmt(s.leagueProfiles)} league profiles`:'Learning mode is ready. Profiles unlock as forward-settled evidence grows.';
  }
  async function load(){
    if(loading)return;loading=true;
    const state=$('#learning-state');if(state)state.textContent='Loading the latest learning ledger…';
    try{
      const res=await fetch(`engine-learning-report.json?ts=${Date.now()}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      render(await res.json());
    }catch(e){if(state)state.textContent='Learning report is not available yet. Run the live-score workflow after installing v193.';}
    finally{loading=false;}
  }
  document.addEventListener('click',e=>{
    const tab=e.target.closest('[data-admin-tab="learning"]');if(tab)setTimeout(load,40);
    if(e.target.closest('#refresh-learning'))load();
  });
  document.addEventListener('DOMContentLoaded',()=>{
    if(location.hash==='#learning')setTimeout(load,250);
  });
  window.P2UEngineLearningAdmin={load};
})();
