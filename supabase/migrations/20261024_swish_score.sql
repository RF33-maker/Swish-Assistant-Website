-- Swish Score: replace the stepped true-shooting bonus in vw_player_game_scores
-- with a shooting term that scales with the shots a player used.
--
--   Swish Score = PTS + 1.2 REB + 1.3 AST + 1.7 STL + 2.0 BLK - 2.0 TOV
--               + 0.8 * (PTS - (FGA + 0.44 FTA))
--               + 3 for a win
--
-- The old bonus gave +11 to a 1-for-1 night and charged nothing for misses until
-- true shooting fell under 50%. shared/swishScore.ts holds the same formula for
-- the client; keep the two in step.
--
-- game_score is rounded to one decimal, as every card shows it.
--
-- Columns keep their names and order (player_season_averages_v2/v3 select from
-- this view). ts_bonus_points now carries the shooting term, and shooting_points
-- is added as its clearer name.

create or replace view public.vw_player_game_scores as
with team_scores as (
  select ts.league_id,
    ts.game_key,
    ts.team_id,
    coalesce(ts.tot_spoints, 0) as team_points,
    dense_rank() over (partition by ts.league_id, ts.game_key order by coalesce(ts.tot_spoints, 0) desc) as score_rank,
    count(*) over (partition by ts.league_id, ts.game_key) as teams_in_game,
    max(coalesce(ts.tot_spoints, 0)) over (partition by ts.league_id, ts.game_key) as max_points,
    min(coalesce(ts.tot_spoints, 0)) over (partition by ts.league_id, ts.game_key) as min_points
  from team_stats ts
), winners as (
  select team_scores.league_id,
    team_scores.game_key,
    team_scores.team_id as winner_team_id
  from team_scores
  where team_scores.teams_in_game >= 2 and team_scores.score_rank = 1 and team_scores.max_points <> team_scores.min_points
), ps_base as (
  select ps.league_id,
    ps.game_key,
    coalesce(gs.matchtime::date,
      case
        when ps.game_key ~ '^\d{4}-\d{2}-\d{2}_' then to_date(split_part(ps.game_key, '_', 1), 'YYYY-MM-DD')
        else null::date
      end) as game_date,
    ps.player_id,
    ps.full_name,
    ps.team_id,
    ps.team_name,
    coalesce(ps.spoints, 0) as pts,
    coalesce(ps.sreboundstotal, 0) as reb,
    coalesce(ps.sassists, 0) as ast,
    coalesce(ps.ssteals, 0) as stl,
    coalesce(ps.sblocks, 0) as blk,
    coalesce(ps.sturnovers, 0) as tov,
    coalesce(ps.sfieldgoalsattempted, 0) as fga,
    coalesce(ps.sfreethrowsattempted, 0) as fta
  from player_stats ps
    left join game_schedule gs on gs.league_id = ps.league_id and gs.game_key = ps.game_key
), scored as (
  select b.league_id,
    b.game_key,
    b.game_date,
    date_trunc('week', b.game_date::timestamp with time zone)::date as week_start,
    b.player_id,
    b.full_name,
    b.team_id,
    b.team_name,
    b.pts,
    b.reb,
    b.ast,
    b.stl,
    b.blk,
    b.tov,
    b.fga,
    b.fta,
    case
      when (b.fga::numeric + 0.44 * b.fta::numeric) > 0 then b.pts::numeric / (2 * (b.fga::numeric + 0.44 * b.fta::numeric))
      else null::numeric
    end as ts_pct,
    b.pts::numeric * 1.0 + b.reb::numeric * 1.2 + b.ast::numeric * 1.3 + b.stl::numeric * 1.7 + b.blk::numeric * 2.0 - b.tov::numeric * 2.0 as box_impact,
    0.8 * (b.pts::numeric - (b.fga::numeric + 0.44 * b.fta::numeric)) as shooting_points,
    case
      when w.winner_team_id is null then 0
      when b.team_id = w.winner_team_id then 1
      else 0
    end as win_flag
  from ps_base b
    left join winners w on w.league_id = b.league_id and w.game_key = b.game_key
  where b.game_date is not null
), totals as (
  select s.*,
    (s.win_flag * 3)::numeric as win_bonus_points,
    round(s.box_impact + s.shooting_points + (s.win_flag * 3)::numeric, 1) as game_score
  from scored s
)
select t.league_id,
  t.game_key,
  t.game_date,
  t.week_start,
  t.player_id,
  t.full_name,
  t.team_id,
  t.team_name,
  t.pts,
  t.reb,
  t.ast,
  t.stl,
  t.blk,
  t.tov,
  t.fga,
  t.fta,
  t.ts_pct,
  t.box_impact,
  t.win_flag,
  t.shooting_points as ts_bonus_points,
  t.win_bonus_points,
  t.game_score,
  dense_rank() over (partition by t.league_id, t.game_key order by t.game_score desc) as game_rank,
  t.shooting_points
from totals t;

comment on view public.vw_player_game_scores is
  'One row per player per game with its Swish Score (game_score). Formula: see shared/swishScore.ts and /swish-score.';
comment on column public.vw_player_game_scores.ts_bonus_points is
  'Legacy name for shooting_points: 0.8 * (PTS - (FGA + 0.44 FTA)).';
