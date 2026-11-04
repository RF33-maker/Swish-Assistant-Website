/**
 * Single-game record card (1080×1350): the record holder's photo fills most of the
 * card, and the number they own sits along the bottom in orange, with the category,
 * the player and the game it came in. Deliberately plainer than the leaders cards:
 * one number. A joint record splits the photo between the holders (up to three), with
 * their heads lined up as on Team of the Week, the shared number in the middle, and
 * each holder's name, team and game on their own side.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { GameRecord } from "@/types/records";
import type { WeeklyCardBrand } from "@/types/weeklyAwards";
import { SIDE, cleanTeamLabel, drawCrest, drawGlow, drawRingedCrest, drawSpaced, fitLines, spacedWidth, splitName, themeFor } from "@/lib/cardStyle";
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
  initialsOf,
  placeInFrame,
  setFont,
  DISPLAY,
  type HeadPoint,
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

/** The most players a joint record card draws side by side. */
export const MAX_CARD_HOLDERS = 3;

/** One player on the card, with every game in which they hit the record total. */
export type RecordHolder = {
  /** The player's first record game: name, team and photo come from here. */
  record: GameRecord;
  /** Every record game of theirs, `record` first. */
  games: GameRecord[];
  clubLogoUrl?: string | null;
  framing?: PhotoFraming;
  /** Where the face sits in their photo (marked in the studio); a guess is used until it is. */
  head?: HeadPoint;
};

export type RecordCardOptions = {
  /** Who the card shows, left to right (at most MAX_CARD_HOLDERS). */
  holders: RecordHolder[];
  /** "Most Points in a Game". */
  categoryTitle: string;
  /** "PTS". */
  unit: string;
  brand: WeeklyCardBrand;
  /** Everyone on the record total, shown or not: more than one player makes it a joint record; one player more than once says how often. */
  share?: { players: number; games: number };
  /** Joint records: put every holder's face on one shared line, as Team of the Week does. On by default. */
  alignHeads?: boolean;
  /** That line, as a percentage of the photo's height. */
  headLine?: number;
};

export type RecordCardResult = {
  canvas: HTMLCanvasElement;
  /** Holders (player ids) whose face couldn't reach the head line without zooming too far. */
  unaligned: string[];
};

/** Which holder's photo column is at x on a joint card (the full card for one holder). */
export function recordColumnAt(x: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(x / (CARD_W / Math.max(1, count)))));
}

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

/**
 * A joint holder's photo in its column: always filling it edge to edge, and with a head point,
 * zoomed and shifted so the face sits on the shared line. Faded into the dark below like the solo photo.
 * Returns whether the face reached the line.
 */
function drawColumnPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x0: number,
  w: number,
  o: { framing: PhotoFraming; head: HeadPoint | null; headLine: number; focusY: number },
): boolean {
  const h = PHOTO_H;
  const place = placeInFrame(img, w, h, o);
  const layer = document.createElement("canvas");
  layer.width = Math.ceil(w);
  layer.height = h;
  const l = layer.getContext("2d")!;
  l.drawImage(img, place.left, place.top, img.naturalWidth * place.scale, img.naturalHeight * place.scale);
  l.globalCompositeOperation = "destination-in";
  const fade = l.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.58, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  l.fillStyle = fade;
  l.fillRect(0, 0, layer.width, h);
  ctx.drawImage(layer, x0, 0);
  return place.aligned;
}

