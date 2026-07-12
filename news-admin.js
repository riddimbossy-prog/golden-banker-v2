/* Predict2U v192 — News Editorial & Moderation panel for Backend Admin.
   Runs only for authenticated admin roles and uses RLS/RPC. */
(function(){
  'use strict';
  const VERSION='v192';
  let client=null,role='',articles=[],reports=[],loading=false;
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(d)};
  const clean=v=>String(v||'').trim();

  async function getClient(){
    if(client)return client;
    if(window.P2UAccounts&&window.P2UAccounts.getClient)client=await window.P2UAccounts.getClient();
    return client;
  }
  function toast(message,type='good'){
    const el=$('#admin-toast');if(!el)return;el.textContent=message;el.className=`toast show ${type}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='toast',3200);
  }
  function setBusy(value){loading=value;document.querySelectorAll('[data-news-admin-action]').forEach(b=>b.disabled=value)}

  function inject(){
    if($('[data-admin-tab="news-editorial"]'))return;
    const community=$('[data-admin-tab="community"]');
    const button=document.createElement('button');button.dataset.adminTab='news-editorial';button.innerHTML='<i class="fa-regular fa-newspaper"></i> News';
    community?.before(button);
    const main=$('.admin-main');if(!main)return;
    const panel=document.createElement('section');panel.className='admin-panel';panel.dataset.adminPanel='news-editorial';
    panel.innerHTML=`
      <div class="panel-head"><div><div class="eyebrow">Editorial trust</div><h1>News moderation</h1><p>Feature trusted stories, manage visibility and resolve reports from the News community.</p></div><button class="admin-button secondary" id="news-admin-refresh" data-news-admin-action><i class="fa-solid fa-rotate"></i> Refresh</button></div>
      <div class="grid four metric-grid">
        <article class="card metric-card"><div class="metric-label">Visible stories</div><div id="news-metric-visible" class="metric-value">0</div></article>
        <article class="card metric-card"><div class="metric-label">Featured</div><div id="news-metric-featured" class="metric-value">0</div></article>
        <article class="card metric-card"><div class="metric-label">Pending reports</div><div id="news-metric-reports" class="metric-value">0</div></article>
        <article class="card metric-card"><div class="metric-label">Verified sources</div><div id="news-metric-verified" class="metric-value">0</div></article>
      </div>
      <article class="card news-admin-card">
        <div class="card-title-row"><div><div class="eyebrow muted-eyebrow">Reports</div><h2>Moderation queue</h2></div><span class="status-pill warn" id="news-report-state">0 pending</span></div>
        <div class="table-wrap"><table class="admin-table news-admin-table"><thead><tr><th>Reported</th><th>Target</th><th>Reason</th><th>Details</th><th>Actions</th></tr></thead><tbody id="news-reports-body"></tbody></table></div>
      </article>
      <article class="card news-admin-card">
        <div class="card-title-row"><div><div class="eyebrow muted-eyebrow">Stories</div><h2>Editorial controls</h2></div><a href="news.html" target="_blank" rel="noopener" class="admin-button small secondary">Open News</a></div>
        <div class="table-wrap"><table class="admin-table news-admin-table"><thead><tr><th>Story</th><th>Source</th><th>Status</th><th>Published</th><th>Actions</th></tr></thead><tbody id="news-articles-body"></tbody></table></div>
      </article>`;
    main.appendChild(panel);
  }

  async function load(){
    const sb=await getClient();if(!sb)throw new Error('Supabase client unavailable.');
    const [{data:a,error:ae},{data:r,error:re}]=await Promise.all([
      sb.from('p2u_news_articles').select('id,title,source_name,source_verified,category,breaking,featured,pinned,published,moderation_status,moderation_reason,published_at,comment_count').order('published_at',{ascending:false}).limit(120),
      sb.from('p2u_news_reports').select('id,reporter_id,article_id,comment_id,reason,details,status,created_at').in('status',['pending','reviewing']).order('created_at',{ascending:false}).limit(120)
    ]);
    if(ae)throw ae;if(re)throw re;articles=a||[];reports=r||[];render();
  }

  function storyState(a){
    if(a.moderation_status==='hidden'||!a.published)return'<span class="state-badge hidden">hidden</span>';
    if(a.moderation_status==='review')return'<span class="state-badge review">review</span>';
    if(a.pinned)return'<span class="state-badge active">pinned</span>';
    if(a.featured)return'<span class="state-badge active">featured</span>';
    return'<span class="state-badge completed">visible</span>';
  }

  function render(){
    $('#news-metric-visible').textContent=articles.filter(a=>a.published&&a.moderation_status==='visible').length;
    $('#news-metric-featured').textContent=articles.filter(a=>a.featured||a.pinned).length;
    $('#news-metric-reports').textContent=reports.filter(r=>r.status==='pending').length;
    $('#news-metric-verified').textContent=articles.filter(a=>a.source_verified).length;
    const state=$('#news-report-state');if(state)state.textContent=`${reports.filter(r=>r.status==='pending').length} pending`;
    const reportBody=$('#news-reports-body');
    if(reportBody)reportBody.innerHTML=reports.length?reports.map(r=>`<tr><td>${esc(when(r.created_at))}</td><td>${r.article_id?`Story #${r.article_id}`:`Comment #${r.comment_id}`}</td><td><span class="state-badge review">${esc(r.reason)}</span></td><td>${esc(r.details||'—')}</td><td><div class="news-admin-actions"><button class="admin-button small secondary" data-news-report-status="dismissed" data-news-report-id="${r.id}" data-news-admin-action>Dismiss</button><button class="admin-button small primary" data-news-report-status="actioned" data-news-report-hide="1" data-news-report-id="${r.id}" data-news-admin-action>Hide target</button></div></td></tr>`).join(''):'<tr><td colspan="5"><div class="empty">No pending news reports.</div></td></tr>';
    const articleBody=$('#news-articles-body');
    if(articleBody)articleBody.innerHTML=articles.length?articles.map(a=>`<tr><td><strong class="news-admin-title">${esc(a.title)}</strong><small>${Number(a.comment_count||0)} comments · ${esc(a.category)}</small></td><td>${esc(a.source_name||'—')}${a.source_verified?' <i class="fa-solid fa-circle-check news-admin-verified" title="Verified source"></i>':''}</td><td>${storyState(a)}</td><td>${esc(when(a.published_at))}</td><td><div class="news-admin-actions"><button class="admin-button small ${a.featured?'primary':'secondary'}" data-news-article-action="feature" data-news-value="${a.featured?'0':'1'}" data-news-article-id="${a.id}" data-news-admin-action>${a.featured?'Unfeature':'Feature'}</button><button class="admin-button small ${a.pinned?'primary':'secondary'}" data-news-article-action="pin" data-news-value="${a.pinned?'0':'1'}" data-news-article-id="${a.id}" data-news-admin-action>${a.pinned?'Unpin':'Pin'}</button><button class="admin-button small ${a.breaking?'primary':'secondary'}" data-news-article-action="breaking" data-news-value="${a.breaking?'0':'1'}" data-news-article-id="${a.id}" data-news-admin-action>${a.breaking?'Clear breaking':'Breaking'}</button><button class="admin-button small danger" data-news-article-action="hide" data-news-value="${a.published&&a.moderation_status==='visible'?'1':'0'}" data-news-article-id="${a.id}" data-news-admin-action>${a.published&&a.moderation_status==='visible'?'Hide':'Restore'}</button></div></td></tr>`).join(''):'<tr><td colspan="5"><div class="empty">No news stories available.</div></td></tr>';
  }

  async function articleAction(button){
    const sb=await getClient();if(!sb)return;
    const id=Number(button.dataset.newsArticleId),action=button.dataset.newsArticleAction,value=button.dataset.newsValue==='1';
    let reason='';if(action==='hide'&&value)reason=clean(prompt('Internal reason for hiding this story:')||'');
    setBusy(true);
    const {error}=await sb.rpc('p2u_admin_news_action',{p_article_id:id,p_action:action,p_value:value,p_reason:reason});
    setBusy(false);if(error){toast(error.message||'Could not update story.','bad');return}toast('News story updated.');await load();
  }

  async function resolveReport(button){
    const sb=await getClient();if(!sb)return;
    setBusy(true);
    const {error}=await sb.rpc('p2u_admin_news_resolve_report',{p_report_id:Number(button.dataset.newsReportId),p_status:button.dataset.newsReportStatus,p_hide_target:button.dataset.newsReportHide==='1'});
    setBusy(false);if(error){toast(error.message||'Could not resolve report.','bad');return}toast('Report resolved.');await load();
  }

  function bind(){
    document.addEventListener('click',e=>{
      const a=e.target.closest('[data-news-article-action]');if(a){articleAction(a);return}
      const r=e.target.closest('[data-news-report-status]');if(r){resolveReport(r);return}
      if(e.target.closest('#news-admin-refresh')){setBusy(true);load().catch(err=>toast(err.message||'Could not load news moderation.','bad')).finally(()=>setBusy(false));}
    });
  }

  async function start(){
    inject();bind();role=window.P2UBackendAdmin&&window.P2UBackendAdmin.getRole?window.P2UBackendAdmin.getRole():'';
    if(!role)return;
    try{await load();document.documentElement.dataset.p2uNewsAdminReady='true';window.dispatchEvent(new CustomEvent('p2u:news-admin-ready',{detail:{version:VERSION,role}}));}catch(e){toast(e.message||'Run the v192 News SQL migration.','bad')}
  }
  window.addEventListener('p2u:backend-admin-ready',start,{once:true});
  if(document.documentElement.dataset.p2uBackendAdminReady==='true')start();
})();
