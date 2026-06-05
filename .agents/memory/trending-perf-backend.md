---
name: Trending Performance backend caching
description: vw_player_game_scores view times out (57014) when queried directly from the browser; must go through the backend with server-side caching.
---

# Trending Performance — backend caching required

## The rule
Never query `vw_player_game_scores` (or any similarly heavy view) directly from the React frontend via the Supabase anon client. Always proxy through the Express backend so responses can be cached server-side.

**Why:** The Supabase view consistently exceeds the statement_timeout (57014) when hit by concurrent browser requests — even with LIMIT 2 and per-league scoping. The anon client has no way to extend the timeout or share a result across users.

**How to apply:**
- Backend endpoint: `GET /api/home/trending-performances` in `server/routes.ts`
- Uses `supabaseAdmin` (service role) + in-memory cache (5-min TTL)
- Concurrent requests share one `trendingInFlight` promise (deduplication)
- Frontend (`TrendingPerformanceSection.tsx`) calls this endpoint via `fetch()`
- Photo paths (`photo_path_bg_removed`) are returned as strings; URL resolution happens client-side via `getPlayerPhotoUrlCached`

**Empty state:** When `isLoading` is false and `perf` is falsy, the component returns `null` (not the loading skeleton) so there is no infinite spinner.
