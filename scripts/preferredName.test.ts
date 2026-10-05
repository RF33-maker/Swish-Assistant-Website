// Run with: npx tsx --test scripts/preferredName.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { checkPreferredName, splitName, sameName } from "../shared/preferredName";

test("accepts ordinary names, with spaces tidied", () => {
  assert.deepEqual(checkPreferredName("  Milo   Wallace "), { ok: true, name: "Milo Wallace" });
  assert.equal(checkPreferredName("Zewe Sinkala").ok, true);
  assert.equal(checkPreferredName("Jean-Luc O'Brien").ok, true);
  assert.equal(checkPreferredName("Mahamed Omar-Said").ok, true);
  assert.equal(checkPreferredName("José Álvarez").ok, true);
  assert.equal(checkPreferredName("J. Smith").ok, true);
});

test("rejects things that aren't a name", () => {
  for (const bad of ["", "Milo", "Milo W", "Milo 9", "http://x.com me", "a@b.co x", "Milo Wallace <script>", "1 2", "x".repeat(130) + " Smith"]) {
    assert.equal(checkPreferredName(bad).ok, false, bad);
  }
});

test("splits first and family name", () => {
  assert.deepEqual(splitName("Milo Wallace"), { firstname: "Milo", familyname: "Wallace" });
  assert.deepEqual(splitName("Mahamed Omar Said"), { firstname: "Mahamed Omar", familyname: "Said" });
});

test("same name ignores case and spacing", () => {
  assert.ok(sameName("milo  wallace", "Milo Wallace"));
  assert.ok(!sameName("Milo Wallace", "Milo Sigmund"));
});
