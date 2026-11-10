-- Media Spotlight · photographers, their photos, usage permissions and credit
--
-- photographers             – one profile per photographer; an admin creates it,
--                             the photographer claims it with an invite link.
-- photographer_invites      – single-use claim tokens (stored hashed, 14-day expiry).
-- photos                    – one row per upload. The original lives in the private
--                             photo-originals bucket; the resized web variants the
--                             browser makes at upload time live in the public
--                             photo-web bucket under web_path.
-- photo_tags                – players / teams / leagues / events a photo shows.
-- spotlights                – the homepage's Photographer of the Week, one row per week.
-- photo_usage_log           – where Swish used a photo, for transparency.
-- photographer_applications – "Are you a photographer?" form on the landing page.
--
-- Public reads go through RLS. Photographers write their own row and photos
-- through RLS; the protected profile columns (status, featured, slug, user_id)
-- are held by a trigger unless the writer is an admin. Invites are consumed by
-- a server endpoint with the service key.

-- ── enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.photo_permission AS ENUM ('showcase_only', 'use_with_credit', 'ask_first', 'paid_license');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.photographer_status AS ENUM ('unclaimed', 'claimed', 'hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.photo_tag_type AS ENUM ('player', 'team', 'league', 'event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── admin check shared by every policy below ───────────────────────────────
-- Matches the client's isAdmin: app_metadata.role = 'admin' (server-set only)
-- or a row in app_admins.
CREATE OR REPLACE FUNCTION public.is_media_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'
      OR EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = (SELECT auth.uid()));
$$;
-- Called from the public read policies, so anon needs it too (it returns false without a session).
REVOKE ALL ON FUNCTION public.is_media_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_media_admin() TO anon, authenticated, service_role;

-- ── photographers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.photographers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  slug               TEXT NOT NULL UNIQUE,
  display_name       TEXT NOT NULL,
  handle             TEXT,
  bio                TEXT,
  location           TEXT,
  avatar_path        TEXT,
  socials            JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_preference TEXT NOT NULL DEFAULT 'instagram'
                     CHECK (contact_preference IN ('instagram', 'x', 'website', 'email')),
  credit_line        TEXT,
  default_permission public.photo_permission NOT NULL DEFAULT 'use_with_credit',
  teams              TEXT[] NOT NULL DEFAULT '{}',
  is_featured        BOOLEAN NOT NULL DEFAULT FALSE,
  featured_order     INTEGER,
  status             public.photographer_status NOT NULL DEFAULT 'unclaimed',
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_photographers_status ON public.photographers (status);
CREATE INDEX IF NOT EXISTS idx_photographers_featured ON public.photographers (featured_order) WHERE is_featured;

-- ── photographer_invites ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.photographer_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,    -- sha256 (hex) of the token in the link
  sent_to         TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  used_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_photographer_invites_photographer ON public.photographer_invites (photographer_id);

