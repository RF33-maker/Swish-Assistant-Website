import { useQuery } from "@tanstack/react-query";
import type { ScoutRoster } from "@shared/scoutRoster";

export interface ScoutRosterResponse extends ScoutRoster {
  leagueName: string | null;
  logos: { opponent: string | null; forTeam: string | null };
}

/**
 * The opponent's roster and league-percentile profiles for the scouting report
 * (see server/scoutRoster.ts). Public box-score data, cached for a few minutes.
 */
export function useScoutRoster(leagueId: string, opponentName: string, forTeamName?: string | null) {
  return useQuery<ScoutRosterResponse | null>({
    queryKey: ["scout-roster", leagueId, opponentName, forTeamName || ""],
    queryFn: async () => {
      const qs = new URLSearchParams({ leagueId, opponent: opponentName });
      if (forTeamName) qs.set("forTeam", forTeamName);
      const res = await fetch(`/api/scout-agent/roster?${qs}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!leagueId && !!opponentName,
    staleTime: 5 * 60_000,
  });
}
