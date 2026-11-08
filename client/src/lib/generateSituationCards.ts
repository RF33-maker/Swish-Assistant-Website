/**
 * The Swish Social situation cards — final score, pre-game and milestone —
 * drawn straight onto a Canvas 2D context in the same visual system as the
 * performance styles: one giant word or number, one quiet descriptor line,
 * heavy grain, cut-outs crossing the type, a black label band and a ticker.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import { CARD_H, CARD_W, capHeight, drawContain, fetchImg, shade, withAlpha } from "@/lib/generateWeeklyCards";
import { cleanTeamLabel, drawCrest, drawSpaced, spacedWidth, themeFor } from "@/lib/cardStyle";
import {
  accentOf,
  body,
  DARK,
  display,
  drawCoverPhoto,
  drawCutout,
  drawGrain,
  drawText,
  ellipseGlow,
  ensureCardFonts,
  fitDisplay,
  fitText,
  framingOf,
  loadPhoto,
  serif,
  SIDE,
  textWidth,
  vertical,
  type Box,
  type Framing,
  type Photo,
  type PhotoFields,
} from "@/lib/cardCanvasKit";

// ── data ─────────────────────────────────────────────────────────────────────

export type FinalScoreData = PhotoFields & {
  /** The giant word: the winner's nickname ("MOHAWKS"). teamNickname() guesses it from the team name. */
  headline_word: string;
  home_name: string;
  away_name: string;
  home_score: number;
  away_score: number;
  home_logo_url?: string;
  away_logo_url?: string;
  competition?: string;
  game_date?: string;
  /** The performer in the picture and their line ("50 PTS · 14 REB"), run up the right edge. */
  player_name?: string;
  player_line?: string;
  /** The strip along the bottom; "{WORD} WIN · {COMPETITION}" when unset. */
  ticker?: string;
  accent_hex?: string;
};

export type PreGamePlayer = PhotoFields & { name: string };

export type PreGameData = {
  home_code: string;
  away_code: string;
  home_name: string;
  away_name: string;
  home_logo_url?: string;
  away_logo_url?: string;
  /** "GAME DAY", "UP NEXT"… */
  kicker?: string;
  competition?: string;
  /** Tip-off (UK wall-clock stored as UTC, like the schedule), shown as "SAT · 14 NOV · 6:00 PM". */
  tip_off?: string;
  /** Replaces the formatted tip-off when set. */
  date_label?: string;
  home_player?: PreGamePlayer;
  away_player?: PreGamePlayer;
  /** A game photo behind everything, in two tones. */
  background_photo_url?: string;
  accent_hex?: string;
};

export type MilestoneData = PhotoFields & {
  /** "MILESTONE", "RECORD", "CLUB RECORD"… */
  kicker?: string;
  /** The giant serif: "50", "9TH", "1,000". A trailing ordinal ("TH", "ST") is set small beside the number. */
  headline: string;
  /** Two to four tracked lines under the number. */
  lines: string[];
  player_name: string;
  shirt_number?: string;
  team_name?: string;
  team_logo_url?: string;
  competition?: string;
  /** Small print on the left of the footer: "V LIVERPOOL · 26 OCT 2026". */
  context_line?: string;
  accent_hex?: string;
};

// ── words ────────────────────────────────────────────────────────────────────

const ROMAN = /^(I|II|III|IV|V|VI)$/i;

function labelWords(name: string): string[] {
  return cleanTeamLabel(name)
    .split(" ")
    .filter((w) => w && !ROMAN.test(w) && !/^\d+$/.test(w));
}

/** Last words that are not a nickname: "Birmingham City University", "Myerscough Basketball Academy". */
const GENERIC = /^(university|academy|college|school|basketball|club|bc|team|men|women|senior)$/i;

/**
 * "Tees Valley Mohawks Senior Men I" → "MOHAWKS"; a one-word club keeps its name. When the
 * name ends in a generic word the feed's short name stands in ("Birmingham City University"
 * → "BIRMINGHAM"), unless that is cut short too.
 */
export function teamNickname(name: string, shortname?: string | null): string {
  const words = labelWords(name);
  const last = words.length ? words[words.length - 1] : name;
  if (GENERIC.test(last)) {
    const alt = (shortname || "").trim() ? labelWords(shortname!) : [];
    const altLast = alt.length ? alt[alt.length - 1] : "";
    if (altLast && !GENERIC.test(altLast)) return altLast.toUpperCase();
    if (words.length > 1) return words[0].toUpperCase();
  }
  return last.toUpperCase();
}

