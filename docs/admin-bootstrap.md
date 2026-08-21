# Secure Administrator Bootstrap Procedure

This document describes how to provision and revoke owner (administrator) accounts in Swish Assistant. Owner accounts have the `admin` role in Supabase `app_metadata` and can access league management, news publishing, player imports, and all other administrative functions.

---

## Role model

| Role | How it is set | What they can access |
|------|---------------|----------------------|
| **Standard member** | Default for all new sign-ups — no extra steps required | Dashboard, Coaches Hub, Social Tools, API/Widgets, Profile, Settings |
| **Owner (admin)** | Explicitly provisioned via the procedure below | Everything above, plus League Management, League Admin, News Manager, Player Import |

Standard members cannot access admin routes, admin API endpoints, or admin navigation, even if they guess a URL directly. Authorization is enforced on both the client (`AdminRoute` component) and the server (`requireAdmin` helper) using the Supabase-signed JWT — it cannot be spoofed from the browser.

---

## Initial bootstrap (first owner account)

Use this path when no admin account exists yet.

### Step 1 — Set the bootstrap secret

Add `ADMIN_BOOTSTRAP_SECRET` to your environment secrets with a long, random value:

```
ADMIN_BOOTSTRAP_SECRET=<generate with: openssl rand -hex 32>
```

> **Important:** This secret must never be stored in source control or committed to the repository. Set it only in Replit Secrets / Vercel environment variables.

### Step 2 — Find the target user ID

1. Log into the Supabase dashboard for this project.
2. Open **Authentication → Users**.
3. Locate the account you want to promote and copy its **User UID**.

### Step 3 — Call the provisioning endpoint

```bash
curl -X POST https://<your-app-domain>/api/admin/provision-owner \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<supabase-user-uuid>",
    "bootstrapSecret": "<ADMIN_BOOTSTRAP_SECRET value>"
  }'
```

A successful response looks like:

```json
{ "success": true, "userId": "...", "email": "owner@example.com" }
```

### Step 4 — Remove the bootstrap secret

Once the first owner account is provisioned, **remove `ADMIN_BOOTSTRAP_SECRET` from the environment** so the bootstrap path is closed. Subsequent provisioning uses an existing admin's bearer token (Step 5).

---

## Provisioning additional owners (ongoing)

Once at least one owner account exists, use its bearer token to promote others — no bootstrap secret is needed.

### Step 1 — Obtain a bearer token

Log in to the app as the existing admin, then retrieve the session token:

```javascript
// In the browser console on the app
const { data } = await supabase.auth.getSession();
console.log(data.session.access_token);
```

### Step 2 — Call the provisioning endpoint

```bash
curl -X POST https://<your-app-domain>/api/admin/provision-owner \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{ "userId": "<target-supabase-user-uuid>" }'
```

---

## Revoking an owner account

Only an existing admin can revoke another admin's role. An admin cannot revoke their own role (to prevent accidental lock-out).

```bash
curl -X POST https://<your-app-domain>/api/admin/revoke-owner \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_access_token>" \
  -d '{ "userId": "<target-supabase-user-uuid>" }'
```

---

## Direct Supabase dashboard alternative

If the API endpoints are unavailable, you can set or clear the admin role directly in the Supabase dashboard:

1. Open **Authentication → Users** and select the user.
2. Click **Edit** and update the **App Metadata** JSON:
   - **Grant admin:** `{ "role": "admin" }`
   - **Revoke admin:** `{}` (or remove the `role` key)
3. Save. The change takes effect on the user's next login or token refresh.

---

## Security notes

- `app_metadata` is written exclusively via the Supabase service-role key (server-side). It cannot be modified by the user or from the browser.
- The `requireAdmin` server helper verifies every admin API call independently, using the JWT from the `Authorization` header. Client-side role state is derived from the same JWT and is not trusted for server decisions.
- New user registrations receive no `app_metadata.role` and cannot escalate their own privileges.
- Do not hardcode admin user IDs or emails in application source code.
