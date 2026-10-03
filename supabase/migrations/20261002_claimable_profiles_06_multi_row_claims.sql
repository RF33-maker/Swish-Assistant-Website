-- Claimable player profiles · 6 · one claim covers all of a person's rows
--
-- A real person usually has several players rows — one per competition they
-- appear in (e.g. 10 rows for one player across BCB, BCB Trophy, summer
-- leagues). A claim now covers a set of rows: one code, one approval, one
-- owner, one /p/ profile.
--
-- player_claim_rows  – which rows an active (pending/approved) claim covers.
--                      player_id is the primary key, so a row can belong to at
--                      most one active claim. Links are removed when a claim
--                      is rejected or revoked; player_claims.covered_player_ids
--                      keeps a snapshot for history.
-- The claim's player_id stays the *primary* row: it owns the profile_slug and
-- the player_owner_fields. Every covered row gets the verified DOB.
--
-- Signature changes (old versions dropped):
--   issue_claim_code(player_id, expires_in_days, also_player_ids[])
--   approve_claim(claim_id, verified_dob, player_ids[])
--   admin_assign_claim(player_id, email, dob, also_player_ids[])
--   admin_list_claims(status)            + covered_rows jsonb
--   admin_search_players(query, limit)   + games, covered via another row
-- New:
--   admin_claim_row_candidates(player_id, claim_id) – rows that look like the
--       same person, for the admin's tick-list
--   admin_set_claim_rows(claim_id, player_ids[])    – change coverage later
--   get_public_profile_stats(slug)                  – per-competition averages
--       across every covered row, for the /p/ page league filter

