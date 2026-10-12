/**
 * Team of the Week card (1080×1350), drawn on a canvas in the shared Swish Social
 * look (see cardStyle.ts). The five players stand side by side as one band of
 * photos that melt into each other and into the card, rather than five boxed
 * panels; each has their name, headline stats and game score underneath.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { WeeklyAward, WeeklyCardBrand } from "@/types/weeklyAwards";
import {
  cleanTeamLabel,
  drawBackdrop,
  drawCrest,
  drawGlow,
  drawHeader,
  drawRingedCrest,
  drawSpaced,
  drawVignette,
  meltPhoto,
  splitName,
  themeFor,
  type CardStyle,
  type Theme,
} from "@/lib/cardStyle";
import {
  CARD_H,
  CARD_W,
  DEFAULT_FRAMING,
  DEFAULT_HEAD_LINE,
  GUESSED_HEAD,
  capHeight,
  drawFooter,
  drawTextTop,
  ensureDisplayFont,
  fetchImg,
  fitSize,
  headlineStats,
  initialsOf,
  placeInFrame,
  withAlpha,
  type FramingMap,
  type HeadMap,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

export type TeamCardOptions = {
  /** Which of the three looks to draw; defaults to `league`. */
  style?: CardStyle;
  framing?: FramingMap;
  showGameScore?: boolean;
  /** Marked face positions by player_id; unmarked players use a guess. */
  heads?: HeadMap;
  alignHeads?: boolean;
  headLine?: number;
  /** Shown in the banner under the title, e.g. "5 Oct – 11 Oct". */
  weekLabel?: string;
  /** Club logos by player_id, for the crest under each photo. */
  teamLogoUrls?: Record<string, string | null | undefined>;
};

const FRAME_TOP = 236;
// Room above the photos for their haze to climb behind the header.
const RISE = 130;
// How far each photo reaches into its neighbours' columns, where the two cross-fade.
const OVERLAP = 34;

/** Which player's column a card-space x coordinate falls in (for click-to-select). */
export function teamPanelIndexAt(cardX: number, count: number): number | null {
  if (count < 1 || cardX < 0 || cardX > CARD_W) return null;
  return Math.min(count - 1, Math.floor((cardX / CARD_W) * count));
}

/**
 * One player's photo, worked into the card (see meltPhoto). It fills its column and a
 * little of each neighbour's, cross-fading with them, rises as a haze behind the header
 * and sinks away towards the player's name. Returns whether the head reached the shared line.
 */
function drawColumnPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  index: number,
  count: number,
  frameH: number,
  o: Parameters<typeof placeInFrame>[3],
  theme: Theme,
): boolean {
  const cw = CARD_W / count;
  const w = cw + OVERLAP * 2;
  const H = RISE + frameH;
  const placed = placeInFrame(img, w, frameH, o);
  const rect = {
    left: placed.left,
    top: RISE + placed.top,
    dw: img.naturalWidth * placed.scale,
    dh: img.naturalHeight * placed.scale,
  };
  const seam = OVERLAP * 2;

  const photo = meltPhoto(img, w, H, rect, RISE - 30, theme, (l) => {
    // Shadow gathers along the seams with the neighbouring photos and at the players' feet.
    const edge = seam + 40;
    const side = (from: number, to: number) => {
      const g = l.createLinearGradient(from, 0, to, 0);
      g.addColorStop(0, withAlpha(theme.shadow, 0.6));
      g.addColorStop(1, withAlpha(theme.shadow, 0));
      l.fillStyle = g;
      l.fillRect(0, 0, w, H);
    };
    side(0, edge);
    side(w, w - edge);
    const sink = l.createLinearGradient(0, RISE + frameH * 0.5, 0, H);
    sink.addColorStop(0, withAlpha(theme.shadow, 0));
    sink.addColorStop(1, withAlpha(theme.shadow, 0.7));
    l.fillStyle = sink;
    l.fillRect(0, 0, w, H);
  });

  const l = photo.ctx;
  photo.fade(l.createLinearGradient(0, 0, 0, RISE + 80));
  photo.fade(l.createLinearGradient(0, H, 0, H - frameH * 0.36));
  // The outer photos run off the card; every other side cross-fades with its neighbour.
  if (index > 0) photo.fade(l.createLinearGradient(0, 0, seam, 0));
  if (index < count - 1) photo.fade(l.createLinearGradient(w, 0, w - seam, 0));

  ctx.drawImage(photo.canvas, index * cw - OVERLAP, FRAME_TOP - RISE);
  return placed.aligned;
}

const fmtGameScore = (v: number | null) => (v == null ? "—" : Number(v).toFixed(1));

