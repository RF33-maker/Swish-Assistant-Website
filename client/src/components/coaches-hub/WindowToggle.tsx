import { History } from 'lucide-react';
import { WINDOWS, type ScoutWindow } from '@shared/coachNotes';

/**
 * Last 3 / Last 5 / Season for the scouting report: which of the opponent's
 * games the game plan, roster and player percentiles are read over. Recent form
 * is what a coach often wants (a team that has changed since September); the
 * whole season is the biggest sample.
 */
export default function WindowToggle({ value, onChange, color, games }: { value: ScoutWindow; onChange: (w: ScoutWindow) => void; color: string; games?: number | null }) {
  return (
    <div className="ch-card px-4 py-3 md:px-5 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4" aria-label="Games to scout">
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--sr-tint, var(--ch-surface-3))', color: `var(--sr-ink, ${color})` }}>
          <History className="w-4 h-4" />
        </span>
        <span className="text-sm font-semibold whitespace-nowrap text-slate-900 dark:text-white">Games to scout</span>
      </div>
      <div role="radiogroup" aria-label="Games to scout" className="inline-flex shrink-0 rounded-[10px] bg-[color:var(--ch-surface-3)] border border-[color:var(--ch-border)] p-0.5 self-start">
        {WINDOWS.map((w) => {
          const on = value === w.key;
          return (
            <button
              key={w.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(w.key)}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors ${on ? 'shadow-sm' : 'text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]'}`}
              style={on ? { backgroundColor: `var(--sr-brand, ${color})`, color: 'var(--sr-on, #fff)' } : undefined}
            >
              {w.label}
            </button>
          );
        })}
      </div>
      <p className="text-[12.5px] text-[color:var(--ch-muted)] sm:ml-auto">
        {value === 'season'
          ? 'The whole season, across every competition. The biggest sample.'
          : `Each club's newest ${value === 'last3' ? 3 : 5} games${games != null && games < (value === 'last3' ? 3 : 5) ? `; only ${games} played so far` : ''}. Shows recent form, on a smaller sample.`}
      </p>
    </div>
  );
}
