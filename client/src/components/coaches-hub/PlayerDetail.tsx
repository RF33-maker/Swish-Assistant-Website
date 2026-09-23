import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PlayerSeasonAverage, TeamSeasonAverage } from '@/pages/CoachesHub';
import { useReadableTeamColor } from '@/hooks/useReadableColor';
import { getCategory, playerPercentileRow, type PercentileRow } from '@/lib/coachesHubCategories';
import { fetchGameSchedule, fetchTeamScoresByGame } from '@/lib/coachesHubGameData';
import ShotChart, { type ShotData } from '@/components/ShotChart';

interface Props {
  player: PlayerSeasonAverage;
  players: PlayerSeasonAverage[];
  teams: TeamSeasonAverage[];
  brandColor: string;
  onBack: () => void;
  onSelectTeam?: (team: TeamSeasonAverage) => void;
}

type DetailTab = 'profile' | 'video';

interface GameLogRow {
  gameKey: string;
  date: string | null;
  opponent: string;
  result: 'W' | 'L' | null;
  score: string | null;
  min: string | null;
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
}

const PERCENTILE_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Scoring', keys: ['points', 'ts_pct', 'efg_pct', 'usg_pct'] },
  { title: 'Shooting', keys: ['fg_pct', 'tp_pct', 'ft_pct'] },
  { title: 'Playmaking', keys: ['assists', 'ast_pct', 'tov_pct'] },
  { title: 'Rebounding', keys: ['rebounds', 'oreb_pct', 'dreb_pct', 'reb_pct'] },
  { title: 'Impact', keys: ['pie', 'off_rtg', 'def_rtg', 'net_rtg'] },
];