-- ── tables ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_claim_rows (
  player_id  UUID        PRIMARY KEY REFERENCES public.players(id) ON DELETE RESTRICT,
  claim_id   UUID        NOT NULL REFERENCES public.player_claims(id) ON DELETE CASCADE,
  is_primary BOOLEAN     NOT NULL DEFAULT false,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_player_claim_rows_claim ON public.player_claim_rows (claim_id);

ALTER TABLE public.player_claim_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_claim_rows FROM anon, authenticated;
-- No policies: only the SECURITY DEFINER functions below touch it.

ALTER TABLE public.claim_codes   ADD COLUMN IF NOT EXISTS covered_player_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE public.player_claims ADD COLUMN IF NOT EXISTS covered_player_ids UUID[] NOT NULL DEFAULT '{}';

-- Existing active claims (none at the time of writing) cover just their own row.
INSERT INTO public.player_claim_rows (player_id, claim_id, is_primary)
SELECT player_id, id, true FROM public.player_claims WHERE status IN ('pending','approved')
ON CONFLICT (player_id) DO NOTHING;
UPDATE public.player_claims SET covered_player_ids = ARRAY[player_id] WHERE covered_player_ids = '{}';

-- ── private helpers ────────────────────────────────────────────────────────

-- Primary first, then the extras, de-duplicated.
CREATE OR REPLACE FUNCTION private.claim_row_set(p_primary UUID, p_extra UUID[])
RETURNS UUID[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY[p_primary] || COALESCE(
    (SELECT pg_catalog.array_agg(DISTINCT x) FROM pg_catalog.unnest(p_extra) x WHERE x IS NOT NULL AND x <> p_primary),
    '{}'::UUID[]);
$$;

-- Raises unless every row exists and none belongs to another active claim.
CREATE OR REPLACE FUNCTION private.assert_rows_claimable(p_rows UUID[], p_except_claim UUID)
RETURNS VOID LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE v_found INT; v_taken TEXT;
BEGIN
  PERFORM 1 FROM public.players WHERE id = ANY (p_rows) FOR UPDATE;
  SELECT pg_catalog.count(*) INTO v_found FROM public.players WHERE id = ANY (p_rows);
  IF v_found <> pg_catalog.cardinality(p_rows) THEN
    RAISE EXCEPTION 'One or more player rows were not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT pg_catalog.string_agg(p.full_name || COALESCE(' (' || comp.name || ')', ''), ', ') INTO v_taken
    FROM public.player_claim_rows r
    JOIN public.players p ON p.id = r.player_id
    LEFT JOIN public.competitions comp ON comp.league_id = p.league_id
   WHERE r.player_id = ANY (p_rows) AND r.claim_id IS DISTINCT FROM p_except_claim;
  IF v_taken IS NOT NULL THEN
    RAISE EXCEPTION 'Already part of another claim: %', v_taken USING ERRCODE = '23505';
  END IF;
END;
$$;

-- Replace a claim's coverage with p_rows (primary always kept). Returns the
-- rows that were dropped so callers can clear their verification.
CREATE OR REPLACE FUNCTION private.set_claim_rows(p_claim_id UUID, p_rows UUID[])
RETURNS UUID[] LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE v_primary UUID; v_rows UUID[]; v_removed UUID[];
BEGIN
  SELECT player_id INTO v_primary FROM public.player_claims WHERE id = p_claim_id;
  v_rows := private.claim_row_set(v_primary, p_rows);
  PERFORM private.assert_rows_claimable(v_rows, p_claim_id);

  SELECT COALESCE(pg_catalog.array_agg(player_id), '{}') INTO v_removed
    FROM public.player_claim_rows WHERE claim_id = p_claim_id AND NOT (player_id = ANY (v_rows));
  DELETE FROM public.player_claim_rows WHERE claim_id = p_claim_id AND player_id = ANY (v_removed);
  INSERT INTO public.player_claim_rows (player_id, claim_id, is_primary)
  SELECT x, p_claim_id, x = v_primary FROM pg_catalog.unnest(v_rows) x
  ON CONFLICT (player_id) DO NOTHING;

  UPDATE public.player_claims SET covered_player_ids = v_rows WHERE id = p_claim_id;
  RETURN v_removed;
END;
$$;

-- Write the verified DOB to every covered row. The primary row also gets
-- (or keeps) the public profile_slug; other rows never get one.
CREATE OR REPLACE FUNCTION private.verify_claim_rows(p_claim_id UUID, p_dob DATE)
RETURNS VOID LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE v_primary UUID;
BEGIN
  SELECT player_id INTO v_primary FROM public.player_claims WHERE id = p_claim_id;
  PERFORM private.apply_verified_dob(v_primary, p_dob);
  UPDATE public.players
     SET date_of_birth   = p_dob,
         age_years       = pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, p_dob))::INT,
         dob_verified_at = pg_catalog.now(),
         dob_verified_by = auth.uid()
   WHERE id IN (SELECT player_id FROM public.player_claim_rows WHERE claim_id = p_claim_id AND player_id <> v_primary);
END;
$$;

-- Back to unverified (u18-level privacy) for the given rows; drops any slug.
CREATE OR REPLACE FUNCTION private.unverify_rows(p_rows UUID[])
RETURNS VOID LANGUAGE sql VOLATILE SET search_path = '' AS $$
  UPDATE public.players
     SET dob_verified_at = NULL, dob_verified_by = NULL, profile_slug = NULL
   WHERE id = ANY (p_rows);
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- ── issue_claim_code ───────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.issue_claim_code(UUID, INT);
CREATE FUNCTION public.issue_claim_code(
  p_player_id UUID, p_expires_in_days INT DEFAULT 14, p_also_player_ids UUID[] DEFAULT '{}')
