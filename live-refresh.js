/* Predict2U live-refresh.js — watches data.js for newer score snapshots. */
(function(){
  "use strict";
  const FINISHED=new Set(["FT","AET","PEN","AWD","WO"]);
  const LIVE=new Set(["1H","HT","2H","ET","BT","P","LIVE"]);
  const matches=Array.isArray(window.MATCHES)?window.MATCHES:[];
  const initial=Date.parse(window.SCORES_UPDATED||"")||0;

  function activeWindow(){
    const now=Date.now();
    return matches.some(m=>{
      const st=String(m.status||"").toUpperCase();
      if(LIVE.has(st))return true;
      if(FINISHED.has(st))return false;
      const ko=Date.parse(m.kickoff||"");
      return Number.isFinite(ko)&&ko>=now-4*3600000&&ko<=now+2*3600000;
    });
  }
  if(!activeWindow())return;

  const style=document.createElement("style");
  style.textContent=`
    #p2u-live-sync{position:fixed;left:14px;bottom:14px;z-index:80;display:flex;align-items:center;gap:7px;
      background:rgba(8,9,13,.94);color:#b9bec9;border:1px solid #252936;border-radius:999px;
      padding:7px 10px;font:700 10px/1 Inter,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35)}
    #p2u-live-sync .dot{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 0 0 rgba(52,211,153,.5);animation:p2uLivePulse 1.5s infinite}
    @keyframes p2uLivePulse{70%{box-shadow:0 0 0 7px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
    @media(max-width:640px){#p2u-live-sync{bottom:calc(76px + env(safe-area-inset-bottom));left:10px}}
  `;
  document.head.appendChild(style);
  const badge=document.createElement("div");
  badge.id="p2u-live-sync";
  badge.innerHTML='<span class="dot"></span><span id="p2u-live-sync-text">LIVE SCORES · AUTO REFRESH</span>';
  document.body.appendChild(badge);

  async function check(){
    try{
      const r=await fetch(`data.js?live=${Date.now()}`,{cache:"no-store"});
      if(!r.ok)return;
      const text=await r.text();
      const m=text.match(/window\.SCORES_UPDATED\s*=\s*"([^"]+)"/);
      const next=m?Date.parse(m[1]):0;
      if(next&&next>initial){
        document.getElementById("p2u-live-sync-text").textContent="NEW SCORE FOUND · REFRESHING";
        setTimeout(()=>location.reload(),350);
      }
    }catch(_){}
  }
  setInterval(check,60000);
  setTimeout(check,10000);
})();