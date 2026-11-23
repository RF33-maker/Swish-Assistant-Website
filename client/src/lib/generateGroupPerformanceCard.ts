/**
 * Duo and trio performances (1080×1350): two or three teammates' lines from one game, one
 * full-width band per player. The player is on one side of their band and their line
 * ("22 PTS / 11 REB / 14 AST") on the other, alternating down the card. A bar along the foot
 * carries the Swish Assistant and StatsThread marks, the club's logo and the result.
 *
 * Each band has two versions, chosen player by player. With a background-removed photo the
 * player stands on the club's colour as a cut-out. Without one (or with `photo_mode: "photo"`)
 * their in-game photo fills the band instead and the numbers' side sinks to black. With no
 * photo at all, their initials.
 *
 * Either kind of picture can be resized and moved, player by player (`photo_zoom`,
 * `photo_shift_x`, `photo_shift_y`), for the ones that do not sit well as they come.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import { cleanTeamLabel, drawSpaced, readLogo, spacedWidth } from "@/lib/cardStyle";
import { body, display, drawGrain, ensureCardFonts, fitText } from "@/lib/cardCanvasKit";
import { ensureFonts as ensurePosterFonts } from "@/lib/generatePerformanceStyles";
import { teamCardColour } from "@/lib/generateTeamLeadersDesigns";
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

export type GroupPerformanceOptions = {
  team_name: string;
  opponent_name: string;
  team_score: number;
  opponent_score: number;
  /** As it should read on the card, e.g. "31 Oct 2026". */
  game_date?: string;
  league_name?: string;
  team_logo_url?: string | null;
  /** Two or three teammates, in the order they should appear. */
  players: {
    player_name: string;
    points: number;
    rebounds: number;
    assists: number;
    cutout_photo_url?: string | null;
    photo_url?: string | null;
    /** The picture's size: 1 as it comes. A cut-out can shrink as well as grow; an in-game photo only zooms in, as it has to fill its band. */
    photo_zoom?: number | null;
    /** Moves the player right (+) or left (−), −50 to 50. An in-game photo moves only as far as its edges allow. */
    photo_shift_x?: number | null;
    /** Moves the player down (+) or up (−), −50 to 50. */
    photo_shift_y?: number | null;
  }[];
  /** "photo" uses every player's in-game photo even where a cut-out exists. */
  photo_mode?: "auto" | "photo";
};

type Player = {
  name: string;
  line: [number, string][];
  cut: HTMLImageElement | null;
  photo: HTMLImageElement | null;
  zoom: number;
  /** How far the player is moved right and down, as fractions (−0.5 to 0.5). */
  sx: number;
  sy: number;
};

type Data = {
  team: string;
  opp: string;
  teamScore: number;
  oppScore: number;
  date: string;
  league: string;
  /** The club's colour, from its logo, deep enough for white type. */
  colour: string;
  teamLogo: HTMLImageElement | null;
  swish: HTMLImageElement | null;
  players: Player[];
};

type Ctx = CanvasRenderingContext2D;
const SWISH = "#f97316";
const SWISH_ON_DARK = "#fb923c";
const NIGHT = "#08090b";
const POSTER = '"Anton", "Barlow Condensed", Impact, "Arial Narrow", sans-serif';
const poster = (size: number, extra: Partial<TextOpts> = {}): TextOpts => ({ size, weight: 400, family: POSTER, ...extra });
const T = drawTextTop;

// ── layers ───────────────────────────────────────────────────────────────────

function sheet(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext("2d")!;
  x.imageSmoothingQuality = "high";
  return [c, x];
}

