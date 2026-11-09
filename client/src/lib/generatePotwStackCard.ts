/**
 * Player of the Week in the stacked look (1080×1350): the player's cut-out right of
 * centre with a glow in the accent, a ladder of numbers down the left with the winning
 * row ringed by a hand-drawn ellipse, an italic line of context and a small footer.
 * Three readings of the same week share the layout: the winner's box score against
 * their season averages, the week's top five by Swish Score, or the game and then the
 * season behind it. Every number comes from the weekly-awards response.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { WeeklyAward, WeeklyCardBrand } from "@/types/weeklyAwards";
import { CARD_H, CARD_W, capHeight, drawContain, fetchImg, type PhotoFraming } from "@/lib/generateWeeklyCards";
import { cleanTeamLabel, drawSpaced, spacedWidth } from "@/lib/cardStyle";
import {
  DEFAULT_ACCENT,
  body,
  drawGrain,
  drawItalic,
  drawText,
  ensureFonts,
  fadeLayer,
  hexToRgb,
  italicWidth,
  layer,
  placeCover,
  placeCutout,
  poster,
  withAlpha,
  type Box,
  type Framing,
  type ItalicOpts,
} from "@/lib/generatePerformanceStyles";

export type StackReading = "box" | "shortlist" | "season";

export const STACK_READINGS: { id: StackReading; label: string; hint: string }[] = [
  { id: "box", label: "Box score", hint: "The winner's line as the ladder, each stat against their season average" },
  { id: "shortlist", label: "Shortlist", hint: "The week's top five by Swish Score, the winner ringed" },
  { id: "season", label: "Season", hint: "The game and its Swish Score, then the season behind it" },
];

export type StackOptions = {
  reading?: StackReading;
  accent?: string;
  /** "2 Nov – 8 Nov", shown after the competition in the header. */
  weekLabel?: string;
  teamLogoUrl?: string | null;
  framing?: PhotoFraming;
  showGameScore?: boolean;
};

const RIGHT = 470; // the ladder and header hang off this edge
const LADDER_TOP = 452;
const ROW_GAP = 22;
const FIGURE: Box = { x: 536, y: 112, w: 401, h: 1050 };
const INTER_ITALIC = '"Inter", Arial, Helvetica, sans-serif';

type Row = { label: string; sub: string; subShort?: string; value: string; opacity: number; accent?: boolean };
const LEFT = 24; // nothing on the ladder side runs closer to the edge than this

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const split = (made: number | null, att: number | null) => (made == null || att == null ? null : `${made}/${att}`);

function ordinal(rank: number): string {
  if (rank === 1) return "BEST";
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? "TH" : rank % 10 === 1 ? "ST" : rank % 10 === 2 ? "ND" : rank % 10 === 3 ? "RD" : "TH";
  return `${rank}${suffix}-BEST`;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase();
}

function shorterDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
}

/** "Birmingham City University" → "BCU" when the full name will not fit beside the numbers. */
function clubInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  return words.length >= 2 ? words.map((w) => w[0].toUpperCase()).join("") : name;
}

/** The largest size, stepping down to `min`, at which tracked text fits `maxWidth`. */
function fitTracked(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, spacingEm: number, make: (size: number) => TextOptsLike, min: number): number {
  let s = size;
  while (s > min && spacedWidth(ctx, text, s * spacingEm, make(s)) - s * spacingEm > maxWidth) s -= 1;
  return s;
}

type TextOptsLike = ReturnType<typeof body>;

function competitionShort(name: string): string {
  return name
    .replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "")
    .replace(/\s+\d{2}[-/–]\d{2}$/, "")
    .trim()
    .toUpperCase();
}

/** "W 128-127" → [128, 127, true]. */
function scores(result: string | null): [number, number, boolean] | null {
  const m = /^([WLT])\s+(\d+)-(\d+)/.exec(result || "");
  return m ? [Number(m[2]), Number(m[3]), m[1] === "W"] : null;
}

function statSentence(a: WeeklyAward): string {
  const parts = [`${n(a.pts)} PTS`, `${n(a.reb)} REB`, `${n(a.ast)} AST`];
  if (n(a.stl) >= 2 || n(a.blk) < 2) parts.push(`${n(a.stl)} STL`);
  else parts.push(`${n(a.blk)} BLK`);
  const line = `${parts.slice(0, -1).join(", ")} AND ${parts[parts.length - 1]}`;
  const sc = scores(a.game_result);
  const opp = cleanTeamLabel(a.opponent_name).toUpperCase();
  if (!sc || !opp) return `${line}.`;
  return `${line} IN A ${sc[0]}–${sc[1]} ${sc[2] ? "WIN OVER" : "LOSS TO"} ${opp}.`;
}

