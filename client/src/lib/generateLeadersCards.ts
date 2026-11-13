/**
 * Player / Team league leaders cards (1080×1350), drawn on a canvas in the shared
 * Swish Social look (see cardStyle.ts).
 *
 * Player leaders: the #1 player's photo is the hero and dissolves into the card instead
 * of sitting in a box; the rest of the top five is listed underneath.
 *
 * Team leaders: the clubs' logos carry the card. The #1 club's logo stands large beside
 * its number, and the other four sit side by side under it, each as big as its column allows.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { Leader } from "@/types/leaders";
import type { WeeklyCardBrand } from "@/types/weeklyAwards";
import {
  SIDE,
  cleanTeamLabel,
  drawBackdrop,
  drawCrest,
  drawGlow,
  drawHeader,
  drawLogoMark,
  drawRingedCrest,
  drawSpaced,
  drawTag,
  drawVignette,
  fitLines,
  meltPhoto,
  spacedWidth,
  splitName,
  themeFor,
  type CardStyle,
  type Theme,
} from "@/lib/cardStyle";
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
  withAlpha,
  type PhotoFraming,
  type TextOpts,
} from "@/lib/generateWeeklyCards";

export { cleanTeamLabel };

export type LeadersCardOptions = {
  kind: "player" | "team";
  /** Which of the three looks to draw; defaults to `league`. */
  style?: CardStyle;
  /** Headline under the card title, e.g. "Points Per Game". */
  categoryTitle: string;
  /** Unit tag shown beside the leader's number, e.g. "PPG". */
  unit: string;
  leaders: Leader[];
  brand: WeeklyCardBrand;
  /** Each leader's club logo (a player's own club on the player card), in the same order as `leaders`. */
  teamLogoUrls?: (string | null)[];
  /** Player leaders: how the #1 player's photo is framed. */
  framing?: PhotoFraming;
  /** Small print added to the footer, e.g. "Min. 2 games". */
  footnote?: string;
};

const HERO_TOP = 236;
const HERO_BOTTOM = 812;
const HERO_TEXT_X = 590;
const LIST_TOP = 834;
const ROW_H = 89;

/** Where the #1's name and number sit, top to bottom. */
type HeroZone = { top: number; bottom: number };
const PLAYER_HERO: HeroZone = { top: HERO_TOP, bottom: HERO_BOTTOM };
/** The team card gives its hero a little less height, so the logos under it get more. */
const TEAM_HERO: HeroZone = { top: 244, bottom: 720 };
const STRIP_TOP = 740;

/**
 * The leader's photo, worked into the card (see meltPhoto): it runs off the left of the
 * card, its haze climbs behind the header, and it falls away in a rounded pool around the
 * player rather than along straight sides. The photo is free to be zoomed out or nudged;
 * the haze and the falloff follow it.
 */
export function drawHeroPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, focusY: number, framing: PhotoFraming, theme: Theme) {
  const x = -40;
  const w = 680;
  const h = 716;
  // Room above the photo's box for its haze to climb behind the header.
  const rise = 150;
  const H = rise + h;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * framing.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const left = (w - dw) / 2 + (framing.x / 100) * w;
  const top = rise + (h - dh) * (Math.max(0, Math.min(100, focusY)) / 100) + (framing.y / 100) * h;
  const right = left + dw;
  const bottom = top + dh;

  // The player is taken to stand in the middle of the photo; the pool of light sits a little left of
  // them, so the picture still runs off the left of the card but is long gone by the leader's name.
  const poolX = (left + right) / 2 - 140;
  const poolY = rise + h * 0.46;

  const photo = meltPhoto(img, w, H, { left, top, dw, dh }, rise - 30, theme, (l) => {
    const burn = l.createRadialGradient(poolX, poolY, 200, poolX, poolY, 520);
    burn.addColorStop(0, withAlpha(theme.shadow, 0));
    burn.addColorStop(1, withAlpha(theme.shadow, 0.6));
    l.fillStyle = burn;
    l.fillRect(0, 0, w, H);
    const sink = l.createLinearGradient(0, rise + h * 0.45, 0, H);
    sink.addColorStop(0, withAlpha(theme.shadow, 0));
    sink.addColorStop(1, withAlpha(theme.shadow, 0.6));
    l.fillStyle = sink;
    l.fillRect(0, 0, w, H);
  });

  // The falloff: a rounded pool around the player, closed off by long ramps that start well inside
  // the photo and, where one of its edges is in view, finish out in the haze beyond it.
  const l = photo.ctx;
  photo.fade(l.createRadialGradient(poolX, poolY, 285, poolX, poolY, 505), 1, 0);
  photo.fade(l.createLinearGradient(0, Math.max(0, top - rise), 0, Math.max(rise, top) + 90));
  photo.fade(l.createLinearGradient(Math.min(w, right + 110), 0, Math.min(w, right) - w * 0.44, 0));
  photo.fade(l.createLinearGradient(0, Math.min(H, bottom + 110), 0, Math.min(H, bottom) - h * 0.4));
  if (left > -x + 1) photo.fade(l.createLinearGradient(Math.max(0, left - 110), 0, left + w * 0.12, 0));

  ctx.drawImage(photo.canvas, x, 196 - rise);
}

