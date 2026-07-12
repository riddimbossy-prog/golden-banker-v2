/* Predict2U v192 news bootstrap — loads the cached feature bundle.
   Compatibility markers: p2u_news_articles, p2u_news_post_comment,
   p2u:news-alert and window.P2UNews are implemented in news-app-v192.js. */
(function(){
  'use strict';
  if(window.__P2U_NEWS_V192_LOADING__)return;
  window.__P2U_NEWS_V192_LOADING__=true;
  const script=document.createElement('script');
  script.src='news-app-v192.js';
  script.async=false;
  script.dataset.p2uNewsBundle='v192';
  script.onerror=()=>{window.__P2U_NEWS_V192_LOADING__=false;};
  document.head.appendChild(script);
})();
