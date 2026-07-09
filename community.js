/* Predict2u COMMUNITY — Phase 2 Step 3
   Auth (magic link) + handles + engine pick board + slips saved to accounts.
   The database enforces honesty: legs freeze at insert, settlement is server-only,
   settled slips can never be deleted. This file only talks to it.
   Publishable key — safe in the browser; RLS is what protects the data. */
(function(){
  const SUPA_URL='https://tjbkkhirnwfensqzuvzn.supabase.co';
  const SUPA_KEY='sb_publishable_wjdYr-Px9FmMob7WfEswJQ_wj4cuNkd';
  if(!window.supabase||!window.supabase.createClient){ console.error('supabase-js missing'); return; }
  const sb=window.supabase.createClient(SUPA_URL,SUPA_KEY);
  const $=id=>document.getElementById(id);
  const esc=t=>String(t==null?'':t).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const shortMk=mk=>String(mk||'').replace(/ Goals$/,'').replace('Double Chance 1X','DC 1X').replace('Double Chance X2','DC X2').replace('Double Chance 12','DC 12');
  let session=null, profile=null;

  /* ---------------- auth ---------------- */
  async function loadProfile(){
    if(!session){ profile=null; return; }
    const {data}=await sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
    profile=data||null;
  }
  function showAuth(state){
    ['c-signedout','c-handle','c-signedin'].forEach(id=>{ const el=$(id); if(el) el.style.display='none'; });
    const el=$('c-'+state); if(el) el.style.display='block';
    if(state==='signedin'&&profile){ $('c-hello').textContent='@'+profile.handle; $('c-email').textContent=session.user.email||''; }
  }
  async function refresh(){
    const {data}=await sb.auth.getSession();
    session=data.session||null;
    if(!session){ showAuth('signedout'); renderMySlips(); return; }
    await loadProfile();
    showAuth(profile?'signedin':'handle');
    renderMySlips();
  }

  /* ---------------- engine pick board ---------------- */
  const ENGINES=[['Normal','recommend'],['Strict','strictRecommend'],['Ultra','ultraRecommend'],
    ['Elite','rulesProRecommend'],['Apex','apexRecommend'],['Prime','primeRecommend'],
    ['Value','valueRecommend'],['Pro','proRecommend'],['Trend','trendRecommend'],
    ['Streaks','streakRecommend'],['Halves','halvesRecommend'],['Mismatch','mismatchRecommend'],
    ['Market Indicators','indicatorRecommend']]
    .map(([n,f])=>[n, typeof window[f]==='function'?window[f]:null]).filter(e=>e[1]);

  let PICKS=[];
  function buildPicks(){
    const M=window.MATCHES||[];
    const today=new Date().toISOString().slice(0,10);
    const dates=[...new Set(M.map(m=>m.matchDate).filter(Boolean))].sort();
    const day=dates.includes(today)?today:(dates.find(d=>d>today)||today);
    const pool=M.filter(m=>m.matchDate===day && m.homeGoals==null); // upcoming only — you can't add a finished game
    const by={};
    for(const m of pool) for(const [name,fn] of ENGINES){
      let r; try{ r=fn(m); }catch(e){ continue; }
      if(!r||!r.bet||!r.banker) continue;
      const k=(m.id!=null?'f'+m.id:m.home+'|'+m.away);
      by[k]=by[k]||{m,mkts:{}};
      (by[k].mkts[r.primary]=by[k].mkts[r.primary]||[]).push(name);
    }
    PICKS=Object.values(by).map(x=>{
      const [market,engines]=Object.entries(x.mkts).sort((a,b)=>b[1].length-a[1].length)[0];
      return {m:x.m, market, engines};
    }).sort((a,b)=>b.engines.length-a.engines.length);
    $('board-date').textContent = day===today ? "Today's bankers" : 'Next board · '+day;
    renderBoard();
  }
  function renderBoard(){
    const q=($('board-search').value||'').toLowerCase().trim();
    const minE=parseInt($('board-min').value||'1',10);
    const rows=PICKS.filter(p=>p.engines.length>=minE &&
      (!q || (p.m.home+' '+p.m.away+' '+(p.m.league||'')).toLowerCase().includes(q)));
    $('board-count').textContent=`${rows.length} pick${rows.length===1?'':'s'}`;
    $('board').innerHTML = rows.length ? rows.map(p=>{
      const btn = (typeof P2USlip!=='undefined') ? P2USlip.btn(p.m,p.market) : '';
      const fl = p.m.flag?`<img class="fl" src="${esc(p.m.flag)}" alt="" onerror="this.style.display='none'"/>`:'';
      return `<div class="pick">${fl}
        <div class="who"><div class="t">${esc(p.m.home)} <span style="color:var(--brand)">v</span> ${esc(p.m.away)}</div>
        <div class="m">${esc(p.m.league||'')} · ${p.engines.length} engine${p.engines.length>1?'s':''}: ${esc(p.engines.slice(0,3).join(', '))}${p.engines.length>3?'…':''}</div></div>
        <span class="mk">${esc(shortMk(p.market))}</span>${btn}</div>`;
    }).join('') : `<div class="empty">No upcoming bankers match that filter. The engines stay quiet when the data doesn't support a pick — that's the honest answer.</div>`;
  }

  /* ---------------- save slip to account ---------------- */
  async function saveSlip(isPublic){
    const msg=t=>{ const el=$('save-msg'); if(el) el.textContent=t; };
    if(!session||!profile){ msg('Sign in and claim a handle first.'); return; }
    const legs=P2USlip.legs;
    if(!legs.length){ msg('Your slip is empty — add picks from the board.'); return; }
    const st=P2USlip.state();
    const payload=legs.map(l=>({ k:l.k, home:l.home, away:l.away, league:l.league,
      market:l.market, oddsAtAdd:l.odds, kickoff:l.kickoff||null, source:l.source||'engine', engine:l.engine||null }));
    msg('Saving…');
    const {error}=await sb.from('slips').insert({
      user_id:session.user.id, legs:payload, stake:P2USlip.stake,
      combined_odds: st.priced? Math.round(st.odds*100)/100 : null,
      is_public: !!isPublic, match_date: (window.MATCHES||[]).find(m=>('f'+m.id)===legs[0].k)?.matchDate || null
    });
    if(error){ msg('Could not save: '+error.message); return; }
    msg(isPublic?'Saved and posted publicly ✓ — it settles itself, win or lose.':'Saved to your account ✓');
    P2USlip.clear(); renderMySlips();
  }

  /* ---------------- my slips ---------------- */
  async function renderMySlips(){
    const host=$('my-slips'); if(!host) return;
    if(!session||!profile){ host.innerHTML='<div class="empty">Sign in to save slips to your account — they settle themselves and stay on your record.</div>'; return; }
    const {data,error}=await sb.from('slips').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(20);
    if(error){ host.innerHTML='<div class="empty">Could not load your slips.</div>'; return; }
    if(!data.length){ host.innerHTML='<div class="empty">No saved slips yet. Build one from the board above and save it.</div>'; return; }
    const M=window.MATCHES||[];
    host.innerHTML=data.map(s=>{
      const legs=(s.legs||[]).map(l=>{
        const m=M.find(x=>('f'+x.id)===l.k || (x.home+'|'+x.away+'|'+x.matchDate)===l.k);
        let res=''; if(m&&typeof settle==='function'){ try{ res=settle(l.market,m.homeGoals,m.awayGoals,m.status,m)||''; }catch(e){} }
        const chip=res?`<span class="res ${res==='Won'?'w':res==='Lost'?'l':'v'}">${res.toUpperCase()}</span>`:'<span class="res o">OPEN</span>';
        return `<div class="leg"><span>${esc(l.home)} v ${esc(l.away)} · ${esc(shortMk(l.market))}${l.oddsAtAdd?' @'+l.oddsAtAdd:''}</span>${chip}</div>`;
      }).join('');
      const badge=s.status==='open'?'<span class="pill o">OPEN</span>':`<span class="pill ${s.status==='won'?'w':s.status==='lost'?'l':'v'}">${s.status.toUpperCase()}</span>`;
      return `<div class="slip-card">
        <div class="slip-top">${badge}
          <span style="font-size:12px;color:var(--muted)">${s.legs.length} legs${s.combined_odds?' · @'+s.combined_odds:''} · ${s.is_public?'public':'private'}</span>
          <span style="margin-left:auto;font-size:11px;color:var(--muted)">${new Date(s.created_at).toLocaleDateString()}</span></div>
        ${legs}</div>`;
    }).join('');
  }

  /* ---------------- wire ---------------- */
  document.addEventListener('DOMContentLoaded',()=>{
    const msg=(id,t,bad)=>{ const el=$(id); if(el){ el.textContent=t; el.style.color=bad?'#e07a7a':'var(--brand-2)'; } };
    $('c-send').addEventListener('click',async()=>{
      const email=($('c-mail').value||'').trim();
      if(!/^\S+@\S+\.\S+$/.test(email)){ msg('c-out-msg','Enter a valid email address.',1); return; }
      msg('c-out-msg','Sending your sign-in link…');
      const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+'/community.html'}});
      msg('c-out-msg', error?('Could not send: '+error.message):'Link sent — check your email and open it on THIS device.', !!error);
    });
    $('c-claim').addEventListener('click',async()=>{
      const handle=($('c-handle-input').value||'').trim();
      if(!/^[a-zA-Z0-9_]{3,20}$/.test(handle)){ msg('c-handle-msg','3–20 characters: letters, numbers, underscore.',1); return; }
      msg('c-handle-msg','Claiming…');
      const {error}=await sb.from('profiles').insert({id:session.user.id,handle});
      if(error){ msg('c-handle-msg', /duplicate|unique/i.test(error.message)?'That handle is taken — try another.':error.message,1); return; }
      await loadProfile(); showAuth('signedin'); renderMySlips();
    });
    $('c-signout').addEventListener('click',async()=>{ await sb.auth.signOut(); await refresh(); });
    $('board-search').addEventListener('input',renderBoard);
    $('board-min').addEventListener('change',renderBoard);
    $('save-private').addEventListener('click',()=>saveSlip(false));
    $('save-public').addEventListener('click',()=>saveSlip(true));
    sb.auth.onAuthStateChange(()=>refresh());
    buildPicks(); refresh();
  });
  window.P2UC={sb,get session(){return session;},get profile(){return profile;},refresh};
})();
