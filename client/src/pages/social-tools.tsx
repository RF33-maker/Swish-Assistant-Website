import { useLocation } from "wouter";
import { ArrowLeft, Download, Trophy, Loader2, Filter, Search, ChevronDown, ChevronUp, RefreshCw, AlertTriangle, ImagePlus, X, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { PlayerPhotoUploader } from "@/components/social/PlayerPhotoUploader";
import { PlayerIdentityManager } from "@/components/social/PlayerIdentityManager";
import { PostQueueSection } from "@/components/social/PostQueueSection";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ScrollArea } from "@/components/ui/scroll-area";
import { normalizeTeamName } from "@/lib/teamUtils";
import { fetchLeagueChildren } from "@/lib/leagueChildren";
import { generateMaskedPhoto } from "@/lib/photoMasking";
import { renderSocialCardToBlob } from "@/lib/socialCardCapture";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CompetitionOption {
  league_id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  is_public?: boolean | null;
  parent_league_id?: string | null;
  competition_id?: string | null;
  season?: string | null;
  created_at?: string | null;
  brand_id: string;
  latest_activity: number;
}

interface LeagueBrand {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  latest_activity: number;
  is_legacy?: boolean;
}

const ALL_FILTER_VALUE = "all";
const LEGACY_LEAGUE_ID = "legacy-unassigned";

function activityTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

const competitionFamilyCache = new Map<string, Promise<string[]>>();

async function collectCompetitionFamilyIds(
  rootCompetitionId: string,
  competitions: CompetitionOption[],
): Promise<string[]> {
  const cached = competitionFamilyCache.get(rootCompetitionId);
  if (cached) return cached;

  const childrenByParent = new Map<string, string[]>();
  competitions.forEach((competition) => {
    if (!competition.parent_league_id) return;
    const children = childrenByParent.get(competition.parent_league_id) || [];
    children.push(competition.league_id);
    childrenByParent.set(competition.parent_league_id, children);
  });

  const request = (async () => {
    const familyIds: string[] = [];
    const visited = new Set<string>();
    const pending = [rootCompetitionId];

    while (pending.length > 0) {
      const competitionId = pending.shift();
      if (!competitionId || visited.has(competitionId)) continue;
      visited.add(competitionId);
      familyIds.push(competitionId);

      const serverChildren = await fetchLeagueChildren(competitionId);
      const childIds = new Set([
        ...(childrenByParent.get(competitionId) || []),
        ...serverChildren.map((child) => child.league_id),
      ]);
      pending.push(...childIds);
    }

    return familyIds;
  })();

  competitionFamilyCache.set(rootCompetitionId, request);
  return request;
}

function resolveVisibleCompetition(
  competition: CompetitionOption,
  competitionById: Map<string, CompetitionOption>,
): CompetitionOption {
  if (competition.is_public !== false) return competition;

  const visited = new Set<string>([competition.league_id]);
  let current = competition;

  while (current.parent_league_id && !visited.has(current.parent_league_id)) {
    visited.add(current.parent_league_id);
    const parent = competitionById.get(current.parent_league_id);
    if (!parent) break;
    if (parent.is_public !== false) return parent;
    current = parent;
  }

  return competition;
}

async function resolvePerformanceCompetition(
  performance: TopPerformance,
  competitionById: Map<string, CompetitionOption>,
): Promise<CompetitionOption | undefined> {
  const displayId = performance.display_competition_id || performance.league_id;
  if (!displayId) return undefined;

  const knownCompetition = competitionById.get(displayId);
  if (knownCompetition) {
    return resolveVisibleCompetition(knownCompetition, competitionById);
  }

  const visited = new Set<string>();
  let currentId: string | null = displayId;

  try {
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const response = await fetch("/api/public/league-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [currentId] }),
      });
      if (!response.ok) return undefined;

      const metadata = await response.json() as Record<
        string,
        { parent_league_id?: string | null }
      >;
      const parentId = metadata[currentId]?.parent_league_id;
      if (!parentId) return undefined;

      const parent = competitionById.get(parentId);
      if (parent) return resolveVisibleCompetition(parent, competitionById);
      currentId = parentId;
    }
  } catch (error) {
    console.warn("[SocialTools] Could not resolve hidden competition parent:", error);
  }

  return undefined;
}

type SponsorLogo = {
  id: string;
  name: string;
  url: string;
};

interface TopPerformance {
  id: string;
  player_id?: string;
  player_name: string;
  player_photo_path?: string | null;
  team: string;
  opponent: string;
  sminutes?: string;
  spoints: number;
  sreboundstotal: number;
  sassists: number;
  ssteals?: number;
  sblocks?: number;
  sfieldgoalsmade?: number;
  sfieldgoalsattempted?: number;
  sthreepointersmade?: number;
  sthreepointersattempted?: number;
  sfreethrowsmade?: number;
  sfreethrowsattempted?: number;
  sturnovers?: number;
  splusminuspoints?: number;
  game_key?: string;
  numeric_id?: string;
  player_team_score: number;
  opponent_score: number;
  league_id?: string;
  display_competition_id?: string;
}

