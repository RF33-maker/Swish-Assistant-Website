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
  // First, fetch team IDs from teams table
  const { data: team1Data } = useQuery({
    queryKey: ['team-lookup', leagueId, game.team1],
    queryFn: async () => {
      console.log('🔍 Looking up team1 ID for:', game.team1);
      
      // Try exact match first
      let { data, error } = await supabase
        .from('teams')
        .select('team_id, name')
        .eq('league_id', leagueId)
        .eq('name', game.team1)
        .single();
      
      // If no exact match, try partial match
      if (error || !data) {
        const baseTeamName = game.team1.split(' Senior ')[0].split(' Men')[0];
        console.log('🔍 Trying partial match for team1:', baseTeamName);
        
        const { data: partialData, error: partialError } = await supabase
          .from('teams')
          .select('team_id, name')
          .eq('league_id', leagueId)
          .ilike('name', `%${baseTeamName}%`)
          .limit(1)
          .single();
        
        data = partialData;
        error = partialError;
      }
      
      console.log('✅ Team1 lookup result:', data);
      return data;
    },
    enabled: isOpen
  });

  const { data: team2Data } = useQuery({
    queryKey: ['team-lookup', leagueId, game.team2],
    queryFn: async () => {
      console.log('🔍 Looking up team2 ID for:', game.team2);
      
      // Try exact match first
      let { data, error } = await supabase
        .from('teams')
        .select('team_id, name')
        .eq('league_id', leagueId)
        .eq('name', game.team2)
        .single();
      
      // If no exact match, try partial match
      if (error || !data) {
        const baseTeamName = game.team2.split(' Senior ')[0].split(' Men')[0];
        console.log('🔍 Trying partial match for team2:', baseTeamName);
        
        const { data: partialData, error: partialError } = await supabase
          .from('teams')
          .select('team_id, name')
          .eq('league_id', leagueId)
          .ilike('name', `%${baseTeamName}%`)
          .limit(1)
          .single();
        
        data = partialData;
        error = partialError;
      }
      
      console.log('✅ Team2 lookup result:', data);
      return data;
    },
    enabled: isOpen
  });

  const team1Id = team1Data?.team_id;
  const team2Id = team2Data?.team_id;

  // Fetch game results for team1 (last 5 games with W/L) using team_id
  const { data: team1GameResults } = useQuery({
    queryKey: ['game-results', leagueId, team1Id],
    queryFn: async () => {
      if (!team1Id) return [];
      
      console.log('🏀 Fetching game results for team1_id:', team1Id);
      
      const { data: teamGames, error } = await supabase
        .from('team_stats')
        .select('numeric_id, tot_spoints, team_id')
        .eq('league_id', leagueId)
        .eq('team_id', team1Id)
        .order('numeric_id', { ascending: false });
      
      if (error) {
        console.error('❌ Error fetching team1 games:', error);
        throw error;
      }
      if (!teamGames) return [];

      const results: GameResult[] = [];
      const processedGames = new Set<string>();

      for (const teamGame of teamGames) {
        if (!teamGame.numeric_id || processedGames.has(teamGame.numeric_id)) continue;
        
        const { data: opponentData, error: oppError } = await supabase
          .from('team_stats')
          .select('tot_spoints, team_id')
          .eq('league_id', leagueId)
          .eq('numeric_id', teamGame.numeric_id)
          .neq('team_id', team1Id)
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

      console.log('✅ Team1 game results:', results);
      return results;
    },
    enabled: isOpen && !!team1Id
  });

  // Fetch game results for team2 (last 5 games with W/L) using team_id
  const { data: team2GameResults } = useQuery({
    queryKey: ['game-results', leagueId, team2Id],
    queryFn: async () => {
      if (!team2Id) return [];
      
      console.log('🏀 Fetching game results for team2_id:', team2Id);
      
      const { data: teamGames, error } = await supabase
        .from('team_stats')
        .select('numeric_id, tot_spoints, team_id')
        .eq('league_id', leagueId)
        .eq('team_id', team2Id)
        .order('numeric_id', { ascending: false });
      
      if (error) {
        console.error('❌ Error fetching team2 games:', error);
        throw error;
      }
      if (!teamGames) return [];

      const results: GameResult[] = [];
      const processedGames = new Set<string>();

      for (const teamGame of teamGames) {
        if (!teamGame.numeric_id || processedGames.has(teamGame.numeric_id)) continue;
        
        const { data: opponentData, error: oppError } = await supabase
          .from('team_stats')
          .select('tot_spoints, team_id')
          .eq('league_id', leagueId)
          .eq('numeric_id', teamGame.numeric_id)
          .neq('team_id', team2Id)
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

      console.log('✅ Team2 game results:', results);
      return results;
    },
    enabled: isOpen && !!team2Id
  });

  // Calculate team records
  const team1Record = team1GameResults 
    ? `${team1GameResults.filter(g => g.won).length}-${team1GameResults.filter(g => !g.won).length}`
    : '0-0';
  
  const team2Record = team2GameResults 
    ? `${team2GameResults.filter(g => g.won).length}-${team2GameResults.filter(g => !g.won).length}`
    : '0-0';

  // Fetch roster for team1 using team_id
  const { data: team1Roster } = useQuery({
    queryKey: ['roster', leagueId, team1Id],
    queryFn: async () => {
      if (!team1Id) return [];
      
      console.log('📊 Fetching roster for team1_id:', team1Id);
      
      const { data, error } = await supabase
        .from('player_stats')
        .select('firstname, familyname, spoints, sreboundstotal, sassists, sminutes, ssteals, sblocks, sturnovers, sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, sfreethrowsmade, sfreethrowsattempted')
        .eq('league_id', leagueId)
        .eq('team_id', team1Id);
      
      if (error) {
        console.error('❌ Error fetching team1 roster:', error);
        throw error;
      }
      
      const playerMap = new Map();
      data?.forEach(stat => {
        const name = `${stat.firstname || ''} ${stat.familyname || ''}`.trim();
        if (!playerMap.has(name)) {
          playerMap.set(name, {
            name,
            games: 0,
            points: 0,
            rebounds: 0,
            assists: 0,
            minutes: 0,
            steals: 0,
            blocks: 0,
            turnovers: 0,
            fgMade: 0,
            fgAttempted: 0,
            threeMade: 0,
            threeAttempted: 0,
            ftMade: 0,
            ftAttempted: 0
          });
        }
        const player = playerMap.get(name);
        player.games += 1;
        player.points += stat.spoints || 0;
        player.rebounds += stat.sreboundstotal || 0;
        player.assists += stat.sassists || 0;
        player.minutes += stat.sminutes || 0;
        player.steals += stat.ssteals || 0;
        player.blocks += stat.sblocks || 0;
        player.turnovers += stat.sturnovers || 0;
        player.fgMade += stat.sfieldgoalsmade || 0;
        player.fgAttempted += stat.sfieldgoalsattempted || 0;
        player.threeMade += stat.sthreepointersmade || 0;
        player.threeAttempted += stat.sthreepointersattempted || 0;
        player.ftMade += stat.sfreethrowsmade || 0;
        player.ftAttempted += stat.sfreethrowsattempted || 0;
      });

      const roster = Array.from(playerMap.values())
        .map(p => ({
          ...p,
          ppg: p.games > 0 ? (p.points / p.games).toFixed(1) : '0.0',
          rpg: p.games > 0 ? (p.rebounds / p.games).toFixed(1) : '0.0',
          apg: p.games > 0 ? (p.assists / p.games).toFixed(1) : '0.0',
          mpg: p.games > 0 ? (p.minutes / p.games).toFixed(1) : '0.0',
          spg: p.games > 0 ? (p.steals / p.games).toFixed(1) : '0.0',
          bpg: p.games > 0 ? (p.blocks / p.games).toFixed(1) : '0.0',
          tpg: p.games > 0 ? (p.turnovers / p.games).toFixed(1) : '0.0',
          fgPct: p.fgAttempted > 0 ? ((p.fgMade / p.fgAttempted) * 100).toFixed(1) : '0.0',
          threePct: p.threeAttempted > 0 ? ((p.threeMade / p.threeAttempted) * 100).toFixed(1) : '0.0',
          ftPct: p.ftAttempted > 0 ? ((p.ftMade / p.ftAttempted) * 100).toFixed(1) : '0.0'
        }))
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg));
      
      console.log('✅ Team1 roster:', roster.length, 'players');
      return roster;
    },
    enabled: isOpen && !!team1Id
  });

  // Fetch roster for team2 using team_id
  const { data: team2Roster } = useQuery({
    queryKey: ['roster', leagueId, team2Id],
    queryFn: async () => {
      if (!team2Id) return [];
      
      console.log('📊 Fetching roster for team2_id:', team2Id);
      
      const { data, error } = await supabase
        .from('player_stats')
        .select('firstname, familyname, spoints, sreboundstotal, sassists, sminutes, ssteals, sblocks, sturnovers, sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, sfreethrowsmade, sfreethrowsattempted')
        .eq('league_id', leagueId)
        .eq('team_id', team2Id);
      
      if (error) {
        console.error('❌ Error fetching team2 roster:', error);
        throw error;
      }
      
      const playerMap = new Map();
      data?.forEach(stat => {
        const name = `${stat.firstname || ''} ${stat.familyname || ''}`.trim();
        if (!playerMap.has(name)) {
          playerMap.set(name, {
            name,
            games: 0,
            points: 0,
            rebounds: 0,
            assists: 0,
            minutes: 0,
            steals: 0,
            blocks: 0,
            turnovers: 0,
            fgMade: 0,
            fgAttempted: 0,
            threeMade: 0,
            threeAttempted: 0,
            ftMade: 0,
            ftAttempted: 0
          });
        }
        const player = playerMap.get(name);
        player.games += 1;
        player.points += stat.spoints || 0;
        player.rebounds += stat.sreboundstotal || 0;
        player.assists += stat.sassists || 0;
        player.minutes += stat.sminutes || 0;
        player.steals += stat.ssteals || 0;
        player.blocks += stat.sblocks || 0;
        player.turnovers += stat.sturnovers || 0;
        player.fgMade += stat.sfieldgoalsmade || 0;
        player.fgAttempted += stat.sfieldgoalsattempted || 0;
        player.threeMade += stat.sthreepointersmade || 0;
        player.threeAttempted += stat.sthreepointersattempted || 0;
        player.ftMade += stat.sfreethrowsmade || 0;
        player.ftAttempted += stat.sfreethrowsattempted || 0;
      });

      const roster = Array.from(playerMap.values())
        .map(p => ({
          ...p,
          ppg: p.games > 0 ? (p.points / p.games).toFixed(1) : '0.0',
          rpg: p.games > 0 ? (p.rebounds / p.games).toFixed(1) : '0.0',
          apg: p.games > 0 ? (p.assists / p.games).toFixed(1) : '0.0',
          mpg: p.games > 0 ? (p.minutes / p.games).toFixed(1) : '0.0',
          spg: p.games > 0 ? (p.steals / p.games).toFixed(1) : '0.0',
          bpg: p.games > 0 ? (p.blocks / p.games).toFixed(1) : '0.0',
          tpg: p.games > 0 ? (p.turnovers / p.games).toFixed(1) : '0.0',
          fgPct: p.fgAttempted > 0 ? ((p.fgMade / p.fgAttempted) * 100).toFixed(1) : '0.0',
          threePct: p.threeAttempted > 0 ? ((p.threeMade / p.threeAttempted) * 100).toFixed(1) : '0.0',
          ftPct: p.ftAttempted > 0 ? ((p.ftMade / p.ftAttempted) * 100).toFixed(1) : '0.0'
        }))
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg));
      
      console.log('✅ Team2 roster:', roster.length, 'players');
      return roster;
    },
    enabled: isOpen && !!team2Id
  });

  const team1Top3 = team1Roster?.slice(0, 3) || [];
  const team1FullRoster = team1Roster?.slice(3) || [];
  const team2Top3 = team2Roster?.slice(0, 3) || [];
  const team2FullRoster = team2Roster?.slice(3) || [];

  // Debug logging
  if (isOpen) {
    console.log('🎮 Game Preview Modal opened for:', game.team1, 'vs', game.team2);
    console.log('🔑 Team IDs:', { team1Id, team2Id });
    console.log('📊 Team1 roster data:', team1Roster?.length, 'players');
    console.log('📊 Team2 roster data:', team2Roster?.length, 'players');
    console.log('🏀 Team1 game results:', team1GameResults?.length, 'games');
    console.log('🏀 Team2 game results:', team2GameResults?.length, 'games');
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent
            className="w-[95vw] sm:w-full max-w-[420px] sm:max-w-4xl 
                       max-h-[90vh] overflow-y-auto 
                       p-3 sm:p-6 bg-[#fffaf1] text-slate-800 
                       rounded-2xl shadow-lg border border-orange-100 
                       mx-auto my-auto"
          >

        <DialogHeader className="flex flex-row items-center justify-between border-b border-orange-200 pb-3 sm:pb-4 mb-4">
          <DialogTitle className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800">Game Preview</DialogTitle>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-orange-100 transition-colors"
            data-testid="close-preview-modal"
          >
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </DialogHeader>

        <div className="space-y-6">
          {/* Matchup Header */}
          <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-3 sm:p-4 md:p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
              {/* Team 1 */}
              <div className="flex flex-col items-center gap-1.5 sm:gap-2 flex-1 w-full md:w-auto">
                <TeamLogo teamName={game.team1} leagueId={String(leagueId)} size="lg" />
                <div className="text-center">
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-800 line-clamp-2">{game.team1}</h3>
                  <p className="text-sm text-slate-600 font-medium">{team1Record}</p>
                </div>
              </div>
              
              {/* VS and Date/Time */}
              <div className="text-center px-3 sm:px-4 md:px-8 py-2">
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-orange-600">VS</div>
                <div className="text-xs sm:text-sm text-slate-600 mt-1.5 sm:mt-2 whitespace-nowrap">
                  {new Date(game.game_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
                {game.kickoff_time && (
                  <div className="text-xs sm:text-sm text-slate-600 font-medium">{game.kickoff_time}</div>
                )}
                {game.venue && (
                  <div className="text-xs text-slate-500 mt-1 line-clamp-1">{game.venue}</div>
                )}
              </div>

              {/* Team 2 */}
              <div className="flex flex-col items-center gap-1.5 sm:gap-2 flex-1 w-full md:w-auto">
                <TeamLogo teamName={game.team2} leagueId={String(leagueId)} size="lg" />
                <div className="text-center">
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-800 line-clamp-2">{game.team2}</h3>
                  <p className="text-sm text-slate-600 font-medium">{team2Record}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Form - Last 5 Games */}
          <div className="space-y-3 sm:space-y-4">
            <div>
              <h4 className="text-sm sm:text-base md:text-lg font-semibold text-slate-800 mb-2 sm:mb-3">
                {game.team1} - Last 5 Games
              </h4>
              {team1GameResults && team1GameResults.length > 0 ? (
                <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                  {team1GameResults.map((result, idx) => (
                    <div 
                      key={idx} 
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold text-xs sm:text-sm ${
                        result.won 
                          ? 'bg-green-500 text-white' 
                          : 'bg-red-500 text-white'
                      }`}
                      data-testid={`team1-game-${idx}`}
                    >
                      {result.won ? 'W' : 'L'}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-slate-500 italic">No recent games available</p>
              )}
            </div>

            <div>
              <h4 className="text-sm sm:text-base md:text-lg font-semibold text-slate-800 mb-2 sm:mb-3">
                {game.team2} - Last 5 Games
              </h4>
              {team2GameResults && team2GameResults.length > 0 ? (
                <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                  {team2GameResults.map((result, idx) => (
                    <div 
                      key={idx} 
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold text-xs sm:text-sm ${
                        result.won 
                          ? 'bg-green-500 text-white' 
                          : 'bg-red-500 text-white'
                      }`}
                      data-testid={`team2-game-${idx}`}
                    >
                      {result.won ? 'W' : 'L'}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-slate-500 italic">No recent games available</p>
              )}
            </div>
          </div>

          {/* Top 3 Players - Full Stats Table */}
          <div className="space-y-4 sm:space-y-6">
            {/* Team 1 Top 3 */}
            <div>
              <h4 className="text-sm sm:text-base md:text-lg font-semibold text-slate-800 mb-2 sm:mb-3 pb-2 border-b border-orange-200">
                {game.team1} - Top 3 Players
              </h4>
              {team1Top3.length > 0 ? (
                <div className="relative mb-3 sm:mb-4">
                  <div className="overflow-x-auto -mx-4 sm:mx-0 border border-orange-200 rounded-lg scrollbar-thin scrollbar-thumb-orange-300 scrollbar-track-orange-50">
                    <table className="w-full text-xs md:text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-orange-50">
                          <th className="text-left py-2 sm:py-2.5 md:py-3 px-2 sm:px-2.5 md:px-3 font-semibold text-slate-700 sticky left-0 bg-orange-50 z-10 min-w-[100px] sm:min-w-[120px] shadow-[2px_0_4px_rgba(0,0,0,0.05)]">Player</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[38px] sm:min-w-[45px]">GP</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">MIN</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">PTS</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">REB</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">AST</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">STL</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">BLK</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">TO</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[48px] sm:min-w-[55px]">FG%</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[48px] sm:min-w-[55px]">3P%</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[48px] sm:min-w-[55px]">FT%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team1Top3.map((player, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-orange-50 transition-colors">
                            <td className="py-2 sm:py-2.5 md:py-3 px-2 sm:px-2.5 md:px-3 font-medium text-slate-800 sticky left-0 bg-white hover:bg-orange-50 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                              {player.name}
                            </td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600 font-medium">{player.games}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.mpg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center font-semibold text-orange-600">{player.ppg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center font-medium text-slate-700">{player.rpg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center font-medium text-slate-700">{player.apg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.spg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.bpg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.tpg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.fgPct}%</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.threePct}%</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.ftPct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="sm:hidden bg-gradient-to-r from-orange-100 to-orange-50 text-orange-700 text-center py-2 text-xs font-medium border-t border-orange-200 rounded-b-lg flex items-center justify-center gap-1.5">
                    <span className="animate-pulse">👉</span>
                    <span>Swipe to see all stats</span>
                    <span className="animate-pulse">👈</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-slate-500 italic mb-3 sm:mb-4">No stats available</p>
              )}
              
              <h5 className="text-xs sm:text-sm font-semibold text-orange-700 mb-1.5 sm:mb-2">Full Roster</h5>
              {team1FullRoster.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {team1FullRoster.map((player, idx) => (
                    <div key={idx} className="px-2.5 sm:px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs sm:text-sm text-slate-700">
                      {player.name}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No additional players</p>
              )}
            </div>

            {/* Team 2 Top 3 */}
            <div>
              <h4 className="text-sm sm:text-base md:text-lg font-semibold text-slate-800 mb-2 sm:mb-3 pb-2 border-b border-orange-200">
                {game.team2} - Top 3 Players
              </h4>
              {team2Top3.length > 0 ? (
                <div className="relative mb-3 sm:mb-4">
                  <div className="overflow-x-auto -mx-4 sm:mx-0 border border-orange-200 rounded-lg scrollbar-thin scrollbar-thumb-orange-300 scrollbar-track-orange-50">
                    <table className="w-full text-xs md:text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-orange-50">
                          <th className="text-left py-2 sm:py-2.5 md:py-3 px-2 sm:px-2.5 md:px-3 font-semibold text-slate-700 sticky left-0 bg-orange-50 z-10 min-w-[100px] sm:min-w-[120px] shadow-[2px_0_4px_rgba(0,0,0,0.05)]">Player</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[38px] sm:min-w-[45px]">GP</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">MIN</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">PTS</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">REB</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">AST</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">STL</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">BLK</th>
                          <th className="text-center py-2 sm:py-2.5 md:px-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[42px] sm:min-w-[50px]">TO</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[48px] sm:min-w-[55px]">FG%</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[48px] sm:min-w-[55px]">3P%</th>
                          <th className="text-center py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 font-semibold text-slate-700 min-w-[48px] sm:min-w-[55px]">FT%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team2Top3.map((player, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-orange-50 transition-colors">
                            <td className="py-2 sm:py-2.5 md:py-3 px-2 sm:px-2.5 md:px-3 font-medium text-slate-800 sticky left-0 bg-white hover:bg-orange-50 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                              {player.name}
                            </td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600 font-medium">{player.games}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.mpg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center font-semibold text-orange-600">{player.ppg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center font-medium text-slate-700">{player.rpg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center font-medium text-slate-700">{player.apg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.spg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.bpg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.tpg}</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.fgPct}%</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.threePct}%</td>
                            <td className="py-2 sm:py-2.5 md:py-3 px-1.5 sm:px-2 md:px-3 text-center text-slate-600">{player.ftPct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="sm:hidden bg-gradient-to-r from-orange-100 to-orange-50 text-orange-700 text-center py-2 text-xs font-medium border-t border-orange-200 rounded-b-lg flex items-center justify-center gap-1.5">
                    <span className="animate-pulse">👉</span>
                    <span>Swipe to see all stats</span>
                    <span className="animate-pulse">👈</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-slate-500 italic mb-3 sm:mb-4">No stats available</p>
              )}
              
              <h5 className="text-xs sm:text-sm font-semibold text-orange-700 mb-1.5 sm:mb-2">Full Roster</h5>
              {team2FullRoster.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {team2FullRoster.map((player, idx) => (
                    <div key={idx} className="px-2.5 sm:px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs sm:text-sm text-slate-700">
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
