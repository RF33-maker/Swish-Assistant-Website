import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PlayerSeasonAverage, TeamSeasonAverage } from '@/pages/CoachesHub';
import { useReadableTeamColor } from '@/hooks/useReadableColor';
import { getCategory, teamPercentileRow, type PercentileRow } from '@/lib/coachesHubCategories';
import { fetchGameSchedule } from '@/lib/coachesHubGameData';
import AdvancedInsights from './AdvancedInsights';

interface Props {
  team: TeamSeasonAverage;
  teams: TeamSeasonAverage[];
  players: PlayerSeasonAverage[];
  brandColor: string;
  onBack: () => void;
  onSelectPlayer?: (player: PlayerSeasonAverage) => void;
}

type DetailTab = 'profile' | 'lineups' | 'video';

interface TeamGameLogRow {
  gameKey: string;
  date: string | null;
  opponent: string;
  result: 'W' | 'L' | null;
  score: string | null;
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number;
}

const PERCENTILE_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Scoring', keys: ['points', 'ts_pct', 'efg_pct'] },
  { title: 'Shooting', keys: ['fg_pct', 'tp_pct', 'ft_pct'] },
  { title: 'Playmaking', keys: ['assists', 'ast_pct', 'tov_pct'] },
  { title: 'Rebounding', keys: ['rebounds', 'oreb_pct', 'dreb_pct', 'reb_pct'] },
  { title: 'Impact', keys: ['pie', 'off_rtg', 'def_rtg', 'net_rtg', 'pace'] },
];

