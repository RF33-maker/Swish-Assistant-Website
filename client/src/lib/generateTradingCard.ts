/**
 * Draws the homepage's trending "trading card" (TrendingPerformanceSection)
 * onto a canvas, so the image people download is the card they saw.
 *
 * Every measurement mirrors the on-screen card at its desktop size — the
 * .fan-layout card at 17rem × 25.75rem, where 1cqw = 2.72px — and the whole
 * drawing is scaled up from there. The one addition is a small Swish logo
 * in the top-right corner, where the on-screen card has its download button.
 */

import SwishLogoSrc from "@/assets/Swish Assistant Logo.png";
import { normalizeHex } from "@/lib/colorContrast";

export interface TradingCardPalette {
  surface: string;
  surface2: string;
  border: string;
  text: string;
  text2: string;
  muted: string;
}

/** The card's .sa-pro colour tokens (index.css), used when none are passed. */
const PALETTES: Record<"light" | "dark", TradingCardPalette> = {
  light: { surface: "#ffffff", surface2: "#f8f9fb", border: "rgba(15, 23, 42, 0.08)", text: "#0b1220", text2: "#475467", muted: "#8a94a6" },
  dark: { surface: "#111317", surface2: "#16191e", border: "rgba(255, 255, 255, 0.07)", text: "#f3f4f6", text2: "#a3abb8", muted: "#6b7280" },
};

export interface TradingCardOptions {
  playerName: string;
  /** The team colour the card is painted in (same value as on screen). */
  teamColor: string;
  teamLogoUrl?: string | null;
  cutoutUrl?: string | null;
  profilePhotoUrl?: string | null;
  leagueName?: string | null;
  leagueLogoUrl?: string | null;
  gameResult?: string | null;
  gameScore: number | null;
  /** "vs …" line; the team name shows instead when there's no opponent. */
  opponentName?: string | null;
  teamName?: string | null;
  /** The full date on the card's set line, e.g. "26 Sep 2026". */
  cardDate?: string;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fgm?: number | null;
  fga?: number | null;
  tpm?: number | null;
  tpa?: number | null;
  ftm?: number | null;
  fta?: number | null;
  tsPct: string;
  isDark: boolean;
  /** Colour tokens read from the live card; missing ones use the defaults. */
  palette?: Partial<TradingCardPalette>;
  /** Output width in pixels (default 1080). */
  width?: number;
}

// The on-screen card at desktop size, in CSS pixels.
export const CW = 272;
export const CH = 412;
const CQ = CW / 100;
export const cq = (v: number) => v * CQ;
/** CSS max(px, Ncqw). */
export const mx = (px: number, v: number) => Math.max(px, cq(v));

export const DISPLAY = "'Barlow Condensed', 'Inter', ui-sans-serif, system-ui, sans-serif";
export const BODY = "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif";
export const font = (weight: number, size: number, family: string) => `${weight} ${size}px ${family}`;

export type Ctx = CanvasRenderingContext2D;

// ── Images ────────────────────────────────────────────────────────────────

/**
 * Loads an image through fetch → blob URL, so it can never taint the canvas.
 * Anything that can't be fetched with CORS is left out rather than breaking
 * the download.
 */
export async function loadImage(src: string | null | undefined, urls: string[]): Promise<HTMLImageElement | null> {
  if (!src) return null;
  try {
    const res = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const url = URL.createObjectURL(await res.blob());
    urls.push(url);
    const img = new Image();
    img.src = url;
    await img.decode();
    return img.naturalWidth > 0 ? img : null;
  } catch {
    return null;
  }
}

/** Waits for the card's web fonts, including any glyphs its text needs. */
export async function loadFonts(text: string) {
  if (typeof document === "undefined" || !document.fonts) return;
  const sample = text || "A";
  await Promise.all([
    document.fonts.load(font(700, 20, "'Barlow Condensed'"), sample),
    document.fonts.load(font(400, 10, "'Inter'"), sample),
    document.fonts.load(font(600, 10, "'Inter'"), sample),
    document.fonts.load(font(700, 10, "'Inter'"), sample),
  ]).catch(() => undefined);
}

// ── Geometry and text ─────────────────────────────────────────────────────

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Baseline that vertically centres the current font in a CSS line box. */
export function baselineIn(ctx: Ctx, top: number, lineHeight: number) {
  const m = ctx.measureText("Hg");
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  return top + (lineHeight - (ascent + descent)) / 2 + ascent;
}

