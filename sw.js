/* Predict2U service worker v207 — fast core install, bounded caches,
   native-install support, exact push deep links and recoverable offline navigation. */
const VERSION='v207';
const CACHE_VERSION='predict2u-v207';
const APP_CACHE=CACHE_VERSION;
const RUNTIME_CACHE='predict2u-runtime-v207';
const IMAGE_CACHE='predict2u-images-v207';
const IMAGE_LIMIT=90;
const RUNTIME_LIMIT=90;
const NETWORK_TIMEOUT=2800;
const NETWORK_TIMEOUT_MS=NETWORK_TIMEOUT;
const OFFLINE_URL='./offline.html';

// Keep install light. Other pages are cached only after they are opened or quietly prefetched.
const CORE_SHELL=[
  './','./index.html','./board.html','./offline.html','./manifest.webmanifest',
  './pwa-launch.js','./pwa-launch.css','./mobile-app-nav.js','./mobile-app-nav.css','./device-responsive-v207.css',
  './predict2u-logo.png','./predict2u-mark.png','./favicon.ico',
  './icon-192.png','./icon-512.png','./maskable-icon.png'
];

// Listed for release validation and optional idle prefetch. These do not block install.
const OPTIONAL_SHELL=[
  './performance-freshness.js','./performance-freshness.css',
  './personalization.js','./personalization.css',
  './smart-alerts.js','./smart-alerts.css',
  './admin.html','./backend-admin.js','./backend-admin.css','./admin-config.js',
  './site-controls.js','./site-controls.css','./account.html','./profile.html',
  './cloud-config.js','./account-cloud.js','./account-cloud.css',
  './push-notifications.js','./push-notifications.css',
  './analytics.js','./analytics.css','./product-analytics.js','./product-analytics.css'
];

const ok=response=>response&&(response.ok||response.type==='opaque');
const sameOrigin=url=>url.origin===self.location.origin;
const refreshedStatic=new Set();
let imageWrites=0;
let runtimeWrites=0;

function canonical(request){
  const url=new URL(request.url);
  url.search='';
  return new Request(url.href,{
    method:'GET',
    headers:request.headers,
    credentials:request.credentials,
    mode:request.mode==='navigate'?'same-origin':request.mode,
    redirect:request.redirect
  });
}
const canonicalRequest=canonical;

async function timeoutFetch(request,ms=NETWORK_TIMEOUT){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(request,{signal:controller.signal});}
  finally{clearTimeout(timer);}
}

async function trim(cache,limit){
  const keys=await cache.keys();
  if(keys.length>limit){
    await Promise.all(keys.slice(0,keys.length-limit).map(key=>cache.delete(key)));
  }
}

async function cacheCore(){
  const cache=await caches.open(APP_CACHE);
  for(const url of CORE_SHELL){
    try{
      const response=await fetch(url,{cache:'reload'});
      if(ok(response))await cache.put(url,response);
    }catch(_){/* A partial shell is still usable. */}
  }
}

self.addEventListener('install',event=>{
  event.waitUntil(cacheCore());
  self.skipWaiting();
});

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys
    .filter(key=>key.startsWith('predict2u-')&&![APP_CACHE,RUNTIME_CACHE,IMAGE_CACHE].includes(key))
    .map(key=>caches.delete(key)));
  if(self.registration.navigationPreload)await self.registration.navigationPreload.enable();
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage({type:'P2U_SW_ACTIVE',version:VERSION}));
})()));

async function navigation(request,preload){
  const cache=await caches.open(APP_CACHE);
  const key=canonical(request);
  try{
    const response=preload||await timeoutFetch(request);
    if(ok(response))await cache.put(key,response.clone());
    return response;
  }catch(_){
    return await cache.match(key,{ignoreSearch:true})
      ||await cache.match(OFFLINE_URL)
      ||new Response('Offline',{status:503,headers:{'Content-Type':'text/plain'}});
  }
}

async function networkFirst(request){
  const cache=await caches.open(RUNTIME_CACHE);
  const key=canonical(request);
  try{
    const response=await timeoutFetch(request);
    if(ok(response)){
      await cache.put(key,response.clone());
      runtimeWrites+=1;
      if(runtimeWrites%20===0)await trim(cache,RUNTIME_LIMIT);
    }
    return response;
  }catch(_){
    return await cache.match(key,{ignoreSearch:true})
      ||new Response('Temporarily unavailable',{status:503,headers:{'Content-Type':'text/plain'}});
  }
}

async function updateStatic(request,cache,key){
  try{
    const response=await fetch(request);
    if(ok(response)){
      await cache.put(key,response.clone());
      runtimeWrites+=1;
      if(runtimeWrites%20===0)await trim(cache,RUNTIME_LIMIT);
    }
  }catch(_){/* cached response remains */}
}

async function staticAsset(request,event){
  const cache=await caches.open(RUNTIME_CACHE);
  const key=canonical(request);
  const cached=await cache.match(key,{ignoreSearch:true});
  const refreshKey=key.url;
  if(cached){
    if(!refreshedStatic.has(refreshKey)){
      refreshedStatic.add(refreshKey);
      event.waitUntil(updateStatic(request,cache,key));
    }
    return cached;
  }
  try{
    const response=await fetch(request);
    if(ok(response))await cache.put(key,response.clone());
    return response;
  }catch(_){
    return new Response('',{status:504});
  }
}

