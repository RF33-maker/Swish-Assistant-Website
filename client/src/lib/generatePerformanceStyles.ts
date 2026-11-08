/**
 * The Swish Social performance card styles — Headline, Editorial, Duotone and
 * Numbers, then the four drawn from the NBA clubs' graphics: Panel, Glow, Ranked
 * and Frame — drawn straight onto a Canvas 2D context, the same way as the weekly
 * cards, so the preview is the PNG that gets exported. Each style comes in two
 * versions: a cut-out version when the player has a background-removed photo (the
 * type sits behind the player), and a game-photo version for any other photo.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { PerformanceRank, PlayerPerformanceV1Data } from "@/types/socialCards";
import { CARD_H, CARD_W, capHeight, drawContain, fetchImg, setFont, type TextOpts } from "@/lib/generateWeeklyCards";
import { cleanTeamLabel, drawCrest, drawSpaced, spacedWidth, splitName, themeFor } from "@/lib/cardStyle";

export type PerformanceStyle = "headline" | "editorial" | "duotone" | "numbers" | "panel" | "glow" | "ranked" | "frame";

export const PERFORMANCE_STYLES: { id: PerformanceStyle; label: string; hint: string }[] = [
  { id: "headline", label: "Headline", hint: "Dark card, the surname set huge behind the player, one hero stat" },
  { id: "editorial", label: "Editorial", hint: "Paper card, the photo in black and white on a colour block, stats in a column" },
  { id: "duotone", label: "Duotone", hint: "Diagonal split, the photo in two tones, stats in the black band" },
  { id: "numbers", label: "Numbers", hint: "Two giant numbers over the photo, labels in black blocks" },
  { id: "panel", label: "Panel", hint: "A black side panel with three foil numerals, the photo filling the rest" },
  { id: "glow", label: "Glow", hint: "A serif number and a soft light behind the player on a cloudy backdrop" },
  { id: "ranked", label: "Ranked", hint: "Where the game ranks among the competition's scoring games this season, set huge" },
  { id: "frame", label: "Frame", hint: "A white print frame over a blurred copy of the photo, the surname set huge" },
];

export function isPerformanceStyle(template: string | null | undefined): template is PerformanceStyle {
  return PERFORMANCE_STYLES.some((s) => s.id === template);
}

export const DEFAULT_ACCENT = "#f97316";

const DISPLAY = '"Barlow Condensed", "Oswald", Impact, "Arial Narrow", sans-serif';
const BODY = '"Inter", Arial, Helvetica, sans-serif';
/** The poster face of the reference styles: one heavy weight, set huge. */
const POSTER = '"Anton", "Barlow Condensed", Impact, "Arial Narrow", sans-serif';
/** The serif of the Glow style, always italic. */
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,500&family=Anton&family=Playfair+Display:ital,wght@1,700;1,900&display=swap";

const SIDE = 72;
const DARK = "#0b0b0d";
const PAPER = "#edece7";
const INK = "#111111";

let fontsReady: Promise<void> | null = null;

/** Loads the card's typefaces on demand; falls back to the system stacks if they never arrive. */
function ensureFonts(): Promise<void> {
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
        document.fonts.load('italic 500 20px "Inter"'),
        document.fonts.load('400 40px "Anton"'),
        document.fonts.load('italic 700 40px "Playfair Display"'),
        document.fonts.load('italic 900 40px "Playfair Display"'),
      ]);
    } catch {
      // the system condensed stack stands in
    }
  })();
  return fontsReady;
}

// ── small helpers ────────────────────────────────────────────────────────────

const display = (size: number, weight: number, extra: Partial<TextOpts> = {}): TextOpts => ({ size, weight, family: DISPLAY, ...extra });
const body = (size: number, weight: number, extra: Partial<TextOpts> = {}): TextOpts => ({ size, weight, family: BODY, ...extra });
const poster = (size: number, extra: Partial<TextOpts> = {}): TextOpts => ({ size, weight: 400, family: POSTER, ...extra });

function textWidth(ctx: CanvasRenderingContext2D, text: string, o: TextOpts): number {
  setFont(ctx, o);
  return ctx.measureText(text).width;
}

/** The largest display size (stepping down by two) at which `text` fits `maxWidth`. */
function fitDisplay(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, max: number, min: number, weight: number): number {
  for (let size = max; size > min; size -= 2) {
    if (textWidth(ctx, text, display(size, weight)) <= maxWidth) return size;
  }
  return min;
}

/** The same for the poster face. */
function fitPoster(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, max: number, min: number): number {
  for (let size = max; size > min; size -= 4) {
    if (textWidth(ctx, text, poster(size)) <= maxWidth) return size;
  }
  return min;
}

/** Italic faces: the canvas font string wants the style before the weight, which TextOpts has no slot for. */
type ItalicOpts = { size: number; weight: number; family: string; color?: string; align?: CanvasTextAlign; alpha?: number };
type SpacedCtx = CanvasRenderingContext2D & { letterSpacing?: string };

function setItalic(ctx: CanvasRenderingContext2D, o: ItalicOpts) {
  ctx.font = `italic ${o.weight} ${o.size}px ${o.family}`;
}

