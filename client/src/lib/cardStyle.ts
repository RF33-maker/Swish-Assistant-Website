/**
 * The shared look of the Swish Social cards: the three styles a card can be drawn
 * in, their backdrops, the header, club crests, and the way a player's photo is
 * worked into the card. The leaders cards and Team of the Week all draw from here,
 * so they read as one family.
 */

import {
  CARD_H,
  CARD_W,
  capHeight,
  drawContain,
  drawTextTop,
  fitSize,
  setFont,
  shade,
  verticalGradient,
  withAlpha,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

/**
 * The three looks a card comes in:
 * - `league`: the competition's colour falling to black;
 * - `court`:  black sinking into the competition's colour, over half-court markings;
 * - `swish`:  Swish Assistant's own black and orange, with the court arcs from the site's dark panels.
 */
export type CardStyle = "league" | "court" | "swish";

export const CARD_STYLES: { id: CardStyle; label: string; hint: string }[] = [
  { id: "league", label: "League colour", hint: "The competition's colour, top to bottom" },
  { id: "court", label: "Court", hint: "Black into the competition's colour, with court lines" },
  { id: "swish", label: "Swish", hint: "Swish Assistant black and orange" },
];

/** Side margin shared by the cards' text. */
export const SIDE = 60;
/** Dark type on an accent-coloured shape. */
export const INK = "#0b0706";

const SWISH_ORANGE = "#f97316";
const SWISH_PANEL = "#111317";

export type Theme = {
  style: CardStyle;
  /** The colour the card is built from. */
  base: string;
  /** Small highlights: a unit beside a number, a tag, the ring round a crest. */
  accent: string;
  /** Numbers that have to hold up on the fullest of the card's colour. */
  rank: string;
  /** Dark type on the light shapes. */
  ink: string;
  /** Fill of the banner under the title. */
  banner: string;
  /** The league name above the title. */
  kicker: string;
  /** How far a photo is graded towards `base` (0–1). */
  photoTint: number;
  /** The card's own dark, which the outskirts of a photo are burnt towards. */
  shadow: string;
  /** Strength of the glow behind a photo. */
  glow: number;
};

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

export function themeFor(style: CardStyle, primaryHex: string): Theme {
  if (style === "swish") {
    return {
      style, base: SWISH_ORANGE, accent: SWISH_ORANGE, rank: SWISH_ORANGE, ink: SWISH_PANEL,
      banner: SWISH_ORANGE, kicker: "#fdba74", photoTint: 0.14, shadow: "#0d0e11", glow: 0.3,
    };
  }
  const m = /^#?([0-9a-f]{6})$/i.exec(primaryHex.trim());
  const primary = m ? `#${m[1]}` : SWISH_ORANGE;
  // A very light brand colour would wash out the white type that sits on it...
  let base = primary;
  for (let i = 0; i < 8 && luminance(base) > 0.3; i += 1) base = shade(base, -0.12);
  // ...and a very dark one would leave the accents unreadable on the dark parts of the card.
  let accent = shade(primary, 0.28);
  for (let i = 0; i < 8 && luminance(accent) < 0.3; i += 1) accent = shade(accent, 0.18);
  const ink = shade(base, -0.8);
  return style === "court"
    ? { style, base, accent, rank: "#ffffff", ink, banner: "#ffffff", kicker: "#ffffff", photoTint: 0.18, shadow: "#070505", glow: 0.34 }
    : { style, base, accent, rank: accent, ink, banner: "#ffffff", kicker: "#ffffff", photoTint: 0.32, shadow: shade(base, -0.62), glow: 0.42 };
}

// ── text helpers ─────────────────────────────────────────────────────────────

type SpacedContext = CanvasRenderingContext2D & { letterSpacing?: string };

export function spacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number, o: TextOpts): number {
  const c = ctx as SpacedContext;
  ctx.save();
  if (typeof c.letterSpacing === "string") c.letterSpacing = `${spacing}px`;
  setFont(ctx, o);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/** drawTextTop with letter-spacing, where the browser supports it on a canvas. */
export function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, topY: number, spacing: number, o: TextOpts): number {
  const c = ctx as SpacedContext;
  if (typeof c.letterSpacing !== "string") return drawTextTop(ctx, text, x, topY, o);
  ctx.save();
  c.letterSpacing = `${spacing}px`;
  // Spacing follows every glyph, the last one included; nudge so the visible text stays put.
  const nudge = o.align === "center" ? spacing / 2 : o.align === "right" ? spacing : 0;
  const cap = drawTextTop(ctx, text, x + nudge, topY, o);
  ctx.restore();
  return cap;
}

