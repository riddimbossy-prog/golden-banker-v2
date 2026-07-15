(function(){
  'use strict';
  const X=window.P2UEngineExperience;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value==null?'':value).replace(/[<>&"]/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
  if(!X)return;
  const registry=(window.P2U_ENGINE_REGISTRY||[]).filter(engine=>typeof window[engine.fn]==='function');
  const params=new URLSearchParams(location.search);
  let key=params.get('engine')||registry[0]&&registry[0].key;
  let engine=registry.find(item=>item.key===key)||registry[0];
  if(!engine){document.body.innerHTML='<div class="engine-empty">No engine registry is available.</div>';return;}
  const matches=Array.isArray(window.MATCHES)?window.MATCHES:[];
  const today=new Date().toISOString().slice(0,10);
  let activeDate=/^\d{4}-\d{2}-\d{2}$/.test(params.get('date')||'')?params.get('date'):today;
  const dates=[...new Set([today,...matches.map(X.dateOf).filter(Boolean)])].sort().filter(date=>date>=today).slice(0,7);
  if(!dates.includes(activeDate))dates.unshift(activeDate);

  const palette=X.paletteFor(engine.key);
  document.documentElement.style.setProperty('--engine-accent',palette[0]);
  document.documentElement.style.setProperty('--engine-dark',palette[1]);
  document.title=`${engine.name} Engine • Predict2U`;
  $('engine-mark').textContent=X.initials(engine.name);
  $('engine-family').textContent=`${engine.family||'Prediction Engine'} · v${engine.version||'1.0'}`;
  $('engine-name').textContent=`${engine.name} Engine`;
  $('engine-description').textContent=engine.description||'Specialized Predict2U football prediction engine.';
  $('engine-chip-family').textContent=engine.family||'Engine';
  $('engine-chip-version').textContent=`Version ${engine.version||'1.0'}`;
  $('engine-chip-status').textContent='Active model';

  const switcher=$('engine-switcher');
  switcher.innerHTML=registry.map(item=>`<option value="${esc(item.key)}"${item.key===engine.key?' selected':''}>${esc(item.name)}</option>`).join('');
  switcher.addEventListener('change',()=>{location.href=`engine.html?engine=${encodeURIComponent(switcher.value)}`;});

  const marketShort=market=>String(market||'').replace(/ Goals$/,'').replace('Home Team ','Home ').replace('Away Team ','Away ');
  const matchStatus=match=>{
    const status=String(match&&match.status||'').toUpperCase();
    if(['1H','HT','2H','ET','P','LIVE'].includes(status))return 'Live';
    if(match&&match.homeGoals!=null&&match.awayGoals!=null)return `${match.homeGoals}-${match.awayGoals}`;
    return X.timeLabel(match);
  };
  function addOne(pick){
    if(!window.P2USlip)return;
    P2USlip.add(pick.match,pick.market,engine.name);
    if(typeof P2USlip.open==='function')P2USlip.open();
  }
  function addPack(rows,button){
    if(!window.P2USlip)return;
    const result=P2USlip.addMany(rows.map(row=>({m:row.match,market:row.market,engine:engine.name})),engine.name);
    if(button){const original=button.textContent;button.textContent=result.added?`Added ${result.added}`:'Already in slip';setTimeout(()=>button.textContent=original,1300);}
    if(typeof P2USlip.open==='function')P2USlip.open();
  }
  function renderDates(){
    $('engine-date-rail').innerHTML=dates.map(date=>{
      const d=new Date(`${date}T12:00:00Z`);
      const day=d.toLocaleDateString('en-GB',{weekday:'short'});
      const dm=d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
      return `<button class="engine-date${date===activeDate?' is-active':''}" data-date="${date}"><b>${esc(day)}</b><span>${esc(dm)}</span></button>`;
    }).join('');
    $('engine-date-rail').querySelectorAll('[data-date]').forEach(button=>button.addEventListener('click',()=>{
      activeDate=button.dataset.date;
      history.replaceState(null,'',`engine.html?engine=${encodeURIComponent(engine.key)}&date=${activeDate}`);
      renderDates();render();
    }));
  }
  function pickCard(pick,index){
    const match=pick.match;
    const reasons=pick.reasons.length?pick.reasons:['This fixture passed the engine’s current qualification rules.'];
    const bookCount=Number(match&&match.oddsMeta&&match.oddsMeta.bookCount)||0;
    const oddsBadge=bookCount?`<span class="engine-badge">${bookCount} books</span>`:(match&&match.odds?'<span class="engine-badge">Odds loaded</span>':'');
    const htftBadge=match&&match.htftOdds&&match.htftOdds.actual?'<span class="engine-badge">HT/FT priced</span>':(match&&match.htftSignal?'<span class="engine-badge">HT/FT signal</span>':'');
    return `<article class="engine-pick-card">
      <div class="engine-pick-top"><div class="engine-league">${esc(match.country?match.country+' · ':'')}${esc(match.league||'Competition')}</div><span class="engine-market">${esc(marketShort(pick.market))}</span></div>
      <div class="engine-teams">${esc(match.home)}<br><span style="color:var(--engine-muted);font-weight:600">vs</span> ${esc(match.away)}</div>
      <div class="engine-badges"><span class="engine-badge${pick.banker?' is-banker':''}">${pick.banker?'Banker':'Qualified'}</span><span class="engine-badge">${pick.confidence.toFixed(1)}/10</span><span class="engine-badge">${esc(matchStatus(match))}</span>${pick.odd?`<span class="engine-badge">@ ${pick.odd.toFixed(2)}</span>`:''}${oddsBadge}${htftBadge}</div>
      <ul class="engine-reasons">${reasons.map(reason=>`<li>• ${esc(reason)}</li>`).join('')}</ul>
      <div class="engine-card-foot"><small style="color:var(--engine-muted)">Pick ${index+1}</small><button type="button" data-add="${index}">+ My Slip</button></div>
    </article>`;
  }
  function render(){
    const rows=X.runEngine(matches,engine,activeDate);
    const top=X.topPicks(matches,engine,activeDate,3);
    const fixtureCount=matches.filter(match=>X.dateOf(match)===activeDate).length;
    $('engine-date-label').textContent=X.dateLabel(activeDate);
    $('stat-fixtures').textContent=fixtureCount;
    $('stat-picks').textContent=rows.length;
    $('stat-bankers').textContent=rows.filter(row=>row.banker).length;
    $('stat-top').textContent=top.length;
    $('engine-picks-title').textContent=`${engine.name} picks`;
    $('engine-picks-copy').textContent=`Qualified selections for ${X.dateLabel(activeDate)}.`;

    const acca=$('engine-acca');
    if(top.length){
      let combined=1,priced=0;
      top.forEach(row=>{if(row.odd){combined*=row.odd;priced++;}});
      acca.innerHTML=`<div class="engine-section-head"><div><h2>${esc(engine.name)} Top ${top.length}</h2><p>Up to three highest-ranked picks from this engine.</p></div><span class="engine-chip">${priced===top.length?`Combined ${combined.toFixed(2)}`:`${priced}/${top.length} priced`}</span></div>
      <div class="engine-acca-list">${top.map((pick,index)=>`<div class="engine-acca-leg"><span class="engine-leg-no">${index+1}</span><div><div class="engine-leg-teams">${esc(pick.match.home)} v ${esc(pick.match.away)}</div><div class="engine-leg-meta">${esc(pick.match.league||'')} · ${pick.banker?'Banker':'Top qualified'} · ${pick.confidence.toFixed(1)}/10</div></div><span class="engine-market">${esc(marketShort(pick.market))}${pick.odd?` · ${pick.odd.toFixed(2)}`:''}</span></div>`).join('')}</div>
      <div class="engine-acca-foot"><span style="color:var(--engine-muted);font-size:12px">No filler is added when fewer than three picks qualify.</span><button class="engine-primary-btn" id="engine-add-pack">Add all ${top.length} to My Slip</button></div>`;
      $('engine-add-pack').addEventListener('click',event=>addPack(top,event.currentTarget));
    }else{
      acca.innerHTML='<div class="engine-empty"><strong>No engine acca today</strong>No selection passed this engine’s rules for this date.</div>';
    }
    const grid=$('engine-picks-grid');
    grid.innerHTML=rows.length?rows.map(pickCard).join(''):'<div class="engine-empty" style="grid-column:1/-1"><strong>No qualified picks</strong>The engine rejected every fixture rather than forcing a selection.</div>';
    grid.querySelectorAll('[data-add]').forEach(button=>button.addEventListener('click',()=>addOne(rows[Number(button.dataset.add)])));
  }
  renderDates();render();
})();
