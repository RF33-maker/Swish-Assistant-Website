/**
 * The drawing kit behind the Swish Social poster cards: the typefaces, grain,
 * the house treatment of a cut-out or a game photo, and the small text helpers
 * the canvas renderers share. The performance styles (Headline, Editorial,
 * Duotone, Numbers) and the situation cards (final score, pre-game, milestone)
 * draw from here so they read as one family.
 */

import { CARD_H, CARD_W, capHeight, setFont, type TextOpts } from "@/lib/generateWeeklyCards";
import { drawSpaced, spacedWidth } from "@/lib/cardStyle";

export const DISPLAY = '"Barlow Condensed", "Oswald", Impact, "Arial Narrow", sans-serif';
export const BODY = '"Inter", Arial, Helvetica, sans-serif';
/** The display serif of the milestone numerals: a fat Didone with lining figures (Playfair's are old-style, so a "5" would drop below the "0"). */
export const SERIF = '"Abril Fatface", "Bodoni 72", "Didot", Georgia, serif';

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700&family=Abril+Fatface&display=swap";

export const SIDE = 72;
export const DARK = "#0b0b0d";
export const PAPER = "#edece7";
export const INK = "#111111";
export const DEFAULT_ACCENT = "#f97316";

export type Ink = { text: string; strong: string; muted: string; rule: string };
export const DARK_INK: Ink = { text: "rgba(255,255,255,0.72)", strong: "#ffffff", muted: "rgba(255,255,255,0.55)", rule: "rgba(255,255,255,0.14)" };
export const PAPER_INK: Ink = { text: "rgba(17,17,17,0.78)", strong: INK, muted: "rgba(17,17,17,0.62)", rule: "rgba(17,17,17,0.28)" };

let fontsReady: Promise<void> | null = null;

/** Loads the cards' typefaces on demand; falls back to the system stacks if they never arrive. */
export function ensureCardFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    if (typeof document === "undefined") return;
    if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_HREF;
      const loaded = new Promise<void>((resolve) => {
        link.onload = () => resolve();
        link.onerror = () => resolve();
        window.setTimeout(resolve, 4000);
      });
      document.head.appendChild(link);
      await loaded;
    }
    try {
      await Promise.all([
        ...["500", "600", "700", "800", "900"].map((w) => document.fonts.load(`${w} 40px "Barlow Condensed"`)),
        ...["500", "600", "700"].map((w) => document.fonts.load(`${w} 20px "Inter"`)),
        document.fonts.load('400 40px "Abril Fatface"'),
      ]);
    } catch {
      // the system stacks stand in
    }
  })();
  return fontsReady;
}

// ── text ─────────────────────────────────────────────────────────────────────

export const display = (size: number, weight: number, extra: Partial<TextOpts> = {}): TextOpts => ({ size, weight, family: DISPLAY, ...extra });
export const body = (size: number, weight: number, extra: Partial<TextOpts> = {}): TextOpts => ({ size, weight, family: BODY, ...extra });
export const serif = (size: number, weight: number, extra: Partial<TextOpts> = {}): TextOpts => ({ size, weight, family: SERIF, ...extra });

export function textWidth(ctx: CanvasRenderingContext2D, text: string, o: TextOpts): number {
  setFont(ctx, o);
  return ctx.measureText(text).width;
}

/** The largest size (stepping down by two) at which `text` fits `maxWidth` in the given face. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, max: number, min: number, face: (size: number) => TextOpts): number {
  for (let size = max; size > min; size -= 2) {
    if (textWidth(ctx, text, face(size)) <= maxWidth) return size;
  }
  return min;
}

export function fitDisplay(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, max: number, min: number, weight: number): number {
  return fitText(ctx, text, maxWidth, max, min, (size) => display(size, weight));
}

/** Draws text with its cap top at `topY` and returns its width; the plain version of drawSpaced. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, topY: number, o: TextOpts): number {
  setFont(ctx, o);
  const cap = ctx.measureText("H").actualBoundingBoxAscent;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = o.color ?? "#fff";
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, topY + cap);
  ctx.restore();
  return ctx.measureText(text).width;
}

/** Outlined text: the stroke only, no fill. */
export function strokeTextTop(ctx: CanvasRenderingContext2D, text: string, x: number, topY: number, o: TextOpts, stroke: string, lineWidth: number) {
  setFont(ctx, o);
  const cap = ctx.measureText("H").actualBoundingBoxAscent;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.strokeText(text, x, topY + cap);
  ctx.restore();
}