RETURNS TABLE (claim_code_id UUID, code TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_rows UUID[];
  v_code TEXT;
  v_id UUID;
  v_expires TIMESTAMPTZ;
BEGIN
  PERFORM private.assert_admin();

  IF p_expires_in_days IS NULL OR p_expires_in_days < 1 OR p_expires_in_days > 90 THEN
    RAISE EXCEPTION 'Expiry must be between 1 and 90 days' USING ERRCODE = '22023';
  END IF;

  v_rows := private.claim_row_set(p_player_id, p_also_player_ids);
  PERFORM private.assert_rows_claimable(v_rows, NULL);

  -- Only one live code per row: cancel any unused code touching these rows.
  UPDATE public.claim_codes c
     SET voided_at = pg_catalog.now()
   WHERE c.used_at IS NULL AND c.voided_at IS NULL
     AND (c.player_id = ANY (v_rows) OR c.covered_player_ids && v_rows);

  v_code := private.generate_claim_code();
  v_expires := pg_catalog.now() + pg_catalog.make_interval(days => p_expires_in_days);

  INSERT INTO public.claim_codes (player_id, covered_player_ids, code_hash, issued_by, expires_at)
  VALUES (p_player_id, v_rows, private.hash_claim_code(v_code), auth.uid(), v_expires)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_code, v_expires;
END;
$$;

-- ── redeem_claim_code ──────────────────────────────────────────────────────
-- Same contract as before; the claim now covers every row on the code.
CREATE OR REPLACE FUNCTION public.redeem_claim_code(p_code TEXT, p_submitted_dob DATE)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code public.claim_codes%ROWTYPE;
  v_rows UUID[];
  v_claim_id UUID;
  v_failures INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'not_signed_in');
  END IF;

  SELECT pg_catalog.count(*) INTO v_failures
    FROM public.claim_redeem_attempts
   WHERE user_id = v_uid AND NOT success
     AND attempted_at > pg_catalog.now() - INTERVAL '1 hour';
  IF v_failures >= 5 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  BEGIN
    PERFORM private.assert_plausible_dob(p_submitted_dob);
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_dob');
  END;

  IF EXISTS (SELECT 1 FROM public.player_claims
              WHERE user_id = v_uid AND status = 'approved' AND claim_scope = 'self') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'already_owns_profile');
  END IF;
  IF EXISTS (SELECT 1 FROM public.player_claims WHERE user_id = v_uid AND status = 'pending') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'already_pending');
  END IF;

  SELECT * INTO v_code FROM public.claim_codes
   WHERE code_hash = private.hash_claim_code(p_code)
     AND used_at IS NULL AND voided_at IS NULL AND expires_at > pg_catalog.now()
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.claim_redeem_attempts (user_id, success) VALUES (v_uid, false);
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  END IF;

  v_rows := private.claim_row_set(v_code.player_id, v_code.covered_player_ids);

  IF EXISTS (SELECT 1 FROM public.player_claim_rows WHERE player_id = ANY (v_rows))
     OR EXISTS (SELECT 1 FROM public.player_claims
                 WHERE player_id = v_code.player_id AND status IN ('pending','approved')) THEN
    UPDATE public.claim_codes SET voided_at = pg_catalog.now() WHERE id = v_code.id;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'player_already_claimed');
  END IF;

  BEGIN
    INSERT INTO public.player_claims (player_id, user_id, status, method, claim_code_id, submitted_dob, covered_player_ids)
    VALUES (v_code.player_id, v_uid, 'pending', 'admin_code', v_code.id, p_submitted_dob, v_rows)
    RETURNING id INTO v_claim_id;

    INSERT INTO public.player_claim_rows (player_id, claim_id, is_primary)
    SELECT x, v_claim_id, x = v_code.player_id FROM pg_catalog.unnest(v_rows) x;
  EXCEPTION WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'player_already_claimed');
  END;

  UPDATE public.claim_codes SET used_at = pg_catalog.now(), used_by = v_uid WHERE id = v_code.id;
  INSERT INTO public.claim_redeem_attempts (user_id, success) VALUES (v_uid, true);

  RETURN pg_catalog.jsonb_build_object('ok', true, 'claim_id', v_claim_id, 'status', 'pending');
END;
$$;

