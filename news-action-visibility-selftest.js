'use strict';
const fs=require('fs');
const path=require('path');
const root=__dirname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const app=read('news-app-v201.js');
const css=read('news-actions-v208.css')+'\n'+read('ui-foundation-v217.css');
const html=read('news.html');
const checks=[
  ['Source label',app.includes('<span>Source</span>')],
  ['Discuss label',app.includes('<span>Discuss${')],
  ['Read later label',app.includes("${saved?'Saved':'Read later'}")],
  ['Share label',app.includes('<span>Share</span>')],
  ['Report label',app.includes('Report story')],
  ['Bookmark class',app.includes('p2u-news-bookmark-action')],
  ['Report class',app.includes('p2u-news-report-action')],
  ['Two-column phone grid',css.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important')],
  ['Report moved to overflow',app.includes('p2u-news-more-menu')&&css.includes('p2u-news-more-menu')],
  ['Narrow-phone fallback',css.includes('@media(max-width:340px)')],
  ['Stylesheet linked after responsive layer',html.indexOf('news-actions-v208.css')>html.indexOf('device-responsive-v207.css')],
  ['v217 release footer',html.includes('Predict2U Football News · v217')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'}: ${name}`);
if(failed.length){console.error(`News action visibility: ${failed.length} failure(s).`);process.exit(1);}
console.log(`News action visibility: ${checks.length} checks passed.`);
