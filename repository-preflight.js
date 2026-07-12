#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const root=__dirname;
const required=[
  'index.html','board.html','engines.html','proof.html','scorecards.html','league-dna.html','community.html','news.html','trust.html','responsible-gambling.html','terms.html','privacy.html','disclaimer.html','404.html',
  'brand-experience.js','brand-experience.css','performance-freshness.js','performance-freshness.css','personalization.js','personalization.css','smart-alerts.js','smart-alerts.css','intelligence.css','site-health-widget.js','site-health.css','mobile-app-nav.js','mobile-app-nav.css','growth-sharing.js','growth-sharing.css','share.html',
  'social-preview.png','favicon.ico','favicon-16x16.png','favicon-32x32.png','apple-touch-icon.png','icon-192.png','icon-512.png','maskable-icon.png','manifest.webmanifest','predict2u-logo.png','predict2u-mark.png','performance-budget.js','sw.js',
  'account.html','profile.html','cloud-config.js','account-cloud.js','account-cloud.css','SUPABASE_CLOUD_SETUP_v180.sql',
  'admin.html','backend-admin.js','backend-admin.css','SUPABASE_BACKEND_ADMIN_v181.sql','site-controls.js','site-controls.css','admin-config.js','community-freshness.js','community-mobile-polish.css',
  'push-notifications.js','push-notifications.css','news.js','news.css','predict2u-transfers.webp','predict2u-transfers-thumb.webp','SUPABASE_FOOTBALL_NEWS_v189.sql','football-assets.js','community-consistency.js','brand-performance.css','analytics.js','analytics.css','product-analytics.js','product-analytics.css','SUPABASE_ANALYTICS_v186.sql','SUPABASE_PUSH_SETUP_v183.sql','PUSH_NOTIFICATIONS_v183.md','VAPID_KEY_GENERATOR_v183.html','queue-push-events.js','push-event-snapshot.json','supabase/functions/p2u-push-dispatch/index.ts','supabase/functions/p2u-news-sync/index.ts','.github/workflows/news-sync.yml'
];
const missing=required.filter(f=>!fs.existsSync(path.join(root,f)));
if(missing.length){console.error('Repository is missing required public files:\n- '+missing.join('\n- '));process.exit(1)}
console.log(`Repository preflight passed: ${required.length} required public files found.`);
