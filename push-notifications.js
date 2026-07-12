/* Predict2U v183 — Real Push Notifications.
   Subscription keys are sent only to Supabase and protected by RLS/RPC.
   The VAPID private key never appears in browser code. */
(function(){
  'use strict';
  const VERSION='v192';
  const CONFIG=window.P2U_CLOUD_CONFIG||{};
  const LOCAL_KEY='p2u-push-local-v183';
  const PREF_KEY='p2u-personalization-v167';
  const NEWS_FOLLOW_KEY='p2u-news-follows-v192';
  let client=null,session=null,publicConfig=null,preferences=null,subscriptions=[],mounted=false,renderTimer=null;

  const safeParse=(v,f)=>{try{return JSON.parse(v)}catch(_){return f}};
  const record=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const supports=()=>Boolean('serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window);
  const local=()=>Object.assign({board_updates:true,match_status:true,favorite_leagues:true,favorite_engines:true,community_wins:true,followed_users:false,announcements:true,football_news:true,transfer_news:true,breaking_news:true,personalized_news:false,verified_only:false,quiet_enabled:false,quiet_start:'22:00',quiet_end:'07:00'},record(safeParse(localStorage.getItem(LOCAL_KEY),{})));
  const saveLocal=v=>{try{localStorage.setItem(LOCAL_KEY,JSON.stringify(v))}catch(_){}};
  const b64ToBytes=value=>{const pad='='.repeat((4-value.length%4)%4);const raw=atob((value+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))};
  const deviceLabel=()=>{const ua=navigator.userAgent||'';if(/android/i.test(ua))return'Android device';if(/iphone|ipad/i.test(ua))return'Apple device';if(/windows/i.test(ua))return'Windows browser';if(/macintosh/i.test(ua))return'Mac browser';return'Web browser'};
  const getPrefsFromPersonalization=()=>record(safeParse(localStorage.getItem(PREF_KEY),{}));

  async function getClient(){
    if(client)return client;
    if(window.P2UAccounts&&window.P2UAccounts.getClient)client=await window.P2UAccounts.getClient();
    return client;
  }
  async function getSession(){
    if(window.P2UAccounts&&window.P2UAccounts.getSession)session=window.P2UAccounts.getSession();
    if(session)return session;
    const sb=await getClient();if(!sb)return null;
    const {data}=await sb.auth.getSession();session=data&&data.session||null;return session;
  }
  async function loadCloud(){
    const sb=await getClient();session=await getSession();
    if(!sb){publicConfig={enabled:false,vapid_public_key:''};preferences=local();subscriptions=[];return}
    const configTable=CONFIG.pushConfigTable||'p2u_push_public_config';
    const [{data:cfg},{data:prefs},{data:subs}]=await Promise.all([
      sb.from(configTable).select('enabled,vapid_public_key,updated_at').eq('id','global').maybeSingle(),
      session?sb.from(CONFIG.pushPreferencesTable||'p2u_push_preferences').select('*').eq('user_id',session.user.id).maybeSingle():Promise.resolve({data:null}),
      session?sb.from(CONFIG.pushSubscriptionsTable||'p2u_push_subscriptions').select('id,endpoint,device_label,enabled,last_seen_at').eq('user_id',session.user.id).order('last_seen_at',{ascending:false}):Promise.resolve({data:[]})
    ]);
    publicConfig=cfg||{enabled:false,vapid_public_key:''};preferences=Object.assign(local(),prefs||{});subscriptions=subs||[];saveLocal(preferences);
  }
  async function currentSubscription(){try{const reg=await navigator.serviceWorker.ready;return await reg.pushManager.getSubscription()}catch(_){return null}}
  async function isSubscribed(){return Boolean(await currentSubscription())}
  async function buildPayload(){
    const prefs=Object.assign({},preferences||local());
    const personal=getPrefsFromPersonalization();
    const follows=window.P2UAccounts&&window.P2UAccounts.getFollows?window.P2UAccounts.getFollows():[];
    return {
      enabled:true,
      board_updates:prefs.board_updates!==false,
      match_status:prefs.match_status!==false,
      favorite_leagues:prefs.favorite_leagues!==false,
      favorite_engines:prefs.favorite_engines!==false,
      community_wins:prefs.community_wins!==false,
      followed_users:Boolean(prefs.followed_users),
      announcements:prefs.announcements!==false,
      football_news:prefs.football_news!==false,
      transfer_news:prefs.transfer_news!==false,
      breaking_news:prefs.breaking_news!==false,
      personalized_news:Boolean(prefs.personalized_news),
      news_topics:(Array.isArray(safeParse(localStorage.getItem(NEWS_FOLLOW_KEY),[]))?safeParse(localStorage.getItem(NEWS_FOLLOW_KEY),[]):[]).map(x=>x&&x.entity_value).filter(Boolean).slice(0,100),
      verified_only:Boolean(prefs.verified_only),
      quiet_enabled:Boolean(prefs.quiet_enabled),
      quiet_start:prefs.quiet_start||'22:00',quiet_end:prefs.quiet_end||'07:00',
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',
      timezone_offset_minutes:new Date().getTimezoneOffset(),
      favorite_league_names:Array.isArray(personal.favoriteLeagues)?personal.favoriteLeagues:[],
      favorite_engine_names:Array.isArray(personal.favoriteEngines)?personal.favoriteEngines:[],
      followed_user_ids:follows.map(x=>x.target_user_id).filter(Boolean)
    };
  }
  async function savePreferences(){
    const sb=await getClient();session=await getSession();if(!sb||!session)throw new Error('Sign in to save push settings.');
    const payload=await buildPayload();
    const {data,error}=await sb.rpc('p2u_save_push_preferences',{p_payload:payload});if(error)throw error;
    preferences=data||payload;saveLocal(preferences);return preferences;
  }
  async function enable(){
    if(!supports())throw new Error('This browser does not support web push notifications.');
    session=await getSession();if(!session)throw new Error('Sign in before enabling push notifications.');
    await loadCloud();
    if(!publicConfig?.enabled||!publicConfig?.vapid_public_key)throw new Error('Push delivery has not been activated by the site owner yet.');
    const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notification permission was not granted.');
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(publicConfig.vapid_public_key)});
    const json=sub.toJSON();
    const sb=await getClient();
    const {error}=await sb.rpc('p2u_register_push_subscription',{p_endpoint:json.endpoint,p_p256dh:json.keys&&json.keys.p256dh,p_auth:json.keys&&json.keys.auth,p_device_label:deviceLabel(),p_user_agent:navigator.userAgent||''});
    if(error)throw error;
    await savePreferences();if(window.P2USmartAlerts&&window.P2USmartAlerts.setState)window.P2USmartAlerts.setState({browser:true});await loadCloud();scheduleRender();
    try{window.dispatchEvent(new CustomEvent('p2u:push-enabled',{detail:{version:VERSION}}))}catch(_){}
    return true;
  }
  async function disable(){
    const sub=await currentSubscription();const sb=await getClient();session=await getSession();
    if(sub&&sb&&session){try{await sb.rpc('p2u_unregister_push_subscription',{p_endpoint:sub.endpoint})}catch(_){}}
    if(sub)await sub.unsubscribe();await loadCloud();scheduleRender();return true;
  }
  async function updateFromForm(card){
    const next=Object.assign({},preferences||local());
    card.querySelectorAll('[data-push-pref]').forEach(input=>{next[input.dataset.pushPref]=input.type==='checkbox'?input.checked:input.value});
    preferences=next;saveLocal(next);await savePreferences();await loadCloud();scheduleRender();
  }
  function stateLabel(subscribed){
    if(!supports())return['Unsupported','warn'];
    if(!session)return['Sign in',''];
    if(!publicConfig?.enabled)return['Setup pending','warn'];
    if(Notification.permission==='denied')return['Blocked','warn'];
    return subscribed?['Active','on']:['Off',''];
  }
  function option(key,title,copy){const checked=(preferences||local())[key]!==false;return`<label class="p2u-push-option"><span class="p2u-push-option-copy"><strong>${esc(title)}</strong><span>${esc(copy)}</span></span><span class="p2u-push-toggle"><input type="checkbox" data-push-pref="${esc(key)}" ${checked?'checked':''}><i></i></span></label>`}
  async function cardHtml(){
    const subscribed=await isSubscribed();const [label,cls]=stateLabel(subscribed);const prefs=preferences||local();
    const devices=subscriptions.filter(x=>x.enabled).slice(0,6);
    const setupCopy=!session?'Sign in to sync notification settings and devices.':!publicConfig?.enabled?'The owner still needs to add the VAPID public key and deploy the Edge Function.':'Receive selected updates even when Predict2U is closed.';
    return `<section id="p2u-push-account-card" class="p2u-account-page-card full p2u-push-card"><div class="p2u-push-head"><div class="p2u-push-title"><span class="p2u-push-title-icon">🔔</span><div><h2>Push notifications</h2><p>${esc(setupCopy)}</p></div></div><span class="p2u-push-state ${cls}">${esc(label)}</span></div>`+
      `<div class="p2u-push-grid">${option('board_updates','Board published','Get notified when a new daily board goes live.')}${option('match_status','Match status','Postponed, cancelled, live and final updates for favorites.')}${option('favorite_leagues','Favorite leagues','Use your saved leagues for match-status delivery.')}${option('favorite_engines','Favorite engines','Use your saved engines for match-status delivery.')}${option('community_wins','Community records','Verified Community record updates.')}${option('football_news','Football news','Major football stories and issues.')}${option('transfer_news','Transfer news','Confirmed moves, deals and major transfer updates.')}${option('breaking_news','Breaking news','Urgent football developments and official updates.')}${option('personalized_news','Followed-topic news','Prioritize alerts matching clubs, leagues, countries, players, sources and topics you follow.')}${option('announcements','Announcements','Important compact updates from Predict2U.')}${option('followed_users','Followed users','Updates from Community members you follow.')}${option('verified_only','Verified only','Limit Community pushes to verified records.')}</div>`+
      `<div class="p2u-push-quiet">${option('quiet_enabled','Quiet hours','Pause delivery during your selected local hours.')}<div class="p2u-push-field"><label>From</label><input type="time" data-push-pref="quiet_start" value="${esc(prefs.quiet_start||'22:00')}"></div><div class="p2u-push-field"><label>Until</label><input type="time" data-push-pref="quiet_end" value="${esc(prefs.quiet_end||'07:00')}"></div></div>`+
      `<div class="p2u-push-actions"><button class="p2u-push-btn" data-push-enable ${!session||!publicConfig?.enabled?'disabled':''}>${subscribed?'Refresh this device':'Enable on this device'}</button>${subscribed?'<button class="p2u-push-btn danger" data-push-disable>Disable this device</button>':''}<button class="p2u-push-btn secondary" data-push-save ${!session?'disabled':''}>Save preferences</button></div>`+
      `<div class="p2u-push-message" data-push-message></div>`+
      (devices.length?`<div class="p2u-push-device-list">${devices.map(d=>`<div class="p2u-push-device"><div><strong>${esc(d.device_label||'Browser')}</strong><small>Last active ${new Date(d.last_seen_at).toLocaleDateString()}</small></div><span class="p2u-push-state on">Enabled</span></div>`).join('')}</div>`:'')+
      `</section>`;
  }
  async function render(){
    const root=document.getElementById('p2u-account-page-root');if(!root)return false;
    const grid=root.querySelector('.p2u-account-grid');if(!grid)return false;
    let card=document.getElementById('p2u-push-account-card');
    const html=await cardHtml();
    if(card){const wrap=document.createElement('div');wrap.innerHTML=html;card.replaceWith(wrap.firstElementChild)}else grid.insertAdjacentHTML('beforeend',html);
    return Boolean(document.getElementById('p2u-push-account-card'));
  }
  function markReady(){
    document.documentElement.dataset.p2uPushReady='true';
    window.dispatchEvent(new CustomEvent('p2u:push-ready',{detail:{version:VERSION,signedIn:Boolean(session),configured:Boolean(publicConfig?.enabled)}}));
  }
  function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>render().catch(()=>{}),40)}
  async function refresh(){
    await loadCloud();
    const root=document.getElementById('p2u-account-page-root');
    const rendered=await render();
    if(root&&!rendered)return false;
    markReady();
    return true;
  }
  function setMessage(card,message,type=''){const el=card&&card.querySelector('[data-push-message]');if(el){el.textContent=message;el.className=`p2u-push-message ${type}`}}
  document.addEventListener('click',async e=>{
    const card=e.target.closest('#p2u-push-account-card');if(!card)return;
    const button=e.target.closest('[data-push-enable],[data-push-disable],[data-push-save]');if(!button)return;
    button.disabled=true;setMessage(card,'Working…');
    try{if(button.hasAttribute('data-push-enable'))await enable();else if(button.hasAttribute('data-push-disable'))await disable();else await updateFromForm(card);setMessage(document.getElementById('p2u-push-account-card'),'Saved.','good')}catch(err){setMessage(card,err.message||'Push settings could not be saved.','bad')}finally{button.disabled=false}
  });
  document.addEventListener('change',e=>{if(e.target.closest('#p2u-push-account-card')&&e.target.matches('[data-push-pref]')){preferences=Object.assign({},preferences||local(),{[e.target.dataset.pushPref]:e.target.type==='checkbox'?e.target.checked:e.target.value});saveLocal(preferences)}});
  window.addEventListener('p2u:account-ready',refresh);window.addEventListener('p2u:cloud-synced',()=>savePreferences().catch(()=>{}));window.addEventListener('p2u:personalization-changed',()=>savePreferences().catch(()=>{}));window.addEventListener('p2u:news-follows-changed',()=>savePreferences().catch(()=>{}));
  if(navigator.serviceWorker)navigator.serviceWorker.addEventListener('message',event=>{const msg=record(event.data);if(msg.type!=='P2U_PUSH_RECEIVED')return;const payload=record(msg.payload);if(window.P2USmartAlerts&&window.P2USmartAlerts.add)window.P2USmartAlerts.add({id:payload.id||`remote-${Date.now()}`,kind:payload.category==='community'?'community':payload.category==='match'?'match':'system',category:payload.category||'system',title:payload.title||'Predict2U update',body:payload.data&&payload.data.reason?`${payload.body||''} · ${payload.data.reason}`:(payload.body||''),url:payload.url||'index.html',createdAt:payload.createdAt||Date.now()},{force:true});});
  const observer=new MutationObserver(()=>{if(!document.getElementById('p2u-push-account-card'))refresh().catch(()=>{})});
  async function init(){if(mounted)return;mounted=true;const root=document.getElementById('p2u-account-page-root');if(root)observer.observe(root,{childList:true,subtree:false});await refresh()}
  window.P2UPush={version:VERSION,enable,disable,refresh,savePreferences,isSubscribed,getPublicConfig:()=>record(publicConfig),isReady:()=>document.documentElement.dataset.p2uPushReady==='true'};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
