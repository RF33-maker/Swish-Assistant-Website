-- ================================================================
-- v_game_results — PUBLIC SCHEMA
-- One row per game with final scores
-- Run AFTER validating test schema views
-- ================================================================

CREATE OR REPLACE VIEW public.v_game_results AS
WITH game_pairs AS (
  SELECT
    t1.game_key,
    t1.league_id,
    t1.name AS team1_name,
    t1.tot_spoints AS team1_score,
    t1.p1_score AS team1_q1,
    t1.p2_score AS team1_q2,
    t1.p3_score AS team1_q3,
    t1.p4_score AS team1_q4,
    t2.name AS team2_name,
    t2.tot_spoints AS team2_score,
    t2.p1_score AS team2_q1,
    t2.p2_score AS team2_q2,
    t2.p3_score AS team2_q3,
    t2.p4_score AS team2_q4,
    COALESCE(t1.created_at, t2.created_at) AS game_date,
    t1.id AS team1_stats_id,
    t2.id AS team2_stats_id
  FROM public.team_stats t1
  JOIN public.team_stats t2
    ON t1.game_key = t2.game_key
    AND t1.league_id = t2.league_id
    AND t1.id < t2.id
  WHERE t1.game_key IS NOT NULL
)
SELECT
  gp.game_key,
  gp.league_id,
  COALESCE(gs.hometeam, gp.team1_name) AS home_team,
  COALESCE(gs.awayteam, gp.team2_name) AS away_team,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(gp.team1_name)) = LOWER(TRIM(gs.hometeam)) THEN gp.team1_score
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(gp.team2_name)) = LOWER(TRIM(gs.hometeam)) THEN gp.team2_score
    ELSE gp.team1_score
  END AS home_score,
  CASE
    WHEN gs.awayteam IS NOT NULL AND LOWER(TRIM(gp.team1_name)) = LOWER(TRIM(gs.awayteam)) THEN gp.team1_score
    WHEN gs.awayteam IS NOT NULL AND LOWER(TRIM(gp.team2_name)) = LOWER(TRIM(gs.awayteam)) THEN gp.team2_score
    ELSE gp.team2_score
  END AS away_score,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(gp.team1_name)) = LOWER(TRIM(gs.hometeam)) THEN gp.team1_q1
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(gp.team2_name)) = LOWER(TRIM(gs.hometeam)) THEN gp.team2_q1
    ELSE gp.team1_q1
  END AS home_q1,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(gp.team1_name)) = LOWER(TRIM(gs.hometeam)) THEN gp.team1_q2
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(gp.team2_name)) = LOWER(TRIM(gs.hometeam)) THEN gp.team2_q2
    ELSE gp.team1_q2
  END AS home_q2,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(gp.team1_name)) = LOWER(TRIM(gs.hometeam)) THEN gp.team1_q3
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(gp.team2_name)) = LOWER(TRIM(gs.hometeam)) THEN gp.team2_q3
    ELSE gp.team1_q3
  END AS home_q3,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(gp.team1_name)) = LOWER(TRIM(gs.hometeam)) THEN gp.team1_q4
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(gp.team2_name)) = LOWER(TRIM(gs.hometeam)) THEN gp.team2_q4
    ELSE gp.team1_q4
  END AS home_q4,
  CASE
    WHEN gs.awayteam IS NOT NULL AND LOWER(TRIM(gp.team1_name)) = LOWER(TRIM(gs.awayteam)) THEN gp.team1_q1
    WHEN gs.awayteam IS NOT NULL AND LOWER(TRIM(gp.team2_name)) = LOWER(TRIM(gs.awayteam)) THEN gp.team2_q1
    ELSE gp.team2_q1
  END AS away_q1,
  CASE
    WHEN gs.awayteam IS NOT NULL AND LOWER(TRIM(gp.team1_name)) = LOWER(TRIM(gs.awayteam)) THEN gp.team1_q2
    WHEN gs.awayteam IS NOT NULL AND LOWER(TRIM(gp.team2_name)) = LOWER(TRIM(gs.awayteam)) THEN gp.team2_q2
    ELSE gp.team2_q2
  END AS away_q2,
  CASE
    WHEN gs.awayteam IS NOT NULL AND LOWER(TRIM(gp.team1_name)) = LOWER(TRIM(gs.awayteam)) THEN gp.team1_q3
    WHEN gs.awayteam IS NOT NULL AND LOWER(TRIM(gp.team2_name)) = LOWER(TRIM(gs.awayteam)) THEN gp.team2_q3
    ELSE gp.team2_q3
  END AS away_q3,
  CASE
    WHEN gs.awayteam IS NOT NULL AND LOWER(TRIM(gp.team1_name)) = LOWER(TRIM(gs.awayteam)) THEN gp.team1_q4
    WHEN gs.awayteam IS NOT NULL AND LOWER(TRIM(gp.team2_name)) = LOWER(TRIM(gs.awayteam)) THEN gp.team2_q4
    ELSE gp.team2_q4
  END AS away_q4,
  COALESCE(gs.matchtime::timestamptz, gp.game_date) AS match_time,
  gs.competitionname AS competition_name,
  gs.pool,
  gs.status AS schedule_status,
  CASE
    WHEN gp.team1_score IS NOT NULL AND gp.team2_score IS NOT NULL THEN 'Final'
    WHEN gs.status IS NOT NULL THEN gs.status
    ELSE 'Scheduled'
  END AS game_status
FROM game_pairs gp
LEFT JOIN public.game_schedule gs
  ON gp.game_key = gs.game_key
  AND gp.league_id = gs.league_id;

GRANT SELECT ON public.v_game_results TO anon;
GRANT SELECT ON public.v_game_results TO authenticated;