/** A three-letter code guessed from the name when the feed has none: "Sheffield Arrows" → "ARR". */
export function teamCode(name: string): string {
  const words = labelWords(name);
  const source = words.length > 1 ? words[words.length - 1] : words[0] || name;
  return source.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "TBC";
}

/** "NBL Division One 2026-27" → "NBL DIVISION ONE". */
export function competitionShort(name: string | undefined): string {
  return (name || "")
    .replace(/\s+\d{4}([-/–]\d{2,4})?$/, "")
    .replace(/\s+\d{2}[-/–]\d{2}$/, "")
    .trim()
    .toUpperCase();
}

const UTC = { timeZone: "UTC" } as const;

/** "26 OCT 2026" — game dates are UK wall-clock stored as UTC, so they are read back as UTC. */
export function formatCardDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", ...UTC }).toUpperCase();
}

/** "SAT · 14 NOV · 6:00 PM". */
export function formatTipOff(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short", ...UTC });
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...UTC });
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, ...UTC }).replace(/\s*(am|pm)$/i, " $1");
  return `${weekday} · ${day} · ${time}`.toUpperCase();
}

/** "GAME DAY" when the tip-off is today (UK), else "UP NEXT". */
export function defaultPreGameKicker(iso: string | undefined): string {
  if (!iso) return "UP NEXT";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "UP NEXT";
  const today = new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  const gameDay = d.toLocaleDateString("en-GB", UTC);
  return today === gameDay ? "GAME DAY" : "UP NEXT";
}

// ── shared pieces ────────────────────────────────────────────────────────────

const MUTED = "rgba(255,255,255,0.6)";

function newCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  return [canvas, ctx];
}

/** The small line at the top: a word in the accent, then the rest muted. */
function drawKicker(ctx: CanvasRenderingContext2D, lead: string, rest: string, leadColour: string, restColour: string, maxWidth: number) {
  const leadOpts = body(18, 700, { color: leadColour });
  const w = lead ? spacedWidth(ctx, lead, 18 * 0.36, leadOpts) : 0;
  if (lead) drawSpaced(ctx, lead, SIDE, 66, 18 * 0.36, leadOpts);
  let text = rest;
  const restOpts = body(16, 600, { color: restColour });
  while (text && w + 28 + spacedWidth(ctx, text, 16 * 0.26, restOpts) > maxWidth) {
    const cut = text.lastIndexOf(" · ");
    text = cut > 0 ? text.slice(0, cut) : "";
  }
  if (text) drawSpaced(ctx, text, SIDE + w + (lead ? 28 : 0), 68, 16 * 0.26, restOpts);
}

/** A repeating strip along an edge: "MOHAWKS WIN · NBL DIVISION ONE · MOHAWKS WIN · …". */
function drawTicker(ctx: CanvasRenderingContext2D, text: string, y: number, h: number, fill: string, colour: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(0, y, CARD_W, h);
  const unit = `${text}   ·   `;
  const o = body(19, 700, { color: colour });
  const spacing = 19 * 0.2;
  const w = spacedWidth(ctx, unit, spacing, o);
  if (w <= 0) return;
  const top = y + (h - capHeight(ctx, o)) / 2;
  // Start off the card so it reads as a slice of a longer strip.
  for (let x = -w * 0.38; x < CARD_W; x += w) drawSpaced(ctx, unit, x, top, spacing, o);
}

/** A big word or number running up the right edge, bottom-anchored. */
function drawEdgeTitle(ctx: CanvasRenderingContext2D, text: string, x: number, bottomY: number, colour: string, size = 34) {
  const o = display(size, 700, { color: colour });
  ctx.save();
  ctx.translate(x, bottomY);
  ctx.rotate(-Math.PI / 2);
  drawSpaced(ctx, text, 0, 0, size * 0.12, o);
  ctx.restore();
}

type FooterAssets = { swish: HTMLImageElement | null; crest: HTMLImageElement | null };

