/**
 * The ranked bars card (1080×1350), in the shared Swish Social look (see cardStyle.ts): one
 * number down a list of players, each bar in that player's team colour. Bars start from zero,
 * so their lengths can be compared honestly.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { Leader } from "@/types/leaders";
import type { WeeklyCardBrand } from "@/types/weeklyAwards";
import {
  cleanTeamLabel,
  drawBackdrop,
  drawCrest,
  drawFace,
  drawHeader,
  drawVignette,
  themeFor,
  type CardStyle,
} from "@/lib/cardStyle";
import {
  CARD_H,
  CARD_W,
  capHeight,
  drawFooter,
  drawTextTop,
  ensureDisplayFont,
  fetchImg,
  fitSize,
  initialsOf,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

export type RankedBarsOptions = {
  style?: CardStyle;
  title: string;
  /** The line under the title, e.g. "Assists minus bad passes, per game". */
  banner: string;
  brand: WeeklyCardBrand;
  leaders: Leader[];
  /** Each player's club logo, keyed by player id. */
  logos?: Record<string, string | null>;
  /** Each player's team colour, keyed by player id; the card's colour where one is missing. */
  colours?: Record<string, string | null>;
  footnote?: string;
};

const TOP = 240;
const BOTTOM = 1196;
const RANK_X = 78;
const FACE_X = 168;
const NAME_X = 226;
const NAME_W = 300;
const BAR_X = 540;
const BAR_W = 480;

function channels(colour: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour)?.[1];
  if (hex) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const rgb = colour.match(/\d+(\.\d+)?/g);
  return rgb && rgb.length >= 3 ? (rgb.slice(0, 3).map(Number) as [number, number, number]) : null;
}

/** Near-black club colours vanish on a dark card, so those are lifted; returns the colour and the ink that reads on it. */
function barPaint(colour: string, fallback: string): { fill: string; ink: string } {
  const c = channels(colour) ?? channels(fallback) ?? [120, 120, 120];
  const luma = (v: number[]) => (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255;
  const lift = luma(c) < 0.16 ? 0.4 : 0;
  const shown = c.map((v) => Math.round(v + (255 - v) * lift));
  return { fill: `rgb(${shown.join(",")})`, ink: luma(shown) > 0.55 ? "#0b0706" : "#ffffff" };
}

export async function renderRankedBarsCard(opts: RankedBarsOptions): Promise<HTMLCanvasElement> {
  const { style = "league", title, banner, brand, leaders, logos = {}, colours = {}, footnote } = opts;
  await ensureDisplayFont();

  const [logo, leagueLogo, ...images] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(brand.leagueLogoUrl),
    ...leaders.map((l) => fetchImg(l.photoUrl)),
    ...leaders.map((l) => fetchImg(logos[l.id] ?? null)),
  ]);
  const photos = images.slice(0, leaders.length);
  const crests = images.slice(leaders.length);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const theme = themeFor(style, brand.primaryHex);

  drawBackdrop(ctx, theme, leagueLogo, { x: CARD_W / 2, y: 110 });
  drawVignette(ctx, theme);
  drawHeader(ctx, title, banner, brand.leagueName, theme);

  const rowH = Math.min(150, (BOTTOM - TOP) / Math.max(1, leaders.length));
  const barH = Math.round(rowH * 0.66);
  const faceR = Math.round(Math.min(46, rowH * 0.38));
  const crestR = Math.round(barH * 0.34);
  const most = Math.max(...leaders.map((l) => l.value), 0.01);

  leaders.forEach((l, i) => {
    const cy = TOP + rowH * (i + 0.5);
    const name = l.name.toUpperCase();
    const team = cleanTeamLabel(l.team_name ?? "");

    const rank: TextOpts = { size: Math.round(rowH * 0.42), weight: 700, align: "center", alpha: i === 0 ? 1 : 0.7 };
    drawTextTop(ctx, String(l.rank), RANK_X, cy - capHeight(ctx, rank) / 2, rank);

    const photo = photos[i];
    if (photo) drawFace(ctx, photo, FACE_X, cy, faceR, "rgba(255,255,255,0.75)");
    else drawCrest(ctx, FACE_X, cy, faceR, null, initialsOf(l.name), theme);

    const size = fitSize(ctx, name, NAME_W, Math.round(rowH * 0.3), 20, 700);
    const line: TextOpts = { size, weight: 700 };
    const sub: TextOpts = { size: Math.round(rowH * 0.17), weight: 500, alpha: 0.62 };
    const lineCap = capHeight(ctx, line);
    const subCap = capHeight(ctx, sub);
    const blockTop = cy - (lineCap + 9 + subCap) / 2;
    drawTextTop(ctx, name, NAME_X, blockTop, line);
    const small = l.detail ?? team.toUpperCase();
    sub.size = Math.min(sub.size, fitSize(ctx, small, NAME_W, sub.size, 13, 500));
    drawTextTop(ctx, small, NAME_X, blockTop + lineCap + 9, sub);

    const { fill, ink } = barPaint(colours[l.id] ?? theme.accent, theme.accent);
    const w = Math.max(10, (Math.max(0, l.value) / most) * BAR_W);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(BAR_X, cy - barH / 2, w, barH, 10);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    const crestRoom = crestR * 2 + 18;
    const crest = crests[i];
    if (crest && w > crestRoom) drawCrest(ctx, BAR_X + crestR + 9, cy, crestR, crest, "", theme);

    const valueText: TextOpts = { size: Math.round(barH * 0.46), weight: 700, align: "right", color: ink };
    
    const inside = w > crestRoom + 120;
    drawTextTop(ctx, l.display, inside ? BAR_X + w - 14 : BAR_X + w + 12, cy - capHeight(ctx, valueText) / 2, inside ? valueText : { ...valueText, align: "left", color: "#ffffff" });
  });

  drawFooter(ctx, [logo, "statsthread", leagueLogo], [brand.leagueName, footnote].filter(Boolean).join("  ·  "));
  return canvas;
}
