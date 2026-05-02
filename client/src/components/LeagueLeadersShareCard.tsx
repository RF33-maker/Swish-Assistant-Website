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
      className="rounded-xl px-3 py-3"
      style={{ backgroundColor: panelBg, border: `1px solid ${panelBorder}` }}
    >
      <ol style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {entries.map((p, i) => (
          <li
            key={`${p.name}-${i}`}
            style={{
              backgroundColor: i === 0 ? tintHex(brandColor, 0.85) : "transparent",
              borderRadius: 6,
              paddingTop: 10,
              paddingBottom: 10,
              paddingLeft: 10,
              paddingRight: 10,
              display: "table",
              width: "100%",
              tableLayout: "fixed",
            }}
          >
            <div
              style={{
                display: "table-cell",
                verticalAlign: "middle",
                width: 24,
                fontSize: 14,
                lineHeight: "20px",
                fontWeight: 900,
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
                paddingLeft: 10,
                paddingRight: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  lineHeight: "20px",
                  fontWeight: 700,
                  color: "#0f172a",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {p.name}
              </div>
              {p.team && (
                <div
                  style={{
                    fontSize: 10,
                    lineHeight: "16px",
                    color: labelColor,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginTop: 2,
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
                fontSize: 14,
                lineHeight: "20px",
                fontWeight: 900,
                color: "#0f172a",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {p.value}
              {unit ? (
                <span
                  style={{
                    marginLeft: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
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
            style={{ color: labelColor, fontSize: 12, lineHeight: 1.5, paddingTop: 12, paddingBottom: 12 }}
          >
            No data available
          </li>
        )}
      </ol>
    </div>
  );

  const shareBody = (
    <div>
      {contextLabel && (
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: labelColor }}
          >
            {contextLabel}
          </span>
        </div>
      )}
      <div
        aria-hidden="true"
        className="mb-3"
        style={{ height: 1, backgroundColor: dividerColor }}
      />
      {groups && groups.length > 0 ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.title}>
              <div
                className="text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5 px-1"
                style={{ color: labelColor }}
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
          className="text-[10px] uppercase tracking-wider mt-2.5 text-center"
          style={{ color: labelColor }}
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
    >
      {children}
    </ShareableCard>
  );
}
