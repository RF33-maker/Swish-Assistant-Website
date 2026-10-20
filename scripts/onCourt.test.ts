// Run with: npx tsx --test scripts/onCourt.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { onCourtFor, onCourtKey, type OnCourtEvent, type OnCourtPlayer } from "../client/src/lib/onCourt";

const starters: OnCourtPlayer[] = ["a", "b", "c", "d", "e"].map((id, i) => ({ playerId: id, shirt: i, teamNo: 1 }));
let n = 0;
const sub = (sub_type: "in" | "out", player_id: string | null, extra: Partial<OnCourtEvent> = {}): OnCourtEvent =>
  ({ action_number: ++n, action_type: "substitution", sub_type, team_no: 1, player_id, shirt_number: null, ...extra });
const ids = (s: Set<string> | null) => [...(s ?? [])].map((k) => k.replace("id|", "")).sort().join("");

test("starters are on court before any substitution", () => {
  assert.equal(ids(onCourtFor(1, starters, [])), "abcde");
});

test("a swap takes one off and puts one on", () => {
  n = 0;
  assert.equal(ids(onCourtFor(1, starters, [sub("out", "a"), sub("in", "f")])), "bcdef");
});

test("events are applied in action order, not array order", () => {
  n = 0;
  const events = [sub("out", "a"), sub("in", "f"), sub("out", "f"), sub("in", "a")];
  assert.equal(ids(onCourtFor(1, starters, [...events].reverse())), "abcde");
});

test("the other side's substitutions are ignored", () => {
  n = 0;
  assert.equal(ids(onCourtFor(1, starters, [sub("out", "a", { team_no: 2 }), sub("in", "z", { team_no: 2 })])), "abcde");
});

test("a sub with no player id is matched through the shirt number", () => {
  n = 0;
  assert.equal(ids(onCourtFor(1, starters, [sub("out", null, { shirt_number: 0 }), sub("in", "f")])), "bcdef");
});

test("returns null rather than a wrong lineup when the five do not add up", () => {
  n = 0;
  assert.equal(onCourtFor(1, starters, [sub("out", "a")]), null);
  assert.equal(onCourtFor(2, starters, []), null);
});

test("key helper agrees with the set", () => {
  assert.ok(onCourtFor(1, starters, [])!.has(onCourtKey(1, "c", 2)));
});
