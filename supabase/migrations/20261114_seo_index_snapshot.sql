-- The site index (server/seoIndex.ts) feeds the sitemap and every
-- server-rendered page. It used to download every player_stats row through the
-- API to work out which teams, players and games exist. After the history
-- imports that is ~190 pages of 1,000 rows, which no longer finishes inside a
-- request, so each visit started another full download.
--
-- The database now does that summarising itself and keeps the result in one
-- row, refreshed every ten minutes. The server reads that row.

-- `data` is json, not jsonb: it is stored as the text the API sends back, so
-- reading it costs the database almost nothing.
create table if not exists public.seo_index_snapshot (
  id smallint primary key default 1 check (id = 1),
  data json not null,
  data_hash text,
  built_at timestamptz not null default now(),
  build_ms integer
);

-- Server only: no policies, so only the service role can read it.
alter table public.seo_index_snapshot enable row level security;
revoke all on public.seo_index_snapshot from anon, authenticated;

-- What the index needs from the box scores, as compact arrays:
--   teams       [league_id, team_name, rows, latest_created_at, last_game_day]
--   playerStats [player_id, league_id, games, last_game_day, latest_created_at, latest_team_name]
--   statGames   [game_key, league_id]            games that have a box score
--   games       [game_key, league_id, matchtime, hometeam, awayteam]
--   players     [id, slug, full_name, date_of_birth]   only players with a box score
create or replace function public.seo_index_source()
returns jsonb
language sql
stable
set search_path = public, pg_temp
set work_mem = '64MB'
as $$
  with s as materialized (
    select ps.id, ps.player_id, ps.league_id, ps.game_key, ps.created_at,
           btrim(coalesce(ps.team_name, '')) as team_name,
           (coalesce(gs.matchtime, ps.created_at) at time zone 'UTC')::date as day
    from public.player_stats ps
    left join public.game_schedule gs on gs.game_key = ps.game_key
    where ps.league_id is not null
  ),
  team_rows as materialized (
    select league_id, team_name, count(*) as n, max(created_at) as latest, max(day) as lastmod, min(id::text) as first_id
    from s
    where team_name <> ''
    group by league_id, team_name
  ),
  player_rows as materialized (
    select player_id, league_id,
           count(distinct coalesce(game_key, id::text)) as games,
           max(day) as lastmod,
           max(created_at) as latest,
           -- The team on their most recent row that names one.
           (max(array[to_char(created_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS'), id::text, team_name])
              filter (where team_name <> ''))[3] as team
    from s
    where player_id is not null
    group by player_id, league_id
  ),
  stat_games as materialized (
    select game_key, league_id from s where game_key is not null group by game_key, league_id
  ),
  stat_players as materialized (
    select distinct player_id from player_rows
  )
  select jsonb_build_object(
    'teams', (select coalesce(jsonb_agg(jsonb_build_array(league_id, team_name, n, latest, lastmod) order by first_id), '[]'::jsonb) from team_rows),
    'playerStats', (select coalesce(jsonb_agg(jsonb_build_array(player_id, league_id, games, lastmod, latest, team)), '[]'::jsonb) from player_rows),
    'statGames', (select coalesce(jsonb_agg(jsonb_build_array(game_key, league_id)), '[]'::jsonb) from stat_games),
    'games', (select coalesce(jsonb_agg(jsonb_build_array(game_key, league_id, matchtime, hometeam, awayteam) order by game_key), '[]'::jsonb) from public.game_schedule),
    'players', (select coalesce(jsonb_agg(jsonb_build_array(p.id, p.slug, p.full_name, p.date_of_birth) order by p.id), '[]'::jsonb)
                from public.players p join stat_players sp on sp.player_id = p.id)
  );
$$;

create or replace function public.refresh_seo_index_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  started timestamptz := clock_timestamp();
  payload text;
  new_hash text;
  old_hash text;
  ms integer;
  existed boolean;
begin
  payload := public.seo_index_source()::text;
  new_hash := md5(payload);
  ms := (extract(epoch from clock_timestamp() - started) * 1000)::integer;

  -- Rewrite the stored copy only when something changed; otherwise just mark it checked.
  select true, s.data_hash into existed, old_hash from public.seo_index_snapshot s where s.id = 1;
  if existed is null then
    insert into public.seo_index_snapshot (id, data, data_hash, built_at, build_ms) values (1, payload::json, new_hash, now(), ms);
  elsif old_hash is distinct from new_hash then
    update public.seo_index_snapshot set data = payload::json, data_hash = new_hash, built_at = now(), build_ms = ms where id = 1;
  else
    update public.seo_index_snapshot set built_at = now(), build_ms = ms where id = 1;
  end if;

  return jsonb_build_object('build_ms', ms, 'changed', old_hash is distinct from new_hash, 'bytes', length(payload));
end;
$$;

revoke execute on function public.seo_index_source() from public, anon, authenticated;
revoke execute on function public.refresh_seo_index_snapshot() from public, anon, authenticated;
grant execute on function public.seo_index_source() to service_role;
grant execute on function public.refresh_seo_index_snapshot() to service_role;

-- Keep it fresh. cron.schedule replaces a job of the same name.
select cron.schedule('seo-index-snapshot', '*/10 * * * *', $$select public.refresh_seo_index_snapshot()$$);

select public.refresh_seo_index_snapshot();
