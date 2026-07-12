/* Predict2u — MY SLIP (shared module, Phase 1 community roadmap)
   Loaded by every page. Legs live in localStorage; one pick per match;
   odds snapshotted at add-time; every leg self-settles through settle().
   Records, not wagers — 18+. */
(function(){
  // inject styles once
  if(!document.getElementById('p2u-slip-css')){
    const st=document.createElement('style'); st.id='p2u-slip-css';
    st.textContent=`
  .slip-add{ margin-top:2px; font-size:10px; font-weight:900; letter-spacing:.4px; padding:5px 10px; border-radius:8px; border:2px solid #77C41C; color:#071000; background:#77C41C; cursor:pointer; }
  .slip-add:active{ transform:scale(.95); }
  #p2u-slip-fab{ position:fixed; right:16px; bottom:16px; z-index:60; width:58px; height:58px; border-radius:50%; background:var(--brand,#3ecf6e); color:#06120a; font-weight:900; border:none; box-shadow:0 6px 18px rgba(0,0,0,.45); cursor:pointer; display:none; font-size:20px; }
  #p2u-slip-fab .cnt{ position:absolute; top:-4px; right:-4px; background:#fff; color:#0a3; font-size:11px; font-weight:900; border-radius:10px; min-width:20px; height:20px; line-height:20px; }
  #p2u-slip-fab.show{ display:block; }
  #p2u-slip-fab.pulse{ animation:slipPulse .5s ease; }
  @keyframes slipPulse{ 50%{ transform:scale(1.15);} }
  #p2u-slip-drawer{ position:fixed; left:0; right:0; bottom:0; z-index:70; background:var(--panel,#0d150e); color:var(--ink,#f2f7f0); border-top:2px solid var(--brand,#3ecf6e); border-radius:18px 18px 0 0; max-height:74vh; display:none; flex-direction:column; box-shadow:0 -8px 30px rgba(0,0,0,.5); }
  #p2u-slip-drawer.open{ display:flex; }
  .slip-head{ display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--line,#1b2a1c); }
  .slip-legs{ overflow-y:auto; padding:8px 16px; flex:1; }
  .slip-leg{ display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px dashed var(--line,#1b2a1c); }
  .slip-leg .lg-x{ border:none; background:transparent; color:#e07a7a; font-size:18px; cursor:pointer; }
  .slip-res{ font-size:10px; font-weight:900; padding:2px 8px; border-radius:8px; }
  .slip-res.w{ background:#12240f; color:#7ede8f; } .slip-res.l{ background:#240f0f; color:#e07a7a; } .slip-res.v{ background:#1c2030; color:#8a93a6; }
  .slip-foot{ padding:12px 16px 14px; border-top:1px solid var(--line,#1b2a1c); }
  .slip-foot input{ width:90px; background:rgba(255,255,255,.05); border:1px solid var(--line,#1b2a1c); border-radius:8px; padding:6px 8px; color:inherit; }
  .truncate{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  /* drawer: safe on 280px cover screens, and clear of iOS home indicator */
  #p2u-slip-drawer{ padding-bottom:env(safe-area-inset-bottom); }
  #p2u-slip-fab{ bottom:calc(16px + env(safe-area-inset-bottom)); right:calc(16px + env(safe-area-inset-right)); }
  @media(max-width:400px){
    .slip-head,.slip-legs,.slip-foot{ padding-left:12px; padding-right:12px; }
    #p2u-save-row button{ min-width:100% !important; flex:1 1 100% !important; }
    .slip-leg{ gap:6px; font-size:12px; }
  }
  @media(max-width:320px){
    #p2u-slip-fab{ width:50px; height:50px; }
    .slip-foot input{ width:70px; }
  }
  /* tablets / Z Fold open: centre the drawer instead of stretching it */
  @media(min-width:700px){
    #p2u-slip-drawer{ left:50%; right:auto; transform:translateX(-50%); width:520px; border-radius:18px 18px 0 0; }
  }
  @media(pointer:coarse){ #p2u-save-row button,.lg-x,#p2u-slip-clear{ min-height:40px; } }`;
    document.head.appendChild(st);
  }
})();
/* ================= SLIP BUILDER — Phase 1 (community roadmap) =================
   Legs live in localStorage (per device, survives cache busts — NEVER in the SW
   cache). One pick per match, 10 legs max. Odds are snapshotted at add-time.
   Every leg self-settles through the SAME settle() that grades the engines —
   and results cannot be edited or deleted once a leg is on a settled slip
   record. Slips are records, not wagers: no money, 18+, bet responsibly. */
