-- Claimable player profiles · 4/5 · owner-editable fields
--
-- player_owner_fields – the fields a verified owner can edit. Players never
-- write to public.players; the public view (migration 5) merges these over the
-- base row. DOB is deliberately not here — only admins change DOB.
--
-- Write access: only a user with an *approved* claim on that player_id.
-- Pending, rejected and revoked claims can't insert or update anything.
-- Admins can read/update/delete any row for moderation.
--
-- Photos: owners upload to player-photos/owners/<player_id>/<file>. The
-- bucket is already public-read (like existing player photos). photo_path
-- must point inside that folder, so an owner can't point at another player's
-- image.

CREATE TABLE IF NOT EXISTS public.player_owner_fields (
  player_id            UUID        PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  bio                  TEXT        CHECK (pg_catalog.char_length(bio) <= 1000),
  display_height_cm    INT         CHECK (display_height_cm BETWEEN 120 AND 240),
  position             TEXT        CHECK (pg_catalog.char_length(position) <= 40),
  pinned_highlight_url TEXT        CHECK (
                                     pg_catalog.char_length(pinned_highlight_url) <= 500
                                     AND pinned_highlight_url ~ '^https://'
                                   ),
  photo_path           TEXT        CHECK (photo_path LIKE 'owners/' || player_id::TEXT || '/%'),
  instagram_handle     TEXT        CHECK (instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.update_player_owner_fields_meta()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_owner_fields_meta ON public.player_owner_fields;
CREATE TRIGGER trg_player_owner_fields_meta
  BEFORE INSERT OR UPDATE ON public.player_owner_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_player_owner_fields_meta();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.player_owner_fields ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.player_owner_fields FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_owner_fields TO authenticated;

DROP POLICY IF EXISTS "owner_fields_select" ON public.player_owner_fields;
CREATE POLICY "owner_fields_select"
  ON public.player_owner_fields FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_app_admin())
    OR EXISTS (SELECT 1 FROM public.player_claims c
                WHERE c.player_id = player_owner_fields.player_id
                  AND c.user_id = (SELECT auth.uid())
                  AND c.status = 'approved')
  );

DROP POLICY IF EXISTS "owner_fields_insert" ON public.player_owner_fields;
CREATE POLICY "owner_fields_insert"
  ON public.player_owner_fields FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_app_admin())
    OR EXISTS (SELECT 1 FROM public.player_claims c
                WHERE c.player_id = player_owner_fields.player_id
                  AND c.user_id = (SELECT auth.uid())
                  AND c.status = 'approved')
  );

-- USING checks the existing row, WITH CHECK the new one, so an owner can't
-- move their row onto another player_id.
DROP POLICY IF EXISTS "owner_fields_update" ON public.player_owner_fields;
CREATE POLICY "owner_fields_update"
  ON public.player_owner_fields FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_app_admin())
    OR EXISTS (SELECT 1 FROM public.player_claims c
                WHERE c.player_id = player_owner_fields.player_id
                  AND c.user_id = (SELECT auth.uid())
                  AND c.status = 'approved')
  )
  WITH CHECK (
    (SELECT public.is_app_admin())
    OR EXISTS (SELECT 1 FROM public.player_claims c
                WHERE c.player_id = player_owner_fields.player_id
                  AND c.user_id = (SELECT auth.uid())
                  AND c.status = 'approved')
  );

-- Owners clear fields by setting them to NULL; only admins delete rows.
DROP POLICY IF EXISTS "owner_fields_delete_admin" ON public.player_owner_fields;
CREATE POLICY "owner_fields_delete_admin"
  ON public.player_owner_fields FOR DELETE
  TO authenticated
  USING ((SELECT public.is_app_admin()));

-- ── Storage: owner photo uploads ───────────────────────────────────────────
-- player-photos/owners/<player_id>/<file>.(jpg|jpeg|png|webp)
DROP POLICY IF EXISTS "Owners upload own player photo" ON storage.objects;
CREATE POLICY "Owners upload own player photo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'player-photos'
    AND (storage.foldername(name))[1] = 'owners'
    AND pg_catalog.lower(storage.extension(name)) IN ('jpg','jpeg','png','webp')
    AND EXISTS (SELECT 1 FROM public.player_claims c
                 WHERE c.player_id::TEXT = (storage.foldername(name))[2]
                   AND c.user_id = (SELECT auth.uid())
                   AND c.status = 'approved')
  );

DROP POLICY IF EXISTS "Owners update own player photo" ON storage.objects;
CREATE POLICY "Owners update own player photo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND (storage.foldername(name))[1] = 'owners'
    AND EXISTS (SELECT 1 FROM public.player_claims c
                 WHERE c.player_id::TEXT = (storage.foldername(name))[2]
                   AND c.user_id = (SELECT auth.uid())
                   AND c.status = 'approved')
  )
  WITH CHECK (
    bucket_id = 'player-photos'
    AND (storage.foldername(name))[1] = 'owners'
    AND pg_catalog.lower(storage.extension(name)) IN ('jpg','jpeg','png','webp')
    AND EXISTS (SELECT 1 FROM public.player_claims c
                 WHERE c.player_id::TEXT = (storage.foldername(name))[2]
                   AND c.user_id = (SELECT auth.uid())
                   AND c.status = 'approved')
  );

DROP POLICY IF EXISTS "Owners delete own player photo" ON storage.objects;
CREATE POLICY "Owners delete own player photo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND (storage.foldername(name))[1] = 'owners'
    AND EXISTS (SELECT 1 FROM public.player_claims c
                 WHERE c.player_id::TEXT = (storage.foldername(name))[2]
                   AND c.user_id = (SELECT auth.uid())
                   AND c.status = 'approved')
  );
