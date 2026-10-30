/**
 * The team Venn card (1080×1350), in the shared Swish Social look (see cardStyle.ts): three
 * overlapping top lists, with each club's crest in the region for the lists it makes. The clubs
 * that make all three sit in the middle.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { LandscapeTeam } from "@/types/landscape";
import type { WeeklyCardBrand } from "@/types/weeklyAwards";
import { LABEL_W, VENN_CIRCLES, packVenn, vennMasks, type VennCriterion } from "@/lib/vennLayout";
import {
  INK,
  cleanTeamLabel,
  drawBackdrop,
  drawCrest,
  drawHeader,
  drawSpaced,
  drawVignette,
  fitLines,
  spacedWidth,
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
  initialsOf,
  withAlpha,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

export type VennCardOptions = {
  style?: CardStyle;
  title: string;
  banner: string;
  brand: WeeklyCardBrand;
  teams: LandscapeTeam[];
  /** The three lists, in the order top, bottom left, bottom right. */
  criteria: VennCriterion[];
  /** How many teams make each list. */
  top: number;
  /** Each team's club logo, keyed by team id. */
  logos?: Record<string, string | null>;
  footnote?: string;
};

function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, fill: string) {
  const o: TextOpts = { size: 25, weight: 700, color: INK };
  const w = spacedWidth(ctx, text, 1.5, o) + 40;
  const h = 48;
  const x = Math.max(24, Math.min(CARD_W - 24 - w, cx - w / 2));
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  drawSpaced(ctx, text, x + w / 2, cy - capHeight(ctx, o) / 2, 1.5, { ...o, align: "center" });
}

export async function renderVennCard(opts: VennCardOptions): Promise<HTMLCanvasElement> {
  const { style = "league", title, banner, brand, teams, criteria, top, logos = {}, footnote } = opts;
  await ensureDisplayFont();

  const masks = vennMasks(teams, criteria, top);
  const members = teams.filter((t) => masks.has(t.id));
  const [logo, leagueLogo, ...clubLogos] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(brand.leagueLogoUrl),
    ...members.map((t) => fetchImg(logos[t.id] ?? null)),
  ]);
  const crestOf = new Map(members.map((t, i) => [t.id, clubLogos[i] ?? null]));

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const theme = themeFor(style, brand.primaryHex);

  drawBackdrop(ctx, theme, leagueLogo, { x: CARD_W / 2, y: 110 });
  drawVignette(ctx, theme);
  drawHeader(ctx, title, banner, brand.leagueName, theme);

  const colours = [theme.accent, "#5ad1e6", "#f4f1ea"];
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  VENN_CIRCLES.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(colours[i], 0.13);
    ctx.fill();
  });
  ctx.restore();
  ctx.save();
  ctx.lineWidth = 4;
  VENN_CIRCLES.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.strokeStyle = colours[i];
    ctx.stroke();
  });
  ctx.restore();

  const byMask = new Map<number, LandscapeTeam[]>();
  for (const t of members) {
    const m = masks.get(t.id) as number;
    byMask.set(m, [...(byMask.get(m) ?? []), t]);
  }
  const { r, label, spots } = packVenn(new Map(Array.from(byMask.entries()).map(([m, list]) => [m, list.length])));

  byMask.forEach((list, mask) => {
    const places = spots.get(mask) ?? [];
    list.forEach((t, i) => {
      const p = places[i];
      const name = cleanTeamLabel(t.name);
      drawCrest(ctx, p.x, p.y, r, crestOf.get(t.id) ?? null, initialsOf(name), theme);
      if (!label) return;
      const { lines, size } = fitLines(ctx, name.toUpperCase(), LABEL_W, 18, 13, 600);
      const o: TextOpts = { size, weight: 600, align: "center" };
      const lineH = capHeight(ctx, o) + 6;
      lines.slice(0, 2).forEach((text, n) => drawTextTop(ctx, text, p.x, p.y + r + 7 + n * lineH, o));
    });
  });

  if (byMask.has(7)) {
    const places = spots.get(7) ?? [];
    const topY = Math.min(...places.map((p) => p.y)) - r - 28;
    drawSpaced(ctx, "ALL THREE", 540, topY, 3, { size: 17, weight: 700, align: "center", alpha: 0.75 });
  }

  const [a, b, c] = VENN_CIRCLES;
  pill(ctx, `TOP ${top} ${criteria[0].pill}`, a.x, a.y - a.r, colours[0]);
  pill(ctx, `TOP ${top} ${criteria[1].pill}`, b.x - 60, b.y + b.r - 4, colours[1]);
  pill(ctx, `TOP ${top} ${criteria[2].pill}`, c.x + 60, c.y + c.r - 4, colours[2]);

  drawFooter(ctx, [logo, "statsthread", leagueLogo], [brand.leagueName, footnote].filter(Boolean).join("  ·  "));
  return canvas;
}
