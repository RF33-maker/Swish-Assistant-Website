import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { BarChart2, Calendar, ClipboardList, Clock, FileText, MapPin, Minus, PlayCircle, TrendingDown, TrendingUp, Video } from 'lucide-react';
import { TeamLogo } from '@/components/TeamLogo';
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
  onOpenMatchReport?: (gameKey: string) => void;
  onOpenScoutReport?: (opponentName: string) => void;
  /** Extra panels for the main column (season profile, squad) — rendered under Form. */
  children?: ReactNode;
  /** Extra panels for the side rail, under the standings (e.g. quick actions). */
  aside?: ReactNode;
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
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
      >
        <PlayCircle className="w-3.5 h-3.5" /> {availableLabel}
      </a>
    );
  }
  return (
    <span
      title="Coming through our StatsThread partnership — nothing to watch yet"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--ch-muted)]"
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

/** "Today" / "Tomorrow" / "In 4 days" — how far off tip-off is, at a glance. */
function countdownLabel(iso: string): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function PanelHeader({ icon: Icon, label, right }: { icon: typeof Calendar; label: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="ch-eyebrow flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      {right}
    </div>
  );
}

function TrendStat({ direction, label, sub }: { direction: 'up' | 'down' | 'flat'; label: string; sub: string }) {
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const tone = direction === 'up' ? 'var(--ch-win)' : direction === 'down' ? 'var(--ch-loss)' : 'var(--ch-muted)';
  return (
    <div className="p-4 md:p-5">
      <div className="text-xs font-medium text-[color:var(--ch-text-2)] mb-2">{label}</div>
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ color: tone, backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)` }}
        >
          <Icon className="w-4 h-4" />
        </span>
        <span className="text-[15px] font-semibold ch-num" style={{ color: direction === 'flat' ? 'var(--ch-text-2)' : tone }}>
          {sub}
        </span>
      </div>
    </div>
  );
}

export default function CoachTeamOverview({ team, leagueId, standing, standings, lastGame, nextGame, opponentLastGame, last5, last5FgPct, fallbackColor, onOpenMatchReport, onOpenScoutReport, children, aside }: Props) {
  const { primaryColor, isLoading: brandLoading } = useTeamBranding({ teamName: team.team_name, leagueId });
  const brandColor = brandLoading || !primaryColor ? fallbackColor : primaryColor;
  const readable = useReadableTeamColor(brandColor);

  const fgSeason = team.season_fg_pct;
  const fgDelta = last5FgPct != null && fgSeason != null ? last5FgPct - fgSeason : null;
  const fgDirection: 'up' | 'down' | 'flat' = fgDelta == null ? 'flat' : fgDelta > 1.5 ? 'up' : fgDelta < -1.5 ? 'down' : 'flat';

  const seasonAvgMargin = standing && standing.games > 0 ? standing.pointDiff / standing.games : null;
  const last5AvgMargin = last5.length > 0 ? last5.reduce((sum, g) => sum + (g.myScore - g.oppScore), 0) / last5.length : null;
  const marginDelta = seasonAvgMargin != null && last5AvgMargin != null ? last5AvgMargin - seasonAvgMargin : null;
  const marginDirection: 'up' | 'down' | 'flat' = marginDelta == null ? 'flat' : marginDelta > 1.5 ? 'up' : marginDelta < -1.5 ? 'down' : 'flat';

  // A last-five-vs-season comparison only means something once the season is
  // longer than five games; below that the two windows are the same games.
  const hasTrendBaseline = Number(team.games_played ?? 0) > 5;

  const nextIsHome = nextGame ? nextGame.home_team_id === team.team_id : false;
  const nextOpponent = nextGame ? (nextIsHome ? nextGame.awayteam : nextGame.hometeam) : '';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5">
      <div className="xl:col-span-2 space-y-4 md:space-y-5 min-w-0">
        {/* Next game / last game */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <div className="ch-card ch-hover relative overflow-hidden p-5 md:p-6">
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: readable.accent }} />
            <PanelHeader
              icon={Calendar}
              label="Next game"
              right={nextGame ? (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: readable.body, backgroundColor: `color-mix(in srgb, ${readable.accent} 12%, transparent)` }}>
                  {countdownLabel(nextGame.matchtime)}
                </span>
              ) : undefined}
            />
            {nextGame ? (
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl ch-tile flex items-center justify-center overflow-hidden shrink-0">
                    <TeamLogo teamName={nextOpponent} leagueId={leagueId} size="sm" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[color:var(--ch-muted)]">{nextIsHome ? 'vs' : '@'}</div>
                    <div className="text-lg md:text-xl font-semibold tracking-tight text-[color:var(--ch-text)] truncate">{nextOpponent}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-4">
                  {[
                    { Icon: Calendar, text: formatGameDate(nextGame.matchtime) },
                    { Icon: Clock, text: formatGameTime(nextGame.matchtime) },
                    { Icon: MapPin, text: nextIsHome ? 'Home' : 'Away' },
                  ].map(({ Icon, text }) => (
                    <span key={text} className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--ch-text-2)] ch-tile px-2 py-1 rounded-md">
                      <Icon className="w-3.5 h-3.5 opacity-70" />{text}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-5">
                  {onOpenScoutReport && (
                    <button
                      onClick={() => onOpenScoutReport(nextOpponent)}
                      className="ch-btn ch-btn-primary"
                      style={{ backgroundColor: readable.onWhite }}
                    >
                      <ClipboardList className="w-4 h-4" /> Scout report
                    </button>
                  )}
                  {/* Scouting link — the opponent's own most recent game, not this one (it hasn't happened yet). */}
                  <VideoLink
                    gameKey={opponentLastGame?.gameKey}
                    availableLabel={`Watch ${opponentLastGame?.opponentName ?? 'their'} last game`}
                    unavailableLabel={opponentLastGame ? `No footage of ${opponentLastGame.opponentName} yet` : 'No scouting footage yet'}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-[color:var(--ch-muted)] py-4">No upcoming games scheduled.</p>
            )}
          </div>

          <div className="ch-card ch-hover p-5 md:p-6">
            <PanelHeader
              icon={Clock}
              label="Last game"
              right={lastGame ? <span className="text-[11px] font-medium text-[color:var(--ch-muted)]">{formatGameDate(lastGame.matchTime)}</span> : undefined}
            />
            {lastGame ? (
              <div>
                <div className="flex items-end gap-3">
                  <span
                    className="text-[11px] font-bold w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 mb-1"
                    style={{ backgroundColor: lastGame.result === 'W' ? 'var(--ch-win)' : 'var(--ch-loss)' }}
                  >
                    {lastGame.result}
                  </span>
                  <span className="ch-display ch-num text-[2.5rem] leading-none font-bold text-[color:var(--ch-text)]">
                    {lastGame.myScore}<span className="text-[color:var(--ch-muted)] mx-1">–</span>{lastGame.oppScore}
                  </span>
                </div>
                <div className="text-sm text-[color:var(--ch-text-2)] mt-2 truncate">
                  {lastGame.isHome ? 'vs' : '@'} <span className="font-medium text-[color:var(--ch-text)]">{lastGame.opponent}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-5">
                  <Link href={`/game/${encodeURIComponent(lastGame.gameKey)}?tab=boxscore`} className="ch-btn ch-btn-ghost">
                    <BarChart2 className="w-4 h-4" /> Box score
                  </Link>
                  {onOpenMatchReport ? (
                    <button onClick={() => onOpenMatchReport(lastGame.gameKey)} className="ch-btn ch-btn-ghost">
                      <FileText className="w-4 h-4" /> Match report
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--ch-muted)]">
                      <FileText className="w-3.5 h-3.5" /> Match report coming soon
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <VideoLink gameKey={lastGame.gameKey} availableLabel="Watch this game" unavailableLabel="Video not available yet" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-[color:var(--ch-muted)] py-4">No completed games yet.</p>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="ch-card overflow-hidden">
          <div className="px-5 md:px-6 pt-5 flex items-center justify-between">
            <div className="ch-eyebrow">Form</div>
            {!hasTrendBaseline && (
              <span className="text-[11px] text-[color:var(--ch-muted)]">Trends unlock after 5 games</span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[color:var(--ch-border)]">
            <div className="p-4 md:p-5">
              <div className="text-xs font-medium text-[color:var(--ch-text-2)] mb-2">
                {last5.length > 0 && last5.length < 5 ? `Last ${last5.length} game${last5.length === 1 ? '' : 's'}` : 'Last 5 games'}
              </div>
              {last5.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  {last5.map((g) => (
                    <span
                      key={g.gameKey}
                      title={`${g.result} ${g.myScore}-${g.oppScore} ${g.isHome ? 'vs' : '@'} ${g.opponent}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white cursor-default"
                      style={{ backgroundColor: g.result === 'W' ? 'var(--ch-win)' : 'var(--ch-loss)' }}
                    >
                      {g.result}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[color:var(--ch-muted)]">No games yet</div>
              )}
            </div>

            {/* These compare the last five games against the season average, so
                until a team has played more than five the two sets are the same
                and the delta is structurally zero -- "0.0 vs season" reads like a
                flat trend when it actually means "no comparison yet". */}
            <TrendStat
              direction={hasTrendBaseline ? marginDirection : 'flat'}
              label="Scoring margin trend"
              sub={
                !hasTrendBaseline
                  ? 'Needs more than 5 games'
                  : marginDelta == null
                    ? '—'
                    : `${marginDelta > 0 ? '+' : ''}${marginDelta.toFixed(1)} vs season`
              }
            />

            <TrendStat
              direction={hasTrendBaseline ? fgDirection : 'flat'}
              label="FG% trend"
              sub={
                !hasTrendBaseline
                  ? 'Needs more than 5 games'
                  : fgDelta == null
                    ? '—'
                    : `${fgDelta > 0 ? '+' : ''}${fgDelta.toFixed(1)}pt vs season`
              }
            />
          </div>
        </div>

        {children}

        {/* Game footage — StatsThread partnership placeholder. */}
        <div className="ch-card p-4 md:p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl ch-tile flex items-center justify-center shrink-0">
            <Video className="w-5 h-5 text-[color:var(--ch-muted)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[color:var(--ch-text)]">Game film</h3>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]">Coming soon</span>
            </div>
            <p className="text-xs md:text-[13px] text-[color:var(--ch-text-2)] mt-0.5">
              Full-game footage with tap-to-jump plays is coming through our StatsThread partnership. Nothing to watch yet.
            </p>
          </div>
        </div>
      </div>

      <aside className="space-y-4 md:space-y-5 min-w-0">
        {aside}
        {/* League standings */}
        {/* Pinned under the header + section bar on wide screens, so the
            table stays in view while the main column scrolls. */}
        {standings.length > 0 && (
          <div className="ch-card overflow-hidden xl:sticky xl:top-[136px]">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h4 className="text-[15px] font-semibold tracking-tight text-[color:var(--ch-text)]">Standings</h4>
              <span className="text-[11px] text-[color:var(--ch-muted)]">{standings.length} teams</span>
            </div>
            <div className="max-h-[560px] xl:max-h-[calc(100vh-220px)] overflow-y-auto">
              <table className="w-full text-[13px] ch-table">
                <thead className="sticky top-0 bg-[color:var(--ch-surface)] z-[1]">
                  <tr className="border-b border-[color:var(--ch-border)]">
                    <th className="w-9 pl-5 py-2 text-left">#</th>
                    <th className="py-2 text-left">Team</th>
                    <th className="py-2 text-right">W-L</th>
                    <th className="py-2 pl-2 text-right hidden sm:table-cell xl:hidden 2xl:table-cell">+/-</th>
                    <th className="pr-5 pl-2 py-2 text-right">PCT</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => {
                    const isMe = row.teamId === team.team_id;
                    return (
                      <tr
                        key={row.teamId || row.teamName}
                        className="border-t border-[color:var(--ch-border)] first:border-t-0"
                        style={isMe ? { backgroundColor: `color-mix(in srgb, ${readable.accent} 10%, transparent)`, boxShadow: `inset 3px 0 0 ${readable.accent}` } : undefined}
                      >
                        <td className="pl-5 py-2.5 text-[color:var(--ch-muted)] text-xs ch-num">{row.rank}</td>
                        <td className="py-2.5 pr-2 font-medium max-w-0 w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                              <TeamLogo teamName={row.teamName} leagueId={leagueId} size="xs" />
                            </span>
                            <span className="truncate" style={isMe ? { color: readable.body, fontWeight: 600 } : { color: 'var(--ch-text)' }}>
                              {row.teamName}
                            </span>
                            {isMe && <span className="text-[9.5px] font-bold uppercase tracking-wider opacity-70 shrink-0" style={{ color: readable.body }}>You</span>}
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-[color:var(--ch-text-2)] whitespace-nowrap ch-num">{row.wins}-{row.losses}</td>
                        <td
                          className="py-2.5 pl-2 text-right whitespace-nowrap ch-num hidden sm:table-cell xl:hidden 2xl:table-cell"
                          style={{ color: row.pointDiff > 0 ? 'var(--ch-win)' : row.pointDiff < 0 ? 'var(--ch-loss)' : 'var(--ch-muted)' }}
                        >
                          {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
                        </td>
                        <td className="pr-5 pl-2 py-2.5 text-right font-semibold ch-num text-[color:var(--ch-text)]">{(row.pct * 100).toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