const defaultData: PlayerPerformanceV1Data = {
  player_name: "Select a Performance",
  team_name: "Team Name",
  opponent_name: "Opponent",
  minutes: 0,
  points: 0,
  rebounds: 0,
  assists: 0,
  steals: 0,
  blocks: 0,
  fg: "0/0",
  three_pt: "0/0",
  ft: "0/0",
  turnovers: 0,
  ts_percent: "0.0",
  plus_minus: "0",
  home_score: 0,
  away_score: 0,
  didWin: false,
  home_logo_url: "",
  away_logo_url: "",
  photo_url: "",
};

async function buildPlayerPerformanceCardData(
  perf: TopPerformance,
  competition?: CompetitionOption,
  brand?: LeagueBrand,
): Promise<PlayerPerformanceV1Data> {
  const fgMade = perf.sfieldgoalsmade ?? 0;
  const fgAtt = perf.sfieldgoalsattempted ?? 0;
  const threeMade = perf.sthreepointersmade ?? 0;
  const threeAtt = perf.sthreepointersattempted ?? 0;
  const ftMade = perf.sfreethrowsmade ?? 0;
  const ftAtt = perf.sfreethrowsattempted ?? 0;
  
  const tsa = fgAtt + 0.44 * ftAtt;
  const tsPercent = tsa > 0 ? ((perf.spoints / (2 * tsa)) * 100).toFixed(1) : "0.0";
  
  const plusMinus = perf.splusminuspoints !== undefined && perf.splusminuspoints !== null
    ? (perf.splusminuspoints >= 0 ? `+${perf.splusminuspoints}` : `${perf.splusminuspoints}`)
    : "0";

  const minutes = perf.sminutes ? parseInt(perf.sminutes.split(':')[0]) || 0 : 0;

  const leagueId = perf.league_id || '';
  const displayCompetitionId = perf.display_competition_id || leagueId;
  const extraLeagueIds = displayCompetitionId !== leagueId ? [displayCompetitionId] : undefined;
  const [playerTeamLogo, opponentLogo] = await Promise.all([
    getTeamLogoCached({ leagueId, teamName: perf.team, extraLeagueIds }),
    getTeamLogoCached({ leagueId, teamName: perf.opponent, extraLeagueIds }),
  ]);

  let leagueName = competition?.name || "";
  let leagueLogoUrl = competition?.logo_url || brand?.logo_url || "";
  if (leagueId && !competition) {
    const { data: leagueData } = await supabase
      .from("competitions")
      .select("name, logo_url, competition_id")
      .eq("league_id", leagueId)
      .maybeSingle();

    leagueName = leagueData?.name || "";
    leagueLogoUrl = leagueData?.logo_url || "";

    if (!leagueLogoUrl && leagueData?.competition_id) {
      const { data: parentData } = await supabase
        .from("leagues")
        .select("logo_url")
        .eq("id", leagueData.competition_id)
        .maybeSingle();
      leagueLogoUrl = parentData?.logo_url || "";
    }
  }

  let playerPhotoUrl = "";
  let photoFocusY = 50;
  
  if (perf.player_photo_path) {
    const { data: photoData } = supabase.storage
      .from("player-photos")
      .getPublicUrl(perf.player_photo_path);
    playerPhotoUrl = photoData.publicUrl;
  } else if (perf.player_id) {
    const { data: photoList } = await supabase.storage
      .from("player-photos")
      .list(perf.player_id);
    
    if (photoList && photoList.length > 0) {
      const { data: photoData } = supabase.storage
        .from("player-photos")
        .getPublicUrl(`${perf.player_id}/${photoList[0].name}`);
      playerPhotoUrl = photoData.publicUrl;
    }
  }

  if (perf.player_id) {
    const { data: playerData } = await supabase
      .from("players")
      .select("photo_focus_y")
      .eq("id", perf.player_id)
      .single();
    if (playerData?.photo_focus_y !== undefined && playerData?.photo_focus_y !== null) {
      photoFocusY = playerData.photo_focus_y;
    }
  }

  let maskedPhotoUrl = playerPhotoUrl;
  if (playerPhotoUrl) {
    try {
      maskedPhotoUrl = await generateMaskedPhoto(playerPhotoUrl, photoFocusY);
    } catch (error) {
      console.error("Failed to mask photo, using original:", error);
    }
  }

  return {
    player_name: perf.player_name,
    team_name: perf.team,
    opponent_name: perf.opponent,
    minutes: minutes,
    points: perf.spoints,
    rebounds: perf.sreboundstotal,
    assists: perf.sassists,
    steals: perf.ssteals ?? 0,
    blocks: perf.sblocks ?? 0,
    fg: `${fgMade}/${fgAtt}`,
    three_pt: `${threeMade}/${threeAtt}`,
    ft: `${ftMade}/${ftAtt}`,
    turnovers: perf.sturnovers ?? 0,
    ts_percent: tsPercent,
    plus_minus: plusMinus,
    home_score: perf.player_team_score,
    away_score: perf.opponent_score,
    didWin: perf.player_team_score > perf.opponent_score,
    home_logo_url: playerTeamLogo || "",
    away_logo_url: opponentLogo || "",
    photo_url: maskedPhotoUrl,
    background_photo_url: playerPhotoUrl,
    photo_focus_y: photoFocusY,
    photo_zoom: 1,
    photo_position_x: 50,
    photo_position_y: photoFocusY,
    league_name: leagueName,
    league_logo_url: leagueLogoUrl,
  };
}

