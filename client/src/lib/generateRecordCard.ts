/**
 * Single-game record card (1080×1350): the record holder's photo fills most of the
 * card, and the number they own sits along the bottom in an orange glow, with the
 * category, the player and the game it came in. Deliberately plainer than the
 * leaders cards: one player, one number.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { GameRecord } from "@/types/records";
import type { WeeklyCardBrand } from "@/types/weeklyAwards";
import { SIDE, cleanTeamLabel, drawCrest, drawGlow, drawRingedCrest, drawSpaced, fitLines, spacedWidth, splitName, themeFor } from "@/lib/cardStyle";
import {
  CARD_H,
  CARD_W,
  DEFAULT_FRAMING,
  capHeight,
  drawFooter,
  drawTextTop,
  ensureDisplayFont,
  fetchImg,
  fitSize,
  initialsOf,
  setFont,
  DISPLAY,
  type PhotoFraming,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

const ORANGE = "#f97316";
const ORANGE_LIGHT = "#fdba74";
const SWISH_LIGHT = "#fb923c";
const SWISH_DEEP = "#ea580c";
const BACKDROP = "#0b0b0d";
/** The photo's frame: the full width, down to where the stat block takes over. */
const PHOTO_H = 1080;

export type RecordCardOptions = {
  record: GameRecord;
  /** "Most Points in a Game". */
  categoryTitle: string;
  /** "PTS". */
  unit: string;
  brand: WeeklyCardBrand;
  clubLogoUrl?: string | null;
  framing?: PhotoFraming;
  /** Everyone on the record total: more than one player makes it a joint record; one player more than once says how often. */
  holders?: { players: number; games: number };
};

/** "12 Oct 2026" from the game's match time. */
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

/** The photo, cover-fitted to the top of the card and faded into the dark below it. */
function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, focusY: number, framing: PhotoFraming) {
  const w = CARD_W;
  const h = PHOTO_H;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * framing.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const left = (w - dw) / 2 + (framing.x / 100) * w;
  const top = (h - dh) * (Math.max(0, Math.min(100, focusY)) / 100) + (framing.y / 100) * h;

  // Drawn on its own layer so the fade only eats the photo, not the glow behind it.
  const layer = document.createElement("canvas");
  layer.width = w;
  layer.height = h;
  const l = layer.getContext("2d")!;
  l.drawImage(img, left, top, dw, dh);
  l.globalCompositeOperation = "destination-in";
  const fade = l.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.58, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  l.fillStyle = fade;
  l.fillRect(0, 0, w, h);
  ctx.drawImage(layer, 0, 0);
}

/** Shade over the photo: a little at the top for the header, and a deep pool under the stat. */
function drawShade(ctx: CanvasRenderingContext2D) {
  const topShade = ctx.createLinearGradient(0, 0, 0, 260);
  topShade.addColorStop(0, "rgba(0,0,0,0.55)");
  topShade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, CARD_W, 260);

  const low = ctx.createLinearGradient(0, 640, 0, CARD_H);
  low.addColorStop(0, "rgba(11,11,13,0)");
  low.addColorStop(0.45, "rgba(11,11,13,0.78)");
  low.addColorStop(1, "rgba(11,11,13,0.96)");
  ctx.fillStyle = low;
  ctx.fillRect(0, 640, CARD_W, CARD_H - 640);

  // Black rising out of the bottom-left corner, where the stat and the name sit.
  ctx.save();
  ctx.translate(0, CARD_H);
  ctx.scale(1.25, 1);
  const corner = ctx.createRadialGradient(0, 0, 0, 0, 0, 860);
  corner.addColorStop(0, "rgba(0,0,0,0.92)");
  corner.addColorStop(0.5, "rgba(0,0,0,0.6)");
  corner.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = corner;
  ctx.fillRect(0, -860, 860, 860);
  ctx.restore();
}

/** The league name and a small "SINGLE-GAME RECORD" line, top left. */
function drawTopLine(ctx: CanvasRenderingContext2D, leagueName: string, leagueLogo: HTMLImageElement | null) {
  let x = SIDE;
  const y = 56;
  if (leagueLogo) {
    const h = 64;
    const w = Math.min(150, (leagueLogo.naturalWidth * h) / leagueLogo.naturalHeight);
    ctx.drawImage(leagueLogo, x, y, w, h);
    x += w + 22;
  }
  const kicker: TextOpts = { size: 24, weight: 600, color: ORANGE_LIGHT };
  const cap = capHeight(ctx, kicker);
  const label: TextOpts = { size: 22, weight: 500, alpha: 0.85 };
  const name = leagueName.toUpperCase();
  const nameOpts = { ...label, size: fitSize(ctx, name, CARD_W - SIDE - x, 22, 14, 500) };
  const blockH = cap + 12 + capHeight(ctx, nameOpts);
  const top = y + (64 - blockH) / 2;
  drawSpaced(ctx, "SINGLE-GAME RECORD", x, top, 4, kicker);
  if (name) drawSpaced(ctx, name, x, top + cap + 12, 2, nameOpts);
}

