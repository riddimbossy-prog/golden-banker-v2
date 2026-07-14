(function(){
  'use strict';
  if(document.querySelector('.p2u-v245-nav-wrap')) return;

  document.querySelectorAll('.p2u-v227-nav-wrap,.p2u-v227-dock,.p2u-v227-more-backdrop,.p2u-phase2-nav-wrap,.p2u-phase2-dock,.p2u-mobile-app-nav').forEach(node=>node.remove());
  ['user-chip','user-name','user-sub','user-av'].forEach(id=>document.querySelectorAll('#'+id).forEach(node=>node.removeAttribute('id')));

  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const active=page===''?'index.html':page;
  const svg=(name)=>{
    const icons={
      overview:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
      picks:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16M8 13h3M13 13h3M8 17h3"/></svg>',
      bankers:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12l2 5-8 11L4 9z"/><path d="M8 9h8M10 4l2 5 2-5"/></svg>',
      fullboard:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg>',
      engines:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3M10 10h4v4h-4z"/></svg>',
      news:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
      community:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1"/></svg>',
      proof:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-5"/></svg>',
      score:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/></svg>',
      dna:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3c6 4 4 14 10 18M17 3C11 7 13 17 7 21M8 7h8M7 12h10M8 17h8"/></svg>',
      trust:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/></svg>',
      account:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
      more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>'
    };
    return icons[name]||icons.overview;
  };

  const desktopLinks=[
    {href:'index.html',label:'Overview',icon:'overview'},
    {href:'board.html',label:'Picks',icon:'picks'},
    {href:'bankers.html',label:'Bankers',icon:'bankers'},
    {href:'engines.html',label:'Full Board',icon:'fullboard'},
    {href:'all-engines.html',label:'Engines',icon:'engines'},
    {href:'news.html',label:'News',icon:'news'},
    {href:'community.html',label:'Community',icon:'community'}
  ];
  const mobileLinks=[
    {href:'index.html',label:'Overview',mobileLabel:'Home',icon:'overview'},
    {href:'board.html',label:'Picks',icon:'picks'},
    {href:'bankers.html',label:'Bankers',icon:'bankers'},
    {href:'all-engines.html',label:'Engines',icon:'engines'}
  ];
  const moreLinks=[
    {href:'engines.html',label:'Full Board',icon:'fullboard'},
    {href:'news.html',label:'News',icon:'news'},
    {href:'community.html',label:'Community',icon:'community'},
    {href:'proof.html',label:'Proof',icon:'proof'},
    {href:'scorecards.html',label:'Scorecards',icon:'score'},
    {href:'league-dna.html',label:'League DNA',icon:'dna'},
    {href:'trust.html',label:'Trust Center',icon:'trust'},
    {href:'account.html',label:'Account',icon:'account'}
  ];
  const isActive=item=>active===item.href;
  const moreActive=moreLinks.some(isActive);

  const nav=document.createElement('nav');
  nav.className='p2u-v245-nav-wrap';
  nav.setAttribute('aria-label','Primary navigation');
  nav.innerHTML=`
    <div class="p2u-v245-shell">
      <a class="p2u-v245-brand" href="index.html" aria-label="Predict2U overview"><img src="predict2u-logo.png" alt="Predict2U"/></a>
      <div class="p2u-v245-rail" role="navigation">
        ${desktopLinks.map(item=>`<a href="${item.href}" class="p2u-v245-link${isActive(item)?' is-active':''}"${isActive(item)?' aria-current="page"':''}>${svg(item.icon)}<span>${item.label}</span></a>`).join('')}
      </div>
      <div class="p2u-v245-side">
        <a id="user-chip" class="p2u-v245-user" href="account.html" aria-label="Account">
          <span class="p2u-v245-user-copy"><strong id="user-name">Sign in</strong><small id="user-sub">Account</small></span>
          <span id="user-av" class="p2u-v245-avatar">${svg('account')}</span>
        </a>
      </div>
    </div>`;
  document.body.prepend(nav);

  const dock=document.createElement('nav');
  dock.className='p2u-v245-dock';
  dock.setAttribute('aria-label','Mobile navigation');
  dock.innerHTML=mobileLinks.map(item=>`<a href="${item.href}" class="${isActive(item)?'is-active':''}">${svg(item.icon)}<span>${item.mobileLabel||item.label}</span></a>`).join('')+
    `<button type="button" id="p2u-v245-more" class="${moreActive?'is-active':''}" aria-haspopup="dialog" aria-controls="p2u-v245-more-panel" aria-expanded="false">${svg('more')}<span>More</span></button>`;
  document.body.appendChild(dock);

  const backdrop=document.createElement('div');
  backdrop.className='p2u-v245-more-backdrop';
  backdrop.id='p2u-v245-more-panel';
  backdrop.setAttribute('aria-hidden','true');
  backdrop.innerHTML=`<section class="p2u-v245-more-panel" role="dialog" aria-modal="true" aria-label="More navigation">
    <div class="p2u-v245-more-head"><div><strong>More</strong><small>Full board, news and account tools</small></div><button type="button" class="p2u-v245-more-close" aria-label="Close">×</button></div>
    <div class="p2u-v245-more-grid">${moreLinks.map(item=>`<a href="${item.href}" class="${isActive(item)?'is-active':''}">${svg(item.icon)}<span>${item.label}</span></a>`).join('')}</div>
  </section>`;
  document.body.appendChild(backdrop);

  const moreButton=dock.querySelector('#p2u-v245-more');
  const close=()=>{backdrop.classList.remove('is-open');backdrop.setAttribute('aria-hidden','true');moreButton.setAttribute('aria-expanded','false');document.body.classList.remove('p2u-v245-menu-open');};
  const open=()=>{backdrop.classList.add('is-open');backdrop.setAttribute('aria-hidden','false');moreButton.setAttribute('aria-expanded','true');document.body.classList.add('p2u-v245-menu-open');};
  moreButton.addEventListener('click',()=>backdrop.classList.contains('is-open')?close():open());
  backdrop.addEventListener('click',event=>{if(event.target===backdrop||event.target.closest('.p2u-v245-more-close'))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});

  document.body.classList.add('p2u-v227-ready','p2u-v245-ready','p2u-v245-page-'+active.replace('.html','').replace(/[^a-z0-9-]/g,''));
  document.documentElement.classList.add('p2u-v227-html','p2u-v245-html');

  requestAnimationFrame(()=>{
    const current=nav.querySelector('.p2u-v245-rail .is-active');
    const rail=nav.querySelector('.p2u-v245-rail');
    if(current&&rail)rail.scrollLeft=Math.max(0,current.offsetLeft-(rail.clientWidth-current.offsetWidth)/2);
  });
})();