/** A hairline, small print on the left and, on the right, a label, a crest and the Swish mark. */
function drawPlainFooter(ctx: CanvasRenderingContext2D, ruleY: number, left: string, right: string, assets: FooterAssets, rule: string, ink: string) {
  ctx.fillStyle = rule;
  ctx.fillRect(SIDE, ruleY, CARD_W - SIDE * 2, 1);
  const cy = ruleY + 42;
  let x = CARD_W - SIDE;
  if (assets.swish) {
    x -= 38;
    drawContain(ctx, assets.swish, x, cy - 19, 38, 38);
    x -= 14;
  }
  if (assets.crest) {
    x -= 40;
    drawContain(ctx, assets.crest, x, cy - 20, 40, 40);
    x -= 16;
  }
  const labelOpts = body(14, 600, { color: ink });
  let label = right;
  while (label && spacedWidth(ctx, label, 3.6, labelOpts) > x - SIDE - 360) {
    const cut = label.lastIndexOf(" · ");
    label = cut > 0 ? label.slice(0, cut) : "";
  }
  if (label) {
    const w = spacedWidth(ctx, label, 3.6, labelOpts) - 3.6;
    x -= w;
    drawSpaced(ctx, label, x, cy - capHeight(ctx, labelOpts) / 2, 3.6, labelOpts);
    x -= 14;
  }
  const leftOpts = body(17, 500, { color: ink });
  let text = left;
  while (text && textWidth(ctx, text, leftOpts) > x - SIDE - 10 && text.length > 8) text = `${text.slice(0, -4).trimEnd()}…`;
  if (text) drawText(ctx, text, SIDE, cy - capHeight(ctx, leftOpts) / 2, leftOpts);
}

