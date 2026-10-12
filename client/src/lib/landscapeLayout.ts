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
