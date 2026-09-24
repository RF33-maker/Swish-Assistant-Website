import ShotChart, { type ShotData } from "./ShotChart";

interface Props {
  shots: ShotData[];
  loading?: boolean;
  emptyMessage?: string;
  compact?: boolean;
  homeTeam: string;
  awayTeam: string;
  showPlayerFilter?: boolean;
  showQuarterFilter?: boolean;
  showResultFilter?: boolean;
  showShotTypeFilter?: boolean;
  showSubTypeFilter?: boolean;
}

/**
 * Two ShotChart panels side by side, one per team — team_no=1 is always
 * home, team_no=2 always away (verified against real final scores earlier
 * this session: summing made-basket points by team_no matches every home
 * team's actual final score exactly). Each panel keeps its own independent
 * filters/zone breakdown; there's no cross-panel syncing.
 */
export default function TeamSplitShotChart({
  shots,
  loading = false,
  emptyMessage = "No shot data available for this game yet.",
  compact = false,
  homeTeam,
  awayTeam,
  showPlayerFilter,
  showQuarterFilter,
  showResultFilter,
  showShotTypeFilter,
  showSubTypeFilter,
}: Props) {
  const homeShots = shots.filter((s) => s.team_no === 1);
  const awayShots = shots.filter((s) => s.team_no === 2);
  const sharedFilters = { showPlayerFilter, showQuarterFilter, showResultFilter, showShotTypeFilter, showSubTypeFilter };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
      <ShotChart
        shots={homeShots}
        loading={loading}
        emptyMessage={emptyMessage}
        compact={compact}
        title={homeTeam}
        filters={sharedFilters}
      />
      <ShotChart
        shots={awayShots}
        loading={loading}
        emptyMessage={emptyMessage}
        compact={compact}
        title={awayTeam}
        filters={sharedFilters}
      />
    </div>
  );
}
