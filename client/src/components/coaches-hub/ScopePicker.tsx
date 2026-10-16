import { Layers } from 'lucide-react';
import type { ScoutScope } from '@shared/scoutScope';
import type { ScopeOptions } from '@/hooks/useScoutScope';

/**
 * Which season the scout reads and which of the opponent's competitions count in it. Everything
 * is counted by default (league, cup, trophy together, the biggest sample); a coach can untick
 * a competition, for example a cup where the opponent rests its starters.
 */
export default function ScopePicker({ options, value, onChange, color }: {
  options: ScopeOptions;
  value: ScoutScope;
  onChange: (scope: ScoutScope) => void;
  color: string;
}) {
  const season = value.season ?? options.current;
  // The current season is always on offer, even before the opponent has played in it.
  const labels = Array.from(new Set([options.current, ...options.seasons.map((s) => s.season)])).sort().reverse();
  const competitions = options.seasons.find((s) => s.season === season)?.competitions ?? [];
  if (labels.length < 2 && competitions.length < 2) return null;

  const excluded = new Set(value.exclude);
  const counted = competitions.filter((c) => !excluded.has(c.leagueId));
  const games = counted.reduce((n, c) => n + c.games, 0);

  const toggle = (leagueId: string) => {
    const next = new Set(excluded);
    if (next.has(leagueId)) next.delete(leagueId); else next.add(leagueId);
    onChange({ ...value, exclude: Array.from(next).sort() });
  };

  return (
    <div className="ch-card px-4 py-3 md:px-5 space-y-3" aria-label="Competitions to scout">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--sr-tint, var(--ch-surface-3))', color: `var(--sr-ink, ${color})` }}>
            <Layers className="w-4 h-4" />
          </span>
          <span className="text-sm font-semibold whitespace-nowrap text-slate-900 dark:text-white">Competitions to scout</span>
        </div>
        {labels.length > 1 && (
          <select
            aria-label="Season"
            value={season}
            onChange={(e) => onChange({ season: e.target.value === options.current ? null : e.target.value, exclude: [] })}
            className="h-9 rounded-lg border border-[color:var(--ch-border)] bg-transparent px-2.5 text-[13px] font-semibold self-start"
          >
            {labels.map((l) => <option key={l} value={l}>{l}{l === options.current ? ' (this season)' : ''}</option>)}
          </select>
        )}
        <p className="text-[12.5px] text-[color:var(--ch-muted)] sm:ml-auto">
          {competitions.length === 0
            ? `No games recorded in ${season}.`
            : counted.length === 0
              ? 'Nothing is ticked, so there is nothing to scout.'
              : excluded.size === 0
                ? `Every competition counted: ${games} ${games === 1 ? 'game' : 'games'}.`
                : `${counted.length} of ${competitions.length} competitions counted: ${games} ${games === 1 ? 'game' : 'games'}.`}
        </p>
      </div>
      {competitions.length > 1 && (
        <ul className="flex flex-wrap gap-2">
          {competitions.map((c) => {
            const on = !excluded.has(c.leagueId);
            return (
              <li key={c.leagueId}>
                <label
                  className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-[13px] cursor-pointer select-none transition-colors ${on ? 'border-transparent font-semibold' : 'border-[color:var(--ch-border)] text-[color:var(--ch-muted)] line-through'}`}
                  style={on ? { backgroundColor: 'var(--sr-tint, var(--ch-surface-3))', color: `var(--sr-ink, ${color})` } : undefined}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(c.leagueId)} className="accent-current" />
                  {c.name}
                  <span className="tabular-nums opacity-70">{c.games}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
