-- Scouting reports by scope: which season, and which of the club's competitions count.
--
-- A club plays several competitions in one season (a league, its cup, a
-- trophy) and scouting reads them all together. A coach can now pick the
-- season and untick the competitions they don't want counted, and each choice
-- keeps its own plan, like the window does.
--
--   scope_key  '' is the default (this season, every competition), so every
--              existing row, the hourly sweep and the free look are unchanged.
--              Anything else is "season=2025/26;ex=<league_id>,<league_id>".
--   scope      the same choice as json ({ season, exclude }), for display.

alter table public.scout_agent_reports
  add column if not exists scope_key text not null default '',
  add column if not exists scope jsonb;

drop index if exists public.scout_agent_reports_key_idx;
create unique index if not exists scout_agent_reports_key_idx
  on public.scout_agent_reports (league_id, opponent_name, for_team_name, "window", scope_key);
