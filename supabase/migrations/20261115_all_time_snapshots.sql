-- Stored all-time leader boards (server/allTimeLeaders.ts).
--
-- Building a brand's all-time board reads every box-score row it has ever had
-- (about 6 seconds for Super League Basketball), so the finished board is kept
-- here and served from the table. A board is built the first time anyone asks
-- for it, rebuilt each night by /api/cron/all-time, and rebuilt straight away
-- when an admin links or unlinks players.
--
-- Only the server reads and writes it (service role), so RLS is on with no policies.

create table if not exists public.all_time_snapshots (
  key        text primary key,                -- "<brand id>|<gender>|<scope>"
  brand_id   uuid not null,
  gender     text not null default '',
  scope      text not null check (scope in ('all', 'league')),
  data       jsonb not null,
  built_at   timestamptz not null default now(),
  build_ms   integer
);

create index if not exists all_time_snapshots_brand_idx on public.all_time_snapshots (brand_id);
create index if not exists all_time_snapshots_built_idx on public.all_time_snapshots (built_at);

alter table public.all_time_snapshots enable row level security;