/** Shade over the photo: a little at the top for the header, and a deep pool under the stat. */
function drawShade(ctx: CanvasRenderingContext2D, joint: boolean) {
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

  if (joint) {
    // Every holder's details sit along the bottom, so darken it evenly rather than from one corner.
    const pool = ctx.createLinearGradient(0, 560, 0, CARD_H);
    pool.addColorStop(0, "rgba(0,0,0,0)");
    pool.addColorStop(0.4, "rgba(0,0,0,0.7)");
    pool.addColorStop(1, "rgba(0,0,0,0.9)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 560, CARD_W, CARD_H - 560);
    return;
  }

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

/** "VS SHEFFIELD HATTERS", the result and the date of one record game, as separate parts. */
function gameParts(g: GameRecord): { vs: string; rest: string } {
  return {
    vs: g.opponent_name ? `VS ${cleanTeamLabel(g.opponent_name).toUpperCase()}` : "",
    rest: [g.game_result, fmtDate(g.game_date).toUpperCase()].filter(Boolean).join("  ·  "),
  };
}

/** "JOINT RECORD", "TWICE", "3 TIMES" or nothing, said after the category. */
function shareTag(share: { players: number; games: number }): string {
  if (share.players > 1) return "  ·  JOINT RECORD";
  if (share.games > 1) return `  ·  ${share.games === 2 ? "TWICE" : `${share.games} TIMES`}`;
  return "";
}

/**
 * The number in orange with the unit beside it, and the category (plus any shared-record tag) under it,
 * with the category's foot at `titleBottom`. Returns nothing: everything below is the caller's.
 */
function drawHeadline(ctx: CanvasRenderingContext2D, o: RecordCardOptions, titleBottom: number, maxValueSize: number, centred = false) {
  const { categoryTitle, unit } = o;
  const maxW = CARD_W - SIDE * 2;
  const value = String(o.holders[0].record.value);
  const share = o.share ?? { players: o.holders.length, games: o.holders.reduce((n, h) => n + h.games.length, 0) };

  const titleOpts: TextOpts = { size: 34, weight: 600, color: ORANGE_LIGHT };
  const title = categoryTitle.toUpperCase();
  // A shared record says so after the category, e.g. "MOST ASSISTS IN A GAME  ·  JOINT RECORD".
  const tag = shareTag(share);
  let titleSpacing = 4;
  while (titleSpacing > 0 && spacedWidth(ctx, title + tag, titleSpacing, titleOpts) > maxW) titleSpacing -= 1;
  if (spacedWidth(ctx, title + tag, titleSpacing, titleOpts) > maxW) titleOpts.size = fitSize(ctx, title + tag, maxW, 34, 20, 600);
  const titleCap = capHeight(ctx, titleOpts);

  const unitOpts: TextOpts = { size: 64, weight: 600, color: "#ffffff", alpha: 0.92 };
  setFont(ctx, unitOpts);
  const unitW = ctx.measureText(unit).width;
  const valueSize = fitSize(ctx, value, maxW - unitW - 28, maxValueSize, 140, 700);
  const valueOpts: TextOpts = { size: valueSize, weight: 700, color: ORANGE };
  const valueCap = capHeight(ctx, valueOpts);

  const titleTop = titleBottom - titleCap;
  const valueTop = titleTop - 30 - valueCap;

  // The number in Swish Assistant orange, light at the top to deep at the foot, with only a soft drop shadow.
  setFont(ctx, valueOpts);
  const valueW = ctx.measureText(value).width;
  // Centred (joint records), the number and its unit are placed as one group, and so are the category and its tag.
  const valueX = centred ? (CARD_W - (valueW + 24 + unitW)) / 2 : SIDE - valueSize * 0.03;
  const titleW = spacedWidth(ctx, title, titleSpacing, titleOpts);
  const titleX = centred ? (CARD_W - titleW - (tag ? spacedWidth(ctx, tag, titleSpacing, titleOpts) : 0)) / 2 : SIDE;
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
  ctx.fillText(value, valueX, valueTop + valueCap);
  ctx.restore();
  drawTextTop(ctx, unit, valueX + valueW + 24, valueTop + valueCap - capHeight(ctx, unitOpts), unitOpts);

  drawSpaced(ctx, title, titleX, titleTop, titleSpacing, titleOpts);
  if (tag) drawSpaced(ctx, tag, titleX + titleW, titleTop, titleSpacing, { ...titleOpts, color: "#ffffff", alpha: 0.75 });
}

const STAT_BOTTOM = CARD_H - 176;

/** One holder: the number, the category, the player, their team and the game (or each game, if they did it more than once). */
function drawSoloBlock(ctx: CanvasRenderingContext2D, o: RecordCardOptions, clubLogo: HTMLImageElement | null) {
  const { record, games } = o.holders[0];
  const maxW = CARD_W - SIDE * 2;

  // From the bottom up: game lines, team line, name, then the headline.
  const club = cleanTeamLabel(record.team_name).toUpperCase();
  const gameLines = games
    .map((g) => {
      const { vs, rest } = gameParts(g);
      return [vs, rest].filter(Boolean).join("  ·  ");
    })
    .filter(Boolean);
  const gameSize = Math.min(...gameLines.map((l) => fitSize(ctx, l, maxW, 24, 15, 500)), 24);
  const gameOpts: TextOpts = { size: gameSize, weight: 500, alpha: 0.7 };
  const gameCap = gameLines.length ? capHeight(ctx, gameOpts) : 0;
  const gameGap = 14;

  const [given, family] = splitName(record.name);
  const fullName = given ? `${given} ${family}` : family;
  const name = fitLines(ctx, fullName, maxW, 88, 40, 700);
  const nameCap = capHeight(ctx, { size: name.size, weight: 700 });
  const nameGap = Math.round(name.size * 0.22);

  const crestR = 24;
  const teamOpts: TextOpts = { size: fitSize(ctx, club || " ", maxW - crestR * 2 - 16, 28, 16, 500), weight: 500, alpha: 0.9 };

  let y = STAT_BOTTOM;
  const gamesTop = y - (gameLines.length * gameCap + Math.max(0, gameLines.length - 1) * gameGap);
  y = gamesTop - (gameLines.length ? 18 : 0);
  const teamTop = y - crestR * 2;
  y = teamTop - 22;
  const nameTop = y - (name.lines.length * nameCap + (name.lines.length - 1) * nameGap);

  drawHeadline(ctx, o, nameTop - 30, 300);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 18;
  name.lines.forEach((line, i) => drawTextTop(ctx, line, SIDE, nameTop + i * (nameCap + nameGap), { size: name.size, weight: 700 }));
  ctx.restore();

  if (club) {
    drawCrest(ctx, SIDE + crestR, teamTop + crestR, crestR, clubLogo, initialsOf(club), themeFor("swish", ORANGE));
    drawSpaced(ctx, club, SIDE + crestR * 2 + 16, teamTop + crestR - capHeight(ctx, teamOpts) / 2, 2, teamOpts);
  }
  gameLines.forEach((line, i) => drawSpaced(ctx, line, SIDE, gamesTop + i * (gameCap + gameGap), 1.5, gameOpts));
}

/** The gap between holders' columns, in the photo strip and in the details under it. */
const COL_GAP = 40;

/** Each holder's column of details: left edge and width, matching their photo above. */
function columns(n: number): { x: number; w: number }[] {
  const w = (CARD_W - SIDE * 2 - COL_GAP * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: SIDE + i * (w + COL_GAP), w }));
}

