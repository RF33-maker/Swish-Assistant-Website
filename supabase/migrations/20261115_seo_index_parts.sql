-- The first version of the stored site-index summary (20261114) kept everything
-- in one 8.7 MB row. On the 1 GB database server that was too heavy both to
-- build (it asked for 64 MB of working memory) and to read (one very large
-- response through the API). This replaces it with small pieces:
--
--   seo_index_parts.part   'teams-000', 'games-000'…, 'players-000'…
--   seo_index_parts.data   a JSON array of rows, a few hundred KB at most
--
--   teams    [league_id, team_name, rows, latest_created_at, last_game_day]
--   games    [game_key, league_id, matchtime, hometeam, awayteam, stats]
--            stats = 1 when the game has a box score in its own competition,
--            otherwise the other competitions its box score is filed under (or 0)
--   players  [id, slug, full_name, date_of_birth,
--             [[league_id, games, last_game_day, latest_created_epoch, latest_team_name], …]]
--            only players with a box score
--
-- Every piece of one build carries the same built_at, so a reader can tell if
-- a rebuild landed part-way through its read.

drop function if exists public.seo_index_source();
drop table if exists public.seo_index_snapshot;

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
  total integer;
begin
  create temporary table _seo_parts (part text primary key, data text not null) on commit drop;

  insert into _seo_parts
  select 'teams-000', coalesce(jsonb_agg(jsonb_build_array(league_id, team_name, n, latest, lastmod) order by first_id), '[]'::jsonb)::text
  from (
    select ps.league_id, btrim(ps.team_name) as team_name, count(*) as n, max(ps.created_at) as latest,
           max((coalesce(gs.matchtime, ps.created_at) at time zone 'UTC')::date) as lastmod,
           min(ps.id::text) as first_id
    from public.player_stats ps
    left join public.game_schedule gs on gs.game_key = ps.game_key
    where ps.league_id is not null and btrim(coalesce(ps.team_name, '')) <> ''
    group by ps.league_id, btrim(ps.team_name)
  ) t;

  insert into _seo_parts
  select 'games-' || to_char(chunk, 'FM000'), jsonb_agg(item order by game_key)::text
  from (
    select gs.game_key, (row_number() over (order by gs.game_key) - 1) / 2500 as chunk,
           jsonb_build_array(gs.game_key, gs.league_id, gs.matchtime, gs.hometeam, gs.awayteam,
             case
               when exists (select 1 from public.player_stats ps where ps.game_key = gs.game_key and ps.league_id = gs.league_id) then to_jsonb(1)
               else coalesce((select jsonb_agg(distinct ps.league_id) from public.player_stats ps where ps.game_key = gs.game_key and ps.league_id is not null), to_jsonb(0))
             end) as item
    from public.game_schedule gs
  ) g
  group by chunk;

  insert into _seo_parts
  select 'players-' || to_char(chunk, 'FM000'), jsonb_agg(item order by id)::text
  from (
    select p.id, (row_number() over (order by p.id) - 1) / 2000 as chunk,
           jsonb_build_array(p.id, p.slug, p.full_name, p.date_of_birth, pl.leagues) as item
    from (
      select player_id, jsonb_agg(jsonb_build_array(league_id, games, lastmod, latest, team)) as leagues
      from (
        select ps.player_id, ps.league_id,
               count(distinct coalesce(ps.game_key, ps.id::text)) as games,
               max((coalesce(gs.matchtime, ps.created_at) at time zone 'UTC')::date) as lastmod,
               extract(epoch from max(ps.created_at)) as latest,
               -- The team on their most recent row that names one.
               (max(array[to_char(ps.created_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS'), ps.id::text, btrim(ps.team_name)])
                  filter (where btrim(coalesce(ps.team_name, '')) <> ''))[3] as team
        from public.player_stats ps
        left join public.game_schedule gs on gs.game_key = ps.game_key
        where ps.league_id is not null and ps.player_id is not null
        group by ps.player_id, ps.league_id
      ) per_league
      group by player_id
    ) pl
    join public.players p on p.id = pl.player_id
  ) pr
  group by chunk;

  -- Rewrite only the pieces that changed; every piece gets this build's stamp.
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
    'parts', total,
    'bytes', (select sum(length(data)) from _seo_parts));
end;
$$;

revoke execute on function public.refresh_seo_index_snapshot() from public, anon, authenticated;
grant execute on function public.refresh_seo_index_snapshot() to service_role;

-- Every fifteen minutes. cron.schedule replaces the job of the same name (and re-enables it).
select cron.schedule('seo-index-snapshot', '*/15 * * * *', $$select public.refresh_seo_index_snapshot()$$);
