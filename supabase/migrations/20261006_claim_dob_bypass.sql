-- Approve or assign a claim without a date of birth.
--
-- Some people ask to claim a profile without giving a DOB, so the admin can't
-- verify one. Two ways to approve anyway (p_dob_status):
--
--   'verified'   – today's behaviour: a verified DOB is required.
--   'adult'      – no DOB, but the admin knows the player is 18+. The profile is
--                  treated as an adult profile (full name, indexable) and shows
--                  no DOB or age, since none is on file.
--   'unverified' – no DOB and the admin isn't sure. The owner gets edit access
--                  but the profile stays restricted (masked name, not indexed),
--                  exactly like an under-18 until a DOB is verified.
--
-- 'adult' is an explicit flag on the player row (adult_confirmed_at) rather
-- than "verified with no DOB", so a DOB that is ever blanked by an import can
-- never turn a profile into an adult one by accident. A real verified DOB
-- always wins over the flag, and the flag is refused outright when any
-- covered row has a recorded DOB under 18.
--
-- admin_verify_claim_dob(claim, dob) adds the DOB later and settles the tier.
--
-- Every function that decides the tier now passes the flag. The old two-argument
-- private.player_tier is kept: anything still calling it treats an adult-
-- confirmed player as unverified, which is the safe direction.

-- ── columns ────────────────────────────────────────────────────────────────
-- players has column-level grants (see 05): a new column is invisible to
-- anon/authenticated until granted, and it is not granted.
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS adult_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adult_confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.player_claims
  ADD COLUMN IF NOT EXISTS dob_status TEXT NOT NULL DEFAULT 'verified';
DO $$ BEGIN
  ALTER TABLE public.player_claims
    ADD CONSTRAINT player_claims_dob_status_check CHECK (dob_status IN ('verified','adult','unverified'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── tier ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.player_tier(p_dob DATE, p_verified_at TIMESTAMPTZ, p_adult_confirmed_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_dob IS NOT NULL AND p_verified_at IS NOT NULL THEN private.dob_tier(p_dob)
    WHEN p_adult_confirmed_at IS NOT NULL THEN 'adult'
    ELSE 'unverified'
  END;
$$;

-- Raises when any of the rows has a recorded DOB under 18.
CREATE OR REPLACE FUNCTION private.assert_rows_not_minor(p_rows UUID[])
RETURNS VOID LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.players
              WHERE id = ANY (p_rows) AND date_of_birth IS NOT NULL AND private.dob_tier(date_of_birth) = 'u18') THEN
    RAISE EXCEPTION 'The record shows this player is under 18. Enter a verified date of birth instead' USING ERRCODE = '22023';
  END IF;
END;
$$;

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
  SELECT firstname, familyname, full_name, date_of_birth, dob_verified_at, adult_confirmed_at
    INTO p FROM public.players WHERE id = p_player_id;

  first_part := COALESCE(NULLIF(pg_catalog.btrim(p.firstname), ''), pg_catalog.split_part(pg_catalog.btrim(p.full_name), ' ', 1));
  last_part  := COALESCE(NULLIF(pg_catalog.btrim(p.familyname), ''),
                         pg_catalog.regexp_replace(pg_catalog.btrim(p.full_name), '^\S+\s*', ''));

  IF private.player_tier(p.date_of_birth, p.dob_verified_at, p.adult_confirmed_at) = 'adult' THEN
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

-- As before, but the "was this player an adult" check counts the admin's say-so,
-- so verifying an under-18 DOB on a player previously confirmed as an adult
-- replaces their name-style slug with an anonymous one.
CREATE OR REPLACE FUNCTION private.apply_verified_dob(p_player_id UUID, p_dob DATE)
RETURNS VOID LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_old_adult BOOLEAN;
  v_old_slug TEXT;
BEGIN
  SELECT private.player_tier(date_of_birth, dob_verified_at, adult_confirmed_at) = 'adult', profile_slug
    INTO v_old_adult, v_old_slug
    FROM public.players WHERE id = p_player_id;

  UPDATE public.players
     SET date_of_birth   = p_dob,
         age_years       = pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, p_dob))::INT,
         dob_verified_at = pg_catalog.now(),
         dob_verified_by = auth.uid(),
         adult_confirmed_at = NULL,
         adult_confirmed_by = NULL
   WHERE id = p_player_id;

  IF v_old_slug IS NULL OR v_old_adult IS DISTINCT FROM (private.dob_tier(p_dob) = 'adult') THEN
    UPDATE public.players
       SET profile_slug = private.make_profile_slug(p_player_id)
     WHERE id = p_player_id;
  END IF;
END;
$$;