export async function renderTeamOfTheWeek(
  awards: WeeklyAward[],
  brand: WeeklyCardBrand,
  options: TeamCardOptions = {},
): Promise<{ canvas: HTMLCanvasElement; unaligned: string[] }> {
  const {
    style = "league",
    framing = {},
    showGameScore = true,
    heads = {},
    alignHeads = true,
    headLine = DEFAULT_HEAD_LINE,
    weekLabel = "",
    teamLogoUrls = {},
  } = options;
  const unaligned: string[] = [];
  await ensureDisplayFont();
  const [logo, leagueLogo, ...images] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(brand.leagueLogoUrl),
    ...awards.map((a) => fetchImg(a.photoUrl)),
    ...awards.map((a) => fetchImg(teamLogoUrls[a.player_id])),
  ]);
  const photos = images.slice(0, awards.length);
  const crests = images.slice(awards.length);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const theme = themeFor(style, brand.primaryHex);

  const count = Math.max(1, awards.length);
  const cw = CARD_W / count;
  // Without the game score there's room for taller photos.
  const frameBottom = showGameScore ? 886 : 990;
  const frameH = frameBottom - FRAME_TOP;

  drawBackdrop(ctx, theme, leagueLogo, { x: CARD_W / 2, y: FRAME_TOP + 18 });
  drawGlow(ctx, CARD_W / 2, FRAME_TOP + frameH * 0.42, 760, theme.accent, theme.glow * 0.8, 0.62);

  // ── the players: a photo each, else their club's crest ──
  awards.forEach((a, i) => {
    const photo = photos[i];
    if (photo) {
      const aligned = drawColumnPhoto(
        ctx, photo, i, count, frameH,
        {
          framing: framing[a.player_id] ?? DEFAULT_FRAMING,
          head: alignHeads ? heads[a.player_id] ?? GUESSED_HEAD : null,
          headLine,
          focusY: a.photoFocusY ?? 50,
        },
        theme,
      );
      if (!aligned) unaligned.push(a.player_id);
    } else {
      drawRingedCrest(ctx, i * cw + cw / 2, FRAME_TOP + frameH * 0.42, Math.min(96, cw * 0.34), crests[i], initialsOf(a.full_name), theme);
    }
  });
  drawVignette(ctx, theme);

  drawHeader(ctx, "TEAM OF THE WEEK", weekLabel, brand.leagueName, theme);

  // ── under each photo: club crest, name, headline stats, game score ──
  const maxW = cw - 26;
  const names = awards.map((a) => splitName(a.full_name));
  // One size for every surname (and every given name), so the row reads as a set. A name too long
  // for that size shrinks on its own rather than dragging the others down with it.
  const familyFits = names.map(([, family]) => fitSize(ctx, family, maxW, 46, 16, 700));
  const givenFits = names.map(([given]) => (given ? fitSize(ctx, given, maxW - 16, 22, 12, 400) : 22));
  const familySize = Math.max(32, Math.min(...familyFits));
  const givenSize = Math.max(17, Math.min(...givenFits));
  const givenCap = capHeight(ctx, { size: givenSize });
  const familyCap = capHeight(ctx, { size: familySize, weight: 700 });
  const numOpts: TextOpts = { size: 42, weight: 600, align: "center" };
  const numCap = capHeight(ctx, numOpts);
  const lblOpts: TextOpts = { size: 19, alpha: 0.72, align: "center" };
  const lblCap = capHeight(ctx, lblOpts);
  const gsLblOpts: TextOpts = { size: 17, weight: 500, alpha: 0.74, align: "center" };
  const gsLblCap = capHeight(ctx, gsLblOpts);
  const gsOpts: TextOpts = { size: 54, weight: 700, color: theme.rank, align: "center" };

  const givenTop = frameBottom + 42;
  const familyTop = givenTop + givenCap + 11;
  const numTop = familyTop + familyCap + 30;
  const lblTop = numTop + numCap + 11;
  const gsLblTop = lblTop + lblCap + 30;
  const gsTop = gsLblTop + gsLblCap + 13;
  const blockBottom = showGameScore ? gsTop + capHeight(ctx, gsOpts) : lblTop + lblCap;

  // Hairlines between the columns, tailing off at both ends.
  for (let i = 1; i < count; i += 1) {
    const line = ctx.createLinearGradient(0, frameBottom + 30, 0, blockBottom + 6);
    line.addColorStop(0, "rgba(255,255,255,0)");
    line.addColorStop(0.18, "rgba(255,255,255,0.17)");
    line.addColorStop(0.82, "rgba(255,255,255,0.17)");
    line.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = line;
    ctx.fillRect(i * cw - 0.75, frameBottom + 30, 1.5, blockBottom + 6 - (frameBottom + 30));
  }

  awards.forEach((a, i) => {
    const cx = i * cw + cw / 2;
    const [given, family] = names[i];

    drawCrest(ctx, cx, frameBottom - 2, 26, crests[i], initialsOf(cleanTeamLabel(a.team_name)), theme);

    if (given) {
      const o: TextOpts = { size: Math.min(givenSize, givenFits[i]), alpha: 0.88, align: "center" };
      drawSpaced(ctx, given, cx, givenTop + (givenCap - capHeight(ctx, o)) / 2, 1.5, o);
    }
    const familyOpts: TextOpts = { size: Math.min(familySize, familyFits[i]), weight: 700, align: "center" };
    drawTextTop(ctx, family, cx, familyTop + (familyCap - capHeight(ctx, familyOpts)) / 2, familyOpts);

    const stats = headlineStats(a);
    const cell = Math.min(80, Math.floor((cw - 12) / 3));
    const startX = cx - (cell * stats.length) / 2;
    stats.forEach((s, idx) => {
      const sx = startX + idx * cell + cell / 2;
      drawTextTop(ctx, String(s.value), sx, numTop, numOpts);
      drawTextTop(ctx, s.label, sx, lblTop, lblOpts);
      if (idx < stats.length - 1) drawTextTop(ctx, "|", startX + (idx + 1) * cell, lblTop, { size: 19, alpha: 0.4, align: "center" });
    });

    if (showGameScore) {
      drawSpaced(ctx, "GAME SCORE", cx, gsLblTop, 2, gsLblOpts);
      drawTextTop(ctx, fmtGameScore(a.game_score), cx, gsTop, gsOpts);
    }
  });

  drawFooter(ctx, [logo, "statsthread", leagueLogo], brand.leagueName);
  return { canvas, unaligned };
}
