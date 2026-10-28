-- More than one account can run a competition. Until now a competition had one
-- owner (competitions.user_id), so two people sharing a league (REBA SL: the
-- site owner and the league's own admin) had to swap user_id before each upload.
--
-- An account can manage a competition when it:
--   * owns it (user_id or created_by),
--   * is listed in competition_managers for it, or
--   * can manage its parent, grandparent, ... (stops and age groups inherit
--     from their season).
-- App admins can manage everything.

create table if not exists public.competition_managers (
  league_id uuid not null references public.competitions (league_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index if not exists competition_managers_user_id_idx
  on public.competition_managers (user_id);

-- Every competition the signed-in account owns or was added to, plus all of
-- their descendants. App admins are not expanded to "everything" here, so their
-- own lists stay their own; can_manage_competition covers the admin bypass.
create or replace function public.managed_competition_ids()
returns table (league_id uuid)
language sql
stable
security definer
set search_path to ''
as $$
  with recursive tree as (
    select c.league_id
    from public.competitions c
    where c.user_id = (select auth.uid()) or c.created_by = (select auth.uid())
    union
    select m.league_id
    from public.competition_managers m
    where m.user_id = (select auth.uid())
    union
    select c.league_id
    from public.competitions c
    join tree t on c.parent_league_id = t.league_id
  )
  select tree.league_id from tree;
$$;

create or replace function public.can_manage_competition(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select (select public.is_app_admin())
      or exists (select 1 from public.managed_competition_ids() m where m.league_id = p_league_id);
$$;

-- The same competitions as full rows, for the admin pages' lists.
create or replace function public.managed_competitions()
returns setof public.competitions
language sql
stable
security definer
set search_path to ''
as $$
  select c.*
  from public.competitions c
  where c.league_id in (select m.league_id from public.managed_competition_ids() m);
$$;

revoke all on function public.managed_competition_ids() from public, anon;
revoke all on function public.managed_competitions() from public, anon;
revoke all on function public.can_manage_competition(uuid) from public, anon;
grant execute on function public.managed_competition_ids() to authenticated;
grant execute on function public.managed_competitions() to authenticated;
grant execute on function public.can_manage_competition(uuid) to authenticated;

-- Managers can edit the competition (details, parent link after an upload),
-- not just the account in user_id.
drop policy if exists "Allow league owners to update their leagues" on public.competitions;
drop policy if exists "competitions_managers_update" on public.competitions;
create policy "competitions_managers_update" on public.competitions
  for update to authenticated
  using (
    (select public.is_app_admin())
    or league_id in (select m.league_id from public.managed_competition_ids() m)
  )
  with check (
    (select public.is_app_admin())
    or league_id in (select m.league_id from public.managed_competition_ids() m)
  );

-- Managers see their private (is_public = false) competitions too.
drop policy if exists "competitions_managers_select" on public.competitions;
create policy "competitions_managers_select" on public.competitions
  for select to authenticated
  using (
    (select public.is_app_admin())
    or league_id in (select m.league_id from public.managed_competition_ids() m)
  );

alter table public.competition_managers enable row level security;

drop policy if exists "competition_managers_select" on public.competition_managers;
create policy "competition_managers_select" on public.competition_managers
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_competition(league_id));

drop policy if exists "competition_managers_insert" on public.competition_managers;
create policy "competition_managers_insert" on public.competition_managers
  for insert to authenticated
  with check (public.can_manage_competition(league_id));

drop policy if exists "competition_managers_delete" on public.competition_managers;
create policy "competition_managers_delete" on public.competition_managers
  for delete to authenticated
  using (public.can_manage_competition(league_id));
