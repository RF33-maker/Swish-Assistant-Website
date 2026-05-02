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
      <ol className="space-y-1">
        {entries.map((p, i) => (
          <li
            key={`${p.name}-${i}`}
            className="flex items-center gap-3 px-2 rounded-md"
            style={{
              backgroundColor: i === 0 ? tintHex(brandColor, 0.85) : "transparent",
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            <span
              className="font-black tabular-nums text-center flex-shrink-0"
              style={{ color: rankColor, fontSize: 14, lineHeight: 1.4, width: 20 }}
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div
                className="font-bold truncate"
                style={{ color: "#0f172a", fontSize: 13, lineHeight: 1.45 }}
              >
                {p.name}
              </div>
              {p.team && (
                <div
                  className="truncate"
                  style={{ color: labelColor, fontSize: 10, lineHeight: 1.5, marginTop: 2 }}
                >
                  {p.team}
                </div>
              )}
            </div>
            <span
              className="font-black tabular-nums whitespace-nowrap"
              style={{ color: "#0f172a", fontSize: 14, lineHeight: 1.4 }}
            >
              {p.value}
              {unit ? (
                <span
                  className="ml-1 font-bold uppercase tracking-wide"
                  style={{ color: labelColor, fontSize: 10, lineHeight: 1.4 }}
                >
                  {unit}
                </span>
              ) : null}
            </span>
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