-- ── approve_claim ──────────────────────────────────────────────────────────
-- p_player_ids: optionally change which rows the claim covers before
-- approving (primary is always kept). NULL keeps the rows from the code.
DROP FUNCTION IF EXISTS public.approve_claim(UUID, DATE);
CREATE FUNCTION public.approve_claim(p_claim_id UUID, p_verified_dob DATE, p_player_ids UUID[] DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.player_claims%ROWTYPE;
BEGIN
  PERFORM private.assert_admin();
  PERFORM private.assert_plausible_dob(p_verified_dob);

  SELECT * INTO v_claim FROM public.player_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_claim.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending claims can be approved (this one is %)', v_claim.status USING ERRCODE = '22023';
  END IF;

  IF p_player_ids IS NOT NULL THEN
    PERFORM private.set_claim_rows(p_claim_id, p_player_ids);
  END IF;

  BEGIN
    UPDATE public.player_claims
       SET status = 'approved', verified_dob = p_verified_dob,
           approved_by = auth.uid(), approved_at = pg_catalog.now()
     WHERE id = p_claim_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This account already owns an approved profile' USING ERRCODE = '23505';
  END;

  PERFORM private.verify_claim_rows(p_claim_id, p_verified_dob);
END;
$$;

-- ── reject_claim ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_claim(p_claim_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_admin();

  UPDATE public.player_claims
     SET status = 'rejected', rejected_by = auth.uid(), rejected_at = pg_catalog.now(),
         rejection_reason = NULLIF(pg_catalog.btrim(p_reason), '')
   WHERE id = p_claim_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending claim with that id' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.player_claim_rows WHERE claim_id = p_claim_id;
END;
$$;

-- ── revoke_claim ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_claim(p_claim_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows UUID[];
BEGIN
  PERFORM private.assert_admin();

  UPDATE public.player_claims
     SET status = 'revoked', revoked_by = auth.uid(), revoked_at = pg_catalog.now()
   WHERE id = p_claim_id AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No approved claim with that id' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(player_id), '{}') INTO v_rows
    FROM public.player_claim_rows WHERE claim_id = p_claim_id;
  PERFORM private.unverify_rows(v_rows);
  DELETE FROM public.player_claim_rows WHERE claim_id = p_claim_id;
END;
$$;

-- ── admin_assign_claim ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_assign_claim(UUID, TEXT, DATE);
CREATE FUNCTION public.admin_assign_claim(
  p_player_id UUID, p_user_email TEXT, p_verified_dob DATE, p_also_player_ids UUID[] DEFAULT '{}')
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_claim_id UUID;
  v_rows UUID[];
BEGIN
  PERFORM private.assert_admin();
  PERFORM private.assert_plausible_dob(p_verified_dob);

  SELECT id INTO v_user_id FROM auth.users
   WHERE pg_catalog.lower(email) = pg_catalog.lower(pg_catalog.btrim(p_user_email));
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No account with that email — the player needs to sign up first' USING ERRCODE = 'P0002';
  END IF;

  v_rows := private.claim_row_set(p_player_id, p_also_player_ids);
  PERFORM private.assert_rows_claimable(v_rows, NULL);

  BEGIN
    INSERT INTO public.player_claims
      (player_id, user_id, status, method, verified_dob, approved_by, approved_at, covered_player_ids)
    VALUES
      (p_player_id, v_user_id, 'approved', 'admin_manual', p_verified_dob, auth.uid(), pg_catalog.now(), v_rows)
    RETURNING id INTO v_claim_id;

    INSERT INTO public.player_claim_rows (player_id, claim_id, is_primary)
    SELECT x, v_claim_id, x = p_player_id FROM pg_catalog.unnest(v_rows) x;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A row already has an active claim, or this account already owns a profile' USING ERRCODE = '23505';
  END;

  UPDATE public.claim_codes c
     SET voided_at = pg_catalog.now()
   WHERE c.used_at IS NULL AND c.voided_at IS NULL
     AND (c.player_id = ANY (v_rows) OR c.covered_player_ids && v_rows);

  PERFORM private.verify_claim_rows(v_claim_id, p_verified_dob);
  RETURN v_claim_id;
END;
$$;

-- ── admin_set_claim_rows ───────────────────────────────────────────────────
-- Change which rows a pending or approved claim covers (e.g. a new season
-- created a new row). On an approved claim, added rows get the verified DOB
-- and removed rows go back to unverified.
CREATE OR REPLACE FUNCTION public.admin_set_claim_rows(p_claim_id UUID, p_player_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.player_claims%ROWTYPE;
  v_removed UUID[];
BEGIN
  PERFORM private.assert_admin();

  SELECT * INTO v_claim FROM public.player_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND OR v_claim.status NOT IN ('pending','approved') THEN
    RAISE EXCEPTION 'No pending or approved claim with that id' USING ERRCODE = 'P0002';
  END IF;

  v_removed := private.set_claim_rows(p_claim_id, p_player_ids);

  IF v_claim.status = 'approved' THEN
    PERFORM private.verify_claim_rows(p_claim_id, v_claim.verified_dob);
    PERFORM private.unverify_rows(v_removed);
  END IF;
END;
$$;

-- ── admin_claim_row_candidates ─────────────────────────────────────────────
-- Rows that look like the same person as p_player_id, for the admin's
-- tick-list. match_kind:
--   primary  – the row itself
--   covered  – already covered by p_claim_id
--   exact    – same full name (pre-ticked in the UI)
--   variant  – same surname and first initial, e.g. "N. Ladjimi" (not ticked)
-- available = false when the row belongs to a different active claim.
CREATE OR REPLACE FUNCTION public.admin_claim_row_candidates(p_player_id UUID, p_claim_id UUID DEFAULT NULL)
RETURNS TABLE (
  player_id UUID,
  full_name TEXT,
  team_name TEXT,
  competition_name TEXT,
  games INT,
  match_kind TEXT,
  available BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_name TEXT;
  v_surname TEXT;
  v_initial TEXT;
BEGIN
  PERFORM private.assert_admin();

  SELECT pg_catalog.lower(pg_catalog.btrim(p.full_name)),
         pg_catalog.lower(COALESCE(NULLIF(pg_catalog.btrim(p.familyname), ''),
                                   pg_catalog.regexp_replace(pg_catalog.btrim(p.full_name), '^.*\s', ''))),
         pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(p.full_name), 1))
    INTO v_name, v_surname, v_initial
    FROM public.players p WHERE p.id = p_player_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Player not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH cand AS (
    SELECT p.id, p.full_name, p.team_name, p.league_id,
           CASE
             WHEN p.id = p_player_id THEN 'primary'
             WHEN p_claim_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.player_claim_rows r WHERE r.player_id = p.id AND r.claim_id = p_claim_id) THEN 'covered'
             WHEN pg_catalog.lower(pg_catalog.btrim(p.full_name)) = v_name THEN 'exact'
             ELSE 'variant'
           END AS kind
      FROM public.players p
     WHERE p.id = p_player_id
        OR (p_claim_id IS NOT NULL AND p.id IN (SELECT r.player_id FROM public.player_claim_rows r WHERE r.claim_id = p_claim_id))
        OR (pg_catalog.lower(COALESCE(NULLIF(pg_catalog.btrim(p.familyname), ''),
                                      pg_catalog.regexp_replace(pg_catalog.btrim(p.full_name), '^.*\s', ''))) = v_surname
            AND pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(p.full_name), 1)) = v_initial)
  )
  SELECT c.id, c.full_name, c.team_name, comp.name,
         (SELECT pg_catalog.count(*)::INT FROM public.player_stats s WHERE s.player_id = c.id),
         c.kind,
         NOT EXISTS (SELECT 1 FROM public.player_claim_rows r
                      WHERE r.player_id = c.id AND r.claim_id IS DISTINCT FROM p_claim_id)
    FROM cand c
    LEFT JOIN public.competitions comp ON comp.league_id = c.league_id
   ORDER BY CASE c.kind WHEN 'primary' THEN 0 WHEN 'covered' THEN 1 WHEN 'exact' THEN 2 ELSE 3 END,
            comp.name
   LIMIT 60;