-- Applies the claim's DOB decision to every covered row. With a DOB: as before.
-- Without one: 'adult' records the admin's confirmation, 'unverified' records
-- nothing (the rows stay restricted). The primary row always ends up with a slug.
CREATE OR REPLACE FUNCTION private.verify_claim_rows(p_claim_id UUID, p_dob DATE)
RETURNS VOID LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_primary UUID;
  v_status TEXT;
  v_rows UUID[];
BEGIN
  SELECT player_id, dob_status INTO v_primary, v_status FROM public.player_claims WHERE id = p_claim_id;
  SELECT COALESCE(pg_catalog.array_agg(player_id), '{}') INTO v_rows
    FROM public.player_claim_rows WHERE claim_id = p_claim_id;

  IF p_dob IS NOT NULL THEN
    PERFORM private.apply_verified_dob(v_primary, p_dob);
    UPDATE public.players
       SET date_of_birth   = p_dob,
           age_years       = pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, p_dob))::INT,
           dob_verified_at = pg_catalog.now(),
           dob_verified_by = auth.uid(),
           adult_confirmed_at = NULL,
           adult_confirmed_by = NULL
     WHERE id IN (SELECT player_id FROM public.player_claim_rows WHERE claim_id = p_claim_id AND player_id <> v_primary);
  ELSE
    IF v_status = 'adult' THEN
      PERFORM private.assert_rows_not_minor(v_rows);
      UPDATE public.players
         SET adult_confirmed_at = COALESCE(adult_confirmed_at, pg_catalog.now()),
             adult_confirmed_by = COALESCE(adult_confirmed_by, auth.uid())
       WHERE id = ANY (v_rows);
    END IF;
    -- Set after the flag so an adult-confirmed profile gets a name-style slug.
    UPDATE public.players SET profile_slug = private.make_profile_slug(id)
     WHERE id = v_primary AND profile_slug IS NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.unverify_rows(p_rows UUID[])
RETURNS VOID LANGUAGE sql VOLATILE SET search_path = '' AS $$
  UPDATE public.players
     SET dob_verified_at = NULL, dob_verified_by = NULL, profile_slug = NULL,
         adult_confirmed_at = NULL, adult_confirmed_by = NULL
   WHERE id = ANY (p_rows);
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- ── approve_claim ──────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.approve_claim(UUID, DATE, UUID[]);
CREATE FUNCTION public.approve_claim(
  p_claim_id UUID, p_verified_dob DATE, p_player_ids UUID[] DEFAULT NULL, p_dob_status TEXT DEFAULT 'verified')
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.player_claims%ROWTYPE;
BEGIN
  PERFORM private.assert_admin();
  IF p_dob_status NOT IN ('verified','adult','unverified') THEN
    RAISE EXCEPTION 'Unknown date of birth status' USING ERRCODE = '22023';
  END IF;
  IF p_dob_status = 'verified' THEN
    PERFORM private.assert_plausible_dob(p_verified_dob);
  ELSIF p_verified_dob IS NOT NULL THEN
    RAISE EXCEPTION 'Leave the date of birth empty when approving without one' USING ERRCODE = '22023';
  END IF;

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

  IF p_dob_status = 'adult' THEN
    IF v_claim.submitted_dob IS NOT NULL AND private.dob_tier(v_claim.submitted_dob) = 'u18' THEN
      RAISE EXCEPTION 'The player entered a date of birth under 18. Enter a verified date of birth instead' USING ERRCODE = '22023';
    END IF;
    PERFORM private.assert_rows_not_minor(
      (SELECT COALESCE(pg_catalog.array_agg(player_id), '{}') FROM public.player_claim_rows WHERE claim_id = p_claim_id));
  END IF;

  BEGIN
    UPDATE public.player_claims
       SET status = 'approved', verified_dob = p_verified_dob, dob_status = p_dob_status,
           approved_by = auth.uid(), approved_at = pg_catalog.now()
     WHERE id = p_claim_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This account already owns an approved profile' USING ERRCODE = '23505';
  END;

  PERFORM private.verify_claim_rows(p_claim_id, p_verified_dob);
END;
$$;

-- ── admin_assign_claim ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_assign_claim(UUID, TEXT, DATE, UUID[]);
CREATE FUNCTION public.admin_assign_claim(
  p_player_id UUID, p_user_email TEXT, p_verified_dob DATE, p_also_player_ids UUID[] DEFAULT '{}',
  p_dob_status TEXT DEFAULT 'verified')
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
  IF p_dob_status NOT IN ('verified','adult','unverified') THEN
    RAISE EXCEPTION 'Unknown date of birth status' USING ERRCODE = '22023';
  END IF;
  IF p_dob_status = 'verified' THEN
    PERFORM private.assert_plausible_dob(p_verified_dob);
  ELSIF p_verified_dob IS NOT NULL THEN
    RAISE EXCEPTION 'Leave the date of birth empty when assigning without one' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_user_id FROM auth.users
   WHERE pg_catalog.lower(email) = pg_catalog.lower(pg_catalog.btrim(p_user_email));
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No account with that email — the player needs to sign up first' USING ERRCODE = 'P0002';
  END IF;

  v_rows := private.claim_row_set(p_player_id, p_also_player_ids);
  PERFORM private.assert_rows_claimable(v_rows, NULL);
  IF p_dob_status = 'adult' THEN
    PERFORM private.assert_rows_not_minor(v_rows);
  END IF;

  BEGIN
    INSERT INTO public.player_claims
      (player_id, user_id, status, method, verified_dob, dob_status, approved_by, approved_at, covered_player_ids)
    VALUES
      (p_player_id, v_user_id, 'approved', 'admin_manual', p_verified_dob, p_dob_status, auth.uid(), pg_catalog.now(), v_rows)
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

