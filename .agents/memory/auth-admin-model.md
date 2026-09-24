---
name: Auth and admin access model
description: How authentication and admin authorization work across client and server.
---

# Auth and admin access model

## The rule
`app_metadata.role === "admin"` (set via Supabase service-role key, never from the browser) is the single source of truth for owner/admin status.

**Why:** `app_metadata` is write-protected from the client — only the service-role key can modify it. This makes it tamper-proof; browser state cannot escalate privileges.

**How to apply:**
- Server: `requireAdmin(req, res)` helper in `server/routes.ts` verifies the bearer token + `app_metadata.role`. Use it on every privileged API endpoint.
- Client: `useAuth().isAdmin` is derived from `(user as any)?.app_metadata?.role === "admin"`. Use `AdminRoute` in `client/src/lib/protected-route.tsx` for admin-only pages.
- New admin pages → add `<AdminRoute>` in `client/src/App.tsx` and show them conditionally based on `isAdmin` in navigation/dashboard.

## Route split
- `ProtectedRoute` = any authenticated user (dashboard, profile, settings, payment)
- `AdminRoute` = authenticated + admin role (league-management, league-admin/:slug, news-manager, admin/import-players, teams/:slug, league-teams/:slug, team-logos/:slug, social-tools, api-widgets). Note: this is stricter than this doc used to say — social-tools/api-widgets/coaches-hub are NOT open to plain standard members today, despite earlier wording here implying otherwise.
- `TeamRoute` = authenticated + (admin OR coach) (coaches-hub only). Added for the coach/team-login feature — see below.

## Coach (team) accounts
`app_metadata.role === "coach"` + `app_metadata.team_id` — the paying-client "team login". Same tamper-proof pattern as admin. A coach's Coaches Hub auto-resolves their `team_id` to its league and opens straight into it (`CoachesHub.tsx`'s `fetchUserLeagues`), with the same full league-wide scouting access an owner has (deliberate — scouting opponents needs the whole league, not just their own team). Provisioning: `POST /api/admin/provision-coach` / `POST /api/admin/revoke-coach`, admin-only — full procedure in [`docs/coach-provisioning.md`](../../docs/coach-provisioning.md). Player accounts (one login per player, curated/shared by their coach, time-boxed to a contract) are planned but not built yet.

## RLS gotcha found and fixed (2026-09-24)
`teams` and `live_events`' public-read policies were scoped to the `anon` Postgres role only, not `public`. Since Supabase switches a logged-in session's role to `authenticated`, this meant ANY signed-in non-owner user (every free member, and this would have silently broken every coach account) got zero rows from those two tables, even for fully public leagues — while `player_stats`/`team_stats`/`shot_chart` were fine (already `public`-scoped). Fixed via `ALTER POLICY ... TO public` on both. Worth spot-checking `pg_policies` roles when adding a new public-read table — the `{anon}` vs `{public}` distinction is an easy, silent mistake to repeat.

## Owner provisioning
Full procedure in `docs/admin-bootstrap.md`. Endpoints:
- `POST /api/admin/provision-owner` — bootstrap secret or existing admin bearer token
- `POST /api/admin/revoke-owner` — existing admin bearer token only; cannot self-revoke

## Legacy auth
`server/auth.ts` contains a passport/LocalStrategy setup but `setupAuth()` is never called from `server/index.ts`. It is dead code. The app is Supabase-auth-only.
