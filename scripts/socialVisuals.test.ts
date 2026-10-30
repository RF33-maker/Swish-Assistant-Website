// Run with: npx tsx --test scripts/socialVisuals.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { LANDSCAPE_PRESETS, landscapeCallouts } from "../client/src/lib/landscapePresets";
import { placeLabels } from "../client/src/lib/landscapeLayout";
import { VENN_CIRCLES, VENN_CRITERIA, defaultTopCount, packVenn, vennMasks } from "../client/src/lib/vennLayout";
import type { LandscapeMetrics } from "../client/src/types/landscape";

const efficiency = LANDSCAPE_PRESETS.find((p) => p.id === "efficiency")!;
const style = LANDSCAPE_PRESETS.find((p) => p.id === "style")!;

const team = (id: string, m: Partial<LandscapeMetrics>) => ({ id, metrics: m as LandscapeMetrics });

const league = [
  team("a", { ortg: 110, drtg: 90, net: 20 }),
  team("b", { ortg: 120, drtg: 104, net: 16 }),
  team("c", { ortg: 108, drtg: 96, net: 12 }),
  team("d", { ortg: 100, drtg: 100, net: 0 }),
  team("e", { ortg: 90, drtg: 102, net: -12 }),
  team("f", { ortg: 96, drtg: 115, net: -19 }),
];

test("the top teams get their full ranks, in net, offence, defence order", () => {
  const callouts = landscapeCallouts(league, efficiency);
  const a = callouts.find((c) => c.teamId === "a")!;
  assert.deepEqual(a.lines.map((l) => l.text), ["#1 NET", "#2 OFF", "#1 DEF"]);
  assert.deepEqual(callouts.find((c) => c.teamId === "b")!.lines.map((l) => l.text), ["#2 NET", "#1 OFF", "#5 DEF"]);
  assert.equal(callouts.find((c) => c.teamId === "d"), undefined);
});

test("the bottom teams are named, and one team can be worst at several things", () => {
  const callouts = landscapeCallouts(league, efficiency);
  assert.deepEqual(callouts.find((c) => c.teamId === "e")!.lines, [{ text: "WORST OFFENCE", tone: "worst" }]);
  assert.deepEqual(callouts.find((c) => c.teamId === "f")!.lines.map((l) => l.text), ["WORST NET", "WORST DEFENCE"]);
});

test("charts where neither end is good, and tiny fields, get no words", () => {
  assert.deepEqual(landscapeCallouts(league, style), []);
  assert.deepEqual(landscapeCallouts(league.slice(0, 3), efficiency), []);
});

test("a label avoids other crests when it can and stays in bounds", () => {
  const crests = [{ x: 100, y: 100, r: 30 }, { x: 170, y: 100, r: 30 }];
  const [box] = placeLabels([crests[0]], [{ w: 50, h: 40 }], crests, { left: 0, top: 0, right: 500, bottom: 500 });
  assert.ok(box.x + box.w <= 62 || box.y >= 130 || box.y + box.h <= 70, `label should clear the neighbour: ${JSON.stringify(box)}`);
  const [edge] = placeLabels([{ x: 480, y: 480, r: 30 }], [{ w: 100, h: 40 }], [], { left: 0, top: 0, right: 500, bottom: 500 });
  assert.ok(edge.x + edge.w <= 500 && edge.y + edge.h <= 500);
});

test("each list scales to the size of the league", () => {
  assert.equal(defaultTopCount(24), 8);
  assert.equal(defaultTopCount(14), 5);
  assert.equal(defaultTopCount(10), 3);
  assert.equal(defaultTopCount(4), 2);
});

test("masks use the better end of each stat, skip unrecorded numbers and leave out the rest", () => {
  const [off, def] = VENN_CRITERIA;
  const three = VENN_CRITERIA.find((c) => c.id === "three")!;
  const teams = [
    team("a", { ortg: 120, drtg: 90, threePct: 40 }),
    team("b", { ortg: 118, drtg: 110, threePct: null }),
    team("c", { ortg: 90, drtg: 92, threePct: 30 }),
    team("d", { ortg: 80, drtg: 120, threePct: 20 }),
  ];
  const masks = vennMasks(teams, [off, def, three], 2);
  assert.equal(masks.get("a"), 7);
  assert.equal(masks.get("b"), 1);
  assert.equal(masks.get("c"), 6);
  assert.equal(masks.has("d"), false);
});

test("the busiest realistic card fits with no crests on top of each other or across a line", () => {
  // NBL D1 size: three lists of 8, spread across the regions.
  const counts = new Map([[1, 5], [2, 5], [4, 5], [3, 2], [5, 2], [6, 2], [7, 3]]);
  const { r, spots } = packVenn(counts);
  assert.ok(r >= 16);
  const all = Array.from(spots.entries()).flatMap(([mask, list]) => {
    assert.equal(list.length, counts.get(mask));
    return list.map((p) => ({ ...p, mask }));
  });
  all.forEach((p, i) => {
    VENN_CIRCLES.forEach((c, bit) => {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (p.mask & (1 << bit)) assert.ok(d <= c.r - r, "crest inside its circle");
      else assert.ok(d >= c.r + r, "crest clear of the other circles");
    });
    all.slice(i + 1).forEach((q) => assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= r * 2));
  });
});
