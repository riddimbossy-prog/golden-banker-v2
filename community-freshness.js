/* Predict2U v177 — Community Freshness Guard
   Keeps community consensus limited to today's active fixtures. */
(function(){
  "use strict";

  const VERSION="v177";
  const FINAL=new Set(["FT","AET","PEN","CANC","CANCELLED","POSTP","POSTPONED","ABD","AWD"]);
  const hostId="top-picks";
  let observer=null;
  let scheduled=false;

  const norm=v=>String(v==null?"":v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const localISO=d=>{
    const x=d instanceof Date?d:new Date(d);
    if(Number.isNaN(x.getTime()))return"";
    const y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,"0"),day=String(x.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };
  const today=()=>localISO(new Date());
  const matchDate=m=>String(m&&m.matchDate||"").slice(0,10)||localISO(m&&m.kickoff);
  const isActive=m=>!FINAL.has(String(m&&m.status||"").toUpperCase());
  const fixtures=()=>Array.isArray(window.MATCHES)?window.MATCHES:[];

  function fixtureKeys(){
    const t=today();
    const keys=new Set();
    for(const m of fixtures()){
      if(matchDate(m)!==t||!isActive(m))continue;
      const home=norm(m.home||m.homeTeam||m.home_name);
      const away=norm(m.away||m.awayTeam||m.away_name);
      if(home&&away){keys.add(`${home} v ${away}`);keys.add(`${away} v ${home}`);}
    }
    return keys;
  }

  function addMeta(host,visible,total){
    let meta=document.getElementById("p2u-community-freshness");
    if(!meta){
      meta=document.createElement("div");
      meta.id="p2u-community-freshness";
      meta.setAttribute("role","status");
      meta.setAttribute("aria-live","polite");
      host.parentElement&&host.parentElement.insertBefore(meta,host);
    }
    const now=new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    meta.innerHTML=`<span class="p2u-community-fresh-dot" aria-hidden="true"></span><strong>Today's Community Consensus</strong><span>${visible} current pick${visible===1?"":"s"}${total>visible?` · ${total-visible} expired removed`:""} · ${now}</span>`;
  }

  function cardText(card){
    const teamNode=card.querySelector(".t")||card;
    return norm(teamNode.textContent||"").replace(/\s+vs?\s+/g," v ");
  }

  function showEmpty(host){
    host.innerHTML='<div class="empty p2u-community-empty"><strong>No community picks yet today.</strong><span>Be the first to add a selection from today\'s board.</span><a href="index.html">Open today\'s board</a></div>';
  }

  function refresh(){
    scheduled=false;
    const host=document.getElementById(hostId);
    if(!host)return;
    const cards=[...host.querySelectorAll(":scope > .pick")];
    if(!cards.length){
      if(!/loading/i.test(host.textContent||"")&&!host.querySelector(".p2u-community-empty"))showEmpty(host);
      addMeta(host,0,0);
      return;
    }
    const keys=fixtureKeys();
    let visible=0;
    for(const card of cards){
      const text=cardText(card);
      const keep=[...keys].some(k=>text.includes(k)||k.includes(text));
      card.hidden=!keep;
      card.setAttribute("aria-hidden",keep?"false":"true");
      card.dataset.p2uCommunityDate=keep?today():"expired";
      if(keep)visible++;
    }
    if(!visible)showEmpty(host);
    else cards.filter(c=>!c.hidden).forEach((c,i)=>{const r=c.querySelector(".rank");if(r)r.textContent=String(i+1);});
    addMeta(host,visible,cards.length);
    document.documentElement.dataset.p2uCommunityFreshnessReady="true";
    window.dispatchEvent(new CustomEvent("p2u:community-freshness-ready",{detail:{version:VERSION,visible,total:cards.length,date:today()}}));
  }

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(refresh);}
  function init(){
    const host=document.getElementById(hostId);
    if(!host)return;
    observer=new MutationObserver(schedule);
    observer.observe(host,{childList:true,subtree:true,characterData:true});
    schedule();
    window.addEventListener("p2u:data-updated",schedule);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedule();});
    window.P2UCommunityFreshness={version:VERSION,refresh,today};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
