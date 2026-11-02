/**
 * The team landscape cards (1080×1350), drawn on a canvas in the shared Swish Social
 * look (see cardStyle.ts): every club's crest plotted by one season number against
 * another, such as points scored against points allowed per 100 possessions. Which
 * numbers, and the wording that goes with them, come from a preset (landscapePresets.ts).
 * The better end of each axis is to the right and at the top, and the middle of each
 * axis is the league's own figure.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { LandscapeMetrics, LandscapeTeam } from "@/types/landscape";
import type { WeeklyCardBrand } from "@/types/weeklyAwards";
import { placeLabels, spreadPoints, tickValues } from "@/lib/landscapeLayout";
import { formatMetric, landscapeCallouts, type LandscapeAxis, type LandscapePreset, type QuadrantLabels } from "@/lib/landscapePresets";
import {
  INK,
  cleanTeamLabel,
  drawBackdrop,
  drawCrest,
  drawGlow,
  drawHeader,
  drawSpaced,
  drawVignette,
  fitLines,
  spacedWidth,
  themeFor,
  type CardStyle,
  type Theme,
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

export type LandscapeCardOptions = {
  /** Which of the three looks to draw; defaults to `league`. */
  style?: CardStyle;
  /** Which two numbers are plotted, and the wording for them. */
  preset: LandscapePreset;
  /** Teams with a value on both axes. */
  teams: LandscapeTeam[];
  /** The league's own figures; the teams' mean is used where one is missing. */
  averages: LandscapeMetrics;
  /** The line under the title, e.g. "Through 42 games". */
  banner: string;
  brand: WeeklyCardBrand;
  /** Each team's club logo, in the same order as `teams`. */
  teamLogoUrls?: (string | null)[];
  /** The corner labels; the preset's own when left out. */
  quadrants?: QuadrantLabels;
  /** A team to pick out with a ring and its name. */
  highlightId?: string | null;
  /** Small print added to the footer, e.g. "Min. 2 games". */
  footnote?: string;
  /** Names the best and worst teams beside their crests. */
  showCallouts?: boolean;
};

/** Where a team's crest ended up on the card, for the studio's hover details. */
export type PlottedTeam = { id: string; x: number; y: number; r: number };

const PLOT_L = 140;
const PLOT_T = 258;
const PLOT_S = 870;
const PLOT_R = PLOT_L + PLOT_S;
const PLOT_B = PLOT_T + PLOT_S;
const MID_X = PLOT_L + PLOT_S / 2;
const MID_Y = PLOT_T + PLOT_S / 2;

