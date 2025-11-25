import { useEffect, useState, useMemo, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import type { League } from "@shared/schema";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import LeagueDefaultImage from "@/assets/league-default.png";
import { Helmet } from "react-helmet-async";
import React from "react";
import { GameSummaryRow } from "./GameSummaryRow";
import GameResultsCarousel from "@/components/GameResultsCarousel";
import GameDetailModal from "@/components/GameDetailModal";
import GamePreviewModal from "@/components/GamePreviewModal";
import LeagueChatbot from "@/components/LeagueChatbot";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamLogoUploader } from "@/components/TeamLogoUploader";
import { ChevronRight, Trophy, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { EditableDescription } from "@/components/EditableDescription";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { normalizeTeamName } from "@/lib/teamUtils";

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

// Team name mapping for known variations that aren't covered by normalization
const teamNameMap: Record<string, string> = {
  'Essex Rebels (M)': 'Essex Rebels',
  'MK Breakers': 'Milton Keynes Breakers',
};

// Apply both normalization and specific mappings
const normalizeAndMapTeamName = (name: string): string => {
  if (!name) return '';
  const trimmed = name.trim();
  // First check specific mappings
  const mapped = teamNameMap[trimmed] || trimmed;
  // Then apply general normalization (strips Senior Men, !, and Roman numeral I)
  return normalizeTeamName(mapped);
};

// Helper function to calculate stat value based on mode
const getStatValueByMode = (
  team: any,
  mode: 'Per Game' | 'Totals' | 'Per 100 Possessions',
  totalField: string,
  avgField?: string
): number => {
  switch (mode) {
    case 'Per Game':
      return avgField ? (parseFloat(team[avgField]) || 0) : (team.gamesPlayed > 0 ? team[totalField] / team.gamesPlayed : 0);
    case 'Totals':
      return team[totalField] || 0;
    case 'Per 100 Possessions':
      // Normalize to per-100-possession basis, rounded to 1 decimal
      const per100Value = team.totalPossessions > 0 ? (team[totalField] / team.totalPossessions) * 100 : 0;
      return Math.round(per100Value * 10) / 10;
    default:
      return team[totalField] || 0;
  }
};

// Team stats column configuration by category
type TeamStatColumn = {
  key: string;
  label: string;
  sortable: boolean;
  getValue: (team: any, mode: 'Per Game' | 'Totals' | 'Per 100 Possessions') => number | string;
  format?: (value: number) => string;
};

const TEAM_STAT_COLUMNS: Record<string, TeamStatColumn[]> = {
  Traditional: [
    {
      key: 'PTS',
      label: 'PTS',
      sortable: true,
      getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPoints', 'ppg'),
    },
    {
      key: 'FGM',
      label: 'FGM',
      sortable: true,
      getValue: (team, mode) => getStatValueByMode(team, mode, 'totalFGM', 'avgFGM'),
    },
    {
      key: 'FGA',
      label: 'FGA',
      sortable: true,
      getValue: (team, mode) => getStatValueByMode(team, mode, 'totalFGA', 'avgFGA'),
    },
    {
      key: 'REB',
      label: 'REB',
      sortable: true,
      getValue: (team, mode) => getStatValueByMode(team, mode, 'totalRebounds', 'rpg'),
    },
    {
      key: 'AST',
      label: 'AST',
      sortable: true,
      getValue: (team, mode) => getStatValueByMode(team, mode, 'totalAssists', 'apg'),
    },
    {
      key: 'STL',
      label: 'STL',
      sortable: true,
      getValue: (team, mode) => getStatValueByMode(team, mode, 'totalSteals', 'spg'),
    },
    {
      key: 'BLK',
      label: 'BLK',
      sortable: true,
      getValue: (team, mode) => getStatValueByMode(team, mode, 'totalBlocks', 'bpg'),
    },
    {
      key: 'TO',
      label: 'TO',
      sortable: true,
      getValue: (team, mode) => getStatValueByMode(team, mode, 'totalTurnovers', 'tpg'),
    },
    {
      key: 'PF',
      label: 'PF',
      sortable: true,
      getValue: (team, mode) => getStatValueByMode(team, mode, 'totalFouls', 'avgPF'),
    },
    {
      key: '+/-',
      label: '+/-',
      sortable: true,
      getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPlusMinus', 'avgPlusMinus'),
    },
  ],
  Advanced: [
    { key: 'OFFRTG', label: 'OFFRTG', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOffRating', 'avgOffRating') },
    { key: 'DEFRTG', label: 'DEFRTG', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalDefRating', 'avgDefRating') },
    { key: 'NETRTG', label: 'NETRTG', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalNetRating', 'avgNetRating') },
    { key: 'PACE', label: 'PACE', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPace', 'avgPace') },
    { key: 'AST%', label: 'AST%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalAstPercent', 'avgAstPercent') },
    { key: 'AST/TO', label: 'AST/TO', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalAstToRatio', 'avgAstToRatio') },
    { key: 'OREB%', label: 'OREB%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOrebPercent', 'avgOrebPercent') },
    { key: 'DREB%', label: 'DREB%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalDrebPercent', 'avgDrebPercent') },
    { key: 'REB%', label: 'REB%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalRebPercent', 'avgRebPercent') },
    { key: 'TOV%', label: 'TOV%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalTovPercent', 'avgTovPercent') },
    { key: 'EFG%', label: 'EFG%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalEfgPercent', 'avgEfgPercent') },
    { key: 'TS%', label: 'TS%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalTsPercent', 'avgTsPercent') },
    { key: 'FTA RATE', label: 'FTA RATE', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalFtRate', 'avgFtRate') },
    { key: '3P RATE', label: '3P RATE', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalThreePointRate', 'avgThreePointRate') },
    { key: 'PIE', label: 'PIE', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPie', 'avgPie') },
  ],
  'Four Factors': [
    { key: 'EFG%', label: 'EFG%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalEfgPercent', 'avgEfgPercent') },
    { key: 'FTA RATE', label: 'FTA RATE', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalFtRate', 'avgFtRate') },
    { key: 'TOV%', label: 'TOV%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalTovPercent', 'avgTovPercent') },
    { key: 'OREB%', label: 'OREB%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOrebPercent', 'avgOrebPercent') },
    { key: 'OPP EFG%', label: 'OPP EFG%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOppEfgPercent', 'avgOppEfgPercent') },
    { key: 'OPP FTA RATE', label: 'OPP FTA RATE', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOppFtRate', 'avgOppFtRate') },
    { key: 'OPP TOV%', label: 'OPP TOV%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOppTovPercent', 'avgOppTovPercent') },
    { key: 'OPP OREB%', label: 'OPP OREB%', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOppOrebPercent', 'avgOppOrebPercent') },
  ],
  Scoring: [
    { key: '%FGA 2PT', label: '%FGA 2PT', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalFgaPercent2pt', 'avgFgaPercent2pt') },
    { key: '%FGA 3PT', label: '%FGA 3PT', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalFgaPercent3pt', 'avgFgaPercent3pt') },
    { key: '%FGA MR', label: '%FGA MR', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalFgaPercentMidrange', 'avgFgaPercentMidrange'), format: (value) => value === 0 ? '' : value.toFixed(1) },
    { key: '%PTS 2PT', label: '%PTS 2PT', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPtsPercent2pt', 'avgPtsPercent2pt') },
    { key: '%PTS 3PT', label: '%PTS 3PT', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPtsPercent3pt', 'avgPtsPercent3pt') },
    { key: '%PTS MR', label: '%PTS MR', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPtsPercentMidrange', 'avgPtsPercentMidrange'), format: (value) => value === 0 ? '' : value.toFixed(1) },
    { key: '%PTS PITP', label: '%PTS PITP', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPtsPercentPitp', 'avgPtsPercentPitp') },
    { key: '%PTS FBPS', label: '%PTS FBPS', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPtsPercentFastbreak', 'avgPtsPercentFastbreak') },
    { key: '%PTS 2ND CH', label: '%PTS 2ND CH', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPtsPercentSecondChance', 'avgPtsPercentSecondChance') },
    { key: '%PTS OFFTO', label: '%PTS OFFTO', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPtsPercentOffTurnovers', 'avgPtsPercentOffTurnovers') },
    { key: '%PTS FT', label: '%PTS FT', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPtsPercentFt', 'avgPtsPercentFt') },
    { key: 'PITP', label: 'PITP', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPITP', 'avgPITP') },
    { key: 'FB PTS', label: 'FB PTS', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalFBPTS', 'avgFBPTS') },
    { key: '2ND CH', label: '2ND CH', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'total2ndCH', 'avg2ndCH') },
    { key: 'PTS OFF TO', label: 'PTS OFF TO', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPtsFromTurnovers', 'avgPtsFromTurnovers') },
    { key: 'FTM', label: 'FTM', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalFTM', 'avgFTM') },
    { key: '3PM', label: '3PM', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'total3PM', 'avg3PM') },
    { key: '2PM', label: '2PM', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'total2PM', 'avg2PM') },
  ],
  Misc: [
    { key: 'TIES', label: 'TIES', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalTimesScoresLevel', 'avgTimesScoresLevel') },
    { key: 'LEAD CHG', label: 'LEAD CHG', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalLeadChanges', 'avgLeadChanges') },
    { key: 'TIME LEADING', label: 'TIME LEADING', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalTimeLeading', 'avgTimeLeading') },
    { key: 'BIG RUN', label: 'BIG RUN', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalBiggestScoringRun', 'avgBiggestScoringRun') },
    { key: 'MISC +/-', label: '+/-', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalPlusMinus', 'avgPlusMinus') },
    { key: 'OPP 3PM', label: 'OPP 3PM', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOpp3PM', 'avgOpp3PM') },
    { key: 'OPP FGM', label: 'OPP FGM', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOppFGM', 'avgOppFGM') },
    { key: 'OPP FGA', label: 'OPP FGA', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOppFGA', 'avgOppFGA') },
    { key: 'OPP PTS', label: 'OPP PTS', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOppPoints', 'avgOppPoints') },
    { key: 'OPP TO', label: 'OPP TO', sortable: true, getValue: (team, mode) => getStatValueByMode(team, mode, 'totalOppTurnovers', 'avgOppTurnovers') },
  ],
};

// Dynamic legends for each category
const TEAM_STAT_LEGENDS: Record<string, string[]> = {
  Traditional: [
    'GP = Games Played',
    'PTS = Points',
    'FGM = Field Goals Made',
    'FGA = Field Goals Attempted',
    'REB = Rebounds',
    'AST = Assists',
    'STL = Steals',
    'BLK = Blocks',
    'TO = Turnovers',
    'PF = Personal Fouls',
    '+/- = Plus/Minus'
  ],
  Advanced: [
    'OFFRTG = Offensive Rating',
    'DEFRTG = Defensive Rating',
    'NETRTG = Net Rating',
    'PACE = Pace of Play',
    'AST% = Assist Percentage',
    'AST/TO = Assist to Turnover Ratio',
    'OREB% = Offensive Rebound Percentage',
    'DREB% = Defensive Rebound Percentage',
    'REB% = Total Rebound Percentage',
    'TOV% = Turnover Percentage',
    'EFG% = Effective Field Goal Percentage',
    'TS% = True Shooting Percentage',
    'FTA RATE = Free Throw Attempt Rate',
    '3P RATE = Three-Point Attempt Rate',
    'PIE = Player Impact Estimate'
  ],
  'Four Factors': [
    'EFG% = Effective Field Goal Percentage',
    'FTA RATE = Free Throw Attempt Rate',
    'TOV% = Turnover Percentage',
    'OREB% = Offensive Rebound Percentage',
    'OPP EFG% = Opponent Effective FG%',
    'OPP FTA RATE = Opponent FT Attempt Rate',
    'OPP TOV% = Opponent Turnover %',
    'OPP OREB% = Opponent Offensive Rebound %'
  ],
  Scoring: [
    '%FGA 2PT = % of FGA from 2-Point Range',
    '%FGA 3PT = % of FGA from 3-Point Range',
    '%FGA MR = % of FGA from Mid-Range',
    '%PTS 2PT = % of Points from 2-Pointers',
    '%PTS 3PT = % of Points from 3-Pointers',
    '%PTS MR = % of Points from Mid-Range',
    '%PTS PITP = % of Points in the Paint',
    '%PTS FBPS = % of Points from Fastbreaks',
    '%PTS 2ND CH = % of Points from 2nd Chance',
    '%PTS OFFTO = % of Points off Turnovers',
    '%PTS FT = % of Points from Free Throws',
    'PITP = Points In The Paint',
    'FB PTS = Fastbreak Points',
    '2ND CH = Second Chance Points',
    'PTS OFF TO = Points from Turnovers',
    'FTM = Free Throws Made',
    '3PM = 3-Pointers Made',
    '2PM = 2-Pointers Made'
  ],
  Misc: [
    'TIES = Times Scores Were Tied',
    'LEAD CHG = Lead Changes',
    'TIME LEADING = Time Spent Leading (minutes)',
    'BIG RUN = Biggest Scoring Run',
    '+/- = Plus/Minus',
    'OPP 3PM = Opponent 3-Pointers Made',
    'OPP FGM = Opponent Field Goals Made',
    'OPP FGA = Opponent Field Goals Attempted',
    'OPP PTS = Opponent Points',
    'OPP TO = Opponent Turnovers'
  ]
};

// Helper function to apply player stats mode transformations
const applyPlayerMode = (
  statKey: string,
  value: number,
  gamesPlayed: number,
  totalMinutes: number,
  playerMode: 'Total' | 'Per Game' | 'Per 40'
): number => {
  // These stats are already rates/percentages - return as-is across all modes
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

  // For rate stats, return the value unchanged across all modes
  if (rateStats.includes(statKey)) {
    return value;
  }

  // For minutes, handle per mode
  if (statKey === 'sminutes') {
    if (playerMode === 'Total') return value;
    return gamesPlayed > 0 ? value / gamesPlayed : 0;
  }

  // For counting stats
  if (playerMode === 'Total') return value;

  if (playerMode === 'Per Game') {
    return gamesPlayed > 0 ? value / gamesPlayed : 0;
  }

  if (playerMode === 'Per 40') {
    // Scale counting stats to per-40-minute basis
    return totalMinutes > 0 ? (value / totalMinutes) * 40 : 0;
  }

  return value;
};

// Player stats column configuration by category
// Note: Advanced, Scoring, and Misc categories reference fields that are calculated by the backend
// (advanced_player_stats.py). Traditional stats use raw Supabase fields that are always present.
type PlayerStatColumn = {
  key: string;
  label: string;
};

const PLAYER_STAT_COLUMNS: Record<string, PlayerStatColumn[]> = {
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

// Dynamic legends for each player stat category
const PLAYER_STAT_LEGENDS: Record<string, string[]> = {
  Traditional: [
    'PTS = Points',
    'MIN = Minutes',
    'FGM = Field Goals Made',
    'FGA = Field Goals Attempted',
    '3PM = Three-Pointers Made',
    '3PA = Three-Pointers Attempted',
    'FTM = Free Throws Made',
    'FTA = Free Throws Attempted',
    'REB = Total Rebounds',
    'AST = Assists',
    'TO = Turnovers',
    'STL = Steals',
    'BLK = Blocks'
  ],
  Advanced: [
    'EFG% = Effective Field Goal Percentage',
    'TS% = True Shooting Percentage',
    'USG% = Usage Percentage',
    'AST% = Assist Percentage',
    'AST/TO = Assist to Turnover Ratio',
    'OREB% = Offensive Rebound Percentage',
    'DREB% = Defensive Rebound Percentage',
    'REB% = Total Rebound Percentage',
    'TOV% = Turnover Percentage',
    '3P RATE = Three-Point Attempt Rate',
    'POSS = Player Possessions',
    'OFFRTG = Offensive Rating',
    'DEFRTG = Defensive Rating',
    'NETRTG = Net Rating',
    'PIE = Player Impact Estimate'
  ],
  Scoring: [
    '%PTS 2PT = % of Points from 2-Pointers',
    '%PTS 3PT = % of Points from 3-Pointers',
    '%PTS FT = % of Points from Free Throws',
    '%PTS MR = % of Points from Mid-Range',
    '%PTS PITP = % of Points in the Paint',
    '%PTS FBPS = % of Points from Fastbreaks',
    '%PTS 2ND CH = % of Points from 2nd Chance',
    '%PTS OFFTO = % of Points off Turnovers'
  ],
  Misc: [
    '+/- = Plus/Minus',
    'PF = Personal Fouls',
    'BLK AGAINST = Blocks Received'
  ]
};

export default function LeaguePage() {
  const { slug } = useParams();
    // SEO formatting helper for title
    const formatTitle = (text?: string) =>
      text
        ? text
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")
        : "";

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
    const [prompt, setPrompt] = useState("");
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
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isEditingYoutube, setIsEditingYoutube] = useState(false);
  const [updatingYoutube, setUpdatingYoutube] = useState(false);
  const [activeSection, setActiveSection] = useState('overview'); // 'overview', 'stats', 'teams', 'schedule'
  const [comparisonMode, setComparisonMode] = useState<'player' | 'team'>('player'); // Toggle between player and team comparison
  const [allPlayerAverages, setAllPlayerAverages] = useState<any[]>([]);
  const [filteredPlayerAverages, setFilteredPlayerAverages] = useState<any[]>([]);
  const [statsSearch, setStatsSearch] = useState("");
  const [displayedPlayerCount, setDisplayedPlayerCount] = useState(20); // For pagination
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isLoadingStandings, setIsLoadingStandings] = useState(false);
  const [isLoadingLeaders, setIsLoadingLeaders] = useState(false);
  const [teamStatsData, setTeamStatsData] = useState<any[]>([]);
  const [isLoadingTeamStats, setIsLoadingTeamStats] = useState(false);
  const [teamStatsCategory, setTeamStatsCategory] = useState<'Traditional' | 'Advanced' | 'Four Factors' | 'Scoring' | 'Misc'>('Traditional'); // Category dropdown
  const [teamStatsMode, setTeamStatsMode] = useState<'Per Game' | 'Totals' | 'Per 100 Possessions'>('Per Game'); // Mode dropdown
  const [leagueLeadersView, setLeagueLeadersView] = useState<'averages' | 'totals'>('averages'); // Toggle for league leaders
  const [playerStatsView, setPlayerStatsView] = useState<'Total' | 'Per Game' | 'Per 40'>('Per Game'); // Mode selector for player statistics table
  const [playerStatsCategory, setPlayerStatsCategory] = useState<'Traditional' | 'Advanced' | 'Scoring' | 'Misc'>('Traditional'); // Category dropdown for player stats
  const [standingsView, setStandingsView] = useState<'poolA' | 'poolB' | 'full'>('full'); // Toggle for standings view
  const [poolAStandings, setPoolAStandings] = useState<any[]>([]);
  const [poolBStandings, setPoolBStandings] = useState<any[]>([]);
  const [fullLeagueStandings, setFullLeagueStandings] = useState<any[]>([]);
  const [previousRankings, setPreviousRankings] = useState<Record<string, number>>({});
  const [hasPools, setHasPools] = useState(false); // Track if league has pools
  const [viewMode, setViewMode] = useState<'standings' | 'bracket'>('standings'); // Toggle between standings and bracket
  const [scheduleView, setScheduleView] = useState<'upcoming' | 'results'>('upcoming'); // Toggle for schedule view
  const [statsSortColumn, setStatsSortColumn] = useState<string>('PTS'); // Column to sort by in Player Statistics
  const [statsSortDirection, setStatsSortDirection] = useState<'asc' | 'desc'>('desc'); // Sort direction
  const [teamStatsSortColumn, setTeamStatsSortColumn] = useState<string>('PTS'); // Column to sort by in Team Statistics
  const [teamStatsSortDirection, setTeamStatsSortDirection] = useState<'asc' | 'desc'>('desc'); // Sort direction for team stats
  const [childCompetitions, setChildCompetitions] = useState<Pick<League, 'league_id' | 'name' | 'slug' | 'logo_url'>[]>([]); // Child leagues/competitions
  const [parentLeague, setParentLeague] = useState<Pick<League, 'league_id' | 'name' | 'slug' | 'logo_url'> | null>(null); // Parent league for breadcrumb
  const [isDividerVisible, setIsDividerVisible] = useState(false); // Track if orange divider is in view
  const dividerRef = useRef<HTMLDivElement>(null); // Ref for the orange divider

    


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

    // Intersection Observer for orange divider animation
    useEffect(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsDividerVisible(true);
            }
          });
        },
        { threshold: 0.5 } // Trigger when 50% of element is visible
      );

      if (dividerRef.current) {
        observer.observe(dividerRef.current);
      }

      return () => {
        if (dividerRef.current) {
          observer.unobserve(dividerRef.current);
        }
      };
    }, [league?.description]); // Re-run when description changes

    // Sort team stats based on selected column and direction (derived view, doesn't mutate original data)
    const sortedTeamStats = useMemo(() => {
      if (teamStatsData.length === 0) return [];
      
      return [...teamStatsData].sort((a, b) => {
        let valueA: number, valueB: number;
        
        switch (teamStatsSortColumn) {
          case 'GP':
            valueA = a.gamesPlayed || 0;
            valueB = b.gamesPlayed || 0;
            break;
          case 'FGM':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalFGM', 'avgFGM');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalFGM', 'avgFGM');
            break;
          case 'FGA':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalFGA', 'avgFGA');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalFGA', 'avgFGA');
            break;
          case 'FG%':
            valueA = parseFloat(a.fgPercentage) || 0;
            valueB = parseFloat(b.fgPercentage) || 0;
            break;
          case '2PM':
            valueA = getStatValueByMode(a, teamStatsMode, 'total2PM', 'avg2PM');
            valueB = getStatValueByMode(b, teamStatsMode, 'total2PM', 'avg2PM');
            break;
          case '2PA':
            valueA = getStatValueByMode(a, teamStatsMode, 'total2PA', 'avg2PA');
            valueB = getStatValueByMode(b, teamStatsMode, 'total2PA', 'avg2PA');
            break;
          case '2P%':
            valueA = parseFloat(a.twoPtPercentage) || 0;
            valueB = parseFloat(b.twoPtPercentage) || 0;
            break;
          case '3PM':
            valueA = getStatValueByMode(a, teamStatsMode, 'total3PM', 'avg3PM');
            valueB = getStatValueByMode(b, teamStatsMode, 'total3PM', 'avg3PM');
            break;
          case '3PA':
            valueA = getStatValueByMode(a, teamStatsMode, 'total3PA', 'avg3PA');
            valueB = getStatValueByMode(b, teamStatsMode, 'total3PA', 'avg3PA');
            break;
          case '3P%':
            valueA = parseFloat(a.threePtPercentage) || 0;
            valueB = parseFloat(b.threePtPercentage) || 0;
            break;
          case 'FTM':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalFTM', 'avgFTM');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalFTM', 'avgFTM');
            break;
          case 'FTA':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalFTA', 'avgFTA');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalFTA', 'avgFTA');
            break;
          case 'FT%':
            valueA = parseFloat(a.ftPercentage) || 0;
            valueB = parseFloat(b.ftPercentage) || 0;
            break;
          case 'ORB':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalORB', 'avgORB');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalORB', 'avgORB');
            break;
          case 'DRB':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalDRB', 'avgDRB');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalDRB', 'avgDRB');
            break;
          case 'TRB':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalRebounds', 'rpg');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalRebounds', 'rpg');
            break;
          case 'AST':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalAssists', 'apg');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalAssists', 'apg');
            break;
          case 'STL':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalSteals', 'spg');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalSteals', 'spg');
            break;
          case 'BLK':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalBlocks', 'bpg');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalBlocks', 'bpg');
            break;
          case 'TO':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalTurnovers', 'tpg');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalTurnovers', 'tpg');
            break;
          case 'PF':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalFouls', 'avgPF');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalFouls', 'avgPF');
            break;
          case '+/-':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPlusMinus', 'avgPlusMinus');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPlusMinus', 'avgPlusMinus');
            break;
          case 'PTS':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPoints', 'ppg');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPoints', 'ppg');
            break;
          case 'PITP':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPITP', 'avgPITP');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPITP', 'avgPITP');
            break;
          case 'FB PTS':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalFBPTS', 'avgFBPTS');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalFBPTS', 'avgFBPTS');
            break;
          case '2ND CH':
            valueA = getStatValueByMode(a, teamStatsMode, 'total2ndCH', 'avg2ndCH');
            valueB = getStatValueByMode(b, teamStatsMode, 'total2ndCH', 'avg2ndCH');
            break;
          // Advanced stats
          case 'OFFRTG':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOffRating', 'avgOffRating');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOffRating', 'avgOffRating');
            break;
          case 'DEFRTG':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalDefRating', 'avgDefRating');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalDefRating', 'avgDefRating');
            break;
          case 'NETRTG':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalNetRating', 'avgNetRating');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalNetRating', 'avgNetRating');
            break;
          case 'PACE':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPace', 'avgPace');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPace', 'avgPace');
            break;
          case 'AST%':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalAstPercent', 'avgAstPercent');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalAstPercent', 'avgAstPercent');
            break;
          case 'AST/TO':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalAstToRatio', 'avgAstToRatio');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalAstToRatio', 'avgAstToRatio');
            break;
          case 'OREB%':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOrebPercent', 'avgOrebPercent');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOrebPercent', 'avgOrebPercent');
            break;
          case 'DREB%':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalDrebPercent', 'avgDrebPercent');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalDrebPercent', 'avgDrebPercent');
            break;
          case 'REB%':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalRebPercent', 'avgRebPercent');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalRebPercent', 'avgRebPercent');
            break;
          case 'TOV%':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalTovPercent', 'avgTovPercent');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalTovPercent', 'avgTovPercent');
            break;
          case 'EFG%':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalEfgPercent', 'avgEfgPercent');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalEfgPercent', 'avgEfgPercent');
            break;
          case 'TS%':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalTsPercent', 'avgTsPercent');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalTsPercent', 'avgTsPercent');
            break;
          case 'FTA RATE':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalFtRate', 'avgFtRate');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalFtRate', 'avgFtRate');
            break;
          case '3P RATE':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalThreePointRate', 'avgThreePointRate');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalThreePointRate', 'avgThreePointRate');
            break;
          case 'PIE':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPie', 'avgPie');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPie', 'avgPie');
            break;
          // Opponent stats
          case 'OPP EFG%':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOppEfgPercent', 'avgOppEfgPercent');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOppEfgPercent', 'avgOppEfgPercent');
            break;
          case 'OPP FTA RATE':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOppFtRate', 'avgOppFtRate');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOppFtRate', 'avgOppFtRate');
            break;
          case 'OPP TOV%':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOppTovPercent', 'avgOppTovPercent');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOppTovPercent', 'avgOppTovPercent');
            break;
          case 'OPP OREB%':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOppOrebPercent', 'avgOppOrebPercent');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOppOrebPercent', 'avgOppOrebPercent');
            break;
          case 'OPP 3PM':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOpp3PM', 'avgOpp3PM');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOpp3PM', 'avgOpp3PM');
            break;
          case 'OPP FGM':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOppFGM', 'avgOppFGM');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOppFGM', 'avgOppFGM');
            break;
          case 'OPP FGA':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOppFGA', 'avgOppFGA');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOppFGA', 'avgOppFGA');
            break;
          case 'OPP PTS':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOppPoints', 'avgOppPoints');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOppPoints', 'avgOppPoints');
            break;
          case 'OPP TO':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalOppTurnovers', 'avgOppTurnovers');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalOppTurnovers', 'avgOppTurnovers');
            break;
          // Scoring breakdown percentages
          case '%FGA 2PT':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalFgaPercent2pt', 'avgFgaPercent2pt');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalFgaPercent2pt', 'avgFgaPercent2pt');
            break;
          case '%FGA 3PT':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalFgaPercent3pt', 'avgFgaPercent3pt');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalFgaPercent3pt', 'avgFgaPercent3pt');
            break;
          case '%FGA MR':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalFgaPercentMidrange', 'avgFgaPercentMidrange');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalFgaPercentMidrange', 'avgFgaPercentMidrange');
            break;
          case '%PTS 2PT':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPtsPercent2pt', 'avgPtsPercent2pt');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPtsPercent2pt', 'avgPtsPercent2pt');
            break;
          case '%PTS 3PT':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPtsPercent3pt', 'avgPtsPercent3pt');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPtsPercent3pt', 'avgPtsPercent3pt');
            break;
          case '%PTS MR':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPtsPercentMidrange', 'avgPtsPercentMidrange');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPtsPercentMidrange', 'avgPtsPercentMidrange');
            break;
          case '%PTS PITP':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPtsPercentPitp', 'avgPtsPercentPitp');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPtsPercentPitp', 'avgPtsPercentPitp');
            break;
          case '%PTS FBPS':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPtsPercentFastbreak', 'avgPtsPercentFastbreak');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPtsPercentFastbreak', 'avgPtsPercentFastbreak');
            break;
          case '%PTS 2ND CH':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPtsPercentSecondChance', 'avgPtsPercentSecondChance');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPtsPercentSecondChance', 'avgPtsPercentSecondChance');
            break;
          case '%PTS OFFTO':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPtsPercentOffTurnovers', 'avgPtsPercentOffTurnovers');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPtsPercentOffTurnovers', 'avgPtsPercentOffTurnovers');
            break;
          case '%PTS FT':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPtsPercentFt', 'avgPtsPercentFt');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPtsPercentFt', 'avgPtsPercentFt');
            break;
          case 'PTS OFF TO':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPtsFromTurnovers', 'avgPtsFromTurnovers');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPtsFromTurnovers', 'avgPtsFromTurnovers');
            break;
          // Misc stats
          case 'TIES':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalTimesScoresLevel', 'avgTimesScoresLevel');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalTimesScoresLevel', 'avgTimesScoresLevel');
            break;
          case 'LEAD CHG':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalLeadChanges', 'avgLeadChanges');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalLeadChanges', 'avgLeadChanges');
            break;
          case 'TIME LEADING':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalTimeLeading', 'avgTimeLeading');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalTimeLeading', 'avgTimeLeading');
            break;
          case 'BIG RUN':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalBiggestScoringRun', 'avgBiggestScoringRun');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalBiggestScoringRun', 'avgBiggestScoringRun');
            break;
          case 'MISC +/-':
            valueA = getStatValueByMode(a, teamStatsMode, 'totalPlusMinus', 'avgPlusMinus');
            valueB = getStatValueByMode(b, teamStatsMode, 'totalPlusMinus', 'avgPlusMinus');
            break;
          default:
            valueA = 0;
            valueB = 0;
        }
        
        return teamStatsSortDirection === 'desc' ? valueB - valueA : valueA - valueB;
      });
    }, [teamStatsData, teamStatsSortColumn, teamStatsSortDirection, teamStatsMode]);

    // Get active columns based on selected category
    const activeTeamStatColumns = useMemo(() => {
      return TEAM_STAT_COLUMNS[teamStatsCategory] || TEAM_STAT_COLUMNS['Traditional'];
    }, [teamStatsCategory]);

    // Get active player stat columns based on selected category
    const activePlayerStatColumns = useMemo(() => {
      return PLAYER_STAT_COLUMNS[playerStatsCategory] || PLAYER_STAT_COLUMNS['Traditional'];
    }, [playerStatsCategory]);

    // Filter and sort players based on search and sort settings in stats section
    useEffect(() => {
      console.log("🔍 Filtering players. Search term:", statsSearch);
      console.log("📊 All players:", allPlayerAverages.length);
      
      let filtered = allPlayerAverages;
      
      // Apply search filter if search term exists
      if (statsSearch.trim()) {
        filtered = allPlayerAverages.filter(player => 
          player.name.toLowerCase().includes(statsSearch.toLowerCase())
        );
        console.log("🎯 Filtered players:", filtered.length, "matching:", statsSearch);
      } else {
        console.log("✅ No search term, showing all players");
      }

      // Apply sorting based on selected column and direction
      const sorted = [...filtered].sort((a, b) => {
        let valueA: number, valueB: number;
        
        if (statsSortColumn === 'GP') {
          valueA = a.games || 0;
          valueB = b.games || 0;
        } else {
          const column = activePlayerStatColumns.find(col => col.label === statsSortColumn);
          
          if (column) {
            const rawStatsA = a.rawStats || [];
            const rawStatsB = b.rawStats || [];
            
            // Rate stats should be averaged, not summed
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
            
            const isRateStat = rateStats.includes(column.key);
            
            // Calculate aggregated values from raw stats
            const aggregatedA = rawStatsA.reduce((acc: number, stat: any) => {
              const statValue = stat[column.key];
              return acc + (typeof statValue === 'number' ? statValue : (typeof statValue === 'string' && !isNaN(parseFloat(statValue)) ? parseFloat(statValue) : 0));
            }, 0);
            const aggregatedB = rawStatsB.reduce((acc: number, stat: any) => {
              const statValue = stat[column.key];
              return acc + (typeof statValue === 'number' ? statValue : (typeof statValue === 'string' && !isNaN(parseFloat(statValue)) ? parseFloat(statValue) : 0));
            }, 0);
            
            // For rate stats, convert sum to average before applying mode transformation
            const baseA = isRateStat && rawStatsA.length > 0 ? aggregatedA / rawStatsA.length : aggregatedA;
            const baseB = isRateStat && rawStatsB.length > 0 ? aggregatedB / rawStatsB.length : aggregatedB;
            
            // Apply mode transformation
            valueA = applyPlayerMode(column.key, baseA, a.games, a.totalMinutes || 0, playerStatsView);
            valueB = applyPlayerMode(column.key, baseB, b.games, b.totalMinutes || 0, playerStatsView);
          } else {
            valueA = 0;
            valueB = 0;
          }
        }
        
        return statsSortDirection === 'desc' ? valueB - valueA : valueA - valueB;
      });
      
      setFilteredPlayerAverages(sorted);
      if (statsSearch.trim()) {
        setDisplayedPlayerCount(20); // Reset pagination when searching
      }
    }, [statsSearch, allPlayerAverages, statsSortColumn, statsSortDirection, playerStatsView, activePlayerStatColumns]);

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
          setYoutubeUrl(data.youtube_embed_url || "");
          console.log("Is owner?", ownerStatus, "User ID:", user?.id, "League owner ID:", data.user_id);
          
          // Fetch child competitions if this is a parent league
          const { data: competitions, error: competitionsError } = await supabase
            .from("leagues")
            .select("league_id, name, slug, logo_url")
            .eq("parent_league_id", data.league_id)
            .eq("is_public", true);
          
          if (competitions && !competitionsError) {
            setChildCompetitions(competitions);
          } else if (competitionsError) {
            console.error("Failed to fetch child competitions:", competitionsError);
          }
          
          // Fetch parent league if this is a sub-competition
          if (data.parent_league_id) {
            const { data: parent, error: parentError } = await supabase
              .from("leagues")
              .select("league_id, name, slug, logo_url")
              .eq("league_id", data.parent_league_id)
              .single();
            
            if (parent && !parentError) {
              setParentLeague(parent);
            } else if (parentError) {
              console.error("Failed to fetch parent league:", parentError);
            }
          }
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

            // Create a map of game scores and numeric_ids from team_stats, using NORMALIZED team names as key
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
                  // Normalize team names for matching
                  const team1Normalized = normalizeAndMapTeamName(team1.name);
                  const team2Normalized = normalizeAndMapTeamName(team2.name);
                  
                  // Create keys based on NORMALIZED team name combinations (both orders)
                  const key1 = `${team1Normalized}-vs-${team2Normalized}`;
                  const key2 = `${team2Normalized}-vs-${team1Normalized}`;
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
                // NORMALIZE team names before looking up scores
                const homeTeamNormalized = normalizeAndMapTeamName(game.hometeam);
                const awayTeamNormalized = normalizeAndMapTeamName(game.awayteam);
                const teamKey = `${homeTeamNormalized}-vs-${awayTeamNormalized}`;
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
        }
      };

      fetchUserAndLeague();
    }, [slug]);

    // Fetch player averages when league is available
    useEffect(() => {
      if (league?.league_id) {
        fetchAllPlayerAverages();
      }
    }, [league?.league_id]);

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

    const getTopList = (statKey: string) => {
      // Map stat keys to both average and total field names
      const statToFields: Record<string, { avgField: string; totalField: string }> = {
        'spoints': { avgField: 'avgPoints', totalField: 'totalPoints' },
        'sreboundstotal': { avgField: 'avgRebounds', totalField: 'totalRebounds' },
        'sassists': { avgField: 'avgAssists', totalField: 'totalAssists' }
      };
      
      const fields = statToFields[statKey];
      if (!fields || !allPlayerAverages.length) return [];
      
      // Choose field based on leagueLeadersView state
      const fieldToUse = leagueLeadersView === 'averages' ? fields.avgField : fields.totalField;
      
      // Sort by the selected field and take top 5
      return [...allPlayerAverages]
        .sort((a, b) => {
          const aVal = parseFloat(a[fieldToUse]) || 0;
          const bVal = parseFloat(b[fieldToUse]) || 0;
          return bVal - aVal;
        })
        .slice(0, 5)
        .map(player => ({
          ...player,
          value: leagueLeadersView === 'averages' 
            ? player[fields.avgField] 
            : Math.round(player[fields.totalField]) // Round totals to whole numbers
        }));
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

    // Handle YouTube URL update
    const handleYoutubeUpdate = async () => {
      if (!isOwner || !league) return;
      
      setUpdatingYoutube(true);
      try {
        const { data, error } = await supabase
          .from('leagues')
          .update({ youtube_embed_url: youtubeUrl })
          .eq('league_id', league.league_id)
          .select()
          .single();

        if (error) {
          console.error('YouTube update error:', error);
          alert('Failed to update YouTube URL');
          return;
        }

        setLeague({ ...league, youtube_embed_url: youtubeUrl });
        setIsEditingYoutube(false);
        alert('YouTube URL updated successfully!');
      } catch (error) {
        console.error('YouTube update error:', error);
        alert(`Failed to update YouTube URL: ${error.message}`);
      } finally {
        setUpdatingYoutube(false);
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

    // Convert YouTube URL to embed format
    const getYoutubeEmbedUrl = (url: string) => {
      if (!url) return null;
      
      console.log('Processing YouTube URL:', url);
      
      // If it's already an embed URL, ensure parameters are added
      if (url.includes('/embed/')) {
        console.log('Already an embed URL:', url);
        
        // Check which parameters are missing
        const hasRel = url.includes('rel=0');
        const hasModestBranding = url.includes('modestbranding=1');
        
        // If both parameters exist, return as-is
        if (hasRel && hasModestBranding) {
          return url;
        }
        
        // Build missing parameters string
        const missingParams = [];
        if (!hasRel) missingParams.push('rel=0');
        if (!hasModestBranding) missingParams.push('modestbranding=1');
        
        // Normalize URL by removing trailing separators
        let cleanUrl = url.replace(/[?&]+$/, '');
        
        // Determine separator: use & if query string exists, otherwise ?
        const separator = cleanUrl.includes('?') ? '&' : '?';
        return cleanUrl + separator + missingParams.join('&');
      }
      
      // Parameters to minimize off-topic suggestions
      const embedParams = 'rel=0&modestbranding=1';
      
      // Handle different YouTube URL formats
      // 1. Playlist URL: youtube.com/playlist?list=PLAYLIST_ID
      const playlistMatch = url.match(/[?&]list=([^&]+)/);
      if (playlistMatch) {
        const playlistId = playlistMatch[1];
        const embedUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}&${embedParams}`;
        console.log('Generated embed URL from playlist:', embedUrl);
        return embedUrl;
      }
      
      // 2. Standard watch URL: youtube.com/watch?v=VIDEO_ID
      const watchMatch = url.match(/youtube\.com\/watch\?v=([^&]+)/);
      if (watchMatch) {
        const videoId = watchMatch[1];
        const embedUrl = `https://www.youtube.com/embed/${videoId}?${embedParams}`;
        console.log('Generated embed URL from watch:', embedUrl);
        return embedUrl;
      }
      
      // 3. Short URL: youtu.be/VIDEO_ID
      const shortMatch = url.match(/youtu\.be\/([^?]+)/);
      if (shortMatch) {
        const videoId = shortMatch[1];
        const embedUrl = `https://www.youtube.com/embed/${videoId}?${embedParams}`;
        console.log('Generated embed URL from short:', embedUrl);
        return embedUrl;
      }
      
      // 4. Mobile URL: youtube.com/shorts/VIDEO_ID
      const shortsMatch = url.match(/youtube\.com\/shorts\/([^?]+)/);
      if (shortsMatch) {
        const videoId = shortsMatch[1];
        const embedUrl = `https://www.youtube.com/embed/${videoId}?${embedParams}`;
        console.log('Generated embed URL from shorts:', embedUrl);
        return embedUrl;
      }
      
      console.log('Could not process YouTube URL');
      return null;
    };

    const fetchAllPlayerAverages = async () => {
      if (!league?.league_id) return;

      setIsLoadingStats(true);
      try {
        // Fetch player stats and join with players table to get slug - using select('*') to get all fields including advanced stats
        const { data: playerStats, error } = await supabase
          .from("player_stats")
          .select("*, players:player_id(slug)")
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
            slug: stat.players?.slug || null,
            games: 0,
            totalPoints: 0,
            totalRebounds: 0,
            totalAssists: 0,
            totalSteals: 0,
            totalBlocks: 0,
            totalTurnovers: 0,
            totalFGM: 0,
            totalFGA: 0,
            total2PM: 0,
            total2PA: 0,
            total3PM: 0,
            total3PA: 0,
            totalFTM: 0,
            totalFTA: 0,
            totalORB: 0,
            totalDRB: 0,
            totalMinutes: 0,
            totalPersonalFouls: 0,
            totalPlusMinus: 0,
            rawStats: []
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
        player.total2PM += stat.stwopointersmade || 0;
        player.total2PA += stat.stwopointersattempted || 0;
        player.total3PM += stat.sthreepointersmade || 0;
        player.total3PA += stat.sthreepointersattempted || 0;
        player.totalFTM += stat.sfreethrowsmade || 0;
        player.totalFTA += stat.sfreethrowsattempted || 0;
        player.totalORB += stat.sreboundsoffensive || 0;
        player.totalDRB += stat.sreboundsdefensive || 0;
        player.totalPersonalFouls += stat.sfoulspersonal || 0;
        player.totalPlusMinus += stat.splusminuspoints || 0;
        
        // Store raw stat row for accessing advanced stats later
        player.rawStats.push(stat);
        
        // Parse minutes from sminutes field
        const minutesParts = stat.sminutes?.split(':');
        if (minutesParts && minutesParts.length === 2) {
          const minutes = parseInt(minutesParts[0]) + parseInt(minutesParts[1]) / 60;
          player.totalMinutes += minutes;
        }
      });

      // First pass: Group by player_id
      const playersByIdArray = Array.from(playerMap.values());
      
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
            existingPlayer.games += player.games;
            existingPlayer.totalPoints += player.totalPoints;
            existingPlayer.totalRebounds += player.totalRebounds;
            existingPlayer.totalAssists += player.totalAssists;
            existingPlayer.totalSteals += player.totalSteals;
            existingPlayer.totalBlocks += player.totalBlocks;
            existingPlayer.totalTurnovers += player.totalTurnovers;
            existingPlayer.totalFGM += player.totalFGM;
            existingPlayer.totalFGA += player.totalFGA;
            existingPlayer.total2PM += player.total2PM;
            existingPlayer.total2PA += player.total2PA;
            existingPlayer.total3PM += player.total3PM;
            existingPlayer.total3PA += player.total3PA;
            existingPlayer.totalFTM += player.totalFTM;
            existingPlayer.totalFTA += player.totalFTA;
            existingPlayer.totalORB += player.totalORB;
            existingPlayer.totalDRB += player.totalDRB;
            existingPlayer.totalPersonalFouls += player.totalPersonalFouls;
            existingPlayer.totalPlusMinus += player.totalPlusMinus;
            existingPlayer.totalMinutes += player.totalMinutes;
            existingPlayer.rawStats.push(...player.rawStats);
            foundMatch = true;
            break;
          }
        }
        
        if (!foundMatch) {
          // First time seeing this name - add it
          mergedByName.set(player.name, { ...player });
        }
      });

      // Calculate averages and percentages from merged data
      const averagesList = Array.from(mergedByName.values()).map((player) => ({
        ...player,
        playerKey: player.id,
        avgPoints: (player.totalPoints / player.games).toFixed(1),
        avgRebounds: (player.totalRebounds / player.games).toFixed(1),
        avgAssists: (player.totalAssists / player.games).toFixed(1),
        avgSteals: (player.totalSteals / player.games).toFixed(1),
        avgBlocks: (player.totalBlocks / player.games).toFixed(1),
        avgTurnovers: (player.totalTurnovers / player.games).toFixed(1),
        avgMinutes: (player.totalMinutes / player.games).toFixed(1),
        avgFGM: (player.totalFGM / player.games).toFixed(1),
        avgFGA: (player.totalFGA / player.games).toFixed(1),
        avg2PM: (player.total2PM / player.games).toFixed(1),
        avg2PA: (player.total2PA / player.games).toFixed(1),
        avg3PM: (player.total3PM / player.games).toFixed(1),
        avg3PA: (player.total3PA / player.games).toFixed(1),
        avgFTM: (player.totalFTM / player.games).toFixed(1),
        avgFTA: (player.totalFTA / player.games).toFixed(1),
        avgORB: (player.totalORB / player.games).toFixed(1),
        avgDRB: (player.totalDRB / player.games).toFixed(1),
        avgPersonalFouls: (player.totalPersonalFouls / player.games).toFixed(1),
        avgPlusMinus: (player.totalPlusMinus / player.games).toFixed(1),
        fgPercentage: player.totalFGA > 0 ? ((player.totalFGM / player.totalFGA) * 100).toFixed(1) : '0.0',
        twoPercentage: player.total2PA > 0 ? ((player.total2PM / player.total2PA) * 100).toFixed(1) : '0.0',
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

          // Normalize team name to handle variations (including MK Breakers → Milton Keynes Breakers, Essex Rebels (M) → Essex Rebels)
          const normalizedName = normalizeAndMapTeamName(stat.name);

          if (!teamMap.has(normalizedName)) {
            teamMap.set(normalizedName, {
              teamName: normalizedName,
              gamesPlayed: 0,
              totalMinutes: 0,
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
              totalORB: 0,
              totalDRB: 0,
              totalAssists: 0,
              totalSteals: 0,
              totalBlocks: 0,
              totalTurnovers: 0,
              totalFouls: 0,
              totalPlusMinus: 0,
              totalPITP: 0,
              totalFBPTS: 0,
              total2ndCH: 0,
              // Advanced stats
              totalOffRating: 0,
              totalDefRating: 0,
              totalNetRating: 0,
              totalPace: 0,
              totalAstPercent: 0,
              totalAstToRatio: 0,
              totalOrebPercent: 0,
              totalDrebPercent: 0,
              totalRebPercent: 0,
              totalTovPercent: 0,
              totalEfgPercent: 0,
              totalTsPercent: 0,
              totalFtRate: 0,
              totalThreePointRate: 0,
              totalPie: 0,
              // Opponent stats
              totalOppEfgPercent: 0,
              totalOppFtRate: 0,
              totalOppTovPercent: 0,
              totalOppOrebPercent: 0,
              totalOpp3PM: 0,
              totalOppFGM: 0,
              totalOppFGA: 0,
              totalOppPoints: 0,
              totalOppTurnovers: 0,
              // Misc stats
              totalTimesScoresLevel: 0,
              totalLeadChanges: 0,
              totalTimeLeading: 0,
              totalBiggestScoringRun: 0,
              // Scoring breakdown percentages
              totalFgaPercent2pt: 0,
              totalFgaPercent3pt: 0,
              totalFgaPercentMidrange: 0,
              totalPtsPercent2pt: 0,
              totalPtsPercent3pt: 0,
              totalPtsPercentMidrange: 0,
              totalPtsPercentPitp: 0,
              totalPtsPercentFastbreak: 0,
              totalPtsPercentSecondChance: 0,
              totalPtsPercentOffTurnovers: 0,
              totalPtsPercentFt: 0,
              totalPtsFromTurnovers: 0
            });
          }

          const team = teamMap.get(normalizedName)!;
          team.gamesPlayed += 1;
          // Parse and add minutes
          if (stat.sminutes) {
            const minutesParts = stat.sminutes.split(':');
            if (minutesParts && minutesParts.length === 2) {
              const minutes = parseInt(minutesParts[0]) + parseInt(minutesParts[1]) / 60;
              team.totalMinutes += minutes;
            }
          }
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
          team.totalORB += stat.tot_sreboundsoffensive || 0;
          team.totalDRB += stat.tot_sreboundsdefensive || 0;
          team.totalAssists += stat.tot_sassists || 0;
          team.totalSteals += stat.tot_ssteals || 0;
          team.totalBlocks += stat.tot_sblocks || 0;
          team.totalTurnovers += stat.tot_sturnovers || 0;
          team.totalFouls += stat.tot_sfoulspersonal || 0;
          team.totalPlusMinus += stat.tot_splusminuspoints || 0;
          team.totalPITP += stat.tot_spointsinthepaint || 0;
          team.totalFBPTS += stat.tot_spointsfastbreak || 0;
          team.total2ndCH += stat.tot_spointssecondchance || 0;
          // Advanced stats
          team.totalOffRating += stat.off_rating || 0;
          team.totalDefRating += stat.def_rating || 0;
          team.totalNetRating += stat.net_rating || 0;
          team.totalPace += stat.pace || 0;
          team.totalAstPercent += stat.ast_percent || 0;
          team.totalAstToRatio += stat.ast_to_ratio || 0;
          team.totalOrebPercent += stat.oreb_percent || 0;
          team.totalDrebPercent += stat.dreb_percent || 0;
          team.totalRebPercent += stat.reb_percent || 0;
          team.totalTovPercent += stat.tov_percent || 0;
          team.totalEfgPercent += stat.efg_percent || 0;
          team.totalTsPercent += stat.ts_percent || 0;
          team.totalFtRate += stat.ft_rate || 0;
          team.totalThreePointRate += stat.three_point_rate || 0;
          team.totalPie += stat.pie || 0;
          // Opponent stats
          team.totalOppEfgPercent += stat.opp_efg_percent || 0;
          team.totalOppFtRate += stat.opp_ft_rate || 0;
          team.totalOppTovPercent += stat.opp_tov_percent || 0;
          team.totalOppOrebPercent += stat.opp_oreb_percent || 0;
          team.totalOpp3PM += stat.opp_sthreepointersmade || 0;
          team.totalOppFGM += stat.opp_sfieldgoalsmade || 0;
          team.totalOppFGA += stat.opp_sfieldgoalsattempted || 0;
          team.totalOppPoints += stat.opp_points || 0;
          team.totalOppTurnovers += stat.opp_turnovers || 0;
          // Misc stats
          team.totalTimesScoresLevel += stat.tot_timesscoreslevel || 0;
          team.totalLeadChanges += stat.tot_leadchanges || 0;
          team.totalTimeLeading += stat.tot_timeleading || 0;
          team.totalBiggestScoringRun += stat.tot_biggestscoringrun || 0;
          // Scoring breakdown percentages
          team.totalFgaPercent2pt += stat.fga_percent_2pt || 0;
          team.totalFgaPercent3pt += stat.fga_percent_3pt || 0;
          team.totalFgaPercentMidrange += stat.fga_percent_midrange || 0;
          team.totalPtsPercent2pt += stat.pts_percent_2pt || 0;
          team.totalPtsPercent3pt += stat.pts_percent_3pt || 0;
          team.totalPtsPercentMidrange += stat.pts_percent_midrange || 0;
          team.totalPtsPercentPitp += stat.pts_percent_pitp || 0;
          team.totalPtsPercentFastbreak += stat.pts_percent_fastbreak || 0;
          team.totalPtsPercentSecondChance += stat.pts_percent_second_chance || 0;
          team.totalPtsPercentOffTurnovers += stat.pts_percent_off_turnovers || 0;
          team.totalPtsPercentFt += stat.pts_percent_ft || 0;
          team.totalPtsFromTurnovers += stat.tot_spointsfromturnovers || 0;
        });

        // Calculate percentages, averages, and possessions
        const aggregatedStats = Array.from(teamMap.values()).map(team => {
          // Calculate possessions: FGA + 0.44 * FTA - ORB + TO
          const totalPossessions = team.totalFGA + (0.44 * team.totalFTA) - team.totalORB + team.totalTurnovers;
          
          return {
          ...team,
          totalPossessions,
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
          tpg: team.gamesPlayed > 0 ? (team.totalTurnovers / team.gamesPlayed).toFixed(1) : '0.0',
          avgFGM: team.gamesPlayed > 0 ? (team.totalFGM / team.gamesPlayed).toFixed(1) : '0.0',
          avgFGA: team.gamesPlayed > 0 ? (team.totalFGA / team.gamesPlayed).toFixed(1) : '0.0',
          avg2PM: team.gamesPlayed > 0 ? (team.total2PM / team.gamesPlayed).toFixed(1) : '0.0',
          avg2PA: team.gamesPlayed > 0 ? (team.total2PA / team.gamesPlayed).toFixed(1) : '0.0',
          avg3PM: team.gamesPlayed > 0 ? (team.total3PM / team.gamesPlayed).toFixed(1) : '0.0',
          avg3PA: team.gamesPlayed > 0 ? (team.total3PA / team.gamesPlayed).toFixed(1) : '0.0',
          avgFTM: team.gamesPlayed > 0 ? (team.totalFTM / team.gamesPlayed).toFixed(1) : '0.0',
          avgFTA: team.gamesPlayed > 0 ? (team.totalFTA / team.gamesPlayed).toFixed(1) : '0.0',
          avgORB: team.gamesPlayed > 0 ? (team.totalORB / team.gamesPlayed).toFixed(1) : '0.0',
          avgDRB: team.gamesPlayed > 0 ? (team.totalDRB / team.gamesPlayed).toFixed(1) : '0.0',
          avgPF: team.gamesPlayed > 0 ? (team.totalFouls / team.gamesPlayed).toFixed(1) : '0.0',
          avgPlusMinus: team.gamesPlayed > 0 ? (team.totalPlusMinus / team.gamesPlayed).toFixed(1) : '0.0',
          avgPITP: team.gamesPlayed > 0 ? (team.totalPITP / team.gamesPlayed).toFixed(1) : '0.0',
          avgFBPTS: team.gamesPlayed > 0 ? (team.totalFBPTS / team.gamesPlayed).toFixed(1) : '0.0',
          avg2ndCH: team.gamesPlayed > 0 ? (team.total2ndCH / team.gamesPlayed).toFixed(1) : '0.0',
          // Advanced stats averages
          avgOffRating: team.gamesPlayed > 0 ? (team.totalOffRating / team.gamesPlayed).toFixed(1) : '0.0',
          avgDefRating: team.gamesPlayed > 0 ? (team.totalDefRating / team.gamesPlayed).toFixed(1) : '0.0',
          avgNetRating: team.gamesPlayed > 0 ? (team.totalNetRating / team.gamesPlayed).toFixed(1) : '0.0',
          avgPace: team.gamesPlayed > 0 ? (team.totalPace / team.gamesPlayed).toFixed(1) : '0.0',
          avgAstPercent: team.gamesPlayed > 0 ? (team.totalAstPercent / team.gamesPlayed).toFixed(1) : '0.0',
          avgAstToRatio: team.gamesPlayed > 0 ? (team.totalAstToRatio / team.gamesPlayed).toFixed(1) : '0.0',
          avgOrebPercent: team.gamesPlayed > 0 ? (team.totalOrebPercent / team.gamesPlayed).toFixed(1) : '0.0',
          avgDrebPercent: team.gamesPlayed > 0 ? (team.totalDrebPercent / team.gamesPlayed).toFixed(1) : '0.0',
          avgRebPercent: team.gamesPlayed > 0 ? (team.totalRebPercent / team.gamesPlayed).toFixed(1) : '0.0',
          avgTovPercent: team.gamesPlayed > 0 ? (team.totalTovPercent / team.gamesPlayed).toFixed(1) : '0.0',
          avgEfgPercent: team.gamesPlayed > 0 ? (team.totalEfgPercent / team.gamesPlayed).toFixed(1) : '0.0',
          avgTsPercent: team.gamesPlayed > 0 ? (team.totalTsPercent / team.gamesPlayed).toFixed(1) : '0.0',
          avgFtRate: team.gamesPlayed > 0 ? (team.totalFtRate / team.gamesPlayed).toFixed(1) : '0.0',
          avgThreePointRate: team.gamesPlayed > 0 ? (team.totalThreePointRate / team.gamesPlayed).toFixed(1) : '0.0',
          avgPie: team.gamesPlayed > 0 ? (team.totalPie / team.gamesPlayed).toFixed(3) : '0.000',
          // Opponent stats averages
          avgOppEfgPercent: team.gamesPlayed > 0 ? (team.totalOppEfgPercent / team.gamesPlayed).toFixed(1) : '0.0',
          avgOppFtRate: team.gamesPlayed > 0 ? (team.totalOppFtRate / team.gamesPlayed).toFixed(1) : '0.0',
          avgOppTovPercent: team.gamesPlayed > 0 ? (team.totalOppTovPercent / team.gamesPlayed).toFixed(1) : '0.0',
          avgOppOrebPercent: team.gamesPlayed > 0 ? (team.totalOppOrebPercent / team.gamesPlayed).toFixed(1) : '0.0',
          avgOpp3PM: team.gamesPlayed > 0 ? (team.totalOpp3PM / team.gamesPlayed).toFixed(1) : '0.0',
          avgOppFGM: team.gamesPlayed > 0 ? (team.totalOppFGM / team.gamesPlayed).toFixed(1) : '0.0',
          avgOppFGA: team.gamesPlayed > 0 ? (team.totalOppFGA / team.gamesPlayed).toFixed(1) : '0.0',
          avgOppPoints: team.gamesPlayed > 0 ? (team.totalOppPoints / team.gamesPlayed).toFixed(1) : '0.0',
          avgOppTurnovers: team.gamesPlayed > 0 ? (team.totalOppTurnovers / team.gamesPlayed).toFixed(1) : '0.0',
          // Misc stats averages
          avgTimesScoresLevel: team.gamesPlayed > 0 ? (team.totalTimesScoresLevel / team.gamesPlayed).toFixed(1) : '0.0',
          avgLeadChanges: team.gamesPlayed > 0 ? (team.totalLeadChanges / team.gamesPlayed).toFixed(1) : '0.0',
          avgTimeLeading: team.gamesPlayed > 0 ? (team.totalTimeLeading / team.gamesPlayed).toFixed(1) : '0.0',
          avgBiggestScoringRun: team.gamesPlayed > 0 ? (team.totalBiggestScoringRun / team.gamesPlayed).toFixed(1) : '0.0',
          // Scoring breakdown percentages averages
          avgFgaPercent2pt: team.gamesPlayed > 0 ? (team.totalFgaPercent2pt / team.gamesPlayed).toFixed(1) : '0.0',
          avgFgaPercent3pt: team.gamesPlayed > 0 ? (team.totalFgaPercent3pt / team.gamesPlayed).toFixed(1) : '0.0',
          avgFgaPercentMidrange: team.gamesPlayed > 0 ? (team.totalFgaPercentMidrange / team.gamesPlayed).toFixed(1) : '0.0',
          avgPtsPercent2pt: team.gamesPlayed > 0 ? (team.totalPtsPercent2pt / team.gamesPlayed).toFixed(1) : '0.0',
          avgPtsPercent3pt: team.gamesPlayed > 0 ? (team.totalPtsPercent3pt / team.gamesPlayed).toFixed(1) : '0.0',
          avgPtsPercentMidrange: team.gamesPlayed > 0 ? (team.totalPtsPercentMidrange / team.gamesPlayed).toFixed(1) : '0.0',
          avgPtsPercentPitp: team.gamesPlayed > 0 ? (team.totalPtsPercentPitp / team.gamesPlayed).toFixed(1) : '0.0',
          avgPtsPercentFastbreak: team.gamesPlayed > 0 ? (team.totalPtsPercentFastbreak / team.gamesPlayed).toFixed(1) : '0.0',
          avgPtsPercentSecondChance: team.gamesPlayed > 0 ? (team.totalPtsPercentSecondChance / team.gamesPlayed).toFixed(1) : '0.0',
          avgPtsPercentOffTurnovers: team.gamesPlayed > 0 ? (team.totalPtsPercentOffTurnovers / team.gamesPlayed).toFixed(1) : '0.0',
          avgPtsPercentFt: team.gamesPlayed > 0 ? (team.totalPtsPercentFt / team.gamesPlayed).toFixed(1) : '0.0',
          avgPtsFromTurnovers: team.gamesPlayed > 0 ? (team.totalPtsFromTurnovers / team.gamesPlayed).toFixed(1) : '0.0'
          };
        }).sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg)); // Sort by PPG

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
        // First, fetch ALL teams from the teams table
        const { data: allTeams, error: teamsError } = await supabase
          .from("teams")
          .select("team_id, name")
          .eq("league_id", leagueId);

        if (teamsError || !allTeams || allTeams.length === 0) {
          console.error("Error fetching teams:", teamsError);
          setStandings([]);
          return;
        }

        // Initialize standings with all teams (0-0 record by default)
        const teamStatsMap: { [team: string]: { wins: number, losses: number, pointsFor: number, pointsAgainst: number, games: number } } = {};
        
        allTeams.forEach(team => {
          const normalizedName = normalizeAndMapTeamName(team.name);
          teamStatsMap[normalizedName] = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 };
        });

        // Now fetch team_stats to enhance with actual game results
        const { data: teamStatsData, error: teamStatsError } = await supabase
          .from("team_stats")
          .select("*")
          .eq("league_id", leagueId);

        if (teamStatsData && teamStatsData.length > 0 && !teamStatsError) {
          // Group team stats by numeric_id to find games (teams that played each other)
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

          // Process each game and update stats for teams that have played
          gameMap.forEach((gameTeams, numericId) => {
            if (gameTeams.length === 2) {
              const [team1, team2] = gameTeams;
              
              const team1Name = normalizeAndMapTeamName(team1.name || '');
              const team2Name = normalizeAndMapTeamName(team2.name || '');
              
              const team1Score = team1.tot_spoints || 0;
              const team2Score = team2.tot_spoints || 0;
              
              // Only update if team exists in our map (from teams table)
              if (teamStatsMap[team1Name]) {
                teamStatsMap[team1Name].pointsFor += team1Score;
                teamStatsMap[team1Name].pointsAgainst += team2Score;
                teamStatsMap[team1Name].games += 1;
                
                if (team1Score > team2Score) {
                  teamStatsMap[team1Name].wins += 1;
                } else if (team1Score < team2Score) {
                  teamStatsMap[team1Name].losses += 1;
                }
              }
              
              if (teamStatsMap[team2Name]) {
                teamStatsMap[team2Name].pointsFor += team2Score;
                teamStatsMap[team2Name].pointsAgainst += team1Score;
                teamStatsMap[team2Name].games += 1;
                
                if (team2Score > team1Score) {
                  teamStatsMap[team2Name].wins += 1;
                } else if (team2Score < team1Score) {
                  teamStatsMap[team2Name].losses += 1;
                }
              }
            }
          });
        }

        // Convert to standings format - includes all teams, even those with no games
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
        }));

        // Merge duplicate teams (handles data quality issues where same team appears multiple times)
        // Apply normalization to catch variations like "Essex Rebels (M)" vs "Essex Rebels" or "MK Breakers" vs "Milton Keynes Breakers"
        const mergedStandings = new Map<string, typeof standingsArray[0]>();
        
        standingsArray.forEach(team => {
          // Re-normalize the team name to catch any variations
          const teamKey = normalizeAndMapTeamName(team.team);
          
          if (!mergedStandings.has(teamKey)) {
            // First time seeing this normalized team - add it with normalized name
            mergedStandings.set(teamKey, { ...team, team: teamKey });
          } else {
            // Duplicate team - merge the stats
            const existing = mergedStandings.get(teamKey)!;
            existing.wins += team.wins;
            existing.losses += team.losses;
            existing.games += team.games;
            existing.pointsFor += team.pointsFor;
            existing.pointsAgainst += team.pointsAgainst;
            existing.pointsDiff = existing.pointsFor - existing.pointsAgainst;
            existing.winPct = existing.games > 0 ? Math.round((existing.wins / existing.games) * 1000) / 1000 : 0;
            existing.avgPoints = existing.games > 0 ? Math.round((existing.pointsFor / existing.games) * 10) / 10 : 0;
            existing.record = `${existing.wins}-${existing.losses}`;
            // Keep the first team name we encountered
          }
        });

        const finalStandings = Array.from(mergedStandings.values()).sort((a, b) => {
          // Sort by win percentage first, then by point differential, then by average points
          if (b.winPct !== a.winPct) return b.winPct - a.winPct;
          if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
          return b.avgPoints - a.avgPoints;
        });

        setStandings(finalStandings);
      } catch (error) {
        console.error("Error calculating standings:", error);
        setStandings([]);
      }
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
        
        // First, fetch ALL teams from the teams table
        const { data: allTeams, error: teamsError } = await supabase
          .from("teams")
          .select("team_id, name")
          .eq("league_id", leagueId);

        if (teamsError || !allTeams || allTeams.length === 0) {
          console.error("Error fetching teams:", teamsError);
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
        const extractPoolName = (poolValue: string): string => {
          const match = poolValue.match(/\(([^)]+)\)/);
          return match ? match[1] : poolValue;
        };
        
        const teamPoolMap: Record<string, string> = {};
        if (scheduleData && !scheduleError) {
          scheduleData.forEach((game: any) => {
            if (game.hometeam && game.pool) {
              const poolName = extractPoolName(game.pool);
              const normalizedHome = normalizeAndMapTeamName(game.hometeam);
              teamPoolMap[normalizedHome] = poolName;
            }
            if (game.awayteam && game.pool) {
              const poolName = extractPoolName(game.pool);
              const normalizedAway = normalizeAndMapTeamName(game.awayteam);
              teamPoolMap[normalizedAway] = poolName;
            }
          });
        }

        // Initialize standings with all teams (0-0 record by default)
        const teamStatsMap: Record<string, { wins: number, losses: number, pointsFor: number, pointsAgainst: number, games: number, pool?: string, originalName: string }> = {};
        
        allTeams.forEach(team => {
          const normalizedName = normalizeAndMapTeamName(team.name);
          teamStatsMap[normalizedName] = { 
            wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0,
            pool: teamPoolMap[normalizedName] || teamPoolMap[team.name],
            originalName: team.name  // Store original name for logo lookup
          };
        });

        // Now fetch team_stats to enhance with actual game results
        const { data: teamStatsData, error: teamStatsError } = await supabase
          .from("team_stats")
          .select("*")
          .eq("league_id", leagueId);

        if (teamStatsData && teamStatsData.length > 0 && !teamStatsError) {
          // First pass: ensure ALL teams from team_stats are in teamStatsMap with original names
          const teamOriginalNames = new Map<string, string>();
          teamStatsData.forEach(stat => {
            if (stat.name) {
              const normalized = normalizeAndMapTeamName(stat.name);
              // Store the first occurrence of each team's original name
              if (!teamOriginalNames.has(normalized)) {
                teamOriginalNames.set(normalized, stat.name);
              }
              // If team not in map yet (not in teams table), add it
              if (!teamStatsMap[normalized]) {
                teamStatsMap[normalized] = {
                  wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0,
                  pool: teamPoolMap[normalized] || teamPoolMap[stat.name],
                  originalName: stat.name
                };
              }
            }
          });

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

          // Process each game and update stats for teams that have played
          gameMap.forEach((gameTeams) => {
            if (gameTeams.length === 2) {
              const [team1, team2] = gameTeams;
              
              const team1Name = normalizeAndMapTeamName(team1.name || '');
              const team2Name = normalizeAndMapTeamName(team2.name || '');
              
              const team1Score = team1.tot_spoints || 0;
              const team2Score = team2.tot_spoints || 0;
              
              // Only update if team exists in our map (from teams table)
              if (teamStatsMap[team1Name]) {
                teamStatsMap[team1Name].pointsFor += team1Score;
                teamStatsMap[team1Name].pointsAgainst += team2Score;
                teamStatsMap[team1Name].games += 1;
                
                if (team1Score > team2Score) {
                  teamStatsMap[team1Name].wins += 1;
                } else if (team1Score < team2Score) {
                  teamStatsMap[team1Name].losses += 1;
                }
              }
              
              if (teamStatsMap[team2Name]) {
                teamStatsMap[team2Name].pointsFor += team2Score;
                teamStatsMap[team2Name].pointsAgainst += team1Score;
                teamStatsMap[team2Name].games += 1;
                
                if (team2Score > team1Score) {
                  teamStatsMap[team2Name].wins += 1;
                } else if (team2Score < team1Score) {
                  teamStatsMap[team2Name].losses += 1;
                }
              }
            }
          });
        }

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
          originalName: stats.originalName,  // Include original name for logo lookup
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

        // Merge duplicate teams (handles data quality issues where same team appears multiple times)
        // Apply normalization to catch variations like "Essex Rebels (M)" vs "Essex Rebels" or "MK Breakers" vs "Milton Keynes Breakers"
        const mergedTeams = new Map<string, typeof allTeamsArray[0]>();
        
        allTeamsArray.forEach(team => {
          // Re-normalize the team name to catch any variations
          const teamKey = normalizeAndMapTeamName(team.team);
          
          if (!mergedTeams.has(teamKey)) {
            // First time seeing this normalized team - add it with normalized name
            mergedTeams.set(teamKey, { ...team, team: teamKey });
          } else {
            // Duplicate team - merge the stats
            const existing = mergedTeams.get(teamKey)!;
            existing.wins += team.wins;
            existing.losses += team.losses;
            existing.games += team.games;
            existing.pointsFor += team.pointsFor;
            existing.pointsAgainst += team.pointsAgainst;
            existing.pointsDiff = existing.pointsFor - existing.pointsAgainst;
            existing.winPct = existing.games > 0 ? Math.round((existing.wins / existing.games) * 1000) / 1000 : 0;
            existing.avgPoints = existing.games > 0 ? Math.round((existing.pointsFor / existing.games) * 10) / 10 : 0;
            existing.record = `${existing.wins}-${existing.losses}`;
            // Keep the first originalName and pool we encountered
          }
        });

        const mergedTeamsArray = Array.from(mergedTeams.values());

        // Set standings for each view
        const fullStandings = formatStandings(mergedTeamsArray);
        const poolAStandings = formatStandings(mergedTeamsArray, 'Pool A');
        const poolBStandings = formatStandings(mergedTeamsArray, 'Pool B');

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

  <>
    <Helmet>
      <title>{`${league?.name || formatTitle(slug)} | League Stats | Swish Assistant`}</title>
      <meta
        name="description"
        content={
          league?.description ||
          `Explore ${league?.name || formatTitle(slug)} league stats, team standings, and player performance on Swish Assistant.`
        }
      />
      <meta
        property="og:title"
        content={`${league?.name || formatTitle(slug)} | League Stats | Swish Assistant`}
      />
      <meta
        property="og:description"
        content={
          league?.description ||
          `Explore ${league?.name || formatTitle(slug)} league stats, team standings, and player performance on Swish Assistant.`
        }
      />
      <meta property="og:type" content="website" />
      <meta
        property="og:url"
        content={`https://www.swishassistant.com/league/${slug}`}
      />
      <meta
        property="og:image"
        content="https://www.swishassistant.com/og-image.png"
      />
      <link rel="canonical" href={`https://www.swishassistant.com/league/${slug}`} />
    </Helmet>

    <div className="min-h-screen bg-[#fffaf1]">
      {/* rest of your code here */}
    </div>
    </>
  
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
                  className="md:hidden bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors text-sm group relative overflow-hidden"
                >
                  <span className="group-hover:opacity-0 transition-opacity duration-200">Coaches Hub</span>
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">Coming Soon</span>
                </button>
              )}
            </div>

            <div className="relative w-full md:max-w-md md:mx-6">
              <input
                type="text"
                placeholder="Find your league"
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
                className="hidden md:block bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm whitespace-nowrap group relative overflow-hidden"
              >
                <span className="group-hover:opacity-0 transition-opacity duration-200">Coaches Hub</span>
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">Coming Soon</span>
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

        {/* Breadcrumb for Sub-Competitions */}
        {parentLeague && (
          <div className="bg-white border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-3">
              <Link href={`/league/${parentLeague.slug}`}>
                <a className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-orange-400 transition-colors group" data-testid="link-parent-league">
                  <div className="flex items-center gap-2">
                    {parentLeague.logo_url && (
                      <img 
                        src={parentLeague.logo_url} 
                        alt={parentLeague.name}
                        className="w-5 h-5 rounded object-cover"
                      />
                    )}
                    <span className="font-medium group-hover:underline">{parentLeague.name}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-700 font-medium">{league?.name}</span>
                </a>
              </Link>
            </div>
          </div>
        )}

        {/* SEO-Optimized About This League Section */}
        {league?.description && (
          <div className="w-full bg-gradient-to-b from-transparent to-[#fffaf5] pt-4 pb-10 px-4 animate-fade-in-up">
            <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm p-8 border border-orange-100">
              <div className="flex flex-col md:flex-row md:items-center md:justify-center mb-4">
                {league?.logo_url && (
                  <img
                    src={league.logo_url}
                    alt={`${league.name} logo`}
                    className="h-14 w-auto mx-auto md:mx-0 mb-4 md:mb-0 md:mr-4 drop-shadow-sm"
                  />
                )}
                <h2 className="text-2xl font-semibold text-slate-900 text-center md:text-left">
                  About {league?.name}
                </h2>
              </div>
              <div 
                ref={dividerRef}
                className={`h-1 bg-orange-500 mx-auto mb-6 rounded-full transition-all duration-1000 ease-out ${
                  isDividerVisible ? 'w-32' : 'w-12'
                }`}
              ></div>
              <p className="text-slate-700 leading-relaxed text-base text-left">
                {league?.description}
              </p>
            </div>
          </div>
        )}

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
            <div className="flex items-center justify-between gap-4 py-3 md:py-4">
              {/* Navigation Links */}
              <div className="flex gap-4 md:gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
                <a 
                  href="#" 
                  className={`hover:text-orange-500 cursor-pointer whitespace-nowrap pb-1 ${activeSection === 'teams' ? 'text-orange-500 font-semibold border-b-2 border-orange-500' : ''}`}
                  onClick={() => {
                    setActiveSection('teams');
                    // Ensure standings are loaded for Teams section
                    if (league?.league_id && fullLeagueStandings.length === 0 && standings.length === 0) {
                      calculatePoolStandings(league.league_id);
                    }
                  }}
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
                onClick={() => {
                  setActiveSection('overview');
                  if (teamStatsData.length === 0) {
                    fetchTeamStats();
                  }
                }}
              >
                Overview
              </a>
              </div>

              {/* Competition Selector */}
              {childCompetitions.length > 0 && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Trophy className="w-4 h-4 text-slate-400 hidden md:block" />
                  <select
                    value={league?.slug || ''}
                    onChange={(e) => navigate(`/league/${e.target.value}`)}
                    className="px-3 py-1.5 text-xs md:text-sm font-medium text-slate-700 bg-white border border-gray-300 rounded-lg hover:border-orange-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:outline-none transition-all cursor-pointer"
                    data-testid="select-competition"
                  >
                    <option value={league?.slug}>{league?.name}</option>
                    {childCompetitions.map((competition) => (
                      <option key={competition.league_id} value={competition.slug}>
                        {competition.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                  
                  {/* View Toggle - Only show for BCB Trophy */}
                  {slug === 'british-championship-basketball' && (
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
                  )}
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
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="text-left py-3 px-3 font-semibold text-slate-700 w-16 sticky left-0 bg-white z-10">Logo</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-700 min-w-[140px]">Team</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-700 w-16">W</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-700 w-16">L</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-700 w-20">Win%</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-700 w-20">PF</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-700 w-20">PA</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-700 w-20">Diff</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-700 w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(standingsView === 'poolA' ? poolAStandings : 
                          standingsView === 'poolB' ? poolBStandings : 
                          fullLeagueStandings).map((team, index) => (
                          <tr 
                            key={`${team.team}-${index}`}
                            className="border-b border-gray-100 hover:bg-orange-50 transition-colors group"
                          >
                            <td className="py-3 px-3 sticky left-0 bg-white group-hover:bg-orange-50 z-10 transition-colors">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-600 text-xs">{team.rank}</span>
                                <TeamLogo 
                                  teamName={team.originalName || team.team} 
                                  leagueId={league?.league_id} 
                                  size="sm" 
                                />
                              </div>
                            </td>
                            <td className="py-3 px-3 font-medium text-slate-800">
                              <span className="truncate">{team.team}</span>
                            </td>
                            <td className="py-3 px-3 text-center font-semibold text-slate-700">{team.wins}</td>
                            <td className="py-3 px-3 text-center font-semibold text-slate-700">{team.losses}</td>
                            <td className="py-3 px-3 text-center font-medium text-slate-600">{(team.winPct * 100).toFixed(1)}%</td>
                            <td className="py-3 px-3 text-right font-medium text-slate-700">{team.pointsFor}</td>
                            <td className="py-3 px-3 text-right font-medium text-slate-700">{team.pointsAgainst}</td>
                            <td className={`py-3 px-3 text-right font-semibold ${team.pointsDiff > 0 ? 'text-green-600' : team.pointsDiff < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                              {team.pointsDiff > 0 ? `+${team.pointsDiff}` : team.pointsDiff}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {team.movement === 'up' && (
                                <span className="text-green-600 font-bold text-sm">▲</span>
                              )}
                              {team.movement === 'down' && (
                                <span className="text-red-600 font-bold text-sm">▼</span>
                              )}
                              {team.movement === 'same' && (
                                <span className="text-gray-400 text-sm">▬</span>
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
                
              {/* Bracket View - Only for BCB Trophy */}
              {viewMode === 'bracket' && slug === 'british-championship-basketball' && league?.league_id && (
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

                {/* Category and Mode Selectors */}
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Stat Category</label>
                    <Select
                      value={playerStatsCategory}
                      onValueChange={(value) => setPlayerStatsCategory(value as typeof playerStatsCategory)}
                    >
                      <SelectTrigger 
                        className="w-full bg-white border-slate-200 text-slate-700 hover:border-orange-300 focus:border-orange-500 focus:ring-orange-500"
                        data-testid="select-player-category"
                      >
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Traditional" data-testid="option-player-traditional">Traditional</SelectItem>
                        <SelectItem value="Advanced" data-testid="option-player-advanced">Advanced</SelectItem>
                        <SelectItem value="Scoring" data-testid="option-player-scoring">Scoring</SelectItem>
                        <SelectItem value="Misc" data-testid="option-player-misc">Misc</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Mode</label>
                    <Select
                      value={playerStatsView}
                      onValueChange={(value) => setPlayerStatsView(value as typeof playerStatsView)}
                    >
                      <SelectTrigger 
                        className="w-full bg-white border-slate-200 text-slate-700 hover:border-orange-300 focus:border-orange-500 focus:ring-orange-500"
                        data-testid="select-player-mode"
                      >
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Per Game" data-testid="option-player-per-game">Per Game</SelectItem>
                        <SelectItem value="Total" data-testid="option-player-total">Total</SelectItem>
                        <SelectItem value="Per 40" data-testid="option-player-per-40">Per 40</SelectItem>
                      </SelectContent>
                    </Select>
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
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FGM</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FGA</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FG%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">2PM</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">2PA</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">2P%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">3PM</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">3PA</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">3P%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FTM</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FTA</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FT%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">ORB</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">DRB</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">TRB</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">AST</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">STL</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">BLK</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">TO</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">PF</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">+/-</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">PTS</th>
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
                          <th 
                            onClick={() => {
                              if (statsSortColumn === 'GP') {
                                setStatsSortDirection(statsSortDirection === 'desc' ? 'asc' : 'desc');
                              } else {
                                setStatsSortColumn('GP');
                                setStatsSortDirection('desc');
                              }
                            }}
                            className={`text-center py-2 md:py-3 px-2 md:px-3 font-semibold min-w-[45px] cursor-pointer hover:bg-orange-100 transition-colors ${statsSortColumn === 'GP' ? 'text-orange-600' : 'text-slate-700'}`}
                            data-testid="header-sort-gp"
                          >
                            <div className="flex items-center justify-center gap-1">
                              GP
                              {statsSortColumn === 'GP' && (
                                <span className="text-xs">{statsSortDirection === 'desc' ? '▼' : '▲'}</span>
                              )}
                            </div>
                          </th>
                          {activePlayerStatColumns.map((column) => (
                            <th
                              key={column.key}
                              onClick={() => {
                                if (statsSortColumn === column.label) {
                                  setStatsSortDirection(statsSortDirection === 'desc' ? 'asc' : 'desc');
                                } else {
                                  setStatsSortColumn(column.label);
                                  setStatsSortDirection('desc');
                                }
                              }}
                              className={`text-center py-2 md:py-3 px-2 md:px-3 font-semibold min-w-[50px] cursor-pointer hover:bg-orange-100 transition-colors ${
                                statsSortColumn === column.label ? 'text-orange-600' : 'text-slate-700'
                              }`}
                              data-testid={`header-${column.key.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                            >
                              <div className="flex items-center justify-center gap-1">
                                {column.label}
                                {statsSortColumn === column.label && (
                                  <span className="text-xs">{statsSortDirection === 'desc' ? '▼' : '▲'}</span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPlayerAverages.slice(0, displayedPlayerCount).map((player, index) => (
                          <tr 
                            key={`${player.name}-${index}`}
                            className="border-b border-gray-100 hover:bg-orange-50 transition-colors cursor-pointer"
                            onClick={() => {
                              const identifier = player.slug || player.id;
                              navigate(`/player/${identifier}`);
                            }}
                            data-testid={`player-row-${player.id}`}
                          >
                            <td className="py-2 md:py-3 px-2 md:px-3 font-medium text-slate-800 sticky left-0 bg-white hover:bg-orange-50 z-10">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 text-xs md:text-sm truncate">{player.name}</div>
                                <div className="text-[10px] md:text-xs text-slate-500 truncate">{player.team}</div>
                              </div>
                            </td>
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600 font-medium">{player.games}</td>
                            {activePlayerStatColumns.map((column) => {
                              const rawStats = player.rawStats || [];
                              
                              // Rate stats should be averaged, not summed
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
                              
                              const isRateStat = rateStats.includes(column.key);
                              
                              // For rate stats, calculate average; for counting stats, calculate total
                              const aggregatedValue = rawStats.reduce((acc: number, stat: any) => {
                                const statValue = stat[column.key];
                                if (typeof statValue === 'number') {
                                  return acc + statValue;
                                } else if (typeof statValue === 'string' && !isNaN(parseFloat(statValue))) {
                                  return acc + parseFloat(statValue);
                                }
                                return acc;
                              }, 0);
                              
                              // For rate stats, convert sum to average before passing to applyPlayerMode
                              const baseValue = isRateStat && rawStats.length > 0 ? aggregatedValue / rawStats.length : aggregatedValue;
                              
                              // Calculate total minutes from player.totalMinutes (already in decimal format)
                              const totalMinutes = player.totalMinutes || 0;
                              
                              // Apply the mode transformation
                              const value = applyPlayerMode(
                                column.key,
                                baseValue,
                                player.games,
                                totalMinutes,
                                playerStatsView
                              );
                              
                              const displayValue = value === 0 ? '0.0' : value.toFixed(1);
                              
                              return (
                                <td 
                                  key={`${player.id}-${column.key}`}
                                  className="py-2 md:py-3 px-2 md:px-3 text-center text-slate-600"
                                >
                                  {displayValue}
                                </td>
                              );
                            })}
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

                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <div className="text-xs text-slate-500 space-y-1">
                        <div className="font-semibold text-slate-600 mb-2">Legend ({playerStatsCategory}):</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {PLAYER_STAT_LEGENDS[playerStatsCategory]?.map((legend, index) => (
                            <span key={`legend-${index}`}>{legend}</span>
                          ))}
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          Click on any player to view their detailed profile • Swipe horizontally to see all stats
                        </div>
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
                <div className="mb-4 md:mb-6">
                  <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-4">Team Statistics - {league?.name}</h2>
                </div>

                {/* Dropdowns for Category and Mode */}
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Category</label>
                    <Select
                      value={teamStatsCategory}
                      onValueChange={(value) => setTeamStatsCategory(value as typeof teamStatsCategory)}
                    >
                      <SelectTrigger 
                        className="w-full bg-white border-slate-200 text-slate-700 hover:border-orange-300 focus:border-orange-500 focus:ring-orange-500"
                        data-testid="select-category"
                      >
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Traditional" data-testid="option-traditional">Traditional</SelectItem>
                        <SelectItem value="Advanced" data-testid="option-advanced">Advanced</SelectItem>
                        <SelectItem value="Four Factors" data-testid="option-four-factors">Four Factors</SelectItem>
                        <SelectItem value="Scoring" data-testid="option-scoring">Scoring</SelectItem>
                        <SelectItem value="Misc" data-testid="option-misc">Misc</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Mode</label>
                    <Select
                      value={teamStatsMode}
                      onValueChange={(value) => setTeamStatsMode(value as typeof teamStatsMode)}
                    >
                      <SelectTrigger 
                        className="w-full bg-white border-slate-200 text-slate-700 hover:border-orange-300 focus:border-orange-500 focus:ring-orange-500"
                        data-testid="select-mode"
                      >
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Per Game" data-testid="option-per-game">Per Game</SelectItem>
                        <SelectItem value="Totals" data-testid="option-totals">Totals</SelectItem>
                        <SelectItem value="Per 100 Possessions" data-testid="option-per-100">Per 100 Possessions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isLoadingTeamStats ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-semibold text-slate-700 sticky left-0 bg-white">Team</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">GP</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FGM</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FGA</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FG%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">2PM</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">2PA</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">2P%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">3PM</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">3PA</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">3P%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FTM</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FTA</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FT%</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">ORB</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">DRB</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">TRB</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">AST</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">STL</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">BLK</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">TO</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">PF</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">+/-</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">PTS</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">PITP</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">FB PTS</th>
                          <th className="text-center py-3 px-2 font-semibold text-slate-700">2ND CH</th>
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
                            {Array.from({ length: 26 }).map((_, colIndex) => (
                              <td key={`skeleton-col-${colIndex}`} className="py-3 px-2">
                                <div className="h-4 bg-gray-200 rounded w-12 mx-auto animate-pulse"></div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : sortedTeamStats.length > 0 ? (
                  <div className="overflow-x-auto -mx-4 md:mx-0 border border-orange-200 rounded-lg">
                    <table className="w-full text-xs md:text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-orange-50">
                          <th className="text-left py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 sticky left-0 bg-orange-50 z-10 w-16">Logo</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[120px]">Team</th>
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-semibold text-slate-700 min-w-[45px]">
                            <div className="flex items-center justify-center gap-1">GP</div>
                          </th>
                          {activeTeamStatColumns.map((column) => (
                            <th
                              key={column.key}
                              onClick={() => {
                                if (column.sortable) {
                                  if (teamStatsSortColumn === column.key) {
                                    setTeamStatsSortDirection(teamStatsSortDirection === 'desc' ? 'asc' : 'desc');
                                  } else {
                                    setTeamStatsSortColumn(column.key);
                                    setTeamStatsSortDirection('desc');
                                  }
                                }
                              }}
                              className={`text-center py-2 md:py-3 px-2 md:px-3 font-semibold min-w-[50px] ${
                                column.sortable ? 'cursor-pointer hover:bg-orange-100' : ''
                              } transition-colors ${
                                teamStatsSortColumn === column.key ? 'text-orange-600' : 'text-slate-700'
                              }`}
                              data-testid={`header-${column.key.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                            >
                              <div className="flex items-center justify-center gap-1">
                                {column.label}
                                {teamStatsSortColumn === column.key && column.sortable && (
                                  <span className="text-xs">{teamStatsSortDirection === 'desc' ? '▼' : '▲'}</span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sortedTeamStats.map((team, index) => (
                          <tr
                            key={`team-stats-${team.teamName}-${index}`}
                            className="hover:bg-orange-50 transition-colors cursor-pointer group"
                            onClick={() => navigate(`/team/${encodeURIComponent(team.teamName)}`)}
                            data-testid={`row-team-${team.teamName}`}
                          >
                            <td className="py-2 md:py-3 px-2 md:px-3 sticky left-0 bg-white group-hover:bg-orange-50 z-10 transition-colors">
                              <TeamLogo teamName={team.teamName} leagueId={league?.league_id || ""} size="sm" />
                            </td>
                            <td className="py-2 md:py-3 px-2 md:px-3 font-medium text-slate-800 text-xs md:text-sm truncate">
                              {team.teamName}
                            </td>
                            <td className="text-center py-2 md:py-3 px-2 md:px-3 text-slate-600 font-medium" data-testid={`text-gp-${team.teamName}`}>
                              {team.gamesPlayed}
                            </td>
                            {activeTeamStatColumns.map((column) => {
                              const value = column.getValue(team, teamStatsMode);
                              const displayValue = column.format ? column.format(Number(value)) : value;
                              return (
                                <td
                                  key={`${team.teamName}-${column.key}`}
                                  className="text-center py-2 md:py-3 px-2 md:px-3 text-slate-600"
                                  data-testid={`text-${column.key.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${team.teamName}`}
                                >
                                  {displayValue}
                                </td>
                              );
                            })}
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
                
                {/* Dynamic Legend based on category */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <div className="text-xs text-slate-500 space-y-1">
                    <div className="font-semibold text-slate-600 mb-2">Legend ({teamStatsCategory}):</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {TEAM_STAT_LEGENDS[teamStatsCategory]?.map((legend, index) => (
                        <span key={`legend-${index}`}>{legend}</span>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      Click on any team to view their detailed profile • Swipe horizontally to see all stats
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
                <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4">Game Schedule</h2>
                
                {/* Tabs for Upcoming / Results */}
                <div className="flex gap-2 mb-4 border-b border-gray-200">
                  <button
                    onClick={() => setScheduleView('upcoming')}
                    className={`px-3 md:px-4 py-2 text-xs md:text-sm font-semibold transition-all ${
                      scheduleView === 'upcoming'
                        ? 'text-orange-500 border-b-2 border-orange-500 -mb-[2px]'
                        : 'text-slate-600 hover:text-orange-500'
                    }`}
                    data-testid="button-upcoming-games"
                  >
                    Upcoming Games
                  </button>
                  <button
                    onClick={() => setScheduleView('results')}
                    className={`px-3 md:px-4 py-2 text-xs md:text-sm font-semibold transition-all ${
                      scheduleView === 'results'
                        ? 'text-orange-500 border-b-2 border-orange-500 -mb-[2px]'
                        : 'text-slate-600 hover:text-orange-500'
                    }`}
                    data-testid="button-results"
                  >
                    Results
                  </button>
                </div>

                {schedule.length > 0 ? (
                  <>
                    {(() => {
                      const now = new Date();
                      const upcomingGames = schedule
                        .filter(game => new Date(game.game_date) >= now)
                        .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime());
                      const pastGames = schedule
                        .filter(game => new Date(game.game_date) < now && (game.team1_score != null || game.team2_score != null))
                        .sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());

                      const gamesToShow = scheduleView === 'upcoming' ? upcomingGames : pastGames;

                      return (
  
                        
                        <>
                          {gamesToShow.length > 0 ? (
                            <div className="divide-y divide-gray-200">
                              {scheduleView === 'upcoming' ? (
                                /* Upcoming Games View */
                                gamesToShow.map((game, index) => (
                                  <div 
                                    key={`upcoming-${game.game_id}-${index}`} 
                                    className="py-2 md:py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                                    onClick={() => {
                                      setSelectedPreviewGame(game);
                                      setIsPreviewModalOpen(true);
                                    }}
                                    data-testid={`upcoming-game-${index}`}
                                  >
                                    {/* Mobile-optimized compact layout */}
                                    <div className="flex flex-col gap-2">
                                      {/* Date and Time Row */}
                                      <div className="flex items-center justify-between">
                                        <div className="text-[11px] md:text-xs text-slate-600 font-medium">
                                          {new Date(game.game_date).toLocaleDateString('en-US', { 
                                            month: 'short', 
                                            day: 'numeric'
                                          })}
                                          {game.kickoff_time && ` • ${game.kickoff_time}`}
                                        </div>
                                        {game.venue && (
                                          <div className="text-[10px] md:text-xs text-slate-400 truncate max-w-[100px] md:max-w-none">
                                            {game.venue}
                                          </div>
                                        )}
                                      </div>
                                      {/* Teams Row */}
                                      <div className="flex items-center gap-2 md:gap-3">
                                        <div className="flex items-center gap-1 md:gap-1.5 flex-1 min-w-0">
                                          <TeamLogo teamName={game.team1} leagueId={league?.league_id || ""} size="sm" />
                                          <span className="font-medium text-slate-800 text-[11px] md:text-sm truncate">{game.team1}</span>
                                        </div>
                                        <span className="text-slate-400 text-[11px] md:text-xs flex-shrink-0">vs</span>
                                        <div className="flex items-center gap-1 md:gap-1.5 flex-1 justify-end min-w-0">
                                          <span className="font-medium text-slate-800 text-[11px] md:text-sm truncate">{game.team2}</span>
                                          <TeamLogo teamName={game.team2} leagueId={league?.league_id || ""} size="sm" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                /* Results View */
                                gamesToShow.map((game, index) => (
                                  <div 
                                    key={`past-${game.game_id}-${index}`} 
                                    className={`py-2 md:py-3 transition-colors ${game.numeric_id ? 'cursor-pointer hover:bg-orange-50' : 'cursor-default'}`}
                                    onClick={() => {
                                      if (game.numeric_id) {
                                        handleGameClick(game.numeric_id);
                                      }
                                    }}
                                    data-testid={`past-game-${index}`}
                                  >
                                    {/* Mobile-optimized compact layout */}
                                    <div className="flex flex-col gap-2">
                                      {/* Date and Status Row */}
                                      <div className="flex items-center justify-between">
                                        <div className="text-[11px] md:text-xs text-slate-600 font-medium">
                                          {new Date(game.game_date).toLocaleDateString('en-US', { 
                                            month: 'short', 
                                            day: 'numeric'
                                          })}
                                          {game.status && (
                                            <span className="ml-2 text-[10px] md:text-xs text-green-600 font-semibold">
                                              {game.status}
                                            </span>
                                          )}
                                        </div>
                                        {game.venue && (
                                          <div className="text-[10px] md:text-xs text-slate-400 truncate max-w-[100px] md:max-w-none">
                                            {game.venue}
                                          </div>
                                        )}
                                      </div>
                                      {/* Teams and Score Row */}
                                      <div className="flex items-center gap-2 md:gap-3">
                                        <div className="flex items-center gap-1 md:gap-1.5 flex-1 min-w-0">
                                          <TeamLogo teamName={game.team1} leagueId={league?.league_id || ""} size="sm" />
                                          <span className="font-medium text-slate-800 text-[11px] md:text-sm truncate">{game.team1}</span>
                                        </div>
                                        {game.team1_score !== undefined && game.team2_score !== undefined ? (
                                          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
                                            <span className={`text-base md:text-lg font-bold ${game.team1_score > game.team2_score ? 'text-green-600' : 'text-slate-600'}`}>
                                              {game.team1_score}
                                            </span>
                                            <span className="text-slate-400 text-[11px] md:text-sm">-</span>
                                            <span className={`text-base md:text-lg font-bold ${game.team2_score > game.team1_score ? 'text-green-600' : 'text-slate-600'}`}>
                                              {game.team2_score}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-slate-400 text-[11px] md:text-xs flex-shrink-0">vs</span>
                                        )}
                                        <div className="flex items-center gap-1 md:gap-1.5 flex-1 justify-end min-w-0">
                                          <span className="font-medium text-slate-800 text-[11px] md:text-sm truncate">{game.team2}</span>
                                          <TeamLogo teamName={game.team2} leagueId={league?.league_id || ""} size="sm" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-gray-500">
                              <p className="text-xs md:text-sm">
                                {scheduleView === 'upcoming' ? 'No upcoming games' : 'No results available'}
                              </p>
                              <p className="text-[10px] md:text-xs mt-1">
                                {scheduleView === 'upcoming' 
                                  ? 'Check back later for scheduled games' 
                                  : 'Games will appear here after they are played'}
                              </p>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-xs md:text-sm">No games scheduled</p>
                    <p className="text-[10px] md:text-xs mt-1">Games will appear when scheduled</p>
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
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  {/* Toggle between Averages and Totals */}
                  <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                    <button
                      onClick={() => setLeagueLeadersView('averages')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        leagueLeadersView === 'averages'
                          ? 'bg-white text-orange-600 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                      data-testid="button-league-leaders-averages"
                    >
                      Averages
                    </button>
                    <button
                      onClick={() => setLeagueLeadersView('totals')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        leagueLeadersView === 'totals'
                          ? 'bg-white text-orange-600 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                      data-testid="button-league-leaders-totals"
                    >
                      Totals
                    </button>
                  </div>
                  <button
                    onClick={() => navigate(`/league-leaders/${slug}`)}
                    className="text-xs md:text-sm text-orange-500 hover:text-orange-600 font-medium hover:underline text-left sm:text-right"
                  >
                    View All Leaders →
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                {isLoadingLeaders ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <LeaderCardSkeleton key={`leader-skeleton-${i}`} />
                  ))
                ) : (
                  ([
                    { 
                      title: "Top Scorers", 
                      list: topScorers, 
                      avgLabel: "PPG", 
                      totalLabel: "PTS",
                    },
                    { 
                      title: "Top Rebounders", 
                      list: topRebounders, 
                      avgLabel: "RPG", 
                      totalLabel: "REB",
                    },
                    { 
                      title: "Top Playmakers", 
                      list: topAssistsList, 
                      avgLabel: "APG", 
                      totalLabel: "AST",
                    },
                  ] as const).map(({ title, list, avgLabel, totalLabel }) => (
                    <div key={title} className="bg-gray-50 rounded-lg p-3 md:p-4 shadow-inner">
                      <h3 className="text-xs md:text-sm font-semibold text-slate-700 mb-2 md:mb-3 text-center">{title}</h3>
                      <ul className="space-y-1 text-xs md:text-sm text-slate-800">
                        {Array.isArray(list) &&
                          list.map((p, i) => (
                            <li key={`${title}-${p.name}-${i}`} className="flex justify-between">
                              <span className="truncate mr-2">{p.name}</span>
                              <span className="font-medium text-orange-500 whitespace-nowrap">
                                {p.value} {leagueLeadersView === 'averages' ? avgLabel : totalLabel}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
                </div>

                {/* Team League Leaders */}
                <div className="bg-white rounded-xl shadow p-4 md:p-6">
                  <div className="flex justify-between items-center mb-4 md:mb-6">
                    <h2 className="text-base md:text-lg font-semibold text-slate-800">Team Leaders</h2>
                    <button
                      onClick={() => setActiveSection('teamstats')}
                      className="text-xs md:text-sm text-orange-500 hover:text-orange-600 font-medium hover:underline"
                    >
                      View All Team Stats →
                    </button>
                  </div>
                  {isLoadingTeamStats || teamStatsData.length === 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <LeaderCardSkeleton key={`team-leader-skeleton-${i}`} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                      {/* Top Scoring Teams */}
                      <div className="bg-gray-50 rounded-lg p-3 md:p-4 shadow-inner">
                        <h3 className="text-xs md:text-sm font-semibold text-slate-700 mb-2 md:mb-3 text-center">Top Scoring</h3>
                        <ul className="space-y-1 text-xs md:text-sm text-slate-800">
                          {teamStatsData
                            .slice()
                            .sort((a, b) => (b.ppg || 0) - (a.ppg || 0))
                            .slice(0, 5)
                            .map((team, i) => (
                              <li key={`scoring-${team.team}-${i}`} className="flex justify-between items-center gap-2">
                                <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                  <TeamLogo teamName={team.team} leagueId={league?.league_id} size="xs" />
                                  <span className="truncate">{team.team}</span>
                                </div>
                                <span className="font-medium text-orange-500 whitespace-nowrap">
                                  {(team.ppg || 0).toFixed(1)} PPG
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>

                      {/* Top Rebounding Teams */}
                      <div className="bg-gray-50 rounded-lg p-3 md:p-4 shadow-inner">
                        <h3 className="text-xs md:text-sm font-semibold text-slate-700 mb-2 md:mb-3 text-center">Top Rebounding</h3>
                        <ul className="space-y-1 text-xs md:text-sm text-slate-800">
                          {teamStatsData
                            .slice()
                            .sort((a, b) => (b.rpg || 0) - (a.rpg || 0))
                            .slice(0, 5)
                            .map((team, i) => (
                              <li key={`rebounding-${team.team}-${i}`} className="flex justify-between items-center gap-2">
                                <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                  <TeamLogo teamName={team.team} leagueId={league?.league_id} size="xs" />
                                  <span className="truncate">{team.team}</span>
                                </div>
                                <span className="font-medium text-orange-500 whitespace-nowrap">
                                  {(team.rpg || 0).toFixed(1)} RPG
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>

                      {/* Top Assists Teams */}
                      <div className="bg-gray-50 rounded-lg p-3 md:p-4 shadow-inner">
                        <h3 className="text-xs md:text-sm font-semibold text-slate-700 mb-2 md:mb-3 text-center">Top Playmaking</h3>
                        <ul className="space-y-1 text-xs md:text-sm text-slate-800">
                          {teamStatsData
                            .slice()
                            .sort((a, b) => (b.apg || 0) - (a.apg || 0))
                            .slice(0, 5)
                            .map((team, i) => (
                              <li key={`assists-${team.team}-${i}`} className="flex justify-between items-center gap-2">
                                <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                  <TeamLogo teamName={team.team} leagueId={league?.league_id} size="xs" />
                                  <span className="truncate">{team.team}</span>
                                </div>
                                <span className="font-medium text-orange-500 whitespace-nowrap">
                                  {(team.apg || 0).toFixed(1)} APG
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

            {/* Tournament Bracket - Only for BCB Trophy */}
            {slug === 'british-championship-basketball' && league?.league_id && (
              <div className="bg-white rounded-xl shadow p-4 md:p-6">
                <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-4 md:mb-6">Tournament Bracket</h2>
                <TournamentBracket 
                  leagueId={league.league_id} 
                  onGameClick={handleGameClick}
                />
              </div>
            )}

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
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left py-3 px-3 font-semibold text-slate-700 w-12 sticky left-0 bg-white z-10">#</th>
                        <th className="text-left py-3 px-3 font-semibold text-slate-700 max-w-[180px] sticky left-12 md:static bg-white z-10">Team</th>
                        <th className="text-center py-3 px-3 font-semibold text-slate-700 w-20">W</th>
                        <th className="text-center py-3 px-3 font-semibold text-slate-700 w-20">L</th>
                        <th className="text-center py-3 px-3 font-semibold text-slate-700 w-20">Win%</th>
                        <th className="text-right py-3 px-3 font-semibold text-slate-700 w-20">PF</th>
                        <th className="text-right py-3 px-3 font-semibold text-slate-700 w-20">PA</th>
                        <th className="text-right py-3 px-3 font-semibold text-slate-700 w-20">Diff</th>
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
                          <td className="py-3 px-3 font-medium text-slate-600 sticky left-0 bg-inherit z-10">{index + 1}</td>
                          <td className="py-3 px-3 font-medium text-slate-800 max-w-[180px] sticky left-12 md:static bg-inherit z-10">
                            <div className="flex items-center gap-2">
                              <TeamLogo teamName={team.team} leagueId={league?.league_id} size="sm" />
                              <span className="truncate">{team.team}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center font-semibold text-slate-700">{team.wins}</td>
                          <td className="py-3 px-3 text-center font-semibold text-slate-700">{team.losses}</td>
                          <td className="py-3 px-3 text-center font-medium text-slate-600">{(team.winPct * 100).toFixed(1)}%</td>
                          <td className="py-3 px-3 text-right font-medium text-slate-700">{team.pointsFor}</td>
                          <td className="py-3 px-3 text-right font-medium text-slate-700">{team.pointsAgainst}</td>
                          <td className={`py-3 px-3 text-right font-semibold ${team.pointsDiff > 0 ? 'text-green-600' : team.pointsDiff < 0 ? 'text-red-600' : 'text-slate-600'}`}>{team.pointsDiff > 0 ? '+' : ''}{team.pointsDiff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-slate-500">
                    <div className="flex gap-4 flex-wrap">
                      <span><span className="font-semibold">W</span> = Wins</span>
                      <span><span className="font-semibold">L</span> = Losses</span>
                      <span><span className="font-semibold">Win%</span> = Win Percentage</span>
                      <span><span className="font-semibold">PF</span> = Points For</span>
                      <span><span className="font-semibold">PA</span> = Points Against</span>
                      <span><span className="font-semibold">Diff</span> = Point Differential</span>
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
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Latest Highlights</h3>
                {isOwner && (
                  <button
                    onClick={() => setIsEditingYoutube(!isEditingYoutube)}
                    className="text-xs text-orange-500 hover:text-orange-600 font-medium"
                  >
                    {isEditingYoutube ? 'Cancel' : 'Edit'}
                  </button>
                )}
              </div>

              {isEditingYoutube && isOwner ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter YouTube video URL (e.g., https://www.youtube.com/watch?v=xyz or https://youtu.be/xyz)"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  />
                  <p className="text-xs text-gray-500">
                    💡 Paste any YouTube video URL (watch, short link, or shorts)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleYoutubeUpdate}
                      disabled={updatingYoutube}
                      className={`px-3 py-1 text-xs font-medium rounded ${
                        updatingYoutube 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : 'bg-orange-500 text-white hover:bg-orange-600'
                      }`}
                    >
                      {updatingYoutube ? 'Updating...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingYoutube(false);
                        setYoutubeUrl(league?.youtube_embed_url || "");
                      }}
                      className="px-3 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {league?.youtube_embed_url && getYoutubeEmbedUrl(league.youtube_embed_url) ? (
                    <iframe
                      src={getYoutubeEmbedUrl(league.youtube_embed_url)}
                      width="100%"
                      height="250"
                      className="rounded-md border"
                      title="YouTube video player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No YouTube video added yet</p>
                      {isOwner && (
                        <button
                          onClick={() => setIsEditingYoutube(true)}
                          className="mt-2 text-xs text-orange-500 hover:text-orange-600 underline"
                        >
                          Add YouTube Video
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
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
  
