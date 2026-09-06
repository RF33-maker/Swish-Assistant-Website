---
name: League and competition hierarchy
description: Durable database meaning and compatibility rules for league brands and competition seasons.
---

## The Rule
- `leagues` table (DB) = brand/series (e.g. "Hoopsfix Pro Am") → URL `/league/:slug`
- `competitions` table (DB) = season instance (e.g. "Hoopsfix Pro Am 2026") → URL `/competition/:slug`
- Column `competition_id` on `competitions` row = FK pointing to `leagues.id` (brand). No column rename.

**Why:** The table names were previously reversed; the live Supabase database now uses the plain-English model.

**How to apply:** Query `leagues` for brand pickers and brand metadata. Query `competitions` when stats, games, teams, or season pages provide a competition `league_id`.

## Migration status
The live database migration is complete: `leagues.id` and `competitions.league_id` both exist. Some historical competition rows still have no valid `competition_id`; preserve a legacy/unassigned fallback instead of hiding them.

## Client-side league name lookups — use the server endpoint
The anon Supabase client's `leagues` table uses `id` (not `league_id`) as its primary key. A stats row’s `league_id` points to `competitions.league_id`, not directly to a brand.

**How to apply:** Resolve competition IDs from `competitions`, then use `competitions.competition_id` to resolve the owning `leagues.id`. Use the existing public league-info endpoint when only competition display metadata is needed.