END;
$$;

-- ── admin_list_claims ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_list_claims(TEXT);
CREATE FUNCTION public.admin_list_claims(p_status TEXT DEFAULT NULL)
RETURNS TABLE (
  claim_id UUID,
  status TEXT,
  method TEXT,
  player_id UUID,
  player_name TEXT,
  team_name TEXT,
  competition_name TEXT,
  user_id UUID,
  user_email TEXT,
  submitted_dob DATE,
  verified_dob DATE,
  existing_dob DATE,
  existing_dob_verified BOOLEAN,
  submitted_dob_tier TEXT,
  existing_dob_tier TEXT,
  dob_mismatch BOOLEAN,
  tier_change BOOLEAN,
  profile_slug TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  covered_rows JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  PERFORM private.assert_admin();

  RETURN QUERY
  SELECT c.id, c.status, c.method, p.id, p.full_name, p.team_name, comp.name,
         c.user_id, u.email::TEXT,
         c.submitted_dob, c.verified_dob, p.date_of_birth, p.dob_verified_at IS NOT NULL,
         private.dob_tier(c.submitted_dob), private.dob_tier(p.date_of_birth),
         -- Mismatch / tier change against any DOB already on a covered row.
         EXISTS (SELECT 1 FROM public.players x
                  WHERE x.id = ANY (private.claim_row_set(c.player_id, c.covered_player_ids))
                    AND x.date_of_birth IS NOT NULL AND c.submitted_dob IS NOT NULL
                    AND x.date_of_birth <> c.submitted_dob),
         EXISTS (SELECT 1 FROM public.players x
                  WHERE x.id = ANY (private.claim_row_set(c.player_id, c.covered_player_ids))
                    AND x.date_of_birth IS NOT NULL AND c.submitted_dob IS NOT NULL
                    AND private.dob_tier(x.date_of_birth) <> private.dob_tier(c.submitted_dob)),
         p.profile_slug, c.rejection_reason,
         c.created_at, c.approved_at, c.rejected_at, c.revoked_at,
         (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                    'player_id', x.id, 'full_name', x.full_name, 'team_name', x.team_name,
                    'competition_name', xc.name, 'is_primary', x.id = c.player_id,
                    'games', (SELECT pg_catalog.count(*) FROM public.player_stats s WHERE s.player_id = x.id))
                  ORDER BY (x.id = c.player_id) DESC, xc.name), '[]'::JSONB)
            FROM public.players x
            LEFT JOIN public.competitions xc ON xc.league_id = x.league_id
           WHERE x.id = ANY (private.claim_row_set(c.player_id, c.covered_player_ids)))
    FROM public.player_claims c
    JOIN public.players p ON p.id = c.player_id
    LEFT JOIN public.competitions comp ON comp.league_id = p.league_id
    LEFT JOIN auth.users u ON u.id = c.user_id
   WHERE p_status IS NULL OR c.status = p_status
   ORDER BY (c.status = 'pending') DESC, c.created_at DESC;
