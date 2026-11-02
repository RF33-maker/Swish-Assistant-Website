/**
 * The sums behind the team Venn card (generateVennCard.ts): which teams make each of the three
 * top lists, and where their crests fit inside the seven regions the circles make.
 */

import type { LandscapeMetricKey, LandscapeMetrics } from "@/types/landscape";
import type { Point } from "@/lib/landscapeLayout";

export type VennCriterion = {
  id: string;
  /** In the studio's menu. */
  label: string;
  /** On the card's pill. */
  pill: string;
  metric: LandscapeMetricKey;
  lowerIsBetter?: boolean;
};

export const VENN_CRITERIA: VennCriterion[] = [
  { id: "offence", label: "Offence", pill: "OFFENCE", metric: "ortg" },
  { id: "defence", label: "Defence", pill: "DEFENCE", metric: "drtg", lowerIsBetter: true },
  { id: "net", label: "Net rating", pill: "NET RATING", metric: "net" },
  { id: "three", label: "3-point %", pill: "3P%", metric: "threePct" },
  { id: "efg", label: "Effective FG%", pill: "EFG%", metric: "efg" },
  { id: "care", label: "Taking care of the ball", pill: "BALL CARE", metric: "tovPct", lowerIsBetter: true },
  { id: "forced", label: "Forcing turnovers", pill: "FORCED TOS", metric: "forcedTovPct" },
  { id: "oreb", label: "Offensive rebounding", pill: "OFF REBOUNDS", metric: "orebPct" },
  { id: "dreb", label: "Defensive rebounding", pill: "DEF REBOUNDS", metric: "drebPct" },
  { id: "pace", label: "Pace", pill: "PACE", metric: "pace" },
  { id: "paint", label: "Points in the paint", pill: "PAINT POINTS", metric: "paintPpg" },
  { id: "fastbreak", label: "Fast-break points", pill: "FAST BREAK", metric: "fastbreakPpg" },
  { id: "bench", label: "Bench points", pill: "BENCH POINTS", metric: "benchPpg" },
];

export const DEFAULT_VENN_IDS: [string, string, string] = ["offence", "defence", "three"];

/** "Top 10" means nothing in a ten-team league, so each list is the top third of the field. */
export function defaultTopCount(teamCount: number): number {
  return Math.max(2, Math.round(teamCount / 3));
}

type VennTeam = { id: string; metrics: LandscapeMetrics };

/** Each team's lists as a mask: 1 for the first criterion, 2 for the second, 4 for the third. Teams on none are left out. */
export function vennMasks<T extends VennTeam>(teams: T[], criteria: VennCriterion[], top: number): Map<string, number> {
  const masks = new Map<string, number>();
  criteria.forEach((c, i) => {
    teams
      .filter((t) => t.metrics[c.metric] != null)
      .sort((a, b) => ((a.metrics[c.metric] as number) - (b.metrics[c.metric] as number)) * (c.lowerIsBetter ? 1 : -1))
      .slice(0, top)
      .forEach((t) => masks.set(t.id, (masks.get(t.id) ?? 0) | (1 << i)));
  });
  return masks;
}

export type VennCircle = Point & { r: number };

/** One circle at the top and two below, in the card's coordinates. */
export const VENN_CIRCLES: VennCircle[] = [
  { x: 540, y: 594, r: 318 },
  { x: 382, y: 868, r: 318 },
  { x: 698, y: 868, r: 318 },
];

/** Whether a point sits in exactly the circles of `mask`, at least `margin` from every edge. */
function inRegion(p: Point, mask: number, margin: number): boolean {
  return VENN_CIRCLES.every((c, i) => {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    return mask & (1 << i) ? d <= c.r - margin : d >= c.r + margin;
  });
}

function regionCentre(mask: number): Point {
  let x = 0;
  let y = 0;
  let n = 0;
  for (let px = 40; px <= 1040; px += 8) {
    for (let py = 240; py <= 1200; py += 8) {
      if (!inRegion({ x: px, y: py }, mask, 0)) continue;
      x += px;
      y += py;
      n += 1;
    }
  }
  return { x: x / n, y: y / n };
}

/** The room a name takes under a crest, on up to two lines. */
export const LABEL_W = 100;
const LABEL_H = 36;

/** Crests with a name under them fit one to a spot; this is whether a whole spot lies in the region. */
function spotFits(p: Point, mask: number, r: number, label: boolean): boolean {
  if (!inRegion(p, mask, r + 5)) return false;
  if (!label) return true;
  const under = p.y + r + LABEL_H;
  return inRegion({ x: p.x - LABEL_W / 2, y: under }, mask, 3) && inRegion({ x: p.x + LABEL_W / 2, y: under }, mask, 3);
}

/**
 * The `count` spots nearest the middle of a region that don't touch each other, or null if it
 * can't hold that many at this size. The overlaps are long thin slants, which a straight grid
 * wastes, so every point in the region is a candidate.
 */
function spotsIn(mask: number, count: number, r: number, label: boolean): Point[] | null {
  const centre = regionCentre(mask);
  const cellW = Math.max(r * 2 + 12, label ? LABEL_W + 6 : 0);
  const cellH = r * 2 + (label ? LABEL_H + 8 : 12);
  const candidates: Point[] = [];
  for (let x = 40; x <= 1040; x += 6) {
    for (let y = 240; y <= 1200; y += 6) {
      const p = { x, y };
      if (spotFits(p, mask, r, label)) candidates.push(p);
    }
  }
  candidates.sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y));
  const spots: Point[] = [];
  for (const p of candidates) {
    if (spots.every((q) => Math.abs(p.x - q.x) >= cellW || Math.abs(p.y - q.y) >= cellH)) spots.push(p);
    if (spots.length === count) return spots;
  }
  return null;
}

export type VennPacking = { r: number; label: boolean; spots: Map<number, Point[]> };

/**
 * Finds the largest crest that lets every region hold its teams, given how many fall in each
 * region (keyed by mask). Names go under the crests while there's room for them, and are the
 * first thing dropped.
 */
export function packVenn(counts: Map<number, number>): VennPacking {
  const masks = Array.from(counts.keys());
  for (const label of [true, false]) {
    for (let r = 48; r >= (label ? 24 : 16); r -= 2) {
      const spots = new Map<number, Point[]>();
      if (masks.every((m) => {
        const found = spotsIn(m, counts.get(m) as number, r, label);
        if (found) spots.set(m, found);
        return !!found;
      })) {
        return { r, label, spots };
      }
    }
  }
  // Not reachable with the top lists a card can ask for, but a crowded card beats no card.
  const centre = new Map(masks.map((m) => [m, Array.from({ length: counts.get(m) as number }, () => regionCentre(m))]));
  return { r: 16, label: false, spots: centre };
}
