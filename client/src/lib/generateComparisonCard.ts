/**
 * The downloadable player / team comparison card (1080×1350), drawn on a canvas.
 *
 * A plain card: a dark page with each side's club colour as a soft tint on its own
 * half, the two crests and names across the top, one line saying who leads how many
 * stats, then each stat as a pair of big numbers with the better one in its side's
 * colour. No bars or backdrops: the numbers are the card.
 *
 * Unlike the other Swish Social cards (Oswald), this one is set in the site's own
 * typefaces: Familjen Grotesk for the words and Martian Mono for the numbers.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import { SIDE, drawCrest, drawFace, drawSpaced, spacedWidth, themeFor } from "@/lib/cardStyle";
import {
  CARD_H,
  CARD_W,
  canvasToBlob,
  capHeight,
  drawFooter,
  drawContain,
  drawTextTop,
  fetchImg,
  initialsOf,
  setFont,
  withAlpha,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

export type ComparisonCardSide = {
  name: string;
  /** A player's club. */
  sub?: string;
  games: number;
  /** A player's photo, shown in a circle. */
  photoUrl?: string | null;
  /** A club's crest; also used for a player without a photo. */
  logoUrl?: string | null;
};

/** One stat, already worked out: the text for each side, their numbers, and who is better (0 = level). */
export type ComparisonCardRow = { label: string; value1: string; value2: string; n1: number; n2: number; lead: 0 | 1 | 2 };

export type ComparisonCardOptions = {
  kind: "player" | "team";
  left: ComparisonCardSide;
  right: ComparisonCardSide;
  rows: ComparisonCardRow[];
  /** The line under the title, e.g. "Season averages · Traditional". */
  banner: string;
  /** Between the two sides; "VS" unless there is a series score to show. */
  centre?: { text: string; caption?: string };
  /** Head-to-head games, newest first (e.g. "10 Oct 2026 · Home 98–85 Away"); listed when the category has no stats for them. */
  results?: string[];
  leagueName: string;
  leagueLogoUrl?: string | null;
  /** The league's colour: the fallback for a side without a colour of its own. */
  primaryHex: string;
  /** Each side's club colour. A side left out (a club with no crest to take a colour from) falls back to the league's colour. */
  split?: { left?: string | null; right?: string | null };
};

/** The site's typefaces (see --font-display and --font-data in index.css). */
const SANS = '"Familjen Grotesk", ui-sans-serif, system-ui, sans-serif';
const MONO = '"Martian Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/** The page and its type. */
const PAGE = "#0f0e0d";
const TEXT = "#f6f4f0";
const MUTED = 0.55;
/** Hairlines between the stat rows. */
const RULE = "rgba(255,255,255,0.09)";

const LEFT_X = 250;
const RIGHT_X = CARD_W - 250;
const FACE_Y = 300;
const FACE_R = 86;
const VERDICT_Y = 536;
const ROWS_TOP = 600;
const ROWS_BOTTOM = 1206;
const MAX_ROWS = 16;

/**
 * The site's stylesheet declares the faces; a canvas only gets them once they are
 * actually loaded, so ask for the weights the card draws before drawing anything.
 */
async function ensureSiteFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const wanted = [
    ...[400, 500, 700].map((w) => `${w} 40px "Familjen Grotesk"`),
    ...[400, 500, 700].map((w) => `${w} 40px "Martian Mono"`),
  ];
  await Promise.all(wanted.map((f) => document.fonts.load(f).catch(() => []))).catch(() => undefined);
}

/** Largest size at which the text fits in one line, in the face and weight it will be drawn with. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, max: number, min: number, o: Omit<TextOpts, "size">): number {
  for (let size = max; size > min; size -= 1) {
    setFont(ctx, { ...o, size });
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return min;
}

/** A side's colour as it is used for type: light enough to read on the dark page. */
function typeColour(hex: string): string {
  return themeFor("league", hex).accent;
}

/**
 * The page with a wash of each side's colour coming in from its own edge, and a softer
 * pool of it behind the crest, so the colours stay a tint and the numbers stay white.
 */
function drawPage(ctx: CanvasRenderingContext2D, left: string, right: string) {
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const wash = (hex: string, fromX: number, toX: number) => {
    const g = ctx.createLinearGradient(fromX, 0, toX, 0);
    g.addColorStop(0, withAlpha(hex, 0.38));
    g.addColorStop(0.5, withAlpha(hex, 0.1));
    g.addColorStop(1, withAlpha(hex, 0));
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(fromX, toX), 0, Math.abs(toX - fromX), CARD_H);
  };
  wash(left, 0, CARD_W / 2);
  wash(right, CARD_W, CARD_W / 2);
  const pool = (hex: string, cx: number) => {
    const g = ctx.createRadialGradient(cx, FACE_Y, 0, cx, FACE_Y, 320);
    g.addColorStop(0, withAlpha(hex, 0.26));
    g.addColorStop(1, withAlpha(hex, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - 320, FACE_Y - 320, 640, 640);
  };
  pool(left, LEFT_X);
  pool(right, RIGHT_X);
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string, banner: string, leagueName: string) {
  const cx = CARD_W / 2;
  let y = 46;
  if (leagueName) {
    y += drawSpaced(ctx, leagueName.toUpperCase(), cx, y, 4, { size: 18, weight: 500, family: SANS, align: "center", color: TEXT, alpha: MUTED }) + 26;
  }
  const heading: Omit<TextOpts, "size"> = { weight: 700, family: SANS, align: "center", color: TEXT };
  const size = fit(ctx, title, CARD_W - SIDE * 2 - 120, 58, 36, heading);
  y += drawSpaced(ctx, title, cx, y, 2, { ...heading, size }) + 20;
  drawSpaced(ctx, banner.toUpperCase(), cx, y, 3, { size: 19, weight: 500, family: SANS, align: "center", color: TEXT, alpha: 0.6 });
}

