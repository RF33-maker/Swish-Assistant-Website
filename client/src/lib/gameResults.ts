/**
 * PostgREST filter that leaves games still in play out of a v_game_results
 * query. The view lists a live game with its running score and a "Final"
 * game_status, so standings built from it would count a half-time score as a
 * win or a loss. Rows with no schedule status are kept (older games).
 */
export const EXCLUDE_LIVE_GAMES = "schedule_status.is.null,schedule_status.neq.live";
