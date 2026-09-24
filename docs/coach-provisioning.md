# Coach (Team) Account Provisioning

This document describes how to provision and revoke coach accounts — the paying-client "team login" that opens Coaches Hub straight into one team's league, with the same full scouting access a league owner has.

---

## Role model

| Role | How it is set | What they can access |
|------|---------------|----------------------|
| **Standard member** | Default for all new sign-ups | Dashboard, Profile, Settings, public league pages |
| **Coach (team)** | Explicitly provisioned via the procedure below, scoped to one `team_id` | Everything above, plus Coaches Hub — opened directly into their team's league (Overview, Rankings, Lineups, Trends, Scouting Reports), including every other team in that league for scouting upcoming opponents |
| **Owner (admin)** | See [admin-bootstrap.md](./admin-bootstrap.md) | Everything above, plus League Management, League Admin, News Manager, Player Import |

A coach account is authorized the same tamper-proof way as admin: `app_metadata.role === "coach"` plus `app_metadata.team_id`, both writable only via the Supabase service-role key (never from the browser). Enforced client-side by `TeamRoute` (`client/src/lib/protected-route.tsx`) and server-side wherever `requireAdmin`-style checks are added for coach-scoped data going forward (e.g. future video/breakdown content).

**Why a coach sees the whole league, not just their own team:** scouting an upcoming opponent needs visibility into other teams' games and stats too — see `CoachesHub.tsx`'s team→league auto-resolution, which is exactly the same view any league owner gets once they select that league.

**What this does *not* yet cover:** individual player accounts (one login per player, time-boxed to a contract length, seeing only what their coach has shared) are a planned follow-up, not built yet. When that lands, expect a similar `role: "player"` + `team_id` + `player_id` (+ an expiry) on `app_metadata`, provisioned by the coach for their own team rather than by an admin.

---

## Provisioning a coach

Requires an existing admin's bearer token (see [admin-bootstrap.md](./admin-bootstrap.md) for how to obtain one).

### Step 1 — Find the target user ID and team ID

1. Supabase dashboard → **Authentication → Users** → copy the coach's **User UID**.
2. Find the team's `team_id` (Supabase dashboard → Table Editor → `teams`, or via the app's own APIs).

### Step 2 — Call the provisioning endpoint

```bash
curl -X POST https://<your-app-domain>/api/admin/provision-coach \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_access_token>" \
  -d '{
    "userId": "<supabase-user-uuid>",
    "teamId": "<team-uuid>"
  }'
```

A successful response looks like:

```json
{
  "success": true,
  "userId": "...",
  "email": "coach@example.com",
  "team": { "id": "...", "name": "Birmingham Rockets", "leagueId": "..." }
}
```

The endpoint verifies the team exists before granting access — it 404s on a typo'd `teamId` rather than silently provisioning a broken login.

---

## Revoking a coach account

```bash
curl -X POST https://<your-app-domain>/api/admin/revoke-coach \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_access_token>" \
  -d '{ "userId": "<target-supabase-user-uuid>" }'
```

Reverts the account to a standard free member (removes both `role` and `team_id` from `app_metadata`).
