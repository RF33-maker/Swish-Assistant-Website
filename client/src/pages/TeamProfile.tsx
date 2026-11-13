import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { supabase } from "@/lib/supabase";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { TeamLogo } from "@/components/TeamLogo";
import React from "react";
import { EditableDescription } from "@/components/EditableDescription";
import { useAuth } from "@/hooks/use-auth";
import { useAskScope } from "@/components/ask-swish/AskSwishProvider";
import { Helmet } from "react-helmet-async";
import { gamePath, teamPath, teamSeoDescription, teamSeoTitle } from "@shared/seo";
import { clubDisplayName, clubSlug, isFormerName } from "@shared/teamIdentity";
import { isFinishedCompetition, teamSeasonSummary } from "@shared/recaps";
import EntityLink from "@/components/EntityLink";
import { normalizeTeamName } from "@/lib/teamUtils";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { useReadableTeamColor } from "@/hooks/useReadableColor";
import { adjustOpacity } from "@/lib/colorExtractor";
import { namesMatch } from "@/lib/fuzzyMatch";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import {
  buildUnambiguousFullNameAliases,
  expandUnambiguousPlayerName,
  getImportedPlayerName,
  resolvePlayerDisplayName,
} from "@/lib/playerName";
import type { TeamSeasonCompetition } from "@/lib/teamSeasons";
import { ThemeToggle } from "@/components/ThemeToggle";
import GameDetailModal from "@/components/GameDetailModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ShotChart, { type ShotData } from "@/components/ShotChart";
import { Instagram, ArrowLeft, LayoutDashboard, BarChart3, Shield, Crosshair, Users, Award, Timer } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { AccoladeBadges } from "@/components/AccoladeBadges";
import { ProfileChip } from "@/components/ProfileChip";
import { PillTabBar } from "@/components/PillTabBar";
import { computeClubAccolades, computeTeamAccolades, topAccolades } from "@/lib/accolades";
import { useTeamCompetitions } from "@/hooks/useTeamCompetitions";
import { AdminCoachViewLink } from "@/components/coaches-hub/AdminTeamPicker";
import { TeamLineupsPanel } from "@/components/TeamLineupsPanel";
import { TeamClutchPanel } from "@/components/TeamClutchPanel";
import { usePlusAccess } from "@/lib/plus";
import { fetchTeamRecordMaxes, type RecordMaxes } from "@/lib/recordMaxes";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { FlatStat, StatBar } from "@/components/FlatStat";
import { parseMinutesPlayed, playedInGame } from "@/lib/gamesPlayed";

const EMPTY_RECORD_MAXES: RecordMaxes = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0 };

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
  photoUrl?: string | null;
  photoFocusY?: number | null;
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
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  tpm?: number;
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
  games: Game[];
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

function getTeamRosterPlayerName(stat: any): string {
  if (stat._resolvedPlayerName) return stat._resolvedPlayerName;
  const canonicalName = stat.players?.full_name || null;
  const canonicalLeagueId = stat.players?.league_id || null;
  const importedName = getImportedPlayerName(stat);
  const canUseCanonical =
    !!canonicalName &&
    (canonicalLeagueId === stat.league_id || (!!importedName && namesMatch(importedName, canonicalName)));

  return resolvePlayerDisplayName(stat, canUseCanonical ? canonicalName : null);
}

const PLAYER_STAT_COLUMNS: Record<string, { key: string; label: string }[]> = {
  Traditional: [
    { key: "spoints", label: "PTS" },
    { key: "sminutes", label: "MIN" },
    { key: "sfieldgoalsmade", label: "FGM" },
    { key: "sfieldgoalsattempted", label: "FGA" },
    { key: "sfieldgoalspercentage", label: "FG%" },
    { key: "sthreepointersmade", label: "3PM" },
    { key: "sthreepointersattempted", label: "3PA" },
    { key: "sthreepointerspercentage", label: "3P%" },
    { key: "sfreethrowsmade", label: "FTM" },
    { key: "sfreethrowsattempted", label: "FTA" },
    { key: "sfreethrowspercentage", label: "FT%" },
    { key: "sreboundstotal", label: "REB" },
    { key: "sassists", label: "AST" },
    { key: "sturnovers", label: "TO" },
    { key: "ssteals", label: "STL" },
    { key: "sblocks", label: "BLK" },
    { key: "sfoulspersonal", label: "PF" },
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
    { key: "sblocksreceived", label: "BLK AGAINST" }
  ]
};

