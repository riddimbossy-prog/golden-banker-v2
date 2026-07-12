/* Predict2U v198 news bootstrap — resilient feed, typo-tolerant search,
   repaired discussion posting and always-visible sharing.
   Compatibility markers: p2u_news_articles, p2u_news_post_comment,
   p2u:news-alert and window.P2UNews are implemented in news-app-v198.js. */
(function(){
  'use strict';
  if(window.__P2U_NEWS_V198_LOADING__)return;
  window.__P2U_NEWS_V198_LOADING__=true;
  const script=document.createElement('script');
  script.src='news-app-v198.js';
  script.async=false;
  script.dataset.p2uNewsBundle='v198';
  script.onerror=()=>{window.__P2U_NEWS_V198_LOADING__=false;};
  document.head.appendChild(script);
})();
