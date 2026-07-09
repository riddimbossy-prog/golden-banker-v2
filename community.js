/* Predict2u COMMUNITY — Phase 2, Step 2: auth + profiles.
   Uses Supabase magic-link sign-in (no passwords). The database enforces
   the honesty rules; this file only talks to it. Safe-to-publish keys. */
(function(){
  const SUPA_URL = 'https://tjbkkhirnwfensqzuvzn.supabase.co';
  const SUPA_KEY = 'sb_publishable_wjdYr-Px9FmMob7WfEswJQ_wj4cuNkd';

  if(!window.supabase || !window.supabase.createClient){
    console.error('supabase-js not loaded'); return;
  }
  const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
  const $ = id => document.getElementById(id);
  const esc = t => String(t==null?'':t).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

  let session=null, profile=null;

  async function loadProfile(){
    if(!session) { profile=null; return; }
    const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    profile = data || null;
  }

  function show(state){ // 'signedout' | 'handle' | 'signedin'
    ['c-signedout','c-handle','c-signedin'].forEach(id=>{ const el=$(id); if(el) el.style.display='none'; });
    const el=$('c-'+state); if(el) el.style.display='block';
    if(state==='signedin' && profile){
      $('c-hello').textContent = '@'+profile.handle;
      $('c-email').textContent = session.user.email || '';
    }
  }

  async function refresh(){
    const { data } = await sb.auth.getSession();
    session = data.session || null;
    if(!session){ show('signedout'); return; }
    await loadProfile();
    show(profile ? 'signedin' : 'handle');
  }

  /* ---------- wire the UI ---------- */
  document.addEventListener('DOMContentLoaded', ()=>{
    const msg=(id,t,bad)=>{ const el=$(id); if(el){ el.textContent=t; el.style.color=bad?'#e07a7a':'var(--brand-2)'; } };

    $('c-send').addEventListener('click', async ()=>{
      const email=($('c-mail').value||'').trim();
      if(!/^\S+@\S+\.\S+$/.test(email)){ msg('c-out-msg','Enter a valid email address.',1); return; }
      msg('c-out-msg','Sending your sign-in link…');
      const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.origin + '/community.html' } });
      msg('c-out-msg', error ? ('Could not send: '+error.message) : 'Link sent — check your email (and spam) and tap it on THIS device.', !!error);
    });

    $('c-claim').addEventListener('click', async ()=>{
      const handle=($('c-handle-input').value||'').trim();
      if(!/^[a-zA-Z0-9_]{3,20}$/.test(handle)){ msg('c-handle-msg','3–20 characters: letters, numbers, underscore.',1); return; }
      msg('c-handle-msg','Claiming…');
      const { error } = await sb.from('profiles').insert({ id: session.user.id, handle });
      if(error){ msg('c-handle-msg', /duplicate|unique/i.test(error.message) ? 'That handle is taken — try another.' : error.message, 1); return; }
      await loadProfile(); show('signedin');
    });

    $('c-signout').addEventListener('click', async ()=>{ await sb.auth.signOut(); await refresh(); });

    sb.auth.onAuthStateChange(()=>{ refresh(); });
    refresh();
  });

  window.P2UC = { sb, get session(){return session;}, get profile(){return profile;}, refresh };
})();