export default function SocialToolsPage() {
  const [, navigate] = useLocation();
  const [performances, setPerformances] = useState<TopPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedData, setSelectedData] = useState<PlayerPerformanceV1Data>(defaultData);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leagueBrands, setLeagueBrands] = useState<LeagueBrand[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>(ALL_FILTER_VALUE);
  const [selectedCompetition, setSelectedCompetition] = useState<string>(ALL_FILTER_VALUE);
  const [hierarchyReady, setHierarchyReady] = useState(false);
  const [timeFilter, setTimeFilter] = useState<string>("all-time");
  const [performanceSearch, setPerformanceSearch] = useState<string>("");
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [queueCardCache, setQueueCardCache] = useState<Record<string, PlayerPerformanceV1Data>>({});
  const [queueLoading, setQueueLoading] = useState(false);
  const [showAllPerformances, setShowAllPerformances] = useState(false);
  const [hasMorePerformances, setHasMorePerformances] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [performanceOffset, setPerformanceOffset] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("default");
  const [sponsorLogos, setSponsorLogos] = useState<SponsorLogo[]>([]);

  // Preview state — generated once when a performance is selected.
  const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);
  const [previewGenerating, setPreviewGenerating] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const socialBlobRef = useRef<Blob | null>(null);
  const framingPreviewTimerRef = useRef<number | null>(null);
  // Monotonically-increasing token: only the latest generation request may
  // commit its result. Guards against rapid selection/template changes where
  // a slower capture can finish after a newer one and overwrite state.
  const generationTokenRef = useRef(0);

  const PAGE_SIZE = 50;
  
  const queueCards = useMemo(() => {
    return queueIds.map(id => queueCardCache[id]).filter(Boolean);
  }, [queueIds, queueCardCache]);

  const availableCompetitions = useMemo(() => {
    if (selectedLeague === ALL_FILTER_VALUE) return [];
    const byId = new Map(competitions.map((competition) => [competition.league_id, competition]));
    return competitions
      .filter((competition) => competition.brand_id === selectedLeague)
      .filter(
        (competition) =>
          competition.is_public !== false ||
          resolveVisibleCompetition(competition, byId).league_id === competition.league_id,
      )
      .sort((a, b) => b.latest_activity - a.latest_activity || a.name.localeCompare(b.name));
  }, [competitions, selectedLeague]);

  const competitionById = useMemo(
    () => new Map(competitions.map((competition) => [competition.league_id, competition])),
    [competitions],
  );

  const leagueBrandById = useMemo(
    () => new Map(leagueBrands.map((league) => [league.id, league])),
    [leagueBrands],
  );

  const filteredPerformances = useMemo(() => {
    if (!performanceSearch.trim()) return performances;
    const query = performanceSearch.toLowerCase();
    return performances.filter(
      (p) =>
        p.player_name.toLowerCase().includes(query) ||
        p.team.toLowerCase().includes(query) ||
        p.opponent.toLowerCase().includes(query)
    );
  }, [performances, performanceSearch]);

  useEffect(() => {
    fetchLeagueHierarchy();
  }, []);

  useEffect(() => {
    if (!hierarchyReady) return;
    setPerformances([]);
    setPerformanceOffset(0);
    setHasMorePerformances(true);
    fetchTopPerformances(0, true);
  // The fetch function intentionally reads the current hierarchy and filters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchyReady, selectedLeague, selectedCompetition, timeFilter]);

  const fetchLeagueHierarchy = async () => {
    try {
      const [
        { data: leagueRows, error: leagueError },
        { data: competitionRows, error: competitionError },
      ] = await Promise.all([
        supabase
          .from("leagues")
          .select("id, name, slug, logo_url, created_at")
          .order("name"),
        supabase
          .from("competitions")
          .select("league_id, competition_id, parent_league_id, name, season, slug, logo_url, is_public, created_at")
          .order("name"),
      ]);

      if (leagueError) throw leagueError;
      if (competitionError) throw competitionError;

      const rawLeagues = leagueRows || [];
      const rawCompetitions = competitionRows || [];
      const rawLeagueById = new Map(rawLeagues.map((league) => [league.id, league]));
      const rawCompetitionById = new Map(rawCompetitions.map((competition) => [competition.league_id, competition]));
      const resolvedBrandCache = new Map<string, string>();

      const resolveBrandId = (competitionId: string, visited = new Set<string>()): string => {
        const cached = resolvedBrandCache.get(competitionId);
        if (cached) return cached;
        if (visited.has(competitionId)) return LEGACY_LEAGUE_ID;

        const competition = rawCompetitionById.get(competitionId);
        if (!competition) return LEGACY_LEAGUE_ID;
        visited.add(competitionId);

        let brandId = LEGACY_LEAGUE_ID;
        if (competition.competition_id && rawLeagueById.has(competition.competition_id)) {
          brandId = competition.competition_id;
        } else if (competition.parent_league_id) {
          brandId = resolveBrandId(competition.parent_league_id, visited);
        }

        resolvedBrandCache.set(competitionId, brandId);
        return brandId;
      };

      const competitionOptions: CompetitionOption[] = rawCompetitions.map((competition) => ({
        ...competition,
        brand_id: resolveBrandId(competition.league_id),
        latest_activity: activityTimestamp(competition.created_at),
      }));

      const competitionsByBrand = new Map<string, CompetitionOption[]>();
      competitionOptions.forEach((competition) => {
        const group = competitionsByBrand.get(competition.brand_id) || [];
        group.push(competition);
        competitionsByBrand.set(competition.brand_id, group);
      });

      const activityMaps = await Promise.all(
        Array.from(competitionsByBrand.entries()).map(async ([brandId, brandCompetitions]) => {
          const competitionIds = brandCompetitions.map((competition) => competition.league_id);
          const activityByCompetition = new Map(
            brandCompetitions.map((competition) => [competition.league_id, competition.latest_activity]),
          );

          const [
            { data: recentStats, error: statsError },
            { data: recentGames, error: gamesError },
          ] = await Promise.all([
            supabase
              .from("player_stats")
              .select("league_id, created_at")
              .in("league_id", competitionIds)
              .order("created_at", { ascending: false })
              .limit(1000),
            supabase
              .from("game_schedule")
              .select("league_id, matchtime, parsed_at")
              .in("league_id", competitionIds)
              .order("matchtime", { ascending: false, nullsFirst: false })
              .limit(1000),
          ]);

          if (statsError) console.warn(`[SocialTools] Could not rank ${brandId} from player stats:`, statsError);
          if (gamesError) console.warn(`[SocialTools] Could not rank ${brandId} from games:`, gamesError);

          recentStats?.forEach((row) => {
            const current = activityByCompetition.get(row.league_id) || 0;
            activityByCompetition.set(row.league_id, Math.max(current, activityTimestamp(row.created_at)));
          });

          const now = Date.now();
          recentGames?.forEach((row) => {
            const current = activityByCompetition.get(row.league_id) || 0;
            const gameTime = activityTimestamp(row.matchtime);
            const latestCompletedGame = gameTime > 0 && gameTime <= now ? gameTime : 0;
            activityByCompetition.set(
              row.league_id,
              Math.max(current, latestCompletedGame, activityTimestamp(row.parsed_at)),
            );
          });

          return activityByCompetition;
        }),
      );

      const latestActivityByCompetition = new Map<string, number>();
      activityMaps.forEach((activityMap) => {
        activityMap.forEach((timestamp, competitionId) => {
          latestActivityByCompetition.set(competitionId, timestamp);
        });
      });

      const rankedCompetitions = competitionOptions.map((competition) => ({
        ...competition,
        latest_activity: latestActivityByCompetition.get(competition.league_id) || competition.latest_activity,
      }));

      const rankedLeagues: LeagueBrand[] = rawLeagues.map((league) => {
        const brandCompetitions = rankedCompetitions.filter((competition) => competition.brand_id === league.id);
        return {
          id: league.id,
          name: league.name,
          slug: league.slug,
          logo_url: league.logo_url,
          latest_activity: Math.max(
            activityTimestamp(league.created_at),
            ...brandCompetitions.map((competition) => competition.latest_activity),
          ),
        };
      });

      const legacyCompetitions = rankedCompetitions.filter(
        (competition) => competition.brand_id === LEGACY_LEAGUE_ID,
      );
      if (legacyCompetitions.length > 0) {
        rankedLeagues.push({
          id: LEGACY_LEAGUE_ID,
          name: "Legacy competitions",
          slug: LEGACY_LEAGUE_ID,
          latest_activity: Math.max(...legacyCompetitions.map((competition) => competition.latest_activity)),
          is_legacy: true,
        });
      }

      rankedCompetitions.sort(
        (a, b) => b.latest_activity - a.latest_activity || a.name.localeCompare(b.name),
      );
      rankedLeagues.sort((a, b) => {
        if (a.is_legacy !== b.is_legacy) return a.is_legacy ? 1 : -1;
        return b.latest_activity - a.latest_activity || a.name.localeCompare(b.name);
      });

      setCompetitions(rankedCompetitions);
      setLeagueBrands(rankedLeagues);
    } catch (error) {
      console.error("[SocialTools] Error loading league hierarchy:", error);
      setCompetitions([]);
      setLeagueBrands([]);
    } finally {
      setHierarchyReady(true);
    }
  };

  const fetchTopPerformances = async (offset = 0, isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      const displayCompetitionBySourceId = new Map<string, string>();
      let competitionIds: string[] = [];

      if (selectedCompetition !== ALL_FILTER_VALUE) {
        competitionIds = await collectCompetitionFamilyIds(selectedCompetition, competitions);
        competitionIds.forEach((competitionId) => {
          displayCompetitionBySourceId.set(competitionId, selectedCompetition);
        });
      } else if (selectedLeague !== ALL_FILTER_VALUE) {
        const byId = new Map(competitions.map((competition) => [competition.league_id, competition]));
        const visibleLeagueCompetitions = competitions
          .filter((competition) => competition.brand_id === selectedLeague)
          .filter(
            (competition) =>
              competition.is_public !== false ||
              resolveVisibleCompetition(competition, byId).league_id === competition.league_id,
          );
        const families = await Promise.all(
          visibleLeagueCompetitions.map(async (competition) => ({
            displayId: competition.league_id,
            familyIds: await collectCompetitionFamilyIds(competition.league_id, competitions),
          })),
        );

        families.forEach(({ displayId, familyIds }) => {
          familyIds.forEach((competitionId) => {
            if (!displayCompetitionBySourceId.has(competitionId)) {
              displayCompetitionBySourceId.set(competitionId, displayId);
            }
          });
        });
        competitionIds = Array.from(displayCompetitionBySourceId.keys());
      }

      if (selectedLeague !== ALL_FILTER_VALUE && competitionIds.length === 0) {
        setPerformances([]);
        setHasMorePerformances(false);
        return;
      }

      let createdAfter: string | undefined;
      if (timeFilter === "last-3-days") {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        createdAfter = threeDaysAgo.toISOString();
      } else if (timeFilter === "latest") {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        createdAfter = sevenDaysAgo.toISOString();
      }

      let playerStats: any[] = [];
      let prefetchedTeamStats: any[] = [];

      if (competitionIds.length > 0) {
        const response = await fetch("/api/public/social-performances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leagueIds: competitionIds,
            offset,
            limit: PAGE_SIZE,
            createdAfter,
          }),
        });
        if (!response.ok) {
          throw new Error(`Performance feed request failed (${response.status})`);
        }
        const payload = await response.json();
        playerStats = payload.rows || [];
        prefetchedTeamStats = payload.teamStats || [];
      } else {
        let query = supabase
          .from("player_stats")
          .select("*, players:player_id(id, full_name, photo_path)")
          .order("spoints", { ascending: false })
          .gt("spoints", 0);

        if (createdAfter) {
          query = query.gte("created_at", createdAfter);
        }

        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        playerStats = data || [];
      }

      const numericIds = Array.from(new Set(playerStats.map((s: any) => s.numeric_id).filter(Boolean)));
      const gameKeys = Array.from(new Set(playerStats.map((s: any) => s.game_key).filter(Boolean)));
      
      let teamStatsMap: Record<string, any[]> = {};

      const addTeamStats = (teamStats: any[]) => {
        teamStats.forEach((ts: any) => {
          const keys = [ts.numeric_id, ts.game_key].filter(Boolean);
          keys.forEach((key) => {
            if (!teamStatsMap[key]) teamStatsMap[key] = [];
            const exists = teamStatsMap[key].some(
              (existing: any) =>
                existing.name === ts.name &&
                existing.league_id === ts.league_id,
            );
            if (!exists) teamStatsMap[key].push(ts);
          });
        });
      };

      addTeamStats(prefetchedTeamStats);

      if (prefetchedTeamStats.length === 0 && numericIds.length > 0) {
        const { data: teamStats } = await supabase
          .from("team_stats")
          .select("numeric_id, game_key, name, tot_spoints, league_id")
          .in("numeric_id", numericIds);
        addTeamStats(teamStats || []);
      }
      
      if (prefetchedTeamStats.length === 0 && gameKeys.length > 0) {
        const { data: teamStats } = await supabase
          .from("team_stats")
          .select("numeric_id, game_key, name, tot_spoints, league_id")
          .in("game_key", gameKeys);
        addTeamStats(teamStats || []);
      }

      const mapped: TopPerformance[] = (playerStats || []).map((stat: any) => {
        const gameTeams = teamStatsMap[stat.numeric_id] || teamStatsMap[stat.game_key] || [];
        const playerTeamName = stat.team_name || stat.team || '';
        const normalizedPlayerTeam = normalizeTeamName(playerTeamName);
        
        const playerTeamStats = gameTeams.find((t: any) => 
          normalizeTeamName(t.name || '') === normalizedPlayerTeam
        );
        
        const opponentStats = gameTeams.find((t: any) => {
          const normalizedName = normalizeTeamName(t.name || '');
          return normalizedName !== normalizedPlayerTeam && normalizedName !== '';
        });
        
        const opponentName = opponentStats?.name || 
          (gameTeams.length === 2 ? gameTeams.find((t: any) => t !== playerTeamStats)?.name : null) || 
          'Unknown';
        
        return {
          id: stat.id,
          player_id: stat.players?.id || stat.player_id,
          player_name: stat.players?.full_name || `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || 'Unknown',
          player_photo_path: stat.players?.photo_path,
          team: playerTeamName || 'Unknown',
          opponent: opponentName,
          sminutes: stat.sminutes,
          spoints: stat.spoints || 0,
          sreboundstotal: stat.sreboundstotal || 0,
          sassists: stat.sassists || 0,
          ssteals: stat.ssteals || 0,
          sblocks: stat.sblocks || 0,
          sfieldgoalsmade: stat.sfieldgoalsmade,
          sfieldgoalsattempted: stat.sfieldgoalsattempted,
          sthreepointersmade: stat.sthreepointersmade,
          sthreepointersattempted: stat.sthreepointersattempted,
          sfreethrowsmade: stat.sfreethrowsmade,
          sfreethrowsattempted: stat.sfreethrowsattempted,
          sturnovers: stat.sturnovers,
          splusminuspoints: stat.splusminuspoints,
          game_key: stat.game_key,
          numeric_id: stat.numeric_id,
          player_team_score: playerTeamStats?.tot_spoints ?? opponentStats?.tot_spoints ?? 0,
          opponent_score: opponentStats?.tot_spoints ?? 0,
          league_id: stat.league_id || playerTeamStats?.league_id || opponentStats?.league_id,
          display_competition_id: displayCompetitionBySourceId.get(stat.league_id),
        };
      });

      const hasMore = (playerStats?.length || 0) === PAGE_SIZE;
      setHasMorePerformances(hasMore);
      setPerformanceOffset(offset + (playerStats?.length || 0));
      
      if (isInitialLoad) {
        setPerformances(mapped);
      } else {
        setPerformances(prev => [...prev, ...mapped]);
      }
    } catch (err) {
      console.error("Failed to fetch performances:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMorePerformances = () => {
    if (!loadingMore && hasMorePerformances) {
      fetchTopPerformances(performanceOffset, false);
    }
  };

  /** Generate the preview PNG from the given data + template.
   *  Uses a monotonic token so that only the most-recent call can commit
   *  its result — rapid selection/template changes cannot cause stale
   *  captures to overwrite a newer preview. */
  const generatePreview = useCallback(async (data: PlayerPerformanceV1Data, template: string) => {
    const token = ++generationTokenRef.current;
    // Immediately clear stale preview so old card doesn't show while new one loads.
    socialBlobRef.current = null;
    setPreviewImgUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewGenerating(true);
    setPreviewError(false);
    try {
      const blob = await renderSocialCardToBlob(data, template);
      // Discard result if a newer request has started since we began.
      if (generationTokenRef.current !== token) return;
      if (!blob) {
        setPreviewError(true);
        return;
      }
      socialBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPreviewImgUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      if (generationTokenRef.current !== token) return;
      console.error("[SocialTools] preview generation failed:", err);
      setPreviewError(true);
    } finally {
      if (generationTokenRef.current === token) {
        setPreviewGenerating(false);
      }
    }
  }, []);

  const applySponsorLogos = useCallback((nextLogos: SponsorLogo[]) => {
    const urls = nextLogos.map((logo) => logo.url);
    setSponsorLogos(nextLogos);
    setQueueCardCache((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([id, card]) => [
          id,
          { ...card, sponsor_logo_urls: urls },
        ]),
      ),
    );

    if (selectedId && selectedData !== defaultData) {
      const nextData = { ...selectedData, sponsor_logo_urls: urls };
      setSelectedData(nextData);
      setQueueCardCache((previous) => ({
        ...previous,
        [selectedId]: nextData,
      }));
      generatePreview(nextData, selectedTemplate);
    }
  }, [generatePreview, selectedData, selectedId, selectedTemplate]);

  const handleSponsorFiles = async (files: FileList | null) => {
    if (!files) return;
    const remainingSlots = Math.max(0, 4 - sponsorLogos.length);
    const selectedFiles = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, remainingSlots);

    const additions = await Promise.all(
      selectedFiles.map(
        (file) =>
          new Promise<SponsorLogo>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
              id: `${file.name}-${file.lastModified}-${file.size}`,
              name: file.name,
              url: String(reader.result),
            });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
    );

    applySponsorLogos([...sponsorLogos, ...additions]);
  };

  const moveSponsorLogo = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sponsorLogos.length) return;
    const next = [...sponsorLogos];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    applySponsorLogos(next);
  };

  const removeSponsorLogo = (id: string) => {
    applySponsorLogos(sponsorLogos.filter((logo) => logo.id !== id));
  };

  const applyPhotoFraming = useCallback((patch: Partial<PlayerPerformanceV1Data>) => {
    if (!selectedId || selectedData === defaultData) return;
    const nextData = { ...selectedData, ...patch };
    setSelectedData(nextData);
    setQueueCardCache((previous) => ({
      ...previous,
      [selectedId]: nextData,
    }));

    if (framingPreviewTimerRef.current !== null) {
      window.clearTimeout(framingPreviewTimerRef.current);
    }
    framingPreviewTimerRef.current = window.setTimeout(() => {
      generatePreview(nextData, selectedTemplate);
      framingPreviewTimerRef.current = null;
    }, 160);
  }, [generatePreview, selectedData, selectedId, selectedTemplate]);

  useEffect(() => () => {
    if (framingPreviewTimerRef.current !== null) {
      window.clearTimeout(framingPreviewTimerRef.current);
    }
  }, []);

  const resetPhotoFraming = () => {
    applyPhotoFraming({
      photo_zoom: 1,
      photo_position_x: 50,
      photo_position_y: selectedData.photo_focus_y ?? 50,
    });
  };

  // Regenerate preview when template changes (if a performance is already selected).
  useEffect(() => {
    if (!selectedId || selectedData === defaultData) return;
    generatePreview(selectedData, selectedTemplate);
  // We intentionally run only when template changes after a selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate]);

  const handleSelectPerformance = async (perf: TopPerformance) => {
    setSelectedId(perf.id);
    const competition = await resolvePerformanceCompetition(perf, competitionById);
    const brand = competition ? leagueBrandById.get(competition.brand_id) : undefined;
    const cardData = await buildPlayerPerformanceCardData(perf, competition, brand);
    cardData.sponsor_logo_urls = sponsorLogos.map((logo) => logo.url);
    setSelectedData(cardData);
    
    if (!queueIds.includes(perf.id)) {
      setQueueIds(prev => [...prev, perf.id]);
      setQueueCardCache(prev => ({ ...prev, [perf.id]: cardData }));
    }

    // Generate the preview PNG immediately after building card data.
    generatePreview(cardData, selectedTemplate);
  };

  const handleLeagueChange = (leagueId: string) => {
    setSelectedLeague(leagueId);
    setSelectedCompetition(ALL_FILTER_VALUE);
  };
  
  const handleRemoveFromQueue = (index: number) => {
    setQueueIds(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleClearQueue = () => {
    setQueueIds([]);
  };

  const handleDownload = async () => {
    if (!selectedData || selectedData === defaultData) return;
    
    try {
      // Reuse the already-generated blob; regenerate only if unavailable.
      const blob = socialBlobRef.current ?? await renderSocialCardToBlob(selectedData, selectedTemplate);
      if (!blob) {
        console.error("[SocialTools] download: failed to generate blob");
        return;
      }
      const link = document.createElement("a");
      link.download = `${selectedData.player_name.replace(/\s+/g, '-')}-performance.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    } catch (error) {
      console.error("Failed to generate image:", error);
      setPreviewError(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="mx-auto max-w-[1600px] px-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Swish Social Tool
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Select a top performance to generate a social media graphic
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left side - Performance selector */}
          <div className="lg:col-span-3">
            <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700">
              <CardHeader className="pb-3">
                <div className="space-y-3">
                  <CardTitle className="text-orange-900 dark:text-orange-400 flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Top Performances
                  </CardTitle>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Select value={selectedLeague} onValueChange={handleLeagueChange}>
                      <SelectTrigger className="w-full border-orange-200 dark:border-orange-700" data-testid="select-league">
                        <Filter className="h-4 w-4 mr-2 text-orange-500" />
                        <SelectValue placeholder="All Leagues" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTER_VALUE}>All Leagues</SelectItem>
                        {leagueBrands.map((league) => (
                          <SelectItem key={league.id} value={league.id}>
                            {league.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={selectedCompetition}
                      onValueChange={setSelectedCompetition}
                      disabled={selectedLeague === ALL_FILTER_VALUE}
                    >
                      <SelectTrigger
                        className="w-full border-orange-200 dark:border-orange-700"
                        data-testid="select-competition"
                      >
                        <SelectValue
                          placeholder={
                            selectedLeague === ALL_FILTER_VALUE
                              ? "Choose a league first"
                              : "All Competitions"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTER_VALUE}>All Competitions</SelectItem>
                        {availableCompetitions.map((competition) => (
                          <SelectItem key={competition.league_id} value={competition.league_id}>
                            {competition.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={timeFilter} onValueChange={setTimeFilter}>
                      <SelectTrigger className="w-full border-orange-200 dark:border-orange-700" data-testid="select-time">
                        <SelectValue placeholder="All Time" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-time">All Time</SelectItem>
                        <SelectItem value="last-3-days">Last 3 Days</SelectItem>
                        <SelectItem value="latest">Last 7 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search by player, team, or opponent..."
                    value={performanceSearch}
                    onChange={(e) => setPerformanceSearch(e.target.value)}
                    className="pl-10 border-gray-200 dark:border-gray-600"
                    data-testid="input-performance-search"
                  />
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                  </div>
                ) : filteredPerformances.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                    <Search className="h-8 w-8 mb-2 opacity-50" />
                    <p>No performances found matching "{performanceSearch}"</p>
                  </div>
                ) : (
                  <div>
                    <ScrollArea className={showAllPerformances ? "h-[800px]" : "h-[400px]"}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-4">
                        {filteredPerformances.map((perf) => (
                          <div
                            key={perf.id}
                            onClick={() => handleSelectPerformance(perf)}
                            className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md relative ${
                              selectedId === perf.id
                                ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                                : queueIds.includes(perf.id)
                                ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                                : "border-gray-200 dark:border-gray-600 hover:border-orange-300 dark:hover:border-orange-600"
                            }`}
                            data-testid={`card-performance-${perf.id}`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                                  {perf.player_name}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                  {perf.team}
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                  vs {perf.opponent} ({perf.player_team_score}-{perf.opponent_score})
                                </p>
                              </div>
                              <div className="text-right ml-3">
                                <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                                  {perf.spoints}
                                </span>
                                <p className="text-xs text-gray-500 dark:text-gray-400">PTS</p>
                              </div>
                            </div>
                            <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-300">
                              <span>{perf.sreboundstotal} REB</span>
                              <span>{perf.sassists} AST</span>
                              {perf.ssteals ? <span>{perf.ssteals} STL</span> : null}
                            </div>
                            {queueIds.includes(perf.id) && (
                              <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                                Queued
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setShowAllPerformances(!showAllPerformances)}
                        className="w-full py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300 flex items-center justify-center gap-1"
                      >
                        {showAllPerformances ? (
                          <>
                            <ChevronUp className="h-4 w-4" />
                            Collapse View
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4" />
                            Expand View ({filteredPerformances.length} loaded)
                          </>
                        )}
                      </button>
                      {hasMorePerformances && (
                        <button
                          onClick={loadMorePerformances}
                          disabled={loadingMore}
                          className="w-full py-2 text-sm font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 flex items-center justify-center gap-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg disabled:opacity-50"
                        >
                          {loadingMore ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading more...
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4" />
                              Load More Performances
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right side - Card preview and Photo uploader */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-orange-900 dark:text-orange-400">
                    Card Preview
                  </CardTitle>
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger className="w-[160px] border-orange-200 dark:border-orange-700" data-testid="select-template">
                      <SelectValue placeholder="Template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Swish Default</SelectItem>
                      <SelectItem value="reba-sl">REBA SL</SelectItem>
                        <SelectItem value="photo-overlay">Photo Overlay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {selectedTemplate === "photo-overlay" && (
                  <div className="mb-4 space-y-4 rounded-lg border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-800 dark:bg-orange-950/20">
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">Photo framing</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Adjusts the card only. Your original photo stays unchanged.</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={resetPhotoFraming}
                          disabled={!selectedId}
                          className="h-8 gap-1.5"
                          data-testid="button-reset-photo-framing"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reset
                        </Button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                          <span className="flex justify-between">
                            Zoom
                            <span className="tabular-nums text-gray-500">{Math.round((selectedData.photo_zoom ?? 1) * 100)}%</span>
                          </span>
                          <Slider
                            min={0.6}
                            max={2.5}
                            step={0.05}
                            value={[selectedData.photo_zoom ?? 1]}
                            onValueChange={([value]) => applyPhotoFraming({ photo_zoom: value })}
                            disabled={!selectedId}
                            data-testid="slider-photo-zoom"
                          />
                        </label>
                        <label className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                          <span className="flex justify-between">
                            Horizontal
                            <span className="tabular-nums text-gray-500">{Math.round(selectedData.photo_position_x ?? 50)}%</span>
                          </span>
                          <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[selectedData.photo_position_x ?? 50]}
                            onValueChange={([value]) => applyPhotoFraming({ photo_position_x: value })}
                            disabled={!selectedId}
                            data-testid="slider-photo-position-x"
                          />
                        </label>
                        <label className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                          <span className="flex justify-between">
                            Vertical
                            <span className="tabular-nums text-gray-500">{Math.round(selectedData.photo_position_y ?? selectedData.photo_focus_y ?? 50)}%</span>
                          </span>
                          <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[selectedData.photo_position_y ?? selectedData.photo_focus_y ?? 50]}
                            onValueChange={([value]) => applyPhotoFraming({ photo_position_y: value })}
                            disabled={!selectedId}
                            data-testid="slider-photo-position-y"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="border-t border-orange-200 pt-3 dark:border-orange-800">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Sponsor logos</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Optional · up to 4 · included in preview and PNG</p>
                      </div>
                      {sponsorLogos.length < 4 && (
                        <label className="inline-flex cursor-pointer items-center rounded-md border border-orange-300 bg-white px-3 py-2 text-xs font-medium text-orange-700 shadow-sm hover:bg-orange-50 dark:border-orange-700 dark:bg-gray-900 dark:text-orange-300">
                          <ImagePlus className="mr-1.5 h-4 w-4" />
                          Add logo
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            multiple
                            className="sr-only"
                            onChange={(event) => {
                              handleSponsorFiles(event.target.files);
                              event.target.value = "";
                            }}
                            data-testid="input-sponsor-logos"
                          />
                        </label>
                      )}
                    </div>

                    {sponsorLogos.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {sponsorLogos.map((logo, index) => (
                          <div key={logo.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
                            <div className="flex h-10 w-16 items-center justify-center rounded bg-gray-100 p-1 dark:bg-gray-800">
                              <img src={logo.url} alt="" className="max-h-full max-w-full object-contain" />
                            </div>
                            <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-300">{logo.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={index === 0}
                              onClick={() => moveSponsorLogo(index, -1)}
                              title="Move sponsor left"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={index === sponsorLogos.length - 1}
                              onClick={() => moveSponsorLogo(index, 1)}
                              title="Move sponsor right"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-600"
                              onClick={() => removeSponsorLogo(logo.id)}
                              title="Remove sponsor"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    </div>
                  </div>
                )}
                <div className="mb-4 flex gap-2">
                  <Button
                    onClick={handleDownload}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                    disabled={selectedId === null || previewGenerating}
                    data-testid="button-download"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download as PNG
                  </Button>
                  {selectedId !== null && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => generatePreview(selectedData, selectedTemplate)}
                      disabled={previewGenerating}
                      title="Regenerate preview"
                      className="flex-shrink-0"
                      data-testid="button-regenerate"
                    >
                      <RefreshCw className={`h-4 w-4 ${previewGenerating ? "animate-spin" : ""}`} />
                    </Button>
                  )}
                </div>

                {/* Preview area */}
                <div className="bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden min-h-[160px] flex items-center justify-center">
                  {!selectedId ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center px-4">
                      Select a performance to see a preview
                    </p>
                  ) : previewGenerating ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-gray-500">
                      <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                      <span className="text-sm">Generating preview…</span>
                    </div>
                  ) : previewError ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-gray-500">
                      <AlertTriangle className="h-7 w-7 text-amber-500" />
                      <span className="text-sm text-center px-4">Preview failed</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generatePreview(selectedData, selectedTemplate)}
                        className="gap-2"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry
                      </Button>
                    </div>
                  ) : previewImgUrl ? (
                    <img
                      src={previewImgUrl}
                      alt="Card preview"
                      className="w-full h-auto block rounded-lg"
                    />
                  ) : null}
                </div>
                
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                  Card size: 1080×1350px (Instagram portrait)
                </p>
              </CardContent>
            </Card>
            
            <PlayerPhotoUploader />
            <PlayerIdentityManager />
          </div>
        </div>
        
        <PostQueueSection 
          cards={queueCards} 
          template={selectedTemplate}
          loading={queueLoading} 
          onRemove={handleRemoveFromQueue}
          onClear={handleClearQueue}
        />
      </div>
    </div>
  );
}
