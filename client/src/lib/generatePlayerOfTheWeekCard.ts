/**
 * Player of the Week card (1080×1350), drawn on a canvas in the shared Swish Social
 * look (see cardStyle.ts). The player's photo runs the full width of the card and
 * melts into it above and below; their club, the game, their name, stat line and
 * Swish Score sit over its lower half.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { WeeklyAward, WeeklyCardBrand } from "@/types/weeklyAwards";
import {
  SIDE,
  cleanTeamLabel,
  drawBackdrop,
  drawCrest,
  drawGlow,
  drawHeader,
  drawRingedCrest,
  drawSpaced,
  drawVignette,
  meltPhoto,
  themeFor,
  type CardStyle,
  type Theme,
} from "@/lib/cardStyle";
import {
  CARD_H,
  CARD_W,
  DEFAULT_FRAMING,
  DEFAULT_TINT,
  capHeight,
  drawContain,
  drawFooter,
  drawTextTop,
  ensureDisplayFont,
  fetchImg,
  fitSize,
  fmtGameScore,
  initialsOf,
  setFont,
  withAlpha,
  type PhotoFraming,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

export type PlayerCardOptions = {
  /** Which of the three looks to draw; defaults to `league`. */
  style?: CardStyle;
  /** The player's club logo. */
  teamLogoUrl?: string | null;
  framing?: PhotoFraming;
  /** How much of the card's colour washes over the photo (0–100); `DEFAULT_TINT` is each look's own grade. */
  tint?: number;
  showGameScore?: boolean;
  /** Shown in the banner under the title, e.g. "5 Oct – 11 Oct". */
  weekLabel?: string;
};

const PHOTO_TOP = 196;
// Room above the photo for its haze to climb behind the header.
const RISE = 150;

const splitStat = (made: number | null, att: number | null) => (made == null || att == null ? "—" : `${made}/${att}`);

/**
 * The player's photo, worked into the card (see meltPhoto). It runs off both sides of the
 * card, rises as a haze behind the header and sinks away under the player's name. The photo
 * is free to be zoomed out or nudged: any edge of it that comes into view melts away too.
 */
function drawHeroPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, focusY: number, framing: PhotoFraming, theme: Theme) {
  const w = CARD_W;
  const h = CARD_H - PHOTO_TOP;
  const H = RISE + h;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * framing.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const left = (w - dw) / 2 + (framing.x / 100) * w;
  const top = RISE + (h - dh) * (Math.max(0, Math.min(100, focusY)) / 100) + (framing.y / 100) * h;
  const right = left + dw;
  const bottom = top + dh;

  const poolX = (left + right) / 2;
  const poolY = RISE + 330;
  const photo = meltPhoto(img, w, H, { left, top, dw, dh }, RISE - 30, theme, (l) => {
    const burn = l.createRadialGradient(poolX, poolY, 360, poolX, poolY, 860);
    burn.addColorStop(0, withAlpha(theme.shadow, 0));
    burn.addColorStop(1, withAlpha(theme.shadow, 0.6));
    l.fillStyle = burn;
    l.fillRect(0, 0, w, H);
    const sink = l.createLinearGradient(0, RISE + 300, 0, RISE + 760);
    sink.addColorStop(0, withAlpha(theme.shadow, 0));
    sink.addColorStop(1, withAlpha(theme.shadow, 0.75));
    l.fillStyle = sink;
    l.fillRect(0, 0, w, H);
  });

  const l = photo.ctx;
  photo.fade(l.createLinearGradient(0, Math.max(0, top - RISE), 0, Math.max(RISE, top) + 90));
  // Gone by the stat line, wherever the photo's own foot is.
  const foot = Math.min(RISE + 800, bottom + 110);
  photo.fade(l.createLinearGradient(0, foot, 0, Math.min(foot, bottom) - 400));
  if (left > 1) photo.fade(l.createLinearGradient(Math.max(0, left - 110), 0, left + w * 0.1, 0));
  if (right < w - 1) photo.fade(l.createLinearGradient(Math.min(w, right + 110), 0, right - w * 0.1, 0));

  ctx.drawImage(photo.canvas, 0, PHOTO_TOP - RISE);
}

/** "W 124-123" in green or "L 71-79" in red, on a dark chip so it reads on any of the looks. */
function drawResult(ctx: CanvasRenderingContext2D, result: string, x: number, top: number, size: number) {
  const o: TextOpts = { size, weight: 500, color: result.startsWith("W") ? "#8ddc74" : "#ff786b" };
  setFont(ctx, o);
  const w = ctx.measureText(result).width;
  const cap = capHeight(ctx, o);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.roundRect(x - 12, top - 9, w + 24, cap + 18, 8);
  ctx.fill();
  drawTextTop(ctx, result, x, top, o);
}