/** A soft pool of shadow under the hero's name and number, so they hold up over the tail of a bright photo. */
export function drawTextShade(ctx: CanvasRenderingContext2D) {
  const cx = (HERO_TEXT_X + CARD_W - SIDE) / 2 + 20;
  const cy = (HERO_TOP + HERO_BOTTOM) / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.82);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
  g.addColorStop(0, "rgba(0,0,0,0.3)");
  g.addColorStop(0.6, "rgba(0,0,0,0.16)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-400, -400, 800, 800);
  ctx.restore();
}

/** Name, club and the headline number for the #1, set to the right of the hero art. */
function drawHeroText(
  ctx: CanvasRenderingContext2D,
  kind: "player" | "team",
  leader: Leader,
  unit: string,
  clubLogo: HTMLImageElement | null,
  theme: Theme,
  zone: HeroZone,
) {
  const x = HERO_TEXT_X;
  const maxW = CARD_W - SIDE - x;
  const zoneH = zone.bottom - zone.top;
  const games = `${leader.games} ${leader.games === 1 ? "GAME" : "GAMES"}`;

  // The rank, ghosted large behind the block.
  ctx.save();
  setFont(ctx, { size: Math.round((zoneH * 10) / 9), weight: 700 });
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.strokeText(String(leader.rank), CARD_W - 6, zone.bottom - Math.round(zoneH * 0.108));
  ctx.restore();

  const [given, family] = kind === "player" ? splitName(leader.name) : ["", ""];
  const name =
    kind === "player"
      ? fitLines(ctx, family, maxW, 122, 30, 700)
      : fitLines(ctx, cleanTeamLabel(leader.name).toUpperCase(), maxW, 84, 30, 700);
  const nameCap = capHeight(ctx, { size: name.size, weight: 700 });
  const nameGap = Math.round(name.size * 0.3);
  // The given name stays clearly the smaller line, even when a long surname has had to shrink.
  const givenSize = given ? fitSize(ctx, given, maxW, Math.max(22, Math.min(42, Math.round(name.size * 0.42))), 18, 400) : 0;
  const givenCap = given ? capHeight(ctx, { size: givenSize }) : 0;

  const unitOpts: TextOpts = { size: 46, weight: 600, color: theme.accent };
  setFont(ctx, unitOpts);
  const unitW = ctx.measureText(unit).width;
  const valueSize = fitSize(ctx, leader.display, maxW - unitW - 18, kind === "player" ? 204 : 176, 96, 700);
  const valueCap = capHeight(ctx, { size: valueSize, weight: 700 });

  const club = kind === "player" ? cleanTeamLabel(leader.team_name).toUpperCase() : "";
  const metaH = kind === "player" ? 46 : 20;
  const blockH =
    40 + 30 + (given ? givenCap + 16 : 0) + name.lines.length * nameCap + (name.lines.length - 1) * nameGap + 26 + metaH + 36 + valueCap;
  let y = Math.round(zone.top + (zoneH - blockH) / 2);

  y += drawTag(ctx, "LEAGUE LEADER", x, y, theme) + 30;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 4;
  if (given) {
    drawSpaced(ctx, given, x, y, 2, { size: givenSize, alpha: 0.92 });
    y += givenCap + 16;
  }
  name.lines.forEach((line, i) => {
    drawTextTop(ctx, line, x, y, { size: name.size, weight: 700 });
    y += nameCap + (i < name.lines.length - 1 ? nameGap : 0);
  });
  y += 26;

  if (kind === "player") {
    let textX = x;
    if (club) {
      drawCrest(ctx, x + 23, y + 23, 23, clubLogo, initialsOf(club), theme);
      textX = x + 60;
    }
    const meta = club ? `${club}  ·  ${games}` : games;
    const o: TextOpts = { size: 24, weight: 500, alpha: 0.86 };
    let spacing = 1.5;
    if (spacedWidth(ctx, meta, spacing, o) > CARD_W - SIDE - textX) {
      spacing = 0;
      o.size = fitSize(ctx, meta, CARD_W - SIDE - textX, 24, 15, 500);
    }
    drawSpaced(ctx, meta, textX, y + (46 - capHeight(ctx, o)) / 2, spacing, o);
  } else {
    drawSpaced(ctx, `${games} PLAYED`, x, y, 3, { size: 26, weight: 500, alpha: 0.86 });
  }
  y += metaH + 36;

  const valueOpts: TextOpts = { size: valueSize, weight: 700 };
  drawTextTop(ctx, leader.display, x - valueSize * 0.03, y, valueOpts);
  setFont(ctx, valueOpts);
  const valueW = ctx.measureText(leader.display).width;
  drawTextTop(ctx, unit, x + valueW + 16, y + valueCap - capHeight(ctx, unitOpts), unitOpts);
  ctx.restore();
}

