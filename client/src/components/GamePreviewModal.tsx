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

export default function GamePreviewModal({ isOpen, onClose, game, leagueId }: GamePreviewModalProps) {
  // Fetch last 5 games for team1
  const { data: team1RecentGames } = useQuery({
    queryKey: ['recent-games', leagueId, game.team1],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_stats')
        .select('*')
        .eq('league_id', leagueId)
        .eq('name', game.team1)
        .order('numeric_id', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen
  });

  // Fetch last 5 games for team2
  const { data: team2RecentGames } = useQuery({
    queryKey: ['recent-games', leagueId, game.team2],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_stats')
        .select('*')
        .eq('league_id', leagueId)
        .eq('name', game.team2)
        .order('numeric_id', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen
  });

  // Fetch roster for team1
  const { data: team1Roster } = useQuery({
    queryKey: ['roster', leagueId, game.team1],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_stats')
        .select('firstname, familyname, spoints, stwoptfieldgoalsmade, sthreeptfieldgoalsmade, sfreethrowsmade, sreboundstotal, sassists')
        .eq('league_id', leagueId)
        .eq('team', game.team1);
      
      if (error) throw error;
      
      // Aggregate stats by player
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
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 10);
    },
    enabled: isOpen
  });

  // Fetch roster for team2
  const { data: team2Roster } = useQuery({
    queryKey: ['roster', leagueId, game.team2],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_stats')
        .select('firstname, familyname, spoints, stwoptfieldgoalsmade, sthreeptfieldgoalsmade, sfreethrowsmade, sreboundstotal, sassists')
        .eq('league_id', leagueId)
        .eq('team', game.team2);
      
      if (error) throw error;
      
      // Aggregate stats by player
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
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 10);
    },
    enabled: isOpen
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-4">
          <DialogTitle className="text-2xl font-bold">Game Preview</DialogTitle>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 transition-colors"
            data-testid="close-preview-modal"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogHeader>

        <div className="space-y-6">
          {/* Matchup Header */}
          <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <TeamLogo teamName={game.team1} leagueId={String(leagueId)} size="lg" />
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-800">{game.team1}</h3>
                </div>
              </div>
              
              <div className="text-center px-8">
                <div className="text-3xl font-bold text-orange-600">VS</div>
                <div className="text-sm text-slate-600 mt-2">
                  {new Date(game.game_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
                {game.kickoff_time && (
                  <div className="text-sm text-slate-600">{game.kickoff_time}</div>
                )}
                {game.venue && (
                  <div className="text-xs text-slate-500 mt-1">{game.venue}</div>
                )}
              </div>

              <div className="flex items-center gap-4 flex-1 justify-end">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-800">{game.team2}</h3>
                </div>
                <TeamLogo teamName={game.team2} leagueId={String(leagueId)} size="lg" />
              </div>
            </div>
          </div>

          {/* Recent Form */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-lg font-semibold text-slate-800 mb-3 pb-2 border-b border-orange-200">
                {game.team1} - Last 5 Games
              </h4>
              {team1RecentGames && team1RecentGames.length > 0 ? (
                <div className="space-y-2">
                  {team1RecentGames.map((gameData, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                      <span className="text-sm font-medium text-slate-700">Game {team1RecentGames.length - idx}</span>
                      <span className="text-lg font-bold text-orange-600">{gameData.tot_spoints || 0} pts</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No recent games available</p>
              )}
            </div>

            <div>
              <h4 className="text-lg font-semibold text-slate-800 mb-3 pb-2 border-b border-orange-200">
                {game.team2} - Last 5 Games
              </h4>
              {team2RecentGames && team2RecentGames.length > 0 ? (
                <div className="space-y-2">
                  {team2RecentGames.map((gameData, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                      <span className="text-sm font-medium text-slate-700">Game {team2RecentGames.length - idx}</span>
                      <span className="text-lg font-bold text-orange-600">{gameData.tot_spoints || 0} pts</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No recent games available</p>
              )}
            </div>
          </div>

          {/* Rosters */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-lg font-semibold text-slate-800 mb-3 pb-2 border-b border-orange-200">
                {game.team1} - Top Players
              </h4>
              {team1Roster && team1Roster.length > 0 ? (
                <div className="space-y-1">
                  <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-slate-600 pb-2 px-2">
                    <div>Player</div>
                    <div className="text-center">PPG</div>
                    <div className="text-center">RPG</div>
                    <div className="text-center">APG</div>
                  </div>
                  {team1Roster.map((player, idx) => (
                    <div key={idx} className="grid grid-cols-4 gap-2 p-2 hover:bg-orange-50 rounded text-sm">
                      <div className="font-medium text-slate-800 truncate">{player.name}</div>
                      <div className="text-center text-slate-700">{player.ppg}</div>
                      <div className="text-center text-slate-700">{player.rpg}</div>
                      <div className="text-center text-slate-700">{player.apg}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No roster available</p>
              )}
            </div>

            <div>
              <h4 className="text-lg font-semibold text-slate-800 mb-3 pb-2 border-b border-orange-200">
                {game.team2} - Top Players
              </h4>
              {team2Roster && team2Roster.length > 0 ? (
                <div className="space-y-1">
                  <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-slate-600 pb-2 px-2">
                    <div>Player</div>
                    <div className="text-center">PPG</div>
                    <div className="text-center">RPG</div>
                    <div className="text-center">APG</div>
                  </div>
                  {team2Roster.map((player, idx) => (
                    <div key={idx} className="grid grid-cols-4 gap-2 p-2 hover:bg-orange-50 rounded text-sm">
                      <div className="font-medium text-slate-800 truncate">{player.name}</div>
                      <div className="text-center text-slate-700">{player.ppg}</div>
                      <div className="text-center text-slate-700">{player.rpg}</div>
                      <div className="text-center text-slate-700">{player.apg}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No roster available</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
