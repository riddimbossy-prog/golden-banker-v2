/* Predict2U Unified UI Experience v217 */
(function(){
  'use strict';
  const root=document.documentElement;
  root.classList.add('p2u-ui-v217');
  const $=(s,c=document)=>c.querySelector(s), $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function toast(message,type='good',duration=2600){
    let stack=$('#p2u-toast-stack');
    if(!stack){stack=document.createElement('div');stack.id='p2u-toast-stack';stack.setAttribute('aria-live','polite');document.body.appendChild(stack);}
    const node=document.createElement('div');node.className=`p2u-toast ${type}`;node.textContent=message;stack.appendChild(node);
    setTimeout(()=>{node.style.opacity='0';node.style.transform='translateY(6px)';setTimeout(()=>node.remove(),180);},duration);
    return node;
  }
  window.P2UToast=toast;

  function connectionState(){
    let badge=$('#p2u-connection-state');
    if(!badge){badge=document.createElement('div');badge.id='p2u-connection-state';badge.innerHTML='<span aria-hidden="true">●</span><span>Offline · showing saved content</span>';document.body.appendChild(badge);}
    const apply=()=>{root.classList.toggle('p2u-offline',!navigator.onLine);if(!navigator.onLine)toast('You are offline. Showing the latest saved board.','bad',3600);};
    addEventListener('online',()=>{apply();toast('Back online. Live updates resumed.');});
    addEventListener('offline',apply);apply();
  }

  function compactHeader(){
    let ticking=false;
    const update=()=>{root.classList.toggle('p2u-header-compact',scrollY>28);ticking=false;};
    addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(update);}},{passive:true});update();
  }

  /* Local SVG fallback for public controls when Font Awesome is blocked. */
  const iconPaths={
    'fa-user':'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    'fa-magnifying-glass':'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    'fa-arrow-right':'<path d="M5 12h14M13 6l6 6-6 6"/>',
    'fa-arrow-up-right-from-square':'<path d="M14 5h5v5M10 14l9-9"/><path d="M19 13v6H5V5h6"/>',
    'fa-futbol':'<circle cx="12" cy="12" r="9"/><path d="m12 7 3 2-1 4h-4L9 9l3-2zM5 10l4-1M15 9l4 1M10 13l-2 5M14 13l2 5"/>',
    'fa-gauge-high':'<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 13 4-4M8 17h8"/>',
    'fa-chart-line':'<path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6"/>',
    'fa-microchip':'<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"/>',
    'fa-globe':'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    'fa-shield-halved':'<path d="M12 3 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-3z"/><path d="M12 3v19"/>',
    'fa-share-nodes':'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.4M8.2 13.2l7.5 4.4"/>',
    'fa-comments':'<path d="M5 5h14v10H9l-4 4V5z"/>',
    'fa-bookmark':'<path d="M6 3h12v18l-6-4-6 4V3z"/>',
    'fa-flag':'<path d="M5 21V4M5 5h11l-2 4 2 4H5"/>',
    'fa-plus':'<path d="M12 5v14M5 12h14"/>',
    'fa-xmark':'<path d="m6 6 12 12M18 6 6 18"/>',
    'fa-circle-check':'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    'fa-circle-xmark':'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    'fa-triangle-exclamation':'<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 9v5M12 17h.01"/>',
    'fa-brain':'<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5 3 3 0 0 0 3 5h1M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5 3 3 0 0 1-3 5h-1M9 4v16M15 4v16M9 9h3M12 14h3"/>',
    'fa-shield':'<path d="M12 3 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-3z"/>',
    'fa-newspaper':'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    'fa-earth-africa':'<circle cx="12" cy="12" r="9"/><path d="M4 9h5l2 3-2 5M13 3l2 4 4 2M15 15l3 4"/>',
    'fa-wand-magic-sparkles':'<path d="m4 20 11-11 2 2L6 22 4 20zM14 4h.01M20 8h.01M18 2h.01"/>',
    'fa-telegram':'<path d="m3 11 17-7-4 16-5-5-3 2 1-5 7-5-9 4z"/>',
    'fa-whatsapp':'<path d="M20 11.5a8 8 0 0 1-12 7L4 20l1.5-3.5A8 8 0 1 1 20 11.5z"/><path d="M9 8c.5 3 2 4.5 5 5"/>',
    'fa-dna':'<path d="M5 3c8 5 6 13 14 18M19 3C11 8 13 16 5 21M8 7h8M8 17h8"/>',
    'fa-code-branch':'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 6c6 0 2 12 8 12"/>',
    'fa-info':'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'
  };
  function iconFallbackNeeded(){
    const probe=document.createElement('i');probe.className='fa-solid fa-user';probe.style.cssText='position:absolute;visibility:hidden;';document.body.appendChild(probe);
    const fam=getComputedStyle(probe).fontFamily||'';probe.remove();return !/Font Awesome/i.test(fam);
  }
  function replaceIcons(scope=document){
    if(!root.dataset.p2uIconFallback)return;
    $$('i[class*="fa-"]:not([data-p2u-local-icon])',scope).forEach(i=>{
      const cls=Array.from(i.classList).find(c=>iconPaths[c]);if(!cls)return;
      const span=document.createElement('span');span.className='p2u-icon-fallback';span.dataset.p2uLocalIcon=cls;span.setAttribute('aria-hidden','true');span.innerHTML=`<svg viewBox="0 0 24 24">${iconPaths[cls]}</svg>`;i.replaceWith(span);
    });
  }
  function setupIconFallback(){
    if(iconFallbackNeeded()){root.dataset.p2uIconFallback='1';replaceIcons();new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)replaceIcons(n);}))).observe(document.body,{childList:true,subtree:true});}
  }

  function sharePayload(card){
    const home=card.dataset.p2uHome||'',away=card.dataset.p2uAway||'',market=card.dataset.p2uMarket||'';
    return {title:'Predict2U pick',text:`${home} vs ${away} · ${market}\nKnow the game. Predict better.`,url:card.dataset.p2uProof||location.href};
  }
  async function shareCard(card){
    const data=sharePayload(card);
    try{if(navigator.share){await navigator.share(data);}else{await navigator.clipboard.writeText(`${data.text}\n${data.url}`);toast('Pick copied to clipboard.');}}catch(e){if(e&&e.name!=='AbortError')toast('Could not share this pick.','bad');}
  }

  function enhanceCards(){
    $$('.p2u-standard-card:not([data-p2u-v217])').forEach(card=>{
      card.dataset.p2uV217='1';
      const agree=card.querySelector('.agree-row');
      if(agree&&!card.querySelector('.p2u-card-support-copy')){
        const val=card.querySelector('.agree-val')?.textContent?.trim()||'';
        const copy=document.createElement('div');copy.className='p2u-card-support-copy';copy.textContent=val?`Supported by ${val.replace('/',' of ')} active engines`:'Engine support shown above';agree.insertAdjacentElement('afterend',copy);
      }
      if(!card.querySelector('.p2u-card-tap-hint')){
        const hint=document.createElement('div');hint.className='p2u-card-tap-hint';hint.textContent='Tap the card for the full reasoning';
        const signals=card.querySelector('.p2u-card-signals');(signals||card.querySelector('.agree-row'))?.insertAdjacentElement('afterend',hint);
      }
      if(!card.querySelector('.p2u-card-more')){
        const more=document.createElement('details');more.className='p2u-card-more';
        more.innerHTML='<summary aria-label="More match actions">•••</summary><div class="p2u-card-more-menu"><button type="button" data-p2u-menu-details>View details</button><button type="button" data-p2u-menu-share>Share pick</button></div>';
        card.appendChild(more);
        more.querySelector('[data-p2u-menu-details]').addEventListener('click',e=>{e.stopPropagation();card.querySelector('[data-det]')?.click();more.open=false;});
        more.querySelector('[data-p2u-menu-share]').addEventListener('click',e=>{e.stopPropagation();shareCard(card);more.open=false;});
      }
    });
  }

  function boardEnhancements(){
    const board=$('#board'),dateStrip=$('#date-strip'),pills=$('#engine-pills');if(!board||!dateStrip||!pills)return;
    let quick=$('#p2u-board-quickbar');
    if(!quick){
      quick=document.createElement('div');quick.id='p2u-board-quickbar';quick.innerHTML='<div class="p2u-board-quickbar-inner"><div class="p2u-board-quickbar-copy"><strong id="p2u-quick-date">Selected board</strong><span id="p2u-quick-count">Active engines and filters</span></div><button type="button" class="p2u-board-filter-button" id="p2u-open-filters">Filters <span class="count" id="p2u-filter-count">0</span></button></div>';
      dateStrip.parentNode.insertBefore(quick,dateStrip);
    }
    let backdrop=$('#p2u-filter-sheet');
    if(!backdrop){
      backdrop=document.createElement('div');backdrop.id='p2u-filter-sheet';backdrop.className='p2u-sheet-backdrop';backdrop.setAttribute('aria-hidden','true');
      backdrop.innerHTML='<section class="p2u-bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="p2u-filter-title"><div class="p2u-sheet-handle"></div><div class="p2u-sheet-head"><div><div style="font-size:10px;letter-spacing:.12em;color:var(--p2u-green);font-weight:800">BOARD CONTROLS</div><h2 id="p2u-filter-title">Filter today\'s board</h2></div><button class="p2u-sheet-close" type="button" aria-label="Close filters">×</button></div><div class="p2u-sheet-fields"><input id="p2u-sheet-search" type="search" placeholder="Search matches or leagues…"/><select id="p2u-sheet-league" aria-label="Choose league"></select></div><div class="p2u-sheet-engine-list" id="p2u-sheet-engines"></div></section>';
      document.body.appendChild(backdrop);
    }
    const close=()=>{backdrop.classList.remove('is-open');backdrop.setAttribute('aria-hidden','true');document.body.classList.remove('p2u-sheet-open');};
    const open=()=>{syncSheet();backdrop.classList.add('is-open');backdrop.setAttribute('aria-hidden','false');document.body.classList.add('p2u-sheet-open');setTimeout(()=>$('#p2u-sheet-search')?.focus(),80);};
    $('#p2u-open-filters')?.addEventListener('click',open);
    backdrop.querySelector('.p2u-sheet-close')?.addEventListener('click',close);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&backdrop.classList.contains('is-open'))close();});
    const originalSearch=$('#f-search'),originalLeague=$('#f-league'),sheetSearch=$('#p2u-sheet-search'),sheetLeague=$('#p2u-sheet-league'),sheetEngines=$('#p2u-sheet-engines');
    sheetSearch?.addEventListener('input',()=>{if(originalSearch){originalSearch.value=sheetSearch.value;originalSearch.dispatchEvent(new Event('input',{bubbles:true}));}});
    sheetLeague?.addEventListener('change',()=>{if(originalLeague){originalLeague.value=sheetLeague.value;originalLeague.dispatchEvent(new Event('change',{bubbles:true}));}});
    function syncSheet(){
      const selected=$('.date-chip.on',dateStrip),day=selected?.querySelector('.date-chip-day')?.textContent||'Selected date',date=selected?.querySelector('.date-chip-date')?.textContent||'',count=selected?.querySelector('.date-chip-count')?.textContent||'';
      const active=$('#s-engines')?.textContent?.trim()||($('#board-analysed')?.textContent?.match(/\d+\/\d+/)||['—'])[0];
      $('#p2u-quick-date').textContent=`${day} ${date}`.trim();$('#p2u-quick-count').textContent=`${count} · ${active} engines active`;$('#p2u-filter-count').textContent=(pills.querySelectorAll('.pill').length||0);
      if(sheetSearch&&originalSearch)sheetSearch.value=originalSearch.value;
      if(sheetLeague&&originalLeague){sheetLeague.innerHTML=originalLeague.innerHTML;sheetLeague.value=originalLeague.value;}
      if(sheetEngines){
        sheetEngines.innerHTML='';
        $$('.pill[data-mode]',pills).forEach(btn=>{const b=document.createElement('button');b.type='button';b.textContent=btn.textContent;b.className=btn.classList.contains('on')?'is-active':'';b.dataset.mode=btn.dataset.mode;b.addEventListener('click',()=>{btn.click();syncSheet();close();});sheetEngines.appendChild(b);});
      }
      let more=$('.p2u-engine-more',pills);
      if(!more){more=document.createElement('button');more.type='button';more.className='pill p2u-engine-more';more.textContent='More';more.addEventListener('click',open);pills.appendChild(more);}
    }
    syncSheet();
    new MutationObserver(()=>{syncSheet();enhanceCards();}).observe(board,{childList:true,subtree:true,characterData:true});
    board.addEventListener('click',e=>{
      const card=e.target.closest('.p2u-standard-card');if(!card)return;
      if(e.target.closest('button,a,input,select,details,summary,.details'))return;
      if(matchMedia('(max-width:720px)').matches)card.querySelector('[data-det]')?.click();
    });
    enhanceCards();
  }

  function proofEnhancements(){
    const meta=$('.proof-hero-meta');if(!meta||$('.p2u-proof-timeline'))return;
    const timeline=document.createElement('div');timeline.className='p2u-proof-timeline';timeline.setAttribute('aria-label','Proof record timeline');
    timeline.innerHTML='<div class="p2u-proof-step"><b>Published</b><span>Selection and evidence locked before kickoff</span></div><div class="p2u-proof-step"><b>Kickoff</b><span>Record becomes read-only</span></div><div class="p2u-proof-step"><b>Settled</b><span>Final result and grading stay public</span></div>';
    meta.insertAdjacentElement('afterend',timeline);
  }

  function scorecardEnhancements(){
    const sticky=$('.stickybar'),cards=$('#cards');if(!sticky||!cards||$('#p2u-scorecard-periods'))return;
    const periods=document.createElement('div');periods.id='p2u-scorecard-periods';periods.className='p2u-scorecard-periods';periods.setAttribute('aria-label','Scorecard period');
    periods.innerHTML='<button type="button" class="is-active" data-period="all">All time</button><button type="button" data-period="7">7 days</button><button type="button" data-period="30">30 days</button><button type="button" data-period="90">90 days</button>';
    sticky.querySelector('.grid')?.insertAdjacentElement('beforebegin',periods);
    periods.addEventListener('click',e=>{const b=e.target.closest('[data-period]');if(!b)return;$$('[data-period]',periods).forEach(x=>x.classList.toggle('is-active',x===b));cards.dataset.period=b.dataset.period;cards.dispatchEvent(new CustomEvent('p2u:scorecard-period',{bubbles:true,detail:{period:b.dataset.period}}));toast(`${b.textContent} scorecard view selected.`);});
  }

  function newsEnhancements(){
    const feed=$('#news-feed')||$('.p2u-news-grid');if(!feed)return;
    const apply=()=>{
      $$('.p2u-news-card:not([data-p2u-v217]),.p2u-news-feature-card:not([data-p2u-v217])').forEach(card=>{
        card.dataset.p2uV217='1';const source=card.querySelector('.p2u-news-source-action');const title=card.querySelector('h2,h3');
        if(source&&title&&!title.querySelector('a')){const a=document.createElement('a');a.className='p2u-news-title-link';a.href=source.href;a.target='_blank';a.rel='noopener noreferrer nofollow';a.innerHTML=title.innerHTML;title.innerHTML='';title.appendChild(a);}
      });
    };
    apply();new MutationObserver(apply).observe(feed,{childList:true,subtree:true});
  }

  function addActionFeedback(){
    document.addEventListener('click',e=>{
      if(e.target.closest('.slip-add')&&!e.target.closest('#acca-add'))setTimeout(()=>toast('Added to My Slip.'),120);
      if(e.target.closest('[data-news-bookmark]'))setTimeout(()=>toast('Read Later updated.'),120);
    },true);
  }

  function boot(){
    connectionState();compactHeader();setupIconFallback();boardEnhancements();proofEnhancements();scorecardEnhancements();newsEnhancements();addActionFeedback();
    root.dataset.p2uUiReady='v217';
    dispatchEvent(new CustomEvent('p2u:ui-ready',{detail:{version:'v217'}}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