/** The full card darkened top and bottom so type reads on a photo. */
function darkenForType(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = vertical(ctx, 0, CARD_H, [
    [0, "rgba(11,11,13,0.8)"], [0.22, "rgba(11,11,13,0.05)"], [0.5, "rgba(11,11,13,0.15)"],
    [0.78, "rgba(11,11,13,0.9)"], [1, DARK],
  ]);
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

// ── final score ──────────────────────────────────────────────────────────────

type FinalScene = {
  ctx: CanvasRenderingContext2D;
  data: FinalScoreData;
  accent: string;
  photo: Photo | null;
  raw: HTMLImageElement | null;
  fr: Framing;
  swish: HTMLImageElement | null;
  homeLogo: HTMLImageElement | null;
  awayLogo: HTMLImageElement | null;
};

function drawFinalScore(s: FinalScene) {
  const { ctx, data, accent, photo, raw, fr } = s;
  const cutout = photo?.cutout ?? false;
  const homeWon = Number(data.home_score) > Number(data.away_score);
  const winnerName = homeWon ? data.home_name : data.away_name;
  const winnerLogo = homeWon ? s.homeLogo : s.awayLogo;
  const league = competitionShort(data.competition);

  // The accent floods the top and sinks into its own dark towards the bottom.
  ctx.fillStyle = vertical(ctx, 0, CARD_H, [[0, accent], [0.42, accent], [0.72, shade(accent, -0.62)], [1, shade(accent, -0.86)]]);
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ellipseGlow(ctx, CARD_W * 0.15, 40, 760, 520, [[0, "rgba(255,255,255,0.3)"], [0.7, "rgba(255,255,255,0)"]]);

  drawKicker(ctx, "FINAL", [league, formatCardDate(data.game_date)].filter(Boolean).join(" · "), DARK, "rgba(0,0,0,0.62)", CARD_W - SIDE * 2);

  // The giant word, then WIN in ink beneath it.
  const word = (data.headline_word || "").trim().toUpperCase() || teamNickname(winnerName);
  const size = fitDisplay(ctx, word, CARD_W - SIDE * 2 + 24, 300, 110, 900);
  const wordOpts = display(size, 900, { color: "#ffffff" });
  const cap = capHeight(ctx, wordOpts);
  const top1 = 112;
  drawText(ctx, word, SIDE - 6, top1, wordOpts);
  const top2 = top1 + cap + 14;
  drawText(ctx, "WIN", SIDE - 6, top2, display(size, 900, { color: DARK }));

  // The photo frame overlaps the lower part of WIN; the player breaks out above it.
  const frame: Box = { x: 170, y: Math.round(top2 + cap * 0.66), w: 740, h: 0 };
  frame.h = 1000 - frame.y;
  const inner = frame;
  if (raw) {
    drawCoverPhoto(ctx, raw, inner, cutout ? { ...fr, zoom: 1, x: 50, y: fr.focusY } : fr, cutout ? "mono" : "graded", accent);
    if (cutout) {
      ctx.fillStyle = withAlpha(shade(accent, -0.7), 0.55);
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    }
  } else {
    ctx.fillStyle = vertical(ctx, inner.y, inner.y + inner.h, [[0, shade(accent, -0.55)], [1, shade(accent, -0.85)]]);
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    if (winnerLogo) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      drawContain(ctx, winnerLogo, inner.x + inner.w / 2 - 170, inner.y + inner.h / 2 - 170, 340, 340);
      ctx.restore();
    }
  }
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 10;
  ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
  ctx.restore();

  if (photo && cutout) {
    // A touch wider than the frame, clipped to its sides and bottom edge, free to rise over the type.
    ctx.save();
    ctx.beginPath();
    ctx.rect(frame.x - 5, 0, frame.w + 10, frame.y + frame.h + 5);
    ctx.clip();
    const bleed = frame.w * 0.04;
    drawCutout(ctx, photo.img, { x: frame.x - bleed, y: 100, w: frame.w + bleed * 2, h: frame.y + frame.h - 100 }, fr, {
      tone: "natural", accent, fadeFrom: 0.93, shadow: { x: 0, y: 30, blur: 44, alpha: 0.55 },
    });
    ctx.restore();
  }

  const caption = [data.player_name, data.player_line].filter(Boolean).join("  ·  ").toUpperCase();
  if (caption) {
    const o = body(14, 600, { color: "rgba(255,255,255,0.8)" });
    ctx.save();
    ctx.translate(CARD_W - SIDE + 14, frame.y + frame.h);
    ctx.rotate(-Math.PI / 2);
    drawSpaced(ctx, caption, 0, 0, 14 * 0.3, o);
    ctx.restore();
  }

  // The black band: crest, score, FINAL, score, crest.
  const band = { y: 1032, h: 168 };
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, band.y, CARD_W, band.h);
  // Crests on the house disc, so a dark crest still reads on the black.
  const crestSize = 96;
  const theme = themeFor("swish", accent);
  drawCrest(ctx, SIDE + crestSize / 2, band.y + band.h / 2, crestSize / 2, s.homeLogo, teamCode(data.home_name), theme);
  drawCrest(ctx, CARD_W - SIDE - crestSize / 2, band.y + band.h / 2, crestSize / 2, s.awayLogo, teamCode(data.away_name), theme);
  const scoreOpts = (won: boolean, align: CanvasTextAlign) => display(132, 800, { color: won ? accent : "#ffffff", align });
  const scoreCap = capHeight(ctx, scoreOpts(true, "left"));
  const scoreTop = band.y + (band.h - scoreCap) / 2;
  drawText(ctx, String(data.home_score), SIDE + crestSize + 26, scoreTop, scoreOpts(homeWon, "left"));
  drawText(ctx, String(data.away_score), CARD_W - SIDE - crestSize - 26, scoreTop, scoreOpts(!homeWon, "right"));
  const finalOpts = body(18, 700, { color: "rgba(255,255,255,0.75)", align: "center" });
  drawSpaced(ctx, "FINAL", CARD_W / 2, band.y + 58, 18 * 0.4, finalOpts);
  ctx.fillStyle = accent;
  ctx.fillRect(CARD_W / 2 - 20, band.y + 96, 40, 4);

  // Who was who, under the band, with the Swish mark on the right.
  const home = cleanTeamLabel(data.home_name).toUpperCase();
  const away = cleanTeamLabel(data.away_name).toUpperCase();
  const namesOpts = body(15, 600, { color: "rgba(255,255,255,0.8)" });
  let names = `${home}   VS   ${away}`;
  if (spacedWidth(ctx, names, 15 * 0.26, namesOpts) > CARD_W - SIDE * 2 - 70) names = `${home} VS ${away}`;
  drawSpaced(ctx, names, SIDE, 1222, 15 * 0.26, namesOpts);
  if (s.swish) drawContain(ctx, s.swish, CARD_W - SIDE - 38, 1210, 38, 38);

  const ticker = (data.ticker || "").trim().toUpperCase() || [`${word} WIN`, league].filter(Boolean).join(" · ");
  drawTicker(ctx, ticker, CARD_H - 64, 64, "#ffffff", DARK);

  drawGrain(ctx, 0.22);
}