function splitsSentence(a: WeeklyAward): string {
  const parts = [
    split(a.fgm, a.fga) && `${split(a.fgm, a.fga)} FG`,
    split(a.tpm, a.tpa) && `${split(a.tpm, a.tpa)} 3PT`,
    split(a.ftm, a.fta) && `${split(a.ftm, a.fta)} FT`,
  ].filter(Boolean) as string[];
  const mins = typeof a.minutes === "number" ? a.minutes : Number(String(a.minutes || "").split(":")[0]);
  if (Number.isFinite(mins) && mins > 0) parts.push(`${Math.round(mins)} MINUTES`);
  return parts.length ? `${parts.join(" · ")}.` : "";
}

function marginSentence(awards: WeeklyAward[], showGameScore: boolean): string {
  const [best, next] = awards;
  if (!showGameScore || best?.game_score == null) return "";
  if (next?.game_score == null) return `SWISH SCORE ${one(n(best.game_score))}, THE BEST GAME IN THE DIVISION THIS WEEK.`;
  const gap = n(best.game_score) - n(next.game_score);
  return `SWISH SCORE ${one(n(best.game_score))}, ${one(gap)} CLEAR OF THE NEXT BEST GAME IN THE DIVISION THIS WEEK.`;
}

function rowsFor(reading: StackReading, awards: WeeklyAward[], showGameScore: boolean): Row[] {
  const a = awards[0];
  const s = a.season;
  if (reading === "shortlist") {
    const fade = [1, 0.5, 0.36, 0.26, 0.18];
    return awards.slice(0, 5).map((w, i) => {
      const extras = [`${n(w.pts)} PTS`];
      if (n(w.reb) >= 10) extras.push(`${n(w.reb)} REB`);
      else if (n(w.ast) >= 10) extras.push(`${n(w.ast)} AST`);
      const club = cleanTeamLabel(w.team_name).toUpperCase();
      return {
        label: w.full_name.toUpperCase(),
        sub: [club, ...extras].filter(Boolean).join(" · "),
        // the same line with the club abbreviated, for when the full name will not fit
        subShort: [clubInitials(club), ...extras].filter(Boolean).join(" · "),
        value: w.game_score == null ? "—" : one(n(w.game_score)),
        opacity: fade[i],
      };
    });
  }
  if (reading === "season" && s) {
    const opp = cleanTeamLabel(a.opponent_name).toUpperCase();
    return [
      { label: "POINTS", sub: [shorterDate(a.game_date), opp && `V ${opp}`].filter(Boolean).join(" · "), value: String(n(a.pts)), opacity: 1 },
      ...(showGameScore && a.game_score != null
        ? [{ label: "SWISH SCORE", sub: `${ordinal(s.score_rank)} GAME OF THE SEASON`, value: one(n(a.game_score)), opacity: 0.72 }]
        : []),
      { label: "POINTS PER GAME", sub: `${s.games} GAME${s.games === 1 ? "" : "S"} THIS SEASON`, value: one(s.ppg), opacity: 0.58 },
      { label: "POINTS THIS SEASON", sub: `${s.games} GAME${s.games === 1 ? "" : "S"}`, value: String(s.total_pts), opacity: 0.46 },
      { label: "REBOUNDS PER GAME", sub: `${n(a.reb)} IN THIS ONE`, value: one(s.rpg), opacity: 0.34 },
    ].slice(0, 5);
  }
  const avg = (v: number | undefined) => (s && v != null ? `SEASON AVERAGE ${one(v)}` : "THIS GAME");
  const rows: Row[] = [
    { label: "POINTS", sub: avg(s?.ppg), value: String(n(a.pts)), opacity: 1 },
    { label: "REBOUNDS", sub: avg(s?.rpg), value: String(n(a.reb)), opacity: 0.72 },
    { label: "ASSISTS", sub: avg(s?.apg), value: String(n(a.ast)), opacity: 0.58 },
    { label: "STEALS", sub: avg(s?.spg), value: String(n(a.stl)), opacity: 0.46 },
  ];
  if (showGameScore && a.game_score != null) {
    rows.push({ label: "SWISH SCORE", sub: "BEST IN THE DIVISION THIS WEEK", value: one(n(a.game_score)), opacity: 1, accent: true });
  } else {
    rows.push({ label: "BLOCKS", sub: avg(s?.bpg), value: String(n(a.blk)), opacity: 0.34 });
  }
  return rows;
}

