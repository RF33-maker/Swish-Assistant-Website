// Run with: npx tsx --test scripts/playbookSeason.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isSeasonLabel, seasonLabel, shiftSeason } from "../shared/season";

const oct2026 = new Date(Date.UTC(2026, 9, 16));

test("the current season turns over on 1 September", () => {
  assert.equal(seasonLabel(new Date(Date.UTC(2026, 7, 31))), "2025/26");
  assert.equal(seasonLabel(new Date(Date.UTC(2026, 8, 1))), "2026/27");
});

test("season labels are validated", () => {
  assert.equal(isSeasonLabel("2026/27", oct2026), true);
  assert.equal(isSeasonLabel("2025/26", oct2026), true);
  assert.equal(isSeasonLabel("2099/00", oct2026), false);   // far future
  assert.equal(isSeasonLabel("2026/28", oct2026), false);   // halves don't agree
  assert.equal(isSeasonLabel("2026-27", oct2026), false);   // wrong separator
  assert.equal(isSeasonLabel("1999/00", oct2026), false);   // too old
  assert.equal(isSeasonLabel(undefined, oct2026), false);
  assert.equal(isSeasonLabel("2026/27'; drop table x", oct2026), false);
});

test("shiftSeason steps across the century boundary correctly", () => {
  assert.equal(shiftSeason("2026/27", 1), "2027/28");
  assert.equal(shiftSeason("2026/27", -1), "2025/26");
  assert.equal(shiftSeason("2099/00", 0), "2099/00");
});