export async function renderFinalScoreCard(data: FinalScoreData): Promise<HTMLCanvasElement> {
  await ensureCardFonts();
  const [photo, raw, swish, homeLogo, awayLogo] = await Promise.all([
    loadPhoto(data, fetchImg),
    fetchImg(data.photo_url),
    fetchImg(swishLogoSrc),
    fetchImg(data.home_logo_url),
    fetchImg(data.away_logo_url),
  ]);
  const [canvas, ctx] = newCanvas();
  drawFinalScore({ ctx, data, accent: accentOf(data.accent_hex), photo, raw, fr: framingOf(data), swish, homeLogo, awayLogo });
  return canvas;
}

// ── pre-game ─────────────────────────────────────────────────────────────────

type PreGameScene = {
  ctx: CanvasRenderingContext2D;
  data: PreGameData;
  accent: string;
  homePhoto: Photo | null;
  awayPhoto: Photo | null;
  background: HTMLImageElement | null;
  swish: HTMLImageElement | null;
  homeLogo: HTMLImageElement | null;
  awayLogo: HTMLImageElement | null;
};

function drawPreGame(s: PreGameScene) {
  const { ctx, data, accent } = s;
  const full: Box = { x: 0, y: 0, w: CARD_W, h: CARD_H };
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (s.background) {
    drawCoverPhoto(ctx, s.background, full, framingOf(undefined), "duotone", accent, 0.5);
    darkenForType(ctx);
  }
  // The colour pours in from the top-right corner, behind the home player.
  ellipseGlow(ctx, CARD_W + 60, -40, 980, 1040, [[0, accent], [0.42, withAlpha(accent, 0.55)], [1, withAlpha(accent, 0)]], "screen", 0.9);
  ellipseGlow(ctx, CARD_W, 0, 420, 420, [[0, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]], "screen", 0.8);

  drawKicker(ctx, (data.kicker || defaultPreGameKicker(data.tip_off)).toUpperCase(), competitionShort(data.competition), accent, MUTED, 640);
  if (s.swish) drawContain(ctx, s.swish, CARD_W - SIDE - 40, 48, 40, 40);

  // Two codes stacked, the same size, the taller pour of the two players threaded between them.
  const home = (data.home_code || teamCode(data.home_name)).toUpperCase().slice(0, 4);
  const away = (data.away_code || teamCode(data.away_name)).toUpperCase().slice(0, 4);
  const codeSize = Math.min(fitDisplay(ctx, home, 660, 430, 200, 900), fitDisplay(ctx, away, 660, 430, 200, 900));
  const codeOpts = display(codeSize, 900, { color: "#ffffff" });
  const cap = capHeight(ctx, codeOpts);
  const top1 = 150;
  const gap = 150;
  const top2 = top1 + cap + gap;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  drawText(ctx, home, SIDE - 10, top1, codeOpts);
  ctx.restore();

  // The home player stands high on the right, in front of the first code and behind the second.
  const homePlayer = s.homePhoto;
  if (homePlayer?.cutout) {
    drawCutout(ctx, homePlayer.img, { x: 430, y: 0, w: 650, h: 790 }, framingOf(data.home_player), {
      tone: "natural", accent, fadeFrom: 0.8, rim: true, shadow: { x: 0, y: 36, blur: 48, alpha: 0.6 },
    });
  }

  // VS in a thin ring, under the first code, halfway to the second.
  const vs = { x: SIDE + 46, y: top1 + cap + gap / 2, r: 46 };
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(vs.x, vs.y, vs.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const vsOpts = body(24, 700, { color: "#ffffff", align: "center" });
  drawSpaced(ctx, "VS", vs.x, vs.y - capHeight(ctx, vsOpts) / 2, 24 * 0.1, vsOpts);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  drawText(ctx, away, SIDE - 10, top2, codeOpts);
  ctx.restore();

  // The away player lower and in front, over the second code and the home player's chest.
  const awayPlayer = s.awayPhoto;
  if (awayPlayer?.cutout) {
    drawCutout(ctx, awayPlayer.img, { x: 560, y: 560, w: 520, h: 600 }, framingOf(data.away_player), {
      tone: "natural", accent, fadeFrom: 0.82, shadow: { x: 0, y: 30, blur: 44, alpha: 0.62 },
    });
  }

  // The date strip.
  const strip = { y: 1168, h: 82 };
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, strip.y, CARD_W, strip.h);
  const label = ((data.date_label || "").trim() || formatTipOff(data.tip_off) || "TIP-OFF TBC").toUpperCase();
  const stripSize = fitText(ctx, label, CARD_W - SIDE * 2, 46, 26, (sz) => display(sz, 700));
  const stripOpts = display(stripSize, 700, { color: "#ffffff", align: "center" });
  drawSpaced(ctx, label, CARD_W / 2, strip.y + (strip.h - capHeight(ctx, stripOpts)) / 2, stripSize * 0.1, stripOpts);

  // The clubs in full under the strip, crests either side.
  const namesOpts = body(15, 600, { color: "rgba(255,255,255,0.8)" });
  let names = `${cleanTeamLabel(data.home_name).toUpperCase()}   VS   ${cleanTeamLabel(data.away_name).toUpperCase()}`;
  const room = CARD_W - SIDE * 2 - (s.homeLogo ? 50 : 0) - (s.awayLogo ? 50 : 0) - 8;
  if (spacedWidth(ctx, names, 15 * 0.26, namesOpts) > room) names = names.replace(/\s{3}VS\s{3}/, " VS ");
  const namesW = spacedWidth(ctx, names, 15 * 0.26, namesOpts);
  const rowW = namesW + (s.homeLogo ? 50 : 0) + (s.awayLogo ? 50 : 0);
  let x = SIDE;
  const rowY = 1290;
  if (s.homeLogo) {
    drawContain(ctx, s.homeLogo, x, rowY - 18, 36, 36);
    x += 50;
  }
  drawSpaced(ctx, names, x, rowY - capHeight(ctx, namesOpts) / 2, 15 * 0.26, namesOpts);
  x += namesW + 14;
  if (s.awayLogo) drawContain(ctx, s.awayLogo, x, rowY - 18, 36, 36);
  if (rowW < CARD_W - SIDE * 2 - 260) {
    drawSpaced(ctx, "SWISHASSISTANT.COM", CARD_W - SIDE, rowY - capHeight(ctx, namesOpts) / 2, 13 * 0.26, body(13, 600, { color: "rgba(255,255,255,0.45)", align: "right" }));
  }

  drawGrain(ctx, 0.24);
}

