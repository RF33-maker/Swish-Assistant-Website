-- Claimable player profiles — security tests
--
-- Run against DEV (SQL editor or the Supabase MCP execute_sql). Everything
-- happens inside one transaction that is rolled back, using throwaway auth
-- users and players created here, so real data is never changed.
--
-- Output: one row per check with PASS/FAIL, then a summary row (step 999).
-- Every row must say PASS.
--
-- Covers:
--   A  a user can't claim an already-claimed or pending player
--   B  an expired or already-used code can't be redeemed (+ rate limit)
--   C  non-admins can't issue codes, approve, reject or revoke claims
--   D  a pending claim can't edit the profile
--   E  an approved owner can't edit someone else's profile or change DOB
--   F  an unverified DOB never produces the 'adult' tier
--   G  public reads never return DOB, age or socials for u18/unverified

BEGIN;

CREATE TEMP TABLE results (step INT, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
CREATE TEMP TABLE ctx (k TEXT PRIMARY KEY, v TEXT) ON COMMIT DROP;
GRANT ALL ON results, ctx TO anon, authenticated;

-- ── fixtures ───────────────────────────────────────────────────────────────
-- Users: admin (seeded in app_admins), A, B, C, D (regular).
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '{}'::jsonb, '{}'::jsonb, now(), now()
FROM (VALUES
  ('aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'claimtest-admin@example.test'),
  ('aaaaaaaa-0000-4000-8000-0000000000a1'::uuid, 'claimtest-a@example.test'),
  ('aaaaaaaa-0000-4000-8000-0000000000b1'::uuid, 'claimtest-b@example.test'),
  ('aaaaaaaa-0000-4000-8000-0000000000c1'::uuid, 'claimtest-c@example.test'),
  ('aaaaaaaa-0000-4000-8000-0000000000d1'::uuid, 'claimtest-d@example.test')
) AS u(id, email);
INSERT INTO public.app_admins (user_id) VALUES ('aaaaaaaa-0000-4000-8000-00000000000a');

-- Players in an existing publicly visible competition.
-- P1 no DOB · P2 no DOB · P3 roster DOB 1980 (unverified) + Instagram
-- P4 roster DOB 2012 (unverified) · P5 no DOB
INSERT INTO ctx SELECT 'league', league_id::text FROM public.competitions c
 WHERE public.is_league_publicly_visible(c.league_id) LIMIT 1;
INSERT INTO public.players (id, full_name, firstname, familyname, league_id, slug, date_of_birth, social_instagram)
SELECT p.id, p.fname, split_part(p.fname, ' ', 1), split_part(p.fname, ' ', 2), (SELECT v::uuid FROM ctx WHERE k = 'league'), p.slug, p.dob, p.ig
FROM (VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001'::uuid, 'Testone Alpha',   'claimtest-p1', NULL::date,   NULL::text),
  ('bbbbbbbb-0000-4000-8000-000000000002'::uuid, 'Testtwo Bravo',   'claimtest-p2', NULL,         NULL),
  ('bbbbbbbb-0000-4000-8000-000000000003'::uuid, 'Testthree Charlie','claimtest-p3', '1980-04-04', 'https://instagram.com/p3_roster'),
  ('bbbbbbbb-0000-4000-8000-000000000004'::uuid, 'Testfour Delta',  'claimtest-p4', '2012-06-06', 'https://instagram.com/p4_roster'),
  ('bbbbbbbb-0000-4000-8000-000000000005'::uuid, 'Testfive Echo',   'claimtest-p5', NULL,         NULL)
) AS p(id, fname, slug, dob, ig);

-- ── helpers ────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.as_user(p_uid UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
END $$;
CREATE FUNCTION pg_temp.as_anon() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
END $$;
CREATE FUNCTION pg_temp.as_postgres() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);  -- back to the session's own role
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
-- Runs p_sql and records PASS if it raises an error.
CREATE FUNCTION pg_temp.expect_error(p_step INT, p_name TEXT, p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  INSERT INTO results VALUES (p_step, p_name, false, 'no error raised');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO results VALUES (p_step, p_name, true, SQLERRM);
END $$;
-- Runs p_sql (a statement that affects rows) and records PASS if 0 rows changed.
CREATE FUNCTION pg_temp.expect_no_rows(p_step INT, p_name TEXT, p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO results VALUES (p_step, p_name, n = 0, n || ' rows changed');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO results VALUES (p_step, p_name, true, 'blocked: ' || SQLERRM);
END $$;
CREATE FUNCTION pg_temp.check(p_step INT, p_name TEXT, p_ok BOOLEAN, p_detail TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO results VALUES (p_step, p_name, COALESCE(p_ok, false), p_detail);
END $$;

DO $$
DECLARE
  c1 TEXT; c2 TEXT; c4 TEXT; c5 TEXT; res JSONB; v_claim UUID; v_slug TEXT; n INT; bad INT;
  ADMIN CONSTANT UUID := 'aaaaaaaa-0000-4000-8000-00000000000a';
  UA CONSTANT UUID := 'aaaaaaaa-0000-4000-8000-0000000000a1';
  UB CONSTANT UUID := 'aaaaaaaa-0000-4000-8000-0000000000b1';
  UC CONSTANT UUID := 'aaaaaaaa-0000-4000-8000-0000000000c1';
  UD CONSTANT UUID := 'aaaaaaaa-0000-4000-8000-0000000000d1';
  P1 CONSTANT UUID := 'bbbbbbbb-0000-4000-8000-000000000001';
  P2 CONSTANT UUID := 'bbbbbbbb-0000-4000-8000-000000000002';
  P3 CONSTANT UUID := 'bbbbbbbb-0000-4000-8000-000000000003';
  P4 CONSTANT UUID := 'bbbbbbbb-0000-4000-8000-000000000004';
  P5 CONSTANT UUID := 'bbbbbbbb-0000-4000-8000-000000000005';
BEGIN
  -- ═══ A: can't claim an already-claimed or pending player ═════════════════
  PERFORM pg_temp.as_user(ADMIN);
  SELECT code INTO c1 FROM public.issue_claim_code(P1);
  PERFORM pg_temp.as_user(UA);
  res := public.redeem_claim_code(c1, '2001-01-01');
  PERFORM pg_temp.check(1, 'A: user A redeems a valid code → pending', res->>'status' = 'pending', res::text);

  PERFORM pg_temp.as_user(ADMIN);
  PERFORM pg_temp.expect_error(2, 'A: admin cannot issue a code for a player with a pending claim',
    format('SELECT public.issue_claim_code(%L)', P1));

  -- Simulate a stray live code for P1 (e.g. issued in a race) and redeem it as B.
  PERFORM pg_temp.as_postgres();
  INSERT INTO public.claim_codes (player_id, code_hash, expires_at)
  VALUES (P1, private.hash_claim_code('STRY-CODE-P1'), now() + interval '1 day');
  PERFORM pg_temp.as_user(UB);
  res := public.redeem_claim_code('STRY-CODE-P1', '2001-01-01');
  PERFORM pg_temp.check(3, 'A: user B cannot claim a player with a pending claim', res->>'error' = 'player_already_claimed', res::text);

  PERFORM pg_temp.as_user(ADMIN);
  PERFORM public.admin_assign_claim(P2, 'claimtest-c@example.test', '1995-05-05');
  PERFORM pg_temp.expect_error(4, 'A: admin cannot issue a code for an approved player',
    format('SELECT public.issue_claim_code(%L)', P2));
  PERFORM pg_temp.expect_error(5, 'A: admin cannot assign an approved player to a second account',
    format('SELECT public.admin_assign_claim(%L, %L, %L)', P2, 'claimtest-d@example.test', '1995-05-05'));

  PERFORM pg_temp.as_postgres();
  INSERT INTO public.claim_codes (player_id, code_hash, expires_at)
  VALUES (P2, private.hash_claim_code('STRY-CODE-P2'), now() + interval '1 day');
  PERFORM pg_temp.as_user(UD);
  res := public.redeem_claim_code('STRY-CODE-P2', '1995-05-05');
  PERFORM pg_temp.check(6, 'A: user D cannot claim an approved player', res->>'error' = 'player_already_claimed', res::text);

  PERFORM pg_temp.as_postgres();
  PERFORM pg_temp.expect_error(7, 'A: DB constraint blocks a second active claim even bypassing RPCs',
    format($q$INSERT INTO public.player_claims (player_id, user_id, status, method) VALUES (%L, %L, 'pending', 'admin_code')$q$, P2, UD));

  -- ═══ B: expired or used codes, rate limit ═══════════════════════════════
  PERFORM pg_temp.as_user(UD);
  res := public.redeem_claim_code(c1, '2001-01-01');
  PERFORM pg_temp.check(10, 'B: an already-used code cannot be redeemed', res->>'error' = 'invalid_or_expired_code', res::text);

  PERFORM pg_temp.as_postgres();
  INSERT INTO public.claim_codes (player_id, code_hash, expires_at)
  VALUES (P5, private.hash_claim_code('EXPD-CODE-P5'), now() - interval '1 minute');
  PERFORM pg_temp.as_user(UD);
  res := public.redeem_claim_code('EXPD-CODE-P5', '2001-01-01');
  PERFORM pg_temp.check(11, 'B: an expired code cannot be redeemed', res->>'error' = 'invalid_or_expired_code', res::text);

  PERFORM pg_temp.as_user(ADMIN);
  SELECT code INTO c4 FROM public.issue_claim_code(P4);
  SELECT code INTO c5 FROM public.issue_claim_code(P4);  -- voids c4
  PERFORM pg_temp.as_user(UD);
  res := public.redeem_claim_code(c4, '2012-06-06');
  PERFORM pg_temp.check(12, 'B: a code replaced by a newer one cannot be redeemed', res->>'error' = 'invalid_or_expired_code', res::text);

  PERFORM pg_temp.as_postgres();
  SELECT count(*) INTO n FROM public.claim_codes WHERE code_hash = private.hash_claim_code(c5) AND code_hash <> convert_to(c5, 'UTF8');
  PERFORM pg_temp.check(13, 'B: codes are stored hashed, never in plain text', n = 1, n || ' hashed row(s) found');

  -- D has 3 failures so far (steps 10–12). Two more hit the limit; then even a valid code is refused.
  PERFORM pg_temp.as_user(UD);
  PERFORM public.redeem_claim_code('WRNG-WRNG-01', '2001-01-01');
  PERFORM public.redeem_claim_code('WRNG-WRNG-02', '2001-01-01');
  res := public.redeem_claim_code(c5, '2012-06-06');
  PERFORM pg_temp.check(14, 'B: after 5 failed attempts in an hour, redemption is rate limited', res->>'error' = 'rate_limited', res::text);

  -- ═══ C: non-admins can't run admin actions ══════════════════════════════
  PERFORM pg_temp.as_user(UB);
  PERFORM pg_temp.expect_error(20, 'C: non-admin cannot issue a code', format('SELECT public.issue_claim_code(%L)', P5));
  SELECT id INTO v_claim FROM public.player_claims WHERE player_id = P1;  -- B can't see A's claim (RLS) → NULL
  PERFORM pg_temp.check(21, 'C: non-admin cannot see other users'' claims', v_claim IS NULL, COALESCE(v_claim::text, 'none visible'));
  PERFORM pg_temp.as_postgres();
  SELECT id INTO v_claim FROM public.player_claims WHERE player_id = P1 AND status = 'pending';
  INSERT INTO ctx VALUES ('p1_claim', v_claim::text);
  SELECT id INTO v_claim FROM public.player_claims WHERE player_id = P2 AND status = 'approved';
  INSERT INTO ctx VALUES ('p2_claim', v_claim::text);
  PERFORM pg_temp.as_user(UB);
  PERFORM pg_temp.expect_error(22, 'C: non-admin cannot approve a claim',
    format('SELECT public.approve_claim(%L, %L)', (SELECT v FROM ctx WHERE k = 'p1_claim'), '2001-01-01'));
  PERFORM pg_temp.expect_error(23, 'C: non-admin cannot reject a claim',
    format('SELECT public.reject_claim(%L, %L)', (SELECT v FROM ctx WHERE k = 'p1_claim'), 'no'));
  PERFORM pg_temp.expect_error(24, 'C: non-admin cannot revoke a claim',
    format('SELECT public.revoke_claim(%L)', (SELECT v FROM ctx WHERE k = 'p2_claim')));
  PERFORM pg_temp.expect_error(25, 'C: non-admin cannot manually assign a claim',
    format('SELECT public.admin_assign_claim(%L, %L, %L)', P5, 'claimtest-b@example.test', '1990-01-01'));
  PERFORM pg_temp.expect_error(26, 'C: non-admin cannot set a DOB', format('SELECT public.admin_set_player_dob(%L, %L)', P5, '1990-01-01'));
  PERFORM pg_temp.expect_error(27, 'C: non-admin cannot list claims', 'SELECT * FROM public.admin_list_claims()');
  PERFORM pg_temp.expect_error(28, 'C: non-admin cannot search players with DOBs', $q$SELECT * FROM public.admin_search_players('Test')$q$);
  PERFORM pg_temp.expect_no_rows(29, 'C: non-admin cannot write claims directly',
    format($q$UPDATE public.player_claims SET status = 'approved' WHERE id = %L$q$, (SELECT v FROM ctx WHERE k = 'p1_claim')));
  PERFORM pg_temp.expect_error(30, 'C: non-admin cannot read claim codes', 'SELECT count(*) FROM public.claim_codes');
  PERFORM pg_temp.expect_no_rows(31, 'C: non-admin cannot add themselves to app_admins',
    format('INSERT INTO public.app_admins (user_id) VALUES (%L)', UB));
  PERFORM pg_temp.as_anon();
  PERFORM pg_temp.expect_error(32, 'C: signed-out visitor cannot run admin RPCs', format('SELECT public.issue_claim_code(%L)', P5));

  -- ═══ D: a pending claim can't edit the profile ══════════════════════════
  PERFORM pg_temp.as_user(UA);  -- A's claim on P1 is pending
  PERFORM pg_temp.expect_error(40, 'D: pending claimant cannot create profile fields',
    format($q$INSERT INTO public.player_owner_fields (player_id, bio) VALUES (%L, 'x')$q$, P1));
  PERFORM pg_temp.expect_error(41, 'D: pending claimant cannot upload a profile photo',
    format($q$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('player-photos', 'owners/%s/me.jpg', %L)$q$, P1, UA));
  PERFORM pg_temp.expect_no_rows(42, 'D: pending claimant cannot update players',
    format('UPDATE public.players SET photo_focus_y = 1 WHERE id = %L', P1));
  SELECT profile_slug INTO v_slug FROM public.get_my_claim();
  PERFORM pg_temp.check(43, 'D: pending claimant gets no public profile slug', v_slug IS NULL, COALESCE(v_slug, 'null'));

  -- ═══ E: approved owner can't touch other profiles or DOB ═══════════════
  PERFORM pg_temp.as_user(UC);  -- C owns P2 (approved)
  INSERT INTO public.player_owner_fields (player_id, bio, instagram_handle) VALUES (P2, 'Guard', 'c_handle');
  PERFORM pg_temp.check(50, 'E: approved owner can edit their own profile fields', true, 'insert ok');
  PERFORM pg_temp.expect_error(51, 'E: owner cannot create fields for another player',
    format($q$INSERT INTO public.player_owner_fields (player_id, bio) VALUES (%L, 'x')$q$, P1));
  PERFORM pg_temp.expect_error(52, 'E: owner cannot move their row onto another player',
    format('UPDATE public.player_owner_fields SET player_id = %L WHERE player_id = %L', P1, P2));
  PERFORM pg_temp.expect_error(53, 'E: owner cannot point their photo at another player''s folder',
    format($q$UPDATE public.player_owner_fields SET photo_path = 'owners/%s/x.jpg' WHERE player_id = %L$q$, P1, P2));
  PERFORM pg_temp.expect_error(54, 'E: owner cannot upload into another player''s photo folder',
    format($q$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('player-photos', 'owners/%s/me.jpg', %L)$q$, P1, UC));
  PERFORM pg_temp.expect_error(55, 'E: owner cannot change their DOB on players',
    format($q$UPDATE public.players SET date_of_birth = '1970-01-01' WHERE id = %L$q$, P2));
  PERFORM pg_temp.expect_error(56, 'E: owner cannot mark their DOB verified',
    format('UPDATE public.players SET dob_verified_at = now() WHERE id = %L', P2));
  PERFORM pg_temp.expect_error(57, 'E: owner cannot use the admin DOB RPC', format('SELECT public.admin_set_player_dob(%L, %L)', P2, '1970-01-01'));
  PERFORM pg_temp.expect_no_rows(58, 'E: owner cannot edit another player''s players row',
    format('UPDATE public.players SET photo_focus_y = 1 WHERE id = %L', P1));
  PERFORM pg_temp.as_postgres();
  SELECT count(*) INTO n FROM public.players WHERE id = P2 AND date_of_birth = '1995-05-05' AND dob_verified_at IS NOT NULL;
  PERFORM pg_temp.check(59, 'E: P2''s verified DOB is unchanged after the attempts', n = 1, n || ' row(s) with original verified DOB');

  -- ═══ F: an unverified DOB never produces 'adult' ════════════════════════
  PERFORM pg_temp.as_user(ADMIN);
  PERFORM pg_temp.check(60, 'F: roster DOB 1980 but unverified → unverified',
    public.get_player_tier(P3) = 'unverified', public.get_player_tier(P3));
  PERFORM pg_temp.check(61, 'F: no DOB → unverified', public.get_player_tier(P5) = 'unverified', public.get_player_tier(P5));
  PERFORM pg_temp.check(62, 'F: roster DOB 2012 unverified → unverified', public.get_player_tier(P4) = 'unverified', public.get_player_tier(P4));
  PERFORM public.admin_set_player_dob(P5, '1985-01-01', false);
  PERFORM pg_temp.check(63, 'F: admin stores an adult DOB but unverified → unverified', public.get_player_tier(P5) = 'unverified', public.get_player_tier(P5));
  PERFORM pg_temp.check(64, 'F: verified adult DOB (claim approved) → adult', public.get_player_tier(P2) = 'adult', public.get_player_tier(P2));
  PERFORM public.approve_claim((SELECT v::uuid FROM ctx WHERE k = 'p1_claim'), '2011-03-03');
  PERFORM pg_temp.check(65, 'F: verified DOB under 18 → u18', public.get_player_tier(P1) = 'u18', public.get_player_tier(P1));
  PERFORM public.revoke_claim((SELECT v::uuid FROM ctx WHERE k = 'p2_claim'));
  PERFORM pg_temp.check(66, 'F: revoking an adult''s claim drops them back to unverified', public.get_player_tier(P2) = 'unverified', public.get_player_tier(P2));
  PERFORM pg_temp.as_postgres();
  SELECT count(*) INTO bad FROM public.players p
   WHERE private.player_tier(p.date_of_birth, p.dob_verified_at) = 'adult'
     AND (p.dob_verified_at IS NULL OR p.date_of_birth IS NULL OR p.date_of_birth > CURRENT_DATE - interval '18 years');
  PERFORM pg_temp.check(67, 'F: across ALL players, nothing unverified/under-18 is tiered adult', bad = 0, bad || ' violations');

  -- ═══ G: public reads never leak DOB, age or socials for u18/unverified ══
  PERFORM pg_temp.as_anon();
  PERFORM pg_temp.expect_error(70, 'G: signed-out cannot read players.date_of_birth', 'SELECT date_of_birth FROM public.players LIMIT 1');
  PERFORM pg_temp.expect_error(71, 'G: signed-out cannot read players.age_years', 'SELECT age_years FROM public.players LIMIT 1');
  PERFORM pg_temp.expect_error(72, 'G: signed-out cannot read players.social_instagram', 'SELECT social_instagram FROM public.players LIMIT 1');
  PERFORM pg_temp.expect_error(73, 'G: signed-out cannot select * from players', 'SELECT * FROM public.players LIMIT 1');
  PERFORM pg_temp.expect_error(74, 'G: signed-out cannot list profile slugs', 'SELECT profile_slug FROM public.players LIMIT 1');
  PERFORM pg_temp.expect_error(75, 'G: signed-out cannot read owner fields directly', 'SELECT * FROM public.player_owner_fields LIMIT 1');
  PERFORM pg_temp.as_user(UB);
  PERFORM pg_temp.expect_error(76, 'G: signed-in user cannot read players.date_of_birth', 'SELECT date_of_birth FROM public.players LIMIT 1');

  -- Every player in the database through the public details function.
  PERFORM pg_temp.as_anon();
  SELECT count(*) INTO bad
    FROM public.players p, LATERAL public.get_player_public_details(p.id) d
   WHERE d.is_restricted AND (d.date_of_birth IS NOT NULL OR d.age_years IS NOT NULL OR d.instagram_handle IS NOT NULL OR d.profile_slug IS NOT NULL);
  PERFORM pg_temp.check(77, 'G: get_player_public_details — no restricted player (of all players) leaks DOB/age/IG/slug', bad = 0, bad || ' leaks');

  SELECT count(*) INTO n FROM public.get_player_public_details(P3) d WHERE d.date_of_birth IS NULL AND d.instagram_handle IS NULL AND d.is_restricted;
  PERFORM pg_temp.check(78, 'G: unverified adult-aged roster player (P3) shows no DOB/IG', n = 1, n::text);

  PERFORM pg_temp.as_postgres();
  SELECT profile_slug INTO v_slug FROM public.players WHERE id = P1;
  PERFORM pg_temp.as_anon();
  SELECT count(*) INTO n FROM public.get_public_profile(v_slug) g
   WHERE g.date_of_birth IS NULL AND g.age_years IS NULL AND g.instagram_handle IS NULL
     AND NOT g.is_indexable AND g.display_name = 'Testone A.';
  PERFORM pg_temp.check(79, 'G: /p/ for a verified u18 — masked name, noindex, no DOB/age/IG', n = 1, 'slug ' || v_slug);
  PERFORM pg_temp.check(80, 'G: u18 /p/ slug does not contain the surname', v_slug NOT LIKE '%alpha%', v_slug);
  SELECT count(*) INTO n FROM public.get_public_profile('claimtest-p2');
  PERFORM pg_temp.check(81, 'G: /p/ lookup by the old stats slug returns nothing', n = 0, n || ' rows');

  PERFORM pg_temp.as_postgres();
END $$;

-- ── output ─────────────────────────────────────────────────────────────────
SELECT step, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM results
UNION ALL
SELECT 999, CASE WHEN bool_and(pass) THEN 'PASS' ELSE 'FAIL' END,
       count(*) FILTER (WHERE pass) || ' / ' || count(*) || ' checks passed', NULL
  FROM results
ORDER BY step;

ROLLBACK;
