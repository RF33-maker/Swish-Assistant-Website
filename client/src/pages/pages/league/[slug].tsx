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
  const [teams, setTeams] = useState([]);
  const [teamGames, setTeamGames] = useState({});
    


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
      const fetchUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);
      };
      fetchUser();
    }, []);

    useEffect(() => {
      const fetchLeague = async () => {
        const { data, error } = await supabase
          .from("leagues")
          .select("*")
          .eq("slug", slug)
          .single();
        
        console.log("Resolved league from slug:", slug, "→ ID:", data?.league_id);
        console.log("League data:", data);
        console.log("Current user:", currentUser);
        console.log("Fetch error:", error);

        if (data) {
          setLeague(data);
          const ownerStatus = currentUser?.id === data.user_id;
          setIsOwner(ownerStatus);
          setInstagramUrl(data.instagram_embed_url || "");
          console.log("Is owner?", ownerStatus, "User ID:", currentUser?.id, "League owner ID:", data.user_id);
        }
        
        if (error) {
          console.error("Failed to fetch league:", error);
          // Still set empty league data to show the page structure
          setLeague(null);
        }

        if (data?.league_id) {
          const fetchTopStats = async () => {
            const { data: scorerData } = await supabase
              .from("player_stats")
              .select("name, points")
              .eq("league_id", data.league_id)
              .order("points", { ascending: false })
              .limit(1)
              .single();

            const { data: reboundData } = await supabase
              .from("player_stats")
              .select("name, rebounds_total")
              .eq("league_id", data.league_id)
              .order("rebounds_total", { ascending: false })
              .limit(1)
              .single();

            const { data: assistData } = await supabase
              .from("player_stats")
              .select("name, assists")
              .eq("league_id", data.league_id)
              .order("assists", { ascending: false })
              .limit(1)
              .single();

            const { data: recentGames } = await supabase
              .from("player_stats")
              .select("name, team_name, game_date, points, assists, rebounds_total")
              .eq("league_id", data.league_id)
              .order("game_date", { ascending: false })
              .limit(5);

            const { data: allPlayerStats } = await supabase
              .from("player_stats")
              .select("*")
              .eq("league_id", data.league_id);

            setTopScorer(scorerData);
            setTopRebounder(reboundData);
            setTopAssists(assistData);
            setGameSummaries(recentGames || []);
            setPlayerStats(allPlayerStats || []);
            
            // Calculate standings from game data
            calculateStandings(allPlayerStats || []);
          };



          fetchTopStats();
          const fetchTeamsAfterStats = async () => {
            // Get unique teams from player stats
            const uniqueTeams = [...new Set(allPlayerStats?.map(stat => stat.team || stat.team_name).filter(Boolean))];
            
            const teamsWithData = await Promise.all(uniqueTeams.map(async (teamName) => {
              // Get team stats
              const teamPlayers = allPlayerStats?.filter(stat => 
                (stat.team || stat.team_name) === teamName
              ) || [];
              
              // Calculate team totals and averages
              const gamesByDate = teamPlayers.reduce((acc, player) => {
                if (!acc[player.game_date]) {
                  acc[player.game_date] = {
                    totalPoints: 0,
                    date: player.game_date,
                    opponent: player.opponent || 'Unknown'
                  };
                }
                acc[player.game_date].totalPoints += player.points || 0;
                return acc;
              }, {});
              
              const games = Object.values(gamesByDate);
              const recentGames = games.slice(-5); // Last 5 games
              
              // Get roster with stats
              const roster = teamPlayers.reduce((acc, player) => {
                const existing = acc.find(p => p.name === player.name);
                if (existing) {
                  existing.totalPoints += player.points || 0;
                  existing.totalRebounds += player.rebounds_total || 0;
                  existing.totalAssists += player.assists || 0;
                  existing.gamesPlayed += 1;
                } else {
                  acc.push({
                    name: player.name,
                    position: player.position || 'Player',
                    totalPoints: player.points || 0,
                    totalRebounds: player.rebounds_total || 0,
                    totalAssists: player.assists || 0,
                    gamesPlayed: 1
                  });
                }
                return acc;
              }, []);
              
              // Calculate averages
              roster.forEach(player => {
                player.avgPoints = Math.round((player.totalPoints / player.gamesPlayed) * 10) / 10;
                player.avgRebounds = Math.round((player.totalRebounds / player.gamesPlayed) * 10) / 10;
                player.avgAssists = Math.round((player.totalAssists / player.gamesPlayed) * 10) / 10;
              });
              
              // Find top player
              const topPlayer = roster.reduce((prev, current) => 
                (prev.avgPoints > current.avgPoints) ? prev : current, roster[0]
              );
              
              return {
                name: teamName,
                roster,
                topPlayer,
                recentGames,
                totalGames: games.length,
                avgTeamPoints: games.length > 0 ? 
                  Math.round((games.reduce((sum, game) => sum + game.totalPoints, 0) / games.length) * 10) / 10 : 0
              };
            }));
            
            setTeams(teamsWithData);
          };
          
          if (allPlayerStats && allPlayerStats.length > 0) {
            fetchTeamsAfterStats();
          }
        }

        if (error) console.error("Failed to fetch league:", error);
        setLeague(data);
      };

      fetchLeague();
    }, [slug]);

    const handleSearch = () => {
      if (search.trim()) {
        navigate(`/league/${search}`);
      }
    };

    const sortMap: Record<string, string> = {
      "Top Scorers": "points",
      "Top Rebounders": "rebounds_total",
      "Top Playmakers": "assists",
    };

    const sortedStats = [...playerStats].sort((a, b) => {
      const aValue = a[sortField] ?? 0;
      const bValue = b[sortField] ?? 0;
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    });

    const getTopList = (key: string) => {
      const grouped = playerStats.reduce((acc, curr) => {
        const playerKey = curr.name;
        if (!acc[playerKey]) {
          acc[playerKey] = { ...curr, games: 1 };
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

    const topScorers = getTopList("points");
    const topRebounders = getTopList("rebounds_total");
    const topAssistsList = getTopList("assists");

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

    // Calculate team standings from player stats
    const calculateStandings = (playerStats: any[]) => {
      
      // Since we don't have opponent data, let's create a simplified approach
      // We'll calculate basic team stats (total points, games played) without win/loss records
      const teamStats: { [team: string]: { totalPoints: number, games: number, avgPoints: number } } = {};
      
      // Group by team and count games
      const gamesByTeam: { [team: string]: Set<string> } = {};
      
      playerStats.forEach(stat => {
        const team = stat.team || stat.team_name;
        if (!team || !stat.game_date) return;
        
        // Initialize team stats
        if (!teamStats[team]) {
          teamStats[team] = { totalPoints: 0, games: 0, avgPoints: 0 };
          gamesByTeam[team] = new Set();
        }
        
        // Add points
        teamStats[team].totalPoints += stat.points || 0;
        
        // Track unique games for this team
        gamesByTeam[team].add(stat.game_date);
      });
      
      // Calculate games and averages
      Object.keys(teamStats).forEach(team => {
        teamStats[team].games = gamesByTeam[team].size;
        teamStats[team].avgPoints = teamStats[team].games > 0 ? 
          teamStats[team].totalPoints / teamStats[team].games : 0;
      });
      
      // Convert to standings format (sorted by average points since we don't have wins/losses)
      const standingsArray = Object.entries(teamStats).map(([team, stats]) => ({
        team,
        wins: 0, // We'll show 0 since we don't have opponent data
        losses: 0,
        winPct: 0,
        pointsFor: Math.round(stats.totalPoints),
        pointsAgainst: 0, // We don't have this data
        pointsDiff: 0,
        games: stats.games,
        avgPoints: Math.round(stats.avgPoints * 100) / 100
      })).sort((a, b) => b.avgPoints - a.avgPoints);

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
            <a href="#" className="hover:text-orange-500">Teams</a>
            <a href="#" className="hover:text-orange-500">Stats</a>
            <a 
              href="#" 
              className="hover:text-orange-500 cursor-pointer"
              onClick={() => navigate(`/league-leaders/${slug}`)}
            >
              Leaders
            </a>
            <a href="#" className="hover:text-orange-500">Schedule</a>
            <a href="#" className="hover:text-orange-500">Insights</a>
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

            {/* Teams Section */}
            <section id="teams" className="bg-white rounded-xl shadow p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-slate-800">Team Profiles</h2>
                <button
                  onClick={() => navigate(`/league-leaders/${slug}`)}
                  className="text-sm text-orange-500 hover:text-orange-600 font-medium hover:underline"
                >
                  View League Leaders →
                </button>
              </div>
              
              {teams.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {teams.map((team, index) => (
                    <div key={team.name} className="bg-gradient-to-br from-gray-50 to-orange-50 rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                      {/* Team Header */}
                      <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-4 text-white">
                        <div className="flex items-center gap-3">
                          {/* Team Logo Placeholder */}
                          <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center border-2 border-white/30">
                            <div className="text-center">
                              <div className="text-lg font-bold">{team.name.charAt(0)}</div>
                              <div className="text-xs opacity-75">LOGO</div>
                            </div>
                          </div>
                          
                          {/* Team Info */}
                          <div className="flex-1">
                            <h3 className="text-lg font-bold mb-1">{team.name}</h3>
                            <div className="text-sm opacity-90">
                              {team.roster.length} Players • {team.totalGames} Games • {team.avgTeamPoints} PPG
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Team Content */}
                      <div className="p-4 space-y-4">
                        {/* Description */}
                        <div>
                          <h4 className="font-semibold text-slate-800 mb-2 text-sm flex items-center gap-2">
                            <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Description
                          </h4>
                          <p className="text-sm text-slate-600 bg-white rounded-lg p-3 border border-orange-100">
                            Professional basketball team competing in {league?.name}. Known for competitive spirit and strong team chemistry.
                          </p>
                        </div>

                        {/* Recent Results */}
                        <div>
                          <h4 className="font-semibold text-slate-800 mb-2 text-sm flex items-center gap-2">
                            <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Recent Results (W/L)
                          </h4>
                          <div className="space-y-1">
                            {team.recentGames.slice(0, 3).map((game, idx) => (
                              <div key={idx} className="flex justify-between items-center p-2 bg-white rounded border border-orange-100">
                                <div className="text-sm">
                                  <span className="font-medium">vs {game.opponent}</span>
                                  <span className="text-gray-500 ml-2">{new Date(game.date).toLocaleDateString()}</span>
                                </div>
                                <div className="text-sm font-bold text-slate-700">
                                  {game.totalPoints} PTS
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Top Player & Roster Preview */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Top Player */}
                          {team.topPlayer && (
                            <div>
                              <h4 className="font-semibold text-slate-800 mb-2 text-sm flex items-center gap-2">
                                <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                Top Player
                              </h4>
                              <div className="bg-white border border-orange-100 rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                    {team.topPlayer.name.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-slate-800 text-sm truncate">{team.topPlayer.name}</div>
                                    <div className="text-xs text-slate-600">{team.topPlayer.position}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-orange-600 text-sm">{team.topPlayer.avgPoints}</div>
                                    <div className="text-xs text-slate-500">PPG</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Roster Preview */}
                          <div>
                            <h4 className="font-semibold text-slate-800 mb-2 text-sm flex items-center gap-2">
                              <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                              </svg>
                              Roster ({team.roster.length})
                            </h4>
                            <div className="bg-white border border-orange-100 rounded-lg p-3 max-h-24 overflow-y-auto">
                              <div className="space-y-1">
                                {team.roster.slice(0, 3).map((player, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm">
                                    <span className="font-medium truncate">{player.name}</span>
                                    <span className="text-slate-500 text-xs">{player.avgPoints} PPG</span>
                                  </div>
                                ))}
                                {team.roster.length > 3 && (
                                  <div className="text-center text-xs text-slate-500 py-1">
                                    +{team.roster.length - 3} more
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* View Full Profile Button */}
                        <div className="pt-3 border-t border-orange-100">
                          <button 
                            onClick={() => navigate(`/team/${encodeURIComponent(team.name)}`)}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View Full Profile
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-orange-50 rounded-xl border border-gray-200">
                  <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No teams found</h3>
                  <p className="text-gray-600">Teams will appear here once player data is available for this league.</p>
                </div>
              )}
            </section>

            {/* League Standings */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">League Standings</h2>
              {standings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 font-semibold text-slate-700">#</th>
                        <th className="text-left py-3 px-2 font-semibold text-slate-700">Team</th>
                        <th className="text-center py-3 px-2 font-semibold text-slate-700">GP</th>
                        <th className="text-right py-3 px-2 font-semibold text-slate-700">Total PTS</th>
                        <th className="text-right py-3 px-2 font-semibold text-slate-700">Avg PTS</th>
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
                          <td className="py-3 px-2 font-medium text-slate-800">{team.team}</td>
                          <td className="py-3 px-2 text-center text-slate-600">{team.games}</td>
                          <td className="py-3 px-2 text-right text-slate-600">{team.pointsFor}</td>
                          <td className="py-3 px-2 text-right font-medium text-orange-600">{team.avgPoints}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 text-xs text-slate-500">
                    <div className="flex gap-6">
                      <span>GP = Games Played</span>
                      <span>Total PTS = Total Points Scored</span>
                      <span>Avg PTS = Average Points Per Game</span>
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
                          p.name.toLowerCase().includes(playerSearch.toLowerCase())
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

          </section>

          <aside className="space-y-6">
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

