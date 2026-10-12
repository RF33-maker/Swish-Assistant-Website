/**
 * Canvas helpers the Swish Social cards are built from: the card size and fonts,
 * image loading, text and photo placement, and the footer. The cards themselves
 * live in generatePlayerOfTheWeekCard.ts, generateTeamOfTheWeekCard.ts and
 * generateLeadersCards.ts, and share their look through cardStyle.ts.
 * Everything is drawn straight onto a Canvas 2D context (same approach as
 * generateTrendingCard.ts) so the preview and the exported PNG are the same
 * pixels — html2canvas mangles rotated text and object-fit crops.
 */

import type { WeeklyAward } from "@/types/weeklyAwards";

export const CARD_W = 1080;
export const CARD_H = 1350;

export const DISPLAY = '"Oswald", Impact, "Arial Narrow", sans-serif';
export const BODY = "Arial, Helvetica, sans-serif";
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap";

let displayFont: Promise<void> | null = null;

/** Loads the condensed display font on demand (only the Swish Social cards need it). */
export function ensureDisplayFont(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  displayFont ??= (async () => {
    if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_HREF;
      // Until the stylesheet arrives the browser has never heard of the font, and asking it to load
      // one would resolve at once with nothing: a card drawn then comes out in the fallback face.
      // Give up after a few seconds so a blocked font host can't hold a card back.
      const arrived = new Promise<void>((resolve) => {
        link.onload = () => resolve();
        link.onerror = () => resolve();
        setTimeout(resolve, 4000);
      });
      document.head.appendChild(link);
      await arrived;
    }
    try {
      await Promise.all(["400", "500", "600", "700"].map((w) => document.fonts.load(`${w} 40px "Oswald"`)));
    } catch {
      // fall back to the system condensed stack
    }
    // Not there yet (slow or blocked): let the next card try again rather than settle for the fallback.
    if (!document.fonts.check('700 40px "Oswald"')) displayFont = null;
  })();
  return displayFont;
}

// ── colour / stat helpers ────────────────────────────────────────────────────

export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    const out = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.round(Math.max(0, Math.min(255, out)));
  };
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

type StatKey = "pts" | "reb" | "ast" | "stl" | "blk";
const STAT_LABEL: Record<StatKey, string> = { pts: "PTS", reb: "REB", ast: "AST", stl: "STL", blk: "BLK" };
const STAT_ORDER: StatKey[] = ["pts", "reb", "ast", "stl", "blk"];
const STAT_WEIGHT = { reb: 1.2, ast: 1.3, stl: 1.7, blk: 2.0 } as const;

/** PTS plus the two categories that contributed most to the game score, in display order. */
export function headlineStats(a: WeeklyAward): { key: StatKey; label: string; value: number }[] {
  const val = (k: StatKey) => Number(a[k] ?? 0);
  const extras = (["reb", "ast", "stl", "blk"] as const)
    .map((k) => ({ k, score: val(k) * STAT_WEIGHT[k] }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 2)
    .map((e) => e.k);
  const chosen = new Set<StatKey>(["pts", ...extras]);
  return STAT_ORDER.filter((k) => chosen.has(k)).map((key) => ({ key, label: STAT_LABEL[key], value: val(key) }));
}

export const fmtGameScore = (v: number | null) => (v == null ? "—" : Number(v).toFixed(1));
export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

// ── image loading ────────────────────────────────────────────────────────────

function loadImg(src: string, crossOrigin = true): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadWithFallback(src: string): Promise<HTMLImageElement | null> {
  const direct = await loadImg(src);
  if (direct) return direct;
  try {
    const resp = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!resp.ok) return null;
    const blobUrl = URL.createObjectURL(await resp.blob());
    return await loadImg(blobUrl, false);
  } catch {
    return null;
  }
}

// Photo framing redraws the card on every slider tick, so keep decoded images around.
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

export function fetchImg(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  let cached = imageCache.get(src);
  if (!cached) {
    cached = loadWithFallback(src).then((img) => {
      if (!img) imageCache.delete(src);
      return img;
    });
    imageCache.set(src, cached);
  }
  return cached;
}

// ── canvas helpers ───────────────────────────────────────────────────────────

export type TextOpts = {
  size: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  family?: string;
  alpha?: number;
};

export function setFont(ctx: CanvasRenderingContext2D, o: TextOpts) {
  ctx.font = `${o.weight ?? 400} ${o.size}px ${o.family ?? DISPLAY}`;
}

export function capHeight(ctx: CanvasRenderingContext2D, o: TextOpts): number {
  setFont(ctx, o);
  return ctx.measureText("H").actualBoundingBoxAscent;
}

/** Draws text with its capital-letter top edge at `topY`; returns the cap height. */
export function drawTextTop(ctx: CanvasRenderingContext2D, text: string, x: number, topY: number, o: TextOpts): number {
  setFont(ctx, o);
  const cap = ctx.measureText("H").actualBoundingBoxAscent;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = o.color ?? "#fff";
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, topY + cap);
  ctx.restore();
  return cap;
}

