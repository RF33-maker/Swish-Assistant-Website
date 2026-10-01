-- Claimable player profiles · 2/5 · claim tables
--
-- player_claims          – who owns (or is trying to own) which players row.
-- claim_codes            – single-use codes issued by an admin; stored hashed.
-- claim_redeem_attempts  – per-user log used to rate-limit code redemption.
-- players.dob_verified_* – set when an admin approves a claim's DOB.
-- players.profile_slug   – unique slug for /p/:slug, set on approval.
--
-- Clients never write these tables. All changes go through the SECURITY
-- DEFINER RPCs in migration 3. Signed-in users can read their own claims;
-- admins can read all claims. claim_codes and claim_redeem_attempts have no
-- client access at all.
--
-- Deleting an auth user cascades their player_claims rows, which releases the
-- profile (fits the deletion_requests flow: the admin deletion endpoint
-- deletes the auth user last). Audit columns (issued_by, approved_by, …) are
-- ON DELETE SET NULL so history survives.
--
-- player_id is ON DELETE RESTRICT: a claimed player can't be silently deleted
-- (e.g. by a merge); the claim must be revoked first.
--
-- claim_scope is 'self' for now. Parent accounts / team_staff can be added
-- later by extending its CHECK; the one-approved-profile-per-user index only
-- applies to 'self' claims.

-- ── players: verification + public slug ────────────────────────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS dob_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dob_verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_slug    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS players_profile_slug_key
  ON public.players (profile_slug) WHERE profile_slug IS NOT NULL;

-- ── claim_codes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.claim_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  code_hash  BYTEA       NOT NULL UNIQUE,  -- sha256 of the normalised code
  issued_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  used_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at  TIMESTAMPTZ  -- set when a newer code is issued for the same player
);

CREATE INDEX IF NOT EXISTS idx_claim_codes_player_id ON public.claim_codes (player_id);

-- ── player_claims ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_claims (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID        NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','revoked')),
  method           TEXT        NOT NULL
                   CHECK (method IN ('admin_code','admin_manual')),
  claim_scope      TEXT        NOT NULL DEFAULT 'self'
                   CHECK (claim_scope IN ('self')),
  claim_code_id    UUID        REFERENCES public.claim_codes(id) ON DELETE SET NULL,
  submitted_dob    DATE,
  verified_dob     DATE,
  approved_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  rejected_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  revoked_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active (pending or approved) claim per player.
CREATE UNIQUE INDEX IF NOT EXISTS player_claims_one_active_per_player
  ON public.player_claims (player_id) WHERE status IN ('pending','approved');

-- One approved self-profile per account (relax later for parent scopes).
CREATE UNIQUE INDEX IF NOT EXISTS player_claims_one_approved_self_per_user
  ON public.player_claims (user_id) WHERE status = 'approved' AND claim_scope = 'self';

-- One pending claim per account at a time.
CREATE UNIQUE INDEX IF NOT EXISTS player_claims_one_pending_per_user
  ON public.player_claims (user_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_player_claims_user_id ON public.player_claims (user_id);
CREATE INDEX IF NOT EXISTS idx_player_claims_status  ON public.player_claims (status);

CREATE OR REPLACE FUNCTION public.update_player_claims_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_claims_updated_at ON public.player_claims;
CREATE TRIGGER trg_player_claims_updated_at
  BEFORE UPDATE ON public.player_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_player_claims_updated_at();

-- ── claim_redeem_attempts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.claim_redeem_attempts (
  id           BIGSERIAL   PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success      BOOLEAN     NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claim_redeem_attempts_user_time
  ON public.claim_redeem_attempts (user_id, attempted_at DESC);

-- ── RLS + grants ───────────────────────────────────────────────────────────
ALTER TABLE public.claim_codes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_claims         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_redeem_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.claim_codes           FROM anon, authenticated;
REVOKE ALL ON public.player_claims         FROM anon, authenticated;
REVOKE ALL ON public.claim_redeem_attempts FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.claim_redeem_attempts_id_seq FROM anon, authenticated;

GRANT SELECT ON public.player_claims TO authenticated;

DROP POLICY IF EXISTS "player_claims_select_own_or_admin" ON public.player_claims;
CREATE POLICY "player_claims_select_own_or_admin"
  ON public.player_claims FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_app_admin()));

-- claim_codes / claim_redeem_attempts: RLS on, no policies, no grants →
-- only SECURITY DEFINER functions and the service role can touch them.
