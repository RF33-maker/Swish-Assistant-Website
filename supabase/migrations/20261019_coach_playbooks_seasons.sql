-- Playbooks change every season, so an owner (a club's coaches, or one
-- personal account) now has one playbook per season instead of one in total.
--
-- Season labels match shared/season.ts ("2026/27"; the season turns over on
-- 1 September). Playbooks saved before this migration were all written for the
-- 2026/27 season, so that is what they are backfilled with.

alter table public.coach_playbooks add column if not exists season text;

update public.coach_playbooks set season = '2026/27' where season is null;

alter table public.coach_playbooks alter column season set not null;

alter table public.coach_playbooks
  add constraint coach_playbooks_season_format check (season ~ '^[0-9]{4}/[0-9]{2}$');

alter table public.coach_playbooks drop constraint if exists coach_playbooks_owner_key_key;

alter table public.coach_playbooks
  add constraint coach_playbooks_owner_season_key unique (owner_key, season);
