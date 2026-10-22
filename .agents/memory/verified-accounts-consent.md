---
name: Verified accounts — consent and auth design decisions
description: Durable decisions about how registration, consent, and email verification work.
---

## Server-side registration via public Supabase REST endpoint

supabaseAdmin.auth.admin.createUser() does NOT send a confirmation email.
For email confirmation to trigger, call Supabase's public /auth/v1/signup REST endpoint
from the server (with the anon key). This is the same endpoint supabase.auth.signUp() uses.

**Why:** Admin createUser is for admin provisioning, not public signup flows.

## Consent integrity guarantee

Terms/privacy consent rows are only written by the server (POST /api/account/register) after
validating termsAccepted === true in the request body.  The server rejects any request without
this flag before any DB write occurs.

One more source exists: Scorers Table (scorerstable.app) shares these accounts and signs up straight
against Supabase, recording `terms_accepted_at` / `terms_version` in the auth user's `user_metadata`
instead. server/memberAccounts.ts creates the missing `member_profiles` row on the member's first
update-profile / update-marketing-consent call and copies that acceptance into ONE `member_consents`
row, typed `terms_<terms_version>` (e.g. `terms_2026-10-draft-1`, never the site's `terms_v1`), at the
metadata timestamp, once. Nothing is written if the timestamp or version is missing/unusable. The
metadata is client-supplied (a member can edit their own user_metadata), so it is the same trust level
as `termsAccepted: true` posted to /register, not stronger.

member_consents has SELECT-only RLS for clients — no INSERT/UPDATE policy.
member_profiles has SELECT-only RLS for clients — no UPDATE policy.
All writes to these tables go through service-role server endpoints.

**Why:** If clients can write to member_consents directly, consent records cannot be trusted
as evidence of UI acceptance. Server validation is the only provable gate.

## React Query cache must be cleared on every direct sign-out

supabase.auth.signOut() alone is not enough — queryClient.setQueryData(["user"], null) must
also be called. staleTime=Infinity on the ["user"] query means AuthPage will redirect
authenticated users away even after sign-out if the cache is not explicitly cleared.

**Why:** The redirect loop (VerifyEmailGate → /auth → dashboard) was caused by this.

## Deletion retains consent audit rows (ON DELETE SET NULL)

member_consents.user_id is nullable with ON DELETE SET NULL.
Deleting auth.users nullifies the FK rather than cascade-deleting the consent rows.
The admin process-deletion endpoint also explicitly nullifies user_id before auth deletion.
process-deletion enforces scheduled_for <= NOW() (bypass with ?force=true).

**Why:** Consent audit rows must survive user deletion for compliance.
