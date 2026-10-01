-- Scouting agent tiers: "full" (paid, Opus, per coach team) and "preview"
-- (free look, Sonnet, one shared row per opponent with for_team_name '').
alter table public.scout_agent_reports
  add column if not exists tier text not null default 'full'
  check (tier in ('full', 'preview'));