function contextLines(reading: StackReading, awards: WeeklyAward[], showGameScore: boolean): string[] {
  const a = awards[0];
  const margin = marginSentence(awards, showGameScore);
  if (reading === "box") return [splitsSentence(a), margin].filter(Boolean);
  if (reading === "shortlist") return [statSentence(a), margin].filter(Boolean);
  return [statSentence(a), splitsSentence(a)].filter(Boolean);
}

/** The two-pass hand-drawn ring from the mock-up, in a 380×150 box, stretched to `w`. */
function drawRing(ctx: CanvasRenderingContext2D, right: number, cy: number, w: number, accent: string) {
  const outer = new Path2D("M 56 30 C 140 2, 290 0, 350 36 C 392 64, 370 120, 286 136 C 200 152, 80 150, 36 112 C 4 84, 16 46, 82 26");
  const inner = new Path2D("M 84 22 C 170 4, 306 8, 360 48 C 386 72, 362 112, 304 128");
  ctx.save();
  ctx.translate(right + 36 - w, cy - 75);
  ctx.scale(w / 380, 1);
  ctx.strokeStyle = accent;
  ctx.lineCap = "round";
  ctx.lineWidth = 5 * (380 / w);
  ctx.stroke(outer);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3 * (380 / w);
  ctx.stroke(inner);
  ctx.restore();
}

/** A glow in the accent that hugs the figure's silhouette, then its cast shadow, then the figure. */
function drawFigure(ctx: CanvasRenderingContext2D, img: HTMLImageElement, placement: { left: number; top: number; dw: number; dh: number }, accent: string) {
  const { left, top, dw, dh } = placement;
  const off = 10000;
  const glow = (blur: number, alpha: number) => {
    ctx.save();
    ctx.shadowColor = withAlpha(accent, alpha);
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = -off;
    ctx.drawImage(img, left + off, top, dw, dh);
    ctx.restore();
  };
  glow(3, 0.7);
  glow(24, 0.45);
  glow(72, 0.22);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetX = -off;
  ctx.shadowOffsetY = 40;
  ctx.drawImage(img, left + off, top, dw, dh);
  ctx.restore();
  ctx.save();
  if (typeof (ctx as { filter?: unknown }).filter === "string") ctx.filter = "contrast(1.05) saturate(0.92)";
  ctx.drawImage(img, left, top, dw, dh);
  ctx.restore();
}

/** Without a cut-out: the game photo over the right of the card, melting in on its left and at the foot. */
function drawPhotoFallback(ctx: CanvasRenderingContext2D, img: HTMLImageElement, fr: Framing) {
  const box: Box = { x: 440, y: 40, w: CARD_W - 440, h: 1140 };
  const p = placeCover(img, box, fr);
  const [sheet, s] = layer();
  s.save();
  s.beginPath();
  s.rect(box.x, box.y, box.w, box.h);
  s.clip();
  s.drawImage(img, p.left, p.top, p.dw, p.dh);
  s.restore();
  // Dim it a little so the type and the ladder stay in charge.
  s.fillStyle = "rgba(14,12,17,0.22)";
  s.fillRect(box.x, box.y, box.w, box.h);
  const side = s.createLinearGradient(box.x, 0, box.x + 260, 0);
  side.addColorStop(0, "rgba(0,0,0,0)");
  side.addColorStop(1, "rgba(0,0,0,1)");
  s.globalCompositeOperation = "destination-in";
  s.fillStyle = side;
  s.fillRect(0, 0, CARD_W, CARD_H);
  fadeLayer(s, box.y + box.h - 300, box.y + box.h);
  ctx.drawImage(sheet, 0, 0);
}

/** A slow, cloudy mottle: the grain tile drawn big and soft under the fine grain. */
function drawMottle(ctx: CanvasRenderingContext2D) {
  const [sheet, s] = layer();
  drawGrain(s, 1, "source-over");
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.globalCompositeOperation = "soft-light";
  if (typeof (ctx as { filter?: unknown }).filter === "string") ctx.filter = "blur(26px)";
  ctx.drawImage(sheet, 0, 0, CARD_W / 7, CARD_H / 7, -40, -40, CARD_W + 80, CARD_H + 80);
  ctx.restore();
}

