import { type ReactNode } from "react";
import ShareableCard from "@/components/ShareableCard";
import { generateLeaderListCardBlob } from "@/lib/generateLeaderListCard";

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
  // The downloadable card is drawn on a canvas in the Swish Social look, in the league's colour.
  const generateCardBlob = () =>
    generateLeaderListCardBlob({
      title,
      groups: groups && groups.length > 0 ? groups : [{ title, leaders: leaders || [], unitLabel }],
      leagueName,
      contextLabel,
      leagueLogoUrl,
      primaryHex: brandColor,
      footnote,
    });

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
      generateCardBlob={generateCardBlob}
      // The image is drawn by generateCardBlob, so the hidden capture layout isn't needed.
      shareContent={<></>}
    >
      {children}
    </ShareableCard>
  );
}
