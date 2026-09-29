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

  const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.value)), 0) || 1;

  return (
    <div className="ch-card overflow-hidden">
      {/* The section title lives one level up (CoachesHub's numbered kicker) —
          this row is the entity/mode toggles. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 pt-4 md:pt-5">
        <div className="ch-seg">
          {(['players', 'teams'] as Entity[]).map(e => (
            <button
              key={e}
              onClick={() => setEntity(e)}
              data-active={entity === e}
              className="px-3.5 h-8 text-[13px] capitalize"
            >
              {e}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {entity === 'players' && category.group === 'Traditional' && !category.isPercent && (
            <div className="ch-seg">
              {(['averages', 'totals'] as ValueMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setValueMode(m)}
                  data-active={valueMode === m}
                  className="px-3 h-8 text-[13px] capitalize"
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <div className="ch-seg">
            {([
              { key: 'desc' as const, label: 'Descending', Icon: ArrowDown },
              { key: 'asc' as const, label: 'Ascending', Icon: ArrowUp },
            ]).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setSortDirection(key)}
                data-active={sortDirection === key}
                title={`Sort ${label.toLowerCase()} by ${category.label}`}
                className="flex items-center gap-1 px-2.5 h-8 text-[13px]"
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category strips, grouped so the long advanced list doesn't swamp the
          everyday box-score categories most people want first. */}
      <div className="px-4 md:px-6 pt-4 space-y-3">
        {(['Traditional', 'Advanced'] as CategoryGroup[]).map(group => (
          <div key={group} className="flex items-center gap-3 min-w-0">
            <div className="ch-eyebrow w-[84px] shrink-0 hidden md:block">{group}</div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5 min-w-0">
              <span className="ch-eyebrow self-center mr-1 md:hidden shrink-0">{group}</span>
              {CATEGORIES.filter(c => c.group === group).map(c => (
                <button
                  key={c.key}
                  onClick={() => setCategoryKey(c.key)}
                  data-active={categoryKey === c.key}
                  className="ch-chip px-3 py-1.5 text-[12.5px] whitespace-nowrap shrink-0"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 md:px-6 pt-3 pb-1 min-h-[1.5rem]">
        {category.playerMinLabel && entity === 'players' && (
          <p className="text-[11.5px] text-[color:var(--ch-muted)]">{category.playerMinLabel} to qualify.</p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[color:var(--ch-muted)] py-12 text-center border-t border-[color:var(--ch-border)]">No qualifying data for this category yet.</p>
      ) : (
        <div className="overflow-x-auto border-t border-[color:var(--ch-border)]">
          <table className="w-full text-[13.5px] ch-table">
            <thead>
              <tr className="text-left border-b border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)]">
                <th className="py-2.5 pl-4 md:pl-6 pr-3 w-12">#</th>
                <th className="py-2.5 pr-3">{entity === 'players' ? 'Player' : 'Team'}</th>
                <th className="py-2.5 pr-3 hidden sm:table-cell">{entity === 'players' ? 'Team' : 'Games'}</th>
                <th className="py-2.5 pl-3 pr-4 md:pr-6 text-right">{category.unit}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const canDrillIn = entity === 'players' ? !!onSelectPlayer : !!onSelectTeam;
                const openDetail = () => {
                  if (entity === 'players') onSelectPlayer?.(row.ref as PlayerSeasonAverage);
                  else onSelectTeam?.(row.ref as TeamSeasonAverage);
                };
                const podium = i < 3;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-[color:var(--ch-border)] last:border-0 ${canDrillIn ? 'cursor-pointer' : ''}`}
                    onClick={canDrillIn ? openDetail : undefined}
                  >
                    <td className="py-2.5 pl-4 md:pl-6 pr-3">
                      <span
                        className="inline-flex w-6 h-6 rounded-md items-center justify-center text-[11px] font-bold tabular-nums"
                        style={i === 0
                          ? { backgroundColor: readableBrand.onWhite, color: '#fff' }
                          : podium
                            ? { backgroundColor: 'var(--ch-surface-3)', color: 'var(--ch-text)' }
                            : { color: 'var(--ch-muted)' }}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-[color:var(--ch-text)]">
                      {canDrillIn ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); openDetail(); }}
                          className="hover:underline underline-offset-2 text-left"
                          style={podium ? { color: readableBrand.body } : undefined}
                        >
                          {row.name}
                        </button>
                      ) : row.name}
                    </td>
                    <td className="py-2.5 pr-3 text-[color:var(--ch-text-2)] hidden sm:table-cell">{row.sub}</td>
                    <td className="py-2.5 pl-3 pr-4 md:pr-6">
                      <div className="flex items-center justify-end gap-3">
                        <div className="hidden md:block w-24 lg:w-32 h-1.5 rounded-full bg-[color:var(--ch-surface-3)] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.max((Math.abs(row.value) / maxAbs) * 100, 2)}%`, backgroundColor: podium ? readableBrand.accent : 'var(--ch-muted)', opacity: podium ? 1 : 0.5 }}
                          />
                        </div>
                        <span className="font-semibold tabular-nums min-w-[3.5rem] text-right text-[color:var(--ch-text)]">{formatValue(row.value)}</span>
                      </div>
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