export async function renderPreGameCard(data: PreGameData): Promise<HTMLCanvasElement> {
  await ensureCardFonts();
  const [homePhoto, awayPhoto, background, swish, homeLogo, awayLogo] = await Promise.all([
    loadPhoto(data.home_player, fetchImg),
    loadPhoto(data.away_player, fetchImg),
    fetchImg(data.background_photo_url),
    fetchImg(swishLogoSrc),
    fetchImg(data.home_logo_url),
    fetchImg(data.away_logo_url),
  ]);
  const [canvas, ctx] = newCanvas();
  drawPreGame({ ctx, data, accent: accentOf(data.accent_hex), homePhoto, awayPhoto, background, swish, homeLogo, awayLogo });
  return canvas;
}

// ── milestone ────────────────────────────────────────────────────────────────

type MilestoneScene = {
  ctx: CanvasRenderingContext2D;
  data: MilestoneData;
  accent: string;
  photo: Photo | null;
  fr: Framing;
  swish: HTMLImageElement | null;
  crest: HTMLImageElement | null;
};

/** "9TH" → ["9", "TH"]; "1,000" → ["1,000", ""]; anything else is drawn whole. */
function splitOrdinal(headline: string): [string, string] | null {
  const m = /^([\d.,]+)\s*([A-Za-z]{1,3})?$/.exec(headline.trim());
  return m ? [m[1], (m[2] || "").toUpperCase()] : null;
}

