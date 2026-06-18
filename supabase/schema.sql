-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- It creates the two tables the worker needs.

-- Tracks every item we've already processed, so we never act on it twice.
create table if not exists seen_items (
  id          bigint generated always as identity primary key,
  guid        text not null unique,        -- RSS guid, or the item URL as fallback
  source      text not null,               -- e.g. "CoinDesk"
  url         text,
  title       text,
  posted      boolean not null default false, -- true if a Telegram alert was sent
  created_at  timestamptz not null default now()
);

create index if not exists seen_items_created_at_idx on seen_items (created_at desc);

-- One row per cron run, for basic observability / debugging.
create table if not exists run_logs (
  id             bigint generated always as identity primary key,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  seed_mode      boolean,
  sources_ok     int,
  sources_failed int,
  new_items      int,
  keyword_passed int,
  ai_called      int,
  posted         int,
  notes          text
);
