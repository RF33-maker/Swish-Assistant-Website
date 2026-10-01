-- Storage policy lockdown
--
-- Before this migration any signed-in user could:
--   • upload any file to ANY bucket under <bucket>/<their uid>/…  ("Allow user uploads")
--   • upload / overwrite / delete any file in team-logos and league-banners
--   • upload to news-images
--   • read / overwrite / delete every file in "XLSX Uploads"
-- and anyone (even signed out) could read every file in the private
-- user-uploads bucket.
--
-- What the app actually needs from browser-side storage writes:
--   • player-photos  – admin photo uploads (existing admin policies, unchanged)
--                      + verified owners (owner policies from claimable profiles 4/5)
--   • news-images    – NewsManager (admin page) uploads/removes
--   • XLSX Uploads   – LeagueAdmin (admin page) uploads; the parser reads with
--                      the service key
--   • team-logos / league-banners – uploaded by server endpoints with the
--                      service key after a league-ownership check; no browser
--                      writes needed
--   • user-uploads   – no current code uses it (29 files from 2025)
--
-- "Admin" here matches the existing player-photos policies and the client's
-- isAdmin: app_metadata.role = 'admin' (server-set only), or app_admins.
-- Service-role writes (server endpoints) bypass RLS and are unaffected.
-- Public read policies for public buckets are unchanged.

-- ── user-uploads: scope to its own bucket and the uploader's folder ────────
DROP POLICY IF EXISTS "Allow user uploads" ON storage.objects;
CREATE POLICY "Allow user uploads"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND (SELECT auth.uid())::TEXT = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Allow user updates" ON storage.objects;
CREATE POLICY "Allow user updates"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (SELECT auth.uid())::TEXT = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND (SELECT auth.uid())::TEXT = (storage.foldername(name))[1]
  );

-- Was readable by anyone, signed in or not.
DROP POLICY IF EXISTS "Allow backend read access" ON storage.objects;
CREATE POLICY "user-uploads read own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (SELECT auth.uid())::TEXT = (storage.foldername(name))[1]
  );

-- ── team-logos: admin-only browser writes ──────────────────────────────────
DROP POLICY IF EXISTS "Allow authenticated uploads to team-logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their uploads in team-logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their uploads in team-logos" ON storage.objects;

CREATE POLICY "Admins write team-logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'team-logos'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );
CREATE POLICY "Admins update team-logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  )
  WITH CHECK (
    bucket_id = 'team-logos'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );
CREATE POLICY "Admins delete team-logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );

-- ── league-banners: admin-only browser writes ──────────────────────────────
DROP POLICY IF EXISTS "Allow authenticated uploads to league-banners" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their uploads in league-banners" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their uploads in league-banners" ON storage.objects;

CREATE POLICY "Admins write league-banners"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'league-banners'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );
CREATE POLICY "Admins update league-banners"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'league-banners'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  )
  WITH CHECK (
    bucket_id = 'league-banners'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );
CREATE POLICY "Admins delete league-banners"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'league-banners'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );

-- ── news-images: admin-only writes (NewsManager also removes old images) ───
DROP POLICY IF EXISTS "Allow authenticated upload to news-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload to news_article" ON storage.objects;  -- bucket doesn't exist

CREATE POLICY "Admins write news-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'news-images'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );
CREATE POLICY "Admins update news-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'news-images'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  )
  WITH CHECK (
    bucket_id = 'news-images'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );
CREATE POLICY "Admins delete news-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'news-images'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );

-- ── XLSX Uploads: admin-only (the parser uses the service key) ─────────────
DROP POLICY IF EXISTS "xlsx uploads insert" ON storage.objects;
DROP POLICY IF EXISTS "xlsx uploads select" ON storage.objects;
DROP POLICY IF EXISTS "xlsx uploads update" ON storage.objects;
DROP POLICY IF EXISTS "xlsx uploads delete" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads for authenticated users" ON storage.objects;  -- 'xlsx-uploads' bucket doesn't exist
DROP POLICY IF EXISTS "Allow read for authenticated users" ON storage.objects;     -- 'xlsx-uploads' bucket doesn't exist

CREATE POLICY "Admins read XLSX Uploads"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'XLSX Uploads'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );
CREATE POLICY "Admins write XLSX Uploads"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'XLSX Uploads'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );
CREATE POLICY "Admins update XLSX Uploads"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'XLSX Uploads'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  )
  WITH CHECK (
    bucket_id = 'XLSX Uploads'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );
CREATE POLICY "Admins delete XLSX Uploads"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'XLSX Uploads'
    AND ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()))
  );
