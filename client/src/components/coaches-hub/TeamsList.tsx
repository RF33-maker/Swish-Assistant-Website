import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import type { StandingRow, TeamSeasonAverage } from '@/pages/CoachesHub';
import { TeamLogo } from '@/components/TeamLogo';

/**
 * Every team in the open competition, in standings order, as the way into a team's profile
 * (percentiles, roster, game log, lineups). The Stats tab ranks teams one stat at a time; this is
 * the plain list for finding a team.
 */

export interface TeamsListRow {
  /** The club's name as the standings show it. */
  name: string;
  team: TeamSeasonAverage;
  standing?: StandingRow;
}

const num = (value: number | string | null | undefined, digits = 1) =>
  value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(digits);

export default function TeamsList({ rows, leagueId, myTeamName, color, onSelectTeam }: {
  rows: TeamsListRow[];
  leagueId: string;
  /** The coach's own team, marked "You". */
  myTeamName?: string | null;
  color: string;
  onSelectTeam: (team: TeamSeasonAverage) => void;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  return (
    <div>
      {rows.length > 8 && (
        <div className="relative mb-3 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ch-muted)] pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a team"
            aria-label="Find a team"
            className="ch-input w-full pl-9 pr-3 h-9 text-[13px]"
          />
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-[color:var(--ch-muted)] py-10 text-center">No team matches "{query}".</p>
      ) : (
        <div className="ch-card overflow-hidden">
          <table className="w-full text-[13.5px] ch-table">
            <thead>
              <tr className="text-left border-b border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)]">
                <th className="py-2.5 pl-4 md:pl-6 pr-2 w-10">#</th>
                <th className="py-2.5 pr-3">Team</th>
                <th className="py-2.5 pl-2 md:pl-6 text-right" title="Wins and losses">W-L</th>
                <th className="py-2.5 pl-3 md:pl-6 text-right" title="Points a game">PTS</th>
                <th className="py-2.5 pl-3 md:pl-6 text-right hidden sm:table-cell" title="Rebounds a game">REB</th>
                <th className="py-2.5 pl-3 md:pl-6 text-right hidden sm:table-cell" title="Assists a game">AST</th>
                <th className="py-2.5 pl-3 md:pl-6 text-right hidden md:table-cell" title="Field goal percentage">FG%</th>
                <th className="py-2.5 pl-3 md:pl-6 text-right hidden md:table-cell" title="Three-point percentage">3P%</th>
                <th className="py-2.5 pl-3 md:pl-6 text-right hidden lg:table-cell" title="Net rating">NET</th>
                <th className="w-9 md:w-12" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => {
                const isMe = !!myTeamName && row.team.team_name === myTeamName;
                const net = row.team.advanced?.net_rtg;
                const cell = 'py-2.5 pl-3 md:pl-6 text-right ch-num whitespace-nowrap text-[color:var(--ch-text-2)]';
                return (
                  <tr
                    key={`${row.team.team_id}-${row.name}`}
                    onClick={() => onSelectTeam(row.team)}
                    className="border-b border-[color:var(--ch-border)] last:border-0 cursor-pointer"
                    style={isMe ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                  >
                    <td className="py-2.5 pl-4 md:pl-6 pr-2 text-xs ch-num text-[color:var(--ch-muted)]">{row.standing?.rank ?? i + 1}</td>
                    <td className="py-2.5 pr-3 font-medium max-w-0 w-full">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectTeam(row.team); }}
                        className="flex items-center gap-2.5 min-w-0 max-w-full text-left hover:underline underline-offset-2"
                        aria-label={`Open ${row.name}`}
                      >
                        <span className="w-6 h-6 shrink-0 flex items-center justify-center">
                          <TeamLogo teamName={row.name} leagueId={leagueId} size="xs" />
                        </span>
                        <span className="truncate" style={isMe ? { color, fontWeight: 600 } : { color: 'var(--ch-text)' }}>{row.name}</span>
                        {isMe && <span className="text-[9.5px] font-bold uppercase tracking-wider opacity-70 shrink-0" style={{ color }}>You</span>}
                      </button>
                    </td>
                    <td className="py-2.5 pl-2 md:pl-6 text-right ch-num whitespace-nowrap text-[color:var(--ch-text-2)]">
                      {row.standing && row.standing.games > 0 ? `${row.standing.wins}-${row.standing.losses}` : '—'}
                    </td>
                    <td className="py-2.5 pl-3 md:pl-6 text-right ch-num font-semibold text-[color:var(--ch-text)]">{num(row.team.avg_pts)}</td>
                    <td className={`${cell} hidden sm:table-cell`}>{num(row.team.avg_reb)}</td>
                    <td className={`${cell} hidden sm:table-cell`}>{num(row.team.avg_ast)}</td>
                    <td className={`${cell} hidden md:table-cell`}>{num(row.team.season_fg_pct)}</td>
                    <td className={`${cell} hidden md:table-cell`}>{num(row.team.season_tp_pct)}</td>
                    <td className={`${cell} hidden lg:table-cell`}>{net == null ? '—' : `${net > 0 ? '+' : ''}${net.toFixed(1)}`}</td>
                    <td className="py-2.5 pr-3 md:pr-5 text-right">
                      <ChevronRight className="w-4 h-4 inline text-[color:var(--ch-muted)]" />
                    </td>
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
