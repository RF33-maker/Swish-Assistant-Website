/**
 * Team of the Week / Player of the Week post cards, drawn straight onto a
 * Canvas 2D context (same approach as generateTrendingCard.ts) so the preview and
 * the exported PNG are the same pixels — html2canvas mangles rotated text and
 * object-fit crops.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { WeeklyAward, WeeklyCardBrand } from "@/types/weeklyAwards";

export const CARD_W = 1080;
export const CARD_H = 1350;

export const DISPLAY = '"Oswald", Impact, "Arial Narrow", sans-serif';
export const BODY = "Arial, Helvetica, sans-serif";
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap";

/** Loads the condensed display font on demand (only the weekly cards need it). */
export async function ensureDisplayFont(): Promise<void> {
  if (typeof document === "undefined") return;
  if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }
  try {
    await Promise.all(["400", "500", "600", "700"].map((w) => document.fonts.load(`${w} 40px "Oswald"`)));
  } catch {
    // fall back to the system condensed stack
  }
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

const fmtGameScore = (v: number | null) => (v == null ? "—" : Number(v).toFixed(1));
const splitStat = (made: number | null, att: number | null) => (made == null || att == null ? "—" : `${made}/${att}`);
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
const GUESSED_HEAD: HeadPoint = { x: 0.5, y: 0.3 };
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

/**
 * Draws a photo into a frame: filled edge to edge by default, but free to be zoomed
 * out or shifted. Wherever a photo edge ends up inside the frame it fades into the
 * card colour behind it, so pushing a player down to clear a heading looks natural.
 */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
  focusY: number,
  framing: PhotoFraming,
) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * framing.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const left = (w - dw) / 2 + (framing.x / 100) * w;
  const top = (h - dh) * (Math.max(0, Math.min(100, focusY)) / 100) + (framing.y / 100) * h;

  const layer = document.createElement("canvas");
  layer.width = Math.round(w);
  layer.height = Math.round(h);
  const lctx = layer.getContext("2d")!;
  lctx.drawImage(img, left, top, dw, dh);

  const fadeV = h * 0.08;
  const fadeH = w * 0.08;
  const mask = (x0: number, y0: number, x1: number, y1: number) => {
    const g = lctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    lctx.fillStyle = g;
    lctx.fillRect(0, 0, layer.width, layer.height);
  };
  lctx.globalCompositeOperation = "destination-in";
  if (top > 1) mask(0, top, 0, top + fadeV);
  if (top + dh < h - 1) mask(0, top + dh, 0, top + dh - fadeV);
  if (left > 1) mask(left, 0, left + fadeH, 0);
  if (left + dw < w - 1) mask(left + dw, 0, left + dw - fadeH, 0);

  ctx.drawImage(layer, x, y);
}

