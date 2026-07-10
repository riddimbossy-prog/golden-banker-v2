/* Predict2u COMMUNITY — Phase 2 Step 4: social layer.
   Auth + handles + engine board + slips in accounts (Step 3), plus:
   public feed, tails, follows, avatars, dashboard, top user picks, popular slip.
   Honesty is enforced in Postgres — legs freeze on insert, settlement is server-only,
   settled slips are permanent. Aggregates count DISTINCT users, never raw rows.
   Publishable key: safe in the browser; RLS protects the data. */
(function(){
  const SUPA_URL='https://tjbkkhirnwfensqzuvzn.supabase.co';
  const SUPA_KEY='sb_publishable_wjdYr-Px9FmMob7WfEswJQ_wj4cuNkd';
  if(!window.supabase||!window.supabase.createClient){ console.error('supabase-js missing'); return; }
  const sb=window.supabase.createClient(SUPA_URL,SUPA_KEY);
  const $=id=>document.getElementById(id);
  const esc=t=>String(t==null?'':t).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const shortMk=mk=>String(mk||'').replace(/ Goals$/,'').replace('Double Chance 1X','DC 1X').replace('Double Chance X2','DC X2').replace('Double Chance 12','DC 12');
  const ago=d=>{ const s=(Date.now()-new Date(d))/1000;
    if(s<3600) return Math.max(1,Math.floor(s/60))+'m'; if(s<86400) return Math.floor(s/3600)+'h';
    return Math.floor(s/86400)+'d'; };
  let session=null, profile=null, myFollows=new Set();

  const avatar=(url,handle,size)=>{
    const s=size||34;
    if(url) return `<img class="av" src="${esc(url)}" alt="" style="width:${s}px;height:${s}px" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'av av-fb',textContent:'${esc((handle||'?')[0].toUpperCase())}',style:'width:${s}px;height:${s}px;line-height:${s}px'}))"/>`;
    return `<span class="av av-fb" style="width:${s}px;height:${s}px;line-height:${s}px">${esc((handle||'?')[0].toUpperCase())}</span>`;
  };
  const verifiedBadge=v=>v?'<span class="vb" title="20+ settled slip wins — granted by results, never bought">✓</span>':'';
  const rankChip=t=>t?`<span class="rank-chip r-${String(t).toLowerCase()}">${esc(t)}</span>`:'';
  const statusPill=s=>`<span class="pill ${s==='won'?'w':s==='lost'?'l':s==='void'?'v':'o'}">${String(s).toUpperCase()}</span>`;

  /* ================= auth ================= */
  async function loadProfile(){
    if(!session){ profile=null; return; }
    const {data}=await sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
    profile=data||null;
  }
  async function loadMyFollows(){
    myFollows=new Set();
    if(!profile) return;
    const {data}=await sb.from('follows').select('followee_id').eq('follower_id',profile.id);
    (data||[]).forEach(r=>myFollows.add(r.followee_id));
  }
  function showAuth(state){
    ['c-signedout','c-handle','c-signedin'].forEach(id=>{ const el=$(id); if(el) el.style.display='none'; });
    const el=$('c-'+state); if(el) el.style.display='block';
  }
  async function refresh(){
    const {data}=await sb.auth.getSession();
    session=data.session||null;
    if(!session){ showAuth('signedout'); }
    else { await loadProfile(); showAuth(profile?'signedin':'handle'); }
    await loadMyFollows();
    renderDashboard(); renderMySlips(); loadBoard(); loadMembers(); loadFeed(); loadTopPicks(); loadPopular();
  }

  /* ================= engine board (Step 3) ================= */
  const ENGINES=[['Normal','recommend'],['Strict','strictRecommend'],['Ultra','ultraRecommend'],
    ['Elite','rulesProRecommend'],['Apex','apexRecommend'],['Prime','primeRecommend'],
    ['Value','valueRecommend'],['Pro','proRecommend'],['Trend','trendRecommend'],
    ['Streaks','streakRecommend'],['Halves','halvesRecommend'],['Mismatch','mismatchRecommend'],
    ['Market Indicators','indicatorRecommend']]
    .map(([n,f])=>[n,typeof window[f]==='function'?window[f]:null]).filter(e=>e[1]);
  let PICKS=[];
  function buildPicks(){
    const M=window.MATCHES||[];
    const today=new Date().toISOString().slice(0,10);
    const dates=[...new Set(M.map(m=>m.matchDate).filter(Boolean))].sort();
    const day=dates.includes(today)?today:(dates.find(d=>d>today)||today);
    const pool=M.filter(m=>m.matchDate===day && m.homeGoals==null);
    const by={};
    for(const m of pool) for(const [name,fn] of ENGINES){
      let r; try{ r=fn(m); }catch(e){ continue; }
      if(!r||!r.bet||!r.banker) continue;
      const k=(m.id!=null?'f'+m.id:m.home+'|'+m.away);
      by[k]=by[k]||{m,mkts:{}};
      (by[k].mkts[r.primary]=by[k].mkts[r.primary]||[]).push(name);
    }
    PICKS=Object.values(by).map(x=>{ const [market,engines]=Object.entries(x.mkts).sort((a,b)=>b[1].length-a[1].length)[0];
      return {m:x.m,market,engines}; }).sort((a,b)=>b.engines.length-a.engines.length);
    if($('board-date')) $('board-date').textContent=day===today?"Today's bankers":'Next board · '+day;
    renderBoard();
  }
  function renderBoard(){
    if(!$('board')) return;
    const q=($('board-search').value||'').toLowerCase().trim();
    const minE=parseInt($('board-min').value||'1',10);
    const rows=PICKS.filter(p=>p.engines.length>=minE && (!q||(p.m.home+' '+p.m.away+' '+(p.m.league||'')).toLowerCase().includes(q)));
    $('board-count').textContent=`${rows.length} pick${rows.length===1?'':'s'}`;
    $('board').innerHTML=rows.length?rows.map(p=>{
      const btn=(typeof P2USlip!=='undefined')?P2USlip.btn(p.m,p.market):'';
      const fl=p.m.flag?`<img class="fl" src="${esc(p.m.flag)}" alt="" onerror="this.style.display='none'"/>`:'';
      return `<div class="pick">${fl}<div class="who"><div class="t">${esc(p.m.home)} <span style="color:var(--brand)">v</span> ${esc(p.m.away)}</div>
        <div class="m">${esc(p.m.league||'')} · ${p.engines.length} engine${p.engines.length>1?'s':''}: ${esc(p.engines.slice(0,3).join(', '))}${p.engines.length>3?'…':''}</div></div>
        <span class="mk">${esc(shortMk(p.market))}</span>${btn}</div>`;
    }).join(''):`<div class="empty">No upcoming bankers match that filter. The engines stay quiet when the data doesn't support a pick — that's the honest answer.</div>`;
  }

  /* ================= save slip ================= */
  async function saveSlip(isPublic){
    const msg=(t,bad)=>{ if(typeof P2USlip!=='undefined') P2USlip.msg(t,bad); };
    if(!session){ msg('Sign in first — scroll up to the sign-in card.',1); return; }
    if(!profile){ msg('Claim your handle first — scroll up.',1); return; }
    const legs=P2USlip.legs;
    if(!legs.length){ msg('Your slip is empty — add picks from the board.',1); return; }
    const st=P2USlip.state();
    const payload=legs.map(l=>({k:l.k,home:l.home,away:l.away,league:l.league,market:l.market,
      oddsAtAdd:l.odds,kickoff:l.kickoff||null,source:l.source||'engine',engine:l.engine||null}));
    msg('Saving…');
    const {error}=await sb.from('slips').insert({user_id:session.user.id,legs:payload,stake:P2USlip.stake,
      combined_odds:st.priced?Math.round(st.odds*100)/100:null,is_public:!!isPublic,
      tailed_from:P2USlip.tailedFrom||null,
      match_date:(window.MATCHES||[]).find(m=>('f'+m.id)===legs[0].k)?.matchDate||null});
    if(error){ msg('Could not save: '+error.message,1); return; }
    msg(isPublic?'Posted publicly ✓ — it settles itself, win or lose.':'Saved to your account ✓');
    P2USlip.clear(); renderMySlips(); renderDashboard(); loadFeed(); loadTopPicks(); loadPopular();
  }

  /* ================= slip rendering helpers ================= */
  function legRows(legs){
    const M=window.MATCHES||[];
    return (legs||[]).map(l=>{
      const m=M.find(x=>(x.id!=null&&('f'+x.id)===l.k)||(x.home+'|'+x.away+'|'+x.matchDate)===l.k);
      let res=''; if(m&&typeof settle==='function'){ try{ res=settle(l.market,m.homeGoals,m.awayGoals,m.status,m)||''; }catch(e){} }
      const chip=res?`<span class="res ${res==='Won'?'w':res==='Lost'?'l':'v'}">${res.toUpperCase()}</span>`:'<span class="res o">OPEN</span>';
      return `<div class="leg"><span>${esc(l.home)} v ${esc(l.away)} · ${esc(shortMk(l.market))}${l.oddsAtAdd?' @'+l.oddsAtAdd:''}</span>${chip}</div>`;
    }).join('');
  }

  /* ================= my slips ================= */
  async function renderMySlips(){
    const host=$('my-slips'); if(!host) return;
    if(!session||!profile){ host.innerHTML='<div class="empty">Sign in to save slips — they settle themselves and stay on your record.</div>'; return; }
    const {data,error}=await sb.from('slips').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(20);
    if(error||!data){ host.innerHTML='<div class="empty">Could not load your slips.</div>'; return; }
    if(!data.length){ host.innerHTML='<div class="empty">No saved slips yet. Build one from the board above.</div>'; return; }
    host.innerHTML=data.map(s=>`<div class="slip-card"><div class="slip-top">${statusPill(s.status)}
      <span style="font-size:12px;color:var(--muted)">${(s.legs||[]).length} legs${s.combined_odds?' · @'+s.combined_odds:''} · ${s.is_public?'public':'private'}</span>
      <span style="margin-left:auto;font-size:11px;color:var(--muted)">${ago(s.created_at)} ago</span></div>${legRows(s.legs)}</div>`).join('');
  }

  /* ================= dashboard ================= */
  async function renderDashboard(){
    const host=$('dashboard'); if(!host) return;
    if(!profile){ host.style.display='none'; return; }
    host.style.display='block';
    const {data:st}=await sb.from('profile_stats').select('*').eq('id',profile.id).maybeSingle();
    const {data:slips}=await sb.from('slips').select('status').eq('user_id',profile.id);
    const w=(slips||[]).filter(s=>s.status==='won').length, l=(slips||[]).filter(s=>s.status==='lost').length;
    const open=(slips||[]).filter(s=>s.status==='open').length;
    const pct=(w+l)?Math.round(100*w/(w+l)):null;
    $('dash-av').innerHTML=avatar(profile.avatar_url,profile.handle,190);
    $('dash-handle').textContent='@'+profile.handle;
    $('dash-bio').textContent=profile.bio||'No bio yet.';
    $('dash-stats').innerHTML=`
      <div class="stat"><b>${st?st.followers:0}</b><span>Followers</span></div>
      <div class="stat"><b>${st?st.following:0}</b><span>Following</span></div>
      <div class="stat"><b>${open}</b><span>Open slips</span></div>
      <div class="stat"><b>${pct==null?'—':pct+'%'}</b><span>${w}W–${l}L settled</span></div>`;
    const {data:rk}=await sb.from('user_ranks').select('*').eq('user_id',profile.id).maybeSingle();
    if(rk){
      $('dash-handle').innerHTML='@'+esc(profile.handle)+verifiedBadge(rk.verified)+' '+rankChip(rk.rank_tier);
      const toGo=Math.max(0,20-(rk.slips_won||0));
      $('dash-note').innerHTML = rk.verified
        ? 'Verified — 20+ settled slip wins. Granted by results, and it cannot be taken away or bought.'
        : (w+l)===0
          ? 'Your record starts when your first public slip settles. Every result is permanent, win or lose.'
          : `Every settled slip is permanent — wins and losses alike. <b>${toGo} more settled wins</b> to verified.`;
    }
  }

  /* ================= avatar upload ================= */
  async function uploadAvatar(file){
    const msg=t=>{ if($('av-msg')) $('av-msg').textContent=t; };
    if(!profile){ msg('Sign in first.'); return; }
    if(!/^image\/(png|jpe?g|webp)$/.test(file.type)){ msg('PNG, JPG or WebP only.'); return; }
    if(file.size>2*1024*1024){ msg('Keep it under 2MB.'); return; }
    msg('Uploading…');
    const ext=file.name.split('.').pop().toLowerCase();
    const path=`${profile.id}/avatar.${ext}`;
    const {error}=await sb.storage.from('avatars').upload(path,file,{upsert:true,cacheControl:'3600'});
    if(error){ msg('Upload failed: '+error.message); return; }
    const {data}=sb.storage.from('avatars').getPublicUrl(path);
    const url=data.publicUrl+'?t='+Date.now();
    const {error:e2}=await sb.from('profiles').update({avatar_url:url}).eq('id',profile.id);
    if(e2){ msg('Could not save: '+e2.message); return; }
    profile.avatar_url=url; renderDashboard(); loadFeed(); loadMembers(); closeEditor(); flash('Changes made ✓');
  }
  function flash(t){
    let el=$('p2u-flash');
    if(!el){ el=document.createElement('div'); el.id='p2u-flash';
      el.style.cssText='position:fixed;left:50%;transform:translateX(-50%);top:16px;z-index:90;background:var(--brand);color:#06120a;font-weight:800;font-size:13px;border-radius:10px;padding:10px 18px;box-shadow:0 4px 16px rgba(0,0,0,.35)';
      document.body.appendChild(el); }
    el.textContent=t; el.style.display='block';
    clearTimeout(flash._t); flash._t=setTimeout(()=>{ el.style.display='none'; },2000);
  }
  function closeEditor(){ const d=$('edit-profile'); if(d) d.open=false; if($('av-msg')) $('av-msg').textContent=''; }

  async function saveBio(){
    const msg=t=>{ if($('av-msg')) $('av-msg').textContent=t; };
    if(!profile) return;
    const bio=($('bio-input').value||'').trim().slice(0,160);
    const {error}=await sb.from('profiles').update({bio}).eq('id',profile.id);
    if(error){ msg('Could not save bio.'); return; }
    profile.bio=bio; renderDashboard(); closeEditor(); flash('Changes made ✓');
  }

  /* ================= follows ================= */
  async function toggleFollow(id,btn){
    if(!profile){ alert('Sign in to follow.'); return; }
    if(id===profile.id) return;
    if(myFollows.has(id)){
      await sb.from('follows').delete().eq('follower_id',profile.id).eq('followee_id',id);
      myFollows.delete(id); btn.textContent='Follow'; btn.classList.remove('on');
    } else {
      await sb.from('follows').insert({follower_id:profile.id,followee_id:id});
      myFollows.add(id); btn.textContent='Following'; btn.classList.add('on');
    }
    renderDashboard(); loadMembers();
  }

  /* ================= tail ================= */
  async function tailSlip(slipId,legs,handle){
    legs=legs||[];
    if(!profile){ alert('Sign in to copy a slip.'); return; }
    if(typeof P2USlip!=='undefined'){ P2USlip.load(legs.map(l=>({k:l.k,home:l.home,away:l.away,league:l.league,
      market:l.market,odds:l.oddsAtAdd,kickoff:l.kickoff,source:'tail',engine:l.engine})), {id:slipId,handle}); }
    await sb.from('tails').upsert({slip_id:slipId,user_id:profile.id});
    loadPopular();
    const fab=document.getElementById('p2u-slip-fab'); if(fab) fab.click();
  }

  /* ================= users board (hit rate, minimum sample) ================= */
  async function loadBoard(){
    const host=$('users-board'); if(!host) return;
    const {data,error}=await sb.from('leaderboard').select('*').limit(20);
    if(error){ host.innerHTML='<div class="empty">Could not load the board.</div>'; return; }
    if(!data||!data.length){
      host.innerHTML='<div class="empty">Nobody has five settled slips yet. The board ranks by hit rate once there is enough of a record to mean something — no shortcuts, no small samples.</div>'; return; }
    host.innerHTML=`<div class="lb-note">Ranked by hit rate over at least five settled slips. Units are shown, never ranked on — profit rewards staking more, not picking better.</div>`+
      data.map((u,i)=>`<div class="lb-row${profile&&u.user_id===profile.id?' me':''}">
        <span class="lb-pos">${i+1}</span>
        ${avatar(u.avatar_url,u.handle,36)}
        <div class="lb-who"><div class="lb-h">@${esc(u.handle)}${verifiedBadge(u.verified)}</div>
          <div class="lb-m">${rankChip(u.rank_tier)} ${u.settled} settled</div></div>
        <div class="lb-stat"><b>${u.hit_pct}%</b><span>${u.slips_won}W–${u.slips_lost}L</span></div>
        <div class="lb-stat"><b class="${u.units_pl>=0?'up':'down'}">${u.units_pl>=0?'+':''}${Number(u.units_pl).toFixed(1)}</b><span>units</span></div>
      </div>`).join('');
  }

  /* ================= members (browse + follow) ================= */
  async function loadMembers(){
    const host=$('members'); if(!host) return;
    const {data,error}=await sb.from('profile_stats').select('*').order('followers',{ascending:false}).limit(24);
    if(error||!data||!data.length){ host.innerHTML='<div class="empty">No members yet.</div>'; return; }
    host.innerHTML=data.map(u=>{
      const isMe=profile&&u.id===profile.id;
      const following=myFollows.has(u.id);
      const btn=isMe?'<span class="you">You</span>'
        :(!profile?'<span class="you" style="color:var(--muted)">Sign in to follow</span>'
        :`<button class="follow ${following?'on':''}" data-follow="${u.id}">${following?'Following':'Follow'}</button>`);
      return `<div class="member">${avatar(u.avatar_url,u.handle,110)}
        <div class="mh">@${esc(u.handle)}${verifiedBadge(u.verified)}</div>
        <div class="mr">${rankChip(u.rank_tier)}${u.hit_pct?` <span style="font-size:10.5px;color:var(--muted)">${u.hit_pct}%</span>`:''}</div>
        <div class="mb">${esc(u.bio||'')}</div>
        <div class="mstats">${u.followers} follower${u.followers==1?'':'s'} · ${u.public_slips} slip${u.public_slips==1?'':'s'}</div>
        ${btn}</div>`;
    }).join('');
    host.querySelectorAll('[data-follow]').forEach(b=>b.addEventListener('click',()=>toggleFollow(b.dataset.follow,b)));
  }

  /* ================= public feed ================= */
  let feedMine=false;
  async function loadFeed(){
    const host=$('feed'); if(!host) return;
    let q=sb.from('public_slips').select('*');
    if(feedMine&&profile) q=q.in('user_id',[...myFollows,profile.id]);
    q=q.order('created_at',{ascending:false}).limit(20);
    const {data,error}=await q;
    if(error){ host.innerHTML='<div class="empty">Could not load the feed.</div>'; return; }
    if(!data.length){ host.innerHTML=`<div class="empty">${feedMine?'Nobody you follow has posted a public slip yet.':'No public slips yet. Be the first — build one above and post it publicly.'}</div>`; return; }
    host.innerHTML=data.map(s=>{
      const isMe=profile&&s.user_id===profile.id;
      const following=myFollows.has(s.user_id);
      const followBtn=(!profile||isMe)?'':`<button class="follow ${following?'on':''}" data-follow="${s.user_id}">${following?'Following':'Follow'}</button>`;
      const credit=s.tailed_from_handle?`<span class="credit">copied from <b>@${esc(s.tailed_from_handle)}</b></span>`:'';
      return `<div class="slip-card"><div class="slip-top">
          ${avatar(s.avatar_url,s.handle,44)}
          <span style="font-weight:700">@${esc(s.handle)}</span>${credit}${followBtn}
          <span style="margin-left:auto;font-size:11px;color:var(--muted)">${ago(s.created_at)} ago</span></div>
        <div class="slip-top" style="margin-bottom:6px">${statusPill(s.status)}
          <span style="font-size:12px;color:var(--muted)">${(s.legs||[]).length} legs${s.combined_odds?' · @'+s.combined_odds:''}${s.tail_count?' · copied '+s.tail_count+'×':''}</span></div>
        ${legRows(s.legs)}
        <div style="display:flex;gap:8px;margin-top:10px">
          ${s.status==='open'?`<button class="mini" data-tail="${s.id}">Copy this slip</button>`:''}
          ${profile&&!isMe?`<button class="mini ghost" data-report="${s.id}">Report</button>`:''}
        </div></div>`;
    }).join('');
    host.querySelectorAll('[data-tail]').forEach(b=>b.addEventListener('click',()=>{
      const s=data.find(x=>x.id===b.dataset.tail); if(s) tailSlip(s.id,s.legs,s.handle); }));
    host.querySelectorAll('[data-follow]').forEach(b=>b.addEventListener('click',()=>toggleFollow(b.dataset.follow,b)));
    host.querySelectorAll('[data-report]').forEach(b=>b.addEventListener('click',async()=>{
      const reason=prompt('What is wrong with this slip? (a short reason)');
      if(!reason||reason.trim().length<3) return;
      await sb.from('reports').insert({slip_id:b.dataset.report,reporter_id:profile.id,reason:reason.trim().slice(0,300)});
      b.textContent='Reported'; b.disabled=true;
    }));
  }

  /* ================= top user picks (real counts, honest thresholds) ================= */
  async function loadTopPicks(){
    const host=$('top-picks'); if(!host) return;
    const {data,error}=await sb.from('top_user_picks').select('*').limit(6);
    if(error||!data||!data.length){
      host.innerHTML='<div class="empty">No user picks yet — the community\'s six most-backed picks appear here once people start posting public slips.</div>'; return; }
    const total=data.reduce((a,b)=>a+Number(b.backers),0);
    if(total<3){ host.innerHTML='<div class="empty">Too few public slips so far to call anything popular. This fills in as the community posts — no padding.</div>'; return; }
    host.innerHTML=data.map((p,i)=>`<div class="pick"><span class="rank">${i+1}</span>
      <div class="who"><div class="t">${esc(p.home)} <span style="color:var(--brand)">v</span> ${esc(p.away)}</div>
      <div class="m">${esc(p.league||'')} · backed by ${p.backers} user${p.backers>1?'s':''}</div></div>
      <span class="mk">${esc(shortMk(p.market))}</span></div>`).join('');
  }

  /* ================= most popular slip ================= */
  async function loadPopular(){
    const host=$('popular'); if(!host) return;
    const {data}=await sb.from('popular_slips').select('*').limit(1);
    const s=data&&data[0];
    if(!s||!s.tail_count){ host.innerHTML='<div class="empty">No slip has been copied yet this week. The most-copied slip shows up here.</div>'; return; }
    host.innerHTML=`<div class="slip-card" style="border-color:var(--gold)">
      <div class="slip-top">${avatar(s.avatar_url,s.handle,44)}<span style="font-weight:700">@${esc(s.handle)}</span>
        <span class="pill gold">COPIED ${s.tail_count}×</span>
        <span style="margin-left:auto;font-size:11px;color:var(--muted)">${ago(s.created_at)} ago</span></div>
      <div class="slip-top" style="margin-bottom:6px">${statusPill(s.status)}
        <span style="font-size:12px;color:var(--muted)">${(s.legs||[]).length} legs${s.combined_odds?' · @'+s.combined_odds:''}</span></div>
      ${legRows(s.legs)}</div>`;
  }

  /* ================= wire ================= */
  document.addEventListener('DOMContentLoaded',()=>{
    const msg=(id,t,bad)=>{ const el=$(id); if(el){ el.textContent=t; el.style.color=bad?'#e07a7a':'var(--brand-2)'; } };
    $('c-send').addEventListener('click',async()=>{
      const email=($('c-mail').value||'').trim();
      if(!/^\S+@\S+\.\S+$/.test(email)){ msg('c-out-msg','Enter a valid email address.',1); return; }
      msg('c-out-msg','Sending your sign-in link…');
      const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+'/community.html'}});
      msg('c-out-msg',error?('Could not send: '+error.message):'Link sent — open it on THIS device.',!!error);
    });
    $('c-claim').addEventListener('click',async()=>{
      const handle=($('c-handle-input').value||'').trim();
      if(!/^[a-zA-Z0-9_]{3,20}$/.test(handle)){ msg('c-handle-msg','3–20 characters: letters, numbers, underscore.',1); return; }
      msg('c-handle-msg','Claiming…');
      const {error}=await sb.from('profiles').insert({id:session.user.id,handle});
      if(error){ msg('c-handle-msg',/duplicate|unique/i.test(error.message)?'That handle is taken — try another.':error.message,1); return; }
      await loadProfile(); showAuth('signedin'); refresh();
    });
    $('c-signout').addEventListener('click',async()=>{ await sb.auth.signOut(); await refresh(); });
    $('board-search').addEventListener('input',renderBoard);
    $('board-min').addEventListener('change',renderBoard);
    if(typeof P2USlip!=='undefined') P2USlip.onSave(isPublic=>saveSlip(isPublic));
    $('av-file').addEventListener('change',e=>{ if(e.target.files[0]) uploadAvatar(e.target.files[0]); });
    $('bio-save').addEventListener('click',saveBio);
    const ed=$('edit-profile');
    if(ed) ed.addEventListener('toggle',()=>{ if(ed.open&&profile){ if($('bio-input')) $('bio-input').value=profile.bio||'';
      if($('em-wins')) $('em-wins').checked=profile.email_wins!==false;
      if($('em-digest')) $('em-digest').checked=profile.email_digest!==false; } });
    const savePrefs=async()=>{
      if(!profile) return;
      const email_wins=$('em-wins').checked, email_digest=$('em-digest').checked;
      const {error}=await sb.from('profiles').update({email_wins,email_digest}).eq('id',profile.id);
      if(!error){ profile.email_wins=email_wins; profile.email_digest=email_digest; flash('Email preferences saved ✓'); }
    };
    if($('em-wins')) $('em-wins').addEventListener('change',savePrefs);
    if($('em-digest')) $('em-digest').addEventListener('change',savePrefs);
    $('feed-all').addEventListener('click',()=>{ feedMine=false; $('feed-all').classList.add('on'); $('feed-following').classList.remove('on'); loadFeed(); });
    $('feed-following').addEventListener('click',()=>{ if(!profile){ alert('Sign in to see who you follow.'); return; }
      feedMine=true; $('feed-following').classList.add('on'); $('feed-all').classList.remove('on'); loadFeed(); });
    sb.auth.onAuthStateChange(()=>refresh());
    buildPicks(); refresh();
  });
  window.P2UC={sb,get session(){return session;},get profile(){return profile;},refresh};
})();