const P2USlip=(()=>{
  const KEY='p2u_slip_v1', SKEY='p2u_stake_v1', MAX=10;
  let legs=[]; try{ legs=JSON.parse(localStorage.getItem(KEY)||'[]')||[]; }catch(e){ legs=[]; }
  let tailedFrom=null, tailedHandle=null; try{ const t=JSON.parse(localStorage.getItem('p2u_tail_v1')||'null'); if(t){ tailedFrom=t.id; tailedHandle=t.handle; } }catch(e){}
  let stake=parseFloat(localStorage.getItem(SKEY)||'1')||1;
  const save=()=>{ try{ localStorage.setItem(KEY, JSON.stringify(legs)); localStorage.setItem(SKEY,String(stake));
    if(tailedFrom) localStorage.setItem('p2u_tail_v1', JSON.stringify({id:tailedFrom,handle:tailedHandle})); else localStorage.removeItem('p2u_tail_v1'); }catch(e){}
    try{ window.dispatchEvent(new CustomEvent('p2u:slip-changed',{detail:{version:'v180',legs:legs.slice(),stake,tail:tailedFrom?{id:tailedFrom,handle:tailedHandle}:null}})); }catch(e){} };
  const esc=t=>String(t==null?'':t).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const mKey=m=> (m && m.id!=null) ? 'f'+m.id : ((m&&m.home||'')+'|'+(m&&m.away||'')+'|'+(m&&m.matchDate||''));
  const findMatch=leg=> (window.MATCHES||[]).find(m=> mKey(m)===leg.k) || null;
  const ODDS_MAP={'Home Win':'home','Draw':'draw','Away Win':'away','Over 1.5':'over15','Over 2.5':'over25','Over 3.5':'over35','Under 1.5':'under15','Under 2.5':'under25','Under 3.5':'under35','BTTS Yes':'bttsYes','BTTS No':'bttsNo','Double Chance 1X':'dc1x','Double Chance 12':'dc12','Double Chance X2':'dcx2'};
  const marketOdds=(m,market)=>{ if(!m||!m.odds) return null; const k=ODDS_MAP[String(market||'').replace(/ Goals$/,'')]; const v=k? m.odds[k]:null; return (typeof v==='number'&&v>1)? Math.round(v*100)/100 : null; };
  // render-time registry: buttons reference payloads by index (no JSON-in-attribute escaping traps)
  let REG={n:0,map:{}};
  function btn(m, market){
    if(REG.n>5000) REG={n:0,map:{}};
    const id=++REG.n; REG.map[id]={m,market};
    return `<button class="slip-add" data-slipreg="${id}">+ Slip</button>`;
  }
  let onSave=null;
  /* Built-in save: the drawer posts slips from ANY page (board, engines, home),
     not only community. Uses the same Supabase publishable key + RLS; the
     slips_guard trigger enforces the honesty rules regardless of which page
     the insert comes from. community.js overrides this with its richer handler. */
  const SUPA_URL='https://tjbkkhirnwfensqzuvzn.supabase.co';
  const SUPA_KEY='sb_publishable_wjdYr-Px9FmMob7WfEswJQ_wj4cuNkd';
  let _sb=null;
  function sbc(){ if(_sb) return _sb;
    if(!window.supabase||!window.supabase.createClient) return null;
    try{ _sb=window.supabase.createClient(SUPA_URL,SUPA_KEY); }catch(e){ return null; }
    return _sb; }
  async function builtinSave(isPublic, msgEl){
    const say=(t,bad)=>{ if(msgEl){ msgEl.style.color=bad?'#f4636e':'var(--brand,#34d399)'; msgEl.innerHTML=t; } };
    const sb=sbc();
    if(!sb){ say('Saving slips needs an account — <a href="community.html" style="text-decoration:underline;color:inherit">join the community</a>.'); return; }
    say('Saving…');
    try{
      const {data}=await sb.auth.getSession();
      const sess=data&&data.session;
      if(!sess){ say('Sign in first — <a href="community.html" style="text-decoration:underline;color:inherit">one-tap email link</a>.',1); return; }
      const {data:prof}=await sb.from('profiles').select('handle').eq('id',sess.user.id).maybeSingle();
      if(!prof){ say('Claim your handle first — <a href="community.html" style="text-decoration:underline;color:inherit">one step on the community page</a>.',1); return; }
      if(!legs.length){ say('Your slip is empty — add picks from the board.',1); return; }
      const payload=legs.map(l=>({k:l.k,home:l.home,away:l.away,league:l.league,market:l.market,
        oddsAtAdd:l.odds||null,kickoff:l.kickoff||null,source:l.source||'engine',engine:l.engine||null}));
      const st=slipState();
      const md=(window.MATCHES||[]).find(m=>((m.id!=null&&('f'+m.id)===legs[0].k)||((m.home+'|'+m.away+'|'+m.matchDate)===legs[0].k)));
      const {error}=await sb.from('slips').insert({user_id:sess.user.id,legs:payload,stake,
        combined_odds:st.priced?Math.round(st.odds*100)/100:null,is_public:!!isPublic,
        tailed_from:tailedFrom||null,match_date:md?md.matchDate:null});
      if(error){ say('Could not save: '+error.message,1); return; }
      legs=[]; tailedFrom=null; tailedHandle=null; save(); render();
      const m2=document.getElementById('p2u-save-msg');
      if(m2){ m2.style.color='var(--brand,#34d399)'; m2.style.display='block';
        m2.textContent=isPublic?'Posted publicly ✓ — it settles itself, win or lose.':'Saved to your account ✓'; }
    }catch(e){ say('Could not save — check your connection.',1); }
  }
  let toastT=null;
  function toast(msg){
    let el=document.getElementById('p2u-toast');
    if(!el){ el=document.createElement('div'); el.id='p2u-toast';
      el.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:88px;z-index:80;background:#0b1a0c;color:#7ede8f;border:1px solid #3ecf6e;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(el); }
    el.textContent=msg; el.style.display='block';
    clearTimeout(toastT); toastT=setTimeout(()=>{ el.style.display='none'; }, 1800);
  }
  function add(m, market, engine){
    const k=mKey(m);
    if(legs.some(l=>l.k===k)){ toast('One pick per match — already on your slip'); return; }
    if(legs.length>=MAX){ toast('Slip is full ('+MAX+' legs max)'); return; }
    legs.push({k, home:m.home, away:m.away, league:m.league||'', matchDate:m.matchDate||'', market:String(market), odds:marketOdds(m,market), source:'engine', engine:engine||null, added:Date.now()});
    save(); render(); toast('Added to slip \u2713');
    const fab=document.getElementById('p2u-slip-fab');
    if(fab){ fab.classList.remove('pulse'); void fab.offsetWidth; fab.classList.add('pulse'); }
  }
  function legResult(leg){ const m=findMatch(leg); if(!m) return ''; try{ return settle(leg.market,m.homeGoals,m.awayGoals,m.status,m)||''; }catch(e){ return ''; } }
  function slipState(){
    let w=0,l=0,v=0,open=0, odds=1, priced=0, unpriced=0;
    legs.forEach(g=>{ const r=legResult(g);
      if(r==='Won')w++; else if(r==='Lost')l++; else if(r==='Void')v++; else open++;
      if(r!=='Void'){ if(g.odds){ odds*=g.odds; priced++; } else unpriced++; } });
    const status = !legs.length?'empty' : l>0?'lost' : open>0?'open' : w>0?'won':'void';
    return {w,l,v,open,odds,priced,unpriced,status};
  }
  function render(){
    const fab=document.getElementById('p2u-slip-fab');
    if(fab){ fab.classList.toggle('show', legs.length>0); const c=fab.querySelector('.cnt'); if(c) c.textContent=legs.length; }
    const list=document.getElementById('p2u-slip-legs'), foot=document.getElementById('p2u-slip-summary');
    if(!list||!foot) return;
    const s=slipState();
    list.innerHTML = legs.length? legs.map(g=>{
      const r=legResult(g);
      const chip = r? `<span class="slip-res ${r==='Won'?'w':r==='Lost'?'l':'v'}">${r.toUpperCase()}</span>`:'';
      return `<div class="slip-leg"><div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px" class="truncate">${esc(g.home)} v ${esc(g.away)}</div>
        <div style="font-size:11px;color:var(--muted)" class="truncate">${esc(g.market)} · ${g.odds?('@'+g.odds.toFixed(2)):'odds pending'}${g.engine?(' · '+esc(g.engine)):''}</div>
      </div>${chip}<button class="lg-x" data-slipdel="${esc(g.k)}" title="Remove">&times;</button></div>`;
    }).join('') : '<div style="color:var(--muted);padding:18px 0;text-align:center;font-size:13px">Your slip is empty — tap “+ Slip” on any pick.</div>';
    const ret=s.priced? (s.odds*stake):0;
    foot.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div><div style="font-size:11px;color:var(--muted)">Combined odds${s.unpriced?` (${s.unpriced} leg${s.unpriced>1?'s':''} unpriced)`:''}</div>
        <div style="font-size:22px;font-weight:900;color:var(--brand)">${s.priced? s.odds.toFixed(2):'—'}</div></div>
        <div style="text-align:right"><div style="font-size:11px;color:var(--muted)">Stake (units) &rarr; returns</div>
        <input id="p2u-stake" type="number" min="0" step="0.5" value="${stake}"> = <b>${s.priced? ret.toFixed(2):'—'}</b></div>
      </div>
      ${s.status!=='empty'&&s.status!=='open'? `<div style="margin-top:8px;font-weight:800;color:${s.status==='won'?'#7ede8f':s.status==='lost'?'#e07a7a':'var(--muted)'}">Slip ${s.status.toUpperCase()} · ${s.w}W-${s.l}L${s.v?('-'+s.v+'V'):''}</div>`:''}
      ${tailedHandle?`<div style="margin-top:8px;font-size:11px;color:var(--muted)">Copied from <b style="color:var(--brand-2)">@${esc(tailedHandle)}</b> — save it and the result is yours.</div>`:''}
      <div id="p2u-save-row" style="display:${legs.length?'flex':'none'};gap:8px;margin-top:12px;flex-wrap:wrap">
        <button id="p2u-save-public" style="flex:1;min-width:140px;background:var(--brand,#3ecf6e);color:#06120a;border:none;border-radius:9px;padding:10px;font-weight:800;font-size:13px;cursor:pointer">Post publicly</button>
        <button id="p2u-save-private" style="flex:1;min-width:120px;background:transparent;color:var(--muted);border:1px solid var(--line);border-radius:9px;padding:10px;font-weight:800;font-size:13px;cursor:pointer">Save private</button>
      </div>
      <div id="p2u-save-msg" style="font-size:12px;color:var(--brand-2);margin-top:6px;min-height:16px"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
        <button id="p2u-slip-clear" style="border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:8px;padding:5px 12px;font-size:12px">Clear slip</button>
        <div style="font-size:10px;color:var(--muted)">Records, not wagers · 18+ · <a href="responsible-gambling.html" style="text-decoration:underline">bet responsibly</a></div>
      </div>`;
    const st=document.getElementById('p2u-stake');
    if(st) st.addEventListener('change',()=>{ stake=Math.max(0,parseFloat(st.value)||0); save(); render(); });
    const cl=document.getElementById('p2u-slip-clear');
    if(cl) cl.addEventListener('click',()=>{ legs=[]; tailedFrom=null; tailedHandle=null; save(); render(); });
    const sp=document.getElementById('p2u-save-public'), sv=document.getElementById('p2u-save-private');
    const doSave=isPublic=>{
      const msgEl=document.getElementById('p2u-save-msg');
      if(typeof onSave==='function'){ onSave(isPublic,{legs:legs.slice(),stake,tailedFrom}); return; }
      builtinSave(isPublic, msgEl);
    };
    if(sp) sp.addEventListener('click',()=>doSave(true));
    if(sv) sv.addEventListener('click',()=>doSave(false));
  }
  function init(){
    if(document.getElementById('p2u-slip-fab')) return;
    const fab=document.createElement('button'); fab.id='p2u-slip-fab'; fab.innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:auto"><path d="M4 3v18l2.5-1.6L9 21l3-1.6L15 21l2.5-1.6L20 21V3l-2.5 1.6L15 3l-3 1.6L9 3 6.5 4.6 4 3z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/></svg><span class="cnt">0</span>'; fab.title='My slip';
    const dr=document.createElement('div'); dr.id='p2u-slip-drawer';
    dr.innerHTML=`<div class="slip-head"><div style="font-weight:900">MY SLIP <span style="font-size:11px;color:var(--muted);font-weight:600">· built from the board</span></div><button id="p2u-slip-close" style="border:none;background:transparent;color:var(--muted);font-size:22px">&times;</button></div><div class="slip-legs" id="p2u-slip-legs"></div><div class="slip-foot" id="p2u-slip-summary"></div>`;
    document.body.appendChild(fab); document.body.appendChild(dr);
    fab.addEventListener('click',()=>{ dr.classList.toggle('open'); render(); });
    dr.querySelector('#p2u-slip-close').addEventListener('click',()=>dr.classList.remove('open'));
    document.addEventListener('click',e=>{
      const b=e.target.closest('.slip-add');
      if(b){ e.preventDefault(); e.stopPropagation(); const p=REG.map[b.dataset.slipreg]; if(p) add(p.m,p.market,(typeof engineMode!=='undefined')?engineMode:null); return; }
      const x=e.target.closest('[data-slipdel]');
      if(x){ legs=legs.filter(l=>l.k!==x.dataset.slipdel); save(); render(); }
    }, true);
    render();
  }
  return {btn, add, init, render,
    get legs(){ return legs.slice(); },
    get stake(){ return stake; },
    get tailedFrom(){ return tailedFrom; },
    getDraft(){ return {legs:legs.slice(),stake,tail:tailedFrom?{id:tailedFrom,handle:tailedHandle}:null}; },
    replaceDraft(draft){ const d=draft&&typeof draft==='object'?draft:{}; legs=Array.isArray(d.legs)?d.legs.slice(0,MAX):[]; stake=Math.max(0,Number(d.stake)||1); const t=d.tail&&typeof d.tail==='object'?d.tail:null; tailedFrom=t&&t.id?t.id:null; tailedHandle=t&&t.handle?t.handle:null; save(); render(); return this.getDraft(); },
    state: slipState,
    clear(){ legs=[]; tailedFrom=null; tailedHandle=null; save(); render(); },
    /* the page registers a save handler; without one the buttons point at the community page */
    onSave(fn){ onSave=fn; render(); },
    msg(t,bad){ const el=document.getElementById('p2u-save-msg'); if(el){ el.textContent=t; el.style.color=bad?'#e07a7a':'var(--brand-2)'; } },
    /* tail: load someone's legs, remembering who to credit */
    load(newLegs, credit){ if(Array.isArray(newLegs)){ legs=newLegs.slice(0,MAX);
      tailedFrom=credit?credit.id:null; tailedHandle=credit?credit.handle:null; save(); render(); } }
  };
})();
if(document.body) P2USlip.init(); else document.addEventListener('DOMContentLoaded', P2USlip.init);