/** An image trimmed of its file's empty padding, scaled to fit a box, as its own layer. */
function trimmedLayer(img: HTMLImageElement, maxW: number, maxH: number): HTMLCanvasElement {
  const a = readLogo(img);
  const sw = img.naturalWidth * a.w;
  const sh = img.naturalHeight * a.h;
  const k = Math.min(maxW / sw, maxH / sh);
  const [c, x] = sheet(sw * k, sh * k);
  x.drawImage(img, img.naturalWidth * a.x, img.naturalHeight * a.y, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** True when the player is shown by their in-game photo rather than a cut-out. */
const inGame = (p: Player): p is Player & { photo: HTMLImageElement } => !p.cut && !!p.photo;

/** Where an in-game photo's focus rests down the picture before it is moved: a little above the middle, where a head and chest usually are. */
const REST_FOCUS_Y = 0.32;

/**
 * Fills a box with a player's in-game photo. The photo's focus point (its middle across, a
 * little above the middle down, then moved by the player's shift) lands at (tx, ty) of the box
 * where the photo's edges allow, so the player can be set to one side of a wide band.
 */
function coverPhoto(ctx: Ctx, p: Player & { photo: HTMLImageElement }, x: number, y: number, w: number, h: number, tx = 0.5, ty = 0.42) {
  const img = p.photo;
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight) * Math.max(1, p.zoom);
  const dw = img.naturalWidth * k;
  const dh = img.naturalHeight * k;
  // Moving the player right means keeping a point further left in view, and likewise down.
  const fx = Math.max(0, Math.min(1, 0.5 - p.sx));
  const fy = Math.max(0, Math.min(1, REST_FOCUS_Y - p.sy));
  const left = Math.min(x, Math.max(x + w - dw, x + w * tx - dw * fx));
  const top = Math.min(y, Math.max(y + h - dh, y + h * ty - dh * fy));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, left, top, dw, dh);
  ctx.restore();
}

/**
 * A player's figure at a given height: the cut-out at its own width, or a portrait crop of their
 * photo with rounded corners, or their initials. `cut` says whether the layer has the player's outline.
 */
function figure(p: Player, h: number, d: Data): { art: HTMLCanvasElement; cut: boolean } {
  if (p.cut) return { art: trimmedLayer(p.cut, h * 3, h), cut: true };
  const w = h * 0.84;
  const [c, x] = sheet(w, h);
  x.beginPath();
  x.roundRect(0, 0, w, h, Math.min(w, h) * 0.06);
  x.clip();
  if (inGame(p)) {
    coverPhoto(x, p, 0, 0, w, h, 0.5, 0.4);
  } else {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, shade(d.colour, 0.14));
    g.addColorStop(1, shade(d.colour, -0.5));
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    const o = display(h * 0.34, 800, { align: "center", alpha: 0.9 });
    T(x, initialsOf(p.name), w / 2, (h - capHeight(x, o)) / 2, o);
  }
  return { art: c, cut: false };
}