/** Small tracked caps running up the right edge, the way the NBA clubs credit a player. */
export function drawEdgeCaption(ctx: CanvasRenderingContext2D, text: string, x: number, bottomY: number, colour: string): number {
  const o = body(14, 600, { color: colour });
  const len = spacedWidth(ctx, text, 14 * 0.3, o);
  ctx.save();
  ctx.translate(x, bottomY);
  ctx.rotate(-Math.PI / 2);
  drawSpaced(ctx, text, 0, 0, 14 * 0.3, o);
  ctx.restore();
  return len;
}

/** A black block with a white label in it, hung off the bottom-right corner of a numeral. */
export function drawLabelBlock(ctx: CanvasRenderingContext2D, text: string, right: number, top: number, fill = DARK, colour = "#ffffff") {
  const o = body(30, 700, { color: colour });
  const w = spacedWidth(ctx, text, 30 * 0.06, o) - 30 * 0.06 + 44;
  const h = 56;
  ctx.fillStyle = fill;
  ctx.fillRect(right - w, top, w, h);
  drawSpaced(ctx, text, right - w + 22, top + (h - capHeight(ctx, o)) / 2, 30 * 0.06, o);
}

// ── colour and light ─────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xf97316;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function accentOf(hex: string | undefined): string {
  const v = (hex || "").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : DEFAULT_ACCENT;
}

export function layer(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = CARD_W;
  c.height = CARD_H;
  return [c, c.getContext("2d")!];
}

/** A soft ellipse of colour out of (cx, cy), optionally blended on. */
export function ellipseGlow(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number,
  stops: [number, string][],
  op: GlobalCompositeOperation = "source-over",
  alpha = 1,
) {
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  stops.forEach(([at, colour]) => g.addColorStop(at, colour));
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

export function vertical(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([at, colour]) => g.addColorStop(at, colour));
  return g;
}

let grainTile: HTMLCanvasElement | null = null;

/** Film grain: a tile of mid-grey noise blended over the whole card. */
export function drawGrain(ctx: CanvasRenderingContext2D, alpha: number, op: GlobalCompositeOperation = "overlay") {
  if (!grainTile) {
    const size = 256;
    grainTile = document.createElement("canvas");
    grainTile.width = size;
    grainTile.height = size;
    const g = grainTile.getContext("2d")!;
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 64 + Math.random() * 128;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = op;
  ctx.fillStyle = ctx.createPattern(grainTile, "repeat")!;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.restore();
}

// ── photos ───────────────────────────────────────────────────────────────────

export type Box = { x: number; y: number; w: number; h: number };
export type Placement = { left: number; top: number; dw: number; dh: number };
export type Framing = { zoom: number; x: number; y: number; focusY: number };
export type Tone = "natural" | "graded" | "mono" | "duotone";
export type Photo = { img: HTMLImageElement; cutout: boolean };

/** The framing fields a card's data can carry (the sliders in the studio). */
export type PhotoFramingFields = {
  photo_focus_y?: number;
  photo_zoom?: number;
  photo_position_x?: number;
  photo_position_y?: number;
};

export type PhotoFields = PhotoFramingFields & {
  /** Background-removed photo, when the player has one; the type sits behind it. */
  cutout_photo_url?: string;
  /** The full game photo (or headshot) for the photo version. */
  photo_url?: string;
  /** "photo" uses the game photo even when a cut-out exists. */
  photo_mode?: "auto" | "photo";
};

export function framingOf(data: PhotoFramingFields | undefined): Framing {
  const focusY = Math.max(0, Math.min(100, Number(data?.photo_focus_y ?? 50)));
  return {
    zoom: Math.max(0.4, Math.min(3, Number(data?.photo_zoom ?? 1))),
    x: Math.max(0, Math.min(100, Number(data?.photo_position_x ?? 50))),
    y: Math.max(0, Math.min(100, Number(data?.photo_position_y ?? focusY))),
    focusY,
  };
}

/** The player's photo, cut-out when there is one and it is wanted, else the full photo. */
export async function loadPhoto(data: PhotoFields | undefined, fetchImg: (src: string | null | undefined) => Promise<HTMLImageElement | null>): Promise<Photo | null> {
  if (!data) return null;
  if (data.photo_mode !== "photo" && data.cutout_photo_url) {
    const img = await fetchImg(data.cutout_photo_url);
    if (img) return { img, cutout: true };
  }
  const img = await fetchImg(data.photo_url);
  return img ? { img, cutout: false } : null;
}

/** A cut-out sits in its box bottom-centre; zoom grows it from there, the sliders nudge it. */
export function placeCutout(img: HTMLImageElement, box: Box, fr: Framing): Placement {
  const scale = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight) * fr.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  return {
    left: box.x + (box.w - dw) / 2 + ((fr.x - 50) / 100) * box.w,
    top: box.y + (box.h - dh) + ((fr.y - fr.focusY) / 100) * box.h,
    dw,
    dh,
  };
}

