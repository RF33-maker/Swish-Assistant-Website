// Swish+ lineup explorer maths and the Swish+ access rule.
// Run: npx tsx --test scripts/lineup-combos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUnits, groupStints, type StintRow } from "../server/lineups";
import { buildCombos, comboMetrics, rankCombos, subsets, type StintBox } from "../server/lineupCombos";
import { decidePlusAccess } from "../server/billing/plusRules";

const ROSTER = ["Ann Able", "Bea Bell", "Cat Cole", "Dee Dunn", "Eve Ely", "Fay Fox"];

function stint(id: string, people: string[], o: { game?: string; secs?: number; pf?: number; pa?: number; posf?: number; posa?: number } = {}): StintRow[] {
  return people.map((name, i) => ({
    stint_id: id,
    game_key: o.game ?? "G1",
    team_id: "T",
    player_id: `p-${name}`,
    player_name: name,
    seconds_played: o.secs ?? 300,
    points_for: o.pf ?? 10,
    points_against: o.pa ?? 8,
    possessions_for: o.posf ?? 10,
    possessions_against: o.posa ?? 10,
  }));
}

const box = (id: string, b: Partial<StintBox> = {}): StintBox => ({
  id,
  fg2_made: 3, fg2_attempted: 6, fg3_made: 1, fg3_attempted: 3, ft_made: 1, ft_attempted: 2, oreb: 2, dreb: 4, turnovers: 1,
  opp_fg2_made: 2, opp_fg2_attempted: 6, opp_fg3_made: 1, opp_fg3_attempted: 4, opp_ft_made: 1, opp_ft_attempted: 2, opp_oreb: 1, opp_dreb: 3, opp_turnovers: 2,
  ...b,
});

test("subsets gives every combination once", () => {
  const five = ["a", "b", "c", "d", "e"];
  assert.equal(subsets(five, 2).length, 10);
  assert.equal(subsets(five, 3).length, 10);
  assert.deepEqual(subsets(five, 5), [five]);
  assert.equal(new Set(subsets(five, 2).map((s) => s.join())).size, 10);
});

test("groupStints folds the five rows of a stint and buildUnits still matches", () => {
  const rows = [...stint("s1", ROSTER.slice(0, 5)), ...stint("s2", ROSTER.slice(1, 6), { pf: 4, pa: 6 })];
  const g = groupStints(rows);
  assert.equal(g.size, 2);
  assert.equal(g.get("s1")!.members.size, 5);
  assert.equal(g.get("s1")!.pf, 10);
  const { units, stintsUsed } = buildUnits(rows);
  assert.equal(stintsUsed, 2);
  assert.equal(units.length, 2);
});

test("a pair adds up every stint both were on, whoever else was", () => {
  const rows = [
    ...stint("s1", ROSTER.slice(0, 5), { pf: 10, pa: 8 }), // Able..Ely
    ...stint("s2", ROSTER.slice(1, 6), { pf: 4, pa: 6, game: "G2" }), // Bell..Fox
  ];
  const stints = groupStints(rows).values();
  const pairs = buildCombos(stints, new Map([["s1", box("s1")], ["s2", box("s2")]]), 2);
  const bellCole = pairs.find((p) => p.keys.join() === ["bea bell", "cat cole"].join() || (p.keys.length === 2 && p.members.every((m) => /bell|cole/.test(m.key))))!;
  assert.ok(bellCole, "Bell + Cole pair exists");
  assert.equal(bellCole.pf, 14);
  assert.equal(bellCole.pa, 14);
  assert.equal(bellCole.secs, 600);
  assert.equal(bellCole.games.size, 2);
  // Able only played s1, Fox only s2: they never shared the floor.
  assert.ok(!pairs.some((p) => p.members.some((m) => /able/.test(m.key)) && p.members.some((m) => /fox/.test(m.key))));
  // C(5,2) per stint, 4 of the 6 people overlap: 10 + 10 - C(4,2) shared pairs = 14.
  assert.equal(pairs.length, 14);
});