/** A soft, enlarged copy of the photo to sit behind it (the "photo overlay" look). */
function drawBlurredBackdrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement, focusY: number) {
  const scale = Math.max(CARD_W / img.naturalWidth, CARD_H / img.naturalHeight) * 1.25;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const left = (CARD_W - dw) / 2;
  const top = (CARD_H - dh) * (Math.max(0, Math.min(100, focusY)) / 100);

  ctx.save();
  ctx.globalAlpha = 0.85;
  const canFilter = typeof (ctx as { filter?: unknown }).filter === "string";
  if (canFilter) {
    ctx.filter = "blur(60px)";
    ctx.drawImage(img, left, top, dw, dh);
  } else {
    // Browsers without canvas filters: shrink then stretch back for a similar softness.
    const small = document.createElement("canvas");
    small.width = Math.round(CARD_W / 40);
    small.height = Math.round(CARD_H / 40);
    const sctx = small.getContext("2d")!;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(img, left / 40, top / 40, dw / 40, dh / 40);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(small, 0, 0, CARD_W, CARD_H);
  }
  ctx.restore();
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

/** Title + subtitle block; returns the y where content below it can start. */
function drawHeader(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  maxTitle: number,
  lightMiddle = true,
): number {
  const titleSize = fitSize(ctx, title, 900, maxTitle, 60, 700);
  const parts = title.split(" OF THE ");
  const topY = 20;
  const cap = capHeight(ctx, { size: titleSize, weight: 700 });

  if (lightMiddle && parts.length === 2) {
    // "TEAM" / "WEEK" bold with a lighter "OF THE" between, centred as one line.
    const bold: TextOpts = { size: titleSize, weight: 700 };
    const light: TextOpts = { size: titleSize, weight: 400 };
    setFont(ctx, bold);
    const wLead = ctx.measureText(parts[0]).width;
    const wTail = ctx.measureText(parts[1]).width;
    setFont(ctx, light);
    const gap = ctx.measureText(" ").width;
    const wMid = ctx.measureText("OF THE").width;
    const total = wLead + gap + wMid + gap + wTail;
    let x = CARD_W / 2 - total / 2;
    drawTextTop(ctx, parts[0], x, topY, bold);
    x += wLead + gap;
    drawTextTop(ctx, "OF THE", x, topY, light);
    x += wMid + gap;
    drawTextTop(ctx, parts[1], x, topY, bold);
  } else {
    drawTextTop(ctx, title, CARD_W / 2, topY, { ...{ size: titleSize, weight: 700 }, align: "center" });
  }

  const subSize = fitSize(ctx, subtitle, 900, 50, 30, 400);
  const subCap = drawTextTop(ctx, subtitle, CARD_W / 2, topY + cap + 20, { size: subSize, align: "center" });
  return topY + cap + 20 + subCap;
}

// ── Team of the Week ─────────────────────────────────────────────────────────

const TEAM_SIDE = 33;
const TEAM_GAP = 10;

/** Which player's photo panel a card-space x coordinate falls in (for click-to-select). */
export function teamPanelIndexAt(cardX: number, count: number): number | null {
  const panelW = (CARD_W - TEAM_SIDE * 2 - TEAM_GAP * (count - 1)) / count;
  for (let i = 0; i < count; i += 1) {
    const left = TEAM_SIDE + i * (panelW + TEAM_GAP);
    if (cardX >= left - TEAM_GAP / 2 && cardX <= left + panelW + TEAM_GAP / 2) return i;
  }
  return null;
}

export type TeamCardOptions = {
  framing?: FramingMap;
  showGameScore?: boolean;
  /** Marked face positions by player_id; unmarked players use a guess. */
  heads?: HeadMap;
  alignHeads?: boolean;
  headLine?: number;
};

export async function renderTeamOfTheWeek(
  awards: WeeklyAward[],
  brand: WeeklyCardBrand,
  options: TeamCardOptions = {},
): Promise<{ canvas: HTMLCanvasElement; unaligned: string[] }> {
  const {
    framing = {},
    showGameScore = true,
    heads = {},
    alignHeads = true,
    headLine = DEFAULT_HEAD_LINE,
  } = options;
  const unaligned: string[] = [];
  await ensureDisplayFont();
  const [logo, leagueLogo, ...photos] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(brand.leagueLogoUrl),
    ...awards.map((a) => fetchImg(a.photoUrl)),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const accent = shade(brand.primaryHex, 0.28);

  ctx.fillStyle = verticalGradient(ctx, 0, CARD_H, [
    [0, shade(brand.primaryHex, 0.05)],
    [0.36, shade(brand.primaryHex, -0.42)],
    [0.78, shade(brand.primaryHex, -0.82)],
    [1, "#070403"],
  ]);
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (leagueLogo) {
    drawContain(ctx, leagueLogo, -20, -30, 300, 300, 0.16);
    drawContain(ctx, leagueLogo, CARD_W - 240, -30, 300, 300, 0.08);
  }

  const headerBottom = drawHeader(ctx, "TEAM OF THE WEEK", brand.leagueName, 108);

  const count = Math.max(1, awards.length);
  const panelW = (CARD_W - TEAM_SIDE * 2 - TEAM_GAP * (count - 1)) / count;
  const panelTop = Math.max(176, Math.round(headerBottom + 16));
  // Without the game score there's room for taller photos.
  const panelH = (showGameScore ? 1010 : 1118) - panelTop;

  awards.forEach((a, i) => {
    const x = TEAM_SIDE + i * (panelW + TEAM_GAP);
    const photo = photos[i];

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, panelTop, panelW, panelH);
    ctx.clip();
    const bg = ctx.createLinearGradient(x, panelTop, x + panelW, panelTop + panelH);
    bg.addColorStop(0, shade(brand.primaryHex, -0.1));
    bg.addColorStop(1, shade(brand.primaryHex, -0.6));
    ctx.fillStyle = bg;
    ctx.fillRect(x, panelTop, panelW, panelH);
    if (photo) {
      const placed = placeInFrame(photo, panelW, panelH, {
        framing: framing[a.player_id] ?? DEFAULT_FRAMING,
        head: alignHeads ? heads[a.player_id] ?? GUESSED_HEAD : null,
        headLine,
        focusY: a.photoFocusY ?? 50,
      });
      if (!placed.aligned) unaligned.push(a.player_id);
      ctx.drawImage(
        photo,
        x + placed.left,
        panelTop + placed.top,
        photo.naturalWidth * placed.scale,
        photo.naturalHeight * placed.scale,
      );
    } else {
      drawTextTop(ctx, initialsOf(a.full_name), x + panelW / 2, panelTop + panelH * 0.3, {
        size: 150, weight: 700, color: "#fff", alpha: 0.22, align: "center",
      });
    }
    ctx.fillStyle = verticalGradient(ctx, panelTop, panelTop + panelH, [[0.45, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.72)"]]);
    ctx.fillRect(x, panelTop, panelW, panelH);

    // Player name, reading bottom-to-top along the panel's right edge.
    const nameSize = fitSize(ctx, a.full_name, panelH - 40, 66, 34, 500);
    ctx.translate(x + panelW - 14, panelTop + panelH - 12);
    ctx.rotate(-Math.PI / 2);
    setFont(ctx, { size: nameSize, weight: 500 });
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.fillText(a.full_name, 0, 0);
    ctx.restore();

    // Headline stats
    const stats = headlineStats(a);
    const cell = Math.floor(panelW / 3);
    const startX = x + (panelW - cell * stats.length) / 2;
    let y = panelTop + panelH + 12;
    const numCap = capHeight(ctx, { size: 44, weight: 500 });
    stats.forEach((s, idx) => {
      drawTextTop(ctx, String(s.value), startX + idx * cell + cell / 2, y, { size: 44, weight: 500, align: "center" });
    });
    y += numCap + 12;
    const lblCap = capHeight(ctx, { size: 21 });
    stats.forEach((s, idx) => {
      const cx = startX + idx * cell + cell / 2;
      drawTextTop(ctx, s.label, cx, y, { size: 21, alpha: 0.85, align: "center" });
      if (idx < stats.length - 1) drawTextTop(ctx, "|", startX + (idx + 1) * cell, y, { size: 21, alpha: 0.5, align: "center" });
    });
    if (showGameScore) {
      y += lblCap + 24;
      const gsCap = drawTextTop(ctx, "Game Score", x + panelW / 2, y, { size: 33, align: "center" });
      y += gsCap + 12;
      drawTextTop(ctx, fmtGameScore(a.game_score), x + panelW / 2, y, { size: 48, weight: 600, color: accent, align: "center" });
    }
  });

  drawFooter(ctx, [logo, "statsthread", leagueLogo], brand.leagueName);
  return { canvas, unaligned };
}

// ── Player of the Week ───────────────────────────────────────────────────────

export async function renderPlayerOfTheWeek(
  award: WeeklyAward,
  brand: WeeklyCardBrand,
  teamLogoUrl?: string | null,
  framing?: PhotoFraming,
  tint: number = DEFAULT_TINT,
  showGameScore = true,
): Promise<HTMLCanvasElement> {
  await ensureDisplayFont();
  const [logo, photo, teamLogo, leagueLogo] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(award.photoUrl),
    fetchImg(teamLogoUrl),
    fetchImg(brand.leagueLogoUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const accent = shade(brand.primaryHex, 0.28);

  const t = Math.max(0, Math.min(100, tint)) / 100;

  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, shade(brand.primaryHex, -0.55));
  bg.addColorStop(1, "#070403");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const focusY = award.photoFocusY ?? 50;
  if (photo) {
    drawBlurredBackdrop(ctx, photo, focusY);
    // Wash of the competition colour over the blurred backdrop.
    ctx.save();
    ctx.globalAlpha = t * 0.6;
    ctx.fillStyle = brand.primaryHex;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.restore();
    drawPhoto(ctx, photo, 0, 0, CARD_W, CARD_H, focusY, framing ?? DEFAULT_FRAMING);
  } else {
    drawTextTop(ctx, initialsOf(award.full_name), CARD_W / 2, 220, { size: 520, weight: 700, alpha: 0.14, align: "center" });
  }
  ctx.fillStyle = verticalGradient(ctx, 0, CARD_H, [
    [0, withAlpha(shade(brand.primaryHex, -0.45), 0.35 + 0.5 * t)],
    [0.24, "rgba(0,0,0,0)"],
    [0.42, "rgba(0,0,0,0)"],
    [0.66, "rgba(7,4,3,0.86)"],
    [0.9, "#070403"],
  ]);
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Competition logo, faded into the bottom-right behind the game score.
  if (leagueLogo) drawContain(ctx, leagueLogo, CARD_W - 430, 905, 520, 520, 0.11);

  drawHeader(ctx, "PLAYER OF THE WEEK", brand.leagueName, 118, false);

  const LEFT = 60;
  let y = 748;
  if (teamLogo) drawContain(ctx, teamLogo, LEFT, y - 6, 60, 60);
  const teamX = teamLogo ? LEFT + 76 : LEFT;
  const teamSize = fitSize(ctx, award.team_name || "", CARD_W - LEFT - teamX, 40, 24, 500);
  const teamCap = drawTextTop(ctx, award.team_name || "", teamX, y, { size: teamSize, weight: 500, alpha: 0.95 });
  y += Math.max(teamCap, 52) + 8;

  if (award.opponent_name) {
    const opp = `vs ${award.opponent_name}`;
    const oppSize = fitSize(ctx, opp, CARD_W - LEFT * 2 - 200, 32, 20, 400);
    const oppCap = drawTextTop(ctx, opp, LEFT, y, { size: oppSize, alpha: 0.75 });
    if (award.game_result) {
      setFont(ctx, { size: oppSize });
      const w = ctx.measureText(opp).width;
      drawTextTop(ctx, award.game_result, LEFT + w + 16, y, {
        size: oppSize, color: award.game_result.startsWith("W") ? "#8ddc74" : "#ff786b",
      });
    }
    y += oppCap + 24;
  }

  const nameText = award.full_name.toUpperCase();
  const nameSize = fitSize(ctx, nameText, CARD_W - LEFT * 2, 190, 70, 700);
  const nameCap = drawTextTop(ctx, nameText, LEFT, y, { size: nameSize, weight: 700 });
  y += nameCap + 34;

  const headline: [string, number | null][] = [
    ["PTS", award.pts], ["REB", award.reb], ["AST", award.ast], ["STL", award.stl], ["BLK", award.blk],
  ];
  const numCap = capHeight(ctx, { size: 84, weight: 600 });
  headline.forEach(([label, value], i) => {
    const cx = LEFT + 48 + i * 130;
    drawTextTop(ctx, String(value ?? 0), cx, y, { size: 84, weight: 600, align: "center" });
    drawTextTop(ctx, label, cx, y + numCap + 12, { size: 26, alpha: 0.8, align: "center" });
  });

  if (showGameScore) {
    const gsX = CARD_W - LEFT - 130;
    drawTextTop(ctx, "Game Score", gsX, y - 18, { size: 30, alpha: 0.85, align: "center" });
    drawTextTop(ctx, fmtGameScore(award.game_score), gsX, y + 30, { size: 110, weight: 700, color: accent, align: "center" });
  }

  y += numCap + 12 + capHeight(ctx, { size: 26 }) + 40;
  const splits: [string, string][] = [
    ["FG", splitStat(award.fgm, award.fga)],
    ["3PT", splitStat(award.tpm, award.tpa)],
    ["FT", splitStat(award.ftm, award.fta)],
  ];
  let sx = LEFT;
  splits.forEach(([label, value]) => {
    drawTextTop(ctx, label, sx, y + 10, { size: 24, alpha: 0.7 });
    setFont(ctx, { size: 24 });
    sx += ctx.measureText(label).width + 12;
    drawTextTop(ctx, value, sx, y, { size: 38, weight: 500, alpha: 0.9 });
    setFont(ctx, { size: 38, weight: 500 });
    sx += ctx.measureText(value).width + 46;
  });

  drawFooter(ctx, [logo, "statsthread", teamLogo, leagueLogo], brand.leagueName);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
