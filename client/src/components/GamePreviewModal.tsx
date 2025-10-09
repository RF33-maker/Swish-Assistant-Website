import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "@/components/TeamLogo";

interface GamePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: {
    team1: string;
    team2: string;
    game_date: string;
    kickoff_time?: string;
    venue?: string;
  };
  leagueId: number;
}

interface GameResult {
  numericId: string;
  won: boolean;
  teamScore: number;
  opponentScore: number;
}

export default function GamePreviewModal({ isOpen, onClose, game, leagueId }: GamePreviewModalProps) {
  // Fetch game results for team1 (last 5 games with W/L)
  const { data: team1GameResults } = useQuery({
    queryKey: ['game-results', leagueId, game.team1],
    queryFn: async () => {
      const { data: teamGames, error } = await supabase
        .from('team_stats')
        .select('numeric_id, tot_spoints, name')
        .eq('league_id', leagueId)
        .eq('name', game.team1)
        .order('numeric_id', { ascending: false });
      
      if (error) throw error;
      if (!teamGames) return [];

      const results: GameResult[] = [];
      const processedGames = new Set<string>();

      for (const teamGame of teamGames) {
        if (!teamGame.numeric_id || processedGames.has(teamGame.numeric_id)) continue;
        
        const { data: opponentData, error: oppError } = await supabase
          .from('team_stats')
          .select('tot_spoints, name')
          .eq('league_id', leagueId)
          .eq('numeric_id', teamGame.numeric_id)
          .neq('name', game.team1)
          .single();

        if (!oppError && opponentData) {
          results.push({
            numericId: teamGame.numeric_id,
            won: (teamGame.tot_spoints || 0) > (opponentData.tot_spoints || 0),
            teamScore: teamGame.tot_spoints || 0,
            opponentScore: opponentData.tot_spoints || 0
          });
          processedGames.add(teamGame.numeric_id);
        }

        if (results.length >= 5) break;
      }

      return results;
    },
    enabled: isOpen
  });

  // Fetch game results for team2 (last 5 games with W/L)
  const { data: team2GameResults } = useQuery({
    queryKey: ['game-results', leagueId, game.team2],
    queryFn: async () => {
      const { data: teamGames, error } = await supabase
        .from('team_stats')
        .select('numeric_id, tot_spoints, name')
        .eq('league_id', leagueId)
        .eq('name', game.team2)
        .order('numeric_id', { ascending: false });
      
      if (error) throw error;
      if (!teamGames) return [];

      const results: GameResult[] = [];
      const processedGames = new Set<string>();

      for (const teamGame of teamGames) {
        if (!teamGame.numeric_id || processedGames.has(teamGame.numeric_id)) continue;
        
        const { data: opponentData, error: oppError } = await supabase
          .from('team_stats')
          .select('tot_spoints, name')
          .eq('league_id', leagueId)
          .eq('numeric_id', teamGame.numeric_id)
          .neq('name', game.team2)
          .single();

        if (!oppError && opponentData) {
          results.push({
            numericId: teamGame.numeric_id,
            won: (teamGame.tot_spoints || 0) > (opponentData.tot_spoints || 0),
            teamScore: teamGame.tot_spoints || 0,
            opponentScore: opponentData.tot_spoints || 0
          });
          processedGames.add(teamGame.numeric_id);
        }

        if (results.length >= 5) break;
      }

      return results;
    },
    enabled: isOpen
  });

  // Calculate team records
  const team1Record = team1GameResults 
    ? `${team1GameResults.filter(g => g.won).length}-${team1GameResults.filter(g => !g.won).length}`
    : '0-0';
  
  const team2Record = team2GameResults 
    ? `${team2GameResults.filter(g => g.won).length}-${team2GameResults.filter(g => !g.won).length}`
    : '0-0';

  // Fetch roster for team1
  const { data: team1Roster } = useQuery({
    queryKey: ['roster', leagueId, game.team1],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_stats')
        .select('firstname, familyname, spoints, sreboundstotal, sassists')
        .eq('league_id', leagueId)
        .eq('team', game.team1);
      
      if (error) throw error;
      
      const playerMap = new Map();
      data?.forEach(stat => {
        const name = `${stat.firstname || ''} ${stat.familyname || ''}`.trim();
        if (!playerMap.has(name)) {
          playerMap.set(name, {
            name,
            games: 0,
            points: 0,
            rebounds: 0,
            assists: 0
          });
        }
        const player = playerMap.get(name);
        player.games += 1;
        player.points += stat.spoints || 0;
        player.rebounds += stat.sreboundstotal || 0;
        player.assists += stat.sassists || 0;
      });

      return Array.from(playerMap.values())
        .map(p => ({
          ...p,
          ppg: p.games > 0 ? (p.points / p.games).toFixed(1) : '0.0',
          rpg: p.games > 0 ? (p.rebounds / p.games).toFixed(1) : '0.0',
          apg: p.games > 0 ? (p.assists / p.games).toFixed(1) : '0.0'
        }))
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg));
    },
    enabled: isOpen
  });

  // Fetch roster for team2
  const { data: team2Roster } = useQuery({
    queryKey: ['roster', leagueId, game.team2],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_stats')
        .select('firstname, familyname, spoints, sreboundstotal, sassists')
        .eq('league_id', leagueId)
        .eq('team', game.team2);
      
      if (error) throw error;
      
      const playerMap = new Map();
      data?.forEach(stat => {
        const name = `${stat.firstname || ''} ${stat.familyname || ''}`.trim();
        if (!playerMap.has(name)) {
          playerMap.set(name, {
            name,
            games: 0,
            points: 0,
            rebounds: 0,
            assists: 0
          });
        }
        const player = playerMap.get(name);
        player.games += 1;
        player.points += stat.spoints || 0;
        player.rebounds += stat.sreboundstotal || 0;
        player.assists += stat.sassists || 0;
      });

      return Array.from(playerMap.values())
        .map(p => ({
          ...p,
          ppg: p.games > 0 ? (p.points / p.games).toFixed(1) : '0.0',
          rpg: p.games > 0 ? (p.rebounds / p.games).toFixed(1) : '0.0',
          apg: p.games > 0 ? (p.assists / p.games).toFixed(1) : '0.0'
        }))
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg));
    },
    enabled: isOpen
  });

  const team1Top3 = team1Roster?.slice(0, 3) || [];
  const team1FullRoster = team1Roster?.slice(3) || [];
  const team2Top3 = team2Roster?.slice(0, 3) || [];
  const team2FullRoster = team2Roster?.slice(3) || [];

  // Debug logging
  if (isOpen) {
    console.log('🎮 Game Preview Modal opened for:', game.team1, 'vs', game.team2);
    console.log('📊 Team1 roster data:', team1Roster);
    console.log('📊 Team2 roster data:', team2Roster);
    console.log('🏀 Team1 game results:', team1GameResults);
    console.log('🏀 Team2 game results:', team2GameResults);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-orange-200 pb-4">
          <DialogTitle className="text-xl md:text-2xl font-bold text-slate-800">Game Preview</DialogTitle>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-orange-100 transition-colors"
            data-testid="close-preview-modal"
          >
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </DialogHeader>

        <div className="space-y-6">
          {/* Matchup Header */}
          <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-4 md:p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Team 1 */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <TeamLogo teamName={game.team1} leagueId={String(leagueId)} size="lg" />
                <div className="text-center">
                  <h3 className="text-lg md:text-xl font-bold text-slate-800">{game.team1}</h3>
                  <p className="text-sm text-slate-600">{team1Record}</p>
                </div>
              </div>
              
              {/* VS and Date/Time */}
              <div className="text-center px-4 md:px-8">
                <div className="text-2xl md:text-3xl font-bold text-orange-600">VS</div>
                <div className="text-xs md:text-sm text-slate-600 mt-2">
                  {new Date(game.game_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
                {game.kickoff_time && (
                  <div className="text-xs md:text-sm text-slate-600">{game.kickoff_time}</div>
                )}
                {game.venue && (
                  <div className="text-xs text-slate-500 mt-1">{game.venue}</div>
                )}
              </div>

              {/* Team 2 */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <TeamLogo teamName={game.team2} leagueId={String(leagueId)} size="lg" />
                <div className="text-center">
                  <h3 className="text-lg md:text-xl font-bold text-slate-800">{game.team2}</h3>
                  <p className="text-sm text-slate-600">{team2Record}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Form - Last 5 Games */}
          <div className="space-y-4">
            <div>
              <h4 className="text-base md:text-lg font-semibold text-slate-800 mb-3">
                {game.team1} - Last 5 Games
              </h4>
              {team1GameResults && team1GameResults.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {team1GameResults.map((result, idx) => (
                    <div 
                      key={idx} 
                      className={`px-4 py-2 rounded-lg font-bold text-white ${
                        result.won ? 'bg-green-500' : 'bg-red-500'
                      }`}
                      data-testid={`team1-game-${idx}`}
                    >
                      {result.won ? 'W' : 'L'}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No recent games available</p>
              )}
            </div>

            <div>
              <h4 className="text-base md:text-lg font-semibold text-slate-800 mb-3">
                {game.team2} - Last 5 Games
              </h4>
              {team2GameResults && team2GameResults.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {team2GameResults.map((result, idx) => (
                    <div 
                      key={idx} 
                      className={`px-4 py-2 rounded-lg font-bold text-white ${
                        result.won ? 'bg-green-500' : 'bg-red-500'
                      }`}
                      data-testid={`team2-game-${idx}`}
                    >
                      {result.won ? 'W' : 'L'}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No recent games available</p>
              )}
            </div>
          </div>

          {/* Top 3 Players and Full Roster */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Team 1 */}
            <div>
              <h4 className="text-base md:text-lg font-semibold text-slate-800 mb-3 pb-2 border-b border-orange-200">
                {game.team1} - Top 3 Players
              </h4>
              {team1Top3.length > 0 ? (
                <div className="space-y-1 mb-4">
                  <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-orange-700 pb-2 px-2">
                    <div>Player</div>
                    <div className="text-center">PPG</div>
                    <div className="text-center">RPG</div>
                    <div className="text-center">APG</div>
                  </div>
                  {team1Top3.map((player, idx) => (
                    <div key={idx} className="grid grid-cols-4 gap-2 p-2 bg-orange-50 rounded border border-orange-200 text-sm">
                      <div className="font-medium text-slate-800 truncate">{player.name}</div>
                      <div className="text-center text-orange-600 font-semibold">{player.ppg}</div>
                      <div className="text-center text-orange-600 font-semibold">{player.rpg}</div>
                      <div className="text-center text-orange-600 font-semibold">{player.apg}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic mb-4">No stats available</p>
              )}
              
              <h5 className="text-sm font-semibold text-orange-700 mb-2">Full Roster</h5>
              {team1FullRoster.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {team1FullRoster.map((player, idx) => (
                    <div key={idx} className="px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-sm text-slate-700">
                      {player.name}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No additional players</p>
              )}
            </div>

            {/* Team 2 */}
            <div>
              <h4 className="text-base md:text-lg font-semibold text-slate-800 mb-3 pb-2 border-b border-orange-200">
                {game.team2} - Top 3 Players
              </h4>
              {team2Top3.length > 0 ? (
                <div className="space-y-1 mb-4">
                  <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-orange-700 pb-2 px-2">
                    <div>Player</div>
                    <div className="text-center">PPG</div>
                    <div className="text-center">RPG</div>
                    <div className="text-center">APG</div>
                  </div>
                  {team2Top3.map((player, idx) => (
                    <div key={idx} className="grid grid-cols-4 gap-2 p-2 bg-orange-50 rounded border border-orange-200 text-sm">
                      <div className="font-medium text-slate-800 truncate">{player.name}</div>
                      <div className="text-center text-orange-600 font-semibold">{player.ppg}</div>
                      <div className="text-center text-orange-600 font-semibold">{player.rpg}</div>
                      <div className="text-center text-orange-600 font-semibold">{player.apg}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic mb-4">No stats available</p>
              )}
              
              <h5 className="text-sm font-semibold text-orange-700 mb-2">Full Roster</h5>
              {team2FullRoster.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {team2FullRoster.map((player, idx) => (
                    <div key={idx} className="px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-sm text-slate-700">
                      {player.name}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No additional players</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
