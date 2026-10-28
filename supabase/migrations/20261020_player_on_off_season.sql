-- Per-player on/off for a season, one row per (league, team, player).
-- Filled by refresh_player_on_off(league_id), which the SAB lineup builder calls
-- after every game it rebuilds. Read by the player page's on/off panel.
--
-- Built from lineup_stints_context_v1, competitive stints only (valid five-man
-- lineups, no garbage time or end-of-quarter heaves). "On" is every stint the
-- player was on court for; "off" is the rest of his team's stints in games he
-- played. Counts are stored for both his team (on_pts_for, on_fg2m...) and the
-- opponent during those stints (on_opp_fg2m...), so every rate can be shown from
-- either side. Ratings ranks are within the league, among players with at least
-- 100 on-court and 50 off-court possessions.

create table if not exists public.player_on_off_season (
  league_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  player_name text,
  games integer not null default 0,
  on_secs numeric not null default 0,
  off_secs numeric not null default 0,
  on_poss_for numeric not null default 0,
  off_poss_for numeric not null default 0,
  on_poss_against numeric not null default 0,
  off_poss_against numeric not null default 0,
  on_pts_for numeric not null default 0,
  off_pts_for numeric not null default 0,
  on_pts_against numeric not null default 0,
  off_pts_against numeric not null default 0,
  on_fg2m numeric not null default 0,
  off_fg2m numeric not null default 0,
  on_fg2a numeric not null default 0,
  off_fg2a numeric not null default 0,
  on_fg3m numeric not null default 0,
  off_fg3m numeric not null default 0,
  on_fg3a numeric not null default 0,
  off_fg3a numeric not null default 0,
  on_ftm numeric not null default 0,
  off_ftm numeric not null default 0,
  on_fta numeric not null default 0,
  off_fta numeric not null default 0,
  on_oreb numeric not null default 0,
  off_oreb numeric not null default 0,
  on_dreb numeric not null default 0,
  off_dreb numeric not null default 0,
  on_ast numeric not null default 0,
  off_ast numeric not null default 0,
  on_tov numeric not null default 0,
  off_tov numeric not null default 0,
  on_stl numeric not null default 0,
  off_stl numeric not null default 0,
  on_blk numeric not null default 0,
  off_blk numeric not null default 0,
  on_opp_fg2m numeric not null default 0,
  off_opp_fg2m numeric not null default 0,
  on_opp_fg2a numeric not null default 0,
  off_opp_fg2a numeric not null default 0,
  on_opp_fg3m numeric not null default 0,
  off_opp_fg3m numeric not null default 0,
  on_opp_fg3a numeric not null default 0,
  off_opp_fg3a numeric not null default 0,
  on_opp_ftm numeric not null default 0,
  off_opp_ftm numeric not null default 0,
  on_opp_fta numeric not null default 0,
  off_opp_fta numeric not null default 0,
  on_opp_oreb numeric not null default 0,
  off_opp_oreb numeric not null default 0,
  on_opp_dreb numeric not null default 0,
  off_opp_dreb numeric not null default 0,
  on_opp_ast numeric not null default 0,
  off_opp_ast numeric not null default 0,
  on_opp_tov numeric not null default 0,
  off_opp_tov numeric not null default 0,
  on_opp_stl numeric not null default 0,
  off_opp_stl numeric not null default 0,
  on_opp_blk numeric not null default 0,
  off_opp_blk numeric not null default 0,
  on_ortg numeric, off_ortg numeric, ortg_diff numeric,
  on_drtg numeric, off_drtg numeric, drtg_diff numeric,
  on_nrtg numeric, off_nrtg numeric, nrtg_diff numeric,
  plus_minus_diff numeric,
  qualified boolean not null default false,
  qualified_count integer,
  ortg_diff_rank integer,
  drtg_diff_rank integer,
  nrtg_diff_rank integer,
  plus_minus_diff_rank integer,
  updated_at timestamptz not null default now(),
  primary key (league_id, team_id, player_id)
);

create index if not exists player_on_off_season_player_idx on public.player_on_off_season (player_id);

alter table public.player_on_off_season enable row level security;
drop policy if exists "On/off is public" on public.player_on_off_season;
create policy "On/off is public" on public.player_on_off_season for select using (true);