type Side = "left" | "center" | "right";

/** Left edge for something `width` wide, anchored at `anchor` from the given side. */
function leftFor(anchor: number, width: number, side: Side): number {
  return side === "left" ? anchor : side === "right" ? anchor - width : anchor - width / 2;
}

/**
 * Two or three holders: the shared number and category centred, then each holder's name, team and
 * game(s) on their own side: the first to the left edge, the last to the right, a third in the middle.
 */
function drawJointBlock(ctx: CanvasRenderingContext2D, o: RecordCardOptions, clubLogos: (HTMLImageElement | null)[]) {
  const n = o.holders.length;
  const cols = columns(n);
  const colW = cols[0].w;
  const sides: Side[] = o.holders.map((_, i) => (i === 0 ? "left" : i === n - 1 ? "right" : "center"));
  const anchors = cols.map((c, i) => (sides[i] === "left" ? c.x : sides[i] === "right" ? c.x + c.w : c.x + c.w / 2));

  // One name size for everyone, so no holder reads as the bigger name.
  const nameMax = n === 2 ? 60 : 46;
  const fits = o.holders.map((h) => {
    const [given, family] = splitName(h.record.name);
    return fitLines(ctx, given ? `${given} ${family}` : family, colW, nameMax, 26, 700);
  });
  const nameSize = Math.min(...fits.map((f) => f.size));
  const nameOpts: TextOpts = { size: nameSize, weight: 700 };
  const nameCap = capHeight(ctx, nameOpts);
  const nameGap = Math.round(nameSize * 0.22);
  const nameLines = fits.map((f) => f.lines);
  const nameH = Math.max(...nameLines.map((l) => l.length * nameCap + (l.length - 1) * nameGap));

  const crestR = n === 2 ? 20 : 17;
  const crestGap = 12;
  const teamSpacing = 1.5;
  const clubs = o.holders.map((h) => cleanTeamLabel(h.record.team_name).toUpperCase());
  const teamSize = Math.min(...clubs.map((c) => fitSize(ctx, c || " ", colW - crestR * 2 - crestGap, n === 2 ? 24 : 20, 13, 500)));
  const teamOpts: TextOpts = { size: teamSize, weight: 500, alpha: 0.9 };

  // Each game takes two lines in a narrow column: who it was against, then the result and date.
  const gameText = o.holders.map((h) => h.games.flatMap((g) => {
    const { vs, rest } = gameParts(g);
    return [vs, rest].filter(Boolean);
  }));
  const gameSize = Math.min(20, ...gameText.flat().map((l) => fitSize(ctx, l, colW, 20, 12, 500)));
  const gameOpts: TextOpts = { size: gameSize, weight: 500, alpha: 0.7 };
  const gameCap = capHeight(ctx, gameOpts);
  const lineGap = 10;
  const gamesH = Math.max(
    ...o.holders.map((h, i) => {
      const lines = gameText[i];
      // An extra gap between one game and the next, for a holder who did it more than once.
      return lines.length * gameCap + Math.max(0, lines.length - 1) * lineGap + Math.max(0, h.games.length - 1) * 8;
    }),
  );

  const blockH = nameH + 20 + crestR * 2 + 16 + gamesH;
  const top = STAT_BOTTOM - blockH;

  drawHeadline(ctx, o, top - 40, 250, true);

  const theme = themeFor("swish", ORANGE);
  o.holders.forEach((h, i) => {
    const side = sides[i];
    const anchor = anchors[i];

    setFont(ctx, nameOpts);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 18;
    nameLines[i].forEach((line, j) => {
      setFont(ctx, nameOpts);
      const w = ctx.measureText(line).width;
      drawTextTop(ctx, line, leftFor(anchor, w, side), top + j * (nameCap + nameGap), nameOpts);
    });
    ctx.restore();

    // Crest beside the team name, on the outside edge: before it on the left, after it on the right.
    const teamTop = top + nameH + 20;
    if (clubs[i]) {
      const textW = spacedWidth(ctx, clubs[i], teamSpacing, teamOpts);
      const groupLeft = leftFor(anchor, crestR * 2 + crestGap + textW, side);
      const crestFirst = side !== "right";
      const crestX = crestFirst ? groupLeft : groupLeft + textW + crestGap;
      const textX = crestFirst ? groupLeft + crestR * 2 + crestGap : groupLeft;
      drawCrest(ctx, crestX + crestR, teamTop + crestR, crestR, clubLogos[i], initialsOf(clubs[i]), theme);
      drawSpaced(ctx, clubs[i], textX, teamTop + crestR - capHeight(ctx, teamOpts) / 2, teamSpacing, teamOpts);
    }

    let y = teamTop + crestR * 2 + 16;
    h.games.forEach((g) => {
      const { vs, rest } = gameParts(g);
      [vs, rest].filter(Boolean).forEach((line) => {
        const opts = { ...gameOpts, size: Math.min(gameSize, fitSize(ctx, line, colW, gameSize, 12, 500)) };
        drawSpaced(ctx, line, leftFor(anchor, spacedWidth(ctx, line, 1, opts), side), y, 1, opts);
        y += gameCap + lineGap;
      });
      y += 8;
    });
  });
}

