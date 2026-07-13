/* Predict2U v207 — native PWA install, lighter startup, update safety and offline recovery. */
(function(){
  'use strict';

  const VERSION='v218';
  const SW='sw.js';
  const DISMISS_KEY='p2u_app_prompt_dismissed_v202';
  const UPDATE_CHECK_KEY='p2u_sw_update_check_v202';
  const UPDATE_INTERVAL=6*60*60*1000;
  const IDB_NAME='p2u-app-v200'; // preserve the existing outbox database
  let deferredInstall=null;
  let registration=null;
  let reloading=false;
  let updateRequested=false;
  let hadController=Boolean(navigator.serviceWorker&&navigator.serviceWorker.controller);
  let nativeInstallReady=false;

  const $=(s,r=document)=>r.querySelector(s);
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const safeText=v=>String(v==null?'':v).slice(0,240);
  const cssEscape=v=>(window.CSS&&CSS.escape?CSS.escape(String(v)):String(v).replace(/[^a-zA-Z0-9_-]/g,'\\$&'));
  const idle=(fn,timeout=5000)=>(window.requestIdleCallback||((cb,opt)=>setTimeout(()=>cb({didTimeout:true,timeRemaining:()=>0}),Math.min((opt&&opt.timeout)||timeout,timeout))))(fn,{timeout});
  const connection=()=>navigator.connection||navigator.mozConnection||navigator.webkitConnection||{};
  const constrainedNetwork=()=>Boolean(connection().saveData)||/^(?:slow-2g|2g)$/i.test(connection().effectiveType||'');

  function setMode(){
    const installed=standalone();
    document.documentElement.classList.toggle('p2u-standalone',installed);
    document.documentElement.dataset.p2uAppMode=installed?'standalone':'browser';
  }

  function networkPill(){
    let el=$('.p2u-network-state');
    if(!el){
      el=document.createElement('div');
      el.className='p2u-network-state';
      el.setAttribute('role','status');
      el.setAttribute('aria-live','polite');
      document.body.appendChild(el);
    }
    return el;
  }

  function showNetwork(online){
    const el=networkPill();
    el.textContent=online?'Back online — syncing updates':'Offline mode — saved pages remain available';
    el.className='p2u-network-state is-show '+(online?'is-online':'is-offline');
    clearTimeout(el._t);
    el._t=setTimeout(()=>el.classList.remove('is-show'),online?2400:4800);
    document.documentElement.dataset.p2uOnline=online?'true':'false';
    window.dispatchEvent(new CustomEvent('p2u:network',{detail:{online}}));
    if(online)idle(()=>flushOutbox(),2200);
  }

  function appBanner({kind='info',title,copy,primary,secondary,onPrimary,onSecondary}){
    let el=$('.p2u-app-banner');
    if(!el){
      el=document.createElement('aside');
      el.className='p2u-app-banner';
      el.setAttribute('role','status');
      el.setAttribute('aria-live','polite');
      document.body.appendChild(el);
    }
    el.innerHTML='<div class="p2u-app-banner__icon" aria-hidden="true">P</div><div class="p2u-app-banner__copy"><strong></strong><span></span></div><div class="p2u-app-banner__actions"></div>';
    $('strong',el).textContent=safeText(title);
    $('span',el).textContent=safeText(copy);
    const actions=$('.p2u-app-banner__actions',el);
    if(primary){
      const b=document.createElement('button');
      b.type='button';b.dataset.primary='';b.textContent=primary;
      b.onclick=()=>{onPrimary&&onPrimary();};
      actions.appendChild(b);
    }
    if(secondary){
      const b=document.createElement('button');
      b.type='button';b.textContent=secondary;
      b.onclick=()=>{onSecondary?onSecondary():hideBanner();};
      actions.appendChild(b);
    }
    el.dataset.kind=kind;
    requestAnimationFrame(()=>el.classList.add('is-show'));
    return el;
  }

  function hideBanner(){const el=$('.p2u-app-banner');if(el)el.classList.remove('is-show');}

  function ensureInstallChip(label='Install app'){
    let chip=$('.p2u-install-chip');
    if(!chip){
      chip=document.createElement('button');
      chip.type='button';
      chip.className='p2u-install-chip';
      chip.dataset.p2uInstall='';
      document.body.appendChild(chip);
    }
    chip.textContent=label;
    chip.classList.add('is-ready');
    chip.hidden=false;
    return chip;
  }

  function hideInstallSurfaces(){
    hideBanner();
    const chip=$('.p2u-install-chip');
    if(chip){chip.classList.remove('is-ready');chip.hidden=true;}
  }

  function showIOSGuide(){
    let ov=$('.p2u-install-guide');
    if(!ov){
      ov=document.createElement('div');
      ov.className='p2u-install-guide';
      ov.innerHTML='<section class="p2u-install-guide__card" role="dialog" aria-modal="true" aria-labelledby="p2u-install-title"><h2 id="p2u-install-title">Add Predict2U to your Home Screen</h2><p>Apple does not allow websites to start the install automatically. In Safari:</p><ol><li>Tap the <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong>.</li></ol><button type="button">Done</button></section>';
      document.body.appendChild(ov);
      ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('button'))ov.classList.remove('is-open');});
    }
    ov.classList.add('is-open');
  }

  function showUnsupportedGuide(){
    let ov=$('.p2u-install-guide');
    if(!ov){
      ov=document.createElement('div');
      ov.className='p2u-install-guide';
      document.body.appendChild(ov);
    }
    ov.innerHTML='<section class="p2u-install-guide__card" role="dialog" aria-modal="true" aria-labelledby="p2u-install-title"><h2 id="p2u-install-title">Install Predict2U</h2><p>This browser has not provided its native install prompt. Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. Chrome or Edge on Android and desktop normally show the native confirmation when the Install button is available.</p><button type="button">Done</button></section>';
    if(!ov.dataset.bound){ov.dataset.bound='1';ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('button'))ov.classList.remove('is-open');});}
    ov.classList.add('is-open');
  }

  async function promptInstall(){
    if(standalone()){
      hideInstallSurfaces();
      window.dispatchEvent(new CustomEvent('p2u:installed-state'));
      return{outcome:'already-installed'};
    }

    if(deferredInstall){
      const event=deferredInstall;
      deferredInstall=null;
      nativeInstallReady=false;
      try{
        await event.prompt();
        const choice=await event.userChoice.catch(()=>({outcome:'dismissed',platform:''}));
        hideInstallSurfaces();
        window.dispatchEvent(new CustomEvent('p2u:install-choice',{detail:choice}));
        return choice;
      }catch(error){
        hideInstallSurfaces();
        return{outcome:'error',error:String(error&&error.message||error)};
      }
    }

    if(isIOS()){
      showIOSGuide();
      return{outcome:'instructions',platform:'ios'};
    }

    showUnsupportedGuide();
    return{outcome:'unavailable'};
  }

  function offerNativeInstall(){
    if(standalone()||sessionStorage.getItem(DISMISS_KEY)||!nativeInstallReady)return;
    ensureInstallChip('Install app');
    appBanner({
      kind:'install',
      title:'Install Predict2U',
      copy:'Tap Install to open the browser’s native app-install confirmation.',
      primary:'Install',
      secondary:'Not now',
      onPrimary:promptInstall,
      onSecondary:()=>{sessionStorage.setItem(DISMISS_KEY,'1');hideInstallSurfaces();}
    });
  }

  function offerIOSInstall(){
    if(!isIOS()||standalone()||sessionStorage.getItem(DISMISS_KEY))return;
    ensureInstallChip('Add to Home Screen');
  }

  function captureInstallPrompt(event){
    event.preventDefault();
    deferredInstall=event;
    nativeInstallReady=true;
    document.documentElement.dataset.p2uNativeInstall='ready';
    setTimeout(offerNativeInstall,350);
    window.dispatchEvent(new CustomEvent('p2u:native-install-ready'));
  }

  function announceUpdate(worker){
    appBanner({
      kind:'update',
      title:'A new Predict2U version is ready',
      copy:'Update now to load the newest Board, News and app improvements.',
      primary:'Update now',
      secondary:'Later',
      onPrimary:()=>{
        updateRequested=true;
        const target=worker||(registration&&registration.waiting);
        if(target)target.postMessage('SKIP_WAITING');
      }
    });
  }

  function shouldCheckForUpdate(){
    const last=Number(localStorage.getItem(UPDATE_CHECK_KEY)||0);
    if(Date.now()-last<UPDATE_INTERVAL)return false;
    try{localStorage.setItem(UPDATE_CHECK_KEY,String(Date.now()));}catch(_){}
    return true;
  }

  async function register(){
    if(!('serviceWorker'in navigator))return null;
    try{
      registration=await navigator.serviceWorker.register(SW,{scope:'./',updateViaCache:'none'});
      if(registration.waiting&&navigator.serviceWorker.controller)announceUpdate(registration.waiting);
      registration.addEventListener('updatefound',()=>{
        const nw=registration.installing;if(!nw)return;
        nw.addEventListener('statechange',()=>{if(nw.state==='installed'&&navigator.serviceWorker.controller)announceUpdate(nw);});
      });
      if(shouldCheckForUpdate())idle(()=>registration.update().catch(()=>{}),6000);
      return registration;
    }catch(err){
      console.warn('Predict2U app worker unavailable',err);
      return null;
    }
  }

  function sanitizeDeepLink(){
    const u=new URL(location.href);
    const allowed=['match','story','post','proof','tab'];
    const detail={};
    for(const key of allowed){const value=u.searchParams.get(key);if(value)detail[key]=value.slice(0,160);}
    if(Object.keys(detail).length){
      window.dispatchEvent(new CustomEvent('p2u:deep-link',{detail}));
      setTimeout(()=>{
        const id=detail.story||detail.post||detail.match;
        const escaped=cssEscape(id||'');
        const target=id&&document.querySelector(`[data-story-id="${escaped}"],[data-slip-id="${escaped}"],[data-p2u-match-key="${escaped}"],#${escaped}`);
        if(target)target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      },700);
    }
  }

  function warmPages(){
    if(!navigator.serviceWorker.controller||constrainedNetwork()||document.hidden)return;
    const current=location.pathname.split('/').pop()||'index.html';
    const map={
      'index.html':['board.html'],
      'board.html':['proof.html'],
      'news.html':['community.html'],
      'community.html':['news.html'],
      'proof.html':['board.html']
    };
    navigator.serviceWorker.controller.postMessage({type:'PREFETCH_URLS',urls:map[current]||[]});
  }

  function openDB(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(IDB_NAME,1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('outbox'))db.createObjectStore('outbox',{keyPath:'id'});};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function enqueue(action){
    const item={id:(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random()),kind:safeText(action&&action.kind||'action'),payload:action&&action.payload||{},createdAt:new Date().toISOString(),attempts:0};
    const db=await openDB();
    await new Promise((res,rej)=>{const tx=db.transaction('outbox','readwrite');tx.objectStore('outbox').put(item);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
    if(registration&&registration.sync)registration.sync.register('p2u-sync-outbox').catch(()=>{});
    window.dispatchEvent(new CustomEvent('p2u:outbox-queued',{detail:item}));
    return item;
  }

  async function readOutbox(){
    const db=await openDB();
    return new Promise((res,rej)=>{const tx=db.transaction('outbox','readonly');const req=tx.objectStore('outbox').getAll();req.onsuccess=()=>res(req.result||[]);req.onerror=()=>rej(req.error);});
  }

  async function removeOutbox(id){
    const db=await openDB();
    return new Promise((res,rej)=>{const tx=db.transaction('outbox','readwrite');tx.objectStore('outbox').delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
  }

  async function flushOutbox(){
    if(!navigator.onLine||document.hidden)return;
    const items=await readOutbox().catch(()=>[]);
    let completed=0;
    for(const item of items.slice(0,12)){
      let finish;
      const acknowledged=new Promise(resolve=>{finish=resolve;});
      window.dispatchEvent(new CustomEvent('p2u:offline-action',{detail:{item,complete:()=>finish(true)}}));
      const handled=await Promise.race([acknowledged,new Promise(resolve=>setTimeout(()=>resolve(false),6000))]);
      if(handled){await removeOutbox(item.id).catch(()=>{});completed+=1;}
    }
    if(items.length)window.dispatchEvent(new CustomEvent('p2u:outbox-flush',{detail:{count:items.length,completed}}));
  }

  async function setBadge(count){
    if(!('setAppBadge'in navigator))return false;
    try{if(Number(count)>0)await navigator.setAppBadge(Number(count));else if('clearAppBadge'in navigator)await navigator.clearAppBadge();return true;}catch(_){return false;}
  }

  function connectPushBadge(){
    let count=Number(localStorage.getItem('p2u_unread_push_v200')||0);
    idle(()=>setBadge(count),2500);
    navigator.serviceWorker&&navigator.serviceWorker.addEventListener('message',e=>{
      if(e.data&&e.data.type==='P2U_PUSH_RECEIVED'){
        count+=1;localStorage.setItem('p2u_unread_push_v200',String(count));setBadge(count);
      }
      if(e.data&&e.data.type==='P2U_FLUSH_OUTBOX')idle(()=>flushOutbox(),1000);
    });
    window.addEventListener('p2u:notifications-opened',()=>{count=0;localStorage.setItem('p2u_unread_push_v200','0');setBadge(0);});
  }

  function bindInstallButtons(){
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-p2u-install],.p2u-install-chip');
      if(!button)return;
      event.preventDefault();
      promptInstall();
    });
  }

  function exposeApi(){
    window.P2UPWA={
      version:VERSION,
      register,
      promptInstall,
      showIOSGuide,
      setBadge,
      enqueue,
      flushOutbox,
      getRegistration:()=>registration,
      isStandalone:standalone,
      hasNativePrompt:()=>Boolean(deferredInstall),
      clearRuntimeCaches:()=>navigator.serviceWorker.controller&&navigator.serviceWorker.controller.postMessage({type:'CLEAR_RUNTIME_CACHES'})
    };
  }

  function init(){
    setMode();
    bindInstallButtons();
    window.addEventListener('online',()=>showNetwork(true));
    window.addEventListener('offline',()=>showNetwork(false));
    window.addEventListener('beforeinstallprompt',captureInstallPrompt);
    window.addEventListener('appinstalled',()=>{
      hideInstallSurfaces();setMode();
      window.dispatchEvent(new CustomEvent('p2u:installed'));
    });
    navigator.serviceWorker&&navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(reloading)return;
      if(updateRequested||hadController){reloading=true;location.reload();}
      else hadController=true;
    });
    register().then(()=>{
      idle(warmPages,9000);
      idle(()=>flushOutbox(),4500);
    });
    sanitizeDeepLink();
    connectPushBadge();
    if(isIOS()&&!standalone()&&!sessionStorage.getItem(DISMISS_KEY))setTimeout(offerIOSInstall,1800);
    exposeApi();
    document.documentElement.dataset.p2uPwaReady='true';
    window.dispatchEvent(new CustomEvent('p2u:pwa-ready',{detail:{version:VERSION,standalone:standalone(),nativeInstall:nativeInstallReady}}));
  }

  exposeApi();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
