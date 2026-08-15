-- Add age_group and round columns for filtering games by category
-- Run this in your Supabase SQL editor

-- Public schema
ALTER TABLE public.team_stats ADD COLUMN IF NOT EXISTS age_group text;
ALTER TABLE public.team_stats ADD COLUMN IF NOT EXISTS round text;

ALTER TABLE public.player_stats ADD COLUMN IF NOT EXISTS age_group text;
ALTER TABLE public.player_stats ADD COLUMN IF NOT EXISTS round text;

-- Test schema
ALTER TABLE test.team_stats ADD COLUMN IF NOT EXISTS age_group text;
ALTER TABLE test.team_stats ADD COLUMN IF NOT EXISTS round text;

ALTER TABLE test.player_stats ADD COLUMN IF NOT EXISTS age_group text;
ALTER TABLE test.player_stats ADD COLUMN IF NOT EXISTS round text;

-- Indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_team_stats_age_group ON public.team_stats(league_id, age_group);
CREATE INDEX IF NOT EXISTS idx_team_stats_round ON public.team_stats(league_id, round);
CREATE INDEX IF NOT EXISTS idx_player_stats_age_group ON public.player_stats(league_id, age_group);
CREATE INDEX IF NOT EXISTS idx_player_stats_round ON public.player_stats(league_id, round);

CREATE INDEX IF NOT EXISTS idx_test_team_stats_age_group ON test.team_stats(league_id, age_group);
CREATE INDEX IF NOT EXISTS idx_test_team_stats_round ON test.team_stats(league_id, round);
CREATE INDEX IF NOT EXISTS idx_test_player_stats_age_group ON test.player_stats(league_id, age_group);
CREATE INDEX IF NOT EXISTS idx_test_player_stats_round ON test.player_stats(league_id, round);
