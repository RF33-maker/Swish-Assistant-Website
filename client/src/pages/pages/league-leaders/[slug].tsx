import { useEffect, useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { namesMatch, getMostCompleteName } from "@/lib/fuzzyMatch";
import { normalizeTeamName } from "@/lib/teamUtils";
import { useLeagueBranding } from "@/hooks/useLeagueBranding";
import LeagueDefaultImage from "@/assets/league-default.png";

interface ChildLeague {
  league_id: string;
  name: string;
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

type StatCategory = 'Traditional' | 'Advanced';

interface StatLeaderDef {
  key: string;
  title: string;
  avgLabel: string;
  totalLabel: string;
  compute: (p: any) => { avg: number; total: number; display: string };
  minAttempts?: (p: any) => boolean;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  const [selectedRound, setSelectedRound] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('season');
  const [statCategory, setStatCategory] = useState<StatCategory>('Traditional');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

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

  const availableRounds = useMemo(() => {
    if (!isParentLeague) return [];
    const rounds = new Set<string>();
    rawPlayerStats.forEach(s => {
      if (s.round) rounds.add(s.round);
    });
    return [...rounds].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''));
      const numB = parseInt(b.replace(/\D/g, ''));
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [rawPlayerStats, isParentLeague]);

  const availableMonths = useMemo(() => {
    if (isParentLeague) return [];
    const months = new Set<string>();
    rawPlayerStats.forEach(s => {
      if (s.game_date) {
        const d = new Date(s.game_date);
        if (!isNaN(d.getTime())) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          months.add(key);
        }
      }
    });
    return [...months].sort();
  }, [rawPlayerStats, isParentLeague]);

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

  const getTraditionalDefs = (vm: 'averages' | 'totals'): StatLeaderDef[] => [
    {
      key: 'points', title: 'Points', avgLabel: 'PPG', totalLabel: 'PTS',
      compute: (p) => {
        const avg = p.total_points / p.games_played;
        return { avg, total: p.total_points, display: vm === 'averages' ? `${avg.toFixed(1)}` : `${Math.round(p.total_points)}` };
      }
    },
    {
      key: 'rebounds', title: 'Rebounds', avgLabel: 'RPG', totalLabel: 'REB',
      compute: (p) => {
        const avg = p.total_rebounds / p.games_played;
        return { avg, total: p.total_rebounds, display: vm === 'averages' ? `${avg.toFixed(1)}` : `${Math.round(p.total_rebounds)}` };
      }
    },
    {
      key: 'assists', title: 'Assists', avgLabel: 'APG', totalLabel: 'AST',
      compute: (p) => {
        const avg = p.total_assists / p.games_played;
        return { avg, total: p.total_assists, display: vm === 'averages' ? `${avg.toFixed(1)}` : `${Math.round(p.total_assists)}` };
      }
    },
    {
      key: 'steals', title: 'Steals', avgLabel: 'SPG', totalLabel: 'STL',
      compute: (p) => {
        const avg = p.total_steals / p.games_played;
        return { avg, total: p.total_steals, display: vm === 'averages' ? `${avg.toFixed(1)}` : `${Math.round(p.total_steals)}` };
      }
    },
    {
      key: 'blocks', title: 'Blocks', avgLabel: 'BPG', totalLabel: 'BLK',
      compute: (p) => {
        const avg = p.total_blocks / p.games_played;
        return { avg, total: p.total_blocks, display: vm === 'averages' ? `${avg.toFixed(1)}` : `${Math.round(p.total_blocks)}` };
      }
    },
    {
      key: 'turnovers', title: 'Turnovers', avgLabel: 'TPG', totalLabel: 'TO',
      compute: (p) => {
        const avg = p.total_turnovers / p.games_played;
        return { avg, total: p.total_turnovers, display: vm === 'averages' ? `${avg.toFixed(1)}` : `${Math.round(p.total_turnovers)}` };
      }
    },
    {
      key: 'fg_pct', title: 'Field Goal %', avgLabel: 'FG%', totalLabel: 'FG%',
      compute: (p) => {
        const pct = p.total_field_goals_attempted > 0 ? (p.total_field_goals_made / p.total_field_goals_attempted) * 100 : 0;
        return { avg: pct, total: pct, display: `${pct.toFixed(1)}%` };
      },
      minAttempts: (p) => p.total_field_goals_attempted >= 2
    },
    {
      key: '3p_pct', title: 'Three Point %', avgLabel: '3P%', totalLabel: '3P%',
      compute: (p) => {
        const pct = p.total_three_points_attempted > 0 ? (p.total_three_points_made / p.total_three_points_attempted) * 100 : 0;
        return { avg: pct, total: pct, display: `${pct.toFixed(1)}%` };
      },
      minAttempts: (p) => p.total_three_points_attempted >= 1
    },
    {
      key: 'ft_pct', title: 'Free Throw %', avgLabel: 'FT%', totalLabel: 'FT%',
      compute: (p) => {
        const pct = p.total_free_throws_attempted > 0 ? (p.total_free_throws_made / p.total_free_throws_attempted) * 100 : 0;
        return { avg: pct, total: pct, display: `${pct.toFixed(1)}%` };
      },
      minAttempts: (p) => p.total_free_throws_attempted >= 1
    },
  ];

  const getAdvancedDefs = (vm: 'averages' | 'totals'): StatLeaderDef[] => [
    {
      key: 'efficiency', title: 'Efficiency', avgLabel: 'EFF', totalLabel: 'EFF',
      compute: (p) => {
        const totalEff = p.total_points + p.total_rebounds + p.total_assists + p.total_steals + p.total_blocks
          - (p.total_field_goals_attempted - p.total_field_goals_made)
          - (p.total_free_throws_attempted - p.total_free_throws_made)
          - p.total_turnovers;
        const avg = totalEff / p.games_played;
        return { avg, total: totalEff, display: vm === 'averages' ? `${avg.toFixed(1)}` : `${Math.round(totalEff)}` };
      }
    },
    {
      key: 'efg_pct', title: 'Effective FG%', avgLabel: 'EFG%', totalLabel: 'EFG%',
      compute: (p) => {
        const efg = p.total_field_goals_attempted > 0
          ? ((p.total_field_goals_made + 0.5 * p.total_three_points_made) / p.total_field_goals_attempted) * 100
          : 0;
        return { avg: efg, total: efg, display: `${efg.toFixed(1)}%` };
      },
      minAttempts: (p) => p.total_field_goals_attempted >= 2
    },
    {
      key: 'ts_pct', title: 'True Shooting %', avgLabel: 'TS%', totalLabel: 'TS%',
      compute: (p) => {
        const tsa = 2 * (p.total_field_goals_attempted + 0.44 * p.total_free_throws_attempted);
        const ts = tsa > 0 ? (p.total_points / tsa) * 100 : 0;
        return { avg: ts, total: ts, display: `${ts.toFixed(1)}%` };
      },
      minAttempts: (p) => p.total_field_goals_attempted >= 2
    },
    {
      key: 'ast_to', title: 'Assist/Turnover Ratio', avgLabel: 'AST/TO', totalLabel: 'AST/TO',
      compute: (p) => {
        const ratio = p.total_turnovers > 0 ? p.total_assists / p.total_turnovers : p.total_assists;
        return { avg: ratio, total: ratio, display: `${ratio.toFixed(2)}` };
      },
      minAttempts: (p) => p.games_played >= 2
    },
    {
      key: 'games_played', title: 'Games Played', avgLabel: 'GP', totalLabel: 'GP',
      compute: (p) => {
        return { avg: p.games_played, total: p.games_played, display: `${p.games_played}` };
      }
    },
  ];

  const filteredStats = useMemo(() => {
    let stats = rawPlayerStats;

    if (isParentLeague && selectedAgeGroup !== 'all') {
      stats = stats.filter(s => s.league_id === selectedAgeGroup);
    }

    if (isParentLeague && selectedRound !== 'all') {
      stats = stats.filter(s => s.round === selectedRound);
    }

    if (!isParentLeague && selectedMonth !== 'season') {
      stats = stats.filter(s => {
        if (!s.game_date) return false;
        const d = new Date(s.game_date);
        if (isNaN(d.getTime())) return false;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return key === selectedMonth;
      });
    }

    return stats;
  }, [rawPlayerStats, isParentLeague, selectedAgeGroup, selectedRound, selectedMonth]);

  const aggregatedPlayers = useMemo(() => {
    if (filteredStats.length === 0) return [];

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

    return mergedPlayers;
  }, [filteredStats]);

  const leaderboards = useMemo(() => {
    if (aggregatedPlayers.length === 0) return [];

    const defs = statCategory === 'Traditional' 
      ? getTraditionalDefs(viewMode) 
      : getAdvancedDefs(viewMode);

    return defs.map(def => {
      let eligible = aggregatedPlayers.filter(p => p.games_played >= 1);
      if (def.minAttempts) {
        eligible = eligible.filter(def.minAttempts);
      }

      const computed = eligible.map(p => {
        const result = def.compute(p);
        return { ...p, _computed: result };
      });

      const isPercentage = def.key.includes('pct') || def.key === 'ast_to';
      computed.sort((a, b) => {
        if (isPercentage || viewMode === 'averages') {
          return b._computed.avg - a._computed.avg;
        }
        return b._computed.total - a._computed.total;
      });

      return {
        key: def.key,
        title: def.title,
        players: computed.slice(0, 5),
      };
    });
  }, [aggregatedPlayers, statCategory, viewMode]);

  const StatSection = ({ title, players }: { title: string; players: any[] }) => (
    <div className="mb-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">{title}</h3>
      {players.length > 0 ? (
        <div className="space-y-1">
          {players.map((player, index) => (
            <div 
              key={`${player.player_id}-${index}`} 
              className="leader-row flex items-center justify-between py-3 px-3 rounded-lg transition-colors duration-200 cursor-pointer"
              onClick={() => {
                const identifier = player.player_slug || player.player_id;
                if (identifier) navigate(`/player/${identifier}`);
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-gray-400 dark:text-gray-500 w-5 text-center">{index + 1}</span>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
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
                  {player.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="brand-name text-sm font-semibold">{player.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{player.team_name || 'Unknown Team'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="brand-value text-lg font-bold" style={{ color: brandColor }}>{player._computed.display}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center py-4 text-gray-500">No data available</p>
      )}
    </div>
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

  const totalGamesInData = filteredStats.length;
  const uniqueGames = new Set(filteredStats.map(s => s.game_id).filter(Boolean)).size;

  return (
    <div
      className="league-leaders-page min-h-screen flex flex-col bg-[#fffaf1] dark:bg-neutral-950 transition-colors duration-700 relative"
      style={{ '--brand-bg': brandBg50, '--brand-bg-hover': brandBg10, '--brand-text-light': brandTextLight } as React.CSSProperties}
    >
      <style>{`
        .league-leaders-page .leader-row { background-color: #1a1a1a; }
        .league-leaders-page .leader-row:hover { background-color: #2a2a2a; }
        .league-leaders-page .leader-row .brand-name { color: #ffffff !important; }
        .league-leaders-page .leader-row .brand-value { color: #ffffff !important; }
        .league-leaders-page .leader-row .brand-games { color: #d4d4d4 !important; opacity: 0.85; }
        :is(.dark) .league-leaders-page .leader-row { background-color: rgb(38 38 38); }
        :is(.dark) .league-leaders-page .leader-row:hover { background-color: rgb(64 64 64); }
        :is(.dark) .league-leaders-page .leader-row .brand-name { color: var(--brand-text-light) !important; }
        :is(.dark) .league-leaders-page .leader-row .brand-value { color: var(--brand-text-light) !important; }
        :is(.dark) .league-leaders-page .leader-row .brand-games { color: var(--brand-text-light) !important; opacity: 0.7; }
        .league-leaders-page .filter-tab { transition: all 0.2s ease; }
        .league-leaders-page .filter-tab:hover { opacity: 0.8; }
        .league-leaders-page .filter-tab-active { border-bottom: 2px solid currentColor; }
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
                  Stat Leaders
                </h1>
                <p className="text-sm text-white/90 mt-1">{league?.name}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-grow p-4 md:p-6 max-w-3xl mx-auto w-full space-y-5">
        <button
          onClick={() => navigate(`/league/${slug}`)}
          className="flex items-center gap-2 font-medium transition-colors opacity-90 hover:opacity-100"
          style={{ color: brandColor }}
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to League</span>
        </button>

        {/* Category Dropdown */}
        <div className="relative">
          <button
            onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
            className="flex items-center justify-between w-full max-w-xs px-4 py-3 rounded-xl border bg-white dark:bg-neutral-900 text-left text-lg font-semibold text-gray-900 dark:text-white transition-all"
            style={{ borderColor: brandBorderLight }}
          >
            <span>{statCategory}</span>
            <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {categoryDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCategoryDropdownOpen(false)} />
              <div className="absolute z-20 mt-1 w-full max-w-xs rounded-xl border bg-white dark:bg-neutral-900 shadow-lg overflow-hidden" style={{ borderColor: brandBorderLight }}>
                {(['Traditional', 'Advanced'] as StatCategory[]).map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setStatCategory(cat); setCategoryDropdownOpen(false); }}
                    className={`w-full px-4 py-3 text-left text-base font-medium transition-colors ${
                      statCategory === cat
                        ? 'bg-gray-100 dark:bg-neutral-800'
                        : 'hover:bg-gray-50 dark:hover:bg-neutral-800'
                    } text-gray-900 dark:text-white`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Filter Row: Age Group + Rounds (Parent League) OR Season + Months (Regular) */}
        {isParentLeague ? (
          <div className="space-y-3">
            {/* Age Group Filter */}
            {ageGroupOptions.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => setSelectedAgeGroup('all')}
                  className={`filter-tab whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                    selectedAgeGroup === 'all'
                      ? 'text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  style={selectedAgeGroup === 'all' ? { backgroundColor: brandColor } : {}}
                >
                  All Ages
                </button>
                {ageGroupOptions.map(opt => (
                  <button
                    key={opt.league_id}
                    onClick={() => setSelectedAgeGroup(opt.league_id)}
                    className={`filter-tab whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                      selectedAgeGroup === opt.league_id
                        ? 'text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                    style={selectedAgeGroup === opt.league_id ? { backgroundColor: brandColor } : {}}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {/* Round Filter */}
            {availableRounds.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => setSelectedRound('all')}
                  className={`filter-tab whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-all ${
                    selectedRound === 'all'
                      ? 'font-bold'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                  style={selectedRound === 'all' ? { color: brandColor, borderBottom: `2px solid ${brandColor}` } : {}}
                >
                  Season
                </button>
                {availableRounds.map(round => (
                  <button
                    key={round}
                    onClick={() => setSelectedRound(round)}
                    className={`filter-tab whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-all ${
                      selectedRound === round
                        ? 'font-bold'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                    style={selectedRound === round ? { color: brandColor, borderBottom: `2px solid ${brandColor}` } : {}}
                  >
                    {round}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Season / Month Tabs for regular leagues */
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setSelectedMonth('season')}
              className={`filter-tab whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-all ${
                selectedMonth === 'season'
                  ? 'font-bold'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              style={selectedMonth === 'season' ? { color: brandColor, borderBottom: `2px solid ${brandColor}` } : {}}
            >
              Season
            </button>
            {availableMonths.map(monthKey => {
              const [year, month] = monthKey.split('-');
              const monthLabel = MONTH_NAMES[parseInt(month) - 1];
              return (
                <button
                  key={monthKey}
                  onClick={() => setSelectedMonth(monthKey)}
                  className={`filter-tab whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-all ${
                    selectedMonth === monthKey
                      ? 'font-bold'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                  style={selectedMonth === monthKey ? { color: brandColor, borderBottom: `2px solid ${brandColor}` } : {}}
                >
                  {monthLabel}
                </button>
              );
            })}
          </div>
        )}

        {/* Averages / Totals Toggle */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border dark:border-neutral-700 p-1" style={{ borderColor: brandBorderLight, backgroundColor: brandBg50 }}>
            <button
              onClick={() => setViewMode('averages')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                viewMode === 'averages'
                  ? 'bg-white dark:bg-neutral-700 shadow-sm'
                  : 'hover:bg-white/50 dark:hover:bg-neutral-800'
              }`}
              style={{ color: brandColor }}
            >
              Averages
            </button>
            <button
              onClick={() => setViewMode('totals')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                viewMode === 'totals'
                  ? 'bg-white dark:bg-neutral-700 shadow-sm'
                  : 'hover:bg-white/50 dark:hover:bg-neutral-800'
              }`}
              style={{ color: brandColor }}
            >
              Totals
            </button>
          </div>
        </div>

        {/* Section Title */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{statCategory} stats</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {uniqueGames > 0 ? `Based on ${uniqueGames} game${uniqueGames !== 1 ? 's' : ''}` : 'All games'}
          </p>
        </div>

        {/* Stat Leader Sections */}
        {leaderboards.length > 0 ? (
          <div className="space-y-2">
            {leaderboards.map(lb => (
              <StatSection key={lb.key} title={lb.title} players={lb.players} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No data available for the selected filters</p>
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
