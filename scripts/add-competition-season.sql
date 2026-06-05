-- ============================================================
-- Migration: Add competitions table + season/competition_id to leagues
-- Run this in the Supabase SQL editor (once only)
-- ============================================================

-- 1. Create the competitions (brand) table
CREATE TABLE IF NOT EXISTS public.competitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  logo_url    text,
  description text,
  created_at  timestamptz DEFAULT now()
);

-- 2. Add new columns to leagues
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS competition_id uuid REFERENCES public.competitions(id),
  ADD COLUMN IF NOT EXISTS season        text;  -- e.g. "2025/26", "2026/27"

-- Index for fast sibling-season lookups
CREATE INDEX IF NOT EXISTS leagues_competition_id_idx ON public.leagues(competition_id);

-- ============================================================
-- 3. Seed known competitions
-- ============================================================

INSERT INTO public.competitions (name, slug, description) VALUES
  ('Hoopsfix Pro Am',         'hoopsfix-pro-am',           'Hoopsfix Pro Am tournament series'),
  ('NBL Division One Men''s', 'nbl-division-one-mens',     'National Basketball League Division One (Men''s)'),
  ('NBL Division One Women''s','nbl-division-one-womens',  'National Basketball League Division One (Women''s)'),
  ('British Championship',    'british-championship',       'British Championship Basketball'),
  ('REBA SL',                 'reba-sl',                   'REBA Super League')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 4. Assign competition_id + season to existing leagues
--    Replace the UUIDs below with the actual IDs after running
--    the INSERT above (SELECT id, slug FROM competitions;)
-- ============================================================

-- Example pattern — run: SELECT id, slug FROM competitions; to get the real UUIDs, then fill in below.

/*
-- Hoopsfix Pro Am
UPDATE public.leagues SET competition_id = '<hoopsfix-pro-am-uuid>', season = '2025/26'
  WHERE slug = 'hoopsfix-pro-am-2025';

UPDATE public.leagues SET competition_id = '<hoopsfix-pro-am-uuid>', season = '2026/27'
  WHERE slug = 'hoopsfix-pro-am-2026';

-- NBL Division One Men's
UPDATE public.leagues SET competition_id = '<nbl-division-one-mens-uuid>', season = '2024/25'
  WHERE slug = 'national-basketball-league-d1-mens-20242025';

UPDATE public.leagues SET competition_id = '<nbl-division-one-mens-uuid>', season = '2025/26'
  WHERE slug = 'national-basketball-league-d1-mens-20252026';

-- NBL Division One Women's
UPDATE public.leagues SET competition_id = '<nbl-division-one-womens-uuid>', season = '2024/25'
  WHERE slug = 'national-basketball-league-d1-womens-20242025';

UPDATE public.leagues SET competition_id = '<nbl-division-one-womens-uuid>', season = '2025/26'
  WHERE slug = 'national-basketball-league-d1-womens-20252026';

-- British Championship
UPDATE public.leagues SET competition_id = '<british-championship-uuid>', season = '2025/26'
  WHERE slug = 'british-championship-basketball-20252026';

-- REBA SL
UPDATE public.leagues SET competition_id = '<reba-sl-uuid>', season = '2024/25'
  WHERE slug = 'reba-sl';
*/

-- ============================================================
-- 5. (Optional) RLS — competitions is public read-only
-- ============================================================
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitions_public_read" ON public.competitions
  FOR SELECT USING (true);
