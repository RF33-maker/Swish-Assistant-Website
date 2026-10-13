/**
 * The downloadable cards on a player's profile (1080×1350), drawn on a canvas in the
 * shared Swish Social look (see cardStyle.ts) and coloured for the player's club:
 * season averages and shooting splits as stat tiles under the player's photo, and the
 * shot chart on a half court.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import { COURT_GEOMETRY, projectShot, type ShotData } from "@/components/ShotChart";
import {
  SIDE,
  cleanTeamLabel,
  drawBackdrop,
  drawCrest,
  drawFace,
  drawGlow,
  drawHeader,
  drawRingedCrest,
  drawSpaced,
  drawVignette,
  fitLines,
  spacedWidth,
  splitName,
  themeFor,
  type Theme,
} from "@/lib/cardStyle";
import { drawHeroPhoto, drawTextShade } from "@/lib/generateLeadersCards";
import {
  CARD_H,
  CARD_W,
  DEFAULT_FRAMING,
  canvasToBlob,
  capHeight,
  drawFooter,
  drawTextTop,
  ensureDisplayFont,
  fetchImg,
  fitSize,
  initialsOf,
  withAlpha,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

export type ProfileCardPlayer = {
  name: string;
  team: string;
  photoUrl?: string | null;
  /** Where the face sits down the photo (0–100), as set on the profile banner. */
  photoFocusY?: number | null;
  teamLogoUrl?: string | null;
  /** The club's colour; any CSS hex or rgb() value. */
  primaryColor?: string | null;
};

