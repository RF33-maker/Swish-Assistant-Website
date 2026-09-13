import { useMemo, useState } from 'react';
import type { PlayerSeasonAverage, TeamSeasonAverage } from '@/pages/CoachesHub';
import { useReadableTeamColor } from '@/hooks/useReadableColor';

interface Props {
  players: PlayerSeasonAverage[];
  teams: TeamSeasonAverage[];
  brandColor: string;
}

type Entity = 'players' | 'teams';
type ValueMode = 'averages' | 'totals';

// Same minimum-attempt floors as the public league leaders page, so a single
// hot shot doesn't top a percentage leaderboard on a tiny sample.
const MIN_FGA = 12;
const MIN_3PA = 6;
const MIN_FTA = 8;

interface CategoryDef {
  key: string;
  label: string;
  unit: string;
  isPercent?: boolean;
  playerValue: (p: PlayerSeasonAverage, mode: ValueMode) => number;
  playerEligible?: (p: PlayerSeasonAverage) => boolean;
  playerMinLabel?: string;
  teamValue: (t: TeamSeasonAverage) => number;
}

const CATEGORIES: CategoryDef[] = [
  {
    key: 'points', label: 'Points', unit: 'PTS',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_pts ?? 0) : (p.total_pts ?? 0),
    teamValue: (t) => t.avg_pts ?? 0,
  },
  {
    key: 'rebounds', label: 'Rebounds', unit: 'REB',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_reb ?? 0) : (p.total_reb ?? 0),
    teamValue: (t) => t.avg_reb ?? 0,
  },
  {
    key: 'assists', label: 'Assists', unit: 'AST',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_ast ?? 0) : (p.total_ast ?? 0),
    teamValue: (t) => t.avg_ast ?? 0,
  },
  {
    key: 'steals', label: 'Steals', unit: 'STL',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_stl ?? 0) : (p.total_stl ?? 0),
    teamValue: (t) => t.avg_stl ?? 0,
  },
  {
    key: 'blocks', label: 'Blocks', unit: 'BLK',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_blk ?? 0) : (p.total_blk ?? 0),
    teamValue: (t) => t.avg_blk ?? 0,
  },
  {
    key: 'turnovers', label: 'Turnovers', unit: 'TOV',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_tov ?? 0) : (p.total_tov ?? 0),
    teamValue: (t) => t.avg_tov ?? 0,
  },
  {
    key: 'fg_pct', label: 'FG%', unit: '%', isPercent: true,
    playerValue: (p) => p.season_fg_pct ?? 0,
    playerEligible: (p) => (p.total_fga ?? 0) >= MIN_FGA,
    playerMinLabel: `Min. ${MIN_FGA} FGA`,
    teamValue: (t) => t.season_fg_pct ?? 0,
  },
  {
    key: 'tp_pct', label: '3P%', unit: '%', isPercent: true,
    playerValue: (p) => p.season_tp_pct ?? 0,
    playerEligible: (p) => (p.total_tpa ?? 0) >= MIN_3PA,
    playerMinLabel: `Min. ${MIN_3PA} 3PA`,
    teamValue: (t) => t.season_tp_pct ?? 0,
  },
  {
    key: 'ft_pct', label: 'FT%', unit: '%', isPercent: true,
    playerValue: (p) => p.season_ft_pct ?? 0,
    playerEligible: (p) => (p.total_fta ?? 0) >= MIN_FTA,
    playerMinLabel: `Min. ${MIN_FTA} FTA`,
    teamValue: (t) => t.season_ft_pct ?? 0,
  },
];

