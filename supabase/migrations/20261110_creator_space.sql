-- Creator space · the photographers, videographers and designers around the
-- game get a place of their own: richer profiles, the teams they work with,
-- the games they'll be at, and a members-only board to talk and share work.
--
-- A creator is not a new kind of account. It is an ordinary Swish account with
-- a claimed photographers row (public.photographers.user_id). That one fact
-- opens the creator space and gives the account Swish+ for free.
--
-- photographers (new columns) – what they make, what they're open to, and
--                               whether their upcoming games show in public.
-- creator_teams               – the teams a creator works with, linked to the
--                               real team rows so logos and fixtures line up.
-- creator_attendance          – "I'll be at this game", per fixture.
-- creator_posts / _replies    – the members-only board. Written only by the
--                               site's server, which checks each one first.
-- creator_post_likes          – likes on board posts.
-- creator_reports             – a member flags a post or reply for the admins.
--
-- Builds on 20261108_media_spotlight.sql (photographers, is_media_admin,
-- owns_photographer, owns_photo_folder) and 20261106_swish_plus_entitlements.sql.

-- ── who is a creator ───────────────────────────────────────────────────────
-- The signed-in account's own creator profile, when it has claimed one.
CREATE OR REPLACE FUNCTION public.my_creator_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT id FROM public.photographers
  WHERE user_id = (SELECT auth.uid()) AND status = 'claimed'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_creator_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_creator_id() TO anon, authenticated, service_role;

-- May this session read the creator space? Creators and admins.
CREATE OR REPLACE FUNCTION public.is_creator()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.my_creator_id() IS NOT NULL OR public.is_media_admin();
$$;
REVOKE ALL ON FUNCTION public.is_creator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_creator() TO anon, authenticated, service_role;

-- ── photographers: what they make and what they're open to ─────────────────
ALTER TABLE public.photographers
  ADD COLUMN IF NOT EXISTS crafts TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS open_to TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attendance_public BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.photographers DROP CONSTRAINT IF EXISTS photographers_crafts_check;
ALTER TABLE public.photographers ADD CONSTRAINT photographers_crafts_check
  CHECK (crafts <@ ARRAY['photo', 'video', 'design', 'social', 'writing', 'commentary']::TEXT[]);
ALTER TABLE public.photographers DROP CONSTRAINT IF EXISTS photographers_open_to_check;
ALTER TABLE public.photographers ADD CONSTRAINT photographers_open_to_check
  CHECK (open_to <@ ARRAY['collabs', 'second_shooter', 'club_work', 'paid_work', 'mentoring']::TEXT[]);

-- Everyone already here shoots photos.
UPDATE public.photographers SET crafts = ARRAY['photo'] WHERE crafts = '{}';

-- ── creator_teams ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  team_name       TEXT NOT NULL CHECK (char_length(team_name) BETWEEN 1 AND 120),  -- as the fixtures spell it
  league_id       UUID,                    -- the competition it was picked from, for the logo; null = typed by hand
  role            TEXT CHECK (role IS NULL OR char_length(role) <= 40),  -- "Club photographer", "Freelance"
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (photographer_id, team_name)
);
CREATE INDEX IF NOT EXISTS idx_creator_teams_photographer ON public.creator_teams (photographer_id, position);

-- The teams typed on profiles so far, linked to a real team row where the name matches.
INSERT INTO public.creator_teams (photographer_id, team_name, league_id, position)
SELECT p.id, t.name, (SELECT x.league_id FROM public.teams x WHERE lower(x.name) = lower(t.name) ORDER BY x.created_at DESC LIMIT 1), t.ord
FROM public.photographers p, unnest(p.teams) WITH ORDINALITY AS t(name, ord)
WHERE btrim(t.name) <> ''
ON CONFLICT (photographer_id, team_name) DO NOTHING;

-- photographers.teams stays the plain list of names (the Feed and the old
-- chips read it); it now follows creator_teams.
CREATE OR REPLACE FUNCTION public.creator_teams_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN target := OLD.photographer_id; ELSE target := NEW.photographer_id; END IF;
  UPDATE public.photographers p
  SET teams = COALESCE((SELECT array_agg(ct.team_name ORDER BY ct.position, ct.created_at)
                        FROM public.creator_teams ct WHERE ct.photographer_id = target), '{}')
  WHERE p.id = target;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS creator_teams_sync ON public.creator_teams;
CREATE TRIGGER creator_teams_sync AFTER INSERT OR UPDATE OR DELETE ON public.creator_teams
  FOR EACH ROW EXECUTE FUNCTION public.creator_teams_sync();