export function fitSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, max: number, min: number, weight = 400): number {
  for (let size = max; size > min; size -= 1) {
    ctx.font = `${weight} ${size}px ${DISPLAY}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return min;
}

/** zoom is relative to "fill the frame"; x/y are shifts as a percentage of the frame (positive = right / down). */
export type PhotoFraming = { zoom: number; x: number; y: number };
export type FramingMap = Record<string, PhotoFraming | undefined>;

export const DEFAULT_FRAMING: PhotoFraming = { zoom: 1, x: 0, y: 0 };

/** How much of the competition colour washes over the Player of the Week backdrop (0–100). */
export const DEFAULT_TINT = 30;

export function defaultFraming(_award?: WeeklyAward): PhotoFraming {
  return { ...DEFAULT_FRAMING };
}

/** Where a face sits in its photo, as fractions of the photo (0–1). */
export type HeadPoint = { x: number; y: number };
export type HeadMap = Record<string, HeadPoint | undefined>;

/** Shared height for every head on Team of the Week, as a percentage of the photo panel. */
export const DEFAULT_HEAD_LINE = 26;
// Used until a face has been marked: roughly where a head sits in a three-quarter shot.
export const GUESSED_HEAD: HeadPoint = { x: 0.5, y: 0.3 };
const MAX_HEAD_ZOOM = 2.5;

type Placement = { left: number; top: number; scale: number; aligned: boolean };

/**
 * Positions a photo inside a frame so it always fills it edge to edge (no gaps, no fades).
 * With a head point, the photo is zoomed just enough, and shifted, so that face lands on
 * the shared head line; if that would need more than MAX_HEAD_ZOOM it gets as close as it can.
 */
export function placeInFrame(
  img: HTMLImageElement,
  w: number,
  h: number,
  o: { framing: PhotoFraming; head: HeadPoint | null; headLine: number; focusY: number },
): Placement {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const cover = Math.max(w / iw, h / ih);
  const base = cover * Math.max(1, o.framing.zoom);
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  if (!o.head) {
    const left = clamp((w - iw * base) / 2 + (o.framing.x / 100) * w, w - iw * base, 0);
    const top = clamp((h - ih * base) * (clamp(o.focusY, 0, 100) / 100) + (o.framing.y / 100) * h, h - ih * base, 0);
    return { left, top, scale: base, aligned: true };
  }

  const headX = o.head.x * iw;
  const headY = o.head.y * ih;
  const targetX = w / 2 + (o.framing.x / 100) * w;
  const targetY = (o.headLine / 100 + o.framing.y / 100) * h;
  // Smallest zoom that lets the head reach the target without exposing the top or bottom edge.
  const needTop = headY > 0 ? targetY / headY : 0;
  const needBottom = ih - headY > 0 ? (h - targetY) / (ih - headY) : 0;
  const scale = Math.min(Math.max(base, needTop, needBottom), cover * Math.max(MAX_HEAD_ZOOM, o.framing.zoom));

  const wantedTop = targetY - headY * scale;
  const top = clamp(wantedTop, h - ih * scale, 0);
  const left = clamp(targetX - headX * scale, w - iw * scale, 0);
  return { left, top, scale, aligned: Math.abs(top - wantedTop) < 1 };
}

export function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, alpha = 1) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

export function verticalGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([at, colour]) => g.addColorStop(at, colour));
  return g;
}

export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

type FooterLogo = HTMLImageElement | "statsthread";

/** The StatsThread network mark, drawn from the same paths as the photo overlay card. */
function drawStatsThreadMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = "#62D4E8";
  ctx.lineWidth = 2.4;
  ctx.globalAlpha = 0.65;
  ctx.stroke(new Path2D("M50 16 L20 38 L20 70 L50 88 L80 70 L80 38 Z"));
  ctx.stroke(new Path2D("M50 16 L50 52 M20 38 L50 52 M80 38 L50 52 M20 70 L50 52 M80 70 L50 52 M50 88 L50 52"));
  ctx.stroke(new Path2D("M20 38 L80 38 M20 70 L80 70 M50 16 L20 70 M50 16 L80 70 M50 88 L20 38 M50 88 L80 38"));
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#62D4E8";
  for (const [cx, cy, r] of [[50, 16, 6], [20, 38, 6], [80, 38, 6], [20, 70, 6], [80, 70, 6], [50, 88, 6], [50, 52, 7]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Centred logo row along the bottom with a small competition label under it (photo overlay style). */
export function drawFooter(ctx: CanvasRenderingContext2D, logos: (FooterLogo | null)[], label: string) {
  const items = logos.filter((l): l is FooterLogo => l !== null);
  const rowH = items.length <= 4 ? 64 : 54;
  const maxW = items.length <= 4 ? 150 : 110;
  const gap = items.length <= 4 ? 52 : 30;
  const widths = items.map((l) => (l === "statsthread" ? rowH : Math.min(maxW, (l.naturalWidth * rowH) / l.naturalHeight)));
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, items.length - 1);
  const rowTop = CARD_H - 128;

  let x = (CARD_W - total) / 2;
  items.forEach((l, i) => {
    if (l === "statsthread") drawStatsThreadMark(ctx, x, rowTop, rowH);
    else drawContain(ctx, l, x, rowTop, widths[i], rowH);
    x += widths[i] + gap;
  });

  if (label) {
    ctx.save();
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "1.4px";
    drawTextTop(ctx, label.toUpperCase(), CARD_W / 2, CARD_H - 44, {
      size: 14, weight: 700, family: BODY, alpha: 0.48, align: "center",
    });
    ctx.restore();
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
