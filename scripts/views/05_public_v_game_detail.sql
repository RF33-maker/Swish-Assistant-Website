-- ================================================================
-- v_game_detail — PUBLIC SCHEMA
-- Comprehensive game detail: both teams' full stats in one row
-- Used by GameDetailModal for the summary/team stats tabs
-- Run AFTER validating test schema views
-- ================================================================

CREATE OR REPLACE VIEW public.v_game_detail AS
SELECT
  t1.game_key,
  t1.league_id,
  COALESCE(gs.matchtime::timestamptz, t1.created_at, t2.created_at) AS match_time,

  -- Home team info (use game_schedule for home/away when available)
  COALESCE(gs.hometeam, t1.name) AS home_team,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.shortname
    ELSE t1.shortname
  END AS home_team_short,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.code
    ELSE t1.code
  END AS home_team_code,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.coach
    ELSE t1.coach
  END AS home_coach,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.team_id
    ELSE t1.team_id
  END AS home_team_id,

  -- Home scores
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_spoints
    ELSE t1.tot_spoints
  END AS home_score,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.p1_score ELSE t1.p1_score END AS home_q1,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.p2_score ELSE t1.p2_score END AS home_q2,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.p3_score ELSE t1.p3_score END AS home_q3,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.p4_score ELSE t1.p4_score END AS home_q4,

  -- Home shooting
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sfieldgoalsmade ELSE t1.tot_sfieldgoalsmade END AS home_fgm,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sfieldgoalsattempted ELSE t1.tot_sfieldgoalsattempted END AS home_fga,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sfieldgoalspercentage ELSE t1.tot_sfieldgoalspercentage END AS home_fg_pct,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sthreepointersmade ELSE t1.tot_sthreepointersmade END AS home_3pm,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sthreepointersattempted ELSE t1.tot_sthreepointersattempted END AS home_3pa,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sthreepointerspercentage ELSE t1.tot_sthreepointerspercentage END AS home_3p_pct,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_stwopointersmade ELSE t1.tot_stwopointersmade END AS home_2pm,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_stwopointersattempted ELSE t1.tot_stwopointersattempted END AS home_2pa,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_stwopointerspercentage ELSE t1.tot_stwopointerspercentage END AS home_2p_pct,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sfreethrowsmade ELSE t1.tot_sfreethrowsmade END AS home_ftm,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sfreethrowsattempted ELSE t1.tot_sfreethrowsattempted END AS home_fta,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sfreethrowspercentage ELSE t1.tot_sfreethrowspercentage END AS home_ft_pct,

  -- Home rebounds & misc
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sreboundsoffensive ELSE t1.tot_sreboundsoffensive END AS home_oreb,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sreboundsdefensive ELSE t1.tot_sreboundsdefensive END AS home_dreb,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sreboundstotal ELSE t1.tot_sreboundstotal END AS home_reb,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sassists ELSE t1.tot_sassists END AS home_ast,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sturnovers ELSE t1.tot_sturnovers END AS home_tov,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_ssteals ELSE t1.tot_ssteals END AS home_stl,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sblocks ELSE t1.tot_sblocks END AS home_blk,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sfoulspersonal ELSE t1.tot_sfoulspersonal END AS home_pf,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_spointsfromturnovers ELSE t1.tot_spointsfromturnovers END AS home_pts_off_tov,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_spointssecondchance ELSE t1.tot_spointssecondchance END AS home_second_chance_pts,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_spointsfastbreak ELSE t1.tot_spointsfastbreak END AS home_fastbreak_pts,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sbenchpoints ELSE t1.tot_sbenchpoints END AS home_bench_pts,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_spointsinthepaint ELSE t1.tot_spointsinthepaint END AS home_pitp,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.tot_sbiggestlead ELSE t1.tot_sbiggestlead END AS home_biggest_lead,

  -- Home advanced
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.efg_percent ELSE t1.efg_percent END AS home_efg_pct,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.ts_percent ELSE t1.ts_percent END AS home_ts_pct,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.pace ELSE t1.pace END AS home_pace,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.off_rating ELSE t1.off_rating END AS home_off_rtg,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.def_rating ELSE t1.def_rating END AS home_def_rtg,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t2.net_rating ELSE t1.net_rating END AS home_net_rtg,

  -- Away team info
  COALESCE(gs.awayteam, t2.name) AS away_team,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.shortname
    ELSE t2.shortname
  END AS away_team_short,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.code
    ELSE t2.code
  END AS away_team_code,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.coach
    ELSE t2.coach
  END AS away_coach,
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.team_id
    ELSE t2.team_id
  END AS away_team_id,

  -- Away scores
  CASE
    WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_spoints
    ELSE t2.tot_spoints
  END AS away_score,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.p1_score ELSE t2.p1_score END AS away_q1,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.p2_score ELSE t2.p2_score END AS away_q2,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.p3_score ELSE t2.p3_score END AS away_q3,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.p4_score ELSE t2.p4_score END AS away_q4,

  -- Away shooting
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sfieldgoalsmade ELSE t2.tot_sfieldgoalsmade END AS away_fgm,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sfieldgoalsattempted ELSE t2.tot_sfieldgoalsattempted END AS away_fga,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sfieldgoalspercentage ELSE t2.tot_sfieldgoalspercentage END AS away_fg_pct,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sthreepointersmade ELSE t2.tot_sthreepointersmade END AS away_3pm,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sthreepointersattempted ELSE t2.tot_sthreepointersattempted END AS away_3pa,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sthreepointerspercentage ELSE t2.tot_sthreepointerspercentage END AS away_3p_pct,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_stwopointersmade ELSE t2.tot_stwopointersmade END AS away_2pm,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_stwopointersattempted ELSE t2.tot_stwopointersattempted END AS away_2pa,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_stwopointerspercentage ELSE t2.tot_stwopointerspercentage END AS away_2p_pct,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sfreethrowsmade ELSE t2.tot_sfreethrowsmade END AS away_ftm,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sfreethrowsattempted ELSE t2.tot_sfreethrowsattempted END AS away_fta,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sfreethrowspercentage ELSE t2.tot_sfreethrowspercentage END AS away_ft_pct,

  -- Away rebounds & misc
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sreboundsoffensive ELSE t2.tot_sreboundsoffensive END AS away_oreb,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sreboundsdefensive ELSE t2.tot_sreboundsdefensive END AS away_dreb,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sreboundstotal ELSE t2.tot_sreboundstotal END AS away_reb,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sassists ELSE t2.tot_sassists END AS away_ast,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sturnovers ELSE t2.tot_sturnovers END AS away_tov,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_ssteals ELSE t2.tot_ssteals END AS away_stl,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sblocks ELSE t2.tot_sblocks END AS away_blk,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sfoulspersonal ELSE t2.tot_sfoulspersonal END AS away_pf,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_spointsfromturnovers ELSE t2.tot_spointsfromturnovers END AS away_pts_off_tov,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_spointssecondchance ELSE t2.tot_spointssecondchance END AS away_second_chance_pts,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_spointsfastbreak ELSE t2.tot_spointsfastbreak END AS away_fastbreak_pts,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sbenchpoints ELSE t2.tot_sbenchpoints END AS away_bench_pts,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_spointsinthepaint ELSE t2.tot_spointsinthepaint END AS away_pitp,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.tot_sbiggestlead ELSE t2.tot_sbiggestlead END AS away_biggest_lead,

  -- Away advanced
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.efg_percent ELSE t2.efg_percent END AS away_efg_pct,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.ts_percent ELSE t2.ts_percent END AS away_ts_pct,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.pace ELSE t2.pace END AS away_pace,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.off_rating ELSE t2.off_rating END AS away_off_rtg,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.def_rating ELSE t2.def_rating END AS away_def_rtg,
  CASE WHEN gs.hometeam IS NOT NULL AND LOWER(TRIM(t2.name)) = LOWER(TRIM(gs.hometeam)) THEN t1.net_rating ELSE t2.net_rating END AS away_net_rtg,

  -- Game-level stats
  t1.tot_leadchanges AS lead_changes,
  t1.tot_timesscoreslevel AS times_tied,
  gs.competitionname AS competition_name,
  gs.pool,

  -- Game status
  CASE
    WHEN t1.tot_spoints IS NOT NULL AND t2.tot_spoints IS NOT NULL THEN 'Final'
    WHEN gs.status IS NOT NULL THEN gs.status
    ELSE 'Scheduled'
  END AS game_status

FROM public.team_stats t1
JOIN public.team_stats t2
  ON t1.game_key = t2.game_key
  AND t1.league_id = t2.league_id
  AND t1.id < t2.id
LEFT JOIN public.game_schedule gs
  ON t1.game_key = gs.game_key
  AND t1.league_id = gs.league_id
WHERE t1.game_key IS NOT NULL;

GRANT SELECT ON public.v_game_detail TO anon;
GRANT SELECT ON public.v_game_detail TO authenticated;
