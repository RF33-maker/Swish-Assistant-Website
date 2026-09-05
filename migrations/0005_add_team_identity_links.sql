-- Stable team identity links used by schedules and player stats.
-- Idempotent because the current Supabase project may already have these columns.

ALTER TABLE public.game_schedule
  ADD COLUMN IF NOT EXISTS home_team_id uuid,
  ADD COLUMN IF NOT EXISTS away_team_id uuid;

ALTER TABLE public.player_stats
  ADD COLUMN IF NOT EXISTS team_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_schedule_home_team_id_fkey'
  ) THEN
    ALTER TABLE public.game_schedule
      ADD CONSTRAINT game_schedule_home_team_id_fkey
      FOREIGN KEY (home_team_id) REFERENCES public.teams(team_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_schedule_away_team_id_fkey'
  ) THEN
    ALTER TABLE public.game_schedule
      ADD CONSTRAINT game_schedule_away_team_id_fkey
      FOREIGN KEY (away_team_id) REFERENCES public.teams(team_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_stats_team_id_fkey'
  ) THEN
    ALTER TABLE public.player_stats
      ADD CONSTRAINT player_stats_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES public.teams(team_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_game_schedule_home_team_id
  ON public.game_schedule(home_team_id);
CREATE INDEX IF NOT EXISTS idx_game_schedule_away_team_id
  ON public.game_schedule(away_team_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_team_id
  ON public.player_stats(team_id);

-- Safe same-competition exact-name backfill. Cross-season reuse is handled by
-- the application matcher because it applies competition-brand and level guards.
UPDATE public.game_schedule gs
SET home_team_id = t.team_id
FROM public.teams t
WHERE gs.home_team_id IS NULL
  AND t.league_id = gs.league_id
  AND lower(trim(t.name)) = lower(trim(gs.hometeam));

UPDATE public.game_schedule gs
SET away_team_id = t.team_id
FROM public.teams t
WHERE gs.away_team_id IS NULL
  AND t.league_id = gs.league_id
  AND lower(trim(t.name)) = lower(trim(gs.awayteam));

UPDATE public.player_stats ps
SET team_id = t.team_id
FROM public.teams t
WHERE ps.team_id IS NULL
  AND t.league_id = ps.league_id
  AND lower(trim(t.name)) = lower(trim(ps.team_name));