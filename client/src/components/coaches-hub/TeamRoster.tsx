import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { PlayerSeasonAverage, TeamSeasonAverage } from '@/pages/CoachesHub';
import { fetchClubPlayerRows, mergePlayerRows } from '@/lib/playerRankings';
import { competitionSeasonLabel, competitionShortName } from '@/lib/teamSeasons';
import { namesMatch } from '@/lib/fuzzyMatch';

/**
 * A team's players with their shooting (makes and attempts as well as the percentage), read over
 * one competition or over every competition the club has played in the same season.
 *
 * The hub is opened on one competition, and its own player list covers only that one. A club
 * plays a league, a cup and a trophy in a season under a different team id in each, so the other
 * competitions are read here: /api/public/team-competitions names the club's team in each, and
 * the box-score lines are added up per player for whichever the coach picks.
 */

interface CompetitionLike { league_id: string; name?: string | null; season?: string | null }

interface ClubCompetitions {
  competitions: CompetitionLike[];
  clubTeams?: Array<{ league_id: string; team_id: string }>;
}

type Mode = 'averages' | 'totals';
type SortKey = 'name' | 'gp' | 'pts' | 'reb' | 'ast' | 'fgm' | 'fga' | 'fg_pct' | 'tpm' | 'tpa' | 'tp_pct' | 'ftm' | 'fta' | 'ft_pct';
const ALL = 'all';

// Makes and attempts get a column each. Written together ("6.5-13.3") a per-game pair reads as
// a range, not as 6.5 made out of 13.3 taken.
const COLUMNS: { key: SortKey; label: string; title: string; groupStart?: boolean; strong?: boolean }[] = [
  { key: 'gp', label: 'GP', title: 'Games played' },
  { key: 'pts', label: 'PTS', title: 'Points', strong: true },
  { key: 'reb', label: 'REB', title: 'Rebounds' },
  { key: 'ast', label: 'AST', title: 'Assists' },
  { key: 'fgm', label: 'FGM', title: 'Field goals made', groupStart: true },
  { key: 'fga', label: 'FGA', title: 'Field goals attempted' },
  { key: 'fg_pct', label: 'FG%', title: 'Field goal percentage', strong: true },
  { key: 'tpm', label: '3PM', title: 'Three-pointers made', groupStart: true },
  { key: 'tpa', label: '3PA', title: 'Three-pointers attempted' },
  { key: 'tp_pct', label: '3P%', title: 'Three-point percentage', strong: true },
  { key: 'ftm', label: 'FTM', title: 'Free throws made', groupStart: true },
  { key: 'fta', label: 'FTA', title: 'Free throws attempted' },
  { key: 'ft_pct', label: 'FT%', title: 'Free throw percentage', strong: true },
];

const TOTALS: Partial<Record<SortKey, (p: PlayerSeasonAverage) => number>> = {
  pts: (p) => p.total_pts, reb: (p) => p.total_reb, ast: (p) => p.total_ast,
  fgm: (p) => p.total_fgm, fga: (p) => p.total_fga,
  tpm: (p) => p.total_tpm, tpa: (p) => p.total_tpa,
  ftm: (p) => p.total_ftm, fta: (p) => p.total_fta,
};

/** The number a column shows and sorts by; null where there is none (a percentage with no attempts). */
function columnValue(p: PlayerSeasonAverage, key: SortKey, mode: Mode): number | null {
  switch (key) {
    case 'gp': return p.games_played;
    case 'fg_pct': return p.total_fga > 0 ? p.season_fg_pct : null;
    case 'tp_pct': return p.total_tpa > 0 ? p.season_tp_pct : null;
    case 'ft_pct': return p.total_fta > 0 ? p.season_ft_pct : null;
    default: {
      const total = TOTALS[key]?.(p);
      if (total == null) return null;
      return mode === 'totals' ? total : p.games_played ? total / p.games_played : 0;
    }
  }
}

function columnText(p: PlayerSeasonAverage, key: SortKey, mode: Mode): string {
  const value = columnValue(p, key, mode);
  if (value == null) return '—';
  if (key === 'gp') return `${value}`;
  if (key.endsWith('_pct')) return value.toFixed(1);
  return mode === 'totals' ? `${value}` : value.toFixed(1);
}

