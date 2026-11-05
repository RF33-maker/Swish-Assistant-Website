/**
 * Court zones for a shot, shared by the site's shot chart and Ask Swish so
 * both call the same shot "at the rim".
 *
 * Shots arrive as x,y in 0-100 on the full court (baskets near x=5 and x=95).
 * They are folded onto one half and placed on the 500x470 half-court the
 * chart draws, basket at the top centre, then given a zone from that drawing:
 * restricted area, paint outside it, mid-range, or one of four threes.
 */

export const CW = 500;
export const CH = 470;

// Court geometry. BASKET_CY/TP_R/CORNER_LINE_X_L must keep the basket inside
// the arc and 3-point shots outside it; tweak here if shots stop landing in
// the right zone.
export const CENTER_X = CW / 2;
export const BASKET_CY = 60;
export const RIM_R = 7.5;
export const BB_HALF = 30;
export const BB_Y = BASKET_CY - RIM_R - 4;
export const RA_R = 42;
export const PAINT_W = 163;
export const PAINT_TOP = 0;
export const PAINT_BOT = 195;
export const PAINT_L = CENTER_X - PAINT_W / 2;
export const FT_RADIUS = 60;
export const TP_R = 222;
export const CORNER_LINE_X_L = 30;
export const CORNER_LINE_X_R = CW - CORNER_LINE_X_L;
export const CORNER_END_Y =
  BASKET_CY +
  Math.sqrt(Math.max(0, TP_R * TP_R - (CENTER_X - CORNER_LINE_X_L) ** 2));

export type ShotZoneKey = "ra" | "paint" | "mid" | "lw3" | "rw3" | "lc3" | "rc3";

export interface ShotPoint {
  x: number;
  y: number;
  shot_type?: string | null;
}

/** A shot on the half-court drawing, with its zone. */
// Generic so whole shot rows (success, player, game…) can be passed in as they are.
export function projectShot<T extends ShotPoint>(shot: T): { sx: number; sy: number; zone: ShotZoneKey } {
  let fx = shot.x;
  if (fx > 50) fx = 100 - fx;

  const sx = (shot.y / 100) * CW;
  const sy = (fx / 50) * CH;

  const dx = sx - CENTER_X;
  const dy = sy - BASKET_CY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const isThree =
    shot.shot_type === "3pt" ||
    sx < CORNER_LINE_X_L ||
    sx > CORNER_LINE_X_R ||
    dist > TP_R;

  let zone: ShotZoneKey = "mid";
  if (isThree) {
    if (sy <= CORNER_END_Y && sx < CORNER_LINE_X_L + 5) zone = "lc3";
    else if (sy <= CORNER_END_Y && sx > CORNER_LINE_X_R - 5) zone = "rc3";
    else zone = sx < CENTER_X ? "lw3" : "rw3";
  } else if (dist <= RA_R) {
    zone = "ra";
  } else if (Math.abs(dx) <= PAINT_W / 2 && sy <= PAINT_BOT) {
    zone = "paint";
  }

  return { sx, sy, zone };
}

export const shotZone = <T extends ShotPoint>(shot: T): ShotZoneKey => projectShot(shot).zone;

/** Every zone is worth one value: all twos or all threes. */
export const ZONE_POINTS: Record<ShotZoneKey, number> = { ra: 2, paint: 2, mid: 2, lw3: 3, rw3: 3, lc3: 3, rc3: 3 };

/** The four areas the shot-distribution bar shows ("At the rim" is the restricted area). */
export const ZONE_GROUP: Record<ShotZoneKey, "rim" | "paint" | "mid" | "three"> = {
  ra: "rim", paint: "paint", mid: "mid", lw3: "three", rw3: "three", lc3: "three", rc3: "three",
};