async function imageResponse(request){
  const cache=await caches.open(IMAGE_CACHE);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  try{
    const url=new URL(request.url);
    const response=await fetch(request,{
      mode:sameOrigin(url)?request.mode:'no-cors',
      credentials:sameOrigin(url)?request.credentials:'omit'
    });
    if(ok(response)){
      await cache.put(request,response.clone());
      imageWrites+=1;
      if(imageWrites%12===0)await trim(cache,IMAGE_LIMIT);
    }
    return response;
  }catch(_){
    return new Response('',{status:504});
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET')return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>navigation(request,await event.preloadResponse))());
    return;
  }

  if(request.destination==='image'){
    event.respondWith(imageResponse(request));
    return;
  }

  if(!sameOrigin(url))return;

  if(/(?:data\.js|site-health\.json|push-event-snapshot\.json|engine-learning-report\.json|model-governance-report\.json|engine-consensus-report\.json|match-context-report\.json)$/.test(url.pathname)){
    event.respondWith(networkFirst(request));
    return;
  }

  if(['script','style','font','worker'].includes(request.destination)||/\.(?:js|css|woff2?|json|webmanifest)$/.test(url.pathname)){
    event.respondWith(staticAsset(request,event));
    return;
  }

  event.respondWith(staticAsset(request,event));
});

async function clearRuntime(){
  await Promise.all([caches.delete(RUNTIME_CACHE),caches.delete(IMAGE_CACHE)]);
  refreshedStatic.clear();
}

async function prefetch(urls){
  const cache=await caches.open(APP_CACHE);
  for(const raw of urls.slice(0,3)){
    try{
      const url=new URL(raw,self.location.origin);
      if(!sameOrigin(url))continue;
      const request=new Request(url.href,{credentials:'same-origin'});
      const response=await fetch(request);
      if(ok(response))await cache.put(canonical(request),response);
    }catch(_){/* best effort only */}
  }
}

self.addEventListener('message',event=>{
  const data=event.data;
  if(data==='SKIP_WAITING'){self.skipWaiting();return;}
  if(data&&data.type==='GET_VERSION'){
    if(event.ports&&event.ports[0])event.ports[0].postMessage({version:VERSION,cache:APP_CACHE});
    return;
  }
  if(data&&data.type==='PREFETCH_URLS'&&Array.isArray(data.urls)){
    event.waitUntil(prefetch(data.urls));
    return;
  }
  if(data&&data.type==='CLEAR_RUNTIME_CACHES'){
    event.waitUntil(clearRuntime());
  }
});

async function notifyClients(type,detail={}){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage(Object.assign({type},detail)));
  return clients;
}

self.addEventListener('sync',event=>{
  if(event.tag!=='p2u-sync-outbox')return;
  event.waitUntil((async()=>{
    const clients=await notifyClients('P2U_FLUSH_OUTBOX',{version:VERSION});
    if(!clients.length){
      await self.registration.showNotification('Predict2U is ready to sync',{
        body:'Open the app to finish your saved offline changes.',
        icon:'./icon-192.png',
        badge:'./favicon-48x48.png',
        tag:'p2u-sync-ready',
        data:{url:'./account.html'}
      });
    }
  })());
});

self.addEventListener('periodicsync',event=>{
  if(event.tag==='p2u-refresh-shell')event.waitUntil(cacheCore());
});

self.addEventListener('push',event=>event.waitUntil((async()=>{
  let payload={};
  try{payload=event.data?event.data.json():{};}
  catch(_){try{payload={body:event.data?event.data.text():''};}catch(__){}}
  const reason=payload.data&&payload.data.reason?String(payload.data.reason):'';
  const data=Object.assign({},payload.data||{}, {
    url:payload.url||(payload.data&&payload.data.url)||'./index.html',
    category:payload.category||'system',
    pushId:payload.id||''
  });
  await self.registration.showNotification(String(payload.title||'Predict2U update').slice(0,100),{
    body:(String(payload.body||'')+(reason?' • '+reason:'')).slice(0,240),
    icon:payload.icon||'./icon-192.png',
    badge:payload.badge||'./favicon-48x48.png',
    tag:payload.id||'p2u-'+(payload.category||'system'),
    renotify:false,
    requireInteraction:payload.category==='match',
    data,
    actions:[{action:'open',title:'Open Predict2U'}]
  });
  await notifyClients('P2U_PUSH_RECEIVED',{payload:Object.assign({},payload,{data})});
})()));

function targetURL(raw){
  try{
    const url=new URL(raw||'./index.html',self.location.origin);
    return sameOrigin(url)?url.href:new URL('./index.html',self.location.origin).href;
  }catch(_){
    return new URL('./index.html',self.location.origin).href;
  }
}

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=targetURL(event.notification.data&&event.notification.data.url);
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('navigate'in client)await client.navigate(url);
      if('focus'in client)return client.focus();
    }
    return self.clients.openWindow?self.clients.openWindow(url):null;
  })());
});

self.addEventListener('notificationclose',event=>{
  const data=event.notification&&event.notification.data||{};
  event.waitUntil(notifyClients('P2U_PUSH_CLOSED',{id:data.pushId||'',category:data.category||'system'}));
});
