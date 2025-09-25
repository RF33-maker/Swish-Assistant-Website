import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import LeagueDefaultImage from "@/assets/league-default.png";
import React from "react";
import { GameSummaryRow } from "./GameSummaryRow";
import GameResultsCarousel from "@/components/GameResultsCarousel";
import GameDetailModal from "@/components/GameDetailModal";
import LeagueChatbot from "@/components/LeagueChatbot";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamLogoUploader } from "@/components/TeamLogoUploader";
import { 
  LoadingSkeleton, 
  PlayerRowSkeleton, 
  StandingsRowSkeleton, 
  LeaderCardSkeleton,
  ProfileSkeleton,
  CompactLoadingSkeleton
} from "@/components/skeletons/LoadingSkeleton";



  export default function LeaguePage() {
    const { slug } = useParams();
    const [search, setSearch] = useState("");
    const [location, navigate] = useLocation();
    const [league, setLeague] = useState(null);
    const [topScorer, setTopScorer] = useState<PlayerStat | null>(null);
    const [topRebounder, setTopRebounder] = useState<PlayerStat | null>(null);
    const [topAssists, setTopAssists] = useState<PlayerStat | null>(null);
    const [standings, setStandings] = useState([]);
    const [schedule, setSchedule] = useState([]);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [gameSummaries, setGameSummaries] = useState<any[]>([]);
    const [playerStats, setPlayerStats] = useState<any[]>([]);
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [playerSearch, setPlayerSearch] = useState("");
    const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
    const [prompt, setPrompt] = useState("");
    const [sortField, setSortField] = useState("points");
    const [sortOrder, setSortOrder] = useState("desc");
    const [sortBy, setSortBy] = useState("points");
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [isEditingInstagram, setIsEditingInstagram] = useState(false);
  const [updatingInstagram, setUpdatingInstagram] = useState(false);
  const [activeSection, setActiveSection] = useState('overview'); // 'overview', 'stats', 'teams', 'schedule'
  const [allPlayerAverages, setAllPlayerAverages] = useState<any[]>([]);
  const [displayedPlayerCount, setDisplayedPlayerCount] = useState(20); // For pagination
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isLoadingStandings, setIsLoadingStandings] = useState(false);
  const [isLoadingLeaders, setIsLoadingLeaders] = useState(false);

    


    useEffect(() => {
      const fetchSuggestions = async () => {
        if (search.trim().length === 0) {
          setSuggestions([]);
          return;
        }

        const { data, error } = await supabase
          .from("leagues")
          .select("name, slug")
          .ilike("name", `%${search}%`)
          .eq("is_public", true)
          .limit(5);

        if (!error) {
          setSuggestions(data || []);
        } else {
          console.error("Suggestion error:", error);
        }
      };

      const delay = setTimeout(fetchSuggestions, 300);
      return () => clearTimeout(delay);
    }, [search]);



    useEffect(() => {
      const fetchUserAndLeague = async () => {
        // First get the current user
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);
        
        // Then fetch league data
        const { data, error } = await supabase
          .from("leagues")
          .select("*")
          .eq("slug", slug)
          .single();
        
        console.log("Resolved league from slug:", slug, "→ ID:", data?.league_id);
        console.log("League data:", data);
        console.log("Current user:", user);
        console.log("Fetch error:", error);

        if (data) {
          setLeague(data);
          // Now check ownership with the fetched user data
          const ownerStatus = user?.id === data.user_id || user?.id === data.created_by;
          setIsOwner(ownerStatus);
          setInstagramUrl(data.instagram_embed_url || "");
          console.log("Is owner?", ownerStatus, "User ID:", user?.id, "League owner ID:", data.user_id);
        }
        
        if (error) {
          console.error("Failed to fetch league:", error);
          // Still set empty league data to show the page structure
          setLeague(null);
        }

        if (data?.league_id) {
          setIsLoadingLeaders(true);
          setIsLoadingStandings(true);
          
          const fetchTopStats = async () => {
            const { data: scorerData, error: scorerError } = await supabase
              .from("player_stats")
              .select("firstname, familyname, spoints")
              .eq("league_id", data.league_id)
              .order("spoints", { ascending: false })
              .limit(1)
              .single();
            

            const { data: reboundData } = await supabase
              .from("player_stats")
              .select("firstname, familyname, sreboundstotal")
              .eq("league_id", data.league_id)
              .order("sreboundstotal", { ascending: false })
              .limit(1)
              .single();

            const { data: assistData } = await supabase
              .from("player_stats")
              .select("firstname, familyname, sassists")
              .eq("league_id", data.league_id)
              .order("sassists", { ascending: false })
              .limit(1)
              .single();

            const { data: recentGames } = await supabase
              .from("player_stats")
              .select("firstname, familyname, created_at, spoints, sassists, sreboundstotal")
              .eq("league_id", data.league_id)
              .order("created_at", { ascending: false })
              .limit(5);

            const { data: allPlayerStats, error: allStatsError } = await supabase
              .from("player_stats")
              .select("*")
              .eq("league_id", data.league_id);
            

            // Process the data to combine names and handle missing fields
            const processPlayerData = (player: any) => {
              if (!player) return null;
              return {
                ...player,
                name: player.firstname && player.familyname ? 
                  `${player.firstname} ${player.familyname}` : 
                  player.firstname || player.familyname || 'Unknown Player',
                team: 'Team Not Available' // Since team data is missing
              };
            };
            
            setTopScorer(processPlayerData(scorerData));
            setTopRebounder(processPlayerData(reboundData));
            setTopAssists(processPlayerData(assistData));
            
            // Process recent games (using recent stat entries instead since we don't have game data)
            const processedRecentGames = recentGames?.map(processPlayerData) || [];
            setGameSummaries(processedRecentGames);
            setPlayerStats(allPlayerStats || []);
            
            // Calculate standings using team_stats first, fallback to player_stats
            await calculateStandingsWithTeamStats(data.league_id, allPlayerStats || []);
            
            // Reset loading states
            setIsLoadingLeaders(false);
            setIsLoadingStandings(false);
          };

          fetchTopStats();
          fetchAllPlayerAverages();
        }
      };

      fetchUserAndLeague();
    }, [slug]);

    const handleSearch = () => {
      if (search.trim()) {
        navigate(`/league/${search}`);
      }
    };

    const sortMap: Record<string, string> = {
      "Top Scorers": "spoints",
      "Top Rebounders": "sreboundstotal",
      "Top Playmakers": "sassists",
    };

    const sortedStats = [...playerStats].sort((a, b) => {
      const aValue = a[sortField] ?? 0;
      const bValue = b[sortField] ?? 0;
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    });

    const getTopList = (key: string) => {
      const grouped = playerStats.reduce((acc, curr) => {
        // Create player name from firstname and familyname fields
        const playerName = `${curr.firstname || ''} ${curr.familyname || ''}`.trim() || curr.name || 'Unknown Player';
        const playerKey = playerName;
        if (!acc[playerKey]) {
          acc[playerKey] = { ...curr, name: playerName, games: 1 };
        } else {
          acc[playerKey][key] += curr[key];
          acc[playerKey].games += 1;
        }
        return acc;
      }, {});

      const players = Object.values(grouped).map((p: any) => ({
        ...p,
        avg: (p[key] / p.games).toFixed(1),
      }));

      return players.sort((a, b) => b.avg - a.avg).slice(0, 5);
    };

    const topScorers = getTopList("spoints");
    const topRebounders = getTopList("sreboundstotal");
    const topAssistsList = getTopList("sassists");

    const handleGameClick = (gameId: string) => {
      setSelectedGameId(gameId);
      setIsGameModalOpen(true);
    };

    const handleCloseGameModal = () => {
      setIsGameModalOpen(false);
      setSelectedGameId(null);
    };

    const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !league?.league_id || !currentUser) {
        console.error('Missing requirements:', { file: !!file, league_id: league?.league_id, user: !!currentUser });
        return;
      }

      setUploadingBanner(true);
      try {
        console.log('Starting banner upload for league:', league.league_id);
        
        // Upload file to Supabase storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${league.league_id}_${Date.now()}.${fileExt}`;
        
        console.log('Uploading file:', fileName);
        const { data, error: uploadError } = await supabase.storage
          .from('league-banners')
          .upload(fileName, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          alert(`Failed to upload banner: ${uploadError.message}`);
          return;
        }

        console.log('File uploaded successfully:', data);

        // Get public URL without cache-busting for database storage
        const { data: { publicUrl } } = supabase.storage
          .from('league-banners')
          .getPublicUrl(fileName);
        
        console.log('Public URL:', publicUrl);

        // First check if banner_url column exists by trying a simple select
        const { data: checkData, error: checkError } = await supabase
          .from('leagues')
          .select('banner_url')
          .eq('league_id', league.league_id)
          .single();
        
        console.log('Column check result:', checkData, checkError);

        // Try updating by slug instead of league_id
        const { data: updateData, error: updateError } = await supabase
          .from('leagues')
          .update({ banner_url: publicUrl })
          .eq('slug', slug)
          .select();

        if (updateError) {
          console.error('Database update error:', updateError);
          alert(`Failed to update banner in database: ${updateError.message}`);
          return;
        }

        console.log('Database updated successfully:', updateData);

        // Update local state immediately with the new banner URL
        const updatedLeagueData = { ...league, banner_url: publicUrl };
        setLeague(updatedLeagueData);
        console.log('Updated local league state with banner URL:', publicUrl);
        
        // Force a refetch to ensure the banner persists
        setTimeout(async () => {
          const { data: updatedLeague, error: fetchError } = await supabase
            .from('leagues')
            .select('*')
            .eq('slug', slug)
            .single();
          
          if (fetchError) {
            console.error('Refetch error:', fetchError);
          } else {
            console.log('Refetched league data:', updatedLeague);
            setLeague(updatedLeague);
          }
        }, 1000);
        
        alert('Banner updated successfully!');
      } catch (error) {
        console.error('Banner upload error:', error);
        alert(`Failed to upload banner: ${error.message}`);
      } finally {
        setUploadingBanner(false);
        // Reset file input
        event.target.value = '';
      }
    };

    // Handle Instagram URL update
    const handleInstagramUpdate = async () => {
      if (!isOwner || !league) return;
      
      setUpdatingInstagram(true);
      try {
        const { data, error } = await supabase
          .from('leagues')
          .update({ instagram_embed_url: instagramUrl })
          .eq('league_id', league.league_id)
          .select()
          .single();

        if (error) {
          console.error('Instagram update error:', error);
          alert('Failed to update Instagram URL');
          return;
        }

        setLeague({ ...league, instagram_embed_url: instagramUrl });
        setIsEditingInstagram(false);
        alert('Instagram URL updated successfully!');
      } catch (error) {
        console.error('Instagram update error:', error);
        alert(`Failed to update Instagram URL: ${error.message}`);
      } finally {
        setUpdatingInstagram(false);
      }
    };

    // Convert Instagram profile URL to embed URL for latest posts
    const getInstagramEmbedUrl = (url: string) => {
      if (!url) return null;
      
      console.log('Processing Instagram URL:', url);
      
      // Clean the URL by removing query parameters
      const cleanUrl = url.split('?')[0];
      
      // Check if it's a profile URL (instagram.com/username)
      const profileRegex = /(?:instagram\.com\/)([A-Za-z0-9._]+)(?:\/)?$/;
      const profileMatch = cleanUrl.match(profileRegex);
      
      if (profileMatch) {
        const embedUrl = `https://www.instagram.com/${profileMatch[1]}/embed`;
        console.log('Generated profile embed URL:', embedUrl);
        return embedUrl;
      }
      
      // Fallback: Extract post ID from specific post URLs
      const postRegex = /(?:instagram\.com\/p\/|instagram\.com\/reel\/)([A-Za-z0-9_-]+)/;
      const postMatch = cleanUrl.match(postRegex);
      
      if (postMatch) {
        const embedUrl = `https://www.instagram.com/p/${postMatch[1]}/embed`;
        console.log('Generated post embed URL:', embedUrl);
        return embedUrl;
      }
      
      console.log('No match found for URL:', url);
      return null;
    };

    const fetchAllPlayerAverages = async () => {
      if (!league?.league_id) return;

      setIsLoadingStats(true);
      try {
        const { data: playerStats, error } = await supabase
          .from("player_stats")
          .select("*")
          .eq("league_id", league.league_id);

        if (error) {
          console.error("Error fetching player averages:", error);
          return;
        }

        // console.log("📊 Sample player stat data:", playerStats?.[0]); // Debug log to see actual field names

      // Group stats by player and calculate averages
      const playerMap = new Map();
      
      playerStats?.forEach(stat => {
        // Create player name from firstname and familyname
        const playerName = `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || stat.name || 'Unknown Player';
        const playerKey = playerName;
        if (!playerMap.has(playerKey)) {
          playerMap.set(playerKey, {
            name: playerName,
            team: stat.team,
            id: stat.id,
            games: 0,
            totalPoints: 0,
            totalRebounds: 0,
            totalAssists: 0,
            totalSteals: 0,
            totalBlocks: 0,
            totalTurnovers: 0,
            totalFGM: 0,
            totalFGA: 0,
            total3PM: 0,
            total3PA: 0,
            totalFTM: 0,
            totalFTA: 0,
            totalMinutes: 0,
            totalPersonalFouls: 0
          });
        }

        const player = playerMap.get(playerKey);
        player.games += 1;
        player.totalPoints += stat.spoints || 0;
        player.totalRebounds += stat.sreboundstotal || 0;
        player.totalAssists += stat.sassists || 0;
        player.totalSteals += stat.ssteals || 0;
        player.totalBlocks += stat.sblocks || 0;
        player.totalTurnovers += stat.sturnovers || 0;
        player.totalFGM += stat.sfieldgoalsmade || 0;
        player.totalFGA += stat.sfieldgoalsattempted || 0;
        player.total3PM += stat.sthreepointersmade || 0;
        player.total3PA += stat.sthreepointersattempted || 0;
        player.totalFTM += stat.sfreethrowsmade || 0;
        player.totalFTA += stat.sfreethrowsattempted || 0;
        player.totalPersonalFouls += stat.sfoulspersonal || 0;
        
        // Parse minutes from sminutes field
        const minutesParts = stat.sminutes?.split(':');
        if (minutesParts && minutesParts.length === 2) {
          const minutes = parseInt(minutesParts[0]) + parseInt(minutesParts[1]) / 60;
          player.totalMinutes += minutes;
        }
      });

      // Calculate averages and percentages
      const averagesList = Array.from(playerMap.values()).map(player => ({
        ...player,
        avgPoints: (player.totalPoints / player.games).toFixed(1),
        avgRebounds: (player.totalRebounds / player.games).toFixed(1),
        avgAssists: (player.totalAssists / player.games).toFixed(1),
        avgSteals: (player.totalSteals / player.games).toFixed(1),
        avgBlocks: (player.totalBlocks / player.games).toFixed(1),
        avgTurnovers: (player.totalTurnovers / player.games).toFixed(1),
        avgMinutes: (player.totalMinutes / player.games).toFixed(1),
        avgPersonalFouls: (player.totalPersonalFouls / player.games).toFixed(1),
        fgPercentage: player.totalFGA > 0 ? ((player.totalFGM / player.totalFGA) * 100).toFixed(1) : '0.0',
        threePercentage: player.total3PA > 0 ? ((player.total3PM / player.total3PA) * 100).toFixed(1) : '0.0',
        ftPercentage: player.totalFTA > 0 ? ((player.totalFTM / player.totalFTA) * 100).toFixed(1) : '0.0'
      })).sort((a, b) => parseFloat(b.avgPoints) - parseFloat(a.avgPoints));

      setAllPlayerAverages(averagesList);
      } catch (error) {
        console.error("Error in fetchAllPlayerAverages:", error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    // Calculate team standings using team_stats table first, fallback to player_stats
    const calculateStandingsWithTeamStats = async (leagueId: string, playerStats: any[]) => {
      try {
        // First try to get standings from team_stats table - let's check what columns exist
        const { data: teamStatsData, error: teamStatsError } = await supabase
          .from("team_stats")
          .select("*")
          .eq("league_id", leagueId);  // Remove the order clause to avoid column issues
          

        if (teamStatsData && teamStatsData.length > 0 && !teamStatsError) {
          // Group team stats by numeric_id to find games (teams that played each other)
          const gameMap = new Map<string, any[]>();
          
          teamStatsData.forEach(stat => {
            const numericId = stat.numeric_id;
            if (numericId && stat.name) { // Only process records with team names and numeric_id
              if (!gameMap.has(numericId)) {
                gameMap.set(numericId, []);
              }
              gameMap.get(numericId)!.push(stat);
            }
          });

          // Calculate standings from games
          const teamStatsMap: { [team: string]: { wins: number, losses: number, pointsFor: number, pointsAgainst: number, games: number } } = {};
          
          // Process each game (teams with same numeric_id played each other)
          gameMap.forEach((gameTeams, numericId) => {
            if (gameTeams.length === 2) { // Valid game with 2 teams
              const [team1, team2] = gameTeams;
              
              // Use tot_spoints as team score
              const team1Score = team1.tot_spoints || 0;
              const team2Score = team2.tot_spoints || 0;
              
              // Initialize teams if not exists
              if (!teamStatsMap[team1.name]) {
                teamStatsMap[team1.name] = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 };
              }
              if (!teamStatsMap[team2.name]) {
                teamStatsMap[team2.name] = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 };
              }
              
              // Record scores
              teamStatsMap[team1.name].pointsFor += team1Score;
              teamStatsMap[team1.name].pointsAgainst += team2Score;
              teamStatsMap[team1.name].games += 1;
              
              teamStatsMap[team2.name].pointsFor += team2Score;
              teamStatsMap[team2.name].pointsAgainst += team1Score;
              teamStatsMap[team2.name].games += 1;
              
              // Determine winner
              if (team1Score > team2Score) {
                teamStatsMap[team1.name].wins += 1;
                teamStatsMap[team2.name].losses += 1;
              } else if (team2Score > team1Score) {
                teamStatsMap[team2.name].wins += 1;
                teamStatsMap[team1.name].losses += 1;
              }
              // If tied, no wins/losses added
            }
          });

          // Convert to standings format
          const standingsArray = Object.entries(teamStatsMap).map(([team, stats]) => ({
            team,
            wins: stats.wins,
            losses: stats.losses,
            winPct: stats.games > 0 ? Math.round((stats.wins / stats.games) * 1000) / 1000 : 0,
            pointsFor: stats.pointsFor,
            pointsAgainst: stats.pointsAgainst,
            pointsDiff: stats.pointsFor - stats.pointsAgainst,
            games: stats.games,
            avgPoints: stats.games > 0 ? Math.round((stats.pointsFor / stats.games) * 10) / 10 : 0,
            record: `${stats.wins}-${stats.losses}`
          })).sort((a, b) => {
            // Sort by win percentage first, then by point differential, then by average points
            if (b.winPct !== a.winPct) return b.winPct - a.winPct;
            if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
            return b.avgPoints - a.avgPoints;
          });

          setStandings(standingsArray);
          return;
        }
      } catch (error) {
        // Silently fall back to player_stats if team_stats data is incomplete
      }

      // Fallback: Since team_stats lacks team names and game data, show placeholder
      // standings will need proper team_stats data structure to function
      setStandings([]);
    };

    // Calculate team standings from player stats using actual game results
    const calculateStandings = (playerStats: any[]) => {
      // Group stats by game_id to get complete game data
      const gameMap = new Map<string, any>();
      
      playerStats.forEach(stat => {
        if (!gameMap.has(stat.game_id)) {
          gameMap.set(stat.game_id, {
            game_id: stat.game_id,
            game_date: stat.game_date,
            home_team: stat.home_team,
            away_team: stat.away_team,
            players: []
          });
        }
        gameMap.get(stat.game_id).players.push(stat);
      });

      // Calculate scores for each game and determine winners/losers
      const teamStats: { [team: string]: { totalPoints: number, games: number, wins: number, losses: number, pointsAgainst: number } } = {};
      
      Array.from(gameMap.values()).forEach(game => {
        // Calculate team scores by summing player points
        const teamScores = game.players.reduce((acc: Record<string, number>, stat: any) => {
          const teamName = stat.team;
          if (!teamName) return acc;
          if (!acc[teamName]) acc[teamName] = 0;
          acc[teamName] += stat.points || 0;
          return acc;
        }, {});

        const teams = Object.keys(teamScores);
        if (teams.length !== 2) return; // Skip if not exactly 2 teams
        
        const [team1, team2] = teams;
        const team1Score = teamScores[team1];
        const team2Score = teamScores[team2];
        
        // Initialize team stats if they don't exist
        [team1, team2].forEach(team => {
          if (!teamStats[team]) {
            teamStats[team] = { totalPoints: 0, games: 0, wins: 0, losses: 0, pointsAgainst: 0 };
          }
        });
        
        // Update team stats
        teamStats[team1].totalPoints += team1Score;
        teamStats[team1].pointsAgainst += team2Score;
        teamStats[team1].games += 1;
        
        teamStats[team2].totalPoints += team2Score;
        teamStats[team2].pointsAgainst += team1Score;
        teamStats[team2].games += 1;
        
        // Determine winner and loser based on actual scores
        if (team1Score > team2Score) {
          teamStats[team1].wins += 1;
          teamStats[team2].losses += 1;
        } else if (team2Score > team1Score) {
          teamStats[team2].wins += 1;
          teamStats[team1].losses += 1;
        }
        // Note: Ties are not counted as wins or losses
      });
      
      // Convert to standings format
      const standingsArray = Object.entries(teamStats).map(([team, stats]) => ({
        team,
        wins: stats.wins,
        losses: stats.losses,
        winPct: stats.games > 0 ? Math.round((stats.wins / stats.games) * 1000) / 1000 : 0,
        pointsFor: stats.totalPoints,
        pointsAgainst: stats.pointsAgainst,
        pointsDiff: stats.totalPoints - stats.pointsAgainst,
        games: stats.games,
        avgPoints: stats.games > 0 ? Math.round((stats.totalPoints / stats.games) * 10) / 10 : 0,
        record: `${stats.wins}-${stats.losses}`
      })).sort((a, b) => {
        // Sort by win percentage first, then by point differential, then by average points
        if (b.winPct !== a.winPct) return b.winPct - a.winPct;
        if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
        return b.avgPoints - a.avgPoints;
      });

      setStandings(standingsArray);
    };

    if (!league) {
      return <div className="p-6 text-slate-600">Loading league...</div>;
    }

    return (
      <div className="min-h-screen bg-[#fffaf1]">
        <header className="bg-white shadow-sm sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={SwishLogo}
              alt="Swish Assistant"
              className="h-9 cursor-pointer"
              onClick={() => navigate("/")}
            />
          </div>

          <div className="relative w-full max-w-md mx-6">
            <input
              type="text"
              placeholder="Search leagues or players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full px-4 py-2 border border-gray-300 rounded-full text-sm"
            />
            <button
              onClick={handleSearch}
              className="absolute right-0 top-0 h-full px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-full text-sm"
            >
              Go
            </button>

            {suggestions.length > 0 && (
              <ul className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {suggestions.map((item, index) => (
                  <li
                    key={index}
                    onClick={() => {
                      setSearch("");
                      setSuggestions([]);
                      navigate(`/league/${item.slug}`);
                    }}
                    className="px-4 py-2 cursor-pointer hover:bg-orange-100 text-left text-slate-800"
                  >
                    {item.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-6 text-sm font-medium text-slate-600">
            <a 
              href="#" 
              className={`hover:text-orange-500 cursor-pointer ${activeSection === 'teams' ? 'text-orange-500 font-semibold' : ''}`}
              onClick={() => setActiveSection('teams')}
            >
              Teams
            </a>
            <a 
              href="#" 
              className={`hover:text-orange-500 cursor-pointer ${activeSection === 'stats' ? 'text-orange-500 font-semibold' : ''}`}
              onClick={() => {
                setActiveSection('stats');
                setDisplayedPlayerCount(20); // Reset to initial count when switching to stats
                if (allPlayerAverages.length === 0) {
                  fetchAllPlayerAverages();
                }
              }}
            >
              Stats
            </a>
            <a 
              href="#" 
              className="hover:text-orange-500 cursor-pointer"
              onClick={() => navigate(`/league-leaders/${slug}`)}
            >
              Leaders
            </a>
            <a 
              href="#" 
              className={`hover:text-orange-500 cursor-pointer ${activeSection === 'overview' ? 'text-orange-500 font-semibold' : ''}`}
              onClick={() => setActiveSection('overview')}
            >
              Overview
            </a>
            <a href="#" className="hover:text-orange-500">Schedule</a>
            {currentUser && (
              <button
                onClick={() => navigate("/coaches-hub")}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
              >
                Coaches Hub
              </button>
            )}
          </div>
        </header>

        <section className="mb-10">
          <div
            className="rounded-xl overflow-hidden shadow relative h-52 sm:h-64 md:h-80 bg-gray-200"
            style={{
              backgroundImage: `url(${league?.banner_url || LeagueDefaultImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-6">
              <h2 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-md">
                {league?.name || "League Name"}
              </h2>
              <p className="text-sm text-white/90 mt-1">
                Organised by {league?.organiser_name || "BallParkSports"}
              </p>

            </div>
            
            {/* Banner Upload Button for League Owner */}
            {isOwner && (
              <div className="absolute top-4 right-4">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    console.log('File input changed:', e.target.files?.[0]);
                    handleBannerUpload(e);
                  }}
                  className="hidden"
                  id="banner-upload"
                  disabled={uploadingBanner}
                />
                <label
                  htmlFor="banner-upload"
                  className={`inline-flex items-center gap-2 px-4 py-2 bg-white/90 hover:bg-white text-slate-700 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
                    uploadingBanner ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  onClick={() => console.log('Label clicked for banner upload')}
                >
                  {uploadingBanner ? (
                    <>
                      <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Change Banner
                    </>
                  )}
                </label>

              </div>
            )}
            

          </div>
        </section>

        {/* Horizontal Game Results Ticker */}
        {league?.league_id && (
          <section className="bg-gray-900 text-white py-4 overflow-hidden">
            <div className="relative">
              <div className="flex animate-scroll whitespace-nowrap">
                <GameResultsCarousel 
                  leagueId={league.league_id} 
                  onGameClick={handleGameClick}
                />
              </div>
            </div>
          </section>
        )}

        <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          <section className="md:col-span-2 space-y-6">
            
            {/* Stats Section - Comprehensive Player Averages */}
            {activeSection === 'stats' && (
              <div className="bg-white rounded-xl shadow p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-semibold text-slate-800">Player Statistics - {league?.name}</h2>
                  <div className="text-sm text-gray-500">
                    Showing {Math.min(displayedPlayerCount, allPlayerAverages.length)} of {allPlayerAverages.length} players
                  </div>
                </div>
                
                {isLoadingStats ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-semibold text-slate-700 sticky left-0 bg-white">Player</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">GP</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">MIN</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">PTS</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">REB</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">AST</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">STL</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">BLK</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">TO</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FG%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">3P%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FT%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 10 }).map((_, index) => (
                          <PlayerRowSkeleton key={`skeleton-${index}`} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : allPlayerAverages.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-semibold text-slate-700 sticky left-0 bg-white">Player</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">GP</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">MIN</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">PTS</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">REB</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">AST</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">STL</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">BLK</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">TO</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FG%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">3P%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FT%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPlayerAverages.slice(0, displayedPlayerCount).map((player, index) => (
                          <tr 
                            key={`${player.name}-${index}`}
                            className="border-b border-gray-100 hover:bg-orange-50 transition-colors cursor-pointer"
                            onClick={() => navigate(`/player/${player.id}`)}
                          >
                            <td className="py-3 px-2 font-medium text-slate-800 sticky left-0 bg-white hover:bg-orange-50">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900">{player.name}</div>
                                <div className="text-xs text-slate-500 truncate">{player.team}</div>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center text-slate-600">{player.games}</td>
                            <td className="py-3 px-2 text-center text-slate-600">{player.avgMinutes}</td>
                            <td className="py-3 px-2 text-center font-medium text-orange-600">{player.avgPoints}</td>
                            <td className="py-3 px-2 text-center text-slate-600">{player.avgRebounds}</td>
                            <td className="py-3 px-2 text-center text-slate-600">{player.avgAssists}</td>
                            <td className="py-3 px-2 text-center text-slate-600">{player.avgSteals}</td>
                            <td className="py-3 px-2 text-center text-slate-600">{player.avgBlocks}</td>
                            <td className="py-3 px-2 text-center text-slate-600">{player.avgTurnovers}</td>
                            <td className="py-3 px-2 text-center text-slate-600">{player.fgPercentage}%</td>
                            <td className="py-3 px-2 text-center text-slate-600">{player.threePercentage}%</td>
                            <td className="py-3 px-2 text-center text-slate-600">{player.ftPercentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {/* Expand Button - Show when there are more players to display */}
                    {displayedPlayerCount < allPlayerAverages.length && (
                      <div className="mt-4 text-center">
                        <button
                          onClick={() => setDisplayedPlayerCount(displayedPlayerCount + 20)}
                          className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                          Show {Math.min(20, allPlayerAverages.length - displayedPlayerCount)} More Players
                        </button>
                      </div>
                    )}

                    {/* Show All/Collapse Button when expanded */}
                    {displayedPlayerCount > 20 && (
                      <div className="mt-2 text-center">
                        <div className="flex gap-3 justify-center">
                          {displayedPlayerCount < allPlayerAverages.length && (
                            <button
                              onClick={() => setDisplayedPlayerCount(allPlayerAverages.length)}
                              className="text-orange-500 hover:text-orange-600 font-medium text-sm hover:underline"
                            >
                              Show All ({allPlayerAverages.length} players)
                            </button>
                          )}
                          <button
                            onClick={() => setDisplayedPlayerCount(20)}
                            className="text-slate-500 hover:text-slate-600 font-medium text-sm hover:underline"
                          >
                            Collapse to Top 20
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 text-xs text-slate-500">
                      <div className="flex gap-4 flex-wrap">
                        <span>GP = Games Played</span>
                        <span>MIN = Minutes Per Game</span>
                        <span>PTS = Points Per Game</span>
                        <span>REB = Rebounds Per Game</span>
                        <span>AST = Assists Per Game</span>
                        <span>STL = Steals Per Game</span>
                        <span>BLK = Blocks Per Game</span>
                        <span>TO = Turnovers Per Game</span>
                        <span>FG% = Field Goal Percentage</span>
                        <span>3P% = Three Point Percentage</span>
                        <span>FT% = Free Throw Percentage</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        Click on any player to view their detailed profile
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No player statistics available</p>
                    <p className="text-xs mt-1">Stats will appear once games are played and uploaded</p>
                  </div>
                )}
              </div>
            )}

            {/* Overview Section - Default view */}
            {activeSection === 'overview' && (
              <>
                {/* League Leaders */}
                <div className="bg-white rounded-xl shadow p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-slate-800">League Leaders</h2>
                <button
                  onClick={() => navigate(`/league-leaders/${slug}`)}
                  className="text-sm text-orange-500 hover:text-orange-600 font-medium hover:underline"
                >
                  View All Leaders →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {isLoadingLeaders ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <LeaderCardSkeleton key={`leader-skeleton-${i}`} />
                  ))
                ) : (
                  ([
                    { title: "Top Scorers", list: topScorers, label: "PPG", key: "avg" },
                    { title: "Top Rebounders", list: topRebounders, label: "RPG", key: "avg" },
                    { title: "Top Playmakers", list: topAssistsList, label: "APG", key: "avg" },
                  ] as const).map(({ title, list, label, key }) => (
                    <div key={title} className="bg-gray-50 rounded-lg p-4 shadow-inner">
                      <h3 className="text-sm font-semibold text-slate-700 mb-3 text-center">{title}</h3>
                      <ul className="space-y-1 text-sm text-slate-800">
                        {Array.isArray(list) &&
                          list.map((p, i) => (
                            <li key={`${title}-${p.name}-${i}`} className="flex justify-between">
                              <span>{p.name}</span>
                              <span className="font-medium text-orange-500">
                                {p[key]} {label}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
                </div>

            {/* League Standings */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">League Standings</h2>
              {isLoadingStandings ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 font-semibold text-slate-700">#</th>
                        <th className="text-left py-3 px-2 font-semibold text-slate-700">Team</th>
                        <th className="text-center py-3 px-2 font-semibold text-slate-700">Record</th>
                        <th className="text-center py-3 px-2 font-semibold text-slate-700">Win%</th>
                        <th className="text-right py-3 px-2 font-semibold text-slate-700">PF</th>
                        <th className="text-right py-3 px-2 font-semibold text-slate-700">PA</th>
                        <th className="text-right py-3 px-2 font-semibold text-slate-700">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <StandingsRowSkeleton key={`standings-skeleton-${index}`} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : standings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 font-semibold text-slate-700">#</th>
                        <th className="text-left py-3 px-2 font-semibold text-slate-700">Team</th>
                        <th className="text-center py-3 px-2 font-semibold text-slate-700">Record</th>
                        <th className="text-center py-3 px-2 font-semibold text-slate-700">Win%</th>
                        <th className="text-right py-3 px-2 font-semibold text-slate-700">PF</th>
                        <th className="text-right py-3 px-2 font-semibold text-slate-700">PA</th>
                        <th className="text-right py-3 px-2 font-semibold text-slate-700">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((team, index) => (
                        <tr 
                          key={team.team} 
                          className={`border-b border-gray-100 hover:bg-orange-50 transition-colors ${
                            index < 3 ? 'bg-green-50' : index >= standings.length - 2 ? 'bg-red-50' : ''
                          }`}
                        >
                          <td className="py-3 px-2 font-medium text-slate-600">{index + 1}</td>
                          <td className="py-3 px-2 font-medium text-slate-800">
                            <div className="flex items-center gap-2">
                              <TeamLogo teamName={team.team} leagueId={league?.league_id} size="sm" />
                              {team.team}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center font-medium text-slate-700">{team.record}</td>
                          <td className="py-3 px-2 text-center text-slate-600">{(team.winPct * 100).toFixed(1)}%</td>
                          <td className="py-3 px-2 text-right text-slate-600">{team.pointsFor}</td>
                          <td className="py-3 px-2 text-right text-slate-600">{team.pointsAgainst}</td>
                          <td className={`py-3 px-2 text-right font-medium ${team.pointsDiff > 0 ? 'text-green-600' : team.pointsDiff < 0 ? 'text-red-600' : 'text-slate-600'}`}>{team.pointsDiff > 0 ? '+' : ''}{team.pointsDiff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 text-xs text-slate-500">
                    <div className="flex gap-4 flex-wrap text-xs">
                      <span>Record = Wins-Losses</span>
                      <span>Win% = Win Percentage</span>
                      <span>PF = Points For</span>
                      <span>PA = Points Against</span>
                      <span>Diff = Point Differential</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">No standings available</p>
                  <p className="text-xs mt-1">Standings will appear once games are played</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-slate-800">Player Stat Explorer</h2>

              <input
                type="text"
                placeholder="Search players..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded mb-4"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
              />

              {playerStats.length > 0 ? (
                <div>
                  {/* Sorting Controls */}
                  <div className="flex gap-4 mb-3 items-center">
                    <label className="text-sm text-slate-700 font-medium">
                      Sort by:
                      <select
                        className="ml-2 border border-orange-300 text-orange-600 bg-orange-50 px-2 py-1 rounded shadow-sm hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                        value={sortField}
                        onChange={(e) => setSortField(e.target.value)}
                      >
                        <option value="points">Points</option>
                        <option value="rebounds_total">Rebounds</option>
                        <option value="assists">Assists</option>
                      </select>
                    </label>

                    <button
                      className="flex items-center gap-1 text-sm text-slate-600 hover:text-orange-600 transition"
                      onClick={() =>
                        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                      }
                    >
                      {sortOrder === "asc" ? (
                        <span>
                          ⬆️ <span className="underline">Ascending</span>
                        </span>
                      ) : (
                        <span>
                          ⬇️ <span className="underline">Descending</span>
                        </span>
                      )}
                    </button>
                  </div>


                  {/* Stats Table */}
                  <table className="mt-4 w-full text-sm text-left text-slate-700">
                    <thead>
                      <tr>
                        <th className="px-2 py-1">Name</th>
                        <th className="px-2 py-1">PTS</th>
                        <th className="px-2 py-1">REB</th>
                        <th className="px-2 py-1">AST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...playerStats]
                        .filter((p) =>
                          p.name && p.name.toLowerCase().includes(playerSearch.toLowerCase())
                        )
                        .sort((a, b) => {
                          const aVal = a[sortField] ?? 0;
                          const bVal = b[sortField] ?? 0;
                          return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
                        })
                        .map((p, i) => {
                          const uniqueKey = `player-${p.id || p.name}-${p.game_date || 'no-date'}-${i}`;
                          return (
                            <React.Fragment key={uniqueKey}>
                              <tr
                                className="border-t cursor-pointer hover:bg-orange-50"
                                onClick={() =>
                                  setExpandedPlayer(expandedPlayer === i ? null : i)
                                }
                              >
                                <td className="px-2 py-1">{p.name}</td>
                                <td className="px-2 py-1">{p.points}</td>
                                <td className="px-2 py-1">{p.rebounds_total}</td>
                                <td className="px-2 py-1">{p.assists}</td>
                              </tr>

                              {expandedPlayer === i && (
                                <tr>
                                  <td colSpan={4}>
                                    <GameSummaryRow
                                      player={{ name: p.name }}
                                      game={{
                                        id: p.id,
                                        game_date: p.game_date,
                                        team: p.team,
                                        opponent: p.opponent,
                                        league_id: league.id,
                                      }}
                                    />

                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-600 mt-2">No player data available.</p>
              )}

            </div>
              </>
            )}
          </section>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* League Admin Panel */}
            {isOwner && league?.league_id && (
              <div className="bg-white rounded-xl shadow p-6 border-l-4 border-blue-500">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.5 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  League Admin
                </h3>
                
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 mb-4">
                    Manage all aspects of your league from the dedicated admin area.
                  </p>
                  
                  <button
                    onClick={() => navigate(`/league-admin/${slug}`)}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Open League Admin
                  </button>
                  
                  <div className="text-xs text-slate-500 space-y-1">
                    <p>• Team Logo Management</p>
                    <p>• Banner & Media Settings</p>
                    <p>• Social Media Integration</p>
                  </div>
                </div>
              </div>
            )}

            {/* League Chatbot */}
            {league?.league_id && (
              <LeagueChatbot 
                leagueId={league.league_id} 
                leagueName={league.name || 'League'} 
              />
            )}

            {/* Instagram Embed */}
            <div className="bg-white rounded-xl shadow p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Instagram Feed</h3>
                {isOwner && (
                  <button
                    onClick={() => setIsEditingInstagram(!isEditingInstagram)}
                    className="text-xs text-orange-500 hover:text-orange-600 font-medium"
                  >
                    {isEditingInstagram ? 'Cancel' : 'Edit'}
                  </button>
                )}
              </div>

              {isEditingInstagram && isOwner ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter Instagram profile URL (e.g., https://www.instagram.com/yourleague) or specific post URL"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  />
                  <p className="text-xs text-gray-500">
                    💡 Use profile URL to automatically show latest posts, or specific post URL for a fixed post
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleInstagramUpdate}
                      disabled={updatingInstagram}
                      className={`px-3 py-1 text-xs font-medium rounded ${
                        updatingInstagram 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : 'bg-orange-500 text-white hover:bg-orange-600'
                      }`}
                    >
                      {updatingInstagram ? 'Updating...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingInstagram(false);
                        setInstagramUrl(league?.instagram_embed_url || "");
                      }}
                      className="px-3 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {league?.instagram_embed_url && getInstagramEmbedUrl(league.instagram_embed_url) ? (
                    <iframe
                      src={getInstagramEmbedUrl(league.instagram_embed_url)}
                      width="100%"
                      height="400"
                      className="rounded-md border"
                      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
                    ></iframe>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No Instagram post added yet</p>
                      {isOwner && (
                        <button
                          onClick={() => setIsEditingInstagram(true)}
                          className="mt-2 text-xs text-orange-500 hover:text-orange-600 underline"
                        >
                          Add Instagram Post
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* YouTube Embed */}
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Latest Highlights</h3>
              <iframe
                width="100%"
                height="250"
                src="https://www.youtube.com/embed/VIDEO_ID"
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>

            {/* Comment Section Placeholder */}
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Community Comments</h3>
              <p className="text-xs text-slate-500">💬 Only logged-in users can post.</p>
              <div className="text-xs italic text-slate-400 mt-2">Coming soon...</div>
            </div>
          </aside>
        </main>

        {/* Game Detail Modal */}
        {selectedGameId && (
          <GameDetailModal
            gameId={selectedGameId}
            isOpen={isGameModalOpen}
            onClose={handleCloseGameModal}
          />
        )}
      </div>
    );
  }

