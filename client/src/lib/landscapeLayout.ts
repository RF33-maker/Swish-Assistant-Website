/**
 * Layout sums shared by the two drawings of a team landscape: the Swish Social card
 * (generateLandscapeCard.ts) and the chart on the league page (LeagueLandscape.tsx).
 */

export type Point = { x: number; y: number };
export type Bounds = { left: number; top: number; right: number; bottom: number };

/** The gap between gridlines that gives an axis reaching `half` either side of its middle no more than seven of them. */
export function tickStep(half: number): number {
  return [0.5, 1, 2, 5, 10, 20].find((s) => (half * 2) / s <= 7) ?? 20;
}

/** The values to put gridlines at, for an axis showing `half` either side of `mid`. */
export function tickValues(mid: number, half: number): number[] {
  const step = tickStep(half);
  const out: number[] = [];
  for (let v = Math.ceil((mid - half) / step) * step; v <= mid + half; v += step) out.push(Math.round(v * 10) / 10);
  return out;
}

/** Nudges crests of radius `r` that sit on top of each other apart, while holding each near its true spot and inside `bounds`. */
export function spreadPoints(truth: Point[], r: number, bounds: Bounds, gap = 6): Point[] {
  const at = truth.map((p) => ({ ...p }));
  const minGap = r * 2 + gap;
  const lo = r + gap;
  for (let pass = 0; pass < 80; pass += 1) {
    for (let i = 0; i < at.length; i += 1) {
      for (let j = i + 1; j < at.length; j += 1) {
        let dx = at[j].x - at[i].x;
        let dy = at[j].y - at[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= minGap) continue;
        if (d < 0.01) {
          // Two teams on the same spot: part them along a fixed direction.
          dx = Math.cos(i * 2.4);
          dy = Math.sin(i * 2.4);
          d = 1;
        }
        const push = (minGap - d) / 2;
        at[i].x -= (dx / d) * push;
        at[i].y -= (dy / d) * push;
        at[j].x += (dx / d) * push;
        at[j].y += (dy / d) * push;
      }
    }
    at.forEach((p, i) => {
      p.x += (truth[i].x - p.x) * 0.06;
      p.y += (truth[i].y - p.y) * 0.06;
      p.x = Math.max(bounds.left + lo, Math.min(bounds.right - lo, p.x));
      p.y = Math.max(bounds.top + lo, Math.min(bounds.bottom - lo, p.y));
    });
  }
  return at;
}

export type Box = { x: number; y: number; w: number; h: number };

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Finds a spot beside each of `targets` for a label of `sizes[i]`: whichever side covers the
 * least of `obstacles` and the labels already placed. Each label stays inside `bounds`.
 */
export function placeLabels(targets: (Point & { r: number })[], sizes: { w: number; h: number }[], obstacles: (Point & { r: number })[], bounds: Bounds, gap = 8): Box[] {
  const placed: Box[] = [];
  const crests: Box[] = obstacles.map((c) => ({ x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 }));
  targets.forEach((c, i) => {
    const { w, h } = sizes[i];
    const sides: Point[] = [
      { x: c.x + c.r + gap, y: c.y - h / 2 },
      { x: c.x - c.r - gap - w, y: c.y - h / 2 },
      { x: c.x - w / 2, y: c.y + c.r + gap },
      { x: c.x - w / 2, y: c.y - c.r - gap - h },
    ];
    const boxes = sides.map((p) => ({
      x: Math.max(bounds.left, Math.min(bounds.right - w, p.x)),
      y: Math.max(bounds.top, Math.min(bounds.bottom - h, p.y)),
      w,
      h,
    }));
    const cost = (box: Box) => [...crests, ...placed].reduce((sum, other) => sum + overlap(box, other), 0);
    // Ties go to the earlier side, so a clear chart reads the same way round every time.
    placed.push(boxes.reduce((best, box) => (cost(box) < cost(best) ? box : best)));
  });
  return placed;
}
