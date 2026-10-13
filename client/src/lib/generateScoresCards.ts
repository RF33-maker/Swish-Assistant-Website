/**
 * Results cards (1080×1350): a list of final scores in the shared Swish Social look
 * (see cardStyle.ts). Each game is a two-line scoreboard with both clubs' crests; the
 * winner is lit and the loser dimmed. Built for the NBL Division Two scores, which come
 * with no stats, so a game is only teams and a score.
 */

import swishLogoSrc from "@/assets/Swish Assistant Logo.png";
import {
  SIDE,
  cleanTeamLabel,
  drawBackdrop,
  drawCrest,
  drawHeader,
  drawVignette,
  themeFor,
  type CardStyle,
  type Theme,
} from "@/lib/cardStyle";
import { CARD_H, CARD_W, capHeight, drawFooter, drawTextTop, ensureDisplayFont, fetchImg, fitSize, initialsOf, type TextOpts } from "@/lib/generateWeeklyCards";

export type ScoreGame = {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
};

export type ScoresCardOptions = {
  style?: CardStyle;
  primaryHex: string;
  /** Small line above the title, e.g. "NBL Division Two Men". */
  kicker: string;
  /** The banner under the title, e.g. "SAT 10 – SUN 11 OCT". */
  banner: string;
  games: ScoreGame[];
  /** Small print under the logos. */
  footnote?: string;
};

/** The most games one card holds without squeezing the rows. */
export const GAMES_PER_CARD = 6;

const LIST_TOP = 268;
const LIST_BOTTOM = CARD_H - 150;
const GAME_GAP = 16;
const PAD = 16;
const CREST_R = 24;

function drawGame(
  ctx: CanvasRenderingContext2D,
  game: ScoreGame,
  logos: [HTMLImageElement | null, HTMLImageElement | null],
  top: number,
  height: number,
  theme: Theme,
) {
  const left = SIDE;
  const right = CARD_W - SIDE;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(left, top, right - left, height, 22);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const homeWon = game.homeScore > game.awayScore;
  const awayWon = game.awayScore > game.homeScore;
  const lines = [
    { team: game.homeTeam, score: game.homeScore, logo: logos[0], won: homeWon, lost: awayWon },
    { team: game.awayTeam, score: game.awayScore, logo: logos[1], won: awayWon, lost: homeWon },
  ];
  const lineH = (height - PAD * 2) / 2;

  lines.forEach((line, i) => {
    const midY = top + PAD + lineH * i + lineH / 2;
    const label = cleanTeamLabel(line.team);

    // The winner's line is marked with a bar in the accent colour.
    if (line.won) {
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.roundRect(left, midY - lineH * 0.34, 6, lineH * 0.68, 3);
      ctx.fill();
    }

    ctx.save();
    ctx.globalAlpha = line.lost ? 0.62 : 1;
    drawCrest(ctx, left + PAD + CREST_R + 10, midY, CREST_R, line.logo, initialsOf(label), theme);
    ctx.restore();

    const scoreOpts: TextOpts = { size: 52, weight: 700, align: "right", alpha: line.lost ? 0.6 : 1 };
    const scoreCap = capHeight(ctx, scoreOpts);
    drawTextTop(ctx, String(line.score), right - PAD - 4, midY - scoreCap / 2, scoreOpts);

    const nameX = left + PAD + CREST_R * 2 + 30;
    const maxW = right - PAD - 130 - nameX;
    const nameWeight = line.won ? 700 : 500;
    const size = fitSize(ctx, label, maxW, 38, 22, nameWeight);
    const nameOpts: TextOpts = { size, weight: nameWeight, alpha: line.lost ? 0.72 : 1 };
    drawTextTop(ctx, label, nameX, midY - capHeight(ctx, nameOpts) / 2, nameOpts);
  });

  // Hairline between the two clubs.
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(left + PAD, top + height / 2 - 0.75, right - left - PAD * 2, 1.5);
}

export async function renderScoresCard(opts: ScoresCardOptions): Promise<HTMLCanvasElement> {
  const { style = "league", primaryHex, kicker, banner, footnote } = opts;
  const games = opts.games.slice(0, GAMES_PER_CARD);
  await ensureDisplayFont();

  const [logo, ...clubLogos] = await Promise.all([
    fetchImg(swishLogoSrc),
    ...games.flatMap((g) => [fetchImg(g.homeLogoUrl), fetchImg(g.awayLogoUrl)]),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const theme = themeFor(style, primaryHex);

  drawBackdrop(ctx, theme, null, { x: 340, y: 760 });
  drawVignette(ctx, theme);
  drawHeader(ctx, "RESULTS", banner, kicker, theme);

  // Rows share the space down to the footer; a short list keeps the same row height, centred.
  const rowH = Math.min(150, (LIST_BOTTOM - LIST_TOP - GAME_GAP * (GAMES_PER_CARD - 1)) / GAMES_PER_CARD);
  const used = games.length * rowH + (games.length - 1) * GAME_GAP;
  const startY = LIST_TOP + Math.max(0, (LIST_BOTTOM - LIST_TOP - used) / 2);
  games.forEach((game, i) => {
    drawGame(ctx, game, [clubLogos[i * 2] ?? null, clubLogos[i * 2 + 1] ?? null], startY + i * (rowH + GAME_GAP), rowH, theme);
  });

  drawFooter(ctx, [logo, "statsthread"], footnote ?? "");
  return canvas;
}