/** Width of text with CSS letter-spacing (added after every character). */
export function spacedWidth(ctx: Ctx, text: string, spacing: number) {
  if (!spacing) return ctx.measureText(text).width;
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w;
}

/** Draws text left-aligned at x with CSS-style letter-spacing. */
export function drawSpaced(ctx: Ctx, text: string, x: number, y: number, spacing: number) {
  ctx.textAlign = "left";
  if (!spacing) {
    ctx.fillText(text, x, y);
    return;
  }
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

/** CSS text-overflow: ellipsis. */
export function ellipsize(ctx: Ctx, text: string, maxW: number, spacing = 0) {
  if (spacedWidth(ctx, text, spacing) <= maxW) return text;
  let t = text;
  while (t.length > 0 && spacedWidth(ctx, `${t.trimEnd()}…`, spacing) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Word-wraps text into at most `maxLines`, ellipsizing the last (line-clamp). */
function clampLines(ctx: Ctx, text: string, maxW: number, maxLines: number, spacing: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++];
    while (i < words.length && spacedWidth(ctx, `${line} ${words[i]}`, spacing) <= maxW) line += ` ${words[i++]}`;
    lines.push(line);
  }
  if (lines.length > 0) {
    const last = lines.length - 1;
    const rest = i < words.length ? ` ${words.slice(i).join(" ")}` : "";
    lines[last] = ellipsize(ctx, lines[last] + rest, maxW, spacing);
  }
  return lines;
}

/** A run of differently styled text drawn as one centred line. */
export type Run = { text: string; font: string; color: string; spacing?: number };
export function drawRunsCentered(ctx: Ctx, runs: Run[], cx: number, y: number) {
  const widths = runs.map((r) => {
    ctx.font = r.font;
    return spacedWidth(ctx, r.text, r.spacing ?? 0);
  });
  let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
  runs.forEach((r, i) => {
    ctx.font = r.font;
    ctx.fillStyle = r.color;
    drawSpaced(ctx, r.text, x, y, r.spacing ?? 0);
    x += widths[i];
  });
}

/** Draws a soft shadow for a shape without painting the shape itself. */
export function castShadow(ctx: Ctx, scale: number, path: (dy: number) => void, offsetY: number, blur: number, color: string) {
  const FAR = 10000;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = (FAR + offsetY) * scale;
  ctx.fillStyle = "#000";
  path(-FAR);
  ctx.fill();
  ctx.restore();
}

// ── Colour ────────────────────────────────────────────────────────────────

function rgbOf(color: string): [number, number, number] {
  const n = parseInt(normalizeHex(color).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** color-mix(in srgb, color p%, other). */
function mix(color: string, p: number, other: [number, number, number]) {
  const c = rgbOf(color);
  return `rgb(${c.map((v, i) => Math.round(v * p + other[i] * (1 - p))).join(", ")})`;
}
function luminance(color: string) {
  const lin = rgbOf(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * The team-logo watermark: greyscale, knocked out light on dark team colours
 * (invert + screen) or pressed in dark on light ones (contrast + multiply) —
 * the same filters the card applies in CSS. Returns null if the logo's
 * pixels can't be read.
 */
function watermarkCanvas(img: HTMLImageElement, w: number, h: number, darkTeam: boolean) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(img, 0, 0, c.width, c.height);
  try {
    const data = g.getImageData(0, 0, c.width, c.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      let v = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      v = darkTeam ? 255 - v : Math.min(255, Math.max(0, (v - 127.5) * 1.15 + 127.5));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    g.putImageData(data, 0, 0);
    return c;
  } catch {
    return null;
  }
}

// ── The card ──────────────────────────────────────────────────────────────

/** makes/attempts, the label, and the percentage — as the card shows them. */
function shotParts(made: number | null | undefined, att: number | null | undefined, label: string, attLabel: string) {
  const known = made != null && att != null;
  const pct = known && att > 0 ? Math.round((made / att) * 100) : null;
  return {
    known,
    made,
    att,
    value: known ? null : att != null ? String(att) : "—",
    label: known || att == null ? label : attLabel,
    pct,
  };
}

export async function generateTradingCardBlob(o: TradingCardOptions): Promise<Blob | null> {
  const outW = o.width ?? 1080;
  const S = outW / CW;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = Math.round(CH * S);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const pal: TradingCardPalette = { ...PALETTES[o.isDark ? "dark" : "light"] };
  for (const [k, v] of Object.entries(o.palette ?? {})) {
    if (v) pal[k as keyof TradingCardPalette] = v;
  }
  const ringColor = o.isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.06)";

  const objectUrls: string[] = [];
  const [, cutout, profile, teamLogo, leagueLogo, swish] = await Promise.all([
    loadFonts([o.playerName, o.leagueName, o.opponentName, o.teamName, o.gameResult, o.cardDate].filter(Boolean).join(" ")),
    loadImage(o.cutoutUrl, objectUrls),
    o.cutoutUrl ? Promise.resolve(null) : loadImage(o.profilePhotoUrl, objectUrls),
    loadImage(o.teamLogoUrl, objectUrls),
    loadImage(o.leagueLogoUrl, objectUrls),
    loadImage(SwishLogoSrc, objectUrls),
  ]);
  // A cut-out that fails to load falls back to the profile photo, as on screen.
  const photo = cutout ?? (o.cutoutUrl ? await loadImage(o.profilePhotoUrl, objectUrls) : profile);
  const photoIsCutout = !!cutout;

  const team = normalizeHex(o.teamColor);
  const PH = CH * 0.47;

  ctx.scale(S, S);
  ctx.textBaseline = "alphabetic";

  // Card shape and body colour.
  ctx.save();
  roundRectPath(ctx, 0, 0, CW, CH, 18);
  ctx.clip();
  ctx.fillStyle = pal.surface;
  ctx.fillRect(0, 0, CW, CH);

  // ── Photo panel ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CW, PH);
  ctx.clip();

  // radial-gradient(90% 80% at 50% 12%, team+30% white, team 45%, team 45% on black)
  {
    const rx = 0.9 * CW;
    const ry = 0.8 * PH;
    const k = ry / rx;
    ctx.save();
    ctx.translate(CW / 2, PH * 0.12);
    ctx.scale(1, k);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, mix(team, 0.7, [255, 255, 255]));
    g.addColorStop(0.45, team);
    g.addColorStop(1, mix(team, 0.45, [0, 0, 0]));
    ctx.fillStyle = g;
    ctx.fillRect(-CW / 2, -(PH * 0.12) / k, CW, PH / k);
    ctx.restore();
  }

  // Faint court lines (the card's SVG: viewBox 0 0 100 80, slice).
  {
    const s = Math.max(CW / 100, PH / 80);
    const ox = (CW - 100 * s) / 2;
    const oy = (PH - 80 * s) / 2;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(50, -4, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(18, 22);
    ctx.arc(50, 22, 32, Math.PI, 0, true);
    ctx.lineTo(82, 0);
    ctx.stroke();
    ctx.strokeRect(38, 0, 24, 30);
    ctx.restore();
  }

  // Team logo watermark: h-[112%] max-w-[94%] object-contain, centred at 54%.
  if (teamLogo) {
    const boxW = CW * 0.94;
    const boxH = PH * 1.12;
    const fit = Math.min(boxW / teamLogo.naturalWidth, boxH / teamLogo.naturalHeight);
    const w = teamLogo.naturalWidth * fit;
    const h = teamLogo.naturalHeight * fit;
    const darkTeam = luminance(team) < 0.18;
    const mark = watermarkCanvas(teamLogo, w * S, h * S, darkTeam);
    if (mark) {
      ctx.save();
      ctx.globalAlpha = darkTeam ? 0.2 : 0.32;
      ctx.globalCompositeOperation = darkTeam ? "screen" : "multiply";
      ctx.drawImage(mark, CW / 2 - w / 2, PH * 0.54 - h / 2, w, h);
      ctx.restore();
    }
  }

  // Player: cut-out, else the profile photo in a ring, else initials.
  const cx = CW / 2;
  const cy = PH / 2;
  if (photo && photoIsCutout) {
    const h = PH * 0.94;
    const w = (photo.naturalWidth / photo.naturalHeight) * h;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 18 * S;
    ctx.shadowOffsetY = 10 * S;
    ctx.drawImage(photo, cx - w / 2, PH - h, w, h);
    ctx.restore();
  } else if (photo) {
    const R = cq(44) / 2;
    const inner = R - cq(1.1);
    // shadow-[0_14px_30px_-10px_rgba(0,0,0,0.6)], only outside the ring
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CW, PH);
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip("evenodd");
    castShadow(ctx, S, (dy) => {
      ctx.beginPath();
      ctx.arc(cx, cy + dy, R - 10, 0, Math.PI * 2);
    }, 14, 30, "rgba(0, 0, 0, 0.6)");
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fill();
    // object-cover, object-position 50% 22%
    const d = inner * 2;
    const cover = Math.max(d / photo.naturalWidth, d / photo.naturalHeight);
    const w = photo.naturalWidth * cover;
    const h = photo.naturalHeight * cover;
    ctx.drawImage(photo, cx - inner + (d - w) * 0.5, cy - inner + (d - h) * 0.22, w, h);
    ctx.restore();
  } else {
    const R = cq(40) / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R + 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const initials = o.playerName.split(" ").map((n) => n[0]).slice(0, 2).join("");
    const size = cq(15);
    ctx.font = font(700, size, DISPLAY);
    ctx.fillStyle = "#ffffff";
    const lh = size * 1.5;
    const y = baselineIn(ctx, cy - lh / 2, lh);
    const w = spacedWidth(ctx, initials, size * 0.005);
    drawSpaced(ctx, initials, cx - w / 2, y, size * 0.005);
  }

  // Scrim: bg-gradient-to-t from-black/55 via-transparent to-black/20
  {
    const g = ctx.createLinearGradient(0, PH, 0, 0);
    g.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    g.addColorStop(0.5, "rgba(0, 0, 0, 0)");
    g.addColorStop(1, "rgba(0, 0, 0, 0.2)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, PH);
  }

  // The set line, top left: league logo beside the competition name and the
  // full date (stops short of the corner logo).
  if (leagueLogo || o.leagueName || o.cardDate) {
    const left = cq(4.5);
    const top = cq(4.5);
    const rowW = CW - Math.max(48, cq(17)) - left;
    const logoSize = mx(20, 8.5);
    const nameSize = mx(9, 3.1);
    const dateSize = mx(8, 2.7);
    // leading-tight lines
    const nameLH = o.leagueName ? nameSize * 1.25 : 0;
    const dateLH = o.cardDate ? dateSize * 1.25 : 0;
    const textH = nameLH + dateLH;
    const rowH = leagueLogo ? Math.max(logoSize, textH) : textH;
    let x = left;
    if (leagueLogo) {
      // object-contain with drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]
      const by = top + (rowH - logoSize) / 2;
      const fit = Math.min(logoSize / leagueLogo.naturalWidth, logoSize / leagueLogo.naturalHeight);
      const w = leagueLogo.naturalWidth * fit;
      const h = leagueLogo.naturalHeight * fit;
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 2 * S;
      ctx.shadowOffsetY = 1 * S;
      ctx.drawImage(leagueLogo, x + (logoSize - w) / 2, by + (logoSize - h) / 2, w, h);
      ctx.restore();
      x += logoSize + cq(2);
    }
    const textTop = top + (rowH - textH) / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 2 * S;
    ctx.shadowOffsetY = 1 * S;
    if (o.leagueName) {
      ctx.font = font(600, nameSize, BODY);
      const spacing = nameSize * 0.12;
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      drawSpaced(ctx, ellipsize(ctx, o.leagueName.toUpperCase(), left + rowW - x, spacing), x, baselineIn(ctx, textTop, nameLH), spacing);
    }
    if (o.cardDate) {
      ctx.font = font(600, dateSize, BODY);
      const spacing = dateSize * 0.14;
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      drawSpaced(ctx, ellipsize(ctx, o.cardDate.toUpperCase(), left + rowW - x, spacing), x, baselineIn(ctx, textTop + nameLH, dateLH), spacing);
    }
    ctx.restore();
  }

  // Swish logo where the on-screen card has its download button (a 32px
  // circle, 12px in from the corner).
  if (swish) {
    const size = 28;
    const logoX = CW - 12 - 16 - size / 2;
    const logoY = 12 + 16 - size / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 3 * S;
    ctx.shadowOffsetY = 1 * S;
    ctx.drawImage(swish, logoX, logoY, size, size);
    ctx.restore();
  }

  // Result chip, bottom left.
  if (o.gameResult) {
    const size = mx(10, 3.5);
    ctx.font = font(700, size, BODY);
    const padX = cq(2.2);
    const padY = cq(0.9);
    const lh = size * 1.5;
    const w = ctx.measureText(o.gameResult).width + padX * 2;
    const h = lh + padY * 2;
    const x = cq(5);
    const y = PH - cq(4.5) - h;
    const won = o.gameResult.startsWith("W");
    const lost = o.gameResult.startsWith("L");
    roundRectPath(ctx, x, y, w, h, 6);
    ctx.fillStyle = won ? "#16a34a" : lost ? "#e11d48" : "rgba(0, 0, 0, 0.45)";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(o.gameResult, x + padX, baselineIn(ctx, y + padY, lh));
  }

  // Game Score, bottom right.
  {
    const right = CW - cq(5);
    const valueSize = mx(18, 9.5);
    const labelSize = mx(8, 2.7);
    const labelLH = labelSize * 1.5;
    const bottom = PH - cq(4);
    const labelTop = bottom - labelLH;
    const valueTop = labelTop - cq(0.8) - valueSize;
    const value = String(o.gameScore ?? 0);
    ctx.font = font(700, valueSize, DISPLAY);
    ctx.fillStyle = "#ffffff";
    const vSpacing = valueSize * 0.005;
    drawSpaced(ctx, value, right - spacedWidth(ctx, value, vSpacing), baselineIn(ctx, valueTop, valueSize), vSpacing);
    ctx.font = font(600, labelSize, BODY);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    const lSpacing = labelSize * 0.14;
    drawSpaced(ctx, "GMSC", right - spacedWidth(ctx, "GMSC", lSpacing), baselineIn(ctx, labelTop, labelLH), lSpacing);
  }
  ctx.restore(); // panel clip

  // ── Body ──
  const padX = cq(5.5);
  const innerW = CW - padX * 2;
  let y = PH + cq(3.6);

  // Name: ch-display, uppercase, 2 lines max.
  {
    const size = mx(15, 7.4);
    const lh = size * 0.95;
    const spacing = size * 0.005;
    ctx.font = font(700, size, DISPLAY);
    ctx.fillStyle = pal.text;
    for (const line of clampLines(ctx, o.playerName.toUpperCase(), innerW, 2, spacing)) {
      drawSpaced(ctx, line, padX, baselineIn(ctx, y, lh), spacing);
      y += lh;
    }
  }

  // Team logo and "vs opponent" (or the date).
  {
    y += cq(1.8);
    const size = mx(10, 3.5);
    const lh = size * 1.5;
    const logo = mx(14, 4.8);
    const rowH = Math.max(lh, teamLogo ? logo : 0);
    let x = padX;
    if (teamLogo) {
      const ly = y + (rowH - logo) / 2;
      ctx.save();
      roundRectPath(ctx, x, ly, logo, logo, 8);
      ctx.clip();
      const fit = Math.min(1, logo / teamLogo.naturalWidth, logo / teamLogo.naturalHeight);
      const w = teamLogo.naturalWidth * fit;
      const h = teamLogo.naturalHeight * fit;
      ctx.drawImage(teamLogo, x + (logo - w) / 2, ly + (logo - h) / 2, w, h);
      ctx.restore();
      x += logo + cq(1.8);
    }
    const text = o.opponentName ? `vs ${o.opponentName}` : o.teamName || "";
    if (text) {
      ctx.font = font(400, size, BODY);
      ctx.fillStyle = pal.text2;
      ctx.fillText(ellipsize(ctx, text, padX + innerW - x), x, baselineIn(ctx, y + (rowH - lh) / 2, lh));
    }
  }

  // Stats, anchored to the bottom of the card.
  {
    const bigValue = mx(16, 7.2);
    const bigLabel = mx(8.5, 2.9);
    const smallValue = mx(10, 4.3);
    const shotValue = mx(10.5, 4.4);
    const smallLabel = mx(8, 2.6);
    const labelGap = cq(1.2);

    const bigRowH = 1 + cq(3) + bigValue + labelGap + bigLabel * 1.5;
    const shotRowH = cq(1.9) * 2 + shotValue + labelGap + smallLabel * 1.5;
    const miscRowH = smallValue + labelGap + smallLabel * 1.5;
    const bottom = CH - cq(4.2);
    const miscTop = bottom - miscRowH;
    const shotTop = miscTop - cq(2.4) - shotRowH;
    const bigTop = shotTop - cq(2.6) - bigRowH;

    const columns = (n: number, gap: number) => {
      const w = (innerW - gap * (n - 1)) / n;
      return Array.from({ length: n }, (_, i) => padX + i * (w + gap) + w / 2);
    };
    const label = (text: string, cx: number, top: number, size: number, extra?: Run) => {
      const runs: Run[] = [{ text: text.toUpperCase(), font: font(400, size, BODY), color: pal.muted, spacing: size * 0.1 }];
      if (extra) runs.push(extra);
      ctx.font = runs[0].font;
      drawRunsCentered(ctx, runs, cx, baselineIn(ctx, top, size * 1.5));
    };

    // PTS / REB / AST
    ctx.fillStyle = pal.border;
    ctx.fillRect(padX, bigTop, innerW, 1);
    const bigCols = columns(3, cq(2));
    const bigValueTop = bigTop + 1 + cq(3);
    [["PTS", o.pts], ["REB", o.reb], ["AST", o.ast]].forEach(([name, v], i) => {
      ctx.font = font(700, bigValue, DISPLAY);
      ctx.fillStyle = pal.text;
      drawRunsCentered(ctx, [{ text: String(v ?? 0), font: font(700, bigValue, DISPLAY), color: pal.text, spacing: bigValue * 0.005 }], bigCols[i], baselineIn(ctx, bigValueTop, bigValue));
      label(String(name), bigCols[i], bigValueTop + bigValue + labelGap, bigLabel);
    });

    // Shooting band: FG / 3PT / FT
    roundRectPath(ctx, padX, shotTop, innerW, shotRowH, cq(2.4));
    ctx.fillStyle = pal.surface2;
    ctx.fill();
    roundRectPath(ctx, padX + 0.5, shotTop + 0.5, innerW - 1, shotRowH - 1, cq(2.4) - 0.5);
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    const shotCols = columns(3, cq(1.5));
    const shotValueTop = shotTop + cq(1.9);
    [
      shotParts(o.fgm, o.fga, "FG", "FGA"),
      shotParts(o.tpm, o.tpa, "3PT", "3PA"),
      shotParts(o.ftm, o.fta, "FT", "FTA"),
    ].forEach((s, i) => {
      const valueFont = font(600, shotValue, BODY);
      ctx.font = valueFont;
      const vy = baselineIn(ctx, shotValueTop, shotValue);
      if (s.known) {
        drawRunsCentered(ctx, [
          { text: String(s.made), font: valueFont, color: pal.text },
          { text: "/", font: font(400, shotValue, BODY), color: pal.muted },
          { text: String(s.att), font: valueFont, color: pal.text },
        ], shotCols[i], vy);
      } else {
        drawRunsCentered(ctx, [{ text: s.value ?? "—", font: valueFont, color: pal.text }], shotCols[i], vy);
      }
      label(s.label, shotCols[i], shotValueTop + shotValue + labelGap, smallLabel,
        s.pct !== null ? { text: ` ${s.pct}%`, font: font(600, smallLabel, BODY), color: pal.text2, spacing: smallLabel * 0.1 } : undefined);
    });

    // STL / BLK / TOV / TS%
    const miscCols = columns(4, cq(1));
    [["STL", o.stl ?? 0], ["BLK", o.blk ?? 0], ["TOV", o.tov ?? 0], ["TS%", o.tsPct]].forEach(([name, v], i) => {
      const valueFont = font(600, smallValue, BODY);
      ctx.font = valueFont;
      drawRunsCentered(ctx, [{ text: String(v), font: valueFont, color: pal.text }], miscCols[i], baselineIn(ctx, miscTop, smallValue));
      label(String(name), miscCols[i], miscTop + smallValue + labelGap, smallLabel);
    });
  }
  ctx.restore(); // card clip

  // ring-1 around the card.
  roundRectPath(ctx, 0.5, 0.5, CW - 1, CH - 1, 17.5);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  return blob;
}
