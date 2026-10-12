-- Approval emails for player claims.
--
-- The server (server/claimEmail.ts) emails the player when an admin approves
-- their claim. These two columns record whether that worked so the claims page
-- can show "Emailed 2 hours ago" or "Not emailed" with a Resend button.
--
-- Additive and nullable: nothing existing reads or writes them. The table has
-- no grants for anon/authenticated, so only the server (service role) sees them.

ALTER TABLE public.player_claims
  ADD COLUMN IF NOT EXISTS approval_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_email_error   TEXT;
