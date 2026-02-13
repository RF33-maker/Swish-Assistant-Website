import { useEffect, useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { TeamLogo } from "@/components/TeamLogo";
import React from "react";
import { EditableDescription } from "@/components/EditableDescription";
import { useAuth } from "@/hooks/use-auth";
import { Helmet } from "react-helmet-async";
import { normalizeTeamName } from "@/lib/teamUtils";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { adjustOpacity } from "@/lib/colorExtractor";
import { ThemeToggle } from "@/components/ThemeToggle";
import GameDetailModal from "@/components/GameDetailModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface League {
  league_id: string;
  name: string;
  slug: string;
}

interface PlayerStat {
  player_id?: string;
  player_slug?: string;
  name: string;
  position: string;
  avgPoints: number;
  avgRebounds: number;
  avgAssists: number;
  avgSteals: number;
  avgBlocks: number;
  totalPoints: number;
  totalRebounds: number;
  totalAssists: number;
  totalSteals: number;
  totalBlocks: number;
  gamesPlayed: number;
}

interface Game {
  totalPoints: number;
  date: string;
  opponent: string;
  opponentScore?: number;
  isWin?: boolean;
  isHome?: boolean;
  game_key?: string;
}

interface UpcomingGame {
  matchtime: string;
  hometeam: string;
  awayteam: string;
  isHome: boolean;
  opponent: string;
}

interface Team {
  name: string;
  roster: PlayerStat[];
  topPlayer: PlayerStat;
  recentGames: Game[];
  totalGames: number;
  avgTeamPoints: number;
  league: League | null;
  wins: number;
  losses: number;
}

interface Suggestion {
  name: string;
  slug: string;
}

const PLAYER_STAT_COLUMNS: Record<string, { key: string; label: string }[]> = {
  Traditional: [
    { key: "spoints", label: "PTS" },
    { key: "sminutes", label: "MIN" },
    { key: "sfieldgoalsmade", label: "FGM" },
    { key: "sfieldgoalsattempted", label: "FGA" },
    { key: "sthreepointersmade", label: "3PM" },
    { key: "sthreepointersattempted", label: "3PA" },
    { key: "sfreethrowsmade", label: "FTM" },
    { key: "sfreethrowsattempted", label: "FTA" },
    { key: "sreboundstotal", label: "REB" },
    { key: "sassists", label: "AST" },
    { key: "sturnovers", label: "TO" },
    { key: "ssteals", label: "STL" },
    { key: "sblocks", label: "BLK" },
  ],
  Advanced: [
    { key: "efg_percent", label: "EFG%" },
    { key: "ts_percent", label: "TS%" },
    { key: "usage_percent", label: "USG%" },
    { key: "ast_percent", label: "AST%" },
    { key: "ast_to_ratio", label: "AST/TO" },
    { key: "oreb_percent", label: "OREB%" },
    { key: "dreb_percent", label: "DREB%" },
    { key: "reb_percent", label: "REB%" },
    { key: "tov_percent", label: "TOV%" },
    { key: "three_point_rate", label: "3P RATE" },
    { key: "player_possessions", label: "POSS" },
    { key: "off_rating", label: "OFFRTG" },
    { key: "def_rating", label: "DEFRTG" },
    { key: "net_rating", label: "NETRTG" },
    { key: "pie", label: "PIE" },
  ],
  Scoring: [
    { key: "pts_percent_2pt", label: "%PTS 2PT" },
    { key: "pts_percent_3pt", label: "%PTS 3PT" },
    { key: "pts_percent_ft", label: "%PTS FT" },
    { key: "pts_percent_midrange", label: "%PTS MR" },
    { key: "pts_percent_pitp", label: "%PTS PITP" },
    { key: "pts_percent_fastbreak", label: "%PTS FBPS" },
    { key: "pts_percent_second_chance", label: "%PTS 2ND CH" },
    { key: "pts_percent_off_turnovers", label: "%PTS OFFTO" }
  ],
  Misc: [
    { key: "splusminuspoints", label: "+/-" },
    { key: "sfoulspersonal", label: "PF" },
    { key: "sblocksreceived", label: "BLK AGAINST" }
  ]
};

const PLAYER_STAT_LEGENDS: Record<string, string[]> = {
  Traditional: [
    'PTS = Points', 'MIN = Minutes', 'FGM = Field Goals Made', 'FGA = Field Goals Attempted',
    '3PM = Three-Pointers Made', '3PA = Three-Pointers Attempted', 'FTM = Free Throws Made',
    'FTA = Free Throws Attempted', 'REB = Total Rebounds', 'AST = Assists', 'TO = Turnovers',
    'STL = Steals', 'BLK = Blocks'
  ],
  Advanced: [
    'EFG% = Effective Field Goal Percentage', 'TS% = True Shooting Percentage',
    'USG% = Usage Percentage', 'AST% = Assist Percentage', 'AST/TO = Assist to Turnover Ratio',
    'OREB% = Offensive Rebound Percentage', 'DREB% = Defensive Rebound Percentage',
    'REB% = Total Rebound Percentage', 'TOV% = Turnover Percentage',
    '3P RATE = Three-Point Attempt Rate', 'POSS = Player Possessions',
    'OFFRTG = Offensive Rating', 'DEFRTG = Defensive Rating', 'NETRTG = Net Rating',
    'PIE = Player Impact Estimate'
  ],
  Scoring: [
    '%PTS 2PT = % of Points from 2-Pointers', '%PTS 3PT = % of Points from 3-Pointers',
    '%PTS FT = % of Points from Free Throws', '%PTS MR = % of Points from Mid-Range',
    '%PTS PITP = % of Points in the Paint', '%PTS FBPS = % of Points from Fastbreaks',
    '%PTS 2ND CH = % of Points from 2nd Chance', '%PTS OFFTO = % of Points off Turnovers'
  ],
  Misc: ['+/- = Plus/Minus', 'PF = Personal Fouls', 'BLK AGAINST = Blocks Received']
};

const applyPlayerMode = (
  statKey: string,
  value: number,
  gamesPlayed: number,
  totalMinutes: number,
  playerMode: 'Total' | 'Per Game' | 'Per 40'
): number => {
  const rateStats = [
    'efg_percent', 'ts_percent', 'three_point_rate',
    'ast_percent', 'ast_to_ratio',
    'oreb_percent', 'dreb_percent', 'reb_percent',
    'tov_percent', 'usage_percent', 'pie',
    'off_rating', 'def_rating', 'net_rating',
    'pts_percent_2pt', 'pts_percent_3pt', 'pts_percent_ft',
    'pts_percent_midrange', 'pts_percent_pitp', 'pts_percent_fastbreak',
    'pts_percent_second_chance', 'pts_percent_off_turnovers'
  ];
  if (rateStats.includes(statKey)) return value;
  if (statKey === 'sminutes') {
    if (playerMode === 'Total') return value;
    return gamesPlayed > 0 ? value / gamesPlayed : 0;
  }
  if (playerMode === 'Total') return value;
  if (playerMode === 'Per Game') return gamesPlayed > 0 ? value / gamesPlayed : 0;
  if (playerMode === 'Per 40') return totalMinutes > 0 ? (value / totalMinutes) * 40 : 0;
  return value;
};