function drawMilestone(s: MilestoneScene) {
  const { ctx, data, accent, photo, fr } = s;
  const cutout = photo?.cutout ?? false;
  const full: Box = { x: 0, y: 0, w: CARD_W, h: CARD_H };
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (photo && !cutout) {
    drawCoverPhoto(ctx, photo.img, full, fr, "graded", accent);
    darkenForType(ctx);
    // The left, where the number and the lines sit, goes darker still.
    const side = ctx.createLinearGradient(0, 0, CARD_W, 0);
    side.addColorStop(0, "rgba(11,11,13,0.82)");
    side.addColorStop(0.55, "rgba(11,11,13,0.3)");
    side.addColorStop(1, "rgba(11,11,13,0)");
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ellipseGlow(ctx, CARD_W, 120, 700, 700, [[0, accent], [0.7, withAlpha(accent, 0)]], "screen", 0.3);
  } else {
    // A bloom of the accent behind the player, a little cold light top-left.
    ellipseGlow(ctx, 820, 640, 560, 680, [[0, accent], [0.72, withAlpha(accent, 0)]], "screen", 0.55);
    ellipseGlow(ctx, 120, 80, 700, 520, [[0, "rgba(255,255,255,0.12)"], [0.7, "rgba(255,255,255,0)"]]);
  }

  drawKicker(ctx, (data.kicker || "MILESTONE").toUpperCase(), competitionShort(data.competition), accent, MUTED, 640);
  if (s.swish) drawContain(ctx, s.swish, CARD_W - SIDE - 40, 48, 40, 40);

  // The giant serif numeral, any ordinal small beside it in the accent.
  const headline = (data.headline || "").trim() || "1ST";
  const parts = splitOrdinal(headline);
  const numTop = 150;
  let numCap = 0;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 20;
  if (parts) {
    const [num, suffix] = parts;
    let numSize = fitText(ctx, num, 600, 540, 160, (sz) => serif(sz, 400));
    const sufW = (sz: number) => (suffix ? textWidth(ctx, suffix, serif(sz * 0.38, 400)) + sz * 0.04 : 0);
    while (numSize > 160 && textWidth(ctx, num, serif(numSize, 400)) + sufW(numSize) > 640) numSize -= 10;
    const numOpts = serif(numSize, 400, { color: "#ffffff" });
    numCap = capHeight(ctx, numOpts);
    const numW = drawText(ctx, num, SIDE - 12, numTop, numOpts);
    if (suffix) drawText(ctx, suffix, SIDE - 12 + numW + numSize * 0.04, numTop, serif(numSize * 0.38, 400, { color: accent }));
  } else {
    const size = fitText(ctx, headline.toUpperCase(), 700, 420, 110, (sz) => serif(sz, 400));
    const o = serif(size, 400, { color: "#ffffff" });
    numCap = capHeight(ctx, o);
    drawText(ctx, headline.toUpperCase(), SIDE - 10, numTop, o);
  }
  ctx.restore();

  // The tracked descriptor, two to four lines, under an accent dash, kept clear of the player.
  let y = numTop + numCap + 46;
  ctx.fillStyle = accent;
  ctx.fillRect(SIDE, y, 64, 6);
  y += 30;
  const lines = (data.lines || []).map((l) => l.trim().toUpperCase()).filter(Boolean).slice(0, 4);
  lines.forEach((line, i) => {
    // Measured with the tracking it is drawn with, so a long line shrinks instead of running under the player.
    let size = 25;
    while (size > 14 && spacedWidth(ctx, line, size * 0.28, body(size, 700)) > 500) size -= 1;
    const o = body(size, 700, { color: i === 0 ? "#ffffff" : "rgba(255,255,255,0.72)" });
    drawSpaced(ctx, line, SIDE, y, size * 0.28, o);
    y += 44;
  });

  if (photo && cutout) {
    drawCutout(ctx, photo.img, { x: 500, y: 200, w: 580, h: 1000 }, fr, {
      tone: "natural", accent, fadeFrom: 0.84, rim: true, shadow: { x: 0, y: 36, blur: 50, alpha: 0.6 },
    });
  }

  // The name and number, big, up the right edge.
  const shirt = (data.shirt_number || "").trim();
  const title = [data.player_name.toUpperCase(), shirt ? `#${shirt.replace(/^#/, "")}` : ""].filter(Boolean).join("   ");
  drawEdgeTitle(ctx, title, CARD_W - SIDE + 22, 1150, accent);

  drawPlainFooter(
    ctx,
    CARD_H - 126,
    (data.context_line || "").trim().toUpperCase() || cleanTeamLabel(data.team_name || "").toUpperCase(),
    competitionShort(data.competition),
    { swish: s.swish, crest: s.crest },
    "rgba(255,255,255,0.14)",
    "rgba(255,255,255,0.62)",
  );
  drawGrain(ctx, 0.26);
}

export async function renderMilestoneCard(data: MilestoneData): Promise<HTMLCanvasElement> {
  await ensureCardFonts();
  const [photo, swish, crest] = await Promise.all([loadPhoto(data, fetchImg), fetchImg(swishLogoSrc), fetchImg(data.team_logo_url)]);
  const [canvas, ctx] = newCanvas();
  drawMilestone({ ctx, data, accent: accentOf(data.accent_hex), photo, fr: framingOf(data), swish, crest });
  return canvas;
}
