/* Predict2U v166 — quiet freshness display, in-place board updates and fallbacks. */
(function(){
  "use strict";

  const VERSION="v166";
  const DATA_FILE="data.js";
  const LIVE=new Set(["1H","HT","2H","ET","BT","P","LIVE"]);
  const DATA_PAGE=/(?:^|\/)(?:index|board|engines|proof|scorecards|league-dna|trust)\.html$/i.test(location.pathname)||location.pathname==="/"||location.pathname==="";
  let currentStamp=Math.max(Date.parse(window.DATA_UPDATED||"")||0,Date.parse(window.SCORES_UPDATED||"")||0);
  let checking=false;
  let timer=null;
  let ui=null;

  const hasBoard=()=>Boolean(document.getElementById("cards"));
  const matches=()=>Array.isArray(window.MATCHES)?window.MATCHES:[];
  const isLiveWindow=()=>matches().some(m=>LIVE.has(String(m&&m.status||"").toUpperCase()));

  function ageLabel(ts){
    if(!ts)return"Update time unavailable";
    const mins=Math.max(0,Math.round((Date.now()-ts)/60000));
    if(mins<1)return"Updated just now";
    if(mins<60)return`Updated ${mins} min ago`;
    const hrs=Math.round(mins/60);
    if(hrs<48)return`Updated ${hrs} hr${hrs===1?"":"s"} ago`;
    const days=Math.round(hrs/24);
    return`Updated ${days} day${days===1?"":"s"} ago`;
  }

  function stateFor(ts){
    if(!navigator.onLine)return"offline";
    if(!ts)return"unavailable";
    const age=Date.now()-ts;
    if(age>12*3600000)return"aging";
    return"fresh";
  }

  function createUi(){
    if(!DATA_PAGE)return null;
    if(ui)return ui;
    const anchor=document.getElementById("board-sub")||document.querySelector("main h1, main h2, header h1, header h2");
    if(!anchor)return null;
    const el=document.createElement("div");
    el.id="p2u-freshness-line";
    el.setAttribute("role","status");
    el.setAttribute("aria-live","polite");
    el.innerHTML='<span class="p2u-fresh-dot" aria-hidden="true"></span><span class="p2u-fresh-text">Checking latest update…</span>';
    anchor.insertAdjacentElement("afterend",el);
    ui=el;
    return el;
  }

  function render(message,state,action){
    const el=createUi();
    if(!el)return;
    el.dataset.state=state||stateFor(currentStamp);
    const text=el.querySelector(".p2u-fresh-text");
    if(text)text.textContent=message||ageLabel(currentStamp);
    const old=el.querySelector("button");
    if(old)old.remove();
    if(action){
      const btn=document.createElement("button");
      btn.type="button";
      btn.textContent=action.label;
      btn.addEventListener("click",action.onClick,{once:true});
      el.appendChild(btn);
    }
  }

  function parseStamp(text){
    const values=[];
    for(const key of ["DATA_UPDATED","SCORES_UPDATED"]){
      const re=new RegExp(`window\\.${key}\\s*=\\s*["']([^"']+)["']`);
      const m=text.match(re);
      const n=m?Date.parse(m[1]):0;
      if(n)values.push(n);
    }
    return values.length?Math.max(...values):0;
  }

  function reloadDataScript(){
    return new Promise((resolve,reject)=>{
      const s=document.createElement("script");
      s.src=`${DATA_FILE}?refresh=${Date.now()}`;
      s.async=true;
      s.onload=()=>{s.remove();resolve();};
      s.onerror=()=>{s.remove();reject(new Error("data refresh failed"));};
      document.head.appendChild(s);
    });
  }

  async function applyUpdate(nextStamp){
    render("Applying fresh data…","updating");
    try{
      await reloadDataScript();
      currentStamp=Math.max(nextStamp,Date.parse(window.DATA_UPDATED||"")||0,Date.parse(window.SCORES_UPDATED||"")||0);
      if(typeof window.P2UBoardRefresh==="function"){
        window.P2UBoardRefresh({source:"auto",updatedAt:currentStamp});
        render(`${ageLabel(currentStamp)} · board refreshed`,"fresh");
      }else{
        render("Fresh data is ready","fresh",{label:"Refresh page",onClick:()=>location.reload()});
      }
      window.dispatchEvent(new CustomEvent("p2u:data-updated",{detail:{updatedAt:currentStamp,version:VERSION}}));
    }catch(_){
      render("Could not apply the latest data","unavailable",{label:"Retry",onClick:checkNow});
    }
  }

  async function checkNow(){
    if(checking||document.hidden)return;
    checking=true;
    render("Checking for fresh data…","updating");
    try{
      const response=await fetch(`${DATA_FILE}?check=${Date.now()}`,{cache:"no-store"});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const text=await response.text();
      const next=parseStamp(text);
      if(next&&next>currentStamp+1000){
        await applyUpdate(next);
      }else{
        render(ageLabel(currentStamp),stateFor(currentStamp));
      }
    }catch(_){
      render(navigator.onLine?ageLabel(currentStamp):"Offline · showing saved data",navigator.onLine?stateFor(currentStamp):"offline");
    }finally{
      checking=false;
      schedule();
    }
  }

  function schedule(){
    clearTimeout(timer);
    const delay=isLiveWindow()?90000:300000;
    timer=setTimeout(checkNow,delay);
  }

  function fallbackIfNeeded(){
    document.documentElement.classList.remove("p2u-booting");
    if(!hasBoard())return;
    const cards=document.getElementById("cards");
    if(!cards||cards.children.length||matches().length)return;
    cards.innerHTML='<div class="p2u-data-fallback"><strong>Board data is temporarily unavailable</strong><span>The page is working, but the latest fixture file could not be loaded.</span><br><button type="button">Try again</button></div>';
    const btn=cards.querySelector("button");
    if(btn)btn.addEventListener("click",()=>location.reload());
  }

  function warmLikelyPages(){
    if(!("serviceWorker" in navigator))return;
    const urls=[...document.querySelectorAll("nav a[href],footer a[href]")]
      .map(a=>a.getAttribute("href"))
      .filter(h=>h&&/^[a-z0-9-]+\.html(?:[?#].*)?$/i.test(h))
      .map(h=>new URL(h,location.href).href)
      .filter((h,i,a)=>a.indexOf(h)===i)
      .slice(0,8);
    if(!urls.length)return;
    navigator.serviceWorker.ready.then(reg=>{
      const worker=reg.active||navigator.serviceWorker.controller;
      if(worker)worker.postMessage({type:"PREFETCH_URLS",urls});
    }).catch(()=>{});
  }

  function init(){
    createUi();
    render(ageLabel(currentStamp),stateFor(currentStamp));
    requestAnimationFrame(()=>requestAnimationFrame(fallbackIfNeeded));
    schedule();
    (window.requestIdleCallback||(f=>setTimeout(f,1200)))(warmLikelyPages);

    window.addEventListener("online",()=>{render(ageLabel(currentStamp),stateFor(currentStamp));checkNow();});
    window.addEventListener("offline",()=>render("Offline · showing saved data","offline"));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkNow();});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
