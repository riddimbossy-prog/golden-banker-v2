/* Predict2U site-health-widget.js — read-only public freshness/status display. */
(function(){
  "use strict";
  const VERSION="v166";
  const LIVE=new Set(["1H","HT","2H","ET","BT","P","LIVE"]);
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const parse=v=>{const n=Date.parse(v||"");return Number.isFinite(n)?n:null;};
  const ageText=ts=>{
    const t=parse(ts); if(t==null)return"Not available";
    const m=Math.max(0,Math.round((Date.now()-t)/60000));
    if(m<1)return"Just now"; if(m<60)return`${m} min ago`;
    const h=Math.round(m/60); if(h<48)return`${h} hr ago`;
    return`${Math.round(h/24)} days ago`;
  };
  const localSnapshot=()=>{
    const matches=Array.isArray(window.MATCHES)?window.MATCHES:[];
    return{
      version:VERSION,
      generatedAt:new Date().toISOString(),
      dataUpdated:window.DATA_UPDATED||null,
      scoresUpdated:window.SCORES_UPDATED||null,
      engineCount:Array.isArray(window.P2U_ENGINE_REGISTRY)?window.P2U_ENGINE_REGISTRY.length:null,
      matchCount:matches.length,
      liveMatches:matches.filter(m=>LIVE.has(String(m.status||"").toUpperCase())).length,
      source:"browser"
    };
  };
  function classify(h){
    const dataAge=h.dataUpdated?Date.now()-Date.parse(h.dataUpdated):Infinity;
    const scoreAge=h.scoresUpdated?Date.now()-Date.parse(h.scoresUpdated):Infinity;
    const oddsAge=h.oddsUpdated?Date.now()-Date.parse(h.oddsUpdated):Infinity;
    const engineBad=h.engineCount!=null&&h.engineCount!==16;
    const workflowFailed=/fail|error/i.test(String(h.workflowStatus||h.lastRunStatus||""));
    if(workflowFailed)return{state:"critical",label:"Workflow failed"};
    if(engineBad||dataAge>36*3600000)return{state:"critical",label:"Action needed"};
    if(dataAge>12*3600000)return{state:"stale",label:"Core data stale"};
    if(h.liveMatches>0&&scoreAge>20*60000)return{state:"degraded",label:"Live scores delayed"};
    if(h.oddsStatus==="unavailable"||(h.oddsUpdated&&oddsAge>24*3600000))return{state:"degraded",label:"Odds unavailable"};
    if(!Number.isFinite(dataAge))return{state:"unknown",label:"Checking data"};
    return{state:"healthy",label:"System operational"};
  }
  async function readHealth(){
    try{
      const r=await fetch(`site-health.json?t=${Date.now()}`,{cache:"no-store"});
      if(r.ok){const h=await r.json();return{...localSnapshot(),...h};}
    }catch(_){}
    return localSnapshot();
  }
  function esc(s){return String(s==null?"":s).replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));}
  function build(){
    if(document.getElementById("p2u-health-button"))return;
    const btn=document.createElement("button");btn.id="p2u-health-button";btn.type="button";btn.setAttribute("aria-expanded","false");btn.innerHTML='<span class="p2u-health-dot"></span><span id="p2u-health-label">CHECKING SYSTEM</span>';
    const panel=document.createElement("section");panel.id="p2u-health-panel";panel.setAttribute("aria-label","Predict2U system health");
    document.body.append(btn,panel);
    const footer=document.createElement("div");footer.className="p2u-build-footer";footer.id="p2u-build-footer";footer.textContent=`Predict2U ${VERSION} · 16 engines · Checking system status…`;
    const siteFooter=document.querySelector("footer");
    if(siteFooter)siteFooter.appendChild(footer);else document.body.appendChild(footer);
    btn.addEventListener("click",()=>{const open=!panel.classList.contains("open");panel.classList.toggle("open",open);btn.setAttribute("aria-expanded",String(open));});
    document.addEventListener("click",e=>{if(!panel.classList.contains("open"))return;if(panel.contains(e.target)||btn.contains(e.target))return;panel.classList.remove("open");btn.setAttribute("aria-expanded","false");});
    return{btn,panel,footer};
  }
  async function render(){
    const ui=build();if(!ui)return;
    const h=await readHealth(),c=classify(h);
    ui.btn.dataset.state=c.state;document.getElementById("p2u-health-label").textContent=c.label.toUpperCase();
    const live=num(h.liveMatches)||0,eng=num(h.engineCount),matches=num(h.matchCount)||0;
    ui.panel.innerHTML=`
      <div class="p2u-health-title">System health</div>
      <div class="p2u-health-sub">Public freshness and build information</div>
      <div class="p2u-health-grid">
        <div class="p2u-health-cell"><div class="p2u-health-label">Core data</div><div class="p2u-health-value">${esc(ageText(h.dataUpdated))}</div></div>
        <div class="p2u-health-cell"><div class="p2u-health-label">Live scores</div><div class="p2u-health-value">${esc(ageText(h.scoresUpdated))}</div></div>
        <div class="p2u-health-cell"><div class="p2u-health-label">Engine registry</div><div class="p2u-health-value">${eng==null?"Checking":`${eng}/16 loaded`}</div></div>
        <div class="p2u-health-cell"><div class="p2u-health-label">Fixtures</div><div class="p2u-health-value">${matches} loaded · ${live} live</div></div>
      </div>
      <div class="p2u-health-actions"><a href="trust.html#system-status">Open Trust Center →</a><button class="p2u-health-close" type="button">Close</button></div>`;
    ui.panel.querySelector(".p2u-health-close").addEventListener("click",()=>{ui.panel.classList.remove("open");ui.btn.setAttribute("aria-expanded","false");});
    const cls=c.state==="healthy"?"ok":c.state==="degraded"?"warn":"bad";
    ui.footer.innerHTML=`Predict2U ${VERSION} · ${eng==null?"16":eng} engines · <span class="${cls}">${esc(c.label)}</span> · Data ${esc(ageText(h.dataUpdated))}`;
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",render);else render();
})();