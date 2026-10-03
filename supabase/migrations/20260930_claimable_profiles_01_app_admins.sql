-- Claimable player profiles · 1/5 · app admins
--
-- app_admins    – one row per user allowed to run admin-only RPCs and policies.
-- is_app_admin() – true when the current session user is in app_admins.
--
-- Replaces the hardcoded admin uid in the players admin policy. Other tables
-- (games, teams, shot_chart, …) still hardcode the uid and can be moved over
-- to is_app_admin() in a later migration.
--
-- Clients cannot write app_admins; rows are added via SQL / service role only.

-- ── app_admins ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_admins FROM anon, authenticated;
GRANT SELECT ON public.app_admins TO authenticated;

-- A user can see whether they themselves are an admin; nothing else.
DROP POLICY IF EXISTS "app_admins_select_own" ON public.app_admins;
CREATE POLICY "app_admins_select_own"
  ON public.app_admins FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

INSERT INTO public.app_admins (user_id)
VALUES ('02fbd7a1-c160-42aa-9017-e7197b85975b')
ON CONFLICT (user_id) DO NOTHING;

-- ── is_app_admin() ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read app_admins regardless of the caller's RLS,
-- and so policies that call it don't recurse.
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated, service_role;

-- ── players admin policy ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "owner_full_access_players" ON public.players;
CREATE POLICY "owner_full_access_players"
  ON public.players FOR ALL
  TO authenticated
  USING ((SELECT public.is_app_admin()))
  WITH CHECK ((SELECT public.is_app_admin()));
