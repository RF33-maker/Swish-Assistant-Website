import React, { useState, useEffect } from "react";
import { X, Calendar, Users, Trophy, TrendingUp, Clock, Target } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface PlayerGameStats {
  id: string;
  name: string;
  team: string;
  number?: number;
  minutes_played?: string;
  points: number;
  field_goals_made?: number;
  field_goals_attempted?: number;
  field_goal_percent?: number;
  three_pt_made?: number;
  three_pt_attempted?: number;
  three_pt_percent?: number;
  free_throws_made?: number;
  free_throws_attempted?: number;
  free_throw_percent?: number;
  rebounds_total: number;
  rebounds_o?: number;
  rebounds_d?: number;
  assists: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
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

  useEffect(() => {
    const fetchGameDetails = async () => {
      if (!gameId || !isOpen) return;
      
      setLoading(true);
      
      try {
        const { data: stats, error } = await supabase
          .from("player_stats")
          .select("*")
          .eq("game_id", gameId)
          .order("points", { ascending: false });

        if (error) {
          console.error("Error fetching game details:", error);
          return;
        }

        if (stats && stats.length > 0) {
          // Calculate team scores
          const teamScores = stats.reduce((acc: Record<string, number>, stat) => {
            if (!acc[stat.team]) acc[stat.team] = 0;
            acc[stat.team] += stat.points || 0;
            return acc;
          }, {});

          const teams = Object.keys(teamScores);
          
          setGameInfo({
            date: stats[0].game_date,
            teams,
            teamScores,
          });

          setGameStats(stats);
          
          // Set first team as default selection
          if (teams.length > 0 && !selectedTeam) {
            setSelectedTeam(teams[0]);
          }
        }
      } catch (error) {
        console.error("Error processing game details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGameDetails();
  }, [gameId, isOpen]);

  if (!isOpen) return null;

  const teamStats = gameInfo?.teams.map(team => {
    const teamPlayers = gameStats.filter(stat => stat.team === team);
    return {
      name: team,
      score: gameInfo.teamScores[team],
      players: teamPlayers,
      totalFgMade: teamPlayers.reduce((sum, p) => sum + (p.field_goals_made || 0), 0),
      totalFgAttempted: teamPlayers.reduce((sum, p) => sum + (p.field_goals_attempted || 0), 0),
      totalThreeMade: teamPlayers.reduce((sum, p) => sum + (p.three_pt_made || 0), 0),
      totalThreeAttempted: teamPlayers.reduce((sum, p) => sum + (p.three_pt_attempted || 0), 0),
      totalRebounds: teamPlayers.reduce((sum, p) => sum + (p.rebounds_total || 0), 0),
      totalAssists: teamPlayers.reduce((sum, p) => sum + (p.assists || 0), 0),
    };
  });

  const selectedTeamStats = teamStats?.find(team => team.name === selectedTeam);
  const selectedTeamPlayers = selectedTeamStats?.players || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-orange-100">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Game Details</h2>
            {gameInfo && (
              <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(gameInfo.date).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
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
            className="p-2 hover:bg-orange-200 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
              <p className="mt-4 text-slate-600">Loading game details...</p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Final Score Summary */}
              {gameInfo && (
                <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                  <div className="flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-lg font-semibold text-slate-800">{gameInfo.teams[0]}</div>
                      <div className="text-3xl font-bold text-orange-600">{gameInfo.teamScores[gameInfo.teams[0]]}</div>
                    </div>
                    <div className="mx-8 text-slate-400 font-medium">FINAL</div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-slate-800">{gameInfo.teams[1]}</div>
                      <div className="text-3xl font-bold text-orange-600">{gameInfo.teamScores[gameInfo.teams[1]]}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Team Filter Buttons */}
              {gameInfo && (
                <div className="flex justify-center gap-2">
                  {gameInfo.teams.map((team) => (
                    <button
                      key={team}
                      onClick={() => setSelectedTeam(team)}
                      className={`px-6 py-2 rounded-lg font-medium transition-colors ${
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
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-bold text-slate-800">{selectedTeamStats.name}</h3>
                    <div className="text-3xl font-bold text-orange-600">{selectedTeamStats.score}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-slate-600">Field Goals</div>
                      <div className="font-medium">
                        {selectedTeamStats.totalFgMade}/{selectedTeamStats.totalFgAttempted} 
                        {selectedTeamStats.totalFgAttempted > 0 && (
                          <span className="text-slate-500 ml-1">
                            ({((selectedTeamStats.totalFgMade / selectedTeamStats.totalFgAttempted) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-600">3-Pointers</div>
                      <div className="font-medium">
                        {selectedTeamStats.totalThreeMade}/{selectedTeamStats.totalThreeAttempted}
                        {selectedTeamStats.totalThreeAttempted > 0 && (
                          <span className="text-slate-500 ml-1">
                            ({((selectedTeamStats.totalThreeMade / selectedTeamStats.totalThreeAttempted) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-600">Total Rebounds</div>
                      <div className="font-medium">{selectedTeamStats.totalRebounds}</div>
                    </div>
                    <div>
                      <div className="text-slate-600">Total Assists</div>
                      <div className="font-medium">{selectedTeamStats.totalAssists}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Box Score Table for Selected Team */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    {selectedTeam} Box Score
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left p-3 font-medium text-slate-700">Player</th>
                        <th className="text-center p-3 font-medium text-slate-700">MIN</th>
                        <th className="text-center p-3 font-medium text-slate-700">PTS</th>
                        <th className="text-center p-3 font-medium text-slate-700">FG</th>
                        <th className="text-center p-3 font-medium text-slate-700">3P</th>
                        <th className="text-center p-3 font-medium text-slate-700">FT</th>
                        <th className="text-center p-3 font-medium text-slate-700">REB</th>
                        <th className="text-center p-3 font-medium text-slate-700">AST</th>
                        <th className="text-center p-3 font-medium text-slate-700">STL</th>
                        <th className="text-center p-3 font-medium text-slate-700">BLK</th>
                        <th className="text-center p-3 font-medium text-slate-700">TO</th>
                        <th className="text-center p-3 font-medium text-slate-700">+/-</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTeamPlayers.map((player, index) => (
                        <tr key={player.id} className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-orange-50 transition-colors`}>
                          <td className="p-3">
                            <div>
                              <div className="font-medium text-slate-800">{player.name}</div>
                              {player.number && (
                                <div className="text-xs text-slate-500">#{player.number}</div>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            {player.minutes_played && (
                              <div className="flex items-center justify-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {player.minutes_played}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center font-semibold text-orange-600">{player.points}</td>
                          <td className="p-3 text-center">
                            {player.field_goals_made !== undefined && player.field_goals_attempted !== undefined ? (
                              <div>
                                <div>{player.field_goals_made}/{player.field_goals_attempted}</div>
                                {player.field_goal_percent && (
                                  <div className="text-xs text-slate-500">{player.field_goal_percent}%</div>
                                )}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-center">
                            {player.three_pt_made !== undefined && player.three_pt_attempted !== undefined ? (
                              <div>
                                <div>{player.three_pt_made}/{player.three_pt_attempted}</div>
                                {player.three_pt_percent && (
                                  <div className="text-xs text-slate-500">{player.three_pt_percent}%</div>
                                )}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-center">
                            {player.free_throws_made !== undefined && player.free_throws_attempted !== undefined ? (
                              <div>
                                <div>{player.free_throws_made}/{player.free_throws_attempted}</div>
                                {player.free_throw_percent && (
                                  <div className="text-xs text-slate-500">{player.free_throw_percent}%</div>
                                )}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-center">
                            <div>{player.rebounds_total}</div>
                            {(player.rebounds_o || player.rebounds_d) && (
                              <div className="text-xs text-slate-500">
                                {player.rebounds_o || 0}O {player.rebounds_d || 0}D
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center font-medium">{player.assists}</td>
                          <td className="p-3 text-center">{player.steals || 0}</td>
                          <td className="p-3 text-center">{player.blocks || 0}</td>
                          <td className="p-3 text-center text-red-600">{player.turnovers || 0}</td>
                          <td className="p-3 text-center">
                            {player.plus_minus !== undefined && (
                              <span className={`font-medium ${player.plus_minus >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {player.plus_minus >= 0 ? '+' : ''}{player.plus_minus}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    
                    {/* Team Totals Row */}
                    {selectedTeamStats && (
                      <tfoot className="bg-orange-50 border-t-2 border-orange-200">
                        <tr className="font-semibold text-slate-800">
                          <td className="p-3">TEAM TOTALS</td>
                          <td className="p-3 text-center">-</td>
                          <td className="p-3 text-center text-orange-600">{selectedTeamStats.score}</td>
                          <td className="p-3 text-center">
                            {selectedTeamStats.totalFgMade}/{selectedTeamStats.totalFgAttempted}
                            {selectedTeamStats.totalFgAttempted > 0 && (
                              <div className="text-xs text-slate-500">
                                {((selectedTeamStats.totalFgMade / selectedTeamStats.totalFgAttempted) * 100).toFixed(1)}%
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {selectedTeamStats.totalThreeMade}/{selectedTeamStats.totalThreeAttempted}
                            {selectedTeamStats.totalThreeAttempted > 0 && (
                              <div className="text-xs text-slate-500">
                                {((selectedTeamStats.totalThreeMade / selectedTeamStats.totalThreeAttempted) * 100).toFixed(1)}%
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">-</td>
                          <td className="p-3 text-center">{selectedTeamStats.totalRebounds}</td>
                          <td className="p-3 text-center">{selectedTeamStats.totalAssists}</td>
                          <td className="p-3 text-center">-</td>
                          <td className="p-3 text-center">-</td>
                          <td className="p-3 text-center">-</td>
                          <td className="p-3 text-center">-</td>
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
                        {selectedTeamPlayers.sort((a, b) => (b.points || 0) - (a.points || 0))[0]?.name} - {selectedTeamPlayers.sort((a, b) => (b.points || 0) - (a.points || 0))[0]?.points} points
                      </div>
                    </div>
                    <div className="bg-white rounded-md p-3">
                      <div className="text-orange-600 font-medium">Best Rebounder</div>
                      <div className="text-slate-800">
                        {selectedTeamPlayers.sort((a, b) => (b.rebounds_total || 0) - (a.rebounds_total || 0))[0]?.name} - {selectedTeamPlayers.sort((a, b) => (b.rebounds_total || 0) - (a.rebounds_total || 0))[0]?.rebounds_total} rebounds
                      </div>
                    </div>
                    <div className="bg-white rounded-md p-3">
                      <div className="text-orange-600 font-medium">Best Playmaker</div>
                      <div className="text-slate-800">
                        {selectedTeamPlayers.sort((a, b) => (b.assists || 0) - (a.assists || 0))[0]?.name} - {selectedTeamPlayers.sort((a, b) => (b.assists || 0) - (a.assists || 0))[0]?.assists} assists
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