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
- `ProtectedRoute` = any authenticated user (dashboard, coaches-hub, social-tools, api-widgets, profile, settings, payment)
- `AdminRoute` = authenticated + admin role (league-management, league-admin/:slug, news-manager, admin/import-players, teams/:slug, league-teams/:slug, team-logos/:slug)

## Owner provisioning
Full procedure in `docs/admin-bootstrap.md`. Endpoints:
- `POST /api/admin/provision-owner` — bootstrap secret or existing admin bearer token
- `POST /api/admin/revoke-owner` — existing admin bearer token only; cannot self-revoke

## Legacy auth
`server/auth.ts` contains a passport/LocalStrategy setup but `setupAuth()` is never called from `server/index.ts`. It is dead code. The app is Supabase-auth-only.