/** Ranks 2–5 as full-width rows under the hero. */
function drawRows(
  ctx: CanvasRenderingContext2D,
  kind: "player" | "team",
  rest: Leader[],
  logos: (HTMLImageElement | null)[],
  theme: Theme,
) {
  const right = CARD_W - SIDE;
  const withCrests = kind === "team" || logos.some(Boolean);
  rest.forEach((leader, i) => {
    const y = LIST_TOP + i * ROW_H;
    const midY = y + ROW_H / 2;

    // Hairline between rows, tailing off at both ends.
    const line = ctx.createLinearGradient(SIDE, 0, right, 0);
    line.addColorStop(0, "rgba(255,255,255,0)");
    line.addColorStop(0.08, "rgba(255,255,255,0.2)");
    line.addColorStop(0.92, "rgba(255,255,255,0.2)");
    line.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = line;
    ctx.fillRect(SIDE, y, right - SIDE, 1.5);

    const rankOpts: TextOpts = { size: 52, weight: 700, color: theme.rank, align: "center" };
    drawTextTop(ctx, String(leader.rank), SIDE + 24, midY - capHeight(ctx, rankOpts) / 2, rankOpts);

    let nameX = SIDE + 72;
    const teamLabel = cleanTeamLabel(kind === "team" ? leader.name : leader.team_name);
    if (withCrests) {
      drawCrest(ctx, nameX + 31, midY, 31, logos[i], initialsOf(teamLabel), theme);
      nameX += 84;
    }

    const valueOpts: TextOpts = { size: 60, weight: 700, align: "right" };
    setFont(ctx, valueOpts);
    const valueW = ctx.measureText(leader.display).width;
    drawTextTop(ctx, leader.display, right, midY - capHeight(ctx, valueOpts) / 2, valueOpts);

    const maxW = right - valueW - 30 - nameX;
    const name = kind === "team" ? teamLabel : leader.name;
    const games = `${leader.games} GP`;
    const sub = kind === "player" && teamLabel ? `${teamLabel}  ·  ${games}` : games;
    const nameSize = fitSize(ctx, name, maxW, 42, 24, 500);
    const subSize = fitSize(ctx, sub, maxW, 23, 16, 400);
    const nameCap = capHeight(ctx, { size: nameSize, weight: 500 });
    const subCap = capHeight(ctx, { size: subSize });
    const top = midY - (nameCap + 11 + subCap) / 2;
    drawTextTop(ctx, name, nameX, top, { size: nameSize, weight: 500 });
    drawTextTop(ctx, sub, nameX, top + nameCap + 11, { size: subSize, alpha: 0.66 });
  });
}

/**
 * Team leaders, ranks 2–5: one column each, side by side, so every club's logo gets a column's
 * width instead of a slot at the start of a row. Rank, logo, number, then the club's name.
 */
