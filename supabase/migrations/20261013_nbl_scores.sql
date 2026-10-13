-- NBL Division Two scores, for Swish Social graphics only
--
-- Final scores copied from Basketball England's public fixtures and results page
-- (see server/nblScores.ts). There are no stats for these games, and no competition,
-- team or player pages are built from them: this table feeds the "Division Two results"
-- card in Swish Social and nothing else.
--
-- Deliberately separate from competitions / games / team_identities.
--
-- Access: the browser never reads this table. The admin-only API in server/nblScores.ts
-- reads and writes it with the service key, so RLS is on with no policies and the
-- public roles have no grants.

CREATE TABLE IF NOT EXISTS public.nbl_scores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id       text NOT NULL,            -- Basketball England's id for the pool
  grade_name     text NOT NULL,            -- e.g. 'Division Two Men - Pool A'
  season         text NOT NULL,            -- e.g. '2026/27'
  game_date      date NOT NULL,
  tip_time       text,                     -- UK local time as shown on the site, e.g. '15:00'
  home_team      text NOT NULL,
  away_team      text NOT NULL,
  home_score     integer NOT NULL,
  away_score     integer NOT NULL,
  home_logo_url  text,
  away_logo_url  text,
  report_id      text,                     -- the game's id in the site's match report link
  scraped_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nbl_scores_scores_check CHECK (home_score >= 0 AND away_score >= 0),
  CONSTRAINT nbl_scores_game_key UNIQUE (grade_id, game_date, home_team, away_team)
);

CREATE INDEX IF NOT EXISTS nbl_scores_game_date_idx ON public.nbl_scores (game_date DESC);

ALTER TABLE public.nbl_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nbl_scores FROM anon, authenticated;