export default function TeamProfile() {
  const { teamName, leagueSlug } = useParams();
  const [location, navigate] = useLocation();
  const [team, setTeam] = useState<Team | null>(null);
  const [playerStats, setPlayerStats] = useState<any[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<UpcomingGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [teamDescription, setTeamDescription] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const { user } = useAuth();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [currentLeagueId, setCurrentLeagueId] = useState<string | null>(null);
  const [activeStatsTab, setActiveStatsTab] = useState<'overview' | 'playerStats' | 'teamStats'>('overview');
  const [playerStatsCategory, setPlayerStatsCategory] = useState<'Traditional' | 'Advanced' | 'Scoring' | 'Misc'>('Traditional');
  const [playerStatsView, setPlayerStatsView] = useState<'Total' | 'Per Game' | 'Per 40'>('Per Game');
  const [statsSearch, setStatsSearch] = useState('');
  const [statsSortColumn, setStatsSortColumn] = useState<string>('PTS');
  const [statsSortDirection, setStatsSortDirection] = useState<'asc' | 'desc'>('desc');

  // Extract team branding colors
  const { colors: teamBranding, primaryColor, secondaryColor } = useTeamBranding({
    teamName: team?.name || '',
    leagueId: team?.league?.league_id || '',
    enabled: !!team?.name && !!team?.league?.league_id,
  });

  // Compute color for text on white backgrounds (needs good contrast)
  const textOnWhiteColor = React.useMemo(() => {
    if (!teamBranding) return 'rgb(251, 146, 60)'; // orange default
    
    // Check brightness of primary color
    const { r, g, b } = teamBranding.primaryRgb;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    // If primary is too bright for white backgrounds, use secondary or orange
    if (brightness > 180) {
      // Check if secondary has better contrast
      const secBrightness = (teamBranding.secondaryRgb.r * 299 + 
                            teamBranding.secondaryRgb.g * 587 + 
                            teamBranding.secondaryRgb.b * 114) / 1000;
      
      return secBrightness < 180 ? secondaryColor : 'rgb(251, 146, 60)';
    }
    
    return primaryColor;
  }, [teamBranding, primaryColor, secondaryColor]);

  const activePlayerStatColumns = useMemo(() => {
    return PLAYER_STAT_COLUMNS[playerStatsCategory] || PLAYER_STAT_COLUMNS['Traditional'];
  }, [playerStatsCategory]);

  const detailedPlayerAverages = useMemo(() => {
    if (!playerStats || playerStats.length === 0) return [];

    const parseMinutesPlayed = (stat: any): number => {
      const minutes = stat.sminutes || stat.minutes_played;
      if (!minutes) return 0;
      if (typeof minutes === 'number') return minutes;
      if (typeof minutes === 'string') {
        const parts = minutes.split(':');
        if (parts.length === 2) return parseInt(parts[0]) + parseInt(parts[1]) / 60;
        return parseFloat(minutes) || 0;
      }
      return 0;
    };

    const byPlayerId = new Map<string, any>();

    playerStats.forEach((stat: any) => {
      const playerName = stat.full_name || stat.name || 'Unknown Player';
      const minutesPlayed = parseMinutesPlayed(stat);
      const didPlay = minutesPlayed > 0;

      if (stat.player_id) {
        if (!byPlayerId.has(stat.player_id)) {
          byPlayerId.set(stat.player_id, {
            id: stat.player_id,
            name: playerName,
            slug: stat.players?.slug || null,
            games: 0,
            totalMinutes: 0,
            rawStats: []
          });
        }
        const agg = byPlayerId.get(stat.player_id)!;
        if (didPlay) {
          agg.games += 1;
          agg.totalMinutes += minutesPlayed;
          agg.rawStats.push(stat);
        }
        if (playerName.length > agg.name.length) agg.name = playerName;
      }
    });

    return Array.from(byPlayerId.values())
      .filter(p => p.games > 0)
      .sort((a, b) => {
        const totalA = a.rawStats.reduce((s: number, st: any) => s + (st.spoints || 0), 0);
        const totalB = b.rawStats.reduce((s: number, st: any) => s + (st.spoints || 0), 0);
        return (totalB / b.games) - (totalA / a.games);
      });
  }, [playerStats]);

  const filteredPlayerAverages = useMemo(() => {
    let filtered = detailedPlayerAverages;
    if (statsSearch.trim()) {
      filtered = filtered.filter((p: any) => p.name.toLowerCase().includes(statsSearch.toLowerCase()));
    }

    const rateStats = [
      'efg_percent', 'ts_percent', 'three_point_rate',
      'ast_percent', 'ast_to_ratio', 'oreb_percent', 'dreb_percent', 'reb_percent',
      'tov_percent', 'usage_percent', 'pie', 'off_rating', 'def_rating', 'net_rating',
      'pts_percent_2pt', 'pts_percent_3pt', 'pts_percent_ft',
      'pts_percent_midrange', 'pts_percent_pitp', 'pts_percent_fastbreak',
      'pts_percent_second_chance', 'pts_percent_off_turnovers'
    ];

    return [...filtered].sort((a, b) => {
      let valueA: number, valueB: number;
      if (statsSortColumn === 'GP') {
        valueA = a.games || 0;
        valueB = b.games || 0;
      } else {
        const column = activePlayerStatColumns.find((col: any) => col.label === statsSortColumn);
        if (column) {
          const isRateStat = rateStats.includes(column.key);
          const aggA = a.rawStats.reduce((acc: number, stat: any) => {
            const v = stat[column.key];
            return acc + (typeof v === 'number' ? v : (typeof v === 'string' && !isNaN(parseFloat(v)) ? parseFloat(v) : 0));
          }, 0);
          const aggB = b.rawStats.reduce((acc: number, stat: any) => {
            const v = stat[column.key];
            return acc + (typeof v === 'number' ? v : (typeof v === 'string' && !isNaN(parseFloat(v)) ? parseFloat(v) : 0));
          }, 0);
          const baseA = isRateStat && a.rawStats.length > 0 ? aggA / a.rawStats.length : aggA;
          const baseB = isRateStat && b.rawStats.length > 0 ? aggB / b.rawStats.length : aggB;
          valueA = applyPlayerMode(column.key, baseA, a.games, a.totalMinutes || 0, playerStatsView);
          valueB = applyPlayerMode(column.key, baseB, b.games, b.totalMinutes || 0, playerStatsView);
        } else {
          valueA = 0;
          valueB = 0;
        }
      }
      return statsSortDirection === 'desc' ? valueB - valueA : valueA - valueB;
    });
  }, [detailedPlayerAverages, statsSearch, statsSortColumn, statsSortDirection, playerStatsView, activePlayerStatColumns]);

  const teamAggregateStats = useMemo(() => {
    if (!playerStats || playerStats.length === 0) return null;
    
    const gameKeys = new Set(playerStats.map((s: any) => s.game_key).filter(Boolean));
    const gamesPlayed = gameKeys.size;
    if (gamesPlayed === 0) return null;

    const totals: Record<string, number> = {};
    const statFields = [
      'spoints', 'sfieldgoalsmade', 'sfieldgoalsattempted',
      'sthreepointersmade', 'sthreepointersattempted',
      'stwopointersmade', 'stwopointersattempted',
      'sfreethrowsmade', 'sfreethrowsattempted',
      'sreboundsoffensive', 'sreboundsdefensive', 'sreboundstotal',
      'sassists', 'sturnovers', 'ssteals', 'sblocks',
      'sfoulspersonal', 'splusminuspoints', 'sblocksreceived',
      'spointsinthepaint', 'spointsfastbreak', 'spointssecondchance'
    ];

    statFields.forEach(f => { totals[f] = 0; });
    
    playerStats.forEach((stat: any) => {
      statFields.forEach(f => { totals[f] += (stat[f] || 0); });
    });

    return {
      gamesPlayed,
      totals,
      perGame: Object.fromEntries(statFields.map(f => [f, totals[f] / gamesPlayed]))
    };
  }, [playerStats]);

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
      }
    };

    const delay = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(delay);
  }, [search]);

  const handleSearch = () => {
    if (search.trim()) {
      navigate(`/league/${search}`);
    }
  };

  useEffect(() => {
    const fetchTeamData = async () => {
      if (!teamName) return;
      
      setLoading(true);
      try {
        const decodedTeamName = decodeURIComponent(teamName);
        const normalizedTeamName = normalizeTeamName(decodedTeamName);
        
        console.log("🏀 Looking for team:", decodedTeamName, "→ normalized:", normalizedTeamName, "leagueSlug:", leagueSlug);
        
        // If leagueSlug is provided, fetch the league_id first
        let leagueId: string | null = null;
        if (leagueSlug) {
          const { data: leagueData } = await supabase
            .from("leagues")
            .select("league_id")
            .eq("slug", leagueSlug)
            .single();
          
          if (leagueData) {
            leagueId = leagueData.league_id;
            setCurrentLeagueId(leagueId);
            console.log("📋 Found league_id:", leagueId, "for slug:", leagueSlug);
          }
        }
        
        // Fetch all stats with team names that match when normalized
        let statsQuery = supabase
          .from("player_stats")
          .select("*, players:player_id(slug)")
          .ilike("team_name", `%${normalizedTeamName}%`);
        
        // Filter by league_id if available
        if (leagueId) {
          statsQuery = statsQuery.eq("league_id", leagueId);
        }
        
        const { data: allTeamStats, error: allStatsError } = await statsQuery;
        
        // Filter to exact normalized match
        const allStats = (allTeamStats || []).filter(stat => 
          normalizeTeamName(stat.team_name || stat.team || '') === normalizedTeamName
        );
        
        console.log("📊 Found", allStats?.length, "player stats for", normalizedTeamName, leagueId ? `(filtered by league ${leagueId})` : "(all leagues)");
        
        // Build teams query with optional league filter
        let teamsQuery = supabase
          .from("teams")
          .select("description, league_id")
          .eq("name", normalizedTeamName);
        
        if (leagueId) {
          teamsQuery = teamsQuery.eq("league_id", leagueId);
        }
        
        // Build game schedule query with optional league filter
        let scheduleQuery = supabase
          .from("game_schedule")
          .select("*")
          .gte("matchtime", new Date().toISOString())
          .order("matchtime", { ascending: true });
        
        if (leagueId) {
          scheduleQuery = scheduleQuery.eq("league_id", leagueId);
        }
        
        // Fetch all data in parallel
        const [
          { data: teamData },
          { data: upcomingGamesData, error: scheduleError }
        ] = await Promise.all([
          teamsQuery.single(),
          scheduleQuery
        ]);

        if (allStatsError) {
          console.error("Error fetching player stats:", allStatsError);
          setLoading(false);
          return;
        }

        setPlayerStats(allStats || []);
        
        if (teamData?.description) {
          setTeamDescription(teamData.description);
        }

        if (!scheduleError && upcomingGamesData) {
          // Filter upcoming games to those involving this team (normalized match)
          const teamGames = upcomingGamesData.filter((game: any) => {
            const normalizedHome = normalizeTeamName(game.hometeam || '');
            const normalizedAway = normalizeTeamName(game.awayteam || '');
            return normalizedHome === normalizedTeamName || normalizedAway === normalizedTeamName;
          }).slice(0, 5);
          
          const formattedUpcomingGames = teamGames.map((game: any) => {
            const normalizedHome = normalizeTeamName(game.hometeam || '');
            const isHome = normalizedHome === normalizedTeamName;
            return {
              matchtime: game.matchtime,
              hometeam: game.hometeam,
              awayteam: game.awayteam,
              isHome: isHome,
              opponent: isHome ? game.awayteam : game.hometeam
            };
          });
          setUpcomingGames(formattedUpcomingGames);
        }

        if (allStats && allStats.length > 0) {
          // Group stats by game_key
          const gamesByGameKey = allStats.reduce((acc: Record<string, any>, stat: any) => {
            if (!acc[stat.game_key]) {
              acc[stat.game_key] = {
                game_key: stat.game_key,
                created_at: stat.created_at,
                home_team: stat.home_team,
                away_team: stat.away_team,
                playerStats: []
              };
            }
            acc[stat.game_key].playerStats.push(stat);
            return acc;
          }, {});

          const playerIds = Array.from(new Set(allStats.map((stat: any) => stat.player_id).filter(Boolean)));
          const gameKeys = Object.keys(gamesByGameKey);

          // Fetch team stats for all games to get opponent names and full stats
          // Each game_key has 2 records in team_stats (one for each team with side="1" and side="2")
          const { data: allTeamStats } = await supabase
            .from("team_stats")
            .select("*")  // Select all fields including tot_s* stats
            .in("game_key", gameKeys);
          
          // Group team stats by game_key to find opponents
          if (allTeamStats) {
            const statsByGame: Record<string, any[]> = {};
            allTeamStats.forEach((stat: any) => {
              if (!statsByGame[stat.game_key]) {
                statsByGame[stat.game_key] = [];
              }
              statsByGame[stat.game_key].push(stat);
            });
            
            // For each game, find the opponent (the team that's NOT this team)
            Object.keys(statsByGame).forEach((gameKey: string) => {
              const teamsInGame = statsByGame[gameKey];
              const ourTeam = teamsInGame.find((t: any) => normalizeTeamName(t.name) === normalizedTeamName);
              const opponent = teamsInGame.find((t: any) => normalizeTeamName(t.name) !== normalizedTeamName);
              
              if (gamesByGameKey[gameKey] && opponent) {
                gamesByGameKey[gameKey].opponent_name = opponent.name;
                // side="1" is typically the home team
                gamesByGameKey[gameKey].is_home_game = ourTeam?.side === "1";
              }
            });
          }

          // Fetch ALL game stats in ONE query instead of one per game
          const { data: allGamesStats } = await supabase
            .from("player_stats")
            .select("spoints, player_id, game_key")
            .in("game_key", gameKeys);

          // Group opponent stats by game
          const opponentStatsByGame = (allGamesStats || []).reduce((acc: Record<string, any[]>, stat: any) => {
            if (!playerIds.includes(stat.player_id)) {
              if (!acc[stat.game_key]) {
                acc[stat.game_key] = [];
              }
              acc[stat.game_key].push(stat);
            }
            return acc;
          }, {});

          // Calculate games with W-L record
          let wins = 0;
          let losses = 0;
          
          const games = Object.values(gamesByGameKey).map((gameData: any) => {
            const ourScore = gameData.playerStats.reduce((sum: number, stat: any) => sum + (stat.spoints || 0), 0);
            
            // Get opponent and home status from team_stats data
            const opponent = gameData.opponent_name || 'Unknown Opponent';
            const isHome = gameData.is_home_game || false;
            
            const opponentStats = opponentStatsByGame[gameData.game_key] || [];
            const opponentScore = opponentStats.reduce((sum: number, stat: any) => sum + (stat.spoints || 0), 0);
            
            const isWin = ourScore > opponentScore;
            
            if (isWin) {
              wins++;
            } else {
              losses++;
            }
            
            return {
              totalPoints: ourScore,
              date: gameData.created_at,
              opponent: opponent,
              opponentScore: opponentScore,
              isWin: isWin,
              isHome: isHome,
              game_key: gameData.game_key
            };
          });
          
          const recentGames = games.slice(-10);

          // Calculate player averages
          const playerStatsMap = new Map<string, {
            player_id: string;
            player_slug?: string;
            name: string;
            position: string;
            totalPoints: number;
            totalRebounds: number;
            totalAssists: number;
            totalSteals: number;
            totalBlocks: number;
            gamesPlayed: number;
          }>();

          allStats.forEach((stat: any) => {
            const playerId = stat.player_id || stat.id;
            
            // Skip stats without valid player_id
            if (!playerId) {
              console.warn('Skipping stat without player_id:', stat);
              return;
            }
            
            const playerName = stat.full_name || stat.name || 'Unknown Player';
            const playerSlug = stat.players?.slug || null;
            
            if (!playerStatsMap.has(playerId)) {
              // First time seeing this player - initialize with this stat's data
              playerStatsMap.set(playerId, {
                player_id: playerId,
                player_slug: playerSlug,
                name: playerName,
                position: stat.position || 'Player',
                totalPoints: 0,
                totalRebounds: 0,
                totalAssists: 0,
                totalSteals: 0,
                totalBlocks: 0,
                gamesPlayed: 0
              });
            }
            
            const playerData = playerStatsMap.get(playerId)!;
            // Accumulate stats for this player across all games
            playerData.totalPoints += stat.spoints || 0;
            playerData.totalRebounds += stat.sreboundstotal || 0;
            playerData.totalAssists += stat.sassists || 0;
            playerData.totalSteals += stat.ssteals || 0;
            playerData.totalBlocks += stat.sblocks || 0;
            playerData.gamesPlayed += 1;
          });

          // First pass: Group by player_id
          const playersByIdArray = Array.from(playerStatsMap.values());
          
          // Helper function to check if two names are similar (fuzzy match)
          const areSimilarNames = (name1: string, name2: string): boolean => {
            const n1 = name1.toLowerCase().trim();
            const n2 = name2.toLowerCase().trim();
            
            // Exact match
            if (n1 === n2) return true;
            
            // Split names into parts
            const parts1 = n1.split(/[\s-]+/);
            const parts2 = n2.split(/[\s-]+/);
            
            // Check if one name is a subset/abbreviation of the other
            // Example: "R Faure" vs "Reiss Faure-Daley"
            if (parts1.length !== parts2.length) {
              const shorter = parts1.length < parts2.length ? parts1 : parts2;
              const longer = parts1.length < parts2.length ? parts2 : parts1;
              
              // Check if all parts of shorter name match (as initials or full) parts of longer name
              let matchCount = 0;
              for (const shortPart of shorter) {
                for (const longPart of longer) {
                  // Match if: 1) exact match, 2) initial match (R = Reiss), 3) substring (Faure in Faure-Daley)
                  if (longPart === shortPart || 
                      longPart.startsWith(shortPart) || 
                      (shortPart.length === 1 && longPart.startsWith(shortPart))) {
                    matchCount++;
                    break;
                  }
                }
              }
              if (matchCount === shorter.length) return true;
            }
            
            // If same number of parts, check if they're similar
            if (parts1.length === parts2.length) {
              // Check if last names match (for Chuck Duru vs Chukwuma Duru)
              const lastName1 = parts1[parts1.length - 1];
              const lastName2 = parts2[parts2.length - 1];
              
              if (lastName1 === lastName2 && parts1.length >= 2) {
                // Last names match - check if first names are similar
                const firstName1 = parts1[0];
                const firstName2 = parts2[0];
                
                // Check if one is a nickname/substring of the other
                // Example: "Chuck" in "Chukwuma"
                if (firstName1.startsWith(firstName2.substring(0, 3)) || 
                    firstName2.startsWith(firstName1.substring(0, 3)) ||
                    firstName1.includes(firstName2) || 
                    firstName2.includes(firstName1)) {
                  return true;
                }
              }
            }
            
            // Check if names differ by only 1-2 characters (handles "Murray Henry" vs "Murray Hendry")
            const maxLength = Math.max(n1.length, n2.length);
            if (Math.abs(n1.length - n2.length) <= 2 && maxLength > 5) {
              // Simple edit distance check
              let differences = 0;
              for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
                if (n1[i] !== n2[i]) differences++;
                if (differences > 2) return false;
              }
              return true;
            }
            
            return false;
          };
          
          // Second pass: Merge duplicates by name (handles data quality issues where same player has multiple IDs)
          const mergedByName = new Map<string, typeof playersByIdArray[0]>();
          
          playersByIdArray.forEach((player) => {
            // Check if we already have a similar name
            let foundMatch = false;
            for (const [existingName, existingPlayer] of Array.from(mergedByName.entries())) {
              if (areSimilarNames(player.name, existingName)) {
                // Merge with existing player
                existingPlayer.totalPoints += player.totalPoints;
                existingPlayer.totalRebounds += player.totalRebounds;
                existingPlayer.totalAssists += player.totalAssists;
                existingPlayer.totalSteals += player.totalSteals;
                existingPlayer.totalBlocks += player.totalBlocks;
                existingPlayer.gamesPlayed += player.gamesPlayed;
                foundMatch = true;
                break;
              }
            }
            
            if (!foundMatch) {
              // First time seeing this name - add it
              mergedByName.set(player.name, { ...player });
            }
          });
          
          const rosterWithStats: PlayerStat[] = Array.from(mergedByName.values()).map((player) => {
            const avgPoints = player.gamesPlayed > 0 ? Math.round((player.totalPoints / player.gamesPlayed) * 10) / 10 : 0;
            const avgRebounds = player.gamesPlayed > 0 ? Math.round((player.totalRebounds / player.gamesPlayed) * 10) / 10 : 0;
            const avgAssists = player.gamesPlayed > 0 ? Math.round((player.totalAssists / player.gamesPlayed) * 10) / 10 : 0;
            const avgSteals = player.gamesPlayed > 0 ? Math.round((player.totalSteals / player.gamesPlayed) * 10) / 10 : 0;
            const avgBlocks = player.gamesPlayed > 0 ? Math.round((player.totalBlocks / player.gamesPlayed) * 10) / 10 : 0;
            
            return {
              player_id: player.player_id,
              player_slug: player.player_slug,
              name: player.name,
              position: player.position,
              avgPoints,
              avgRebounds,
              avgAssists,
              avgSteals,
              avgBlocks,
              totalPoints: player.totalPoints,
              totalRebounds: player.totalRebounds,
              totalAssists: player.totalAssists,
              totalSteals: player.totalSteals,
              totalBlocks: player.totalBlocks,
              gamesPlayed: player.gamesPlayed
            };
          });
          
          rosterWithStats.sort((a: PlayerStat, b: PlayerStat) => b.avgPoints - a.avgPoints);
          const topPlayer = rosterWithStats[0];
          
          // Get league info and check ownership in parallel with other operations
          let league: League | null = null;
          if (allStats[0]?.league_id) {
            const { data: leagueData } = await supabase
              .from("leagues")
              .select("*")
              .eq("league_id", allStats[0].league_id)
              .single();
            league = leagueData as League;
            
            if (user && leagueData) {
              setIsOwner(user.id === leagueData.user_id || user.id === leagueData.created_by);
            }
          }

          setTeam({
            name: decodedTeamName,
            roster: rosterWithStats,
            topPlayer,
            recentGames,
            totalGames: games.length,
            avgTeamPoints: games.length > 0 ? 
              Math.round((games.reduce((sum, game) => sum + game.totalPoints, 0) / games.length) * 10) / 10 : 0,
            league,
            wins,
            losses
          });
        }
      } catch (error) {
        console.error("Error fetching team data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTeamData();
  }, [teamName, leagueSlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffaf1] dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading team profile...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-[#fffaf1] dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Team Not Found</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-4">The team you're looking for doesn't exist or has no data.</p>
          <button
            onClick={() => navigate("/")}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`${team.name} | Team Profile | Swish Assistant`}</title>
        <meta
          name="description"
          content={
            teamDescription ||
            `View ${team.name} team profile, roster, stats, and recent games${team.league ? ` in ${team.league.name}` : ''} on Swish Assistant.`
          }
        />
        <meta
          property="og:title"
          content={`${team.name} | Team Profile | Swish Assistant`}
        />
        <meta
          property="og:description"
          content={
            teamDescription ||
            `View ${team.name} team profile, roster, stats, and recent games${team.league ? ` in ${team.league.name}` : ''} on Swish Assistant.`
          }
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content={leagueSlug 
            ? `https://www.swishassistant.com/league/${leagueSlug}/team/${encodeURIComponent(team.name.toLowerCase().replace(/\s+/g, '-'))}`
            : `https://www.swishassistant.com/team/${encodeURIComponent(team.name.toLowerCase().replace(/\s+/g, '-'))}`}
        />
        <meta
          property="og:image"
          content="https://www.swishassistant.com/og-image.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${team.name} | Team Profile | Swish Assistant`} />
        <meta
          name="twitter:description"
          content={
            teamDescription ||
            `View ${team.name} team profile, roster, stats, and recent games${team.league ? ` in ${team.league.name}` : ''} on Swish Assistant.`
          }
        />
        <link rel="canonical" href={leagueSlug 
          ? `https://www.swishassistant.com/league/${leagueSlug}/team/${encodeURIComponent(team.name.toLowerCase().replace(/\s+/g, '-'))}`
          : `https://www.swishassistant.com/team/${encodeURIComponent(team.name.toLowerCase().replace(/\s+/g, '-'))}`} />
      </Helmet>
      
      <div className="min-h-screen bg-[#fffaf1] dark:bg-neutral-950">
        <header className="bg-white dark:bg-neutral-900 shadow-sm dark:shadow-neutral-800/50 sticky top-0 z-50 px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-0">
        <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-start">
          <img
            src={SwishLogo}
            alt="Swish Assistant"
            className="h-8 md:h-9 cursor-pointer"
            onClick={() => navigate("/")}
          />
        </div>

        <div className="relative w-full max-w-md md:mx-6">
          <input
            type="text"
            placeholder="Find your league"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full px-4 py-2 border border-gray-300 dark:border-neutral-600 rounded-full text-sm bg-white dark:bg-neutral-800 dark:text-white dark:placeholder-slate-400"
          />
          <button
            onClick={handleSearch}
            className="absolute right-0 top-0 h-full px-3 md:px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-full text-sm"
          >
            Go
          </button>

          {suggestions.length > 0 && (
            <ul className="absolute z-50 mt-2 w-full bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {suggestions.map((item, index) => (
                <li
                  key={index}
                  onClick={() => {
                    setSearch("");
                    setSuggestions([]);
                    navigate(`/league/${item.slug}`);
                  }}
                  className="px-4 py-2 cursor-pointer hover:bg-orange-100 dark:hover:bg-neutral-700 text-left text-slate-800 dark:text-white"
                >
                  {item.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-3 md:gap-4 text-xs md:text-sm w-full md:w-auto justify-center md:justify-end items-center">
          <ThemeToggle />
          <button
            onClick={() => navigate("/")}
            className="text-slate-600 dark:text-slate-300 hover:text-orange-500 dark:hover:text-orange-400"
          >
            Home
          </button>
          {team?.league && (
            <button
              onClick={() => navigate(`/league/${team.league?.slug}`)}
              className="text-slate-600 dark:text-slate-300 hover:text-orange-500 dark:hover:text-orange-400"
            >
              Back to League
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Team Header */}
        <div 
          className="rounded-xl p-6 md:p-8 mb-6 md:mb-8"
          style={{
            background: teamBranding 
              ? `linear-gradient(to right, ${primaryColor}, ${adjustOpacity(teamBranding.primaryRgb, 0.8)})`
              : 'linear-gradient(to right, rgb(251, 146, 60), rgb(249, 115, 22))',
            color: teamBranding?.textContrast || '#ffffff'
          }}
        >
          <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6">
            {/* Team Logo Placeholder */}
            <TeamLogo 
              teamName={team.name} 
              leagueId={team.league?.league_id || ''} 
              size="xl" 
              className="border-2 border-white/30" 
            />
            
            {/* Team Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-2xl md:text-4xl font-bold mb-2">{team.name}</h1>
              <div className="text-base md:text-lg opacity-90 mb-2">
                {team.roster.length} Players • {team.totalGames} Games Played
              </div>
              <div className="text-base md:text-lg opacity-90">
                Average Team Score: <span className="font-bold">{team.avgTeamPoints} PPG</span>
              </div>
              {team.league && (
                <div className="mt-3">
                  <span className="bg-white/20 px-3 py-1 rounded-full text-xs md:text-sm">
                    {team.league.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow mb-6 overflow-hidden">
          <div className="flex border-b border-gray-200 dark:border-neutral-700">
            <button
              onClick={() => setActiveStatsTab('overview')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeStatsTab === 'overview'
                  ? 'border-b-2 text-orange-600 dark:text-orange-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-orange-500'
              }`}
              style={activeStatsTab === 'overview' ? { borderBottomColor: textOnWhiteColor, color: textOnWhiteColor } : {}}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveStatsTab('playerStats')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeStatsTab === 'playerStats'
                  ? 'border-b-2 text-orange-600 dark:text-orange-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-orange-500'
              }`}
              style={activeStatsTab === 'playerStats' ? { borderBottomColor: textOnWhiteColor, color: textOnWhiteColor } : {}}
            >
              Player Stats
            </button>
            <button
              onClick={() => setActiveStatsTab('teamStats')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeStatsTab === 'teamStats'
                  ? 'border-b-2 text-orange-600 dark:text-orange-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-orange-500'
              }`}
              style={activeStatsTab === 'teamStats' ? { borderBottomColor: textOnWhiteColor, color: textOnWhiteColor } : {}}
            >
              Team Stats
            </button>
          </div>
        </div>

        {/* Overview Tab */}
        {activeStatsTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Left Column - Team Info */}
          <div className="lg:col-span-1 space-y-4 md:space-y-6">
            {/* Team Description */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow dark:shadow-neutral-800/50 p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white mb-3 md:mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 md:w-5 md:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Team Description
              </h2>
              <EditableDescription
                description={teamDescription}
                onSave={async (newDescription) => {
                  // Check if teams table exists and has description column
                  const { error } = await supabase
                    .from('teams')
                    .update({ description: newDescription })
                    .eq('name', team?.name);
                  
                  if (!error) {
                    setTeamDescription(newDescription);
                  } else {
                    // If teams table doesn't exist, show helpful message
                    if (error.code === '42P01') {
                      throw new Error('Please add a "teams" table with "name" and "description" columns in Supabase first.');
                    }
                    throw error;
                  }
                }}
                placeholder={`${team.name} is a competitive basketball team${team.league ? ` competing in ${team.league.name}` : ''}. Add a description to improve SEO...`}
                canEdit={isOwner}
              />
            </div>

            {/* Team Stats Summary */}
            <div 
              className="rounded-xl shadow-md p-4 md:p-6 border-2 bg-gradient-to-br dark:from-neutral-800 dark:to-neutral-850 dark:border-neutral-700"
              style={{
                background: document.documentElement.classList.contains('dark')
                  ? undefined
                  : teamBranding 
                    ? `linear-gradient(to bottom right, ${adjustOpacity(teamBranding.primaryRgb, 0.15)}, ${adjustOpacity(teamBranding.secondaryRgb, 0.15)})`
                    : 'linear-gradient(to bottom right, rgb(255, 247, 237), rgb(254, 249, 195))',
                borderColor: teamBranding 
                  ? adjustOpacity(teamBranding.primaryRgb, 0.3)
                  : 'rgb(253, 186, 116)'
              }}
            >
              <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white mb-3 md:mb-4 flex items-center gap-2">
                <svg 
                  className="w-4 h-4 md:w-5 md:h-5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  style={{ color: textOnWhiteColor }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Team Statistics
              </h2>
              <div className="space-y-3 md:space-y-4">
                <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: textOnWhiteColor }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-slate-600 dark:text-slate-300 font-medium">W-L Record</span>
                    </div>
                    <span className="text-2xl md:text-3xl font-bold" data-testid="team-record" style={{ color: textOnWhiteColor }}>
                      {team.wins}-{team.losses}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-sm md:text-base">
                  <span className="text-slate-600 dark:text-slate-300">Games Played</span>
                  <span className="font-semibold" style={{ color: textOnWhiteColor }}>{team.totalGames}</span>
                </div>
                <div className="flex justify-between text-sm md:text-base">
                  <span className="text-slate-600 dark:text-slate-300">Avg Points Per Game</span>
                  <span className="font-semibold" style={{ color: textOnWhiteColor }}>{team.avgTeamPoints} PPG</span>
                </div>
                <div className="flex justify-between text-sm md:text-base">
                  <span className="text-slate-600 dark:text-slate-300">Roster Size</span>
                  <span className="font-semibold" style={{ color: textOnWhiteColor }}>{team.roster.length} Players</span>
                </div>
                {team.topPlayer && (
                  <div className="flex justify-between text-sm md:text-base">
                    <span className="text-slate-600 dark:text-slate-300">Top Scorer</span>
                    <span className="font-semibold" style={{ color: textOnWhiteColor }}>{team.topPlayer.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Roster and Games */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Top Player Highlight */}
            {team.topPlayer && (
              <div 
                className="rounded-xl p-4 md:p-6 border bg-gradient-to-r dark:from-neutral-800 dark:to-neutral-850 dark:border-neutral-700"
                style={{
                  background: document.documentElement.classList.contains('dark')
                    ? undefined
                    : teamBranding 
                      ? `linear-gradient(to right, ${adjustOpacity(teamBranding.primaryRgb, 0.15)}, ${adjustOpacity(teamBranding.secondaryRgb, 0.15)})`
                      : 'linear-gradient(to right, rgb(255, 247, 237), rgb(254, 249, 195))',
                  borderColor: teamBranding 
                    ? adjustOpacity(teamBranding.primaryRgb, 0.25)
                    : 'rgb(254, 215, 170)'
                }}
              >
                <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white mb-3 md:mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: textOnWhiteColor }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  Star Player
                </h2>
                <div 
                  className="bg-white dark:bg-neutral-800 rounded-lg p-3 md:p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => {
                    const identifier = team.topPlayer.player_slug || team.topPlayer.player_id;
                    if (identifier) navigate(`/player/${identifier}`);
                  }}
                  data-testid={`player-card-${team.topPlayer.player_id}`}
                >
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-3 md:gap-4">
                    <div 
                      className="w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center font-bold text-lg md:text-xl"
                      style={{ 
                        backgroundColor: primaryColor,
                        color: teamBranding?.textContrast || '#ffffff'
                      }}
                    >
                      {team.topPlayer.name.charAt(0)}
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <h3 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white">{team.topPlayer.name}</h3>
                      <p className="text-slate-600 dark:text-slate-300 text-sm md:text-base">{team.topPlayer.position}</p>
                      <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">{team.topPlayer.gamesPlayed} games played</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:gap-4 text-center w-full md:w-auto">
                      <div>
                        <div className="text-xl md:text-2xl font-bold" style={{ color: textOnWhiteColor }}>{team.topPlayer.avgPoints}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">PPG</div>
                      </div>
                      <div>
                        <div className="text-xl md:text-2xl font-bold" style={{ color: textOnWhiteColor }}>{team.topPlayer.avgRebounds}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">RPG</div>
                      </div>
                      <div>
                        <div className="text-xl md:text-2xl font-bold" style={{ color: textOnWhiteColor }}>{team.topPlayer.avgAssists}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">APG</div>
                      </div>
                      <div>
                        <div className="text-xl md:text-2xl font-bold" style={{ color: textOnWhiteColor }}>{team.topPlayer.totalPoints}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Total PTS</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Team Roster */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow dark:shadow-neutral-800/50 p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white mb-3 md:mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: textOnWhiteColor }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
                Team Roster ({team.roster.length} Players)
              </h2>
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-neutral-700">
                      <th className="sticky left-0 bg-white dark:bg-neutral-900 text-left py-2 md:py-3 px-2 font-semibold text-slate-700 dark:text-slate-200 z-10">Player</th>
                      <th className="hidden md:table-cell text-center py-3 px-2 font-semibold text-slate-700 dark:text-slate-200">GP</th>
                      <th className="text-right py-2 md:py-3 px-2 font-semibold text-slate-700 dark:text-slate-200">PPG</th>
                      <th className="text-right py-2 md:py-3 px-2 font-semibold text-slate-700 dark:text-slate-200">RPG</th>
                      <th className="hidden md:table-cell text-right py-3 px-2 font-semibold text-slate-700 dark:text-slate-200">APG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.roster.map((player: PlayerStat, index: number) => (
                      <tr 
                        key={player.player_id || player.name} 
                        onClick={() => {
                          const identifier = player.player_slug || player.player_id;
                          if (identifier) navigate(`/player/${identifier}`);
                        }}
                        data-testid={`player-card-${player.player_id}`}
                        className="border-b border-gray-100 dark:border-neutral-800 transition-colors cursor-pointer hover:bg-orange-50/50 dark:hover:bg-neutral-800"
                      >
                        <td className="sticky left-0 bg-white dark:bg-neutral-900 py-2 md:py-3 px-2 z-10">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center font-bold text-xs"
                              style={{ 
                                backgroundColor: primaryColor,
                                color: teamBranding?.textContrast || '#ffffff'
                              }}
                            >
                              {player.name.charAt(0)}
                            </div>
                            <span className="font-medium text-slate-800 dark:text-white">{player.name}</span>
                          </div>
                        </td>
                        <td className="hidden md:table-cell py-3 px-2 text-center text-slate-600 dark:text-slate-400">{player.gamesPlayed}</td>
                        <td className="py-2 md:py-3 px-2 text-right font-medium" style={{ color: textOnWhiteColor }}>{player.avgPoints}</td>
                        <td className="py-2 md:py-3 px-2 text-right text-slate-600 dark:text-slate-400">{player.avgRebounds}</td>
                        <td className="hidden md:table-cell py-3 px-2 text-right text-slate-600 dark:text-slate-400">{player.avgAssists}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Games */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow dark:shadow-neutral-800/50 p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white mb-3 md:mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: textOnWhiteColor }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Recent Games ({team.recentGames.length})
              </h2>
              <div className="space-y-2 md:space-y-3">
                {team.recentGames.slice(0, 8).map((game: Game, index: number) => (
                  <div 
                    key={index} 
                    onClick={() => {
                      if (game.game_key) {
                        setSelectedGameId(game.game_key);
                        setIsGameModalOpen(true);
                      }
                    }}
                    data-testid={`recent-game-${index}`}
                    className="flex justify-between items-center p-3 bg-gray-50 dark:bg-neutral-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-slate-800 dark:text-white text-sm md:text-base">
                        {game.isHome ? 'vs' : '@'} {game.opponent}
                      </div>
                      <div className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Final: <span className="font-semibold text-slate-700 dark:text-slate-200">{game.totalPoints} - {game.opponentScore}</span>
                      </div>
                    </div>
                    <div>
                      {game.isWin !== undefined && (
                        <span className={`text-xs md:text-sm px-3 py-1 rounded font-semibold ${game.isWin ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'}`}>
                          {game.isWin ? 'W' : 'L'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Schedule */}
            {upcomingGames.length > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-xl shadow dark:shadow-neutral-800/50 p-4 md:p-6">
                <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white mb-3 md:mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 md:w-5 md:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Upcoming Schedule ({upcomingGames.length})
                </h2>
                <div className="space-y-2 md:space-y-3">
                  {upcomingGames.map((game: UpcomingGame, index: number) => (
                    <div 
                      key={index} 
                      className="flex flex-col md:flex-row justify-between md:items-center p-3 bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-neutral-800 dark:to-neutral-800 border border-orange-200 dark:border-orange-500/30 rounded-lg gap-2 md:gap-0"
                      data-testid={`upcoming-game-${index}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-slate-800 dark:text-white text-sm md:text-base">
                            {game.isHome ? 'vs' : '@'} {game.opponent}
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${game.isHome ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400' : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'}`}>
                            {game.isHome ? 'HOME' : 'AWAY'}
                          </span>
                        </div>
                        <div className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {new Date(game.matchtime).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                      <div className="text-left md:text-right">
                        <svg className="w-5 h-5 md:w-6 md:h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {activeStatsTab === 'playerStats' && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 mb-4">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">Player Statistics - {team.name}</h2>
              <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
                {filteredPlayerAverages.length} players
              </div>
            </div>

            <div className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search players..."
                  value={statsSearch}
                  onChange={(e) => setStatsSearch(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-neutral-800 text-slate-900 dark:text-white placeholder:text-gray-400"
                />
                <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Stat Category</label>
                <Select value={playerStatsCategory} onValueChange={(value) => setPlayerStatsCategory(value as any)}>
                  <SelectTrigger className="w-full bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-600">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
                    <SelectItem value="Traditional">Traditional</SelectItem>
                    <SelectItem value="Advanced">Advanced</SelectItem>
                    <SelectItem value="Scoring">Scoring</SelectItem>
                    <SelectItem value="Misc">Misc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Mode</label>
                <Select value={playerStatsView} onValueChange={(value) => setPlayerStatsView(value as any)}>
                  <SelectTrigger className="w-full bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-600">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
                    <SelectItem value="Per Game">Per Game</SelectItem>
                    <SelectItem value="Total">Total</SelectItem>
                    <SelectItem value="Per 40">Per 40</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredPlayerAverages.length > 0 ? (
              <div className="overflow-x-auto -mx-4 md:mx-0 border border-orange-200 dark:border-neutral-700 rounded-lg">
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-neutral-700 bg-orange-50 dark:bg-neutral-800">
                      <th className="text-left py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 dark:text-slate-200 sticky left-0 bg-orange-50 dark:bg-neutral-800 z-10 min-w-[100px] md:min-w-[140px]">Player</th>
                      <th
                        onClick={() => {
                          if (statsSortColumn === 'GP') setStatsSortDirection(statsSortDirection === 'desc' ? 'asc' : 'desc');
                          else { setStatsSortColumn('GP'); setStatsSortDirection('desc'); }
                        }}
                        className={`text-center py-2 md:py-3 px-2 md:px-3 font-semibold min-w-[45px] cursor-pointer hover:bg-orange-100 dark:hover:bg-neutral-700 transition-colors ${statsSortColumn === 'GP' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-700 dark:text-slate-200'}`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          GP {statsSortColumn === 'GP' && <span className="text-xs">{statsSortDirection === 'desc' ? '▼' : '▲'}</span>}
                        </div>
                      </th>
                      {activePlayerStatColumns.map((column) => (
                        <th
                          key={column.key}
                          onClick={() => {
                            if (statsSortColumn === column.label) setStatsSortDirection(statsSortDirection === 'desc' ? 'asc' : 'desc');
                            else { setStatsSortColumn(column.label); setStatsSortDirection('desc'); }
                          }}
                          className={`text-center py-2 md:py-3 px-2 md:px-3 font-semibold min-w-[50px] cursor-pointer hover:bg-orange-100 dark:hover:bg-neutral-700 transition-colors ${
                            statsSortColumn === column.label ? 'text-orange-600 dark:text-orange-400' : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            {column.label}
                            {statsSortColumn === column.label && <span className="text-xs">{statsSortDirection === 'desc' ? '▼' : '▲'}</span>}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayerAverages.map((player, index) => (
                      <tr
                        key={`${player.id}-${index}`}
                        className={`border-b border-gray-100 dark:border-neutral-700 hover:bg-orange-50 dark:hover:bg-neutral-800 transition-colors ${player.slug ? 'cursor-pointer' : ''}`}
                        onClick={() => { if (player.slug) navigate(`/player/${player.slug}`); }}
                      >
                        <td className="py-2 md:py-3 px-2 md:px-3 font-medium text-slate-800 dark:text-slate-200 sticky left-0 bg-white dark:bg-neutral-900 hover:bg-orange-50 dark:hover:bg-neutral-800 z-10">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-white text-xs md:text-sm truncate">{player.name}</div>
                          </div>
                        </td>
                        <td className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 dark:text-slate-300 font-medium">{player.games}</td>
                        {activePlayerStatColumns.map((column) => {
                          const rawStats = player.rawStats || [];
                          const rateStats = [
                            'efg_percent', 'ts_percent', 'three_point_rate',
                            'ast_percent', 'ast_to_ratio', 'oreb_percent', 'dreb_percent', 'reb_percent',
                            'tov_percent', 'usage_percent', 'pie', 'off_rating', 'def_rating', 'net_rating',
                            'pts_percent_2pt', 'pts_percent_3pt', 'pts_percent_ft',
                            'pts_percent_midrange', 'pts_percent_pitp', 'pts_percent_fastbreak',
                            'pts_percent_second_chance', 'pts_percent_off_turnovers'
                          ];
                          const isRateStat = rateStats.includes(column.key);
                          const aggregatedValue = rawStats.reduce((acc: number, stat: any) => {
                            const statValue = stat[column.key];
                            if (typeof statValue === 'number') return acc + statValue;
                            if (typeof statValue === 'string' && !isNaN(parseFloat(statValue))) return acc + parseFloat(statValue);
                            return acc;
                          }, 0);
                          const baseValue = isRateStat && rawStats.length > 0 ? aggregatedValue / rawStats.length : aggregatedValue;
                          const value = applyPlayerMode(column.key, baseValue, player.games, player.totalMinutes || 0, playerStatsView);
                          const displayValue = value === 0 ? '0.0' : value.toFixed(1);
                          return (
                            <td key={`${player.id}-${column.key}`} className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 dark:text-slate-300">
                              {displayValue}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="md:hidden bg-orange-50 dark:bg-neutral-800 text-orange-700 dark:text-orange-400 text-center py-2 text-xs border-t border-orange-200 dark:border-neutral-700">
                  ← Swipe to see all stats →
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">No player statistics available</div>
            )}

            {filteredPlayerAverages.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-neutral-700">
                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-600 dark:text-slate-300 mb-2">Legend ({playerStatsCategory}):</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {PLAYER_STAT_LEGENDS[playerStatsCategory]?.map((legend, index) => (
                      <span key={`legend-${index}`}>{legend}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeStatsTab === 'teamStats' && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white mb-4">Team Statistics - {team.name}</h2>
            
            {teamAggregateStats ? (
              <div className="space-y-6">
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Based on {teamAggregateStats.gamesPlayed} games played
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 pb-2 border-b border-gray-200 dark:border-neutral-700">Traditional</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'PPG', value: (teamAggregateStats.perGame.spoints || 0).toFixed(1) },
                      { label: 'FGM', value: (teamAggregateStats.perGame.sfieldgoalsmade || 0).toFixed(1) },
                      { label: 'FGA', value: (teamAggregateStats.perGame.sfieldgoalsattempted || 0).toFixed(1) },
                      { label: 'FG%', value: teamAggregateStats.totals.sfieldgoalsattempted > 0 ? ((teamAggregateStats.totals.sfieldgoalsmade / teamAggregateStats.totals.sfieldgoalsattempted) * 100).toFixed(1) : '0.0' },
                      { label: '3PM', value: (teamAggregateStats.perGame.sthreepointersmade || 0).toFixed(1) },
                      { label: '3PA', value: (teamAggregateStats.perGame.sthreepointersattempted || 0).toFixed(1) },
                      { label: '3P%', value: teamAggregateStats.totals.sthreepointersattempted > 0 ? ((teamAggregateStats.totals.sthreepointersmade / teamAggregateStats.totals.sthreepointersattempted) * 100).toFixed(1) : '0.0' },
                      { label: 'FTM', value: (teamAggregateStats.perGame.sfreethrowsmade || 0).toFixed(1) },
                      { label: 'FTA', value: (teamAggregateStats.perGame.sfreethrowsattempted || 0).toFixed(1) },
                      { label: 'FT%', value: teamAggregateStats.totals.sfreethrowsattempted > 0 ? ((teamAggregateStats.totals.sfreethrowsmade / teamAggregateStats.totals.sfreethrowsattempted) * 100).toFixed(1) : '0.0' },
                      { label: 'REB', value: (teamAggregateStats.perGame.sreboundstotal || 0).toFixed(1) },
                      { label: 'OREB', value: (teamAggregateStats.perGame.sreboundsoffensive || 0).toFixed(1) },
                      { label: 'DREB', value: (teamAggregateStats.perGame.sreboundsdefensive || 0).toFixed(1) },
                      { label: 'AST', value: (teamAggregateStats.perGame.sassists || 0).toFixed(1) },
                      { label: 'STL', value: (teamAggregateStats.perGame.ssteals || 0).toFixed(1) },
                      { label: 'BLK', value: (teamAggregateStats.perGame.sblocks || 0).toFixed(1) },
                      { label: 'TO', value: (teamAggregateStats.perGame.sturnovers || 0).toFixed(1) },
                      { label: 'PF', value: (teamAggregateStats.perGame.sfoulspersonal || 0).toFixed(1) },
                      { label: '+/-', value: (teamAggregateStats.perGame.splusminuspoints || 0).toFixed(1) },
                      { label: 'PITP', value: (teamAggregateStats.perGame.spointsinthepaint || 0).toFixed(1) },
                      { label: 'FB PTS', value: (teamAggregateStats.perGame.spointsfastbreak || 0).toFixed(1) },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 text-center">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{stat.label}</div>
                        <div className="text-lg font-bold" style={{ color: textOnWhiteColor }}>{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">No team statistics available</div>
            )}
          </div>
        )}
      </main>

      {/* Game Detail Modal */}
      {selectedGameId && (
        <GameDetailModal 
          gameId={selectedGameId} 
          isOpen={isGameModalOpen} 
          onClose={() => {
            setIsGameModalOpen(false);
            setSelectedGameId(null);
          }} 
        />
      )}
      </div>
    </>
  );
}