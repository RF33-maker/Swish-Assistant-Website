/**
 * Team leaders, the poster designs (1080×1350): two looks built round the clubs' logos rather
 * than the shared Swish Social backdrop, and signed as Swish Assistant posts (the hoop mark and
 * name at the top, Swish orange for the glow and the accents, whatever the competition's colour).
 *
 *   print  cream paper and black ink; the #1 logo as one large die-cut sticker, the other four
 *          as smaller stickers under it, serif numerals, grain
 *   cards  five collector cards on a dark table under an orange light, each framed in its
 *          club's own colour (taken from its logo), with foil and layered shadows
 *
 * The shared-look card (generateLeadersCards.ts) is the third option in the studio.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { LeadersCardOptions } from "@/lib/generateLeadersCards";
import { cleanTeamLabel, drawSpaced, readLogo, spacedWidth } from "@/lib/cardStyle";
import { body, display, drawGrain, ellipseGlow, ensureCardFonts, fitText, serif, textWidth } from "@/lib/cardCanvasKit";
import {
  CARD_H,
  CARD_W,
  capHeight,
  drawStatsThreadMark,
  drawTextTop,
  ensureDisplayFont,
  fetchImg,
  initialsOf,
  shade,
  withAlpha,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

export type TeamLeadersDesign = "print" | "cards";
export const TEAM_LEADERS_DESIGNS: { id: TeamLeadersDesign; label: string; hint: string }[] = [
  { id: "print", label: "Print", hint: "Cream paper and black ink, with the logos as stickers" },
  { id: "cards", label: "Cards", hint: "Collector cards in each club's colour, on a dark table" },
];

type Team = {
  rank: number;
  name: string;
  display: string;
  games: number;
  logo: HTMLImageElement | null;
  /** The club's own colour, taken from its logo. */
  colour: string;
  /** That colour brought down far enough to carry white type. */
  deep: string;
  /** Type set on `deep`: white, or near-black where a hand-picked colour is too light for white. */
  ink: string;
  /** A white or pale logo: it needs something dark behind it. */
  whiteMark: boolean;
};

type Data = {
  league: string;
  category: string;
  unit: string;
  teams: Team[];
  leagueLogo: HTMLImageElement | null;
  swish: HTMLImageElement | null;
  footnote: string;
};

/** Swish Assistant's orange, and the deeper and lighter cuts of it that hold up as small type on paper and on black. */
const SWISH = "#f97316";
const SWISH_ON_PAPER = "#e2560a";
const SWISH_ON_DARK = "#fb923c";

type Ctx = CanvasRenderingContext2D;
type Face = (size: number) => TextOpts;

// ── colour ───────────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** The colour a logo is mostly made of, ignoring its whites, blacks and greys. */
function logoColour(img: HTMLImageElement | null, fallback: string): { colour: string; whiteMark: boolean } {
  if (!img) return { colour: fallback, whiteMark: false };
  try {
    const n = 56;
    const c = document.createElement("canvas");
    c.width = n;
    c.height = n;
    const cx = c.getContext("2d", { willReadFrequently: true })!;
    cx.drawImage(img, 0, 0, n, n);
    const { data } = cx.getImageData(0, 0, n, n);
    const bins = Array.from({ length: 24 }, () => [0, 0, 0, 0]);
    let solid = 0;
    let lum = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      solid += 1;
      lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const v = max / 255;
      const s = max ? (max - min) / max : 0;
      if (s < 0.3 || v < 0.24) continue;
      let h = 0;
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      const bin = bins[Math.floor((((h * 60) + 360) % 360) / 15) % 24];
      const w = s * s * v;
      bin[0] += r * w;
      bin[1] += g * w;
      bin[2] += b * w;
      bin[3] += w;
    }
    // Pale all over (a white mark, or a light colour with no dark outline to hold it on white).
    const whiteMark = solid > 0 && solid < n * n * 0.94 && lum / solid > 168;
    let best = -1;
    let bestScore = 0;
    bins.forEach((bin, i) => {
      const score = bin[3] + 0.5 * (bins[(i + 23) % 24][3] + bins[(i + 1) % 24][3]);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0 || bestScore < solid * 0.012) return { colour: fallback, whiteMark };
    const sum = [0, 0, 0, 0];
    for (const i of [(best + 23) % 24, best, (best + 1) % 24]) bins[i].forEach((v, k) => (sum[k] += v));
    return { colour: toHex(sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]), whiteMark };
  } catch {
    return { colour: fallback, whiteMark: false };
  }
}

