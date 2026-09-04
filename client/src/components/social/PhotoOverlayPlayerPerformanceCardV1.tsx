import type { CSSProperties } from "react";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";
import swishAssistantLogo from "@/assets/Swish Assistant Logo.png";

type PhotoOverlayData = PlayerPerformanceV1Data & {
  background_photo_url?: string;
  league_name?: string;
  league_logo_url?: string;
  sponsor_logo_urls?: string[];
};

type Props = {
  data: PlayerPerformanceV1Data;
};

const ORANGE = "#f58220";

const statLabelStyle: CSSProperties = {
  color: "rgba(255,255,255,.48)",
  fontFamily: "Arial, sans-serif",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.1em",
  lineHeight: 1,
  textTransform: "uppercase",
};

const statValueStyle: CSSProperties = {
  color: "#fff",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: 29,
  fontWeight: 900,
  letterSpacing: 0,
  lineHeight: 1,
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ minWidth: 0, textAlign: "center" }}>
      <div style={statValueStyle}>{value}</div>
      <div style={{ ...statLabelStyle, marginTop: 7 }}>{label}</div>
    </div>
  );
}

let textMeasureCanvas: HTMLCanvasElement | null = null;

function measureTextWidth(text: string, fontSize: number, fontWeight: number): number {
  if (typeof document === "undefined") return text.length * fontSize * 0.7;
  textMeasureCanvas ||= document.createElement("canvas");
  const context = textMeasureCanvas.getContext("2d");
  if (!context) return text.length * fontSize * 0.7;
  context.font = `${fontWeight} ${fontSize}px Arial, Helvetica, sans-serif`;
  return context.measureText(text).width;
}

