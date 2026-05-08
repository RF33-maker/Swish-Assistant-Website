import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { fetchLeagueChildren } from "@/lib/leagueChildren";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { ArrowLeft } from "lucide-react";
import { namesMatch, strictNamesMatch, getMostCompleteName } from "@/lib/fuzzyMatch";
import { normalizeTeamName } from "@/lib/teamUtils";
import { usePublicLeagueBrandingBySlug } from "@/hooks/usePublicLeagueBranding";
import LeagueDefaultImage from "@/assets/league-default.png";
import {
  accumulateAdvancedRow,
  makeAdvancedAggregator,
  mergeAdvancedInto,
  getAdvancedLeaderSections,
  type AdvancedLeaderDef,
} from "@/lib/advancedStats";

interface ChildLeague {
  league_id: string;
  name: string;
  age_group?: string | null;
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

// Minimum attempt thresholds for percentage leaderboards
const MIN_FGA = 20;
const MIN_3PA = 8;
const MIN_FTA = 10;

interface StatLeaderDef {
  key: string;
  title: string;
  avgLabel: string;
  totalLabel: string;
  compute: (p: any) => { avg: number; total: number; display: string };
  minAttempts?: (p: any) => boolean;
  minLabel?: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function LeagueLeadersPage() {
  const { slug } = useParams();
  const [location, navigate] = useLocation();
  const [league, setLeague] = useState<League | null>(null);
  const [rawPlayerStats, setRawPlayerStats] = useState<any[]>([]);
  const [childLeagues, setChildLeagues] = useState<ChildLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMoreStats, setIsLoadingMoreStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'averages' | 'totals'>('averages');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>('all');
  const [selectedRound, setSelectedRound] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('season');
  const [statCategory, setStatCategory] = useState<StatCategory>('Traditional');
  const fetchCancelledRef = useRef(false);

  const { colors: leagueBrandColors, brandingData: publicBrandingData } = usePublicLeagueBrandingBySlug({
    slug,
    fallbackLeague: league,
    enabled: !!slug,
  });

  const displayBannerUrl = league?.banner_url || publicBrandingData?.banner_url;
  const displayLogoUrl = league?.logo_url || publicBrandingData?.logo_url;

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
    const groupMap = new Map<string, string[]>();
    childLeagues.forEach(c => {
      const ag = c.age_group || (league.name ? c.name.replace(league.name, '').trim() || c.name : c.name);
      if (!groupMap.has(ag)) groupMap.set(ag, []);
      groupMap.get(ag)!.push(c.league_id);
    });
    return Array.from(groupMap.entries())
      .map(([ag, ids]) => ({ age_group: ag, league_ids: ids, displayLabel: ag }))
      .sort((a, b) => {
        const numA = parseInt(a.age_group.replace(/\D/g, ''));
        const numB = parseInt(b.age_group.replace(/\D/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.age_group.localeCompare(b.age_group);
      });
  }, [childLeagues, league, isParentLeague]);

  useEffect(() => {
    if (isParentLeague && ageGroupOptions.length > 0 && selectedAgeGroup === 'all') {
      setSelectedAgeGroup(ageGroupOptions[0].age_group);
    }
  }, [isParentLeague, ageGroupOptions]);

  const selectedLeagueIdsForAgeGroup = useMemo(() => {
    if (selectedAgeGroup === 'all') return childLeagues.map(c => c.league_id);
    const found = ageGroupOptions.find(o => o.age_group === selectedAgeGroup);
    return found ? found.league_ids : [];
  }, [selectedAgeGroup, ageGroupOptions, childLeagues]);

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
    fetchCancelledRef.current = false;

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
        // Use the service-role-backed endpoint so private (is_public=false)
        // child leagues still roll up under their public parent.
        const childLeagueData = await fetchLeagueChildren(leagueData.league_id);

        if (childLeagueData.length > 0) {
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
          if (fetchCancelledRef.current) return;

          const { data: pageData, error: pageError } = await supabase
            .from("player_stats")
            .select("*, players:player_id(full_name, slug)")
            .in("league_id", leagueIdsToQuery)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          
          if (fetchCancelledRef.current) return;

          if (pageError) {
            console.error("Error fetching player stats page", page, ":", pageError);
            break;
          }
          
          if (pageData && pageData.length > 0) {
            allPlayerStats = [...allPlayerStats, ...pageData];
            hasMore = pageData.length === pageSize;
            page++;

            if (!fetchCancelledRef.current) {
              setRawPlayerStats([...allPlayerStats]);
              if (page === 1) {
                setLoading(false);
              }
              if (hasMore) {
                setIsLoadingMoreStats(true);
              }
            }
          } else {
            hasMore = false;
          }
        }
        
        if (allPlayerStats.length === 0) {
          setError("No player statistics found for this league");
          return;
        }

        setRawPlayerStats(allPlayerStats);
        setIsLoadingMoreStats(false);

      } catch (err) {
        console.error("Error fetching league leaders:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
        setIsLoadingMoreStats(false);
      }
    };