END;
$$;

-- ── admin_search_players ───────────────────────────────────────────────────
-- claim_status now reflects a row covered by any active claim, not only the
-- primary row. games helps pick the main row when a player has several.
DROP FUNCTION IF EXISTS public.admin_search_players(TEXT, INT);
CREATE FUNCTION public.admin_search_players(p_query TEXT, p_limit INT DEFAULT 25)
RETURNS TABLE (
  player_id UUID,
  full_name TEXT,
  team_name TEXT,
  competition_name TEXT,
  slug TEXT,
  games INT,
  date_of_birth DATE,
  dob_verified BOOLEAN,
  tier TEXT,
  claim_status TEXT,
  active_claim_id UUID,
  is_primary_row BOOLEAN,
  owner_email TEXT,
  live_code_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  PERFORM private.assert_admin();

  IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_query, ''))) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.team_name, comp.name, p.slug,
         (SELECT pg_catalog.count(*)::INT FROM public.player_stats s WHERE s.player_id = p.id),
         p.date_of_birth, p.dob_verified_at IS NOT NULL,
         private.player_tier(p.date_of_birth, p.dob_verified_at),
         COALESCE(c.status, 'unclaimed'), c.id, COALESCE(r.is_primary, false), u.email::TEXT,
         (SELECT pg_catalog.max(cc.expires_at) FROM public.claim_codes cc
           WHERE (cc.player_id = p.id OR p.id = ANY (cc.covered_player_ids))
             AND cc.used_at IS NULL AND cc.voided_at IS NULL AND cc.expires_at > pg_catalog.now())
    FROM public.players p
    LEFT JOIN public.competitions comp ON comp.league_id = p.league_id
    LEFT JOIN public.player_claim_rows r ON r.player_id = p.id
    LEFT JOIN public.player_claims c ON c.id = r.claim_id
    LEFT JOIN auth.users u ON u.id = c.user_id
   WHERE p.full_name ILIKE '%' || pg_catalog.btrim(p_query) || '%'
   ORDER BY p.full_name, 6 DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
