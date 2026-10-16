import { useEffect, useRef, useState } from 'react';
import { Search, Eye, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { buildLeagueSides } from '@shared/leagueSides';
import { clubDisplayName, teamClubKey } from '@shared/teamIdentity';
import { seasonLabel } from '@shared/season';

/**
 * Admin-only: open the Coaches Hub as any team's coach, to try the coach
 * experience (scouting reports included) on the live site before real coaches
 * use it. It sets the same "view as team" preview the dev server has; the
 * preview only changes what this browser shows. The server still checks the
 * admin's real login on every scouting build, so it unlocks nothing for
 * anyone else, and the control isn't rendered for non-admins at all.
 */

interface Entry {
  team_id: string;
  name: string;
  league_id: string;
  competition: string;
  season: string | null;
  createdAt: string;
}

/** One club, however many competitions and spellings it has: the search shows one row per club. */
interface Club {
  key: string;
  name: string;
  /** The entry to open: the club's newest competition, preferring the current season. */
  open: Entry;
  current: Entry[];
  earlier: Entry[];
}

const norm = (v: string) => v.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Season "2026/27" as competitions write it ("2026/27", "2026-27", "2026-2027"), reduced to its start year. */
function startYear(season: string | null): number | null {
  const m = /(\d{4})/.exec(season || '');
  return m ? Number(m[1]) : null;
}

export default function AdminTeamPicker({ teamName, leagueName }: { teamName?: string | null; leagueName?: string | null }) {
  const { isRealAdmin, viewingAsTeamId } = useAuth();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Club[]>([]);
  const [searching, setSearching] = useState(false);
  // Open by default: it is the way into the coach view, so it should not need finding.
  const [open, setOpen] = useState(true);
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
        .limit(200);
      const ids = Array.from(new Set((teams || []).map((t: any) => t.league_id).filter(Boolean)));
      const { data: comps } = ids.length
        ? await supabase.from('competitions').select('league_id, name, season, is_public, created_at, gender, parent_league_id').in('league_id', ids)
        : { data: [] as any[] };
      if (run !== latest.current) return;
      const byId = new Map((comps || []).map((c: any) => [c.league_id, c]));
      const sides = buildLeagueSides((comps || []) as any[]);
      const thisSeason = startYear(seasonLabel());

      const clubs = new Map<string, Club>();
      (teams || [])
        .map((t: any) => ({ t, c: byId.get(t.league_id) as any }))
        .filter(({ c }) => c && c.is_public)
        .map(({ t, c }): Entry => ({ team_id: t.team_id, name: t.name, league_id: t.league_id, competition: c.name, season: c.season ?? null, createdAt: String(c.created_at || '') }))
        // Newest first, so a club's first entry is its latest competition.
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .forEach((e) => {
          // A women's side is its own club, and "Senior Men I" / the odd typo is the same club as the plain name.
          const key = teamClubKey(sides.name(e.name, e.league_id));
          const club = clubs.get(key) ?? { key, name: clubDisplayName(e.name), open: e, current: [], earlier: [] };
          (startYear(e.season) === thisSeason ? club.current : club.earlier).push(e);
          clubs.set(key, club);
        });

      const nq = norm(q);
      const rank = (c: Club) => (norm(c.name).startsWith(nq) ? 0 : 1);
      setMatches(
        Array.from(clubs.values())
          // Prefer the current season's entry when opening the club.
          .map((c) => ({ ...c, open: c.current[0] ?? c.earlier[0] }))
          .sort((a, b) => rank(a) - rank(b) || Number(!!b.current.length) - Number(!!a.current.length) || a.name.localeCompare(b.name))
          .slice(0, 8),
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
              {matches.map((club) => (
                <li key={club.key}>
                  <button
                    type="button"
                    onClick={() => view(club.open.team_id)}
                    className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-white truncate">{club.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {club.current.map((e) => (
                          <span key={e.league_id} className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">{e.competition}</span>
                        ))}
                        {club.current.length === 0 && (
                          <span className="text-[11px] text-gray-500 dark:text-neutral-400">Not in a {seasonLabel()} competition yet</span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-neutral-400 text-right">
                      {club.current.length > 0 ? seasonLabel() : club.open.season ?? ''}
                      {club.earlier.length > 0 && <span className="block">{club.earlier.length} earlier {club.earlier.length === 1 ? 'competition' : 'competitions'}</span>}
                    </span>
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

/**
 * Admin-only, on a team's page: jump to that team's coach view. Finds the
 * team's id in whichever of the page's competitions holds it, and shows
 * nothing if it can't (or for anyone who isn't an admin).
 */
export function AdminCoachViewLink({ teamName, leagueIds, className = '' }: { teamName: string; leagueIds: Array<string | null | undefined>; className?: string }) {
  const { isRealAdmin } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const idsKey = leagueIds.filter(Boolean).join(',');

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (!isRealAdmin || !teamName || ids.length === 0) { setTeamId(null); return; }
    let cancelled = false;
    supabase
      .from('teams')
      .select('team_id')
      .in('league_id', ids)
      .eq('name', teamName)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setTeamId(data?.team_id ?? null); });
    return () => { cancelled = true; };
  }, [isRealAdmin, teamName, idsKey]);

  if (!isRealAdmin || !teamId) return null;
  return (
    <a
      href={`/coaches-hub?viewAsTeam=${encodeURIComponent(teamId)}`}
      className={className || 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs font-semibold'}
      title="Admin only: open the Coaches Hub as this team's coach"
    >
      <Eye className="h-3.5 w-3.5" />
      View as this team&apos;s coach
    </a>
  );
}
