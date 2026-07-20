/* Predict2U v270 — minimal public learning status. No private weights or rule performance are exposed. */
(function(){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":'&#39;'}[c]));
  const $=id=>document.getElementById(id);
  let publicState=null;

  function statusLabel(state){
    if(state==='stable')return 'Stable';
    if(state==='active')return 'Active';
    return 'Monitoring';
  }
  function render(){
    const root=$('team-auto-learning');
    if(!root)return;
    const s=publicState||{modelVersion:'Auto Profile v1.1',status:'monitoring',settled:0,recent:[]};
    root.innerHTML=`<div><span>LEARNING SUPERVISOR</span><b>${esc(statusLabel(s.status))}</b></div><p>${esc(s.modelVersion||'Auto Profile v1.1')} · ${Number(s.settled||0)} settled selections</p><small>Settled results are reviewed privately. Public cards show only the current model status and verified outcomes.</small>`;
    const recent=$('team-auto-learning-recent');
    if(!recent)return;
    const rows=Array.isArray(s.recent)?s.recent.slice(0,6):[];
    recent.innerHTML=rows.length?`<div class="p2u-learning-recent-head"><h3>Recent settled auto picks</h3><span>${rows.length} shown</span></div><div class="p2u-learning-recent-grid">${rows.map(r=>`<article class="is-${String(r.result||'').toLowerCase()}"><div><b>${esc(r.home)} vs ${esc(r.away)}</b><small>${esc(r.market)}</small></div><span>${esc(r.result)}</span><em>${esc(r.score||'')}</em></article>`).join('')}</div>`:'';
  }
  async function load(){
    try{
      const response=await fetch(`auto-picks-learning-public-v270.json?v=${Date.now()}`,{cache:'no-store'});
      if(response.ok)publicState=await response.json();
    }catch(_){/* Keep the quiet fallback. */}
    render();
  }
  function decorate(){
    document.querySelectorAll('.p2u-auto-learning-pill').forEach(el=>{
      const state=el.dataset.learningState||'monitor';
      el.textContent=state==='watch'?'Model watch':state==='boost'?'Model confirmed':'Learning tracked';
    });
  }
  window.P2UAutoLearningV270={decorate,load,get state(){return publicState;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