END;
$$;

-- ── public reads ───────────────────────────────────────────────────────────
-- Every covered row reports is_claimed and (for verified adults) links to the
-- one /p/ profile. Instagram comes from the profile's owner fields.
CREATE OR REPLACE FUNCTION public.get_player_public_details(p_player_id UUID)
RETURNS TABLE (
  player_id UUID,
  is_restricted BOOLEAN,
  is_claimed BOOLEAN,
  date_of_birth DATE,
  age_years INT,
  instagram_handle TEXT,
  profile_slug TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH p AS (
    SELECT pl.*, private.player_tier(pl.date_of_birth, pl.dob_verified_at) = 'adult' AS adult
      FROM public.players pl
     WHERE pl.id = p_player_id
       AND public.is_league_publicly_visible(pl.league_id)
  ),
  claim AS (
    SELECT c.player_id AS primary_id, c.status
      FROM public.player_claim_rows r
      JOIN public.player_claims c ON c.id = r.claim_id
     WHERE r.player_id = p_player_id
  )
  SELECT p.id,
         NOT p.adult,
         EXISTS (SELECT 1 FROM claim),
         CASE WHEN p.adult THEN p.date_of_birth END,
         CASE WHEN p.adult THEN pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, p.date_of_birth))::INT END,
         CASE WHEN p.adult THEN COALESCE(
           (SELECT o.instagram_handle FROM public.player_owner_fields o
             WHERE o.player_id = (SELECT primary_id FROM claim WHERE status = 'approved')),
           p.social_instagram) END,
         CASE WHEN p.adult THEN
           (SELECT pp.profile_slug FROM public.players pp
             WHERE pp.id = (SELECT primary_id FROM claim WHERE status = 'approved')) END
    FROM p;
$$;

