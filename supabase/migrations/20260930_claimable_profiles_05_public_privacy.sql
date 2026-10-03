-- Claimable player profiles · 5/5 · public privacy
--
-- 1. public.players is no longer readable in full. anon/authenticated get
--    SELECT on safe columns only; date_of_birth, age_years, social_instagram,
--    dob_verified_*, profile_slug are hidden. Existing pages keep working
--    because they only select safe columns (checked against every client
--    query). Server code uses the service key and is unaffected.
--    RLS row policies are unchanged (public rows by league visibility,
--    admin-only writes via is_app_admin()).
--
-- 2. Tier-aware data comes only from SECURITY DEFINER functions, which apply
--    get_player_tier rules server-side:
--      get_player_public_details(player_id)  – DOB / age / Instagram for the
--                                              existing /player/ pages
--      get_public_profile(profile_slug)      – the /p/:slug page (approved
--                                              claims only), owner fields
--                                              merged over the players row
--      get_my_claim()                        – the signed-in user's claim
--    Verified adults get DOB, age and Instagram. u18 and unverified get none
--    of those, and /p/ shows "First L." with is_indexable = false.
--
-- These are functions rather than a view on purpose: a view would let anyone
-- list every claimed profile's slug (including minors'). get_public_profile
-- needs the exact slug, so /p/ links stay shareable-by-link-only.

-- ── players: column-level privileges ───────────────────────────────────────
REVOKE ALL ON public.players FROM anon, authenticated;

GRANT SELECT (
  id, full_name, "shirtNumber", team_name, aliases, firstname, familyname,
  created_at, league_id, team_id, slug, photo_path, photo_focus_y,
  photo_path_bg_removed, height_cm, position, stop, current_team
) ON public.players TO anon, authenticated;

-- Admin tools write players from the browser (photo uploads etc.). RLS limits
-- these to is_app_admin(); DOB / verification / profile_slug can only be
-- changed through the admin RPCs.
GRANT INSERT (
  id, full_name, "shirtNumber", team_name, aliases, firstname, familyname,
  league_id, team_id, slug, photo_path, photo_focus_y, photo_path_bg_removed,
  height_cm, position, stop, current_team
) ON public.players TO authenticated;

GRANT UPDATE (
  full_name, "shirtNumber", team_name, aliases, firstname, familyname,
  league_id, team_id, slug, photo_path, photo_focus_y, photo_path_bg_removed,
  height_cm, position, stop, current_team
) ON public.players TO authenticated;

GRANT DELETE ON public.players TO authenticated;

-- ── helpers ────────────────────────────────────────────────────────────────
-- "First L." from firstname/familyname, falling back to splitting full_name.
CREATE OR REPLACE FUNCTION private.masked_name(p_first TEXT, p_family TEXT, p_full TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.btrim(
    COALESCE(NULLIF(pg_catalog.btrim(p_first), ''), pg_catalog.split_part(pg_catalog.btrim(COALESCE(p_full, '')), ' ', 1))
    || ' ' ||
    COALESCE(
      NULLIF(pg_catalog.upper(pg_catalog.left(pg_catalog.btrim(COALESCE(
        NULLIF(pg_catalog.btrim(p_family), ''),
        pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(p_full, '')), '^\S+\s*', '')
      )), 1)), '') || '.',
      ''
    )
  );
$$;

REVOKE ALL ON FUNCTION private.masked_name(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ── get_player_public_details ──────────────────────────────────────────────
-- Tier-gated extras for an existing /player/ page. profile_slug is only
-- returned for verified adults, so minors' /p/ links can't be discovered by
-- player id. is_claimed drives the "Claim this profile" button.
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
  )
  SELECT p.id,
         NOT p.adult,
         EXISTS (SELECT 1 FROM public.player_claims c
                  WHERE c.player_id = p.id AND c.status IN ('pending','approved')),
         CASE WHEN p.adult THEN p.date_of_birth END,
         CASE WHEN p.adult THEN pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, p.date_of_birth))::INT END,
         CASE WHEN p.adult THEN COALESCE(o.instagram_handle, p.social_instagram) END,
         CASE WHEN p.adult THEN p.profile_slug END
    FROM p
    LEFT JOIN public.player_owner_fields o ON o.player_id = p.id;
$$;

-- ── get_public_profile ─────────────────────────────────────────────────────
-- The /p/:slug page. Only approved claims have a profile. Owner fields are
-- merged over the base row. photo_path is a path in the player-photos bucket.
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
    SELECT pl.*, private.player_tier(pl.date_of_birth, pl.dob_verified_at) = 'adult' AS adult
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

-- ── get_my_claim ───────────────────────────────────────────────────────────
-- The signed-in user's most relevant claim (approved > pending > latest).
-- Owners see their own profile_slug here so they can share it.
CREATE OR REPLACE FUNCTION public.get_my_claim()
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
  approved_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.status, c.player_id, p.full_name, p.team_name,
         c.submitted_dob, c.rejection_reason,
         CASE WHEN c.status = 'approved' THEN p.profile_slug END,
         c.created_at, c.approved_at
    FROM public.player_claims c
    JOIN public.players p ON p.id = c.player_id
   WHERE c.user_id = (SELECT auth.uid())
   ORDER BY CASE c.status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
            c.created_at DESC
   LIMIT 1;
$$;

-- ── grants ─────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_player_public_details(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_profile(TEXT)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_claim()                  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_player_public_details(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile(TEXT)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_claim()                  TO authenticated;
