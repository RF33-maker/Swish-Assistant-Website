/**
 * Player / Team league leaders cards (1080×1350), drawn on a canvas in the same
 * style as the Team and Player of the Week cards: the leader's photo (or club logo)
 * on the left, the top five on the right.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { Leader } from "@/types/leaders";
import type { WeeklyCardBrand } from "@/types/weeklyAwards";
import {
  CARD_H,
  CARD_W,
  DEFAULT_FRAMING,
  DISPLAY,
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
  withAlpha,
  capHeight,
  type PhotoFraming,
} from "@/lib/generateWeeklyCards";

export type LeadersCardOptions = {
  kind: "player" | "team";
  /** Headline under the card title, e.g. "Points Per Game". */
  categoryTitle: string;
  /** Unit tag shown under the leader's number, e.g. "PPG". */
  unit: string;
  leaders: Leader[];
  brand: WeeklyCardBrand;
  /** Team leaders: each leader's club logo, in the same order as `leaders`. */
  teamLogoUrls?: (string | null)[];
  /** Player leaders: how the #1 player's photo is framed in its panel. */
  framing?: PhotoFraming;
};

/** "Birmingham City University Senior Men" -> "Birmingham City University" (same as the site's carousels). */
export function cleanTeamLabel(name: string | null): string {
  return (name || "").replace(/\s+Senior\s+(Men|Women)\b/gi, "").replace(/\s+I\s*$/, "").replace(/\s+/g, " ").trim();
}

const PANEL_X = 40;
const PANEL_W = 360;
const LIST_X = 430;
const LIST_R = CARD_W - 40;
const BODY_TOP = 236;
const BODY_BOTTOM = 1150;

