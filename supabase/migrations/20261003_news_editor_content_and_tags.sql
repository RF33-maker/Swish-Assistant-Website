-- News editor: structured article bodies, article types and page tags
--
-- The new editor stores an article's body as a structured document
-- (news_articles.content) instead of plain text, and links each article to
-- the pages it is about (news_article_tags). Everything here is additive:
-- existing articles keep rendering from `body` until they are edited.
--
-- Writes still go through /api/news-articles with the service key (admin
-- only, see 20261002_news_articles_admin_only.sql). The browser gains nothing
-- beyond reading the tags of articles it can already read.

ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS content            jsonb,
  ADD COLUMN IF NOT EXISTS article_type       text NOT NULL DEFAULT 'news',
  ADD COLUMN IF NOT EXISTS image_alt          text,
  ADD COLUMN IF NOT EXISTS image_credit       text,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz,
  ADD COLUMN IF NOT EXISTS first_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.news_articles
  ADD CONSTRAINT news_articles_article_type_check
  CHECK (article_type IN ('news', 'preview', 'recap', 'feature', 'roundup'));

-- Existing articles were last touched, and first published, when they went up.
UPDATE public.news_articles SET updated_at = published_at WHERE updated_at IS NULL;
UPDATE public.news_articles SET first_published_at = published_at WHERE first_published_at IS NULL AND is_published;
ALTER TABLE public.news_articles ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.news_articles ALTER COLUMN updated_at SET NOT NULL;

-- The API already keeps slugs unique; this makes the database hold it to that.
CREATE UNIQUE INDEX IF NOT EXISTS news_articles_slug_key ON public.news_articles (slug) WHERE slug IS NOT NULL;

-- New articles start as drafts; publishing is an explicit step in the editor.
ALTER TABLE public.news_articles ALTER COLUMN is_published SET DEFAULT false;

-- ── Tags: which pages an article is about ──────────────────────────────────
-- `key` is the tagged page's URL key (league or competition slug, game_key,
-- club slug, player slug) rather than a row id: team and player rows are per
-- competition and get merged, while the page key stays put.
CREATE TABLE IF NOT EXISTS public.news_article_tags (
  article_id uuid NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('league', 'competition', 'game', 'team', 'player')),
  key        text NOT NULL,
  label      text NOT NULL,
  context    jsonb,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, kind, key)
);

CREATE INDEX IF NOT EXISTS news_article_tags_page_idx ON public.news_article_tags (kind, key);

ALTER TABLE public.news_article_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.news_article_tags FROM anon, authenticated;
GRANT SELECT ON public.news_article_tags TO anon, authenticated;

-- A tag is readable when its article is: the subquery runs under the caller's
-- own news_articles policies (published for everyone, drafts for admins).
CREATE POLICY "news_article_tags_select" ON public.news_article_tags
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.news_articles a WHERE a.id = article_id));

-- Existing articles carry their league as free text; link the ones that name
-- a league on the site to that league's page.
INSERT INTO public.news_article_tags (article_id, kind, key, label)
SELECT a.id, 'league', l.slug, l.name
FROM public.news_articles a
JOIN public.leagues l
  ON regexp_replace(lower(l.name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(a.league), '[^a-z0-9]+', '', 'g')
ON CONFLICT DO NOTHING;