-- ── photos ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,            -- photo-originals/<photographer>/<photo>.<ext>
  web_path        TEXT NOT NULL,            -- photo-web/<photographer>/<photo>/{thumb,medium,large}.<variant_ext>
  variant_ext     TEXT NOT NULL DEFAULT 'webp',
  width           INTEGER,
  height          INTEGER,
  file_size       INTEGER,
  mime_type       TEXT,
  dominant_color  TEXT,                     -- "#rrggbb" placeholder while the image loads
  caption         TEXT,
  event_name      TEXT,
  taken_at        DATE,
  permission      public.photo_permission NOT NULL DEFAULT 'use_with_credit',
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  is_showcase     BOOLEAN NOT NULL DEFAULT FALSE,
  showcase_order  INTEGER,
  consent_at      TIMESTAMPTZ,              -- the photographer ticked "I own this and agree to the permission"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_photos_photographer ON public.photos (photographer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_showcase ON public.photos (photographer_id, showcase_order) WHERE is_showcase;

-- ── photo_tags ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.photo_tags (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id  UUID NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  tag_type  public.photo_tag_type NOT NULL,
  tag_value TEXT NOT NULL,
  ref_id    UUID,                           -- players.id / competitions.league_id when known
  UNIQUE (photo_id, tag_type, tag_value)
);
CREATE INDEX IF NOT EXISTS idx_photo_tags_photo ON public.photo_tags (photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_tags_value ON public.photo_tags (tag_type, tag_value);

-- ── spotlights ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.spotlights (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id     UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  week_start          DATE NOT NULL UNIQUE, -- a Monday
  blurb               TEXT,
  highlight_photo_ids UUID[] NOT NULL DEFAULT '{}',
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── photo_usage_log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.photo_usage_log (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  used_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context  TEXT
);
CREATE INDEX IF NOT EXISTS idx_photo_usage_log_photo ON public.photo_usage_log (photo_id, used_at DESC);

-- ── photographer_applications ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.photographer_applications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  handle     TEXT,
  teams      TEXT,
  message    TEXT,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── updated_at ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.media_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS photographers_touch ON public.photographers;
CREATE TRIGGER photographers_touch BEFORE UPDATE ON public.photographers
  FOR EACH ROW EXECUTE FUNCTION public.media_touch_updated_at();

-- A photographer edits their own profile, but not who owns it, whether it is
-- featured, its slug or its status. Those stay as they were unless an admin
-- (or the service key) is writing.
CREATE OR REPLACE FUNCTION public.photographers_guard_protected()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' OR public.is_media_admin() THEN
    RETURN NEW;
  END IF;
  NEW.user_id        := OLD.user_id;
  NEW.slug           := OLD.slug;
  NEW.status         := OLD.status;
  NEW.is_featured    := OLD.is_featured;
  NEW.featured_order := OLD.featured_order;
  NEW.created_by     := OLD.created_by;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS photographers_guard ON public.photographers;
CREATE TRIGGER photographers_guard BEFORE UPDATE ON public.photographers
  FOR EACH ROW EXECUTE FUNCTION public.photographers_guard_protected();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.photographers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photographer_invites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_tags                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spotlights                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_usage_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photographer_applications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.photographers, public.photographer_invites, public.photos, public.photo_tags,
              public.spotlights, public.photo_usage_log, public.photographer_applications
  FROM anon, authenticated;
GRANT SELECT ON public.photographers, public.photos, public.photo_tags, public.spotlights TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.photographers, public.photos, public.photo_tags, public.spotlights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photographer_invites, public.photo_usage_log, public.photographer_applications TO authenticated;

-- photographers: anyone sees visible profiles; a photographer sees and edits their own; admins do everything.
DROP POLICY IF EXISTS "photographers public read" ON public.photographers;
CREATE POLICY "photographers public read" ON public.photographers FOR SELECT
  TO anon, authenticated
  USING (status <> 'hidden' OR user_id = (SELECT auth.uid()) OR (SELECT public.is_media_admin()));

DROP POLICY IF EXISTS "photographers own update" ON public.photographers;
CREATE POLICY "photographers own update" ON public.photographers FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_media_admin()))
  WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT public.is_media_admin()));

DROP POLICY IF EXISTS "photographers admin insert" ON public.photographers;
CREATE POLICY "photographers admin insert" ON public.photographers FOR INSERT
  TO authenticated WITH CHECK ((SELECT public.is_media_admin()));

DROP POLICY IF EXISTS "photographers admin delete" ON public.photographers;
CREATE POLICY "photographers admin delete" ON public.photographers FOR DELETE
  TO authenticated USING ((SELECT public.is_media_admin()));

-- photos: public ones on visible profiles are readable by all; owners and admins see and write everything.
CREATE OR REPLACE FUNCTION public.owns_photographer(p_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.photographers WHERE id = p_id AND user_id = (SELECT auth.uid()));
$$;
-- Called from the public read policies, so anon needs it too (it returns false without a session).
REVOKE ALL ON FUNCTION public.owns_photographer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_photographer(UUID) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "photos public read" ON public.photos;
CREATE POLICY "photos public read" ON public.photos FOR SELECT
  TO anon, authenticated
  USING (
    (is_public AND EXISTS (SELECT 1 FROM public.photographers p WHERE p.id = photographer_id AND p.status <> 'hidden'))
    OR (SELECT public.owns_photographer(photographer_id))
    OR (SELECT public.is_media_admin())
  );

DROP POLICY IF EXISTS "photos owner write" ON public.photos;
CREATE POLICY "photos owner write" ON public.photos FOR ALL
  TO authenticated
  USING ((SELECT public.owns_photographer(photographer_id)) OR (SELECT public.is_media_admin()))
  WITH CHECK ((SELECT public.owns_photographer(photographer_id)) OR (SELECT public.is_media_admin()));

-- photo_tags follow their photo.
DROP POLICY IF EXISTS "photo_tags read" ON public.photo_tags;
CREATE POLICY "photo_tags read" ON public.photo_tags FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.photos ph WHERE ph.id = photo_id));

