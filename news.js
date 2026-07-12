/* Predict2U v189 — Global Football News, transfers and community discussion.
   Browser code uses only the public Supabase key and RLS-protected tables.
   Full stories remain on the original publisher's site; Predict2U displays
   short attributed summaries and user comments. */
(function(){
  'use strict';
  const VERSION='v189';
  const CONFIG=window.P2U_CLOUD_CONFIG||{};
  const TABLE=CONFIG.newsArticlesTable||'p2u_news_articles';
  const COMMENTS=CONFIG.newsCommentsTable||'p2u_news_comments';
  const PAGE_SIZE=18;
  const REFRESH_MS=5*60*1000;
  let client=null,session=null,profile=null,articles=[],filtered=[],visible=PAGE_SIZE;
  let activeFilter='all',search='',currentArticle=null,channel=null,initialLoad=true;

  const $=s=>document.querySelector(s);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=(v,max=500)=>String(v||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const when=value=>{const ts=new Date(value||Date.now()).getTime();const d=Math.max(0,Date.now()-ts);if(d<60000)return'Just now';const m=Math.floor(d/60000);if(m<60)return`${m}m ago`;const h=Math.floor(m/60);if(h<24)return`${h}h ago`;const days=Math.floor(h/24);return days<7?`${days}d ago`:new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'});};
  const regionFlag=r=>({africa:'🌍',asia:'🌏',europe:'🇪🇺','north america':'🌎','south america':'🌎',oceania:'🌏',global:'🌐'}[String(r||'global').toLowerCase()]||'🌐');
  const validUrl=v=>{try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.href:''}catch(_){return''}};
  const image=v=>validUrl(v)||'';

  async function getClient(){
    if(client)return client;
    if(window.P2UAccounts&&window.P2UAccounts.getClient)client=await window.P2UAccounts.getClient();
    if(!client&&window.supabase&&CONFIG.url&&CONFIG.publishableKey){
      try{client=window.supabase.createClient(CONFIG.url,CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})}catch(_){}
    }
    return client;
  }
  async function loadIdentity(){
    const sb=await getClient();if(!sb)return;
    const {data}=await sb.auth.getSession();session=data&&data.session||null;
    if(session){
      try{const {data:p}=await sb.from('profiles').select('handle,avatar_url').eq('id',session.user.id).maybeSingle();profile=p||null}catch(_){profile=null}
    }
    const name=$('#user-name'),av=$('#user-av');
    if(name)name.textContent=session?(profile&&profile.handle?'@'+profile.handle:(session.user.email||'Account').split('@')[0]):'Sign in';
    if(av){if(profile&&profile.avatar_url)av.innerHTML=`<img src="${esc(profile.avatar_url)}" alt="" loading="lazy" decoding="async">`;else av.innerHTML='<i class="fa-solid fa-user"></i>';}
  }

  function articleBadges(a){
    const badges=[];
    if(a.breaking)badges.push('<span class="p2u-news-badge breaking">Breaking</span>');
    if(a.category==='transfer')badges.push('<span class="p2u-news-badge transfer"><i class="fa-solid fa-right-left"></i> Transfer</span>');
    else badges.push('<span class="p2u-news-badge">Football</span>');
    if(a.region)badges.push(`<span class="p2u-news-badge">${regionFlag(a.region)} ${esc(a.region)}</span>`);
    return badges.join('');
  }
  function mediaHtml(a,feature=false){
    const src=image(a.image_url);
    if(src)return `<img src="${esc(src)}" alt="" loading="${feature?'eager':'lazy'}" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`;
    return `<div class="p2u-news-media-fallback"><span>${regionFlag(a.region)}</span><b>${a.category==='transfer'?'TRANSFER':'FOOTBALL'}</b></div>`;
  }
  function metaHtml(a){
    return `<span>${esc(a.source_name||'Football source')}</span><span>•</span><time datetime="${esc(a.published_at||'')}">${when(a.published_at)}</time>${Number(a.comment_count||0)?`<span>•</span><span><i class="fa-regular fa-comment"></i> ${Number(a.comment_count||0)}</span>`:''}`;
  }
  function actionsHtml(a,featured=false){
    const url=validUrl(a.url);
    return `<div class="p2u-news-actions">${url?`<a class="primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow"><i class="fa-solid fa-arrow-up-right-from-square"></i> Source</a>`:''}<button type="button" data-news-discuss="${esc(a.id)}"><i class="fa-regular fa-comments"></i> Discuss${Number(a.comment_count||0)?` · ${Number(a.comment_count)}`:''}</button><button type="button" data-news-share="${esc(a.id)}" aria-label="Share story"><i class="fa-solid fa-share-nodes"></i>${featured?' Share':''}</button></div>`;
  }
  function featuredHtml(a){
    if(!a)return'';
    return `<article class="p2u-news-feature-card" data-news-id="${esc(a.id)}"><div class="p2u-news-feature-media">${mediaHtml(a,true)}</div><div class="p2u-news-feature-copy"><div class="p2u-news-badges">${articleBadges(a)}</div><h2>${esc(a.title)}</h2><p>${esc(clean(a.summary,420)||'Open the original report for the full story.')}</p><div class="p2u-news-meta">${metaHtml(a)}</div>${actionsHtml(a,true)}</div></article>`;
  }
  function cardHtml(a){
    return `<article class="p2u-news-card" data-news-id="${esc(a.id)}"><div class="p2u-news-card-media">${mediaHtml(a)}</div><div class="p2u-news-card-body"><div class="p2u-news-badges">${articleBadges(a)}</div><h3>${esc(a.title)}</h3><p>${esc(clean(a.summary,240)||'Open the source for the full report.')}</p><div class="p2u-news-meta">${metaHtml(a)}</div>${actionsHtml(a)}</div></article>`;
  }
  function applyFilter(){
    const q=search.toLowerCase();
    filtered=articles.filter(a=>{
      if(activeFilter==='transfer'&&a.category!=='transfer')return false;
      if(activeFilter==='news'&&a.category==='transfer')return false;
      if(activeFilter==='breaking'&&!a.breaking)return false;
      if(q&&!`${a.title||''} ${a.summary||''} ${a.source_name||''} ${a.league||''} ${a.club||''} ${a.player||''}`.toLowerCase().includes(q))return false;
      return true;
    });
    render();
  }
  function render(){
    const featured=$('#news-featured'),list=$('#news-list'),load=$('#news-load-more'),title=$('#news-list-title');
    if(!featured||!list)return;
    const first=filtered[0]||null;
    featured.innerHTML=first?featuredHtml(first):'';
    const rows=filtered.slice(first?1:0,visible);
    if(!filtered.length){
      list.innerHTML='<div class="p2u-news-empty"><i class="fa-regular fa-newspaper"></i><b>No stories match this view.</b><span>Refresh the desk or choose another filter.</span></div>';
    }else list.innerHTML=rows.length?rows.map(cardHtml).join(''):'<div class="p2u-news-empty">More stories will appear here as sources update.</div>';
    if(load){load.hidden=visible>=filtered.length;load.textContent=`Load more (${Math.max(0,filtered.length-visible)})`;}
    if(title)title.textContent=activeFilter==='transfer'?'Latest transfer updates':activeFilter==='breaking'?'Breaking football news':activeFilter==='news'?'Latest football stories':'Latest football stories';
  }

  async function fetchArticles({silent=false}={}){
    const sb=await getClient();
    if(!sb){if(!silent)$('#news-list').innerHTML='<div class="p2u-news-empty"><b>News service is unavailable.</b><span>Check the connection and try again.</span></div>';return[];}
    const {data,error}=await sb.from(TABLE).select('id,title,summary,url,image_url,source_name,source_domain,category,region,league,club,player,breaking,published_at,comment_count').eq('published',true).order('published_at',{ascending:false}).limit(120);
    if(error){if(!silent)$('#news-list').innerHTML=`<div class="p2u-news-empty"><b>Could not load football news.</b><span>${esc(error.message)}</span></div>`;return[];}
    const next=Array.isArray(data)?data:[];
    if(!initialLoad&&next.length){
      const previous=new Set(articles.map(a=>String(a.id)));
      next.filter(a=>!previous.has(String(a.id))).slice(0,5).forEach(a=>ingestNewsAlert(a));
    }
    articles=next;initialLoad=false;visible=PAGE_SIZE;applyFilter();
    const updated=$('#news-updated');if(updated)updated.textContent=articles[0]?`Updated ${when(articles[0].published_at)}`:'Waiting for first sync';
    return articles;
  }

  function ingestNewsAlert(a){
    const detail={id:a.id,title:a.category==='transfer'?'Transfer update':(a.breaking?'Breaking football news':'Football news'),body:a.title,newsType:a.category==='transfer'?'transfer':'football',source:a.source_name,url:`news.html?article=${encodeURIComponent(a.id)}`,createdAt:new Date(a.published_at||Date.now()).getTime()};
    if(window.P2USmartAlerts&&window.P2USmartAlerts.news)window.P2USmartAlerts.news(detail);
    else window.dispatchEvent(new CustomEvent('p2u:news-alert',{detail}));
  }

  async function getComments(articleId){
    const sb=await getClient();if(!sb)return[];
    const {data,error}=await sb.from(COMMENTS).select('id,user_id,handle_snapshot,body,created_at').eq('article_id',articleId).eq('status','visible').order('created_at',{ascending:true}).limit(250);
    if(error)return[];return data||[];
  }
  function commentHtml(c){return `<article class="p2u-news-comment"><div><strong>@${esc(c.handle_snapshot||'member')}</strong> <time>${when(c.created_at)}</time></div><p>${esc(c.body)}</p></article>`;}
  async function discussionHtml(a){
    const comments=await getComments(a.id);
    return `<div class="p2u-news-discussion-head"><div><div class="p2u-news-kicker">NEWS COMMUNITY</div><h2>${esc(a.title)}</h2></div><button class="p2u-news-close" data-news-close aria-label="Close">×</button></div><div class="p2u-news-meta">${metaHtml(a)}</div><div class="p2u-news-comment-form">${session?`<label for="news-comment-body">Join the conversation</label><textarea id="news-comment-body" maxlength="600" placeholder="Add a respectful football comment…"></textarea><div class="p2u-news-comment-form-foot"><small>Keep it respectful. No abuse, spam or private information.</small><button class="p2u-news-button" data-news-comment-submit="${esc(a.id)}">Post comment</button></div><div class="p2u-news-comment-message" aria-live="polite"></div>`:`<p>Sign in to join the discussion.</p><a class="p2u-news-button" href="account.html">Open Account Center</a>`}</div><div class="p2u-news-comments-head"><h3>${comments.length} comment${comments.length===1?'':'s'}</h3></div><div id="news-comments-list">${comments.length?comments.map(commentHtml).join(''):'<div class="p2u-news-empty compact">No comments yet. Start the conversation.</div>'}</div>`;
  }
  async function openDiscussion(id){
    const a=articles.find(x=>String(x.id)===String(id));if(!a)return;currentArticle=a;
    const back=$('#news-discussion-backdrop'),panel=$('#news-discussion-panel');if(!back||!panel)return;
    panel.innerHTML='<div class="p2u-news-empty">Loading discussion…</div>';back.classList.add('is-open');back.setAttribute('aria-hidden','false');document.body.classList.add('p2u-news-discussion-open');
    panel.innerHTML=await discussionHtml(a);
  }
  function closeDiscussion(){const back=$('#news-discussion-backdrop');if(back){back.classList.remove('is-open');back.setAttribute('aria-hidden','true')}document.body.classList.remove('p2u-news-discussion-open');currentArticle=null;}
  async function postComment(articleId){
    const textarea=$('#news-comment-body'),message=$('.p2u-news-comment-message'),body=clean(textarea&&textarea.value,600);if(!body)return;
    const sb=await getClient();session=window.P2UAccounts&&window.P2UAccounts.getSession?window.P2UAccounts.getSession():session;
    if(!sb||!session){if(message)message.textContent='Sign in before posting.';return;}
    if(message)message.textContent='Posting…';
    const {error}=await sb.rpc('p2u_news_post_comment',{p_article_id:Number(articleId),p_body:body});
    if(error){if(message)message.textContent=error.message||'Comment could not be posted.';return;}
    if(textarea)textarea.value='';
    if(message)message.textContent='Comment posted.';
    const a=articles.find(x=>String(x.id)===String(articleId));if(a)a.comment_count=Number(a.comment_count||0)+1;
    if(currentArticle)$('#news-discussion-panel').innerHTML=await discussionHtml(currentArticle);render();
  }
  async function shareArticle(id){
    const a=articles.find(x=>String(x.id)===String(id));if(!a)return;
    const url=`${location.origin}${location.pathname.replace(/news\.html$/,'news.html')}?article=${encodeURIComponent(a.id)}`;
    const payload={title:a.title,text:`${a.title} — ${a.source_name||'Predict2U Football News'}`,url};
    try{if(navigator.share)await navigator.share(payload);else{await navigator.clipboard.writeText(url);alert('News link copied.')}}catch(_){}
  }

  function bind(){
    document.addEventListener('click',e=>{
      const filter=e.target.closest('[data-news-filter]');if(filter){document.querySelectorAll('[data-news-filter]').forEach(b=>b.classList.toggle('is-active',b===filter));activeFilter=filter.dataset.newsFilter||'all';visible=PAGE_SIZE;applyFilter();return;}
      const discuss=e.target.closest('[data-news-discuss]');if(discuss){openDiscussion(discuss.dataset.newsDiscuss);return;}
      const share=e.target.closest('[data-news-share]');if(share){shareArticle(share.dataset.newsShare);return;}
      if(e.target.closest('[data-news-close]')||e.target.id==='news-discussion-backdrop'){closeDiscussion();return;}
      const submit=e.target.closest('[data-news-comment-submit]');if(submit){postComment(submit.dataset.newsCommentSubmit);return;}
      if(e.target.closest('#news-refresh'))fetchArticles();
      if(e.target.closest('#news-load-more')){visible+=PAGE_SIZE;render();}
    });
    const input=$('#news-search');if(input)input.addEventListener('input',()=>{search=input.value.trim();visible=PAGE_SIZE;applyFilter();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDiscussion();});
  }
  async function realtime(){
    const sb=await getClient();if(!sb||!sb.channel)return;
    try{channel=sb.channel('p2u-news-live').on('postgres_changes',{event:'INSERT',schema:'public',table:TABLE},payload=>{if(payload&&payload.new&&payload.new.published!==false){ingestNewsAlert(payload.new);fetchArticles({silent:true});}}).on('postgres_changes',{event:'INSERT',schema:'public',table:COMMENTS},payload=>{if(currentArticle&&String(payload.new&&payload.new.article_id)===String(currentArticle.id))openDiscussion(currentArticle.id);}).subscribe();}catch(_){}
  }
  async function init(){
    bind();await loadIdentity();await fetchArticles();await realtime();
    const requested=new URLSearchParams(location.search).get('article');if(requested)setTimeout(()=>openDiscussion(requested),100);
    setInterval(()=>fetchArticles({silent:true}),REFRESH_MS);
    document.documentElement.dataset.p2uNewsReady='true';window.dispatchEvent(new CustomEvent('p2u:news-ready',{detail:{version:VERSION,count:articles.length}}));
  }
  window.P2UNews={version:VERSION,refresh:fetchArticles,open:openDiscussion,getArticles:()=>articles.slice()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