export async function renderPlayerOfTheWeek(
  award: WeeklyAward,
  brand: WeeklyCardBrand,
  options: PlayerCardOptions = {},
): Promise<HTMLCanvasElement> {
  const { style = "league", teamLogoUrl, framing = DEFAULT_FRAMING, tint = DEFAULT_TINT, showGameScore = true, weekLabel = "" } = options;
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
  const look = themeFor(style, brand.primaryHex);
  // The tint slider scales the look's own grade: 0 leaves the photo as shot.
  const theme: Theme = { ...look, photoTint: Math.min(0.85, look.photoTint * (Math.max(0, Math.min(100, tint)) / DEFAULT_TINT)) };

  // In the court style the player stands in the paint, under the basket.
  drawBackdrop(ctx, theme, leagueLogo, { x: CARD_W / 2, y: PHOTO_TOP + 58 });

  if (photo) {
    drawGlow(ctx, CARD_W / 2, 540, 680, theme.accent, theme.glow);
    drawHeroPhoto(ctx, photo, award.photoFocusY ?? 50, framing, theme);
  } else {
    drawRingedCrest(ctx, CARD_W / 2, 470, 178, teamLogo, initialsOf(award.full_name), theme);
  }
  drawVignette(ctx, theme);
  // The competition's logo, faded into the bottom-right behind the Swish Score.
  if (leagueLogo && theme.style === "league") drawContain(ctx, leagueLogo, CARD_W - 430, 905, 520, 520, 0.1);

  drawHeader(ctx, "PLAYER OF THE WEEK", weekLabel, brand.leagueName, theme);

  // ── club, the game, name, stat line ──
  const right = CARD_W - SIDE;
  let y = 748;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 3;

  const club = cleanTeamLabel(award.team_name);
  if (club) {
    drawCrest(ctx, SIDE + 28, y + 20, 28, teamLogo, initialsOf(club), theme);
    const clubX = SIDE + 72;
    const clubOpts: TextOpts = { size: fitSize(ctx, club, right - clubX, 40, 24, 500), weight: 500, alpha: 0.96 };
    drawTextTop(ctx, club, clubX, y + 20 - capHeight(ctx, clubOpts) / 2, clubOpts);
    y += 60;
  }

  const opponent = cleanTeamLabel(award.opponent_name);
  if (opponent) {
    const text = `vs ${opponent}`;
    const size = fitSize(ctx, text, right - SIDE - 220, 32, 20, 400);
    const cap = drawTextTop(ctx, text, SIDE, y, { size, alpha: 0.8 });
    if (award.game_result) {
      setFont(ctx, { size });
      drawResult(ctx, award.game_result, SIDE + ctx.measureText(text).width + 28, y, size);
    }
    y += cap + 26;
  }

  const name = award.full_name.toUpperCase();
  const nameSize = fitSize(ctx, name, right - SIDE, 190, 40, 700);
  y += drawTextTop(ctx, name, SIDE, y, { size: nameSize, weight: 700 }) + 34;

  const headline: [string, number | null][] = [
    ["PTS", award.pts], ["REB", award.reb], ["AST", award.ast], ["STL", award.stl], ["BLK", award.blk],
  ];
  const numOpts: TextOpts = { size: 84, weight: 600, align: "center" };
  const numCap = capHeight(ctx, numOpts);
  headline.forEach(([label, value], i) => {
    const cx = SIDE + 48 + i * 130;
    drawTextTop(ctx, String(value ?? 0), cx, y, numOpts);
    drawTextTop(ctx, label, cx, y + numCap + 12, { size: 26, alpha: 0.8, align: "center" });
  });

  if (showGameScore) {
    const gsX = right - 130;
    drawSpaced(ctx, "SWISH SCORE", gsX, y - 14, 2.5, { size: 22, weight: 500, alpha: 0.82, align: "center" });
    drawTextTop(ctx, fmtGameScore(award.game_score), gsX, y + 30, { size: 110, weight: 700, color: theme.rank, align: "center" });
  }

  y += numCap + 12 + capHeight(ctx, { size: 26 }) + 40;
  const splits: [string, string][] = [
    ["FG", splitStat(award.fgm, award.fga)],
    ["3PT", splitStat(award.tpm, award.tpa)],
    ["FT", splitStat(award.ftm, award.fta)],
  ];
  let sx = SIDE;
  splits.forEach(([label, value]) => {
    drawTextTop(ctx, label, sx, y + 10, { size: 24, alpha: 0.7 });
    setFont(ctx, { size: 24 });
    sx += ctx.measureText(label).width + 12;
    drawTextTop(ctx, value, sx, y, { size: 38, weight: 500, alpha: 0.92 });
    setFont(ctx, { size: 38, weight: 500 });
    sx += ctx.measureText(value).width + 46;
  });
  ctx.restore();

  drawFooter(ctx, [logo, "statsthread", teamLogo, leagueLogo], brand.leagueName);
  return canvas;
}
