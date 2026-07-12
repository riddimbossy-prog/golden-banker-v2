const fs=require('fs');
const path=require('path');
const root=__dirname;
const app=fs.readFileSync(path.join(root,'news-app-v198.js'),'utf8');
const sql=fs.readFileSync(path.join(root,'SUPABASE_RELIABILITY_COMMENTS_v198.sql'),'utf8');
const checks=[
  ['v198 bundle',app.includes("const VERSION='v198'")],
  ['fresh auth resolution',app.includes('resolveActiveSession')&&app.includes('sb.auth.getSession')],
  ['double-submit protection',app.includes('btn.disabled=true')&&app.includes('btn.disabled=false')],
  ['friendly schema error',app.includes('one-time v198 database repair')],
  ['adaptive comment reads',app.includes("select('id,user_id,handle_snapshot,body,status,created_at')")&&app.includes('isSchemaError(result.error)')],
  ['same RPC retained',app.includes("sb.rpc('p2u_news_post_comment'")],
  ['schema-tolerant article check',sql.includes('select to_jsonb(a) into article_doc')],
  ['optional moderation field',sql.includes("article_doc->>'moderation_status'")],
  ['authenticated grant',sql.includes('grant execute on function public.p2u_news_post_comment(bigint,text) to authenticated')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length){process.exitCode=1;console.error(`${failed.length} comment check(s) failed.`)}else console.log(`All ${checks.length} News discussion checks passed.`);
