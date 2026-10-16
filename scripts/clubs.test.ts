// Run with: npx tsx --test scripts/clubs.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// server/clubs.ts builds a Supabase client on import; the standing rules are pure, so give it dummy env.
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test";
process.env.VITE_SUPABASE_URL ||= "http://localhost:54321";

const { coachStanding } = await import("../server/clubs");

const club = { id: "c1", club_key: "gloucestercitykings|||" };

test("an approved coach row puts the account in that club", () => {
  assert.deepEqual(coachStanding([{ status: "approved", club }]), { kind: "member", clubId: "c1", clubKey: "gloucestercitykings|||" });
});

test("an account with no member rows is a hand-provisioned coach scoped by team_id", () => {
  assert.deepEqual(coachStanding([]), { kind: "legacy" });
});

test("a revoked coach is blocked, not treated as a legacy account", () => {
  assert.deepEqual(coachStanding([{ status: "revoked", club }]), { kind: "blocked" });
});

test("a pending coach is blocked until approved", () => {
  assert.deepEqual(coachStanding([{ status: "pending", club }]), { kind: "blocked" });
});

test("an approved row wins over a revoked one for another club", () => {
  const other = { id: "c2", club_key: "bathbasketball|||" };
  assert.deepEqual(coachStanding([{ status: "revoked", club: other }, { status: "approved", club }]), { kind: "member", clubId: "c1", clubKey: "gloucestercitykings|||" });
});

test("an approved row whose club can't be read doesn't grant access", () => {
  assert.deepEqual(coachStanding([{ status: "approved", club: null }]), { kind: "blocked" });
});
