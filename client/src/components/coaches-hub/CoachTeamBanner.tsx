import { ArrowUpRight } from 'lucide-react';
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

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

interface Props {
  team: TeamSeasonAverage;
  leagueId: string;
  /** Competition name, shown in the eyebrow so the coach always knows which feed they're in. */
  leagueName?: string;
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
export default function CoachTeamBanner({ team, leagueId, leagueName, standing, standingsCount, fallbackColor, onViewTeam, coachName }: Props) {
  const { colors, primaryColor, isLoading: brandLoading } = useTeamBranding({ teamName: team.team_name, leagueId });
  const brandColor = brandLoading || !primaryColor ? fallbackColor : primaryColor;
  const brandRgb = colors?.primaryRgb ?? parseToRgb(brandColor);
  // Two-tone clubs (navy + orange, etc.) get their second colour as the
  // corner glow; single-colour clubs fall back to the primary.
  const glowRgb = colors?.secondaryRgb ?? brandRgb;

  const avgMargin = standing && standing.games > 0 ? standing.pointDiff / standing.games : null;
  const stats: { label: string; value: string; sub?: string }[] = [
    { label: 'Record', value: standing ? `${standing.wins}-${standing.losses}` : '—', sub: standing && standing.games > 0 ? `${Math.round(standing.pct * 100)}% win rate` : undefined },
    { label: 'Standing', value: standing && standingsCount > 0 ? ordinal(standing.rank) : '—', sub: standingsCount > 0 ? `of ${standingsCount} teams` : undefined },
    { label: 'Games', value: `${team.games_played ?? 0}`, sub: 'played' },
    { label: 'Avg margin', value: avgMargin == null ? '—' : `${avgMargin > 0 ? '+' : ''}${avgMargin.toFixed(1)}`, sub: 'points per game' },
  ];

  return (
    <section
      className="ch-hero text-white mb-5 md:mb-6 ch-rise"
      style={{
        background: `radial-gradient(110% 140% at 0% 0%, ${adjustOpacity(brandRgb, 0.95)} 0%, ${adjustOpacity(brandRgb, 0.55)} 38%, transparent 72%), radial-gradient(55% 90% at 100% 100%, ${adjustOpacity(glowRgb, 0.4)} 0%, transparent 70%), #0b0e13`,
      }}
    >
      {/* Half-court linework — quiet texture, sits behind the content */}
      <svg
        aria-hidden
        viewBox="0 0 400 300"
        className="absolute -right-16 -top-10 h-[140%] w-auto opacity-[0.09] pointer-events-none"
        fill="none"
        stroke="white"
        strokeWidth="2"
      >
        <circle cx="200" cy="0" r="60" />
        <path d="M60 0 v120 a140 140 0 0 0 280 0 V0" />
        <rect x="140" y="0" width="120" height="150" />
        <circle cx="200" cy="150" r="60" />
        <path d="M20 0 v40 M380 0 v40" />
      </svg>

      <div className="relative px-5 pt-5 md:px-8 md:pt-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 md:gap-5 min-w-0">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] ring-1 ring-black/5 flex items-center justify-center overflow-hidden shrink-0">
              <TeamLogo teamName={team.team_name} leagueId={leagueId} size="lg" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] md:text-xs font-semibold uppercase tracking-[0.14em] text-white/65">
                <span className="shrink-0">{coachName ? `Welcome back, ${coachName}` : 'Coaches Hub'}</span>
                {leagueName && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-white/40 shrink-0" />
                    <span className="truncate normal-case tracking-normal font-medium text-white/70">{leagueName}</span>
                  </>
                )}
              </div>
              <h1 className="ch-display uppercase font-bold leading-[0.95] text-[1.75rem] sm:text-[2rem] md:text-[3.25rem] tracking-tight mt-1 line-clamp-2 md:line-clamp-none md:truncate break-words">
                {team.team_name}
              </h1>
            </div>
          </div>
          <button
            onClick={onViewTeam}
            className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-semibold bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur px-3.5 h-9 rounded-lg transition-colors shrink-0"
          >
            Team profile <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative mt-5 md:mt-7 grid grid-cols-2 md:grid-cols-4 border-t border-white/10 bg-black/20">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`px-5 md:px-8 py-3.5 md:py-4 border-white/10 ${i % 2 === 1 ? 'border-l' : ''} ${i >= 2 ? 'border-t md:border-t-0' : ''} ${i === 2 ? 'md:border-l' : ''}`}
          >
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">{s.label}</div>
            <div className="ch-display ch-num text-[1.75rem] md:text-[2.125rem] font-bold leading-none mt-1.5">{s.value}</div>
            {s.sub && <div className="text-[11px] text-white/55 mt-1">{s.sub}</div>}
          </div>
        ))}
      </div>

      <button
        onClick={onViewTeam}
        className="sm:hidden relative w-full flex items-center justify-center gap-1.5 text-[13px] font-semibold border-t border-white/10 bg-black/25 py-3"
      >
        Team profile <ArrowUpRight className="w-4 h-4" />
      </button>
    </section>
  );
}
