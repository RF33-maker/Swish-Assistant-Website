-- Clubs and club members: one club across all its competitions.
--
-- A club has a different team_id in every competition (ten "Gloucester City
-- Kings" rows in public.teams), so anything keyed on team_id fragments by
-- competition. The club's identity is the key teamClubKey() computes from its
-- name (shared/teamIdentity.ts, side-aware via server/teamSides.ts); this
-- migration stores clubs and who belongs to them. It does not touch teams,
-- players or any scraper-written table: a club's competitions are still found by
-- matching names on that key.
--
-- clubs         – one row per club, created when its first member joins.
-- club_members  – a user's role in a club: coach, player or staff. Coaches are
--                 approved by an admin; players join through an approved claim.
--
-- Like player_claims, clients never write these tables: all changes go through
-- the site's API (service role). Signed-in users can read their own memberships,
-- admins can read all, and club names/logos are public so anyone signed in can
-- read clubs.
--
-- Revoking a coach is a status change, not a delete. app_metadata.role stays on
-- the account until the server rewrites it, so the API treats "has coach rows,
-- none approved" as no access (server/clubs.ts), not as a legacy account.
--
-- A user can hold several memberships (a coach at a senior and an under-18
-- club, or coach and player in one club). One row per (club, user, role).

CREATE TABLE IF NOT EXISTS public.clubs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_key   TEXT        NOT NULL UNIQUE CHECK (club_key <> ''),
  name       TEXT        NOT NULL,
  slug       TEXT        UNIQUE,
  logo_url   TEXT,
  -- Extra spellings an admin has added when a name variant isn't caught by the key.
  aliases    TEXT[]      NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      UUID        NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL CHECK (role IN ('coach','player','staff')),
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','revoked')),
  -- Players only: the players row they own through an approved claim.
  player_id    UUID        REFERENCES public.players(id) ON DELETE RESTRICT,
  -- Set by an admin; gates anything private to a club's staff (see PR 217).
  verified     BOOLEAN     NOT NULL DEFAULT false,
  source       TEXT        NOT NULL DEFAULT 'admin'
                           CHECK (source IN ('stripe','invite','admin')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at  TIMESTAMPTZ,
  revoked_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT club_members_one_role_per_club UNIQUE (club_id, user_id, role),
  CONSTRAINT club_members_player_has_player CHECK (role <> 'player' OR player_id IS NOT NULL),
  CONSTRAINT club_members_approved_has_time CHECK (status <> 'approved' OR approved_at IS NOT NULL),
  CONSTRAINT club_members_revoked_has_time  CHECK (status <> 'revoked'  OR revoked_at  IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS club_members_user_idx ON public.club_members (user_id);
CREATE INDEX IF NOT EXISTS club_members_club_idx ON public.club_members (club_id, role, status);

CREATE OR REPLACE FUNCTION public.clubs_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clubs_touch ON public.clubs;
CREATE TRIGGER trg_clubs_touch BEFORE UPDATE ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.clubs_touch_updated_at();

DROP TRIGGER IF EXISTS trg_club_members_touch ON public.club_members;
CREATE TRIGGER trg_club_members_touch BEFORE UPDATE ON public.club_members
  FOR EACH ROW EXECUTE FUNCTION public.clubs_touch_updated_at();

-- ── RLS + grants ───────────────────────────────────────────────────────────
ALTER TABLE public.clubs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.clubs        FROM anon, authenticated;
REVOKE ALL ON public.club_members FROM anon, authenticated;

GRANT SELECT ON public.clubs        TO authenticated;
GRANT SELECT ON public.club_members TO authenticated;

DROP POLICY IF EXISTS "clubs_select_signed_in" ON public.clubs;
CREATE POLICY "clubs_select_signed_in"
  ON public.clubs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "club_members_select_own_or_admin" ON public.club_members;
CREATE POLICY "club_members_select_own_or_admin"
  ON public.club_members FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_app_admin()));
