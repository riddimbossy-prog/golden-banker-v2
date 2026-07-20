-- Predict2U v270 — private Auto Picks learning store.
-- Run once in Supabase SQL Editor. No public read/write policy is created.
create table if not exists public.auto_pick_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_key text not null,
  fixture_id text,
  model_version text not null,
  match_date date,
  kickoff timestamptz,
  league text,
  home_team text not null,
  away_team text not null,
  home_profile text,
  away_profile text,
  market text not null,
  settle_market text not null,
  odds numeric,
  model_strength numeric,
  signature_hash text,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','settled','void')),
  result text check (result in ('Won','Lost','Void') or result is null),
  home_goals integer,
  away_goals integer,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (fixture_key, model_version)
);
create index if not exists auto_pick_snapshots_status_idx on public.auto_pick_snapshots(status);
create index if not exists auto_pick_snapshots_signature_idx on public.auto_pick_snapshots(signature_hash);
alter table public.auto_pick_snapshots enable row level security;
-- Service-role workflows bypass RLS. Deliberately create no browser policy.
