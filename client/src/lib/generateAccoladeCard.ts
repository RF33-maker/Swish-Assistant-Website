/**
 * Draws the front of a collectible accolade card (components/cards/
 * AccoladeCard) onto a canvas for downloads, measured from the on-screen card
 * at its desktop size exactly as generateTradingCard does for the trading
 * cards, and with its small Swish logo in the corner where the on-screen card
 * has its download button.
 */
import SwishLogoSrc from "@/assets/Swish Assistant Logo.png";
import type { Accolade } from "@/lib/accolades";
import { accoladeCardText, accoladeSetLine, accoladeTierStyle } from "@/lib/accoladeCards";
import {
  BODY, CH, CW, DISPLAY, baselineIn, castShadow, cq, drawSpaced, ellipsize, font, loadFonts, loadImage, mx,
  roundRectPath, spacedWidth, type TradingCardPalette,
} from "@/lib/generateTradingCard";

// Keep in step with EMBLEM_PATHS in components/cards/AccoladeCard.
const EMBLEM_PATHS = {
  gem: ["M6 3h12l4 6-10 13L2 9Z", "M11 3 8 9l4 13 4-13-3-6", "M2 9h20"],
  sparkle: ["M12 2.5 14.3 9.7 21.5 12 14.3 14.3 12 21.5 9.7 14.3 2.5 12 9.7 9.7Z"],
  star: ["M12 2.5 14.9 8.6 21.5 9.4 16.6 13.9 17.9 20.5 12 17.2 6.1 20.5 7.4 13.9 2.5 9.4 9.1 8.6Z"],
};

const PALETTES: Record<"light" | "dark", Pick<TradingCardPalette, "surface" | "border" | "text" | "text2" | "muted">> = {
  light: { surface: "#ffffff", border: "rgba(15, 23, 42, 0.08)", text: "#0b1220", text2: "#475467", muted: "#8a94a6" },
  dark: { surface: "#111317", border: "rgba(255, 255, 255, 0.07)", text: "#f3f4f6", text2: "#a3abb8", muted: "#6b7280" },
};

export interface AccoladeCardOptions {
  accolade: Accolade;
  playerName: string;
  cutoutUrl?: string | null;
  profilePhotoUrl?: string | null;
  teamColor: string;
  readableTeamColor: string;
  competitionName: string;
  competitionLogoUrl?: string | null;
  collectorNo: string;
  isDark: boolean;
  palette?: Partial<TradingCardPalette>;
  width?: number;
}

