-- Lock down SECURITY DEFINER functions that anyone could call
--
-- Found by the security advisor on 2026-09-30. These run with the owner's
-- privileges (bypassing RLS) and have no auth.uid()/admin check inside, yet
-- anon and authenticated could call them via /rest/v1/rpc/…:
--
--   merge_players_bulk(p_pairs)         – merges and deletes players rows
--   resolve_player_identities(game_key) – deletes/rebuilds unreviewed
--                                         player_identity_map rows
--
-- The only caller is server/routes.ts (merge-players endpoint) using the
-- service key, which keeps EXECUTE.
--
-- Also revoked: two trigger functions the advisor flags. Triggers keep firing
-- (EXECUTE isn't checked when a trigger runs); this just removes them from the
-- public API surface.

REVOKE EXECUTE ON FUNCTION public.merge_players_bulk(JSONB)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_player_identities(TEXT)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_game_schedule_poll_count()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_league_owner()                    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.merge_players_bulk(JSONB)       TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_player_identities(TEXT) TO service_role;
