/**
 * Places a name beside every dot on the player landscape without any two names, or a
 * name and a dot, overlapping. A name sits right beside its dot where there's room and
 * further out (with a leader line back to the dot) where there isn't.
 */

import type { Point } from "@/lib/landscapeLayout";

export type LabelBox = { left: number; top: number; right: number; bottom: number };

export type PlacedLabel = {
  /** Index of the dot the name belongs to. */
  i: number;
  box: LabelBox;
  /** The name had to move away from its dot, so a line joins them. */
  leader: boolean;
  /** No free spot was found; the name sits on top of something. */
  crowded: boolean;
};

/** Roughly how wide a name is at the chart's 10px semibold label size. */
export const labelWidth = (text: string) => text.length * 5.6 + 6;
export const LABEL_HEIGHT = 13;

// Directions to try, in order: beside the dot first, then above/below, then the diagonals (screen y runs down).
const ANGLES = [0, 180, -90, 90, -35, 35, -145, 145, -60, 60, -120, 120, -15, 15, -165, 165].map((d) => (d * Math.PI) / 180);
const DISTANCES = [0, 5, 10, 16, 23, 31, 40, 50, 62, 76, 92, 110, 130, 155, 185, 220];
const CELL = 48;

/** A grid of boxes, so overlap checks only look at nearby ones. */
class BoxGrid {
  private cells = new Map<string, LabelBox[]>();
  private keys(b: LabelBox): string[] {
    const out: string[] = [];
    for (let cx = Math.floor(b.left / CELL); cx <= Math.floor(b.right / CELL); cx += 1)
      for (let cy = Math.floor(b.top / CELL); cy <= Math.floor(b.bottom / CELL); cy += 1) out.push(`${cx},${cy}`);
    return out;
  }
  add(b: LabelBox) {
    for (const k of this.keys(b)) {
      const list = this.cells.get(k);
      if (list) list.push(b);
      else this.cells.set(k, [b]);
    }
  }
  /** How many boxes this one overlaps. */
  hits(b: LabelBox, stopAt = Infinity): number {
    const seen = new Set<LabelBox>();
    for (const k of this.keys(b)) {
      for (const o of this.cells.get(k) ?? []) {
        if (seen.has(o)) continue;
        if (b.left < o.right && b.right > o.left && b.top < o.bottom && b.bottom > o.top) {
          seen.add(o);
          if (seen.size >= stopAt) return seen.size;
        }
      }
    }
    return seen.size;
  }
}

/**
 * @param at     dot centres
 * @param r      dot radius
 * @param texts  the name for each dot
 * @param bounds the chart's edges
 * @param keepClear boxes no name may cover (the average tags)
 */
export function placeLabels(at: Point[], r: number, texts: string[], bounds: LabelBox, keepClear: LabelBox[] = []): PlacedLabel[] {
  const dots = new BoxGrid();
  const dotBoxes = at.map((p) => ({ left: p.x - r - 1, top: p.y - r - 1, right: p.x + r + 1, bottom: p.y + r + 1 }));
  dotBoxes.forEach((b) => dots.add(b));
  const names = new BoxGrid();
  keepClear.forEach((b) => names.add(b));

  // The most crowded dots go first, while there's still room near them.
  const crowding = at.map((p) => at.filter((q) => Math.abs(q.x - p.x) < 40 && Math.abs(q.y - p.y) < 24).length);
  const order = at.map((_, i) => i).sort((a, b) => crowding[b] - crowding[a]);

  const placed: PlacedLabel[] = [];
  for (const i of order) {
    const { x, y } = at[i];
    const w = labelWidth(texts[i]);
    const h = LABEL_HEIGHT;
    let best: { box: LabelBox; d: number; cost: number } | null = null;
    search: for (const d of DISTANCES) {
      for (const a of ANGLES) {
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const px = x + cos * (r + 2 + d);
        const py = y + sin * (r + 2 + d);
        const left = cos > 0.3 ? px : cos < -0.3 ? px - w : px - w / 2;
        const top = sin > 0.3 ? py : sin < -0.3 ? py - h : py - h / 2;
        const box = { left, top, right: left + w, bottom: top + h };
        if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom) continue;
        // Its own dot never counts: the name starts beside it.
        const onDots = dots.hits(box, 3) - (overlaps(box, dotBoxes[i]) ? 1 : 0);
        const cost = names.hits(box, 3) * 10 + onDots;
        if (cost === 0) {
          best = { box, d, cost };
          break search;
        }
        if (!best || cost < best.cost) best = { box, d, cost };
      }
    }
    if (!best) continue;
    names.add(best.box);
    placed.push({ i, box: best.box, leader: best.d > 6, crowded: best.cost > 0 });
  }
  return placed;
}

function overlaps(a: LabelBox, b: LabelBox) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
