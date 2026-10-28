// Run with: npx tsx --test scripts/periodBreak.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { periodBreakLabel } from "../client/src/lib/periodLabel";

let n = 0;
const ev = (action_type: string, sub_type: string, period: number, period_type: string | null = null) =>
  ({ action_number: ++n, action_type, sub_type, period, period_type });

// The order a FIBA feed sends a first half, the break and the start of Q3.
const firstHalf = [
  ev("period", "start", 1),
  ev("2pt", "layup", 1),
  ev("period", "end", 1),
  ev("period", "start", 2),
  ev("3pt", "jumpshot", 2),
  ev("period", "end", 2),
];
const breakSubs = [ev("substitution", "out", 3), ev("substitution", "in", 3)];
const thirdStart = ev("period", "start", 3);

test("a period in play has no break label", () => {
  assert.equal(periodBreakLabel(firstHalf.slice(0, 2)), null);
  assert.equal(periodBreakLabel(firstHalf.slice(0, 5)), null);
});

test("after Q2 ends it is halftime", () => {
  assert.equal(periodBreakLabel(firstHalf), "Halftime");
});

test("Q3 substitutions made during the break don't end halftime", () => {
  assert.equal(periodBreakLabel([...firstHalf, ...breakSubs]), "Halftime");
});

test("Q3 starting ends halftime", () => {
  assert.equal(periodBreakLabel([...firstHalf, ...breakSubs, thirdStart]), null);
});

test("other breaks name the period that ended", () => {
  assert.equal(periodBreakLabel(firstHalf.slice(0, 3)), "End Q1");
  assert.equal(periodBreakLabel([ev("period", "end", 3)]), "End Q3");
  assert.equal(periodBreakLabel([ev("period", "end", 5)]), "End OT1");
});

test("an overtime the feed numbers from 1 is not halftime", () => {
  assert.equal(periodBreakLabel([ev("period", "end", 2, "OVERTIME")]), "End OT2");
});

test("order doesn't matter: the highest action_number wins", () => {
  assert.equal(periodBreakLabel([...firstHalf, thirdStart].reverse()), null);
  assert.equal(periodBreakLabel([...firstHalf].reverse()), "Halftime");
});

test("without action numbers, the first marker in the list (newest) wins", () => {
  const bare = (sub_type: string, period: number) => ({ action_type: "period", sub_type, period });
  assert.equal(periodBreakLabel([bare("end", 2), bare("start", 2)]), "Halftime");
});

test("games with no period markers have no break label", () => {
  assert.equal(periodBreakLabel([]), null);
  assert.equal(periodBreakLabel([ev("2pt", "layup", 2)]), null);
});
