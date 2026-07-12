const fs=require('fs');
const path=require('path');
const root=__dirname;
const js=fs.readFileSync(path.join(root,'system-health-admin.js'),'utf8');
const css=fs.readFileSync(path.join(root,'system-health-admin.css'),'utf8');
const sql=fs.readFileSync(path.join(root,'SUPABASE_RELIABILITY_COMMENTS_v198.sql'),'utf8');
const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
const checks=[
  ['health RPC',sql.includes('public.p2u_admin_system_health()')],
  ['admin-only authorization',sql.includes("p2u_has_admin_role(array['owner','admin','moderator'])")],
  ['no service key in client',!js.includes('SUPABASE_SERVICE_ROLE_KEY')&&!js.includes('service_role')],
  ['public route checks',js.includes("'board.html','news.html','community.html','account.html','sw.js','news-app-v198.js'")],
  ['health panel mount',js.includes("button.dataset.adminTab='health'")&&js.includes("panel.dataset.adminPanel='health'" )],
  ['admin assets linked',html.includes('system-health-admin.css')&&html.includes('system-health-admin.js')],
  ['responsive styles',css.includes('@media(max-width:980px)')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length){process.exitCode=1;console.error(`${failed.length} health check(s) failed.`)}else console.log(`All ${checks.length} System Health checks passed.`);
