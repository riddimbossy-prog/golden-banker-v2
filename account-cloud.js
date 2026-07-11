/* Predict2U v180 Accounts, Cloud Sync & Follow System.
   Uses only the public Supabase publishable key. RLS in SUPABASE_CLOUD_SETUP_v180.sql
   protects each user's cloud state. Never place a service-role key in browser code. */
(function(){
  'use strict';
  const VERSION='v181';
  const CONFIG=window.P2U_CLOUD_CONFIG||{};
  const META_KEY='p2u-cloud-local-meta-v180';
  const LOCAL_FOLLOWS_KEY='p2u-local-follows-v180';
  const PREF_KEY='p2u-personalization-v167';
  const ALERT_KEY='p2u-smart-alerts-v168';
  const SLIP_KEY='p2u_slip_v1';
  const STAKE_KEY='p2u_stake_v1';
  const TAIL_KEY='p2u_tail_v1';
  const SETTINGS_KEYS=['enabled','browser','boardUpdates','matchStatus','favoriteLeagues','favoriteEngines','communityWins','followedUsers','verifiedOnly','trendingWins','paused','mutedUntil'];
  let client=null,session=null,profile=null,mounted=false,panel=null,backdrop=null,launcher=null;
  let follows=new Map(),savedSlips=[],syncTimer=null,restoring=false,syncState='local',lastError='';

  const safeParse=(v,f)=>{try{return JSON.parse(v)}catch(_){return f}};
  const record=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v||'').trim();
  const now=()=>Date.now();
  const isLocalHost=()=>/^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  const cloudEnabled=()=>CONFIG.enabled!==false&&!isLocalHost()&&CONFIG.url&&CONFIG.publishableKey;

  function meta(){return Object.assign({preferences:0,alerts:0,slip:0,lastSync:0},record(safeParse(localStorage.getItem(META_KEY),{})))}
  function writeMeta(next){try{localStorage.setItem(META_KEY,JSON.stringify(Object.assign(meta(),next)))}catch(_){}}
  function mark(domain){if(restoring)return;writeMeta({[domain]:now()});scheduleSync()}
  function localFollows(){const value=safeParse(localStorage.getItem(LOCAL_FOLLOWS_KEY),[]);return Array.isArray(value)?value.filter(Boolean):[]}
  function writeLocalFollows(values){try{localStorage.setItem(LOCAL_FOLLOWS_KEY,JSON.stringify([...new Set(values)]))}catch(_){}}
  function alertSettings(){const raw=record(safeParse(localStorage.getItem(ALERT_KEY),{}));return Object.fromEntries(SETTINGS_KEYS.map(k=>[k,raw[k]]).filter(([,v])=>v!==undefined))}
  function localSnapshot(){
    return {
      preferences:record(safeParse(localStorage.getItem(PREF_KEY),{})),
      alert_settings:alertSettings(),
      draft_slip:{
        legs:Array.isArray(safeParse(localStorage.getItem(SLIP_KEY),[]))?safeParse(localStorage.getItem(SLIP_KEY),[]):[],
        stake:Number(localStorage.getItem(STAKE_KEY)||1)||1,
        tail:record(safeParse(localStorage.getItem(TAIL_KEY),{}))
      }
    };
  }
  function profileName(){return profile&&profile.handle?'@'+profile.handle:(session&&session.user&&session.user.email?session.user.email.split('@')[0]:'Account')}
  function initials(){const value=profile&&profile.handle||session&&session.user&&session.user.email||'P';return clean(value).replace(/^@/,'').slice(0,1).toUpperCase()||'P'}

  function loadSdk(){
    if(window.supabase&&window.supabase.createClient)return Promise.resolve(window.supabase);
    if(document.querySelector('script[data-p2u-supabase-sdk]'))return new Promise(resolve=>{
      const wait=()=>window.supabase&&window.supabase.createClient?resolve(window.supabase):setTimeout(wait,60);wait();
    });
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.async=true;s.dataset.p2uSupabaseSdk='1';s.onload=()=>resolve(window.supabase);s.onerror=()=>reject(new Error('Cloud library unavailable'));document.head.appendChild(s);
    });
  }
  async function getClient(){
    if(client)return client;
    if(!cloudEnabled())return null;
    try{const sdk=await loadSdk();client=sdk.createClient(CONFIG.url,CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return client}catch(e){lastError=e.message||'Cloud unavailable';return null}
  }
  async function loadProfile(){
    if(!session||!client){profile=null;return null}
    try{
      const {data,error}=await client.from('profiles').select('id,handle,avatar_url,bio').eq('id',session.user.id).maybeSingle();
      if(error&&!/does not exist/i.test(error.message||''))throw error;
      profile=data||{id:session.user.id,handle:session.user.user_metadata&&session.user.user_metadata.handle||'',avatar_url:session.user.user_metadata&&session.user.user_metadata.avatar_url||'',bio:''};
    }catch(_){profile={id:session.user.id,handle:'',avatar_url:'',bio:''}}
    return profile;
  }
  async function loadFollows(){
    follows=new Map(localFollows().map(key=>[key,{target_key:key,target_handle:key.replace(/^handle:/,'')}]))
    if(!session||!client)return follows;
    try{
      const {data,error}=await client.from(CONFIG.followsTable||'p2u_follows').select('target_key,target_user_id,target_handle,created_at').eq('follower_id',session.user.id).order('created_at',{ascending:false});
      if(error)throw error;(data||[]).forEach(row=>follows.set(row.target_key,row));writeLocalFollows([...follows.keys()]);lastError='';
    }catch(e){lastError=e.message||'Follow sync unavailable'}
    decorateFollowButtons();renderAll();return follows;
  }
  async function loadSavedSlips(){
    savedSlips=[];if(!session||!client)return savedSlips;
    try{const {data,error}=await client.from('slips').select('id,legs,is_public,result,created_at,combined_odds').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(8);if(error)throw error;savedSlips=data||[]}catch(_){savedSlips=[]}
    renderAll();return savedSlips;
  }

  function applyCloud(snapshot){
    restoring=true;
    try{
      const cloud=record(snapshot);
      if(cloud.preferences&&Object.keys(record(cloud.preferences)).length){
        if(window.P2UPersonalization&&window.P2UPersonalization.setPrefs)window.P2UPersonalization.setPrefs(cloud.preferences);
        else localStorage.setItem(PREF_KEY,JSON.stringify(cloud.preferences));
      }
      if(cloud.alert_settings&&Object.keys(record(cloud.alert_settings)).length){
        const current=record(safeParse(localStorage.getItem(ALERT_KEY),{}));
        const next=Object.assign({},current,cloud.alert_settings,{alerts:Array.isArray(current.alerts)?current.alerts:[]});
        if(window.P2USmartAlerts&&window.P2USmartAlerts.setState)window.P2USmartAlerts.setState(next);else localStorage.setItem(ALERT_KEY,JSON.stringify(next));
      }
      if(cloud.draft_slip&&Array.isArray(cloud.draft_slip.legs)){
        if(window.P2USlip&&window.P2USlip.replaceDraft)window.P2USlip.replaceDraft(cloud.draft_slip);
        else{
          localStorage.setItem(SLIP_KEY,JSON.stringify(cloud.draft_slip.legs));
          localStorage.setItem(STAKE_KEY,String(cloud.draft_slip.stake||1));
          if(cloud.draft_slip.tail&&Object.keys(record(cloud.draft_slip.tail)).length)localStorage.setItem(TAIL_KEY,JSON.stringify(cloud.draft_slip.tail));
        }
      }
      writeMeta({preferences:now(),alerts:now(),slip:now(),lastSync:now()});
    }finally{setTimeout(()=>{restoring=false},0)}
  }
  async function pushCloud(){
    if(!session||!client)return false;
    syncState='syncing';renderAll();
    const snap=localSnapshot();
    try{
      const payload={user_id:session.user.id,preferences:snap.preferences,alert_settings:snap.alert_settings,draft_slip:snap.draft_slip,client_version:VERSION,updated_at:new Date().toISOString()};
      const {error}=await client.from(CONFIG.stateTable||'p2u_cloud_state').upsert(payload,{onConflict:'user_id'});if(error)throw error;
      writeMeta({lastSync:now()});syncState='synced';lastError='';renderAll();window.dispatchEvent(new CustomEvent('p2u:cloud-synced',{detail:{version:VERSION}}));return true;
    }catch(e){syncState='error';lastError=e.message||'Cloud sync failed';renderAll();return false}
  }
  async function syncNow(mode='merge'){
    if(!session||!client){syncState='local';renderAll();return false}
    syncState='syncing';renderAll();
    try{
      const {data,error}=await client.from(CONFIG.stateTable||'p2u_cloud_state').select('preferences,alert_settings,draft_slip,updated_at').eq('user_id',session.user.id).maybeSingle();
      if(error)throw error;
      if(mode==='cloud'&&data){applyCloud(data);syncState='synced';lastError='';renderAll();return true}
      if(mode==='device'||!data)return pushCloud();
      const localChanged=Math.max(meta().preferences,meta().alerts,meta().slip);
      const cloudChanged=Date.parse(data.updated_at||0)||0;
      if(cloudChanged>localChanged)applyCloud(data);else await pushCloud();
      syncState='synced';lastError='';renderAll();return true;
    }catch(e){syncState='error';lastError=e.message||'Cloud tables need setup';renderAll();return false}
  }
  function scheduleSync(){if(restoring||!session)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>pushCloud(),1000)}

  async function signIn(email){
    const sb=await getClient();if(!sb)throw new Error('Cloud sign-in is unavailable on this local preview.');
    const cleanEmail=clean(email);if(!/^\S+@\S+\.\S+$/.test(cleanEmail))throw new Error('Enter a valid email address.');
    const redirect=new URL('account.html',location.href).href;
    const {error}=await sb.auth.signInWithOtp({email:cleanEmail,options:{emailRedirectTo:redirect,shouldCreateUser:true}});if(error)throw error;return true;
  }
  async function signOut(){if(client)await client.auth.signOut();session=null;profile=null;syncState='local';renderAll();updateLauncher()}
  async function requestDeletion(){
    if(!session||!client)throw new Error('Sign in first.');
    const {error}=await client.from(CONFIG.deletionTable||'p2u_account_deletion_requests').insert({user_id:session.user.id,email:session.user.email,requested_at:new Date().toISOString()});if(error)throw error;return true;
  }
  function exportData(){
    const payload={exportedAt:new Date().toISOString(),version:VERSION,account:session?{id:session.user.id,email:session.user.email}:null,profile,cloudState:localSnapshot(),follows:[...follows.values()],savedSlips};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='predict2u-account-export.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function targetFrom(value){
    if(typeof value==='string')return{targetKey:value,targetHandle:value.replace(/^handle:/,'')};
    const source=record(value);const id=clean(source.targetUserId||source.userId||source.id);const handle=clean(source.targetHandle||source.handle).replace(/^@/,'');
    return{targetKey:clean(source.targetKey)||(id?'user:'+id:handle?'handle:'+handle:''),targetUserId:id||null,targetHandle:handle||null};
  }
  async function setFollow(value,shouldFollow=true){
    const target=targetFrom(value);if(!target.targetKey)return false;
    if(shouldFollow)follows.set(target.targetKey,{target_key:target.targetKey,target_user_id:target.targetUserId,target_handle:target.targetHandle,created_at:new Date().toISOString()});else follows.delete(target.targetKey);
    writeLocalFollows([...follows.keys()]);decorateFollowButtons();renderAll();
    if(!session||!client){open('signin');return shouldFollow}
    try{
      if(shouldFollow){const {error}=await client.from(CONFIG.followsTable||'p2u_follows').upsert({follower_id:session.user.id,target_key:target.targetKey,target_user_id:target.targetUserId,target_handle:target.targetHandle},{onConflict:'follower_id,target_key'});if(error)throw error}
      else{const {error}=await client.from(CONFIG.followsTable||'p2u_follows').delete().eq('follower_id',session.user.id).eq('target_key',target.targetKey);if(error)throw error}
      lastError='';
    }catch(e){lastError=e.message||'Follow sync failed'}
    renderAll();return shouldFollow;
  }
  async function toggleFollow(value){const target=targetFrom(value);return setFollow(target,!follows.has(target.targetKey))}
  function isFollowing(value){const target=targetFrom(value);return Boolean(target.targetKey&&follows.has(target.targetKey))}

  function inferTarget(button){
    const card=button.closest('[data-user-id],[data-profile-id],.member,.profile-card,.lb-row')||button.parentElement;
    const id=clean(button.dataset.userId||button.dataset.profileId||card&&card.dataset.userId||card&&card.dataset.profileId);
    const handle=clean(button.dataset.handle||button.dataset.userHandle||card&&card.dataset.handle||card&&card.querySelector('.mh,.lb-h,[data-handle]')&&card.querySelector('.mh,.lb-h,[data-handle]').textContent).replace(/^@/,'');
    return targetFrom({userId:id,handle});
  }
  function decorateFollowButtons(){
    document.querySelectorAll('.follow,[data-follow-user]').forEach(button=>{
      const target=inferTarget(button);if(!target.targetKey)return;button.dataset.p2uCloudTarget=target.targetKey;
      const active=follows.has(target.targetKey);button.classList.toggle('on',active);button.setAttribute('aria-pressed',String(active));
      if(!button.dataset.p2uCloudBound){button.dataset.p2uCloudBound='1';button.addEventListener('click',()=>setTimeout(()=>toggleFollow(target),0))}
    });
  }
  function decorateProfileLinks(){
    document.querySelectorAll('.member .mh,.lb-h,[data-profile-handle]').forEach(el=>{
      if(el.closest('a'))return;const handle=clean(el.dataset.profileHandle||el.textContent).replace(/^@/,'');if(!handle)return;
      const a=document.createElement('a');a.href='profile.html?handle='+encodeURIComponent(handle);a.style.color='inherit';a.style.textDecoration='none';el.parentNode.insertBefore(a,el);a.appendChild(el);
    });
  }

  function statusText(){if(!cloudEnabled())return'Local preview';if(!session)return'Not signed in';if(syncState==='syncing')return'Syncing…';if(syncState==='synced')return'Cloud synced';if(syncState==='error')return'Sync needs attention';return'Local only'}
  function avatarHtml(size=''){const avatar=profile&&profile.avatar_url;if(avatar)return`<img src="${esc(avatar)}" alt="" ${size?`style="width:${size}px;height:${size}px"`:''}/>`;return`<span>${esc(initials())}</span>`}
  function signedOutHtml(){return`<section class="p2u-account-section"><h3>Sign in without a password</h3><p>We will email a one-tap sign-in link. Your favorites, alerts and current slip can then follow you across devices.</p><input class="p2u-account-input" data-account-email type="email" autocomplete="email" placeholder="your@email.com"><div class="p2u-account-actions"><button class="p2u-account-btn" data-account-signin>Email me a sign-in link</button><a class="p2u-account-btn ghost" href="community.html">Community</a></div><div class="p2u-account-msg" data-account-msg></div></section><section class="p2u-account-section"><h3>Private by default</h3><p>Predict2U syncs interface preferences and draft records. It does not store bookmaker passwords, payment information or stakes in alerts.</p><span class="p2u-cloud-badge local">Local device mode</span></section>`}
  function followHtml(){const list=[...follows.values()].slice(0,8);if(!list.length)return'<div class="p2u-account-empty">You are not following anyone yet. Follow members from Community.</div>';return`<div class="p2u-account-follow-list">${list.map(row=>`<div class="p2u-account-follow-item"><a href="profile.html?${row.target_user_id?'id='+encodeURIComponent(row.target_user_id):'handle='+encodeURIComponent(row.target_handle||row.target_key.replace(/^handle:/,''))}"><strong>${esc(row.target_handle?'@'+row.target_handle:row.target_key)}</strong><small>Community profile</small></a><button class="p2u-account-btn ghost" data-account-unfollow="${esc(row.target_key)}">Unfollow</button></div>`).join('')}</div>`}
  function slipsHtml(){if(!savedSlips.length)return'<div class="p2u-account-empty">No saved account slips yet.</div>';return`<div class="p2u-account-slip-list">${savedSlips.map(s=>{const legs=Array.isArray(s.legs)?s.legs:[];const label=legs.slice(0,2).map(l=>`${l.home||''} v ${l.away||''}`).join(' · ')||'Saved record';return`<div class="p2u-account-slip-item"><div class="p2u-account-slip-copy"><strong>${esc(label)}</strong><small>${legs.length} leg${legs.length===1?'':'s'} · ${esc(s.result||'Open')} · ${new Date(s.created_at).toLocaleDateString()}</small></div></div>`}).join('')}</div>`}
  function signedInHtml(){const prefs=localSnapshot().preferences;return`<section class="p2u-account-section"><div class="p2u-account-profile"><div class="p2u-account-avatar">${avatarHtml()}</div><div class="p2u-account-profile-copy"><div class="p2u-account-handle">${esc(profileName())}</div><div class="p2u-account-email">${esc(session.user.email||'')}</div><div class="p2u-account-status"><span class="p2u-account-status-dot ${syncState==='synced'?'online':syncState==='syncing'?'syncing':syncState==='error'?'error':''}"></span>${esc(statusText())}</div></div></div><div class="p2u-account-stats"><div class="p2u-account-stat"><b>${Array.isArray(prefs.favoriteLeagues)?prefs.favoriteLeagues.length:0}</b><span>Leagues</span></div><div class="p2u-account-stat"><b>${Array.isArray(prefs.favoriteEngines)?prefs.favoriteEngines.length:0}</b><span>Engines</span></div><div class="p2u-account-stat"><b>${follows.size}</b><span>Following</span></div></div><div class="p2u-account-actions"><button class="p2u-account-btn" data-account-sync>Sync now</button><button class="p2u-account-btn ghost" data-account-restore>Use cloud copy</button><a class="p2u-account-btn ghost" href="account.html">Account center</a></div>${lastError?`<div class="p2u-account-msg bad">${esc(lastError)}</div>`:''}</section><section class="p2u-account-section"><h3>Following</h3><p>Members you follow sync across signed-in devices.</p>${followHtml()}</section><section class="p2u-account-section"><div class="p2u-account-actions"><button class="p2u-account-btn ghost" data-account-export>Download my data</button><button class="p2u-account-btn ghost" data-account-signout>Sign out</button></div></section>`}
  function drawerHtml(){return`<div class="p2u-account-head"><div><div class="p2u-account-kicker">ACCOUNT · ${VERSION.toUpperCase()}</div><h2>${session?'Your Predict2U account':'Sync across devices'}</h2><p>Favorites, alerts, follows and draft slips—without bookmaker access or payment data.</p></div><button class="p2u-account-icon-btn" data-account-close aria-label="Close">×</button></div>${session?signedInHtml():signedOutHtml()}`}
  function mountDrawer(){if(backdrop)return;backdrop=document.createElement('div');backdrop.id='p2u-account-backdrop';backdrop.className='p2u-account-backdrop';backdrop.setAttribute('aria-hidden','true');backdrop.innerHTML='<aside id="p2u-account-panel" class="p2u-account-panel" role="dialog" aria-modal="true" aria-label="Predict2U account"></aside>';document.body.appendChild(backdrop);panel=backdrop.querySelector('#p2u-account-panel');backdrop.addEventListener('click',e=>{if(e.target===backdrop)close()});}
  function open(view){mountDrawer();panel.innerHTML=drawerHtml();backdrop.classList.add('is-open');backdrop.setAttribute('aria-hidden','false');document.body.classList.add('p2u-account-open');const email=panel.querySelector('[data-account-email]');if(view==='signin'&&email)setTimeout(()=>email.focus(),40)}
  function close(){if(!backdrop)return;backdrop.classList.remove('is-open');backdrop.setAttribute('aria-hidden','true');document.body.classList.remove('p2u-account-open')}

  function mountLauncher(){
    if(/(?:^|\/)account\.html$/i.test(location.pathname))return;
    const chip=document.getElementById('user-chip');
    if(chip){chip.href='account.html';launcher=chip;return updateLauncher()}
    if(document.getElementById('p2u-account-launcher')){launcher=document.getElementById('p2u-account-launcher');return updateLauncher()}
    const a=document.createElement('a');a.id='p2u-account-launcher';a.className='p2u-account-launcher';a.href='account.html';a.setAttribute('aria-label','Account and cloud sync');
    const topInner=document.querySelector('header.top .top-inner');const nav=document.querySelector('nav.sticky>div');
    if(topInner){const alert=document.getElementById('p2u-alert-button');topInner.insertBefore(a,alert?alert.nextSibling:topInner.querySelector('.mobile-page-chip')||null)}
    else if(nav)nav.appendChild(a);else{a.classList.add('p2u-account-launcher-floating');document.body.appendChild(a)}
    launcher=a;updateLauncher();
  }
  function updateLauncher(){if(!launcher)return;if(launcher.id==='user-chip'){const name=document.getElementById('user-name'),sub=document.getElementById('user-sub'),av=document.getElementById('user-av');if(name)name.textContent=session?profileName():'Sign in';if(sub)sub.textContent=session?statusText():'Cloud sync';if(av)av.innerHTML=avatarHtml();return}
    launcher.classList.toggle('is-signed-in',Boolean(session));launcher.innerHTML=avatarHtml()+'<i class="p2u-account-dot '+(syncState==='synced'?'is-online':syncState==='syncing'?'is-syncing':'')+'"></i>';
  }
  function renderAccountPage(){
    const root=document.getElementById('p2u-account-page-root');if(!root)return;const prefs=localSnapshot().preferences;
    root.innerHTML=session?`<div class="p2u-account-grid"><section class="p2u-account-page-card"><h2>Account</h2>${signedInHtml()}</section><section class="p2u-account-page-card"><h2>Cloud snapshot</h2><p style="color:var(--p2u-account-muted);line-height:1.5">Your current device has ${Array.isArray(prefs.favoriteLeagues)?prefs.favoriteLeagues.length:0} favorite leagues, ${Array.isArray(prefs.favoriteEngines)?prefs.favoriteEngines.length:0} favorite engines and ${(localSnapshot().draft_slip.legs||[]).length} draft slip legs.</p><div class="p2u-account-actions"><button class="p2u-account-btn" data-account-sync>Sync this device</button><button class="p2u-account-btn ghost" data-account-restore>Restore cloud copy</button></div><div class="p2u-account-msg ${lastError?'bad':''}">${esc(lastError||statusText())}</div></section><section class="p2u-account-page-card"><h2>Following</h2>${followHtml()}</section><section class="p2u-account-page-card"><h2>Saved records</h2>${slipsHtml()}</section><section class="p2u-account-page-card full"><h2>Privacy and control</h2><p style="color:var(--p2u-account-muted)">Export your account data or request account deletion. Deletion requests are reviewed before authentication and public records are removed.</p><div class="p2u-account-actions"><button class="p2u-account-btn ghost" data-account-export>Download my data</button><button class="p2u-account-btn danger" data-account-delete>Request deletion</button><button class="p2u-account-btn ghost" data-account-signout>Sign out</button></div><div class="p2u-account-msg" data-account-msg></div></section></div>`:`<div class="p2u-account-grid"><section class="p2u-account-page-card">${signedOutHtml()}</section><section class="p2u-account-page-card"><h2>What syncs</h2><p style="color:var(--p2u-account-muted);line-height:1.55">Favorite leagues and engines, hidden leagues, recent views, Smart Alert settings, followed Community members and your unfinished slip.</p><span class="p2u-cloud-badge local">No password required</span></section></div>`;
  }
  function renderProfilePage(){
    const root=document.getElementById('p2u-profile-page-root');if(!root)return;const params=new URLSearchParams(location.search);const id=params.get('id'),handle=params.get('handle');
    root.innerHTML='<div class="p2u-account-empty">Loading public profile…</div>';loadPublicProfile({id,handle}).then(data=>{
      if(!data){root.innerHTML='<div class="p2u-account-empty">Profile not found.</div>';return}
      const target=targetFrom({userId:data.id,handle:data.handle});const active=isFollowing(target);root.innerHTML=`<section class="p2u-profile-card"><div class="p2u-account-profile"><div class="p2u-account-avatar">${data.avatar_url?`<img src="${esc(data.avatar_url)}" alt="">`:`<span>${esc((data.handle||'P').slice(0,1).toUpperCase())}</span>`}</div><div class="p2u-account-profile-copy"><div class="p2u-account-handle">@${esc(data.handle||'member')}</div><div class="p2u-account-email">${esc(data.bio||'Predict2U Community member')}</div></div></div><div class="p2u-account-stats"><div class="p2u-account-stat"><b>${Number(data.slips_won||0)}</b><span>Won</span></div><div class="p2u-account-stat"><b>${Number(data.slips_lost||0)}</b><span>Lost</span></div><div class="p2u-account-stat"><b>${Number(data.hit_pct||0)}%</b><span>Record</span></div></div><div class="p2u-profile-actions"><button class="p2u-account-btn ${active?'ghost':''}" data-profile-follow>${active?'Following':'Follow'}</button><a class="p2u-account-btn ghost" href="community.html">Community</a></div><p style="margin-top:18px;color:var(--p2u-account-muted);font-size:12px">Records, not promises. Predict2U does not accept bets or handle money. 18+.</p></section>`;
      root.querySelector('[data-profile-follow]').addEventListener('click',async e=>{const state=await toggleFollow(target);e.currentTarget.textContent=state?'Following':'Follow';e.currentTarget.classList.toggle('ghost',state)});
    });
  }
  async function loadPublicProfile(query){
    const sb=await getClient();if(!sb)return null;try{
      let req=sb.from('profiles').select('id,handle,avatar_url,bio');if(query.id)req=req.eq('id',query.id);else if(query.handle)req=req.ilike('handle',query.handle);else return null;
      const {data,error}=await req.maybeSingle();if(error||!data)return null;const {data:rank}=await sb.from('user_ranks').select('rank_tier,verified,slips_won,slips_lost,hit_pct').eq('user_id',data.id).maybeSingle();return Object.assign({},data,rank||{});
    }catch(_){return null}
  }
  function renderAll(){updateLauncher();if(panel&&backdrop&&backdrop.classList.contains('is-open'))panel.innerHTML=drawerHtml();renderAccountPage();decorateFollowButtons();decorateProfileLinks()}

  document.addEventListener('click',async e=>{
    const closeBtn=e.target.closest('[data-account-close]');if(closeBtn){close();return}
    const signInBtn=e.target.closest('[data-account-signin]');if(signInBtn){const scope=signInBtn.closest('.p2u-account-panel,.p2u-account-page-card')||document;const input=scope.querySelector('[data-account-email]');const msg=scope.querySelector('[data-account-msg]');try{if(msg){msg.textContent='Sending…';msg.className='p2u-account-msg'}await signIn(input&&input.value);if(msg){msg.textContent='Check your email for the sign-in link.';msg.className='p2u-account-msg good'}}catch(err){if(msg){msg.textContent=err.message;msg.className='p2u-account-msg bad'}}return}
    if(e.target.closest('[data-account-signout]')){await signOut();return}
    if(e.target.closest('[data-account-sync]')){await syncNow('device');return}
    if(e.target.closest('[data-account-restore]')){await syncNow('cloud');return}
    if(e.target.closest('[data-account-export]')){exportData();return}
    if(e.target.closest('[data-account-delete]')){const msg=document.querySelector('[data-account-msg]');try{await requestDeletion();if(msg){msg.textContent='Deletion request received.';msg.className='p2u-account-msg good'}}catch(err){if(msg){msg.textContent=err.message;msg.className='p2u-account-msg bad'}}return}
    const unfollow=e.target.closest('[data-account-unfollow]');if(unfollow){await setFollow(unfollow.dataset.accountUnfollow,false);return}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  window.addEventListener('p2u:personalization-changed',()=>mark('preferences'));
  window.addEventListener('p2u:smart-alerts-changed',()=>mark('alerts'));
  window.addEventListener('p2u:slip-changed',()=>mark('slip'));

  function seedLocalMeta(){
    const current=meta();const stamp=now();const patch={};
    if(!current.preferences&&localStorage.getItem(PREF_KEY))patch.preferences=stamp;
    if(!current.alerts&&localStorage.getItem(ALERT_KEY))patch.alerts=stamp;
    if(!current.slip&&localStorage.getItem(SLIP_KEY))patch.slip=stamp;
    if(Object.keys(patch).length)writeMeta(patch);
  }
  async function init(){
    if(mounted)return;mounted=true;seedLocalMeta();mountDrawer();mountLauncher();
    const observer=new MutationObserver(()=>{decorateFollowButtons();decorateProfileLinks()});observer.observe(document.body,{childList:true,subtree:true});
    const sb=await getClient();
    if(sb){
      const {data}=await sb.auth.getSession();session=data&&data.session||null;
      sb.auth.onAuthStateChange(async(_event,next)=>{session=next||null;if(session){await loadProfile();await Promise.all([loadFollows(),loadSavedSlips()]);await syncNow('merge')}else{profile=null;syncState='local'}renderAll()});
      if(session){await loadProfile();await Promise.all([loadFollows(),loadSavedSlips()]);await syncNow('merge')}
    }
    renderAll();renderProfilePage();
    document.documentElement.dataset.p2uAccountReady=cloudEnabled()?'true':'local';
    window.dispatchEvent(new CustomEvent('p2u:account-ready',{detail:{version:VERSION,cloud:cloudEnabled(),signedIn:Boolean(session)}}));
  }

  window.P2UAccounts={version:VERSION,open,close,signIn,signOut,syncNow,getClient,getSession:()=>session,getProfile:()=>clone(profile),getLocalSnapshot:()=>clone(localSnapshot()),getFollows:()=>[...follows.values()].map(clone),toggleFollow,setFollow,isFollowing,loadPublicProfile,requestDeletion,exportData,isReady:()=>mounted};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
