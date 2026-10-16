-- Coaches Hub playbooks: a team's plays, drawn, edited and animated in the
-- Playbook tab (client/src/components/coaches-hub/Playbook.tsx).
--
-- One playbook per owner. A coach account's playbook belongs to their club
-- (owner_key 'team:<team_id>'), so every coach on that team sees and edits the
-- same plays. Any other signed-in account (admins, league owners) gets a
-- personal playbook ('user:<auth uid>').
--
-- Like the scouting tables, it is reachable only through the site's API
-- (server/playbookRoutes.ts): RLS on, no policies.

create table if not exists public.coach_playbooks (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null unique check (owner_key ~ '^(team|user):.+$'),
  title text not null default 'Team Playbook',
  data jsonb not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pg_column_size(data) < 2000000)
);

alter table public.coach_playbooks enable row level security;
