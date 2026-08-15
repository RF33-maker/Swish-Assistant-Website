---
name: player_id collisions across competitions
description: player_stats.player_id is not globally unique across different competitions/age-groups; name-matching must not be skipped just because player_id matches.
---

## The issue
In the sports-stats data model, `player_stats.player_id` is generated per source PDF/roster import and is **not guaranteed unique across different competitions**. The same UUID has been observed reused for two completely different real people playing in different age-group competitions under the same parent league (e.g. a 14U player and an unrelated 19+ player shared one `player_id`).

**Why this matters:** Any aggregation code that groups stat rows by `player_id` and blindly trusts that grouping (no name check) will silently merge two unrelated real players into one aggregate — including merging their `league_id`s. This is how a player can appear to "leak" into an age group they never played in, even when explicit `leagueIds`-overlap checks exist everywhere else in the merge pipeline (the overlap check never runs because the bad merge already happened at the very first grouping-by-id step, before any name/league check).

## How to apply
When aggregating/merging stats keyed by an externally-sourced `player_id` (or similar foreign id) that isn't a verified-unique DB primary key:
- Never merge two stat rows into the same bucket purely because their `player_id` matches — also require the names to be similar (fuzzy match) before merging into the same aggregate.
- If the id matches but the name doesn't, treat it as a **separate aggregate** (e.g. bucket by `Map<id, Aggregate[]>` and pick/create the bucket whose name matches), rather than discarding or overwriting.
- This applies to `aggregatePlayerStats` in `client/src/pages/pages/league/[slug].tsx` (parent-league player stats/leaders aggregation) — was fixed there by making `byPlayerId` a `Map<string, PlayerAggregate[]>` keyed by id, with a name-similarity lookup among that id's buckets before merging a new stat row in.
