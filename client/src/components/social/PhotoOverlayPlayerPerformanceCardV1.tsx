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
  fontSize: 17,
  fontWeight: 700,
  letterSpacing: "0.12em",
  lineHeight: 1,
  textTransform: "uppercase",
};

const statValueStyle: CSSProperties = {
  color: "#fff",
  fontFamily: "Arial Black, Arial, sans-serif",
  fontSize: 38,
  fontWeight: 900,
  letterSpacing: "-0.045em",
  lineHeight: 1,
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ minWidth: 0, textAlign: "left" }}>
      <div style={statValueStyle}>{value}</div>
      <div style={{ ...statLabelStyle, marginTop: 9 }}>{label}</div>
    </div>
  );
}

function getOverlayNameFontSize(name: string): number {
  if (name.length <= 18) return 52;
  if (name.length <= 25) return 44;
  if (name.length <= 34) return 37;
  return 31;
}

function LogoRow({ data }: { data: PhotoOverlayData }) {
  const logos = [
    { src: data.home_logo_url, alt: data.team_name, kind: "team" },
    { src: data.league_logo_url, alt: data.league_name || "Competition", kind: "league" },
    ...(data.sponsor_logo_urls || [])
      .filter(Boolean)
      .map((src, index) => ({ src, alt: `Sponsor ${index + 1}`, kind: "sponsor" })),
  ].filter((logo): logo is { src: string; alt: string; kind: string } => Boolean(logo.src));

  return (
    <div
      data-testid="photo-overlay-logo-row"
      style={{
        alignItems: "center",
        display: "flex",
        gap: logos.length > 3 ? 27 : 40,
        height: 70,
        justifyContent: "center",
        padding: "0 48px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          height: 48,
          justifyContent: "center",
          minWidth: 116,
        }}
      >
        <img
          src={swishAssistantLogo}
          alt="Swish Assistant"
          style={{ height: 52, objectFit: "contain", width: 52 }}
        />
        <span
          style={{
            color: "#fff",
            fontFamily: "Arial Black, Arial, sans-serif",
            fontSize: 18,
            letterSpacing: "-.04em",
            marginLeft: 8,
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
            height: logo.kind === "sponsor" ? 40 : 54,
            justifyContent: "center",
            maxWidth: logos.length >= 5 ? 112 : logo.kind === "sponsor" ? 132 : 150,
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
          borderRadius: 22,
          bottom: 186,
          boxShadow: "0 24px 70px rgba(0,0,0,.4)",
          left: 58,
          padding: "34px 40px 30px",
          position: "absolute",
          width: 964,
        }}
      >
        <div style={{ alignItems: "flex-end", display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ ...statLabelStyle, color: ORANGE, fontSize: 16, letterSpacing: ".16em" }}>
              PLAYER OF THE GAME
            </div>
            <div
              data-testid="text-overlay-player-name"
              style={{
                fontFamily: "Arial Black, Arial, sans-serif",
                fontSize: getOverlayNameFontSize(data.player_name),
                letterSpacing: "-.055em",
                lineHeight: .98,
                marginTop: 12,
                maxWidth: 650,
                overflow: "hidden",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {data.player_name}
            </div>
          </div>
          <div style={{ color: ORANGE, fontFamily: "Arial Black, Arial, sans-serif", fontSize: 27, letterSpacing: "-.03em" }}>
            {data.points} PTS
          </div>
        </div>

        <div style={{ alignItems: "center", display: "flex", gap: 12, marginTop: 17 }}>
          <span style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>{data.team_name}</span>
          <span style={{ color: "rgba(255,255,255,.38)", fontSize: 18 }}>vs</span>
          <span style={{ color: "rgba(255,255,255,.62)", fontSize: 18 }}>{data.opponent_name}</span>
          {hasScore && (
            <span style={{ color: won ? "#8ddc74" : "#ff786b", fontSize: 18, fontWeight: 800, marginLeft: 5 }}>
              {data.home_score} — {data.away_score} {won ? "WIN" : "LOSS"}
            </span>
          )}
        </div>

        <div style={{ background: "rgba(255,255,255,.13)", height: 1, margin: "27px 0 25px", width: "100%" }} />
        <div style={{ display: "grid", gap: "27px 16px", gridTemplateColumns: "repeat(5, 1fr)" }}>
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

      <div style={{ bottom: 44, left: 0, position: "absolute", width: "100%" }}>
        <LogoRow data={overlayData} />
        <div style={{ color: "rgba(255,255,255,.4)", fontSize: 14, letterSpacing: ".12em", marginTop: 10, textAlign: "center", textTransform: "uppercase" }}>
          {overlayData.league_name || "Game night performance"}
        </div>
      </div>
    </div>
  );
}

export default PhotoOverlayPlayerPerformanceCardV1;