export async function renderLeadersCard(opts: LeadersCardOptions): Promise<HTMLCanvasElement> {
  const { kind, categoryTitle, unit, leaders, brand, teamLogoUrls = [], framing = DEFAULT_FRAMING } = opts;
  await ensureDisplayFont();

  const top = leaders.slice(0, 5);
  const [logo, leagueLogo, heroPhoto, heroLogo, ...rowLogos] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(brand.leagueLogoUrl),
    kind === "player" ? fetchImg(top[0]?.photoUrl) : Promise.resolve(null),
    kind === "team" ? fetchImg(teamLogoUrls[0]) : Promise.resolve(null),
    ...top.map((_, i) => (kind === "team" ? fetchImg(teamLogoUrls[i]) : Promise.resolve(null))),
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
  const title = kind === "player" ? "PLAYER LEADERS" : "TEAM LEADERS";
  const titleSize = fitSize(ctx, title, 900, 104, 60, 700);
  const titleCap = drawTextTop(ctx, title, CARD_W / 2, 20, { size: titleSize, weight: 700, align: "center" });
  const catText = categoryTitle.toUpperCase();
  const catSize = fitSize(ctx, catText, 940, 58, 30, 600);
  const catCap = drawTextTop(ctx, catText, CARD_W / 2, 20 + titleCap + 14, { size: catSize, weight: 600, align: "center", alpha: 0.95 });
  drawTextTop(ctx, brand.leagueName, CARD_W / 2, 20 + titleCap + 14 + catCap + 12, { size: 32, alpha: 0.85, align: "center" });

  // ── hero panel: the #1 player's photo, or the #1 club's logo ──
  const panelH = BODY_BOTTOM - BODY_TOP;
  ctx.save();
  ctx.beginPath();
  ctx.rect(PANEL_X, BODY_TOP, PANEL_W, panelH);
  ctx.clip();
  const bg = ctx.createLinearGradient(PANEL_X, BODY_TOP, PANEL_X + PANEL_W, BODY_TOP + panelH);
  bg.addColorStop(0, shade(brand.primaryHex, -0.1));
  bg.addColorStop(1, shade(brand.primaryHex, -0.6));
  ctx.fillStyle = bg;
  ctx.fillRect(PANEL_X, BODY_TOP, PANEL_W, panelH);
  if (kind === "player" && heroPhoto) {
    const placed = placeInFrame(heroPhoto, PANEL_W, panelH, {
      framing,
      head: null,
      headLine: 26,
      focusY: top[0]?.photoFocusY ?? 30,
    });
    ctx.drawImage(
      heroPhoto,
      PANEL_X + placed.left,
      BODY_TOP + placed.top,
      heroPhoto.naturalWidth * placed.scale,
      heroPhoto.naturalHeight * placed.scale,
    );
  } else if (kind === "team" && heroLogo) {
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(PANEL_X, BODY_TOP, PANEL_W, panelH);
    drawContain(ctx, heroLogo, PANEL_X + 40, BODY_TOP + panelH / 2 - (PANEL_W - 80) / 2, PANEL_W - 80, PANEL_W - 80);
  } else if (top[0]) {
    drawTextTop(ctx, initialsOf(top[0].name), PANEL_X + PANEL_W / 2, BODY_TOP + panelH * 0.3, {
      size: 150, weight: 700, alpha: 0.22, align: "center",
    });
  }
  ctx.fillStyle = verticalGradient(ctx, BODY_TOP, BODY_TOP + panelH, [[0.6, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.7)"]]);
  ctx.fillRect(PANEL_X, BODY_TOP, PANEL_W, panelH);
  drawTextTop(ctx, "LEAGUE LEADER", PANEL_X + PANEL_W / 2, BODY_TOP + panelH - 60, {
    size: 30, weight: 600, align: "center", alpha: 0.95,
  });
  ctx.restore();

  // ── the top five ──
  const rowH = panelH / 5;
  top.forEach((leader, i) => {
    const y = BODY_TOP + i * rowH;
    const isLeader = i === 0;

    if (isLeader) {
      ctx.fillStyle = withAlpha(accent, 0.16);
      ctx.beginPath();
      ctx.roundRect(LIST_X - 12, y + 6, LIST_R - LIST_X + 24, rowH - 12, 14);
      ctx.fill();
    } else if (i > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(LIST_X, y, LIST_R - LIST_X, 1.5);
    }

    const midY = y + rowH / 2;
    const numOpts = { size: isLeader ? 84 : 66, weight: 700, color: isLeader ? accent : "#fff", alpha: isLeader ? 1 : 0.55, align: "center" as const };
    const numCap = capHeight(ctx, numOpts);
    drawTextTop(ctx, String(leader.rank), LIST_X + 34, midY - numCap / 2, numOpts);

    const logoImg = rowLogos[i];
    let nameX = LIST_X + 92;
    if (kind === "team" && logoImg) {
      drawContain(ctx, logoImg, nameX, midY - 34, 68, 68);
      nameX += 84;
    }

    const valueOpts = { size: isLeader ? 92 : 62, weight: 700, color: "#fff", align: "right" as const };
    ctx.font = `${valueOpts.weight} ${valueOpts.size}px ${DISPLAY}`;
    const valueW = ctx.measureText(leader.display).width;
    const valueCap = capHeight(ctx, valueOpts);
    const valueTop = isLeader ? midY - valueCap / 2 - 14 : midY - valueCap / 2;
    drawTextTop(ctx, leader.display, LIST_R - 6, valueTop, valueOpts);
    if (isLeader) {
      drawTextTop(ctx, unit, LIST_R - 6, valueTop + valueCap + 12, { size: 30, weight: 600, color: accent, align: "right" });
    }

    const nameMax = LIST_R - 6 - valueW - 24 - nameX;
    const display = kind === "team" ? cleanTeamLabel(leader.name) : leader.name;
    const nameSize = fitSize(ctx, display, nameMax, isLeader ? 50 : 42, 22, 500);
    const nameCap = capHeight(ctx, { size: nameSize, weight: 500 });
    const teamLine =
      kind === "player" ? `${cleanTeamLabel(leader.team_name)}  ·  ${leader.games} GP` : `${leader.games} GP`;
    const teamSize = fitSize(ctx, teamLine, nameMax, 26, 18, 400);
    const teamCap = capHeight(ctx, { size: teamSize });
    const blockH = nameCap + 12 + teamCap;
    const nameTop = midY - blockH / 2;
    drawTextTop(ctx, display, nameX, nameTop, { size: nameSize, weight: 500 });
    drawTextTop(ctx, teamLine, nameX, nameTop + nameCap + 12, { size: teamSize, alpha: 0.7 });
  });

  drawFooter(ctx, [logo, "statsthread", leagueLogo], brand.leagueName);
  return canvas;
}
