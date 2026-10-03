-- Lock news_articles down to admins
--
-- The live policies didn't match migrations/0003. Before this migration:
--   • "Enable insert for authenticated users only" let any signed-in user add
--     an article (published by default, so straight onto the homepage)
--   • "Authenticated update" let any signed-in user rewrite any published
--     article
--   • there was no DELETE policy, so NewsManager's delete matched 0 rows
--     without an error, after it had already removed the cover image
--   • there was no read-all policy, so drafts never showed in NewsManager
--
-- What the app actually needs from the browser:
--   • public pages read published articles (existing policy, unchanged)
--   • NewsManager (admin page) lists every article, drafts included, and
--     deletes articles
-- Creates and edits go through /api/news-articles with the service key, which
-- bypasses RLS; those endpoints now require an admin.
--
-- "Admin" matches the news-images storage policies and the client's isAdmin:
-- app_metadata.role = 'admin' (server-set only), or app_admins.

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.news_articles;
DROP POLICY IF EXISTS "Authenticated update" ON public.news_articles;
-- Policy names from migrations/0003, in case that file is ever re-run
DROP POLICY IF EXISTS "Authenticated can insert news" ON public.news_articles;
DROP POLICY IF EXISTS "Authenticated can update news" ON public.news_articles;
DROP POLICY IF EXISTS "Authenticated can delete news" ON public.news_articles;
DROP POLICY IF EXISTS "Authenticated can read all news" ON public.news_articles;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.news_articles FROM anon, authenticated;
GRANT SELECT ON public.news_articles TO anon, authenticated;
GRANT DELETE ON public.news_articles TO authenticated;

CREATE POLICY "news_articles_admin_select" ON public.news_articles
  FOR SELECT TO authenticated
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()));
CREATE POLICY "news_articles_admin_delete" ON public.news_articles
  FOR DELETE TO authenticated
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin' OR (SELECT public.is_app_admin()));
