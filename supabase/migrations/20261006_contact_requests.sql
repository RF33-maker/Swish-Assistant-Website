-- Contact / claim requests from the public "Claim this page" and Contact forms.
--
-- Until now POST /api/contact-sales did not exist, so the form fell back to
-- opening the visitor's email app and nothing was kept. The server now stores
-- each request here (and emails the admin), and the Player Claims page lists
-- the player-page ones so they can be answered with a code or an assignment
-- from one place.
--
-- Server-only: RLS on and no grants for anon/authenticated, so only the
-- service role (server/contactRequests.ts) reads or writes it.

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       TEXT        NOT NULL DEFAULT 'general'
              CHECK (topic IN ('general','player-page','coach','league')),
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  message     TEXT        NOT NULL DEFAULT '',
  player_name TEXT,
  page_url    TEXT,
  status      TEXT        NOT NULL DEFAULT 'new' CHECK (status IN ('new','handled')),
  handled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_topic_status
  ON public.contact_requests (topic, status, created_at DESC);

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_requests FROM anon, authenticated;
