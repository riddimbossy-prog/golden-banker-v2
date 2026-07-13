(function(){
  'use strict';
  if(document.querySelector('.p2u-v227-nav-wrap')) return;

  const page=(location.pathname.split('/').pop()||'board.html').toLowerCase();
  const active=(page===''||page==='index.html')?'board.html':page;
  const svg=(name)=>{
    const icons={
      picks:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16M8 13h3M13 13h3M8 17h3"/></svg>',
      bankers:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12l2 5-8 11L4 9z"/><path d="M8 9h8M10 4l2 5 2-5"/></svg>',
      news:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
      community:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1"/></svg>',
      account:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'
    };
    return icons[name]||icons.picks;
  };
  const links=[
    {href:'board.html',label:'Picks',icon:'picks'},
    {href:'bankers.html',label:'Bankers',icon:'bankers'},
    {href:'news.html',label:'News',icon:'news'},
    {href:'community.html',label:'Community',icon:'community'}
  ];
  const isActive=item=>active===item.href;

  const nav=document.createElement('nav');
  nav.className='p2u-v227-nav-wrap p2u-simple-nav';
  nav.setAttribute('aria-label','Primary navigation');
  nav.innerHTML=`
    <div class="p2u-v227-shell">
      <a class="p2u-v227-brand" href="board.html" aria-label="Predict2U picks"><img src="predict2u-logo.png" alt="Predict2U"/></a>
      <div class="p2u-v227-rail" role="navigation">
        ${links.map(item=>`<a href="${item.href}" class="p2u-v227-link${isActive(item)?' is-active':''}"${isActive(item)?' aria-current="page"':''}>${svg(item.icon)}<span>${item.label}</span></a>`).join('')}
      </div>
      <div class="p2u-v227-side">
        <a id="user-chip" class="p2u-v227-user" href="account.html" aria-label="Account">
          <span class="p2u-v227-user-copy"><strong id="user-name">Sign in</strong><small id="user-sub">Account</small></span>
          <span id="user-av" class="p2u-v227-avatar">${svg('account')}</span>
        </a>
      </div>
    </div>`;
  document.body.prepend(nav);

  const dock=document.createElement('nav');
  dock.className='p2u-v227-dock p2u-simple-dock';
  dock.setAttribute('aria-label','Mobile navigation');
  dock.innerHTML=links.map(item=>`<a href="${item.href}" class="${isActive(item)?'is-active':''}">${svg(item.icon)}<span>${item.label}</span></a>`).join('');
  document.body.appendChild(dock);

  document.body.classList.add('p2u-v227-ready','p2u-simple-ready','p2u-v227-page-'+active.replace('.html','').replace(/[^a-z0-9-]/g,''));
  document.documentElement.classList.add('p2u-v227-html');

  requestAnimationFrame(()=>{
    const rail=nav.querySelector('.p2u-v227-rail');
    const current=rail.querySelector('.is-active');
    if(current) rail.scrollLeft=Math.max(0,current.offsetLeft-(rail.clientWidth-current.offsetWidth)/2);
  });
})();
