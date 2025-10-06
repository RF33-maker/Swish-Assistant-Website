import { useState } from "react";
import { TeamLogo } from "./TeamLogo";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

interface TournamentBracketProps {
  leagueId: string;
  onGameClick: (gameId: string) => void;
}

interface Game {
  game_key: string;
  matchtime: string;
  hometeam: string;
  awayteam: string;
  homeScore?: number;
  awayScore?: number;
  numeric_id?: string;
}

interface BracketGame {
  team1: string;
  team2: string;
  team1Score?: number;
  team2Score?: number;
  winner?: string;
  gameKey: string;
  date: string;
}

export function TournamentBracket({ leagueId, onGameClick }: TournamentBracketProps) {
  const { data: gamesData, isLoading } = useQuery({
    queryKey: [`/api/bracket-games/${leagueId}`],
    queryFn: async () => {
      // Fetch games from game_schedule
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('game_schedule')
        .select('*')
        .eq('league_id', leagueId)
        .order('matchtime', { ascending: true });

      if (scheduleError) throw scheduleError;

      // Fetch team_stats to get scores
      const { data: teamStats, error: statsError } = await supabase
        .from('team_stats')
        .select('*')
        .eq('league_id', leagueId);

      if (statsError) throw statsError;

      // Create a map of game scores by numeric_id
      const scoresMap = new Map<string, Array<{ team: string; score: number }>>();
      teamStats?.forEach(stat => {
        if (stat.numeric_id && stat.name) {
          if (!scoresMap.has(stat.numeric_id)) {
            scoresMap.set(stat.numeric_id, []);
          }
          scoresMap.get(stat.numeric_id)!.push({
            team: stat.name,
            score: stat.tot_spoints || 0
          });
        }
      });

      // Process games with scores
      const games: Game[] = (scheduleData || []).map(game => {
        // Find scores by matching team names
        let homeScore: number | undefined;
        let awayScore: number | undefined;
        let numericId: string | undefined;

        // Search for matching numeric_id
        scoresMap.forEach((teams, id) => {
          const hasHome = teams.some((t: { team: string; score: number }) => t.team === game.hometeam);
          const hasAway = teams.some((t: { team: string; score: number }) => t.team === game.awayteam);
          
          if (hasHome && hasAway) {
            numericId = id;
            homeScore = teams.find((t: { team: string; score: number }) => t.team === game.hometeam)?.score;
            awayScore = teams.find((t: { team: string; score: number }) => t.team === game.awayteam)?.score;
          }
        });

        return {
          game_key: game.game_key || `${game.hometeam}-vs-${game.awayteam}`,
          matchtime: game.matchtime,
          hometeam: game.hometeam,
          awayteam: game.awayteam,
          homeScore,
          awayScore,
          numeric_id: numericId
        };
      });

      return games;
    },
    enabled: !!leagueId
  });

  // Organize games into rounds based on dates
  const organizeRounds = (games: Game[]): { qf: BracketGame[]; sf: BracketGame[]; final: BracketGame[] } => {
    if (!games || games.length === 0) {
      return { qf: [], sf: [], final: [] };
    }

    // Sort by date
    const sorted = [...games].sort((a, b) => 
      new Date(a.matchtime).getTime() - new Date(b.matchtime).getTime()
    );

    const createBracketGame = (game: Game): BracketGame => {
      let winner: string | undefined;
      if (game.homeScore !== undefined && game.awayScore !== undefined) {
        winner = game.homeScore > game.awayScore ? game.hometeam : game.awayteam;
      }

      return {
        team1: game.hometeam,
        team2: game.awayteam,
        team1Score: game.homeScore,
        team2Score: game.awayScore,
        winner,
        gameKey: game.numeric_id || game.game_key,
        date: game.matchtime
      };
    };

    // QF = first 4 games, SF = next 2 games, Final = last game
    const qf = sorted.slice(0, 4).map(createBracketGame);
    const sf = sorted.slice(4, 6).map(createBracketGame);
    const final = sorted.length > 6 ? [createBracketGame(sorted[6])] : [];

    return { qf, sf, final };
  };

  const rounds = gamesData ? organizeRounds(gamesData) : { qf: [], sf: [], final: [] };

  const MatchupCard = ({ game, showConnector = false }: { game: BracketGame | null; showConnector?: boolean }) => {
    if (!game) {
      return (
        <div className="bg-gray-100 rounded-lg p-3 border-2 border-gray-200 min-w-[200px]">
          <div className="text-center text-gray-400 text-sm font-medium">TBD</div>
        </div>
      );
    }

    const isTeam1Winner = game.winner === game.team1;
    const isTeam2Winner = game.winner === game.team2;

    return (
      <div className="relative">
        <div 
          className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden cursor-pointer hover:border-orange-500 transition-colors min-w-[200px]"
          onClick={() => game.gameKey && onGameClick(game.gameKey)}
          data-testid={`matchup-${game.gameKey}`}
        >
          {/* Team 1 */}
          <div className={`flex items-center gap-2 p-2 border-b ${isTeam1Winner ? 'bg-orange-50' : 'bg-white'}`}>
            <TeamLogo teamName={game.team1} leagueId={leagueId} size="sm" />
            <span className={`flex-1 text-sm ${isTeam1Winner ? 'font-bold text-orange-700' : 'text-gray-700'}`}>
              {game.team1}
            </span>
            {game.team1Score !== undefined && (
              <span className={`text-lg font-bold ${isTeam1Winner ? 'text-orange-700' : 'text-gray-600'}`}>
                {game.team1Score}
              </span>
            )}
          </div>

          {/* Team 2 */}
          <div className={`flex items-center gap-2 p-2 ${isTeam2Winner ? 'bg-orange-50' : 'bg-white'}`}>
            <TeamLogo teamName={game.team2} leagueId={leagueId} size="sm" />
            <span className={`flex-1 text-sm ${isTeam2Winner ? 'font-bold text-orange-700' : 'text-gray-700'}`}>
              {game.team2}
            </span>
            {game.team2Score !== undefined && (
              <span className={`text-lg font-bold ${isTeam2Winner ? 'text-orange-700' : 'text-gray-600'}`}>
                {game.team2Score}
              </span>
            )}
          </div>
        </div>

        {/* Connector line to next round */}
        {showConnector && game.winner && (
          <div className="absolute top-1/2 -right-6 w-6 h-0.5 bg-orange-400 transform -translate-y-1/2 hidden md:block"></div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading bracket...</p>
      </div>
    );
  }

  if (rounds.qf.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl shadow p-6">
        <p className="text-gray-500">No tournament games available yet.</p>
        <p className="text-sm text-gray-400 mt-2">Games starting October 4th will appear here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow p-6 overflow-x-auto">
      <div className="flex gap-8 md:gap-12 min-w-max pb-4">
        {/* Quarterfinals */}
        <div className="flex flex-col gap-4">
          <h3 className="text-center font-bold text-gray-700 mb-2">Quarterfinals</h3>
          <div className="flex flex-col gap-8">
            {rounds.qf.slice(0, 2).map((game, idx) => (
              <MatchupCard key={`qf-top-${idx}`} game={game} showConnector={game.winner !== undefined} />
            ))}
          </div>
          <div className="my-8"></div>
          <div className="flex flex-col gap-8">
            {rounds.qf.slice(2, 4).map((game, idx) => (
              <MatchupCard key={`qf-bottom-${idx}`} game={game} showConnector={game.winner !== undefined} />
            ))}
          </div>
        </div>

        {/* Semifinals */}
        <div className="flex flex-col gap-4">
          <h3 className="text-center font-bold text-gray-700 mb-2">Semifinals</h3>
          <div className="flex flex-col justify-around h-full gap-8" style={{ paddingTop: '4rem' }}>
            <MatchupCard game={rounds.sf[0] || null} showConnector={rounds.sf[0]?.winner !== undefined} />
            <div className="my-16"></div>
            <MatchupCard game={rounds.sf[1] || null} showConnector={rounds.sf[1]?.winner !== undefined} />
          </div>
        </div>

        {/* Final */}
        <div className="flex flex-col gap-4">
          <h3 className="text-center font-bold text-gray-700 mb-2">Final</h3>
          <div className="flex items-center h-full">
            <MatchupCard game={rounds.final[0] || null} />
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        Click on any matchup to view detailed box score
      </div>
    </div>
  );
}
