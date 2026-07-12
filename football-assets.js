/* Predict2U v184 — football crests, country flags and lightweight runtime decoration. */
(()=>{
  "use strict";
  const TEAM_SELECTORS=[
    "[data-team]","[data-home]","[data-away]",".p2u-card-teams",".match-title",".team-name",
    ".slip-team",".slip-teams",".community-pick-team",".community-pick-title",".fixture-title",
    "article h2","article h3","article h4",".card h2",".card h3",".card h4",".slip-card strong"
  ].join(",");
  const LEAGUE_SELECTORS=[
    "[data-league]",".league",".league-name",".competition",".competition-name",".match-league",
    ".p2u-card-meta",".slip-meta",".community-pick-meta","article .sub",".card .sub",".slip-card .sub"
  ].join(",");
  const COUNTRY_CODES={
    "argentina":"AR","australia":"AU","austria":"AT","belgium":"BE","bolivia":"BO","brazil":"BR",
    "bulgaria":"BG","canada":"CA","chile":"CL","china":"CN","colombia":"CO","croatia":"HR",
    "cyprus":"CY","czech republic":"CZ","czechia":"CZ","denmark":"DK","ecuador":"EC","egypt":"EG",
    "england":"GB","finland":"FI","france":"FR","germany":"DE","ghana":"GH","greece":"GR",
    "hungary":"HU","iceland":"IS","india":"IN","indonesia":"ID","ireland":"IE","israel":"IL",
    "italy":"IT","japan":"JP","mexico":"MX","morocco":"MA","netherlands":"NL","new zealand":"NZ",
    "nigeria":"NG","north ireland":"GB","norway":"NO","paraguay":"PY","peru":"PE","poland":"PL",
    "portugal":"PT","romania":"RO","russia":"RU","saudi arabia":"SA","scotland":"GB","serbia":"RS",
    "slovakia":"SK","slovenia":"SI","south africa":"ZA","south korea":"KR","spain":"ES","sweden":"SE",
    "switzerland":"CH","turkey":"TR","türkiye":"TR","ukraine":"UA","uruguay":"UY","usa":"US",
    "united states":"US","venezuela":"VE","wales":"GB"
  };
  let teamIndex=new Map(),leagueIndex=new Map(),teamNames=[];
  let observer=null,queued=false,roots=new Set();
  const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
  const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const initials=name=>String(name||"?").split(/\s+/).filter(Boolean).slice(0,3).map(x=>x[0]).join("").toUpperCase().slice(0,3)||"?";
  const emojiFlag=country=>{
    const code=COUNTRY_CODES[norm(country)];
    return code?String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0))):"🌐";
  };
  function addTeam(name,logo){
    const key=norm(name); if(!key)return;
    const existing=teamIndex.get(key)||{name:String(name||""),logo:null};
    if(logo&&!existing.logo)existing.logo=String(logo);
    teamIndex.set(key,existing);
  }
  function addLeague(name,country,flag){
    const key=norm(name); if(!key)return;
    const existing=leagueIndex.get(key)||{name:String(name||""),country:String(country||""),flag:null};
    if(country&&!existing.country)existing.country=String(country);
    if(flag&&!existing.flag)existing.flag=String(flag);
    leagueIndex.set(key,existing);
  }
  function rebuild(){
    teamIndex=new Map();leagueIndex=new Map();
    const matches=Array.isArray(window.MATCHES)?window.MATCHES:[];
    for(const m of matches){
      if(!m||typeof m!=="object")continue;
      addTeam(m.home||m.homeTeam||m.teams?.home?.name,m.homeLogo||m.teams?.home?.logo);
      addTeam(m.away||m.awayTeam||m.teams?.away?.name,m.awayLogo||m.teams?.away?.logo);
      addLeague(m.league||m.competition||m.leagueName,m.country||m.leagueCountry,m.flag||m.leagueFlag);
    }
    teamNames=[...teamIndex.keys()].sort((a,b)=>b.length-a.length);
  }
  function image(src,cls,alt){
    const img=document.createElement("img");
    img.className=cls;img.src=src;img.alt=alt||"";img.loading="lazy";img.decoding="async";
    img.referrerPolicy="no-referrer";
    img.addEventListener("error",()=>{
      const fallback=document.createElement("span");
      fallback.className=cls.includes("league")?"p2u-flag-fallback":"p2u-crest-fallback";
      fallback.textContent=cls.includes("league")?"🌐":initials(alt);
      img.replaceWith(fallback);
    },{once:true});
    return img;
  }
  function teamVisual(team){
    return team.logo?image(team.logo,"p2u-team-crest",`${team.name} crest`):Object.assign(document.createElement("span"),{className:"p2u-crest-fallback",textContent:initials(team.name)});
  }
  function leagueVisual(league){
    if(league.flag)return image(league.flag,"p2u-league-flag",`${league.country||league.name} flag`);
    const span=document.createElement("span");span.className="p2u-flag-fallback";span.textContent=emojiFlag(league.country);return span;
  }
  function directText(el){
    let text="";
    for(const n of el.childNodes)if(n.nodeType===Node.TEXT_NODE)text+=` ${n.nodeValue||""}`;
    return text.trim()||el.textContent.trim();
  }
  function existingAsset(el,src){
    return [...el.querySelectorAll("img")].some(img=>src&&img.src===new URL(src,location.href).href)||el.dataset.p2uIdentity==="1";
  }
  function prependVisual(el,visual,pair=false){
    const wrap=document.createElement("span");
    wrap.className=pair?"p2u-team-pair-prefix":"p2u-identity-prefix";
    wrap.setAttribute("aria-hidden","true");wrap.append(visual);
    el.insertBefore(wrap,el.firstChild);el.dataset.p2uIdentity="1";el.classList.add("p2u-identity-decorated");
  }
  function decorateTeam(el){
    if(!el||el.dataset.p2uIdentity==="1"||el.closest("script,style,template,select,option,textarea"))return;
    const raw=directText(el);if(!raw||raw.length>180)return;
    const text=norm(raw);if(!text)return;
    const exact=teamIndex.get(text);
    if(exact){if(!existingAsset(el,exact.logo))prependVisual(el,teamVisual(exact));return;}
    const found=[];
    for(const name of teamNames){
      if(name.length<4)continue;
      if((` ${text} `).includes(` ${name} `)){found.push(teamIndex.get(name));if(found.length===2)break;}
    }
    if(found.length){
      const wrap=document.createElement("span");wrap.className="p2u-team-pair-prefix";wrap.setAttribute("aria-hidden","true");
      for(const t of found)wrap.append(teamVisual(t));
      el.insertBefore(wrap,el.firstChild);el.dataset.p2uIdentity="1";el.classList.add("p2u-identity-decorated");
    }
  }
  function decorateLeague(el){
    if(!el||el.dataset.p2uLeagueIdentity==="1"||el.closest("script,style,template,select,option,textarea"))return;
    const raw=directText(el);if(!raw||raw.length>160)return;
    const text=norm(raw);if(!text)return;
    let league=leagueIndex.get(text);
    if(!league){
      for(const [key,val] of leagueIndex){if(key.length>3&&(` ${text} `).includes(` ${key} `)){league=val;break;}}
    }
    if(!league)return;
    if(el.querySelector("img.lflag,img.p2u-league-flag")){el.dataset.p2uLeagueIdentity="1";return;}
    const wrap=document.createElement("span");wrap.className="p2u-identity-prefix";wrap.setAttribute("aria-hidden","true");wrap.append(leagueVisual(league));
    el.insertBefore(wrap,el.firstChild);el.dataset.p2uLeagueIdentity="1";el.classList.add("p2u-identity-decorated");
  }
  function scan(root=document){
    if(!teamIndex.size&&!leagueIndex.size)rebuild();
    let count=0;
    const teamEls=root.matches?.(TEAM_SELECTORS)?[root]:[...root.querySelectorAll?.(TEAM_SELECTORS)||[]];
    for(const el of teamEls){decorateTeam(el);if(++count>700)break;}
    count=0;
    const leagueEls=root.matches?.(LEAGUE_SELECTORS)?[root]:[...root.querySelectorAll?.(LEAGUE_SELECTORS)||[]];
    for(const el of leagueEls){decorateLeague(el);if(++count>700)break;}
    document.documentElement.dataset.p2uFootballAssets="ready";
    window.dispatchEvent(new CustomEvent("p2u:football-assets-ready",{detail:{teams:teamIndex.size,leagues:leagueIndex.size}}));
  }
  function schedule(root=document){
    roots.add(root);if(queued)return;queued=true;
    const run=()=>{queued=false;const work=[...roots];roots.clear();for(const r of work)scan(r)};
    (window.requestIdleCallback||((fn)=>setTimeout(fn,80)))(run,{timeout:500});
  }
  function start(){
    rebuild();schedule(document);
    observer=new MutationObserver(list=>{
      for(const m of list)for(const n of m.addedNodes)if(n.nodeType===Node.ELEMENT_NODE)schedule(n);
    });
    observer.observe(document.body,{childList:true,subtree:true});
    for(const evt of ["P2U_DATA_REFRESHED","P2U_COMMUNITY_UPDATED","p2u:board-refreshed","p2u:community-updated"]){
      window.addEventListener(evt,()=>{rebuild();schedule(document)});
    }
    const carousel=document.querySelector(".cara");
    if(carousel){
      const pause=()=>carousel.dataset.paused="true",resume=()=>delete carousel.dataset.paused;
      carousel.addEventListener("pointerdown",pause,{passive:true});carousel.addEventListener("pointerup",resume,{passive:true});carousel.addEventListener("pointercancel",resume,{passive:true});
    }
  }
  window.P2UFootballAssets={rebuild,decorate:()=>schedule(document),team:name=>teamIndex.get(norm(name))||null,league:name=>leagueIndex.get(norm(name))||null};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
