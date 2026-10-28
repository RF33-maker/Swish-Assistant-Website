-- PDF titles a competition accepts on upload. The PDF parser (SAB
-- pdf_parser._resolve_upload_competition) looks a PDF's title up here before
-- falling back to the competition's own name, so a title that differs from the
-- name (a renamed competition, an extra "FIBA") still lands in the right place.
-- Several competitions can share a title: REBA SL runs one competition per age
-- group at a stop while the PDFs carry one title per stop, and the age group in
-- the team names picks between them.

create table if not exists public.competition_upload_names (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.competitions (league_id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists competition_upload_names_league_name_idx
  on public.competition_upload_names (league_id, lower(btrim(name)));
create index if not exists competition_upload_names_name_idx
  on public.competition_upload_names (lower(btrim(name)));

-- Managers of a competition (see 20261029_competition_managers.sql) look after
-- its titles; the parser reads them with the service role.
alter table public.competition_upload_names enable row level security;

drop policy if exists "competition_upload_names_select" on public.competition_upload_names;
create policy "competition_upload_names_select" on public.competition_upload_names
  for select to authenticated
  using (public.can_manage_competition(league_id));

drop policy if exists "competition_upload_names_insert" on public.competition_upload_names;
create policy "competition_upload_names_insert" on public.competition_upload_names
  for insert to authenticated
  with check (public.can_manage_competition(league_id));

drop policy if exists "competition_upload_names_delete" on public.competition_upload_names;
create policy "competition_upload_names_delete" on public.competition_upload_names
  for delete to authenticated
  using (public.can_manage_competition(league_id));
