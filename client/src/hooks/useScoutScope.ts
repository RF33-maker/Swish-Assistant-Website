import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ScopeCompetition { leagueId: string; name: string; games: number }
export interface ScopeSeason { season: string; competitions: ScopeCompetition[] }
export interface ScopeOptions { current: string; seasons: ScopeSeason[] }

/**
 * The seasons an opponent has played in and the competitions in each, for choosing what a
 * scout counts (see /api/scout-agent/scope). Needs a signed-in coach or admin.
 */
export function useScoutScope(leagueId: string, opponentName: string, enabled = true) {
  return useQuery<ScopeOptions | null>({
    queryKey: ["scout-scope", leagueId, opponentName],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;
      const res = await fetch(`/api/scout-agent/scope?${new URLSearchParams({ leagueId, opponent: opponentName })}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      return res.ok ? res.json() : null;
    },
    enabled: enabled && !!leagueId && !!opponentName,
    staleTime: 10 * 60_000,
  });
}
