-- Account deletion must never delete league data, and must never fail on it.
--
-- Audit 2026-11-16 (foreign-key metadata only):
--   competitions.created_by  → auth.users  ON DELETE CASCADE    deleting an organiser deleted their competitions
--   player_stats.user_id     → auth.users  ON DELETE CASCADE    …and every stat row they uploaded
--   competitions.user_id     → auth.users  NO ACTION            deleting that user failed outright
--   scouting_reports.created_by → auth.users NO ACTION          deleting that user failed outright
--
-- The Privacy Policy says published game statistics are kept when an account
-- is deleted, and that a coach's scouting reports are deleted with it. So:
--   competitions.created_by, competitions.user_id, player_stats.user_id → SET NULL
--   scouting_reports.created_by → CASCADE (the coach's own saved reports)
--
-- coach_access is the payment record for coach plans. It's kept for six years
-- for tax, but no longer linked to a person once their account is deleted, so
-- user_id may now be null and account_deleted_at says when it was unlinked.
--
-- POST /api/admin/account/process-deletion also nulls the league links itself
-- before deleting the auth user, so deletion is safe even before this runs.
--
-- The new constraints are added NOT VALID so the ALTER only takes a brief lock:
-- every existing row already satisfied the old constraint on the same column,
-- so there is nothing to check. Run the VALIDATE statements at the bottom
-- afterwards, separately; they scan player_stats without blocking writes.

BEGIN;

-- ── competitions ───────────────────────────────────────────────────────────
ALTER TABLE public.competitions DROP CONSTRAINT IF EXISTS leagues_created_by_fkey;
ALTER TABLE public.competitions
  ADD CONSTRAINT leagues_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.competitions DROP CONSTRAINT IF EXISTS leagues_user_id_fkey;
ALTER TABLE public.competitions
  ADD CONSTRAINT leagues_user_id_fkey FOREIGN KEY (user_id)
  REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;

-- ── player_stats ───────────────────────────────────────────────────────────
ALTER TABLE public.player_stats DROP CONSTRAINT IF EXISTS player_stats_user_id_fkey;
ALTER TABLE public.player_stats
  ADD CONSTRAINT player_stats_user_id_fkey FOREIGN KEY (user_id)
  REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;

-- ── scouting_reports ───────────────────────────────────────────────────────
ALTER TABLE public.scouting_reports DROP CONSTRAINT IF EXISTS scouting_reports_created_by_fkey;
ALTER TABLE public.scouting_reports
  ADD CONSTRAINT scouting_reports_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

-- ── coach_access: payment record kept, person unlinked ─────────────────────
ALTER TABLE public.coach_access ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.coach_access ADD COLUMN IF NOT EXISTS account_deleted_at TIMESTAMPTZ;
COMMENT ON COLUMN public.coach_access.account_deleted_at IS
  'Set when the coach''s account was deleted: user_id and email were cleared, the payment references kept for six years (tax).';

-- ── data export reads Scorers Table organiser requests ─────────────────────
-- Every other capture table is readable by the service role; this one wasn't,
-- so a member's data export failed on it.
GRANT SELECT ON capture.organiser_access TO service_role;

COMMIT;

-- ── run separately, after the transaction above ────────────────────────────
-- player_stats (~190k rows) has no index on user_id, so every auth user delete
-- scans it for the foreign-key action. CONCURRENTLY can't run in a transaction.
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_player_stats_user_id
--   ON public.player_stats (user_id) WHERE user_id IS NOT NULL;
--
-- ALTER TABLE public.competitions     VALIDATE CONSTRAINT leagues_created_by_fkey;
-- ALTER TABLE public.competitions     VALIDATE CONSTRAINT leagues_user_id_fkey;
-- ALTER TABLE public.scouting_reports VALIDATE CONSTRAINT scouting_reports_created_by_fkey;
-- ALTER TABLE public.player_stats     VALIDATE CONSTRAINT player_stats_user_id_fkey;
