#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const root=__dirname;
const errors=[],warnings=[],passed=[];
const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const size=f=>fs.statSync(path.join(root,f)).size;
const exists=f=>fs.existsSync(path.join(root,f));

const budgets={
  "index.html":70000,
  "board.html":70000,
  "engines.html":50000,
  "banker-engine.js":110000,
  "p2u-intelligence.js":35000,
  "brand-experience.css":22000,
  "performance-freshness.js":18000,
  "performance-freshness.css":14000,
  "personalization.js":30000,
  "personalization.css":18000,
  "smart-alerts.js":42000,
  "smart-alerts.css":22000,
  "admin.html":30000,
  "backend-admin.js":42000,
  "backend-admin.css":32000,
  "site-controls.js":22000,
  "site-controls.css":8000,
  "account-cloud.js":65000,
  "account-cloud.css":26000,
  "push-notifications.js":36000,
  "push-notifications.css":18000,
  "analytics.js":36000,
  "analytics.css":14000,
  "product-analytics.js":26000,
  "product-analytics.css":14000,
  "account.html":18000,
  "profile.html":12000,
  "news.html":18000,
  "news.js":28000,
  "news.css":32000,
  "predict2u-transfers.webp":180000,
  "predict2u-transfers-thumb.webp":30000
};
for(const [file,limit] of Object.entries(budgets)){
  if(!exists(file)){errors.push(`Missing budgeted file: ${file}`);continue;}
  const bytes=size(file);
  if(bytes>limit)errors.push(`${file} is ${bytes} bytes; budget is ${limit}.`);
  else passed.push(`${file}: ${bytes}/${limit} bytes`);
}