function drawSide(
  ctx: CanvasRenderingContext2D,
  side: ComparisonCardSide,
  cx: number,
  photo: HTMLImageElement | null,
  logo: HTMLImageElement | null,
  colour: string,
) {
  if (photo) {
    drawFace(ctx, photo, cx, FACE_Y, FACE_R, colour);
  } else if (logo) {
    // The crest as it is, on the page, with a little lift.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 8;
    drawContain(ctx, logo, cx - FACE_R, FACE_Y - FACE_R, FACE_R * 2, FACE_R * 2);
    ctx.restore();
  } else {
    drawCrest(ctx, cx, FACE_Y, FACE_R, null, initialsOf(side.name), themeFor("league", colour));
  }

  const maxW = 420;
  const name = side.name.toUpperCase();
  const nameOpts: Omit<TextOpts, "size"> = { weight: 700, family: SANS, align: "center", color: TEXT };
  const size = fit(ctx, name, maxW, 38, 22, nameOpts);
  let y = FACE_Y + FACE_R + 28;
  y += drawTextTop(ctx, name, cx, y, { ...nameOpts, size }) + 12;
  if (side.sub) {
    const sub = side.sub.toUpperCase();
    const subOpts: Omit<TextOpts, "size"> = { weight: 500, family: SANS, align: "center", color: TEXT, alpha: 0.65 };
    y += drawSpaced(ctx, sub, cx, y, 1.5, { ...subOpts, size: fit(ctx, sub, maxW, 19, 13, subOpts) }) + 10;
  }
  drawSpaced(ctx, `${side.games} ${side.games === 1 ? "GAME" : "GAMES"}`, cx, y, 2, { size: 15, weight: 500, family: SANS, align: "center", color: TEXT, alpha: MUTED });
}

/** One line on who leads more of the stats, the leader's name in its colour. */
function drawVerdict(ctx: CanvasRenderingContext2D, rows: ComparisonCardRow[], names: [string, string], colours: [string, string], kind: "player" | "team") {
  const leads = [rows.filter((r) => r.lead === 1).length, rows.filter((r) => r.lead === 2).length];
  const total = rows.length;
  const stats = (n: number) => `${n} ${n === 1 ? "STAT" : "STATS"}`;
  const parts: { text: string; color: string; alpha: number }[] =
    leads[0] === leads[1]
      ? [{ text: `LEVEL · ${stats(leads[0])} EACH OF ${total}`, color: TEXT, alpha: 0.7 }]
      : (() => {
          const k = leads[0] > leads[1] ? 0 : 1;
          return [
            { text: names[k].toUpperCase(), color: colours[k], alpha: 1 },
            { text: ` ${kind === "player" ? "LEADS" : "LEAD"} ${leads[k]} OF ${total} STATS`, color: TEXT, alpha: 0.7 },
          ];
        })();

  const spacing = 1.5;
  const full = parts.map((p) => p.text).join("");
  const base: Omit<TextOpts, "size"> = { weight: 700, family: SANS, align: "left" };
  const o: TextOpts = { ...base, size: fit(ctx, full, CARD_W - SIDE * 2 - 200, 25, 15, base) };
  const width = spacedWidth(ctx, full, spacing, o) - spacing;
  let x = CARD_W / 2 - width / 2;
  for (const p of parts) {
    drawSpaced(ctx, p.text, x, VERDICT_Y, spacing, { ...o, color: p.color, alpha: p.alpha });
    x += spacedWidth(ctx, p.text, spacing, o);
  }
}