    fetchLeagueAndStats();

    return () => {
      fetchCancelledRef.current = true;
    };
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
      minAttempts: (p) => p.total_field_goals_attempted >= MIN_FGA,
      minLabel: `Min. ${MIN_FGA} FGA`,
    },
    {
      key: '3p_pct', title: 'Three Point %', avgLabel: '3P%', totalLabel: '3P%',
      compute: (p) => {
        const pct = p.total_three_points_attempted > 0 ? (p.total_three_points_made / p.total_three_points_attempted) * 100 : 0;
        return { avg: pct, total: pct, display: `${pct.toFixed(1)}%` };
      },
      minAttempts: (p) => p.total_three_points_attempted >= MIN_3PA,
      minLabel: `Min. ${MIN_3PA} 3PA`,
    },
    {
      key: 'ft_pct', title: 'Free Throw %', avgLabel: 'FT%', totalLabel: 'FT%',
      compute: (p) => {
        const pct = p.total_free_throws_attempted > 0 ? (p.total_free_throws_made / p.total_free_throws_attempted) * 100 : 0;
        return { avg: pct, total: pct, display: `${pct.toFixed(1)}%` };
      },
      minAttempts: (p) => p.total_free_throws_attempted >= MIN_FTA,
      minLabel: `Min. ${MIN_FTA} FTA`,
    },
  ];

  const filteredStats = useMemo(() => {
    let stats = rawPlayerStats;

    if (isParentLeague && selectedAgeGroup !== 'all') {
      stats = stats.filter(s => selectedLeagueIdsForAgeGroup.includes(s.league_id));
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
  }, [rawPlayerStats, isParentLeague, selectedAgeGroup, selectedLeagueIdsForAgeGroup, selectedRound, selectedMonth]);

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
          player_ids: new Set<string>([stat.player_id || stat.id]),
          player_slug: stat.players?.slug || null,
          name: playerName,
          team_name: teamName,
          latest_game_ts: 0,
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
          games_played: 0,
          ...makeAdvancedAggregator(),
        });
      }

      const playerData = playerStatsMap.get(playerKey);
      const gameTs = stat.game_date ? new Date(stat.game_date).getTime() : 0;
      if (gameTs && gameTs > playerData.latest_game_ts) {
        playerData.latest_game_ts = gameTs;
        // If the same player_id itself spans multiple teams (intra-id team
        // switch), make sure the displayed team reflects the most recent game.
        if (teamName) playerData.team_name = teamName;
      }
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
      accumulateAdvancedRow(playerData, stat);
    });

    const playersByIdArray = Array.from(playerStatsMap.values());
    playersByIdArray.sort((a, b) => b.games_played - a.games_played);

    const accumulateInto = (target: any, source: any) => {
      target.games_played += source.games_played;
      target.total_points += source.total_points;
      target.total_rebounds += source.total_rebounds;
      target.total_assists += source.total_assists;
      target.total_steals += source.total_steals;
      target.total_blocks += source.total_blocks;
      target.total_field_goals_made += source.total_field_goals_made;
      target.total_field_goals_attempted += source.total_field_goals_attempted;
      target.total_three_points_made += source.total_three_points_made;
      target.total_three_points_attempted += source.total_three_points_attempted;
      target.total_free_throws_made += source.total_free_throws_made;
      target.total_free_throws_attempted += source.total_free_throws_attempted;
      target.total_turnovers += source.total_turnovers;
      mergeAdvancedInto(target, source);
      target.name = getMostCompleteName([target.name, source.name]);
      if (!target.player_slug && source.player_slug) {
        target.player_slug = source.player_slug;
      }
      if (source.player_ids) {
        (source.player_ids as Set<string>).forEach((id: string) => (target.player_ids as Set<string>).add(id));
      }
    };

    const mergedPlayers: typeof playersByIdArray = [];

    playersByIdArray.forEach((player) => {
      const playerTeamNormalized = normalizeTeamName(player.team_name);
      let foundMatch = false;
      for (const existingPlayer of mergedPlayers) {
        const existingTeamNormalized = normalizeTeamName(existingPlayer.team_name);
        const sameTeam = existingTeamNormalized === playerTeamNormalized;
        if (sameTeam && namesMatch(player.name, existingPlayer.name)) {
          accumulateInto(existingPlayer, player);
          if (player.latest_game_ts > existingPlayer.latest_game_ts) {
            existingPlayer.latest_game_ts = player.latest_game_ts;
            existingPlayer.team_name = player.team_name;
          }
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        mergedPlayers.push({ ...player, player_ids: new Set(player.player_ids) });
      }
    });

    // Second pass: merge records across different teams within the same scope
    // when names match strictly and the underlying player_ids are different.
    // This auto-handles mid-season team-switchers (e.g. James Harvey moving
    // from "18U Team 1" to "18U Team 2" within the same league/age-group).
    const crossTeamMerged: typeof mergedPlayers = [];
    mergedPlayers.forEach((player) => {
      let foundMatch = false;
      for (const existingPlayer of crossTeamMerged) {
        // Skip if the underlying player_id sets overlap — same record, would double-count.
        let overlaps = false;
        (player.player_ids as Set<string>).forEach((id: string) => {
          if ((existingPlayer.player_ids as Set<string>).has(id)) overlaps = true;
        });
        if (overlaps) continue;

        if (strictNamesMatch(player.name, existingPlayer.name)) {
          accumulateInto(existingPlayer, player);
          // Pick the most-recent team as the displayed (current) team.
          if (player.latest_game_ts > existingPlayer.latest_game_ts) {
            existingPlayer.latest_game_ts = player.latest_game_ts;
            existingPlayer.team_name = player.team_name;
          }
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        crossTeamMerged.push({ ...player, player_ids: new Set(player.player_ids) });
      }
    });

    return crossTeamMerged;
  }, [filteredStats]);

  const leaderboards = useMemo(() => {
    if (aggregatedPlayers.length === 0) return [];

    if (statCategory === 'Traditional') {
      const defs = getTraditionalDefs(viewMode);
      const cards = defs.map(def => {
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
          minLabel: def.minLabel,
          players: computed.slice(0, 10),
        };
      });
      return [{ key: 'traditional', title: '', cards }];
    }

    // Advanced — grouped sections
    return getAdvancedLeaderSections().map(section => {
      const cards = section.defs.map((def: AdvancedLeaderDef) => {
        const eligible = aggregatedPlayers.filter(def.qualifies);
        // flatMap with [] for nulls gives us a typed non-null array
        // without a type predicate cast.
        const computed = eligible.flatMap(p => {
          const result = def.compute(p);
          if (!result) return [];
          return [{ ...p, _computed: { avg: result.value, total: result.value, display: result.display } }];
        });

        computed.sort((a, b) =>
          def.lowerIsBetter
            ? a._computed.avg - b._computed.avg
            : b._computed.avg - a._computed.avg,
        );

        return {
          key: def.key,
          title: def.title,
          minLabel: def.minLabel,
          players: computed.slice(0, 10),
        };
      // Hide cards entirely when no qualifying players (e.g. league
      // doesn't capture this metric, like USG% on a league with no
      // possession data).
      }).filter(card => card.players.length > 0);

      return { key: section.key, title: section.title, cards };
    }).filter(section => section.cards.length > 0);
  }, [aggregatedPlayers, statCategory, viewMode]);

  const StatSection = ({ title, players, minLabel }: { title: string; players: any[]; minLabel?: string }) => (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
        {minLabel && (
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">{minLabel}</span>
        )}
      </div>
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
            backgroundImage: `url(${displayBannerUrl || LeagueDefaultImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-6">
            <div className="flex items-center gap-3">
              {displayLogoUrl && (
                <img src={displayLogoUrl} alt={league?.name || ''} className="h-10 w-10 md:h-14 md:w-14 object-contain rounded-lg bg-white/20 p-1" />
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

        {/* Category Tabs */}
        <div
          className="inline-flex rounded-xl border p-1 w-full max-w-xs"
          style={{ borderColor: brandBorderLight, backgroundColor: brandBg50 }}
        >
          {(['Traditional', 'Advanced'] as StatCategory[]).map(cat => {
            const active = statCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setStatCategory(cat)}
                className={`flex-1 px-4 py-2 text-sm md:text-base font-semibold rounded-lg transition-all ${
                  active
                    ? 'bg-white dark:bg-neutral-700 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
                style={active ? { color: brandColor } : {}}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Filter Row: Age Group + Rounds (Parent League) OR Season + Months (Regular) */}
        {isParentLeague ? (
          <div className="space-y-3">
            {/* Age Group Filter */}
            {ageGroupOptions.length > 0 && (
              <div>
                <select
                  value={selectedAgeGroup}
                  onChange={(e) => setSelectedAgeGroup(e.target.value)}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2"
                  style={{ borderColor: brandColor }}
                >
                  {ageGroupOptions.map(opt => (
                    <option key={opt.age_group} value={opt.age_group}>{opt.displayLabel}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Round Filter */}
            {availableRounds.length > 0 && (
              <div>
                <select
                  value={selectedRound}
                  onChange={(e) => setSelectedRound(e.target.value)}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2"
                  style={selectedRound !== 'all' ? { borderColor: brandColor } : {}}
                >
                  <option value="all">All Rounds</option>
                  {availableRounds.map(round => (
                    <option key={round} value={round}>{round}</option>
                  ))}
                </select>
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

        {isLoadingMoreStats && (
          <div className="flex items-center justify-center gap-2 py-3 px-4 mb-4 rounded-lg text-sm" style={{ backgroundColor: brandBg50, color: brandColor }}>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading more stats... results will refine as data loads
          </div>
        )}

        {/* Stat Leader Sections */}
        {leaderboards.length > 0 ? (
          <div className="space-y-2">
            {leaderboards.map(section => (
              <div key={section.key}>
                {section.title && (
                  <h3
                    className="text-xs font-bold uppercase tracking-wider mt-6 mb-3 pb-2 border-b"
                    style={{ color: brandColor, borderColor: brandBorderLight }}
                  >
                    {section.title}
                  </h3>
                )}
                {section.cards.map(card => (
                  <StatSection key={card.key} title={card.title} players={card.players} minLabel={card.minLabel} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No data available for the selected filters</p>
          </div>
        )}

        <div className="dark:bg-neutral-800 border dark:border-neutral-700 rounded-lg p-3 md:p-4 text-center" style={{ backgroundColor: brandBg50, borderColor: brandBorderLight }}>
          <p className="text-xs md:text-sm" style={{ color: brandColor }}>
            * Shooting percentages require minimum attempts: FG% ({MIN_FGA}+ FGA), 3P% ({MIN_3PA}+ 3PA), FT% ({MIN_FTA}+ FTA). Advanced: eFG% &amp; TS% ({MIN_FGA}+ FGA).
          </p>
        </div>
      </main>

      <Footer />
      </div>
    </div>
  );
}
