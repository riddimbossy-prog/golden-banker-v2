/* Predict2U Brand & Experience v166 */
(function(){
  "use strict";

  function onboarding(){
    if(!/\/(?:index|board)\.html$/.test(location.pathname)&&location.pathname!=="/"&&location.pathname!=="")return;
    try{if(localStorage.getItem("p2u-onboarding-v157")==="seen")return;}catch(_){}
    const modal=document.createElement("div");
    modal.className="p2u-onboard-backdrop";
    modal.setAttribute("role","dialog");
    modal.setAttribute("aria-modal","true");
    modal.setAttribute("aria-label","How Predict2U works");
    modal.innerHTML=`<section class="p2u-onboard"><img class="p2u-onboard-logo" src="predict2u-logo.png" alt="Predict2u.com"><div class="eyebrow" style="margin-top:22px">A transparent prediction board</div><h2>Every pick has proof.</h2><p>Predict2U does not hide engine disagreement or remove settled losses. Start with these three steps.</p><div class="p2u-steps"><div class="p2u-step"><b>01 · ANALYSE</b><span>Sixteen engines examine the same fixture using different rules and data.</span></div><div class="p2u-step"><b>02 · COMPARE</b><span>Exact-market agreement, conflict and data reliability are measured separately.</span></div><div class="p2u-step"><b>03 · VERIFY</b><span>Open Proof Mode to inspect every vote and keep the final result on record.</span></div></div><div class="p2u-onboard-actions"><a class="p2u-onboard-primary" href="#board">Explore Today’s Board</a><a class="p2u-onboard-secondary" href="trust.html">See How It Works</a><button class="p2u-onboard-secondary" type="button" data-close>Continue</button></div><p class="p2u-onboard-note">For adults 18+. Analytical records are not guaranteed outcomes.</p></section>`;
    document.body.appendChild(modal);
    const close=()=>{try{localStorage.setItem("p2u-onboarding-v157","seen");}catch(_){}modal.remove();};
    modal.querySelector("[data-close]").addEventListener("click",close);
    modal.querySelector('a[href="#board"]').addEventListener("click",close);
    modal.addEventListener("click",e=>{if(e.target===modal)close();});
    document.addEventListener("keydown",function esc(e){if(e.key==="Escape"){close();document.removeEventListener("keydown",esc);}});
    setTimeout(()=>modal.querySelector("[data-close]").focus(),50);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",onboarding);
  else onboarding();
})();
