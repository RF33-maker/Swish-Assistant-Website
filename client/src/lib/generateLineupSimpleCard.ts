/**
 * Plain "Best lineup" card (1080×1350) for team pages: the five names with small round headshots on
 * the left and the unit's numbers on the right. Same palette and footer as the other Swish cards,
 * but text-led rather than five big photo panels, so it reads well when shared on its own.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { LineupUnit } from "@/types/lineups";
import type { WeeklyCardBrand } from "@/types/weeklyAwards";
import { cleanTeamLabel } from "@/lib/generateLeadersCards";
import {
  BODY,
  CARD_H,
  CARD_W,
  GUESSED_HEAD,
  capHeight,
  drawTextTop,
  ensureDisplayFont,
  fetchImg,
  fitSize,
  drawFooter,
  initialsOf,
  shade,
  verticalGradient,
  withAlpha,
} from "@/lib/generateWeeklyCards";

export type LineupSimpleCardOptions = {
  unit: LineupUnit;
  teamName: string;
  brand: WeeklyCardBrand;
  teamLogoUrl?: string | null;
  /** How the unit was picked, e.g. "Ranked by net rating · min. 8 minutes together". */
  rankedBy?: string;
  /** Extra fine print, e.g. "Based on 5 of 6 games with reliable lineup data". */
  note?: string;
  /** Marked face positions by photo URL, so headshots centre on the face where known. */
  heads?: Record<string, { x: number; y: number } | undefined>;
};

const SIDE = 60;
const LEFT_W = 560;
const RIGHT_X = 660;
const RIGHT_W = CARD_W - SIDE - RIGHT_X;
const BODY_TOP = 372;
const ROW_H = 128;

