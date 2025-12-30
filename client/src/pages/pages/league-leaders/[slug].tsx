import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Trophy, TrendingUp, Users, Target, Shield, Zap, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { namesMatch, getMostCompleteName } from "@/lib/fuzzyMatch";

interface LeaderboardStats {
  points: any[];
  rebounds_total: any[];
  assists: any[];
  steals: any[];
  blocks: any[];
  field_goal_percentage: any[];
  three_point_percentage: any[];
  free_throw_percentage: any[];
  games_played: any[];
}

interface League {
  league_id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
}

export default function LeagueLeadersPage() {
  const { slug } = useParams();
  const [location, navigate] = useLocation();
  const [league, setLeague] = useState<League | null>(null);
  const [leaderboardStats, setLeaderboardStats] = useState<LeaderboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'averages' | 'totals'>('averages');

  useEffect(() => {
    const fetchLeagueAndStats = async () => {
      if (!slug) return;

      try {
        setLoading(true);
        setError(null);

        // Fetch league information
        const { data: leagueData, error: leagueError } = await supabase
          .from("leagues")
          .select("*")
          .eq("slug", slug)
          .single();

        if (leagueError) {
          setError("League not found");
          return;
        }

        setLeague(leagueData);

        if (!leagueData?.league_id) {
          setError("League ID not found");
          return;
        }

        // Fetch ALL player stats for the league with pagination to bypass 1000 row limit
        let allPlayerStats: any[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
          const { data: pageData, error: pageError } = await supabase
            .from("player_stats")
            .select("*, players:player_id(full_name, slug)")
            .eq("league_id", leagueData.league_id)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          
          if (pageError) {
            console.error("Error fetching player stats page", page, ":", pageError);
            break;
          }
          
          if (pageData && pageData.length > 0) {
            allPlayerStats = [...allPlayerStats, ...pageData];
            console.log("📊 League Leaders: Fetched page", page, "with", pageData.length, "records, total:", allPlayerStats.length);
            hasMore = pageData.length === pageSize;
            page++;
          } else {
            hasMore = false;
          }
        }
        
        console.log("📊 League Leaders: Fetched", allPlayerStats.length, "total stat records");

        if (!allPlayerStats || allPlayerStats.length === 0) {
          setError("No player statistics found for this league");
          return;
        }

        // Process stats to create leaderboards
        const processedStats: LeaderboardStats = {
          points: [],
          rebounds_total: [],
          assists: [],
          steals: [],
          blocks: [],
          field_goal_percentage: [],
          three_point_percentage: [],
          free_throw_percentage: [],
          games_played: []
        };

        // Use shared fuzzy matching from fuzzyMatch.ts
        // namesMatch handles: number stripping, initial matching (R Farrell vs Rhys Farrell), 
        // Jaro-Winkler similarity at 0.85 threshold for typo tolerance

        // First pass: Group stats by player_id
        const playerStatsMap = new Map();

        allPlayerStats.forEach(stat => {
          // Use the correct team field from the data structure
          const teamName = stat.team || stat.team_name || 'Unknown Team';
          // Use full_name from players table, fallback to existing name, then combine firstname/familyname
          const playerName = stat.full_name || 
                            stat.players?.full_name || 
                            stat.name || 
                            `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || 
                            'Unknown Player';
          // Use player_id for grouping to avoid name mismatches, fallback to record id
          const playerKey = stat.player_id || stat.id;
          if (!playerStatsMap.has(playerKey)) {
            playerStatsMap.set(playerKey, {
              player_id: stat.player_id || stat.id, // Use player_id if available, otherwise use id
              player_slug: stat.players?.slug || null, // Get slug from joined players table
              name: playerName,
              team_name: teamName,
              total_points: 0,
              total_rebounds: 0,
              total_assists: 0,
              total_steals: 0,
              total_blocks: 0,
              total_field_goals_made: 0,
              total_field_goals_attempted: 0,
              total_three_points_made: 0,
              total_three_points_attempted: 0,
              total_free_throws_made: 0,
              total_free_throws_attempted: 0,
              games_played: 0
            });
          }

          const playerData = playerStatsMap.get(playerKey);
          playerData.total_points += stat.spoints || 0;
          playerData.total_rebounds += stat.sreboundstotal || 0;
          playerData.total_assists += stat.sassists || 0;
          playerData.total_steals += stat.ssteals || 0;
          playerData.total_blocks += stat.sblocks || 0;
          playerData.total_field_goals_made += stat.sfieldgoalsmade || 0;
          playerData.total_field_goals_attempted += stat.sfieldgoalsattempted || 0;
          playerData.total_three_points_made += stat.sthreepointersmade || 0;
          playerData.total_three_points_attempted += stat.sthreepointersattempted || 0;
          playerData.total_free_throws_made += stat.sfreethrowsmade || 0;
          playerData.total_free_throws_attempted += stat.sfreethrowsattempted || 0;
          playerData.games_played += 1;
        });

        // Second pass: Merge duplicates by name (handles data quality issues where same player has multiple IDs)
        // Uses shared namesMatch which handles: numbers in names, initials, typos via Jaro-Winkler
        const playersByIdArray = Array.from(playerStatsMap.values());
        const mergedPlayers: typeof playersByIdArray = [];
        
        playersByIdArray.forEach((player) => {
          // Check if we already have a similar name on the SAME TEAM (prevents false positives)
          let foundMatch = false;
          for (const existingPlayer of mergedPlayers) {
            // Only merge if same team AND names match (handles typos, initials, numbers)
            const sameTeam = existingPlayer.team_name === player.team_name;
            if (sameTeam && namesMatch(player.name, existingPlayer.name)) {
              // Merge stats with existing player
              existingPlayer.games_played += player.games_played;
              existingPlayer.total_points += player.total_points;
              existingPlayer.total_rebounds += player.total_rebounds;
              existingPlayer.total_assists += player.total_assists;
              existingPlayer.total_steals += player.total_steals;
              existingPlayer.total_blocks += player.total_blocks;
              existingPlayer.total_field_goals_made += player.total_field_goals_made;
              existingPlayer.total_field_goals_attempted += player.total_field_goals_attempted;
              existingPlayer.total_three_points_made += player.total_three_points_made;
              existingPlayer.total_three_points_attempted += player.total_three_points_attempted;
              existingPlayer.total_free_throws_made += player.total_free_throws_made;
              existingPlayer.total_free_throws_attempted += player.total_free_throws_attempted;
              // Keep the most complete name (prefers full names over initials)
              existingPlayer.name = getMostCompleteName([existingPlayer.name, player.name]);
              // Keep player_slug if one exists
              if (!existingPlayer.player_slug && player.player_slug) {
                existingPlayer.player_slug = player.player_slug;
              }
              foundMatch = true;
              break;
            }
          }
          
          if (!foundMatch) {
            // First time seeing this player - add them
            mergedPlayers.push({ ...player });
          }
        });

        const playersArray = mergedPlayers;

        // Data processing complete

        // Create leaderboards for each category
        processedStats.points = playersArray
          .map(p => ({
            ...p,
            avg_points: p.total_points / p.games_played,
            display_value: viewMode === 'averages' 
              ? `${(p.total_points / p.games_played).toFixed(1)} PPG`
              : `${Math.round(p.total_points)} PTS`
          }))
          .sort((a, b) => viewMode === 'averages' 
            ? b.avg_points - a.avg_points 
            : b.total_points - a.total_points)
          .slice(0, 5);

        processedStats.rebounds_total = playersArray
          .map(p => ({
            ...p,
            avg_rebounds: p.total_rebounds / p.games_played,
            display_value: viewMode === 'averages'
              ? `${(p.total_rebounds / p.games_played).toFixed(1)} RPG`
              : `${Math.round(p.total_rebounds)} REB`
          }))
          .sort((a, b) => viewMode === 'averages'
            ? b.avg_rebounds - a.avg_rebounds
            : b.total_rebounds - a.total_rebounds)
          .slice(0, 5);

        processedStats.assists = playersArray
          .map(p => ({
            ...p,
            avg_assists: p.total_assists / p.games_played,
            display_value: viewMode === 'averages'
              ? `${(p.total_assists / p.games_played).toFixed(1)} APG`
              : `${Math.round(p.total_assists)} AST`
          }))
          .sort((a, b) => viewMode === 'averages'
            ? b.avg_assists - a.avg_assists
            : b.total_assists - a.total_assists)
          .slice(0, 5);

        processedStats.steals = playersArray
          .map(p => ({
            ...p,
            avg_steals: p.total_steals / p.games_played,
            display_value: viewMode === 'averages'
              ? `${(p.total_steals / p.games_played).toFixed(1)} SPG`
              : `${Math.round(p.total_steals)} STL`
          }))
          .sort((a, b) => viewMode === 'averages'
            ? b.avg_steals - a.avg_steals
            : b.total_steals - a.total_steals)
          .slice(0, 5);

        processedStats.blocks = playersArray
          .map(p => ({
            ...p,
            avg_blocks: p.total_blocks / p.games_played,
            display_value: viewMode === 'averages'
              ? `${(p.total_blocks / p.games_played).toFixed(1)} BPG`
              : `${Math.round(p.total_blocks)} BLK`
          }))
          .sort((a, b) => viewMode === 'averages'
            ? b.avg_blocks - a.avg_blocks
            : b.total_blocks - a.total_blocks)
          .slice(0, 5);

        // Calculate shooting percentages (minimum 1 game)
        const playersWithEnoughGames = playersArray.filter(p => p.games_played >= 1);

        processedStats.field_goal_percentage = playersWithEnoughGames
          .map(p => ({
            ...p,
            fg_percentage: p.total_field_goals_attempted > 0 
              ? (p.total_field_goals_made / p.total_field_goals_attempted) * 100 
              : 0,
            display_value: p.total_field_goals_attempted > 0 
              ? `${((p.total_field_goals_made / p.total_field_goals_attempted) * 100).toFixed(1)}%`
              : "0.0%"
          }))
          .filter(p => p.total_field_goals_attempted >= 2) // Minimum 2 attempts
          .sort((a, b) => b.fg_percentage - a.fg_percentage)
          .slice(0, 5);

        processedStats.three_point_percentage = playersWithEnoughGames
          .map(p => ({
            ...p,
            three_point_percentage: p.total_three_points_attempted > 0 
              ? (p.total_three_points_made / p.total_three_points_attempted) * 100 
              : 0,
            display_value: p.total_three_points_attempted > 0 
              ? `${((p.total_three_points_made / p.total_three_points_attempted) * 100).toFixed(1)}%`
              : "0.0%"
          }))
          .filter(p => p.total_three_points_attempted >= 1) // Minimum 1 attempt
          .sort((a, b) => b.three_point_percentage - a.three_point_percentage)
          .slice(0, 5);

        processedStats.free_throw_percentage = playersWithEnoughGames
          .map(p => ({
            ...p,
            ft_percentage: p.total_free_throws_attempted > 0 
              ? (p.total_free_throws_made / p.total_free_throws_attempted) * 100 
              : 0,
            display_value: p.total_free_throws_attempted > 0 
              ? `${((p.total_free_throws_made / p.total_free_throws_attempted) * 100).toFixed(1)}%`
              : "0.0%"
          }))
          .filter(p => p.total_free_throws_attempted >= 1) // Minimum 1 attempt
          .sort((a, b) => b.ft_percentage - a.ft_percentage)
          .slice(0, 5);

        // Games played is same for both modes (no average needed)
        processedStats.games_played = playersArray
          .map(p => ({
            ...p,
            display_value: `${p.games_played} GP`
          }))
          .sort((a, b) => b.games_played - a.games_played)
          .slice(0, 5);

        setLeaderboardStats(processedStats);

      } catch (err) {
        console.error("Error fetching league leaders:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchLeagueAndStats();
  }, [slug, viewMode]);

  const StatLeaderboard = ({ 
    title, 
    icon: Icon, 
    players, 
    iconColor 
  }: { 
    title: string; 
    icon: any; 
    players: any[]; 
    iconColor: string;
  }) => (
    <Card className="bg-white dark:bg-neutral-900 border-orange-200 dark:border-neutral-700 shadow-[0_4px_20px_rgba(255,115,0,0.1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_30px_rgba(255,115,0,0.15)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all duration-300">
      <CardHeader className="pb-2 md:pb-3 p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-base md:text-lg font-semibold text-orange-800 dark:text-orange-400">
          <Icon className={`h-5 w-5 md:h-6 md:w-6 ${iconColor}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 md:p-6 pt-0">
        {players.length > 0 ? (
          players.map((player, index) => (
            <div 
              key={`${player.player_id}-${index}`} 
              className="flex items-center justify-between py-2 md:py-3 px-2 md:px-3 rounded-lg bg-orange-50 dark:bg-neutral-800 hover:bg-orange-100 dark:hover:bg-neutral-700 transition-colors duration-200 cursor-pointer"
              onClick={() => {
                const identifier = player.player_slug || player.player_id;
                if (identifier) navigate(`/player/${identifier}`);
              }}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className={`
                  w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-bold text-white
                  ${index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : 
                    index === 1 ? 'bg-gradient-to-br from-gray-400 to-gray-600' :
                    index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
                    'bg-gradient-to-br from-orange-300 to-orange-400'}
                `}>
                  {index + 1}
                </div>
                <div>
                  <p className="text-sm md:text-base font-medium text-orange-900 dark:text-orange-300">{player.name}</p>
                  <p className="text-xs md:text-sm text-gray-800 dark:text-white">{player.team_name || 'Unknown Team'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm md:text-base font-bold text-orange-800 dark:text-orange-400">{player.display_value}</p>
                <p className="text-xs text-orange-600 dark:text-orange-500">{player.games_played} games</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-orange-600 dark:text-orange-400 text-center py-4">No data available</p>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
            <p className="text-orange-700 dark:text-orange-400">Loading league leaders...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-red-500 text-xl">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Unable to Load League Leaders</h2>
            <p className="text-gray-600 dark:text-gray-400">{error}</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Header />

      <main className="flex-grow p-4 md:p-6 max-w-7xl mx-auto space-y-6 md:space-y-8">
        {/* Back Button */}
        <button
          onClick={() => navigate(`/league/${slug}`)}
          className="flex items-center gap-2 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium transition-colors"
          data-testid="button-back-to-league"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to League</span>
        </button>

        {/* Header Section */}
        <div className="text-center space-y-3 md:space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3">
            <Trophy className="h-6 w-6 md:h-8 md:w-8 text-orange-500" />
            <h1 className="sr-only">League Leaders</h1>
          </div>
          <h2 className="text-xl md:text-2xl font-semibold text-orange-800 dark:text-orange-300">{league?.name}</h2>
          {league?.description && (
            <p className="text-sm md:text-base text-gray-800 dark:text-white max-w-2xl mx-auto">{league.description}</p>
          )}
          
          {/* Toggle between Averages and Totals */}
          <div className="flex justify-center pt-2">
            <div className="inline-flex rounded-lg border border-orange-200 dark:border-neutral-700 bg-orange-50 dark:bg-neutral-800 p-1">
              <button
                onClick={() => setViewMode('averages')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  viewMode === 'averages'
                    ? 'bg-white dark:bg-neutral-700 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-orange-700 dark:text-orange-500 hover:text-orange-800 dark:hover:text-orange-300'
                }`}
                data-testid="button-view-averages"
              >
                Averages
              </button>
              <button
                onClick={() => setViewMode('totals')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  viewMode === 'totals'
                    ? 'bg-white dark:bg-neutral-700 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-orange-700 dark:text-orange-500 hover:text-orange-800 dark:hover:text-orange-300'
                }`}
                data-testid="button-view-totals"
              >
                Totals
              </button>
            </div>
          </div>
        </div>

        {/* Leaderboards Grid */}
        {leaderboardStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {/* Scoring */}
            <StatLeaderboard
              title="Scoring Leaders"
              icon={Target}
              players={leaderboardStats.points}
              iconColor="text-red-500"
            />

            {/* Rebounds */}
            <StatLeaderboard
              title="Rebounding Leaders"
              icon={Shield}
              players={leaderboardStats.rebounds_total}
              iconColor="text-blue-500"
            />

            {/* Assists */}
            <StatLeaderboard
              title="Assist Leaders"
              icon={Users}
              players={leaderboardStats.assists}
              iconColor="text-green-500"
            />

            {/* Steals */}
            <StatLeaderboard
              title="Steal Leaders"
              icon={Zap}
              players={leaderboardStats.steals}
              iconColor="text-purple-500"
            />

            {/* Blocks */}
            <StatLeaderboard
              title="Block Leaders"
              icon={Shield}
              players={leaderboardStats.blocks}
              iconColor="text-indigo-500"
            />

            {/* Field Goal % */}
            <StatLeaderboard
              title="Field Goal %"
              icon={Target}
              players={leaderboardStats.field_goal_percentage}
              iconColor="text-orange-500"
            />

            {/* Three Point % */}
            <StatLeaderboard
              title="Three Point %"
              icon={Target}
              players={leaderboardStats.three_point_percentage}
              iconColor="text-cyan-500"
            />

            {/* Free Throw % */}
            <StatLeaderboard
              title="Free Throw %"
              icon={Target}
              players={leaderboardStats.free_throw_percentage}
              iconColor="text-pink-500"
            />

            {/* Games Played */}
            <StatLeaderboard
              title="Games Played"
              icon={TrendingUp}
              players={leaderboardStats.games_played}
              iconColor="text-gray-500"
            />
          </div>
        )}

        {/* Note about minimum requirements */}
        <div className="bg-orange-50 dark:bg-neutral-800 border border-orange-200 dark:border-neutral-700 rounded-lg p-3 md:p-4 text-center">
          <p className="text-xs md:text-sm text-orange-700 dark:text-orange-400">
            * Shooting percentages require minimum attempts: Field Goals (2+), Three Pointers (1+), Free Throws (1+)
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}