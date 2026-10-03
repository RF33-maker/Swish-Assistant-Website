-- Claimable player profiles · 3/5 · claim RPCs + age tier
--
-- Every claim action goes through a SECURITY DEFINER function with an empty
-- search_path. Identity always comes from auth.uid(); the only client input
-- trusted for *which player* is the code itself (redeem) or an admin's choice.
--
--   get_player_tier(player_id)                          any signed-in user
--   issue_claim_code(player_id, expires_in_days=14)     admin
--   redeem_claim_code(code, submitted_dob)              any signed-in user
--   approve_claim(claim_id, verified_dob)               admin
--   reject_claim(claim_id, reason)                      admin
--   revoke_claim(claim_id)                              admin
--   admin_assign_claim(player_id, user_email, dob)      admin
--   admin_set_player_dob(player_id, dob, verified)      admin
--   admin_list_claims(status)                           admin
--   admin_search_players(query, limit)                  admin
--
-- Internal helpers live in the `private` schema, which the API roles can't
-- reach, so PostgREST never exposes them.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- ── private helpers ────────────────────────────────────────────────────────

-- Tier from a DOB alone (ignores verification). NULL when dob is NULL.
CREATE OR REPLACE FUNCTION private.dob_tier(p_dob DATE)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_dob IS NULL THEN NULL
    WHEN pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, p_dob)) >= 18 THEN 'adult'
    ELSE 'u18'
  END;
$$;

