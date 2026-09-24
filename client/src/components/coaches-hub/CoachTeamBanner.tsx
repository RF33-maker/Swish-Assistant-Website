import { ChevronRight, Trophy } from 'lucide-react';
import { TeamLogo } from '@/components/TeamLogo';
import { useTeamBranding } from '@/hooks/useTeamBranding';
import { adjustOpacity } from '@/lib/colorExtractor';
import type { TeamSeasonAverage } from '@/pages/CoachesHub';
import type { StandingRow } from '@/pages/CoachesHub';

/** Parses a hex (#rgb/#rrggbb) or rgb()/rgba() colour string into {r,g,b}. */
function parseToRgb(color: string): { r: number; g: number; b: number } {
  const hex = color.trim();
  if (hex.startsWith('#')) {
    const h = hex.slice(1);
    if (h.length === 3) {
      return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
    }
    if (h.length >= 6) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }
  }
  const match = hex.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
  return { r: 249, g: 115, b: 22 }; // orange-500 fallback
}

interface Props {
  team: TeamSeasonAverage;
  leagueId: string;
  standing?: StandingRow;
  standingsCount: number;
  fallbackColor: string;
  onViewTeam: () => void;
  /** Not stored anywhere yet — once coach accounts carry a display name,
   * pass it here to swap the generic welcome line for "Welcome back, {name}". */
  coachName?: string | null;
}

/**
 * The coach's persistent, branded "home" banner — team colour, crest, record
 * and league rank. Shown once at the top of Coaches Hub, above the tab bar,
 * so it stays visible across every tab rather than living inside Overview
 * alone (that's deliberate: this is the page's identity, not a stat card).
 */
export default function CoachTeamBanner({ team, leagueId, standing, standingsCount, fallbackColor, onViewTeam, coachName }: Props) {
  const { colors, primaryColor, isLoading: brandLoading } = useTeamBranding({ teamName: team.team_name, leagueId });
  const brandColor = brandLoading || !primaryColor ? fallbackColor : primaryColor;
  const brandRgb = colors?.primaryRgb ?? parseToRgb(brandColor);
  const record = standing ? `${standing.wins}-${standing.losses}` : null;
  const rankLabel = standing && standingsCount > 0
    ? `${standing.rank}${standing.rank === 1 ? 'st' : standing.rank === 2 ? 'nd' : standing.rank === 3 ? 'rd' : 'th'} of ${standingsCount}`
    : null;

  return (
    <div
      className="rounded-lg p-4 md:p-6 text-white relative overflow-hidden mb-4 md:mb-6"
      style={{ background: `linear-gradient(135deg, ${adjustOpacity(brandRgb, 0.92)} 0%, ${adjustOpacity(brandRgb, 0.75)} 100%)` }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap relative z-10">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white/90 flex items-center justify-center overflow-hidden shrink-0">
            <TeamLogo teamName={team.team_name} leagueId={leagueId} size="lg" />
          </div>
          <div>
            <div className="text-[11px] md:text-xs font-semibold text-white/70 uppercase tracking-wide">
              {coachName ? `Welcome back, ${coachName}` : 'Welcome to Coaches Hub'}
            </div>
            <h1 className="text-lg md:text-2xl font-bold">{team.team_name}</h1>
            <div className="flex items-center gap-3 text-sm text-white/80 mt-0.5">
              {record && <span className="font-semibold text-white">{record}</span>}
              {rankLabel && (
                <span className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> {rankLabel}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onViewTeam}
          className="flex items-center gap-1 text-sm font-medium bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full transition-colors"
        >
          Full team detail <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