function deepen(hex: string, limit = 0.2): string {
  let out = hex;
  for (let i = 0; i < 10 && luminance(out) > limit; i += 1) out = shade(out, -0.1);
  return out;
}

// ── logo art ─────────────────────────────────────────────────────────────────

function sheet(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext("2d")!;
  x.imageSmoothingQuality = "high";
  return [c, x];
}

/** A club's logo as its own layer, trimmed of the file's empty padding and sized to fit a box. */
function sprite(team: Team, maxW: number, maxH: number): HTMLCanvasElement {
  if (!team.logo) {
    const s = Math.min(maxW, maxH) * 0.86;
    const [c, x] = sheet(s, s);
    const g = x.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, shade(team.colour, 0.12));
    g.addColorStop(1, shade(team.colour, -0.35));
    x.fillStyle = g;
    x.beginPath();
    x.roundRect(0, 0, s, s, s * 0.2);
    x.fill();
    const o = display(s * 0.46, 800, { align: "center" });
    drawTextTop(x, initialsOf(team.name), s / 2, (s - capHeight(x, o)) / 2, o);
    return c;
  }
  const a = readLogo(team.logo);
  const sw = team.logo.naturalWidth * a.w;
  const sh = team.logo.naturalHeight * a.h;
  const scale = Math.min(maxW / sw, maxH / sh);
  const [c, x] = sheet(sw * scale, sh * scale);
  if (a.boxed) {
    x.beginPath();
    x.roundRect(0, 0, c.width, c.height, Math.min(c.width, c.height) * 0.08);
    x.clip();
  }
  x.drawImage(team.logo, team.logo.naturalWidth * a.x, team.logo.naturalHeight * a.y, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** A layer's shape with its soft edges (a logo's own glow or shadow) made solid, so a border cut round it is clean. */
