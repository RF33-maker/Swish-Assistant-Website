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

interface LeagueLeadersShareCardProps {
  /** Category title, e.g. "Scoring Leaders". */
  title: string;
  /** Top entries (already sorted, sliced). */
  leaders: LeaderEntry[];
  /** Unit label for stat values, e.g. "PPG", "%", "REB". */
  unitLabel?: string;
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
      <div
        className="rounded-xl px-3 py-3"
        style={{ backgroundColor: panelBg, border: `1px solid ${panelBorder}` }}
      >
        <ol className="space-y-1.5">
          {leaders.map((p, i) => (
            <li
              key={`${p.name}-${i}`}
              className="flex items-center gap-3 py-1.5 px-2 rounded-md"
              style={{
                backgroundColor: i === 0 ? tintHex(brandColor, 0.85) : "transparent",
              }}
            >
              <span
                className="text-sm font-black tabular-nums w-5 text-center flex-shrink-0"
                style={{ color: rankColor }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-bold leading-tight truncate"
                  style={{ color: "#0f172a" }}
                >
                  {p.name}
                </div>
                {p.team && (
                  <div
                    className="text-[10px] leading-tight truncate mt-0.5"
                    style={{ color: labelColor }}
                  >
                    {p.team}
                  </div>
                )}
              </div>
              <span
                className="text-sm font-black tabular-nums whitespace-nowrap"
                style={{ color: "#0f172a" }}
              >
                {p.value}
                {unitLabel ? (
                  <span
                    className="ml-1 text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: labelColor }}
                  >
                    {unitLabel}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
          {leaders.length === 0 && (
            <li
              className="text-xs text-center py-3"
              style={{ color: labelColor }}
            >
              No data available
            </li>
          )}
        </ol>
      </div>
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