/** "rgb(12, 34, 56)" or "#abc" -> "#0c2238"; the cards' colour sums want six-digit hex. */
export function toHex(colour: string | null | undefined, fallback = "#f97316"): string {
  const c = (colour || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("")}`;
  return fallback;
}

type Frame = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  theme: Theme;
  photo: HTMLImageElement | null;
  crest: HTMLImageElement | null;
  finish: (footnote?: string) => void;
};

/** The backdrop, header and footer every profile card shares, in the club's colour with its crest behind the title. */
async function startCard(player: ProfileCardPlayer, title: string, banner: string): Promise<Frame> {
  await ensureDisplayFont();
  const [logo, photo, crest] = await Promise.all([fetchImg(swishLogoSrc), fetchImg(player.photoUrl), fetchImg(player.teamLogoUrl)]);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const theme = themeFor("league", toHex(player.primaryColor));
  const team = cleanTeamLabel(player.team);
  drawBackdrop(ctx, theme, crest, { x: CARD_W / 2, y: 0 });
  return {
    canvas,
    ctx,
    theme,
    photo,
    crest,
    finish: (footnote) => {
      drawHeader(ctx, title, banner, team, theme);
      drawFooter(ctx, [logo, "statsthread", crest], [team, footnote].filter(Boolean).join("  ·  "));
    },
  };
}

// ── stat tiles: season averages, shooting splits ─────────────────────────────

export type StatTile = {
  label: string;
  /** As shown, e.g. "27.4" or "48.1%". */
  value: string;
  /** League rank in this stat, where there is one. */
  rank?: number | null;
  /** 0–1, for a bar under the value (percentages). */
  fill?: number | null;
};

export type StatTilesCardOptions = {
  player: ProfileCardPlayer;
  /** The card's headline, e.g. "SEASON AVERAGES". */
  title: string;
  /** The line under it, e.g. the competition the numbers are from. */
  banner: string;
  /** Three tiles make one tall row; six make two rows. */
  tiles: StatTile[];
  games?: number | null;
};

const HERO_TOP = 236;
const HERO_BOTTOM = 812;
const TILES_TOP = 834;
const TILES_BOTTOM = 1196;

function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] ?? "TH";
  return `${n}${suffix}`;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The player's name and club, set to the right of the photo. */
function drawNameBlock(ctx: CanvasRenderingContext2D, player: ProfileCardPlayer, crest: HTMLImageElement | null, games: number | null | undefined, theme: Theme) {
  const x = 590;
  const maxW = CARD_W - SIDE - x;
  const [given, family] = splitName(player.name);
  const name = fitLines(ctx, family, maxW, 124, 34, 700);
  const nameCap = capHeight(ctx, { size: name.size, weight: 700 });
  const nameGap = Math.round(name.size * 0.3);
  const givenSize = given ? fitSize(ctx, given, maxW, Math.max(24, Math.min(46, Math.round(name.size * 0.44))), 18, 400) : 0;
  const givenCap = given ? capHeight(ctx, { size: givenSize }) : 0;
  const team = cleanTeamLabel(player.team).toUpperCase();
  const blockH = (given ? givenCap + 18 : 0) + name.lines.length * nameCap + (name.lines.length - 1) * nameGap + 30 + 50;
  let y = Math.round(HERO_TOP + (HERO_BOTTOM - HERO_TOP - blockH) / 2);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 4;
  if (given) {
    drawSpaced(ctx, given, x, y, 2, { size: givenSize, alpha: 0.92 });
    y += givenCap + 18;
  }
  name.lines.forEach((line, i) => {
    drawTextTop(ctx, line, x, y, { size: name.size, weight: 700 });
    y += nameCap + (i < name.lines.length - 1 ? nameGap : 0);
  });
  y += 30;
  let textX = x;
  if (team) {
    drawCrest(ctx, x + 25, y + 25, 25, crest, initialsOf(team), theme);
    textX = x + 64;
  }
  const gamesText = games ? `${games} ${games === 1 ? "GAME" : "GAMES"}` : "";
  const meta = [team, gamesText].filter(Boolean).join("  ·  ");
  const o: TextOpts = { size: 25, weight: 500, alpha: 0.88 };
  if (spacedWidth(ctx, meta, 1.5, o) > CARD_W - SIDE - textX) o.size = fitSize(ctx, meta, CARD_W - SIDE - textX - 10, 25, 15, 500);
  drawSpaced(ctx, meta, textX, y + (50 - capHeight(ctx, o)) / 2, 1.5, o);
  ctx.restore();
}

function drawTiles(ctx: CanvasRenderingContext2D, tiles: StatTile[], theme: Theme) {
  const cols = 3;
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  const gap = 16;
  const w = (CARD_W - SIDE * 2 - gap * (cols - 1)) / cols;
  const h = (TILES_BOTTOM - TILES_TOP - gap * (rows - 1)) / rows;
  const tall = rows === 1;

  tiles.forEach((tile, i) => {
    const x = SIDE + (i % cols) * (w + gap);
    const y = TILES_TOP + Math.floor(i / cols) * (h + gap);
    ctx.save();
    roundedRect(ctx, x, y, w, h, 20);
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const pad = tall ? 28 : 22;
    let ty = y + pad;
    ty += drawSpaced(ctx, tile.label.toUpperCase(), x + pad, ty, 3, { size: tall ? 26 : 21, weight: 600, alpha: 0.7 }) + (tall ? 30 : 18);
    const valueSize = fitSize(ctx, tile.value, w - pad * 2, tall ? 128 : 88, 44, 700);
    ty += drawTextTop(ctx, tile.value, x + pad - valueSize * 0.03, ty, { size: valueSize, weight: 700 }) + (tall ? 32 : 0);

    if (tall && tile.fill != null) {
      const trackW = w - pad * 2;
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(x + pad, ty, trackW, 14);
      ctx.fillStyle = theme.accent;
      ctx.fillRect(x + pad, ty, trackW * Math.max(0, Math.min(1, tile.fill)), 14);
    }
    if (tile.rank) {
      const rank: TextOpts = { size: tall ? 23 : 18, weight: 600, color: theme.accent };
      drawSpaced(ctx, `${ordinal(tile.rank)} IN THE LEAGUE`, x + pad, y + h - pad - capHeight(ctx, rank), 2, rank);
    }
  });
}

export async function renderStatTilesCard(opts: StatTilesCardOptions): Promise<HTMLCanvasElement> {
  const { player, title, banner, tiles, games } = opts;
  const { canvas, ctx, theme, photo, crest, finish } = await startCard(player, title, banner);

  // The player's photo melts into the card on the left, as on the leaders cards; without one their club's crest stands in.
  if (photo) {
    drawGlow(ctx, 300, 520, 560, theme.accent, theme.glow);
    drawHeroPhoto(ctx, photo, player.photoFocusY ?? 30, DEFAULT_FRAMING, theme);
    drawTextShade(ctx);
  } else {
    drawRingedCrest(ctx, 300, (HERO_TOP + HERO_BOTTOM) / 2 + 4, 178, crest, initialsOf(player.name), theme);
  }
  drawVignette(ctx, theme);
  drawNameBlock(ctx, player, crest, games, theme);
  drawTiles(ctx, tiles.slice(0, 6), theme);
  finish();
  return canvas;
}

export async function generateStatTilesCardBlob(opts: StatTilesCardOptions): Promise<Blob | null> {
  return canvasToBlob(await renderStatTilesCard(opts));
}

// ── shot chart ───────────────────────────────────────────────────────────────

export type ShotChartCardOptions = {
  player: ProfileCardPlayer;
  shots: ShotData[];
  /** The line under the title, e.g. "Full season" or "vs Solent · 10 Oct". */
  banner: string;
};

const COURT_TOP = 432;
const COURT_BOTTOM = 1196;

function drawCourt(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, theme: Theme) {
  const g = COURT_GEOMETRY;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  roundedRect(ctx, 0, 0, g.width, g.height, 8);
  ctx.fillStyle = "rgba(0,0,0,0.36)";
  ctx.fill();
  ctx.clip();

  ctx.fillStyle = withAlpha(theme.accent, 0.14);
  ctx.fillRect(g.paintLeft, 0, g.paintWidth, g.paintBottom);

  const line = "rgba(255,255,255,0.62)";
  const soft = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2.2 / k;
  ctx.strokeStyle = line;
  ctx.beginPath();
  ctx.rect(g.paintLeft, 0, g.paintWidth, g.paintBottom);
  // Free-throw circle: solid on the basket side and dashed beyond it, as the chart on the page draws it.
  ctx.moveTo(g.centerX - g.freeThrowR, g.paintBottom);
  ctx.arc(g.centerX, g.paintBottom, g.freeThrowR, Math.PI, Math.PI * 2);
  // Three-point line: down each corner, then the arc between them.
  const sweep = Math.atan2(g.cornerEndY - g.basketY, g.cornerRightX - g.centerX);
  ctx.moveTo(g.cornerRightX, 0);
  ctx.lineTo(g.cornerRightX, g.cornerEndY);
  ctx.arc(g.centerX, g.basketY, g.threeR, sweep, Math.PI - sweep);
  ctx.lineTo(g.cornerLeftX, 0);
  // Rim.
  ctx.moveTo(g.centerX + g.rimR, g.basketY);
  ctx.arc(g.centerX, g.basketY, g.rimR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = soft;
  ctx.beginPath();
  ctx.moveTo(g.centerX + g.restrictedR, g.basketY);
  ctx.arc(g.centerX, g.basketY, g.restrictedR, 0, Math.PI);
  ctx.moveTo(g.centerX + 60, g.height);
  ctx.arc(g.centerX, g.height, 60, 0, Math.PI, true);
  ctx.stroke();
  ctx.save();
  ctx.setLineDash([5 / k, 5 / k]);
  ctx.beginPath();
  ctx.arc(g.centerX, g.paintBottom, g.freeThrowR, 0, Math.PI);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = line;
  ctx.lineWidth = 3.4 / k;
  ctx.beginPath();
  ctx.moveTo(g.centerX - g.backboardHalf, g.backboardY);
  ctx.lineTo(g.centerX + g.backboardHalf, g.backboardY);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, x, y, g.width * k, g.height * k, 8 * k);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();
}

export async function renderShotChartCard(opts: ShotChartCardOptions): Promise<HTMLCanvasElement> {
  const { player, shots, banner } = opts;
  const { canvas, ctx, theme, photo, crest, finish } = await startCard(player, "SHOT CHART", banner);
  drawVignette(ctx, theme);

  // ── who, and how they shot ──
  const faceR = 74;
  const faceX = SIDE + faceR + 4;
  const faceY = 320;
  if (photo) drawFace(ctx, photo, faceX, faceY, faceR, theme.accent);
  else drawCrest(ctx, faceX, faceY, faceR, crest, initialsOf(player.name), theme);

  const plotted = shots.map((shot) => ({ shot, at: projectShot(shot) }));
  const isThree = (zone: string) => zone.endsWith("3");
  const tally = (list: typeof plotted) => {
    const made = list.filter((p) => p.shot.success).length;
    return { made, total: list.length, pct: list.length ? `${((made / list.length) * 100).toFixed(1)}%` : "—" };
  };
  const splits = [
    { label: "FIELD GOALS", ...tally(plotted) },
    { label: "TWOS", ...tally(plotted.filter((p) => !isThree(p.at.zone))) },
    { label: "THREES", ...tally(plotted.filter((p) => isThree(p.at.zone))) },
  ];

  const textX = faceX + faceR + 30;
  const nameText = player.name.toUpperCase();
  const nameSize = fitSize(ctx, nameText, CARD_W - SIDE - textX, 58, 28, 700);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 16;
  const nameCap = drawTextTop(ctx, nameText, textX, faceY - faceR + 6, { size: nameSize, weight: 700 });
  ctx.restore();
  const colW = (CARD_W - SIDE - textX) / splits.length;
  splits.forEach((s, i) => {
    const x = textX + i * colW;
    let y = faceY - faceR + 6 + nameCap + 26;
    y += drawSpaced(ctx, s.label, x, y, 2.5, { size: 17, weight: 500, alpha: 0.62 }) + 12;
    const cap = drawTextTop(ctx, s.pct, x, y, { size: 44, weight: 700, color: i === 0 ? theme.accent : "#ffffff" });
    drawSpaced(ctx, `${s.made}/${s.total}`, x, y + cap + 10, 1.5, { size: 19, weight: 500, alpha: 0.7 });
  });

  // ── the court ──
  const g = COURT_GEOMETRY;
  const k = Math.min((COURT_BOTTOM - COURT_TOP) / g.height, (CARD_W - SIDE * 2) / g.width);
  const courtX = (CARD_W - g.width * k) / 2;
  drawCourt(ctx, courtX, COURT_TOP, k, theme);

  const r = plotted.length > 250 ? 6 : plotted.length > 120 ? 8 : 10;
  ctx.save();
  // Misses first, so the makes sit on top where the two crowd.
  for (const made of [false, true]) {
    for (const p of plotted) {
      if (p.shot.success !== made) continue;
      const x = courtX + p.at.sx * k;
      const y = COURT_TOP + p.at.sy * k;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (made) {
        ctx.fillStyle = theme.accent;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Misses stay faint, so the makes read first whatever the club's colour.
        ctx.strokeStyle = "rgba(255,255,255,0.38)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // ── key, tucked into the bottom corner of the court ──
  const keyY = COURT_BOTTOM - 34;
  const keyX = courtX + 26;
  ctx.save();
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(keyX, keyY, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.beginPath();
  ctx.arc(keyX + 130, keyY, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const key: TextOpts = { size: 18, weight: 500, alpha: 0.85 };
  const keyCap = capHeight(ctx, key);
  drawSpaced(ctx, "MADE", keyX + 20, keyY - keyCap / 2, 2, key);
  drawSpaced(ctx, "MISSED", keyX + 150, keyY - keyCap / 2, 2, key);

  if (plotted.length === 0) {
    drawSpaced(ctx, "NO SHOTS RECORDED", CARD_W / 2, COURT_TOP + (COURT_BOTTOM - COURT_TOP) / 2, 3, { size: 28, weight: 500, align: "center", alpha: 0.6 });
  }

  finish(`${plotted.length} shot${plotted.length === 1 ? "" : "s"}`);
  return canvas;
}

export async function generateShotChartCardBlob(opts: ShotChartCardOptions): Promise<Blob | null> {
  return canvasToBlob(await renderShotChartCard(opts));
}
