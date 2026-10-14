// Run with: npx tsx --test scripts/scoutRoster.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildScoutRoster, describeStanding, parseMinutes, percentileOf, tierOf, ordinalOf, type BoxScoreRow } from "../shared/scoutRoster";

const rows = JSON.parse(readFileSync(new URL("./fixtures/iceland-womens-2026-27-box-scores.json", import.meta.url), "utf8")) as BoxScoreRow[];
const golden = JSON.parse(readFileSync(new URL("./fixtures/iceland-haukar-golden.json", import.meta.url), "utf8"));

test("minutes parse from MM:SS, MM and numbers", () => {
  assert.equal(parseMinutes("32:30"), 32.5);
  assert.equal(parseMinutes("12"), 12);
  assert.equal(parseMinutes(8.5), 8.5);
  assert.equal(parseMinutes(null), 0);
  assert.equal(parseMinutes("DNP"), 0);
});

test("percentile counts the others a player is ahead of, ties as half", () => {
  const values = [1, 2, 3, 4, 5];
  assert.deepEqual(percentileOf(5, values, true), { percentile: 100, ahead: 4, others: 4 });
  assert.deepEqual(percentileOf(1, values, true), { percentile: 0, ahead: 0, others: 4 });
  assert.equal(percentileOf(3, values, true).percentile, 50);
  // fewer is better for turnovers and fouls
  assert.equal(percentileOf(1, values, false).percentile, 100);
  assert.equal(percentileOf(5, values, false).percentile, 0);
  // a tie with one other player counts half
  assert.equal(percentileOf(3, [1, 3, 3, 5], true).percentile, Math.round(((1 + 0.5) / 3) * 100));
});

test("tiers match the page's scale", () => {
  assert.equal(tierOf(95), "Elite");
  assert.equal(tierOf(60), "Strength");
  assert.equal(tierOf(50), "Average");
  assert.equal(tierOf(41), "Average");
  assert.equal(tierOf(40), "Weakness");
  assert.equal(tierOf(11), "Weakness");
  assert.equal(tierOf(10), "Among the worst");
});

test("ordinals", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 96, 100].map(ordinalOf), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "96th", "100th"]);
});

test("Haukar's profiles match the reference calculation on the real league data", () => {
  const out = buildScoutRoster(rows, (t) => t === "Haukar");
  assert.equal(out.poolSize, golden.poolSize);
  assert.equal(out.poolRange[1], 75);
  assert.equal(out.profiles.length, Object.keys(golden.players).length);
  for (const p of out.profiles) {
    const g = golden.players[p.name];
    assert.ok(g, `unexpected profile for ${p.name}`);
    assert.deepEqual(p.strengths.map((a) => [a.label, a.percentile, a.pool]), g.strengths.map((s: any[]) => [s[0], s[1], s[2]]), `${p.name} strengths`);
    assert.deepEqual(p.weaknesses.map((a) => [a.label, a.percentile, a.pool]), g.weaknesses.map((s: any[]) => [s[0], s[1], s[2]]), `${p.name} weaknesses`);
    assert.deepEqual(p.strengths.map((a) => a.text), g.strengths.map((s: any[]) => s[3]), `${p.name} strength wording`);
    assert.deepEqual(p.weaknesses.map((a) => a.text), g.weaknesses.map((s: any[]) => s[3]), `${p.name} weakness wording`);
  }
});

test("the roster covers every Haukar player who played, most minutes first", () => {
  const { roster, profiles } = buildScoutRoster(rows, (t) => t === "Haukar");
  assert.ok(roster.length >= profiles.length);
  const mins = roster.map((r) => r.mpg);
  assert.deepEqual(mins, [...mins].sort((a, b) => b - a));
  assert.equal(roster.filter((r) => r.profiled).length, profiles.length);
  const guinn = roster.find((r) => r.name.startsWith("Jadakiss"))!;
  assert.equal(guinn.gp, 3);
  assert.equal(guinn.pts, 15.3);
});

test("strengths are above the 60th percentile and weaknesses at or below the 40th", () => {
  const { profiles } = buildScoutRoster(rows, (t) => t === "Haukar");
  for (const p of profiles) {
    p.strengths.forEach((a) => assert.ok(a.percentile >= 60));
    p.weaknesses.forEach((a) => assert.ok(a.percentile <= 40));
    assert.ok(p.strengths.length <= 3 && p.weaknesses.length <= 3);
  }
});

test("standing lines use the real pool, not 100", () => {
  assert.equal(describeStanding({ key: "x", label: "x", text: "", percentile: 96, pool: 75, ahead: 71, tier: "Elite" }), "Ahead of 71 of 74 other league players");
  assert.equal(describeStanding({ key: "x", label: "x", text: "", percentile: 100, pool: 75, ahead: 74, tier: "Elite" }), "Best of all 75 league players");
  assert.equal(describeStanding({ key: "x", label: "x", text: "", percentile: 0, pool: 49, ahead: 0, tier: "Among the worst" }), "Lowest of all 49 league players");
});

test("another team in the same data produces its own roster", () => {
  const out = buildScoutRoster(rows, (t) => t === "Valur");
  assert.ok(out.roster.length > 0);
  assert.ok(out.roster.every((r) => r.name));
  assert.ok(!out.roster.some((r) => r.name.startsWith("Jadakiss")));
});
