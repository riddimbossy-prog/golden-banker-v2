/* Predict2U v198 — Admin System Health.
   Uses only the signed-in Supabase browser session and the admin-only health RPC. */
(function(){
  'use strict';
  const VERSION='v198';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let mounted=false,busy=false;

  function mount(){
    if(mounted||!$('.admin-sidebar')||!$('.admin-main'))return;
    mounted=true;
    const overview=$('[data-admin-tab="overview"]');
    const button=document.createElement('button');
    button.dataset.adminTab='health';button.innerHTML='<i class="fa-solid fa-heart-pulse"></i> System Health';
    overview&&overview.insertAdjacentElement('afterend',button);
    const panel=document.createElement('section');panel.className='admin-panel';panel.dataset.adminPanel='health';
    panel.innerHTML=`<div class="panel-head"><div><div class="eyebrow">Reliability and recovery</div><h1>System health</h1><p>Checks the public pages, Supabase services and news discussion path without exposing private keys.</p></div><button class="admin-button secondary" id="refresh-system-health"><i class="fa-solid fa-rotate"></i> Run checks</button></div>
      <div class="health-summary">
        <article class="card health-metric"><div class="metric-label">Overall state</div><div id="health-overall" class="metric-value">Checking</div></article>
        <article class="card health-metric"><div class="metric-label">Database checks</div><div id="health-db-count" class="metric-value">—</div></article>
        <article class="card health-metric"><div class="metric-label">Public pages</div><div id="health-page-count" class="metric-value">—</div></article>
        <article class="card health-metric"><div class="metric-label">Issues found</div><div id="health-issue-count" class="metric-value">—</div></article>
      </div>
      <div class="grid two dashboard-detail-grid">
        <article class="card"><div class="card-title-row"><div><div class="eyebrow muted-eyebrow">Supabase</div><h2>Backend services</h2></div><span id="health-db-state" class="health-state warning">Checking</span></div><div id="health-db-list" class="health-check-list"></div></article>
        <article class="card"><div class="card-title-row"><div><div class="eyebrow muted-eyebrow">Website</div><h2>Public route checks</h2></div><span id="health-page-state" class="health-state warning">Checking</span></div><div id="health-page-list" class="health-check-list"></div></article>
      </div>
      <article class="card" style="margin-top:16px"><div class="eyebrow muted-eyebrow">Recovery playbook</div><h2>Safe recovery actions</h2><div class="health-recovery"><article><strong>News or comments fail</strong><p>Run SUPABASE_RELIABILITY_COMMENTS_v198.sql, then hard-refresh News.</p></article><article><strong>Board becomes stale</strong><p>Run the existing Predict2U Live Scores workflow and verify data.js was updated.</p></article><article><strong>Push jobs remain pending</strong><p>Open Admin → Push and use Dispatch pending after confirming an active device.</p></article></div><div class="health-note" id="health-note">Checks run from your signed-in browser. Service-role keys and GitHub tokens are never requested.</div></article>`;
    $('.admin-main').appendChild(panel);
  }

  async function timeoutFetch(path){
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),7000);const started=performance.now();
    try{const res=await fetch(path,{cache:'no-store',credentials:'same-origin',signal:ctrl.signal});return{key:path,label:path,ok:res.ok,status:res.status,ms:Math.round(performance.now()-started),level:res.ok?'ok':'critical'};}
    catch(e){return{key:path,label:path,ok:false,status:0,ms:Math.round(performance.now()-started),level:navigator.onLine?'critical':'warning',error:e&&e.name==='AbortError'?'Timed out':'Unavailable'};}
    finally{clearTimeout(timer);}
  }

  async function browserChecks(){
    return Promise.all(['board.html','news.html','community.html','account.html','sw.js','news-app-v198.js'].map(timeoutFetch));
  }

  async function databaseChecks(){
    let sb=null;
    try{sb=window.P2UAccounts&&window.P2UAccounts.getClient?await window.P2UAccounts.getClient():null;}catch(_){}
    if(!sb)return{status:'critical',issue_count:1,checks:[{key:'cloud',label:'Supabase connection',ok:false,level:'critical',detail:'Cloud client unavailable'}]};
    const {data,error}=await sb.rpc('p2u_admin_system_health',{});
    if(error)return{status:'warning',issue_count:1,checks:[{key:'migration',label:'v198 health migration',ok:false,level:'warning',detail:/function .* does not exist|schema cache/i.test(error.message||'')?'Run SUPABASE_RELIABILITY_COMMENTS_v198.sql':String(error.message||'Health RPC unavailable')}]};
    return data||{status:'warning',issue_count:1,checks:[]};
  }

  function detail(row,kind){
    const bits=[];
    if(row.count!==undefined)bits.push(`${Number(row.count)} records`);
    if(row.pending!==undefined)bits.push(`${Number(row.pending)} pending`);
    if(row.latest_at)bits.push(`latest ${new Date(row.latest_at).toLocaleString()}`);
    if(kind==='page'){bits.push(row.status?`HTTP ${row.status}`:'No response');bits.push(`${row.ms} ms`);}
    if(row.detail)bits.push(row.detail);if(row.error)bits.push(row.error);
    return bits.join(' · ')|| (row.ok?'Available':'Needs attention');
  }

  function listHtml(rows,kind){
    return rows.map(row=>`<div class="health-check"><div class="health-check-copy"><strong>${esc(row.label||row.key)}</strong><span>${esc(detail(row,kind))}</span></div><span class="health-dot ${esc(row.level|| (row.ok?'ok':'critical'))}" aria-label="${row.ok?'Healthy':'Needs attention'}"></span></div>`).join('');
  }

  function state(el,status){if(!el)return;const value=['healthy','ok'].includes(status)?'ok':status==='critical'?'critical':'warning';el.className=`health-state ${value}`;el.textContent=value==='ok'?'Healthy':value==='critical'?'Critical':'Attention';}

  async function run(){
    if(busy)return;busy=true;const btn=$('#refresh-system-health');if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Checking';}
    $('#health-overall').textContent='Checking';
    try{
      const [db,pages]=await Promise.all([databaseChecks(),browserChecks()]);
      const dbRows=Array.isArray(db.checks)?db.checks:[],pageIssues=pages.filter(x=>!x.ok).length,dbIssues=Number(db.issue_count||dbRows.filter(x=>!x.ok).length),issues=dbIssues+pageIssues;
      $('#health-db-list').innerHTML=listHtml(dbRows,'db')||'<div class="empty">No database checks returned.</div>';
      $('#health-page-list').innerHTML=listHtml(pages,'page');
      $('#health-db-count').textContent=`${dbRows.filter(x=>x.ok).length}/${dbRows.length}`;
      $('#health-page-count').textContent=`${pages.filter(x=>x.ok).length}/${pages.length}`;
      $('#health-issue-count').textContent=String(issues);
      const overall=db.status==='critical'||pageIssues>0?'critical':(db.status==='warning'||issues>0?'warning':'healthy');
      $('#health-overall').textContent=overall==='healthy'?'Healthy':overall==='critical'?'Critical':'Attention';
      state($('#health-db-state'),db.status);state($('#health-page-state'),pageIssues?'critical':'healthy');
      $('#health-note').textContent=`Last checked ${new Date().toLocaleString()} · Predict2U ${VERSION} · ${navigator.onLine?'Browser online':'Browser offline'}.`;
    }catch(e){$('#health-overall').textContent='Check failed';$('#health-note').textContent=e&&e.message||'Health checks could not run.';}
    finally{busy=false;if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-rotate"></i> Run checks';}}
  }

  mount();
  document.addEventListener('click',e=>{if(e.target.closest('#refresh-system-health'))run();if(e.target.closest('[data-admin-tab="health"]'))setTimeout(run,0);});
  window.addEventListener('p2u:backend-admin-ready',()=>{mount();if(location.hash==='#health')run();});
  window.P2USystemHealth={version:VERSION,run};
})();
