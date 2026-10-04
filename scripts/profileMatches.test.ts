// Run with: npx tsx --test scripts/profileMatches.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { selectProfileMatches } from "../client/src/lib/profileMatches";

const p = (id: string, full_name: string, team_id: string) => ({ id, full_name, team_id });
const noah = p("noah", "Noah Saa", "T-noah");
const nestor = p("nestor", "Nestor Saa", "T-nestor");
const all = [
  noah,
  p("noah2", "Noah Saa", "T-noah2"),
  nestor,
  p("n-abbr-noah", "N. Saa", "T-noah"),
  p("n-abbr-nestor", "N. Saa", "T-nestor"),
  p("n-abbr-elsewhere", "N Saa", "T-other"),
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

test("an abbreviated record goes to the brother on its team, not both", () => {
  assert.deepEqual(ids(selectProfileMatches(all, noah)), ["n-abbr-noah", "noah", "noah2"]);
  assert.deepEqual(ids(selectProfileMatches(all, nestor)), ["n-abbr-nestor", "nestor"]);
});

test("with only one possible owner the ordinary fuzzy rule is unchanged", () => {
  const solo = [noah, p("noah2", "Noah Saa", "T-noah2"), p("abbr", "N. Saa", "T-somewhere-else")];
  assert.deepEqual(ids(selectProfileMatches(solo, noah)), ["abbr", "noah", "noah2"]);
});

test("explicit identity links always count", () => {
  assert.ok(ids(selectProfileMatches(all, noah, new Set(["n-abbr-elsewhere"]))).includes("n-abbr-elsewhere"));
});

test("a profile that is itself abbreviated is left alone", () => {
  const abbr = all[3];
  assert.ok(ids(selectProfileMatches(all, abbr)).includes("n-abbr-nestor"));
});