create or replace function public.refresh_player_on_off(p_league_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from player_on_off_season where league_id = p_league_id;

  with st as (
    select team_id, game_key, lineup_player_ids,
      coalesce(seconds_played, 0) as secs,
      coalesce(possessions_for, 0) as poss_for,
      coalesce(possessions_against, 0) as poss_against,
      coalesce(points_for, 0) as pts_for,
      coalesce(points_against, 0) as pts_against,
      coalesce(fg2_made, 0) as fg2m,
      coalesce(fg2_attempted, 0) as fg2a,
      coalesce(fg3_made, 0) as fg3m,
      coalesce(fg3_attempted, 0) as fg3a,
      coalesce(ft_made, 0) as ftm,
      coalesce(ft_attempted, 0) as fta,
      coalesce(oreb, 0) as oreb,
      coalesce(dreb, 0) as dreb,
      coalesce(assists, 0) as ast,
      coalesce(turnovers, 0) as tov,
      coalesce(steals, 0) as stl,
      coalesce(blocks, 0) as blk,
      coalesce(opp_fg2_made, 0) as opp_fg2m,
      coalesce(opp_fg2_attempted, 0) as opp_fg2a,
      coalesce(opp_fg3_made, 0) as opp_fg3m,
      coalesce(opp_fg3_attempted, 0) as opp_fg3a,
      coalesce(opp_ft_made, 0) as opp_ftm,
      coalesce(opp_ft_attempted, 0) as opp_fta,
      coalesce(opp_oreb, 0) as opp_oreb,
      coalesce(opp_dreb, 0) as opp_dreb,
      coalesce(opp_assists, 0) as opp_ast,
      coalesce(opp_turnovers, 0) as opp_tov,
      coalesce(opp_steals, 0) as opp_stl,
      coalesce(opp_blocks, 0) as opp_blk
    from lineup_stints_context_v1
    where league_id = p_league_id
      and is_competitive_stint
      and coalesce(seconds_played, 0) > 0
  ),
  team_game as (
    select team_id, game_key,
      sum(secs) as secs,
      sum(poss_for) as poss_for,
      sum(poss_against) as poss_against,
      sum(pts_for) as pts_for,
      sum(pts_against) as pts_against,
      sum(fg2m) as fg2m,
      sum(fg2a) as fg2a,
      sum(fg3m) as fg3m,
      sum(fg3a) as fg3a,
      sum(ftm) as ftm,
      sum(fta) as fta,
      sum(oreb) as oreb,
      sum(dreb) as dreb,
      sum(ast) as ast,
      sum(tov) as tov,
      sum(stl) as stl,
      sum(blk) as blk,
      sum(opp_fg2m) as opp_fg2m,
      sum(opp_fg2a) as opp_fg2a,
      sum(opp_fg3m) as opp_fg3m,
      sum(opp_fg3a) as opp_fg3a,
      sum(opp_ftm) as opp_ftm,
      sum(opp_fta) as opp_fta,
      sum(opp_oreb) as opp_oreb,
      sum(opp_dreb) as opp_dreb,
      sum(opp_ast) as opp_ast,
      sum(opp_tov) as opp_tov,
      sum(opp_stl) as opp_stl,
      sum(opp_blk) as opp_blk
    from st group by team_id, game_key
  ),
  on_game as (
    select st.team_id, st.game_key, pid::uuid as player_id,
      sum(st.secs) as secs,
      sum(st.poss_for) as poss_for,
      sum(st.poss_against) as poss_against,
      sum(st.pts_for) as pts_for,
      sum(st.pts_against) as pts_against,
      sum(st.fg2m) as fg2m,
      sum(st.fg2a) as fg2a,
      sum(st.fg3m) as fg3m,
      sum(st.fg3a) as fg3a,
      sum(st.ftm) as ftm,
      sum(st.fta) as fta,
      sum(st.oreb) as oreb,
      sum(st.dreb) as dreb,
      sum(st.ast) as ast,
      sum(st.tov) as tov,
      sum(st.stl) as stl,
      sum(st.blk) as blk,
      sum(st.opp_fg2m) as opp_fg2m,
      sum(st.opp_fg2a) as opp_fg2a,
      sum(st.opp_fg3m) as opp_fg3m,
      sum(st.opp_fg3a) as opp_fg3a,
      sum(st.opp_ftm) as opp_ftm,
      sum(st.opp_fta) as opp_fta,
      sum(st.opp_oreb) as opp_oreb,
      sum(st.opp_dreb) as opp_dreb,
      sum(st.opp_ast) as opp_ast,
      sum(st.opp_tov) as opp_tov,
      sum(st.opp_stl) as opp_stl,
      sum(st.opp_blk) as opp_blk
    from st cross join lateral unnest(st.lineup_player_ids) as pid
    where pid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    group by st.team_id, st.game_key, pid
  ),
  played as (
    select distinct ps.team_id, ps.game_key, ps.player_id
    from player_stats ps
    where ps.league_id = p_league_id
      and ps.player_id is not null and ps.team_id is not null
      and coalesce(nullif(split_part(ps.sminutes, ':', 1), ''), '0')::int * 60
        + coalesce(nullif(split_part(ps.sminutes, ':', 2), ''), '0')::int > 0
  ),
  player_game as (
    select p.team_id, p.player_id, p.game_key,
      coalesce(o.secs, 0) as on_secs,
      coalesce(o.poss_for, 0) as on_poss_for,
      coalesce(o.poss_against, 0) as on_poss_against,
      coalesce(o.pts_for, 0) as on_pts_for,
      coalesce(o.pts_against, 0) as on_pts_against,
      coalesce(o.fg2m, 0) as on_fg2m,
      coalesce(o.fg2a, 0) as on_fg2a,
      coalesce(o.fg3m, 0) as on_fg3m,
      coalesce(o.fg3a, 0) as on_fg3a,
      coalesce(o.ftm, 0) as on_ftm,
      coalesce(o.fta, 0) as on_fta,
      coalesce(o.oreb, 0) as on_oreb,
      coalesce(o.dreb, 0) as on_dreb,
      coalesce(o.ast, 0) as on_ast,
      coalesce(o.tov, 0) as on_tov,
      coalesce(o.stl, 0) as on_stl,
      coalesce(o.blk, 0) as on_blk,
      coalesce(o.opp_fg2m, 0) as on_opp_fg2m,
      coalesce(o.opp_fg2a, 0) as on_opp_fg2a,
      coalesce(o.opp_fg3m, 0) as on_opp_fg3m,
      coalesce(o.opp_fg3a, 0) as on_opp_fg3a,
      coalesce(o.opp_ftm, 0) as on_opp_ftm,
      coalesce(o.opp_fta, 0) as on_opp_fta,
      coalesce(o.opp_oreb, 0) as on_opp_oreb,
      coalesce(o.opp_dreb, 0) as on_opp_dreb,
      coalesce(o.opp_ast, 0) as on_opp_ast,
      coalesce(o.opp_tov, 0) as on_opp_tov,
      coalesce(o.opp_stl, 0) as on_opp_stl,
      coalesce(o.opp_blk, 0) as on_opp_blk,
      tg.secs - coalesce(o.secs, 0) as off_secs,
      tg.poss_for - coalesce(o.poss_for, 0) as off_poss_for,
      tg.poss_against - coalesce(o.poss_against, 0) as off_poss_against,
      tg.pts_for - coalesce(o.pts_for, 0) as off_pts_for,
      tg.pts_against - coalesce(o.pts_against, 0) as off_pts_against,
      tg.fg2m - coalesce(o.fg2m, 0) as off_fg2m,
      tg.fg2a - coalesce(o.fg2a, 0) as off_fg2a,
      tg.fg3m - coalesce(o.fg3m, 0) as off_fg3m,
      tg.fg3a - coalesce(o.fg3a, 0) as off_fg3a,
      tg.ftm - coalesce(o.ftm, 0) as off_ftm,
      tg.fta - coalesce(o.fta, 0) as off_fta,
      tg.oreb - coalesce(o.oreb, 0) as off_oreb,
      tg.dreb - coalesce(o.dreb, 0) as off_dreb,
      tg.ast - coalesce(o.ast, 0) as off_ast,
      tg.tov - coalesce(o.tov, 0) as off_tov,
      tg.stl - coalesce(o.stl, 0) as off_stl,
      tg.blk - coalesce(o.blk, 0) as off_blk,
      tg.opp_fg2m - coalesce(o.opp_fg2m, 0) as off_opp_fg2m,
      tg.opp_fg2a - coalesce(o.opp_fg2a, 0) as off_opp_fg2a,
      tg.opp_fg3m - coalesce(o.opp_fg3m, 0) as off_opp_fg3m,
      tg.opp_fg3a - coalesce(o.opp_fg3a, 0) as off_opp_fg3a,
      tg.opp_ftm - coalesce(o.opp_ftm, 0) as off_opp_ftm,
      tg.opp_fta - coalesce(o.opp_fta, 0) as off_opp_fta,
      tg.opp_oreb - coalesce(o.opp_oreb, 0) as off_opp_oreb,
      tg.opp_dreb - coalesce(o.opp_dreb, 0) as off_opp_dreb,
      tg.opp_ast - coalesce(o.opp_ast, 0) as off_opp_ast,
      tg.opp_tov - coalesce(o.opp_tov, 0) as off_opp_tov,
      tg.opp_stl - coalesce(o.opp_stl, 0) as off_opp_stl,
      tg.opp_blk - coalesce(o.opp_blk, 0) as off_opp_blk
    from played p
    join team_game tg on tg.team_id = p.team_id and tg.game_key = p.game_key
    left join on_game o on o.team_id = p.team_id and o.game_key = p.game_key and o.player_id = p.player_id
  ),
  agg as (
    select team_id, player_id, count(distinct game_key)::int as games,
      sum(on_secs) as on_secs, sum(off_secs) as off_secs,
      sum(on_poss_for) as on_poss_for, sum(off_poss_for) as off_poss_for,
      sum(on_poss_against) as on_poss_against, sum(off_poss_against) as off_poss_against,
      sum(on_pts_for) as on_pts_for, sum(off_pts_for) as off_pts_for,
      sum(on_pts_against) as on_pts_against, sum(off_pts_against) as off_pts_against,
      sum(on_fg2m) as on_fg2m, sum(off_fg2m) as off_fg2m,
      sum(on_fg2a) as on_fg2a, sum(off_fg2a) as off_fg2a,
      sum(on_fg3m) as on_fg3m, sum(off_fg3m) as off_fg3m,
      sum(on_fg3a) as on_fg3a, sum(off_fg3a) as off_fg3a,
      sum(on_ftm) as on_ftm, sum(off_ftm) as off_ftm,
      sum(on_fta) as on_fta, sum(off_fta) as off_fta,
      sum(on_oreb) as on_oreb, sum(off_oreb) as off_oreb,
      sum(on_dreb) as on_dreb, sum(off_dreb) as off_dreb,
      sum(on_ast) as on_ast, sum(off_ast) as off_ast,
      sum(on_tov) as on_tov, sum(off_tov) as off_tov,
      sum(on_stl) as on_stl, sum(off_stl) as off_stl,
      sum(on_blk) as on_blk, sum(off_blk) as off_blk,
      sum(on_opp_fg2m) as on_opp_fg2m, sum(off_opp_fg2m) as off_opp_fg2m,
      sum(on_opp_fg2a) as on_opp_fg2a, sum(off_opp_fg2a) as off_opp_fg2a,
      sum(on_opp_fg3m) as on_opp_fg3m, sum(off_opp_fg3m) as off_opp_fg3m,
      sum(on_opp_fg3a) as on_opp_fg3a, sum(off_opp_fg3a) as off_opp_fg3a,
      sum(on_opp_ftm) as on_opp_ftm, sum(off_opp_ftm) as off_opp_ftm,
      sum(on_opp_fta) as on_opp_fta, sum(off_opp_fta) as off_opp_fta,
      sum(on_opp_oreb) as on_opp_oreb, sum(off_opp_oreb) as off_opp_oreb,
      sum(on_opp_dreb) as on_opp_dreb, sum(off_opp_dreb) as off_opp_dreb,
      sum(on_opp_ast) as on_opp_ast, sum(off_opp_ast) as off_opp_ast,
      sum(on_opp_tov) as on_opp_tov, sum(off_opp_tov) as off_opp_tov,
      sum(on_opp_stl) as on_opp_stl, sum(off_opp_stl) as off_opp_stl,
      sum(on_opp_blk) as on_opp_blk, sum(off_opp_blk) as off_opp_blk
    from player_game group by team_id, player_id
  ),
  rated as (
    select agg.*,
      100.0 * on_pts_for / nullif(on_poss_for, 0) as on_ortg,
      100.0 * off_pts_for / nullif(off_poss_for, 0) as off_ortg,
      100.0 * on_pts_against / nullif(on_poss_against, 0) as on_drtg,
      100.0 * off_pts_against / nullif(off_poss_against, 0) as off_drtg,
      (on_pts_for - on_pts_against) - (off_pts_for - off_pts_against) as plus_minus_diff,
      (on_poss_for + on_poss_against) / 2 >= 100 and (off_poss_for + off_poss_against) / 2 >= 50 as qualified
    from agg
  ),
  diffs as (
    select rated.*,
      on_ortg - on_drtg as on_nrtg,
      off_ortg - off_drtg as off_nrtg,
      on_ortg - off_ortg as ortg_diff,
      on_drtg - off_drtg as drtg_diff,
      (on_ortg - on_drtg) - (off_ortg - off_drtg) as nrtg_diff
    from rated
  )
  insert into player_on_off_season (
    league_id, team_id, player_id, player_name, games,
    on_secs, off_secs, on_poss_for, off_poss_for, on_poss_against, off_poss_against, on_pts_for, off_pts_for, on_pts_against, off_pts_against, on_fg2m, off_fg2m, on_fg2a, off_fg2a, on_fg3m, off_fg3m, on_fg3a, off_fg3a, on_ftm, off_ftm, on_fta, off_fta, on_oreb, off_oreb, on_dreb, off_dreb, on_ast, off_ast, on_tov, off_tov, on_stl, off_stl, on_blk, off_blk, on_opp_fg2m, off_opp_fg2m, on_opp_fg2a, off_opp_fg2a, on_opp_fg3m, off_opp_fg3m, on_opp_fg3a, off_opp_fg3a, on_opp_ftm, off_opp_ftm, on_opp_fta, off_opp_fta, on_opp_oreb, off_opp_oreb, on_opp_dreb, off_opp_dreb, on_opp_ast, off_opp_ast, on_opp_tov, off_opp_tov, on_opp_stl, off_opp_stl, on_opp_blk, off_opp_blk,
    on_ortg, off_ortg, ortg_diff, on_drtg, off_drtg, drtg_diff, on_nrtg, off_nrtg, nrtg_diff,
    plus_minus_diff, qualified, qualified_count,
    ortg_diff_rank, drtg_diff_rank, nrtg_diff_rank, plus_minus_diff_rank, updated_at
  )
  select p_league_id, d.team_id, d.player_id, pl.full_name, d.games,
    d.on_secs, d.off_secs, d.on_poss_for, d.off_poss_for, d.on_poss_against, d.off_poss_against, d.on_pts_for, d.off_pts_for, d.on_pts_against, d.off_pts_against, d.on_fg2m, d.off_fg2m, d.on_fg2a, d.off_fg2a, d.on_fg3m, d.off_fg3m, d.on_fg3a, d.off_fg3a, d.on_ftm, d.off_ftm, d.on_fta, d.off_fta, d.on_oreb, d.off_oreb, d.on_dreb, d.off_dreb, d.on_ast, d.off_ast, d.on_tov, d.off_tov, d.on_stl, d.off_stl, d.on_blk, d.off_blk, d.on_opp_fg2m, d.off_opp_fg2m, d.on_opp_fg2a, d.off_opp_fg2a, d.on_opp_fg3m, d.off_opp_fg3m, d.on_opp_fg3a, d.off_opp_fg3a, d.on_opp_ftm, d.off_opp_ftm, d.on_opp_fta, d.off_opp_fta, d.on_opp_oreb, d.off_opp_oreb, d.on_opp_dreb, d.off_opp_dreb, d.on_opp_ast, d.off_opp_ast, d.on_opp_tov, d.off_opp_tov, d.on_opp_stl, d.off_opp_stl, d.on_opp_blk, d.off_opp_blk,
    round(d.on_ortg, 1), round(d.off_ortg, 1), round(d.ortg_diff, 1),
    round(d.on_drtg, 1), round(d.off_drtg, 1), round(d.drtg_diff, 1),
    round(d.on_nrtg, 1), round(d.off_nrtg, 1), round(d.nrtg_diff, 1),
    d.plus_minus_diff, d.qualified,
    count(*) filter (where d.qualified) over (),
    case when d.qualified then rank() over (partition by d.qualified order by d.ortg_diff desc nulls last) end,
    case when d.qualified then rank() over (partition by d.qualified order by d.drtg_diff asc nulls last) end,
    case when d.qualified then rank() over (partition by d.qualified order by d.nrtg_diff desc nulls last) end,
    case when d.qualified then rank() over (partition by d.qualified order by d.plus_minus_diff desc nulls last) end,
    now()
  from diffs d
  left join players pl on pl.id = d.player_id;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.refresh_player_on_off(uuid) from public, anon, authenticated;
grant execute on function public.refresh_player_on_off(uuid) to service_role;
