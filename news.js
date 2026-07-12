/* Predict2U v197 news bootstrap — resilient feed, typo-tolerant search,
   compatibility fallback and always-visible sharing.
   Compatibility markers: p2u_news_articles, p2u_news_post_comment,
   p2u:news-alert and window.P2UNews are implemented in news-app-v197.js. */
(function(){
  'use strict';
  if(window.__P2U_NEWS_V197_LOADING__)return;
  window.__P2U_NEWS_V197_LOADING__=true;
  const script=document.createElement('script');
  script.src='news-app-v197.js';
  script.async=false;
  script.dataset.p2uNewsBundle='v197';
  script.onerror=()=>{window.__P2U_NEWS_V197_LOADING__=false;};
  document.head.appendChild(script);
})();