function solidShape(src: HTMLCanvasElement, colour: string, passes = 6): HTMLCanvasElement {
  const [c, x] = sheet(src.width, src.height);
  for (let i = 0; i < passes; i += 1) x.drawImage(src, 0, 0);
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

/** Draws a layer centred on a point, optionally turned, under a stack of shadows. */
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

/** The club's logo as a sticker (white border, soft shadow), centred on a point. */
function logoSticker(ctx: Ctx, d: Data, cx: number, cy: number, size: number) {
  if (!d.teamLogo) return;
  const art = sticker(trimmedLayer(d.teamLogo, size, size), Math.max(5, size * 0.055));
  put(ctx, art, cx, cy, { shadows: [{ colour: "rgba(0,0,0,0.55)", blur: 22, y: 10 }] });
}

/** The club's logo blown up and ghosted in one colour, as texture. */
function ghostLogo(ctx: Ctx, d: Data, cx: number, cy: number, size: number, colour: string, alpha: number, rot = -10) {
  if (!d.teamLogo) return;
  put(ctx, solidShape(trimmedLayer(d.teamLogo, size, size), colour, 2), cx, cy, { rot, alpha });
}

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

function vignette(ctx: Ctx, strength: number, colour = "#000000") {
  const g = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.46, CARD_H * 0.34, CARD_W / 2, CARD_H * 0.5, CARD_H * 0.82);
  g.addColorStop(0, withAlpha(colour, 0));
  g.addColorStop(1, withAlpha(colour, strength));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

// ── brand ────────────────────────────────────────────────────────────────────

/** Draws an image fitted and centred in a box, trimmed of its padding. */
function fitImage(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const art = trimmedLayer(img, w, h);
  ctx.drawImage(art, x + (w - art.width) / 2, y + (h - art.height) / 2);
}

/** The Swish Assistant and StatsThread marks side by side, from `x`. */
function marks(ctx: Ctx, d: Data, x: number, top: number, h: number) {
  let cx = x;
  if (d.swish) {
    fitImage(ctx, d.swish, cx, top, h, h);
    cx += h * 1.8;
  }
  drawStatsThreadMark(ctx, cx, top, h);
}

// ── the card ─────────────────────────────────────────────────────────────────

function drawStack(ctx: Ctx, d: Data) {
  const n = d.players.length;
  const footH = 126;
  const H = CARD_H - footH;
  const bh = H / n;

  d.players.forEach((p, i) => {
    const y = i * bh;
    const figLeft = i % 2 === 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, CARD_W, bh);
    ctx.clip();

    // The band: the club's colour behind the player, falling to near-black behind the numbers.
    const g = ctx.createLinearGradient(figLeft ? 0 : CARD_W, 0, figLeft ? CARD_W : 0, 0);
    g.addColorStop(0, shade(d.colour, 0.16));
    g.addColorStop(0.45, shade(d.colour, -0.25));
    g.addColorStop(1, shade(d.colour, -0.72));
    ctx.fillStyle = g;
    ctx.fillRect(0, y, CARD_W, bh);
    if (inGame(p)) {
      // In-game photo: it fills the band with the player set to one side, and the other side sinks to black for the numbers.
      coverPhoto(ctx, p, 0, y, CARD_W, bh, figLeft ? 0.3 : 0.7, 0.42);
      const scrim = ctx.createLinearGradient(figLeft ? CARD_W : 0, 0, figLeft ? CARD_W * 0.3 : CARD_W * 0.7, 0);
      scrim.addColorStop(0, "rgba(8,9,11,0.9)");
      scrim.addColorStop(0.45, "rgba(8,9,11,0.62)");
      scrim.addColorStop(1, "rgba(8,9,11,0)");
      ctx.fillStyle = scrim;
      ctx.fillRect(0, y, CARD_W, bh);
      ctx.fillStyle = "rgba(8,9,11,0.12)";
      ctx.fillRect(0, y, CARD_W, bh);
    } else {
      // Cut-out: the club's logo ghosted in on the numbers' side (never behind the player's head), and the player standing on the foot of the band.
      ghostLogo(ctx, d, figLeft ? CARD_W - 200 : 200, y + bh * 0.5, bh * 1.35, "#ffffff", 0.06, figLeft ? 10 : -10);
      halftone(ctx, figLeft ? 560 : 0, y, 520, bh, "rgba(0,0,0,0.26)", 15, 4.4, (u, v) => (figLeft ? u : 1 - u) * (0.35 + v * 0.75));
      // It stands on the foot of the band until it is resized or moved (initials keep their size); the band crops whatever runs over.
      const fig = figure(p, bh * 0.97 * (p.cut ? p.zoom : 1), d);
      put(ctx, fig.art, (figLeft ? 300 : CARD_W - 300) + p.sx * 600, y + bh - fig.art.height / 2 + p.sy * bh, {
        shadows: [{ colour: "rgba(0,0,0,0.55)", blur: 40, x: figLeft ? 14 : -14, y: 6 }],
      });
    }

    // The line.
    const tx = figLeft ? CARD_W - 72 : 72;
    const align = figLeft ? "right" : "left";
    const numSize = n === 2 ? 112 : 76;
    const nameO = display(n === 2 ? 40 : 31, 700, { align, alpha: 0.92 });
    const numO = poster(numSize, { align });
    const numCap = capHeight(ctx, numO);
    const lineGap = numSize * 0.2;
    const blockH = capHeight(ctx, nameO) + numSize * 0.3 + p.line.length * numCap + (p.line.length - 1) * lineGap;
    let ty = y + (bh - blockH) / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ty += drawSpaced(ctx, p.name.toUpperCase(), tx, ty, 3, nameO) + numSize * 0.3;
    p.line.forEach(([v, l]) => {
      T(ctx, `${v} ${l}`, tx, ty, numO);
      ty += numCap + lineGap;
    });
    ctx.restore();
    ctx.restore();

    if (i > 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, y - 3, CARD_W, 6);
    }
  });

  vignette(ctx, 0.32);
  drawGrain(ctx, 0.18);

  // The foot: marks left, the result right, the club's logo breaking out of the bar between them.
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, H, CARD_W, footH);
  ctx.fillStyle = SWISH;
  ctx.fillRect(0, H, CARD_W, 5);
  marks(ctx, d, 60, H + 40, 50);
  logoSticker(ctx, d, 540, H + 34, 150);
  const r1 = `${d.team.toUpperCase()} ${d.teamScore}`;
  const r2 = `${d.opp.toUpperCase()} ${d.oppScore}`;
  const size = Math.min(fitText(ctx, r1, 370, 30, 16, (s) => display(s, 800)), fitText(ctx, r2, 370, 30, 16, (s) => display(s, 800)));
  const cap = capHeight(ctx, display(size, 800));
  const top = H + 5 + (footH - 5 - (cap * 2 + 12 + 22)) / 2;
  T(ctx, r1, CARD_W - 60, top, display(size, 800, { align: "right" }));
  T(ctx, r2, CARD_W - 60, top + cap + 12, display(size, 800, { align: "right", alpha: 0.6 }));
  // The small print keeps clear of the logo in the middle of the bar: the date alone if the league will not fit.
  const small = body(12, 700, { align: "right", color: SWISH_ON_DARK });
  const full = [d.league, d.date].filter(Boolean).join("  ·  ").toUpperCase();
  drawSpaced(ctx, spacedWidth(ctx, full, 2, small) <= 370 ? full : d.date.toUpperCase(), CARD_W - 60, top + cap * 2 + 24, 2, small);
}