/** Largest size at which the text fits, on one line or, if that buys a clearly bigger size, two. */
export function fitLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, max: number, min: number, weight: number) {
  const single = fitSize(ctx, text, maxWidth, max, min, weight);
  const words = text.split(" ");
  let best = { lines: [text], size: single };
  if (words.length < 2 || single >= max * 0.8) return best;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const size = Math.min(fitSize(ctx, a, maxWidth, max, min, weight), fitSize(ctx, b, maxWidth, max, min, weight));
    if (size > best.size && size >= single * 1.2) best = { lines: [a, b], size };
  }
  return best;
}

/** "Samuel Toluwase" -> ["SAMUEL", "TOLUWASE"]; a trailing Jr / III stays with the surname. */
export function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return ["", name.trim().toUpperCase()];
  const tail = /^(jr|sr|ii|iii|iv)\.?$/i.test(parts[parts.length - 1]) && parts.length > 2 ? 2 : 1;
  return [parts.slice(0, -tail).join(" ").toUpperCase(), parts.slice(-tail).join(" ").toUpperCase()];
}

/** "Birmingham City University Senior Men" -> "Birmingham City University" (same as the site's carousels). */
export function cleanTeamLabel(name: string | null): string {
  return (name || "").replace(/\s+Senior\s+(Men|Women)\b/gi, "").replace(/\s+I\s*$/, "").replace(/\s+/g, " ").trim();
}

// ── backdrop ─────────────────────────────────────────────────────────────────

/** A soft bloom of colour, screened onto the card (the light behind a player or a crest). */
export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hex: string, alpha: number, squash = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, withAlpha(hex, alpha));
  g.addColorStop(0.55, withAlpha(hex, alpha * 0.35));
  g.addColorStop(1, withAlpha(hex, 0));
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

/** Angled shafts of light across the card, strongest at the top. */
function drawBeams(ctx: CanvasRenderingContext2D) {
  const lean = 600;
  const beam = (x: number, w: number, alpha: number) => {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w, 0);
    ctx.lineTo(x + w - lean, CARD_H);
    ctx.lineTo(x - lean, CARD_H);
    ctx.closePath();
    ctx.fillStyle = verticalGradient(ctx, 0, CARD_H, [[0, `rgba(255,255,255,${alpha})`], [0.75, "rgba(255,255,255,0)"]]);
    ctx.fill();
  };
  beam(700, 190, 0.055);
  beam(945, 70, 0.045);
  beam(1090, 240, 0.035);
}

