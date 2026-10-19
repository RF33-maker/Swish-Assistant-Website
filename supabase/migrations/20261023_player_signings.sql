-- Where a competition's players went next: college scholarships, academies,
-- pro contracts. Shown on the next season's preview ("Where they signed").
-- Rows are added by admins (dashboard / service role); everyone can read the
-- published ones.

create table if not exists public.player_signings (
  id uuid primary key default gen_random_uuid(),
  -- The season the player played in, e.g. 'REBA-SL' for REBA SL Season 1.
  competition_slug text not null,
  player_name text not null,
  -- Optional link to the player's profile (/player/:slug).
  player_slug text,
  destination text not null,
  -- e.g. 'College', 'University', 'Academy', 'Pro'.
  destination_type text,
  -- e.g. 'NCAA D1, USA' or 'Spain'.
  destination_location text,
  destination_logo_url text,
  photo_url text,
  signed_on date,
  note text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists player_signings_competition_idx
  on public.player_signings (competition_slug, sort_order);

alter table public.player_signings enable row level security;

drop policy if exists "Published signings are public" on public.player_signings;
create policy "Published signings are public"
  on public.player_signings for select
  using (is_published);