// ── entry ────────────────────────────────────────────────────────────────────

export async function renderGroupPerformanceCard(opts: GroupPerformanceOptions): Promise<HTMLCanvasElement> {
  await Promise.all([ensureDisplayFont(), ensureCardFonts(), ensurePosterFonts()]);
  const list = opts.players.slice(0, 3);
  const [swish, teamLogo, colour, ...photos] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(opts.team_logo_url),
    teamCardColour(opts.team_logo_url),
    ...list.flatMap((p) => [fetchImg(p.cutout_photo_url), fetchImg(p.photo_url)]),
  ]);
  const players: Player[] = list.map((p, i) => ({
    name: p.player_name,
    line: [[p.points, "PTS"], [p.rebounds, "REB"], [p.assists, "AST"]],
    // "photo" mode sets the cut-out aside for anyone who has an in-game photo to use instead.
    cut: opts.photo_mode === "photo" && photos[i * 2 + 1] ? null : (photos[i * 2] as HTMLImageElement | null),
    photo: photos[i * 2 + 1] as HTMLImageElement | null,
    zoom: Math.max(0.5, Math.min(4, Number(p.photo_zoom ?? 1) || 1)),
    sx: Math.max(-50, Math.min(50, Number(p.photo_shift_x ?? 0) || 0)) / 100,
    sy: Math.max(-50, Math.min(50, Number(p.photo_shift_y ?? 0) || 0)) / 100,
  }));

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  if (players.length >= 2) {
    drawStack(ctx, {
      team: cleanTeamLabel(opts.team_name),
      opp: cleanTeamLabel(opts.opponent_name),
      teamScore: opts.team_score,
      oppScore: opts.opponent_score,
      date: opts.game_date ?? "",
      league: opts.league_name ?? "",
      colour: colour as string,
      teamLogo: teamLogo as HTMLImageElement | null,
      swish: swish as HTMLImageElement | null,
      players,
    });
  }
  return canvas;
}
