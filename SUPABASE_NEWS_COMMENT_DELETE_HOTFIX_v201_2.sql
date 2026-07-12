-- Predict2U v201.2 — News Comment Owner Delete Hotfix
-- Fixes owner deletion failing because body='' violated the existing body-length check.
-- Safe to run more than once.

begin;

create or replace function public.p2u_news_delete_comment(
  p_comment_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  row_out public.p2u_news_comments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode='42501';
  end if;

  select *
  into row_out
  from public.p2u_news_comments
  where id=p_comment_id
    and user_id=auth.uid()
    and coalesce(status,'visible')<>'deleted'
  for update;

  if row_out.id is null then
    raise exception 'Comment not found or cannot be deleted' using errcode='42501';
  end if;

  -- Remove associated likes first.
  delete from public.p2u_news_comment_likes
  where comment_id=p_comment_id;

  -- Keep one non-empty placeholder so older installations with
  -- CHECK (char_length(body) between 1 and 600) do not reject deletion.
  update public.p2u_news_comments
  set
    body='[deleted]',
    status='deleted',
    deleted_at=now(),
    updated_at=now(),
    like_count=0
  where id=p_comment_id
    and user_id=auth.uid()
  returning * into row_out;

  if row_out.id is null then
    raise exception 'Comment could not be deleted' using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'comment_id',row_out.id,
    'article_id',row_out.article_id,
    'deleted',true
  );
end;
$$;

revoke all on function public.p2u_news_delete_comment(bigint) from public;
grant execute on function public.p2u_news_delete_comment(bigint) to authenticated;

commit;