test("stints without exactly five people are left out", () => {
  const rows = [...stint("s1", ROSTER.slice(0, 4)), ...stint("s2", ROSTER.slice(0, 5))];
  const fives = buildCombos(groupStints(rows).values(), new Map(), 5);
  assert.equal(fives.length, 1);
  assert.equal(fives[0].secs, 300);
});

test("four factors for and against", () => {
  const rows = stint("s1", ROSTER.slice(0, 5), { pf: 12, pa: 9, posf: 10, posa: 10, secs: 600 });
  const [unit] = buildCombos(groupStints(rows).values(), new Map([["s1", box("s1")]]), 5);
  const m = comboMetrics(unit);
  // Own: FGM 4, FGA 9, 3PM 1 -> eFG (4 + 0.5) / 9
  assert.equal(m.efg!.toFixed(4), (4.5 / 9).toFixed(4));
  // TOV% 1 / (9 + 0.44*2 + 1)
  assert.equal(m.tovPct!.toFixed(4), (1 / (9 + 0.88 + 1)).toFixed(4));
  // OREB% own 2 / (2 + opp dreb 3)
  assert.equal(m.orebPct, 2 / 5);
  // FT/FGA 1 / 9
  assert.equal(m.ftRate, 1 / 9);
  // Opponent: FGM 3, FGA 10, 3PM 1 -> 3.5 / 10; OREB 1 / (1 + own dreb 4)
  assert.equal(m.oppEfg, 0.35);
  assert.equal(m.oppOrebPct, 1 / 5);
  assert.equal(m.ortg, 120);
  assert.equal(m.drtg, 90);
  assert.equal(m.net, 30);
  assert.equal(m.minutes, 10);
});

test("a stint with no box row still counts for minutes and points, not the four factors", () => {
  const rows = stint("s1", ROSTER.slice(0, 5));
  const [unit] = buildCombos(groupStints(rows).values(), new Map(), 5);
  const m = comboMetrics(unit);
  assert.equal(m.pf, 10);
  assert.equal(m.efg, null);
  assert.equal(m.orebPct, null);
});

test("box rows match stint ids whether the id comes back as a number or text", () => {
  const rows = stint("17", ROSTER.slice(0, 5)).map((r) => ({ ...r, stint_id: 17 as unknown as string }));
  const [unit] = buildCombos(groupStints(rows).values(), new Map([["17", box("17")]]), 5);
  assert.notEqual(comboMetrics(unit).efg, null);
});

test("ranking drops thin samples and sorts by net rating", () => {
  const rows = [
    ...stint("s1", ROSTER.slice(0, 5), { secs: 600, pf: 20, pa: 10, posf: 12, posa: 12 }),
    ...stint("s2", ROSTER.slice(1, 6), { secs: 600, pf: 12, pa: 12, posf: 12, posa: 12 }),
    ...stint("s3", [ROSTER[0], ROSTER[2], ROSTER[3], ROSTER[4], ROSTER[5]], { secs: 60, pf: 6, pa: 0, posf: 2, posa: 2 }),
  ];
  const ranked = rankCombos(buildCombos(groupStints(rows).values(), new Map(), 5), 8);
  assert.equal(ranked.length, 2, "the 1-minute unit is left out");
  assert.ok(ranked[0].m.net! > ranked[1].m.net!);
});

test("Swish+ access: admins only before launch, members after", () => {
  const admin = { id: "a", role: "admin" };
  const coach = { id: "c", role: "coach" };
  const fan = { id: "f", role: null };
  assert.equal(decidePlusAccess(false, admin, false), "full");
  assert.equal(decidePlusAccess(false, coach, false), "hidden");
  assert.equal(decidePlusAccess(false, fan, true), "hidden");
  assert.equal(decidePlusAccess(false, null, false), "hidden");
  assert.equal(decidePlusAccess(true, admin, false), "full");
  assert.equal(decidePlusAccess(true, coach, false), "full");
  assert.equal(decidePlusAccess(true, fan, true), "full");
  assert.equal(decidePlusAccess(true, fan, false), "locked");
  assert.equal(decidePlusAccess(true, null, false), "locked");
});