const SCORING_MIX_KEYS: { key: keyof PlayerSeasonAverage['advanced']; label: string }[] = [
  { key: 'pts_pct_2pt', label: '2PT' },
  { key: 'pts_pct_3pt', label: '3PT' },
  { key: 'pts_pct_ft', label: 'FT' },
];
const SCORING_CONTEXT_KEYS: { key: keyof PlayerSeasonAverage['advanced']; label: string }[] = [
  { key: 'pts_pct_pitp', label: 'In the paint' },
  { key: 'pts_pct_fastbreak', label: 'Fast break' },
  { key: 'pts_pct_2nd_chance', label: '2nd chance' },
  { key: 'pts_pct_off_to', label: 'Off turnovers' },
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

export default function PlayerDetail({ player, players, teams, brandColor, onBack, onSelectTeam }: Props) {
  const readableBrand = useReadableTeamColor(brandColor);
  const [tab, setTab] = useState<DetailTab>('profile');
  const [loading, setLoading] = useState(true);
  const [gameLog, setGameLog] = useState<GameLogRow[]>([]);
  const [shots, setShots] = useState<ShotData[]>([]);

  const team = teams.find(t => t.team_id === player.team_id || t.team_name === player.team_name);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const STATS_COLUMNS = 'game_key, spoints, sreboundstotal, sassists, ssteals, sblocks, sturnovers, sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, sfreethrowsmade, sfreethrowsattempted, sminutes';
        const { data: rows, error } = await supabase
          .from('player_stats')
          .select(STATS_COLUMNS)
          .in('player_id', player.player_ids)
          .eq('league_id', player.league_id);
        if (error) throw error;

        const gameKeys = Array.from(new Set((rows || []).map(r => r.game_key).filter(Boolean))) as string[];
        const [scheduleMap, scoresMap, shotRes] = await Promise.all([
          fetchGameSchedule(gameKeys),
          fetchTeamScoresByGame(gameKeys),
          gameKeys.length > 0
            ? supabase.from('shot_chart').select('id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key').in('player_id', player.player_ids).in('game_key', gameKeys)
            : Promise.resolve({ data: [] as ShotData[], error: null }),
        ]);

        const log: GameLogRow[] = (rows || []).map((r) => {
          const gk = r.game_key || '';
          const sched = scheduleMap.get(gk);
          let opponent = 'Unknown';
          if (sched) {
            const mine = player.team_name.trim().toLowerCase();
            if (sched.hometeam?.trim().toLowerCase() === mine) opponent = sched.awayteam;
            else if (sched.awayteam?.trim().toLowerCase() === mine) opponent = sched.hometeam;
          }
          const teamScores = scoresMap.get(gk) || [];
          const mine = teamScores.find(t => t.team_id === player.team_id) ?? teamScores.find(t => t.name?.trim().toLowerCase() === player.team_name.trim().toLowerCase());
          let result: 'W' | 'L' | null = null;
          let score: string | null = null;
          if (mine && mine.score !== null && mine.opp_points !== null) {
            result = mine.score > mine.opp_points ? 'W' : 'L';
            score = `${mine.score}-${mine.opp_points}`;
          }
          return {
            gameKey: gk,
            date: sched?.date ?? null,
            opponent,
            result,
            score,
            min: (r as any).sminutes ?? null,
            pts: r.spoints || 0, reb: r.sreboundstotal || 0, ast: r.sassists || 0,
            stl: r.ssteals || 0, blk: r.sblocks || 0, tov: r.sturnovers || 0,
            fgm: r.sfieldgoalsmade || 0, fga: r.sfieldgoalsattempted || 0,
            tpm: r.sthreepointersmade || 0, tpa: r.sthreepointersattempted || 0,
            ftm: r.sfreethrowsmade || 0, fta: r.sfreethrowsattempted || 0,
          };
        }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

        if (!cancelled) {
          setGameLog(log);
          setShots((shotRes.data || []) as ShotData[]);
        }
      } catch (err) {
        console.error('PlayerDetail load error:', err);
        if (!cancelled) { setGameLog([]); setShots([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [player.player_ids.join(','), player.league_id]);

  const percentileGroups = useMemo(() => {
    return PERCENTILE_GROUPS.map(g => ({
      title: g.title,
      rows: g.keys
        .map(key => playerPercentileRow(getCategory(key), player, players))
        .filter((r): r is PercentileRow => r !== null),
    })).filter(g => g.rows.length > 0);
  }, [player, players]);

  const scoringMix = SCORING_MIX_KEYS.map(({ key, label }) => ({ label, value: player.advanced[key] as number | null })).filter(r => r.value !== null) as { label: string; value: number }[];
  const scoringContext = SCORING_CONTEXT_KEYS.map(({ key, label }) => ({ label, value: player.advanced[key] as number | null })).filter(r => r.value !== null) as { label: string; value: number }[];

  const headerStats: { label: string; value: string }[] = [
    { label: 'Games', value: `${player.games_played}` },
    { label: 'PTS', value: player.avg_pts.toFixed(1) },
    { label: 'REB', value: player.avg_reb.toFixed(1) },
    { label: 'AST', value: player.avg_ast.toFixed(1) },
    { label: 'TS%', value: player.advanced.ts_pct !== null ? `${player.advanced.ts_pct.toFixed(1)}%` : '—' },
    { label: 'USG%', value: player.advanced.usg_pct !== null ? `${player.advanced.usg_pct.toFixed(1)}%` : '—' },
    { label: 'NET', value: player.advanced.net_rtg !== null ? (player.advanced.net_rtg > 0 ? `+${player.advanced.net_rtg.toFixed(1)}` : player.advanced.net_rtg.toFixed(1)) : '—' },
  ];

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to rankings
      </button>

      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden mb-4">
        <div className="p-4 md:p-6" style={{ background: `linear-gradient(135deg, ${brandColor}14, transparent)` }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold shrink-0" style={{ backgroundColor: `${brandColor}22`, color: readableBrand.body }}>
              {player.player_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">{player.player_name}</h2>
              {team ? (
                <button onClick={() => onSelectTeam?.(team)} className="text-sm hover:underline" style={{ color: readableBrand.body }}>
                  {player.team_name}
                </button>
              ) : (
                <span className="text-sm text-slate-500 dark:text-slate-400">{player.team_name}</span>
              )}
            </div>
          </div>
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
          {(['profile', 'video'] as DetailTab[]).map(t => (
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
              <span className="text-xs text-slate-400 dark:text-neutral-500">vs {players.length} players</span>
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

          {scoringMix.length > 0 && (
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-[11px] font-mono font-semibold tracking-widest" style={{ color: readableBrand.body }}>02</span>
                <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">Scoring distribution</h3>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex mb-2">
                {scoringMix.map((s, i) => (
                  <div key={s.label} style={{ width: `${s.value}%`, backgroundColor: brandColor, opacity: 1 - i * 0.28 }} title={`${s.label} ${s.value.toFixed(1)}%`} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-neutral-400 mb-4">
                {scoringMix.map(s => <span key={s.label}>{s.label} <strong className="text-slate-700 dark:text-neutral-300">{s.value.toFixed(1)}%</strong></span>)}
              </div>
              {scoringContext.length > 0 && (
                <>
                  <p className="text-[11px] text-slate-400 dark:text-neutral-500 mb-2">Where those points come from — these can overlap (a fast-break basket can also count toward points in the paint), so they won't add up to 100%.</p>
                  <div className="flex flex-wrap gap-2">
                    {scoringContext.map(s => (
                      <span key={s.label} className="text-xs px-2.5 py-1 rounded-md bg-gray-50 dark:bg-neutral-800/60 border border-gray-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300">
                        {s.label} <strong>{s.value.toFixed(1)}%</strong>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold tracking-widest" style={{ color: readableBrand.body }}>03</span>
              <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">Shot chart</h3>
            </div>
            <ShotChart shots={shots} loading={loading} emptyMessage="No located shots for this player yet." />
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold tracking-widest" style={{ color: readableBrand.body }}>04</span>
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
                      <th className="py-2 pr-3 font-medium text-right">PTS</th>
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
                        <td className="py-2 pr-3 text-right font-semibold" style={{ color: readableBrand.body }}>{g.pts}</td>
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
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-8 text-center">
          <Video className="w-12 h-12 text-gray-300 dark:text-neutral-700 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-1">Video is on the way</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Tap-to-jump clips for every made shot, rebound and turnover — synced to the box score above — are coming through our StatsThread partnership. Nothing to watch yet.
          </p>
        </div>
      )}
    </div>
  );
}
