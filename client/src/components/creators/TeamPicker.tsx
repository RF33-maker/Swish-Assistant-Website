import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, X } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { withoutSeason } from "@/lib/leagueKeys";
import { MEDIA_QUERY_KEY } from "@/lib/mediaSpotlight";
import { addCreatorTeam, removeCreatorTeam, updateCreatorTeam, useCompetitionIndex, useCreatorTeams, type CreatorTeam } from "@/lib/creatorSpace";
import { clubDisplayName, sideName, teamClubKey } from "@shared/teamIdentity";

interface TeamChoice { name: string; leagueId: string; compName: string; women: boolean }

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

const ROLES = ["Club photographer", "Club videographer", "Club media", "Freelance", "Volunteer"];

/**
 * The teams a creator works with, picked from the real teams on Swish so
 * their badge shows and their fixtures line up. A team that isn't on Swish
 * can still be typed in.
 */
export default function TeamPicker({ photographerId }: { photographerId: string }) {
  const queryClient = useQueryClient();
  const { data: teams = [], isLoading } = useCreatorTeams(photographerId);
  const { data: comps } = useCompetitionIndex();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const [busy, setBusy] = useState<string | null>(null);

  const search = useQuery({
    queryKey: ["creator-team-search", query],
    enabled: query.length >= 2 && !!comps,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<TeamChoice[]> => {
      const { data, error } = await supabase.from("teams").select("name, league_id, created_at").ilike("name", `%${query}%`).order("created_at", { ascending: false }).limit(150);
      if (error) throw new Error(error.message);
      // One row per club side; the newest public competition it plays in names it.
      const out = new Map<string, TeamChoice>();
      for (const r of data ?? []) {
        const c = comps!.get(r.league_id);
        if (!c) continue;
        const k = teamClubKey(sideName(r.name, c.women ? "Women" : null));
        if (!out.has(k)) out.set(k, { name: r.name, leagueId: r.league_id, compName: c.name, women: c.women });
      }
      return Array.from(out.values()).slice(0, 12);
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
      await refresh();
    } catch (err: any) {
      toast({ title: "Couldn't save that", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const has = (name: string) => teams.some((t) => t.team_name.toLowerCase() === name.toLowerCase());
  const add = (team: { team_name: string; league_id: string | null }) =>
    run(`add:${team.team_name}`, async () => {
      await addCreatorTeam(photographerId, team, teams.length);
      setQ("");
    });

  const results = useMemo(() => (search.data ?? []).filter((t) => !has(t.name)), [search.data, teams]); // eslint-disable-line react-hooks/exhaustive-deps
  const typed = query.length >= 2 && !search.isFetching && !has(query) && !(search.data ?? []).some((t) => clubDisplayName(t.name).toLowerCase() === query.toLowerCase());

  return (
    <div>
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-[color:var(--ch-muted)]" />
      ) : (
        teams.length > 0 && (
          <ul className="mb-3 divide-y divide-[color:var(--ch-border)] border-y border-[color:var(--ch-border)]">
            {teams.map((t) => (
              <TeamRow key={t.id} team={t} busy={busy === `rm:${t.id}`} onRemove={() => run(`rm:${t.id}`, () => removeCreatorTeam(t.id))} onRole={(role) => run(`role:${t.id}`, () => updateCreatorTeam(t.id, { role }))} />
            ))}
          </ul>
        )
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ch-muted)]" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="ch-input h-10 w-full pl-9 pr-3 text-[16px] sm:text-[14px]"
          placeholder={teams.length ? "Add another team" : "Search for a team you work with"}
          aria-label="Search for a team"
          data-testid="creator-team-search"
        />
      </div>
      {query.length >= 2 && (
        <ul className="mt-1 divide-y divide-[color:var(--ch-border)]">
          {search.isFetching && !search.data && <li className="py-2.5"><Loader2 className="h-4 w-4 animate-spin text-[color:var(--ch-muted)]" /></li>}
          {results.map((t) => (
            <li key={`${t.name}|${t.leagueId}`}>
              <button type="button" disabled={!!busy} onClick={() => add({ team_name: t.name, league_id: t.leagueId })} className="flex w-full items-center gap-3 py-2.5 text-left">
                <TeamLogo teamName={t.name} leagueId={t.leagueId} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-[color:var(--ch-text)]">{clubDisplayName(sideName(t.name, t.women ? "Women" : null))}</span>
                  <span className="block truncate text-[12px] text-[color:var(--ch-muted)]">{withoutSeason(t.compName)}</span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-[color:var(--ch-accent)]" aria-hidden="true" />
              </button>
            </li>
          ))}
          {typed && (
            <li>
              <button type="button" disabled={!!busy} onClick={() => add({ team_name: query, league_id: null })} className="flex w-full items-center gap-3 py-2.5 text-left text-[14px] text-[color:var(--ch-text-2)]">
                <Plus className="h-4 w-4 shrink-0 text-[color:var(--ch-accent)]" aria-hidden="true" />
                <span>Add "<span className="font-semibold text-[color:var(--ch-text)]">{query}</span>" as typed <span className="text-[color:var(--ch-muted)]">(not on Swish yet, so no fixtures)</span></span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function TeamRow({ team, busy, onRemove, onRole }: { team: CreatorTeam; busy: boolean; onRemove: () => void; onRole: (role: string | null) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      {team.league_id ? <TeamLogo teamName={team.team_name} leagueId={team.league_id} size={28} /> : <span className="h-7 w-7 shrink-0 rounded-full bg-[color:var(--ch-surface-3)]" aria-hidden="true" />}
      <span className="min-w-0 flex-1 text-[14px] font-semibold text-[color:var(--ch-text)]">{clubDisplayName(team.team_name)}</span>
      <select
        aria-label={`Your role at ${clubDisplayName(team.team_name)}`}
        value={team.role ?? ""}
        onChange={(e) => onRole(e.target.value || null)}
        className="ch-input order-last h-10 w-full px-2 text-[16px] sm:order-none sm:h-9 sm:w-auto sm:max-w-[11rem] sm:text-[13px]"
      >
        <option value="">Role (optional)</option>
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        {team.role && !ROLES.includes(team.role) && <option value={team.role}>{team.role}</option>}
      </select>
      <button type="button" onClick={onRemove} disabled={busy} aria-label={`Remove ${clubDisplayName(team.team_name)}`} className="p-1.5 text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text)]">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
      </button>
    </li>
  );
}