function crestRadius(count: number): number {
  if (count <= 8) return 50;
  if (count <= 12) return 44;
  if (count <= 16) return 39;
  if (count <= 24) return 36;
  return 30;
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

/** The chart's floor: a dark panel and, where one corner is the place to be, a lift of colour there and a shadow opposite. */
function drawPanel(ctx: CanvasRenderingContext2D, theme: Theme, bestTopRight: boolean) {
  ctx.save();
  roundedRect(ctx, PLOT_L, PLOT_T, PLOT_S, PLOT_S, 22);
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fill();
  ctx.clip();
  if (!bestTopRight) {
    ctx.restore();
    return;
  }
  drawGlow(ctx, PLOT_R - 40, PLOT_T + 40, PLOT_S * 0.62, theme.accent, 0.3);
  const sink = ctx.createRadialGradient(PLOT_L, PLOT_B, 0, PLOT_L, PLOT_B, PLOT_S * 0.62);
  sink.addColorStop(0, "rgba(0,0,0,0.42)");
  sink.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sink;
  ctx.fillRect(PLOT_L, PLOT_T, PLOT_S, PLOT_S);
  ctx.restore();
}

function drawQuadrantLabels(ctx: CanvasRenderingContext2D, q: QuadrantLabels, theme: Theme, bestTopRight: boolean) {
  const inset = 30;
  const maxW = PLOT_S / 2 - inset * 2;
  const corners: { text: string; right: boolean; bottom: boolean; best?: boolean }[] = [
    { text: q.topLeft, right: false, bottom: false },
    { text: q.topRight, right: true, bottom: false, best: bestTopRight },
    { text: q.bottomLeft, right: false, bottom: true },
    { text: q.bottomRight, right: true, bottom: true },
  ];
  for (const c of corners) {
    const text = c.text.trim().toUpperCase();
    if (!text) continue;
    const { lines, size } = fitLines(ctx, text, maxW, 68, 26, 700);
    const o: TextOpts = {
      size,
      weight: 700,
      align: c.right ? "right" : "left",
      color: c.best ? theme.accent : "#ffffff",
      alpha: c.best ? 0.36 : 0.15,
    };
    const cap = capHeight(ctx, o);
    const gap = Math.round(size * 0.26);
    const blockH = lines.length * cap + (lines.length - 1) * gap;
    let y = c.bottom ? PLOT_B - inset - blockH : PLOT_T + inset;
    for (const line of lines) {
      drawTextTop(ctx, line, c.right ? PLOT_R - inset : PLOT_L + inset, y, o);
      y += cap + gap;
    }
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, dir: 1 | -1, colour: string) {
  const tip = x + dir * length;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tip, y);
  ctx.moveTo(tip - dir * 9, y - 7);
  ctx.lineTo(tip, y);
  ctx.lineTo(tip - dir * 9, y + 7);
  ctx.stroke();
  ctx.restore();
}

/**
 * One axis caption, running left to right along `y` from 0 to PLOT_S: the lesser end, what
 * the axis measures, the better end. The caller turns the canvas for the upright axis.
 */
function drawAxisCaption(ctx: CanvasRenderingContext2D, y: number, axis: LandscapeAxis, theme: Theme) {
  const arrow = 30;
  const side: TextOpts = { size: 21, weight: 600 };
  const cap = capHeight(ctx, side);
  const top = y - cap / 2;
  const [low, high] = axis.ends;
  // Where neither end is the good one, both are set the same.
  const lowAlpha = axis.neutral ? 0.82 : 0.62;
  const highColour = axis.neutral ? "#ffffff" : theme.accent;

  drawArrow(ctx, arrow + 2, y, arrow, -1, `rgba(255,255,255,${lowAlpha})`);
  drawSpaced(ctx, low, arrow + 14, top, 2.5, { ...side, alpha: lowAlpha });

  drawArrow(ctx, PLOT_S - arrow - 2, y, arrow, 1, axis.neutral ? `rgba(255,255,255,${lowAlpha})` : theme.accent);
  drawSpaced(ctx, high, PLOT_S - arrow - 14, top, 2.5, { ...side, color: highColour, alpha: axis.neutral ? lowAlpha : 1, align: "right" });

  // What is measured goes in whatever room the two ends leave, centred between them.
  const lowEnd = arrow + 14 + spacedWidth(ctx, low, 2.5, side);
  const highStart = PLOT_S - arrow - 14 - spacedWidth(ctx, high, 2.5, side);
  const mid: TextOpts = { size: 17, weight: 500, alpha: 0.46, align: "center" };
  while (mid.size > 11 && spacedWidth(ctx, axis.title, 3, mid) > highStart - lowEnd - 36) mid.size -= 1;
  drawSpaced(ctx, axis.title, (lowEnd + highStart) / 2, y - capHeight(ctx, mid) / 2, 3, mid);
}

/** A small pill with a centred label, kept inside the chart; used for the league averages and a highlighted team. */
function drawPill(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, fill: string, o: TextOpts) {
  const w = spacedWidth(ctx, text, 1.5, o) - 1.5 + 26;
  const h = 32;
  const x = Math.max(PLOT_L + 8, Math.min(PLOT_R - 8 - w, cx - w / 2));
  ctx.save();
  roundedRect(ctx, x, top, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  drawSpaced(ctx, text, x + w / 2, top + (h - capHeight(ctx, o)) / 2, 1.5, { ...o, align: "center" });
}

/** Shrinks a pill's text until the pill fits across most of the chart. */
function fitPillText(ctx: CanvasRenderingContext2D, text: string, o: TextOpts): TextOpts {
  const fitted = { ...o };
  while (fitted.size > 12 && spacedWidth(ctx, text, 1.5, fitted) + 26 > PLOT_S * 0.8) fitted.size -= 1;
  return fitted;
}

const WORST_RED = "#ff8f7d";

/** The words beside the standout teams: ranks for the best, and who is bottom of each number. */
function drawCallouts(ctx: CanvasRenderingContext2D, teams: LandscapeTeam[], preset: LandscapePreset, at: { x: number; y: number }[], r: number, theme: Theme) {
  const callouts = landscapeCallouts(teams, preset);
  if (callouts.length === 0) return;
  const size = teams.length > 16 ? 19 : 22;
  const line: TextOpts = { size, weight: 700 };
  const cap = capHeight(ctx, line);
  const gap = Math.round(size * 0.42);
  const pad = 9;
  const sizes = callouts.map((c) => ({
    w: Math.ceil(Math.max(...c.lines.map((l) => spacedWidth(ctx, l.text, 1.2, line)))) + pad * 2,
    h: c.lines.length * cap + (c.lines.length - 1) * gap + pad * 2,
  }));
  const crests = at.map((p) => ({ ...p, r }));
  const targets = callouts.map((c) => crests[teams.findIndex((t) => t.id === c.teamId)]);
  const boxes = placeLabels(targets, sizes, crests, { left: PLOT_L + 8, top: PLOT_T + 8, right: PLOT_R - 8, bottom: PLOT_B - 8 });
  callouts.forEach((c, i) => {
    const b = boxes[i];
    ctx.save();
    roundedRect(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fillStyle = "rgba(8,8,10,0.74)";
    ctx.fill();
    ctx.restore();
    c.lines.forEach((l, n) => {
      drawSpaced(ctx, l.text, b.x + pad, b.y + pad + n * (cap + gap), 1.2, { ...line, color: l.tone === "best" ? theme.accent : WORST_RED });
    });
  });
}

export async function renderLandscapeCard(opts: LandscapeCardOptions): Promise<{ canvas: HTMLCanvasElement; plotted: PlottedTeam[] }> {
  const { style = "league", preset, teams, averages, banner, brand, teamLogoUrls = [], highlightId, footnote, showCallouts = false } = opts;
  const quadrants = opts.quadrants ?? preset.quadrants;
  const { x: xAxis, y: yAxis } = preset;
  await ensureDisplayFont();

  const [logo, leagueLogo, ...clubLogos] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(brand.leagueLogoUrl),
    ...teams.map((_, i) => fetchImg(teamLogoUrls[i])),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const theme = themeFor(style, brand.primaryHex);

  // In the court style the chart sits on the half court, the basket just above it.
  drawBackdrop(ctx, theme, leagueLogo, { x: CARD_W / 2, y: PLOT_T - 150 });
  drawVignette(ctx, theme);
  drawHeader(ctx, preset.title, banner, brand.leagueName, theme);
  drawPanel(ctx, theme, preset.bestTopRight);

  // ── scale: each axis centred on the league's figure, reaching as far as its furthest team ──
  const valueOf = (t: LandscapeTeam, axis: LandscapeAxis) => t.metrics[axis.metric] ?? 0;
  const centre = (axis: LandscapeAxis) =>
    averages[axis.metric] ?? (teams.length ? teams.reduce((sum, t) => sum + valueOf(t, axis), 0) / teams.length : 0);
  const spreadOf = (axis: LandscapeAxis, mid: number) => Math.max(1, ...teams.map((t) => Math.abs(valueOf(t, axis) - mid)));
  const avgX = centre(xAxis);
  const avgY = centre(yAxis);
  let halfX = spreadOf(xAxis, avgX);
  let halfY = spreadOf(yAxis, avgY);
  if (preset.sharedScale) halfX = halfY = Math.max(halfX, halfY);
  const r = crestRadius(teams.length);
  const reach = PLOT_S / 2 - r - 18;
  // The better end goes right and up, so an axis where lower is better runs backwards.
  const dirX = xAxis.lowerIsBetter ? -1 : 1;
  const dirY = yAxis.lowerIsBetter ? -1 : 1;
  const toX = (v: number) => MID_X + dirX * ((v - avgX) / halfX) * reach;
  const toY = (v: number) => MID_Y - dirY * ((v - avgY) / halfY) * reach;

  // ── grid, tick values and the league-average crosshair ──
  const shown = PLOT_S / 2 / reach;
  const tick: TextOpts = { size: 19, weight: 500, alpha: 0.5 };
  const tickCap = capHeight(ctx, tick);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.075)";
  for (const v of tickValues(avgX, halfX * shown)) {
    const x = toX(v);
    if (x < PLOT_L + 26 || x > PLOT_R - 26) continue;
    ctx.fillRect(Math.round(x), PLOT_T, 1.5, PLOT_S);
    drawTextTop(ctx, String(v), x, PLOT_B + 12, { ...tick, align: "center" });
  }
  for (const v of tickValues(avgY, halfY * shown)) {
    const y = toY(v);
    if (y < PLOT_T + 26 || y > PLOT_B - 26) continue;
    ctx.fillRect(PLOT_L, Math.round(y), PLOT_S, 1.5);
    drawTextTop(ctx, String(v), PLOT_L - 12, y - tickCap / 2, { ...tick, align: "right" });
  }
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(MID_X - 1, PLOT_T, 2, PLOT_S);
  ctx.fillRect(PLOT_L, MID_Y - 1, PLOT_S, 2);
  ctx.restore();

  ctx.save();
  roundedRect(ctx, PLOT_L, PLOT_T, PLOT_S, PLOT_S, 22);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  drawQuadrantLabels(ctx, quadrants, theme, preset.bestTopRight);
  const avgPill: TextOpts = { size: 17, weight: 600, alpha: 0.9 };
  const pillFill = "rgba(8,8,10,0.82)";
  // Each line of the crosshair carries its own league figure, unless the two axes share one.
  drawPill(ctx, `LEAGUE AVG ${formatMetric(avgX, xAxis)}`, MID_X, PLOT_T + 12, pillFill, avgPill);
  if (!preset.sharedScale) drawPill(ctx, `LEAGUE AVG ${formatMetric(avgY, yAxis)}`, PLOT_R, MID_Y - 16, pillFill, avgPill);

  // ── axis captions: one along the bottom, one up the left side ──
  ctx.save();
  ctx.translate(PLOT_L, PLOT_B + 56);
  drawAxisCaption(ctx, 0, xAxis, theme);
  ctx.restore();
  ctx.save();
  ctx.translate(72, PLOT_B);
  ctx.rotate(-Math.PI / 2);
  drawAxisCaption(ctx, 0, yAxis, theme);
  ctx.restore();

  // ── crests: where top right is best, the weakest go down first so the best end up on top ──
  const truth = teams.map((t) => ({ x: toX(valueOf(t, xAxis)), y: toY(valueOf(t, yAxis)) }));
  const at = spreadPoints(truth, r, { left: PLOT_L, top: PLOT_T, right: PLOT_R, bottom: PLOT_B });
  const order = teams.map((_, i) => i).sort((a, b) => truth[a].x - truth[a].y - (truth[b].x - truth[b].y));

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  for (const i of order) {
    // A crest that had to move a long way keeps a thread back to where the team really is.
    if (Math.hypot(at[i].x - truth[i].x, at[i].y - truth[i].y) < r * 0.6) continue;
    ctx.beginPath();
    ctx.moveTo(truth[i].x, truth[i].y);
    ctx.lineTo(at[i].x, at[i].y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(truth[i].x, truth[i].y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  for (const i of order) {
    const label = cleanTeamLabel(teams[i].name);
    drawCrest(ctx, at[i].x, at[i].y, r, clubLogos[i] ?? null, initialsOf(label), theme);
  }

  if (showCallouts) drawCallouts(ctx, teams, preset, at, r, theme);

  const hi = highlightId ? teams.findIndex((t) => t.id === highlightId) : -1;
  if (hi >= 0) {
    const p = at[hi];
    const team = teams[hi];
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 6;
    ctx.shadowColor = withAlpha(theme.accent, 0.8);
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // The crest is drawn again so the ring's glow doesn't sit over it.
    drawCrest(ctx, p.x, p.y, r, clubLogos[hi] ?? null, initialsOf(cleanTeamLabel(team.name)), theme);
    const numbers = preset.highlightMetric
      ? `${formatMetric(team.metrics[preset.highlightMetric.metric], { signed: true })} ${preset.highlightMetric.short}`
      : `${formatMetric(valueOf(team, xAxis), xAxis)} ${xAxis.short}  ·  ${formatMetric(valueOf(team, yAxis), yAxis)} ${yAxis.short}`;
    const text = `${cleanTeamLabel(team.name).toUpperCase()}  ${numbers}`;
    const below = p.y + r + 16 + 32 < PLOT_B - 8;
    drawPill(ctx, text, p.x, below ? p.y + r + 16 : p.y - r - 16 - 32, theme.accent, fitPillText(ctx, text, { size: 19, weight: 700, color: INK }));
  }

  drawFooter(ctx, [logo, "statsthread", leagueLogo], [brand.leagueName, preset.footnote, footnote].filter(Boolean).join("  ·  "));

  return { canvas, plotted: teams.map((t, i) => ({ id: t.id, x: at[i].x, y: at[i].y, r })) };
}