function drawLogoStrip(ctx: CanvasRenderingContext2D, rest: Leader[], logos: (HTMLImageElement | null)[], theme: Theme) {
  if (rest.length === 0) return;
  const left = SIDE;
  const right = CARD_W - SIDE;
  const colW = Math.min(300, (right - left) / rest.length);
  const x0 = (CARD_W - colW * rest.length) / 2;
  const bottom = CARD_H - 150;

  // The rule over the strip, tailing off at both ends.
  const rule = ctx.createLinearGradient(left, 0, right, 0);
  rule.addColorStop(0, "rgba(255,255,255,0)");
  rule.addColorStop(0.08, "rgba(255,255,255,0.2)");
  rule.addColorStop(0.92, "rgba(255,255,255,0.2)");
  rule.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = rule;
  ctx.fillRect(left, STRIP_TOP, right - left, 1.5);

  rest.forEach((leader, i) => {
    const cx = x0 + colW * i + colW / 2;
    const textW = colW - 30;

    if (i > 0) {
      const divider = ctx.createLinearGradient(0, STRIP_TOP + 30, 0, bottom);
      divider.addColorStop(0, "rgba(255,255,255,0)");
      divider.addColorStop(0.2, "rgba(255,255,255,0.16)");
      divider.addColorStop(0.8, "rgba(255,255,255,0.16)");
      divider.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = divider;
      ctx.fillRect(x0 + colW * i, STRIP_TOP + 30, 1.5, bottom - STRIP_TOP - 30);
    }

    let y = STRIP_TOP + 24;
    y += drawTextTop(ctx, String(leader.rank), cx, y, { size: 42, weight: 700, color: theme.rank, align: "center" }) + 16;

    const label = cleanTeamLabel(leader.name);
    const logoH = 192;
    drawLogoMark(ctx, cx, y + logoH / 2, colW - 34, logoH, logos[i], initialsOf(label), theme);
    y += logoH + 24;

    // Narrower than the name's room, so "45.6%" in one column never crowds the next.
    const valueSize = fitSize(ctx, leader.display, colW - 56, 74, 40, 700);
    y += drawTextTop(ctx, leader.display, cx, y, { size: valueSize, weight: 700, align: "center" }) + 20;

    const name = fitLines(ctx, label, textW, 30, 18, 500);
    name.lines.forEach((line) => {
      y += drawTextTop(ctx, line, cx, y, { size: name.size, weight: 500, align: "center" }) + 10;
    });
    drawTextTop(ctx, `${leader.games} GP`, cx, y + 3, { size: 20, alpha: 0.66, align: "center" });
  });
}

export async function renderLeadersCard(opts: LeadersCardOptions): Promise<HTMLCanvasElement> {
  const { kind, style = "league", categoryTitle, unit, leaders, brand, teamLogoUrls = [], framing = DEFAULT_FRAMING, footnote } = opts;
  await ensureDisplayFont();

  const top = leaders.slice(0, 5);
  const [logo, leagueLogo, heroPhoto, ...clubLogos] = await Promise.all([
    fetchImg(swishLogoSrc),
    fetchImg(brand.leagueLogoUrl),
    kind === "player" ? fetchImg(top[0]?.photoUrl) : Promise.resolve(null),
    ...top.map((_, i) => fetchImg(teamLogoUrls[i])),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const theme = themeFor(style, brand.primaryHex);
  const hero = top[0];

  // In the court style the leader stands in the paint: the key frames the hero art and its
  // free-throw line sits on the list's top rule.
  const zone = kind === "team" ? TEAM_HERO : PLAYER_HERO;
  drawBackdrop(ctx, theme, leagueLogo, { x: 340, y: (kind === "team" ? STRIP_TOP : LIST_TOP) - 580 });

  // ── hero art: the #1 club's logo, standing free; or the #1 player's photo, else their club's crest ──
  if (hero && kind === "player" && heroPhoto) {
    drawGlow(ctx, 300, 520, 560, theme.accent, theme.glow);
    drawHeroPhoto(ctx, heroPhoto, hero.photoFocusY ?? 30, framing, theme);
    drawTextShade(ctx);
  } else if (hero && kind === "team") {
    const cy = (zone.top + zone.bottom) / 2 + 4;
    drawGlow(ctx, 296, cy, 430, "#ffffff", 0.2);
    drawLogoMark(ctx, 296, cy, 468, 400, clubLogos[0] ?? null, initialsOf(cleanTeamLabel(hero.name)), theme);
  } else if (hero) {
    drawRingedCrest(ctx, 300, (HERO_TOP + HERO_BOTTOM) / 2 + 4, 178, clubLogos[0] ?? null, initialsOf(hero.name), theme);
  }
  drawVignette(ctx, theme);

  drawHeader(ctx, kind === "player" ? "PLAYER LEADERS" : "TEAM LEADERS", categoryTitle, brand.leagueName, theme);
  if (hero) drawHeroText(ctx, kind, hero, unit, clubLogos[0] ?? null, theme, zone);
  if (kind === "team") drawLogoStrip(ctx, top.slice(1), clubLogos.slice(1), theme);
  else drawRows(ctx, kind, top.slice(1), clubLogos.slice(1), theme);

  drawFooter(ctx, [logo, "statsthread", leagueLogo], [brand.leagueName, footnote].filter(Boolean).join("  ·  "));
  return canvas;
}
