import { useEffect, useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { ArrowLeft, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { namesMatch, getMostCompleteName } from "@/lib/fuzzyMatch";
import { normalizeTeamName } from "@/lib/teamUtils";
import { useLeagueBranding } from "@/hooks/useLeagueBranding";
import LeagueDefaultImage from "@/assets/league-default.png";

interface ChildLeague {
  league_id: string;
  name: string;
}

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
  efficiency: any[];
}

interface League {
  league_id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  banner_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
}

export default function LeagueLeadersPage() {
  const { slug } = useParams();
  const [location, navigate] = useLocation();
  const [league, setLeague] = useState<League | null>(null);
  const [rawPlayerStats, setRawPlayerStats] = useState<any[]>([]);
  const [childLeagues, setChildLeagues] = useState<ChildLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'averages' | 'totals'>('averages');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>('all');

  const { colors: leagueBrandColors } = useLeagueBranding({
    slug,
    bannerUrl: league?.banner_url,
    logoUrl: league?.logo_url,
    manualPrimaryColor: league?.primary_color,
    manualSecondaryColor: league?.secondary_color,
    manualAccentColor: league?.accent_color,
    enabled: !!league,
  });

  const brandColor = leagueBrandColors?.primary || 'rgb(249, 115, 22)';
  const brandColorHover = leagueBrandColors
    ? `rgb(${Math.max(0, leagueBrandColors.primaryRgb.r - 20)}, ${Math.max(0, leagueBrandColors.primaryRgb.g - 20)}, ${Math.max(0, leagueBrandColors.primaryRgb.b - 20)})`
    : 'rgb(234, 88, 12)';
  const brandBorderLight = leagueBrandColors
    ? `rgba(${leagueBrandColors.primaryRgb.r}, ${leagueBrandColors.primaryRgb.g}, ${leagueBrandColors.primaryRgb.b}, 0.2)`
    : 'rgb(255, 237, 213)';
  const brandBg10 = leagueBrandColors
    ? `rgba(${leagueBrandColors.primaryRgb.r}, ${leagueBrandColors.primaryRgb.g}, ${leagueBrandColors.primaryRgb.b}, 0.1)`
    : 'rgba(249, 115, 22, 0.1)';
  const brandBg50 = leagueBrandColors
    ? `rgba(${leagueBrandColors.primaryRgb.r}, ${leagueBrandColors.primaryRgb.g}, ${leagueBrandColors.primaryRgb.b}, 0.05)`
    : 'rgba(249, 115, 22, 0.05)';
  const brandTextLight = leagueBrandColors
    ? `rgb(${Math.min(255, leagueBrandColors.primaryRgb.r + 60)}, ${Math.min(255, leagueBrandColors.primaryRgb.g + 60)}, ${Math.min(255, leagueBrandColors.primaryRgb.b + 60)})`
    : 'rgb(251, 146, 60)';

  const [brandFadedIn, setBrandFadedIn] = useState(false);
  useEffect(() => {
    if (leagueBrandColors) {
      const raf = requestAnimationFrame(() => {
        setBrandFadedIn(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setBrandFadedIn(false);
    }
  }, [leagueBrandColors]);

  const isParentLeague = childLeagues.length > 0;

  const ageGroupOptions = useMemo(() => {
    if (!isParentLeague || !league) return [];
    return childLeagues
      .map(c => ({
        league_id: c.league_id,
        label: league.name ? c.name.replace(league.name, '').trim() || c.name : c.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [childLeagues, league, isParentLeague]);

  useEffect(() => {
    const fetchLeagueAndStats = async () => {
      if (!slug) return;

      try {
        setLoading(true);
        setError(null);

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

        let leagueIdsToQuery = [leagueData.league_id];
        const { data: childLeagueData } = await supabase
          .from("leagues")
          .select("league_id, name")
          .eq("parent_league_id", leagueData.league_id);
        
        if (childLeagueData && childLeagueData.length > 0) {
          setChildLeagues(childLeagueData);
          leagueIdsToQuery = childLeagueData.map(c => c.league_id);
        } else {
          setChildLeagues([]);
        }

        let allPlayerStats: any[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
          const { data: pageData, error: pageError } = await supabase
            .from("player_stats")
            .select("*, players:player_id(full_name, slug)")
            .in("league_id", leagueIdsToQuery)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          
          if (pageError) {
            console.error("Error fetching player stats page", page, ":", pageError);
            break;
          }
          
          if (pageData && pageData.length > 0) {
            allPlayerStats = [...allPlayerStats, ...pageData];
            hasMore = pageData.length === pageSize;
            page++;
          } else {
            hasMore = false;
          }
        }
        
        if (!allPlayerStats || allPlayerStats.length === 0) {
          setError("No player statistics found for this league");
          return;
        }

        setRawPlayerStats(allPlayerStats);

      } catch (err) {
        console.error("Error fetching league leaders:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchLeagueAndStats();
  }, [slug]);

  const leaderboardStats = useMemo(() => {
    if (rawPlayerStats.length === 0) return null;

    let filteredStats = rawPlayerStats;
    if (isParentLeague && selectedAgeGroup !== 'all') {
      filteredStats = rawPlayerStats.filter(s => s.league_id === selectedAgeGroup);
    }

    if (filteredStats.length === 0) return null;

    const processedStats: LeaderboardStats = {
      points: [],
      rebounds_total: [],
      assists: [],
      steals: [],
      blocks: [],
      field_goal_percentage: [],
      three_point_percentage: [],
      free_throw_percentage: [],
      games_played: [],
      efficiency: []
    };

    const playerStatsMap = new Map();

    filteredStats.forEach(stat => {
      const teamName = stat.team || stat.team_name || 'Unknown Team';
      const playerName = stat.full_name || 
                        stat.players?.full_name || 
                        stat.name || 
                        `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || 
                        'Unknown Player';
      const playerKey = stat.player_id || stat.id;
      if (!playerStatsMap.has(playerKey)) {
        playerStatsMap.set(playerKey, {
          player_id: stat.player_id || stat.id,
          player_slug: stat.players?.slug || null,
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
          total_turnovers: 0,
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
      playerData.total_turnovers += stat.sturnovers || 0;
      playerData.games_played += 1;
    });

    const playersByIdArray = Array.from(playerStatsMap.values());
    playersByIdArray.sort((a, b) => b.games_played - a.games_played);
    
    const mergedPlayers: typeof playersByIdArray = [];
    
    playersByIdArray.forEach((player) => {
      const playerTeamNormalized = normalizeTeamName(player.team_name);
      let foundMatch = false;
      for (const existingPlayer of mergedPlayers) {
        const existingTeamNormalized = normalizeTeamName(existingPlayer.team_name);
        const sameTeam = existingTeamNormalized === playerTeamNormalized;
        if (sameTeam && namesMatch(player.name, existingPlayer.name)) {
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
          existingPlayer.total_turnovers += player.total_turnovers;
          existingPlayer.name = getMostCompleteName([existingPlayer.name, player.name]);
          if (!existingPlayer.player_slug && player.player_slug) {
            existingPlayer.player_slug = player.player_slug;
          }
          foundMatch = true;
          break;
        }
      }
      
      if (!foundMatch) {
        mergedPlayers.push({ ...player });
      }
    });

    const playersArray = mergedPlayers;

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
      .filter(p => p.total_field_goals_attempted >= 2)
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
      .filter(p => p.total_three_points_attempted >= 1)
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
      .filter(p => p.total_free_throws_attempted >= 1)
      .sort((a, b) => b.ft_percentage - a.ft_percentage)
      .slice(0, 5);

    processedStats.efficiency = playersWithEnoughGames
      .map(p => {
        const totalEff = p.total_points + p.total_rebounds + p.total_assists + p.total_steals + p.total_blocks
          - (p.total_field_goals_attempted - p.total_field_goals_made)
          - (p.total_free_throws_attempted - p.total_free_throws_made)
          - p.total_turnovers;
        const avgEff = totalEff / p.games_played;
        return {
          ...p,
          total_efficiency: totalEff,
          avg_efficiency: avgEff,
          display_value: viewMode === 'averages'
            ? `${avgEff.toFixed(1)} EFF`
            : `${Math.round(totalEff)} EFF`
        };
      })
      .sort((a, b) => viewMode === 'averages'
        ? b.avg_efficiency - a.avg_efficiency
        : b.total_efficiency - a.total_efficiency)
      .slice(0, 5);

    processedStats.games_played = playersArray
      .map(p => ({
        ...p,
        display_value: `${p.games_played} GP`
      }))
      .sort((a, b) => b.games_played - a.games_played)
      .slice(0, 5);

    return processedStats;
  }, [rawPlayerStats, viewMode, selectedAgeGroup, isParentLeague]);

  const StatLeaderboard = ({ 
    title, 
    players, 
  }: { 
    title: string; 
    players: any[]; 
  }) => (
    <Card
      className="bg-white dark:bg-neutral-900 dark:border-neutral-700 shadow-md hover:shadow-lg transition-all duration-300"
      style={{ borderColor: brandBorderLight }}
    >
      <CardHeader className="pb-2 md:pb-3 p-4 md:p-6">
        <CardTitle className="text-base md:text-lg font-semibold" style={{ color: brandColor }}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 md:p-6 pt-0">
        {players.length > 0 ? (
          players.map((player, index) => (
            <div 
              key={`${player.player_id}-${index}`} 
              className="leader-row flex items-center justify-between py-2 md:py-3 px-2 md:px-3 rounded-lg transition-colors duration-200 cursor-pointer"
              onClick={() => {
                const identifier = player.player_slug || player.player_id;
                if (identifier) navigate(`/player/${identifier}`);
              }}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div
                  className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-bold text-white"
                  style={{
                    background: index === 0
                      ? 'linear-gradient(to bottom right, #facc15, #ca8a04)'
                      : index === 1
                      ? 'linear-gradient(to bottom right, #9ca3af, #4b5563)'
                      : index === 2
                      ? `linear-gradient(to bottom right, ${brandColor}, ${brandColorHover})`
                      : brandBg10,
                    color: index >= 3 ? brandColor : '#ffffff',
                  }}
                >
                  {index + 1}
                </div>
                <div>
                  <p className="brand-name text-sm md:text-base font-medium" style={{ color: brandColorHover }}>{player.name}</p>
                  <p className="text-xs md:text-sm text-gray-800 dark:text-white">{player.team_name || 'Unknown Team'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="brand-value text-sm md:text-base font-bold" style={{ color: brandColor }}>{player.display_value}</p>
                <p className="brand-games text-xs" style={{ color: brandColor, opacity: 0.7 }}>{player.games_played} games</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center py-4" style={{ color: brandColor }}>No data available</p>
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: brandColor }}></div>
            <p style={{ color: brandColor }}>Loading league leaders...</p>
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
    <div
      className="league-leaders-page min-h-screen flex flex-col bg-[#fffaf1] dark:bg-neutral-950 transition-colors duration-700 relative"
      style={{ '--brand-bg': brandBg50, '--brand-bg-hover': brandBg10, '--brand-text-light': brandTextLight } as React.CSSProperties}
    >
      <style>{`
        .league-leaders-page .leader-row { background-color: var(--brand-bg); }
        .league-leaders-page .leader-row:hover { background-color: var(--brand-bg-hover); }
        :is(.dark) .league-leaders-page .leader-row { background-color: rgb(38 38 38); }
        :is(.dark) .league-leaders-page .leader-row:hover { background-color: rgb(64 64 64); }
        :is(.dark) .league-leaders-page .leader-row .brand-name { color: var(--brand-text-light); }
        :is(.dark) .league-leaders-page .leader-row .brand-value { color: var(--brand-text-light); }
        :is(.dark) .league-leaders-page .leader-row .brand-games { color: var(--brand-text-light); opacity: 0.7; }
        .league-leaders-page .brand-toggle:not(.brand-toggle-active):hover { background-color: var(--brand-bg-hover); }
      `}</style>
      {leagueBrandColors && (
        <>
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-1000 ease-in-out dark:hidden"
            style={{
              opacity: brandFadedIn ? 1 : 0,
              background: `linear-gradient(180deg, transparent 20%, rgba(${leagueBrandColors.primaryRgb.r}, ${leagueBrandColors.primaryRgb.g}, ${leagueBrandColors.primaryRgb.b}, 0.08) 60%, rgba(${leagueBrandColors.primaryRgb.r}, ${leagueBrandColors.primaryRgb.g}, ${leagueBrandColors.primaryRgb.b}, 0.18) 100%)`,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-1000 ease-in-out hidden dark:block"
            style={{
              opacity: brandFadedIn ? 1 : 0,
              background: `linear-gradient(180deg, transparent 20%, rgba(${leagueBrandColors.primaryRgb.r}, ${leagueBrandColors.primaryRgb.g}, ${leagueBrandColors.primaryRgb.b}, 0.10) 60%, rgba(${leagueBrandColors.primaryRgb.r}, ${leagueBrandColors.primaryRgb.g}, ${leagueBrandColors.primaryRgb.b}, 0.22) 100%)`,
            }}
          />
        </>
      )}
      <div className="relative z-10 flex flex-col min-h-screen">
      <Header />

      <section className="mb-6">
        <div
          className="rounded-xl overflow-hidden shadow relative h-40 sm:h-52 md:h-64 bg-gray-200 mx-4 md:mx-6 mt-4"
          style={{
            backgroundImage: `url(${league?.banner_url || LeagueDefaultImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-6">
            <div className="flex items-center gap-3">
              {league?.logo_url && (
                <img src={league.logo_url} alt={league.name} className="h-10 w-10 md:h-14 md:w-14 object-contain rounded-lg bg-white/20 p-1" />
              )}
              <div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white drop-shadow-md">
                  League Leaders
                </h1>
                <p className="text-sm text-white/90 mt-1">{league?.name}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-grow p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6 md:space-y-8">
        <button
          onClick={() => navigate(`/league/${slug}`)}
          className="flex items-center gap-2 font-medium transition-colors opacity-90 hover:opacity-100"
          style={{ color: brandColor }}
          data-testid="button-back-to-league"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to League</span>
        </button>

        <div className="text-center space-y-3 md:space-y-4">
          {league?.description && (
            <p className="text-sm md:text-base text-gray-800 dark:text-white max-w-2xl mx-auto">{league.description}</p>
          )}
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            {isParentLeague && ageGroupOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" style={{ color: brandColor }} />
                <select
                  value={selectedAgeGroup}
                  onChange={(e) => setSelectedAgeGroup(e.target.value)}
                  className="px-3 py-2 text-sm font-medium rounded-lg border dark:border-neutral-700 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2"
                  style={{ borderColor: brandBorderLight, color: brandColor }}
                  data-testid="select-age-group"
                >
                  <option value="all">All Age Groups</option>
                  {ageGroupOptions.map(opt => (
                    <option key={opt.league_id} value={opt.league_id}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="inline-flex rounded-lg border dark:border-neutral-700 p-1" style={{ borderColor: brandBorderLight, backgroundColor: brandBg50 }}>
              <button
                onClick={() => setViewMode('averages')}
                className={`brand-toggle px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  viewMode === 'averages'
                    ? 'brand-toggle-active bg-white dark:bg-neutral-700 shadow-sm'
                    : ''
                }`}
                style={{ color: brandColor }}
                data-testid="button-view-averages"
              >
                Averages
              </button>
              <button
                onClick={() => setViewMode('totals')}
                className={`brand-toggle px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  viewMode === 'totals'
                    ? 'brand-toggle-active bg-white dark:bg-neutral-700 shadow-sm'
                    : ''
                }`}
                style={{ color: brandColor }}
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
            <StatLeaderboard title="Scoring Leaders" players={leaderboardStats.points} />
            <StatLeaderboard title="Rebounding Leaders" players={leaderboardStats.rebounds_total} />
            <StatLeaderboard title="Assist Leaders" players={leaderboardStats.assists} />
            <StatLeaderboard title="Steal Leaders" players={leaderboardStats.steals} />
            <StatLeaderboard title="Block Leaders" players={leaderboardStats.blocks} />
            <StatLeaderboard title="Field Goal %" players={leaderboardStats.field_goal_percentage} />
            <StatLeaderboard title="Three Point %" players={leaderboardStats.three_point_percentage} />
            <StatLeaderboard title="Free Throw %" players={leaderboardStats.free_throw_percentage} />
            <StatLeaderboard title="Efficiency Leaders" players={leaderboardStats.efficiency} />
            <StatLeaderboard title="Games Played" players={leaderboardStats.games_played} />
          </div>
        )}

        <div className="dark:bg-neutral-800 border dark:border-neutral-700 rounded-lg p-3 md:p-4 text-center" style={{ backgroundColor: brandBg50, borderColor: brandBorderLight }}>
          <p className="text-xs md:text-sm" style={{ color: brandColor }}>
            * Shooting percentages require minimum attempts: Field Goals (2+), Three Pointers (1+), Free Throws (1+)
          </p>
        </div>
      </main>

      <Footer />
      </div>
    </div>
  );
}