function italicWidth(ctx: CanvasRenderingContext2D, text: string, o: ItalicOpts, spacing = 0): number {
  const c = ctx as SpacedCtx;
  ctx.save();
  if (typeof c.letterSpacing === "string") c.letterSpacing = `${spacing}px`;
  setItalic(ctx, o);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/** Draws italic text with its cap top at `topY`; returns its width. */
function drawItalic(ctx: CanvasRenderingContext2D, text: string, x: number, topY: number, o: ItalicOpts, spacing = 0): number {
  const c = ctx as SpacedCtx;
  ctx.save();
  if (typeof c.letterSpacing === "string") c.letterSpacing = `${spacing}px`;
  setItalic(ctx, o);
  const cap = ctx.measureText("H").actualBoundingBoxAscent;
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = o.color ?? "#fff";
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, topY + cap);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/** Greedy word wrap at a tracked body size. */
function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, spacing: number, o: TextOpts): string[] {
  const lines: string[] = [];
  let line = "";
  text.split(/\s+/).filter(Boolean).forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (line && spacedWidth(ctx, next, spacing, o) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

const SMALL_WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE"];

/** "SEVEN" up to twelve, digits from there, the way a caption would have it. */
function numberWord(n: number): string {
  return n >= 0 && n < SMALL_WORDS.length ? SMALL_WORDS[n] : String(n);
}

function ordinalSuffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return "TH";
  const unit = n % 10;
  return unit === 1 ? "ST" : unit === 2 ? "ND" : unit === 3 ? "RD" : "TH";
}

/** Draws text with its cap top at `topY` and returns its width; the plain version of drawSpaced. */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, topY: number, o: TextOpts): number {
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
function strokeTextTop(ctx: CanvasRenderingContext2D, text: string, x: number, topY: number, o: TextOpts, stroke: string, lineWidth: number) {
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

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xf97316;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function accentOf(data: PlayerPerformanceV1Data): string {
  const hex = (data.accent_hex || "").trim();
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : DEFAULT_ACCENT;
}

/** `t` of the way from one hex colour to another, as an rgb() string. */
function mixHex(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const at = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${at(0)},${at(1)},${at(2)})`;
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function layer(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = CARD_W;
  c.height = CARD_H;
  return [c, c.getContext("2d")!];
}

/** A soft ellipse of colour out of (cx, cy), optionally blended on. */
function ellipseGlow(
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

function vertical(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([at, colour]) => g.addColorStop(at, colour));
  return g;
}

let grainTile: HTMLCanvasElement | null = null;

/** Film grain: a tile of mid-grey noise blended over the whole card. */
function drawGrain(ctx: CanvasRenderingContext2D, alpha: number, op: GlobalCompositeOperation = "overlay") {
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

type Box = { x: number; y: number; w: number; h: number };
/** Where an image lands on the card; `fig` is the part that is the player, for a cut-out. */
type Placement = { left: number; top: number; dw: number; dh: number; fig?: Box };
type Framing = { zoom: number; x: number; y: number; focusY: number };
type Tone = "natural" | "graded" | "mono" | "duotone";

type Photo = { img: HTMLImageElement; cutout: boolean };

function framingOf(data: PlayerPerformanceV1Data): Framing {
  const focusY = Math.max(0, Math.min(100, Number(data.photo_focus_y ?? 50)));
  return {
    zoom: Math.max(0.4, Math.min(3, Number(data.photo_zoom ?? 1))),
    x: Math.max(0, Math.min(100, Number(data.photo_position_x ?? 50))),
    y: Math.max(0, Math.min(100, Number(data.photo_position_y ?? focusY))),
    focusY,
  };
}

/** The player's photo, cut-out when there is one and it is wanted, else the full game photo. */
async function loadPhoto(data: PlayerPerformanceV1Data): Promise<Photo | null> {
  if (data.photo_mode !== "photo" && data.cutout_photo_url) {
    const img = await fetchImg(data.cutout_photo_url);
    if (img) return { img, cutout: true };
  }
  const img = await fetchImg(data.background_photo_url || data.photo_url);
  return img ? { img, cutout: false } : null;
}

const boundsCache = new WeakMap<HTMLImageElement, Box>();

/** The box around a cut-out's opaque pixels, as fractions of the image: most cut-outs carry blank space above the head. */
function opaqueBounds(img: HTMLImageElement): Box {
  const cached = boundsCache.get(img);
  if (cached) return cached;
  const w = 128;
  const h = Math.max(1, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * w));
  let box: Box = { x: 0, y: 0, w: 1, h: 1 };
  try {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (d[(y * w + x) * 4 + 3] > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0) box = { x: minX / w, y: minY / h, w: (maxX - minX + 1) / w, h: (maxY - minY + 1) / h };
  } catch {
    // A tainted canvas: treat the whole image as the figure.
  }
  boundsCache.set(img, box);
  return box;
}

/** A cut-out's figure (its opaque pixels, not the whole image) sits bottom-centre in its box; zoom grows it, the sliders nudge it. */
function placeCutout(img: HTMLImageElement, box: Box, fr: Framing): Placement {
  const b = opaqueBounds(img);
  const figW = img.naturalWidth * b.w;
  const figH = img.naturalHeight * b.h;
  const scale = Math.min(box.w / figW, box.h / figH) * fr.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const fig: Box = {
    x: box.x + (box.w - figW * scale) / 2 + ((fr.x - 50) / 100) * box.w,
    y: box.y + (box.h - figH * scale) + ((fr.y - fr.focusY) / 100) * box.h,
    w: figW * scale,
    h: figH * scale,
  };
  return { left: fig.x - b.x * dw, top: fig.y - b.y * dh, dw, dh, fig };
}

/** A full photo fills its box edge to edge; the sliders pick which part shows. */
function placeCover(img: HTMLImageElement, box: Box, fr: Framing): Placement {
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
function tonePixels(c: CanvasRenderingContext2D, tone: Tone, accent: string, box: Box) {
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
function fadeLayer(c: CanvasRenderingContext2D, from: number, to: number) {
  const g = c.createLinearGradient(0, from, 0, to);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.save();
  c.globalCompositeOperation = "destination-in";
  c.fillStyle = g;
  c.fillRect(0, 0, CARD_W, CARD_H);
  c.restore();
}

type CutoutLook = {
  tone: Tone;
  accent: string;
  /** Where the fade to nothing starts, as a fraction of the cut-out's height. */
  fadeFrom: number;
  shadow?: { x: number; y: number; blur: number; alpha: number };
  /** A rim of accent light down the player's left edge. */
  rim?: boolean;
};

/** Draws a cut-out into its box with the house treatment: rim light, shadow, graded, faded out at the bottom. */
function drawCutout(ctx: CanvasRenderingContext2D, img: HTMLImageElement, box: Box, fr: Framing, look: CutoutLook) {
  const p = placeCutout(img, box, fr);
  const fig = p.fig ?? { x: p.left, y: p.top, w: p.dw, h: p.dh };
  const fadeFrom = fig.y + fig.h * look.fadeFrom;
  const fadeTo = fig.y + fig.h;

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
}

/** Draws a full photo filling a box, graded as asked. */
function drawCoverPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, box: Box, fr: Framing, tone: Tone, accent: string) {
  const p = placeCover(img, box, fr);
  const [sheet, s] = layer();
  s.save();
  s.beginPath();
  s.rect(box.x, box.y, box.w, box.h);
  s.clip();
  s.drawImage(img, p.left, p.top, p.dw, p.dh);
  s.restore();
  tonePixels(s, tone, accent, box);
  ctx.drawImage(sheet, 0, 0);
}

// ── the words and numbers ────────────────────────────────────────────────────

type Stat = { label: string; long: string; value: string };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** The two of rebounds / assists / steals / blocks that mattered most in this game. */
function topExtras(data: PlayerPerformanceV1Data): Stat[] {
  const all: (Stat & { score: number })[] = [
    { label: "REB", long: "REBOUNDS", value: String(num(data.rebounds)), score: num(data.rebounds) * 1.2 },
    { label: "AST", long: "ASSISTS", value: String(num(data.assists)), score: num(data.assists) * 1.3 },
    { label: "STL", long: "STEALS", value: String(num(data.steals)), score: num(data.steals) * 1.7 },
    { label: "BLK", long: "BLOCKS", value: String(num(data.blocks)), score: num(data.blocks) * 2 },
  ];
  const chosen = [...all].sort((a, b) => b.score - a.score).slice(0, 2);
  // Keep them in the familiar REB, AST, STL, BLK order.
  return all.filter((s) => chosen.includes(s));
}

const dash = (split: string) => (split || "0/0").replace("/", "–");

function leagueShort(data: PlayerPerformanceV1Data): string {
  return (data.league_name || "")
    .replace(/\s+\d{4}([-/–]\d{2,4})?$/, "")
    .replace(/\s+\d{2}[-/–]\d{2}$/, "")
    .trim()
    .toUpperCase();
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase();
}

type Ink = { text: string; strong: string; muted: string; rule: string };
const DARK_INK: Ink = { text: "rgba(255,255,255,0.72)", strong: "#ffffff", muted: "rgba(255,255,255,0.55)", rule: "rgba(255,255,255,0.14)" };
const PAPER_INK: Ink = { text: "rgba(17,17,17,0.78)", strong: INK, muted: "rgba(17,17,17,0.62)", rule: "rgba(17,17,17,0.28)" };

/** "NOTTINGHAM HOODS 98 – 71 BRISTOL FLYERS II", the player's team's score in bold, shrunk to fit. */
function drawScoreLine(ctx: CanvasRenderingContext2D, data: PlayerPerformanceV1Data, x: number, topY: number, maxWidth: number, ink: Ink) {
  let team = cleanTeamLabel(data.team_name).toUpperCase();
  let opp = cleanTeamLabel(data.opponent_name).toUpperCase();
  const hasScore = num(data.home_score) > 0 || num(data.away_score) > 0;
  const parts = (): { text: string; strong: boolean }[] =>
    hasScore
      ? [{ text: `${team} `, strong: false }, { text: String(num(data.home_score)), strong: true }, { text: ` – ${num(data.away_score)} ${opp}`, strong: false }]
      : [{ text: `${team} VS ${opp}`, strong: false }];
  const width = (size: number) =>
    parts().reduce((sum, p) => sum + spacedWidth(ctx, p.text, size * 0.1, body(size, p.strong ? 700 : 500)), 0);
  let size = 17;
  while (size > 12 && width(size) > maxWidth) size -= 1;
  // Still too long at the smallest size: trim the names.
  let guard = 0;
  while (width(size) > maxWidth && guard < 40) {
    if (team.length >= opp.length && team.length > 6) team = `${team.slice(0, -2).trimEnd()}…`;
    else if (opp.length > 6) opp = `${opp.slice(0, -2).trimEnd()}…`;
    else break;
    guard += 1;
  }
  let cursor = x;
  parts().forEach((p) => {
    const o = body(size, p.strong ? 700 : 500, { color: p.strong ? ink.strong : ink.text });
    drawSpaced(ctx, p.text, cursor, topY, size * 0.1, o);
    cursor += spacedWidth(ctx, p.text, size * 0.1, o);
  });
}

type FooterAssets = { swish: HTMLImageElement | null; crest: HTMLImageElement | null; sponsors: HTMLImageElement[] };

/**
 * The strip along the bottom of every style: a hairline, the score on the left and,
 * on the right, the club crest, the competition (or the site), any sponsor marks and
 * the Swish mark.
 */
function drawFooter(
  ctx: CanvasRenderingContext2D,
  data: PlayerPerformanceV1Data,
  assets: FooterAssets,
  ruleY: number,
  ink: Ink,
  accent: string,
  rightLabel: string,
) {
  ctx.fillStyle = ink.rule;
  ctx.fillRect(SIDE, ruleY, CARD_W - SIDE * 2, 1);
  const cy = ruleY + 42;

  // Lay the right-hand cluster out from the right edge inwards.
  const labelOpts = body(14, 600, { color: ink.muted });
  const items: { w: number; draw: (x: number) => void }[] = [];
  if (assets.swish) {
    items.push({ w: 38, draw: (x) => drawContain(ctx, assets.swish!, x, cy - 19, 38, 38) });
  }
  assets.sponsors.slice(0, 4).reverse().forEach((logo) => {
    const w = Math.min(90, (logo.naturalWidth / Math.max(1, logo.naturalHeight)) * 32);
    items.push({ w, draw: (x) => drawContain(ctx, logo, x, cy - 16, w, 32, 0.9) });
  });
  let label = rightLabel;
  const spareForLabel = CARD_W - SIDE * 2 - 420 - items.reduce((s, i) => s + i.w + 14, 0);
  while (label && spacedWidth(ctx, label, 3.6, labelOpts) > spareForLabel) {
    const cut = label.lastIndexOf(" · ");
    label = cut > 0 ? label.slice(0, cut) : "";
  }
  if (label) {
    const w = spacedWidth(ctx, label, 3.6, labelOpts) - 3.6;
    items.push({ w, draw: (x) => drawSpaced(ctx, label, x, cy - capHeight(ctx, labelOpts) / 2, 3.6, labelOpts) });
  }
  if (assets.crest) {
    const crest = assets.crest;
    items.push({ w: 40, draw: (x) => drawCrest(ctx, x + 20, cy, 20, crest, "", themeFor("swish", accent)) });
  }
  let right = CARD_W - SIDE;
  items.forEach((item) => {
    right -= item.w;
    item.draw(right);
    right -= 14;
  });

  const scoreOpts = body(17, 500);
  drawScoreLine(ctx, data, SIDE, cy - capHeight(ctx, scoreOpts) / 2, right - SIDE - 10, ink);
}

// ── the styles ───────────────────────────────────────────────────────────────

type Scene = {
  ctx: CanvasRenderingContext2D;
  data: PlayerPerformanceV1Data;
  accent: string;
  photo: Photo | null;
  /** The full photo even when a cut-out is in use, for a soft backdrop behind it. */
  raw: HTMLImageElement | null;
  fr: Framing;
  first: string;
  last: string;
  assets: FooterAssets;
};

/** Small tracked caps running up the right edge, the way the NBA clubs credit a player. */
function drawEdgeCaption(ctx: CanvasRenderingContext2D, text: string, x: number, bottomY: number, colour: string) {
  const o = body(14, 600, { color: colour });
  const len = spacedWidth(ctx, text, 14 * 0.3, o);
  ctx.save();
  ctx.translate(x, bottomY);
  ctx.rotate(-Math.PI / 2);
  drawSpaced(ctx, text, 0, 0, 14 * 0.3, o);
  ctx.restore();
  return len;
}

function drawHeadline(s: Scene) {
  const { ctx, data, accent, photo, fr } = s;
  const cutout = photo?.cutout ?? false;
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (photo && !cutout) {
    drawCoverPhoto(ctx, photo.img, { x: 0, y: 0, w: CARD_W, h: CARD_H }, fr, "graded", accent);
    ellipseGlow(ctx, CARD_W / 2, 432, 918, 945, [[0.45, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.6)"]]);
    ctx.fillStyle = vertical(ctx, 0, CARD_H, [
      [0, "rgba(11,11,13,0.78)"], [0.22, "rgba(11,11,13,0)"], [0.44, "rgba(11,11,13,0)"],
      [0.6, "rgba(11,11,13,0.6)"], [0.76, "rgba(11,11,13,0.94)"], [1, DARK],
    ]);
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ellipseGlow(ctx, 972, 81, 648, 675, [[0, accent], [0.7, "rgba(0,0,0,0)"]], "screen", 0.3);
  } else {
    ellipseGlow(ctx, CARD_W / 2, 486, 626, 567, [[0, "rgba(255,255,255,0.11)"], [0.7, "rgba(255,255,255,0)"]]);
  }

  // Kicker top-left; the club top-right on a photo, or up the right edge beside a cut-out.
  drawSpaced(ctx, "TOP PERFORMANCE", SIDE, 66, 18 * 0.36, body(18, 700, { color: accent }));
  const club = cleanTeamLabel(data.team_name).toUpperCase();
  if (cutout || !photo) {
    const caption = [[s.first, s.last].filter(Boolean).join(" ").toUpperCase(), club].filter(Boolean).join("   /   ");
    drawEdgeCaption(ctx, caption, CARD_W - SIDE + 14, 1000, "rgba(255,255,255,0.5)");
  } else {
    const clubOpts = body(16, 600, { color: "rgba(255,255,255,0.6)", align: "right" });
    if (club && spacedWidth(ctx, club, 16 * 0.26, clubOpts) < 520) drawSpaced(ctx, club, CARD_W - SIDE, 66, 16 * 0.26, clubOpts);
  }

  const firstOpts = display(30, 600, { color: "rgba(255,255,255,0.8)" });
  if (cutout || !photo) {
    // The surname, huge, with the player standing in front of it.
    if (s.first) drawSpaced(ctx, s.first, CARD_W / 2, 118, 30 * 0.42, { ...firstOpts, align: "center" });
    const size = fitDisplay(ctx, s.last, CARD_W - SIDE * 2 + 40, 500, 160, 900);
    const cap = capHeight(ctx, display(size, 900));
    const top = 186 + (350 - cap) * 0.45;
    drawText(ctx, s.last, CARD_W / 2, top, display(size, 900, { color: accent, align: "center" }));
    if (photo) {
      drawCutout(ctx, photo.img, { x: 156, y: 240, w: 768, h: 820 }, fr, {
        tone: "natural", accent, fadeFrom: 0.74, rim: true, shadow: { x: 0, y: 40, blur: 48, alpha: 0.6 },
      });
    }
  } else {
    // On a game photo the name sits on the dark gradient instead.
    if (s.first) drawSpaced(ctx, s.first, SIDE, 686, 30 * 0.42, firstOpts);
    const size = fitDisplay(ctx, s.last, CARD_W - SIDE * 2 + 30, 240, 110, 900);
    const cap = capHeight(ctx, display(size, 900));
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 24;
    drawText(ctx, s.last, SIDE - 8, 738 + (173 - cap), display(size, 900, { color: accent }));
    ctx.restore();
  }

  // Hero stat and the three that back it up, on one baseline.
  const baseline = cutout || !photo ? 1190 : 1118;
  const heroSize = cutout || !photo ? 300 : 210;
  const heroOpts = display(heroSize, 800, { color: "#ffffff" });
  const heroCap = capHeight(ctx, heroOpts);
  const points = String(num(data.points));
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  const heroW = drawText(ctx, points, SIDE - 6, baseline - heroCap, heroOpts);
  ctx.restore();
  const labelOpts = body(20, 700, { color: accent });
  drawSpaced(ctx, "POINTS", SIDE - 6 + heroW + 16, baseline - 12 - capHeight(ctx, labelOpts), 20 * 0.32, labelOpts);
  const heroRight = SIDE - 6 + heroW + 16 + spacedWidth(ctx, "POINTS", 20 * 0.32, labelOpts);

  const extras = topExtras(data);
  const cells: Stat[] = [...extras, { label: "FG", long: "FIELD GOALS", value: data.fg || "0/0" }, { label: "+/−", long: "PLUS / MINUS", value: data.plus_minus || "0" }];
  const room = CARD_W - SIDE - heroRight - 36;
  let size = cutout || !photo ? 88 : 84;
  const gap = 36;
  const widthAt = (sz: number) => cells.reduce((sum, c) => sum + Math.max(textWidth(ctx, c.value, display(sz, 700)), spacedWidth(ctx, c.label, 16 * 0.26, body(16, 600))), 0) + gap * (cells.length - 1);
  while (size > 56 && widthAt(size) > room) size -= 4;
  if (widthAt(size) > room) cells.pop();
  let x = CARD_W - SIDE;
  [...cells].reverse().forEach((c) => {
    const vOpts = display(size, 700, { color: "#ffffff" });
    const w = Math.max(textWidth(ctx, c.value, vOpts), spacedWidth(ctx, c.label, 16 * 0.26, body(16, 600)));
    x -= w;
    drawText(ctx, c.value, x, baseline - 34 - capHeight(ctx, vOpts), vOpts);
    drawSpaced(ctx, c.label, x, baseline - 8 - capHeight(ctx, body(16, 600)), 16 * 0.26, body(16, 600, { color: "rgba(255,255,255,0.58)" }));
    x -= gap;
  });

  drawFooter(ctx, data, s.assets, CARD_H - 126, DARK_INK, accent, [leagueShort(data), formatDate(data.game_date)].filter(Boolean).join(" · "));
  drawGrain(ctx, 0.26);
}

function drawEditorial(s: Scene) {
  const { ctx, data, accent, photo, fr } = s;
  const cutout = photo?.cutout ?? false;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const kicker = ["TOP PERFORMANCE", leagueShort(data), formatDate(data.game_date)].filter(Boolean).join(" · ");
  drawSpaced(ctx, kicker, SIDE, 64, 15 * 0.3, body(15, 600, { color: PAPER_INK.muted }));
  if (s.assets.swish) drawContain(ctx, s.assets.swish, CARD_W - SIDE - 40, 50, 40, 40);

  const fullName = [s.first, s.last].filter(Boolean).join(" ");
  const nameSize = fitDisplay(ctx, fullName, CARD_W - SIDE * 2 + 8, 150, 70, 900);
  drawText(ctx, fullName, SIDE - 4, 100 + (150 - nameSize) * 0.5, display(nameSize, 900, { color: INK }));

  const column: Box = cutout || !photo ? { x: 640, y: 300, w: 368, h: 0 } : { x: 660, y: 300, w: 348, h: 0 };

  if (cutout || !photo) {
    ctx.fillStyle = accent;
    ctx.fillRect(SIDE, 268, 480, 880);
    const caption = cleanTeamLabel(data.team_name).toUpperCase();
    if (caption) {
      const o = body(14, 600, { color: "rgba(255,255,255,0.88)" });
      const len = spacedWidth(ctx, caption, 14 * 0.3, o);
      ctx.save();
      ctx.translate(94, 300 + Math.min(len, 820));
      ctx.rotate(-Math.PI / 2);
      drawSpaced(ctx, caption, 0, 0, 14 * 0.3, o);
      ctx.restore();
    }
    if (photo) {
      drawCutout(ctx, photo.img, { x: -60, y: 300, w: 800, h: 860 }, fr, {
        tone: "mono", accent, fadeFrom: 0.88, shadow: { x: 26, y: 34, blur: 34, alpha: 0.36 },
      });
    }
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(108, 300, 500, 860);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 30;
    ctx.fillStyle = "#cfcfcf";
    ctx.fillRect(SIDE, 264, 500, 860);
    ctx.restore();
    drawCoverPhoto(ctx, photo.img, { x: SIDE, y: 264, w: 500, h: 860 }, fr, "mono", accent);
    const caption = cleanTeamLabel(data.team_name).toUpperCase();
    if (caption) drawSpaced(ctx, caption, SIDE, 1142, 13 * 0.26, body(13, 600, { color: PAPER_INK.muted }));
  }

  // The stat column: hero on top, then six hairlined rows.
  ctx.fillStyle = accent;
  ctx.fillRect(column.x, column.y, 48, 6);
  const heroOpts = display(230, 800, { color: INK });
  const heroCap = capHeight(ctx, heroOpts);
  drawText(ctx, String(num(data.points)), column.x - 6, column.y + 28, heroOpts);
  let y = column.y + 28 + heroCap + 24;
  drawSpaced(ctx, "POINTS", column.x, y, 16 * 0.32, body(16, 700, { color: INK }));
  y += capHeight(ctx, body(16, 700)) + 28;

  const rows: Stat[] = [
    ...topExtras(data),
    { label: "FG", long: "FIELD GOALS", value: dash(data.fg) },
    { label: "3PT", long: "THREES", value: dash(data.three_pt) },
    { label: "FT", long: "FREE THROWS", value: dash(data.ft) },
    { label: "+/−", long: "PLUS / MINUS", value: data.plus_minus || "0" },
  ];
  const rowH = 86;
  rows.forEach((row) => {
    ctx.fillStyle = "rgba(17,17,17,0.2)";
    ctx.fillRect(column.x, y, column.w, 1);
    const vOpts = display(68, 700, { color: INK });
    const cap = capHeight(ctx, vOpts);
    drawText(ctx, row.value, column.x - 2, y + 14, vOpts);
    const lOpts = body(14, 600, { color: PAPER_INK.muted, align: "right" });
    drawSpaced(ctx, row.long, column.x + column.w, y + 14 + cap - capHeight(ctx, lOpts), 14 * 0.26, lOpts);
    y += rowH;
  });
  ctx.fillStyle = "rgba(17,17,17,0.2)";
  ctx.fillRect(column.x, y, column.w, 1);

  drawFooter(ctx, data, s.assets, CARD_H - 126, PAPER_INK, accent, "SWISHASSISTANT.COM");
  drawGrain(ctx, 0.16, "multiply");
}

/** The slanted edge between the colour and the black band: y at a given x. */
const bandEdge = (x: number) => 900 - 216 * (x / CARD_W);

function drawHalftone(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = "#000";
  const step = 14;
  for (let y = step / 2; y < 900; y += step) {
    const strength = Math.max(0, Math.min(1, (y - 378) / 522));
    if (strength <= 0) continue;
    for (let x = step / 2; x < CARD_W; x += step) {
      if (y > bandEdge(x)) continue;
      ctx.globalAlpha = 0.45 * strength;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawDuotone(s: Scene) {
  const { ctx, data, accent, photo, fr } = s;
  const cutout = photo?.cutout ?? false;
  const ink = "#0b0b0c";
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const colourRegion = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(CARD_W, 0);
    ctx.lineTo(CARD_W, 684);
    ctx.lineTo(0, 900);
    ctx.closePath();
  };

  if (photo && !cutout) {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    drawCoverPhoto(ctx, photo.img, { x: 0, y: 0, w: CARD_W, h: CARD_H }, fr, "duotone", accent);
    drawHalftone(ctx);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(0, 900);
    ctx.lineTo(CARD_W, 684);
    ctx.lineTo(CARD_W, CARD_H);
    ctx.lineTo(0, CARD_H);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.save();
    colourRegion();
    ctx.clip();
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, CARD_W, 900);
    ellipseGlow(ctx, 194, 90, 756, 450, [[0, "rgba(255,255,255,0.22)"], [0.7, "rgba(255,255,255,0)"]]);
    drawHalftone(ctx);
    ctx.restore();
  }

  // Name block top-left, kicker top-right, in ink on the colour.
  const fullName = [s.first, s.last].filter(Boolean).join(" ");
  const nameSize = fitDisplay(ctx, fullName, 560, 60, 36, 800);
  drawText(ctx, fullName, SIDE, 64 + (60 - nameSize) * 0.6, display(nameSize, 800, { color: ink }));
  const sub = [cleanTeamLabel(data.team_name).toUpperCase(), cutout || !photo ? leagueShort(data) : ""].filter(Boolean).join(" · ");
  const subOpts = body(15, 600, { color: "rgba(11,11,12,0.75)" });
  let subText = sub;
  while (subText && spacedWidth(ctx, subText, 15 * 0.28, subOpts) > 560) {
    const cut = subText.lastIndexOf(" · ");
    subText = cut > 0 ? subText.slice(0, cut) : subText.slice(0, -4);
  }
  if (subText) drawSpaced(ctx, subText, SIDE, 128, 15 * 0.28, subOpts);
  drawSpaced(ctx, "TOP PERFORMANCE", CARD_W - SIDE, 70, 16 * 0.36, body(16, 700, { color: ink, align: "right" }));

  if (cutout || !photo) {
    // The surname as an outline behind the two-tone player.
    const size = fitDisplay(ctx, s.last, CARD_W - 80, 520, 160, 900);
    const cap = capHeight(ctx, display(size, 900));
    strokeTextTop(ctx, s.last, CARD_W / 2, 178 + (364 - cap) * 0.5, display(size, 900, { align: "center", alpha: 0.85 }), ink, 3);
    if (photo) {
      drawCutout(ctx, photo.img, { x: 140, y: 250, w: 800, h: 840 }, fr, {
        tone: "duotone", accent, fadeFrom: 0.8, shadow: { x: 0, y: 36, blur: 40, alpha: 0.5 },
      });
    }
  } else {
    const size = fitDisplay(ctx, s.last, CARD_W - 120, 250, 110, 900);
    const cap = capHeight(ctx, display(size, 900));
    strokeTextTop(ctx, s.last, CARD_W / 2, 456 + (175 - cap) * 0.5, display(size, 900, { align: "center", alpha: 0.92 }), "#ffffff", 3);
  }

  // Four stat cells in the black band, hairlines between them.
  const cells: Stat[] = [
    { label: "PTS", long: "POINTS", value: String(num(data.points)) },
    ...topExtras(data),
    { label: "FG", long: "FIELD GOALS", value: data.fg || "0/0" },
  ];
  const cellW = (CARD_W - SIDE * 2) / cells.length;
  const top = 940;
  cells.forEach((c, i) => {
    const x = SIDE + cellW * i;
    if (i > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(x, top, 1, 130);
    }
    const inner = i > 0 ? x + 20 : x;
    const size = fitDisplay(ctx, c.value, cellW - (i > 0 ? 36 : 16), 100, 48, 800);
    const vOpts = display(size, 800, { color: "#ffffff" });
    const cap = capHeight(ctx, vOpts);
    drawText(ctx, c.value, inner - 2, top + (85 - cap), vOpts);
    drawSpaced(ctx, c.long, inner, top + 102, 16 * 0.28, body(16, i === 0 ? 700 : 600, { color: i === 0 ? accent : "rgba(255,255,255,0.55)" }));
  });
  const line = [`${data.three_pt || "0/0"} 3PT`, `${data.ft || "0/0"} FT`, `${data.ts_percent || "0.0"}% TS`, data.plus_minus || "0", `${num(data.minutes)} MIN`].join("   ·   ");
  drawSpaced(ctx, line, SIDE, 1120, 17 * 0.16, body(17, 500, { color: "rgba(255,255,255,0.6)" }));

  drawFooter(ctx, data, s.assets, CARD_H - 118, DARK_INK, accent, formatDate(data.game_date) || leagueShort(data));
  drawGrain(ctx, 0.22);
}

/** A black block with a white label in it, hung off the bottom-right corner of a numeral. */
function drawLabelBlock(ctx: CanvasRenderingContext2D, text: string, right: number, top: number) {
  const o = body(30, 700, { color: "#ffffff" });
  const w = spacedWidth(ctx, text, 30 * 0.06, o) - 30 * 0.06 + 44;
  const h = 56;
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(right - w, top, w, h);
  drawSpaced(ctx, text, right - w + 22, top + (h - capHeight(ctx, o)) / 2, 30 * 0.06, o);
}

function drawNumbers(s: Scene) {
  const { ctx, data, accent, photo, fr } = s;
  const cutout = photo?.cutout ?? false;
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const full: Box = { x: 0, y: 0, w: CARD_W, h: CARD_H };
  if (photo && !cutout) {
    drawCoverPhoto(ctx, photo.img, full, fr, "graded", accent);
  } else if (s.raw) {
    // The full photo, softened, as depth behind the sharp cut-out.
    const [sheet, sc] = layer();
    const p = placeCover(s.raw, full, { ...fr, zoom: 1.15, x: 50, y: fr.focusY });
    sc.drawImage(s.raw, p.left, p.top, p.dw, p.dh);
    tonePixels(sc, "mono", accent, full);
    ctx.save();
    if (typeof (ctx as { filter?: unknown }).filter === "string") ctx.filter = "blur(34px)";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(sheet, 0, 0);
    ctx.restore();
  }
  // The accent pours in from the right; the bottom darkens for the footer.
  const wash = ctx.createLinearGradient(0, 0, CARD_W, 0);
  wash.addColorStop(0, "rgba(0,0,0,0)");
  wash.addColorStop(0.35, "rgba(0,0,0,0)");
  wash.addColorStop(1, accent);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.restore();
  ellipseGlow(ctx, CARD_W, CARD_H * 0.55, 760, 900, [[0, accent], [0.7, "rgba(0,0,0,0)"]], "screen", 0.45);
  ctx.fillStyle = vertical(ctx, 0, CARD_H, [[0, "rgba(11,11,13,0.55)"], [0.18, "rgba(11,11,13,0)"], [0.7, "rgba(11,11,13,0)"], [1, "rgba(11,11,13,0.92)"]]);
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // A thin arc sweeping behind the numbers.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(1480, 700, 1000, Math.PI * 0.86, Math.PI * 1.2);
  ctx.stroke();
  ctx.restore();

  if (photo && cutout) {
    drawCutout(ctx, photo.img, { x: 40, y: 300, w: 620, h: 850 }, fr, {
      tone: "natural", accent, fadeFrom: 0.86, shadow: { x: 0, y: 36, blur: 50, alpha: 0.6 },
    });
  }

  // Two numbers: points, then the stat that mattered most after them.
  const extra = topExtras(data)[0];
  const hero = String(num(data.points));
  const heroSize = fitDisplay(ctx, hero, 480, 440, 240, 800);
  const heroOpts = display(heroSize, 800, { color: "#ffffff", align: "right" });
  const heroCap = capHeight(ctx, heroOpts);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  drawText(ctx, hero, CARD_W - SIDE, 150, heroOpts);
  ctx.restore();
  drawLabelBlock(ctx, "POINTS", CARD_W - SIDE + 8, 150 + heroCap - 24);

  const secondSize = fitDisplay(ctx, extra.value, 420, 320, 180, 800);
  const secondOpts = display(secondSize, 800, { color: "#ffffff", align: "right" });
  const secondTop = 150 + heroCap + 96;
  const secondCap = capHeight(ctx, secondOpts);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  drawText(ctx, extra.value, CARD_W - SIDE, secondTop, secondOpts);
  ctx.restore();
  drawLabelBlock(ctx, extra.long, CARD_W - SIDE + 8, secondTop + secondCap - 24);

  // Small arrows at the right edge, a nod to the reference.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  [92, CARD_H - 150].forEach((y) => {
    const x = CARD_W - 40;
    ctx.beginPath();
    ctx.moveTo(x, y + 14);
    ctx.lineTo(x, y - 10);
    ctx.moveTo(x - 8, y - 2);
    ctx.lineTo(x, y - 10);
    ctx.lineTo(x + 8, y - 2);
    ctx.stroke();
  });
  ctx.restore();

  // Name and club, small, bottom-left; the kicker top-left.
  drawSpaced(ctx, "TOP PERFORMANCE", SIDE, 66, 16 * 0.36, body(16, 700, { color: "#ffffff" }));
  const nameOpts = display(44, 700, { color: "#ffffff" });
  const fullName = [s.first, s.last].filter(Boolean).join(" ");
  drawText(ctx, fullName, SIDE, CARD_H - 236, nameOpts);
  const club = cleanTeamLabel(data.team_name).toUpperCase();
  if (club) drawSpaced(ctx, club, SIDE, CARD_H - 236 + capHeight(ctx, nameOpts) + 14, 14 * 0.26, body(14, 600, { color: "rgba(255,255,255,0.62)" }));

  drawFooter(ctx, data, s.assets, CARD_H - 126, DARK_INK, accent, [leagueShort(data), formatDate(data.game_date)].filter(Boolean).join(" · "));
  drawGrain(ctx, 0.24);
}

// ── the reference styles: Panel, Glow, Ranked, Frame ─────────────────────────

/** The full photo, softened and dimmed, as depth behind a cut-out. */
function drawSoftBackdrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  fr: Framing,
  accent: string,
  o: { zoom: number; blur: number; alpha: number; tone?: Tone; dim?: number },
) {
  const full: Box = { x: 0, y: 0, w: CARD_W, h: CARD_H };
  const [sheet, sc] = layer();
  const p = placeCover(img, full, { ...fr, zoom: o.zoom, x: 50, y: fr.focusY });
  sc.drawImage(img, p.left, p.top, p.dw, p.dh);
  tonePixels(sc, o.tone ?? "mono", accent, full);
  if (o.dim) {
    sc.fillStyle = `rgba(0,0,0,${o.dim})`;
    sc.fillRect(0, 0, CARD_W, CARD_H);
  }
  ctx.save();
  if (typeof (ctx as { filter?: unknown }).filter === "string") ctx.filter = `blur(${o.blur}px)`;
  ctx.globalAlpha = o.alpha;
  // Drawn a little larger than the card so the blur's soft edge falls outside it.
  ctx.drawImage(sheet, -24, -24, CARD_W + 48, CARD_H + 48);
  ctx.restore();
}

/** Thin dark lines every few pixels: the printed, screen-grab texture of the Ranked style. */
function drawScanlines(ctx: CanvasRenderingContext2D, box: Box, alpha: number) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = box.y; y < box.y + box.h; y += 6) ctx.fillRect(box.x, y, box.w, 2);
  ctx.restore();
}

/** A small block of colour with tracked caps in it; returns its width. */
function drawTag(ctx: CanvasRenderingContext2D, text: string, x: number, top: number, bg: string, colour: string): number {
  const o = body(13, 700, { color: colour });
  const w = spacedWidth(ctx, text, 13 * 0.3, o) - 13 * 0.3 + 24;
  const h = 28;
  ctx.fillStyle = bg;
  ctx.fillRect(x, top, w, h);
  drawSpaced(ctx, text, x + 12, top + (h - capHeight(ctx, o)) / 2, 13 * 0.3, o);
  return w;
}

/** A credit running up the right edge in italic, from `topY` down. */
function drawEdgeItalic(ctx: CanvasRenderingContext2D, text: string, x: number, topY: number, o: ItalicOpts, spacing: number) {
  const len = italicWidth(ctx, text, o, spacing);
  ctx.save();
  ctx.translate(x, topY + len);
  ctx.rotate(-Math.PI / 2);
  drawItalic(ctx, text, 0, 0, o, spacing);
  ctx.restore();
}

/** "NOTTINGHAM HOODS  98  ·  71  BRISTOL FLYERS II", or the two names when there is no score. */
function scoreLineText(data: PlayerPerformanceV1Data): string {
  const team = cleanTeamLabel(data.team_name).toUpperCase();
  const opp = cleanTeamLabel(data.opponent_name).toUpperCase();
  const hasScore = num(data.home_score) > 0 || num(data.away_score) > 0;
  return hasScore ? `${team}  ${num(data.home_score)}  ·  ${num(data.away_score)}  ${opp}` : `${team}  VS  ${opp}`;
}

/** "35 PTS   ·   9 REB   ·   7 STL   ·   12/18 FG", shrunk until it fits. */
function drawStatLine(ctx: CanvasRenderingContext2D, data: PlayerPerformanceV1Data, x: number, topY: number, maxWidth: number) {
  const parts = [`${num(data.points)} PTS`, ...topExtras(data).map((st) => `${st.value} ${st.label}`), `${data.fg || "0/0"} FG`];
  const text = parts.join("   ·   ");
  let size = 18;
  while (size > 13 && spacedWidth(ctx, text, size * 0.22, body(size, 600)) > maxWidth) size -= 1;
  drawSpaced(ctx, text, x, topY, size * 0.22, body(size, 600, { color: "rgba(255,255,255,0.85)" }));
}

/** The Swish mark, any crest and a label, laid out from the bottom-right corner inwards; returns the left edge. */
function drawMarkRow(ctx: CanvasRenderingContext2D, assets: FooterAssets, label: string, cy: number, withCrest: boolean): number {
  let right = CARD_W - 64;
  if (assets.swish) {
    right -= 40;
    drawContain(ctx, assets.swish, right, cy - 20, 40, 40);
    right -= 14;
  }
  if (withCrest && assets.crest) {
    right -= 34;
    drawContain(ctx, assets.crest, right, cy - 17, 34, 34);
    right -= 14;
  }
  if (label) {
    const o = body(13, 600, { color: "rgba(255,255,255,0.6)", align: "right" });
    drawSpaced(ctx, label, right, cy - capHeight(ctx, o) / 2, 13 * 0.26, o);
    right -= spacedWidth(ctx, label, 13 * 0.26, o) + 18;
  }
  return right;
}

/** A sheet of just `w` × `h` with the photo covering it at the given framing, graded. */
function cropSheet(img: HTMLImageElement, w: number, h: number, fr: Framing, tone: Tone, accent: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const sc = c.getContext("2d")!;
  const box: Box = { x: 0, y: 0, w, h };
  const p = placeCover(img, box, fr);
  sc.drawImage(img, p.left, p.top, p.dw, p.dh);
  tonePixels(sc, tone, accent, box);
  return c;
}

function creditOf(s: Scene, sep: string): string {
  return [[s.first, s.last].filter(Boolean).join(" ").toUpperCase(), cleanTeamLabel(s.data.team_name).toUpperCase()].filter(Boolean).join(sep);
}

function dateLabel(data: PlayerPerformanceV1Data): string {
  return [leagueShort(data), formatDate(data.game_date)].filter(Boolean).join(" · ");
}

/** Points and the two extras that mattered, biggest first: the side panel's three numerals. */
function panelStats(data: PlayerPerformanceV1Data): Stat[] {
  const three: Stat[] = [{ label: "PTS", long: "POINTS", value: String(num(data.points)) }, ...topExtras(data)];
  return three.sort((a, b) => num(b.value) - num(a.value));
}

/** "TRIPLE-DOUBLE" or "DOUBLE-DOUBLE" when the line earns it, else the usual kicker. */
function lineTag(data: PlayerPerformanceV1Data): string {
  const tens = [data.points, data.rebounds, data.assists, data.steals, data.blocks].filter((v) => num(v) >= 10).length;
  return tens >= 3 ? "TRIPLE-DOUBLE" : tens === 2 ? "DOUBLE-DOUBLE" : "TOP PERFORMANCE";
}

function drawPanel(s: Scene) {
  const { ctx, data, accent, photo, fr } = s;
  const gamePhoto = photo && !photo.cutout ? photo.img : null;
  const full: Box = { x: 0, y: 0, w: CARD_W, h: CARD_H };
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (gamePhoto) {
    drawCoverPhoto(ctx, gamePhoto, full, fr, "graded", accent);
  } else {
    if (s.raw) drawSoftBackdrop(ctx, s.raw, fr, accent, { zoom: 1.2, blur: 30, alpha: 0.5 });
    ellipseGlow(ctx, 760, 520, 560, 640, [[0, withAlpha(accent, 0.35)], [0.7, "rgba(0,0,0,0)"]], "screen");
  }
  // Quiet the edges so the panel, the credit and the footer sit on something dark.
  ctx.fillStyle = vertical(ctx, 0, CARD_H, [[0, "rgba(11,11,13,0.55)"], [0.2, "rgba(11,11,13,0)"], [0.68, "rgba(11,11,13,0)"], [1, "rgba(11,11,13,0.92)"]]);
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const side = ctx.createLinearGradient(0, 0, CARD_W, 0);
  side.addColorStop(0, "rgba(11,11,13,0.78)");
  side.addColorStop(0.38, "rgba(11,11,13,0.4)");
  side.addColorStop(0.62, "rgba(11,11,13,0)");
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  if (gamePhoto) {
    ellipseGlow(ctx, 670, 486, 648, 675, [[0.45, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.5)"]]);
  } else if (photo) {
    drawCutout(ctx, photo.img, { x: 300, y: 300, w: 800, h: 930 }, fr, {
      tone: "natural", accent, fadeFrom: 0.86, shadow: { x: 0, y: 36, blur: 50, alpha: 0.6 },
    });
  }

  // The panel: a foil strip along its top, hairlines, a tag on the cross rule.
  const panel: Box = { x: 0, y: 230, w: 400, h: 950 };
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 80;
  ctx.shadowOffsetX = 30;
  ctx.fillStyle = vertical(ctx, panel.y, panel.y + panel.h, [[0, "#0f0f12"], [1, DARK]]);
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.restore();
  const foil = ctx.createLinearGradient(0, 0, panel.w, 0);
  foil.addColorStop(0, accent);
  foil.addColorStop(0.45, "#ffd27a");
  foil.addColorStop(1, "rgba(255,210,122,0)");
  ctx.fillStyle = foil;
  ctx.fillRect(0, panel.y, panel.w, 12);
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = accent;
  ctx.fillRect(26, panel.y + 32, 1, panel.h - 64);
  ctx.fillRect(0, 470, panel.w, 1);
  ctx.restore();
  drawTag(ctx, lineTag(data), 68, 456, DARK, accent);

  // Crest ring, name and opponent.
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(98, 302, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (s.assets.crest) {
    drawContain(ctx, s.assets.crest, 79, 283, 38, 38);
  } else {
    const initials = cleanTeamLabel(data.team_name).split(/\s+/).map((w) => w[0] || "").join("").slice(0, 3).toUpperCase();
    const o = body(16, 700, { color: "#ffffff", align: "center" });
    drawText(ctx, initials, 98, 302 - capHeight(ctx, o) / 2, o);
  }
  const fullName = [s.first, s.last].filter(Boolean).join(" ");
  let nameSize = 20;
  while (nameSize > 14 && spacedWidth(ctx, fullName, nameSize * 0.12, body(nameSize, 700)) > 300) nameSize -= 1;
  drawSpaced(ctx, fullName, 68, 352, nameSize * 0.12, body(nameSize, 700, { color: "#ffffff" }));
  const opp = cleanTeamLabel(data.opponent_name);
  if (opp) {
    let o: ItalicOpts = { size: 18, weight: 500, family: BODY, color: "rgba(255,255,255,0.72)" };
    while (o.size > 13 && italicWidth(ctx, `vs ${opp}`, o, o.size * 0.06) > 310) o = { ...o, size: o.size - 1 };
    drawItalic(ctx, `vs ${opp}`, 68, 382, o, o.size * 0.06);
  }

  // Three numerals in foil.
  let y = 510;
  const labelOpts = body(16, 700, { color: "#ffffff" });
  const three = panelStats(data);
  three.forEach((st) => {
    const o = poster(fitPoster(ctx, st.value, 310, 150, 90));
    const cap = capHeight(ctx, o);
    const g = ctx.createLinearGradient(0, y, 0, y + cap);
    g.addColorStop(0, mixHex(accent, "#ffffff", 0.72));
    g.addColorStop(0.55, accent);
    g.addColorStop(1, mixHex(accent, "#000000", 0.42));
    setFont(ctx, o);
    ctx.save();
    ctx.fillStyle = g;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(st.value, 68, y + cap);
    ctx.restore();
    drawSpaced(ctx, st.long, 68, y + cap + 10, 16 * 0.2, labelOpts);
    y += cap + 10 + capHeight(ctx, labelOpts) + 30;
  });

  // The rest of the line, small.
  const shown = new Set(three.map((st) => st.label));
  const others: { label: string; v: number }[] = [
    { label: "REB", v: num(data.rebounds) }, { label: "AST", v: num(data.assists) },
    { label: "STL", v: num(data.steals) }, { label: "BLK", v: num(data.blocks) },
  ];
  const rest = [
    ...others.filter((e) => !shown.has(e.label) && e.v > 0).map((e) => `${e.v} ${e.label}`),
    `${data.fg || "0/0"} FG`,
    `${num(data.minutes)} MIN`,
  ];
  const restOpts = body(14, 600, { color: "rgba(255,255,255,0.55)" });
  while (rest.length > 1 && spacedWidth(ctx, rest.join(" · "), 14 * 0.2, restOpts) > 310) rest.pop();
  drawSpaced(ctx, rest.join(" · "), 68, 1118, 14 * 0.2, restOpts);

  // Credit up the right edge; the score and the marks along the bottom.
  const caption = creditOf(s, "   /   ");
  drawEdgeCaption(ctx, caption, CARD_W - SIDE + 14, 200 + spacedWidth(ctx, caption, 14 * 0.3, body(14, 600)), "rgba(255,255,255,0.75)");
  const cy = CARD_H - 68;
  const left = drawMarkRow(ctx, s.assets, dateLabel(data), cy, false);
  drawScoreLine(ctx, data, SIDE, cy - capHeight(ctx, body(15, 500)) / 2, left - 24 - SIDE, DARK_INK);
  drawGrain(ctx, 0.32);
}

/** The caption under the Glow number: the result, then the stats that backed the points up. */
function glowStory(data: PlayerPerformanceV1Data, extras: number): string {
  const opp = cleanTeamLabel(data.opponent_name).toUpperCase();
  const hasScore = num(data.home_score) > 0 || num(data.away_score) > 0;
  const result = hasScore
    ? `IN THE ${num(data.home_score)}–${num(data.away_score)} ${data.didWin ? "WIN OVER" : "DEFEAT TO"} ${opp}`
    : `AGAINST ${opp}`;
  const backing = topExtras(data).filter((st) => num(st.value) > 0).slice(0, extras).map((st) => `${numberWord(num(st.value))} ${st.long}`);
  return [result, backing.length ? `WITH ${backing.join(" AND ")}` : ""].filter(Boolean).join(", ");
}

function drawGlow(s: Scene) {
  const { ctx, data, accent, photo, fr } = s;
  const gamePhoto = photo && !photo.cutout ? photo.img : null;
  const full: Box = { x: 0, y: 0, w: CARD_W, h: CARD_H };
  const cloud = (t: number) => mixHex(accent, "#000000", t);
  ctx.fillStyle = gamePhoto ? mixHex(accent, "#050505", 0.28) : mixHex(accent, "#050505", 0.82);
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (gamePhoto) {
    drawCoverPhoto(ctx, gamePhoto, full, fr, "duotone", accent);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    // Dark clouds in the corners, the light behind the player, then a vignette.
    ellipseGlow(ctx, 130, 243, 594, 540, [[0, "rgba(0,0,0,0.55)"], [0.7, "rgba(0,0,0,0)"]]);
    ellipseGlow(ctx, 994, 405, 540, 540, [[0, "rgba(0,0,0,0.5)"], [0.7, "rgba(0,0,0,0)"]]);
    ellipseGlow(ctx, 540, 1350, 648, 472, [[0, "rgba(0,0,0,0.7)"], [0.7, "rgba(0,0,0,0)"]]);
    ellipseGlow(ctx, 918, 1242, 432, 405, [[0, "rgba(0,0,0,0.5)"], [0.7, "rgba(0,0,0,0)"]]);
    ellipseGlow(ctx, 560, 590, 330, 450, [[0, "rgba(255,255,255,0.5)"], [0.36, "rgba(255,255,255,0.16)"], [0.68, "rgba(255,255,255,0)"]], "screen");
    ellipseGlow(ctx, 562, 648, 756, 810, [[0.38, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.62)"]]);
  } else {
    // Clouds of the accent, deeper towards the corners.
    ellipseGlow(ctx, 281, 324, 648, 608, [[0, cloud(0.38)], [0.7, "rgba(0,0,0,0)"]]);
    ellipseGlow(ctx, 842, 783, 594, 540, [[0, cloud(0.52)], [0.7, "rgba(0,0,0,0)"]]);
    ellipseGlow(ctx, 540, 1242, 540, 472, [[0, cloud(0.6)], [0.7, "rgba(0,0,0,0)"]]);
    ellipseGlow(ctx, 972, 135, 432, 405, [[0, cloud(0.7)], [0.7, "rgba(0,0,0,0)"]]);
    ellipseGlow(ctx, 540, 675, 756, 810, [[0.4, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.55)"]]);
  }

  // The ghost surname: behind the player on a cut-out, faintly over the photo otherwise.
  const ghostSize = fitPoster(ctx, s.last, CARD_W + 80, 620, 200);
  drawText(ctx, s.last, CARD_W / 2, gamePhoto ? 560 : 330, poster(ghostSize, { color: "rgba(255,255,255,0.05)", align: "center" }));

  if (!gamePhoto) {
    ellipseGlow(ctx, 750, 600, 280, 380, [[0, "rgba(255,255,255,0.42)"], [0.35, "rgba(255,255,255,0.12)"], [0.68, "rgba(255,255,255,0)"]]);
    if (photo) {
      drawCutout(ctx, photo.img, { x: 380, y: 330, w: 740, h: 770 }, fr, {
        tone: "natural", accent, fadeFrom: 0.82, shadow: { x: 0, y: 40, blur: 60, alpha: 0.65 },
      });
    }
  }

  // The number in the serif, glowing a little, "PTS" tucked against its shoulder.
  const points = String(num(data.points));
  const numOpts: ItalicOpts = { size: gamePhoto ? 370 : 430, weight: 900, family: SERIF, color: "#ffffff" };
  const numTop = gamePhoto ? 64 : 440;
  ctx.save();
  ctx.shadowColor = "rgba(255,255,255,0.35)";
  ctx.shadowBlur = 70;
  const numW = drawItalic(ctx, points, 56, numTop, numOpts, -numOpts.size * 0.03);
  ctx.restore();
  drawItalic(ctx, "PTS", 56 + numW + 10, numTop + numOpts.size * 0.17, { size: gamePhoto ? 64 : 72, weight: 700, family: SERIF, color: "#ffffff" }, 1.4);

  // The story under it in tracked caps, four lines at most.
  let lineSize = 26;
  let lo = body(lineSize, 700, { color: "rgba(255,255,255,0.95)" });
  let lines = wrapWords(ctx, glowStory(data, 2), 520, lineSize * 0.32, lo);
  if (lines.length > 4) lines = wrapWords(ctx, glowStory(data, 1), 520, lineSize * 0.32, lo);
  if (lines.length > 4) {
    lineSize = 22;
    lo = body(lineSize, 700, { color: "rgba(255,255,255,0.95)" });
    lines = wrapWords(ctx, glowStory(data, 1), 540, lineSize * 0.32, lo).slice(0, 4);
  }
  const pitch = lineSize * 2;
  let ly = gamePhoto ? 960 : 862;
  ctx.save();
  if (gamePhoto) {
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 4;
  }
  lines.forEach((line) => {
    drawSpaced(ctx, line, SIDE, ly + (pitch - capHeight(ctx, lo)) / 2, lineSize * 0.32, lo);
    ly += pitch;
  });
  ctx.restore();

  // Credit up the right edge in italic; the marks along the bottom.
  drawEdgeItalic(ctx, creditOf(s, " / "), CARD_W - 66, 180, { size: 22, weight: 500, family: BODY, color: "rgba(255,255,255,0.9)" }, 22 * 0.3);
  if (gamePhoto) {
    const label = dateLabel(data);
    const lo2 = body(13, 600, { color: "rgba(255,255,255,0.7)" });
    const labelW = label ? spacedWidth(ctx, label, 13 * 0.3, lo2) - 13 * 0.3 : 0;
    const widths = [s.assets.crest ? 44 : 0, labelW, s.assets.swish ? 44 : 0].filter((w) => w > 0);
    const total = widths.reduce((a, b) => a + b, 0) + 18 * Math.max(0, widths.length - 1);
    let x = (CARD_W - total) / 2;
    const cy = CARD_H - 78;
    if (s.assets.crest) {
      drawContain(ctx, s.assets.crest, x, cy - 22, 44, 44);
      x += 44 + 18;
    }
    if (label) {
      drawSpaced(ctx, label, x, cy - capHeight(ctx, lo2) / 2, 13 * 0.3, lo2);
      x += labelW + 18;
    }
    if (s.assets.swish) drawContain(ctx, s.assets.swish, x, cy - 22, 44, 44);
  } else if (s.assets.swish) {
    drawContain(ctx, s.assets.swish, CARD_W / 2 - 26, CARD_H - 108, 52, 52);
  }
  drawGrain(ctx, 0.42);
}

/** The competition's best scoring games, this one picked out. */
function drawRankList(ctx: CanvasRenderingContext2D, rank: PerformanceRank | undefined, x: number, top: number, size: number, pitch: number, accent: string) {
  if (!rank?.top.length) return;
  const faint = "rgba(255,255,255,0.5)";
  let y = top;
  rank.top.slice(0, 5).forEach((e) => {
    const o = body(size, e.self ? 700 : 600, { color: e.self ? "#ffffff" : faint });
    drawSpaced(ctx, `${e.rank}.`, x, y, size * 0.06, body(size, 600, { color: e.self ? accent : faint }));
    const name = e.name.toUpperCase();
    drawSpaced(ctx, name, x + 36, y, size * 0.06, o);
    const nameW = spacedWidth(ctx, name, size * 0.06, o);
    drawSpaced(ctx, ` · ${e.points}`, x + 36 + nameW, y, size * 0.06, body(size, e.self ? 700 : 600, { color: e.self ? accent : "rgba(255,255,255,0.35)" }));
    y += pitch;
  });
}

function drawRanked(s: Scene) {
  const { ctx, data, accent, photo, fr } = s;
  const gamePhoto = photo && !photo.cutout ? photo.img : null;
  const rank = data.points_rank;
  const pts = num(data.points);
  const ordinal = rank?.ordinal ?? 0;
  const big = ordinal > 0 ? String(ordinal) : String(pts);
  const suffix = ordinal > 0 ? ordinalSuffix(ordinal) : "PTS";
  const comp = leagueShort(data);
  const headline = `${pts}-POINT GAME`;
  const subline = ordinal > 0
    ? (comp ? `HIGHEST-SCORING GAMES IN ${comp} THIS SEASON` : "HIGHEST-SCORING GAMES THIS SEASON")
    : ["TOP PERFORMANCE", comp].filter(Boolean).join(" · ");

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (!gamePhoto) {
    const full: Box = { x: 0, y: 0, w: CARD_W, h: CARD_H };
    if (s.raw) drawCoverPhoto(ctx, s.raw, full, { ...fr, zoom: 1.3, x: 50, y: fr.focusY }, "duotone", accent);
    drawScanlines(ctx, full, 0.32);
    ctx.fillStyle = vertical(ctx, 0, CARD_H, [[0, "rgba(11,11,13,0.2)"], [0.25, "rgba(11,11,13,0)"], [0.55, "rgba(11,11,13,0)"], [1, "rgba(11,11,13,0.92)"]]);
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    const lr = ctx.createLinearGradient(0, 0, CARD_W, 0);
    lr.addColorStop(0, "rgba(11,11,13,0.75)");
    lr.addColorStop(0.55, "rgba(11,11,13,0)");
    ctx.fillStyle = lr;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    ctx.fillStyle = accent;
    ctx.fillRect(CARD_W - 120, 40, 120, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(CARD_W - 120, 56, 120, 14);

    // The ordinal, huge, its suffix beside it; the player standing in front.
    const bigOpts = poster(fitPoster(ctx, big, 560, 700, 300), { color: "#ffffff" });
    const bigW = drawText(ctx, big, 50, 120, bigOpts);
    drawText(ctx, suffix, 50 + bigW + 14, 150, poster(190, { color: "#ffffff" }));
    if (photo) {
      drawCutout(ctx, photo.img, { x: 400, y: 300, w: 700, h: 810 }, fr, {
        tone: "natural", accent, fadeFrom: 0.84, shadow: { x: 0, y: 30, blur: 50, alpha: 0.6 },
      });
    }
    drawRankList(ctx, rank, SIDE, 800, 20, 34, accent);
    const hSize = fitPoster(ctx, headline, CARD_W - 120, 150, 80);
    drawText(ctx, headline, 60, 1000 + (150 - hSize) * 0.6, poster(hSize, { color: "#ffffff" }));
    let subSize = 24;
    while (subSize > 16 && spacedWidth(ctx, subline, subSize * 0.1, body(subSize, 600)) > CARD_W - 132) subSize -= 1;
    drawSpaced(ctx, subline, 66, 1150, subSize * 0.1, body(subSize, 600, { color: "rgba(255,255,255,0.88)" }));
    drawMarkRow(ctx, s.assets, formatDate(data.game_date), CARD_H - 68, false);
  } else {
    const photoBox: Box = { x: 0, y: 0, w: CARD_W, h: 1000 };
    drawCoverPhoto(ctx, gamePhoto, photoBox, fr, "duotone", accent);
    const lr = ctx.createLinearGradient(0, 0, CARD_W, 0);
    lr.addColorStop(0, "rgba(11,11,13,0.1)");
    lr.addColorStop(0.4, "rgba(11,11,13,0)");
    lr.addColorStop(0.6, "rgba(11,11,13,0)");
    lr.addColorStop(1, "rgba(11,11,13,0.35)");
    ctx.fillStyle = lr;
    ctx.fillRect(0, 0, CARD_W, photoBox.h);
    ctx.fillStyle = vertical(ctx, 0, photoBox.h, [[0, "rgba(11,11,13,0.3)"], [0.22, "rgba(11,11,13,0)"]]);
    ctx.fillRect(0, 0, CARD_W, photoBox.h);

    ctx.fillStyle = accent;
    ctx.fillRect(0, 40, 120, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 56, 120, 14);
    drawScoreLine(ctx, data, 160, 46, 480, { ...DARK_INK, text: "rgba(255,255,255,0.85)" });

    // The ordinal on the empty side of the photo, its suffix stacked under it.
    const bigOpts = poster(fitPoster(ctx, big, 400, 640, 260), { color: "#ffffff", align: "right" });
    const bigCap = capHeight(ctx, bigOpts);
    drawText(ctx, big, CARD_W - 56, 100, bigOpts);
    drawText(ctx, suffix, CARD_W - 60, 100 + bigCap + 20, poster(150, { color: "#ffffff", align: "right" }));

    // The photo again, feathered around the player, so they stand in front of the number.
    const [sheet, sc] = layer();
    drawCoverPhoto(sc, gamePhoto, photoBox, fr, "duotone", accent);
    sc.save();
    sc.globalCompositeOperation = "destination-in";
    const rx = CARD_W * 0.34;
    const ry = photoBox.h * 0.48;
    sc.translate(CARD_W * 0.4, photoBox.h * 0.46);
    sc.scale(1, ry / rx);
    const mask = sc.createRadialGradient(0, 0, 0, 0, 0, rx);
    mask.addColorStop(0.52, "rgba(0,0,0,1)");
    mask.addColorStop(1, "rgba(0,0,0,0)");
    sc.fillStyle = mask;
    sc.fillRect(-rx, -rx, rx * 2, rx * 2);
    sc.restore();
    ctx.drawImage(sheet, 0, 0);
    drawScanlines(ctx, photoBox, 0.32);

    // The black band with the list and the headline.
    ctx.fillStyle = vertical(ctx, 880, CARD_H, [[0, "rgba(11,11,12,0)"], [0.26, "#0b0b0c"], [1, "#0b0b0c"]]);
    ctx.fillRect(0, 880, CARD_W, CARD_H - 880);
    drawRankList(ctx, rank, SIDE, 1012, 19, 30, accent);
    const hSize = fitPoster(ctx, headline, CARD_W - 120, 120, 70);
    drawText(ctx, headline, 62, (rank ? 1156 : 1060) + (120 - hSize) * 0.6, poster(hSize, { color: "#ffffff" }));
    const cy = CARD_H - 62;
    const left = drawMarkRow(ctx, s.assets, "", cy, true);
    let subSize = 17;
    while (subSize > 12 && spacedWidth(ctx, subline, subSize * 0.1, body(subSize, 600)) > left - 24 - SIDE) subSize -= 1;
    const so = body(subSize, 600, { color: "rgba(255,255,255,0.88)" });
    drawSpaced(ctx, subline, SIDE, cy - capHeight(ctx, so) / 2, subSize * 0.1, so);
  }
  drawGrain(ctx, 0.28);
}

function drawFrame(s: Scene) {
  const { ctx, data, accent, photo, fr } = s;
  const gamePhoto = photo && !photo.cutout ? photo.img : null;
  const full: Box = { x: 0, y: 0, w: CARD_W, h: CARD_H };
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // The whole photo, blurred and dimmed, behind everything; on a cut-out the window shows the same crop sharp.
  const backdrop = gamePhoto ?? s.raw;
  const place = backdrop
    ? placeCover(backdrop, full, gamePhoto ? { ...fr, zoom: Math.max(1.08, fr.zoom) } : { ...fr, zoom: Math.max(1.06, fr.zoom), x: 50, y: fr.focusY })
    : null;
  if (backdrop && place) {
    const [sheet, sc] = layer();
    sc.drawImage(backdrop, place.left, place.top, place.dw, place.dh);
    tonePixels(sc, "graded", accent, full);
    sc.fillStyle = `rgba(0,0,0,${gamePhoto ? 0.58 : 0.5})`;
    sc.fillRect(0, 0, CARD_W, CARD_H);
    ctx.save();
    if (typeof (ctx as { filter?: unknown }).filter === "string") ctx.filter = `blur(${gamePhoto ? 10 : 9}px)`;
    ctx.drawImage(sheet, -24, -24, CARD_W + 48, CARD_H + 48);
    ctx.restore();
  }
  ellipseGlow(ctx, 540, gamePhoto ? 648 : 608, 756, 743, [[0.4, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.6)"]]);

  // The score along the top; on a game photo a tag sits in front of it.
  const scoreText = scoreLineText(data);
  let x0 = SIDE;
  if (gamePhoto) x0 += drawTag(ctx, data.didWin ? "WIN" : "TOP PERFORMANCE", SIDE, 74, accent, DARK) + 16;
  let scoreSize = 22;
  while (scoreSize > 14 && spacedWidth(ctx, scoreText, scoreSize * 0.12, body(scoreSize, 700)) > CARD_W - x0 - SIDE) scoreSize -= 1;
  const so = body(scoreSize, 700, { color: "#ffffff", align: gamePhoto ? "left" : "center" });
  drawSpaced(ctx, scoreText, gamePhoto ? x0 : CARD_W / 2, 80 + (22 - scoreSize) / 2, scoreSize * 0.12, so);

  // The surname, huge; on a game photo the frame covers its lower half.
  const nameSize = fitPoster(ctx, s.last, CARD_W - 70, gamePhoto ? 230 : 360, 100);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  drawSpaced(ctx, s.last, CARD_W / 2, gamePhoto ? 300 : 214, nameSize * 0.02, poster(nameSize, { color: "#ffffff", align: "center" }));
  ctx.restore();

  if (!gamePhoto) {
    // A straight white frame: a clear window onto the blurred photo, the player rising out of it.
    const frame: Box = { x: 170, y: 640, w: 740, h: 540 };
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 80;
    ctx.shadowOffsetY = 30;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    ctx.restore();
    const inner: Box = { x: frame.x + 16, y: frame.y + 16, w: frame.w - 32, h: frame.h - 32 };
    if (backdrop && place) {
      const [sheet, sc] = layer();
      sc.save();
      sc.beginPath();
      sc.rect(inner.x, inner.y, inner.w, inner.h);
      sc.clip();
      sc.drawImage(backdrop, place.left, place.top, place.dw, place.dh);
      sc.restore();
      tonePixels(sc, "graded", accent, inner);
      ctx.drawImage(sheet, 0, 0);
    } else {
      ctx.fillStyle = "#1a1a1e";
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    }
    if (photo) {
      drawCutout(ctx, photo.img, { x: 120, y: 330, w: 840, h: 850 }, fr, {
        tone: "natural", accent, fadeFrom: 0.86, shadow: { x: 0, y: 30, blur: 40, alpha: 0.55 },
      });
    }
    drawStatLine(ctx, data, SIDE, 1232, CARD_W - SIDE * 2);
    drawMarkRow(ctx, s.assets, dateLabel(data), CARD_H - 68, false);
  } else {
    // A tilted print with a tight crop in it, in front of the name.
    const frame: Box = { x: 160, y: 440, w: 760, h: 620 };
    const inner = { w: frame.w - 32, h: frame.h - 32 };
    const crop = cropSheet(gamePhoto, inner.w, inner.h, { ...fr, zoom: 2.2 * fr.zoom, y: Math.min(fr.y, 36) }, "graded", accent);
    ctx.save();
    ctx.translate(frame.x + frame.w / 2, frame.y + frame.h / 2);
    ctx.rotate((-2.5 * Math.PI) / 180);
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 80;
    ctx.shadowOffsetY = 34;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-frame.w / 2, -frame.h / 2, frame.w, frame.h);
    ctx.shadowColor = "rgba(0,0,0,0)";
    ctx.drawImage(crop, -inner.w / 2, -inner.h / 2);
    ctx.restore();

    const credit = creditOf(s, "   /   ");
    drawEdgeCaption(ctx, credit, CARD_W - SIDE + 14, 560 + spacedWidth(ctx, credit, 14 * 0.3, body(14, 600)), "rgba(255,255,255,0.8)");
    drawStatLine(ctx, data, SIDE, 1196, CARD_W - SIDE * 2);
    drawMarkRow(ctx, s.assets, dateLabel(data), CARD_H - 68, true);
  }
  drawGrain(ctx, 0.26);
}

// ── entry points ─────────────────────────────────────────────────────────────

export async function renderPerformanceStyle(data: PlayerPerformanceV1Data, style: PerformanceStyle): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [photo, raw, swish, crest, ...sponsors] = await Promise.all([
    loadPhoto(data),
    fetchImg(data.background_photo_url || data.photo_url),
    fetchImg(swishLogoSrc),
    fetchImg(data.home_logo_url),
    ...(data.sponsor_logo_urls || []).filter(Boolean).slice(0, 4).map((src) => fetchImg(src)),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";

  const [first, last] = splitName(data.player_name || "");
  const scene: Scene = {
    ctx,
    data,
    accent: accentOf(data),
    photo,
    raw,
    fr: framingOf(data),
    first,
    last: last || first,
    assets: { swish, crest, sponsors: sponsors.filter((img): img is HTMLImageElement => Boolean(img)) },
  };
  if (style === "editorial") drawEditorial(scene);
  else if (style === "duotone") drawDuotone(scene);
  else if (style === "numbers") drawNumbers(scene);
  else if (style === "panel") drawPanel(scene);
  else if (style === "glow") drawGlow(scene);
  else if (style === "ranked") drawRanked(scene);
  else if (style === "frame") drawFrame(scene);
  else drawHeadline(scene);
  return canvas;
}

export async function renderPerformanceStyleBlob(data: PlayerPerformanceV1Data, style: PerformanceStyle): Promise<Blob | null> {
  const canvas = await renderPerformanceStyle(data, style);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
