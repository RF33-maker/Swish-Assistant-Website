import { Link } from 'wouter';
import { BarChart2, Calendar, Clock, MapPin, Minus, PlayCircle, TrendingDown, TrendingUp, Video } from 'lucide-react';
import { useTeamBranding } from '@/hooks/useTeamBranding';
import { useReadableTeamColor } from '@/hooks/useReadableColor';
import { getGameFootage } from '@/lib/gameFootage';
import type { TeamSeasonAverage } from '@/pages/CoachesHub';
import type { StandingRow, MyTeamGame, NextGameRow } from '@/pages/CoachesHub';

interface Props {
  team: TeamSeasonAverage;
  leagueId: string;
  standing?: StandingRow;
  standings: StandingRow[];
  lastGame?: MyTeamGame;
  nextGame: NextGameRow | null;
  /** The upcoming opponent's own most recent completed game — the scouting-video link target. */
  opponentLastGame?: { gameKey: string; opponentName: string } | null;
  last5: MyTeamGame[];
  last5FgPct: number | null;
  fallbackColor: string;
}

/**
 * A "watch video" link when footage exists for gameKey, otherwise a muted
 * not-yet-available state — see client/src/lib/gameFootage.ts for why this
 * is always the unavailable state today.
 */
function VideoLink({ gameKey, availableLabel, unavailableLabel }: { gameKey: string | null | undefined; availableLabel: string; unavailableLabel: string }) {
  const footage = getGameFootage(gameKey);
  if (footage) {
    return (
      <a
        href={footage.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline mt-2"
      >
        <PlayCircle className="w-3.5 h-3.5" /> {availableLabel}
      </a>
    );
  }
  return (
    <span
      title="Coming through our StatsThread partnership — nothing to watch yet"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-neutral-600 mt-2"
    >
      <Video className="w-3.5 h-3.5" /> {unavailableLabel}
    </span>
  );
}

function formatGameDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatGameTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function TrendPill({ direction, label, sub, color }: { direction: 'up' | 'down' | 'flat'; label: string; sub: string; color: string }) {
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const toneClass =
    direction === 'up'
      ? 'text-green-600 dark:text-green-400'
      : direction === 'down'
      ? 'text-red-600 dark:text-red-400'
      : 'text-gray-500 dark:text-neutral-400';
  return (
    <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
      <div className="flex items-center gap-1.5 text-xs md:text-sm font-medium text-gray-600 dark:text-neutral-400 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${toneClass}`} />
        {label}
      </div>
      <div className={`text-base md:text-lg font-bold ${toneClass}`}>{sub}</div>
    </div>
  );
}

export default function CoachTeamOverview({ team, leagueId, standing, standings, lastGame, nextGame, opponentLastGame, last5, last5FgPct, fallbackColor }: Props) {
  const { primaryColor, isLoading: brandLoading } = useTeamBranding({ teamName: team.team_name, leagueId });
  const brandColor = brandLoading || !primaryColor ? fallbackColor : primaryColor;
  const readable = useReadableTeamColor(brandColor).body;

  const fgSeason = team.season_fg_pct;
  const fgDelta = last5FgPct != null && fgSeason != null ? last5FgPct - fgSeason : null;
  const fgDirection: 'up' | 'down' | 'flat' = fgDelta == null ? 'flat' : fgDelta > 1.5 ? 'up' : fgDelta < -1.5 ? 'down' : 'flat';

  const seasonAvgMargin = standing && standing.games > 0 ? standing.pointDiff / standing.games : null;
  const last5AvgMargin = last5.length > 0 ? last5.reduce((sum, g) => sum + (g.myScore - g.oppScore), 0) / last5.length : null;
  const marginDelta = seasonAvgMargin != null && last5AvgMargin != null ? last5AvgMargin - seasonAvgMargin : null;
  const marginDirection: 'up' | 'down' | 'flat' = marginDelta == null ? 'flat' : marginDelta > 1.5 ? 'up' : marginDelta < -1.5 ? 'down' : 'flat';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Game footage — StatsThread partnership placeholder, up top so it's
          visible the moment a coach lands here rather than buried in the
          team detail's own Video tab. */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-5 flex items-center gap-3 md:gap-4">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
          <Video className="w-5 h-5 md:w-6 md:h-6 text-gray-400 dark:text-neutral-500" />
        </div>
        <div>
          <h3 className="text-sm md:text-base font-semibold text-slate-800 dark:text-white">Game footage is on the way</h3>
          <p className="text-xs md:text-sm text-gray-500 dark:text-neutral-400">
            Full-game footage with tap-to-jump plays is coming through our StatsThread partnership. Nothing to watch yet.
          </p>
        </div>
      </div>

      {/* Next game / last game */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-neutral-500 mb-2">
            <Calendar className="w-3.5 h-3.5" /> Next game
          </div>
          {nextGame ? (
            <div>
              <div className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">
                {nextGame.home_team_id === team.team_id ? 'vs' : '@'} {nextGame.home_team_id === team.team_id ? nextGame.awayteam : nextGame.hometeam}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-neutral-400 mt-1">
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatGameDate(nextGame.matchtime)}</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatGameTime(nextGame.matchtime)}</span>
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{nextGame.home_team_id === team.team_id ? 'Home' : 'Away'}</span>
              </div>
              {/* Scouting link — the opponent's own most recent game, not this one (it hasn't happened yet). */}
              <VideoLink
                gameKey={opponentLastGame?.gameKey}
                availableLabel={`Watch ${opponentLastGame?.opponentName ?? 'their'} last game`}
                unavailableLabel={opponentLastGame ? `No footage of ${opponentLastGame.opponentName} yet` : 'No scouting footage yet'}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-neutral-500 italic">No upcoming games scheduled.</p>
          )}
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-neutral-500 mb-2">
            <Clock className="w-3.5 h-3.5" /> Last game
          </div>
          {lastGame ? (
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded font-bold ${lastGame.result === 'W' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'}`}>
                  {lastGame.result}
                </span>
                <span className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">
                  {lastGame.myScore}–{lastGame.oppScore} {lastGame.isHome ? 'vs' : '@'} {lastGame.opponent}
                </span>
              </div>
              <div className="text-sm text-gray-500 dark:text-neutral-400 mt-1">{formatGameDate(lastGame.matchTime)}</div>
              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  href={`/game/${encodeURIComponent(lastGame.gameKey)}?tab=boxscore`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline mt-2"
                  style={{ color: readable }}
                >
                  <BarChart2 className="w-3.5 h-3.5" /> Box score
                </Link>
                <VideoLink gameKey={lastGame.gameKey} availableLabel="Watch this game" unavailableLabel="Video not available yet" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-neutral-500 italic">No completed games yet.</p>
          )}
        </div>
      </div>

      {/* Trends */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-neutral-500 mb-2">Form</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
            <div className="text-xs md:text-sm font-medium text-gray-600 dark:text-neutral-400 mb-2">Last 5 games</div>
            {last5.length > 0 ? (
              <div className="flex items-center gap-1.5">
                {last5.map((g) => (
                  <span
                    key={g.gameKey}
                    title={`${g.result} ${g.myScore}-${g.oppScore} ${g.isHome ? 'vs' : '@'} ${g.opponent}`}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${g.result === 'W' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
                  >
                    {g.result}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 dark:text-neutral-500 italic">No games yet</div>
            )}
          </div>

          <TrendPill
            direction={marginDirection}
            label="Scoring margin trend"
            sub={marginDelta == null ? '—' : `${marginDelta > 0 ? '+' : ''}${marginDelta.toFixed(1)} vs season`}
            color={readable}
          />

          <TrendPill
            direction={fgDirection}
            label="FG% trend"
            sub={fgDelta == null ? '—' : `${fgDelta > 0 ? '+' : ''}${fgDelta.toFixed(1)}pt vs season`}
            color={readable}
          />
        </div>
      </div>

      {/* Season averages */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        {[
          { label: 'Games', value: team.games_played },
          { label: 'PPG', value: Number(team.avg_pts ?? 0).toFixed(1) },
          { label: 'RPG', value: Number(team.avg_reb ?? 0).toFixed(1) },
          { label: 'APG', value: Number(team.avg_ast ?? 0).toFixed(1) },
          { label: 'FG%', value: team.season_fg_pct != null ? `${Number(team.season_fg_pct).toFixed(1)}%` : '—' },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
            <div className="text-xl md:text-2xl font-bold" style={{ color: readable }}>{stat.value}</div>
            <div className="text-xs md:text-sm text-gray-500 dark:text-neutral-400">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* League standings */}
      {standings.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-white">League standings</h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                <th className="w-8 pl-4 py-1.5 text-left font-medium"></th>
                <th className="py-1.5 text-left font-medium">Team</th>
                <th className="py-1.5 text-right font-medium">W-L</th>
                <th className="pr-4 py-1.5 text-right font-medium">PCT</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => {
                const isMe = row.teamId === team.team_id;
                return (
                  <tr
                    key={row.teamId || row.teamName}
                    className={`border-t border-gray-100 dark:border-neutral-800 ${isMe ? 'bg-gray-50 dark:bg-neutral-800/60' : ''}`}
                  >
                    <td className="pl-4 py-2 text-slate-400 dark:text-neutral-500 text-xs tabular-nums">{row.rank}</td>
                    <td className={`py-2 pr-2 font-medium ${isMe ? '' : 'text-slate-800 dark:text-white'}`} style={isMe ? { color: readable } : undefined}>
                      {row.teamName}{isMe && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide opacity-70">You</span>}
                    </td>
                    <td className="py-2 text-right text-slate-600 dark:text-neutral-300 whitespace-nowrap tabular-nums">{row.wins}-{row.losses}</td>
                    <td className="pr-4 py-2 text-right font-bold tabular-nums text-slate-700 dark:text-neutral-300">{(row.pct * 100).toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