for(const page of ["index.html","board.html"]){
  const html=read(page);
  for(const host of ["cdn.tailwindcss.com","cdnjs.cloudflare.com","cdn.jsdelivr.net"]){
    if(!new RegExp(`rel=["']preconnect["'][^>]+${host.replaceAll(".","\\.")}`).test(html))
      errors.push(`${page}: missing preconnect for ${host}`);
  }
  if(!/performance-freshness\.css/.test(html)||!/performance-freshness\.js[^>]+defer/.test(html))
    errors.push(`${page}: performance/freshness layer is not loaded correctly.`);
  if(!/classList\.add\(['"]p2u-booting['"]\)/.test(html))
    errors.push(`${page}: CSS loading state is not armed in the head.`);
}

const sw=read("sw.js");
const cacheMatch=sw.match(/CACHE_VERSION\s*=\s*["'](predict2u-v\d+(?:\.\d+)?)["']/);
if(!cacheMatch)errors.push("sw.js is missing a valid predict2u-vN cache version.");
else passed.push(`sw.js cache: ${cacheMatch[1]}`);
for(const token of ["NETWORK_TIMEOUT_MS","canonicalRequest","performance-freshness.js","performance-freshness.css","personalization.js","personalization.css","smart-alerts.js","smart-alerts.css","admin.html","backend-admin.js","backend-admin.css","admin-config.js","site-controls.js","site-controls.css","account.html","profile.html","cloud-config.js","account-cloud.js","account-cloud.css","push-notifications.js","push-notifications.css","analytics.js","analytics.css","product-analytics.js","product-analytics.css"]){
  if(!sw.includes(token))errors.push(`sw.js missing ${token}`);
}
for(const page of ["index.html","board.html"]){
  const html=read(page);
  for(const token of ["date-strip","date-chip","date-chip-day","date-chip-date","date-chip-count"]){
    if(!html.includes(token))errors.push(`${page}: mobile date rail missing ${token}`);
  }
}
if(!/content-visibility\s*:\s*auto/.test(read("performance-freshness.css")))
  errors.push("Lower-page content visibility optimization is missing.");
if(!/P2UBoardRefresh/.test(read("index.html"))||!/P2UBoardRefresh/.test(read("board.html")))
  errors.push("In-place board refresh hook is missing.");
if(/p2u-system-alert|Core match data is more than 36 hours old/.test(read("brand-experience.js")))
  errors.push("Removed full-width status banner returned.");


for(const page of ["index.html","board.html"]){
  const html=read(page);
  if(!/personalization\.css/.test(html)||!/personalization\.js/.test(html))errors.push(`${page}: personalization layer is not loaded.`);
}
for(const token of ["favoriteEngines","favoriteLeagues","hiddenLeagues","recentMatches","cardView"]){
  if(!read("personalization.js").includes(token))errors.push(`personalization.js missing ${token}`);
}


for(const page of ["index.html","board.html","community.html"]){
  const html=read(page);
  if(!/smart-alerts\.css/.test(html)||!/smart-alerts\.js[^>]+defer/.test(html))errors.push(`${page}: Smart Alerts layer is not loaded correctly.`);
}
for(const token of ["communityWin","verifiedOnly","followedUsers","trendingWins","p2u:community-win"]){
  if(!read("smart-alerts.js").includes(token))errors.push(`smart-alerts.js missing ${token}`);
}


for(const token of ["admin.html","backend-admin.js","backend-admin.css","admin-config.js","site-controls.js","site-controls.css","account.html","profile.html","cloud-config.js","account-cloud.js","account-cloud.css","push-notifications.js","push-notifications.css","analytics.js","analytics.css","product-analytics.js","product-analytics.css"]){
  if(!sw.includes(token))errors.push(`sw.js missing ${token}`);
}
const admin=read("admin.html"),adminControl=read("backend-admin.js"),adminSql=read("SUPABASE_BACKEND_ADMIN_v181.sql");
if(!/meta name="robots" content="noindex,nofollow"/.test(admin))errors.push("admin.html must remain noindex/nofollow.");
for(const token of ["p2u_admin_save_site_settings","p2u_admin_moderate_community","p2u_admin_assign_role","p2uBackendAdminReady"]){if(!adminControl.includes(token))errors.push(`backend-admin.js missing ${token}`);}
for(const token of ["enable row level security","security definer","p2u_has_admin_role"]){if(!adminSql.toLowerCase().includes(token))errors.push(`backend admin SQL missing ${token}`);}
if(!read("robots.txt").includes("Disallow: /admin.html"))errors.push("robots.txt does not disallow admin.html.");


for(const page of ["index.html","board.html","community.html","account.html"]){
  const html=read(page);
  if(!/account-cloud\.css/.test(html)||!/account-cloud\.js/.test(html))errors.push(`${page}: account cloud layer is not loaded.`);
}
for(const token of ["p2u_cloud_state","p2u_follows","signInWithOtp","syncNow","toggleFollow"]){if(!read("account-cloud.js").includes(token))errors.push(`account-cloud.js missing ${token}`);}

const pushClient=read("push-notifications.js"),pushSql=read("SUPABASE_PUSH_SETUP_v183.sql");
for(const token of ["PushManager","p2u_register_push_subscription","p2u_save_push_preferences","quiet_enabled"]){if(!pushClient.includes(token))errors.push(`push-notifications.js missing ${token}`);}
for(const token of ["p2u_push_subscriptions","p2u_push_preferences","p2u_push_jobs","p2u_push_delivery_log"]){if(!pushSql.includes(token))errors.push(`push setup SQL missing ${token}`);}
if(!read("account-cloud.js").includes("push-notifications.js"))errors.push("account-cloud.js does not load the push layer.");

const buildVersion=exists("BUILD_VERSION.txt")?read("BUILD_VERSION.txt").trim():"unknown";
const report={
  generatedAt:new Date().toISOString(),
  version:buildVersion,
  errors,
  warnings,
  passedCount:passed.length,
  budgets:Object.fromEntries(Object.entries(budgets).map(([f,limit])=>[f,{bytes:exists(f)?size(f):null,limit}]))
};
fs.writeFileSync(path.join(root,"performance-budget.json"),JSON.stringify(report,null,2)+"\n");
console.log(`Performance budget: ${errors.length} error(s), ${warnings.length} warning(s), ${passed.length} checks passed.`);
for(const x of errors)console.error("ERROR:",x);
for(const x of warnings)console.warn("WARNING:",x);
if(errors.length)process.exit(1);
