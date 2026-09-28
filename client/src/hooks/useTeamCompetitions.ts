import { useQuery } from "@tanstack/react-query";
import type { RecordMaxes } from "@/lib/recordMaxes";

export interface TeamCompetitionGame {
  game_key: string;
  date: string;
  opponent: string;
  isHome: boolean;
  totalPoints: number;
  opponentScore?: number;
  isWin?: boolean;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tpm: number;
}

export interface TeamCompetition {
  league_id: string;
  name: string;
  slug: string;
  season: string | null;
  teamName: string;
  wins: number;
  losses: number;
  lastPlayed: string;
  games: TeamCompetitionGame[];
  recordMaxes: RecordMaxes;
}

// Every competition this club has played in, newest first — matched on club
// identity server-side, since each competition gives the club its own
// team_id (and often its own spelling of the name).
export function useTeamCompetitions(teamName: string | null | undefined) {
  return useQuery<TeamCompetition[]>({
    queryKey: ["team-competitions", teamName],
    queryFn: async () => {
      const response = await fetch(`/api/public/team-competitions?team=${encodeURIComponent(teamName || "")}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!teamName,
    staleTime: 60_000,
  });
}
