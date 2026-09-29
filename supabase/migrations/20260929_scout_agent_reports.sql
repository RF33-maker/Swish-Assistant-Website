-- Scouting agent: pre-built opponent reports and game plans.
--
-- One row per (competition, opponent, coach's team). for_team_name = '' is a
-- generic opponent report with no matchup block. Rows are written only by the
-- scout-agent edge function (service role) and read only through the site's
-- API, which decides between the free teaser and the full plan — so RLS is on
-- with no policies: nothing is reachable with the public anon key.

create table if not exists public.scout_agent_reports (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  opponent_name text not null,
  for_team_name text not null default '',
  game_key text,
  match_time timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'building', 'ready', 'failed', 'no_data')),
  facts jsonb,
  plan jsonb,
  teaser jsonb,
  model text,
  error text,
  games_analysed integer,
  data_through date,
  requested_by uuid,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  generated_at timestamptz,
  unique (league_id, opponent_name, for_team_name)
);

create index if not exists scout_agent_reports_match_time_idx on public.scout_agent_reports (match_time);
create index if not exists scout_agent_reports_status_idx on public.scout_agent_reports (status);

alter table public.scout_agent_reports enable row level security;