/** Thin dark seams between the holders' photos, fading out where the details take over. */
function drawSeams(ctx: CanvasRenderingContext2D, n: number) {
  for (let i = 1; i < n; i += 1) {
    const x = (CARD_W / n) * i;
    const g = ctx.createLinearGradient(0, 0, 0, PHOTO_H);
    g.addColorStop(0, "rgba(11,11,13,1)");
    // Gone before the centred number, so it doesn't cut through it.
    g.addColorStop(0.45, "rgba(11,11,13,1)");
    g.addColorStop(0.62, "rgba(11,11,13,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 3, 0, 6, PHOTO_H);
  }
}

export async function renderRecordCard(o: RecordCardOptions): Promise<RecordCardResult> {
  const { brand, alignHeads = true, headLine = DEFAULT_HEAD_LINE } = o;
  const unaligned: string[] = [];
  const holders = o.holders.slice(0, MAX_CARD_HOLDERS);
  if (holders.length === 0) throw new Error("No record holder to draw");
  const opts = { ...o, holders };
  const n = holders.length;
  await ensureDisplayFont();
  const [logo, leagueLogo, photos, clubLogos] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(brand.leagueLogoUrl),
    Promise.all(holders.map((h) => fetchImg(h.record.photoUrl))),
    Promise.all(holders.map((h) => fetchImg(h.clubLogoUrl))),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Orange light behind the player(s): it shows round a cut-out, and warms the photo's fade.
  drawGlow(ctx, CARD_W / 2, 560, 620, ORANGE, 0.3);
  const colW = CARD_W / n;
  holders.forEach((h, i) => {
    const photo = photos[i];
    if (photo && n === 1) {
      drawPhoto(ctx, photo, h.record.photoFocusY ?? 30, h.framing ?? DEFAULT_FRAMING);
    } else if (photo) {
      const aligned = drawColumnPhoto(ctx, photo, i * colW, colW, {
        framing: h.framing ?? DEFAULT_FRAMING,
        head: alignHeads ? h.head ?? GUESSED_HEAD : null,
        headLine,
        focusY: h.record.photoFocusY ?? 30,
      });
      if (!aligned) unaligned.push(h.record.id);
    } else {
      const label = initialsOf(cleanTeamLabel(h.record.team_name) || h.record.name);
      drawRingedCrest(ctx, i * colW + colW / 2, 470, n === 1 ? 200 : n === 2 ? 150 : 110, clubLogos[i], label, themeFor("swish", ORANGE));
    }
  });
  if (n > 1) drawSeams(ctx, n);
  drawShade(ctx, n > 1);

  drawTopLine(ctx, brand.leagueName, leagueLogo);
  if (n === 1) drawSoloBlock(ctx, opts, clubLogos[0]);
  else drawJointBlock(ctx, opts, clubLogos);
  drawFooter(ctx, [logo, "statsthread"], "");
  return { canvas, unaligned };
}