export default function TeamRoster({ team, players, competition, color, onSelectPlayer }: {
  team: TeamSeasonAverage;
  /** The open competition's players, as the rest of the hub counts them. */
  players: PlayerSeasonAverage[];
  /** The competition the hub is open on. */
  competition?: CompetitionLike | null;
  color: string;
  onSelectPlayer?: (player: PlayerSeasonAverage) => void;
}) {
  const [selected, setSelected] = useState<string>(team.league_id);
  const [mode, setMode] = useState<Mode>('averages');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'pts', dir: 'desc' });

  const hubRoster = useMemo(
    () => players.filter((p) => p.team_id === team.team_id || p.team_name === team.team_name),
    [players, team],
  );

  const { data: club } = useQuery<ClubCompetitions | null>({
    queryKey: ['hub-club-competitions', team.team_id],
    queryFn: async () => {
      const res = await fetch(`/api/public/team-competitions/${encodeURIComponent(team.team_id)}`);
      return res.ok ? res.json() : null;
    },
    enabled: !!team.team_id,
    staleTime: 10 * 60_000,
  });

  // The club's competitions in the same season as the one the hub is open on.
  const season = useMemo(() => {
    const current = club?.competitions.find((c) => c.league_id === team.league_id) ?? competition ?? null;
    if (!current) return null;
    const label = competitionSeasonLabel(current);
    const competitions = (club?.competitions ?? []).filter((c) => competitionSeasonLabel(c) === label);
    const ids = new Set(competitions.map((c) => c.league_id));
    const teams = (club?.clubTeams ?? []).filter((t) => ids.has(t.league_id));
    return { label, competitions, teams };
  }, [club, competition, team.league_id]);

  const teamsKey = (season?.teams ?? []).map((t) => `${t.league_id}|${t.team_id}`).sort().join(',');
  const { data: rows, isLoading: rowsLoading } = useQuery({
    queryKey: ['hub-club-player-rows', teamsKey],
    queryFn: () => fetchClubPlayerRows(season?.teams ?? []),
    enabled: (season?.competitions.length ?? 0) > 1 && teamsKey.length > 0,
    staleTime: 5 * 60_000,
  });

  // Only competitions the club has a game in are worth a filter; the open one is always offered.
  const options = useMemo(() => {
    if (!season || !rows) return [];
    const games = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!r.game_key) continue;
      if (!games.has(r.league_id)) games.set(r.league_id, new Set());
      games.get(r.league_id)!.add(r.game_key);
    }
    return season.competitions
      .map((c) => ({ leagueId: c.league_id, name: competitionShortName(c.name), games: games.get(c.league_id)?.size ?? 0 }))
      .filter((c) => c.games > 0 || c.leagueId === team.league_id)
      .sort((a, b) => Number(b.leagueId === team.league_id) - Number(a.leagueId === team.league_id) || b.games - a.games);
  }, [season, rows, team.league_id]);
  const canFilter = options.length > 1;
  const active = canFilter && (selected === ALL || options.some((o) => o.leagueId === selected)) ? selected : team.league_id;

  const roster = useMemo(() => {
    if (active === team.league_id || !rows) return hubRoster;
    const counted = rows
      .filter((r) => active === ALL || r.league_id === active)
      // One club, so one team name: a player's league and cup lines then merge as the same player.
      .map((r) => ({ ...r, team_name: team.team_name }));
    return mergePlayerRows(counted, active === ALL ? team.league_id : active);
  }, [active, rows, hubRoster, team]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...roster].sort((a, b) => {
      if (sort.key === 'name') return dir * a.player_name.localeCompare(b.player_name);
      const av = columnValue(a, sort.key, mode);
      const bv = columnValue(b, sort.key, mode);
      // A player with no attempts has no percentage: last, whichever way the column is sorted.
      if (av == null || bv == null) return Number(av == null) - Number(bv == null) || b.total_pts - a.total_pts;
      return dir * (av - bv) || b.total_pts - a.total_pts;
    });
  }, [roster, sort, mode]);

  // A row opens the player's own page, which reads the open competition.
  const hubPlayerFor = (p: PlayerSeasonAverage) =>
    hubRoster.find((h) => h === p || h.player_ids.some((id) => p.player_ids.includes(id)))
    ?? hubRoster.find((h) => namesMatch(h.player_name, p.player_name));

  const countedGames = active === ALL
    ? options.reduce((n, o) => n + o.games, 0)
    : options.find((o) => o.leagueId === active)?.games ?? team.games_played;

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="ch-kicker-n" style={{ color }}>02</span>
          <h3 className="text-[15px] md:text-base font-semibold tracking-tight text-[color:var(--ch-text)]">Roster</h3>
          {season && /(?:19|20)\d{2}/.test(season.label) && <span className="text-xs text-[color:var(--ch-muted)] ch-num">{season.label}</span>}
        </div>
        <div className="ch-seg">
          {([['averages', 'Per game'], ['totals', 'Totals']] as [Mode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} data-active={mode === m} className="px-3 h-8 text-[13px]">{label}</button>
          ))}
        </div>
      </div>

      {canFilter && (
        <div className="mb-3">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5" role="group" aria-label="Competition">
            {[{ leagueId: ALL, name: 'All competitions', games: options.reduce((n, o) => n + o.games, 0) }, ...options].map((o) => (
              <button
                key={o.leagueId}
                onClick={() => setSelected(o.leagueId)}
                data-active={active === o.leagueId}
                aria-pressed={active === o.leagueId}
                className="ch-chip px-3 py-1.5 text-[12.5px] whitespace-nowrap shrink-0"
              >
                {o.name} <span className="ch-num opacity-60 ml-0.5">{o.games}</span>
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-[color:var(--ch-muted)] mt-2">
            {active === ALL
              ? `Every competition in ${season?.label}: ${countedGames} ${countedGames === 1 ? 'game' : 'games'}.`
              : `${options.find((o) => o.leagueId === active)?.name} only: ${countedGames} ${countedGames === 1 ? 'game' : 'games'}.`}
          </p>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-[color:var(--ch-muted)] py-4 text-center">
          {rowsLoading && active !== team.league_id ? 'Loading…' : 'No tracked players for this team yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full sm:min-w-[760px] text-[13px] ch-table ch-table-flat">
            <thead>
              <tr className="border-b border-[color:var(--ch-border)]">
                <th className="py-2 pr-3 text-left sticky left-0 z-[1] bg-[color:var(--ch-bg)]" aria-sort={sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <button onClick={() => toggleSort('name')} className="uppercase tracking-[inherit] font-[inherit] hover:text-[color:var(--ch-text)]">Player</button>
                </th>
                {COLUMNS.map((c) => {
                  const on = sort.key === c.key;
                  return (
                    <th key={c.key} className={`py-2 text-right whitespace-nowrap ${c.groupStart ? 'pl-5 sm:pl-6' : 'pl-2.5 sm:pl-3'}`} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      <button
                        onClick={() => toggleSort(c.key)}
                        title={c.title}
                        className="inline-flex items-center gap-0.5 uppercase tracking-[inherit] font-[inherit] hover:text-[color:var(--ch-text)]"
                        style={on ? { color: 'var(--ch-text)' } : undefined}
                      >
                        {on && (sort.dir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                        {c.label}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const hubPlayer = onSelectPlayer ? hubPlayerFor(p) : undefined;
                return (
                  <tr key={`${p.player_name}-${p.player_ids[0] ?? ''}`} className="group border-b border-[color:var(--ch-border)] last:border-0">
                    <td className="py-2 pr-3 font-medium whitespace-nowrap sticky left-0 z-[1] bg-[color:var(--ch-bg)] group-hover:bg-[color:var(--ch-surface-2)] transition-colors">
                      {/* Phones: a long name is cut short so the numbers keep most of the width. */}
                      <span className="block max-w-[6.5rem] sm:max-w-none truncate" title={p.player_name}>
                        {hubPlayer ? (
                          <button onClick={() => onSelectPlayer?.(hubPlayer)} className="hover:underline underline-offset-2 text-left max-w-full truncate align-bottom" style={{ color }}>{p.player_name}</button>
                        ) : <span className="text-[color:var(--ch-text)]">{p.player_name}</span>}
                      </span>
                    </td>
                    {COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`py-2 text-right ch-num whitespace-nowrap ${c.groupStart ? 'pl-5 sm:pl-6' : 'pl-2.5 sm:pl-3'} ${c.strong ? 'font-semibold text-[color:var(--ch-text)]' : 'text-[color:var(--ch-text-2)]'}`}
                      >
                        {columnText(p, c.key, mode)}
                      </td>
                    ))}
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
