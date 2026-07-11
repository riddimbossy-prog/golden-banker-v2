#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const root=__dirname;
const required=[
  "index.html","board.html","engines.html","proof.html","scorecards.html",
  "league-dna.html","community.html","trust.html","responsible-gambling.html",
  "terms.html","privacy.html","disclaimer.html","404.html",
  "brand-experience.js","brand-experience.css","performance-freshness.js","performance-freshness.css","personalization.js","personalization.css","smart-alerts.js","smart-alerts.css","intelligence.css",
  "site-health-widget.js","site-health.css","social-preview.png",
  "favicon.ico","favicon-16x16.png","favicon-32x32.png","apple-touch-icon.png",
  "icon-192.png","icon-512.png","maskable-icon.png","manifest.webmanifest",
  "predict2u-logo.png","predict2u-mark.png","performance-budget.js","sw.js"
];
const missing=required.filter(f=>!fs.existsSync(path.join(root,f)));
if(missing.length){
  console.error("Repository is missing required public files:\n- "+missing.join("\n- "));
  process.exit(1);
}
console.log(`Repository preflight passed: ${required.length} required public files found.`);
