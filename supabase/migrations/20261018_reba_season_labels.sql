-- REBA SL seasons are labelled "Season 1", "Season 2", not 2026/27.
--
-- Applied to the live database on 2026-10-18 (backup of the touched rows:
-- archive.reba_season_backfill_20261018). Kept idempotent so it can be re-run.

-- 1. Season 1: the existing REBA SL parent and every age-group / stop child,
--    all linked to the REBA SL brand (only stops 7+ were linked before).
update public.competitions
set season = 'Season 1',
    competition_id = '54317000-23d3-47f7-9310-ddc5f44f8d59'
where league_id = '48ac14ea-186d-4450-969a-7fb2d80f26d4'
   or parent_league_id = '48ac14ea-186d-4450-969a-7fb2d80f26d4';

-- 2. Season 2: an empty parent under the same brand. Private and unapproved
--    until the first stop is ready; create the stops with
--    parent_league_id = this row's league_id and season = 'Season 2'.
insert into public.competitions
  (name, slug, season, competition_id, created_by, user_id, logo_url, banner_url,
   brand_primary_colour, social_links, instagram_embed_url, is_public, approved)
select 'REBA SL Season 2', 'REBA-SL-SEASON-2', 'Season 2', competition_id, created_by, user_id,
       logo_url, banner_url, brand_primary_colour, social_links, instagram_embed_url, false, false
from public.competitions
where league_id = '48ac14ea-186d-4450-969a-7fb2d80f26d4'
  and not exists (select 1 from public.competitions where slug = 'REBA-SL-SEASON-2');