-- Tier used for privacy: 'adult' only for a verified DOB that is 18+.
CREATE OR REPLACE FUNCTION private.player_tier(p_dob DATE, p_verified_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_dob IS NULL OR p_verified_at IS NULL THEN 'unverified'
    ELSE private.dob_tier(p_dob)
  END;
$$;

CREATE OR REPLACE FUNCTION private.normalize_claim_code(p_code TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.regexp_replace(pg_catalog.upper(COALESCE(p_code, '')), '[^A-Z0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION private.hash_claim_code(p_code TEXT)
RETURNS BYTEA LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT extensions.digest(pg_catalog.convert_to(private.normalize_claim_code(p_code), 'UTF8'), 'sha256');
$$;

-- 10 chars from a 31-char alphabet (no 0/O, 1/I/L), ~49 bits. Rejection
-- sampling avoids modulo bias.
CREATE OR REPLACE FUNCTION private.generate_claim_code()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out_code TEXT := '';
  b INT;
BEGIN
  WHILE pg_catalog.length(out_code) < 10 LOOP
    b := pg_catalog.get_byte(extensions.gen_random_bytes(1), 0);
    IF b < 248 THEN  -- 248 = 8 * 31
      out_code := out_code || pg_catalog.substr(alphabet, (b % 31) + 1, 1);
    END IF;
  END LOOP;
  RETURN pg_catalog.substr(out_code, 1, 4) || '-' || pg_catalog.substr(out_code, 5, 4) || '-' || pg_catalog.substr(out_code, 9, 2);
END;
$$;

CREATE OR REPLACE FUNCTION private.slugify(p_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.btrim(
    pg_catalog.regexp_replace(pg_catalog.lower(COALESCE(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-');
$$;

CREATE OR REPLACE FUNCTION private.assert_plausible_dob(p_dob DATE)
RETURNS VOID LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF p_dob IS NULL
     OR p_dob < DATE '1920-01-01'
     OR p_dob > CURRENT_DATE - INTERVAL '5 years' THEN
    RAISE EXCEPTION 'Date of birth is not valid' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.assert_admin()
RETURNS VOID LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Unique public slug. Verified adults get a readable name slug; everyone else
-- gets first name + surname initial + random suffix, so the URL never carries
-- a minor's full name and can't be guessed.
CREATE OR REPLACE FUNCTION private.make_profile_slug(p_player_id UUID)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  p RECORD;
  first_part TEXT;
  last_part TEXT;
  base TEXT;
  candidate TEXT;
  n INT := 1;
BEGIN
  SELECT firstname, familyname, full_name, date_of_birth, dob_verified_at
    INTO p FROM public.players WHERE id = p_player_id;

  first_part := COALESCE(NULLIF(pg_catalog.btrim(p.firstname), ''), pg_catalog.split_part(pg_catalog.btrim(p.full_name), ' ', 1));
  last_part  := COALESCE(NULLIF(pg_catalog.btrim(p.familyname), ''),
                         pg_catalog.regexp_replace(pg_catalog.btrim(p.full_name), '^\S+\s*', ''));

  IF private.player_tier(p.date_of_birth, p.dob_verified_at) = 'adult' THEN
    base := private.slugify(first_part || ' ' || last_part);
    IF base = '' THEN base := 'player'; END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.players WHERE profile_slug = candidate AND id <> p_player_id) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
  ELSE
    base := private.slugify(first_part || ' ' || pg_catalog.left(last_part, 1));
    IF base = '' THEN base := 'player'; END IF;
    LOOP
      candidate := base || '-' || pg_catalog.lower(pg_catalog.substr(private.normalize_claim_code(private.generate_claim_code()), 1, 5));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.players WHERE profile_slug = candidate);
    END LOOP;
  END IF;

  RETURN candidate;
END;
$$;

-- Side effects of approving a claim: write verified DOB, stamp verification,
-- and generate the public slug. An existing slug is kept unless the change
-- moves the player across the adult / non-adult line, so shared links don't
-- break on a same-tier DOB correction.
CREATE OR REPLACE FUNCTION private.apply_verified_dob(p_player_id UUID, p_dob DATE)
RETURNS VOID LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_old_adult BOOLEAN;
  v_old_slug TEXT;
BEGIN
  SELECT private.player_tier(date_of_birth, dob_verified_at) = 'adult', profile_slug
    INTO v_old_adult, v_old_slug
    FROM public.players WHERE id = p_player_id;

  UPDATE public.players
     SET date_of_birth   = p_dob,
         age_years       = pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, p_dob))::INT,
         dob_verified_at = pg_catalog.now(),
         dob_verified_by = auth.uid()
   WHERE id = p_player_id;

  IF v_old_slug IS NULL OR v_old_adult IS DISTINCT FROM (private.dob_tier(p_dob) = 'adult') THEN
    UPDATE public.players
       SET profile_slug = private.make_profile_slug(p_player_id)
     WHERE id = p_player_id;
  END IF;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- ── get_player_tier ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_tier(p_player_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.player_tier(date_of_birth, dob_verified_at)
    FROM public.players WHERE id = p_player_id;
$$;

-- ── issue_claim_code ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.issue_claim_code(p_player_id UUID, p_expires_in_days INT DEFAULT 14)
RETURNS TABLE (claim_code_id UUID, code TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_code TEXT;
  v_id UUID;
  v_expires TIMESTAMPTZ;
BEGIN
  PERFORM private.assert_admin();

  IF p_expires_in_days IS NULL OR p_expires_in_days < 1 OR p_expires_in_days > 90 THEN
    RAISE EXCEPTION 'Expiry must be between 1 and 90 days' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.player_claims
              WHERE player_id = p_player_id AND status IN ('pending','approved')) THEN
    RAISE EXCEPTION 'Player already has a pending or approved claim' USING ERRCODE = '23505';
  END IF;

  -- Only one live code per player.
  UPDATE public.claim_codes c
     SET voided_at = pg_catalog.now()
   WHERE c.player_id = p_player_id AND c.used_at IS NULL AND c.voided_at IS NULL;

  v_code := private.generate_claim_code();
  v_expires := pg_catalog.now() + pg_catalog.make_interval(days => p_expires_in_days);

  INSERT INTO public.claim_codes (player_id, code_hash, issued_by, expires_at)
  VALUES (p_player_id, private.hash_claim_code(v_code), auth.uid(), v_expires)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_code, v_expires;
END;
$$;

-- ── redeem_claim_code ──────────────────────────────────────────────────────
-- Returns jsonb rather than raising, so failed attempts are logged for the
-- rate limit (an exception would roll the log row back).
--   { ok: true,  claim_id, status: 'pending' }
--   { ok: false, error: 'not_signed_in' | 'rate_limited' | 'invalid_dob'
--                     | 'already_owns_profile' | 'already_pending'
--                     | 'invalid_or_expired_code' | 'player_already_claimed' }
CREATE OR REPLACE FUNCTION public.redeem_claim_code(p_code TEXT, p_submitted_dob DATE)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code public.claim_codes%ROWTYPE;
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

  IF EXISTS (SELECT 1 FROM public.player_claims
              WHERE player_id = v_code.player_id AND status IN ('pending','approved')) THEN
    UPDATE public.claim_codes SET voided_at = pg_catalog.now() WHERE id = v_code.id;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'player_already_claimed');
  END IF;

  BEGIN
    INSERT INTO public.player_claims (player_id, user_id, status, method, claim_code_id, submitted_dob)
    VALUES (v_code.player_id, v_uid, 'pending', 'admin_code', v_code.id, p_submitted_dob)
    RETURNING id INTO v_claim_id;
  EXCEPTION WHEN unique_violation THEN
    -- Lost a race with another claim on the same player or by the same user.
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'player_already_claimed');
  END;

  UPDATE public.claim_codes SET used_at = pg_catalog.now(), used_by = v_uid WHERE id = v_code.id;
  INSERT INTO public.claim_redeem_attempts (user_id, success) VALUES (v_uid, true);

  RETURN pg_catalog.jsonb_build_object('ok', true, 'claim_id', v_claim_id, 'status', 'pending');
END;
$$;

-- ── approve_claim ──────────────────────────────────────────────────────────
-- p_verified_dob: pass the submitted DOB to accept it, or a different date to
-- correct it.
CREATE OR REPLACE FUNCTION public.approve_claim(p_claim_id UUID, p_verified_dob DATE)
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

  BEGIN
    UPDATE public.player_claims
       SET status = 'approved', verified_dob = p_verified_dob,
           approved_by = auth.uid(), approved_at = pg_catalog.now()
     WHERE id = p_claim_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This account already owns an approved profile' USING ERRCODE = '23505';
  END;

  PERFORM private.apply_verified_dob(v_claim.player_id, p_verified_dob);
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
END;
$$;

-- ── revoke_claim ───────────────────────────────────────────────────────────
-- Releases an approved profile. The /p/ link stops working and the DOB drops
-- back to unverified (u18-level privacy) until a new claim is approved,
-- in case the revoked claim's DOB was wrong.
CREATE OR REPLACE FUNCTION public.revoke_claim(p_claim_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  PERFORM private.assert_admin();

  UPDATE public.player_claims
     SET status = 'revoked', revoked_by = auth.uid(), revoked_at = pg_catalog.now()
   WHERE id = p_claim_id AND status = 'approved'
  RETURNING player_id INTO v_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No approved claim with that id' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.players
     SET profile_slug = NULL, dob_verified_at = NULL, dob_verified_by = NULL
   WHERE id = v_player_id;
END;
$$;

-- ── admin_assign_claim ─────────────────────────────────────────────────────
-- Skips the code: creates an approved claim for an existing account.
CREATE OR REPLACE FUNCTION public.admin_assign_claim(p_player_id UUID, p_user_email TEXT, p_verified_dob DATE)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_claim_id UUID;
BEGIN
  PERFORM private.assert_admin();
  PERFORM private.assert_plausible_dob(p_verified_dob);

  SELECT id INTO v_user_id FROM auth.users
   WHERE pg_catalog.lower(email) = pg_catalog.lower(pg_catalog.btrim(p_user_email));
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No account with that email — the player needs to sign up first' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    INSERT INTO public.player_claims
      (player_id, user_id, status, method, verified_dob, approved_by, approved_at)
    VALUES
      (p_player_id, v_user_id, 'approved', 'admin_manual', p_verified_dob, auth.uid(), pg_catalog.now())
    RETURNING id INTO v_claim_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Player already has an active claim, or this account already owns a profile' USING ERRCODE = '23505';
  END;

  -- Any outstanding code for this player is now pointless.
  UPDATE public.claim_codes
     SET voided_at = pg_catalog.now()
   WHERE player_id = p_player_id AND used_at IS NULL AND voided_at IS NULL;

  PERFORM private.apply_verified_dob(p_player_id, p_verified_dob);
  RETURN v_claim_id;
END;
$$;

-- ── admin_set_player_dob ───────────────────────────────────────────────────
-- Admin-only DOB edit (e.g. correcting an approved player later).
-- p_verified = false stores the DOB but leaves it unverified.
CREATE OR REPLACE FUNCTION public.admin_set_player_dob(p_player_id UUID, p_dob DATE, p_verified BOOLEAN DEFAULT true)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_admin();

  PERFORM 1 FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_dob IS NULL THEN
    UPDATE public.players
       SET date_of_birth = NULL, age_years = NULL, dob_verified_at = NULL, dob_verified_by = NULL
     WHERE id = p_player_id;
  ELSE
    PERFORM private.assert_plausible_dob(p_dob);
    IF p_verified THEN
      PERFORM private.apply_verified_dob(p_player_id, p_dob);
      -- Only claimed players keep a public slug.
      UPDATE public.players SET profile_slug = NULL
       WHERE id = p_player_id
         AND NOT EXISTS (SELECT 1 FROM public.player_claims
                          WHERE player_id = p_player_id AND status = 'approved');
    ELSE
      UPDATE public.players
         SET date_of_birth = p_dob,
             age_years = pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, p_dob))::INT,
             dob_verified_at = NULL, dob_verified_by = NULL
       WHERE id = p_player_id;
    END IF;
  END IF;
END;
$$;

-- ── admin_list_claims ──────────────────────────────────────────────────────
-- dob_mismatch: submitted DOB differs from a DOB already on the player.
-- tier_change:  submitted DOB puts the player in a different adult/u18 tier
--               than the existing DOB does.
CREATE OR REPLACE FUNCTION public.admin_list_claims(p_status TEXT DEFAULT NULL)
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
  revoked_at TIMESTAMPTZ
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
         (p.date_of_birth IS NOT NULL AND c.submitted_dob IS NOT NULL AND p.date_of_birth <> c.submitted_dob),
         (p.date_of_birth IS NOT NULL AND c.submitted_dob IS NOT NULL
           AND private.dob_tier(p.date_of_birth) <> private.dob_tier(c.submitted_dob)),
         p.profile_slug, c.rejection_reason,
         c.created_at, c.approved_at, c.rejected_at, c.revoked_at
    FROM public.player_claims c
    JOIN public.players p ON p.id = c.player_id
    LEFT JOIN public.competitions comp ON comp.league_id = p.league_id
    LEFT JOIN auth.users u ON u.id = c.user_id
   WHERE p_status IS NULL OR c.status = p_status
   ORDER BY (c.status = 'pending') DESC, c.created_at DESC;
END;
$$;

-- ── admin_search_players ───────────────────────────────────────────────────
-- claim_status: 'unclaimed' | 'pending' | 'approved'
CREATE OR REPLACE FUNCTION public.admin_search_players(p_query TEXT, p_limit INT DEFAULT 25)
RETURNS TABLE (
  player_id UUID,
  full_name TEXT,
  team_name TEXT,
  competition_name TEXT,
  slug TEXT,
  date_of_birth DATE,
  dob_verified BOOLEAN,
  tier TEXT,
  claim_status TEXT,
  active_claim_id UUID,
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
         p.date_of_birth, p.dob_verified_at IS NOT NULL,
         private.player_tier(p.date_of_birth, p.dob_verified_at),
         COALESCE(c.status, 'unclaimed'), c.id, u.email::TEXT,
         (SELECT pg_catalog.max(cc.expires_at) FROM public.claim_codes cc
           WHERE cc.player_id = p.id AND cc.used_at IS NULL AND cc.voided_at IS NULL
             AND cc.expires_at > pg_catalog.now())
    FROM public.players p
    LEFT JOIN public.competitions comp ON comp.league_id = p.league_id
    LEFT JOIN public.player_claims c ON c.player_id = p.id AND c.status IN ('pending','approved')
    LEFT JOIN auth.users u ON u.id = c.user_id
   WHERE p.full_name ILIKE '%' || pg_catalog.btrim(p_query) || '%'
   ORDER BY p.full_name, comp.name
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
END;
$$;

-- ── grants ─────────────────────────────────────────────────────────────────
-- Everything is signed-in only; admin functions also check is_app_admin().
REVOKE ALL ON FUNCTION public.get_player_tier(UUID)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_claim_code(UUID, INT)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_claim_code(TEXT, DATE)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_claim(UUID, DATE)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_claim(UUID, TEXT)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_claim(UUID)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_assign_claim(UUID, TEXT, DATE)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_player_dob(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_claims(TEXT)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_search_players(TEXT, INT)           FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_player_tier(UUID)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_claim_code(UUID, INT)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_claim_code(TEXT, DATE)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_claim(UUID, DATE)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_claim(UUID, TEXT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_claim(UUID)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_claim(UUID, TEXT, DATE)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_player_dob(UUID, DATE, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_claims(TEXT)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_players(TEXT, INT)           TO authenticated;
