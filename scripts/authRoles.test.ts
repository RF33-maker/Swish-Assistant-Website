// Run with: npx tsx --test scripts/authRoles.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { resolveRoles, previewAllowed, isRealAdmin } from "../client/src/lib/authRoles";

const admin = { id: "a1", email: "admin@example.com", email_confirmed_at: "2026-01-01", app_metadata: { role: "admin" } };
const coach = { id: "c1", email: "coach@example.com", email_confirmed_at: "2026-01-01", app_metadata: { role: "coach", team_id: "team-own" } };
const member = { id: "m1", email: "member@example.com", email_confirmed_at: "2026-01-01", app_metadata: {} };

test("an admin previewing a team is an admin AND that team's coach", () => {
  const r = resolveRoles({ realUser: admin, viewAsTeam: "team-valur" });
  assert.equal(r.isAdmin, true);
  assert.equal(r.isCoach, true);
  assert.equal(r.isRealAdmin, true);
  assert.equal(r.teamId, "team-valur");
  assert.equal(r.user.app_metadata.role, "admin");
});

test("an admin who is not previewing keeps the plain admin view", () => {
  const r = resolveRoles({ realUser: admin, viewAsTeam: null });
  assert.deepEqual([r.isAdmin, r.isCoach, r.teamId], [true, false, null]);
});

test("the preview is only allowed for a signed-in admin on the live site", () => {
  assert.equal(previewAllowed(admin, false), true);
  assert.equal(previewAllowed(coach, false), false);
  assert.equal(previewAllowed(member, false), false);
  assert.equal(previewAllowed(null, false), false);
  assert.equal(previewAllowed(null, true), true, "the dev server stays open");
});

test("a coach or member cannot become admin through the preview", () => {
  // viewAsTeam is only ever non-null when previewAllowed was true, but even if it were passed:
  const r = resolveRoles({ realUser: member, viewAsTeam: "team-x" });
  assert.equal(r.isAdmin, false);
  assert.equal(r.isRealAdmin, false);
  assert.equal(r.user.app_metadata.role, "coach");
});

test("a coach keeps their own team and is not admin", () => {
  const r = resolveRoles({ realUser: coach, viewAsTeam: null });
  assert.deepEqual([r.isAdmin, r.isCoach, r.teamId], [false, true, "team-own"]);
});

test("the dev server without a login previews as a plain coach", () => {
  const r = resolveRoles({ realUser: null, viewAsTeam: "team-valur" });
  assert.deepEqual([r.isAdmin, r.isCoach, r.teamId], [false, true, "team-valur"]);
  assert.ok(r.user.email_confirmed_at);
});

test("signed out with no preview is nobody", () => {
  const r = resolveRoles({ realUser: null, viewAsTeam: null });
  assert.deepEqual([r.user, r.isAdmin, r.isCoach, r.teamId], [null, false, false, null]);
  assert.equal(isRealAdmin(null), false);
});
