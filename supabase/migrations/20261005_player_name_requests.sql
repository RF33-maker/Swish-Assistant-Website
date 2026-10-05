-- Preferred names · player_name_requests
--
-- A player who has claimed their profile can ask for a preferred name (the
-- name they actually go by, e.g. after the scorers' feed has them under an old
-- or different name). An admin approves or rejects it; admins can also set a
-- preferred name directly without a request.
--
-- Approving renames every players row the person owns and records the old
-- spellings in players.aliases so the stat-capture worker keeps matching them.
--
-- Clients never read or write this table: every action goes through the
-- server, which checks the signed-in user (admin, or an approved claim on that
-- player) with the service role. RLS is on with no policies and no grants, so
-- the table is invisible to anon and authenticated clients.

CREATE TABLE IF NOT EXISTS public.player_name_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  requested_name   TEXT        NOT NULL
                   CHECK (pg_catalog.char_length(requested_name) BETWEEN 3 AND 120),
  requested_by     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  rejection_reason TEXT        CHECK (pg_catalog.char_length(rejection_reason) <= 300),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open request per player; a new request replaces the old one.
CREATE UNIQUE INDEX IF NOT EXISTS player_name_requests_one_pending
  ON public.player_name_requests (player_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_player_name_requests_user_created
  ON public.player_name_requests (requested_by, created_at DESC);

ALTER TABLE public.player_name_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_name_requests FROM anon, authenticated;