-- ── admin_verify_claim_dob ─────────────────────────────────────────────────
-- Add (or correct) the verified DOB on an approved claim, on every row it
-- covers. This is how an 'adult' or 'unverified' approval is finished off.
CREATE OR REPLACE FUNCTION public.admin_verify_claim_dob(p_claim_id UUID, p_dob DATE)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_admin();
  PERFORM private.assert_plausible_dob(p_dob);

  UPDATE public.player_claims
     SET verified_dob = p_dob, dob_status = 'verified'
   WHERE id = p_claim_id AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No approved claim with that id' USING ERRCODE = 'P0002';
  END IF;

  PERFORM private.verify_claim_rows(p_claim_id, p_dob);
END;
$$;

-- ── readers of the tier ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_tier(p_player_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.player_tier(date_of_birth, dob_verified_at, adult_confirmed_at)
    FROM public.players WHERE id = p_player_id;
$$;

CREATE OR REPLACE FUNCTION public.admin_search_players(p_query TEXT, p_limit INT DEFAULT 25)
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
         private.player_tier(p.date_of_birth, p.dob_verified_at, p.adult_confirmed_at),
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
    SELECT pl.*, private.player_tier(pl.date_of_birth, pl.dob_verified_at, pl.adult_confirmed_at) = 'adult' AS adult
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

CREATE OR REPLACE FUNCTION public.get_public_profile(p_slug TEXT)
RETURNS TABLE (
  player_id UUID,
  profile_slug TEXT,
  stats_slug TEXT,
  display_name TEXT,
  is_restricted BOOLEAN,
  is_indexable BOOLEAN,
  team_name TEXT,
  current_team TEXT,
  league_id UUID,
  competition_name TEXT,
  shirt_number INT,
  "position" TEXT,
  height_cm INT,
  photo_path TEXT,
  photo_focus_y BIGINT,
  bio TEXT,
  pinned_highlight_url TEXT,
  date_of_birth DATE,
  age_years INT,
  instagram_handle TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH p AS (
    SELECT pl.*, private.player_tier(pl.date_of_birth, pl.dob_verified_at, pl.adult_confirmed_at) = 'adult' AS adult
      FROM public.players pl
     WHERE pl.profile_slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
       AND EXISTS (SELECT 1 FROM public.player_claims c
                    WHERE c.player_id = pl.id AND c.status = 'approved')
  )
  SELECT p.id,
         p.profile_slug,
         p.slug,
         CASE WHEN p.adult THEN p.full_name
              ELSE private.masked_name(p.firstname, p.familyname, p.full_name) END,
         NOT p.adult,
         p.adult,
         p.team_name,
         p.current_team,
         p.league_id,
         comp.name,
         p."shirtNumber",
         COALESCE(o.position, p.position),
         COALESCE(o.display_height_cm, p.height_cm),
         COALESCE(o.photo_path, p.photo_path_bg_removed, p.photo_path),
         CASE WHEN o.photo_path IS NULL THEN p.photo_focus_y END,
         o.bio,
         o.pinned_highlight_url,
         CASE WHEN p.adult THEN p.date_of_birth END,
         CASE WHEN p.adult THEN pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, p.date_of_birth))::INT END,
         CASE WHEN p.adult THEN COALESCE(o.instagram_handle, p.social_instagram) END
    FROM p
    LEFT JOIN public.player_owner_fields o ON o.player_id = p.id
    LEFT JOIN public.competitions comp ON comp.league_id = p.league_id;
$$;

-- ── grants ─────────────────────────────────────────────────────────────────
-- approve_claim and admin_assign_claim were dropped and recreated, so they need
-- their grants again. The CREATE OR REPLACE functions above keep theirs.
REVOKE ALL ON FUNCTION public.approve_claim(UUID, DATE, UUID[], TEXT)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_assign_claim(UUID, TEXT, DATE, UUID[], TEXT)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_verify_claim_dob(UUID, DATE)                        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_claim(UUID, DATE, UUID[], TEXT)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_claim(UUID, TEXT, DATE, UUID[], TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_claim_dob(UUID, DATE)                     TO authenticated;