function framingOf(fr: PhotoFraming | undefined): Framing {
  return {
    zoom: Math.max(0.4, Math.min(3, fr?.zoom ?? 1)),
    x: Math.max(0, Math.min(100, 50 + (fr?.x ?? 0))),
    y: Math.max(0, Math.min(100, 50 + (fr?.y ?? 0))),
    focusY: 50,
  };
}

export async function renderPotwStack(
  awards: WeeklyAward[],
  brand: WeeklyCardBrand,
  options: StackOptions = {},
): Promise<HTMLCanvasElement> {
  const { accent = DEFAULT_ACCENT, weekLabel = "", teamLogoUrl, showGameScore = true } = options;
  const winner = awards[0];
  if (!winner) throw new Error("No player for this week");
  const reading: StackReading = options.reading === "season" && !winner.season ? "box" : options.reading || "box";
  await ensureFonts();
  const [cutout, photo, swish, crest, leagueLogo] = await Promise.all([
    fetchImg(winner.cutoutUrl),
    fetchImg(winner.photoUrl),
    fetchImg(swishLogoSrc),
    fetchImg(teamLogoUrl),
    fetchImg(brand.leagueLogoUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";

  // ── ground ──
  const [ar, ag, ab] = hexToRgb(accent);
  ctx.fillStyle = `rgb(${Math.round(14 + (ar - 14) * 0.04)},${Math.round(12 + (ag - 12) * 0.04)},${Math.round(17 + (ab - 17) * 0.04)})`;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const haze = (cx: number, cy: number, rx: number, ry: number, colour: string, edge: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, colour);
    g.addColorStop(edge, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  };
  haze(CARD_W * 0.66, CARD_H * 0.4, CARD_W * 0.46, CARD_H * 0.42, "rgba(255,255,255,0.14)", 0.7);
  haze(CARD_W * 0.7, CARD_H * 0.48, CARD_W * 0.6, CARD_H * 0.52, withAlpha(accent, 0.16), 0.72);
  const foot = ctx.createLinearGradient(0, CARD_H * 0.6, 0, CARD_H);
  foot.addColorStop(0, "rgba(0,0,0,0)");
  foot.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = foot;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // ── the player ──
  const fr = framingOf(options.framing);
  if (cutout) {
    drawFigure(ctx, cutout, placeCutout(cutout, FIGURE, fr), accent);
  } else if (photo) {
    drawPhotoFallback(ctx, photo, fr);
  }

  // ── marks ──
  if (swish) drawContain(ctx, swish, 60, 56, 64, 64);
  if (leagueLogo) drawContain(ctx, leagueLogo, CARD_W - 60 - 64, 56, 64, 64);

  // ── header, hanging off the ladder's right edge ──
  const competition = competitionShort(brand.leagueName);
  const headerLine = [competition, weekLabel.toUpperCase()].filter(Boolean).join(" · ");
  let y = reading === "shortlist" ? 286 : 228;
  const headWidth = RIGHT - LEFT;
  const tracked = (text: string, top: number, size: number, weight: number, spacingEm: number, colour: string) => {
    const fitted = fitTracked(ctx, text, headWidth, size, spacingEm, (s) => body(s, weight), 9);
    const o = body(fitted, weight, { color: colour, align: "right" });
    drawSpaced(ctx, text, RIGHT, top, fitted * spacingEm, o);
    return capHeight(ctx, o);
  };
  y += tracked(headerLine, y, 12, 700, 0.3, "rgba(255,255,255,0.55)") + 14;
  const titleSize = fitTracked(ctx, "PLAYER OF THE WEEK", headWidth, 58, 0.02, (s) => poster(s), 40);
  const title = poster(titleSize, { color: "#ffffff", align: "right" });
  drawSpaced(ctx, "PLAYER OF THE WEEK", RIGHT, y, titleSize * 0.02, title);
  y += capHeight(ctx, title) + 18;
  ctx.fillStyle = accent;
  ctx.fillRect(RIGHT - 56, y, 56, 3);
  y += 3 + 18;
  if (reading === "shortlist") {
    tracked("THE WEEK'S TOP FIVE BY SWISH SCORE", y - 2, 12, 600, 0.22, "rgba(255,255,255,0.36)");
  } else {
    y += tracked(winner.full_name.toUpperCase(), y, 18, 700, 0.14, "#ffffff") + 7;
    const club = cleanTeamLabel(winner.team_name).toUpperCase();
    tracked([club, winner.shirt && `#${winner.shirt}`].filter(Boolean).join(" · "), y, 12, 600, 0.18, "rgba(255,255,255,0.62)");
  }

  // ── the ladder ──
  const rows = rowsFor(reading, awards, showGameScore);
  const numSize = reading === "shortlist" ? 88 : 92;
  const numOpts = poster(numSize, { align: "right" });
  const numCap = capHeight(ctx, numOpts);
  const rowH = Math.max(numCap, 16 + 7 + 12);
  const subOpts = body(12, 600, { color: "rgba(255,255,255,0.62)", align: "right" });
  let top = LADDER_TOP;
  rows.forEach((row, i) => {
    const cy = top + rowH / 2;
    ctx.save();
    ctx.globalAlpha = row.opacity;
    // the number, at least 100 wide, right-aligned on the edge
    const numW = Math.max(100, spacedWidth(ctx, row.value, 0, numOpts));
    drawText(ctx, row.value, RIGHT, cy - numCap / 2, { ...numOpts, color: row.accent ? accent : "#ffffff" });
    // the label block to its left, shrunk (and the club abbreviated) when a long name would run off the card
    const labelRight = RIGHT - numW - ROW_GAP;
    const labelWidth = labelRight - LEFT;
    const labelSize = fitTracked(ctx, row.label, labelWidth, 16, 0.14, (s) => body(s, 700), 11);
    let sub = row.sub;
    if (row.subShort && spacedWidth(ctx, sub, 12 * 0.18, subOpts) - 12 * 0.18 > labelWidth) sub = row.subShort;
    const subSize = fitTracked(ctx, sub, labelWidth, 12, 0.18, (s) => body(s, 600), 9);
    const labelO = body(labelSize, 700, { color: "#ffffff", align: "right" });
    const subO = body(subSize, 600, { color: "rgba(255,255,255,0.62)", align: "right" });
    const blockH = capHeight(ctx, labelO) + 7 + capHeight(ctx, subO);
    const blockTop = cy - blockH / 2;
    drawSpaced(ctx, row.label, labelRight, blockTop, labelSize * 0.14, labelO);
    drawSpaced(ctx, sub, labelRight, blockTop + capHeight(ctx, labelO) + 7, subSize * 0.18, subO);
    ctx.restore();
    if (i === 0) drawRing(ctx, RIGHT, cy, reading === "box" ? 380 : 440, accent);
    top += rowH + ROW_GAP;
  });

  // ── context ──
  const italic: ItalicOpts = { size: 17, weight: 500, family: INTER_ITALIC, color: "rgba(255,255,255,0.88)", align: "center" };
  const maxWidth = CARD_W - 120;
  const lines: string[] = [];
  contextLines(reading, awards, showGameScore).forEach((sentence) => {
    let line = "";
    sentence.split(/\s+/).forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && italicWidth(ctx, next, italic, 17 * 0.05) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
  });
  let ly = 1194;
  lines.slice(0, 3).forEach((line) => {
    drawItalic(ctx, line, CARD_W / 2, ly, italic, 17 * 0.05);
    ly += 17 * 1.75;
  });

  // ── footer ──
  const sc = scores(winner.game_result);
  const club = cleanTeamLabel(winner.team_name).toUpperCase();
  const opp = cleanTeamLabel(winner.opponent_name).toUpperCase();
  const footer = [sc && opp ? `${club} ${sc[0]} – ${sc[1]} ${opp}` : club, shortDate(winner.game_date)].filter(Boolean).join(" · ");
  const footOpts = body(12, 600, { color: "rgba(255,255,255,0.42)" });
  const footW = spacedWidth(ctx, footer, 12 * 0.22, footOpts) - 12 * 0.22;
  const crestW = crest ? 22 + 12 : 0;
  let fx = (CARD_W - footW - crestW) / 2;
  const fcy = CARD_H - 40 - 11;
  if (crest) {
    drawContain(ctx, crest, fx, fcy - 11, 22, 22);
    fx += crestW;
  }
  drawSpaced(ctx, footer, fx, fcy - capHeight(ctx, footOpts) / 2, 12 * 0.22, footOpts);

  drawMottle(ctx);
  drawGrain(ctx, 0.3);
  return canvas;
}