DROP POLICY IF EXISTS "photo_tags owner write" ON public.photo_tags;
CREATE POLICY "photo_tags owner write" ON public.photo_tags FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.photos ph WHERE ph.id = photo_id
                 AND ((SELECT public.owns_photographer(ph.photographer_id)) OR (SELECT public.is_media_admin()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.photos ph WHERE ph.id = photo_id
                 AND ((SELECT public.owns_photographer(ph.photographer_id)) OR (SELECT public.is_media_admin()))));

-- spotlights: the public sees this week's and past weeks'; admins queue future ones.
DROP POLICY IF EXISTS "spotlights public read" ON public.spotlights;
CREATE POLICY "spotlights public read" ON public.spotlights FOR SELECT
  TO anon, authenticated
  USING (week_start <= CURRENT_DATE OR (SELECT public.is_media_admin()));

DROP POLICY IF EXISTS "spotlights admin write" ON public.spotlights;
CREATE POLICY "spotlights admin write" ON public.spotlights FOR ALL
  TO authenticated
  USING ((SELECT public.is_media_admin()))
  WITH CHECK ((SELECT public.is_media_admin()));

-- invites, usage log, applications: admin only from the browser (claims and
-- the application form go through the server with the service key).
DROP POLICY IF EXISTS "photographer_invites admin" ON public.photographer_invites;
CREATE POLICY "photographer_invites admin" ON public.photographer_invites FOR ALL
  TO authenticated USING ((SELECT public.is_media_admin())) WITH CHECK ((SELECT public.is_media_admin()));

DROP POLICY IF EXISTS "photo_usage_log admin" ON public.photo_usage_log;
CREATE POLICY "photo_usage_log admin" ON public.photo_usage_log FOR ALL
  TO authenticated USING ((SELECT public.is_media_admin())) WITH CHECK ((SELECT public.is_media_admin()));

-- A photographer can see where their own photos were used.
DROP POLICY IF EXISTS "photo_usage_log owner read" ON public.photo_usage_log;
CREATE POLICY "photo_usage_log owner read" ON public.photo_usage_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.photos ph WHERE ph.id = photo_id AND (SELECT public.owns_photographer(ph.photographer_id))));

DROP POLICY IF EXISTS "photographer_applications admin" ON public.photographer_applications;
CREATE POLICY "photographer_applications admin" ON public.photographer_applications FOR ALL
  TO authenticated USING ((SELECT public.is_media_admin())) WITH CHECK ((SELECT public.is_media_admin()));

-- ── storage ────────────────────────────────────────────────────────────────
-- photo-originals: private, full-quality files. Read by the owner and admins
-- (through short-lived signed URLs); never served to the public.
-- photo-web: public, the resized variants and avatars the site shows.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('photo-originals', 'photo-originals', FALSE, 31457280,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('photo-web', 'photo-web', TRUE, 10485760, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- Files sit under <photographer id>/…; the first folder decides who may write.
CREATE OR REPLACE FUNCTION public.owns_photo_folder(object_name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.photographers
    WHERE id::text = (storage.foldername(object_name))[1]
      AND user_id = (SELECT auth.uid())
  );
$$;
-- Called from the public read policies, so anon needs it too (it returns false without a session).
REVOKE ALL ON FUNCTION public.owns_photo_folder(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_photo_folder(TEXT) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "photo-web public read" ON storage.objects;
CREATE POLICY "photo-web public read" ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'photo-web');

DROP POLICY IF EXISTS "photo-originals owner read" ON storage.objects;
CREATE POLICY "photo-originals owner read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'photo-originals' AND ((SELECT public.owns_photo_folder(name)) OR (SELECT public.is_media_admin())));

DROP POLICY IF EXISTS "photo buckets owner insert" ON storage.objects;
CREATE POLICY "photo buckets owner insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id IN ('photo-originals', 'photo-web')
              AND ((SELECT public.owns_photo_folder(name)) OR (SELECT public.is_media_admin())));

DROP POLICY IF EXISTS "photo buckets owner update" ON storage.objects;
CREATE POLICY "photo buckets owner update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id IN ('photo-originals', 'photo-web')
         AND ((SELECT public.owns_photo_folder(name)) OR (SELECT public.is_media_admin())))
  WITH CHECK (bucket_id IN ('photo-originals', 'photo-web')
              AND ((SELECT public.owns_photo_folder(name)) OR (SELECT public.is_media_admin())));

DROP POLICY IF EXISTS "photo buckets owner delete" ON storage.objects;
CREATE POLICY "photo buckets owner delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id IN ('photo-originals', 'photo-web')
         AND ((SELECT public.owns_photo_folder(name)) OR (SELECT public.is_media_admin())));
