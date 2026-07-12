/* Predict2U v170 — global mobile app navigation */
(function(){
  "use strict";
  const VERSION="v189";
  const icons={
    board:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 4.8M3.5 12l1.2 1.2L7 10.8M3.5 18l1.2 1.2L7 16.8"/></svg>',
    games:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"/></svg>',
    results:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/></svg>',
    community:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    news:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>'
  };
  const items=[
    {id:"board",label:"Board",href:"index.html"},
    {id:"games",label:"Games",href:"engines.html"},
    {id:"results",label:"Results",href:"scorecards.html"},
    {id:"community",label:"Community",href:"community.html"},
    {id:"news",label:"News",href:"news.html"}
  ];
  function page(){const p=(location.pathname.split('/').pop()||'index.html').toLowerCase();if(p==='board.html'||p==='index.html'||p==='')return'board';if(p==='community.html')return'community';if(p==='news.html')return'news';if(p==='scorecards.html'||p==='proof.html')return'results';return'games';}
  function signalReady(active){
    document.documentElement.dataset.p2uMobileNavReady='true';
    window.dispatchEvent(new CustomEvent('p2u:mobile-nav-ready',{detail:{version:VERSION,active}}));
  }
  function mount(){
    const existing=document.querySelector('.p2u-mobile-app-nav');
    if(existing){ signalReady(page()); return; }
    document.querySelectorAll('.community-mobile-nav').forEach(el=>el.remove());
    const active=page(),nav=document.createElement('nav');
    nav.className='p2u-mobile-app-nav';nav.setAttribute('aria-label','Primary mobile navigation');nav.dataset.version=VERSION;
    nav.innerHTML='<div class="p2u-mobile-app-nav__inner">'+items.map(item=>`<a href="${item.href}" class="${item.id===active?'is-active':''}"${item.id===active?' aria-current="page"':''} data-p2u-mobile-nav="${item.id}">${icons[item.id]}<span>${item.label}</span></a>`).join('')+'</div>';
    document.body.appendChild(nav);
    signalReady(active);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
