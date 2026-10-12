/**
 * The downloadable player / team comparison card (1080×1350), drawn on a canvas in
 * the shared Swish Social look (see cardStyle.ts): the two sides across the top,
 * who leads how many stats, then each stat with a bar per side.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import { SIDE, drawBackdrop, drawCrest, drawHeader, drawSpaced, drawVignette, themeFor, type Theme } from "@/lib/cardStyle";
import {
  CARD_H,
  CARD_W,
  canvasToBlob,
  capHeight,
  drawFooter,
  drawTextTop,
  ensureDisplayFont,
  fetchImg,
  fitSize,
  initialsOf,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

export type ComparisonCardSide = {
  name: string;
  /** A player's club. */
  sub?: string;
  games: number;
  /** A player's photo, shown in a circle. */
  photoUrl?: string | null;
  /** A club's crest; also used for a player without a photo. */
  logoUrl?: string | null;
};

/** One stat, already worked out: the text for each side, their numbers, and who is better (0 = level). */
export type ComparisonCardRow = { label: string; value1: string; value2: string; n1: number; n2: number; lead: 0 | 1 | 2 };

export type ComparisonCardOptions = {
  kind: "player" | "team";
  left: ComparisonCardSide;
  right: ComparisonCardSide;
  rows: ComparisonCardRow[];
  /** The line under the title, e.g. "Season averages · Traditional". */
  banner: string;
  /** Between the two sides; "VS" unless there is a series score to show. */
  centre?: { text: string; caption?: string };
  /** Head-to-head games, newest first (e.g. "10 Oct 2026 · Home 98–85 Away"); listed when the category has no stats for them. */
  results?: string[];
  leagueName: string;
  leagueLogoUrl?: string | null;
  primaryHex: string;
};

const LEFT_X = 250;
const RIGHT_X = CARD_W - 250;
const FACE_Y = 356;
const FACE_R = 104;
const ROWS_TOP = 706;
const ROWS_BOTTOM = 1196;
const MAX_ROWS = 16;

/** A photo cropped to a circle, kept towards the top of the picture where the face is. */
function drawFace(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number, ring: string) {
  const scale = Math.max((r * 2) / img.naturalWidth, (r * 2) / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#15100f";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, cx - dw / 2, cy - r - (dh - r * 2) * 0.12, dw, dh);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSide(
  ctx: CanvasRenderingContext2D,
  side: ComparisonCardSide,
  cx: number,
  photo: HTMLImageElement | null,
  logo: HTMLImageElement | null,
  ring: string,
  theme: Theme,
) {
  if (photo) drawFace(ctx, photo, cx, FACE_Y, FACE_R, ring);
  else drawCrest(ctx, cx, FACE_Y, FACE_R, logo, initialsOf(side.name), theme);

  const maxW = 430;
  const name = side.name.toUpperCase();
  const size = fitSize(ctx, name, maxW, 46, 24, 700);
  let y = FACE_Y + FACE_R + 28;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 16;
  y += drawTextTop(ctx, name, cx, y, { size, weight: 700, align: "center" }) + 14;
  ctx.restore();
  if (side.sub) {
    const sub = side.sub.toUpperCase();
    const subOpts: TextOpts = { size: fitSize(ctx, sub, maxW, 22, 15, 500), weight: 500, align: "center", alpha: 0.8 };
    y += drawSpaced(ctx, sub, cx, y, 1.5, subOpts) + 12;
  }
  drawSpaced(ctx, `${side.games} ${side.games === 1 ? "GAME" : "GAMES"}`, cx, y, 2, { size: 18, weight: 500, align: "center", alpha: 0.55 });
}

/** How many stats each side leads, either end of one bar. */
function drawSummary(ctx: CanvasRenderingContext2D, rows: ComparisonCardRow[], theme: Theme) {
  const leads1 = rows.filter((r) => r.lead === 1).length;
  const leads2 = rows.filter((r) => r.lead === 2).length;
  const level = rows.length - leads1 - leads2;
  const top = 606;
  const barL = 190;
  const barR = CARD_W - 190;
  const big: TextOpts = { size: 58, weight: 700 };
  const cap = capHeight(ctx, big);
  drawTextTop(ctx, String(leads1), barL - 26, top, { ...big, align: "right", color: theme.accent });
  drawTextTop(ctx, String(leads2), barR + 26, top, { ...big, align: "left" });
  drawSpaced(ctx, `STATS LED, OF ${rows.length}`, CARD_W / 2, top, 3, { size: 17, weight: 500, align: "center", alpha: 0.6 });

  const y = top + cap - 12;
  const gap = 4;
  const parts: [number, string][] = [
    [leads1, theme.accent],
    [level, "rgba(255,255,255,0.22)"],
    [leads2, "rgba(255,255,255,0.78)"],
  ];
  const shown = parts.filter(([n]) => n > 0);
  const width = barR - barL - gap * Math.max(0, shown.length - 1);
  let x = barL;
  for (const [n, colour] of shown) {
    const w = (width * n) / rows.length;
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, w, 12);
    x += w + gap;
  }
}

