import { useQuery } from "@tanstack/react-query";
import type { ScoutRoster } from "@shared/scoutRoster";
import type { ScoutWindow } from "@shared/coachNotes";

export interface ScoutSeason {
  /** "2026/27". */
  label: string;
  since: string;
  /** The view that was asked for, and how to say it ("last 5 games"). */
  window: ScoutWindow;
  windowLabel: string;
  /** False when the competition had no games this season (a past one), so only its own games were used. */
  wholeSeason: boolean;
  /** The club's games this season, across every competition. */
  games: number;
  competitions: Array<{ name: string; games: number }>;
}

export interface ScoutRosterResponse extends ScoutRoster {
  leagueName: string | null;
  season: ScoutSeason;
  logos: { opponent: string | null; forTeam: string | null };
}

/**
 * The opponent's roster and league-percentile profiles for the scouting report
 * (see server/scoutRoster.ts). Public box-score data, cached for a few minutes.
 */
export function useScoutRoster(leagueId: string, opponentName: string, forTeamName?: string | null, window: ScoutWindow = "season") {
  return useQuery<ScoutRosterResponse | null>({
    queryKey: ["scout-roster", leagueId, opponentName, forTeamName || "", window],
    queryFn: async () => {
      const qs = new URLSearchParams({ leagueId, opponent: opponentName });
      if (forTeamName) qs.set("forTeam", forTeamName);
      if (window !== "season") qs.set("window", window);
      const res = await fetch(`/api/scout-agent/roster?${qs}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!leagueId && !!opponentName,
    staleTime: 5 * 60_000,
  });
}
