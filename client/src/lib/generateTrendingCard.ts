/**
 * Generates a social-media-ready trending performance card entirely via the
 * Canvas 2D API. This completely bypasses html2canvas and its layout
 * quirks, giving pixel-perfect output at any scale.
 */

import SwishLogoSrc from "@/assets/Swish Assistant Logo.png";

export interface TrendingCardOptions {
  playerName: string;
  teamName: string | null;
  gameDate: string | null;
  opponentName?: string | null;
  gameResult?: string | null;
  tsPct: string;
  gmSc: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fgm: number | null;
  fga: number | null;
  ftm: number | null;
  fta: number | null;
  photoUrl: string | null;
  teamLogoUrl: string | null;
  leagueName: string | undefined;
  isDark: boolean;
  cardWidth?: number;
}

function fmtDate(s: string | null): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function loadImg(src: string, crossOrigin = true): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function fetchAsImg(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null;
  try {
    const resp = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!resp.ok) return loadImg(src);
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    return loadImg(dataUrl, false);
  } catch {
    return loadImg(src);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function generateTrendingCardBlob(opts: TrendingCardOptions): Promise<Blob | null> {
  const {
    playerName, teamName, gameDate, opponentName, gameResult, tsPct,
    gmSc, pts, reb, ast, stl, blk, tov,
    fgm, fga, ftm, fta,
    photoUrl, teamLogoUrl, leagueName, isDark,
    cardWidth = 560,
  } = opts;

  const SCALE = 3;
  const W = cardWidth;
  const PAD = 20;
  const AVATAR = 48;
  const STATS_ROW_H = 56;

  const bg         = isDark ? "#171717" : "#ffffff";
  const borderCol  = isDark ? "#262626" : "#e2e8f0";
  const titleCol   = isDark ? "#f1f5f9" : "#0f172a";
  const metaCol    = isDark ? "#94a3b8" : "#64748b";
  const dividerCol = isDark ? "#262626" : "#e2e8f0";
  const valCol     = isDark ? "#ffffff"  : "#0f172a";
  const lblCol     = isDark ? "#94a3b8"  : "#64748b";
  const accent     = "#f97316";
  const wmCol      = isDark ? "#ffffff" : "#f97316";

  const TITLE_BLOCK  = 26;
  const TITLE_GAP    = 12;
  const PLAYER_BLOCK = 52;
  const DIV_PRE      = 16;
  const DIV_POST     = 14;
  const STATS_GAP    = 12;
  const WM_PRE       = 14;
  const WM_H         = 14;
  const BOT_PAD      = 20;

  const H =
    PAD +
    TITLE_BLOCK + TITLE_GAP +
    PLAYER_BLOCK + DIV_PRE + 1 + DIV_POST +
    STATS_ROW_H + STATS_GAP + STATS_ROW_H +
    WM_PRE + WM_H + BOT_PAD;

  const canvas = document.createElement("canvas");
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);

  const [photoImg, teamLogoImg, swishImg] = await Promise.all([
    photoUrl    ? fetchAsImg(photoUrl)    : Promise.resolve(null),
    teamLogoUrl ? fetchAsImg(teamLogoUrl) : Promise.resolve(null),
    loadImg(SwishLogoSrc, false),
  ]);

  ctx.save();
  roundRect(ctx, 0, 0, W, H, 16);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  let y = PAD;

  ctx.textBaseline = "alphabetic";
  ctx.textAlign    = "left";

  ctx.font      = "700 18px system-ui,-apple-system,sans-serif";
  ctx.fillStyle = titleCol;
  ctx.fillText("Trending Performance", PAD, y + 18);
  if (leagueName) {
    const tw = ctx.measureText("Trending Performance").width;
    ctx.font      = "600 10px system-ui,-apple-system,sans-serif";
    ctx.fillStyle = accent;
    ctx.fillText(leagueName.toUpperCase(), PAD + tw + 10, y + 17);
  }
  y += TITLE_BLOCK + TITLE_GAP;

  ctx.save();
  ctx.beginPath();
  ctx.arc(PAD + AVATAR / 2, y + AVATAR / 2, AVATAR / 2, 0, Math.PI * 2);
  ctx.closePath();
  if (photoImg) {
    ctx.clip();
    ctx.drawImage(photoImg, PAD, y, AVATAR, AVATAR);
  } else {
    if (isDark) {
      ctx.fillStyle = "#374151";
    } else {
      const g = ctx.createLinearGradient(PAD, y, PAD + AVATAR, y + AVATAR);
      g.addColorStop(0, "#ffedd5");
      g.addColorStop(1, "#fef9c3");
      ctx.fillStyle = g;
    }
    ctx.fill();
    const ini = playerName.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle    = "#ea580c";
    ctx.font         = "700 15px system-ui,-apple-system,sans-serif";
    ctx.fillText(ini, PAD + AVATAR / 2, y + AVATAR / 2);
    ctx.textAlign    = "left";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();

  const nameX = PAD + AVATAR + 12;

  ctx.font      = "600 15px system-ui,-apple-system,sans-serif";
  ctx.fillStyle = titleCol;
  ctx.fillText(playerName, nameX, y + 19);

  const metaY    = y + 38;
  ctx.font      = "400 12px system-ui,-apple-system,sans-serif";
  ctx.fillStyle = metaCol;

  let metaDrawX = nameX;

  // Draw team logo if available
  if (teamLogoImg && teamName) {
    const LOGO_H  = 14;
    const LOGO_W  = teamLogoImg.naturalWidth > 0
      ? (LOGO_H * teamLogoImg.naturalWidth) / teamLogoImg.naturalHeight
      : LOGO_H;
    ctx.drawImage(teamLogoImg, metaDrawX, metaY - 12, LOGO_W, LOGO_H);
    metaDrawX += LOGO_W + 5;
  }

  if (opponentName) {
    const vsText = `vs ${opponentName}`;
    ctx.fillStyle = metaCol;
    ctx.fillText(vsText, metaDrawX, metaY);
    if (gameResult) {
      const vsW = ctx.measureText(vsText).width;
      ctx.fillText(" · ", metaDrawX + vsW, metaY);
      const sepW = ctx.measureText(" · ").width;
      // Color W green, L red
      ctx.font = "600 12px system-ui,-apple-system,sans-serif";
      if (gameResult.startsWith("W")) {
        ctx.fillStyle = isDark ? "#4ade80" : "#16a34a";
      } else if (gameResult.startsWith("L")) {
        ctx.fillStyle = isDark ? "#f87171" : "#dc2626";
      } else {
        ctx.fillStyle = metaCol;
      }
      ctx.fillText(gameResult, metaDrawX + vsW + sepW, metaY);
      ctx.font = "400 12px system-ui,-apple-system,sans-serif";
      ctx.fillStyle = metaCol;
    }
  } else {
    let metaText = fmtDate(gameDate);
    if (teamName) metaText += ` • ${teamName}`;
    ctx.fillText(metaText, metaDrawX, metaY);
  }

  y += PLAYER_BLOCK + DIV_PRE;

  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.strokeStyle = dividerCol;
  ctx.lineWidth   = 1;
  ctx.stroke();
  y += 1 + DIV_POST;

  const colW = (W - PAD * 2) / 5;

  // Row 1: primary stats
  const row1 = [
    { label: "GmSc", value: String(gmSc ?? 0) },
    { label: "PTS",  value: String(pts ?? 0) },
    { label: "REB",  value: String(reb ?? 0) },
    { label: "AST",  value: String(ast ?? 0) },
    { label: "STL",  value: String(stl ?? 0) },
  ];
  // Row 2: secondary stats — FG and FT shown as "makes/attempts" (e.g. 8/12)
  const row2 = [
    { label: "BLK", value: String(blk ?? 0) },
    { label: "TOV", value: String(tov ?? 0) },
    { label: "FG",  value: `${fgm ?? 0}/${fga ?? 0}` },
    { label: "FT",  value: `${ftm ?? 0}/${fta ?? 0}` },
    { label: "TS%", value: tsPct },
  ];

  const drawRow = (row: { label: string; value: string }[], rowY: number) => {
    row.forEach((s, i) => {
      const cx = PAD + colW * i + colW / 2;
      ctx.textAlign    = "center";
      ctx.textBaseline = "alphabetic";
      // Slightly smaller font for fraction values so they fit the column width
      const isFraction = s.value.includes("/");
      ctx.font         = isFraction
        ? "700 17px system-ui,-apple-system,sans-serif"
        : "700 22px system-ui,-apple-system,sans-serif";
      ctx.fillStyle    = valCol;
      ctx.fillText(s.value, cx, rowY + 26);
      ctx.font         = "500 10px system-ui,-apple-system,sans-serif";
      ctx.fillStyle    = lblCol;
      ctx.fillText(s.label, cx, rowY + 41);
    });
    ctx.textAlign = "left";
  };

  drawRow(row1, y);
  y += STATS_ROW_H + STATS_GAP;
  drawRow(row2, y);
  y += STATS_ROW_H + WM_PRE;

  const WM_LOGO_H  = 13;
  const wmText     = "www.swishassistant.com";
  ctx.font         = `600 11px system-ui,-apple-system,sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign    = "right";
  ctx.fillStyle    = wmCol;

  const textRightX = W - PAD;
  ctx.fillText(wmText, textRightX, y + 11);
  const wmTextW = ctx.measureText(wmText).width;

  if (swishImg) {
    const logoW = swishImg.naturalWidth > 0
      ? (WM_LOGO_H * swishImg.naturalWidth) / swishImg.naturalHeight
      : WM_LOGO_H;
    const logoX = textRightX - wmTextW - logoW - 5;
    ctx.drawImage(swishImg, logoX, y, logoW, WM_LOGO_H);
  }

  ctx.textAlign    = "left";
  ctx.textBaseline = "alphabetic";

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 1.0);
  });
}