-- ── creator_attendance ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  game_key        TEXT NOT NULL REFERENCES public.game_schedule(game_key) ON UPDATE CASCADE ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'maybe')),
  note            TEXT CHECK (note IS NULL OR char_length(note) <= 200),  -- "Shooting for the home side, baseline"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (photographer_id, game_key)
);
CREATE INDEX IF NOT EXISTS idx_creator_attendance_game ON public.creator_attendance (game_key);

-- ── the board ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The creator who wrote it; null for a post from the Swish team (an admin without a creator profile).
  photographer_id UUID REFERENCES public.photographers(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic           TEXT NOT NULL DEFAULT 'general'
                  CHECK (topic IN ('general', 'work', 'advice', 'gear', 'collab', 'question')),
  body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  -- Pictures shared with the post: [{ "path": "<folder>/posts/<id>.webp", "w": 1600, "h": 1067 }], in the creator-space bucket.
  images          JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(images) = 'array' AND jsonb_array_length(images) <= 6),
  -- A fixture the post is about ("anyone else at this one?").
  game_key        TEXT REFERENCES public.game_schedule(game_key) ON UPDATE CASCADE ON DELETE SET NULL,
  -- visible: members see it · held: its author + admins only · removed: taken down
  status          TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'held', 'removed')),
  moderation      JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creator_posts_feed ON public.creator_posts (created_at DESC) WHERE status = 'visible';
CREATE INDEX IF NOT EXISTS idx_creator_posts_user ON public.creator_posts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.creator_post_replies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES public.creator_posts(id) ON DELETE CASCADE,
  photographer_id UUID REFERENCES public.photographers(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  status          TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'held', 'removed')),
  moderation      JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creator_post_replies_post ON public.creator_post_replies (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_creator_post_replies_user ON public.creator_post_replies (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.creator_post_likes (
  post_id    UUID NOT NULL REFERENCES public.creator_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.creator_reports (
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'reply')),
  target_id   UUID NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (reason IN ('abuse', 'hate', 'spam', 'stolen_work', 'other')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (target_type, target_id, user_id)
);

-- ── applications: who asked, and what they make ────────────────────────────
ALTER TABLE public.photographer_applications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS crafts TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS photographer_id UUID REFERENCES public.photographers(id) ON DELETE SET NULL;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.creator_teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_attendance   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_posts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_post_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_post_likes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_reports      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.creator_teams, public.creator_attendance, public.creator_posts,
              public.creator_post_replies, public.creator_post_likes, public.creator_reports
  FROM anon, authenticated;
GRANT SELECT ON public.creator_teams, public.creator_attendance TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.creator_teams, public.creator_attendance TO authenticated;
GRANT SELECT ON public.creator_posts, public.creator_post_replies, public.creator_reports TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.creator_post_likes TO authenticated;

-- creator_teams: public with the profile; the creator and admins write.
DROP POLICY IF EXISTS "creator_teams read" ON public.creator_teams;
CREATE POLICY "creator_teams read" ON public.creator_teams FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.photographers p WHERE p.id = photographer_id));  -- photographers' own policy decides which profiles are visible

DROP POLICY IF EXISTS "creator_teams owner write" ON public.creator_teams;
CREATE POLICY "creator_teams owner write" ON public.creator_teams FOR ALL
  TO authenticated
  USING ((SELECT public.owns_photographer(photographer_id)) OR (SELECT public.is_media_admin()))
  WITH CHECK ((SELECT public.owns_photographer(photographer_id)) OR (SELECT public.is_media_admin()));

-- creator_attendance: other creators always see who'll be there; everyone
-- else only when the creator chose to show their games in public.
DROP POLICY IF EXISTS "creator_attendance read" ON public.creator_attendance;
CREATE POLICY "creator_attendance read" ON public.creator_attendance FOR SELECT
  TO anon, authenticated
  USING (
    (SELECT public.is_creator())
    OR (SELECT public.owns_photographer(photographer_id))
    OR EXISTS (SELECT 1 FROM public.photographers p
               WHERE p.id = photographer_id AND p.attendance_public AND p.status = 'claimed')
  );

DROP POLICY IF EXISTS "creator_attendance owner write" ON public.creator_attendance;
CREATE POLICY "creator_attendance owner write" ON public.creator_attendance FOR ALL
  TO authenticated
  USING ((SELECT public.owns_photographer(photographer_id)) OR (SELECT public.is_media_admin()))
  WITH CHECK ((SELECT public.owns_photographer(photographer_id)) OR (SELECT public.is_media_admin()));

-- The board: creators read what's visible, an author also sees their own held
-- posts, admins see everything. Nobody writes from the browser.
DROP POLICY IF EXISTS "creator_posts read" ON public.creator_posts;
CREATE POLICY "creator_posts read" ON public.creator_posts FOR SELECT
  TO authenticated
  USING (
    (status = 'visible' AND (SELECT public.is_creator()))
    OR (status = 'held' AND user_id = (SELECT auth.uid()))
    OR (SELECT public.is_media_admin())
  );

