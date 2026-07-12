/* Predict2U v186 — privacy-first product analytics.
   First-party only. No advertising IDs, no raw IP storage, no browser fingerprinting.
   Respects Do Not Track and Global Privacy Control. */
(function(){
  'use strict';

  const VERSION='v186';
  const CONFIG=window.P2U_CLOUD_CONFIG||{};
  const CONSENT_KEY='p2uAnalyticsConsent';
  const SESSION_KEY='p2uAnalyticsSession';
  const QUEUE_KEY='p2uAnalyticsQueue';
  const MAX_QUEUE=120;
  const BATCH_SIZE=40;
  const FLUSH_MS=12000;
  const ALLOWED_EVENTS=new Set([
    'page_view','navigation','search_used','filter_changed','match_opened','league_opened','engine_opened',
    'record_saved','slip_added','share_opened','share_completed','community_opened','community_posted',
    'follow_changed','personalization_opened','alert_center_opened','push_enabled','install_prompt_shown',
    'install_completed','account_sync','web_vital','client_error'
  ]);

  let queue=[];
  let flushTimer=null;
  let ready=false;
  let consent=readConsent();
  let sessionId=getSessionId();
  let pageStarted=performance.now();
  let lastSearchAt=0;
  let lastSearchValue='';
  let vitals={cls:0,lcp:0,inp:0,fcp:0};

  const $=(s,r=document)=>r.querySelector(s);
  const clean=(value,max=160)=>String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
  const nowIso=()=>new Date().toISOString();
  const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)});

  function privacySignal(){
    return navigator.globalPrivacyControl===true||navigator.doNotTrack==='1'||window.doNotTrack==='1';
  }
  function readConsent(){
    if(privacySignal())return'declined';
    const value=localStorage.getItem(CONSENT_KEY);
    return value==='accepted'||value==='declined'?value:'unset';
  }
  function setConsent(value){
    consent=value==='accepted'?'accepted':'declined';
    localStorage.setItem(CONSENT_KEY,consent);
    document.documentElement.dataset.p2uAnalyticsConsent=consent;
    updateConsentUi();
    if(consent==='accepted'){
      track('page_view',{source:'consent'});
      scheduleFlush(800);
    }else{
      queue=[];
      localStorage.removeItem(QUEUE_KEY);
    }
    window.dispatchEvent(new CustomEvent('p2u:analytics-consent',{detail:{consent,version:VERSION}}));
  }
  function getSessionId(){
    let id=sessionStorage.getItem(SESSION_KEY);
    if(!id){id=uuid();sessionStorage.setItem(SESSION_KEY,id)}
    return id;
  }
  function loadQueue(){
    try{
      const stored=JSON.parse(sessionStorage.getItem(QUEUE_KEY)||'[]');
      queue=Array.isArray(stored)?stored.slice(-MAX_QUEUE):[];
    }catch(_){queue=[]}
  }
  function saveQueue(){
    try{sessionStorage.setItem(QUEUE_KEY,JSON.stringify(queue.slice(-MAX_QUEUE)))}catch(_){}
  }
  function pagePath(){
    const raw=location.pathname||'/';
    const path=raw.endsWith('/')?`${raw}index.html`:raw;
    return clean(path.replace(/\/+/g,'/'),180);
  }
  function referrerHost(){
    try{return document.referrer?clean(new URL(document.referrer).hostname,120):''}catch(_){return''}
  }
  function viewportBucket(){
    const w=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
    if(w<321)return'xs-280-320';
    if(w<361)return'fold-321-360';
    if(w<481)return'mobile-361-480';
    if(w<769)return'tablet-small';
    if(w<1025)return'tablet';
    if(w<1441)return'desktop';
    return'wide';
  }
  function deviceClass(){
    const w=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
    if(w<600)return'mobile';
    if(w<1025)return'tablet';
    return'desktop';
  }
  function networkClass(){
    const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    return c&&c.effectiveType?clean(c.effectiveType,20):'unknown';
  }
  function safeMetadata(input){
    const source=input&&typeof input==='object'?input:{};
    const output={};
    const allowed=['source','action','view','category','entityType','entityKey','league','engine','status','target','name','value','rating','delta','count','method','result','reason'];
    for(const key of allowed){
      if(!(key in source))continue;
      const value=source[key];
      if(typeof value==='number'&&Number.isFinite(value))output[key]=Math.round(value*1000)/1000;
      else if(typeof value==='boolean')output[key]=value;
      else if(Array.isArray(value))output[key]=value.slice(0,12).map(v=>clean(v,80));
      else output[key]=clean(value,key==='entityKey'?180:120);
    }
    return output;
  }
  function eventPayload(name,metadata={}){
    return{
      event_id:uuid(),
      event_name:name,
      occurred_at:nowIso(),
      page_path:pagePath(),
      session_id:sessionId,
      device_class:deviceClass(),
      viewport_bucket:viewportBucket(),
      network_class:networkClass(),
      referrer_host:referrerHost(),
      installed:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,
      metadata:safeMetadata(metadata)
    };
  }
  function track(name,metadata={}){
    if(consent!=='accepted'||!ALLOWED_EVENTS.has(name))return false;
    queue.push(eventPayload(name,metadata));
    if(queue.length>MAX_QUEUE)queue=queue.slice(-MAX_QUEUE);
    saveQueue();
    if(queue.length>=BATCH_SIZE)scheduleFlush(50);else scheduleFlush();
    return true;
  }
  function scheduleFlush(delay=FLUSH_MS){
    clearTimeout(flushTimer);
    flushTimer=setTimeout(()=>flush(),delay);
  }
  async function authToken(){
    try{
      const acc=window.P2UAccounts;
      if(acc&&acc.getSession){const session=acc.getSession();if(session&&session.access_token)return session.access_token}
    }catch(_){}
    return CONFIG.publishableKey||'';
  }
  async function flush(){
    clearTimeout(flushTimer);flushTimer=null;
    if(consent!=='accepted'||!queue.length||!CONFIG.url||!CONFIG.publishableKey)return{sent:0};
    const batch=queue.slice(0,BATCH_SIZE);
    const token=await authToken();
    try{
      const response=await fetch(`${CONFIG.url}/rest/v1/rpc/p2u_ingest_analytics_events`,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':CONFIG.publishableKey,'Authorization':`Bearer ${token||CONFIG.publishableKey}`},
        body:JSON.stringify({p_events:batch}),
        keepalive:true,
        cache:'no-store'
      });
      if(!response.ok)throw new Error(`Analytics ingest ${response.status}`);
      queue.splice(0,batch.length);saveQueue();
      if(queue.length)scheduleFlush(1000);
      return{sent:batch.length};
    }catch(error){
      saveQueue();scheduleFlush(30000);
      return{sent:0,error:error.message};
    }
  }

  function elementText(el){return clean((el&&((el.getAttribute&&el.getAttribute('aria-label'))||el.textContent))||'',120)}
  function entityFrom(el){
    const card=el&&el.closest&&el.closest('[data-p2u-match-key],[data-match-id],article,.match-card,.card');
    return{
      entityType:card&&card.hasAttribute('data-p2u-match-key')?'match':'ui',
      entityKey:card&&(card.getAttribute('data-p2u-match-key')||card.getAttribute('data-match-id'))||'',
      league:card&&(card.dataset.league||card.getAttribute('data-league'))||'',
      engine:card&&(card.dataset.engine||card.getAttribute('data-engine'))||''
    };
  }
  function bindClicks(){
    document.addEventListener('click',event=>{
      const el=event.target.closest('a,button,[role="button"],[data-analytics-event]');if(!el)return;
      const explicit=el.dataset&&el.dataset.analyticsEvent;
      if(explicit&&ALLOWED_EVENTS.has(explicit)){track(explicit,Object.assign(entityFrom(el),{action:elementText(el)}));return}
      const text=elementText(el).toLowerCase();
      const href=el.getAttribute&&el.getAttribute('href')||'';
      if(/share|copy link|whatsapp|telegram|facebook|\bx\b/.test(text))track('share_opened',Object.assign(entityFrom(el),{action:text.slice(0,60)}));
      else if(/\+\s*slip|add.*slip/.test(text))track('slip_added',entityFrom(el));
      else if(el.closest('[data-news-discuss]'))track('news_discussion_opened',entityFrom(el));
      else if(el.closest('[data-news-share]'))track('news_shared',entityFrom(el));
      else if(/personal|my board/.test(text))track('personalization_opened',{action:text.slice(0,60)});
      else if(/alert|notification/.test(text))track('alert_center_opened',{action:text.slice(0,60)});
      else if(/install/.test(text))track('install_prompt_shown',{action:text.slice(0,60)});
      else if(el.matches('a[href]')&&href&&!href.startsWith('#')&&!/^javascript:/i.test(href))track('navigation',{target:clean(href.split('?')[0].split('#')[0],120),action:text.slice(0,60)});
      const matchCard=el.closest('[data-p2u-match-key],[data-match-id]');
      if(matchCard&&!/slip|share/.test(text))track('match_opened',entityFrom(el));
    },{passive:true});
  }
  function bindSearchAndFilters(){
    document.addEventListener('input',event=>{
      const el=event.target;
      if(!el||!el.matches('input[type="search"],input[placeholder*="Search" i],input[placeholder*="team" i]'))return;
      const value=clean(el.value,80);const now=Date.now();
      if(value.length<2||value===lastSearchValue||now-lastSearchAt<900)return;
      lastSearchValue=value;lastSearchAt=now;
      clearTimeout(el.__p2uAnalyticsTimer);
      el.__p2uAnalyticsTimer=setTimeout(()=>track('search_used',{count:value.length}),700);
    },{passive:true});
    document.addEventListener('change',event=>{
      const el=event.target;if(!el)return;
      if(el.matches('select,[data-filter],input[type="checkbox"]'))track('filter_changed',{name:clean(el.name||el.id||elementText(el),80),value:clean(el.value||String(el.checked),80)});
    },{passive:true});
  }
  function bindProductEvents(){
    const map={
      'p2u:share-completed':['share_completed',{}],
      'p2u:community-posted':['community_posted',{}],
      'p2u:follow-changed':['follow_changed',{}],
      'p2u:push-enabled':['push_enabled',{}],
      'p2u:account-synced':['account_sync',{}],
      'appinstalled':['install_completed',{}]
    };
    for(const [eventName,[analyticsName,base]] of Object.entries(map))window.addEventListener(eventName,event=>track(analyticsName,Object.assign({},base,event&&event.detail||{})),{passive:true});
    window.addEventListener('error',event=>track('client_error',{reason:clean(event.message,120),source:clean(event.filename&&event.filename.split('/').pop(),80)}));
    window.addEventListener('unhandledrejection',event=>track('client_error',{reason:clean(event.reason&&event.reason.message||event.reason,120),source:'promise'}));
  }
  function observeVitals(){
    if(!('PerformanceObserver' in window))return;
    try{
      new PerformanceObserver(list=>{
        for(const entry of list.getEntries()){
          if(entry.name==='first-contentful-paint'){
            vitals.fcp=entry.startTime;
            track('web_vital',{name:'FCP',value:entry.startTime,rating:entry.startTime<=1800?'good':entry.startTime<=3000?'needs-improvement':'poor'});
          }
        }
      }).observe({type:'paint',buffered:true});
    }catch(_){}
    try{
      new PerformanceObserver(list=>{
        for(const entry of list.getEntries())vitals.lcp=Math.max(vitals.lcp,entry.startTime);
      }).observe({type:'largest-contentful-paint',buffered:true});
    }catch(_){}
    try{
      new PerformanceObserver(list=>{
        for(const entry of list.getEntries())if(!entry.hadRecentInput)vitals.cls+=entry.value;
      }).observe({type:'layout-shift',buffered:true});
    }catch(_){}
    try{
      new PerformanceObserver(list=>{
        for(const entry of list.getEntries())vitals.inp=Math.max(vitals.inp,entry.duration||0);
      }).observe({type:'event',buffered:true,durationThreshold:40});
    }catch(_){}
    const report=()=>{
      if(vitals.lcp)track('web_vital',{name:'LCP',value:vitals.lcp,rating:vitals.lcp<=2500?'good':vitals.lcp<=4000?'needs-improvement':'poor'});
      track('web_vital',{name:'CLS',value:vitals.cls,rating:vitals.cls<=0.1?'good':vitals.cls<=0.25?'needs-improvement':'poor'});
      if(vitals.inp)track('web_vital',{name:'INP',value:vitals.inp,rating:vitals.inp<=200?'good':vitals.inp<=500?'needs-improvement':'poor'});
    };
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')report()},{once:true});
  }

  function injectConsent(){
    if(document.getElementById('p2u-analytics-consent'))return;
    const root=document.createElement('div');root.id='p2u-analytics-consent';root.className='p2u-analytics-consent';root.setAttribute('role','dialog');root.setAttribute('aria-label','Analytics privacy choice');
    root.innerHTML='<div><strong>Help improve Predict2U</strong><p>Share anonymous usage and speed data. No advertising IDs, payment details, or bookmaker information.</p></div><div class="p2u-analytics-actions"><button type="button" data-analytics-allow>Allow analytics</button><button type="button" class="secondary" data-analytics-decline>Not now</button><a href="privacy.html#analytics">Learn more</a></div>';
    document.body.appendChild(root);
    root.querySelector('[data-analytics-allow]').addEventListener('click',()=>setConsent('accepted'));
    root.querySelector('[data-analytics-decline]').addEventListener('click',()=>setConsent('declined'));
  }
  function injectPrivacyButton(){
    if(document.getElementById('p2u-analytics-privacy-button'))return;
    const button=document.createElement('button');button.id='p2u-analytics-privacy-button';button.className='p2u-analytics-privacy-button';button.type='button';button.textContent='Privacy';button.setAttribute('aria-label','Analytics privacy settings');
    button.addEventListener('click',()=>{consent='unset';localStorage.removeItem(CONSENT_KEY);updateConsentUi();injectConsent()});
    document.body.appendChild(button);
  }
  function injectAccountSettings(){
    if(!/(?:^|\/)account\.html$/i.test(location.pathname)||document.getElementById('p2u-analytics-account-card'))return;
    const anchor=document.querySelector('#p2u-account-page-root');if(!anchor)return;
    const card=document.createElement('section');card.id='p2u-analytics-account-card';card.className='p2u-analytics-account-card';
    card.innerHTML='<div><span class="p2u-analytics-kicker">Privacy</span><h2>Product analytics</h2><p>Predict2U can collect anonymous page, feature and performance events to improve the app. It does not store raw IP addresses, payment information, bookmaker credentials or advertising IDs.</p></div><div class="p2u-analytics-account-actions"><span id="p2u-analytics-account-state"></span><button type="button" data-analytics-account-allow>Allow</button><button type="button" class="secondary" data-analytics-account-decline>Disable</button></div>';
    anchor.insertAdjacentElement('afterend',card);
    card.querySelector('[data-analytics-account-allow]').addEventListener('click',()=>setConsent('accepted'));
    card.querySelector('[data-analytics-account-decline]').addEventListener('click',()=>setConsent('declined'));
    updateConsentUi();
  }
  function updateConsentUi(){
    const dialog=document.getElementById('p2u-analytics-consent');if(dialog)dialog.classList.toggle('is-visible',consent==='unset'&&!privacySignal());
    const state=document.getElementById('p2u-analytics-account-state');if(state){state.textContent=privacySignal()?'Disabled by browser privacy signal':consent==='accepted'?'Enabled':consent==='declined'?'Disabled':'Not selected';state.dataset.state=consent}
  }

  function init(){
    if(ready)return;ready=true;loadQueue();document.documentElement.dataset.p2uAnalyticsConsent=consent;
    injectPrivacyButton();injectConsent();injectAccountSettings();
    const observer=new MutationObserver(()=>injectAccountSettings());observer.observe(document.body,{childList:true,subtree:true});
    bindClicks();bindSearchAndFilters();bindProductEvents();observeVitals();updateConsentUi();
    if(consent==='accepted')track('page_view',{source:'load'});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){track('navigation',{action:'page_hidden',value:Math.round(performance.now()-pageStarted)});flush()}},{passive:true});
    window.addEventListener('pagehide',()=>flush(),{passive:true});
    document.documentElement.dataset.p2uAnalyticsReady='true';
    window.dispatchEvent(new CustomEvent('p2u:analytics-ready',{detail:{version:VERSION,consent}}));
  }

  window.P2UAnalytics={version:VERSION,track,flush,setConsent,getConsent:()=>consent,getSessionId:()=>sessionId,isReady:()=>ready};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
