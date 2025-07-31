import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Trophy, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PlayerStat {
  id: string;
  player_id: string;
  player_name: string;
  team_name: string;
  game_date: string;
  opponent: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  field_goals_made: number;
  field_goals_attempted: number;
  three_pointers_made: number;
  three_pointers_attempted: number;
  free_throws_made: number;
  free_throws_attempted: number;
  minutes_played: number;
}

interface SeasonAverages {
  games_played: number;
  avg_points: number;
  avg_rebounds: number;
  avg_assists: number;
  avg_steals: number;
  avg_blocks: number;
  fg_percentage: number;
  three_point_percentage: number;
  ft_percentage: number;
}

export default function PlayerStatsPage() {
  const [match] = useRoute("/leagues/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const playerId = match?.id;
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
  const [seasonAverages, setSeasonAverages] = useState<SeasonAverages | null>(null);
  const [playerInfo, setPlayerInfo] = useState<{ name: string; team: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;

    const fetchPlayerData = async () => {
      setLoading(true);
      try {
        // Fetch player game stats
        const { data: stats, error: statsError } = await supabase
          .from('player_stats')
          .select('*')
          .eq('player_id', playerId)
          .order('game_date', { ascending: false });

        if (statsError) {
          console.error('Error fetching player stats:', statsError);
          toast({
            title: "Error Loading Stats",
            description: "Failed to load player statistics",
            variant: "destructive",
          });
          return;
        }

        setPlayerStats(stats || []);

        // Calculate season averages if we have stats
        if (stats && stats.length > 0) {
          setPlayerInfo({
            name: stats[0].player_name,
            team: stats[0].team_name
          });

          const totals = stats.reduce((acc, game) => ({
            points: acc.points + (game.points || 0),
            rebounds: acc.rebounds + (game.rebounds || 0),
            assists: acc.assists + (game.assists || 0),
            steals: acc.steals + (game.steals || 0),
            blocks: acc.blocks + (game.blocks || 0),
            field_goals_made: acc.field_goals_made + (game.field_goals_made || 0),
            field_goals_attempted: acc.field_goals_attempted + (game.field_goals_attempted || 0),
            three_pointers_made: acc.three_pointers_made + (game.three_pointers_made || 0),
            three_pointers_attempted: acc.three_pointers_attempted + (game.three_pointers_attempted || 0),
            free_throws_made: acc.free_throws_made + (game.free_throws_made || 0),
            free_throws_attempted: acc.free_throws_attempted + (game.free_throws_attempted || 0),
          }), {
            points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
            field_goals_made: 0, field_goals_attempted: 0,
            three_pointers_made: 0, three_pointers_attempted: 0,
            free_throws_made: 0, free_throws_attempted: 0
          });

          const games = stats.length;
          setSeasonAverages({
            games_played: games,
            avg_points: totals.points / games,
            avg_rebounds: totals.rebounds / games,
            avg_assists: totals.assists / games,
            avg_steals: totals.steals / games,
            avg_blocks: totals.blocks / games,
            fg_percentage: totals.field_goals_attempted > 0 ? (totals.field_goals_made / totals.field_goals_attempted) * 100 : 0,
            three_point_percentage: totals.three_pointers_attempted > 0 ? (totals.three_pointers_made / totals.three_pointers_attempted) * 100 : 0,
            ft_percentage: totals.free_throws_attempted > 0 ? (totals.free_throws_made / totals.free_throws_attempted) * 100 : 0,
          });
        }
      } catch (error) {
        console.error('Error fetching player data:', error);
        toast({
          title: "Error",
          description: "Failed to load player data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [playerId, toast]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-orange-800">Loading player stats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setLocation('/')}
            className="flex items-center gap-2 border-orange-200 hover:bg-orange-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          
          {playerInfo && (
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-orange-600 flex items-center justify-center">
                <User className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-orange-900">{playerInfo.name}</h1>
                <p className="text-orange-700 flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  {playerInfo.team}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Season Averages */}
        {seasonAverages && (
          <Card className="mb-8 border-orange-200 shadow-lg">
            <CardHeader className="bg-orange-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Season Averages ({seasonAverages.games_played} games)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{seasonAverages.avg_points.toFixed(1)}</div>
                  <div className="text-sm text-orange-700">PPG</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{seasonAverages.avg_rebounds.toFixed(1)}</div>
                  <div className="text-sm text-orange-700">RPG</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{seasonAverages.avg_assists.toFixed(1)}</div>
                  <div className="text-sm text-orange-700">APG</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{formatPercentage(seasonAverages.fg_percentage)}</div>
                  <div className="text-sm text-orange-700">FG%</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{formatPercentage(seasonAverages.three_point_percentage)}</div>
                  <div className="text-sm text-orange-700">3P%</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{formatPercentage(seasonAverages.ft_percentage)}</div>
                  <div className="text-sm text-orange-700">FT%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Game Log */}
        <Card className="border-orange-200 shadow-lg">
          <CardHeader className="bg-orange-100 border-b border-orange-200">
            <CardTitle className="flex items-center gap-2 text-orange-900">
              <Calendar className="h-5 w-5" />
              Game Log
            </CardTitle>
            <CardDescription className="text-orange-700">
              Recent game performances
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {playerStats.length === 0 ? (
              <div className="p-8 text-center text-orange-600">
                No game statistics found for this player.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-orange-50 border-b border-orange-200">
                    <tr className="text-left">
                      <th className="px-4 py-3 text-orange-900 font-semibold">Date</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">Opponent</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">MIN</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">PTS</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">REB</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">AST</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">STL</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">BLK</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">FG</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">3P</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">FT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((game, index) => (
                      <tr 
                        key={game.id} 
                        className={`border-b border-orange-100 hover:bg-orange-50 transition-colors ${
                          index % 2 === 0 ? 'bg-white' : 'bg-orange-25'
                        }`}
                      >
                        <td className="px-4 py-3 text-orange-800">{formatDate(game.game_date)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="border-orange-300 text-orange-700">
                            vs {game.opponent}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-orange-800">{game.minutes_played || 0}</td>
                        <td className="px-4 py-3 font-semibold text-orange-900">{game.points || 0}</td>
                        <td className="px-4 py-3 text-orange-800">{game.rebounds || 0}</td>
                        <td className="px-4 py-3 text-orange-800">{game.assists || 0}</td>
                        <td className="px-4 py-3 text-orange-800">{game.steals || 0}</td>
                        <td className="px-4 py-3 text-orange-800">{game.blocks || 0}</td>
                        <td className="px-4 py-3 text-orange-800">
                          {game.field_goals_made || 0}/{game.field_goals_attempted || 0}
                        </td>
                        <td className="px-4 py-3 text-orange-800">
                          {game.three_pointers_made || 0}/{game.three_pointers_attempted || 0}
                        </td>
                        <td className="px-4 py-3 text-orange-800">
                          {game.free_throws_made || 0}/{game.free_throws_attempted || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}