/** The number in orange with a glow, the unit beside it, then the category, the player and the game. */
function drawStatBlock(ctx: CanvasRenderingContext2D, o: RecordCardOptions, clubLogo: HTMLImageElement | null) {
  const { record, categoryTitle, unit, holders = { players: 1, games: 1 } } = o;
  const maxW = CARD_W - SIDE * 2;
  const value = String(record.value);
  const bottom = CARD_H - 176;

  // From the bottom up: game line, team line, name, category, number.
  const club = cleanTeamLabel(record.team_name).toUpperCase();
  const vs = record.opponent_name ? `VS ${cleanTeamLabel(record.opponent_name).toUpperCase()}` : "";
  const gameLine = [vs, record.game_result, fmtDate(record.game_date).toUpperCase()].filter(Boolean).join("  ·  ");
  const gameOpts: TextOpts = { size: fitSize(ctx, gameLine || " ", maxW, 24, 15, 500), weight: 500, alpha: 0.7 };
  const gameCap = gameLine ? capHeight(ctx, gameOpts) : 0;

  const [given, family] = splitName(record.name);
  const fullName = given ? `${given} ${family}` : family;
  const name = fitLines(ctx, fullName, maxW, 88, 40, 700);
  const nameCap = capHeight(ctx, { size: name.size, weight: 700 });
  const nameGap = Math.round(name.size * 0.22);

  const crestR = 24;
  const teamOpts: TextOpts = { size: fitSize(ctx, club || " ", maxW - crestR * 2 - 16, 28, 16, 500), weight: 500, alpha: 0.9 };

  const titleOpts: TextOpts = { size: 34, weight: 600, color: ORANGE_LIGHT };
  const title = categoryTitle.toUpperCase();
  // A shared record says so after the category, e.g. "MOST ASSISTS IN A GAME  ·  JOINT RECORD".
  const tag = holders.players > 1 ? "  ·  JOINT RECORD" : holders.games > 1 ? `  ·  ${holders.games === 2 ? "TWICE" : `${holders.games} TIMES`}` : "";
  let titleSpacing = 4;
  while (titleSpacing > 0 && spacedWidth(ctx, title + tag, titleSpacing, titleOpts) > maxW) titleSpacing -= 1;
  if (spacedWidth(ctx, title + tag, titleSpacing, titleOpts) > maxW) titleOpts.size = fitSize(ctx, title + tag, maxW, 34, 20, 600);
  const titleCap = capHeight(ctx, titleOpts);

  const unitOpts: TextOpts = { size: 64, weight: 600, color: "#ffffff", alpha: 0.92 };
  setFont(ctx, unitOpts);
  const unitW = ctx.measureText(unit).width;
  const valueSize = fitSize(ctx, value, maxW - unitW - 28, 300, 140, 700);
  const valueOpts: TextOpts = { size: valueSize, weight: 700, color: ORANGE };
  const valueCap = capHeight(ctx, valueOpts);

  let y = bottom;
  const gameTop = y - gameCap;
  y = gameTop - (gameLine ? 18 : 0);
  const teamTop = y - crestR * 2;
  y = teamTop - 22;
  const nameTop = y - (name.lines.length * nameCap + (name.lines.length - 1) * nameGap);
  y = nameTop - 30;
  const titleTop = y - titleCap;
  y = titleTop - 30;
  const valueTop = y - valueCap;

  // The number in Swish Assistant orange, light at the top to deep at the foot, with only a soft drop shadow.
  setFont(ctx, valueOpts);
  const valueW = ctx.measureText(value).width;
  const fill = ctx.createLinearGradient(0, valueTop, 0, valueTop + valueCap);
  fill.addColorStop(0, SWISH_LIGHT);
  fill.addColorStop(0.5, ORANGE);
  fill.addColorStop(1, SWISH_DEEP);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.font = `700 ${valueSize}px ${DISPLAY}`;
  ctx.fillStyle = fill;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, SIDE - valueSize * 0.03, valueTop + valueCap);
  ctx.restore();
  drawTextTop(ctx, unit, SIDE + valueW + 24, valueTop + valueCap - capHeight(ctx, unitOpts), unitOpts);

  drawSpaced(ctx, title, SIDE, titleTop, titleSpacing, titleOpts);
  if (tag) drawSpaced(ctx, tag, SIDE + spacedWidth(ctx, title, titleSpacing, titleOpts), titleTop, titleSpacing, { ...titleOpts, color: "#ffffff", alpha: 0.75 });

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 18;
  name.lines.forEach((line, i) => drawTextTop(ctx, line, SIDE, nameTop + i * (nameCap + nameGap), { size: name.size, weight: 700 }));
  ctx.restore();

  const theme = themeFor("swish", ORANGE);
  let teamX = SIDE;
  if (club) {
    drawCrest(ctx, SIDE + crestR, teamTop + crestR, crestR, clubLogo, initialsOf(club), theme);
    teamX += crestR * 2 + 16;
    drawSpaced(ctx, club, teamX, teamTop + crestR - capHeight(ctx, teamOpts) / 2, 2, teamOpts);
  }
  if (gameLine) drawSpaced(ctx, gameLine, SIDE, gameTop, 1.5, gameOpts);
}

export async function renderRecordCard(o: RecordCardOptions): Promise<HTMLCanvasElement> {
  const { record, brand, clubLogoUrl, framing = DEFAULT_FRAMING } = o;
  await ensureDisplayFont();
  const [logo, leagueLogo, photo, clubLogo] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(brand.leagueLogoUrl),
    fetchImg(record.photoUrl),
    fetchImg(clubLogoUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Orange light behind the player: it shows round a cut-out, and warms the photo's fade.
  drawGlow(ctx, CARD_W / 2, 560, 620, ORANGE, 0.3);
  if (photo) {
    drawPhoto(ctx, photo, record.photoFocusY ?? 30, framing);
  } else {
    drawRingedCrest(ctx, CARD_W / 2, 470, 200, clubLogo, initialsOf(cleanTeamLabel(record.team_name) || record.name), themeFor("swish", ORANGE));
  }
  drawShade(ctx);

  drawTopLine(ctx, brand.leagueName, leagueLogo);
  drawStatBlock(ctx, o, clubLogo);
  drawFooter(ctx, [logo, "statsthread"], "");
  return canvas;
}
