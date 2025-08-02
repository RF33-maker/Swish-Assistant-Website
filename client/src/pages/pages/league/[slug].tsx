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
      const gameResults: { [key: string]: { team: string, opponent: string, date: string, teamScore: number, opponentScore: number } } = {};
      
      // Group player stats by game (team + opponent + date)
      playerStats.forEach(stat => {
        if (!stat.team || !stat.opponent || !stat.game_date) return;
        
        const gameKey = `${stat.team}_vs_${stat.opponent}_${stat.game_date}`;
        
        if (!gameResults[gameKey]) {
          gameResults[gameKey] = {
            team: stat.team,
            opponent: stat.opponent,
            date: stat.game_date,
            teamScore: 0,
            opponentScore: 0
          };
        }
        
        gameResults[gameKey].teamScore += stat.points || 0;
      });

      // Also count opponent scores (reverse perspective)
      playerStats.forEach(stat => {
        if (!stat.team || !stat.opponent || !stat.game_date) return;
        
        const reverseGameKey = `${stat.opponent}_vs_${stat.team}_${stat.game_date}`;
        
        if (gameResults[reverseGameKey]) {
          gameResults[reverseGameKey].opponentScore += stat.points || 0;
        }
      });

      // Calculate team records
      const teamRecords: { [team: string]: { wins: number, losses: number, pointsFor: number, pointsAgainst: number, games: number } } = {};
      
      Object.values(gameResults).forEach(game => {
        // Initialize team records
        if (!teamRecords[game.team]) {
          teamRecords[game.team] = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 };
        }
        if (!teamRecords[game.opponent]) {
          teamRecords[game.opponent] = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 };
        }

        // Record game results
        if (game.teamScore > game.opponentScore) {
          teamRecords[game.team].wins++;
          teamRecords[game.opponent].losses++;
        } else if (game.opponentScore > game.teamScore) {
          teamRecords[game.opponent].wins++;
          teamRecords[game.team].losses++;
        }

        teamRecords[game.team].pointsFor += game.teamScore;
        teamRecords[game.team].pointsAgainst += game.opponentScore;
        teamRecords[game.team].games++;
        
        teamRecords[game.opponent].pointsFor += game.opponentScore;
        teamRecords[game.opponent].pointsAgainst += game.teamScore;
        teamRecords[game.opponent].games++;
      });

      // Convert to array and sort by win percentage
      const standingsArray = Object.entries(teamRecords).map(([team, record]) => ({
        team,
        wins: record.wins,
        losses: record.losses,
        winPct: record.games > 0 ? (record.wins / record.games) : 0,
        pointsFor: record.pointsFor,
        pointsAgainst: record.pointsAgainst,
        pointsDiff: record.pointsFor - record.pointsAgainst,
        games: record.games
      })).sort((a, b) => b.winPct - a.winPct || b.pointsDiff - a.pointsDiff);

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
            <a href="#" className="hover:text-orange-500">Overview</a>
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

            <section id="stats" className="bg-white rounded-xl shadow p-6">
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
                {([
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
                ))}
              </div>
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
                        <th className="text-center py-3 px-2 font-semibold text-slate-700">W</th>
                        <th className="text-center py-3 px-2 font-semibold text-slate-700">L</th>
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
                          <td className="py-3 px-2 font-medium text-slate-800">{team.team}</td>
                          <td className="py-3 px-2 text-center text-green-600 font-semibold">{team.wins}</td>
                          <td className="py-3 px-2 text-center text-red-600 font-semibold">{team.losses}</td>
                          <td className="py-3 px-2 text-center font-medium">
                            {team.games > 0 ? (team.winPct * 100).toFixed(1) + '%' : '0%'}
                          </td>
                          <td className="py-3 px-2 text-right text-slate-600">{team.pointsFor}</td>
                          <td className="py-3 px-2 text-right text-slate-600">{team.pointsAgainst}</td>
                          <td className={`py-3 px-2 text-right font-medium ${
                            team.pointsDiff > 0 ? 'text-green-600' : team.pointsDiff < 0 ? 'text-red-600' : 'text-slate-600'
                          }`}>
                            {team.pointsDiff > 0 ? '+' : ''}{team.pointsDiff}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 text-xs text-slate-500">
                    <div className="flex gap-6">
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

