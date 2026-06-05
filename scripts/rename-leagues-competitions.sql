-- ============================================================
-- Rename: leagues ↔ competitions (Task #190)
-- Before: leagues = season instances,  competitions = brand/series
-- After:  competitions = season instances, leagues = brand/series
--
-- Column names are NOT changed — only the table names are swapped.
-- The column "competition_id" in the new "competitions" table
-- (was "leagues") still holds the FK pointing to "leagues.id"
-- (the brand table, was "competitions").
-- ============================================================
-- Run in the Supabase SQL editor.
-- ⚠️  Back up your data first.
-- Run all statements in a single transaction where possible.
-- ============================================================

BEGIN;

-- 1. Rename the brand/series table: competitions → leagues
--    (was "competitions" with PK = id)
ALTER TABLE public.competitions RENAME TO leagues;

-- 2. Rename the season-instances table: leagues → competitions
--    (was "leagues" with PK = league_id, FK competition_id → old competitions.id)
ALTER TABLE public.leagues RENAME TO competitions;

-- 3. Rename any sequence/index names that referenced the old table names (optional, cosmetic)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'leagues_slug_idx'
  ) THEN
    ALTER INDEX public.leagues_slug_idx RENAME TO competitions_slug_idx;
  END IF;
END$$;

-- 4. Update RLS policies where table names are embedded in policy names
--    Drop old policies (if any were named after old table)
DROP POLICY IF EXISTS "Public read access on competitions" ON public.leagues;
DROP POLICY IF EXISTS "Public leagues are viewable by everyone" ON public.leagues;

-- Re-create public-read policy on the new leagues (brand) table
CREATE POLICY IF NOT EXISTS "Public read access on leagues"
  ON public.leagues FOR SELECT USING (true);

-- 5. Make sure RLS is enabled
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================
-- Verification (run separately after migration):
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('leagues', 'competitions')
--   ORDER BY table_name;
--
-- -- Should show: competitions, leagues
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'competitions'
--   ORDER BY ordinal_position;
--
-- -- Should include: league_id (PK), competition_id (FK → leagues.id), name, slug, season, ...
-- ============================================================