export default function FullRankings({ players, teams, brandColor }: Props) {
  const readableBrand = useReadableTeamColor(brandColor);
  const [entity, setEntity] = useState<Entity>('players');
  const [categoryKey, setCategoryKey] = useState(CATEGORIES[0].key);
  const [valueMode, setValueMode] = useState<ValueMode>('averages');

  const category = CATEGORIES.find(c => c.key === categoryKey) ?? CATEGORIES[0];

  const rows = useMemo(() => {
    if (entity === 'players') {
      const eligible = category.playerEligible ? players.filter(category.playerEligible) : players;
      return eligible
        .map(p => ({
          id: `${p.player_name}-${p.team_id}`,
          name: p.player_name,
          sub: p.team_name,
          value: category.playerValue(p, valueMode),
        }))
        .sort((a, b) => b.value - a.value);
    }
    return teams
      .map(t => ({
        // team_id is occasionally duplicated across two different real teams
        // in the source data, so team_name is folded in to keep rows unique.
        id: `${t.team_id}-${t.team_name}`,
        name: t.team_name,
        sub: `${t.games_played} games`,
        value: category.teamValue(t),
      }))
      .sort((a, b) => b.value - a.value);
  }, [entity, category, valueMode, players, teams]);

  function formatValue(value: number): string {
    if (category.isPercent) return `${value.toFixed(1)}%`;
    if (valueMode === 'totals' && entity === 'players') return `${Math.round(value)}`;
    return value.toFixed(1);
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white">Full Rankings</h2>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 dark:border-neutral-700 overflow-hidden">
            {(['players', 'teams'] as Entity[]).map(e => (
              <button
                key={e}
                onClick={() => setEntity(e)}
                className="px-3 py-1.5 text-sm capitalize transition-colors"
                style={entity === e ? { backgroundColor: readableBrand.onWhite, color: '#fff' } : {}}
              >
                <span className={entity === e ? '' : 'text-gray-600 dark:text-neutral-400'}>{e}</span>
              </button>
            ))}
          </div>

          {entity === 'players' && !category.isPercent && (
            <div className="inline-flex rounded-md border border-gray-200 dark:border-neutral-700 overflow-hidden">
              {(['averages', 'totals'] as ValueMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setValueMode(m)}
                  className="px-3 py-1.5 text-sm capitalize transition-colors"
                  style={valueMode === m ? { backgroundColor: readableBrand.onWhite, color: '#fff' } : {}}
                >
                  <span className={valueMode === m ? '' : 'text-gray-600 dark:text-neutral-400'}>{m}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category strip */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-3 border-b border-gray-200 dark:border-neutral-800">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setCategoryKey(c.key)}
            className="px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors border"
            style={
              categoryKey === c.key
                ? { backgroundColor: readableBrand.onWhite, color: '#fff', borderColor: readableBrand.onWhite }
                : { borderColor: 'transparent' }
            }
          >
            <span className={categoryKey === c.key ? '' : 'text-gray-600 dark:text-neutral-400'}>{c.label}</span>
          </button>
        ))}
      </div>

      {category.playerEligible && entity === 'players' && (
        <p className="text-xs text-slate-400 dark:text-neutral-500 mb-3">{category.playerMinLabel} to qualify.</p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">No qualifying data for this category yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-neutral-500 border-b border-gray-200 dark:border-neutral-800">
                <th className="py-2 pr-3 font-medium w-10">#</th>
                <th className="py-2 pr-3 font-medium">{entity === 'players' ? 'Player' : 'Team'}</th>
                <th className="py-2 pr-3 font-medium hidden sm:table-cell">{entity === 'players' ? 'Team' : 'Games'}</th>
                <th className="py-2 pl-3 font-medium text-right">{category.unit}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className="border-b border-gray-100 dark:border-neutral-800/60 last:border-0">
                  <td className="py-2 pr-3 text-gray-500 dark:text-neutral-500">{i + 1}</td>
                  <td className="py-2 pr-3 font-medium text-gray-900 dark:text-white">{row.name}</td>
                  <td className="py-2 pr-3 text-gray-500 dark:text-neutral-400 hidden sm:table-cell">{row.sub}</td>
                  <td className="py-2 pl-3 text-right font-bold" style={{ color: readableBrand.body }}>{formatValue(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
