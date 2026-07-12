/* Predict2U v192 — News Personalization, Trust & Moderation.
   Public browser code uses the Supabase publishable key with RLS-protected tables.
   Full stories remain on original publisher sites; Predict2U stores short summaries,
   followed topics, Read Later records, reports and community comments. */
(function(){
  'use strict';
  const VERSION='v197';
  const CONFIG=window.P2U_CLOUD_CONFIG||{};
  const TABLE=CONFIG.newsArticlesTable||'p2u_news_articles';
  const COMMENTS=CONFIG.newsCommentsTable||'p2u_news_comments';
  const FOLLOWS='p2u_news_follows';
  const BOOKMARKS='p2u_news_bookmarks';
  const PAGE_SIZE=18;
  const REFRESH_MS=5*60*1000;
  const FOLLOW_LOCAL_KEY='p2u-news-follows-v192';
  const BOOKMARK_LOCAL_KEY='p2u-news-bookmarks-v192';
  const ARTICLE_CACHE_KEY='p2u-news-articles-v197';
  const MODERN_FIELDS='id,title,summary,url,image_url,source_name,source_domain,source_verified,canonical_key,category,region,league,club,player,breaking,featured,pinned,published_at,comment_count';
  const BASE_FIELDS='id,title,summary,url,image_url,source_name,source_domain,category,region,league,club,player,breaking,published_at,comment_count';
  const MIN_FIELDS='id,title,summary,url,image_url,source_name,category,region,breaking,published_at';
  let client=null,session=null,profile=null,articles=[],filtered=[],visible=PAGE_SIZE;
  let activeFilter='all',search='',currentArticle=null,channel=null,initialLoad=true;
  let follows=[],bookmarks=new Set(),lastFocused=null;
  let schemaMode='modern',lastFetchError='',searchMode='exact';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=(v,max=500)=>String(v||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const safeParse=(v,f)=>{try{return JSON.parse(v)}catch(_){return f}};
  const when=value=>{const ts=new Date(value||Date.now()).getTime();const d=Math.max(0,Date.now()-ts);if(d<60000)return'Just now';const m=Math.floor(d/60000);if(m<60)return`${m}m ago`;const h=Math.floor(m/60);if(h<24)return`${h}h ago`;const days=Math.floor(h/24);return days<7?`${days}d ago`:new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'});};
  const regionFlag=r=>({africa:'🌍',asia:'🌏',europe:'🇪🇺','north america':'🌎','south america':'🌎',oceania:'🌏',global:'🌐'}[String(r||'global').toLowerCase()]||'🌐');
  const validUrl=v=>{try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.href:''}catch(_){return''}};
  const image=v=>validUrl(v)||'';
  const normalize=v=>clean(v,240).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const ALIASES={
    'man u':'manchester united','man utd':'manchester united','man united':'manchester united',
    'psg':'paris saint germain','barca':'barcelona','spurs':'tottenham hotspur',
    'bayern':'bayern munich','inter':'inter milan','ac milan':'milan','ucl':'champions league',
    'epl':'premier league','afcon':'africa cup of nations'
  };
  const expandAlias=v=>ALIASES[normalize(v)]||normalize(v);
  const canonicalTitle=v=>normalize(v).replace(/\b(the|a|an|to|for|of|in|on|at|with|and|or|from|after|before|latest|breaking|official|confirmed|report)\b/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,12).join(' ');
  const articleHay=a=>normalize([a.title,a.summary,a.source_name,a.region,a.league,a.club,a.player].join(' '));
  function editDistance(a,b,max=3){
    a=expandAlias(a);b=expandAlias(b);if(a===b)return 0;if(!a||!b)return Math.max(a.length,b.length);if(Math.abs(a.length-b.length)>max)return max+1;
    let prev=Array.from({length:b.length+1},(_,i)=>i),cur=[];
    for(let i=1;i<=a.length;i++){
      cur=[i];let rowMin=cur[0];
      for(let j=1;j<=b.length;j++){
        const cost=a[i-1]===b[j-1]?0:1;
        cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+cost);rowMin=Math.min(rowMin,cur[j]);
      }
      if(rowMin>max)return max+1;[prev,cur]=[cur,prev];
    }
    return prev[b.length];
  }
  function tokenMatch(q,t){
    q=expandAlias(q);t=expandAlias(t);if(!q)return true;if(t.includes(q)||q.includes(t))return true;
    const allowance=q.length>=9?2:(q.length>=5?1:0);return allowance>0&&editDistance(q,t,allowance)<=allowance;
  }
  function fuzzyMatch(query,hay){
    const q=expandAlias(query),h=normalize(hay);if(!q)return true;if(h.includes(q))return true;
    const qTokens=q.split(' ').filter(Boolean),hTokens=h.split(' ').filter(Boolean);
    return qTokens.every(qt=>hTokens.some(ht=>tokenMatch(qt,ht)));
  }
  function directMatch(query,hay){const q=expandAlias(query),h=normalize(hay);return !q||h.includes(q);}
  function articleMatchesSearch(a,q){return fuzzyMatch(q,articleHay(a));}
  function knownValues(type){
    const key={club:'club',league:'league',country:'region',player:'player',source:'source_name'}[type];
    if(!key)return[];
    return [...new Set(articles.map(a=>clean(a[key],100)).filter(Boolean))];
  }
  function nearestKnown(type,input){
    const n=expandAlias(input),values=knownValues(type);if(!n||!values.length)return clean(input,100);
    let best='',score=99;
    for(const value of values){
      const v=expandAlias(value);if(v===n||v.includes(n)||n.includes(v))return value;
      const limit=Math.max(1,Math.min(3,Math.floor(Math.max(n.length,v.length)/5)));
      const d=editDistance(n,v,limit);if(d<score){score=d;best=value;}
    }
    return score<=Math.max(1,Math.min(2,Math.floor(n.length/5)))?best:clean(input,100);
  }
  const isSchemaError=e=>!!(e&&(e.code==='42703'||e.code==='PGRST204'||/column .* does not exist|does not exist/i.test(String(e.message||''))));
  const normalizeArticle=a=>Object.assign({source_domain:'',source_verified:false,canonical_key:'',category:'news',region:'Global',league:'',club:'',player:'',breaking:false,featured:false,pinned:false,published_at:new Date().toISOString(),comment_count:0},a||{}, {source_verified:!!(a&&a.source_verified),featured:!!(a&&a.featured),pinned:!!(a&&a.pinned),breaking:!!(a&&a.breaking)});
  function saveArticleCache(rows){try{localStorage.setItem(ARTICLE_CACHE_KEY,JSON.stringify({savedAt:Date.now(),rows:rows.slice(0,180)}));}catch(_){}}
  function loadArticleCache(){try{const x=JSON.parse(localStorage.getItem(ARTICLE_CACHE_KEY)||'null');return x&&Array.isArray(x.rows)?x.rows.map(normalizeArticle):[];}catch(_){return[]}}
  function setServiceStatus(message,type='ok'){
    const el=$('#news-service-status');if(!el)return;el.hidden=!message;el.className=`p2u-news-service-status ${type}`;el.textContent=message||'';
  }
  function setSearchHint(message){const el=$('#news-search-help');if(!el)return;el.textContent=message||'';el.hidden=!message;}
  const isSaved=id=>bookmarks.has(String(id));
  const following=(type,value)=>follows.some(f=>f.entity_type===type&&normalize(f.entity_value)===normalize(value));
  const saveLocalState=()=>{try{localStorage.setItem(FOLLOW_LOCAL_KEY,JSON.stringify(follows));localStorage.setItem(BOOKMARK_LOCAL_KEY,JSON.stringify([...bookmarks]));}catch(_){}};

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

  async function loadPersonalization(){
    follows=Array.isArray(safeParse(localStorage.getItem(FOLLOW_LOCAL_KEY),'bad'))?safeParse(localStorage.getItem(FOLLOW_LOCAL_KEY),[]):[];
    bookmarks=new Set((Array.isArray(safeParse(localStorage.getItem(BOOKMARK_LOCAL_KEY),[]))?safeParse(localStorage.getItem(BOOKMARK_LOCAL_KEY),[]):[]).map(String));
    if(!session){renderFollowBar();return}
    const sb=await getClient();if(!sb)return;
    try{
      const [fr,br]=await Promise.all([
        sb.from(FOLLOWS).select('entity_type,entity_value,created_at').eq('user_id',session.user.id).order('created_at',{ascending:false}),
        sb.from(BOOKMARKS).select('article_id,created_at').eq('user_id',session.user.id).order('created_at',{ascending:false})
      ]);
      if(!fr.error&&Array.isArray(fr.data))follows=fr.data;
      if(!br.error&&Array.isArray(br.data))bookmarks=new Set(br.data.map(x=>String(x.article_id)));
      saveLocalState();
    }catch(_){}
    renderFollowBar();
  }

  function articleBadges(a){
    const badges=[];
    if(a.pinned)badges.push('<span class="p2u-news-badge pinned"><i class="fa-solid fa-thumbtack"></i> Pinned</span>');
    if(a.breaking)badges.push('<span class="p2u-news-badge breaking">Breaking</span>');
    if(a.category==='transfer')badges.push('<span class="p2u-news-badge transfer"><i class="fa-solid fa-right-left"></i> Transfer</span>');
    else badges.push('<span class="p2u-news-badge">Football</span>');
    if(a.source_verified)badges.push('<span class="p2u-news-badge verified" title="Publisher source reviewed by Predict2U"><i class="fa-solid fa-circle-check"></i> Verified source</span>');
    if(a.region)badges.push(`<span class="p2u-news-badge">${regionFlag(a.region)} ${esc(a.region)}</span>`);
    if(Number(a._related||0)>0)badges.push(`<span class="p2u-news-badge related"><i class="fa-solid fa-layer-group"></i> ${Number(a._related)} related</span>`);
    return badges.join('');
  }

  function fallbackMediaHtml(a,feature=false){
    if(a.category==='transfer'){
      const asset=feature?'predict2u-transfers.webp':'predict2u-transfers-thumb.webp';
      return `<img class="p2u-news-transfer-fallback" src="${asset}" alt="Predict2U Transfer Desk" loading="${feature?'eager':'lazy'}" decoding="async">`;
    }
    return `<div class="p2u-news-media-fallback"><span>${regionFlag(a.region)}</span><b>FOOTBALL</b></div>`;
  }

  function mediaHtml(a,feature=false){
    const src=image(a.image_url),fallback=fallbackMediaHtml(a,feature);
    if(!src)return fallback;
    const alt=clean(`${a.title||'Football story'} — ${a.source_name||'source image'}`,160);
    return `<div class="p2u-news-real-media">${fallback}<img class="p2u-news-source-image" data-news-source-image src="${esc(src)}" alt="${esc(alt)}" loading="${feature?'eager':'lazy'}" ${feature?'fetchpriority="high"':''} decoding="async" referrerpolicy="no-referrer"></div>`;
  }

  function metaHtml(a){
    return `<span class="p2u-news-source-name">${esc(a.source_name||'Football source')}${a.source_verified?' <i class="fa-solid fa-circle-check" aria-label="Verified source"></i>':''}</span><span>•</span><time datetime="${esc(a.published_at||'')}">${when(a.published_at)}</time>${Number(a.comment_count||0)?`<span>•</span><span><i class="fa-regular fa-comment"></i> ${Number(a.comment_count||0)}</span>`:''}`;
  }

  function topicCandidates(a){
    const rows=[
      ['source',a.source_name],['country',a.region],['league',a.league],['club',a.club],['player',a.player]
    ].filter(x=>clean(x[1],100));
    return rows.slice(0,3);
  }

  function topicHtml(a){
    const rows=topicCandidates(a);if(!rows.length)return'';
    return `<div class="p2u-news-topic-row">${rows.map(([type,value])=>`<button type="button" class="p2u-news-topic-chip ${following(type,value)?'is-following':''}" data-news-follow-type="${esc(type)}" data-news-follow-value="${esc(value)}" title="${following(type,value)?'Unfollow':'Follow'} ${esc(value)}"><i class="fa-solid ${following(type,value)?'fa-check':'fa-plus'}"></i>${esc(value)}</button>`).join('')}</div>`;
  }

  function actionsHtml(a,featured=false){
    const url=validUrl(a.url),saved=isSaved(a.id);
    return `<div class="p2u-news-actions">${url?`<a class="primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow"><i class="fa-solid fa-arrow-up-right-from-square"></i> Source</a>`:''}<button type="button" data-news-discuss="${esc(a.id)}"><i class="fa-regular fa-comments"></i> Discuss${Number(a.comment_count||0)?` · ${Number(a.comment_count)}`:''}</button><button type="button" class="${saved?'is-saved':''}" data-news-bookmark="${esc(a.id)}" aria-label="${saved?'Remove from':'Save to'} Read Later"><i class="fa-${saved?'solid':'regular'} fa-bookmark"></i>${featured?' '+(saved?'Saved':'Read later'):''}</button><button type="button" class="p2u-news-share-action" data-news-share="${esc(a.id)}" aria-label="Share story"><i class="fa-solid fa-share-nodes"></i><span>Share</span></button><button type="button" data-news-report-article="${esc(a.id)}" aria-label="Report story"><i class="fa-regular fa-flag"></i></button></div>`;
  }

  function featuredHtml(a){
    if(!a)return'';
    return `<article class="p2u-news-feature-card" data-news-id="${esc(a.id)}"><div class="p2u-news-feature-media">${mediaHtml(a,true)}</div><div class="p2u-news-feature-copy"><div class="p2u-news-badges">${articleBadges(a)}</div><h2>${esc(a.title)}</h2><p>${esc(clean(a.summary,420)||'Open the original report for the full story.')}</p><div class="p2u-news-meta">${metaHtml(a)}</div>${topicHtml(a)}${actionsHtml(a,true)}</div></article>`;
  }

  function cardHtml(a){
    return `<article class="p2u-news-card" data-news-id="${esc(a.id)}"><div class="p2u-news-card-media">${mediaHtml(a)}</div><div class="p2u-news-card-body"><div class="p2u-news-badges">${articleBadges(a)}</div><h3>${esc(a.title)}</h3><p>${esc(clean(a.summary,240)||'Open the source for the full report.')}</p><div class="p2u-news-meta">${metaHtml(a)}</div>${topicHtml(a)}${actionsHtml(a)}</div></article>`;
  }

  function trendScore(a){
    const ageHours=Math.max(0,(Date.now()-new Date(a.published_at||Date.now()).getTime())/36e5);
    return Number(a.comment_count||0)*8+(a.breaking?24:0)+(a.category==='transfer'?7:0)+(a.featured?30:0)+(a.pinned?80:0)-Math.min(ageHours,96)*.55;
  }

  function groupDuplicates(rows){
    const groups=new Map();
    for(const a of rows){
      const key=clean(a.canonical_key,180)||canonicalTitle(a.title)||String(a.id);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(a);
    }
    const output=[];
    for(const group of groups.values()){
      group.sort((a,b)=>(Number(b.source_verified)-Number(a.source_verified))||(new Date(b.published_at)-new Date(a.published_at)));
      const primary=Object.assign({},group[0],{_related:group.length-1,_relatedRows:group.slice(1)});
      output.push(primary);
    }
    return output;
  }

  function forYouMatch(a){
    if(!follows.length)return false;
    const hay=articleHay(a);
    return follows.some(f=>fuzzyMatch(f.entity_value,hay));
  }

  function applyFilter(){
    const q=search.trim();
    const grouped=groupDuplicates(articles);
    const directCount=q?grouped.filter(a=>directMatch(q,articleHay(a))).length:0;
    let rows=grouped.filter(a=>{
      if(activeFilter==='transfer'&&a.category!=='transfer')return false;
      if(activeFilter==='news'&&a.category==='transfer')return false;
      if(activeFilter==='breaking'&&!a.breaking)return false;
      if(activeFilter==='foryou'&&!forYouMatch(a))return false;
      if(activeFilter==='saved'&&!isSaved(a.id))return false;
      if(q&&!articleMatchesSearch(a,q))return false;
      return true;
    });
    searchMode=q&&directCount===0&&rows.length?'fuzzy':'exact';
    setSearchHint(searchMode==='fuzzy'?`Showing typo-tolerant matches for “${q}”.`:q&&rows.length===0?`No close match for “${q}”. Try a shorter club, league or player name.`:'');
    if(activeFilter==='discussed')rows.sort((a,b)=>(Number(b.comment_count||0)-Number(a.comment_count||0))||(trendScore(b)-trendScore(a)));
    else rows.sort((a,b)=>(Number(b.pinned)-Number(a.pinned))||(Number(b.featured)-Number(a.featured))||(activeFilter==='all'?trendScore(b)-trendScore(a):new Date(b.published_at)-new Date(a.published_at)));
    filtered=rows;render();
  }

  function emptyHtml(){
    if(!navigator.onLine)return'<div class="p2u-news-empty"><i class="fa-solid fa-wifi"></i><b>You are offline.</b><span>Saved stories and cached images may still be available. Reconnect to refresh the feed.</span></div>';
    if(activeFilter==='foryou'&&!follows.length)return'<div class="p2u-news-empty"><i class="fa-solid fa-wand-magic-sparkles"></i><b>Your For You feed is ready to learn.</b><span>Follow a club, league, country, player, source or topic above.</span></div>';
    if(activeFilter==='saved'&&!bookmarks.size)return'<div class="p2u-news-empty"><i class="fa-regular fa-bookmark"></i><b>No saved stories yet.</b><span>Tap Read later on any story to keep it here.</span></div>';
    return'<div class="p2u-news-empty"><i class="fa-regular fa-newspaper"></i><b>No stories match this view.</b><span>Refresh the desk or choose another filter.</span></div>';
  }

  function render(){
    const featured=$('#news-featured'),list=$('#news-list'),load=$('#news-load-more'),title=$('#news-list-title');
    if(!featured||!list)return;
    const first=filtered[0]||null;
    featured.innerHTML=first?featuredHtml(first):'';
    const rows=filtered.slice(first?1:0,visible);
    if(!filtered.length)list.innerHTML=emptyHtml();
    else list.innerHTML=rows.length?rows.map(cardHtml).join(''):'<div class="p2u-news-empty">More stories will appear here as sources update.</div>';
    if(load){load.hidden=visible>=filtered.length;load.textContent=`Load more (${Math.max(0,filtered.length-visible)})`;}
    if(title)title.textContent=({transfer:'Latest transfer updates',breaking:'Breaking football news',news:'Latest football stories',foryou:'Your followed football stories',discussed:'Most discussed stories',saved:'Read later'}[activeFilter]||'Trending football stories');
    const count=$('#news-result-count');if(count)count.textContent=`${filtered.length} stor${filtered.length===1?'y':'ies'}`;
  }

  function renderFollowBar(){
    const root=$('#news-followed-topics');if(!root)return;
    root.innerHTML=follows.length?follows.map(f=>`<button type="button" class="p2u-news-follow-pill" data-news-follow-type="${esc(f.entity_type)}" data-news-follow-value="${esc(f.entity_value)}"><span>${esc(f.entity_value)}</span><small>${esc(f.entity_type)}</small><i class="fa-solid fa-xmark"></i></button>`).join(''):'<span class="p2u-news-follow-empty">No followed topics yet. Add one to personalize your feed and alerts.</span>';
    const badge=$('#news-follow-count');if(badge)badge.textContent=String(follows.length);
  }

  async function runArticleQuery(sb,mode){
    const fields=mode==='modern'?MODERN_FIELDS:(mode==='base'?BASE_FIELDS:MIN_FIELDS);
    let q=sb.from(TABLE).select(fields).eq('published',true);
    if(mode==='modern')q=q.eq('moderation_status','visible').order('pinned',{ascending:false});
    return q.order('published_at',{ascending:false}).limit(180);
  }

  async function fetchArticles({silent=false}={}){
    const sb=await getClient();
    if(!sb){
      const cached=loadArticleCache();
      if(cached.length){articles=cached;visible=PAGE_SIZE;applyFilter();setServiceStatus('Showing the last saved news board while the live service reconnects.','warn');return articles;}
      if(!silent)$('#news-list').innerHTML='<div class="p2u-news-empty"><b>News service is unavailable.</b><span>Check the connection and try again.</span></div>';
      return[];
    }
    let result=await runArticleQuery(sb,'modern');schemaMode='modern';
    if(result.error&&isSchemaError(result.error)){result=await runArticleQuery(sb,'base');schemaMode='base';}
    if(result.error&&isSchemaError(result.error)){result=await runArticleQuery(sb,'minimal');schemaMode='minimal';}
    if(result.error){
      lastFetchError=String(result.error.message||'Could not load football news.');
      const cached=loadArticleCache();
      if(cached.length){articles=cached;visible=PAGE_SIZE;applyFilter();setServiceStatus('Live news is delayed. Showing the most recent saved stories.','warn');return articles;}
      if(!silent)$('#news-list').innerHTML='<div class="p2u-news-empty"><b>Could not load football news.</b><span>The desk will retry automatically. You can also press Refresh.</span></div>';
      setServiceStatus('Live news connection delayed. Automatic retry is active.','bad');return[];
    }
    const next=(Array.isArray(result.data)?result.data:[]).map(normalizeArticle);
    if(!initialLoad&&next.length){
      const previous=new Set(articles.map(a=>String(a.id)));
      next.filter(a=>!previous.has(String(a.id))).slice(0,5).forEach(a=>ingestNewsAlert(a));
    }
    articles=next;saveArticleCache(articles);initialLoad=false;visible=PAGE_SIZE;applyFilter();
    setServiceStatus(schemaMode==='modern'?'':`News board loaded in compatibility mode. Core stories, images, filters, comments and sharing remain active.`,schemaMode==='modern'?'ok':'warn');
    const updated=$('#news-updated');if(updated)updated.textContent=articles[0]?`Updated ${when(articles[0].published_at)}`:'Waiting for first sync';
    return articles;
  }

  function ingestNewsAlert(a){
    const matching=follows.find(f=>fuzzyMatch(f.entity_value,articleHay(a)));
    const reason=matching?`Matches followed ${matching.entity_type}: ${matching.entity_value}`:(a.category==='transfer'?'Transfer news enabled':a.breaking?'Breaking news enabled':'Football news enabled');
    const detail={id:a.id,title:a.category==='transfer'?'Transfer update':(a.breaking?'Breaking football news':'Football news'),body:a.title,newsType:a.category==='transfer'?'transfer':'football',source:a.source_name,reason,url:`news.html?article=${encodeURIComponent(a.id)}`,createdAt:new Date(a.published_at||Date.now()).getTime()};
    if(window.P2USmartAlerts&&window.P2USmartAlerts.news)window.P2USmartAlerts.news(detail);
    else window.dispatchEvent(new CustomEvent('p2u:news-alert',{detail}));
  }

  async function getComments(articleId){
    const sb=await getClient();if(!sb)return[];
    const {data,error}=await sb.from(COMMENTS).select('id,user_id,handle_snapshot,body,created_at').eq('article_id',articleId).eq('status','visible').order('created_at',{ascending:true}).limit(250);
    if(error)return[];return data||[];
  }

  function commentHtml(c){
    const own=session&&String(c.user_id)===String(session.user.id);
    return `<article class="p2u-news-comment" data-comment-id="${esc(c.id)}"><div class="p2u-news-comment-top"><div><strong>@${esc(c.handle_snapshot||'member')}</strong> <time>${when(c.created_at)}</time></div><div class="p2u-news-comment-tools">${own?'<span class="p2u-news-own-label">You</span>':''}<button type="button" data-news-report-comment="${esc(c.id)}" aria-label="Report comment"><i class="fa-regular fa-flag"></i></button></div></div><p>${esc(c.body)}</p></article>`;
  }

  async function discussionHtml(a){
    const comments=await getComments(a.id);
    return `<div class="p2u-news-discussion-head"><div><div class="p2u-news-kicker">NEWS COMMUNITY</div><h2>${esc(a.title)}</h2></div><button class="p2u-news-close" data-news-close aria-label="Close">×</button></div><div class="p2u-news-meta">${metaHtml(a)}</div><div class="p2u-news-trust-note"><i class="fa-solid fa-shield-halved"></i><span>Discuss the report, not other members. Source links open on the publisher site.</span></div><div class="p2u-news-comment-form">${session?`<label for="news-comment-body">Join the conversation</label><textarea id="news-comment-body" maxlength="600" placeholder="Add a respectful football comment…"></textarea><div class="p2u-news-comment-form-foot"><small>No abuse, spam, private information or repeated promotions.</small><button class="p2u-news-button" data-news-comment-submit="${esc(a.id)}">Post comment</button></div><div class="p2u-news-comment-message" aria-live="polite"></div>`:`<p>Sign in to join the discussion.</p><a class="p2u-news-button" href="account.html">Open Account Center</a>`}</div><div class="p2u-news-comments-head"><h3>${comments.length} comment${comments.length===1?'':'s'}</h3><button type="button" class="p2u-news-link-button" data-news-report-article="${esc(a.id)}"><i class="fa-regular fa-flag"></i> Report story</button></div><div id="news-comments-list">${comments.length?comments.map(commentHtml).join(''):'<div class="p2u-news-empty compact">No comments yet. Start the conversation.</div>'}</div>`;
  }

  async function openDiscussion(id){
    const a=articles.find(x=>String(x.id)===String(id));if(!a)return;currentArticle=a;lastFocused=document.activeElement;
    const back=$('#news-discussion-backdrop'),panel=$('#news-discussion-panel');if(!back||!panel)return;
    panel.innerHTML='<div class="p2u-news-empty">Loading discussion…</div>';back.classList.add('is-open');back.setAttribute('aria-hidden','false');document.body.classList.add('p2u-news-discussion-open');
    panel.innerHTML=await discussionHtml(a);panel.querySelector('[data-news-close]')?.focus();
  }

  function closeDiscussion(){const back=$('#news-discussion-backdrop');if(back){back.classList.remove('is-open');back.setAttribute('aria-hidden','true')}document.body.classList.remove('p2u-news-discussion-open');currentArticle=null;if(lastFocused&&lastFocused.focus)lastFocused.focus();}

  async function postComment(articleId){
    const textarea=$('#news-comment-body'),message=$('.p2u-news-comment-message'),body=clean(textarea&&textarea.value,600);if(!body)return;
    const sb=await getClient();session=window.P2UAccounts&&window.P2UAccounts.getSession?window.P2UAccounts.getSession():session;
    if(!sb||!session){if(message)message.textContent='Sign in before posting.';return;}
    if(message)message.textContent='Posting…';
    const {error}=await sb.rpc('p2u_news_post_comment',{p_article_id:Number(articleId),p_body:body});
    if(error){if(message)message.textContent=error.message||'Comment could not be posted.';return;}
    if(textarea)textarea.value='';if(message)message.textContent='Comment posted.';
    const a=articles.find(x=>String(x.id)===String(articleId));if(a)a.comment_count=Number(a.comment_count||0)+1;
    if(currentArticle)$('#news-discussion-panel').innerHTML=await discussionHtml(currentArticle);applyFilter();
  }

  async function copyText(value){
    try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(value);return true;}}catch(_){}
    try{const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();return ok;}catch(_){return false;}
  }

  async function shareArticle(id){
    const a=articles.find(x=>String(x.id)===String(id));if(!a)return;
    const url=`${location.origin}${location.pathname.replace(/news\.html$/,'news.html')}?article=${encodeURIComponent(a.id)}`;
    const payload={title:a.title,text:`${a.title} — ${a.source_name||'Predict2U Football News'}`,url};
    try{
      if(navigator.share){await navigator.share(payload);showToast('Share sheet opened.');return;}
      const copied=await copyText(url);showToast(copied?'News link copied.':'Copy this link from the address bar.',copied?'good':'bad');
    }catch(error){if(error&&error.name!=='AbortError'){const copied=await copyText(url);showToast(copied?'News link copied.':'Sharing was cancelled.',copied?'good':'bad');}}
  }

  function showToast(message,type='good'){
    let el=$('#p2u-news-toast');if(!el){el=document.createElement('div');el.id='p2u-news-toast';document.body.appendChild(el)}
    el.textContent=message;el.className=`p2u-news-toast show ${type}`;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.className='p2u-news-toast',3000);
  }

  async function toggleBookmark(id){
    const key=String(id),was=isSaved(key);
    if(was)bookmarks.delete(key);else bookmarks.add(key);saveLocalState();applyFilter();
    if(!session){showToast(was?'Removed from Read Later on this device.':'Saved on this device. Sign in to sync.');return}
    const sb=await getClient();
    const {data,error}=await sb.rpc('p2u_news_toggle_bookmark',{p_article_id:Number(id)});
    if(error){showToast(was?'Removed on this device. Cloud sync is temporarily unavailable.':'Saved on this device. Cloud sync is temporarily unavailable.','warn');return}
    if(data&&data.saved)bookmarks.add(key);else bookmarks.delete(key);saveLocalState();applyFilter();showToast(data&&data.saved?'Saved to Read Later.':'Removed from Read Later.');
  }

  async function toggleFollow(type,value,original=''){
    type=clean(type,20);value=clean(value,100);if(!value)return;
    const exists=following(type,value);
    const localToggle=()=>{if(exists)follows=follows.filter(f=>!(f.entity_type===type&&normalize(f.entity_value)===normalize(value)));else follows.unshift({entity_type:type,entity_value:value,created_at:new Date().toISOString()});saveLocalState();renderFollowBar();applyFilter();};
    if(!session){localToggle();showToast(`${exists?'Unfollowed':'Following'} ${value} on this device.${original&&normalize(original)!==normalize(value)?` Corrected from “${original}”.`:''}`);return}
    const sb=await getClient();const {data,error}=await sb.rpc('p2u_news_toggle_follow',{p_entity_type:type,p_entity_value:value});
    if(error){localToggle();showToast(`${exists?'Unfollowed':'Following'} ${value} on this device. Cloud sync is temporarily unavailable.`,'warn');return}
    if(data&&data.following)follows.unshift({entity_type:type,entity_value:value,created_at:new Date().toISOString()});
    else follows=follows.filter(f=>!(f.entity_type===type&&normalize(f.entity_value)===normalize(value)));
    saveLocalState();renderFollowBar();applyFilter();
    try{window.dispatchEvent(new CustomEvent('p2u:news-follows-changed',{detail:{follows:follows.slice(),version:VERSION}}))}catch(_){}
    showToast(`${data&&data.following?'Following':'Unfollowed'} ${value}.${original&&normalize(original)!==normalize(value)?` Corrected from “${original}”.`:''}`);
  }

  function openReport(kind,id){
    if(!session){showToast('Sign in to report content.','bad');return}
    lastFocused=document.activeElement;
    const back=$('#news-discussion-backdrop'),panel=$('#news-discussion-panel');if(!back||!panel)return;
    const label=kind==='comment'?'comment':'story';
    panel.innerHTML=`<div class="p2u-news-discussion-head"><div><div class="p2u-news-kicker">TRUST & SAFETY</div><h2>Report this ${label}</h2></div><button class="p2u-news-close" data-news-close aria-label="Close">×</button></div><p class="p2u-news-report-copy">Reports are reviewed by Predict2U moderators. Do not include passwords, phone numbers or other private information.</p><div class="p2u-news-comment-form"><label for="news-report-reason">Reason</label><select id="news-report-reason"><option value="spam">Spam or promotion</option><option value="abuse">Abuse or harassment</option><option value="misleading">Misleading information</option><option value="copyright">Copyright concern</option><option value="privacy">Privacy concern</option><option value="other">Other</option></select><label for="news-report-details">Details (optional)</label><textarea id="news-report-details" maxlength="500" placeholder="Briefly explain the issue…"></textarea><button class="p2u-news-button" data-news-report-submit data-report-kind="${esc(kind)}" data-report-id="${esc(id)}">Send report</button><div class="p2u-news-comment-message" aria-live="polite"></div></div>`;
    back.classList.add('is-open');back.setAttribute('aria-hidden','false');document.body.classList.add('p2u-news-discussion-open');panel.querySelector('[data-news-close]')?.focus();
  }

  async function submitReport(button){
    const sb=await getClient();if(!sb||!session)return;
    const kind=button.dataset.reportKind,id=Number(button.dataset.reportId),reason=$('#news-report-reason')?.value||'other',details=clean($('#news-report-details')?.value,500),message=$('.p2u-news-comment-message');
    button.disabled=true;if(message)message.textContent='Sending…';
    const args={p_article_id:kind==='article'?id:null,p_comment_id:kind==='comment'?id:null,p_reason:reason,p_details:details};
    const {error}=await sb.rpc('p2u_news_report',args);button.disabled=false;
    if(error){if(message)message.textContent=error.message||'Report could not be sent.';return}
    if(message)message.textContent='Report sent. Thank you.';setTimeout(closeDiscussion,700);
  }

  function addTopicFromForm(){
    const type=$('#news-follow-type')?.value||'topic',input=$('#news-follow-input'),raw=clean(input&&input.value,100);if(!raw){showToast('Enter a club, league, country, player, source or topic.','bad');return}
    const value=type==='topic'?raw:nearestKnown(type,raw);toggleFollow(type,value,raw);if(input)input.value='';
  }

  function bind(){
    document.addEventListener('error',e=>{const target=e.target;if(target&&target.matches&&target.matches('img[data-news-source-image]'))target.remove();},true);
    document.addEventListener('click',e=>{
      const filter=e.target.closest('[data-news-filter]');if(filter){$$('[data-news-filter]').forEach(b=>b.classList.toggle('is-active',b===filter));activeFilter=filter.dataset.newsFilter||'all';visible=PAGE_SIZE;applyFilter();return;}
      const heroFilter=e.target.closest('[data-news-hero-filter]');if(heroFilter){const target=heroFilter.dataset.newsHeroFilter||'all',tab=$(`[data-news-filter="${target}"]`);$$('[data-news-filter]').forEach(b=>b.classList.toggle('is-active',b===tab));activeFilter=target;visible=PAGE_SIZE;applyFilter();$('.p2u-news-controls')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
      const jump=e.target.closest('[data-news-jump]');if(jump){$(jump.dataset.newsJump||'#news-feed')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
      const discuss=e.target.closest('[data-news-discuss]');if(discuss){openDiscussion(discuss.dataset.newsDiscuss);return;}
      const share=e.target.closest('[data-news-share]');if(share){shareArticle(share.dataset.newsShare);return;}
      const bookmark=e.target.closest('[data-news-bookmark]');if(bookmark){toggleBookmark(bookmark.dataset.newsBookmark);return;}
      const follow=e.target.closest('[data-news-follow-type]');if(follow){toggleFollow(follow.dataset.newsFollowType,follow.dataset.newsFollowValue);return;}
      const reportArticle=e.target.closest('[data-news-report-article]');if(reportArticle){openReport('article',reportArticle.dataset.newsReportArticle);return;}
      const reportComment=e.target.closest('[data-news-report-comment]');if(reportComment){openReport('comment',reportComment.dataset.newsReportComment);return;}
      const reportSubmit=e.target.closest('[data-news-report-submit]');if(reportSubmit){submitReport(reportSubmit);return;}
      if(e.target.closest('[data-news-close]')||e.target.id==='news-discussion-backdrop'){closeDiscussion();return;}
      const submit=e.target.closest('[data-news-comment-submit]');if(submit){postComment(submit.dataset.newsCommentSubmit);return;}
      if(e.target.closest('#news-follow-add')){addTopicFromForm();return;}
      if(e.target.closest('#news-refresh')){fetchArticles();return;}
      if(e.target.closest('#news-load-more')){visible+=PAGE_SIZE;render();return;}
    });
    const input=$('#news-search');if(input)input.addEventListener('input',()=>{search=input.value.trim();visible=PAGE_SIZE;applyFilter();});
    $('#news-follow-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addTopicFromForm();}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDiscussion();});
    window.addEventListener('online',()=>{showToast('Back online. Refreshing news.');fetchArticles({silent:true});});
    window.addEventListener('offline',()=>{showToast('You are offline. Cached stories remain available.','bad');render();});
  }

  async function realtime(){
    const sb=await getClient();if(!sb||!sb.channel)return;
    try{channel=sb.channel('p2u-news-live-v197').on('postgres_changes',{event:'INSERT',schema:'public',table:TABLE},payload=>{if(payload&&payload.new&&payload.new.published!==false){ingestNewsAlert(payload.new);fetchArticles({silent:true});}}).on('postgres_changes',{event:'INSERT',schema:'public',table:COMMENTS},payload=>{if(currentArticle&&String(payload.new&&payload.new.article_id)===String(currentArticle.id))openDiscussion(currentArticle.id);}).subscribe();}catch(_){}
  }

  async function init(){
    bind();await loadIdentity();await loadPersonalization();await fetchArticles();await realtime();
    const requested=new URLSearchParams(location.search).get('article');if(requested)setTimeout(()=>openDiscussion(requested),100);
    setInterval(()=>fetchArticles({silent:true}),REFRESH_MS);
    document.documentElement.dataset.p2uNewsReady='true';window.dispatchEvent(new CustomEvent('p2u:news-ready',{detail:{version:VERSION,count:articles.length,follows:follows.length,saved:bookmarks.size}}));
  }

  window.P2UNews={version:VERSION,refresh:fetchArticles,open:openDiscussion,getArticles:()=>articles.slice(),getFollows:()=>follows.slice(),getBookmarks:()=>[...bookmarks]};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