DROP POLICY IF EXISTS "creator_post_replies read" ON public.creator_post_replies;
CREATE POLICY "creator_post_replies read" ON public.creator_post_replies FOR SELECT
  TO authenticated
  USING (
    (status = 'visible' AND (SELECT public.is_creator()))
    OR (status = 'held' AND user_id = (SELECT auth.uid()))
    OR (SELECT public.is_media_admin())
  );

DROP POLICY IF EXISTS "creator_post_likes read" ON public.creator_post_likes;
CREATE POLICY "creator_post_likes read" ON public.creator_post_likes FOR SELECT
  TO authenticated USING ((SELECT public.is_creator()));

DROP POLICY IF EXISTS "creator_post_likes own insert" ON public.creator_post_likes;
CREATE POLICY "creator_post_likes own insert" ON public.creator_post_likes FOR INSERT
  TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.is_creator()));

DROP POLICY IF EXISTS "creator_post_likes own delete" ON public.creator_post_likes;
CREATE POLICY "creator_post_likes own delete" ON public.creator_post_likes FOR DELETE
  TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "creator_reports admin read" ON public.creator_reports;
CREATE POLICY "creator_reports admin read" ON public.creator_reports FOR SELECT
  TO authenticated USING ((SELECT public.is_media_admin()));

-- ── storage: pictures shared on the board ──────────────────────────────────
-- Private: only creators can open them (through short-lived signed links).
-- Files sit under <photographer id>/posts/…, or swish/… for the Swish team.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('creator-space', 'creator-space', FALSE, 10485760, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "creator-space member read" ON storage.objects;
CREATE POLICY "creator-space member read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'creator-space' AND (SELECT public.is_creator()));

DROP POLICY IF EXISTS "creator-space owner insert" ON storage.objects;
CREATE POLICY "creator-space owner insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'creator-space'
              AND ((SELECT public.owns_photo_folder(name)) OR (SELECT public.is_media_admin())));

DROP POLICY IF EXISTS "creator-space owner delete" ON storage.objects;
CREATE POLICY "creator-space owner delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'creator-space'
         AND ((SELECT public.owns_photo_folder(name)) OR (SELECT public.is_media_admin())));

-- ── following a creator ────────────────────────────────────────────────────
-- Fans follow creators the way they follow players and teams; the key is the
-- profile's slug.
ALTER TABLE public.user_follows DROP CONSTRAINT IF EXISTS user_follows_kind_check;
ALTER TABLE public.user_follows ADD CONSTRAINT user_follows_kind_check
  CHECK (kind IN ('player', 'team', 'league', 'creator'));

-- ── Swish+ for creators ────────────────────────────────────────────────────
-- A claimed creator profile carries Swish+ with it, for as long as the
-- profile stays claimed and visible. No expiry, nothing to pay.
ALTER TABLE public.user_entitlements DROP CONSTRAINT IF EXISTS user_entitlements_source_check;
ALTER TABLE public.user_entitlements ADD CONSTRAINT user_entitlements_source_check
  CHECK (source IN ('apple', 'stripe', 'coach_bundle', 'manual', 'creator'));

CREATE OR REPLACE FUNCTION public.creator_plus_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Whoever held it before no longer does (the profile went, changed hands or was hidden).
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.user_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.status <> 'claimed') THEN
    DELETE FROM public.user_entitlements
    WHERE user_id = OLD.user_id AND entitlement = 'plus' AND source = 'creator';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.user_id IS NOT NULL AND NEW.status = 'claimed' THEN
    INSERT INTO public.user_entitlements (user_id, entitlement, source, external_ref, expires_at)
    VALUES (NEW.user_id, 'plus', 'creator', NEW.id::text, NULL)
    ON CONFLICT (user_id, entitlement, source)
    DO UPDATE SET external_ref = EXCLUDED.external_ref, expires_at = NULL, updated_at = NOW();
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS creator_plus_sync ON public.photographers;
CREATE TRIGGER creator_plus_sync AFTER INSERT OR DELETE OR UPDATE OF user_id, status ON public.photographers
  FOR EACH ROW EXECUTE FUNCTION public.creator_plus_sync();

-- Creators who claimed before this existed.
INSERT INTO public.user_entitlements (user_id, entitlement, source, external_ref, expires_at)
SELECT user_id, 'plus', 'creator', id::text, NULL
FROM public.photographers
WHERE user_id IS NOT NULL AND status = 'claimed'
ON CONFLICT (user_id, entitlement, source) DO NOTHING;

COMMENT ON TABLE public.creator_posts IS 'Members-only creator board. Server writes (checked first); creators read visible posts.';
COMMENT ON TABLE public.creator_attendance IS 'Which fixtures a creator will be at. Other creators always see it; the public only when photographers.attendance_public.';
