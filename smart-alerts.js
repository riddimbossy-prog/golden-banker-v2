/* Predict2U v168 Smart Alerts.
   Records and status notifications only. No wagering takes place on Predict2U. */
(function(){
  "use strict";

  const VERSION="v189";
  const STORE="p2u-smart-alerts-v168";
  const MATCH_STORE="p2u-smart-alerts-match-snapshot-v168";
  const COMMUNITY_STORE="p2u-smart-alerts-community-seen-v168";
  const MAX_ALERTS=80;
  const MAX_COMMUNITY_SEEN=240;
  const DAY=86400000;
  const defaults={
    enabled:true,
    browser:false,
    boardUpdates:true,
    matchStatus:true,
    favoriteLeagues:true,
    favoriteEngines:true,
    communityWins:true,
    footballNews:true,
    transferNews:true,
    followedUsers:false,
    verifiedOnly:false,
    trendingWins:true,
    paused:false,
    mutedUntil:0,
    tab:"all",
    view:"list",
    alerts:[]
  };

  let state=load();
  let mounted=false;
  let trigger=null;
  let backdrop=null;
  let panel=null;
  let communitySeen=readList(COMMUNITY_STORE);
  let initialCommunityScan=true;
  let observer=null;

  function safeParse(value,fallback){ try{return JSON.parse(value);}catch(_){return fallback;} }
  function asRecord(value){ return value&&typeof value==="object"&&!Array.isArray(value)?value:{}; }
  function readList(key){ try{const value=safeParse(localStorage.getItem(key),[]);return Array.isArray(value)?value:[];}catch(_){return[];} }
  function load(){
    try{
      const saved=asRecord(safeParse(localStorage.getItem(STORE),{}));
      const alerts=Array.isArray(saved.alerts)?saved.alerts.slice(0,MAX_ALERTS):[];
      return Object.assign({},defaults,saved,{alerts});
    }catch(_){ return Object.assign({},defaults); }
  }
  function persist(){ try{localStorage.setItem(STORE,JSON.stringify(state));}catch(_){} try{window.dispatchEvent(new CustomEvent('p2u:smart-alerts-changed',{detail:{version:VERSION,state:JSON.parse(JSON.stringify(state))}}));}catch(_){} }
  function esc(value){ return String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  function clean(value,max=190){
    return String(value||"")
      .replace(/(?:stake|payout|return|winnings?)\s*[:\-]?\s*(?:[$£€₵₦]|GHS|USD|GBP|EUR|NGN)?\s*[\d,.]+/gi,"record details hidden")
      .replace(/\s+/g," ").trim().slice(0,max);
  }
  function hash(value){
    let h=2166136261;
    const s=String(value||"");
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36);
  }
  function nowMuted(){ return state.paused || (Number(state.mutedUntil)||0)>Date.now(); }
  function categoryEnabled(category,payload={}){
    if(category==="news")return state.enabled!==false && (payload.newsType==="transfer"?state.transferNews!==false:state.footballNews!==false);
    const map={board:"boardUpdates",match:"matchStatus",community:"communityWins",favoriteLeague:"favoriteLeagues",favoriteEngine:"favoriteEngines"};
    const key=map[category]||category;
    return state.enabled!==false && state[key]!==false;
  }
  function iconFor(kind){
    if(kind==="community")return"fa-trophy";
    if(kind==="news")return"fa-newspaper";
    if(kind==="match")return"fa-futbol";
    if(kind==="favorite")return"fa-star";
    if(kind==="board")return"fa-list-check";
    return"fa-bell";
  }
  function relative(ts){
    const delta=Math.max(0,Date.now()-Number(ts||Date.now()));
    if(delta<60000)return"Just now";
    const mins=Math.floor(delta/60000); if(mins<60)return`${mins} min ago`;
    const hrs=Math.floor(mins/60); if(hrs<24)return`${hrs} hr${hrs===1?"":"s"} ago`;
    const days=Math.floor(hrs/24); return`${days} day${days===1?"":"s"} ago`;
  }
  function prefsPersonalization(){
    try{return asRecord(safeParse(localStorage.getItem("p2u-personalization-v167"),{}));}catch(_){return{};}
  }
  function relevantToFavorites(payload){
    payload=asRecord(payload);
    const prefs=prefsPersonalization();
    const leagues=new Set(Array.isArray(prefs.favoriteLeagues)?prefs.favoriteLeagues:[]);
    const engines=new Set(Array.isArray(prefs.favoriteEngines)?prefs.favoriteEngines:[]);
    const league=String(payload.league||"");
    const engine=String(payload.engine||"");
    if(league&&leagues.has(league)&&state.favoriteLeagues)return true;
    if(engine&&engines.has(engine)&&state.favoriteEngines)return true;
    return !league&&!engine;
  }
  function notifyBrowser(alert){
    if(!state.browser||nowMuted()||typeof Notification==="undefined"||Notification.permission!=="granted")return;
    if(!document.hidden)return;
    const title=alert.kind==="community"?"Community record settled":alert.title;
    const options={body:alert.body,icon:"icon-192.png",badge:"favicon-48x48.png",tag:alert.id,renotify:false,data:{url:alert.url||"community.html"}};
    if(navigator.serviceWorker&&navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(reg=>reg.showNotification(title,options)).catch(()=>{});
    }else{
      try{new Notification(title,options);}catch(_){}
    }
  }
  function addAlert(payload,options={}){
    payload=asRecord(payload);
    options=asRecord(options);
    const category=payload.category||payload.kind||"system";
    if(!options.force&&(!categoryEnabled(category,payload)||nowMuted()))return null;
    if(payload.kind==="community"){
      if(state.verifiedOnly&&!payload.verified)return null;
      if(state.followedUsers&&payload.following===false)return null;
    }
    const id=String(payload.id||`${category}-${hash(`${payload.title}|${payload.body}|${payload.createdAt||""}`)}`);
    if(state.alerts.some(item=>item.id===id))return null;
    const favorite=relevantToFavorites(payload)&&Boolean(payload.league||payload.engine);
    const alert={
      id,
      kind:(payload.kind==="match"&&favorite)?"favorite":(payload.kind||"system"),
      category,
      title:clean(payload.title,90)||"Predict2U update",
      body:clean(payload.body,220),
      createdAt:Number(payload.createdAt)||Date.now(),
      url:payload.url||"",
      read:Boolean(options.read||payload.read),
      verified:Boolean(payload.verified),
      trending:Boolean(payload.trending&&state.trendingWins),
      favorite,
      league:clean(payload.league,70),
      engine:clean(payload.engine,45),
      user:clean(payload.user,45),
      newsType:clean(payload.newsType,20),
      source:clean(payload.source,80)
    };
    state.alerts=[alert].concat(state.alerts).slice(0,MAX_ALERTS);
    persist();
    updateBadge();
    if(panel&&state.view==="list")renderList();
    if(!alert.read)notifyBrowser(alert);
    window.dispatchEvent(new CustomEvent("p2u:alert-added",{detail:alert}));
    return alert;
  }
  function unreadCount(){return state.alerts.filter(a=>!a.read).length;}
  function updateBadge(){
    if(!trigger)return;
    const badge=trigger.querySelector(".p2u-alert-badge");
    const n=unreadCount();
    badge.textContent=n>99?"99+":String(n);
    badge.classList.toggle("is-visible",n>0);
    trigger.setAttribute("aria-label",n?`Notifications, ${n} unread`:"Notifications");
  }
  function mountTrigger(){
    if(trigger)return;
    trigger=document.createElement("button");
    trigger.type="button";
    trigger.id="p2u-alert-button";
    trigger.className="p2u-alert-trigger";
    trigger.setAttribute("aria-haspopup","dialog");
    trigger.innerHTML='<i class="fa-regular fa-bell" aria-hidden="true"></i><span class="p2u-alert-badge" aria-hidden="true">0</span>';
    const user=document.getElementById("user-chip");
    const topInner=document.querySelector("header.top .top-inner");
    const desktopNav=document.querySelector("nav.sticky>div, nav.nav .navin, nav.trust-nav .trust-navin, nav.legal-nav .legal-navin");
    if(user&&user.parentElement)user.parentElement.insertBefore(trigger,user);
    else if(topInner){const chip=topInner.querySelector(".mobile-page-chip");topInner.insertBefore(trigger,chip||null);}
    else if(desktopNav)desktopNav.appendChild(trigger);
    else {trigger.classList.add("p2u-alert-trigger-floating");document.body.appendChild(trigger);}
    trigger.addEventListener("click",()=>open("list"));
    updateBadge();
  }
  function mountPanel(){
    if(backdrop)return;
    backdrop=document.createElement("div");
    backdrop.id="p2u-alert-backdrop";
    backdrop.className="p2u-alert-backdrop";
    backdrop.setAttribute("aria-hidden","true");
    backdrop.innerHTML='<aside id="p2u-alert-panel" class="p2u-alert-panel" role="dialog" aria-modal="true" aria-label="Predict2U notifications"></aside>';
    document.body.appendChild(backdrop);
    panel=backdrop.querySelector("#p2u-alert-panel");
    backdrop.addEventListener("click",event=>{if(event.target===backdrop)close();});
  }
  function open(view="list"){
    state.view=view; persist();
    mountPanel(); render();
    backdrop.classList.add("is-open");
    backdrop.setAttribute("aria-hidden","false");
    document.body.classList.add("p2u-alerts-open");
    requestAnimationFrame(()=>{const closeButton=panel.querySelector("[data-alert-close]");if(closeButton)closeButton.focus();});
  }
  function close(){
    if(!backdrop)return;
    backdrop.classList.remove("is-open");
    backdrop.setAttribute("aria-hidden","true");
    document.body.classList.remove("p2u-alerts-open");
    if(trigger)trigger.focus();
  }
  function filteredAlerts(){
    if(state.tab==="community")return state.alerts.filter(a=>a.kind==="community");
    if(state.tab==="news")return state.alerts.filter(a=>a.kind==="news");
    if(state.tab==="system")return state.alerts.filter(a=>a.kind!=="community"&&a.kind!=="news");
    return state.alerts;
  }
  function alertHtml(alert){
    const href=alert.url?` href="${esc(alert.url)}"`:"";
    return `<a class="p2u-alert-item${alert.read?"":" is-unread"}" data-alert-id="${esc(alert.id)}" data-kind="${esc(alert.kind)}"${href}>`+
      `<span class="p2u-alert-item-icon"><i class="fa-solid ${iconFor(alert.kind)}"></i></span>`+
      `<span class="p2u-alert-item-copy"><h3>${esc(alert.title)}</h3><p>${esc(alert.body)}</p>`+
      `<span class="p2u-alert-meta"><span>${relative(alert.createdAt)}</span>`+
      `${alert.user?`<span>@${esc(alert.user.replace(/^@/,""))}</span>`:""}`+
      `${alert.verified?'<span class="p2u-alert-chip is-verified"><i class="fa-solid fa-circle-check"></i> Verified</span>':""}`+
      `${alert.trending?'<span class="p2u-alert-chip"><i class="fa-solid fa-arrow-trend-up"></i> Trending</span>':""}`+
      `${alert.favorite?'<span class="p2u-alert-chip"><i class="fa-solid fa-star"></i> Favorite</span>':""}`+
      `${alert.league?`<span class="p2u-alert-chip">${esc(alert.league)}</span>`:""}</span></span></a>`;
  }
  function renderList(){
    if(!panel)return;
    const list=filteredAlerts();
    panel.innerHTML=`<div class="p2u-alert-head"><div class="p2u-alert-head-copy"><div class="p2u-alert-kicker">SMART ALERTS · ${VERSION.toUpperCase()}</div><h2>Notifications</h2><p>Quiet updates for records, favorites and match status.</p></div><button class="p2u-alert-icon-button" type="button" data-alert-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>`+
      `<div class="p2u-alert-tabs"><button class="p2u-alert-tab${state.tab==="all"?" is-active":""}" data-alert-tab="all">All</button><button class="p2u-alert-tab${state.tab==="community"?" is-active":""}" data-alert-tab="community">Community</button><button class="p2u-alert-tab${state.tab==="news"?" is-active":""}" data-alert-tab="news">News</button><button class="p2u-alert-tab${state.tab==="system"?" is-active":""}" data-alert-tab="system">Board</button><span class="p2u-alert-tab-spacer"></span>${unreadCount()?'<button class="p2u-alert-text-button" data-alert-read-all>Mark all read</button>':""}</div>`+
      `<div class="p2u-alert-list">${list.length?list.map(alertHtml).join(""):'<div class="p2u-alert-empty"><i class="fa-regular fa-bell"></i><b>No alerts yet</b><span>Board updates, match changes, football news and Community records will appear here.</span></div>'}</div>`+
      `<div class="p2u-alert-foot"><button class="p2u-alert-secondary" type="button" data-alert-clear>Clear read</button><button class="p2u-alert-primary" type="button" data-alert-settings><i class="fa-solid fa-sliders"></i> Alert settings</button></div>`;
  }
  function switchRow(key,title,description){
    return `<div class="p2u-alert-setting"><span class="p2u-alert-setting-copy"><b>${esc(title)}</b><small>${esc(description)}</small></span><button type="button" class="p2u-alert-switch" data-alert-toggle="${esc(key)}" aria-pressed="${state[key]!==false}"><span class="sr-only">Toggle ${esc(title)}</span></button></div>`;
  }
  function notificationStatus(){
    if(typeof Notification==="undefined")return"Browser notifications are not supported on this device.";
    if(Notification.permission==="granted")return"Browser notifications are allowed on this device.";
    if(Notification.permission==="denied")return"Browser notifications are blocked in browser settings.";
    return"Permission is requested only when you press Enable browser alerts.";
  }
  function renderSettings(){
    if(!panel)return;
    const muted=(Number(state.mutedUntil)||0)>Date.now();
    panel.innerHTML=`<div class="p2u-alert-head"><div class="p2u-alert-head-copy"><div class="p2u-alert-kicker">YOUR CONTROLS</div><h2>Alert settings</h2><p>Saved privately on this device. No password required.</p></div><button class="p2u-alert-icon-button" type="button" data-alert-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>`+
      `<div class="p2u-alert-settings">`+
      `<section class="p2u-alert-settings-section"><h3>Delivery</h3><p>In-site alerts are always quiet. Browser notifications are optional.</p>${switchRow("enabled","Smart alerts","Show alerts in the Predict2U notification center.")}${switchRow("browser","Browser notifications","Notify only after you grant browser permission.")}<div class="p2u-alert-setting-actions"><button class="p2u-alert-primary" type="button" data-alert-permission>Enable browser alerts</button></div><div class="p2u-alert-status">${esc(notificationStatus())}</div></section>`+
      `<section class="p2u-alert-settings-section"><h3>Board and matches</h3><p>Choose which operational changes deserve an alert.</p>${switchRow("boardUpdates","New board published","Alert when a fresher board is applied.")}${switchRow("matchStatus","Match status changes","Kickoff, live, postponed, cancelled and final status changes.")}${switchRow("favoriteLeagues","Favorite leagues","Prioritize leagues saved in Personalization.")}${switchRow("favoriteEngines","Favorite engines","Prioritize engines saved in Personalization.")}</section>`+
      `<section class="p2u-alert-settings-section"><h3>Football news</h3><p>Choose which global football updates appear in your notification center.</p>${switchRow("footballNews","Football news","Breaking stories and major football issues.")}${switchRow("transferNews","Transfer news","Confirmed moves, deals and major transfer updates.")}</section>`+
      `<section class="p2u-alert-settings-section"><h3>Community win records</h3><p>Settled records only. Stake and payout information stay hidden in alerts.</p>${switchRow("communityWins","Community wins","Alert when a Community slip is settled as won.")}${switchRow("followedUsers","Users I follow only","Limit Community win alerts to followed users when follow data is available.")}${switchRow("verifiedOnly","Verified records only","Require the Community record to show a verification marker.")}${switchRow("trendingWins","Trending wins","Highlight widely followed or copied winning records.")}</section>`+
      `<section class="p2u-alert-settings-section"><h3>Quiet controls</h3><p>No aggressive popups. Pause everything whenever you need.</p><div class="p2u-alert-setting-actions"><button class="p2u-alert-secondary" type="button" data-alert-mute>${muted?"Unmute now":"Mute for today"}</button><button class="p2u-alert-secondary" type="button" data-alert-pause>${state.paused?"Resume alerts":"Pause all alerts"}</button></div><div class="p2u-alert-status">18+ only. Community slips are public records, not wagers. No money changes hands on Predict2U.</div></section>`+
      `</div><div class="p2u-alert-foot"><button class="p2u-alert-secondary" type="button" data-alert-back><i class="fa-solid fa-arrow-left"></i> Notifications</button><button class="p2u-alert-primary" type="button" data-alert-close>Done</button></div>`;
  }
  function render(){state.view==="settings"?renderSettings():renderList();}
  function markRead(id){
    const item=state.alerts.find(a=>a.id===id); if(!item||item.read)return;
    item.read=true; persist(); updateBadge();
  }
  function markAllRead(){state.alerts.forEach(a=>{a.read=true;});persist();updateBadge();renderList();}
  function clearRead(){state.alerts=state.alerts.filter(a=>!a.read);persist();updateBadge();renderList();}
  async function requestPermission(){
    if(typeof Notification==="undefined"){renderSettings();return;}
    try{
      const result=await Notification.requestPermission();
      state.browser=result==="granted"; persist(); renderSettings();
    }catch(_){renderSettings();}
  }
  function toggle(key){state[key]=!state[key];persist();renderSettings();updateBadge();}
  function bindEvents(){
    document.addEventListener("click",event=>{
      if(event.target.closest("[data-p2u-open-alerts]")){open("list");return;}
      if(event.target.closest("[data-p2u-alert-settings]")){open("settings");return;}
      if(!panel)return;
      if(event.target.closest("[data-alert-close]")){close();return;}
      const tab=event.target.closest("[data-alert-tab]");if(tab){state.tab=tab.dataset.alertTab;persist();renderList();return;}
      if(event.target.closest("[data-alert-read-all]")){markAllRead();return;}
      if(event.target.closest("[data-alert-clear]")){clearRead();return;}
      if(event.target.closest("[data-alert-settings]")){state.view="settings";persist();renderSettings();return;}
      if(event.target.closest("[data-alert-back]")){state.view="list";persist();renderList();return;}
      if(event.target.closest("[data-alert-permission]")){requestPermission();return;}
      const toggler=event.target.closest("[data-alert-toggle]");if(toggler){toggle(toggler.dataset.alertToggle);return;}
      if(event.target.closest("[data-alert-mute]")){state.mutedUntil=(Number(state.mutedUntil)||0)>Date.now()?0:new Date().setHours(23,59,59,999);persist();renderSettings();return;}
      if(event.target.closest("[data-alert-pause]")){state.paused=!state.paused;persist();renderSettings();return;}
      const item=event.target.closest("[data-alert-id]");if(item)markRead(item.dataset.alertId);
    });
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&backdrop&&backdrop.classList.contains("is-open"))close();});
  }
  function matchKey(match){return String(match.id!=null?match.id:`${match.home}|${match.away}|${match.matchDate||match.date||""}`);}
  function matchSnapshot(match){return{status:String(match.status||""),homeGoals:match.homeGoals,awayGoals:match.awayGoals,league:String(match.league||""),home:String(match.home||""),away:String(match.away||""),engine:String(match.engine||"")};}
  function processMatchChanges(){
    if(!Array.isArray(window.MATCHES))return;
    let previous={};try{previous=safeParse(localStorage.getItem(MATCH_STORE),{});if(!previous||typeof previous!=="object")previous={};}catch(_){}
    const next={};
    for(const match of window.MATCHES){
      const key=matchKey(match),current=matchSnapshot(match);next[key]=current;
      const old=previous[key];if(!old)continue;
      const changed=current.status!==old.status||current.homeGoals!==old.homeGoals||current.awayGoals!==old.awayGoals;
      if(!changed)continue;
      const score=current.homeGoals!=null&&current.awayGoals!=null?` · ${current.homeGoals}-${current.awayGoals}`:"";
      addAlert({id:`match-${key}-${current.status}-${current.homeGoals}-${current.awayGoals}`,kind:"match",category:"match",title:`${current.home} vs ${current.away}`,body:`Status changed to ${current.status||"updated"}${score}.`,league:current.league,engine:current.engine,url:"board.html"});
    }
    try{localStorage.setItem(MATCH_STORE,JSON.stringify(next));}catch(_){}
  }
  function onDataUpdated(event){
    processMatchChanges();
    addAlert({id:`board-${event&&event.detail&&event.detail.updatedAt||Date.now()}`,kind:"board",category:"board",title:"Fresh board applied",body:"Predict2U loaded a newer fixture and engine snapshot.",url:"board.html"});
  }
  function extractUser(card){
    const direct=card.dataset.user||card.dataset.handle||"";if(direct)return direct.replace(/^@/,"");
    const node=card.querySelector("[data-handle],.slip-user,.handle,.slip-top a,.slip-top strong");
    const text=node?node.textContent:card.textContent;
    const match=String(text||"").match(/@([A-Za-z0-9_.-]{2,28})/);return match?match[1]:"";
  }
  function isWonCard(card){
    if(card.matches('[data-result="won"],[data-status="won"]')||card.querySelector('.pill.w,.res.w,[data-result="won"],[data-status="won"]'))return true;
    return /\b(?:SLIP\s+WON|WON|WINNER)\b/i.test(String(card.textContent||""));
  }
  function isVerifiedCard(card){return Boolean(card.matches('[data-verified="true"]')||card.querySelector('.vb,.verified,[data-verified="true"],.fa-circle-check'));}
  function isFollowingCard(card){return Boolean(card.matches('[data-following="true"]')||card.querySelector('[data-following="true"],.following,.follow.on'));}
  function isTrendingCard(card){
    if(card.matches('[data-trending="true"]')||card.querySelector('[data-trending="true"],.trending'))return true;
    const match=String(card.textContent||"").match(/(?:copied|likes?|followers?)\s*[:·]?\s*(\d+)/i);return Boolean(match&&Number(match[1])>=5);
  }
  function communityId(card){return String(card.dataset.slipId||card.dataset.id||`dom-${hash(clean(card.textContent,500))}`);}
  function processCommunityCard(card,baseline){
    if(!card||!isWonCard(card))return;
    const id=communityId(card);if(communitySeen.includes(id))return;
    communitySeen=[id].concat(communitySeen).slice(0,MAX_COMMUNITY_SEEN);try{localStorage.setItem(COMMUNITY_STORE,JSON.stringify(communitySeen));}catch(_){}
    const user=extractUser(card);
    const legs=[...card.querySelectorAll(".leg")].map(x=>clean(x.textContent,80)).filter(Boolean).slice(0,3);
    const league=card.dataset.league||clean((card.querySelector("[data-league],.league")||{}).textContent,60);
    const engine=card.dataset.engine||clean((card.querySelector("[data-engine],.engine")||{}).textContent,40);
    const verified=isVerifiedCard(card),trending=isTrendingCard(card);
    addAlert({id:`community-${id}`,kind:"community",category:"community",title:user?`@${user} recorded a winning slip`:"Community slip settled as won",body:legs.length?legs.join(" · "):"The public record was settled by the results system.",user,verified,trending,following:isFollowingCard(card),league,engine,url:`community.html#${encodeURIComponent(id)}`},{read:Boolean(baseline)});
  }
  function scanCommunity(){
    const roots=[document.getElementById("feed"),document.getElementById("my-slips"),document.getElementById("popular")].filter(Boolean);
    if(!roots.length)return;
    const cards=roots.flatMap(root=>[...root.querySelectorAll(".slip-card,[data-slip-id]")]);
    cards.slice(0,40).forEach(card=>processCommunityCard(card,initialCommunityScan));
    initialCommunityScan=false;
  }
  function observeCommunity(){
    const roots=[document.getElementById("feed"),document.getElementById("my-slips"),document.getElementById("popular")].filter(Boolean);
    if(!roots.length)return;
    scanCommunity();
    observer=new MutationObserver(()=>scanCommunity());
    roots.forEach(root=>observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["class","data-result","data-status"]}));
  }
  function mountCommunityCard(){
    if(!/community\.html$/i.test(location.pathname)||document.getElementById("p2u-community-alert-card"))return;
    const sub=document.querySelector("main .sub");if(!sub)return;
    const card=document.createElement("section");
    card.id="p2u-community-alert-card";
    card.className="p2u-community-alert-card";
    card.innerHTML='<span class="p2u-community-alert-card-icon"><i class="fa-solid fa-trophy"></i></span><span class="p2u-community-alert-card-copy"><h2>Community win alerts</h2><p>Get quiet alerts when public slips are settled as won. Verified labels stay visible; stakes and payouts stay private.</p></span><span class="p2u-community-alert-actions"><button type="button" class="ghost" data-p2u-open-alerts>View alerts</button><button type="button" data-p2u-alert-settings>Alert settings</button></span>';
    sub.insertAdjacentElement("afterend",card);
  }
  function ingestCommunityWin(detail){
    detail=asRecord(detail);
    if(!Object.keys(detail).length)return;
    addAlert({id:`community-${detail.id||hash(JSON.stringify(detail))}`,kind:"community",category:"community",title:detail.title||(detail.user?`@${String(detail.user).replace(/^@/,"")} recorded a winning slip`:"Community slip settled as won"),body:detail.body||detail.summary||"The public record was settled by the results system.",user:detail.user,verified:detail.verified,trending:detail.trending,following:detail.following,league:detail.league,engine:detail.engine,url:detail.url||"community.html",createdAt:detail.createdAt});
  }
  function ingestNews(detail){
    detail=asRecord(detail);if(!Object.keys(detail).length)return;
    addAlert({id:`news-${detail.id||hash(JSON.stringify(detail))}`,kind:"news",category:"news",title:detail.title||"Football news",body:detail.body||detail.summary||"A new football story is available.",newsType:detail.newsType||"football",source:detail.source||"",url:detail.url||"news.html",createdAt:detail.createdAt});
  }
  function signalReady(){
    const ready=Boolean(trigger&&panel);
    document.documentElement.dataset.p2uSmartAlertsReady=ready?'true':'degraded';
    window.dispatchEvent(new CustomEvent('p2u:smart-alerts-ready',{detail:{version:VERSION,ready}}));
  }
  function init(){
    if(mounted){signalReady();return;}
    mounted=true;
    try{
      mountTrigger();mountPanel();mountCommunityCard();bindEvents();
      processMatchChanges();
      window.addEventListener("p2u:data-updated",onDataUpdated);
      window.addEventListener("p2u:community-win",event=>ingestCommunityWin(event.detail));
      window.addEventListener("p2u:news-alert",event=>ingestNews(event.detail));
      setTimeout(observeCommunity,450);
      updateBadge();
    }finally{signalReady();}
  }

  function setStateForTesting(next){
    const patch=asRecord(next);
    state=Object.assign({},state,patch,{alerts:Array.isArray(patch.alerts)?patch.alerts:state.alerts});
    persist();
    updateBadge();
    if(panel)render();
    return JSON.parse(JSON.stringify(state));
  }

  window.P2USmartAlerts={
    version:VERSION,
    open:()=>open("list"),
    settings:()=>open("settings"),
    add:addAlert,
    communityWin:ingestCommunityWin,
    news:ingestNews,
    markAllRead,
    getState:()=>JSON.parse(JSON.stringify(state)),
    setState:setStateForTesting,
    clear:()=>{state.alerts=[];persist();updateBadge();if(panel)render();}
  };

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
