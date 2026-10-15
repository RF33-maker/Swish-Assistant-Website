-- Scouting reports by window, and a coach's own notes on an opponent.
--
-- 1. A report can now be built on the opponent's last 3 games, last 5 games or
--    the whole season. `window` joins the key, so each view keeps its own plan.
--    Existing rows are the whole-season plans, which is what the default says,
--    so nothing about the old behaviour changes until a coach picks a window.
--
-- 2. scout_coach_notes holds what the data can't know: "he's normally a 40%
--    three-point shooter, this is a cold start", "she's back from injury". The
--    scouting agent reads them when it builds that coach's plan. Like the
--    reports they are reachable only through the site's API (RLS on, no
--    policies), which checks the caller is that team's coach (or an admin).

alter table public.scout_agent_reports
  add column if not exists "window" text not null default 'season'
  check ("window" in ('season', 'last5', 'last3'));

-- Swap the old (league, opponent, for_team) key for one that includes the window.
do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.scout_agent_reports'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (league_id, opponent_name, for_team_name)';
  if c is not null then
    execute format('alter table public.scout_agent_reports drop constraint %I', c);
  end if;
end $$;

create unique index if not exists scout_agent_reports_key_idx
  on public.scout_agent_reports (league_id, opponent_name, for_team_name, "window");

create table if not exists public.scout_coach_notes (
  id uuid primary key default gen_random_uuid(),
  -- The coach's club, and the opponent the note is about, as the report spells them.
  for_team_name text not null,
  opponent_name text not null,
  league_id uuid,
  scope text not null check (scope in ('team', 'player')),
  player_name text,
  -- playerNameKey(player_name): stable across "D. Crnac" / "Dzana Crnac". '' for a team-wide note.
  player_key text not null default '',
  kind text check (kind in ('stronger', 'weaker', 'out', 'changed', 'other')),
  note text not null check (char_length(note) between 1 and 600),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'team' and player_key = '') or (scope = 'player' and player_key <> ''))
);

create unique index if not exists scout_coach_notes_key_idx
  on public.scout_coach_notes (for_team_name, opponent_name, scope, player_key);
create index if not exists scout_coach_notes_team_idx on public.scout_coach_notes (for_team_name);

alter table public.scout_coach_notes enable row level security;
