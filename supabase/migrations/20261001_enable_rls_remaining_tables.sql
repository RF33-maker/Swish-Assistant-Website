-- Enable RLS on the 12 public tables that had it switched off
--
-- Before this migration, anyone (signed in or not) could read, insert,
-- update, delete and TRUNCATE every one of these tables through the API.
--
-- Who actually uses them (code search + API logs, 2026-09-27/28 game day):
--   • Writes: only the Render importer (python-httpx) and the site's server,
--     both with the service-role key, which bypasses RLS — unaffected.
--   • Browser reads: only the Coaches Hub Advanced Insights tab
--     (lineup_stints, player_on_court_stints, player_lineup_stints_v1,
--     filtered by league_id).
--   • Definer views built on them (player_on_off, player_on_off_impact_clean_v1)
--     run as their owner and are unaffected.
--
-- Policies follow the existing game-data pattern (players, shot_chart,
-- live_events): public read for publicly visible leagues, admins read all,
-- no browser writes.

-- ── helper ─────────────────────────────────────────────────────────────────
-- The visible-league list, computed once per query. Policies use
-- `league_id IN (SELECT …)` so Postgres builds the list once instead of
-- calling is_league_publicly_visible() for every row (player_on_court_stints
-- has ~200k rows). Only reveals which leagues are public, which
-- is_league_publicly_visible() already does.
CREATE OR REPLACE FUNCTION public.publicly_visible_league_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.league_id FROM public.competitions c
   WHERE public.is_league_publicly_visible(c.league_id);
$$;

REVOKE ALL ON FUNCTION public.publicly_visible_league_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publicly_visible_league_ids() TO anon, authenticated, service_role;

-- ── 1. Game data with league_id: public read for visible leagues ───────────
ALTER TABLE public.game_rosters             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineup_stints            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_on_court_stints   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_lineup_stints_v1  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineup_stints_context_v1 ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  public.game_rosters, public.lineup_stints, public.player_on_court_stints,
  public.player_lineup_stints_v1, public.lineup_stints_context_v1
FROM anon, authenticated;

GRANT SELECT ON
  public.game_rosters, public.lineup_stints, public.player_on_court_stints,
  public.player_lineup_stints_v1, public.lineup_stints_context_v1
TO anon, authenticated;

CREATE POLICY "game_rosters_public_select" ON public.game_rosters
  FOR SELECT TO anon, authenticated
  USING (league_id IN (SELECT public.publicly_visible_league_ids()));
CREATE POLICY "game_rosters_admin_select" ON public.game_rosters
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_admin()));

CREATE POLICY "lineup_stints_public_select" ON public.lineup_stints
  FOR SELECT TO anon, authenticated
  USING (league_id IN (SELECT public.publicly_visible_league_ids()));
CREATE POLICY "lineup_stints_admin_select" ON public.lineup_stints
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_admin()));

CREATE POLICY "player_on_court_stints_public_select" ON public.player_on_court_stints
  FOR SELECT TO anon, authenticated
  USING (league_id IN (SELECT public.publicly_visible_league_ids()));
CREATE POLICY "player_on_court_stints_admin_select" ON public.player_on_court_stints
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_admin()));

CREATE POLICY "player_lineup_stints_v1_public_select" ON public.player_lineup_stints_v1
  FOR SELECT TO anon, authenticated
  USING (league_id IN (SELECT public.publicly_visible_league_ids()));
CREATE POLICY "player_lineup_stints_v1_admin_select" ON public.player_lineup_stints_v1
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_admin()));

CREATE POLICY "lineup_stints_context_v1_public_select" ON public.lineup_stints_context_v1
  FOR SELECT TO anon, authenticated
  USING (league_id IN (SELECT public.publicly_visible_league_ids()));
CREATE POLICY "lineup_stints_context_v1_admin_select" ON public.lineup_stints_context_v1
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_admin()));

-- ── 2. Empty, unused legacy tables: no browser access ──────────────────────
-- lineup_stats, player_plus_minus, rotations_summary have 0 rows and nothing
-- reads or writes them. RLS on with no policies = service role only.
ALTER TABLE public.lineup_stats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_plus_minus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotations_summary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lineup_stats, public.player_plus_minus, public.rotations_summary FROM anon, authenticated;

-- ── 3. Internal / personal data: service role only ─────────────────────────
-- newsletter_signups – email addresses (personal data); nothing in the app
--                      reads or writes it from the browser.
-- game_polls          – importer polling telemetry.
-- document_chunks     – AI document embeddings; match_documents() is
--                      SECURITY INVOKER, so it now returns nothing to browsers.
ALTER TABLE public.newsletter_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_polls         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newsletter_signups, public.game_polls, public.document_chunks FROM anon, authenticated;

-- ── 4. scouting_reports: each user sees and edits only their own ───────────
-- Written from the Coaches Hub scouting editor. created_by defaults to the
-- caller so inserts are attributed automatically; admins can see all.
ALTER TABLE public.scouting_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouting_reports ALTER COLUMN created_by SET DEFAULT auth.uid();

REVOKE ALL ON public.scouting_reports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scouting_reports TO authenticated;

CREATE POLICY "scouting_reports_select_own" ON public.scouting_reports
  FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()) OR (SELECT public.is_app_admin()));
CREATE POLICY "scouting_reports_insert_own" ON public.scouting_reports
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY "scouting_reports_update_own" ON public.scouting_reports
  FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY "scouting_reports_delete_own" ON public.scouting_reports
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()) OR (SELECT public.is_app_admin()));