/** Each stat: the label in the middle, a big number either side, the better one in its colour. */
function drawRows(ctx: CanvasRenderingContext2D, rows: ComparisonCardRow[], colours: [string, string]) {
  const rowH = Math.min(64, (ROWS_BOTTOM - ROWS_TOP) / rows.length);
  // Monospace numerals run wide, so they sit a touch smaller than the display face would.
  const valueSize = Math.min(42, Math.round(rowH * 0.72));
  const labelSize = Math.min(17, Math.round(rowH * 0.38));
  const gutter = 150;
  const innerL = CARD_W / 2 - gutter;
  const innerR = CARD_W / 2 + gutter;

  rows.forEach((row, i) => {
    const midY = ROWS_TOP + i * rowH + rowH / 2;
    if (i > 0) {
      ctx.fillStyle = RULE;
      ctx.fillRect(SIDE + 20, ROWS_TOP + i * rowH, CARD_W - (SIDE + 20) * 2, 1);
    }
    const sides = [
      { text: row.value1, lit: row.lead === 1, x: innerL, align: "right" as const },
      { text: row.value2, lit: row.lead === 2, x: innerR, align: "left" as const },
    ];
    sides.forEach((s, k) => {
      const o: TextOpts = {
        size: valueSize, weight: s.lit ? 700 : 400, family: MONO, align: s.align,
        color: s.lit ? colours[k] : TEXT, alpha: s.lit ? 1 : 0.45,
      };
      drawTextTop(ctx, s.text, s.x, midY - capHeight(ctx, o) / 2, o);
    });
    const labelBase: Omit<TextOpts, "size"> = { weight: 600, family: SANS, align: "center", color: TEXT, alpha: 0.6 };
    const label: TextOpts = { ...labelBase, size: Math.min(labelSize, fit(ctx, row.label.toUpperCase(), gutter * 2 - 40, labelSize, 10, labelBase)) };
    drawSpaced(ctx, row.label.toUpperCase(), CARD_W / 2, midY - capHeight(ctx, label) / 2, 1.5, label);
  });
}

export async function renderComparisonCard(opts: ComparisonCardOptions): Promise<HTMLCanvasElement> {
  const { kind, left, right, banner, centre, leagueLogoUrl, primaryHex } = opts;
  // "NBL Division One 2026-27" -> "NBL Division One": the season only crowds the top line.
  const leagueName = opts.leagueName.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
  const rows = opts.rows.slice(0, MAX_ROWS);

  const [logo, leagueLogo, photo1, photo2, crest1, crest2] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(leagueLogoUrl),
    fetchImg(left.photoUrl),
    fetchImg(right.photoUrl),
    fetchImg(left.logoUrl),
    fetchImg(right.logoUrl),
    ensureSiteFonts(),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;

  const leftHex = opts.split?.left || primaryHex;
  // Two sides in the same colour would be indistinguishable, so the right falls back to light grey.
  const rightHex = opts.split?.right || (leftHex === primaryHex ? "#c9c5bf" : primaryHex);
  const colours: [string, string] = [typeColour(leftHex), typeColour(rightHex)];

  drawPage(ctx, leftHex, rightHex);
  drawTitle(ctx, kind === "player" ? "PLAYER COMPARISON" : "TEAM COMPARISON", banner, leagueName);

  drawSide(ctx, left, LEFT_X, photo1, crest1, colours[0]);
  drawSide(ctx, right, RIGHT_X, photo2, crest2, colours[1]);

  // A series score is a number, so it takes the data face; the plain "VS" stays in the display face.
  const mid = centre ?? { text: "VS" };
  const midBase: Omit<TextOpts, "size"> = { weight: 700, family: centre ? MONO : SANS, align: "center", color: TEXT, alpha: centre ? 1 : 0.22 };
  const midOpts: TextOpts = { ...midBase, size: fit(ctx, mid.text, 190, centre ? 72 : 52, 32, midBase) };
  const midCap = capHeight(ctx, midOpts);
  drawTextTop(ctx, mid.text, CARD_W / 2, FACE_Y - midCap / 2, midOpts);
  if (mid.caption) {
    drawSpaced(ctx, mid.caption.toUpperCase(), CARD_W / 2, FACE_Y - midCap / 2 - 32, 3, { size: 15, weight: 500, family: SANS, align: "center", color: TEXT, alpha: MUTED });
  }

  if (rows.length > 0) {
    drawVerdict(ctx, rows, [left.name, right.name], colours, kind);
    drawRows(ctx, rows, colours);
  } else {
    // Nothing to compare in this category (some games carry no advanced stats): show the games themselves instead.
    const results = (opts.results ?? []).slice(0, 7);
    let y = results.length > 0 ? 620 : 800;
    y += drawSpaced(ctx, "NO STATS RECORDED IN THIS CATEGORY", CARD_W / 2, y, 3, { size: 20, weight: 500, family: SANS, align: "center", color: TEXT, alpha: MUTED }) + 54;
    for (const line of results) {
      const text = line.toUpperCase();
      const base: Omit<TextOpts, "size"> = { weight: 600, family: SANS, align: "center", color: TEXT };
      const o: TextOpts = { ...base, size: fit(ctx, text, CARD_W - SIDE * 2 - 60, 30, 18, base) };
      ctx.fillStyle = RULE;
      ctx.fillRect(SIDE + 20, y - 22, CARD_W - (SIDE + 20) * 2, 1);
      y += drawTextTop(ctx, text, CARD_W / 2, y, o) + 44;
    }
  }

  drawFooter(ctx, [logo, "statsthread", leagueLogo], leagueName);
  return canvas;
}

export async function generateComparisonCardBlob(opts: ComparisonCardOptions): Promise<Blob | null> {
  return canvasToBlob(await renderComparisonCard(opts));
}