const signed = (v: number | null, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`);

function withSpacing(ctx: CanvasRenderingContext2D, px: number, draw: () => void) {
  const c = ctx as unknown as { letterSpacing: string };
  const before = c.letterSpacing;
  c.letterSpacing = `${px}px`;
  draw();
  c.letterSpacing = before;
}

/** Square crop of a photo around the face, drawn into a circle. */
function drawHeadshot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  diameter: number,
  head: { x: number; y: number },
) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const side = Math.min(w, h) * 0.78;
  const sx = Math.max(0, Math.min(w - side, head.x * w - side / 2));
  const sy = Math.max(0, Math.min(h - side, head.y * h - side / 2));
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, sx, sy, side, side, cx - diameter / 2, cy - diameter / 2, diameter, diameter);
  ctx.restore();
}

export async function renderLineupSimpleCard(opts: LineupSimpleCardOptions): Promise<HTMLCanvasElement> {
  const { unit, teamName, brand, teamLogoUrl, rankedBy, note, heads = {} } = opts;
  await ensureDisplayFont();
  const [logo, leagueLogo, teamLogo, ...photos] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(brand.leagueLogoUrl),
    fetchImg(teamLogoUrl),
    ...unit.players.map((p) => fetchImg(p.photoUrl)),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const accent = shade(brand.primaryHex, 0.28);

  ctx.fillStyle = verticalGradient(ctx, 0, CARD_H, [
    [0, shade(brand.primaryHex, -0.5)],
    [0.55, shade(brand.primaryHex, -0.8)],
    [1, "#070403"],
  ]);
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, CARD_W, 12);

  // ── header, left-aligned ──
  let y = 64;
  withSpacing(ctx, 4, () => {
    y += drawTextTop(ctx, "BEST LINEUP", SIDE, y, { size: 40, weight: 600, color: accent });
  });
  y += 20;
  const team = cleanTeamLabel(teamName).toUpperCase();
  const teamSize = fitSize(ctx, team, CARD_W - SIDE * 2, 104, 52, 700);
  y += drawTextTop(ctx, team, SIDE, y, { size: teamSize, weight: 700 });
  y += 22;
  y += drawTextTop(ctx, brand.leagueName, SIDE, y, { size: 32, alpha: 0.85 });
  if (rankedBy) {
    y += 14;
    y += drawTextTop(ctx, rankedBy, SIDE, y, { size: 24, family: BODY, alpha: 0.6 });
  }
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(SIDE, BODY_TOP - 40, CARD_W - SIDE * 2, 1.5);

  // ── the five ──
  const heading = (text: string, x: number) =>
    withSpacing(ctx, 3, () => drawTextTop(ctx, text, x, BODY_TOP - 4, { size: 24, weight: 600, alpha: 0.6 }));
  heading("THE FIVE", SIDE);
  heading("TOGETHER", RIGHT_X + 28);

  const rowsTop = BODY_TOP + 44;
  const diameter = 96;
  unit.players.forEach((p, i) => {
    const rowY = rowsTop + i * ROW_H;
    const midY = rowY + ROW_H / 2;
    if (i > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(SIDE, rowY, LEFT_W, 1.5);
    }
    const cx = SIDE + diameter / 2;
    const photo = photos[i];
    if (photo) {
      drawHeadshot(ctx, photo, cx, midY, diameter, (p.photoUrl ? heads[p.photoUrl] : undefined) ?? GUESSED_HEAD);
    } else {
      ctx.fillStyle = withAlpha(accent, 0.22);
      ctx.beginPath();
      ctx.arc(cx, midY, diameter / 2, 0, Math.PI * 2);
      ctx.fill();
      const initialsOpts = { size: 40, weight: 700, alpha: 0.75, align: "center" as const };
      drawTextTop(ctx, initialsOf(p.name), cx, midY - capHeight(ctx, initialsOpts) / 2, initialsOpts);
    }
    ctx.strokeStyle = withAlpha(accent, 0.55);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, midY, diameter / 2, 0, Math.PI * 2);
    ctx.stroke();

    const parts = p.name.trim().split(/\s+/);
    const last = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
    const first = parts.length > 1 ? parts[0] : "";
    const nameX = SIDE + diameter + 28;
    const maxW = SIDE + LEFT_W - nameX;
    const lastSize = fitSize(ctx, last.toUpperCase(), maxW, 58, 30, 600);
    const lastCap = capHeight(ctx, { size: lastSize, weight: 600 });
    const firstOpts = { size: 28, weight: 400, alpha: 0.75 };
    const firstCap = first ? capHeight(ctx, firstOpts) : 0;
    const blockH = firstCap + (first ? 10 : 0) + lastCap;
    let ty = midY - blockH / 2;
    if (first) {
      drawTextTop(ctx, first, nameX, ty, firstOpts);
      ty += firstCap + 10;
    }
    drawTextTop(ctx, last.toUpperCase(), nameX, ty, { size: lastSize, weight: 600 });
  });

  // ── the numbers, one row per stat, aligned to the rows on the left ──
  const panelH = ROW_H * 5;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.roundRect(RIGHT_X, rowsTop, RIGHT_W, panelH, 18);
  ctx.fill();
  const stats: { label: string; value: string; big?: boolean }[] = [
    { label: "NET RATING", value: signed(unit.net), big: true },
    { label: "OFF RATING", value: unit.ortg != null ? unit.ortg.toFixed(1) : "—" },
    { label: "DEF RATING", value: unit.drtg != null ? unit.drtg.toFixed(1) : "—" },
    { label: "PLUS / MINUS", value: signed(unit.plusMinus, 0) },
    { label: "MINUTES", value: unit.minutes != null ? unit.minutes.toFixed(1) : "—" },
  ];
  stats.forEach((s, i) => {
    const rowY = rowsTop + i * ROW_H;
    const midY = rowY + ROW_H / 2;
    if (i > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(RIGHT_X + 28, rowY, RIGHT_W - 56, 1.5);
    }
    const valueOpts = { size: s.big ? 66 : 58, weight: 700, color: s.big ? accent : "#fff", align: "right" as const };
    drawTextTop(ctx, s.value, RIGHT_X + RIGHT_W - 28, midY - capHeight(ctx, valueOpts) / 2, valueOpts);
    const labelOpts = { size: 24, weight: 500, alpha: 0.8 };
    withSpacing(ctx, 1.5, () => drawTextTop(ctx, s.label, RIGHT_X + 28, midY - capHeight(ctx, labelOpts) / 2, labelOpts));
  });

  // ── fine print ──
  const games = `${unit.games} game${unit.games === 1 ? "" : "s"}`;
  let fy = rowsTop + panelH + 34;
  fy += drawTextTop(ctx, `${unit.pf}–${unit.pa} together over ${unit.minutes?.toFixed(1)} minutes in ${games}`, CARD_W / 2, fy, {
    size: 28, alpha: 0.8, align: "center",
  });
  if (note) drawTextTop(ctx, note, CARD_W / 2, fy + 14, { size: 22, family: BODY, alpha: 0.55, align: "center" });

  drawFooter(ctx, [logo, "statsthread", teamLogo, leagueLogo], brand.leagueName);
  return canvas;
}
