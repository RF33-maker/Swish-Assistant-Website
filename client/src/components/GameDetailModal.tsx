import React, { useState, useEffect } from "react";
import { X, Calendar, Users, Trophy, TrendingUp, Clock, Target, Bot, Sparkles, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface PlayerGameStats {
  id: string;
  firstname: string;
  familyname: string;
  team: string;
  number?: number;
  sminutes?: string;
  spoints: number;
  sfieldgoalsmade?: number;
  sfieldgoalsattempted?: number;
  sfieldgoalspercentage?: number;
  sthreepointersmade?: number;
  sthreepointersattempted?: number;
  sthreepointerspercentage?: number;
  sfreethrowsmade?: number;
  sfreethrowsattempted?: number;
  sfreethrowspercentage?: number;
  sreboundstotal: number;
  rebounds_o?: number;
  rebounds_d?: number;
  sassists: number;
  ssteals?: number;
  sblocks?: number;
  sturnovers?: number;
  personal_fouls?: number;
  plus_minus?: number;
}

interface GameDetailModalProps {
  gameId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function GameDetailModal({ gameId, isOpen, onClose }: GameDetailModalProps) {
  const [gameStats, setGameStats] = useState<PlayerGameStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [gameInfo, setGameInfo] = useState<{
    date: string;
    teams: string[];
    teamScores: Record<string, number>;
  } | null>(null);
  const [teamStatsFromDb, setTeamStatsFromDb] = useState<any[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    const fetchGameDetails = async () => {
      if (!gameId || !isOpen) return;
      
      setLoading(true);
      // Reset team stats to avoid stale data
      setTeamStatsFromDb([]);
      
      try {
        console.log("🎮 Fetching game details for gameId:", gameId);
        
        // First get team information from team_stats
        const { data: teamStatsData, error: teamError } = await supabase
          .from("team_stats")
          .select("*")
          .eq("numeric_id", gameId);
          
        console.log("🏀 Team stats query result:", { teamError, teamStatsData, count: teamStatsData?.length });

        let teamsInfo: { [key: string]: number } = {};
        let gameDate = new Date().toISOString();
        
        if (teamStatsData && teamStatsData.length > 0) {
          // Store team stats data for use in team totals
          setTeamStatsFromDb(teamStatsData);
          
          // Get teams and scores from team_stats
          teamStatsData.forEach(teamStat => {
            if (teamStat.name) {
              teamsInfo[teamStat.name] = teamStat.tot_spoints || 0;
            }
          });
          // Use the created_at from team_stats for the game date
          gameDate = teamStatsData[0].created_at || new Date().toISOString();
          console.log("🏆 Teams from team_stats:", Object.keys(teamsInfo), "Scores:", teamsInfo);
        }
        
        // Then get player stats with full names from players table
        const { data: stats, error } = await supabase
          .from("player_stats")
          .select("*, players:player_id(full_name)")
          .eq("numeric_id", gameId)
          .order("spoints", { ascending: false });

        console.log("📊 Player stats query result:", { error, stats, count: stats?.length });

        if (error) {
          console.error("Error fetching game details:", error);
          return;
        }

        if (stats && stats.length > 0) {
          console.log("📊 Sample player stat record:", stats[0]);
          
          // Process stats to use full names and proper team assignments
          const processedStats = stats.map(stat => ({
            ...stat,
            // Use full_name from players table, fallback to existing name, then combine firstname/familyname
            firstname: stat.full_name || 
                      stat.players?.full_name || 
                      stat.name || 
                      `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || 
                      'Unknown Player',
            familyname: '', // Clear since we're using full name in firstname
            // Use team_name field for proper team assignment
            team: stat.team_name || stat.team || 'Unknown Team'
          }));
          
          // Get unique teams from the processed stats
          const teamsFromStats = Array.from(new Set(processedStats.map(stat => stat.team).filter(Boolean)));
          console.log("🏀 Teams from player stats:", teamsFromStats);
          
          // Update teams info if we have better data from stats
          if (teamsFromStats.length > 0) {
            const updatedTeamsInfo = { ...teamsInfo };
            teamsFromStats.forEach(team => {
              if (!updatedTeamsInfo[team]) {
                // Calculate team score from player stats if not available from team_stats
                const teamScore = processedStats
                  .filter(stat => stat.team === team)
                  .reduce((sum, stat) => sum + (stat.spoints || 0), 0);
                updatedTeamsInfo[team] = teamScore;
              }
            });
            
            setGameInfo({
              date: gameDate,
              teams: teamsFromStats,
              teamScores: updatedTeamsInfo,
            });
            
            // Set first team as default selection
            if (teamsFromStats.length > 0 && !selectedTeam) {
              setSelectedTeam(teamsFromStats[0]);
            }
          }
          
          console.log("✅ Final processed stats:", processedStats.slice(0, 2));
          setGameStats(processedStats);
        }
      } catch (error) {
        console.error("Error processing game details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGameDetails();
  }, [gameId, isOpen]);

  const fetchAISummary = async () => {
    if (!gameId) return;
    
    setSummaryLoading(true);
    
    try {
      // Convert game_id format to ref_id format
      // game_id: "2025-07-11_CRI_vs_FRE" 
      // ref_id: "crickhowell_elite_freeball_2025-07-11"
      
      // First try direct match with ref_id
      let existingSummary = null;
      let fetchError = null;
      
      // Try to find summary by ref_id using pattern matching
      const { data: summaries, error } = await supabase
        .from('summaries')
        .select('*')
        .eq('summary_type', 'game');

      if (error) {
        fetchError = error;
        console.error('Error fetching summaries:', error);
      } else if (summaries && summaries.length > 0) {
        console.log('Available summaries:', summaries);
        
        // Extract date and teams from gameId (format: "2025-07-11_CRI_vs_FRE")
        const parts = gameId.split('_');
        const datePart = parts[0]; // "2025-07-11"
        const team1Code = parts[1]; // "CRI"  
        const team3Code = parts[3]; // "FRE"
        
        console.log(`Looking for game on ${datePart} with teams containing: ${team1Code}, ${team3Code}`);
        
        // Debug: show what we're looking for vs what's available
        const availableGamesOnDate = summaries.filter(s => s.ref_id && s.ref_id.includes(datePart));
        console.log(`Games available on ${datePart}:`, availableGamesOnDate.map(s => s.ref_id));
        
        // Find summary that matches the date and potentially team codes
        existingSummary = summaries.find(summary => {
          if (!summary.ref_id || !summary.ref_id.includes(datePart)) return false;
          
          // Check if ref_id contains patterns matching team codes
          const refId = summary.ref_id.toLowerCase();
          const cri = team1Code.toLowerCase();
          const fre = team3Code.toLowerCase();
          
          // Map common team code patterns based on the actual data
          const teamMappings = {
            'cri': 'crickhowell',
            'fre': 'freeball', 
            'bri': 'bristol',
            'glo': 'gloucester',
            'daw': 'dawgs',
            'emp': 'empees',
            'jus': 'just_us'
          };
          
          const team1Name = teamMappings[cri] || cri;
          const team2Name = teamMappings[fre] || fre;
          
          // Both teams must be in the ref_id for a valid match
          return refId.includes(team1Name) && refId.includes(team2Name);
        });
        
        if (existingSummary) {
          console.log('Found matching summary:', existingSummary);
        } else {
          console.log('No matching summary found for date and teams');
        }
      }

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching summary:', fetchError);
        // Continue to fallback instead of returning
      }

      if (existingSummary && !fetchError) {
        console.log('Found existing summary:', existingSummary);
        // Get the summary content from the database
        const summaryText = existingSummary.content || 
                           'Game summary found but content is empty.';
        
        // Add delay for AI effect even if summary exists
        setTimeout(() => {
          setAiSummary(summaryText);
          setShowSummary(true);
          setSummaryLoading(false);
        }, 1500);
      } else {
        // No summary found
        console.log('No summary found for game_id:', gameId);
        setTimeout(() => {
          setAiSummary("No AI game summary available for this game yet. Summaries are generated after game completion and may take some time to appear.");
          setShowSummary(true);
          setSummaryLoading(false);
        }, 1500);
      }
    } catch (error) {
      console.error('Error with AI summary:', error);
      setTimeout(() => {
        setAiSummary("Unable to load AI summary at this time. Please try again later.");
        setShowSummary(true);
        setSummaryLoading(false);
      }, 1000);
    }
  };

  if (!isOpen) return null;

  const teamStats = gameInfo?.teams.map(team => {
    const teamPlayers = gameStats.filter(stat => stat.team === team);
    const dbTeamStats = teamStatsFromDb.find(ts => ts.name === team);
    
    // Fallback: calculate from player stats if team stats not available
    const calcFgMade = teamPlayers.reduce((sum, p) => sum + (p.sfieldgoalsmade || 0), 0);
    const calcFgAttempted = teamPlayers.reduce((sum, p) => sum + (p.sfieldgoalsattempted || 0), 0);
    const calcThreeMade = teamPlayers.reduce((sum, p) => sum + (p.sthreepointersmade || 0), 0);
    const calcThreeAttempted = teamPlayers.reduce((sum, p) => sum + (p.sthreepointersattempted || 0), 0);
    
    return {
      name: team,
      score: gameInfo.teamScores[team],
      players: teamPlayers,
      totalFgMade: dbTeamStats?.tot_sfieldgoalsmade ?? calcFgMade,
      totalFgAttempted: dbTeamStats?.tot_sfieldgoalsattempted ?? calcFgAttempted,
      totalThreeMade: dbTeamStats?.tot_sthreepointersmade ?? calcThreeMade,
      totalThreeAttempted: dbTeamStats?.tot_sthreepointersattempted ?? calcThreeAttempted,
      totalRebounds: dbTeamStats?.tot_sreboundstotal ?? teamPlayers.reduce((sum, p) => sum + (p.sreboundstotal || 0), 0),
      totalAssists: dbTeamStats?.tot_sassists ?? teamPlayers.reduce((sum, p) => sum + (p.sassists || 0), 0),
    };
  });

  const selectedTeamStats = teamStats?.find(team => team.name === selectedTeam);
  const selectedTeamPlayers = selectedTeamStats?.players || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-2 md:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-full md:max-w-4xl lg:max-w-6xl w-full max-h-[95vh] md:max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 md:p-6 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-orange-100 gap-3 md:gap-0">
          <div className="flex-1">
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">Game Details</h2>
            {gameInfo && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2 text-xs md:text-sm text-slate-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                  {new Date(gameInfo.date).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Trophy className="w-3 h-3 md:w-4 md:h-4" />
                  {gameInfo.teams.map((team, index) => (
                    <span key={team} className="font-medium">
                      {team} {gameInfo.teamScores[team]}
                      {index < gameInfo.teams.length - 1 && <span className="mx-2 text-orange-500">vs</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 md:static p-2 hover:bg-orange-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 md:w-6 md:h-6 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(95vh-140px)] md:max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="p-6 md:p-8 text-center">
              <div className="animate-spin rounded-full h-10 w-10 md:h-12 md:w-12 border-b-2 border-orange-500 mx-auto"></div>
              <p className="mt-4 text-sm md:text-base text-slate-600">Loading game details...</p>
            </div>
          ) : (
            <div className="p-4 md:p-6 space-y-4 md:space-y-6">
              {/* Final Score Summary */}
              {gameInfo && (
                <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-3 md:p-4 border border-orange-200">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-0">
                    <div className="text-center flex-1">
                      <div className="text-sm md:text-base lg:text-lg font-semibold text-slate-800 truncate">{gameInfo.teams[0]}</div>
                      <div className="text-2xl md:text-3xl font-bold text-orange-600">{gameInfo.teamScores[gameInfo.teams[0]]}</div>
                    </div>
                    <div className="mx-4 md:mx-8 text-xs md:text-sm text-slate-400 font-medium">FINAL</div>
                    <div className="text-center flex-1">
                      <div className="text-sm md:text-base lg:text-lg font-semibold text-slate-800 truncate">{gameInfo.teams[1]}</div>
                      <div className="text-2xl md:text-3xl font-bold text-orange-600">{gameInfo.teamScores[gameInfo.teams[1]]}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Game Summary Section */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 md:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="relative">
                      <Bot className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                      {summaryLoading && (
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full animate-spin">
                          <div className="w-7 h-7 md:w-8 md:h-8 bg-blue-50 rounded-full"></div>
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-semibold text-blue-800">AI Game Analysis</h3>
                      <p className="text-xs md:text-sm text-blue-600">Powered by advanced game intelligence</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs rounded-full font-medium">
                      PREMIUM
                    </div>
                    <Sparkles className="w-3 h-3 md:w-4 md:h-4 text-purple-500" />
                  </div>
                </div>

                {!showSummary ? (
                  <div className="text-center">
                    <button
                      onClick={fetchAISummary}
                      disabled={summaryLoading}
                      className={`relative px-4 md:px-6 py-2 md:py-3 rounded-lg text-sm md:text-base font-medium text-white transition-all duration-300 ${
                        summaryLoading
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:scale-105 active:scale-95'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {summaryLoading ? (
                          <>
                            <Zap className="w-3 h-3 md:w-4 md:h-4 animate-bounce" />
                            <span className="animate-pulse">AI Analyzing Game...</span>
                            <div className="flex gap-1">
                              <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                          </>
                        ) : (
                          <>
                            <Bot className="w-3 h-3 md:w-4 md:h-4" />
                            <span>Generate AI Game Summary</span>
                            <Sparkles className="w-3 h-3 md:w-4 md:h-4" />
                          </>
                        )}
                      </div>
                    </button>
                    <p className="text-xs md:text-sm text-blue-600 mt-2 px-2">
                      Get detailed insights on key plays, player performances, and game-changing moments
                    </p>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-blue-200 p-3 md:p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-purple-500" />
                      <span className="text-xs md:text-sm font-medium text-blue-800">AI Analysis Complete</span>
                    </div>
                    <div className="text-slate-700 text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
                      {aiSummary}
                    </div>
                    <button
                      onClick={() => {
                        setShowSummary(false);
                        setAiSummary(null);
                      }}
                      className="mt-3 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Generate New Analysis
                    </button>
                  </div>
                )}
              </div>

              {/* Team Filter Buttons */}
              {gameInfo && (
                <div className="flex flex-col sm:flex-row justify-center gap-2 -mx-4 md:mx-0 overflow-x-auto px-4 md:px-0">
                  {gameInfo.teams.map((team) => (
                    <button
                      key={team}
                      onClick={() => setSelectedTeam(team)}
                      className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                        selectedTeam === team
                          ? 'bg-orange-500 text-white shadow-md'
                          : 'bg-white text-slate-700 border border-orange-200 hover:bg-orange-50'
                      }`}
                    >
                      {team} Box Score
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Team Summary */}
              {selectedTeamStats && (
                <div className="bg-orange-50 rounded-lg p-3 md:p-4 border border-orange-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base md:text-xl font-bold text-slate-800 truncate pr-2">{selectedTeamStats.name}</h3>
                    <div className="text-2xl md:text-3xl font-bold text-orange-600">{selectedTeamStats.score}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-xs md:text-sm">
                    <div>
                      <div className="text-slate-800 font-medium">Field Goals</div>
                      <div className="font-semibold text-slate-900">
                        {selectedTeamStats.totalFgMade}/{selectedTeamStats.totalFgAttempted} 
                        {selectedTeamStats.totalFgAttempted > 0 && (
                          <span className="text-slate-700 ml-1">
                            ({((selectedTeamStats.totalFgMade / selectedTeamStats.totalFgAttempted) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-800 font-medium">3-Pointers</div>
                      <div className="font-semibold text-slate-900">
                        {selectedTeamStats.totalThreeMade}/{selectedTeamStats.totalThreeAttempted}
                        {selectedTeamStats.totalThreeAttempted > 0 && (
                          <span className="text-slate-700 ml-1">
                            ({((selectedTeamStats.totalThreeMade / selectedTeamStats.totalThreeAttempted) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-800 font-medium">Total Rebounds</div>
                      <div className="font-semibold text-slate-900">{selectedTeamStats.totalRebounds}</div>
                    </div>
                    <div>
                      <div className="text-slate-800 font-medium">Total Assists</div>
                      <div className="font-semibold text-slate-900">{selectedTeamStats.totalAssists}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Box Score Table for Selected Team */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="p-3 md:p-4 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm md:text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Users className="w-4 h-4 md:w-5 md:h-5" />
                    {selectedTeam} Box Score
                  </h3>
                </div>
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <table className="w-full text-xs md:text-sm min-w-[800px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left py-1.5 md:p-3 font-medium text-slate-700 sticky left-4 md:left-0 bg-gray-50 z-10 w-48 md:w-52 pl-2 pr-1">Player</th>
                        <th className="text-center py-1.5 md:p-3 font-medium text-slate-700 pl-1 pr-1.5">MIN</th>
                        <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700">PTS</th>
                        <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700">FG</th>
                        <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700">3P</th>
                        <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700">FT</th>
                        <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700">REB</th>
                        <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700">AST</th>
                        <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700">STL</th>
                        <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700">BLK</th>
                        <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700">TO</th>
                        <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700">+/-</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTeamPlayers.map((player, index) => (
                        <tr key={player.id} className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-orange-50 transition-colors`}>
                          <td className="py-1.5 md:p-3 sticky left-4 md:left-0 bg-inherit z-10 w-48 md:w-52 pl-2 pr-1">
                            <div className="max-w-none whitespace-normal">
                              <div className="font-medium text-slate-800">{player.firstname} {player.familyname}</div>
                              {player.number && (
                                <div className="text-xs text-slate-500">#{player.number}</div>
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 md:p-3 text-center text-slate-800 pl-1 pr-1.5">
                            {player.sminutes ? (
                              <div className="flex items-center justify-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span className="text-slate-800">{player.sminutes}</span>
                              </div>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center font-semibold text-orange-600">{player.spoints}</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center text-slate-800">
                            {player.sfieldgoalsmade !== undefined && player.sfieldgoalsattempted !== undefined ? (
                              <div>
                                <div className="font-medium">{player.sfieldgoalsmade}/{player.sfieldgoalsattempted}</div>
                                {player.sfieldgoalspercentage && (
                                  <div className="text-xs text-slate-500">{player.sfieldgoalspercentage}%</div>
                                )}
                              </div>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center text-slate-800">
                            {player.sthreepointersmade !== undefined && player.sthreepointersattempted !== undefined ? (
                              <div>
                                <div className="font-medium">{player.sthreepointersmade}/{player.sthreepointersattempted}</div>
                                {player.sthreepointerspercentage && (
                                  <div className="text-xs text-slate-500">{player.sthreepointerspercentage}%</div>
                                )}
                              </div>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center text-slate-800">
                            {player.sfreethrowsmade !== undefined && player.sfreethrowsattempted !== undefined ? (
                              <div>
                                <div className="font-medium">{player.sfreethrowsmade}/{player.sfreethrowsattempted}</div>
                                {player.sfreethrowspercentage && (
                                  <div className="text-xs text-slate-500">{player.sfreethrowspercentage}%</div>
                                )}
                              </div>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center text-slate-800">
                            <div className="font-medium">{player.sreboundstotal}</div>
                            {(player.rebounds_o || player.rebounds_d) && (
                              <div className="text-xs text-slate-500">
                                {player.rebounds_o || 0}O {player.rebounds_d || 0}D
                              </div>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center font-medium text-slate-800">{player.sassists}</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center font-medium text-slate-800">{player.ssteals || 0}</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center font-medium text-slate-800">{player.sblocks || 0}</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center font-medium text-red-600">{player.sturnovers || 0}</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center">
                            {player.plus_minus !== undefined ? (
                              <span className={`font-medium ${player.plus_minus >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {player.plus_minus >= 0 ? '+' : ''}{player.plus_minus}
                              </span>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    
                    {/* Team Totals Row */}
                    {selectedTeamStats && (
                      <tfoot className="bg-orange-50 border-t-2 border-orange-200">
                        <tr className="font-semibold text-slate-800">
                          <td className="py-1.5 md:p-3 sticky left-4 md:left-0 bg-orange-50 z-10 w-48 md:w-52 pl-2 pr-1">TEAM TOTALS</td>
                          <td className="py-1.5 md:p-3 text-center pl-1 pr-1.5">-</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center text-orange-600">{selectedTeamStats.score}</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center">
                            {selectedTeamStats.totalFgMade}/{selectedTeamStats.totalFgAttempted}
                            {selectedTeamStats.totalFgAttempted > 0 && (
                              <div className="text-xs text-slate-500">
                                {((selectedTeamStats.totalFgMade / selectedTeamStats.totalFgAttempted) * 100).toFixed(1)}%
                              </div>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center">
                            {selectedTeamStats.totalThreeMade}/{selectedTeamStats.totalThreeAttempted}
                            {selectedTeamStats.totalThreeAttempted > 0 && (
                              <div className="text-xs text-slate-500">
                                {((selectedTeamStats.totalThreeMade / selectedTeamStats.totalThreeAttempted) * 100).toFixed(1)}%
                              </div>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center">-</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center">{selectedTeamStats.totalRebounds}</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center">{selectedTeamStats.totalAssists}</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center">-</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center">-</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center">-</td>
                          <td className="px-1.5 py-1.5 md:p-3 text-center">-</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Team Insights */}
              {selectedTeamPlayers.length > 0 && (
                <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg p-4 border border-orange-200">
                  <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-orange-500" />
                    {selectedTeam} Game Highlights
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="bg-white rounded-md p-3">
                      <div className="text-orange-600 font-medium">Top Scorer</div>
                      <div className="text-slate-800">
                        {selectedTeamPlayers.sort((a, b) => (b.spoints || 0) - (a.spoints || 0))[0]?.firstname} {selectedTeamPlayers.sort((a, b) => (b.spoints || 0) - (a.spoints || 0))[0]?.familyname} - {selectedTeamPlayers.sort((a, b) => (b.spoints || 0) - (a.spoints || 0))[0]?.spoints} points
                      </div>
                    </div>
                    <div className="bg-white rounded-md p-3">
                      <div className="text-orange-600 font-medium">Best Rebounder</div>
                      <div className="text-slate-800">
                        {selectedTeamPlayers.sort((a, b) => (b.sreboundstotal || 0) - (a.sreboundstotal || 0))[0]?.firstname} {selectedTeamPlayers.sort((a, b) => (b.sreboundstotal || 0) - (a.sreboundstotal || 0))[0]?.familyname} - {selectedTeamPlayers.sort((a, b) => (b.sreboundstotal || 0) - (a.sreboundstotal || 0))[0]?.sreboundstotal} rebounds
                      </div>
                    </div>
                    <div className="bg-white rounded-md p-3">
                      <div className="text-orange-600 font-medium">Best Playmaker</div>
                      <div className="text-slate-800">
                        {selectedTeamPlayers.sort((a, b) => (b.sassists || 0) - (a.sassists || 0))[0]?.firstname} {selectedTeamPlayers.sort((a, b) => (b.sassists || 0) - (a.sassists || 0))[0]?.familyname} - {selectedTeamPlayers.sort((a, b) => (b.sassists || 0) - (a.sassists || 0))[0]?.sassists} assists
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}