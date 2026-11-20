-- The site index summary (20261115_seo_index_parts.sql) was never switched on:
-- its refresh read every box score three times (teams, games, players), which
-- the 1 GB database server could not do comfortably. This version reads the
-- box scores once into a narrow working copy (seven small columns instead of
-- the full row) and builds all three kinds of piece from that.
--
-- The pieces and their layout are unchanged, except that `stats` on a game now
-- lists every competition its box score is filed under unless that is only its
-- own (then 1), so a game filed under its own private competition and a public
-- one still counts:
--
--   teams    [league_id, team_name, rows, latest_created_at, last_game_day]
--   games    [game_key, league_id, matchtime, hometeam, awayteam, stats]
--            stats = 1 when the box score is filed under the game's own competition only,
--            otherwise the competitions it is filed under (or 0 with no box score)
--   players  [id, slug, full_name, date_of_birth,
--             [[league_id, games, last_game_day, latest_created_epoch, latest_team_name], …]]
--            only players with a box score
--
-- Pieces: teams-000, games-0..5 (by a hash of game_key), players-0..f (by the
-- first character of the player id), each a few hundred KB.
--
-- Every piece carries an md5 of its content. The server lists the hashes, reads
-- only pieces it doesn't already hold, and checks each one it reads still
-- matches the list, so it never mixes two builds. A piece whose content has
-- not changed keeps its stored value, so a refresh with nothing new writes
-- almost nothing.

create table if not exists public.seo_index_parts (
  part text primary key,
  data json not null,
  data_hash text not null,
  built_at timestamptz not null
);

-- Server only: no policies, so only the service role can read it.
alter table public.seo_index_parts enable row level security;
revoke all on public.seo_index_parts from anon, authenticated;

create or replace function public.refresh_seo_index_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  started timestamptz := clock_timestamp();
  stamp timestamptz := now();
  scan_ms integer;
  total integer;
  written integer;
begin
  -- One pass over the box scores, keeping only what the index needs.
  create temporary table _seo_rows on commit drop as
  select ps.id, ps.player_id, ps.league_id, ps.game_key, ps.created_at,
         btrim(coalesce(ps.team_name, '')) as team_name,
         (coalesce(gs.matchtime, ps.created_at) at time zone 'UTC')::date as day
  from public.player_stats ps
  left join public.game_schedule gs on gs.game_key = ps.game_key
  where ps.league_id is not null;
  analyze _seo_rows;
  scan_ms := (extract(epoch from clock_timestamp() - started) * 1000)::integer;

  create temporary table _seo_parts (part text primary key, data text not null) on commit drop;

  insert into _seo_parts
  select 'teams-000', coalesce(jsonb_agg(jsonb_build_array(league_id, team_name, n, latest, lastmod) order by first_id), '[]'::jsonb)::text
  from (
    select league_id, team_name, count(*) as n, max(created_at) as latest, max(day) as lastmod, min(id::text) as first_id
    from _seo_rows
    where team_name <> ''
    group by league_id, team_name
  ) t;

  -- Games and players are split by a fixed bucket (not by position), so a new
  -- game or player changes one piece rather than every piece after it.
  insert into _seo_parts
  select 'games-' || bucket, jsonb_agg(item order by game_key)::text
  from (
    select gs.game_key, mod(abs(hashtext(gs.game_key)), 6) as bucket,
           jsonb_build_array(gs.game_key, gs.league_id, gs.matchtime, gs.hometeam, gs.awayteam,
             case
               when sg.leagues is null then to_jsonb(0)
               when sg.leagues = array[gs.league_id] then to_jsonb(1)
               else to_jsonb(sg.leagues)
             end) as item
    from public.game_schedule gs
    left join (
      select game_key, array_agg(distinct league_id) as leagues
      from _seo_rows
      where game_key is not null
      group by game_key
    ) sg on sg.game_key = gs.game_key
  ) g
  group by bucket;

  insert into _seo_parts
  select 'players-' || bucket, jsonb_agg(item order by id)::text
  from (
    select p.id, left(p.id::text, 1) as bucket,
           jsonb_build_array(p.id, p.slug, p.full_name, p.date_of_birth, pl.leagues) as item
    from (
      select per_league.player_id,
             jsonb_agg(jsonb_build_array(per_league.league_id, per_league.games, per_league.lastmod,
                                         per_league.latest, latest_team.team_name)) as leagues
      from (
        select player_id, league_id,
               count(distinct coalesce(game_key, id::text)) as games,
               max(day) as lastmod,
               extract(epoch from max(created_at)) as latest
        from _seo_rows
        where player_id is not null
        group by player_id, league_id
      ) per_league
      -- The team on their most recent row that names one.
      left join (
        select distinct on (player_id, league_id) player_id, league_id, team_name
        from _seo_rows
        where player_id is not null and team_name <> ''
        order by player_id, league_id, created_at desc, id desc
      ) latest_team using (player_id, league_id)
      group by per_league.player_id
    ) pl
    join public.players p on p.id = pl.player_id
  ) pr
  group by bucket;

  -- Rewrite only the pieces that changed; every piece gets this build's stamp.
  select count(*) into written
  from _seo_parts n
  left join public.seo_index_parts live on live.part = n.part
  where live.data_hash is distinct from md5(n.data);

  insert into public.seo_index_parts as live (part, data, data_hash, built_at)
  select n.part, n.data::json, md5(n.data), stamp from _seo_parts n
  on conflict (part) do update
    set data = case when live.data_hash = excluded.data_hash then live.data else excluded.data end,
        data_hash = excluded.data_hash,
        built_at = excluded.built_at;
  delete from public.seo_index_parts where built_at <> stamp;

  select count(*) into total from public.seo_index_parts;
  return jsonb_build_object(
    'build_ms', (extract(epoch from clock_timestamp() - started) * 1000)::integer,
    'scan_ms', scan_ms,
    'parts', total,
    'changed_parts', written,
    'bytes', (select sum(length(data)) from _seo_parts));
end;
$$;

revoke execute on function public.refresh_seo_index_snapshot() from public, anon, authenticated;
grant execute on function public.refresh_seo_index_snapshot() to service_role;

-- Every fifteen minutes. cron.schedule replaces the job of the same name (and
-- re-enables it). Run `select public.refresh_seo_index_snapshot();` once by hand
-- first so the site has pieces to read straight away.
select cron.schedule('seo-index-snapshot', '*/15 * * * *', $$select public.refresh_seo_index_snapshot()$$);
