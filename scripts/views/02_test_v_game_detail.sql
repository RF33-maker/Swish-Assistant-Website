-- ================================================================
-- v_game_detail — TEST SCHEMA ONLY
-- Comprehensive game detail: both teams' full stats in one row
-- Used by GameDetailModal for the summary/team stats tabs
-- ================================================================

CREATE OR REPLACE VIEW test.v_game_detail AS
SELECT
  t1.game_key,
  t1.league_id,
  COALESCE(t1.created_at, t2.created_at) AS match_time,

  -- Home team info
  t1.name AS home_team,
  t1.shortname AS home_team_short,
  t1.code AS home_team_code,
  t1.coach AS home_coach,
  t1.team_id AS home_team_id,

  -- Home scores
  t1.tot_spoints AS home_score,
  t1.p1_score AS home_q1,
  t1.p2_score AS home_q2,
  t1.p3_score AS home_q3,
  t1.p4_score AS home_q4,

  -- Home shooting
  t1.tot_sfieldgoalsmade AS home_fgm,
  t1.tot_sfieldgoalsattempted AS home_fga,
  t1.tot_sfieldgoalspercentage AS home_fg_pct,
  t1.tot_sthreepointersmade AS home_3pm,
  t1.tot_sthreepointersattempted AS home_3pa,
  t1.tot_sthreepointerspercentage AS home_3p_pct,
  t1.tot_stwopointersmade AS home_2pm,
  t1.tot_stwopointersattempted AS home_2pa,
  t1.tot_stwopointerspercentage AS home_2p_pct,
  t1.tot_sfreethrowsmade AS home_ftm,
  t1.tot_sfreethrowsattempted AS home_fta,
  t1.tot_sfreethrowspercentage AS home_ft_pct,

  -- Home rebounds & misc
  t1.tot_sreboundsoffensive AS home_oreb,
  t1.tot_sreboundsdefensive AS home_dreb,
  t1.tot_sreboundstotal AS home_reb,
  t1.tot_sassists AS home_ast,
  t1.tot_sturnovers AS home_tov,
  t1.tot_ssteals AS home_stl,
  t1.tot_sblocks AS home_blk,
  t1.tot_sfoulspersonal AS home_pf,
  t1.tot_spoints AS home_pts,
  t1.tot_spointsfromturnovers AS home_pts_off_tov,
  t1.tot_spointssecondchance AS home_second_chance_pts,
  t1.tot_spointsfastbreak AS home_fastbreak_pts,
  t1.tot_sbenchpoints AS home_bench_pts,
  t1.tot_spointsinthepaint AS home_pitp,
  t1.tot_sbiggestlead AS home_biggest_lead,

  -- Home advanced
  t1.efg_percent AS home_efg_pct,
  t1.ts_percent AS home_ts_pct,
  t1.pace AS home_pace,
  t1.off_rating AS home_off_rtg,
  t1.def_rating AS home_def_rtg,
  t1.net_rating AS home_net_rtg,

  -- Away team info
  t2.name AS away_team,
  t2.shortname AS away_team_short,
  t2.code AS away_team_code,
  t2.coach AS away_coach,
  t2.team_id AS away_team_id,

  -- Away scores
  t2.tot_spoints AS away_score,
  t2.p1_score AS away_q1,
  t2.p2_score AS away_q2,
  t2.p3_score AS away_q3,
  t2.p4_score AS away_q4,

  -- Away shooting
  t2.tot_sfieldgoalsmade AS away_fgm,
  t2.tot_sfieldgoalsattempted AS away_fga,
  t2.tot_sfieldgoalspercentage AS away_fg_pct,
  t2.tot_sthreepointersmade AS away_3pm,
  t2.tot_sthreepointersattempted AS away_3pa,
  t2.tot_sthreepointerspercentage AS away_3p_pct,
  t2.tot_stwopointersmade AS away_2pm,
  t2.tot_stwopointersattempted AS away_2pa,
  t2.tot_stwopointerspercentage AS away_2p_pct,
  t2.tot_sfreethrowsmade AS away_ftm,
  t2.tot_sfreethrowsattempted AS away_fta,
  t2.tot_sfreethrowspercentage AS away_ft_pct,

  -- Away rebounds & misc
  t2.tot_sreboundsoffensive AS away_oreb,
  t2.tot_sreboundsdefensive AS away_dreb,
  t2.tot_sreboundstotal AS away_reb,
  t2.tot_sassists AS away_ast,
  t2.tot_sturnovers AS away_tov,
  t2.tot_ssteals AS away_stl,
  t2.tot_sblocks AS away_blk,
  t2.tot_sfoulspersonal AS away_pf,
  t2.tot_spoints AS away_pts,
  t2.tot_spointsfromturnovers AS away_pts_off_tov,
  t2.tot_spointssecondchance AS away_second_chance_pts,
  t2.tot_spointsfastbreak AS away_fastbreak_pts,
  t2.tot_sbenchpoints AS away_bench_pts,
  t2.tot_spointsinthepaint AS away_pitp,
  t2.tot_sbiggestlead AS away_biggest_lead,

  -- Away advanced
  t2.efg_percent AS away_efg_pct,
  t2.ts_percent AS away_ts_pct,
  t2.pace AS away_pace,
  t2.off_rating AS away_off_rtg,
  t2.def_rating AS away_def_rtg,
  t2.net_rating AS away_net_rtg,

  -- Game-level stats (from home team row, same for both)
  t1.tot_leadchanges AS lead_changes,
  t1.tot_timesscoreslevel AS times_tied,

  -- Game status
  CASE
    WHEN t1.tot_spoints IS NOT NULL AND t2.tot_spoints IS NOT NULL THEN 'Final'
    ELSE 'Scheduled'
  END AS game_status

FROM test.team_stats t1
JOIN test.team_stats t2
  ON t1.game_key = t2.game_key
  AND t1.league_id = t2.league_id
  AND t1.id < t2.id
WHERE t1.game_key IS NOT NULL;

GRANT SELECT ON test.v_game_detail TO anon;
GRANT SELECT ON test.v_game_detail TO authenticated;
