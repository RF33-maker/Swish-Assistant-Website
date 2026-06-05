---
name: Leagues↔Competitions rename
description: Rules and intentional exceptions for the Task #190 table/URL rename — league=brand, competition=season.
---

## The Rule
- `leagues` table (DB) = brand/series (e.g. "Hoopsfix Pro Am") → URL `/league/:slug`
- `competitions` table (DB) = season instance (e.g. "Hoopsfix Pro Am 2026") → URL `/competition/:slug`
- Column `competition_id` on `competitions` row = FK pointing to `leagues.id` (brand). No column rename.

**Why:** Previously the table names were reversed (confusing). Task #190 swapped them to match plain English.

## Intentional .from("leagues") calls that must NOT be changed
1. `client/src/pages/pages/competition/[slug].tsx` — the brand hub page; it correctly queries the `leagues` (brand) table.
2. `client/src/hooks/useGlobalSearch.ts` line ~86 — the brand-league search suggestion query; results navigate to `/league/:slug`.

All other `.from("leagues")` calls in the codebase are bugs and should be `.from("competitions")`.

## DB Migration
Script: `scripts/rename-leagues-competitions.sql`
Must be run manually in the Supabase SQL editor by the user.
PostgreSQL updates view OIDs automatically on table rename, so `v_game_results`, `v_game_detail`, `v_box_score`, `vw_player_game_scores` don't need manual updates.
Until the migration runs, the app will show `column competitions.league_id does not exist` errors.
