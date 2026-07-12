/* Predict2U v198 — lightweight client reliability guard.
   Stores only sanitized error summaries in sessionStorage; no private data is transmitted. */
(function(){
  'use strict';
  const VERSION='v198',KEY='p2u-runtime-errors-v198',MAX=20;
  const sanitize=v=>String(v||'Unknown error').replace(/https?:\/\/[^\s]+/g,'[url]').replace(/[A-Za-z0-9_-]{40,}/g,'[redacted]').slice(0,240);
  function read(){try{const v=JSON.parse(sessionStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch(_){return[]}}
  function record(type,message){try{const rows=read();rows.unshift({type,message:sanitize(message),page:location.pathname.split('/').pop()||'index.html',at:new Date().toISOString()});sessionStorage.setItem(KEY,JSON.stringify(rows.slice(0,MAX)));}catch(_){}}
  function status(text,type){let el=document.getElementById('p2u-runtime-status');if(!el){el=document.createElement('div');el.id='p2u-runtime-status';el.setAttribute('role','status');el.style.cssText='position:fixed;left:12px;right:12px;bottom:84px;z-index:99999;display:none;max-width:620px;margin:auto;padding:11px 14px;border-radius:12px;font:700 12px/1.4 system-ui;background:#111821;color:#fff;border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 30px rgba(0,0,0,.35)';document.body.appendChild(el);}el.textContent=text;el.style.display='block';el.style.borderColor=type==='bad'?'rgba(255,102,122,.45)':'rgba(119,196,28,.45)';clearTimeout(status.timer);status.timer=setTimeout(()=>el.style.display='none',3500);}
  window.addEventListener('error',e=>record('error',e.message||e.error&&e.error.message));
  window.addEventListener('unhandledrejection',e=>record('promise',e.reason&&e.reason.message||e.reason));
  window.addEventListener('offline',()=>status('You are offline. Saved content will remain available where possible.','bad'));
  window.addEventListener('online',()=>status('Connection restored. Live content is refreshing.','good'));
  window.P2UReliability={version:VERSION,getRecent:read,clear:()=>{try{sessionStorage.removeItem(KEY)}catch(_){}}};
})();