function truncateTextToWidth(text: string, maxWidth: number, fontSize: number, fontWeight: number): string {
  if (measureTextWidth(text, fontSize, fontWeight) <= maxWidth) return text;

  const ellipsis = "…";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, midpoint).trimEnd()}${ellipsis}`;
    if (measureTextWidth(candidate, fontSize, fontWeight) <= maxWidth) low = midpoint;
    else high = midpoint - 1;
  }
  return `${text.slice(0, low).trimEnd()}${ellipsis}`;
}

function fitPlayerName(name: string): { fontSize: number; text: string } {
  const text = name.toUpperCase();
  const maxWidth = 508;
  for (let fontSize = 39; fontSize >= 20; fontSize -= 1) {
    if (measureTextWidth(text, fontSize, 900) <= maxWidth) return { fontSize, text };
  }
  return { fontSize: 20, text: truncateTextToWidth(text, maxWidth, 20, 900) };
}

function LogoRow({ data }: { data: PhotoOverlayData }) {
  const logos = [
    { src: data.home_logo_url, alt: data.team_name, kind: "team" },
    { src: data.league_logo_url, alt: data.league_name || "Competition", kind: "league" },
    ...(data.sponsor_logo_urls || [])
      .filter(Boolean)
      .map((src, index) => ({ src, alt: `Sponsor ${index + 1}`, kind: "sponsor" })),
  ].filter((logo): logo is { src: string; alt: string; kind: string } => Boolean(logo.src));
  const totalLogoCount = logos.length + 1;
  const logoGap = totalLogoCount <= 3 ? 46 : totalLogoCount <= 5 ? 30 : 18;
  const logoMaxWidth = totalLogoCount <= 3 ? 148 : totalLogoCount <= 5 ? 118 : 88;
  const logoHeight = totalLogoCount <= 3 ? 52 : totalLogoCount <= 5 ? 46 : 38;
  const swishMarkSize = totalLogoCount <= 5 ? 48 : 40;

  return (
    <div
      data-testid="photo-overlay-logo-row"
      style={{
        alignItems: "center",
        display: "flex",
        gap: logoGap,
        height: 58,
        justifyContent: "center",
        padding: "0 24px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          height: logoHeight,
          justifyContent: "center",
          minWidth: totalLogoCount <= 5 ? 112 : 92,
        }}
      >
        <img
          src={swishAssistantLogo}
          alt="Swish Assistant"
          style={{ height: swishMarkSize, objectFit: "contain", width: swishMarkSize }}
        />
        <span
          style={{
            color: "#fff",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: totalLogoCount <= 5 ? 17 : 14,
            fontWeight: 900,
            letterSpacing: ".01em",
            marginLeft: 7,
          }}
        >
          SWISH
        </span>
      </div>
      {logos.map((logo, index) => (
        <div
          key={`${logo.src}-${index}`}
          style={{
            alignItems: "center",
            display: "flex",
            height: logo.kind === "sponsor" ? Math.max(32, logoHeight - 7) : logoHeight,
            justifyContent: "center",
            maxWidth: logo.kind === "sponsor" ? logoMaxWidth - 6 : logoMaxWidth,
            minWidth: 0,
          }}
        >
          <img
            src={logo.src}
            alt={logo.alt}
            style={{ display: "block", height: "100%", maxWidth: "100%", objectFit: "contain", width: "auto" }}
            data-testid={`img-overlay-logo-${index}`}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Share-ready, photographic performance card. The fixed canvas is intentional:
 * social-tools captures this component at its native 1080 × 1350 dimensions.
 */
export function PhotoOverlayPlayerPerformanceCardV1({ data }: Props) {
  const overlayData = data as PhotoOverlayData;
  const photo = overlayData.background_photo_url || overlayData.photo_url;
  const won = Boolean(data.didWin);
  const focusY = Math.max(0, Math.min(100, Number(data.photo_focus_y ?? 50)));
  const hasScore = data.home_score > 0 || data.away_score > 0;
  const scoreText = hasScore ? `${data.home_score} — ${data.away_score} ${won ? "WIN" : "LOSS"}` : "";
  const nameFit = fitPlayerName(data.player_name);
  const scoreWidth = hasScore ? Math.ceil(measureTextWidth(scoreText, 15, 800)) : 0;
  const matchupWidth = 644 - (hasScore ? scoreWidth + 14 : 0);
  const vsWidth = Math.ceil(measureTextWidth("vs", 16, 400)) + 16;
  const matchupLabelWidth = Math.max(0, matchupWidth - vsWidth);
  const teamWidth = Math.floor(matchupLabelWidth * 0.46);
  const opponentWidth = matchupLabelWidth - teamWidth;
  const teamName = truncateTextToWidth(data.team_name, teamWidth, 16, 700);
  const opponentName = truncateTextToWidth(data.opponent_name, opponentWidth, 16, 400);

  return (
    <div
      data-testid="card-player-performance-photo-overlay-v1"
      style={{
        background: "#242321",
        color: "#fff",
        fontFamily: "Arial, sans-serif",
        height: 1350,
        overflow: "hidden",
        position: "relative",
        width: 1080,
      }}
    >
      {photo ? (
        <img
          src={photo}
          alt={data.player_name}
          data-testid="img-overlay-player-photo"
          style={{
            height: "100%",
            left: 0,
            objectFit: "cover",
            objectPosition: `50% ${focusY}%`,
            position: "absolute",
            top: 0,
            width: "100%",
          }}
        />
      ) : (
        <div style={{ background: "linear-gradient(145deg,#34302a,#171717)", height: "100%", width: "100%" }} />
      )}

      <div
        style={{
          background: "linear-gradient(180deg, rgba(11,11,11,0) 32%, rgba(10,10,10,.20) 51%, rgba(8,8,8,.94) 91%, #090909 100%)",
          inset: 0,
          position: "absolute",
        }}
      />
      <div
        style={{
          color: ORANGE,
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: 18,
          left: 62,
          letterSpacing: ".2em",
          position: "absolute",
          textTransform: "uppercase",
          top: 58,
        }}
      >
        SWISH ASSISTANT
      </div>
      <div
        style={{
          background: ORANGE,
          height: 4,
          left: 62,
          position: "absolute",
          top: 91,
          width: 92,
        }}
      />

      <section
        data-testid="photo-overlay-performance-panel"
        style={{
          background: "rgba(15,15,15,.96)",
          border: "1px solid rgba(255,255,255,.13)",
          borderRadius: 18,
          bottom: 226,
          boxSizing: "border-box",
          boxShadow: "0 24px 70px rgba(0,0,0,.4)",
          height: 350,
          left: 190,
          overflow: "hidden",
          padding: "26px 28px 24px",
          position: "absolute",
          width: 700,
        }}
      >
        <div
          style={{
            alignItems: "end",
            display: "grid",
            gap: 18,
            gridTemplateColumns: "minmax(0, 1fr) 112px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ ...statLabelStyle, color: ORANGE, fontSize: 13, letterSpacing: ".14em" }}>
              TRENDING PERFORMANCE
            </div>
            <div
              data-testid="text-overlay-player-name"
              style={{
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: nameFit.fontSize,
                fontWeight: 900,
                letterSpacing: 0,
                lineHeight: 1.08,
                marginTop: 9,
                width: "100%",
                whiteSpace: "nowrap",
              }}
            >
              {nameFit.text}
            </div>
          </div>
          <div
            style={{
              color: ORANGE,
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 25,
              fontWeight: 900,
              letterSpacing: 0,
              textAlign: "right",
              whiteSpace: "nowrap",
            }}
          >
            {data.points} PTS
          </div>
        </div>

        <div
          style={{
            alignItems: "center",
            display: "grid",
            gap: 14,
            gridTemplateColumns: "minmax(0, 1fr) auto",
            marginTop: 14,
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 16,
              minWidth: 0,
            }}
          >
            <span
              style={{
                color: "#fff",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {teamName}
            </span>
            <span style={{ color: "rgba(255,255,255,.38)", flex: "0 0 auto", margin: "0 8px" }}>vs</span>
            <span
              style={{
                color: "rgba(255,255,255,.62)",
                flex: "1 1 auto",
                minWidth: 0,
                whiteSpace: "nowrap",
              }}
            >
              {opponentName}
            </span>
          </div>
          {hasScore && (
            <span style={{ color: won ? "#8ddc74" : "#ff786b", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>
              {scoreText}
            </span>
          )}
        </div>

        <div style={{ background: "rgba(255,255,255,.13)", height: 1, margin: "20px 0 19px", width: "100%" }} />
        <div style={{ display: "grid", gap: "20px 12px", gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          <Stat label="MIN" value={data.minutes} />
          <Stat label="REB" value={data.rebounds} />
          <Stat label="AST" value={data.assists} />
          <Stat label="STL" value={data.steals} />
          <Stat label="BLK" value={data.blocks} />
          <Stat label="FG" value={data.fg} />
          <Stat label="3PT" value={data.three_pt} />
          <Stat label="FT" value={data.ft} />
          <Stat label="TS%" value={data.ts_percent} />
          <Stat label="+/-" value={data.plus_minus} />
        </div>
      </section>

      <div style={{ bottom: 40, left: 130, position: "absolute", width: 820 }}>
        <LogoRow data={overlayData} />
        <div
          style={{
            color: "rgba(255,255,255,.48)",
            fontSize: 13,
            letterSpacing: ".1em",
            marginTop: 9,
            overflow: "hidden",
            padding: "0 24px",
            textAlign: "center",
            textOverflow: "ellipsis",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {overlayData.league_name || "Game night performance"}
        </div>
      </div>
    </div>
  );
}

export default PhotoOverlayPlayerPerformanceCardV1;