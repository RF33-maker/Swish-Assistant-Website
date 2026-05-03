import { type ReactNode } from "react";
import ShareableCard, {
  ensureContrast,
  shadeHex,
  tintHex,
} from "@/components/ShareableCard";

interface LeaderEntry {
  name: string;
  team?: string | null;
  value: string | number;
  slug?: string | null;
}

interface LeaderGroup {
  title: string;
  leaders: LeaderEntry[];
  unitLabel?: string;
}

interface LeagueLeadersShareCardProps {
  /** Category title, e.g. "Scoring Leaders" — shown in the header band. */
  title: string;
  /** Top entries for a single-list share. Ignored when `groups` is provided. */
  leaders?: LeaderEntry[];
  /** Unit label for the single-list variant (e.g. "PPG"). */
  unitLabel?: string;
  /**
   * Multi-leaderboard variant. When provided, the share modal renders
   * each group as a sub-section (used by the league overview Quick View
   * to combine Top Scorers / Rebounders / Playmakers in one image).
   */
  groups?: LeaderGroup[];
  /** League name for the share-card header. */
  leagueName: string;
  /** Optional context line shown beneath the league name (age group / round). */
  contextLabel?: string;
  /** League brand colour (hex). */
  brandColor: string;
  /** League logo URL — shown as a small icon next to the league name. */
  leagueLogoUrl?: string | null;
  /** Optional footnote shown below the list (e.g. "Min 4 games played"). */
  footnote?: string;
  /** File slug for the downloaded PNG. */
  fileSlug: string;
  /** In-page card the share button overlays. */
  children: ReactNode;
}

export default function LeagueLeadersShareCard({
  title,
  leaders,
  unitLabel,
  groups,
  leagueName,
  contextLabel,
  brandColor,
  leagueLogoUrl,
  footnote,
  fileSlug,
  children,
}: LeagueLeadersShareCardProps) {
  const labelColor = ensureContrast(brandColor, "#ffffff", 4.5);
  const panelBg = tintHex(brandColor, 0.94);
  const panelBorder = tintHex(brandColor, 0.7);
  const dividerColor = tintHex(brandColor, 0.65);
  const rankColor = ensureContrast(shadeHex(brandColor, 0.25), "#ffffff", 4.5);

  const renderList = (entries: LeaderEntry[], unit?: string) => (
    <div
      className="rounded-2xl"
      style={{
        backgroundColor: panelBg,
        border: `1px solid ${panelBorder}`,
        padding: "16px 18px",
      }}
    >
      <ol
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        {entries.map((p, i) => (
          <li
            key={`${p.name}-${i}`}
            style={{
              backgroundColor: i === 0 ? tintHex(brandColor, 0.85) : "transparent",
              borderRadius: 10,
              padding: "18px 18px",
              display: "table",
              width: "100%",
              tableLayout: "fixed",
            }}
          >
            <div
              style={{
                display: "table-cell",
                verticalAlign: "middle",
                width: 48,
                fontSize: 28,
                lineHeight: "40px",
                fontWeight: 800,
                color: rankColor,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                display: "table-cell",
                verticalAlign: "middle",
                paddingLeft: 18,
                paddingRight: 12,
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  lineHeight: "32px",
                  fontWeight: 800,
                  color: "#0f172a",
                  wordBreak: "break-word",
                }}
              >
                {p.name}
              </div>
              {p.team && (
                <div
                  style={{
                    fontSize: 16,
                    lineHeight: "22px",
                    color: labelColor,
                    wordBreak: "break-word",
                    marginTop: 4,
                  }}
                >
                  {p.team}
                </div>
              )}
            </div>
            <div
              style={{
                display: "table-cell",
                verticalAlign: "middle",
                textAlign: "right",
                whiteSpace: "nowrap",
                fontSize: 30,
                lineHeight: "40px",
                fontWeight: 900,
                color: "#0f172a",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {p.value}
              {unit ? (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: labelColor,
                  }}
                >
                  {unit}
                </span>
              ) : null}
            </div>
          </li>
        ))}
        {entries.length === 0 && (
          <li
            className="text-center"
            style={{ color: labelColor, fontSize: 16, lineHeight: 1.5, paddingTop: 18, paddingBottom: 18 }}
          >
            No data available
          </li>
        )}
      </ol>
    </div>
  );

  const shareBody = (
    <div className="flex flex-col" style={{ minHeight: 880, gap: 18 }}>
      {contextLabel && (
        <div className="flex items-center justify-between">
          <span
            className="font-bold uppercase"
            style={{ color: labelColor, fontSize: 18, letterSpacing: "0.16em" }}
          >
            {contextLabel}
          </span>
        </div>
      )}
      <div
        aria-hidden="true"
        style={{ height: 2, backgroundColor: dividerColor }}
      />
      {groups && groups.length > 0 ? (
        <div className="flex flex-col" style={{ gap: 18 }}>
          {groups.map((g) => (
            <div key={g.title}>
              <div
                className="font-bold uppercase"
                style={{
                  color: labelColor,
                  fontSize: 16,
                  letterSpacing: "0.16em",
                  marginBottom: 10,
                  paddingLeft: 4,
                }}
              >
                {g.title}
              </div>
              {renderList(g.leaders, g.unitLabel)}
            </div>
          ))}
        </div>
      ) : (
        renderList(leaders || [], unitLabel)
      )}
      {footnote && (
        <div
          className="uppercase text-center"
          style={{
            color: labelColor,
            fontSize: 14,
            letterSpacing: "0.14em",
            marginTop: 4,
          }}
        >
          {footnote}
        </div>
      )}
    </div>
  );

  return (
    <ShareableCard
      title={title}
      fileSlug={fileSlug}
      player={{
        name: leagueName,
        team: contextLabel || "",
        primaryColor: brandColor,
        teamLogoUrl: leagueLogoUrl || null,
      }}
      shareCaption={title}
      shareContent={shareBody}
      wide
    >
      {children}
    </ShareableCard>
  );
}
