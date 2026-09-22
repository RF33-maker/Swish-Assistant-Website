/**
 * "Best lineup" card (1080×1350): a team's best five-man unit as five photo panels, in the same
 * style as Team of the Week, with the unit's numbers underneath.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { LineupUnit } from "@/types/lineups";
import type { WeeklyCardBrand } from "@/types/weeklyAwards";
import { cleanTeamLabel } from "@/lib/generateLeadersCards";
import {
  CARD_H,
  CARD_W,
  DEFAULT_FRAMING,
  DEFAULT_HEAD_LINE,
  GUESSED_HEAD,
  capHeight,
  drawContain,
  drawFooter,
  drawTextTop,
  ensureDisplayFont,
  fetchImg,
  fitSize,
  initialsOf,
  placeInFrame,
  shade,
  verticalGradient,
} from "@/lib/generateWeeklyCards";

export type LineupCardOptions = {
  unit: LineupUnit;
  teamName: string;
  brand: WeeklyCardBrand;
  teamLogoUrl?: string | null;
  /** Marked face positions by photo URL (shared with Team of the Week). */
  heads?: Record<string, { x: number; y: number } | undefined>;
  alignHeads?: boolean;
  headLine?: number;
};

const SIDE = 33;
const GAP = 10;
const PANEL_TOP = 236;
const PANEL_BOTTOM = 940;

const signed = (v: number | null, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`);

export async function renderLineupCard(opts: LineupCardOptions): Promise<HTMLCanvasElement> {
  const { unit, teamName, brand, teamLogoUrl, heads = {}, alignHeads = true, headLine = DEFAULT_HEAD_LINE } = opts;
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

  // ── header ──
  const titleSize = fitSize(ctx, "BEST LINEUP", 900, 104, 60, 700);
  const titleCap = drawTextTop(ctx, "BEST LINEUP", CARD_W / 2, 20, { size: titleSize, weight: 700, align: "center" });
  const team = cleanTeamLabel(teamName).toUpperCase();
  const teamSize = fitSize(ctx, team, 940, 58, 30, 600);
  const teamCap = drawTextTop(ctx, team, CARD_W / 2, 20 + titleCap + 14, { size: teamSize, weight: 600, align: "center", alpha: 0.95 });
  drawTextTop(ctx, brand.leagueName, CARD_W / 2, 20 + titleCap + 14 + teamCap + 12, { size: 32, alpha: 0.85, align: "center" });

  // ── five photo panels, faces on one line, nothing faded ──
  const count = Math.max(1, unit.players.length);
  const panelW = (CARD_W - SIDE * 2 - GAP * (count - 1)) / count;
  const panelH = PANEL_BOTTOM - PANEL_TOP;
  unit.players.forEach((p, i) => {
    const x = SIDE + i * (panelW + GAP);
    const photo = photos[i];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, PANEL_TOP, panelW, panelH);
    ctx.clip();
    const bg = ctx.createLinearGradient(x, PANEL_TOP, x + panelW, PANEL_TOP + panelH);
    bg.addColorStop(0, shade(brand.primaryHex, -0.1));
    bg.addColorStop(1, shade(brand.primaryHex, -0.6));
    ctx.fillStyle = bg;
    ctx.fillRect(x, PANEL_TOP, panelW, panelH);
    if (photo) {
      const placed = placeInFrame(photo, panelW, panelH, {
        framing: DEFAULT_FRAMING,
        head: alignHeads ? (p.photoUrl ? heads[p.photoUrl] : undefined) ?? GUESSED_HEAD : null,
        headLine,
        focusY: p.photoFocusY ?? 50,
      });
      ctx.drawImage(photo, x + placed.left, PANEL_TOP + placed.top, photo.naturalWidth * placed.scale, photo.naturalHeight * placed.scale);
    } else {
      drawTextTop(ctx, initialsOf(p.name), x + panelW / 2, PANEL_TOP + 36, { size: 96, weight: 700, alpha: 0.28, align: "center" });
    }
    ctx.fillStyle = verticalGradient(ctx, PANEL_TOP, PANEL_TOP + panelH, [[0.45, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.72)"]]);
    ctx.fillRect(x, PANEL_TOP, panelW, panelH);

    // name reading bottom-to-top along the panel's right edge
    const nameSize = fitSize(ctx, p.name, panelH - 40, 66, 34, 500);
    ctx.translate(x + panelW - 14, PANEL_TOP + panelH - 12);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `500 ${nameSize}px "Oswald", Impact, "Arial Narrow", sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.fillText(p.name, 0, 0);
    ctx.restore();
  });

  // ── the unit's numbers ──
  const cells: { value: string; label: string; big?: boolean; color?: string }[] = [
    { value: signed(unit.net), label: "NET RATING", big: true, color: accent },
    { value: unit.ortg != null ? unit.ortg.toFixed(1) : "—", label: "OFF RATING" },
    { value: unit.drtg != null ? unit.drtg.toFixed(1) : "—", label: "DEF RATING" },
    { value: signed(unit.plusMinus, 0), label: "+/-" },
    { value: unit.minutes != null ? unit.minutes.toFixed(1) : "—", label: "MINUTES" },
  ];
  const weights = cells.map((c) => (c.big ? 1.5 : 1));
  const totalW = CARD_W - SIDE * 2;
  const unitW = totalW / weights.reduce((a, b) => a + b, 0);
  let cx = SIDE;
  const statsTop = PANEL_BOTTOM + 34;
  cells.forEach((c, i) => {
    const w = unitW * weights[i];
    const valSize = c.big ? 92 : 62;
    const valOpts = { size: valSize, weight: 700, color: c.color ?? "#fff", align: "center" as const };
    const valCap = capHeight(ctx, valOpts);
    const midY = statsTop + 46;
    drawTextTop(ctx, c.value, cx + w / 2, midY - valCap / 2, valOpts);
    drawTextTop(ctx, c.label, cx + w / 2, statsTop + 46 + 60, { size: 26, weight: 500, alpha: 0.8, align: "center" });
    if (i > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(cx, statsTop, 1.5, 130);
    }
    cx += w;
  });

  const games = `${unit.games} game${unit.games === 1 ? "" : "s"}`;
  drawTextTop(ctx, `${unit.pf}–${unit.pa} together over ${unit.minutes?.toFixed(1)} minutes in ${games}`, CARD_W / 2, statsTop + 158, {
    size: 26, alpha: 0.7, align: "center",
  });

  drawFooter(ctx, [logo, "statsthread", teamLogo, leagueLogo], brand.leagueName);
  return canvas;
}