/** A CSS linear-gradient(135deg, …) over a box. */
function foilGradient(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stops: string[]) {
  const len = (w + h) * Math.SQRT1_2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const d = (len / 2) * Math.SQRT1_2;
  const g = ctx.createLinearGradient(cx - d, cy - d, cx + d, cy + d);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

export async function generateAccoladeCardBlob(o: AccoladeCardOptions): Promise<Blob | null> {
  const outW = o.width ?? 1080;
  const S = outW / CW;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = Math.round(CH * S);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const pal = { ...PALETTES[o.isDark ? "dark" : "light"] };
  for (const [k, v] of Object.entries(o.palette ?? {})) {
    if (v && k in pal) pal[k as keyof typeof pal] = v;
  }
  const style = accoladeTierStyle(o.accolade.tier, o.teamColor, o.readableTeamColor);
  const text = accoladeCardText(o.accolade);
  const set = accoladeSetLine(o.accolade, o.competitionName);
  const ink = o.isDark ? style.ink.dark : style.ink.light;
  const stampColor = style.foil[0];

  const objectUrls: string[] = [];
  const [, cutout, profile, leagueLogo, swish] = await Promise.all([
    loadFonts([o.playerName, set.title, set.tier, text.kicker, text.sub, text.footer, text.stamp].join(" ")),
    loadImage(o.cutoutUrl, objectUrls),
    o.cutoutUrl ? Promise.resolve(null) : loadImage(o.profilePhotoUrl, objectUrls),
    loadImage(o.competitionLogoUrl, objectUrls),
    loadImage(SwishLogoSrc, objectUrls),
  ]);
  const photo = cutout ?? (o.cutoutUrl ? await loadImage(o.profilePhotoUrl, objectUrls) : profile);

  ctx.scale(S, S);
  ctx.textBaseline = "alphabetic";

  // Foil frame
  ctx.save();
  roundRectPath(ctx, 0, 0, CW, CH, 18);
  ctx.clip();
  ctx.fillStyle = foilGradient(ctx, 0, 0, CW, CH, style.foil);
  ctx.fillRect(0, 0, CW, CH);

  // Inner card
  const inset = cq(1.4);
  const IX = inset;
  const IY = inset;
  const IW = CW - inset * 2;
  const IH = CH - inset * 2;
  roundRectPath(ctx, IX, IY, IW, IH, 14);
  ctx.clip();
  ctx.fillStyle = pal.surface;
  ctx.fillRect(IX, IY, IW, IH);

  // ── Art ──
  const AH = IH * 0.54;
  ctx.save();
  ctx.beginPath();
  ctx.rect(IX, IY, IW, AH);
  ctx.clip();
  {
    // radial-gradient(85% 75% at 50% 30%, base0, base1)
    const rx = 0.85 * IW;
    const ry = 0.75 * AH;
    const k = ry / rx;
    const cx = IX + IW / 2;
    const cy = IY + AH * 0.3;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, k);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, style.base[0]);
    g.addColorStop(1, style.base[1]);
    ctx.fillStyle = g;
    ctx.fillRect(IX - cx, (IY - cy) / k, IW, AH / k);
    ctx.restore();
  }
  // Court lines
  {
    const s = Math.max(IW / 100, AH / 80);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.translate(IX + (IW - 100 * s) / 2, IY + (AH - 80 * s) / 2);
    ctx.scale(s, s);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(50, -4, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(18, 22);
    ctx.arc(50, 22, 32, Math.PI, 0, true);
    ctx.lineTo(82, 0);
    ctx.stroke();
    ctx.strokeRect(38, 0, 24, 30);
    ctx.restore();
  }
  // Player
  const pcx = IX + IW / 2;
  const pcy = IY + AH / 2;
  if (photo && cutout) {
    const h = AH * 0.92;
    const w = (photo.naturalWidth / photo.naturalHeight) * h;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 18 * S;
    ctx.shadowOffsetY = 10 * S;
    ctx.drawImage(photo, pcx - w / 2, IY + AH - h, w, h);
    ctx.restore();
  } else if (photo) {
    const R = cq(46) / 2;
    const inner = R - cq(1.1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(IX, IY, IW, AH);
    ctx.arc(pcx, pcy, R, 0, Math.PI * 2);
    ctx.clip("evenodd");
    castShadow(ctx, S, (dy) => {
      ctx.beginPath();
      ctx.arc(pcx, pcy + dy, R - 10, 0, Math.PI * 2);
    }, 14, 30, "rgba(0, 0, 0, 0.7)");
    ctx.restore();
    ctx.beginPath();
    ctx.arc(pcx, pcy, R, 0, Math.PI * 2);
    ctx.fillStyle = foilGradient(ctx, pcx - R, pcy - R, R * 2, R * 2, style.foil);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(pcx, pcy, inner, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fill();
    const d = inner * 2;
    const cover = Math.max(d / photo.naturalWidth, d / photo.naturalHeight);
    const w = photo.naturalWidth * cover;
    const h = photo.naturalHeight * cover;
    ctx.drawImage(photo, pcx - inner + (d - w) * 0.5, pcy - inner + (d - h) * 0.22, w, h);
    ctx.restore();
  } else {
    const R = cq(40) / 2;
    ctx.beginPath();
    ctx.arc(pcx, pcy, R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pcx, pcy, R + 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const initials = o.playerName.split(" ").map((n) => n[0]).slice(0, 2).join("");
    const size = cq(15);
    ctx.font = font(700, size, DISPLAY);
    ctx.fillStyle = "#ffffff";
    const w = spacedWidth(ctx, initials, size * 0.005);
    drawSpaced(ctx, initials, pcx - w / 2, baselineIn(ctx, pcy - size * 0.75, size * 1.5), size * 0.005);
  }
  // Sheen, caught mid-sweep
  {
    const g = ctx.createLinearGradient(IX, IY + AH, IX + IW, IY);
    g.addColorStop(0.3, "rgba(255, 255, 255, 0)");
    g.addColorStop(0.45, "rgba(255, 255, 255, 0.16)");
    g.addColorStop(0.52, "rgba(255, 255, 255, 0.04)");
    g.addColorStop(0.6, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(IX, IY, IW, AH);
  }
  // Scrim: from-black/60 via-transparent to-black/25
  {
    const g = ctx.createLinearGradient(0, IY + AH, 0, IY);
    g.addColorStop(0, "rgba(0, 0, 0, 0.6)");
    g.addColorStop(0.5, "rgba(0, 0, 0, 0)");
    g.addColorStop(1, "rgba(0, 0, 0, 0.25)");
    ctx.fillStyle = g;
    ctx.fillRect(IX, IY, IW, AH);
  }
  // Set line: competition and tier
  {
    const left = cq(4.5);
    const top = cq(4.5);
    const rightEdge = IX + IW - Math.max(48, cq(17));
    const logoSize = mx(20, 8.5);
    const nameSize = mx(9, 3.1);
    const tierSize = mx(8, 2.7);
    const nameLH = nameSize * 1.25;
    const tierLH = tierSize * 1.25;
    const textH = nameLH + tierLH;
    const rowH = leagueLogo ? Math.max(logoSize, textH) : textH;
    let x = IX + left;
    const y = IY + top;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 2 * S;
    ctx.shadowOffsetY = 1 * S;
    if (leagueLogo) {
      const fit = Math.min(logoSize / leagueLogo.naturalWidth, logoSize / leagueLogo.naturalHeight);
      const w = leagueLogo.naturalWidth * fit;
      const h = leagueLogo.naturalHeight * fit;
      ctx.drawImage(leagueLogo, x + (logoSize - w) / 2, y + (rowH - logoSize) / 2 + (logoSize - h) / 2, w, h);
      x += logoSize + cq(2);
    }
    const textTop = y + (rowH - textH) / 2;
    ctx.font = font(600, nameSize, BODY);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    drawSpaced(ctx, ellipsize(ctx, set.title.toUpperCase(), rightEdge - x, nameSize * 0.12), x, baselineIn(ctx, textTop, nameLH), nameSize * 0.12);
    ctx.font = font(600, tierSize, BODY);
    ctx.fillStyle = stampColor;
    drawSpaced(ctx, ellipsize(ctx, set.tier.toUpperCase(), rightEdge - x, tierSize * 0.14), x, baselineIn(ctx, textTop + nameLH, tierLH), tierSize * 0.14);
    ctx.restore();
  }
  // Stamp, tilted like a rubber stamp
  {
    const size = mx(9, 3.2);
    const spacing = size * 0.16;
    ctx.font = font(800, size, BODY);
    const label = text.stamp.toUpperCase();
    const padX = cq(2.4);
    const padY = cq(1);
    const border = Math.max(1.5, cq(0.6));
    const w = spacedWidth(ctx, label, spacing) + padX * 2 + border * 2;
    const h = size * 1.5 + padY * 2 + border * 2;
    const x = IX + cq(4.5);
    const bottom = IY + AH - cq(5);
    ctx.save();
    ctx.translate(x, bottom - h / 2);
    ctx.rotate((-7 * Math.PI) / 180);
    roundRectPath(ctx, 0, -h / 2, w, h, cq(1.4));
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fill();
    roundRectPath(ctx, border / 2, -h / 2 + border / 2, w - border, h - border, cq(1.4) - border / 2);
    ctx.strokeStyle = stampColor;
    ctx.lineWidth = border;
    ctx.stroke();
    ctx.fillStyle = stampColor;
    drawSpaced(ctx, label, border + padX, baselineIn(ctx, -h / 2 + border + padY, size * 1.5), spacing);
    ctx.restore();
  }
  // Emblem
  {
    const size = cq(12);
    const ex = IX + IW - cq(4.5) - size;
    const ey = IY + AH - cq(4.5) - size;
    const ecx = ex + size / 2;
    const ecy = ey + size / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 14 * S;
    ctx.shadowOffsetY = 6 * S;
    ctx.beginPath();
    ctx.arc(ecx, ecy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = foilGradient(ctx, ex, ey, size, size, style.foil);
    ctx.fill();
    ctx.restore();
    const tier = o.accolade.tier;
    if (tier === "gold" || tier === "silver" || tier === "bronze") {
      const place = (o.accolade.value ?? "").replace("#", "");
      const fs = cq(5.6);
      ctx.font = font(700, fs, DISPLAY);
      ctx.fillStyle = style.base[1];
      const w = ctx.measureText(place).width;
      ctx.fillText(place, ecx - w / 2, baselineIn(ctx, ecy - fs / 2, fs));
    } else {
      const paths = tier === "diamond" ? EMBLEM_PATHS.gem : tier === "platinum" ? EMBLEM_PATHS.sparkle : EMBLEM_PATHS.star;
      const iconSize = size * 0.55;
      ctx.save();
      ctx.translate(ecx - iconSize / 2, ecy - iconSize / 2);
      ctx.scale(iconSize / 24, iconSize / 24);
      for (const d of paths) {
        const p = new Path2D(d);
        if (tier === "diamond") {
          ctx.strokeStyle = style.base[1];
          ctx.lineWidth = 1.8;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke(p);
        } else {
          ctx.fillStyle = style.base[1];
          ctx.fill(p);
        }
      }
      ctx.restore();
    }
  }
  // Swish logo where the on-screen card has its download button.
  if (swish) {
    const size = 28;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 3 * S;
    ctx.shadowOffsetY = 1 * S;
    ctx.drawImage(swish, CW - 12 - 16 - size / 2, 12 + 16 - size / 2, size, size);
    ctx.restore();
  }
  ctx.restore(); // art clip

  // ── Body ──
  const padX = cq(5);
  const BX = IX + padX;
  const BW = IW - padX * 2;
  let y = IY + AH + cq(3.2);
  {
    const size = mx(8.5, 2.9);
    ctx.font = font(700, size, BODY);
    ctx.fillStyle = ink;
    drawSpaced(ctx, ellipsize(ctx, text.kicker.toUpperCase(), BW, size * 0.14), BX, baselineIn(ctx, y, size * 1.5), size * 0.14);
    y += size * 1.5 + cq(0.6);
  }
  {
    const hs = mx(28, 13.5);
    const us = mx(12, 5.4);
    ctx.font = font(700, hs, DISPLAY);
    const baseline = baselineIn(ctx, y, hs);
    ctx.fillStyle = ink;
    drawSpaced(ctx, text.headline, BX, baseline, hs * 0.005);
    const hw = spacedWidth(ctx, text.headline, hs * 0.005);
    if (text.unit) {
      ctx.font = font(700, us, DISPLAY);
      ctx.fillStyle = pal.text;
      const ux = BX + hw + cq(1.6);
      drawSpaced(ctx, ellipsize(ctx, text.unit.toUpperCase(), BX + BW - ux, us * 0.005), ux, baseline, us * 0.005);
    }
    y += hs + cq(1);
  }
  {
    const size = mx(9, 3.2);
    ctx.font = font(400, size, BODY);
    ctx.fillStyle = pal.text2;
    ctx.fillText(ellipsize(ctx, text.sub, BW), BX, baselineIn(ctx, y, size * 1.5));
  }
  {
    const nameSize = mx(14, 6.4);
    const footSize = mx(8, 2.6);
    const footLH = footSize * 1.5;
    const bottom = IY + IH - cq(3.4);
    const footTop = bottom - footLH;
    const nameTop = footTop - cq(1.4) - nameSize * 0.95;
    const borderY = nameTop - cq(2.6) - 1;
    ctx.fillStyle = pal.border;
    ctx.fillRect(BX, borderY, BW, 1);
    ctx.font = font(700, nameSize, DISPLAY);
    ctx.fillStyle = pal.text;
    drawSpaced(ctx, ellipsize(ctx, o.playerName.toUpperCase(), BW, nameSize * 0.005), BX, baselineIn(ctx, nameTop, nameSize * 0.95), nameSize * 0.005);
    ctx.font = font(600, footSize, BODY);
    ctx.fillStyle = pal.muted;
    const spacing = footSize * 0.12;
    const no = o.collectorNo.toUpperCase();
    const noW = spacedWidth(ctx, no, spacing);
    const fy = baselineIn(ctx, footTop, footLH);
    drawSpaced(ctx, no, BX + BW - noW, fy, spacing);
    drawSpaced(ctx, ellipsize(ctx, text.footer.toUpperCase(), BW - noW - cq(2), spacing), BX, fy, spacing);
  }
  ctx.restore(); // card clip

  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  return blob;
}
