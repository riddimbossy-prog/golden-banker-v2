
(function(){
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const links = [
    {href:'index.html',label:'Overview',icon:'fa-solid fa-compass'},
    {href:'board.html',label:"Today's Board",icon:'fa-regular fa-calendar-check'},
    {href:'engines.html',label:'Full Board',icon:'fa-solid fa-table-cells-large'},
    {href:'proof.html',label:'Proof',icon:'fa-solid fa-shield-halved'},
    {href:'scorecards.html',label:'Scorecards',icon:'fa-solid fa-chart-column'},
    {href:'league-dna.html',label:'League DNA',icon:'fa-solid fa-dna'},
    {href:'community.html',label:'Community',icon:'fa-solid fa-users'},
    {href:'news.html',label:'News',icon:'fa-regular fa-newspaper'}
  ];
  const moreLinks = [
    ...links,
    {href:'account.html',label:'Account',icon:'fa-regular fa-user'},
    {href:'trust.html',label:'Trust Center',icon:'fa-solid fa-circle-info'},
    {href:'terms.html',label:'Terms',icon:'fa-regular fa-file-lines'},
    {href:'privacy.html',label:'Privacy',icon:'fa-solid fa-shield'},
  ];
  const activeHref = links.find(l=>path===l.href) ? path : (path==='index.html'||path==='') ? 'index.html' : path;
  const nav = document.createElement('div');
  nav.className = 'p2u-phase2-nav-wrap';
  nav.innerHTML = `
    <div class="p2u-phase2-shell">
      <div class="p2u-phase2-top">
        <a href="index.html" class="p2u-phase2-brand" aria-label="Predict2U home">
          <img src="predict2u-logo.png" alt="Predict2U"/>
          <span class="p2u-phase2-brand-copy"><strong>Predict2U</strong><span>Know the game. Predict better.</span></span>
        </a>
        <div class="p2u-phase2-utility">
          <span class="p2u-phase2-live"><span class="p2u-phase2-live-dot"></span>LIVE <span id="live-stamp" class="p2u-phase2-live-time">· --:--</span></span>
        </div>
        <div class="p2u-phase2-side">
          <a href="account.html" id="user-chip" class="p2u-phase2-user"><span><span id="user-name">Sign in</span><span class="p2u-phase2-user-sub"><em id="user-sub">Cloud sync</em><span class="p2u-phase2-sync-dot"></span></span></span><span id="user-av"><i class="fa-solid fa-user"></i></span></a>
        </div>
      </div>
      <div class="p2u-phase2-rail" aria-label="Primary navigation">
        ${links.map(l=>`<a href="${l.href}" class="p2u-phase2-link${activeHref===l.href?' is-active':''}"><i class="${l.icon}"></i><span>${l.label}</span></a>`).join('')}
      </div>
    </div>`;
  document.body.insertBefore(nav, document.body.firstChild);
  document.body.classList.add('p2u-phase2-ready','p2u-phase2-page-'+path.replace('.html','').replace(/[^a-z0-9-]/g,''));

  const dock = document.createElement('div');
  dock.className = 'p2u-phase2-dock';
  const dockLinks = [links[0],links[1],links[2],links[3]];
  dock.innerHTML = dockLinks.map(l=>`<a href="${l.href}" class="${activeHref===l.href?'is-active':''}"><i class="${l.icon}"></i><span>${l.label.replace("Today's ",'')}</span></a>`).join('') + `<button type="button" id="p2u-phase2-more"><i class="fa-solid fa-ellipsis"></i><span>More</span></button>`;
  document.body.appendChild(dock);

  const more = document.createElement('div');
  more.className = 'p2u-phase2-more-backdrop';
  more.innerHTML = `<div class="p2u-phase2-more-panel"><div class="p2u-phase2-more-head"><div><strong>Explore Predict2U</strong><div style="color:var(--p2u2-muted);font-size:12px;margin-top:4px">Every tab stays reachable on phones, tablets and foldables.</div></div><button type="button" class="p2u-phase2-close" aria-label="Close menu">×</button></div><div class="p2u-phase2-more-grid">${moreLinks.map(l=>`<a href="${l.href}" class="p2u-phase2-more-link"><i class="${l.icon}"></i><span>${l.label}</span></a>`).join('')}</div></div>`;
  document.body.appendChild(more);

  const openMore = ()=>more.classList.add('is-open');
  const closeMore = ()=>more.classList.remove('is-open');
  dock.querySelector('#p2u-phase2-more').addEventListener('click', openMore);
  more.addEventListener('click', e=>{ if(e.target===more || e.target.closest('.p2u-phase2-close')) closeMore(); });

  function tick(){
    const el = document.getElementById('live-stamp');
    if(el) el.textContent = '· ' + new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
  tick(); setInterval(tick, 60000);

  const activeRail = nav.querySelector('.p2u-phase2-link.is-active');
  if(activeRail && activeRail.scrollIntoView){ setTimeout(()=>activeRail.scrollIntoView({inline:'center',block:'nearest'}), 50); }
})();