/** A full photo fills its box edge to edge; the sliders pick which part shows. */
export function placeCover(img: HTMLImageElement, box: Box, fr: Framing): Placement {
  const scale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight) * Math.max(1, fr.zoom);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  return {
    left: box.x + (box.w - dw) * (fr.x / 100),
    top: box.y + (box.h - dh) * (fr.y / 100),
    dw,
    dh,
  };
}

/** Grades the pixels of a layer in place: a cinematic wash, black and white, or a two-tone in the accent. */
export function tonePixels(c: CanvasRenderingContext2D, tone: Tone, accent: string, box: Box) {
  if (tone === "natural") return;
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(CARD_W - x, Math.ceil(box.w));
  const h = Math.min(CARD_H - y, Math.ceil(box.h));
  if (w <= 0 || h <= 0) return;
  const img = c.getImageData(x, y, w, h);
  const d = img.data;
  const [ar, ag, ab] = hexToRgb(accent);
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (tone === "graded") {
      // A little less colour, a little more contrast.
      const k = 0.82;
      d[i] = clamp((lum + (r - lum) * k - 128) * 1.08 + 124);
      d[i + 1] = clamp((lum + (g - lum) * k - 128) * 1.08 + 124);
      d[i + 2] = clamp((lum + (b - lum) * k - 128) * 1.08 + 124);
    } else if (tone === "mono") {
      const v = clamp((lum - 128) * 1.16 + 130);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    } else {
      // Duotone: the photo's light in the accent colour, its shadows in black.
      const v = clamp((lum - 128) * 1.3 + 138) / 255;
      d[i] = ar * v;
      d[i + 1] = ag * v;
      d[i + 2] = ab * v;
    }
  }
  c.putImageData(img, x, y);
}

/** Multiplies a layer's alpha by a vertical ramp: solid above `from`, clear at `to`. */
export function fadeLayer(c: CanvasRenderingContext2D, from: number, to: number) {
  const g = c.createLinearGradient(0, from, 0, to);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.save();
  c.globalCompositeOperation = "destination-in";
  c.fillStyle = g;
  c.fillRect(0, 0, CARD_W, CARD_H);
  c.restore();
}

export type CutoutLook = {
  tone: Tone;
  accent: string;
  /** Where the fade to nothing starts, as a fraction of the cut-out's height. */
  fadeFrom: number;
  shadow?: { x: number; y: number; blur: number; alpha: number };
  /** A rim of accent light down the player's left edge. */
  rim?: boolean;
};

/** Draws a cut-out into its box with the house treatment: rim light, shadow, graded, faded out at the bottom. Returns where it landed. */
export function drawCutout(ctx: CanvasRenderingContext2D, img: HTMLImageElement, box: Box, fr: Framing, look: CutoutLook): Placement {
  const p = placeCutout(img, box, fr);
  const fadeFrom = p.top + p.dh * look.fadeFrom;
  const fadeTo = p.top + p.dh;

  if (look.rim) {
    const [sil, s] = layer();
    s.drawImage(img, p.left, p.top, p.dw, p.dh);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = look.accent;
    s.fillRect(0, 0, CARD_W, CARD_H);
    s.globalCompositeOperation = "source-over";
    fadeLayer(s, fadeFrom, fadeTo);
    ctx.save();
    ctx.globalAlpha = 0.9;
    if (typeof (ctx as { filter?: unknown }).filter === "string") {
      ctx.filter = "blur(10px)";
      ctx.drawImage(sil, -16, 0);
    } else {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(sil, -12, 0);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(sil, -20, 0);
    }
    ctx.restore();
  }

  const [sheet, s] = layer();
  s.drawImage(img, p.left, p.top, p.dw, p.dh);
  tonePixels(s, look.tone, look.accent, { x: p.left, y: p.top, w: p.dw, h: p.dh });
  fadeLayer(s, fadeFrom, fadeTo);

  ctx.save();
  if (look.shadow) {
    ctx.shadowColor = `rgba(0,0,0,${look.shadow.alpha})`;
    ctx.shadowBlur = look.shadow.blur;
    ctx.shadowOffsetX = look.shadow.x;
    ctx.shadowOffsetY = look.shadow.y;
  }
  ctx.drawImage(sheet, 0, 0);
  ctx.restore();
  return p;
}

/** Draws a full photo filling a box, graded as asked. */
export function drawCoverPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, box: Box, fr: Framing, tone: Tone, accent: string, alpha = 1) {
  const p = placeCover(img, box, fr);
  const [sheet, s] = layer();
  s.save();
  s.beginPath();
  s.rect(box.x, box.y, box.w, box.h);
  s.clip();
  s.drawImage(img, p.left, p.top, p.dw, p.dh);
  s.restore();
  tonePixels(s, tone, accent, box);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sheet, 0, 0);
  ctx.restore();
}