function solidShape(src: HTMLCanvasElement, colour: string): HTMLCanvasElement {
  const [c, x] = sheet(src.width, src.height);
  for (let i = 0; i < 6; i += 1) x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = colour;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** A die-cut sticker: the layer with an even border of one colour all the way round its outline. */
function sticker(src: HTMLCanvasElement, border: number, colour = "#ffffff"): HTMLCanvasElement {
  const pad = Math.ceil(border) + 2;
  const [c, x] = sheet(src.width + pad * 2, src.height + pad * 2);
  const sil = solidShape(src, colour);
  for (const r of [border, border * 0.55]) {
    for (let k = 0; k < 48; k += 1) {
      const a = (k / 48) * Math.PI * 2;
      x.drawImage(sil, pad + Math.cos(a) * r, pad + Math.sin(a) * r);
    }
  }
  x.drawImage(src, pad, pad);
  return c;
}

type Shadow = { colour: string; blur: number; y?: number; x?: number };

/** Draws a layer centred on a point, optionally turned, under a stack of shadows (contact first, ambient last). */
function put(ctx: Ctx, img: HTMLCanvasElement, cx: number, cy: number, o: { rot?: number; shadows?: Shadow[]; alpha?: number } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  if (o.rot) ctx.rotate((o.rot * Math.PI) / 180);
  ctx.globalAlpha = o.alpha ?? 1;
  for (const s of o.shadows ?? []) {
    ctx.save();
    ctx.shadowColor = s.colour;
    ctx.shadowBlur = s.blur;
    ctx.shadowOffsetX = s.x ?? 0;
    ctx.shadowOffsetY = s.y ?? 0;
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

// ── type ─────────────────────────────────────────────────────────────────────

const T = drawTextTop;

/** The largest size a label fits at, on one line or, where that buys a clearly bigger size, two. */
function fitTwo(ctx: Ctx, text: string, maxW: number, max: number, min: number, face: Face): { size: number; lines: string[] } {
  const single = fitText(ctx, text, maxW, max, min, face);
  const words = text.split(" ");
  let best = { size: single, lines: [text] };
  if (words.length < 2 || single >= max * 0.84) return best;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const size = Math.min(fitText(ctx, a, maxW, max, min, face), fitText(ctx, b, maxW, max, min, face));
    if (size > best.size && size >= single * 1.18) best = { size, lines: [a, b] };
  }
  return best;
}

/** Lines of text stacked from `top`; returns the y under the last one. */
function stack(ctx: Ctx, lines: string[], x: number, top: number, o: TextOpts, gap: number): number {
  let y = top;
  lines.forEach((line, i) => {
    y += T(ctx, line, x, y, o) + (i < lines.length - 1 ? gap : 0);
  });
  return y;
}

/** A number with its unit set small beside it, on a shared baseline. Returns the cap height of the number. */
function valueWithUnit(ctx: Ctx, value: string, unit: string, x: number, top: number, v: TextOpts, u: TextOpts, align: "left" | "center" = "left"): number {
  const vw = textWidth(ctx, value, v);
  const uw = textWidth(ctx, unit, u);
  const gap = v.size * 0.07;
  const left = align === "center" ? x - (vw + gap + uw) / 2 : x;
  const cap = T(ctx, value, left, top, { ...v, align: "left" });
  T(ctx, unit, left + vw + gap, top + cap - capHeight(ctx, u), { ...u, align: "left" });
  return cap;
}

const two = (n: number) => String(n).padStart(2, "0");

// ── finishing ────────────────────────────────────────────────────────────────

function vignette(ctx: Ctx, strength: number, colour = "#000000") {
  const g = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.46, CARD_H * 0.34, CARD_W / 2, CARD_H * 0.5, CARD_H * 0.82);
  g.addColorStop(0, withAlpha(colour, 0));
  g.addColorStop(1, withAlpha(colour, strength));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

/** A field of dots that swell along `t` (0–1 across the box), the way a printed halftone fades. */
function halftone(ctx: Ctx, x: number, y: number, w: number, h: number, colour: string, step: number, maxR: number, t: (u: number, v: number) => number) {
  ctx.save();
  ctx.fillStyle = colour;
  for (let row = 0; row * step * 0.866 <= h; row += 1) {
    for (let col = 0; col * step <= w; col += 1) {
      const px = col * step + (row % 2 ? step / 2 : 0);
      const py = row * step * 0.866;
      const r = maxR * Math.max(0, Math.min(1, t(px / w, py / h)));
      if (r < 0.45) continue;
      ctx.beginPath();
      ctx.arc(x + px, y + py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Draws an image trimmed of its file's empty padding, fitted and centred in a box. */
function trimmed(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const a = readLogo(img);
  const sw = img.naturalWidth * a.w;
  const sh = img.naturalHeight * a.h;
  const k = Math.min(w / sw, h / sh);
  ctx.drawImage(img, img.naturalWidth * a.x, img.naturalHeight * a.y, sw, sh, x + (w - sw * k) / 2, y + (h - sh * k) / 2, sw * k, sh * k);
}

/**
 * The line that signs the card as a Swish Assistant post: the hoop mark and the name in orange,
 * then (optionally) the league after a hairline. Returns nothing; `x` is the left edge or the centre.
 */
function swishKicker(ctx: Ctx, d: Data, x: number, top: number, align: "left" | "center", orange: string, ink: string, league: boolean) {
  const name = body(18, 700, { color: orange });
  const other = body(18, 700, { color: ink });
  const cap = capHeight(ctx, name);
  const icon = d.swish ? 34 : 0;
  const nameW = spacedWidth(ctx, "SWISH ASSISTANT", 5, name) - 5;
  const leagueW = league ? spacedWidth(ctx, d.league.toUpperCase(), 5, other) - 5 : 0;
  const total = (icon ? icon + 12 : 0) + nameW + (league ? 18 + 1.5 + 18 + leagueW : 0);
  let cx = align === "center" ? x - total / 2 : x;
  if (d.swish) {
    trimmed(ctx, d.swish, cx, top + cap / 2 - icon / 2, icon, icon);
    cx += icon + 12;
  }
  drawSpaced(ctx, "SWISH ASSISTANT", cx, top, 5, name);
  cx += nameW;
  if (league) {
    ctx.fillStyle = ink;
    ctx.fillRect(cx + 18, top - 4, 1.5, cap + 8);
    drawSpaced(ctx, d.league.toUpperCase(), cx + 37.5, top, 5, other);
  }
}

/** Swish, StatsThread and the league's mark in a row, with the small print under them. */
function brandRow(ctx: Ctx, d: Data, top: number, ink: string, h = 46) {
  const items: (HTMLImageElement | "st")[] = [];
  if (d.swish) items.push(d.swish);
  items.push("st");
  if (d.leagueLogo) items.push(d.leagueLogo);
  const widths = items.map((l) => (l === "st" ? h : Math.min(130, (l.naturalWidth * h) / l.naturalHeight)));
  const gap = 46;
  let x = (CARD_W - widths.reduce((a, b) => a + b, 0) - gap * (items.length - 1)) / 2;
  items.forEach((l, i) => {
    if (l === "st") drawStatsThreadMark(ctx, x, top, h);
    else trimmed(ctx, l, x, top, widths[i], h);
    x += widths[i] + gap;
  });
  const label = ["swishassistant.com", d.footnote].filter(Boolean).join("  ·  ").toUpperCase();
  drawSpaced(ctx, label, CARD_W / 2, top + h + 20, 2.2, body(13, 700, { color: ink, align: "center" }));
}

// ── Print ────────────────────────────────────────────────────────────────────

function drawPrint(ctx: Ctx, d: Data) {
  const [first, ...rest] = d.teams;
  const INK = "#131210";
  const PAPER = "#f4efe3";

  // Paper: a warm stock, darker towards its edges, with Swish orange glowing faintly through
  // two corners and behind the leader's sticker.
  ctx.fillStyle = "#ece7db";
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ellipseGlow(ctx, 480, 520, 900, 900, [[0, "rgba(255,253,246,0.9)"], [1, "rgba(255,253,246,0)"]]);
  ellipseGlow(ctx, 1010, 150, 640, 520, [[0, withAlpha(SWISH, 0.2)], [0.55, withAlpha(SWISH, 0.07)], [1, withAlpha(SWISH, 0)]]);
  ellipseGlow(ctx, 60, 1250, 680, 540, [[0, withAlpha(SWISH, 0.18)], [0.55, withAlpha(SWISH, 0.06)], [1, withAlpha(SWISH, 0)]]);
  vignette(ctx, 0.2, "#6b5a3c");

  // Masthead.
  swishKicker(ctx, d, 60, 58, "left", SWISH_ON_PAPER, INK, false);
  drawSpaced(ctx, d.league.toUpperCase(), CARD_W - 60, 58, 5, body(18, 700, { color: INK, align: "right" }));
  const titleSize = fitText(ctx, "TEAM LEADERS", CARD_W - 112, 236, 120, (s) => display(s, 900));
  const titleCap = T(ctx, "TEAM LEADERS", 54, 98, display(titleSize, 900, { color: INK }));
  let y = 98 + titleCap + 26;
  ctx.fillStyle = INK;
  ctx.fillRect(60, y, CARD_W - 120, 7);
  ctx.fillStyle = SWISH;
  ctx.fillRect(60, y, 150, 7);
  y += 7 + 20;
  const catText = d.category.toUpperCase();
  let catSize = 32;
  while (catSize > 20 && spacedWidth(ctx, catText, 3, display(catSize, 700)) > 640) catSize -= 1;
  const cat = display(catSize, 700, { color: PAPER });
  const catW = spacedWidth(ctx, catText, 3, cat) + 40;
  ctx.fillStyle = INK;
  ctx.fillRect(60, y, catW, 54);
  drawSpaced(ctx, catText, 80, y + (54 - capHeight(ctx, cat)) / 2, 3, cat);
  const side = body(18, 700, { color: INK, align: "right" });
  drawSpaced(ctx, `TOP ${d.teams.length}  /  ${d.unit}`, CARD_W - 60, y + (54 - capHeight(ctx, side)) / 2, 5, side);
  const heroTop = y + 54 + 34;
  const heroH = 440;

  // The leader: one large sticker straight on the page, with a bloom of orange and a halftone under it.
  const heroCx = 304;
  const heroCy = heroTop + heroH / 2 + 4;
  ellipseGlow(ctx, heroCx, heroCy, 400, 330, [[0, withAlpha(SWISH, 0.3)], [0.6, withAlpha(SWISH, 0.09)], [1, withAlpha(SWISH, 0)]]);
  halftone(ctx, heroCx - 290, heroCy - 250, 580, 500, withAlpha(SWISH_ON_PAPER, 0.3), 17, 5.4, (u, v) => 1.1 - Math.hypot(u - 0.5, v - 0.5) * 2.5);
  const heroLogo = sticker(sprite(first, 452, 372), 17);
  put(ctx, heroLogo, heroCx, heroCy, {
    rot: -5,
    shadows: [
      { colour: "rgba(30,20,5,0.42)", blur: 5, y: 3 },
      { colour: "rgba(30,20,5,0.3)", blur: 44, y: 26 },
    ],
  });

  const tx = 588;
  const tw = CARD_W - 60 - tx;
  const name = fitTwo(ctx, cleanTeamLabel(first.name).toUpperCase(), tw, 78, 36, (s) => display(s, 800));
  const vSize = fitText(ctx, first.display, tw, 196, 96, (s) => serif(s, 400));
  const nameCap = capHeight(ctx, display(name.size, 800));
  const blockH = 40 + name.lines.length * nameCap + (name.lines.length - 1) * name.size * 0.22 + 26 + 2 + 28 + capHeight(ctx, serif(vSize, 400)) + 26 + 14;
  let ty = heroTop + (heroH - blockH) / 2;
  drawSpaced(ctx, "NO. 01", tx, ty, 5, body(18, 700, { color: SWISH_ON_PAPER }));
  ty += 40;
  ty = stack(ctx, name.lines, tx, ty, display(name.size, 800, { color: INK }), name.size * 0.22) + 26;
  ctx.fillStyle = INK;
  ctx.fillRect(tx, ty, tw, 2);
  ty += 28;
  ty += T(ctx, first.display, tx - 4, ty, serif(vSize, 400, { color: INK })) + 26;
  drawSpaced(ctx, `${d.unit}  ·  ${first.games} GAMES`, tx, ty, 4, body(19, 700, { color: INK, alpha: 0.72 }));

  // The other four: stickers on the page, each a touch off square.
  const rowsTop = heroTop + heroH + 44;
  ctx.fillStyle = INK;
  ctx.fillRect(60, rowsTop, CARD_W - 120, 2);
  const colW = (CARD_W - 120) / Math.max(4, rest.length);
  const x0 = (CARD_W - colW * rest.length) / 2;
  const tilt = [-4, 3, -2.5, 4];
  rest.forEach((t, i) => {
    const cx = x0 + colW * i + colW / 2;
    if (i > 0) {
      ctx.fillStyle = "rgba(19,18,16,0.2)";
      ctx.fillRect(x0 + colW * i, rowsTop + 22, 1.5, 318);
    }
    ctx.fillStyle = SWISH;
    ctx.fillRect(x0 + colW * i + 14, rowsTop + 20, 46, 34);
    T(ctx, two(t.rank), x0 + colW * i + 37, rowsTop + 20 + (34 - capHeight(ctx, body(17, 700))) / 2, body(17, 700, { color: INK, align: "center" }));
    const art = sticker(sprite(t, colW - 66, 150), 9);
    put(ctx, art, cx, rowsTop + 142, {
      rot: tilt[i % tilt.length],
      shadows: [
        { colour: "rgba(30,20,5,0.4)", blur: 4, y: 2 },
        { colour: "rgba(30,20,5,0.26)", blur: 22, y: 13 },
      ],
    });
    let yy = rowsTop + 246;
    const vs = fitText(ctx, t.display, colW - 44, 60, 34, (s) => serif(s, 400));
    yy += T(ctx, t.display, cx, yy, serif(vs, 400, { color: INK, align: "center" })) + 16;
    const nm = fitTwo(ctx, cleanTeamLabel(t.name).toUpperCase(), colW - 28, 24, 15, (s) => display(s, 700));
    stack(ctx, nm.lines, cx, yy, display(nm.size, 700, { color: INK, align: "center" }), 7);
  });

  // Print furniture: crop marks, and the grain of the stock over everything.
  ctx.strokeStyle = "rgba(19,18,16,0.55)";
  ctx.lineWidth = 1.5;
  for (const [cx, cy, sx, sy] of [[26, 26, 1, 1], [CARD_W - 26, 26, -1, 1], [26, CARD_H - 26, 1, -1], [CARD_W - 26, CARD_H - 26, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * 18);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * 18, cy);
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.fillRect(60, 1228, CARD_W - 120, 2);
  brandRow(ctx, d, 1250, "rgba(19,18,16,0.7)", 42);
  drawGrain(ctx, 0.24, "multiply");
  drawGrain(ctx, 0.1, "overlay");
}

// ── Cards ────────────────────────────────────────────────────────────────────

/** One collector card as its own layer: a frame in the club's colour, a pale face for the logo, a nameplate. */
function collectorCard(d: Data, t: Team, w: number, h: number, big: boolean): HTMLCanvasElement {
  const [c, x] = sheet(w, h);
  const r = w * 0.07;
  const f = big ? 16 : 9;
  const plateH = big ? 190 : 104;

  x.save();
  x.beginPath();
  x.roundRect(0, 0, w, h, r);
  x.clip();
  // Frame.
  const frame = x.createLinearGradient(0, 0, w, h);
  frame.addColorStop(0, shade(t.deep, 0.32));
  frame.addColorStop(0.5, t.deep);
  frame.addColorStop(1, shade(t.deep, -0.45));
  x.fillStyle = frame;
  x.fillRect(0, 0, w, h);
  // Face.
  const faceH = h - plateH - f;
  x.save();
  x.beginPath();
  x.roundRect(f, f, w - f * 2, faceH, [r * 0.6, r * 0.6, 0, 0]);
  x.clip();
  const face = x.createLinearGradient(0, f, 0, f + faceH);
  if (t.whiteMark) {
    face.addColorStop(0, "#23262d");
    face.addColorStop(1, "#101216");
  } else {
    face.addColorStop(0, "#ffffff");
    face.addColorStop(1, "#e4e2dc");
  }
  x.fillStyle = face;
  x.fillRect(f, f, w - f * 2, faceH);
  halftone(x, f, f + faceH * 0.45, w - f * 2, faceH * 0.55, withAlpha(t.deep, t.whiteMark ? 0.5 : 0.2), big ? 15 : 10, big ? 5 : 3.2, (_, v) => v * 1.05 - 0.1);
  // Inner shadow, so the face sits below the frame.
  const inner = x.createLinearGradient(0, f, 0, f + 34);
  inner.addColorStop(0, "rgba(0,0,0,0.22)");
  inner.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = inner;
  x.fillRect(f, f, w, 34);
  x.restore();

  // Logo.
  const art = sprite(t, w - f * 2 - (big ? 76 : 34), faceH - (big ? 96 : 44));
  put(x, art, w / 2, f + faceH / 2 + (big ? 14 : 8), {
    shadows: [{ colour: t.whiteMark ? "rgba(0,0,0,0.6)" : "rgba(20,20,30,0.3)", blur: big ? 30 : 14, y: big ? 16 : 8 }],
  });

  // Rank tab, top-left.
  const tab = big ? 76 : 44;
  x.fillStyle = t.deep;
  x.beginPath();
  x.roundRect(f, f, tab, tab, [r * 0.6, 0, tab * 0.3, 0]);
  x.fill();
  const rk = display(tab * 0.62, 800, { align: "center", color: t.ink });
  T(x, String(t.rank), f + tab / 2, f + (tab - capHeight(x, rk)) / 2, rk);

  // Nameplate.
  const py = h - plateH;
  const shadeTop = x.createLinearGradient(0, py - f, 0, py + 26);
  shadeTop.addColorStop(0, "rgba(0,0,0,0.3)");
  shadeTop.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = shadeTop;
  x.fillRect(0, py - f, w, f + 26);
  const pad = big ? 34 : 16;
  const nm = fitTwo(x, cleanTeamLabel(t.name).toUpperCase(), w - pad * 2, big ? 40 : 21, 12, (s) => display(s, 700));
  const nameO = display(nm.size, 700, { alpha: 0.92, color: t.ink });
  const vO = display(fitText(x, t.display, w - pad * 2 - (big ? 96 : 0), big ? 112 : 50, 30, (s) => display(s, 800)), 800, { color: t.ink });
  if (big) {
    const ny = py + 22;
    const after = stack(x, [nm.lines.join(" ")], pad, ny, display(fitText(x, nm.lines.join(" "), w - pad * 2, 40, 20, (s) => display(s, 700)), 700, { alpha: 0.92, color: t.ink }), 0);
    valueWithUnit(x, t.display, d.unit, pad - 3, after + 24, vO, display(32, 700, { alpha: 0.8, color: t.ink }));
  } else {
    const vCap = capHeight(x, vO);
    T(x, t.display, w / 2, py + 14, { ...vO, align: "center" });
    stack(x, nm.lines, w / 2, py + 14 + vCap + 12, { ...nameO, align: "center" }, 5);
  }

  // Foil: a band of light raked across the whole card.
  x.globalCompositeOperation = "screen";
  const foil = x.createLinearGradient(0, h * 0.1, w, h * 0.75);
  foil.addColorStop(0.18, "rgba(255,255,255,0)");
  foil.addColorStop(0.36, "rgba(255,255,255,0.2)");
  foil.addColorStop(0.44, "rgba(255,255,255,0.03)");
  foil.addColorStop(0.58, "rgba(255,255,255,0.12)");
  foil.addColorStop(0.74, "rgba(255,255,255,0)");
  x.fillStyle = foil;
  x.fillRect(0, 0, w, h);
  x.restore();

  // A hairline of light on the card's edge.
  x.strokeStyle = "rgba(255,255,255,0.4)";
  x.lineWidth = 1.5;
  x.beginPath();
  x.roundRect(0.75, 0.75, w - 1.5, h - 1.5, r);
  x.stroke();
  return c;
}

function drawCards(ctx: Ctx, d: Data) {
  const [first, ...rest] = d.teams;

  // The table: dark cloth under one overhead light, glowing Swish orange.
  ctx.fillStyle = "#08090c";
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ellipseGlow(ctx, 540, 610, 840, 780, [[0, "rgba(194,65,12,0.8)"], [0.5, "rgba(154,52,18,0.36)"], [1, "rgba(124,45,18,0)"]]);
  ellipseGlow(ctx, 540, 520, 560, 440, [[0, withAlpha(SWISH, 0.3)], [1, withAlpha(SWISH, 0)]], "screen");
  ellipseGlow(ctx, 540, 500, 420, 340, [[0, "rgba(255,255,255,0.12)"], [1, "rgba(255,255,255,0)"]], "screen");
  halftone(ctx, 0, 0, CARD_W, CARD_H, "rgba(255,255,255,0.035)", 9, 1.6, () => 1);

  // Header.
  swishKicker(ctx, d, 540, 54, "center", SWISH_ON_DARK, "rgba(255,255,255,0.75)", true);
  T(ctx, "TEAM LEADERS", 540, 90, display(100, 800, { align: "center" }));
  drawSpaced(ctx, d.category.toUpperCase(), 540, 182, 5, display(29, 600, { align: "center", color: SWISH_ON_DARK }));

  const cardShadows = (k: number): Shadow[] => [
    { colour: "rgba(0,0,0,0.55)", blur: 10 * k, y: 5 * k },
    { colour: "rgba(0,0,0,0.5)", blur: 60 * k, y: 34 * k },
  ];

  // The four below first, so the leader's card lies over their top edges.
  const sw = 232, sh = 318;
  const n = rest.length;
  const pitch = n > 1 ? Math.min(256, (CARD_W - 76 - sw) / (n - 1)) : 0;
  const x0 = (CARD_W - pitch * (n - 1)) / 2;
  const tilt = [-4, 2.5, -2, 4];
  const lift = [8, -6, 4, -4];
  rest.forEach((t, i) => {
    put(ctx, collectorCard(d, t, sw, sh, false), x0 + pitch * i, 1046 + lift[i % 4], { rot: tilt[i % 4], shadows: cardShadows(0.6) });
  });
  put(ctx, collectorCard(d, first, 520, 640, true), 540, 556, { rot: -2.5, shadows: cardShadows(1) });

  vignette(ctx, 0.6);
  drawGrain(ctx, 0.17);
  brandRow(ctx, d, 1250, "rgba(255,255,255,0.5)", 42);
}

// ── entry ────────────────────────────────────────────────────────────────────

const DRAW: Record<TeamLeadersDesign, (ctx: Ctx, d: Data) => void> = { print: drawPrint, cards: drawCards };

const HEX = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOUR = "#2b3040";

/** The colour a club's card takes when none has been picked by hand: its logo's main colour, deep enough for white type. */
export async function teamCardColour(logoUrl: string | null | undefined): Promise<string> {
  return deepen(logoColour(await fetchImg(logoUrl), FALLBACK_COLOUR).colour);
}

export type TeamLeadersDesignExtras = {
  /** Cards: a hand-picked colour for a club's card (`#rrggbb`), in the same order as `leaders`; empty slots use the logo's colour. */
  teamColours?: (string | null | undefined)[];
};

/** Draws the team leaders card in one of the poster designs, from the same options as the shared-look card. */
export async function renderTeamLeadersDesign(
  design: TeamLeadersDesign,
  opts: LeadersCardOptions,
  extras: TeamLeadersDesignExtras = {},
): Promise<HTMLCanvasElement> {
  await Promise.all([ensureDisplayFont(), ensureCardFonts()]);
  const top = opts.leaders.slice(0, 5);
  const [swish, leagueLogo, ...logos] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(opts.brand.leagueLogoUrl),
    ...top.map((_, i) => fetchImg(opts.teamLogoUrls?.[i])),
  ]);
  const teams: Team[] = top.map((l, i) => {
    const { colour, whiteMark } = logoColour(logos[i], FALLBACK_COLOUR);
    const base = { rank: l.rank, name: l.name, display: l.display, games: l.games, logo: logos[i], whiteMark };
    // A colour picked by hand is used exactly as picked; the type on it switches to dark if it is too light for white.
    const picked = extras.teamColours?.[i];
    if (picked && HEX.test(picked)) return { ...base, colour: picked, deep: picked, ink: luminance(picked) > 0.4 ? "#101216" : "#ffffff" };
    return { ...base, colour, deep: deepen(colour), ink: "#ffffff" };
  });

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  if (teams.length > 0) {
    DRAW[design](ctx, { league: opts.brand.leagueName, category: opts.categoryTitle, unit: opts.unit, teams, leagueLogo, swish, footnote: opts.footnote ?? "" });
  }
  return canvas;
}
