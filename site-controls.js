/* Predict2U v181 public operator controls.
   Uses committed admin-config.js as a safe fallback, then loads live server settings
   and Community moderation from Supabase using the public publishable key + RLS. */
(function(){
  'use strict';
  const VERSION='v198';
  const CONFIG=window.P2U_CLOUD_CONFIG||{};
  const FALLBACK=window.P2U_ADMIN_CONFIG||{};
  let activeConfig=normalizeFallback(FALLBACK),client=null,observer=null,pollTimer=null;
  let hidden=new Set(),verified=new Set();
  let note=null,boardNotice=null;

  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeArray=v=>Array.isArray(v)?v.filter(Boolean).map(String):[];
  const isLocal=()=>/^(localhost|127\.0\.0\.1)$/i.test(location.hostname);

  function normalizeFallback(cfg){
    const board=cfg.board||{},announcement=cfg.announcement||{},community=cfg.community||{},featured=cfg.featured||{};
    return {
      version:cfg.version||VERSION,
      updatedAt:cfg.updatedAt||'',
      board:{published:board.published!==false,message:board.message||"Today's board is being prepared. Please check back shortly."},
      announcement:{enabled:Boolean(announcement.enabled),tone:announcement.tone||'info',message:announcement.message||'',linkLabel:announcement.linkLabel||'',linkUrl:announcement.linkUrl||'',expiresAt:announcement.expiresAt||''},
      featured:{engines:safeArray(featured.engines),leagues:safeArray(featured.leagues)},
      community:{hiddenIds:safeArray(community.hiddenIds),verifiedIds:safeArray(community.verifiedIds)},
      source:'fallback'
    };
  }
  function rowToConfig(row,mods){
    const hiddenIds=[],verifiedIds=[];
    (mods||[]).forEach(m=>{if(m.status==='hidden')hiddenIds.push(String(m.slip_id));if(m.status==='verified')verifiedIds.push(String(m.slip_id));});
    return {
      version:row.release_version||VERSION,
      updatedAt:row.updated_at||'',
      board:{published:row.board_published!==false,message:row.board_message||"Today's board is being prepared. Please check back shortly."},
      announcement:{enabled:Boolean(row.announcement_enabled),tone:row.announcement_tone||'info',message:row.announcement_message||'',linkLabel:row.announcement_link_label||'',linkUrl:row.announcement_link_url||'',expiresAt:row.announcement_expires_at||''},
      featured:{engines:safeArray(row.featured_engines),leagues:safeArray(row.featured_leagues)},
      community:{hiddenIds,verifiedIds},
      source:'supabase'
    };
  }
  async function loadSdk(){
    if(window.supabase&&window.supabase.createClient)return window.supabase;
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-p2u-supabase-sdk]');
      if(existing){const wait=()=>window.supabase&&window.supabase.createClient?resolve(window.supabase):setTimeout(wait,60);return wait()}
      const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.async=true;s.dataset.p2uSupabaseSdk='1';s.onload=()=>resolve(window.supabase);s.onerror=()=>reject(new Error('Supabase unavailable'));document.head.appendChild(s);
    });
  }
  async function getClient(){
    if(client)return client;
    if(CONFIG.enabled===false||isLocal()||!CONFIG.url||!CONFIG.publishableKey)return null;
    if(window.P2UAccounts&&window.P2UAccounts.getClient){try{client=await window.P2UAccounts.getClient();if(client)return client}catch(_){}}
    const sdk=await loadSdk();client=sdk.createClient(CONFIG.url,CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return client;
  }
  function validUrl(url){return /^(?:https?:\/\/|[\w./-]+\.html(?:[#?].*)?|#)/i.test(String(url||''))}
  function announcementActive(a){
    if(!a.enabled||!String(a.message||'').trim())return false;
    if(a.expiresAt){const t=Date.parse(a.expiresAt);if(Number.isFinite(t)&&Date.now()>t)return false}
    try{if(localStorage.getItem(`p2u-announcement-dismissed-${activeConfig.version||'current'}`)==='1')return false}catch(_){ }
    return true;
  }
  function removeAnnouncement(){if(note&&note.isConnected)note.remove();note=null}
  function mountAnnouncement(){
    removeAnnouncement();const a=activeConfig.announcement;if(!announcementActive(a))return;
    note=document.createElement('div');note.id='p2u-operator-note';note.className='p2u-operator-note';note.dataset.tone=['success','warning','info'].includes(a.tone)?a.tone:'info';
    const url=validUrl(a.linkUrl)?a.linkUrl:'';
    note.innerHTML=`<div class="p2u-operator-note-inner"><span class="p2u-operator-dot" aria-hidden="true"></span><span class="p2u-operator-note-message">${esc(a.message)}</span>${url&&a.linkLabel?`<a href="${esc(url)}">${esc(a.linkLabel)}</a>`:''}<button type="button" aria-label="Dismiss announcement">×</button></div>`;
    const anchor=document.querySelector('header.top,nav.sticky,header,nav')||document.body.firstElementChild;
    if(anchor&&anchor.parentNode)anchor.insertAdjacentElement('afterend',note);else document.body.prepend(note);
    note.querySelector('button').addEventListener('click',()=>{try{localStorage.setItem(`p2u-announcement-dismissed-${activeConfig.version||'current'}`,'1')}catch(_){ }removeAnnouncement()});
  }
  function boardTargets(){
    const full=/engines\.html$/i.test(location.pathname);
    return full?['#matches-grid','aside','#acca-note']:['#date-strip','#engine-pills','#acca-root','#board-rank-reason','#cards','#show-all'];
  }
  function applyBoardState(){
    const board=activeConfig.board||{};
    if(board.published!==false){
      if(boardNotice&&boardNotice.isConnected)boardNotice.remove();boardNotice=null;
      document.querySelectorAll('[data-p2u-admin-hidden="1"]').forEach(el=>{el.style.removeProperty('display');delete el.dataset.p2uAdminHidden});
      return;
    }
    const section=document.getElementById('board')||document.querySelector('main');if(!section)return;
    if(!boardNotice){boardNotice=document.createElement('section');boardNotice.className='p2u-board-unpublished';boardNotice.setAttribute('role','status');section.prepend(boardNotice)}
    boardNotice.innerHTML=`<i class="fa-solid fa-clock" aria-hidden="true"></i><h2>Board temporarily unpublished</h2><p>${esc(board.message||"Today's board is being prepared. Please check back shortly.")}</p>`;
    boardTargets().forEach(sel=>document.querySelectorAll(sel).forEach(el=>{if(!el.closest('.p2u-board-unpublished')){el.dataset.p2uAdminHidden='1';el.style.display='none'}}));
  }
  function cardId(card){return String(card.dataset.slipId||card.dataset.id||card.id||'').trim()}
  function resetModeration(card){
    if(card.dataset.p2uAdminModerationHidden==='1'){card.hidden=false;card.removeAttribute('aria-hidden');delete card.dataset.p2uAdminModerationHidden}
    delete card.dataset.verified;delete card.dataset.p2uModerated;card.querySelectorAll('.p2u-community-verified-admin').forEach(x=>x.remove());
  }
  function moderateCard(card){
    if(!card)return;const id=cardId(card);if(!id)return;resetModeration(card);card.dataset.p2uModerated='1';
    if(hidden.has(id)){card.hidden=true;card.setAttribute('aria-hidden','true');card.dataset.p2uAdminModerationHidden='1';return}
    if(verified.has(id)){
      card.dataset.verified='true';
      const target=card.querySelector('.slip-top,.slip-user,.handle,strong')||card.firstElementChild||card;
      const badge=document.createElement('span');badge.className='p2u-community-verified-admin';badge.innerHTML='<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Verified';target.appendChild(badge);
    }
  }
  function scanCommunity(){document.querySelectorAll('.slip-card,[data-slip-id]').forEach(moderateCard)}
  function watchCommunity(){
    if(observer)return;const roots=[document.getElementById('feed'),document.getElementById('my-slips'),document.getElementById('popular'),document.body].filter(Boolean);observer=new MutationObserver(()=>scanCommunity());roots.slice(0,1).forEach(root=>observer.observe(root,{childList:true,subtree:true}));
  }
  function expose(){
    document.documentElement.dataset.p2uAdminVersion=activeConfig.version||VERSION;
    document.documentElement.dataset.p2uAdminSource=activeConfig.source||'fallback';
    window.P2USiteControls={version:VERSION,config:activeConfig,featuredEngines:[...(activeConfig.featured.engines||[])],featuredLeagues:[...(activeConfig.featured.leagues||[])],refresh};
    window.dispatchEvent(new CustomEvent('p2u:admin-config',{detail:window.P2USiteControls}));
  }
  function applyConfig(next){
    activeConfig=next||activeConfig;hidden=new Set(activeConfig.community.hiddenIds.map(String));verified=new Set(activeConfig.community.verifiedIds.map(String));mountAnnouncement();applyBoardState();scanCommunity();watchCommunity();expose();
  }
  async function fetchServer(){
    const sb=await getClient();if(!sb)return null;
    const settingsTable=CONFIG.siteSettingsTable||'p2u_site_settings',moderationTable=CONFIG.moderationTable||'p2u_community_moderation';
    const [s,m]=await Promise.all([
      sb.from(settingsTable).select('*').eq('id','global').maybeSingle(),
      sb.from(moderationTable).select('slip_id,status,updated_at').in('status',['verified','hidden']).limit(1000)
    ]);
    if(s.error)throw s.error;if(m.error)throw m.error;if(!s.data)return null;return rowToConfig(s.data,m.data||[]);
  }
  async function refresh(){
    try{const server=await fetchServer();if(server)applyConfig(server);return Boolean(server)}catch(_){return false}
  }
  function schedule(){
    clearInterval(pollTimer);pollTimer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
  }

  function loadReliabilityGuard(){
    if(window.P2UReliability||document.querySelector('script[data-p2u-reliability]'))return;
    const script=document.createElement('script');script.src='reliability-guard.js';script.defer=true;script.dataset.p2uReliability='v198';document.head.appendChild(script);
  }
  function init(){loadReliabilityGuard();applyConfig(activeConfig);refresh();schedule();document.documentElement.dataset.p2uSiteControlsReady='true';window.dispatchEvent(new CustomEvent('p2u:site-controls-ready',{detail:{version:VERSION}}))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
