/**
 * The downloadable league leaders card (1080×1350), drawn on a canvas in the shared
 * Swish Social look (see cardStyle.ts) in the league's colour: one ranked list, or
 * several short ones stacked (the Overview tab's scorers / rebounders / playmakers).
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import { SIDE, cleanTeamLabel, drawBackdrop, drawHeader, drawSpaced, drawTag, drawVignette, themeFor, type Theme } from "@/lib/cardStyle";
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
  setFont,
  withAlpha,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

export type LeaderListEntry = { name: string; team?: string | null; value: string | number };
export type LeaderListGroup = { title: string; leaders: LeaderListEntry[]; unitLabel?: string };

export type LeaderListCardOptions = {
  /** The card's headline, e.g. "Scoring Leaders". */
  title: string;
  /** One list, or several stacked. */
  groups: LeaderListGroup[];
  leagueName: string;
  /** The line under the title: an age group, a round, "Averages". */
  contextLabel?: string;
  leagueLogoUrl?: string | null;
  primaryHex: string;
  /** Small print in the footer, e.g. "Min. 4 games played". */
  footnote?: string;
};

const LIST_TOP = 248;
const LIST_BOTTOM = 1196;

function drawRow(
  ctx: CanvasRenderingContext2D,
  entry: LeaderListEntry,
  rank: number,
  y: number,
  h: number,
  unit: string | undefined,
  lead: boolean,
  theme: Theme,
) {
  const right = CARD_W - SIDE;
  const midY = y + h / 2;
  if (lead) {
    // The leader's row carries a band of the card's colour.
    const band = ctx.createLinearGradient(SIDE, 0, right, 0);
    band.addColorStop(0, withAlpha(theme.accent, 0.3));
    band.addColorStop(1, withAlpha(theme.accent, 0.04));
    ctx.fillStyle = band;
    ctx.fillRect(SIDE, y + 3, right - SIDE, h - 6);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(SIDE, y, right - SIDE, 1.5);
  }

  const big = h >= 84;
  const rankOpts: TextOpts = { size: Math.round(Math.min(56, h * 0.56)), weight: 700, color: theme.rank, align: "center" };
  drawTextTop(ctx, String(rank), SIDE + 44, midY - capHeight(ctx, rankOpts) / 2, rankOpts);

  const valueText = String(entry.value);
  const valueOpts: TextOpts = { size: Math.round(Math.min(64, h * 0.62)), weight: 700, align: "right" };
  const unitOpts: TextOpts = { size: Math.round(valueOpts.size * 0.4), weight: 600, color: theme.accent, align: "right" };
  let valueRight = right - 20;
  if (unit) {
    setFont(ctx, unitOpts);
    const unitW = ctx.measureText(unit).width;
    const valueCap = capHeight(ctx, valueOpts);
    drawTextTop(ctx, unit, valueRight, midY + valueCap / 2 - capHeight(ctx, unitOpts), unitOpts);
    valueRight -= unitW + 10;
  }
  setFont(ctx, valueOpts);
  const valueW = ctx.measureText(valueText).width;
  drawTextTop(ctx, valueText, valueRight, midY - capHeight(ctx, valueOpts) / 2, valueOpts);

  const nameX = SIDE + 98;
  const maxW = valueRight - valueW - 28 - nameX;
  const team = cleanTeamLabel(entry.team ?? "");
  const nameSize = fitSize(ctx, entry.name, maxW, Math.round(Math.min(44, h * 0.46)), 20, lead ? 600 : 500);
  const nameCap = capHeight(ctx, { size: nameSize, weight: 500 });
  if (team && big) {
    const subSize = fitSize(ctx, team, maxW, 23, 15, 400);
    const subCap = capHeight(ctx, { size: subSize });
    const top = midY - (nameCap + 11 + subCap) / 2;
    drawTextTop(ctx, entry.name, nameX, top, { size: nameSize, weight: lead ? 600 : 500 });
    drawTextTop(ctx, team, nameX, top + nameCap + 11, { size: subSize, alpha: 0.66 });
  } else {
    // A tight row: the club follows the name on the same line.
    drawTextTop(ctx, entry.name, nameX, midY - nameCap / 2, { size: nameSize, weight: lead ? 600 : 500 });
    if (team) {
      setFont(ctx, { size: nameSize, weight: lead ? 600 : 500 });
      const nameW = ctx.measureText(entry.name).width;
      const room = maxW - nameW - 18;
      if (room > 90) {
        const sub: TextOpts = { size: fitSize(ctx, team, room, Math.round(nameSize * 0.62), 14, 400), alpha: 0.6 };
        drawTextTop(ctx, team, nameX + nameW + 18, midY + nameCap / 2 - capHeight(ctx, sub), sub);
      }
    }
  }
}

export async function renderLeaderListCard(opts: LeaderListCardOptions): Promise<HTMLCanvasElement> {
  const { title, leagueLogoUrl, primaryHex, contextLabel, footnote } = opts;
  // "NBL Division One 2026-27" -> "NBL Division One": the season only crowds the top line.
  const leagueName = opts.leagueName.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
  await ensureDisplayFont();
  const [logo, leagueLogo] = await Promise.all([fetchImg(swishLogoSrc), fetchImg(leagueLogoUrl)]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const theme = themeFor("league", primaryHex);
  drawBackdrop(ctx, theme, leagueLogo, { x: CARD_W / 2, y: 0 });
  drawVignette(ctx, theme);
  drawHeader(ctx, title.toUpperCase(), contextLabel || "", leagueName, theme);

  const groups = opts.groups.filter((g) => g.leaders.length > 0);
  if (groups.length === 0) {
    drawSpaced(ctx, "NO LEADERS YET", CARD_W / 2, 700, 3, { size: 30, weight: 500, align: "center", alpha: 0.6 });
  } else if (groups.length === 1) {
    const leaders = groups[0].leaders.slice(0, 10);
    const rowH = Math.min(132, (LIST_BOTTOM - LIST_TOP) / leaders.length);
    // A short list sits in the middle of the card rather than hanging from the header.
    const top = LIST_TOP + (LIST_BOTTOM - LIST_TOP - rowH * leaders.length) / 2;
    leaders.forEach((entry, i) => drawRow(ctx, entry, i + 1, top + i * rowH, rowH, groups[0].unitLabel, i === 0, theme));
  } else {
    // Several lists: as many rows of each as fit under its own tag.
    const shown = groups.slice(0, 4);
    const blockH = (LIST_BOTTOM - LIST_TOP) / shown.length;
    const tagH = 40;
    const perGroup = Math.max(3, Math.min(5, Math.floor((blockH - tagH - 26) / 46)));
    const rowH = Math.min(62, (blockH - tagH - 26) / perGroup);
    shown.forEach((group, gi) => {
      const y = LIST_TOP + gi * blockH;
      drawTag(ctx, group.title.toUpperCase(), SIDE, y + 4, theme);
      group.leaders.slice(0, perGroup).forEach((entry, i) => drawRow(ctx, entry, i + 1, y + tagH + 14 + i * rowH, rowH, group.unitLabel, i === 0, theme));
    });
  }

  drawFooter(ctx, [logo, "statsthread", leagueLogo], [leagueName, footnote].filter(Boolean).join("  ·  "));
  return canvas;
}

export async function generateLeaderListCardBlob(opts: LeaderListCardOptions): Promise<Blob | null> {
  return canvasToBlob(await renderLeaderListCard(opts));
}
