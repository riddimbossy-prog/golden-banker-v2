-- Predict2U v198 — News discussion repair and Admin System Health.
-- Safe to run more than once. Run after the v189 News SQL.

begin;

-- Keep the comments table compatible with both the original and personalized News schemas.
alter table if exists public.p2u_news_comments
  add column if not exists status text not null default 'visible',
  add column if not exists updated_at timestamptz not null default now();

-- Schema-tolerant comment posting. This version does not directly reference optional
-- article columns such as moderation_status, so it works on both v189 and v192 schemas.
create or replace function public.p2u_news_post_comment(p_article_id bigint,p_body text)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  clean_body text:=trim(regexp_replace(coalesce(p_body,''),'\s+',' ','g'));
  handle_value text:='member';
  article_doc jsonb;
  row_out public.p2u_news_comments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode='42501';
  end if;

  if p_article_id is null then raise exception 'News article not found'; end if;
  if char_length(clean_body)<2 or char_length(clean_body)>600 then
    raise exception 'Comment must be 2 to 600 characters';
  end if;

  select to_jsonb(a) into article_doc
  from public.p2u_news_articles a
  where a.id=p_article_id and a.published=true;

  if article_doc is null then raise exception 'News article not found'; end if;
  if coalesce(nullif(article_doc->>'moderation_status',''),'visible')<>'visible' then
    raise exception 'News article is not open for discussion';
  end if;

  if (select count(*) from public.p2u_news_comments
      where user_id=auth.uid() and created_at>now()-interval '10 minutes')>=10 then
    raise exception 'Comment limit reached. Try again shortly.';
  end if;

  if exists(
    select 1 from public.p2u_news_comments
    where user_id=auth.uid() and article_id=p_article_id
      and lower(body)=lower(clean_body)
      and created_at>now()-interval '1 hour'
  ) then
    raise exception 'Duplicate comment';
  end if;

  if clean_body ~* '(https?://[^ ]+.*https?://|telegram|whatsapp me|guaranteed win|free money|dm me for|contact me on|(.)\1{11,})' then
    raise exception 'Comment looks like spam';
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'select left(coalesce(nullif(handle,'''') ,''member''),50) from public.profiles where id=$1'
      into handle_value using auth.uid();
  end if;

  insert into public.p2u_news_comments(article_id,user_id,handle_snapshot,body,status)
  values(p_article_id,auth.uid(),coalesce(nullif(handle_value,''),'member'),clean_body,'visible')
  returning * into row_out;

  return to_jsonb(row_out);
end;
$$;

revoke all on function public.p2u_news_post_comment(bigint,text) from public;
grant execute on function public.p2u_news_post_comment(bigint,text) to authenticated;

-- Ensure comment counts remain accurate.
create or replace function public.p2u_news_update_comment_count()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare affected_id bigint;
begin
  affected_id:=case when tg_op='DELETE' then old.article_id else new.article_id end;
  update public.p2u_news_articles
  set comment_count=(
    select count(*) from public.p2u_news_comments
    where article_id=affected_id and coalesce(status,'visible')='visible'
  ),updated_at=now()
  where id=affected_id;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists p2u_news_comment_count_trigger on public.p2u_news_comments;
create trigger p2u_news_comment_count_trigger
after insert or update or delete on public.p2u_news_comments
for each row execute function public.p2u_news_update_comment_count();

-- Owner/admin/moderator-only health snapshot for the browser Admin console.
create or replace function public.p2u_admin_system_health()
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  checks jsonb:='[]'::jsonb;
  overall text:='healthy';
  issue_count integer:=0;
  row_count bigint:=0;
  pending_count bigint:=0;
  latest_story timestamptz:=null;
  has_table boolean;
  has_comment_rpc boolean;
begin
  if auth.uid() is null or not public.p2u_has_admin_role(array['owner','admin','moderator']) then
    raise exception 'Admin role required' using errcode='42501';
  end if;

  has_table:=to_regclass('public.p2u_site_settings') is not null;
  checks:=checks||jsonb_build_array(jsonb_build_object('key','board','label','Board settings','ok',has_table,'level',case when has_table then 'ok' else 'critical' end));
  if not has_table then overall:='critical';issue_count:=issue_count+1;end if;

  has_table:=to_regclass('public.p2u_news_articles') is not null;
  row_count:=0;latest_story:=null;
  if has_table then execute 'select count(*),max(published_at) from public.p2u_news_articles where published=true' into row_count,latest_story;end if;
  checks:=checks||jsonb_build_array(jsonb_build_object('key','news','label','Football news','ok',has_table,'level',case when has_table then 'ok' else 'critical' end,'count',row_count,'latest_at',latest_story));
  if not has_table then overall:='critical';issue_count:=issue_count+1;end if;

  has_table:=to_regclass('public.p2u_news_comments') is not null;
  row_count:=0;if has_table then execute 'select count(*) from public.p2u_news_comments' into row_count;end if;
  checks:=checks||jsonb_build_array(jsonb_build_object('key','comments_table','label','News comments table','ok',has_table,'level',case when has_table then 'ok' else 'critical' end,'count',row_count));
  if not has_table then overall:='critical';issue_count:=issue_count+1;end if;

  has_comment_rpc:=to_regprocedure('public.p2u_news_post_comment(bigint,text)') is not null;
  checks:=checks||jsonb_build_array(jsonb_build_object('key','comments_rpc','label','Comment posting function','ok',has_comment_rpc,'level',case when has_comment_rpc then 'ok' else 'critical' end));
  if not has_comment_rpc then overall:='critical';issue_count:=issue_count+1;end if;

  has_table:=to_regclass('public.p2u_push_jobs') is not null;
  pending_count:=0;if has_table then execute 'select count(*) from public.p2u_push_jobs where status=''pending''' into pending_count;end if;
  checks:=checks||jsonb_build_array(jsonb_build_object('key','push','label','Push queue','ok',has_table,'level',case when has_table then 'ok' else 'warning' end,'pending',pending_count));
  if not has_table and overall<>'critical' then overall:='warning';issue_count:=issue_count+1;end if;

  has_table:=to_regclass('public.p2u_admin_roles') is not null;
  checks:=checks||jsonb_build_array(jsonb_build_object('key','roles','label','Admin roles','ok',has_table,'level',case when has_table then 'ok' else 'critical' end));
  if not has_table then overall:='critical';issue_count:=issue_count+1;end if;

  has_table:=to_regclass('public.p2u_analytics_events') is not null;
  checks:=checks||jsonb_build_array(jsonb_build_object('key','analytics','label','Product analytics','ok',has_table,'level',case when has_table then 'ok' else 'warning' end));
  if not has_table and overall='healthy' then overall:='warning';issue_count:=issue_count+1;end if;

  return jsonb_build_object(
    'ok',overall<>'critical',
    'version','v198',
    'status',overall,
    'issue_count',issue_count,
    'checked_at',now(),
    'checks',checks
  );
end;
$$;

revoke all on function public.p2u_admin_system_health() from public;
grant execute on function public.p2u_admin_system_health() to authenticated;

commit;
