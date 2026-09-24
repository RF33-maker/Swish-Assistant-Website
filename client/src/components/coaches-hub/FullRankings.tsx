import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { PlayerSeasonAverage, TeamSeasonAverage } from '@/pages/CoachesHub';
import { useReadableTeamColor } from '@/hooks/useReadableColor';
import { CATEGORIES, type CategoryGroup, type Entity, type ValueMode } from '@/lib/coachesHubCategories';

interface Props {
  players: PlayerSeasonAverage[];
  teams: TeamSeasonAverage[];
  brandColor: string;
  /** Row click-through into the deep-dive detail view, when the caller supports it. */
  onSelectPlayer?: (player: PlayerSeasonAverage) => void;
  onSelectTeam?: (team: TeamSeasonAverage) => void;
}

export default function FullRankings({ players, teams, brandColor, onSelectPlayer, onSelectTeam }: Props) {
  const readableBrand = useReadableTeamColor(brandColor);
  const [entity, setEntity] = useState<Entity>('players');
  const [categoryKey, setCategoryKey] = useState(CATEGORIES[0].key);
  const [valueMode, setValueMode] = useState<ValueMode>('averages');
  // Literal raw-value order — "Descending" always means highest number at
  // rank #1, "Ascending" always means lowest. Defaults per-category so the
  // *best* performer still lands at #1 without the toggle lying about which
  // direction it's showing (e.g. Turnovers defaults to Ascending, since
  // fewest turnovers is the good end of that stat).
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const category = CATEGORIES.find(c => c.key === categoryKey) ?? CATEGORIES[0];

  // Reset to that category's sensible default whenever the category changes
  // — otherwise switching from an ascending-flipped view of one stat would
  // silently carry "worst first" into the next category too.
  useEffect(() => {
    setSortDirection(category.lowerIsBetter ? 'asc' : 'desc');
  }, [categoryKey]);

  const rows = useMemo(() => {
    const compare = sortDirection === 'desc'
      ? (a: { value: number }, b: { value: number }) => b.value - a.value
      : (a: { value: number }, b: { value: number }) => a.value - b.value;
    if (entity === 'players') {
      const eligible = category.playerEligible ? players.filter(category.playerEligible) : players;
      return eligible
        .map(p => ({
          id: `${p.player_name}-${p.team_id}`,
          name: p.player_name,
          sub: p.team_name,
          value: category.playerValue(p, valueMode),
          ref: p,
        }))
        .filter((r): r is { id: string; name: string; sub: string; value: number; ref: PlayerSeasonAverage } => r.value !== null)
        .sort(compare);
    }
    return teams
      .map(t => ({
        // team_id is occasionally duplicated across two different real teams
        // in the source data, so team_name is folded in to keep rows unique.
        id: `${t.team_id}-${t.team_name}`,
        name: t.team_name,
        sub: `${t.games_played} games`,
        value: category.teamValue(t),
        ref: t,
      }))
      .filter((r): r is { id: string; name: string; sub: string; value: number; ref: TeamSeasonAverage } => r.value !== null)
      .sort(compare);
  }, [entity, category, valueMode, sortDirection, players, teams]);

  function formatValue(value: number): string {
    if (category.isPercent) return `${value.toFixed(1)}%`;
    if (valueMode === 'totals' && entity === 'players') return `${Math.round(value)}`;
    return value.toFixed(1);
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
      {/* The section title lives one level up (CoachesHub's numbered kicker) —
          this row is just the entity/mode toggles, right-aligned. */}
      <div className="flex items-center justify-end gap-2 mb-4">
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

          {entity === 'players' && category.group === 'Traditional' && !category.isPercent && (
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

          <div className="inline-flex rounded-md border border-gray-200 dark:border-neutral-700 overflow-hidden">
            {([
              { key: 'desc' as const, label: 'Descending', Icon: ArrowDown },
              { key: 'asc' as const, label: 'Ascending', Icon: ArrowUp },
            ]).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setSortDirection(key)}
                title={`Sort ${label.toLowerCase()} by ${category.label}`}
                className="flex items-center gap-1 px-3 py-1.5 text-sm transition-colors"
                style={sortDirection === key ? { backgroundColor: readableBrand.onWhite, color: '#fff' } : {}}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className={`hidden sm:inline ${sortDirection === key ? '' : 'text-gray-600 dark:text-neutral-400'}`}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category strips, grouped so the long advanced list doesn't swamp the
          everyday box-score categories most people want first. */}
      {(['Traditional', 'Advanced'] as CategoryGroup[]).map(group => (
        <div key={group} className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500 mb-1.5">
            {group}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-2 border-b border-gray-200 dark:border-neutral-800">
            {CATEGORIES.filter(c => c.group === group).map(c => (
              <button
                key={c.key}
                onClick={() => setCategoryKey(c.key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors border ${
                  categoryKey === c.key
                    ? ''
                    : 'border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:border-gray-300 dark:hover:border-neutral-600'
                }`}
                style={
                  categoryKey === c.key
                    ? { backgroundColor: readableBrand.onWhite, color: '#fff', borderColor: readableBrand.onWhite }
                    : {}
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {category.playerMinLabel && entity === 'players' && (
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
              {rows.map((row, i) => {
                const canDrillIn = entity === 'players' ? !!onSelectPlayer : !!onSelectTeam;
                const openDetail = () => {
                  if (entity === 'players') onSelectPlayer?.(row.ref as PlayerSeasonAverage);
                  else onSelectTeam?.(row.ref as TeamSeasonAverage);
                };
                return (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-neutral-800/60 last:border-0">
                    <td className="py-2 pr-3 text-gray-500 dark:text-neutral-500">{i + 1}</td>
                    <td className="py-2 pr-3 font-medium text-gray-900 dark:text-white">
                      {canDrillIn ? (
                        <button onClick={openDetail} className="hover:underline text-left" style={{ color: readableBrand.body }}>
                          {row.name}
                        </button>
                      ) : row.name}
                    </td>
                    <td className="py-2 pr-3 text-gray-500 dark:text-neutral-400 hidden sm:table-cell">{row.sub}</td>
                    <td className="py-2 pl-3 text-right font-bold" style={{ color: readableBrand.body }}>{formatValue(row.value)}</td>
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
