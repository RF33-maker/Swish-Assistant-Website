/**
 * Court zone for a shot, using the same geometry as client/src/components/ShotChart.tsx
 * so the scouting agent and the drawn chart never disagree about where a shot came from.
 * Keep the constants in step with that file.
 */
const CW = 500;
const CH = 470;
const CENTER_X = CW / 2;
const BASKET_CY = 60;
const RA_R = 42;
const PAINT_W = 163;
const PAINT_BOT = 195;
const TP_R = 222;
const CORNER_LINE_X_L = 30;
const CORNER_LINE_X_R = CW - CORNER_LINE_X_L;
const CORNER_END_Y = BASKET_CY + Math.sqrt(Math.max(0, TP_R * TP_R - (CENTER_X - CORNER_LINE_X_L) ** 2));

export type ShotZone = "ra" | "paint" | "mid" | "lc3" | "rc3" | "lw3" | "rw3";

export function shotZone(x: number, y: number, shotType?: string | null): ShotZone {
  let fx = x;
  if (fx > 50) fx = 100 - fx;
  const sx = (y / 100) * CW;
  const sy = (fx / 50) * CH;
  const dx = sx - CENTER_X;
  const dy = sy - BASKET_CY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const isThree = shotType === "3pt" || sx < CORNER_LINE_X_L || sx > CORNER_LINE_X_R || dist > TP_R;
  if (isThree) {
    if (sy <= CORNER_END_Y && sx < CORNER_LINE_X_L + 5) return "lc3";
    if (sy <= CORNER_END_Y && sx > CORNER_LINE_X_R - 5) return "rc3";
    return sx < CENTER_X ? "lw3" : "rw3";
  }
  if (dist <= RA_R) return "ra";
  if (Math.abs(dx) <= PAINT_W / 2 && sy <= PAINT_BOT) return "paint";
  return "mid";
}

/** Coarser groups a coach actually talks in. */
export const ZONE_GROUPS: Record<string, ShotZone[]> = {
  rim: ["ra"],
  paint: ["paint"],
  midrange: ["mid"],
  corner3: ["lc3", "rc3"],
  aboveBreak3: ["lw3", "rw3"],
};

/**
 * Which side of the floor the shot came from, in the chart's frame (the same
 * left/right the drawn chart shows). Shots within a lane-width of the middle
 * count as "middle" so a straight-on layup doesn't tip a player's side.
 */
export function shotSide(y: number): "left" | "right" | "middle" {
  const sx = (y / 100) * CW;
  if (sx < CENTER_X - PAINT_W / 2) return "left";
  if (sx > CENTER_X + PAINT_W / 2) return "right";
  return "middle";
}
