import { useEffect, useRef, useState } from 'react';
import { Search, Eye, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

/**
 * Admin-only: open the Coaches Hub as any team's coach, to try the coach
 * experience (scouting reports included) on the live site before real coaches
 * use it. It sets the same "view as team" preview the dev server has; the
 * preview only changes what this browser shows. The server still checks the
 * admin's real login on every scouting build, so it unlocks nothing for
 * anyone else, and the control isn't rendered for non-admins at all.
 */

interface Match {
  team_id: string;
  name: string;
  league_id: string;
  competition: string;
  season: string | null;
}

export default function AdminTeamPicker({ teamName, leagueName }: { teamName?: string | null; leagueName?: string | null }) {
  const { isRealAdmin, viewingAsTeamId } = useAuth();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!isRealAdmin || q.length < 2) { setMatches([]); return; }
    const run = ++latest.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data: teams } = await supabase
        .from('teams')
        .select('team_id, name, league_id')
        .ilike('name', `%${q.replace(/[%_,]/g, '')}%`)
        .limit(40);
      const ids = Array.from(new Set((teams || []).map((t: any) => t.league_id).filter(Boolean)));
      const { data: comps } = ids.length
        ? await supabase.from('competitions').select('league_id, name, season, is_public').in('league_id', ids)
        : { data: [] as any[] };
      if (run !== latest.current) return;
      const byId = new Map((comps || []).map((c: any) => [c.league_id, c]));
      setMatches(
        (teams || [])
          .map((t: any) => ({ t, c: byId.get(t.league_id) as any }))
          .filter(({ c }) => c && c.is_public)
          .map(({ t, c }) => ({ team_id: t.team_id, name: t.name, league_id: t.league_id, competition: c.name, season: c.season ?? null }))
          .sort((a, b) => a.name.localeCompare(b.name) || a.competition.localeCompare(b.competition))
          .slice(0, 12),
      );
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, isRealAdmin]);

  if (!isRealAdmin) return null;

  const view = (teamId: string) => {
    window.location.assign(`/coaches-hub?viewAsTeam=${encodeURIComponent(teamId)}`);
  };

  return (
    <section className="ch-card mb-5 md:mb-6 overflow-hidden" aria-label="Admin preview">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open || !!viewingAsTeamId}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 md:px-5 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 shrink-0 text-amber-500" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            Admin preview
            {viewingAsTeamId && teamName ? `: viewing as ${teamName}${leagueName ? ` (${leagueName})` : ''}` : ': see the Coaches Hub as any team’s coach'}
          </span>
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-neutral-400 shrink-0">Only you can see this</span>
      </button>

      {(open || viewingAsTeamId) && (
        <div className="px-4 pb-4 md:px-5 border-t border-[color:var(--ch-border)] pt-3 space-y-3">
          <p className="text-[13px] text-gray-600 dark:text-neutral-400">
            Search a team, in any league, to open the hub as its coach. You get the coach view, including the next-game scout report. Scouting plans are built and paid for under your admin login, and the preview does not change anything for real coaches.
          </p>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="admin-team-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a team, for example Valur"
              className="w-full h-10 pl-9 pr-9 rounded-lg border border-[color:var(--ch-border)] bg-transparent text-sm"
              autoComplete="off"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700" aria-label="Clear search">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {query.trim().length >= 2 && (
            <ul className="divide-y divide-[color:var(--ch-border)] rounded-lg border border-[color:var(--ch-border)] overflow-hidden">
              {matches.map((m) => (
                <li key={m.team_id}>
                  <button
                    type="button"
                    onClick={() => view(m.team_id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <span className="font-medium text-slate-900 dark:text-white truncate">{m.name}</span>
                    <span className="text-xs text-gray-500 dark:text-neutral-400 truncate">{m.competition}{m.season ? ` · ${m.season}` : ''}</span>
                  </button>
                </li>
              ))}
              {!searching && matches.length === 0 && (
                <li className="px-3 py-3 text-sm text-gray-500 dark:text-neutral-400">No public team matches “{query.trim()}”.</li>
              )}
              {searching && matches.length === 0 && <li className="px-3 py-3 text-sm text-gray-500 dark:text-neutral-400">Searching…</li>}
            </ul>
          )}
          {viewingAsTeamId && (
            <a href="/coaches-hub?viewAsTeam=off" className="inline-block text-sm font-semibold text-amber-600 hover:text-amber-700">
              Exit preview and return to my admin view
            </a>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Admin-only, inside the coach preview: open the scouting report for any
 * opponent in the league, not just the next fixture. Names come from the
 * league's own team list, so the report uses the same spelling as the data.
 */
export function AdminOpponentPicker({ opponents, onOpen }: { opponents: string[]; onOpen: (opponentName: string) => void }) {
  const { isRealAdmin } = useAuth();
  const [choice, setChoice] = useState('');
  if (!isRealAdmin || opponents.length === 0) return null;
  return (
    <section className="ch-card mb-5 md:mb-6 px-4 py-3 md:px-5 flex flex-col sm:flex-row sm:items-center gap-3" aria-label="Admin scouting">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="w-4 h-4 shrink-0 text-amber-500" />
        <span className="text-sm font-semibold text-slate-900 dark:text-white">Scout any opponent</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-neutral-400">Admin only</span>
      </div>
      <div className="flex flex-1 gap-2 min-w-0">
        <select
          id="admin-opponent-select"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="flex-1 min-w-0 h-10 rounded-lg border border-[color:var(--ch-border)] bg-transparent px-3 text-sm"
        >
          <option value="">Choose an opponent…</option>
          {opponents.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <button
          type="button"
          disabled={!choice}
          onClick={() => choice && onOpen(choice)}
          className="h-10 px-4 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-sm font-semibold disabled:opacity-40"
        >
          Open report
        </button>
      </div>
    </section>
  );
}