const PLAYER_STAT_LEGENDS: Record<string, string[]> = {
  Traditional: [
    'PTS = Points', 'MIN = Minutes', 'FGM = Field Goals Made', 'FGA = Field Goals Attempted',
    'FG% = Field Goal Percentage',
    '3PM = Three-Pointers Made', '3PA = Three-Pointers Attempted', '3P% = Three-Point Percentage',
    'FTM = Free Throws Made', 'FTA = Free Throws Attempted', 'FT% = Free Throw Percentage',
    'REB = Total Rebounds', 'AST = Assists', 'TO = Turnovers',
    'STL = Steals', 'BLK = Blocks', 'PF = Personal Fouls'
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
  Misc: ['+/- = Plus/Minus', 'BLK AGAINST = Blocks Received']
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
    'pts_percent_second_chance', 'pts_percent_off_turnovers',
    'sfieldgoalspercentage', 'sthreepointerspercentage', 'sfreethrowspercentage'
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

function TeamShotChartSection({
  teamName,
  leagueId,
  recentGames,
  shotChartRange,
  setShotChartRange,
}: {
  teamName: string;
  leagueId: string;
  recentGames: Game[];
  shotChartRange: string;
  setShotChartRange: (v: string) => void;
}) {
  const selectedGames = useMemo(() => {
    if (!recentGames || recentGames.length === 0) return [];
    const sorted = [...recentGames]
      .filter(g => g.game_key)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (shotChartRange === "last5") return sorted.slice(0, 5);
    if (shotChartRange === "last10") return sorted.slice(0, 10);
    if (shotChartRange.startsWith("game:")) {
      const gk = shotChartRange.replace("game:", "");
      return sorted.filter(g => g.game_key === gk);
    }
    return sorted;
  }, [recentGames, shotChartRange]);

  const gameKeys = useMemo(() => selectedGames.map(g => g.game_key).filter(Boolean) as string[], [selectedGames]);

  const teamNoByGameKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of selectedGames) {
      if (g.game_key) {
        map.set(g.game_key, g.isHome ? 1 : 2);
      }
    }
    return map;
  }, [selectedGames]);

  const { data: shotEvents, isLoading } = useQuery({
    queryKey: ['team-shot-chart', teamName, leagueId, gameKeys],
    queryFn: async () => {
      if (gameKeys.length === 0) return [];
      const { data, error } = await supabase
        .from('shot_chart')
        .select('id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key')
        .in('game_key', gameKeys);
      if (error) { console.error('Shot chart error:', error); return []; }
      return ((data || []) as ShotData[])
        .filter(e => {
          if (!e.game_key || e.team_no == null) return false;
          const expectedTeamNo = teamNoByGameKey.get(e.game_key);
          return expectedTeamNo != null && e.team_no === expectedTeamNo;
        });
    },
    enabled: gameKeys.length > 0,
  });

  const gamesWithKeys = useMemo(() => {
    return (recentGames || [])
      .filter(g => g.game_key)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [recentGames]);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h2 className="ch-section-title">Shot Chart</h2>
        <Select value={shotChartRange} onValueChange={setShotChartRange}>
          <SelectTrigger className="w-full md:w-48 bg-[color:var(--ch-surface)] border-slate-200 dark:border-neutral-600">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
            <SelectItem value="season">Full Season</SelectItem>
            <SelectItem value="last10">Last 10 Games</SelectItem>
            <SelectItem value="last5">Last 5 Games</SelectItem>
            {gamesWithKeys.map((g, i) => (
              <SelectItem key={g.game_key} value={`game:${g.game_key}`}>
                vs {g.opponent} ({new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ShotChart
        shots={shotEvents || []}
        loading={isLoading}
        flat
        emptyMessage="No shot data available for the selected games."
        filters={{
          showPlayerFilter: true,
          showQuarterFilter: true,
          showResultFilter: true,
        }}
      />
    </div>
  );
}

// Small circular avatar for name-list rows (Team Roster, Player Stats).
// PlayerHeadshot serves the pre-framed thumbnail; the crop below only applies
// to an original photo that has no thumbnail yet.
// The source photos are portrait, near-square-ish (0.96 aspect), so
// object-fit: cover barely crops them into a ~1:1 circle — most of what
// showed was jersey, not face. Zooms in on the top of the frame instead of
// trusting photo_focus_y (mostly unset/default in the data, not reliably
// calibrated to the face) — our own crop pipeline already consistently
// frames the head near the top with a small buffer, so anchoring there
// works across the board.
function PlayerAvatarThumb({ photoUrl, name, size = "w-6 h-6 md:w-7 md:h-7", fallbackClassName, fallbackStyle }: {
  photoUrl?: string | null;
  name: string;
  size?: string;
  fallbackClassName: string;
  fallbackStyle?: React.CSSProperties;
}) {
  return (
    <>
      {photoUrl ? (
        <div className={`${size} rounded-full overflow-hidden flex-shrink-0 bg-slate-200 dark:bg-neutral-700`}>
          <PlayerHeadshot
            src={photoUrl}
            alt={name}
            loading="lazy"
            className="w-full h-full object-cover"
            fallbackStyle={{ objectPosition: "center 12%", transform: "scale(1.5)", transformOrigin: "center 12%" }}
            onError={(e) => {
              const wrapper = e.currentTarget.parentElement;
              if (wrapper) wrapper.style.display = "none";
              (wrapper?.nextElementSibling as HTMLElement | null)?.style.removeProperty("display");
            }}
          />
        </div>
      ) : null}
      <div className={`${size} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${fallbackClassName}`} style={{ ...fallbackStyle, display: photoUrl ? "none" : undefined }}>
        {name.charAt(0)}
      </div>
    </>
  );
}

/** decodeURIComponent that leaves a literal "%" (e.g. "100% Hoops") alone. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** /api/public/team-page/:key — a team side's permanent page and its competitions. */
interface TeamPageInfo {
  slug: string;
  name: string;
  youth: boolean;
  competitions: Array<{ slug: string; name: string; teamName: string; lastPlayed: string | null; youth: boolean; leagueIds: string[] }>;
}

export default function TeamProfile() {
  const {
    teamName: routeTeamName,
    leagueSlug: legacyLeagueSlug,
    competitionSlug,
  } = useParams();
  const search = useSearch();
  const competitionQuery = new URLSearchParams(search).get("competition");
  // /team/<slug> is the team's permanent page across seasons: the server
  // resolves the slug to every competition the side has played in, and the
  // page opens on ?competition=… or the most recent adult one. Everything
  // below stays scoped to one competition at a time, as before. The older
  // season-specific routes still work.
  const isPermanentRoute = !competitionSlug && !legacyLeagueSlug;
  const { data: teamPage, isLoading: teamPageLoading } = useQuery({
    queryKey: ["team-page", routeTeamName, competitionQuery],
    queryFn: async (): Promise<TeamPageInfo | null> => {
      // The competition says which side of a shared name is meant (the women's "London Lions").
      const competition = competitionQuery ? `?competition=${encodeURIComponent(competitionQuery)}` : "";
      const res = await fetch(`/api/public/team-page/${encodeURIComponent(routeTeamName || "")}${competition}`);
      return res.ok ? res.json() : null;
    },
    enabled: isPermanentRoute && !!routeTeamName,
    staleTime: 5 * 60_000,
  });
  const defaultCompetition = teamPage
    ? teamPage.competitions.find((c) => !c.youth) || teamPage.competitions[0] || null
    : null;
  const listedCompetition = teamPage && competitionQuery
    ? teamPage.competitions.find((c) => c.slug === competitionQuery)
    : undefined;
  // The page's list comes from an index the server rebuilds hourly, but the
  // competition switcher reads the database directly, so a season published
  // since the last rebuild can be picked and not be in the list. Follow the
  // switcher's own entry for it (the same, already-cached request) rather
  // than falling back to the newest season.
  const competitionUnlisted = !!teamPage && !!competitionQuery && !listedCompetition;
  const { data: switcherCompetitions = [], isLoading: switcherLoading } = useTeamCompetitions(
    competitionUnlisted ? defaultCompetition?.teamName : null,
    defaultCompetition?.slug,
  );
  const unlistedCompetition = competitionUnlisted
    ? switcherCompetitions.find((c) => c.slug === competitionQuery)
    : undefined;
  const pageCompetition = teamPage
    ? listedCompetition
      || (unlistedCompetition
        ? {
            slug: unlistedCompetition.slug,
            name: unlistedCompetition.name,
            teamName: unlistedCompetition.teamName,
            lastPlayed: unlistedCompetition.lastPlayed || null,
            youth: false,
            leagueIds: [unlistedCompetition.league_id],
          }
        : null)
      || defaultCompetition
    : null;
  const teamName = isPermanentRoute
    ? teamPage && pageCompetition && !(competitionUnlisted && switcherLoading)
      ? encodeURIComponent(pageCompetition.teamName)
      : teamPageLoading || (competitionUnlisted && switcherLoading) ? undefined : routeTeamName
    : routeTeamName;
  const leagueSlug = competitionSlug || legacyLeagueSlug || pageCompetition?.slug;
  const [location, navigate] = useLocation();
  const [team, setTeam] = useState<Team | null>(null);
  // Ask Swish answers about this team by default while the page is open.
  useAskScope(team?.name ? {
    teamName: team.name,
    leagueId: (team as any)?.league?.league_id ?? null,
    leagueName: (team as any)?.league?.name ?? null,
    leagueSlug: leagueSlug ?? null,
  } : null);
  const [playerStats, setPlayerStats] = useState<any[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<UpcomingGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamDescription, setTeamDescription] = useState<string | null>(null);
  const [teamInstagramUrl, setTeamInstagramUrl] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const { user } = useAuth();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [currentLeagueId, setCurrentLeagueId] = useState<string | null>(null);
  const [activeStatsTab, setActiveStatsTab] = useState<'overview' | 'playerStats' | 'teamStats' | 'shotChart' | 'lineups' | 'clutch' | 'accolades'>('overview');
  const [shotChartRange, setShotChartRange] = useState<string>("season");
  const [playerStatsCategory, setPlayerStatsCategory] = useState<'Traditional' | 'Advanced' | 'Scoring' | 'Misc'>('Traditional');
  const [playerStatsView, setPlayerStatsView] = useState<'Total' | 'Per Game' | 'Per 40'>('Per Game');
  const [statsSearch, setStatsSearch] = useState('');
  const [statsSortColumn, setStatsSortColumn] = useState<string>('PTS');
  const [statsSortDirection, setStatsSortDirection] = useState<'asc' | 'desc'>('desc');
  const [seasonCompetitions, setSeasonCompetitions] = useState<TeamSeasonCompetition[]>([]);
  // Record, stats and games are scoped to the URL's competition only — a
  // National Cup game must not count towards the NBL league record, even
  // though both competitions share a brand and a season.
  const currentCompetition = seasonCompetitions.find(c => c.slug === leagueSlug);
  // On the permanent page the server says where the competition's data lives:
  // itself plus any private child competition that displays under it (e.g.
  // the BCB Trophy's games are stored in a child) — the parent alone is empty.
  const selectedLeagueIds = isPermanentRoute && pageCompetition?.leagueIds?.length
    ? pageCompetition.leagueIds
    : currentCompetition ? [currentCompetition.league_id] : [];
  const lineupsSlug = leagueSlug || "";
  const plus = usePlusAccess();
  // Every competition this club has played in (league, cup, trophy, past
  // seasons) — drives the competition switcher and the club-wide accolades.
  const decodedTeamName = teamName ? safeDecode(teamName) : "";
  const { data: clubCompetitions = [] } = useTeamCompetitions(decodedTeamName, leagueSlug);
  const permanentSlug = teamPage?.slug || clubSlug(decodedTeamName);
  // An old slug or a team name in the URL: show the canonical one.
  useEffect(() => {
    if (isPermanentRoute && teamPage && routeTeamName && teamPage.slug !== routeTeamName) {
      navigate(`/team/${teamPage.slug}${search ? `?${search}` : ""}`, { replace: true });
    }
  }, [isPermanentRoute, teamPage, routeTeamName, search, navigate]);
  // Other competitions of this same club — used as a branding/logo fallback
  // when the current competition's own `teams` row hasn't been populated yet
  // (common for newly-created seasons before data import catches up).
  const siblingLeagueIds = useMemo(
    () => Array.from(new Set([
      ...seasonCompetitions.map(c => c.league_id),
      ...clubCompetitions.map(c => c.league_id),
    ].filter(Boolean))),
    [seasonCompetitions, clubCompetitions],
  );

  // Extract team branding colors
  const { colors: teamBranding, primaryColor, secondaryColor } = useTeamBranding({
    teamName: team?.name || '',
    leagueId: team?.league?.league_id || '',
    extraLeagueIds: siblingLeagueIds,
    enabled: !!team?.name && !!team?.league?.league_id,
  });

  // Compute color for text on white backgrounds (needs good contrast) — still
  // used for the pill tab bar's active-tab fill, which always sits under
  // white text regardless of theme, so it must stay dark enough for that
  // (contrast is symmetric, so "readable as text on white" == "readable as
  // a fill under white text").
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

  // Theme-aware readable variant of the team colour, for all the general
  // stat/label text and icons scattered through this page — `textOnWhiteColor`
  // above is tuned for a white background specifically and stays dark even
  // in dark mode, which is invisible against a near-black card surface.
  const readablePrimary = useReadableTeamColor(primaryColor);

  const [teamRecordMaxes, setTeamRecordMaxes] = useState<RecordMaxes>(EMPTY_RECORD_MAXES);
  useEffect(() => {
    let cancelled = false;
    const leagueId = team?.league?.league_id;
    if (!leagueId) {
      setTeamRecordMaxes(EMPTY_RECORD_MAXES);
      return;
    }
    fetchTeamRecordMaxes([leagueId]).then(m => { if (!cancelled) setTeamRecordMaxes(m); });
    return () => { cancelled = true; };
  }, [team?.league?.league_id]);

  // Club-wide, so they stay the same whichever competition the profile is
  // opened through. Falls back to this competition's own games for a team
  // with no team_stats rows to match on.
  const teamAccolades = useMemo(() => {
    if (clubCompetitions.length > 0) return computeClubAccolades(clubCompetitions);
    return team ? computeTeamAccolades(team.games, teamRecordMaxes, team.league?.name) : [];
  }, [clubCompetitions, team, teamRecordMaxes]);

  // The switcher always lists the competition being viewed, even before (or
  // without) a match in the club list.
  const competitionOptions = useMemo(() => {
    const options = clubCompetitions.map(c => ({ slug: c.slug, name: c.name, record: `${c.wins}-${c.losses}` }));
    if (leagueSlug && !options.some(o => o.slug === leagueSlug)) {
      options.unshift({ slug: leagueSlug, name: currentCompetition?.name || leagueSlug, record: "" });
    }
    return options;
  }, [clubCompetitions, leagueSlug, currentCompetition?.name]);

  const activePlayerStatColumns = useMemo(() => {
    return PLAYER_STAT_COLUMNS[playerStatsCategory] || PLAYER_STAT_COLUMNS['Traditional'];
  }, [playerStatsCategory]);

  const detailedPlayerAverages = useMemo(() => {
    if (!playerStats || playerStats.length === 0) return [];

    const byPlayerId = new Map<string, any>();

    playerStats.forEach((stat: any) => {
      const playerName = getTeamRosterPlayerName(stat);
      const minutesPlayed = parseMinutesPlayed(stat);
      const didPlay = playedInGame(stat);

      if (stat.player_id) {
        if (!byPlayerId.has(stat.player_id)) {
          byPlayerId.set(stat.player_id, {
            id: stat.player_id,
            name: playerName,
            slug: stat.players?.slug || null,
            games: 0,
            totalMinutes: 0,
            rawStats: [],
            photoUrl: null as string | null,
            photoFocusY: stat.players?.photo_focus_y ?? null,
          });
        }
        const agg = byPlayerId.get(stat.player_id)!;
        if (didPlay) {
          agg.games += 1;
          agg.totalMinutes += minutesPlayed;
          agg.rawStats.push(stat);
        }
        if (playerName.length > agg.name.length) agg.name = playerName;
        if (!agg.photoUrl) {
          // Only the profile-page photo (background-removed) — never the
          // separate original kept for social-graphic generation.
          agg.photoUrl = getPlayerPhotoUrlCached(stat.players?.photo_path_bg_removed || null);
        }
      }
    });

    // Second pass: merge same-named players who have different player_id rows in the DB
    const normName = (n: string) => n.toLowerCase().trim().replace(/\s+/g, ' ');
    const byName = new Map<string, any>();
    for (const p of byPlayerId.values()) {
      const key = normName(p.name);
      if (byName.has(key)) {
        const existing = byName.get(key)!;
        existing.games += p.games;
        existing.totalMinutes += p.totalMinutes;
        existing.rawStats = existing.rawStats.concat(p.rawStats);
        if (p.name.length > existing.name.length) existing.name = p.name;
        if (!existing.slug && p.slug) existing.slug = p.slug;
        if (!existing.photoUrl && p.photoUrl) { existing.photoUrl = p.photoUrl; existing.photoFocusY = p.photoFocusY; }
      } else {
        byName.set(key, { ...p, rawStats: [...p.rawStats] });
      }
    }

    return Array.from(byName.values())
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
      'pts_percent_second_chance', 'pts_percent_off_turnovers',
      'sfieldgoalspercentage', 'sthreepointerspercentage', 'sfreethrowspercentage'
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

  // Home and away need every game; recentGames stops at ten.
  const homeAwayRecord = useMemo(() => {
    const tally = (games: Game[]) => ({
      wins: games.filter((g) => g.isWin).length,
      losses: games.filter((g) => !g.isWin).length,
    });
    const games = team?.games || [];
    return { home: tally(games.filter((g) => g.isHome)), away: tally(games.filter((g) => !g.isHome)) };
  }, [team]);

  // Stats come back in no set order, so the newest games are picked by date.
  const latestGames = useMemo(
    () => [...(team?.games || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [team],
  );

  useEffect(() => {
    let cancelled = false;
    const loadSeasonOptions = async () => {
      if (!leagueSlug) {
        setSeasonCompetitions([]);
        return;
      }

      const { data: current } = await supabase
        .from("competitions")
        .select("league_id, competition_id, name, slug, season")
        .eq("slug", leagueSlug)
        .maybeSingle();
      if (cancelled) return;
      if (!current) {
        // A private competition isn't readable by anon, but its public stats
        // still are — resolve it through the service-role branding endpoint.
        try {
          const response = await fetch(`/api/public/league-branding/${encodeURIComponent(leagueSlug)}`);
          const branding = response.ok ? await response.json() : null;
          if (cancelled) return;
          if (branding?.league_id) {
            setSeasonCompetitions([{ league_id: branding.league_id, name: branding.name, slug: branding.slug }]);
            return;
          }
        } catch (error) {
          console.error("Failed to resolve competition:", error);
        }
        if (!cancelled) setLoading(false);
        return;
      }

      let competitions: TeamSeasonCompetition[] = [current];
      if (current.competition_id) {
        try {
          const response = await fetch(`/api/league/${current.competition_id}/competitions`);
          if (response.ok) competitions = await response.json();
        } catch (error) {
          console.error("Failed to load team seasons:", error);
        }
      }
      if (!cancelled) setSeasonCompetitions(competitions);
    };

    loadSeasonOptions();
    return () => {
      cancelled = true;
    };
  }, [leagueSlug]);

  useEffect(() => {
    const fetchTeamData = async () => {
      if (!teamName || (leagueSlug && selectedLeagueIds.length === 0)) return;
      
      setLoading(true);
      try {
        const decodedTeamName = decodeURIComponent(teamName);
        const normalizedTeamName = normalizeTeamName(decodedTeamName);
        
        let leagueId: string | null = selectedLeagueIds[0] || null;
        if (leagueId) setCurrentLeagueId(leagueId);
        
        // Load this competition's schedule first. Its home/away IDs are the
        // stable identity link used to find the same club in prior seasons.
        let scheduleQuery = supabase
          .from("game_schedule")
          .select("*")
          .order("matchtime", { ascending: true });
        
        if (selectedLeagueIds.length > 0) {
          scheduleQuery = scheduleQuery.in("league_id", selectedLeagueIds);
        }

        const { data: scheduleData, error: scheduleError } = await scheduleQuery;
        // Fallback opponent names keyed by game_key, sourced from the schedule
        // (hometeam/awayteam) — used when team_stats is missing the opposing
        // team's row (common for newly-created seasons before both sides'
        // stats are imported), so we don't have to show "Unknown Opponent"
        // when the schedule already knows who was actually played.
        const scheduleOpponentByGameKey = new Map<string, string>();
        (scheduleData || []).forEach((game: any) => {
          if (!game.game_key) return;
          const normalizedHome = normalizeTeamName(game.hometeam || '');
          const opponentName = normalizedHome === normalizedTeamName ? game.awayteam : game.hometeam;
          if (opponentName) scheduleOpponentByGameKey.set(game.game_key, opponentName);
        });
        const identityGame = (scheduleData || []).find((game: any) => {
          const homeMatches = normalizeTeamName(game.hometeam || "") === normalizedTeamName;
          const awayMatches = normalizeTeamName(game.awayteam || "") === normalizedTeamName;
          return (homeMatches && game.home_team_id) || (awayMatches && game.away_team_id);
        });
        let linkedTeamId = identityGame
          ? normalizeTeamName(identityGame.hometeam || "") === normalizedTeamName
            ? identityGame.home_team_id
            : identityGame.away_team_id
          : null;
        // Schedule rows can still point at the team's id from an earlier season
        // (fixtures are created before a game is played); only trust the id if
        // it is a team in the competition being viewed.
        if (linkedTeamId && selectedLeagueIds.length > 0) {
          const { data: seasonTeam } = await supabase
            .from("teams")
            .select("team_id")
            .eq("team_id", linkedTeamId)
            .in("league_id", selectedLeagueIds)
            .limit(1);
          if (!seasonTeam || seasonTeam.length === 0) linkedTeamId = null;
        }
        if (!linkedTeamId && leagueId) {
          const { data: linkedStats } = await supabase
            .from("player_stats")
            .select("team_id, team_name")
            .eq("league_id", leagueId)
            .not("team_id", "is", null)
            .ilike("team_name", `%${normalizedTeamName}%`);
          linkedTeamId = (linkedStats || []).find((stat: any) =>
            normalizeTeamName(stat.team_name || "") === normalizedTeamName
          )?.team_id || null;
        }
        if (!linkedTeamId && leagueId) {
          const { data: currentTeams } = await supabase
            .from("teams")
            .select("team_id, name")
            .eq("league_id", leagueId);
          linkedTeamId = (currentTeams || []).find((team: any) =>
            normalizeTeamName(team.name || "") === normalizedTeamName
          )?.team_id || null;
        }

        let statsQuery = supabase
          .from("player_stats")
          .select("*, players:player_id(slug, full_name, league_id, photo_path_bg_removed, photo_path, photo_focus_y)");
        if (linkedTeamId && selectedLeagueIds.length <= 1) {
          statsQuery = statsQuery.eq("team_id", linkedTeamId);
          if (selectedLeagueIds.length === 1) {
            statsQuery = statsQuery.in("league_id", selectedLeagueIds);
          }
        } else {
          statsQuery = statsQuery
            .ilike("team_name", `%${normalizedTeamName}%`);
          if (selectedLeagueIds.length > 0) {
            statsQuery = statsQuery.in("league_id", selectedLeagueIds);
          }
        }

        let teamsQuery = supabase
          .from("teams")
          .select("description, league_id");
        if (linkedTeamId) {
          teamsQuery = teamsQuery.eq("team_id", linkedTeamId);
        } else {
          teamsQuery = teamsQuery.eq("name", normalizedTeamName);
          if (leagueId) teamsQuery = teamsQuery.eq("league_id", leagueId);
        }

        const [
          { data: allTeamStats, error: allStatsError },
          { data: teamData },
          { data: teamSocialData },
        ] = await Promise.all([
          statsQuery,
          teamsQuery.maybeSingle(),
          linkedTeamId
            ? supabase.from("teams").select("social_instagram").eq("team_id", linkedTeamId).maybeSingle()
            : supabase.from("teams").select("social_instagram").eq("name", normalizedTeamName).maybeSingle(),
        ]);

        const rawStats = linkedTeamId && selectedLeagueIds.length <= 1
          ? (allTeamStats || [])
          : (allTeamStats || []).filter(stat =>
              normalizeTeamName(stat.team_name || stat.team || "") === normalizedTeamName
            );

        if (allStatsError) {
          console.error("Error fetching player stats:", allStatsError);
          setLoading(false);
          return;
        }

        const { data: rosterNameRows } = await supabase
          .from("players")
          .select("full_name, team_name")
          .ilike("team_name", `%${normalizedTeamName}%`);
        const rosterNameAliases = buildUnambiguousFullNameAliases(
          (rosterNameRows || [])
            .filter((player: any) => normalizeTeamName(player.team_name || "") === normalizedTeamName)
            .map((player: any) => player.full_name),
        );
        const allStats = rawStats.map((stat: any) => {
          const baseName = getTeamRosterPlayerName(stat);
          return { ...stat, _resolvedPlayerName: expandUnambiguousPlayerName(baseName, rosterNameAliases) };
        });

        setPlayerStats(allStats);
        
        if (teamData?.description) {
          setTeamDescription(teamData.description);
        }
        if (teamSocialData?.social_instagram) {
          setTeamInstagramUrl(teamSocialData.social_instagram);
        }
        if (!scheduleError && scheduleData) {
          const now = new Date().getTime();
          const teamGames = scheduleData.filter((game: any) => {
            if (new Date(game.matchtime).getTime() < now) return false;
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
            const ourReb = gameData.playerStats.reduce((sum: number, stat: any) => sum + (stat.sreboundstotal || 0), 0);
            const ourAst = gameData.playerStats.reduce((sum: number, stat: any) => sum + (stat.sassists || 0), 0);
            const ourStl = gameData.playerStats.reduce((sum: number, stat: any) => sum + (stat.ssteals || 0), 0);
            const ourBlk = gameData.playerStats.reduce((sum: number, stat: any) => sum + (stat.sblocks || 0), 0);
            const ourTpm = gameData.playerStats.reduce((sum: number, stat: any) => sum + (stat.sthreepointersmade || 0), 0);

            // Get opponent and home status from team_stats data, falling back
            // to the schedule (hometeam/awayteam) when the opposing team's
            // team_stats row hasn't been imported yet.
            const opponent = gameData.opponent_name
              || scheduleOpponentByGameKey.get(gameData.game_key)
              || 'Unknown Opponent';
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
              reb: ourReb,
              ast: ourAst,
              stl: ourStl,
              blk: ourBlk,
              tpm: ourTpm,
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
            photoUrl: string | null;
            photoFocusY: number | null;
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

            const playerName = getTeamRosterPlayerName(stat);
            const playerSlug = stat.players?.slug || null;
            // Only the profile-page photo (background-removed) — never
            // photo_path, which is the separate original kept for
            // social-graphic generation. No photo there means no photo here;
            // the initials fallback covers it.
            const photoUrl = getPlayerPhotoUrlCached(
              stat.players?.photo_path_bg_removed || null
            );
            const photoFocusY = stat.players?.photo_focus_y ?? null;

            if (!playerStatsMap.has(playerId)) {
              // First time seeing this player - initialize with this stat's data
              playerStatsMap.set(playerId, {
                player_id: playerId,
                player_slug: playerSlug,
                name: playerName,
                position: stat.position || 'Player',
                photoUrl,
                photoFocusY,
                totalPoints: 0,
                totalRebounds: 0,
                totalAssists: 0,
                totalSteals: 0,
                totalBlocks: 0,
                gamesPlayed: 0
              });
            }

            const playerData = playerStatsMap.get(playerId)!;
            // A duplicate record for the same player_id might carry the photo
            // when an earlier stat row didn't (e.g. joined mid-season).
            if (!playerData.photoUrl && photoUrl) playerData.photoUrl = photoUrl;
            // Accumulate stats for this player across the games they played
            if (playedInGame(stat)) {
              playerData.totalPoints += stat.spoints || 0;
              playerData.totalRebounds += stat.sreboundstotal || 0;
              playerData.totalAssists += stat.sassists || 0;
              playerData.totalSteals += stat.ssteals || 0;
              playerData.totalBlocks += stat.sblocks || 0;
              playerData.gamesPlayed += 1;
            }
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
                if (!existingPlayer.photoUrl && player.photoUrl) {
                  existingPlayer.photoUrl = player.photoUrl;
                  existingPlayer.photoFocusY = player.photoFocusY;
                }
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
          
          const rosterWithStats: PlayerStat[] = Array.from(mergedByName.values()).filter((player) => player.gamesPlayed > 0).map((player) => {
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
              photoUrl: player.photoUrl,
              photoFocusY: player.photoFocusY,
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
          
          // Get league info and check ownership. Prefer the competition that
          // actually matches the URL's slug (already fetched into
          // seasonCompetitions) over re-deriving from allStats[0].league_id —
          // when a team's "season" bucket merges multiple sibling league_ids
          // (see buildTeamSeasonOptions), allStats[0] can belong to a private
          // sibling league that anon can't re-query, leaving league stuck
          // null even though the public, URL-intended competition is known.
          let league: League | null = null;
          const matchedCompetition = leagueSlug
            ? seasonCompetitions.find(c => c.slug === leagueSlug)
            : null;
          if (matchedCompetition) {
            league = {
              league_id: matchedCompetition.league_id,
              name: matchedCompetition.name || '',
              slug: matchedCompetition.slug || leagueSlug || '',
            };
          }
          const leagueIdForOwnership = matchedCompetition?.league_id || allStats[0]?.league_id;
          if (leagueIdForOwnership) {
            const { data: leagueData } = await supabase
              .from("competitions")
              .select("*")
              .eq("league_id", leagueIdForOwnership)
              .single();
            if (leagueData) {
              if (!league) league = leagueData as League;
              if (user) setIsOwner(user.id === leagueData.user_id || user.id === leagueData.created_by);
            }
          }

          setTeam({
            name: decodedTeamName,
            roster: rosterWithStats,
            topPlayer,
            recentGames,
            games,
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
  }, [teamName, leagueSlug, selectedLeagueIds.join(",")]);

  if (loading) {
    return (
      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
        <SiteHeader />
        <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">
          <div className="ch-skel h-56 md:h-64 rounded-[14px]" />
          <div className="ch-skel h-10 w-2/3 rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="ch-skel h-72 rounded-[14px]" />
            <div className="ch-skel h-72 rounded-[14px] lg:col-span-2" />
          </div>
        </main>
      </div>
    );
  }

  if (!team) {
    return (
      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
        <SiteHeader />
        <main className="max-w-xl mx-auto px-4 py-16">
          <div className="ch-card p-10 text-center">
            <h1 className="ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2rem] text-[color:var(--ch-text)] mb-2">Team not found</h1>
            <p className="text-sm text-[color:var(--ch-text-2)] mb-6">The team you're looking for doesn't exist or has no data.</p>
            <button onClick={() => navigate("/")} className="ch-btn ch-btn-primary h-10 px-5">Go home</button>
          </div>
        </main>
      </div>
    );
  }

  // The name people search for ("Gloucester City Kings", not "…Senior Men I")
  // and a plain-English line about the season — the same text the server
  // renders for this page (shared/recaps.ts).
  const teamDisplayName = teamPage?.name || team.name;
  // A season played under an old name ("Manchester Giants", 2022-23) reads as it was, with
  // today's club underneath; the page, its title and links stay today's club.
  const seasonTeamName = pageCompetition?.teamName && isFormerName(pageCompetition.teamName)
    ? clubDisplayName(pageCompetition.teamName)
    : null;
  const headingName = seasonTeamName || teamDisplayName;
  const scoredGames = team.games.filter((g) => g.opponentScore != null);
  // An older season reads in the past tense: "finished with", "led the team".
  const seasonFinished = isFinishedCompetition({
    name: team.league?.name || pageCompetition?.name || currentCompetition?.name,
    season: currentCompetition?.season,
    lastPlayed: latestGames[0]?.date || pageCompetition?.lastPlayed,
    hasUpcoming: upcomingGames.length > 0,
  });
  const seasonSummary = teamSeasonSummary({
    finished: seasonFinished,
    team: headingName,
    competition: team.league?.name || pageCompetition?.name,
    wins: team.wins,
    losses: team.losses,
    ppg: scoredGames.length ? scoredGames.reduce((n, g) => n + g.totalPoints, 0) / scoredGames.length : null,
    oppPpg: scoredGames.length ? scoredGames.reduce((n, g) => n + (g.opponentScore || 0), 0) / scoredGames.length : null,
    topScorer: team.topPlayer ? { name: team.topPlayer.name, ppg: team.topPlayer.avgPoints } : null,
  });

  return (
    <>
      <Helmet>
        <title>{teamSeoTitle(teamDisplayName)}</title>
        <meta
          name="description"
          content={
            teamDescription || seasonSummary || teamSeoDescription(teamDisplayName, team.league?.name)
          }
        />
        <meta
          property="og:title"
          content={teamSeoTitle(teamDisplayName)}
        />
        <meta
          property="og:description"
          content={
            teamDescription || seasonSummary || teamSeoDescription(teamDisplayName, team.league?.name)
          }
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content={leagueSlug 
            ? `https://swishassistant.com/competition/${leagueSlug}/team/${encodeURIComponent(team.name.toLowerCase().replace(/\s+/g, '-'))}`
            : `https://swishassistant.com/team/${encodeURIComponent(team.name.toLowerCase().replace(/\s+/g, '-'))}`}
        />
        <meta
          property="og:image"
          content="https://swishassistant.com/og-image.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={teamSeoTitle(teamDisplayName)} />
        <meta
          name="twitter:description"
          content={
            teamDescription || seasonSummary || teamSeoDescription(teamDisplayName, team.league?.name)
          }
        />
        {/* One permanent page per team side, whichever season is open — the
            same canonical the server renders (server/publicSeo.ts). */}
        <link rel="canonical" href={`https://swishassistant.com/team/${permanentSlug}`} />
      </Helmet>
      
      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`} style={{ '--ch-accent': readablePrimary.body } as React.CSSProperties}>
      <SiteHeader />

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-7">
        {team.league && (
          <Link
            href={`/competition/${team.league.slug}`}
            className="inline-flex items-center gap-1.5 mb-3 text-[13px] font-medium text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> {team.league.name}
          </Link>
        )}

        {/* Team hero, in the team's colours */}
        {(() => {
          const heroColor = primaryColor || "#f97316";
          const heroText = teamBranding?.textContrast || "#ffffff";
          const onLight = heroText.toLowerCase() === "#000000";
          const glass = onLight
            ? "bg-black/[0.07] hover:bg-black/[0.12] border-black/10"
            : "bg-white/[0.12] hover:bg-white/20 border-white/20";
          return (
            <section
              className="ch-hero ch-rise"
              style={{
                background: `radial-gradient(120% 140% at 85% 0%, color-mix(in srgb, ${heroColor} 80%, #fff) 0%, ${heroColor} 45%, color-mix(in srgb, ${heroColor} 50%, #000) 100%)`,
                color: heroText,
              }}
              aria-label={`${team.name} profile`}
            >
              <svg aria-hidden="true" viewBox="0 0 200 80" preserveAspectRatio="xMaxYMid slice" className="absolute inset-0 h-full w-full pointer-events-none" fill="none" stroke={onLight ? "black" : "white"} strokeWidth="0.5" style={{ opacity: onLight ? 0.08 : 0.12 }}>
                <circle cx="150" cy="-4" r="30" />
                <path d="M 118 0 V 22 A 32 32 0 0 0 182 22 V 0" />
                <rect x="138" y="0" width="24" height="30" />
              </svg>
              <div className="relative p-5 md:p-8 flex flex-col md:flex-row md:items-end gap-5 md:gap-7">
                <div className="h-24 w-24 md:h-28 md:w-28 rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.55)] flex items-center justify-center shrink-0 overflow-hidden">
                  <TeamLogo
                    teamName={team.name}
                    leagueId={team.league?.league_id || ''}
                    extraLeagueIds={siblingLeagueIds}
                    size="xl"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {team.league && (
                    <div className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.14em]" style={{ opacity: 0.75 }}>
                      {team.league.name}
                    </div>
                  )}
                  <h1 className="ch-display uppercase font-bold leading-[0.92] tracking-tight break-words text-[2rem] sm:text-[2.6rem] md:text-[3.4rem] mt-1">
                    {headingName}
                  </h1>
                  {seasonTeamName && seasonTeamName !== teamDisplayName && (
                    <div className="mt-1 text-sm font-semibold" style={{ opacity: 0.8 }}>Now {teamDisplayName}</div>
                  )}
                  {seasonSummary && (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ opacity: 0.85 }} data-testid="team-season-summary">
                      {seasonSummary}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {[
                      { label: "Players", value: team.roster.length },
                      { label: "Games", value: team.totalGames },
                      { label: "PPG", value: team.avgTeamPoints },
                    ].map((pill) => (
                      <span key={pill.label} className={`inline-flex items-baseline gap-1.5 h-7 px-2.5 rounded-lg border text-xs ${glass}`}>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ opacity: 0.7 }}>{pill.label}</span>
                        <span className="font-bold tabular-nums">{pill.value}</span>
                      </span>
                    ))}
                    {teamInstagramUrl && (
                      <a
                        href={teamInstagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${glass}`}
                      >
                        <Instagram className="h-3.5 w-3.5" />
                        Instagram
                      </a>
                    )}
                    <AdminCoachViewLink
                      teamName={team.name}
                      leagueIds={[...selectedLeagueIds, team.league?.league_id, currentLeagueId]}
                      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${glass}`}
                    />
                  </div>
                </div>
                {competitionOptions.length > 1 && (
                  <div className="w-full md:w-[300px] shrink-0">
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ opacity: 0.75 }}>
                      Competition
                    </label>
                    <Select
                      value={leagueSlug}
                      onValueChange={(slug) => {
                        // Stay on the permanent page; the competition is a query parameter.
                        if (slug !== leagueSlug) navigate(`/team/${permanentSlug}?competition=${encodeURIComponent(slug)}`);
                      }}
                    >
                      <SelectTrigger className="h-10 rounded-lg bg-white/95 border-white/40 text-slate-900" data-testid="select-team-competition">
                        <SelectValue placeholder="Select competition" />
                      </SelectTrigger>
                      <SelectContent>
                        {competitionOptions.map(option => (
                          <SelectItem key={option.slug} value={option.slug}>
                            {option.name}{option.record ? ` (${option.record})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </section>
          );
        })()}

        {/* Section tabs, as on league and player pages */}
        <div className="mt-4 md:mt-5 mb-5 md:mb-6 border-b border-[color:var(--ch-border)]">
          <nav className="flex items-stretch gap-1 overflow-x-auto scrollbar-hide -mx-1" aria-label="Team sections">
            {([
              { key: 'overview', label: 'Overview', icon: LayoutDashboard },
              { key: 'playerStats', label: 'Player Stats', icon: BarChart3 },
              { key: 'teamStats', label: 'Team Stats', icon: Shield },
              { key: 'shotChart', label: 'Shot Chart', icon: Crosshair },
              ...(lineupsSlug ? [{ key: 'lineups', label: 'Lineups', icon: Users }] : []),
              ...(lineupsSlug && plus.visible ? [{ key: 'clutch', label: 'Clutch', icon: Timer }] : []),
              { key: 'accolades', label: 'Accolades', icon: Award },
            ] as { key: typeof activeStatsTab; label: string; icon: typeof LayoutDashboard }[]).map((tab) => {
              const active = activeStatsTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={(e) => {
                    setActiveStatsTab(tab.key);
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-2 h-12 px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
                    active ? 'text-[color:var(--ch-text)]' : 'text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]'
                  }`}
                >
                  <tab.icon className="w-4 h-4" style={active ? { color: readablePrimary.body } : undefined} />
                  {tab.label}
                  <span
                    className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full transition-opacity"
                    style={{ backgroundColor: readablePrimary.accent, opacity: active ? 1 : 0 }}
                  />
                </button>
              );
            })}
          </nav>
        </div>

        {/* Overview Tab */}
        {activeStatsTab === 'overview' && (
        <div className="space-y-10">
          {(teamDescription || isOwner) && (
            <div className="max-w-3xl">
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
          )}

          {/* Two columns sharing their lines: each pair of sections starts and
              ends level, and the rows inside them sit at the same height. */}
          {teamAggregateStats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-10">
              <section className="flex flex-col min-w-0">
                <h2 className="ch-section-title mb-4">Season Averages</h2>
                <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-x-6 gap-y-5">
                  {[
                    { label: 'PTS', field: 'spoints' },
                    { label: 'REB', field: 'sreboundstotal' },
                    { label: 'AST', field: 'sassists' },
                    { label: 'STL', field: 'ssteals' },
                    { label: 'BLK', field: 'sblocks' },
                    { label: 'TO', field: 'sturnovers' },
                  ].map(({ label, field }) => (
                    <FlatStat key={label} label={label} value={(teamAggregateStats.perGame[field] || 0).toFixed(1)} />
                  ))}
                </div>
              </section>

              {team.topPlayer && (
                <section className="flex flex-col min-w-0">
                  <h2 className="ch-section-title mb-4">Star Player</h2>
                  <div
                    className="flex-1 grid grid-rows-2 gap-y-5 cursor-pointer"
                    onClick={() => {
                      const identifier = team.topPlayer.player_slug || team.topPlayer.player_id;
                      if (identifier) navigate(`/player/${identifier}`);
                    }}
                    data-testid={`player-card-${team.topPlayer.player_id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {team.topPlayer.photoUrl ? (
                        <PlayerHeadshot
                          src={team.topPlayer.photoUrl}
                          alt={team.topPlayer.name}
                          loading="lazy"
                          className="w-12 h-12 rounded-full object-cover flex-shrink-0 bg-slate-200 dark:bg-neutral-700"
                          fallbackStyle={{ objectPosition: `center ${team.topPlayer.photoFocusY ?? 50}%` }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                            (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.removeProperty("display");
                          }}
                        />
                      ) : null}
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
                        style={{
                          backgroundColor: primaryColor,
                          color: teamBranding?.textContrast || '#ffffff',
                          display: team.topPlayer.photoUrl ? "none" : undefined,
                        }}
                      >
                        {team.topPlayer.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        {(() => {
                          const identifier = team.topPlayer.player_slug || team.topPlayer.player_id;
                          return identifier ? (
                            <Link href={`/player/${encodeURIComponent(identifier)}`} className="block truncate text-lg md:text-xl font-bold leading-tight text-[color:var(--ch-text)] hover:underline">
                              {team.topPlayer.name}
                            </Link>
                          ) : (
                            <h3 className="truncate text-lg md:text-xl font-bold leading-tight text-[color:var(--ch-text)]">{team.topPlayer.name}</h3>
                          );
                        })()}
                        <p className="truncate mt-0.5 text-xs md:text-sm text-[color:var(--ch-text-2)]">
                          {[team.topPlayer.position, `${team.topPlayer.gamesPlayed} games`, `${team.topPlayer.totalPoints} pts`].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-x-6">
                      <FlatStat label="PPG" value={Number(team.topPlayer.avgPoints).toFixed(1)} />
                      <FlatStat label="RPG" value={Number(team.topPlayer.avgRebounds).toFixed(1)} />
                      <FlatStat label="APG" value={Number(team.topPlayer.avgAssists).toFixed(1)} />
                    </div>
                  </div>
                </section>
              )}

              <section className="min-w-0">
                <h2 className="ch-section-title mb-4">Shooting</h2>
                <div className="grid grid-cols-3 gap-x-6">
                  {[
                    { label: 'FG%', made: 'sfieldgoalsmade', attempted: 'sfieldgoalsattempted' },
                    { label: '3P%', made: 'sthreepointersmade', attempted: 'sthreepointersattempted' },
                    { label: 'FT%', made: 'sfreethrowsmade', attempted: 'sfreethrowsattempted' },
                  ].map(({ label, made, attempted }) => {
                    const { totals } = teamAggregateStats;
                    const percent = totals[attempted] > 0 ? (totals[made] / totals[attempted]) * 100 : 0;
                    return (
                      <FlatStat key={label} label={label} value={`${percent.toFixed(1)}%`}>
                        <StatBar percent={percent} color={readablePrimary.accent} />
                      </FlatStat>
                    );
                  })}
                </div>
              </section>

              <section className="min-w-0">
                <h2 className="ch-section-title mb-4">Record</h2>
                <div className="grid grid-cols-3 gap-x-6">
                  {[
                    { label: 'Overall', wins: team.wins, losses: team.losses, testId: 'team-record' },
                    { label: 'Home', ...homeAwayRecord.home },
                    { label: 'Away', ...homeAwayRecord.away },
                  ].map(({ label, wins, losses, testId }) => (
                    <FlatStat key={label} label={label} value={<span data-testid={testId}>{wins}-{losses}</span>}>
                      <StatBar percent={wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0} color={readablePrimary.accent} />
                    </FlatStat>
                  ))}
                </div>
              </section>
            </div>
          )}

          {teamAccolades.length > 0 && (
            <section>
              <h2 className="ch-section-title mb-1">Accolades</h2>
              <AccoladeBadges accolades={topAccolades(teamAccolades)} accentColor={readablePrimary.body} />
            </section>
          )}

          {team.roster.length > 0 && (
          <section>
            <h2 className="ch-section-title mb-4">Roster</h2>
            <div className="overflow-x-auto">
              <table className="ch-table ch-table-flat w-full text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--ch-border-strong)]">
                    <th className="text-left py-2 md:py-3 px-2 font-semibold">Player</th>
                    <th className="hidden md:table-cell text-right py-3 px-2 font-semibold">GP</th>
                    <th className="text-right py-2 md:py-3 px-2 font-semibold">PPG</th>
                    <th className="text-right py-2 md:py-3 px-2 font-semibold">RPG</th>
                    <th className="hidden md:table-cell text-right py-3 px-2 font-semibold">APG</th>
                  </tr>
                </thead>
                <tbody>
                  {team.roster.map((player: PlayerStat) => (
                    <tr
                      key={player.player_id || player.name}
                      onClick={() => {
                        const identifier = player.player_slug || player.player_id;
                        if (identifier) navigate(`/player/${identifier}`);
                      }}
                      data-testid={`player-card-${player.player_id}`}
                      className="border-b border-[color:var(--ch-border)] cursor-pointer"
                    >
                      <td className="py-2 md:py-3 px-2">
                        <div className="flex items-center gap-2">
                          <PlayerAvatarThumb
                            photoUrl={player.photoUrl}
                            name={player.name}
                            size="w-6 h-6 md:w-8 md:h-8"
                            fallbackClassName="text-xs"
                            fallbackStyle={{ backgroundColor: primaryColor, color: teamBranding?.textContrast || '#ffffff' }}
                          />
                          {(() => {
                            const identifier = player.player_slug || player.player_id;
                            return identifier ? (
                              <Link href={`/player/${encodeURIComponent(identifier)}`} className="font-medium text-[color:var(--ch-text)] hover:underline">
                                {player.name}
                              </Link>
                            ) : (
                              <span className="font-medium text-[color:var(--ch-text)]">{player.name}</span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="hidden md:table-cell py-3 px-2 text-right tabular-nums text-[color:var(--ch-text-2)]">{player.gamesPlayed}</td>
                      <td className="py-2 md:py-3 px-2 text-right tabular-nums font-semibold text-[color:var(--ch-text)]">{Number(player.avgPoints).toFixed(1)}</td>
                      <td className="py-2 md:py-3 px-2 text-right tabular-nums text-[color:var(--ch-text-2)]">{Number(player.avgRebounds).toFixed(1)}</td>
                      <td className="hidden md:table-cell py-3 px-2 text-right tabular-nums text-[color:var(--ch-text-2)]">{Number(player.avgAssists).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          )}

          {(latestGames.length > 0 || upcomingGames.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-10">
              {latestGames.length > 0 && (
                <section className={`min-w-0 ${upcomingGames.length === 0 ? 'lg:col-span-2' : ''}`}>
                  <h2 className="ch-section-title mb-4">Recent Games</h2>
                  <div className="border-t border-[color:var(--ch-border-strong)]">
                    {/* Next to the schedule, the same number of rows so both lists end level */}
                    {latestGames.slice(0, upcomingGames.length > 0 ? 5 : 8).map((game: Game, index: number) => (
                      <div
                        key={index}
                        onClick={() => {
                          if (game.game_key) {
                            setSelectedGameId(game.game_key);
                            setIsGameModalOpen(true);
                          }
                        }}
                        data-testid={`recent-game-${index}`}
                        className="flex items-center justify-between gap-4 py-3 border-b border-[color:var(--ch-border)] cursor-pointer hover:bg-[color:var(--ch-surface-2)] transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-[color:var(--ch-text)] text-sm md:text-base">
                            {game.isHome ? 'vs' : '@'}{' '}
                            {game.game_key ? (
                              <EntityLink
                                href={gamePath(leagueSlug, game.game_key)}
                                onNavigate={() => { setSelectedGameId(game.game_key!); setIsGameModalOpen(true); }}
                                className="hover:underline underline-offset-2"
                              >
                                {game.opponent}
                              </EntityLink>
                            ) : game.opponent}
                          </div>
                          <div className="text-xs md:text-sm text-[color:var(--ch-text-2)] mt-0.5 tabular-nums">
                            Final: <span className="font-semibold text-[color:var(--ch-text)]">{game.totalPoints} - {game.opponentScore}</span>
                          </div>
                        </div>
                        {game.isWin !== undefined && (
                          <span className={`text-sm font-bold ${game.isWin ? 'text-[color:var(--ch-win)]' : 'text-[color:var(--ch-loss)]'}`}>
                            {game.isWin ? 'W' : 'L'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {upcomingGames.length > 0 && (
                <section className={`min-w-0 ${latestGames.length === 0 ? 'lg:col-span-2' : ''}`}>
                  <h2 className="ch-section-title mb-4">Upcoming</h2>
                  <div className="border-t border-[color:var(--ch-border-strong)]">
                    {upcomingGames.map((game: UpcomingGame, index: number) => (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-4 py-3 border-b border-[color:var(--ch-border)]"
                        data-testid={`upcoming-game-${index}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-[color:var(--ch-text)] text-sm md:text-base">
                            {game.isHome ? 'vs' : '@'}{' '}
                            <EntityLink href={teamPath(game.opponent, leagueSlug)} className="hover:underline underline-offset-2">
                              {game.opponent}
                            </EntityLink>
                          </div>
                          <div className="text-xs md:text-sm text-[color:var(--ch-text-2)] mt-0.5">
                            {new Date(game.matchtime).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'UTC'
                            })}
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ch-text-2)]">
                          {game.isHome ? 'Home' : 'Away'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
        )}

        {activeStatsTab === 'playerStats' && (
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-4">
              <h2 className="ch-section-title">Player Statistics</h2>
              <div className="text-xs md:text-sm text-[color:var(--ch-text-2)]">
                {filteredPlayerAverages.length} players
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 md:items-end gap-4 mb-6">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search players..."
                  value={statsSearch}
                  onChange={(e) => setStatsSearch(e.target.value)}
                  className="w-full h-10 px-4 pl-10 border border-[color:var(--ch-border-strong)] rounded-lg focus:ring-2 focus:ring-[color:var(--ch-accent)] focus:border-transparent bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] placeholder:text-[color:var(--ch-muted)]"
                />
                <svg className="absolute left-3 top-3 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--ch-text-2)] mb-1.5">Stat Category</label>
                <Select value={playerStatsCategory} onValueChange={(value) => setPlayerStatsCategory(value as any)}>
                  <SelectTrigger className="w-full bg-[color:var(--ch-surface)] border-slate-200 dark:border-neutral-600">
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
              <div>
                <label className="block text-xs font-medium text-[color:var(--ch-text-2)] mb-1.5">Mode</label>
                <Select value={playerStatsView} onValueChange={(value) => setPlayerStatsView(value as any)}>
                  <SelectTrigger className="w-full bg-[color:var(--ch-surface)] border-slate-200 dark:border-neutral-600">
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
              <>
              <div className="overflow-x-auto">
                <table className="ch-table ch-table-flat w-full text-xs md:text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--ch-border-strong)]">
                      <th className="text-left py-2 md:py-3 px-2 font-semibold sticky left-0 bg-[color:var(--ch-bg)] z-10 min-w-[100px] md:min-w-[140px]">Player</th>
                      <th
                        onClick={() => {
                          if (statsSortColumn === 'GP') setStatsSortDirection(statsSortDirection === 'desc' ? 'asc' : 'desc');
                          else { setStatsSortColumn('GP'); setStatsSortDirection('desc'); }
                        }}
                        style={statsSortColumn === 'GP' ? { color: readablePrimary.body } : undefined}
                        className="text-center py-2 md:py-3 px-2 font-semibold min-w-[44px] cursor-pointer hover:bg-[color:var(--ch-surface-3)] transition-colors"
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
                          style={statsSortColumn === column.label ? { color: readablePrimary.body } : undefined}
                          className="text-center py-2 md:py-3 px-2 font-semibold min-w-[44px] cursor-pointer hover:bg-[color:var(--ch-surface-3)] transition-colors"
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
                        className={`group border-b border-[color:var(--ch-border)] transition-colors ${player.slug ? 'cursor-pointer' : ''}`}
                        onClick={() => { if (player.slug) navigate(`/player/${player.slug}`); }}
                      >
                        <td className="py-2 md:py-3 px-2 font-medium text-[color:var(--ch-text)] sticky left-0 bg-[color:var(--ch-bg)] group-hover:bg-[color:var(--ch-surface-2)] transition-colors z-10">
                          <div className="flex items-center gap-2 min-w-0">
                            <PlayerAvatarThumb
                              photoUrl={player.photoUrl}
                              name={player.name}
                              fallbackClassName="text-[10px] md:text-xs bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]"
                            />
                            {player.slug ? (
                              <Link href={`/player/${encodeURIComponent(player.slug)}`} className="font-medium text-[color:var(--ch-text)] text-xs md:text-sm truncate hover:underline">
                                {player.name}
                              </Link>
                            ) : (
                              <div className="font-medium text-[color:var(--ch-text)] text-xs md:text-sm truncate">{player.name}</div>
                            )}
                          </div>
                        </td>
                        <td className="py-2 md:py-3 px-2 text-center text-[color:var(--ch-text-2)] font-medium">{player.games}</td>
                        {activePlayerStatColumns.map((column) => {
                          const rawStats = player.rawStats || [];
                          const rateStats = [
                            'efg_percent', 'ts_percent', 'three_point_rate',
                            'ast_percent', 'ast_to_ratio', 'oreb_percent', 'dreb_percent', 'reb_percent',
                            'tov_percent', 'usage_percent', 'pie', 'off_rating', 'def_rating', 'net_rating',
                            'pts_percent_2pt', 'pts_percent_3pt', 'pts_percent_ft',
                            'pts_percent_midrange', 'pts_percent_pitp', 'pts_percent_fastbreak',
                            'pts_percent_second_chance', 'pts_percent_off_turnovers',
                            'sfieldgoalspercentage', 'sthreepointerspercentage', 'sfreethrowspercentage'
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
                            <td key={`${player.id}-${column.key}`} className="py-2 md:py-3 px-2 text-center text-[color:var(--ch-text-2)]">
                              {displayValue}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden mt-2 text-xs text-[color:var(--ch-text-2)]">
                ← Swipe to see all stats →
              </div>
              </>
            ) : (
              <div className="text-sm text-[color:var(--ch-text-2)]">No player statistics available</div>
            )}

            {filteredPlayerAverages.length > 0 && (
              <div className="mt-6">
                <div className="text-xs text-[color:var(--ch-text-2)] space-y-1">
                  <div className="font-semibold text-[color:var(--ch-text-2)] mb-2">Legend ({playerStatsCategory}):</div>
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

        {activeStatsTab === 'shotChart' && (
          <TeamShotChartSection
            teamName={team.name}
            leagueId={team.league?.league_id || currentLeagueId || ''}
            recentGames={team.recentGames}
            shotChartRange={shotChartRange}
            setShotChartRange={setShotChartRange}
          />
        )}

        {activeStatsTab === 'lineups' && lineupsSlug && (
          <TeamLineupsPanel
            slug={lineupsSlug}
            teamName={team.name}
            accentColor={readablePrimary.body}
            teamRgb={teamBranding?.primaryRgb}
          />
        )}

        {activeStatsTab === 'clutch' && lineupsSlug && (
          <TeamClutchPanel slug={lineupsSlug} teamName={team.name} accentColor={readablePrimary.body} />
        )}

        {activeStatsTab === 'teamStats' && (
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-5">
              <h2 className="ch-section-title">Team Statistics</h2>
              {teamAggregateStats && (
                <div className="text-xs md:text-sm text-[color:var(--ch-text-2)]">
                  {teamAggregateStats.gamesPlayed} games
                </div>
              )}
            </div>

            {teamAggregateStats ? (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-x-6 gap-y-6">
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
                  <FlatStat key={stat.label} label={stat.label} value={stat.value} />
                ))}
              </div>
            ) : (
              <div className="text-sm text-[color:var(--ch-text-2)]">No team statistics available</div>
            )}
          </div>
        )}

        {activeStatsTab === 'accolades' && (
          <div>
            <h2 className="ch-section-title mb-1">Accolades</h2>
            {teamAccolades.length > 0 ? (
              <AccoladeBadges accolades={teamAccolades} accentColor={readablePrimary.body} />
            ) : (
              <div className="mt-3 text-sm text-[color:var(--ch-text-2)]">No accolades yet</div>
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