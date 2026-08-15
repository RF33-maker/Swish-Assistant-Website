-- ================================================================
-- v_box_score — TEST SCHEMA ONLY
-- Player stats with resolved names, ready for box score display
-- Used by GameDetailModal for the box score tab
-- ================================================================

CREATE OR REPLACE VIEW test.v_box_score AS
SELECT
  ps.id,
  ps.game_key,
  ps.league_id,
  ps.numeric_id,
  ps.player_id,
  ps.team_id,

  -- Resolved player name (test schema has no players table, use player_stats fields)
  COALESCE(
    NULLIF(ps.full_name, ''),
    NULLIF(TRIM(COALESCE(ps.firstname, '') || ' ' || COALESCE(ps.familyname, '')), ''),
    'Unknown Player'
  ) AS player_name,
  ps.firstname,
  ps.familyname,

  -- Team info
  ps.team_name,
  ps.shirtnumber AS jersey_number,
  ps.position,
  ps.playingposition,
  COALESCE(ps.starter, false) AS starter,
  COALESCE(ps.active, true) AS active,

  -- Core stats
  ps.sminutes AS minutes,
  COALESCE(ps.spoints, 0) AS points,
  COALESCE(ps.sassists, 0) AS assists,
  COALESCE(ps.sreboundstotal, 0) AS rebounds,
  ps.sreboundsoffensive AS off_rebounds,
  ps.sreboundsdefensive AS def_rebounds,
  COALESCE(ps.ssteals, 0) AS steals,
  COALESCE(ps.sblocks, 0) AS blocks,
  COALESCE(ps.sturnovers, 0) AS turnovers,
  ps.sfoulspersonal AS fouls,
  ps.splusminuspoints AS plus_minus,

  -- Shooting
  ps.sfieldgoalsmade AS fgm,
  ps.sfieldgoalsattempted AS fga,
  ps.sfieldgoalspercentage AS fg_pct,
  ps.sthreepointersmade AS three_pm,
  ps.sthreepointersattempted AS three_pa,
  ps.sthreepointerspercentage AS three_p_pct,
  ps.stwopointersmade AS two_pm,
  ps.stwopointersattempted AS two_pa,
  ps.stwopointerspercentage AS two_p_pct,
  ps.sfreethrowsmade AS ftm,
  ps.sfreethrowsattempted AS fta,
  ps.sfreethrowspercentage AS ft_pct,

  -- Advanced
  ps.efg_percent,
  ps.ts_percent,
  ps.usage_percent,
  ps.off_rating,
  ps.def_rating,
  ps.net_rating,
  ps.pie,

  ps.created_at

FROM test.player_stats ps
WHERE ps.game_key IS NOT NULL;

GRANT SELECT ON test.v_box_score TO anon;
GRANT SELECT ON test.v_box_score TO authenticated;