function drawRows(ctx: CanvasRenderingContext2D, rows: ComparisonCardRow[], theme: Theme) {
  const rowH = Math.min(50, (ROWS_BOTTOM - ROWS_TOP) / rows.length);
  const valueSize = Math.min(31, Math.round(rowH * 0.66));
  const labelSize = Math.min(21, Math.round(rowH * 0.46));
  const barH = Math.max(8, Math.round(rowH * 0.24));
  const barLen = 220;
  const innerL = 450;
  const innerR = CARD_W - 450;

  rows.forEach((row, i) => {
    const midY = ROWS_TOP + i * rowH + rowH / 2;
    if (i > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(SIDE + 30, ROWS_TOP + i * rowH, CARD_W - (SIDE + 30) * 2, 1);
    }
    const top = Math.max(Math.abs(row.n1), Math.abs(row.n2)) || 1;
    const sides = [
      { text: row.value1, share: Math.abs(row.n1) / top, lit: row.lead === 1, textX: innerL - barLen - 20, align: "right" as const },
      { text: row.value2, share: Math.abs(row.n2) / top, lit: row.lead === 2, textX: innerR + barLen + 20, align: "left" as const },
    ];
    sides.forEach((s, k) => {
      const o: TextOpts = { size: valueSize, weight: s.lit ? 700 : 500, align: s.align, alpha: s.lit ? 1 : 0.62 };
      drawTextTop(ctx, s.text, s.textX, midY - capHeight(ctx, o) / 2, o);
      // The track, then the bar growing out from the middle of the card.
      const trackX = k === 0 ? innerL - barLen : innerR;
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(trackX, midY - barH / 2, barLen, barH);
      const w = Math.max(6, barLen * Math.min(1, s.share));
      ctx.fillStyle = s.lit ? theme.accent : "rgba(255,255,255,0.34)";
      ctx.fillRect(k === 0 ? innerL - w : innerR, midY - barH / 2, w, barH);
    });
    const label: TextOpts = { size: labelSize, weight: 600, align: "center", alpha: 0.92 };
    label.size = Math.min(labelSize, fitSize(ctx, row.label.toUpperCase(), innerR - innerL - 24, labelSize, 12, 600));
    drawSpaced(ctx, row.label.toUpperCase(), CARD_W / 2, midY - capHeight(ctx, label) / 2, 1.5, label);
  });
}

export async function renderComparisonCard(opts: ComparisonCardOptions): Promise<HTMLCanvasElement> {
  const { kind, left, right, banner, centre, leagueLogoUrl, primaryHex } = opts;
  // "NBL Division One 2026-27" -> "NBL Division One": the season only crowds the top line.
  const leagueName = opts.leagueName.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
  const rows = opts.rows.slice(0, MAX_ROWS);
  await ensureDisplayFont();

  const [logo, leagueLogo, photo1, photo2, crest1, crest2] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(leagueLogoUrl),
    fetchImg(left.photoUrl),
    fetchImg(right.photoUrl),
    fetchImg(left.logoUrl),
    fetchImg(right.logoUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const theme = themeFor("league", primaryHex);

  drawBackdrop(ctx, theme, leagueLogo, { x: CARD_W / 2, y: 0 });
  drawVignette(ctx, theme);
  drawHeader(ctx, kind === "player" ? "PLAYER COMPARISON" : "TEAM COMPARISON", banner, leagueName, theme);

  drawSide(ctx, left, LEFT_X, photo1, crest1, theme.accent, theme);
  drawSide(ctx, right, RIGHT_X, photo2, crest2, "rgba(255,255,255,0.85)", theme);

  const mid = centre ?? { text: "VS" };
  const midOpts: TextOpts = { size: fitSize(ctx, mid.text, 190, 76, 40, 700), weight: 700, align: "center", alpha: centre ? 1 : 0.5 };
  const midCap = capHeight(ctx, midOpts);
  drawTextTop(ctx, mid.text, CARD_W / 2, FACE_Y - midCap / 2, midOpts);
  if (mid.caption) {
    drawSpaced(ctx, mid.caption.toUpperCase(), CARD_W / 2, FACE_Y - midCap / 2 - 34, 3, { size: 17, weight: 500, align: "center", alpha: 0.6 });
  }

  if (rows.length > 0) {
    drawSummary(ctx, rows, theme);
    drawRows(ctx, rows, theme);
  } else {
    // Nothing to compare in this category (some games carry no advanced stats): show the games themselves instead.
    const results = (opts.results ?? []).slice(0, 7);
    let y = results.length > 0 ? 640 : 800;
    y += drawSpaced(ctx, "NO STATS RECORDED IN THIS CATEGORY", CARD_W / 2, y, 3, { size: 22, weight: 500, align: "center", alpha: 0.55 }) + 54;
    for (const line of results) {
      const text = line.toUpperCase();
      const o: TextOpts = { size: fitSize(ctx, text, CARD_W - SIDE * 2 - 60, 36, 20, 600), weight: 600, align: "center" };
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(SIDE + 30, y - 22, CARD_W - (SIDE + 30) * 2, 1);
      y += drawTextTop(ctx, text, CARD_W / 2, y, o) + 44;
    }
  }

  drawFooter(ctx, [logo, "statsthread", leagueLogo], leagueName);
  return canvas;
}

export async function generateComparisonCardBlob(opts: ComparisonCardOptions): Promise<Blob | null> {
  return canvasToBlob(await renderComparisonCard(opts));
}