/** Halftone dots that swell towards an origin (usually just off the card's edge). */
function drawHalftone(ctx: CanvasRenderingContext2D, ox: number, oy: number, reach: number) {
  const step = 21;
  ctx.save();
  ctx.fillStyle = "#fff";
  for (let row = 0, y = oy - reach; y <= oy + reach; y += step * 0.866, row += 1) {
    for (let x = ox - reach + (row % 2 ? step / 2 : 0); x <= ox + reach; x += step) {
      const t = 1 - Math.hypot(x - ox, y - oy) / reach;
      if (t <= 0 || x < -8 || x > CARD_W + 8) continue;
      ctx.globalAlpha = 0.13 * t;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + 4.6 * t * t, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Top-down half-court markings in FIBA proportions, drawn in metres from the middle of
 * the baseline: `ppm` pixels per metre, with the court running down the card from (x, y).
 */
function drawHalfCourt(ctx: CanvasRenderingContext2D, x: number, y: number, ppm: number, alpha: number) {
  const BASKET = 1.575;
  const ARC = 6.75;
  const CORNER = 6.6;
  const cornerY = BASKET + Math.sqrt(ARC * ARC - CORNER * CORNER);
  const sweep = Math.acos(CORNER / ARC);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(ppm, ppm);
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 3.2 / ppm;
  ctx.beginPath();
  ctx.rect(-7.5, 0, 15, 14);
  ctx.rect(-2.45, 0, 4.9, 5.8);
  ctx.moveTo(1.8, 5.8);
  ctx.arc(0, 5.8, 1.8, 0, Math.PI * 2);
  ctx.moveTo(1.8, 14);
  ctx.arc(0, 14, 1.8, 0, Math.PI * 2);
  ctx.moveTo(CORNER, 0);
  ctx.lineTo(CORNER, cornerY);
  ctx.arc(0, BASKET, ARC, sweep, Math.PI - sweep);
  ctx.lineTo(-CORNER, 0);
  ctx.moveTo(1.25, BASKET);
  ctx.arc(0, BASKET, 1.25, 0, Math.PI);
  ctx.moveTo(-0.9, 1.2);
  ctx.lineTo(0.9, 1.2);
  ctx.moveTo(0.225, BASKET);
  ctx.arc(0, BASKET, 0.225, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Court arcs fanning out of a corner: the linework on the site's dark Swish panels. */
function drawCornerArcs(ctx: CanvasRenderingContext2D, x: number, y: number, radii: number[], alpha: number) {
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 3.2;
  radii.forEach((r) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

/** A radial wash of colour out of (x, y), stretched to `rx` by `ry`. */
function drawCornerWash(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, hex: string, stops: [number, number][]) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  stops.forEach(([at, alpha]) => g.addColorStop(at, withAlpha(hex, alpha)));
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

/**
 * Fills the card with the style's backdrop. `court` is where the middle of the baseline
 * sits in the `court` style, so each card can stand its own artwork in the paint.
 */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  leagueLogo: HTMLImageElement | null,
  court: { x: number; y: number },
) {
  if (theme.style === "swish") {
    // The "free account" panel from the sign-in page: charcoal, orange pouring out of the top-right corner.
    ctx.fillStyle = verticalGradient(ctx, 0, CARD_H, [[0, SWISH_PANEL], [1, "#08090b"]]);
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    drawCornerWash(ctx, CARD_W, 0, CARD_W * 1.2, CARD_H * 0.9, theme.base, [[0, 0.6], [0.45, 0.14], [0.72, 0]]);
    drawCornerWash(ctx, 0, CARD_H, CARD_W * 0.9, CARD_H * 0.5, theme.base, [[0, 0.16], [1, 0]]);
    drawCornerArcs(ctx, CARD_W, 0, [130, 390, 715, 1090], 0.085);
    return;
  }
  if (theme.style === "court") {
    // The league look turned upside down: black at the top sinking into the competition's colour,
    // which is at its fullest in the lower half and eases off again under the footer logos.
    ctx.fillStyle = verticalGradient(ctx, 0, CARD_H, [
      [0, "#050404"],
      [0.2, "#070505"],
      [0.5, shade(theme.base, -0.74)],
      [0.8, shade(theme.base, -0.3)],
      [0.87, shade(theme.base, -0.26)],
      [1, shade(theme.base, -0.58)],
    ]);
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    drawHalfCourt(ctx, court.x, court.y, 100, 0.12);
    return;
  }
  ctx.fillStyle = verticalGradient(ctx, 0, CARD_H, [
    [0, shade(theme.base, 0.05)],
    [0.36, shade(theme.base, -0.42)],
    [0.78, shade(theme.base, -0.82)],
    [1, "#070403"],
  ]);
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  drawBeams(ctx);
  drawHalftone(ctx, CARD_W + 30, 540, 430);
  if (leagueLogo) {
    drawContain(ctx, leagueLogo, -20, -30, 300, 300, 0.14);
    drawContain(ctx, leagueLogo, CARD_W - 240, -30, 300, 300, 0.07);
  }
}

/**
 * Darkens the card's corners. Only the `league` style wants it: the darker looks already
 * fall away to black, and a vignette would only dull their corner of colour.
 */
export function drawVignette(ctx: CanvasRenderingContext2D, theme: Theme) {
  if (theme.style !== "league") return;
  const v = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.42, CARD_H * 0.34, CARD_W / 2, CARD_H * 0.42, CARD_H * 0.86);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

// ── photos ───────────────────────────────────────────────────────────────────

/** Slower in and out than a plain smoothstep, so a fade has no visible start or finish. */
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** A soft copy of a canvas: a true blur where the browser has canvas filters, a shrink-and-stretch otherwise. */
function blurred(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const o = out.getContext("2d")!;
  if (typeof (o as { filter?: unknown }).filter === "string") {
    o.filter = `blur(${radius}px)`;
    o.drawImage(src, 0, 0);
    return out;
  }
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round((src.width * 2.5) / radius));
  small.height = Math.max(1, Math.round((src.height * 2.5) / radius));
  const sm = small.getContext("2d")!;
  sm.imageSmoothingQuality = "high";
  sm.drawImage(src, 0, 0, small.width, small.height);
  o.imageSmoothingQuality = "high";
  o.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

export type MeltedPhoto = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Multiplies the sheet by an eased ramp along a gradient: `from` at its start, `to` at its end (clear to solid by default). */
  fade(g: CanvasGradient, from?: number, to?: number): void;
};

/**
 * A photo prepared to be worked into a card rather than laid on it. A rectangle of
 * photo always shows its border, however much that border is feathered, so:
 *  - the photo's edge pixels are smeared outwards and blurred into a haze of its own
 *    colours, which carries on past where the picture stops;
 *  - the sharp photo is feathered into that haze, and shows no higher than `sharpTop`;
 *  - the result is graded towards the card's colour, and `burn` paints the card's shadow
 *    over its outskirts.
 * The photo sits at `rect` on a `w` × `h` sheet. The caller shapes the falloff with
 * `fade` and draws the sheet onto the card.
 */
export function meltPhoto(
  img: HTMLImageElement,
  w: number,
  h: number,
  rect: { left: number; top: number; dw: number; dh: number },
  sharpTop: number,
  theme: Theme,
  burn: (sheet: CanvasRenderingContext2D) => void,
): MeltedPhoto {
  const { left, top, dw, dh } = rect;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const right = left + dw;
  const bottom = top + dh;

  const sheet = () => {
    const c = document.createElement("canvas");
    c.width = Math.round(w);
    c.height = Math.round(h);
    return [c, c.getContext("2d")!] as const;
  };
  const fadeOn = (c: CanvasRenderingContext2D, g: CanvasGradient, from = 0, to = 1) => {
    for (let i = 0; i <= 12; i += 1) g.addColorStop(i / 12, `rgba(0,0,0,${from + (to - from) * ease(i / 12)})`);
    c.save();
    c.globalCompositeOperation = "destination-in";
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.restore();
  };

  // The haze: the photo with its border pixels dragged outwards, then blurred.
  const [smeared, sm] = sheet();
  const reach = 280;
  const ex = Math.max(1, Math.round(iw * 0.008));
  const ey = Math.max(1, Math.round(ih * 0.008));
  sm.drawImage(img, 0, 0, ex, ey, left - reach, top - reach, reach, reach);
  sm.drawImage(img, iw - ex, 0, ex, ey, right, top - reach, reach, reach);
  sm.drawImage(img, 0, ih - ey, ex, ey, left - reach, bottom, reach, reach);
  sm.drawImage(img, iw - ex, ih - ey, ex, ey, right, bottom, reach, reach);
  sm.drawImage(img, 0, 0, iw, ey, left, top - reach, dw, reach);
  sm.drawImage(img, 0, ih - ey, iw, ey, left, bottom, dw, reach);
  sm.drawImage(img, 0, 0, ex, ih, left - reach, top, reach, dh);
  sm.drawImage(img, iw - ex, 0, ex, ih, right, top, reach, dh);
  sm.drawImage(img, left, top, dw, dh);
  const haze = blurred(smeared, 36);

  // The sharp photo, feathered into the haze along its top limit and any edge of its own that is in view.
  const [sharp, sh] = sheet();
  sh.drawImage(img, left, top, dw, dh);
  const feather = 72;
  const from = Math.max(sharpTop, top);
  fadeOn(sh, sh.createLinearGradient(0, from, 0, from + feather));
  if (left > 0) fadeOn(sh, sh.createLinearGradient(left, 0, left + feather, 0));
  if (right < w) fadeOn(sh, sh.createLinearGradient(right, 0, right - feather, 0));
  if (bottom < h) fadeOn(sh, sh.createLinearGradient(0, bottom, 0, bottom - feather));

  const [picture, pc] = sheet();
  pc.drawImage(haze, 0, 0);
  pc.drawImage(sharp, 0, 0);

  const [canvas, l] = sheet();
  l.drawImage(picture, 0, 0);
  // Grade the photo towards the card's colour, burn its outskirts towards the card's shadow...
  l.globalCompositeOperation = "soft-light";
  l.globalAlpha = theme.photoTint;
  l.fillStyle = theme.base;
  l.fillRect(0, 0, w, h);
  l.globalAlpha = 1;
  l.globalCompositeOperation = "source-over";
  l.save();
  burn(l);
  l.restore();
  // ...then give it back its own outline, so a cut-out stays a cut-out.
  l.globalCompositeOperation = "destination-in";
  l.drawImage(picture, 0, 0);
  l.globalCompositeOperation = "source-over";

  return { canvas, ctx: l, fade: (g, a, b) => fadeOn(l, g, a, b) };
}

// ── crests ───────────────────────────────────────────────────────────────────

const lightLogos = new WeakMap<HTMLImageElement, boolean>();

/** Whether a logo is a white mark on a transparent background, which needs a dark disc behind it. */
function isLightLogo(img: HTMLImageElement): boolean {
  const known = lightLogos.get(img);
  if (known !== undefined) return known;
  let light = false;
  try {
    const size = 32;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const cx = c.getContext("2d", { willReadFrequently: true })!;
    cx.drawImage(img, 0, 0, size, size);
    const { data } = cx.getImageData(0, 0, size, size);
    let solid = 0;
    let lum = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      solid += 1;
      lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    light = solid > 0 && solid < size * size * 0.94 && lum / solid > 205;
  } catch {
    // a logo the canvas can't read back: treat it as an ordinary dark-on-light one
  }
  lightLogos.set(img, light);
  return light;
}

/** A club logo on a clean disc, so any crest reads on the dark card whatever its own colours. */
export function drawCrest(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  logo: HTMLImageElement | null,
  fallback: string,
  theme: Theme,
) {
  const dark = logo ? isLightLogo(logo) : true;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (r > 60) {
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = r * 0.34;
    ctx.shadowOffsetY = r * 0.1;
  }
  if (dark) {
    ctx.fillStyle = logo ? "#15100f" : withAlpha(shade(theme.base, -0.55), 0.92);
  } else {
    const face = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    face.addColorStop(0, "#ffffff");
    face.addColorStop(1, "#e7e7ec");
    ctx.fillStyle = face;
  }
  ctx.fill();
  ctx.restore();

  if (dark) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = Math.max(1.5, r * 0.022);
    ctx.beginPath();
    ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (logo) {
    // The largest square that sits inside the disc, with a little air around it.
    const side = r * Math.SQRT2 * 0.94;
    drawContain(ctx, logo, cx - side / 2, cy - side / 2, side, side);
  } else if (fallback) {
    const size = r * 0.78;
    const cap = capHeight(ctx, { size, weight: 700 });
    drawTextTop(ctx, fallback, cx, cy - cap / 2, { size, weight: 700, align: "center", alpha: 0.85 });
  }
}

/** A crest as artwork in its own right: the disc, brand rings round it, and a soft halo behind. */
export function drawRingedCrest(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  logo: HTMLImageElement | null,
  fallback: string,
  theme: Theme,
) {
  const k = r / 178;
  drawGlow(ctx, cx, cy, r * 2.5, "#ffffff", 0.2);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = Math.max(1.5, 2 * k);
  ctx.beginPath();
  ctx.arc(cx, cy, r + 46 * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = Math.max(3, 6 * k);
  ctx.beginPath();
  ctx.arc(cx, cy, r + 20 * k, Math.PI * 0.62, Math.PI * 1.9);
  ctx.stroke();
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 20 * k, Math.PI * 1.98, Math.PI * 2.54);
  ctx.stroke();
  ctx.restore();

  drawCrest(ctx, cx, cy, r, logo, fallback, theme);
}

// ── header ───────────────────────────────────────────────────────────────────

/** A slanted banner with a centred label (the line under the title). */
function drawBanner(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, h: number, fill: string, ink: string) {
  const spacing = 3;
  const maxText = CARD_W - SIDE * 2 - 110;
  let size = Math.round(h * 0.62);
  while (size > 18 && spacedWidth(ctx, text, spacing, { size, weight: 600 }) > maxText) size -= 1;
  const textW = spacedWidth(ctx, text, spacing, { size, weight: 600 }) - spacing;
  const slant = h * 0.32;
  const w = textW + 76 + slant;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + slant, top);
  ctx.lineTo(cx + w / 2, top);
  ctx.lineTo(cx + w / 2 - slant, top + h);
  ctx.lineTo(cx - w / 2, top + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const cap = capHeight(ctx, { size, weight: 600 });
  drawSpaced(ctx, text, cx, top + (h - cap) / 2, spacing, { size, weight: 600, color: ink, align: "center" });
}

/**
 * The top of every card: the league name between two rules, the title, and a slanted
 * banner under it. An "X OF THE Y" title sets its middle words in a lighter weight.
 */
export function drawHeader(ctx: CanvasRenderingContext2D, title: string, banner: string, leagueName: string, theme: Theme) {
  const cx = CARD_W / 2;
  if (leagueName) {
    const kicker = leagueName.toUpperCase();
    const o: TextOpts = { size: 25, weight: 500, align: "center", alpha: 0.9, color: theme.kicker };
    let spacing = 7;
    while (spacing > 1 && spacedWidth(ctx, kicker, spacing, o) > CARD_W - SIDE * 2 - 180) spacing -= 1;
    const w = spacedWidth(ctx, kicker, spacing, o) - spacing;
    const cap = drawSpaced(ctx, kicker, cx, 34, spacing, o);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = theme.kicker;
    ctx.fillRect(cx - w / 2 - 22 - 56, 34 + cap / 2 - 1, 56, 2);
    ctx.fillRect(cx + w / 2 + 22, 34 + cap / 2 - 1, 56, 2);
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  const size = fitSize(ctx, title, 900, 106, 60, 700);
  const cap = capHeight(ctx, { size, weight: 700 });
  const parts = title.split(" OF THE ");
  if (parts.length === 2) {
    const bold: TextOpts = { size, weight: 700 };
    const light: TextOpts = { size, weight: 400 };
    setFont(ctx, bold);
    const lead = ctx.measureText(parts[0]).width;
    const tail = ctx.measureText(parts[1]).width;
    setFont(ctx, light);
    const gap = ctx.measureText(" ").width;
    const mid = ctx.measureText("OF THE").width;
    let x = cx - (lead + gap + mid + gap + tail) / 2;
    drawTextTop(ctx, parts[0], x, 72, bold);
    x += lead + gap;
    drawTextTop(ctx, "OF THE", x, 72, light);
    x += mid + gap;
    drawTextTop(ctx, parts[1], x, 72, bold);
  } else {
    drawTextTop(ctx, title, cx, 72, { size, weight: 700, align: "center" });
  }
  ctx.restore();

  if (banner) drawBanner(ctx, banner.toUpperCase(), cx, 72 + cap + 20, 52, theme.banner, theme.ink);
}

/** A small slanted tag in the accent colour; returns its height. */
export function drawTag(ctx: CanvasRenderingContext2D, text: string, x: number, top: number, theme: Theme): number {
  const h = 40;
  const o: TextOpts = { size: 22, weight: 600, color: INK };
  const w = spacedWidth(ctx, text, 3, o) - 3 + 44;
  const slant = 12;
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.moveTo(x + slant, top);
  ctx.lineTo(x + w + slant, top);
  ctx.lineTo(x + w, top + h);
  ctx.lineTo(x, top + h);
  ctx.closePath();
  ctx.fill();
  drawSpaced(ctx, text, x + 22 + slant / 2, top + (h - capHeight(ctx, o)) / 2, 3, o);
  return h;
}
