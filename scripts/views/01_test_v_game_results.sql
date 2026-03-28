-- ================================================================
-- v_game_results — TEST SCHEMA ONLY
-- One row per game with final scores
-- Run this FIRST to validate in test schema
-- ================================================================

CREATE OR REPLACE VIEW test.v_game_results AS
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
  FROM test.team_stats t1
  JOIN test.team_stats t2
    ON t1.game_key = t2.game_key
    AND t1.league_id = t2.league_id
    AND t1.id < t2.id
  WHERE t1.game_key IS NOT NULL
)
SELECT
  gp.game_key,
  gp.league_id,
  gp.team1_name AS home_team,
  gp.team2_name AS away_team,
  gp.team1_score AS home_score,
  gp.team2_score AS away_score,
  gp.team1_q1 AS home_q1,
  gp.team1_q2 AS home_q2,
  gp.team1_q3 AS home_q3,
  gp.team1_q4 AS home_q4,
  gp.team2_q1 AS away_q1,
  gp.team2_q2 AS away_q2,
  gp.team2_q3 AS away_q3,
  gp.team2_q4 AS away_q4,
  gp.game_date AS match_time,
  NULL::text AS competition_name,
  NULL::text AS pool,
  NULL::text AS schedule_status,
  CASE
    WHEN gp.team1_score IS NOT NULL AND gp.team2_score IS NOT NULL THEN 'Final'
    ELSE 'Scheduled'
  END AS game_status
FROM game_pairs gp;

GRANT SELECT ON test.v_game_results TO anon;
GRANT SELECT ON test.v_game_results TO authenticated;
