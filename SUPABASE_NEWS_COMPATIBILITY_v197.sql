-- Predict2U v197 — optional compatibility repair for News personalization fields.
-- The v197 website works without this file by falling back to the v189 schema.
-- Run this only when you want the v192 verified-source, pin, feature and moderation fields
-- available directly in Supabase. Safe to run more than once.

begin;

alter table if exists public.p2u_news_sources
  add column if not exists verified boolean not null default false;

alter table if exists public.p2u_news_articles
  add column if not exists source_verified boolean not null default false,
  add column if not exists canonical_key text not null default '',
  add column if not exists featured boolean not null default false,
  add column if not exists pinned boolean not null default false,
  add column if not exists moderation_status text not null default 'visible',
  add column if not exists moderation_reason text not null default '';

update public.p2u_news_articles a
set source_verified=coalesce(s.verified,false)
from public.p2u_news_sources s
where a.source_id=s.id
  and a.source_verified is distinct from coalesce(s.verified,false);

update public.p2u_news_articles
set canonical_key=left(
  trim(regexp_replace(
    lower(regexp_replace(coalesce(title,''),'[^a-zA-Z0-9 ]','','g')),
    '\\s+',' ','g'
  )),
  180
)
where coalesce(canonical_key,'')='';

create index if not exists p2u_news_articles_canonical_idx
  on public.p2u_news_articles(canonical_key,published_at desc);
create index if not exists p2u_news_articles_featured_idx
  on public.p2u_news_articles(pinned desc,featured desc,published_at desc);
create index if not exists p2u_news_articles_moderation_idx
  on public.p2u_news_articles(moderation_status,published_at desc);

commit;
