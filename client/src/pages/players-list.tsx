import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, User, Trophy, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Player {
  name: string;
  team_name: string;
  player_id: string;
  games_played: number;
  avg_points: number;
  avg_rebounds: number;
  avg_assists: number;
}

export default function PlayersListPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayers = async () => {
      setLoading(true);
      try {
        console.log("Fetching all player stats to create player list...");
        
        // Get all player stats to build player list
        const { data: allStats, error } = await supabase
          .from('player_stats')
          .select('*');

        console.log("All player stats:", allStats);
        console.log("Error:", error);

        if (error) {
          console.error('Error fetching player stats:', error);
          toast({
            title: "Error Loading Players",
            description: "Failed to load player list from database",
            variant: "destructive",
          });
          return;
        }

        if (!allStats || allStats.length === 0) {
          console.log("No player stats found in database");
          setPlayers([]);
          setFilteredPlayers([]);
          return;
        }

        // Group stats by player and calculate averages
        const playerMap = new Map<string, {
          name: string;
          team_name: string;
          player_id: string;
          stats: any[];
        }>();

        allStats.forEach((stat) => {
          // Use name field or fallback to player_name
          const playerName = stat.name || stat.player_name || 'Unknown Player';
          const playerId = stat.player_id || stat.id;
          
          if (!playerMap.has(playerName)) {
            playerMap.set(playerName, {
              name: playerName,
              team_name: stat.team_name || stat.team || 'Unknown Team',
              player_id: playerId,
              stats: []
            });
          }
          
          playerMap.get(playerName)!.stats.push(stat);
        });

        // Calculate averages for each player
        const playersWithAverages: Player[] = Array.from(playerMap.values()).map(player => {
          const stats = player.stats;
          const gamesPlayed = stats.length;
          
          const totals = stats.reduce((acc, game) => ({
            points: acc.points + (game.points || 0),
            rebounds: acc.rebounds + (game.rebounds || 0),
            assists: acc.assists + (game.assists || 0),
          }), { points: 0, rebounds: 0, assists: 0 });

          return {
            name: player.name,
            team_name: player.team_name,
            player_id: player.player_id,
            games_played: gamesPlayed,
            avg_points: gamesPlayed > 0 ? totals.points / gamesPlayed : 0,
            avg_rebounds: gamesPlayed > 0 ? totals.rebounds / gamesPlayed : 0,
            avg_assists: gamesPlayed > 0 ? totals.assists / gamesPlayed : 0,
          };
        });

        console.log("Processed players with averages:", playersWithAverages);
        
        setPlayers(playersWithAverages);
        setFilteredPlayers(playersWithAverages);
      } catch (error) {
        console.error('Error processing player data:', error);
        toast({
          title: "Error",
          description: "Failed to process player data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, [toast]);

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredPlayers(players);
    } else {
      const filtered = players.filter(player =>
        player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.team_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredPlayers(filtered);
    }
  }, [searchTerm, players]);

  const handlePlayerClick = (playerId: string) => {
    setLocation(`/player/${playerId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-orange-800">Loading players...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-orange-900 mb-2">Players</h1>
          <p className="text-orange-700">Browse all players and their season statistics</p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-orange-400 h-4 w-4" />
            <Input
              placeholder="Search players or teams..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-orange-200 focus:border-orange-400"
            />
          </div>
        </div>

        {/* Player Cards */}
        {filteredPlayers.length === 0 ? (
          <Card className="border-orange-200">
            <CardContent className="p-8 text-center">
              <User className="h-16 w-16 text-orange-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-orange-900 mb-2">No Players Found</h3>
              <p className="text-orange-600">
                {players.length === 0 
                  ? "No player statistics are available in the database."
                  : "No players match your search criteria."
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlayers.map((player) => (
              <Card 
                key={`${player.name}-${player.player_id}`}
                className="border-orange-200 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer hover:scale-105"
                onClick={() => handlePlayerClick(player.player_id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-orange-600 flex items-center justify-center">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-orange-900 text-lg">{player.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1">
                        <Trophy className="h-3 w-3" />
                        {player.team_name}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{player.avg_points.toFixed(1)}</div>
                      <div className="text-xs text-orange-700">PPG</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{player.avg_rebounds.toFixed(1)}</div>
                      <div className="text-xs text-orange-700">RPG</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{player.avg_assists.toFixed(1)}</div>
                      <div className="text-xs text-orange-700">APG</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-orange-300 text-orange-700">
                      {player.games_played} games
                    </Badge>
                    <Button 
                      size="sm" 
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayerClick(player.player_id);
                      }}
                    >
                      <TrendingUp className="h-3 w-3 mr-1" />
                      View Stats
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}