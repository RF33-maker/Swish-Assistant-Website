-- Member account lifecycle tables
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- member_profiles   – display name + marketing consent flag per auth user
-- member_consents   – immutable audit log of every consent decision
-- data_export_requests – tracks portable-data requests
-- deletion_requests    – tracks account-deletion requests with a 30-day schedule
--
-- Design principles:
-- • member_consents is SERVICE-ROLE WRITE ONLY — no client can INSERT or UPDATE
--   consent rows. All writes are performed by server-side endpoints that own
--   the registration and consent-change flows.
-- • member_consents.user_id is nullable with ON DELETE SET NULL so that deleting
--   an auth.users row retains the anonymised consent audit trail (required for
--   legal compliance) rather than cascading the delete.
-- • member_profiles initial row is created by the /api/account/register server
--   endpoint (not by a trigger), so the server fully controls when profiles and
--   consents are provisioned.
-- • RLS: members can read their own rows and update their own profile; they
--   cannot INSERT/UPDATE consent records.

-- ── member_profiles ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_profiles (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name         TEXT,
  marketing_consent    BOOLEAN      NOT NULL DEFAULT FALSE,
  marketing_consent_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_profiles_select_own"  ON member_profiles;
DROP POLICY IF EXISTS "member_profiles_insert_own"  ON member_profiles;
DROP POLICY IF EXISTS "member_profiles_update_own"  ON member_profiles;

-- Members can read their own profile.
CREATE POLICY "member_profiles_select_own"
  ON member_profiles FOR SELECT
  USING (auth.uid() = id);

-- No client UPDATE policy.  All writes to member_profiles go through
-- server-side endpoints (/api/account/update-profile for display_name,
-- /api/account/update-marketing-consent for the marketing flag) that use
-- the service-role key.  This prevents direct client modification of
-- marketing_consent and its timestamp without the consent audit endpoint.

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_member_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_profiles_updated_at ON member_profiles;
CREATE TRIGGER trg_member_profiles_updated_at
  BEFORE UPDATE ON member_profiles
  FOR EACH ROW EXECUTE FUNCTION update_member_profiles_updated_at();

-- ── member_consents ────────────────────────────────────────────────────────
-- consent_type examples: 'terms_v1', 'privacy_v1', 'marketing'
-- accepted = FALSE records a withdrawal.
--
-- user_id is nullable with ON DELETE SET NULL so that deleting the auth user
-- retains this row as an anonymised audit record.  The column is indexed for
-- efficient membership lookups when user_id is not null.
CREATE TABLE IF NOT EXISTS member_consents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_type    TEXT        NOT NULL,
  accepted        BOOLEAN     NOT NULL DEFAULT TRUE,
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE member_consents ENABLE ROW LEVEL SECURITY;

-- Remove any previously created INSERT policy — consent writes are service-only.
DROP POLICY IF EXISTS "member_consents_select_own" ON member_consents;
DROP POLICY IF EXISTS "member_consents_insert_own" ON member_consents;

-- Members can read their own consent records (user_id IS NOT NULL required).
CREATE POLICY "member_consents_select_own"
  ON member_consents FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy for clients — all writes go through the
-- service-role key in server-side endpoints.

CREATE INDEX IF NOT EXISTS idx_member_consents_user_id ON member_consents (user_id);
CREATE INDEX IF NOT EXISTS idx_member_consents_type    ON member_consents (user_id, consent_type);

-- ── data_export_requests ───────────────────────────────────────────────────
-- status: 'pending' → 'processing' → 'ready' → 'delivered'
CREATE TABLE IF NOT EXISTS data_export_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','processing','ready','delivered')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ready_at     TIMESTAMPTZ,
  download_url TEXT,
  expires_at   TIMESTAMPTZ
);

ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_export_select_own"  ON data_export_requests;
DROP POLICY IF EXISTS "data_export_insert_own"  ON data_export_requests;

CREATE POLICY "data_export_select_own"
  ON data_export_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "data_export_insert_own"
  ON data_export_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_data_export_user_id ON data_export_requests (user_id);

-- ── deletion_requests ──────────────────────────────────────────────────────
-- status: 'pending' → 'confirmed' → 'processed'
-- scheduled_for defaults to 30 days after request (grace / retention period).
-- Admin deletion endpoint enforces scheduled_for <= NOW() before processing.
CREATE TABLE IF NOT EXISTS deletion_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','cancelled','processed')),
  reason         TEXT,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  processed_at   TIMESTAMPTZ
);

ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deletion_requests_select_own"  ON deletion_requests;
DROP POLICY IF EXISTS "deletion_requests_insert_own"  ON deletion_requests;
DROP POLICY IF EXISTS "deletion_requests_update_own"  ON deletion_requests;

CREATE POLICY "deletion_requests_select_own"
  ON deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "deletion_requests_insert_own"
  ON deletion_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Members may cancel their own pending request
CREATE POLICY "deletion_requests_update_own"
  ON deletion_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

CREATE INDEX IF NOT EXISTS idx_deletion_requests_user_id ON deletion_requests (user_id);

-- ── Drop any pre-existing trigger ─────────────────────────────────────────
-- Registration is now fully server-side (/api/account/register).
-- No trigger is needed; removing it prevents any residual unconditional
-- consent or profile writes on direct Supabase API sign-ups.
DROP TRIGGER IF EXISTS trg_handle_new_member_user ON auth.users;
DROP FUNCTION IF EXISTS handle_new_member_user();