function PercentileBar({ row, color }: { row: PercentileRow; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-xs text-gray-600 dark:text-neutral-400 shrink-0">{row.label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(row.percentile, 3)}%`, backgroundColor: color }} />
      </div>
      <span className="w-14 text-right text-xs font-semibold text-gray-900 dark:text-white shrink-0">{row.display}</span>
      <span className="w-14 text-right text-[11px] text-gray-400 dark:text-neutral-500 shrink-0">{ordinal(row.percentile)}</span>
    </div>
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export default function TeamDetail({ team, teams, players, brandColor, onBack, onSelectPlayer }: Props) {
  const readableBrand = useReadableTeamColor(brandColor);
  const [tab, setTab] = useState<DetailTab>('profile');
  const [loading, setLoading] = useState(true);
  const [gameLog, setGameLog] = useState<TeamGameLogRow[]>([]);

  const roster = useMemo(
    () => players
      .filter(p => p.team_id === team.team_id || p.team_name === team.team_name)
      .sort((a, b) => b.avg_pts - a.avg_pts),
    [players, team]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: rows, error } = await supabase
          .from('team_stats')
          .select('game_key, score, opp_points, tot_sreboundstotal, tot_sassists, tot_ssteals, tot_sblocks, tot_sturnovers, tot_sfieldgoalsmade, tot_sfieldgoalsattempted')
          .eq('team_id', team.team_id)
          .eq('league_id', team.league_id);
        if (error) throw error;

        const gameKeys = Array.from(new Set((rows || []).map(r => r.game_key).filter(Boolean))) as string[];
        const scheduleMap = await fetchGameSchedule(gameKeys);

        const log: TeamGameLogRow[] = (rows || []).map((r) => {
          const gk = r.game_key || '';
          const sched = scheduleMap.get(gk);
          let opponent = 'Unknown';
          if (sched) {
            const mine = team.team_name.trim().toLowerCase();
            if (sched.hometeam?.trim().toLowerCase() === mine) opponent = sched.awayteam;
            else if (sched.awayteam?.trim().toLowerCase() === mine) opponent = sched.hometeam;
          }
          const result: 'W' | 'L' | null = r.score !== null && r.opp_points !== null ? (r.score > r.opp_points ? 'W' : 'L') : null;
          return {
            gameKey: gk,
            date: sched?.date ?? null,
            opponent,
            result,
            score: r.score !== null && r.opp_points !== null ? `${r.score}-${r.opp_points}` : null,
            reb: r.tot_sreboundstotal || 0, ast: r.tot_sassists || 0, stl: r.tot_ssteals || 0,
            blk: r.tot_sblocks || 0, tov: r.tot_sturnovers || 0,
            fgm: r.tot_sfieldgoalsmade || 0, fga: r.tot_sfieldgoalsattempted || 0,
            pts: r.score || 0,
          };
        }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

        if (!cancelled) setGameLog(log);
      } catch (err) {
        console.error('TeamDetail load error:', err);
        if (!cancelled) setGameLog([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [team.team_id, team.league_id]);

  const percentileGroups = useMemo(() => {
    return PERCENTILE_GROUPS.map(g => ({
      title: g.title,
      rows: g.keys
        .map(key => teamPercentileRow(getCategory(key), team, teams))
        .filter((r): r is PercentileRow => r !== null),
    })).filter(g => g.rows.length > 0);
  }, [team, teams]);

  const headerStats: { label: string; value: string }[] = [
    { label: 'Games', value: `${team.games_played}` },
    { label: 'PTS', value: team.avg_pts.toFixed(1) },
    { label: 'REB', value: team.avg_reb.toFixed(1) },
    { label: 'AST', value: team.avg_ast.toFixed(1) },
    { label: 'FG%', value: team.season_fg_pct !== null ? `${team.season_fg_pct.toFixed(1)}%` : '—' },
    { label: 'NET', value: team.advanced?.net_rtg != null ? (team.advanced.net_rtg > 0 ? `+${team.advanced.net_rtg.toFixed(1)}` : team.advanced.net_rtg.toFixed(1)) : '—' },
    { label: 'PACE', value: team.advanced?.pace != null ? team.advanced.pace.toFixed(1) : '—' },
  ];

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to rankings
      </button>

      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden mb-4">
        <div className="p-4 md:p-6" style={{ background: `linear-gradient(135deg, ${brandColor}14, transparent)` }}>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">{team.team_name}</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">{roster.length} tracked players</span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-7 border-t border-gray-200 dark:border-neutral-800">
          {headerStats.map((s, i) => (
            <div key={s.label} className={`text-center py-3 ${i > 0 ? 'border-l border-gray-100 dark:border-neutral-800' : ''}`}>
              <div className="text-base md:text-lg font-bold text-slate-800 dark:text-white">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-neutral-500">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex border-t border-gray-200 dark:border-neutral-800">
          {(['profile', 'lineups', 'video'] as DetailTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors"
              style={tab === t ? { color: readableBrand.body, borderBottomColor: brandColor } : { borderBottomColor: 'transparent' }}
            >
              <span className={tab === t ? '' : 'text-gray-500 dark:text-neutral-400'}>{t}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'profile' ? (
        <div className="space-y-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-mono font-semibold tracking-widest" style={{ color: readableBrand.body }}>01</span>
                <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">League percentile</h3>
              </div>
              <span className="text-xs text-slate-400 dark:text-neutral-500">vs {teams.length} teams</span>
            </div>
            <div className="space-y-5">
              {percentileGroups.map(g => (
                <div key={g.title}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500 mb-2">{g.title}</div>
                  <div className="space-y-2">
                    {g.rows.map(row => <PercentileBar key={row.key} row={row} color={brandColor} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold tracking-widest" style={{ color: readableBrand.body }}>02</span>
              <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">Roster</h3>
            </div>
            {roster.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-neutral-500 py-4 text-center">No tracked players for this team yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-neutral-500 border-b border-gray-200 dark:border-neutral-800">
                      <th className="py-2 pr-3 font-medium">Player</th>
                      <th className="py-2 pr-3 font-medium text-right">GP</th>
                      <th className="py-2 pr-3 font-medium text-right">PTS</th>
                      <th className="py-2 pr-3 font-medium text-right hidden sm:table-cell">REB</th>
                      <th className="py-2 pl-3 font-medium text-right hidden sm:table-cell">AST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map(p => (
                      <tr key={`${p.player_name}-${p.team_id}`} className="border-b border-gray-100 dark:border-neutral-800/60 last:border-0">
                        <td className="py-2 pr-3 font-medium">
                          {onSelectPlayer ? (
                            <button onClick={() => onSelectPlayer(p)} className="hover:underline text-left" style={{ color: readableBrand.body }}>{p.player_name}</button>
                          ) : <span className="text-gray-900 dark:text-white">{p.player_name}</span>}
                        </td>
                        <td className="py-2 pr-3 text-right text-gray-700 dark:text-neutral-300">{p.games_played}</td>
                        <td className="py-2 pr-3 text-right font-semibold" style={{ color: readableBrand.body }}>{p.avg_pts.toFixed(1)}</td>
                        <td className="py-2 pr-3 text-right text-gray-700 dark:text-neutral-300 hidden sm:table-cell">{p.avg_reb.toFixed(1)}</td>
                        <td className="py-2 pl-3 text-right text-gray-700 dark:text-neutral-300 hidden sm:table-cell">{p.avg_ast.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold tracking-widest" style={{ color: readableBrand.body }}>03</span>
              <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">Game log</h3>
            </div>
            {loading ? (
              <p className="text-sm text-slate-400 dark:text-neutral-500 py-4 text-center">Loading…</p>
            ) : gameLog.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-neutral-500 py-4 text-center">No games found yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-neutral-500 border-b border-gray-200 dark:border-neutral-800">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Opp</th>
                      <th className="py-2 pr-3 font-medium">Res</th>
                      <th className="py-2 pr-3 font-medium text-right hidden sm:table-cell">REB</th>
                      <th className="py-2 pr-3 font-medium text-right hidden sm:table-cell">AST</th>
                      <th className="py-2 pr-3 font-medium text-right hidden md:table-cell">STL</th>
                      <th className="py-2 pr-3 font-medium text-right hidden md:table-cell">BLK</th>
                      <th className="py-2 pr-3 font-medium text-right hidden md:table-cell">TO</th>
                      <th className="py-2 pl-3 font-medium text-right">FG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameLog.map(g => (
                      <tr key={g.gameKey} className="border-b border-gray-100 dark:border-neutral-800/60 last:border-0">
                        <td className="py-2 pr-3 text-gray-500 dark:text-neutral-400 whitespace-nowrap">{g.date ? new Date(g.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</td>
                        <td className="py-2 pr-3 text-gray-900 dark:text-white whitespace-nowrap">{g.opponent}</td>
                        <td className="py-2 pr-3">
                          {g.result ? (
                            <span className={`font-semibold ${g.result === 'W' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{g.result}</span>
                          ) : '—'}
                          {g.score && <span className="text-gray-400 dark:text-neutral-500 ml-1">{g.score}</span>}
                        </td>
                        <td className="py-2 pr-3 text-right text-gray-700 dark:text-neutral-300 hidden sm:table-cell">{g.reb}</td>
                        <td className="py-2 pr-3 text-right text-gray-700 dark:text-neutral-300 hidden sm:table-cell">{g.ast}</td>
                        <td className="py-2 pr-3 text-right text-gray-700 dark:text-neutral-300 hidden md:table-cell">{g.stl}</td>
                        <td className="py-2 pr-3 text-right text-gray-700 dark:text-neutral-300 hidden md:table-cell">{g.blk}</td>
                        <td className="py-2 pr-3 text-right text-gray-700 dark:text-neutral-300 hidden md:table-cell">{g.tov}</td>
                        <td className="py-2 pl-3 text-right text-gray-700 dark:text-neutral-300 whitespace-nowrap">{g.fgm}-{g.fga}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : tab === 'lineups' ? (
        <AdvancedInsights leagueId={team.league_id} teamId={team.team_id} />
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-8 text-center">
          <Video className="w-12 h-12 text-gray-300 dark:text-neutral-700 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-1">Video is on the way</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Full-game footage with tap-to-jump plays is coming through our StatsThread partnership. Nothing to watch yet.
          </p>
        </div>
      )}
    </div>
  );
}
