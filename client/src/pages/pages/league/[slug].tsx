import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import LeagueDefaultImage from "@/assets/league-default.png";
import React from "react";
import { GameSummaryRow } from "./GameSummaryRow";
import GameResultsCarousel from "@/components/GameResultsCarousel";
import GameDetailModal from "@/components/GameDetailModal";
import GamePreviewModal from "@/components/GamePreviewModal";
import LeagueChatbot from "@/components/LeagueChatbot";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamLogoUploader } from "@/components/TeamLogoUploader";
import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { 
  LoadingSkeleton, 
  PlayerRowSkeleton, 
  StandingsRowSkeleton, 
  LeaderCardSkeleton,
  ProfileSkeleton,
  CompactLoadingSkeleton
} from "@/components/skeletons/LoadingSkeleton";
import { PlayerComparison } from "@/components/PlayerComparison";
import { TeamComparison } from "@/components/TeamComparison";
import { TournamentBracket } from "@/components/TournamentBracket";

type GameSchedule = {
  game_id: string;
  game_date: string;
  team1: string;
  team2: string;
  kickoff_time?: string;
  venue?: string;
  team1_score?: number;
  team2_score?: number;
  status?: string;
  numeric_id?: string;
};


  export default function LeaguePage() {
    const { slug } = useParams();
    const [search, setSearch] = useState("");
    const [location, navigate] = useLocation();
    const [league, setLeague] = useState(null);
    const [topScorer, setTopScorer] = useState<PlayerStat | null>(null);
    const [topRebounder, setTopRebounder] = useState<PlayerStat | null>(null);
    const [topAssists, setTopAssists] = useState<PlayerStat | null>(null);
    const [standings, setStandings] = useState([]);
    const [schedule, setSchedule] = useState<GameSchedule[]>([]);
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
    const [selectedPreviewGame, setSelectedPreviewGame] = useState<GameSchedule | null>(null);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [isEditingInstagram, setIsEditingInstagram] = useState(false);
  const [updatingInstagram, setUpdatingInstagram] = useState(false);
  const [activeSection, setActiveSection] = useState('overview'); // 'overview', 'stats', 'teams', 'schedule'
  const [comparisonMode, setComparisonMode] = useState<'player' | 'team'>('player'); // Toggle between player and team comparison
  const [allPlayerAverages, setAllPlayerAverages] = useState<any[]>([]);
  const [filteredPlayerAverages, setFilteredPlayerAverages] = useState<any[]>([]);
  const [statsSearch, setStatsSearch] = useState("");
  const [displayedPlayerCount, setDisplayedPlayerCount] = useState(20); // For pagination
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isLoadingStandings, setIsLoadingStandings] = useState(false);
  const [isLoadingLeaders, setIsLoadingLeaders] = useState(false);
  const [teamStatsView, setTeamStatsView] = useState<'totals' | 'averages'>('averages'); // Toggle for team stats
  const [teamStatsData, setTeamStatsData] = useState<any[]>([]);
  const [isLoadingTeamStats, setIsLoadingTeamStats] = useState(false);
  const [standingsView, setStandingsView] = useState<'poolA' | 'poolB' | 'full'>('full'); // Toggle for standings view
  const [poolAStandings, setPoolAStandings] = useState<any[]>([]);
  const [poolBStandings, setPoolBStandings] = useState<any[]>([]);
  const [fullLeagueStandings, setFullLeagueStandings] = useState<any[]>([]);
  const [previousRankings, setPreviousRankings] = useState<Record<string, number>>({});
  const [hasPools, setHasPools] = useState(false); // Track if league has pools
  const [viewMode, setViewMode] = useState<'standings' | 'bracket'>('standings'); // Toggle between standings and bracket

    


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

    // Filter players based on search in stats section (player names only)
    useEffect(() => {
      console.log("🔍 Filtering players. Search term:", statsSearch);
      console.log("📊 All players:", allPlayerAverages.length);
      
      if (!statsSearch.trim()) {
        setFilteredPlayerAverages(allPlayerAverages);
        console.log("✅ No search term, showing all players");
        return;
      }

      const filtered = allPlayerAverages.filter(player => 
        player.name.toLowerCase().includes(statsSearch.toLowerCase())
      );
      
      console.log("🎯 Filtered players:", filtered.length, "matching:", statsSearch);
      setFilteredPlayerAverages(filtered);
      setDisplayedPlayerCount(20); // Reset pagination when searching
    }, [statsSearch, allPlayerAverages]);

    // Reset standings view to 'full' if no pools exist and user is on a pool view
    useEffect(() => {
      if (!hasPools && (standingsView === 'poolA' || standingsView === 'poolB')) {
        setStandingsView('full');
      }
    }, [hasPools, standingsView]);

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
            
            // Calculate pool-based standings with movement tracking
            await calculatePoolStandings(data.league_id);
            
            // Fetch schedule data directly from game_schedule table filtering by league_id
            const { data: scheduleData, error: scheduleError } = await supabase
              .from('game_schedule')
              .select('competitionname, matchtime, hometeam, awayteam, league_id, game_key')
              .eq('league_id', data.league_id);

            console.log("📅 Fetching from game_schedule table for league_id:", data.league_id);
            console.log("📅 Schedule data:", scheduleData);
            console.log("📅 Schedule error:", scheduleError);

            // Also fetch team_stats to get scores
            const { data: teamStatsForScores, error: teamStatsError } = await supabase
              .from("team_stats")
              .select("*")
              .eq("league_id", data.league_id);

            // Create a map of game scores and numeric_ids from team_stats, using team names as key
            const gameScoresMap = new Map<string, { team1: string, team2: string, team1_score: number, team2_score: number, numeric_id: string }>();
            if (teamStatsForScores && !teamStatsError) {
              const gameMap = new Map<string, any[]>();
              
              teamStatsForScores.forEach(stat => {
                const numericId = stat.numeric_id;
                if (numericId && stat.name) {
                  if (!gameMap.has(numericId)) {
                    gameMap.set(numericId, []);
                  }
                  gameMap.get(numericId)!.push(stat);
                }
              });

              gameMap.forEach((gameTeams, numericId) => {
                if (gameTeams.length === 2) {
                  const [team1, team2] = gameTeams;
                  // Create keys based on team name combinations (both orders)
                  const key1 = `${team1.name}-vs-${team2.name}`;
                  const key2 = `${team2.name}-vs-${team1.name}`;
                  const scoreData = {
                    team1: team1.name,
                    team2: team2.name,
                    team1_score: team1.tot_spoints || 0,
                    team2_score: team2.tot_spoints || 0,
                    numeric_id: numericId
                  };
                  gameScoresMap.set(key1, scoreData);
                  gameScoresMap.set(key2, scoreData);
                }
              });
            }

            if (scheduleData && !scheduleError) {
              console.log("📅 Raw schedule data from game_schedule:", scheduleData.length, "records");
              if (scheduleData.length > 0) {
                console.log("📅 Sample record:", scheduleData[0]);
              }
              
              // Process the schedule data from game_schedule table
              // Log the first record to see actual column structure
              if (scheduleData.length > 0) {
                console.log('📅 Available columns in game_schedule:', Object.keys(scheduleData[0]));
              }
              
              const games: GameSchedule[] = scheduleData.map((game: any) => {
                const gameKey = game.game_key || `${game.hometeam}-vs-${game.awayteam}`;
                // Look up scores and numeric_id by team name combination
                const teamKey = `${game.hometeam}-vs-${game.awayteam}`;
                const scoreData = gameScoresMap.get(teamKey);
                
                return {
                  game_id: gameKey,
                  game_date: game.matchtime,
                  team1: game.hometeam,
                  team2: game.awayteam,
                  kickoff_time: new Date(game.matchtime).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  }),
                  venue: game.competitionname,
                  team1_score: scoreData?.team1_score,
                  team2_score: scoreData?.team2_score,
                  status: scoreData ? "FINAL" : undefined,
                  numeric_id: scoreData?.numeric_id
                };
              }).filter((game) => game.team1 && game.team2)
              .sort((a, b) => {
                if (!a.game_date || !b.game_date) return 0;
                const dateA = new Date(a.game_date).getTime();
                const dateB = new Date(b.game_date).getTime();
                return dateB - dateA; // Most recent first
              });
              
              console.log("📅 Processed schedule from game_schedule:", games);
              setSchedule(games);
            } else if (scheduleError) {
              console.error("📅 Error fetching from game_schedule:", scheduleError);
              // Fallback to empty schedule
              setSchedule([]);
            }
            
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
        // Fetch player stats directly from player_stats table (no separate players table)
        const { data: playerStats, error } = await supabase
          .from("player_stats")
          .select("*")
          .eq("league_id", league.league_id);

        if (error) {
          console.error("Error fetching player averages:", error);
          return;
        }

        console.log("📊 Fetched player stats:", playerStats?.length, "records");

      // Group stats by player and calculate averages
      const playerMap = new Map();
      
      playerStats?.forEach(stat => {
        // Build player name from firstname and familyname in player_stats
        const playerName = stat.full_name || 
                          stat.name || 
                          `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || 
                          'Unknown Player';
        // Use player_id for grouping to avoid name mismatches, fallback to record id
        const playerKey = stat.player_id || stat.id;
        if (!playerMap.has(playerKey)) {
          playerMap.set(playerKey, {
            name: playerName,
            team: stat.team,
            id: playerKey,
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
      const averagesList = Array.from(playerMap.entries()).map(([playerKey, player]) => ({
        ...player,
        playerKey,
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
      setFilteredPlayerAverages(averagesList);
      } catch (error) {
        console.error("Error in fetchAllPlayerAverages:", error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    // Fetch and aggregate team statistics
    const fetchTeamStats = async () => {
      if (!league?.league_id) return;
      
      setIsLoadingTeamStats(true);
      try {
        const { data: rawTeamStats, error } = await supabase
          .from("team_stats")
          .select("*")
          .eq("league_id", league.league_id);

        if (error) {
          console.error("Error fetching team stats:", error);
          setIsLoadingTeamStats(false);
          return;
        }

        if (!rawTeamStats || rawTeamStats.length === 0) {
          setTeamStatsData([]);
          setIsLoadingTeamStats(false);
          return;
        }

        // Aggregate stats by team
        const teamMap = new Map<string, any>();

        rawTeamStats.forEach(stat => {
          if (!stat.name) return; // Skip records without team name

          if (!teamMap.has(stat.name)) {
            teamMap.set(stat.name, {
              teamName: stat.name,
              gamesPlayed: 0,
              totalPoints: 0,
              totalFGM: 0,
              totalFGA: 0,
              total3PM: 0,
              total3PA: 0,
              total2PM: 0,
              total2PA: 0,
              totalFTM: 0,
              totalFTA: 0,
              totalRebounds: 0,
              totalAssists: 0,
              totalSteals: 0,
              totalBlocks: 0,
              totalTurnovers: 0,
              totalFouls: 0
            });
          }

          const team = teamMap.get(stat.name)!;
          team.gamesPlayed += 1;
          team.totalPoints += stat.tot_spoints || 0;
          team.totalFGM += stat.tot_sfieldgoalsmade || 0;
          team.totalFGA += stat.tot_sfieldgoalsattempted || 0;
          team.total3PM += stat.tot_sthreepointersmade || 0;
          team.total3PA += stat.tot_sthreepointersattempted || 0;
          team.total2PM += stat.tot_stwopointersmade || 0;
          team.total2PA += stat.tot_stwopointersattempted || 0;
          team.totalFTM += stat.tot_sfreethrowsmade || 0;
          team.totalFTA += stat.tot_sfreethrowsattempted || 0;
          team.totalRebounds += stat.tot_sreboundstotal || 0;
          team.totalAssists += stat.tot_sassists || 0;
          team.totalSteals += stat.tot_ssteals || 0;
          team.totalBlocks += stat.tot_sblocks || 0;
          team.totalTurnovers += stat.tot_sturnovers || 0;
          team.totalFouls += stat.tot_sfoulspersonal || 0;
        });

        // Calculate percentages and averages
        const aggregatedStats = Array.from(teamMap.values()).map(team => ({
          ...team,
          // Percentages (use totals for accurate calculation)
          fgPercentage: team.totalFGA > 0 ? ((team.totalFGM / team.totalFGA) * 100).toFixed(1) : '0.0',
          threePtPercentage: team.total3PA > 0 ? ((team.total3PM / team.total3PA) * 100).toFixed(1) : '0.0',
          twoPtPercentage: team.total2PA > 0 ? ((team.total2PM / team.total2PA) * 100).toFixed(1) : '0.0',
          ftPercentage: team.totalFTA > 0 ? ((team.totalFTM / team.totalFTA) * 100).toFixed(1) : '0.0',
          // Averages
          ppg: team.gamesPlayed > 0 ? (team.totalPoints / team.gamesPlayed).toFixed(1) : '0.0',
          rpg: team.gamesPlayed > 0 ? (team.totalRebounds / team.gamesPlayed).toFixed(1) : '0.0',
          apg: team.gamesPlayed > 0 ? (team.totalAssists / team.gamesPlayed).toFixed(1) : '0.0',
          spg: team.gamesPlayed > 0 ? (team.totalSteals / team.gamesPlayed).toFixed(1) : '0.0',
          bpg: team.gamesPlayed > 0 ? (team.totalBlocks / team.gamesPlayed).toFixed(1) : '0.0',
          tpg: team.gamesPlayed > 0 ? (team.totalTurnovers / team.gamesPlayed).toFixed(1) : '0.0'
        })).sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg)); // Sort by PPG

        setTeamStatsData(aggregatedStats);
      } catch (error) {
        console.error("Error processing team stats:", error);
      } finally {
        setIsLoadingTeamStats(false);
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

    // Calculate pool-based standings with movement tracking
    const calculatePoolStandings = async (leagueId: string) => {
      try {
        setIsLoadingStandings(true);
        
        // Fetch team stats
        const { data: teamStatsData, error: teamStatsError } = await supabase
          .from("team_stats")
          .select("*")
          .eq("league_id", leagueId);

        if (teamStatsError || !teamStatsData || teamStatsData.length === 0) {
          setPoolAStandings([]);
          setPoolBStandings([]);
          setFullLeagueStandings([]);
          setIsLoadingStandings(false);
          return;
        }

        // Fetch game schedule to get pool information
        const { data: scheduleData, error: scheduleError } = await supabase
          .from("game_schedule")
          .select("*")
          .eq("league_id", leagueId);

        // Build team-to-pool mapping from game_schedule
        // Pool values are in format "0(Pool A)" or "0(Pool B)", extract the pool name
        const extractPoolName = (poolValue: string): string => {
          const match = poolValue.match(/\(([^)]+)\)/);
          return match ? match[1] : poolValue;
        };
        
        // Normalize team names by trying both with and without " I" suffix
        const normalizeTeamName = (name: string): string => {
          return name.trim();
        };
        
        const teamPoolMap: Record<string, string> = {};
        if (scheduleData && !scheduleError) {
          scheduleData.forEach((game: any) => {
            if (game.hometeam && game.pool) {
              const poolName = extractPoolName(game.pool);
              // Store with original name
              teamPoolMap[game.hometeam] = poolName;
              // Also store without " I" suffix for matching
              const withoutI = game.hometeam.replace(/ I$/, '');
              if (withoutI !== game.hometeam) {
                teamPoolMap[withoutI] = poolName;
              }
            }
            if (game.awayteam && game.pool) {
              const poolName = extractPoolName(game.pool);
              // Store with original name
              teamPoolMap[game.awayteam] = poolName;
              // Also store without " I" suffix for matching
              const withoutI = game.awayteam.replace(/ I$/, '');
              if (withoutI !== game.awayteam) {
                teamPoolMap[withoutI] = poolName;
              }
            }
          });
        }
        // Group by game (numeric_id) and calculate standings
        const gameMap = new Map<string, any[]>();
        teamStatsData.forEach(stat => {
          const numericId = stat.numeric_id;
          if (numericId && stat.name) {
            if (!gameMap.has(numericId)) {
              gameMap.set(numericId, []);
            }
            gameMap.get(numericId)!.push(stat);
          }
        });

        // Calculate standings
        const teamStatsMap: Record<string, { wins: number, losses: number, pointsFor: number, pointsAgainst: number, games: number, pool?: string }> = {};
        
        gameMap.forEach((gameTeams) => {
          if (gameTeams.length === 2) {
            const [team1, team2] = gameTeams;
            const team1Score = team1.tot_spoints || 0;
            const team2Score = team2.tot_spoints || 0;
            
            // Initialize teams
            if (!teamStatsMap[team1.name]) {
              teamStatsMap[team1.name] = { 
                wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0,
                pool: teamPoolMap[team1.name]
              };
            }
            if (!teamStatsMap[team2.name]) {
              teamStatsMap[team2.name] = { 
                wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0,
                pool: teamPoolMap[team2.name]
              };
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
          }
        });

        // Convert to standings format with movement tracking
        const formatStandings = (teams: any[], poolFilter?: string) => {
          const filtered = poolFilter 
            ? teams.filter(t => t.pool === poolFilter)
            : teams;
          
          return filtered
            .sort((a, b) => {
              if (b.winPct !== a.winPct) return b.winPct - a.winPct;
              if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
              return b.avgPoints - a.avgPoints;
            })
            .map((team, index) => {
              const currentRank = index + 1;
              const previousRank = previousRankings[team.team];
              let movement = 'same';
              
              if (previousRank !== undefined) {
                if (currentRank < previousRank) movement = 'up';
                else if (currentRank > previousRank) movement = 'down';
              }
              
              return { ...team, rank: currentRank, movement };
            });
        };

        const allTeamsArray = Object.entries(teamStatsMap).map(([team, stats]) => ({
          team,
          wins: stats.wins,
          losses: stats.losses,
          winPct: stats.games > 0 ? Math.round((stats.wins / stats.games) * 1000) / 1000 : 0,
          pointsFor: stats.pointsFor,
          pointsAgainst: stats.pointsAgainst,
          pointsDiff: stats.pointsFor - stats.pointsAgainst,
          games: stats.games,
          avgPoints: stats.games > 0 ? Math.round((stats.pointsFor / stats.games) * 10) / 10 : 0,
          record: `${stats.wins}-${stats.losses}`,
          pool: stats.pool
        }));

        // Set standings for each view
        const fullStandings = formatStandings(allTeamsArray);
        const poolAStandings = formatStandings(allTeamsArray, 'Pool A');
        const poolBStandings = formatStandings(allTeamsArray, 'Pool B');

        setFullLeagueStandings(fullStandings);
        setPoolAStandings(poolAStandings);
        setPoolBStandings(poolBStandings);

        // Check if pools exist (any team has pool data)
        const poolsExist = poolAStandings.length > 0 || poolBStandings.length > 0;
        setHasPools(poolsExist);

        // Update previous rankings for next calculation
        const newRankings: Record<string, number> = {};
        fullStandings.forEach((team, index) => {
          newRankings[team.team] = index + 1;
        });
        setPreviousRankings(newRankings);

      } catch (error) {
        console.error("Error calculating pool standings:", error);
      } finally {
        setIsLoadingStandings(false);
      }
    };

    if (!league) {
      return <div className="p-6 text-slate-600">Loading league...</div>;
    }

    return (
      <div className="min-h-screen bg-[#fffaf1]">
        <header className="bg-white shadow-sm sticky top-0 z-50 px-4 md:px-6 py-3 md:py-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
            <div className="flex items-center justify-between md:justify-start">
              <img
                src={SwishLogo}
                alt="Swish Assistant"
                className="h-8 md:h-9 cursor-pointer"
                onClick={() => navigate("/")}
              />
              {currentUser && (
                <button
                  onClick={() => navigate("/coaches-hub")}
                  className="md:hidden bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors text-sm"
                >
                  Hub
                </button>
              )}
            </div>

            <div className="relative w-full md:max-w-md md:mx-6">
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
                className="absolute right-0 top-0 h-full px-3 md:px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-full text-sm"
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
                      className="px-4 py-2 cursor-pointer hover:bg-orange-100 text-left text-slate-800 text-sm"
                    >
                      {item.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {currentUser && (
              <button
                onClick={() => navigate("/coaches-hub")}
                className="hidden md:block bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm whitespace-nowrap"
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
            <GameResultsCarousel 
              leagueId={league.league_id} 
              onGameClick={handleGameClick}
            />
          </section>
        )}

        {/* Navigation Tabs - Moved below carousel */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="flex gap-4 md:gap-6 text-sm font-medium text-slate-600 py-3 md:py-4 overflow-x-auto">
              <a 
                href="#" 
                className={`hover:text-orange-500 cursor-pointer whitespace-nowrap pb-1 ${activeSection === 'teams' ? 'text-orange-500 font-semibold border-b-2 border-orange-500' : ''}`}
                onClick={() => setActiveSection('teams')}
              >
                Teams
              </a>
              <a 
                href="#" 
                className={`hover:text-orange-500 cursor-pointer whitespace-nowrap pb-1 ${activeSection === 'standings' ? 'text-orange-500 font-semibold border-b-2 border-orange-500' : ''}`}
                onClick={() => {
                  setActiveSection('standings');
                  if (league?.league_id && fullLeagueStandings.length === 0) {
                    calculatePoolStandings(league.league_id);
                  }
                }}
              >
                Standings
              </a>
              <a 
                href="#" 
                className={`hover:text-orange-500 cursor-pointer whitespace-nowrap pb-1 ${activeSection === 'stats' ? 'text-orange-500 font-semibold border-b-2 border-orange-500' : ''}`}
                onClick={() => {
                  setActiveSection('stats');
                  setDisplayedPlayerCount(20);
                  setStatsSearch("");
                  if (allPlayerAverages.length === 0) {
                    fetchAllPlayerAverages();
                  }
                }}
              >
                Player Stats
              </a>
              <a 
                href="#" 
                className={`hover:text-orange-500 cursor-pointer whitespace-nowrap pb-1 ${activeSection === 'teamstats' ? 'text-orange-500 font-semibold border-b-2 border-orange-500' : ''}`}
                onClick={() => {
                  setActiveSection('teamstats');
                  if (teamStatsData.length === 0) {
                    fetchTeamStats();
                  }
                }}
              >
                Team Stats
              </a>
              <a 
                href="#" 
                className={`hover:text-orange-500 cursor-pointer whitespace-nowrap pb-1 ${activeSection === 'schedule' ? 'text-orange-500 font-semibold border-b-2 border-orange-500' : ''}`}
                onClick={() => setActiveSection('schedule')}
              >
                Schedule
              </a>
              <a 
                href="#" 
                className="hover:text-orange-500 cursor-pointer whitespace-nowrap pb-1"
                onClick={() => navigate(`/league-leaders/${slug}`)}
              >
                Leaders
              </a>
              <a 
                href="#" 
                className={`hover:text-orange-500 cursor-pointer whitespace-nowrap pb-1 ${activeSection === 'comparison' ? 'text-orange-500 font-semibold border-b-2 border-orange-500' : ''}`}
                onClick={() => {
                  setActiveSection('comparison');
                  if (allPlayerAverages.length === 0) {
                    fetchAllPlayerAverages();
                  }
                  if (teamStatsData.length === 0) {
                    fetchTeamStats();
                  }
                }}
              >
                Compare
              </a>
              <a 
                href="#" 
                className={`hover:text-orange-500 cursor-pointer whitespace-nowrap pb-1 ${activeSection === 'overview' ? 'text-orange-500 font-semibold border-b-2 border-orange-500' : ''}`}
                onClick={() => setActiveSection('overview')}
              >
                Overview
              </a>
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <section className="md:col-span-2 space-y-6">
            
            {/* Standings Section */}
            {activeSection === 'standings' && (
              <div className="bg-white rounded-xl shadow p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4 md:mb-6">
                  <h2 className="text-base md:text-lg font-semibold text-slate-800">League Standings</h2>
                  
                  {/* View Toggle */}
                  <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-1">
                    <button
                      onClick={() => setViewMode('standings')}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        viewMode === 'standings'
                          ? 'bg-white text-orange-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                      data-testid="button-standings-view"
                    >
                      Standings
                    </button>
                    <button
                      onClick={() => setViewMode('bracket')}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        viewMode === 'bracket'
                          ? 'bg-white text-orange-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                      data-testid="button-bracket-view"
                    >
                      Bracket
                    </button>
                  </div>
                </div>
                
                {viewMode === 'standings' && (
                  <>
                    {/* Pool Tabs */}
                    <div className="flex flex-wrap gap-2 mb-4 md:mb-6 border-b border-gray-200">
                  {hasPools && (
                    <>
                      <button
                        onClick={() => setStandingsView('poolA')}
                        className={`px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium transition-colors ${
                          standingsView === 'poolA' 
                            ? 'text-orange-600 border-b-2 border-orange-600' 
                            : 'text-gray-600 hover:text-orange-500'
                        }`}
                      >
                        Pool A
                      </button>
                      <button
                        onClick={() => setStandingsView('poolB')}
                        className={`px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium transition-colors ${
                          standingsView === 'poolB' 
                            ? 'text-orange-600 border-b-2 border-orange-600' 
                            : 'text-gray-600 hover:text-orange-500'
                        }`}
                      >
                        Pool B
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setStandingsView('full')}
                    className={`px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium transition-colors ${
                      standingsView === 'full' 
                        ? 'text-orange-600 border-b-2 border-orange-600' 
                        : 'text-gray-600 hover:text-orange-500'
                    }`}
                  >
                    {hasPools ? 'Full League' : 'League Standings'}
                  </button>
                </div>

                {isLoadingStandings ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-gray-600 mt-4">Loading standings...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-4 md:mx-0">
                    <table className="w-full text-xs md:text-sm min-w-[640px]">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-2 md:py-3 font-semibold text-slate-700 sticky left-0 bg-white z-10">Rank</th>
                          <th className="text-left py-2 px-2 md:py-3 font-semibold text-slate-700 sticky left-8 md:static bg-white z-10">Team</th>
                          <th className="text-center py-2 px-2 md:py-3 font-semibold text-slate-700">W</th>
                          <th className="text-center py-2 px-2 md:py-3 font-semibold text-slate-700">L</th>
                          <th className="text-center py-2 px-2 md:py-3 font-semibold text-slate-700">Win%</th>
                          <th className="text-center py-2 px-2 md:py-3 font-semibold text-slate-700">PF</th>
                          <th className="text-center py-2 px-2 md:py-3 font-semibold text-slate-700 hidden md:table-cell">PA</th>
                          <th className="text-center py-2 px-2 md:py-3 font-semibold text-slate-700 hidden md:table-cell">Diff</th>
                          <th className="text-center py-2 px-2 md:py-3 font-semibold text-slate-700"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(standingsView === 'poolA' ? poolAStandings : 
                          standingsView === 'poolB' ? poolBStandings : 
                          fullLeagueStandings).map((team, index) => (
                          <tr 
                            key={`${team.team}-${index}`}
                            className="border-b border-gray-100 hover:bg-orange-50 transition-colors"
                          >
                            <td className="py-2 px-2 md:py-3 text-slate-600 font-medium sticky left-0 bg-white z-10">{team.rank}</td>
                            <td className="py-2 px-2 md:py-3 text-slate-800 font-medium sticky left-8 md:static bg-white z-10 min-w-[150px]">{team.team}</td>
                            <td className="py-2 px-2 md:py-3 text-center text-slate-600">{team.wins}</td>
                            <td className="py-2 px-2 md:py-3 text-center text-slate-600">{team.losses}</td>
                            <td className="py-2 px-2 md:py-3 text-center text-slate-600">{(team.winPct * 100).toFixed(1)}%</td>
                            <td className="py-2 px-2 md:py-3 text-center text-slate-600">{team.pointsFor}</td>
                            <td className="py-2 px-2 md:py-3 text-center text-slate-600 hidden md:table-cell">{team.pointsAgainst}</td>
                            <td className="py-2 px-2 md:py-3 text-center font-medium text-slate-700 hidden md:table-cell">
                              {team.pointsDiff > 0 ? `+${team.pointsDiff}` : team.pointsDiff}
                            </td>
                            <td className="py-2 px-2 md:py-3 text-center">
                              {team.movement === 'up' && (
                                <span className="text-green-600 font-bold text-xs md:text-sm">▲</span>
                              )}
                              {team.movement === 'down' && (
                                <span className="text-red-600 font-bold text-xs md:text-sm">▼</span>
                              )}
                              {team.movement === 'same' && (
                                <span className="text-gray-400 text-xs md:text-sm">▬</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {(standingsView === 'poolA' ? poolAStandings : 
                      standingsView === 'poolB' ? poolBStandings : 
                      fullLeagueStandings).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No standings data available
                      </div>
                    )}
                  </div>
                )}
                  </>
                )}
                
                {/* Bracket View */}
                {viewMode === 'bracket' && league?.league_id && (
                  <TournamentBracket 
                    leagueId={league.league_id} 
                    onGameClick={handleGameClick}
                  />
                )}
              </div>
            )}
            
            {/* Stats Section - Comprehensive Player Averages */}
            {activeSection === 'stats' && (
              <div className="bg-white rounded-xl shadow p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 mb-4 md:mb-6">
                  <h2 className="text-base md:text-lg font-semibold text-slate-800">Player Statistics - {league?.name}</h2>
                  <div className="text-xs md:text-sm text-gray-500">
                    Showing {Math.min(displayedPlayerCount, filteredPlayerAverages.length)} of {filteredPlayerAverages.length} players
                    {statsSearch && ` (filtered from ${allPlayerAverages.length})`}
                  </div>
                </div>
                
                {/* Search Bar */}
                <div className="mb-6">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search players..."
                      value={statsSearch}
                      onChange={(e) => setStatsSearch(e.target.value)}
                      className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    <svg
                      className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
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
                ) : filteredPlayerAverages.length > 0 ? (
                  <div className="overflow-x-auto -mx-4 md:mx-0 border border-orange-200 rounded-lg">
                    <table className="w-full text-xs md:text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-orange-50">
                          <th className="text-left py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 sticky left-0 bg-orange-50 z-10 min-w-[100px] md:min-w-[140px]">Player</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[45px]">GP</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">MIN</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[50px]">PTS</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[50px]">REB</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[50px]">AST</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">STL</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">BLK</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">TO</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">FG%</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">3P%</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">FT%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPlayerAverages.slice(0, displayedPlayerCount).map((player, index) => (
                          <tr 
                            key={`${player.name}-${index}`}
                            className="border-b border-gray-100 hover:bg-orange-50 transition-colors cursor-pointer"
                            onClick={() => navigate(`/player/${player.id}`)}
                            data-testid={`player-row-${player.id}`}
                          >
                            <td className="py-2 md:py-3 px-2 md:px-3 font-medium text-slate-800 sticky left-0 bg-white hover:bg-orange-50 z-10">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 text-xs md:text-sm truncate">{player.name}</div>
                                <div className="text-[10px] md:text-xs text-slate-500 truncate">{player.team}</div>
                              </div>
                            </td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 font-medium">{player.games}</td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 hidden md:table-cell">{player.avgMinutes}</td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center font-semibold text-orange-600">{player.avgPoints}</td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center font-medium text-slate-700">{player.avgRebounds}</td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center font-medium text-slate-700">{player.avgAssists}</td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 hidden md:table-cell">{player.avgSteals}</td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 hidden md:table-cell">{player.avgBlocks}</td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 hidden md:table-cell">{player.avgTurnovers}</td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 hidden md:table-cell">{player.fgPercentage}%</td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 hidden md:table-cell">{player.threePercentage}%</td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 hidden md:table-cell">{player.ftPercentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {/* Scroll hint for mobile */}
                    <div className="md:hidden bg-orange-50 text-orange-700 text-center py-2 text-xs border-t border-orange-200">
                      ← Swipe to see all stats →
                    </div>
                    
                    {/* Expand Button - Show when there are more players to display */}
                    {displayedPlayerCount < filteredPlayerAverages.length && (
                      <div className="mt-4 text-center">
                        <button
                          onClick={() => setDisplayedPlayerCount(displayedPlayerCount + 20)}
                          className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                          Show {Math.min(20, filteredPlayerAverages.length - displayedPlayerCount)} More Players
                        </button>
                      </div>
                    )}

                    {/* Show All/Collapse Button when expanded */}
                    {displayedPlayerCount > 20 && (
                      <div className="mt-2 text-center">
                        <div className="flex gap-3 justify-center">
                          {displayedPlayerCount < filteredPlayerAverages.length && (
                            <button
                              onClick={() => setDisplayedPlayerCount(filteredPlayerAverages.length)}
                              className="text-orange-500 hover:text-orange-600 font-medium text-sm hover:underline"
                            >
                              Show All ({filteredPlayerAverages.length} players)
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
                ) : statsSearch ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="mb-2">No players found matching "{statsSearch}"</div>
                    <button
                      onClick={() => setStatsSearch("")}
                      className="text-orange-500 hover:text-orange-600 underline"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No player statistics available</p>
                    <p className="text-xs mt-1">Stats will appear once games are played and uploaded</p>
                  </div>
                )}
              </div>
            )}

            {/* Team Stats Section */}
            {activeSection === 'teamstats' && (
              <div className="bg-white rounded-xl shadow p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-0 mb-4 md:mb-6">
                  <h2 className="text-base md:text-lg font-semibold text-slate-800">Team Statistics - {league?.name}</h2>
                  
                  {/* Toggle for Totals/Averages */}
                  <div className="flex gap-1 md:gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setTeamStatsView('averages')}
                      className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors ${
                        teamStatsView === 'averages'
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      data-testid="button-averages-toggle"
                    >
                      Averages
                    </button>
                    <button
                      onClick={() => setTeamStatsView('totals')}
                      className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors ${
                        teamStatsView === 'totals'
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      data-testid="button-totals-toggle"
                    >
                      Totals
                    </button>
                  </div>
                </div>

                {isLoadingTeamStats ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-semibold text-slate-700 sticky left-0 bg-white">Team</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">GP</th>
                          {teamStatsView === 'averages' ? (
                            <>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">PPG</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">RPG</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">APG</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">FG%</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">3P%</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">2P%</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">FT%</th>
                            </>
                          ) : (
                            <>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">PTS</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">REB</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">AST</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">FGM</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">3PM</th>
                              <th className="text-center py-3 px-2 font-semibold text-slate-700">FTM</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 8 }).map((_, index) => (
                          <tr key={`skeleton-${index}`} className="border-b border-gray-100">
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
                                <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="h-4 bg-gray-200 rounded w-8 mx-auto animate-pulse"></div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="h-4 bg-gray-200 rounded w-12 mx-auto animate-pulse"></div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="h-4 bg-gray-200 rounded w-12 mx-auto animate-pulse"></div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="h-4 bg-gray-200 rounded w-12 mx-auto animate-pulse"></div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="h-4 bg-gray-200 rounded w-12 mx-auto animate-pulse"></div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="h-4 bg-gray-200 rounded w-12 mx-auto animate-pulse"></div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="h-4 bg-gray-200 rounded w-12 mx-auto animate-pulse"></div>
                            </td>
                            {teamStatsView === 'averages' && (
                              <td className="py-3 px-2">
                                <div className="h-4 bg-gray-200 rounded w-12 mx-auto animate-pulse"></div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : teamStatsData.length > 0 ? (
                  <div className="overflow-x-auto -mx-4 md:mx-0 border border-orange-200 rounded-lg">
                    <table className="w-full text-xs md:text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-orange-50">
                          <th className="text-left py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 sticky left-0 bg-orange-50 z-10 min-w-[140px] md:min-w-[180px]">Team</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[45px]">GP</th>
                          {teamStatsView === 'averages' ? (
                            <>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[50px]">PPG</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[50px]">RPG</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[50px]">APG</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">FG%</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">3P%</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">2P%</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">FT%</th>
                            </>
                          ) : (
                            <>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[50px]">PTS</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[50px]">REB</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[50px]">AST</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">FGM</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">3PM</th>
                              <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 hidden md:table-cell">FTM</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {teamStatsData.map((team, index) => (
                          <tr 
                            key={`team-stats-${team.teamName}-${index}`}
                            className="hover:bg-orange-50 transition-colors cursor-pointer"
                            onClick={() => navigate(`/team/${encodeURIComponent(team.teamName)}`)}
                            data-testid={`row-team-${team.teamName}`}
                          >
                            <td className="py-2 md:py-3 px-2 md:px-3 sticky left-0 bg-white hover:bg-orange-50 z-10">
                              <div className="flex items-center gap-2">
                                <TeamLogo teamName={team.teamName} leagueId={league?.league_id || ""} size="sm" />
                                <span className="font-medium text-slate-800 text-xs md:text-sm truncate">{team.teamName}</span>
                              </div>
                            </td>
                            <td className="text-center py-2 md:py-3 px-2 md:px-3 text-slate-600 font-medium" data-testid={`text-gp-${team.teamName}`}>
                              {team.gamesPlayed}
                            </td>
                            {teamStatsView === 'averages' ? (
                              <>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-orange-600" data-testid={`text-ppg-${team.teamName}`}>
                                  {team.ppg}
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 font-medium text-slate-700" data-testid={`text-rpg-${team.teamName}`}>
                                  {team.rpg}
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 font-medium text-slate-700" data-testid={`text-apg-${team.teamName}`}>
                                  {team.apg}
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 text-slate-600 hidden md:table-cell" data-testid={`text-fg%-${team.teamName}`}>
                                  {team.fgPercentage}%
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 text-slate-600 hidden md:table-cell" data-testid={`text-3p%-${team.teamName}`}>
                                  {team.threePtPercentage}%
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 text-slate-600 hidden md:table-cell" data-testid={`text-2p%-${team.teamName}`}>
                                  {team.twoPtPercentage}%
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 text-slate-600 hidden md:table-cell" data-testid={`text-ft%-${team.teamName}`}>
                                  {team.ftPercentage}%
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-orange-600" data-testid={`text-total-pts-${team.teamName}`}>
                                  {team.totalPoints}
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 font-medium text-slate-700" data-testid={`text-total-reb-${team.teamName}`}>
                                  {team.totalRebounds}
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 font-medium text-slate-700" data-testid={`text-total-ast-${team.teamName}`}>
                                  {team.totalAssists}
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 text-slate-600 hidden md:table-cell" data-testid={`text-total-fgm-${team.teamName}`}>
                                  {team.totalFGM}
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 text-slate-600 hidden md:table-cell" data-testid={`text-total-3pm-${team.teamName}`}>
                                  {team.total3PM}
                                </td>
                                <td className="text-center py-2 md:py-3 px-2 md:px-3 text-slate-600 hidden md:table-cell" data-testid={`text-total-ftm-${team.teamName}`}>
                                  {team.totalFTM}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {/* Scroll hint for mobile */}
                    <div className="md:hidden bg-orange-50 text-orange-700 text-center py-2 text-xs border-t border-orange-200">
                      ← Swipe to see all stats →
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No team statistics available</p>
                    <p className="text-xs mt-1">Stats will appear once games are played</p>
                  </div>
                )}
                
                {/* Legend */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <div className="text-xs text-slate-500 space-y-1">
                    <div className="font-semibold text-slate-600 mb-2">Legend:</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <span>GP = Games Played</span>
                      {teamStatsView === 'averages' ? (
                        <>
                          <span>PPG = Points Per Game</span>
                          <span>RPG = Rebounds Per Game</span>
                          <span>APG = Assists Per Game</span>
                          <span>FG% = Field Goal %</span>
                          <span>3P% = Three Point %</span>
                          <span>2P% = Two Point %</span>
                          <span>FT% = Free Throw %</span>
                        </>
                      ) : (
                        <>
                          <span>PTS = Total Points</span>
                          <span>REB = Total Rebounds</span>
                          <span>AST = Total Assists</span>
                          <span>FGM = Field Goals Made</span>
                          <span>3PM = Three Pointers Made</span>
                          <span>FTM = Free Throws Made</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Teams Section */}
            {activeSection === 'teams' && (
              <div className="bg-white rounded-xl shadow p-4 md:p-6">
                <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-4 md:mb-6">Teams</h2>
                {standings.length > 0 ? (
                  <div className="divide-y divide-gray-200">
                    {standings.map((teamData, index) => (
                      <Link key={`team-${teamData.team}-${index}`} to={`/team/${encodeURIComponent(teamData.team)}`}>
                        <div className="p-3 md:p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group cursor-pointer">
                          <div className="flex items-center gap-2 md:gap-4">
                            <TeamLogo teamName={teamData.team} leagueId={league?.league_id || ""} size="md" />
                            <h3 className="font-semibold text-slate-800 text-sm md:text-lg">{teamData.team}</h3>
                          </div>
                          <ChevronRight className="w-4 md:w-5 h-4 md:h-5 text-gray-400 group-hover:text-orange-600 transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-xs md:text-sm">No teams available</p>
                    <p className="text-xs mt-1">Teams will appear once games are played</p>
                  </div>
                )}
              </div>
            )}

            {/* Schedule Section */}
            {activeSection === 'schedule' && (
              <div className="bg-white rounded-xl shadow p-4 md:p-6">
                <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-4 md:mb-6">Game Schedule</h2>
                {schedule.length > 0 ? (
                  <>
                    {(() => {
                      const now = new Date();
                      const upcomingGames = schedule
                        .filter(game => new Date(game.game_date) >= now)
                        .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime());
                      const pastGames = schedule
                        .filter(game => new Date(game.game_date) < now)
                        .sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());

                      return (
                        <>
                          {/* Upcoming Games */}
                          {upcomingGames.length > 0 && (
                            <div className="mb-6 md:mb-8">
                              <h3 className="text-sm md:text-md font-semibold text-slate-700 mb-3 md:mb-4 pb-2 border-b border-orange-200">
                                Upcoming Games
                              </h3>
                              <div className="divide-y divide-gray-200">
                                {upcomingGames.map((game, index) => (
                                  <div 
                                    key={`upcoming-${game.game_id}-${index}`} 
                                    className="p-3 md:p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                                    onClick={() => {
                                      setSelectedPreviewGame(game);
                                      setIsPreviewModalOpen(true);
                                    }}
                                    data-testid={`upcoming-game-${index}`}
                                  >
                                    <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
                                      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 flex-1">
                                        <div className="text-xs md:text-sm text-slate-600 md:min-w-[120px]">
                                          <div>
                                            {new Date(game.game_date).toLocaleDateString('en-US', { 
                                              weekday: 'short',
                                              month: 'short', 
                                              day: 'numeric',
                                              year: 'numeric'
                                            })}
                                          </div>
                                          {game.kickoff_time && (
                                            <div className="text-xs text-slate-500 mt-1">
                                              {game.kickoff_time}
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 md:gap-4 flex-1">
                                          <div className="flex items-center gap-1 md:gap-2 flex-1 md:min-w-[200px]">
                                            <TeamLogo teamName={game.team1} leagueId={league?.league_id || ""} size="sm" />
                                            <span className="font-medium text-slate-800 text-xs md:text-sm truncate">{game.team1}</span>
                                          </div>
                                          <span className="text-slate-500 text-xs md:text-sm">vs</span>
                                          <div className="flex items-center gap-1 md:gap-2 flex-1 md:min-w-[200px]">
                                            <TeamLogo teamName={game.team2} leagueId={league?.league_id || ""} size="sm" />
                                            <span className="font-medium text-slate-800 text-xs md:text-sm truncate">{game.team2}</span>
                                          </div>
                                        </div>
                                      </div>
                                      {game.venue && (
                                        <div className="text-xs text-slate-400 truncate md:max-w-[150px]">
                                          {game.venue}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Past Games (Results) */}
                          {pastGames.length > 0 && (
                            <div>
                              <h3 className="text-sm md:text-md font-semibold text-slate-700 mb-3 md:mb-4 pb-2 border-b border-orange-200">
                                Results
                              </h3>
                              <div className="divide-y divide-gray-200">
                                {pastGames.map((game, index) => (
                                  <div 
                                    key={`past-${game.game_id}-${index}`} 
                                    className={`p-3 md:p-4 transition-colors ${game.numeric_id ? 'cursor-pointer hover:bg-orange-50' : 'cursor-default'}`}
                                    onClick={() => {
                                      if (game.numeric_id) {
                                        handleGameClick(game.numeric_id);
                                      }
                                    }}
                                    data-testid={`past-game-${index}`}
                                  >
                                    <div className="flex flex-col gap-3">
                                      <div className="flex items-center justify-between">
                                        <div className="text-xs md:text-sm text-slate-600">
                                          <div>
                                            {new Date(game.game_date).toLocaleDateString('en-US', { 
                                              weekday: 'short',
                                              month: 'short', 
                                              day: 'numeric',
                                              year: 'numeric'
                                            })}
                                          </div>
                                          {game.status && (
                                            <div className="text-xs text-green-600 mt-1 font-medium">
                                              {game.status}
                                            </div>
                                          )}
                                        </div>
                                        {game.venue && (
                                          <div className="text-xs text-slate-400 truncate max-w-[120px] md:max-w-none">
                                            {game.venue}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1 md:gap-2 flex-1 min-w-0">
                                          <TeamLogo teamName={game.team1} leagueId={league?.league_id || ""} size="sm" />
                                          <span className="font-medium text-slate-800 text-xs md:text-sm truncate">{game.team1}</span>
                                        </div>
                                        {game.team1_score !== undefined && game.team2_score !== undefined ? (
                                          <div className="flex items-center gap-2 md:gap-3 px-2 md:px-4 flex-shrink-0">
                                            <span className={`text-lg md:text-xl font-bold ${game.team1_score > game.team2_score ? 'text-green-600' : 'text-slate-600'}`}>
                                              {game.team1_score}
                                            </span>
                                            <span className="text-slate-400 text-sm">-</span>
                                            <span className={`text-lg md:text-xl font-bold ${game.team2_score > game.team1_score ? 'text-green-600' : 'text-slate-600'}`}>
                                              {game.team2_score}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-slate-500 text-xs md:text-sm px-2 md:px-4 flex-shrink-0">vs</span>
                                        )}
                                        <div className="flex items-center gap-1 md:gap-2 flex-1 justify-end min-w-0">
                                          <span className="font-medium text-slate-800 text-xs md:text-sm truncate">{game.team2}</span>
                                          <TeamLogo teamName={game.team2} leagueId={league?.league_id || ""} size="sm" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No games scheduled</p>
                    <p className="text-xs mt-1">Games will appear when scheduled</p>
                  </div>
                )}
              </div>
            )}

            {/* Comparison Section */}
            {activeSection === 'comparison' && (
              <div className="space-y-4 md:space-y-6">
                {/* Toggle between Player and Team Comparison */}
                <div className="bg-white rounded-xl shadow p-3 md:p-4">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setComparisonMode('player')}
                      className={`px-4 md:px-6 py-1.5 md:py-2 rounded-lg text-sm md:text-base font-semibold transition-all ${
                        comparisonMode === 'player'
                          ? 'bg-orange-500 text-white shadow-md'
                          : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
                      }`}
                      data-testid="button-player-comparison"
                    >
                      Player Comparison
                    </button>
                    <button
                      onClick={() => setComparisonMode('team')}
                      className={`px-4 md:px-6 py-1.5 md:py-2 rounded-lg text-sm md:text-base font-semibold transition-all ${
                        comparisonMode === 'team'
                          ? 'bg-orange-500 text-white shadow-md'
                          : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
                      }`}
                      data-testid="button-team-comparison"
                    >
                      Team Comparison
                    </button>
                  </div>
                </div>

                {/* Render appropriate comparison component */}
                {comparisonMode === 'player' ? (
                  <PlayerComparison 
                    leagueId={league?.league_id || ""} 
                    allPlayers={allPlayerAverages}
                  />
                ) : (
                  <TeamComparison 
                    leagueId={league?.league_id || ""} 
                    allTeams={teamStatsData}
                  />
                )}
              </div>
            )}

            {/* Overview Section - Default view */}
            {activeSection === 'overview' && (
              <>
                {/* League Leaders */}
                <div className="bg-white rounded-xl shadow p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4 md:mb-6">
                <h2 className="text-base md:text-lg font-semibold text-slate-800">League Leaders</h2>
                <button
                  onClick={() => navigate(`/league-leaders/${slug}`)}
                  className="text-xs md:text-sm text-orange-500 hover:text-orange-600 font-medium hover:underline text-left sm:text-right"
                >
                  View All Leaders →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
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
                    <div key={title} className="bg-gray-50 rounded-lg p-3 md:p-4 shadow-inner">
                      <h3 className="text-xs md:text-sm font-semibold text-slate-700 mb-2 md:mb-3 text-center">{title}</h3>
                      <ul className="space-y-1 text-xs md:text-sm text-slate-800">
                        {Array.isArray(list) &&
                          list.map((p, i) => (
                            <li key={`${title}-${p.name}-${i}`} className="flex justify-between">
                              <span className="truncate mr-2">{p.name}</span>
                              <span className="font-medium text-orange-500 whitespace-nowrap">
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
            <div className="bg-white rounded-xl shadow p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-4">League Standings</h2>
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
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <table className="w-full text-xs md:text-sm min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 md:py-3 px-2 font-semibold text-slate-700 sticky left-0 bg-white z-10">#</th>
                        <th className="text-left py-2 md:py-3 px-2 font-semibold text-slate-700 sticky left-6 md:static bg-white z-10">Team</th>
                        <th className="text-center py-2 md:py-3 px-2 font-semibold text-slate-700">Record</th>
                        <th className="text-center py-2 md:py-3 px-2 font-semibold text-slate-700">Win%</th>
                        <th className="text-right py-2 md:py-3 px-2 font-semibold text-slate-700">PF</th>
                        <th className="text-right py-2 md:py-3 px-2 font-semibold text-slate-700 hidden md:table-cell">PA</th>
                        <th className="text-right py-2 md:py-3 px-2 font-semibold text-slate-700 hidden md:table-cell">Diff</th>
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
                          <td className="py-2 md:py-3 px-2 font-medium text-slate-600 sticky left-0 bg-inherit z-10">{index + 1}</td>
                          <td className="py-2 md:py-3 px-2 font-medium text-slate-800 sticky left-6 md:static bg-inherit z-10">
                            <div className="flex items-center gap-1 md:gap-2 min-w-[120px]">
                              <TeamLogo teamName={team.team} leagueId={league?.league_id} size="sm" />
                              <span className="truncate">{team.team}</span>
                            </div>
                          </td>
                          <td className="py-2 md:py-3 px-2 text-center font-medium text-slate-700">{team.record}</td>
                          <td className="py-2 md:py-3 px-2 text-center text-slate-600">{(team.winPct * 100).toFixed(1)}%</td>
                          <td className="py-2 md:py-3 px-2 text-right text-slate-600">{team.pointsFor}</td>
                          <td className="py-2 md:py-3 px-2 text-right text-slate-600 hidden md:table-cell">{team.pointsAgainst}</td>
                          <td className={`py-2 md:py-3 px-2 text-right font-medium hidden md:table-cell ${team.pointsDiff > 0 ? 'text-green-600' : team.pointsDiff < 0 ? 'text-red-600' : 'text-slate-600'}`}>{team.pointsDiff > 0 ? '+' : ''}{team.pointsDiff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 md:mt-4 text-xs text-slate-500">
                    <div className="flex gap-3 md:gap-4 flex-wrap text-xs">
                      <span>Record = Wins-Losses</span>
                      <span>Win% = Win Percentage</span>
                      <span>PF = Points For</span>
                      <span className="hidden md:inline">PA = Points Against</span>
                      <span className="hidden md:inline">Diff = Point Differential</span>
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

            <div className="bg-white rounded-xl shadow p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4">Player Stat Explorer</h2>

              <input
                type="text"
                placeholder="Search players..."
                className="w-full px-3 py-2 text-xs md:text-sm border border-gray-300 rounded mb-3 md:mb-4"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
              />

              {playerStats.length > 0 ? (
                <div>
                  {/* Sorting Controls */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-3 items-start sm:items-center">
                    <label className="text-xs md:text-sm text-slate-700 font-medium flex items-center gap-2">
                      Sort by:
                      <select
                        className="border border-orange-300 text-orange-600 bg-orange-50 px-2 py-1 rounded shadow-sm hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-300 text-xs md:text-sm"
                        value={sortField}
                        onChange={(e) => setSortField(e.target.value)}
                      >
                        <option value="points">Points</option>
                        <option value="rebounds_total">Rebounds</option>
                        <option value="assists">Assists</option>
                      </select>
                    </label>

                    <button
                      className="flex items-center gap-1 text-xs md:text-sm text-slate-600 hover:text-orange-600 transition"
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
                  <div className="overflow-x-auto -mx-4 md:mx-0">
                    <table className="mt-4 w-full text-xs md:text-sm text-left text-slate-700 min-w-[400px]">
                      <thead>
                        <tr>
                          <th className="px-2 py-1 md:py-2 sticky left-0 bg-white z-10">Name</th>
                          <th className="px-2 py-1 md:py-2">PTS</th>
                          <th className="px-2 py-1 md:py-2">REB</th>
                          <th className="px-2 py-1 md:py-2">AST</th>
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
                                <td className="px-2 py-1 md:py-2 sticky left-0 bg-white z-10 min-w-[120px]">{p.name}</td>
                                <td className="px-2 py-1 md:py-2">{p.points}</td>
                                <td className="px-2 py-1 md:py-2">{p.rebounds_total}</td>
                                <td className="px-2 py-1 md:py-2">{p.assists}</td>
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
                </div>
              ) : (
                <p className="text-xs md:text-sm text-slate-600 mt-2">No player data available.</p>
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

        {/* Game Preview Modal */}
        {selectedPreviewGame && league && (
          <GamePreviewModal
            game={selectedPreviewGame}
            leagueId={league.league_id}
            isOpen={isPreviewModalOpen}
            onClose={() => setIsPreviewModalOpen(false)}
          />
        )}
      </div>
    );
  }

