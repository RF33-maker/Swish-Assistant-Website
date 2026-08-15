---
name: Trending Performance backend caching
description: Trending performances use vw_weekly_player_scores (not vw_player_game_scores) — lighter view that works on Vercel serverless; backend endpoint with 5-min cache.
---

# Trending Performance — architecture

## The rule
The trending performance endpoint uses `vw_weekly_player_scores` (weekly aggregated), NOT `vw_player_game_scores` (heavy per-game view). Always keep it on the weekly view.

**Why:** `vw_player_game_scores` times out (error 57014) on Vercel serverless cold starts — every invocation is fresh, no cache survives, and the view is too heavy. `vw_weekly_player_scores` is a pre-aggregated summary that queries fast even on cold starts.

**How to apply:**
- Backend endpoint: `GET /api/home/trending-performances` in `server/routes.ts`
- Queries `vw_weekly_player_scores`, limit 1 per league (top weekly performer)
- Ordered by `week_start DESC`, then `weekly_score DESC`
- `ts_pct` is NOT in the view — computed server-side: `pts / (2 * (fga + 0.44 * fta))`
- Uses `supabaseAdmin` (service role) + in-memory cache (5-min TTL, `TRENDING_TTL_MS`)
- Concurrent requests deduplicated via `trendingInFlight` promise
- Frontend (`TrendingPerformanceSection.tsx`) calls this endpoint via `fetch()`
- Photo paths (`photo_path_bg_removed`) resolved client-side via `getPlayerPhotoUrlCached`
- Field mapping: `game_score` → `weekly_score`, `game_date` → `week_start`, no `game_key`
- React Query cache key: `["home", "trending-performance", "v12-backend"]` — bump version when payload shape changes

**Empty state:** When `isLoading` is false and `perf` is falsy, the component returns `null`.
