/* Predict2U v182 — Backend Admin UI Upgrade
   Uses Supabase Auth + RLS/RPC. No service-role key is present in browser code. */
(function(){
  'use strict';
  const VERSION='v193';
  const CONFIG=window.P2U_CLOUD_CONFIG||{};
  const ROLE_RANK={moderator:1,admin:2,owner:3};
  let client=null,session=null,roleRow=null,settings=null,moderation=[],audit=[],deletions=[],roles=[],pushConfig=null,pushJobs=[],pushError='',pushMetrics={active_devices:0,pending_jobs:0,sent_total:0,failed_total:0,last_dispatch:null};
  let loading=false,toastTimer=null;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v==null?'':v).trim();
  const arrayLines=v=>[...new Set(String(v||'').split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean))];
  const formatDate=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(d)};
  const can=min=>ROLE_RANK[roleRow&&roleRow.role] >= ROLE_RANK[min];
  const mock=()=>window.__P2U_ADMIN_MOCK__||null;

  function toast(message,type='good'){
    const el=$('#admin-toast');if(!el)return;clearTimeout(toastTimer);el.textContent=message;el.className=`toast show ${type}`;toastTimer=setTimeout(()=>el.className='toast',3300);
  }
  function setBusy(value,label='Working…'){
    loading=value;$$('[data-admin-action]').forEach(btn=>{btn.disabled=value;if(value&&!btn.dataset.originalText){btn.dataset.originalText=btn.textContent;btn.textContent=label}else if(!value&&btn.dataset.originalText){btn.textContent=btn.dataset.originalText;delete btn.dataset.originalText}})
  }
  async function loadSdk(){
    if(window.supabase&&window.supabase.createClient)return window.supabase;
    return new Promise((resolve,reject)=>{
      const existing=$('script[data-p2u-supabase-sdk]');
      if(existing){const wait=()=>window.supabase&&window.supabase.createClient?resolve(window.supabase):setTimeout(wait,50);return wait()}
      const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.async=true;s.dataset.p2uSupabaseSdk='1';s.onload=()=>resolve(window.supabase);s.onerror=()=>reject(new Error('Could not load Supabase client'));document.head.appendChild(s);
    });
  }
  async function getClient(){
    if(mock())return mock();
    if(client)return client;
    if(window.P2UAccounts&&window.P2UAccounts.getClient){client=await window.P2UAccounts.getClient();if(client)return client}
    if(!CONFIG.url||!CONFIG.publishableKey)throw new Error('Cloud configuration is missing.');
    const sdk=await loadSdk();client=sdk.createClient(CONFIG.url,CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return client;
  }
  async function rpc(name,args={}){
    const sb=await getClient();
    if(mock()&&sb.rpc)return sb.rpc(name,args);
    const {data,error}=await sb.rpc(name,args);if(error)throw error;return data;
  }
  async function fromSelect(table,query){
    const sb=await getClient();
    if(mock()&&sb.select)return sb.select(table,query);
    let req=sb.from(table).select(query.columns||'*');
    for(const [col,val] of Object.entries(query.eq||{}))req=req.eq(col,val);
    if(query.order)req=req.order(query.order.column,{ascending:query.order.ascending??false});
    if(query.limit)req=req.limit(query.limit);
    if(query.maybeSingle)req=req.maybeSingle();
    const {data,error}=await req;if(error)throw error;return data;
  }

  function showGate(mode,message){
    $('#admin-gate').classList.remove('hidden');$('#admin-app').classList.add('hidden');
    const title=$('#gate-title'),copy=$('#gate-copy'),icon=$('#gate-icon'),status=$('#gate-status');
    if(mode==='signed-out'){
      title.textContent='Sign in to continue';copy.textContent='Use your Predict2U passwordless account, then return to this protected console.';icon.className='fa-solid fa-right-to-bracket';status.className='gate-status';$('#gate-account-link').textContent='Open Account Center';$('#gate-account-link').href='account.html';
    }else if(mode==='unauthorized'){
      title.textContent='Admin role required';copy.textContent='Your account is signed in, but it has not been assigned an owner, admin or moderator role.';icon.className='fa-solid fa-shield-halved';status.className='gate-status';$('#gate-account-link').textContent='Back to Account';$('#gate-account-link').href='account.html';
    }else{
      title.textContent='Connecting securely';copy.textContent=message||'Checking your session and role…';icon.className='spinner';status.className='gate-status good';$('#gate-account-link').textContent='Account Center';
    }
    $('#gate-status-text').textContent=message||copy.textContent;
  }
  function showApp(){
    $('#admin-gate').classList.add('hidden');$('#admin-app').classList.remove('hidden');
    $('#admin-role').textContent=roleRow.role;$('#admin-email').textContent=session.user.email||session.user.id;
    $('#top-role').textContent=roleRow.role.toUpperCase();document.body.dataset.adminRole=roleRow.role;
    $$('[data-min-role]').forEach(el=>el.classList.toggle('hidden',!can(el.dataset.minRole)));
    $$('[data-owner-only]').forEach(el=>el.classList.toggle('hidden',!can('owner')));
  }
  function activateTab(name){
    $$('[data-admin-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.adminTab===name));
    $$('[data-admin-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.adminPanel===name));
    try{history.replaceState(null,'',`#${name}`)}catch(_){}
    const active=$(`[data-admin-tab="${name}"]`);if(active&&matchMedia('(max-width:980px)').matches){active.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'})}
  }

  async function resolveSessionAndRole(){
    const sb=await getClient();
    if(mock()){
      session=sb.session||null;roleRow=sb.roleRow||null;return;
    }
    const {data,error}=await sb.auth.getSession();if(error)throw error;session=data.session||null;
    if(!session){roleRow=null;return}
    const dataRole=await fromSelect(CONFIG.adminRolesTable||'p2u_admin_roles',{columns:'user_id,role,active,created_at,updated_at',eq:{user_id:session.user.id},maybeSingle:true});
    roleRow=dataRole&&dataRole.active?dataRole:null;
  }
  async function loadSettings(){
    settings=await fromSelect(CONFIG.siteSettingsTable||'p2u_site_settings',{columns:'*',eq:{id:'global'},maybeSingle:true});
    settings=settings||{id:'global',board_published:true,board_message:'',announcement_enabled:false,announcement_tone:'info',announcement_message:'',announcement_link_label:'',announcement_link_url:'',announcement_expires_at:null,featured_engines:[],featured_leagues:[],release_version:VERSION};
  }
  async function loadModeration(){
    moderation=await fromSelect(CONFIG.moderationTable||'p2u_community_moderation',{columns:'slip_id,status,reason,created_at,updated_at,updated_by',order:{column:'updated_at',ascending:false},limit:100})||[];
  }
  async function loadAudit(){
    audit=await fromSelect(CONFIG.auditTable||'p2u_admin_audit_log',{columns:'id,actor_id,actor_role,action,target_type,target_key,metadata,created_at',order:{column:'created_at',ascending:false},limit:100})||[];
  }
  async function loadDeletions(){
    if(!can('admin')){deletions=[];return}
    deletions=await fromSelect(CONFIG.deletionTable||'p2u_account_deletion_requests',{columns:'id,user_id,email,requested_at,status,completed_at',order:{column:'requested_at',ascending:false},limit:100})||[];
  }
  async function loadRoles(){
    if(!can('owner')){roles=[];return}
    roles=await fromSelect(CONFIG.adminRolesTable||'p2u_admin_roles',{columns:'user_id,role,active,created_at,updated_at,updated_by',order:{column:'updated_at',ascending:false},limit:100})||[];
  }
  async function loadPush(){
    if(!can('admin')){pushConfig=null;pushJobs=[];pushError='';pushMetrics={active_devices:0,pending_jobs:0,sent_total:0,failed_total:0,last_dispatch:null};return}
    try{
      const [cfg,jobs,metrics]=await Promise.all([
        fromSelect(CONFIG.pushConfigTable||'p2u_push_public_config',{columns:'id,enabled,vapid_public_key,updated_at',eq:{id:'global'},maybeSingle:true}),
        fromSelect(CONFIG.pushJobsTable||'p2u_push_jobs',{columns:'id,category,title,body,url,audience,status,scheduled_for,created_at,completed_at,sent_count,failed_count,skipped_count,error',order:{column:'created_at',ascending:false},limit:100}),
        rpc('p2u_admin_push_metrics',{})
      ]);
      pushConfig=cfg||{id:'global',enabled:false,vapid_public_key:'',updated_at:null};pushJobs=jobs||[];pushMetrics=Object.assign({active_devices:0,pending_jobs:0,sent_total:0,failed_total:0,last_dispatch:null},metrics||{});pushError='';
    }catch(e){pushConfig={id:'global',enabled:false,vapid_public_key:'',updated_at:null};pushJobs=[];pushMetrics={active_devices:0,pending_jobs:0,sent_total:0,failed_total:0,last_dispatch:null};pushError=e.message||'Run the v183 push SQL setup.'}
  }

  async function refreshAll({quiet=false}={}){
    if(!roleRow)return;
    if(!quiet)setBusy(true,'Refreshing…');
    try{await Promise.all([loadSettings(),loadModeration(),loadAudit(),loadDeletions(),loadRoles(),loadPush()]);renderAll();if(!quiet)toast('Admin data refreshed.')}catch(e){toast(e.message||'Could not refresh admin data.','bad')}finally{if(!quiet)setBusy(false)}
  }

  function renderOverview(){
    $('#metric-board').textContent=settings&&settings.board_published?'Published':'Unpublished';$('#metric-board').className=`metric-value ${settings&&settings.board_published?'good':'warn'}`;
    $('#metric-moderation').textContent=moderation.length;$('#metric-audit').textContent=audit.length;$('#metric-deletions').textContent=deletions.filter(x=>x.status==='pending'||x.status==='processing').length;
    $('#overview-updated').textContent=settings&&settings.updated_at?formatDate(settings.updated_at):'Not yet saved';
    $('#overview-release').textContent=VERSION;
  }
  function renderPublishing(){
    if(!settings)return;
    $('#board-published').checked=Boolean(settings.board_published);$('#board-message').value=settings.board_message||'';
    $('#announcement-enabled').checked=Boolean(settings.announcement_enabled);$('#announcement-tone').value=settings.announcement_tone||'info';$('#announcement-message').value=settings.announcement_message||'';$('#announcement-link-label').value=settings.announcement_link_label||'';$('#announcement-link-url').value=settings.announcement_link_url||'';
    $('#announcement-expires').value=settings.announcement_expires_at?new Date(settings.announcement_expires_at).toISOString().slice(0,16):'';
    $('#featured-engines').value=(settings.featured_engines||[]).join('\n');$('#featured-leagues').value=(settings.featured_leagues||[]).join('\n');
    $('#publishing-updated').textContent=settings.updated_at?formatDate(settings.updated_at):'Never';
  }
  function renderModeration(){
    const body=$('#moderation-body');if(!moderation.length){body.innerHTML='<tr><td colspan="5"><div class="empty">No server moderation records yet.</div></td></tr>';return}
    body.innerHTML=moderation.map(row=>`<tr><td><code>${esc(row.slip_id)}</code></td><td><span class="state-badge ${esc(row.status)}">${esc(row.status)}</span></td><td>${esc(row.reason||'—')}</td><td>${esc(formatDate(row.updated_at))}</td><td><button class="admin-button small secondary" data-clear-moderation="${esc(row.slip_id)}" data-admin-action>Clear</button></td></tr>`).join('');
  }
  function renderAudit(){
    const body=$('#audit-body');if(!audit.length){body.innerHTML='<tr><td colspan="5"><div class="empty">No admin audit entries yet.</div></td></tr>';return}
    body.innerHTML=audit.map(row=>`<tr><td>${esc(formatDate(row.created_at))}</td><td><span class="state-badge active">${esc(row.actor_role||'system')}</span></td><td>${esc(row.action)}</td><td>${esc(row.target_type)}</td><td><code>${esc(row.target_key||'—')}</code></td></tr>`).join('');
  }
  function renderDeletions(){
    const body=$('#deletion-body');if(!can('admin'))return;if(!deletions.length){body.innerHTML='<tr><td colspan="5"><div class="empty">No account deletion requests.</div></td></tr>';return}
    body.innerHTML=deletions.map(row=>`<tr><td>#${row.id}</td><td>${esc(row.email||row.user_id)}</td><td>${esc(formatDate(row.requested_at))}</td><td><span class="state-badge ${esc(row.status)}">${esc(row.status)}</span></td><td><select data-deletion-id="${row.id}" aria-label="Update deletion request"><option ${row.status==='pending'?'selected':''}>pending</option><option ${row.status==='processing'?'selected':''}>processing</option><option ${row.status==='completed'?'selected':''}>completed</option><option ${row.status==='cancelled'?'selected':''}>cancelled</option></select></td></tr>`).join('');
  }
  function renderRoles(){
    const body=$('#roles-body');if(!can('owner'))return;if(!roles.length){body.innerHTML='<tr><td colspan="4"><div class="empty">No role records available.</div></td></tr>';return}
    body.innerHTML=roles.map(row=>`<tr><td><code>${esc(row.user_id)}</code></td><td><span class="state-badge ${row.active?'active':'inactive'}">${esc(row.role)}</span></td><td>${row.active?'Active':'Inactive'}</td><td>${esc(formatDate(row.updated_at))}</td></tr>`).join('');
  }
  function renderPush(){
    if(!can('admin'))return;
    const set=(id,value)=>{const el=$(id);if(el)el.textContent=String(value==null?'0':value)};
    set('#metric-push-devices',pushMetrics.active_devices||0);set('#metric-push-pending',pushMetrics.pending_jobs||0);set('#metric-push-sent',pushMetrics.sent_total||0);set('#metric-push-failed',pushMetrics.failed_total||0);
    const state=$('#push-config-state');if(state){const ready=Boolean(pushConfig&&pushConfig.enabled&&pushConfig.vapid_public_key);state.textContent=pushError?'SQL required':ready?'Configured':'Setup pending';state.title=pushError;state.className=`status-pill ${ready?'good':'warn'}`}
    const key=$('#push-public-key');if(key)key.value=pushConfig&&pushConfig.vapid_public_key||'';
    const enabled=$('#push-enabled');if(enabled)enabled.checked=Boolean(pushConfig&&pushConfig.enabled);
    const targetField=$('#push-target-field');if(targetField)targetField.classList.toggle('hidden',$('#push-audience')&&$('#push-audience').value==='all');
    const last=$('#push-last-dispatch');if(last)last.textContent=pushMetrics.last_dispatch?formatDate(pushMetrics.last_dispatch):'No dispatch yet';
    const body=$('#push-jobs-body');if(!body)return;
    if(!pushJobs.length){body.innerHTML='<tr><td colspan="6"><div class="empty">No push jobs yet.</div></td></tr>';return}
    body.innerHTML=pushJobs.map(row=>`<tr><td>${esc(formatDate(row.created_at))}</td><td><span class="state-badge active">${esc(row.category)}</span></td><td>${esc(row.title)}</td><td><span class="state-badge ${esc(row.status)}">${esc(row.status)}</span></td><td>${Number(row.sent_count||0)}</td><td>${Number(row.failed_count||0)}</td></tr>`).join('');
  }
  function renderAll(){renderOverview();renderPublishing();renderModeration();renderAudit();renderDeletions();renderRoles();renderPush()}

  function settingsPayload(){
    return {
      board_published:$('#board-published').checked,
      board_message:clean($('#board-message').value),
      announcement_enabled:$('#announcement-enabled').checked,
      announcement_tone:$('#announcement-tone').value,
      announcement_message:clean($('#announcement-message').value),
      announcement_link_label:clean($('#announcement-link-label').value),
      announcement_link_url:clean($('#announcement-link-url').value),
      announcement_expires_at:$('#announcement-expires').value?new Date($('#announcement-expires').value).toISOString():'',
      featured_engines:arrayLines($('#featured-engines').value),
      featured_leagues:arrayLines($('#featured-leagues').value),
      release_version:VERSION
    };
  }
  async function saveSettings(){
    setBusy(true,'Saving…');
    try{settings=await rpc('p2u_admin_save_site_settings',{p_payload:settingsPayload()});toast('Publishing settings saved to Supabase.');try{await invokePushDispatcher()}catch(_){}await Promise.all([loadAudit(),loadPush()]);renderAll()}catch(e){toast(e.message||'Could not save settings.','bad')}finally{setBusy(false)}
  }
  async function moderate(status,slipId,reason){
    const id=clean(slipId);if(!id){toast('Enter a public slip ID.','bad');return}
    setBusy(true,'Saving…');
    try{await rpc('p2u_admin_moderate_community',{p_slip_id:id,p_status:status,p_reason:clean(reason)});toast(status==='clear'?'Moderation record cleared.':`Slip marked ${status}.`);if(status==='verified'){try{await invokePushDispatcher()}catch(_){}}await Promise.all([loadModeration(),loadAudit(),loadPush()]);renderModeration();renderAudit();renderPush();$('#moderation-slip-id').value='';$('#moderation-reason').value=''}catch(e){toast(e.message||'Could not save moderation.','bad')}finally{setBusy(false)}
  }
  async function updateDeletion(id,status){
    setBusy(true,'Updating…');try{await rpc('p2u_admin_set_deletion_status',{p_request_id:Number(id),p_status:status});toast('Deletion request updated.');await Promise.all([loadDeletions(),loadAudit()]);renderDeletions();renderAudit()}catch(e){toast(e.message||'Could not update request.','bad')}finally{setBusy(false)}
  }
  async function assignRole(){
    const email=clean($('#role-email').value),role=$('#role-value').value,active=$('#role-active').checked;if(!email){toast('Enter the member email.','bad');return}
    setBusy(true,'Assigning…');try{await rpc('p2u_admin_assign_role',{p_email:email,p_role:role,p_active:active});toast('Role updated securely.');$('#role-email').value='';await Promise.all([loadRoles(),loadAudit()]);renderRoles();renderAudit()}catch(e){toast(e.message||'Could not assign role.','bad')}finally{setBusy(false)}
  }
  function pushAudience(){
    const type=$('#push-audience').value,target=clean($('#push-target').value);
    if(type==='favorite_league')return{type:'favorite_match',league:target};
    if(type==='favorite_engine')return{type:'favorite_match',engines:target?[target]:[]};
    if(type==='followed_user')return{type:'followed_user',author_user_id:target};
    if(type==='specific_user')return{type:'users',user_ids:target?[target]:[]};
    return{type:'all'};
  }
  function pushPayload({test=false}={}){
    const scheduled=$('#push-scheduled').value;
    return{
      category:test?'test':$('#push-category').value,
      title:clean($('#push-title').value)||(test?'Predict2U test notification':'Predict2U update'),
      body:clean($('#push-body').value)||(test?'Push delivery is working on this device.':''),
      url:clean($('#push-url').value)||'index.html',
      audience:test?{type:'users',user_ids:[session.user.id]}:pushAudience(),
      payload:{source:'backend-admin',test},
      scheduled_for:scheduled?new Date(scheduled).toISOString():''
    };
  }
  async function savePushConfig(){
    if(!can('owner')){toast('Owner role required.','bad');return}
    setBusy(true,'Saving…');try{pushConfig=await rpc('p2u_admin_set_push_public_key',{p_public_key:clean($('#push-public-key').value),p_enabled:$('#push-enabled').checked});toast('Push public configuration saved.');await Promise.all([loadPush(),loadAudit()]);renderPush();renderAudit()}catch(e){toast(e.message||'Could not save push configuration.','bad')}finally{setBusy(false)}
  }
  async function invokePushDispatcher(){
    const sb=await getClient();if(mock()){return{data:{ok:true,claimed:1},error:null}}
    if(!sb.functions||!sb.functions.invoke)throw new Error('Supabase Functions client is unavailable.');
    const {data,error}=await sb.functions.invoke(CONFIG.pushFunction||'p2u-push-dispatch',{body:{limit:20}});if(error)throw error;return data;
  }
  async function dispatchPush(){
    setBusy(true,'Dispatching…');try{const result=await invokePushDispatcher();toast(`Dispatch complete: ${Number(result&&result.claimed||0)} job(s).`);await loadPush();renderPush()}catch(e){toast(e.message||'Push dispatcher could not run.','bad')}finally{setBusy(false)}
  }
  async function queuePush({test=false}={}){
    const payload=pushPayload({test});if(!payload.title){toast('Enter a notification title.','bad');return}
    const audience=payload.audience||{};if(['favorite_match','followed_user','users'].includes(audience.type)&&!clean($('#push-target').value)&&!test){toast('Enter the audience target.','bad');return}
    setBusy(true,'Queueing…');try{await rpc('p2u_admin_queue_push',{p_payload:payload});toast(test?'Test notification queued.':'Notification queued.');await invokePushDispatcher();await Promise.all([loadPush(),loadAudit()]);renderPush();renderAudit()}catch(e){toast(e.message||'Could not queue notification.','bad')}finally{setBusy(false)}
  }

  function exportAudit(){
    const blob=new Blob([JSON.stringify({version:VERSION,exportedAt:new Date().toISOString(),role:roleRow&&roleRow.role,audit},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`predict2u-admin-audit-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast('Audit export downloaded.');
  }

  async function signOut(){
    try{if(window.P2UAccounts&&window.P2UAccounts.signOut)await window.P2UAccounts.signOut();else{const sb=await getClient();await sb.auth.signOut()}}catch(_){}location.reload();
  }
  function bind(){
    document.addEventListener('click',e=>{
      const tab=e.target.closest('[data-admin-tab]');if(tab){activateTab(tab.dataset.adminTab);return}
      if(e.target.closest('#save-settings')){saveSettings();return}
      if(e.target.closest('#refresh-push')){loadPush().then(renderPush).catch(err=>toast(err.message||'Could not refresh push data.','bad'));return}
      if(e.target.closest('#save-push-config')){savePushConfig();return}
      if(e.target.closest('#queue-push')){queuePush();return}
      if(e.target.closest('#test-push')){queuePush({test:true});return}
      if(e.target.closest('#dispatch-push')){dispatchPush();return}
      if(e.target.closest('#refresh-admin')){refreshAll();return}
      if(e.target.closest('#admin-signout')){signOut();return}
      if(e.target.closest('#moderate-review')){moderate('review',$('#moderation-slip-id').value,$('#moderation-reason').value);return}
      if(e.target.closest('#moderate-verified')){moderate('verified',$('#moderation-slip-id').value,$('#moderation-reason').value);return}
      if(e.target.closest('#moderate-hidden')){moderate('hidden',$('#moderation-slip-id').value,$('#moderation-reason').value);return}
      const clear=e.target.closest('[data-clear-moderation]');if(clear){moderate('clear',clear.dataset.clearModeration,'');return}
      if(e.target.closest('#assign-role')){assignRole();return}
      if(e.target.closest('#export-audit')){exportAudit();return}
    });
    document.addEventListener('change',e=>{
      const sel=e.target.closest('[data-deletion-id]');if(sel){updateDeletion(sel.dataset.deletionId,sel.value);return}
      if(e.target.matches('#push-audience')){const field=$('#push-target-field');if(field)field.classList.toggle('hidden',e.target.value==='all')}
    });
  }
  async function init(){
    bind();showGate('loading','Checking Supabase session and admin role…');
    try{
      await resolveSessionAndRole();
      if(!session){showGate('signed-out','No active Predict2U account session.');return}
      if(!roleRow){showGate('unauthorized',`Signed in as ${session.user.email||session.user.id}, but no active admin role was found.`);return}
      showApp();await refreshAll({quiet:true});activateTab((location.hash||'#overview').slice(1));
      document.documentElement.dataset.p2uBackendAdminReady='true';window.dispatchEvent(new CustomEvent('p2u:backend-admin-ready',{detail:{version:VERSION,role:roleRow.role}}));
    }catch(e){showGate('unauthorized',e.message||'Could not verify admin access.');toast(e.message||'Admin connection failed.','bad')}
  }

  window.P2UBackendAdmin={version:VERSION,refresh:refreshAll,openTab:activateTab,getRole:()=>roleRow&&roleRow.role,getSettings:()=>settings,isReady:()=>document.documentElement.dataset.p2uBackendAdminReady==='true'};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