-- Per-competition averages across every row the profile covers. Restricted
-- (u18/unverified) profiles get the same numbers — stats are already public —
-- but nothing here identifies the player beyond the slug.
CREATE OR REPLACE FUNCTION public.get_public_profile_stats(p_slug TEXT)
RETURNS TABLE (
  league_id UUID,
  competition_name TEXT,
  season TEXT,
  team_name TEXT,
  games INT,
  minutes_pg NUMERIC,
  points_pg NUMERIC,
  rebounds_pg NUMERIC,
  assists_pg NUMERIC,
  steals_pg NUMERIC,
  blocks_pg NUMERIC,
  turnovers_pg NUMERIC,
  fg_pct NUMERIC,
  three_pct NUMERIC,
  ft_pct NUMERIC,
  last_played TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH prof AS (
    SELECT c.id AS claim_id
      FROM public.players pl
      JOIN public.player_claims c ON c.player_id = pl.id AND c.status = 'approved'
     WHERE pl.profile_slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
  ),
  s AS (
    SELECT st.*,
           CASE WHEN st.sminutes ~ '^\d+:\d+$'
                THEN pg_catalog.split_part(st.sminutes, ':', 1)::NUMERIC + pg_catalog.split_part(st.sminutes, ':', 2)::NUMERIC / 60
                WHEN st.sminutes ~ '^\d+(\.\d+)?$' THEN st.sminutes::NUMERIC
           END AS mins
      FROM public.player_stats st
     WHERE st.player_id IN (SELECT r.player_id FROM public.player_claim_rows r WHERE r.claim_id = (SELECT claim_id FROM prof))
       AND public.is_league_publicly_visible(st.league_id)
  )
  SELECT s.league_id, comp.name, comp.season,
         (pg_catalog.array_agg(s.team_name ORDER BY s.created_at DESC))[1],
         pg_catalog.count(*)::INT,
         pg_catalog.round(pg_catalog.avg(s.mins), 1),
         pg_catalog.round(pg_catalog.avg(s.spoints), 1),
         pg_catalog.round(pg_catalog.avg(s.sreboundstotal), 1),
         pg_catalog.round(pg_catalog.avg(s.sassists), 1),
         pg_catalog.round(pg_catalog.avg(s.ssteals), 1),
         pg_catalog.round(pg_catalog.avg(s.sblocks), 1),
         pg_catalog.round(pg_catalog.avg(s.sturnovers), 1),
         pg_catalog.round(100.0 * pg_catalog.sum(s.sfieldgoalsmade) / NULLIF(pg_catalog.sum(s.sfieldgoalsattempted), 0), 1),
         pg_catalog.round(100.0 * pg_catalog.sum(s.sthreepointersmade) / NULLIF(pg_catalog.sum(s.sthreepointersattempted), 0), 1),
         pg_catalog.round(100.0 * pg_catalog.sum(s.sfreethrowsmade) / NULLIF(pg_catalog.sum(s.sfreethrowsattempted), 0), 1),
         pg_catalog.max(s.created_at)
    FROM s
    LEFT JOIN public.competitions comp ON comp.league_id = s.league_id
   GROUP BY s.league_id, comp.name, comp.season
   ORDER BY pg_catalog.max(s.created_at) DESC;
$$;

-- get_my_claim gains the number of rows the claim covers.
DROP FUNCTION IF EXISTS public.get_my_claim();
CREATE FUNCTION public.get_my_claim()
RETURNS TABLE (
  claim_id UUID,
  status TEXT,
  player_id UUID,
  player_name TEXT,
  team_name TEXT,
  submitted_dob DATE,
  rejection_reason TEXT,
  profile_slug TEXT,
  created_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  covered_rows INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.status, c.player_id, p.full_name, p.team_name,
         c.submitted_dob, c.rejection_reason,
         CASE WHEN c.status = 'approved' THEN p.profile_slug END,
         c.created_at, c.approved_at,
         pg_catalog.cardinality(private.claim_row_set(c.player_id, c.covered_player_ids))
    FROM public.player_claims c
    JOIN public.players p ON p.id = c.player_id
   WHERE c.user_id = (SELECT auth.uid())
   ORDER BY CASE c.status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
            c.created_at DESC
   LIMIT 1;
$$;

-- ── grants ─────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.issue_claim_code(UUID, INT, UUID[])               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_claim(UUID, DATE, UUID[])                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_assign_claim(UUID, TEXT, DATE, UUID[])      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_claim_rows(UUID, UUID[])                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_claim_row_candidates(UUID, UUID)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_claims(TEXT)                           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_search_players(TEXT, INT)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_claim()                                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_profile_stats(TEXT)                    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.issue_claim_code(UUID, INT, UUID[])            TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_claim(UUID, DATE, UUID[])              TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_claim(UUID, TEXT, DATE, UUID[])   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_claim_rows(UUID, UUID[])             TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_claim_row_candidates(UUID, UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_claims(TEXT)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_players(TEXT, INT)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_claim()                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile_stats(TEXT)                 TO anon, authenticated;
