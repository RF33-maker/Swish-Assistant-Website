import { Trophy, Loader2, Filter, Search, ChevronDown, RefreshCw, AlertTriangle, ImagePlus, X, ChevronLeft, ChevronRight, RotateCcw, CameraOff, Check } from "lucide-react";
import { PostQueueSection } from "@/components/social/PostQueueSection";
import { PlayerPhotoControl } from "@/components/social/PlayerPhotoControl";
import { BTN_GHOST, ERROR, FIELD, HINT, Panel, RangeField, SaveActions, SELECT_MENU } from "@/components/social/studioUi";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeTeamName } from "@/lib/teamUtils";
import { fetchLeagueChildren } from "@/lib/leagueChildren";
import { generateMaskedPhoto } from "@/lib/photoMasking";
import { photoChangeReaches, playerPhotoUrl, usePlayerPhotoChange } from "@/lib/playerPhotos";
import { HALLOWEEN_SUFFIX, renderSocialCardToBlob } from "@/lib/socialCardCapture";
import { isHalloweenSeason } from "@/lib/cardStyle";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { useStoredState } from "@/hooks/useStoredState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ICON_BTN =
  "flex h-7 w-7 flex-none items-center justify-center rounded-md text-[color:var(--ch-text-2)] transition hover:bg-[color:var(--ch-surface-3)] hover:text-[color:var(--ch-text)] disabled:pointer-events-none disabled:opacity-40";

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

  let photoUrl = "";
  let photoFocusY = 50;
  
  if (perf.player_photo_path) {
    photoUrl = playerPhotoUrl(perf.player_photo_path);
  } else if (perf.player_id) {
    const { data: photoList } = await supabase.storage
      .from("player-photos")
      .list(perf.player_id);
    
    if (photoList && photoList.length > 0) {
      photoUrl = playerPhotoUrl(`${perf.player_id}/${photoList[0].name}`);
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

  let maskedPhotoUrl = photoUrl;
  if (photoUrl) {
    try {
      maskedPhotoUrl = await generateMaskedPhoto(photoUrl, photoFocusY);
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
    background_photo_url: photoUrl,
    photo_focus_y: photoFocusY,
    photo_zoom: 1,
    photo_position_x: 50,
    photo_position_y: photoFocusY,
    league_name: leagueName,
    league_logo_url: leagueLogoUrl,
  };
}

const TEMPLATES = [
  { value: "default", label: "Swish Default" },
  { value: "reba-sl", label: "REBA SL" },
  { value: "photo-overlay", label: "Photo Overlay" },
  { value: "photo-overlay-reel", label: "Photo Overlay · Reel Cover" },
];

const TIME_FILTERS = [
  { value: "all-time", label: "All Time" },
  { value: "last-3-days", label: "Last 3 Days" },
  { value: "latest", label: "Last 7 Days" },
];

const STORE = "swish-social:performances";

export default function TopPerformancesStudio() {
  const [performances, setPerformances] = useState<TopPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedData, setSelectedData] = useState<PlayerPerformanceV1Data>(defaultData);
  const [selectedPerf, setSelectedPerf] = useState<TopPerformance | null>(null);
  const selectedId = selectedPerf?.id ?? null;
  // From the click until the card's logos and photo have been gathered.
  const [building, setBuilding] = useState(false);
  const [leagueBrands, setLeagueBrands] = useState<LeagueBrand[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  // Remembered, so a refresh or a trip to another page comes back to the same list.
  const [selectedLeague, setSelectedLeague] = useStoredState<string>(`${STORE}:league`, ALL_FILTER_VALUE);
  const [selectedCompetition, setSelectedCompetition] = useStoredState<string>(`${STORE}:competition`, ALL_FILTER_VALUE);
  const [storedTimeFilter, setTimeFilter] = useStoredState<string>(`${STORE}:time`, "all-time");
  const [storedTemplate, setSelectedTemplate] = useStoredState<string>(`${STORE}:template`, "default");
  const [performanceSearch, setPerformanceSearch] = useStoredState<string>(`${STORE}:search`, "", "session");
  const timeFilter = TIME_FILTERS.some((t) => t.value === storedTimeFilter) ? storedTimeFilter : "all-time";
  const selectedTemplate = TEMPLATES.some((t) => t.value === storedTemplate) ? storedTemplate : "default";
  // Seasonal: a light Halloween layer (cobweb, bats, a spider) over whichever template is picked.
  const halloweenSeason = isHalloweenSeason();
  const [halloweenTouch, setHalloweenTouch] = useStoredState<boolean>(`${STORE}:halloween`, true);
  const cardTemplate = halloweenSeason && halloweenTouch ? `${selectedTemplate}${HALLOWEEN_SUFFIX}` : selectedTemplate;
  const [hierarchyReady, setHierarchyReady] = useState(false);
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [queueCardCache, setQueueCardCache] = useState<Record<string, PlayerPerformanceV1Data>>({});
  const [queueLoading] = useState(false);
  const [hasMorePerformances, setHasMorePerformances] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [performanceOffset, setPerformanceOffset] = useState(0);
  const [sponsorLogos, setSponsorLogos] = useState<SponsorLogo[]>([]);

  // Preview state — generated once when a performance is selected.
  const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);
  const [previewGenerating, setPreviewGenerating] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const socialBlobRef = useRef<Blob | null>(null);
  // Built when the preview is ready: iOS only opens the share sheet straight from a tap.
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const framingPreviewTimerRef = useRef<number | null>(null);
  // Monotonically-increasing token: only the latest generation request may
  // commit its result. Guards against rapid selection/template changes where
  // a slower capture can finish after a newer one and overwrite state.
  const generationTokenRef = useRef(0);
  // The same guard for gathering a card's data, which is also slow.
  const selectionTokenRef = useRef(0);
  // The stat lines behind the card on screen and the cards in the queue, so
  // they can be rebuilt when one of their players gets a new photo.
  const perfByIdRef = useRef(new Map<string, TopPerformance>());
  const previewRef = useRef<HTMLDivElement>(null);

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

      // A remembered league or competition that has since gone would leave the list empty.
      if (selectedLeague !== ALL_FILTER_VALUE && !rankedLeagues.some((league) => league.id === selectedLeague)) {
        setSelectedLeague(ALL_FILTER_VALUE);
        setSelectedCompetition(ALL_FILTER_VALUE);
      } else if (
        selectedCompetition !== ALL_FILTER_VALUE &&
        !rankedCompetitions.some((c) => c.league_id === selectedCompetition && c.brand_id === selectedLeague)
      ) {
        setSelectedCompetition(ALL_FILTER_VALUE);
      }

      setCompetitions(rankedCompetitions);
      setLeagueBrands(rankedLeagues);
    } catch (error) {
      console.error("[SocialTools] Error loading league hierarchy:", error);
      setCompetitions([]);
      setLeagueBrands([]);
      setSelectedLeague(ALL_FILTER_VALUE);
      setSelectedCompetition(ALL_FILTER_VALUE);
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
    setShareFile(null);
    setShareNotice(null);
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
      const file = new File([blob], `${data.player_name.replace(/\s+/g, "-")}-performance.png`, { type: "image/png" });
      setShareFile(file);
      setCanShareFiles(supportsFileSharing(file));
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
      generatePreview(nextData, cardTemplate);
    }
  }, [generatePreview, selectedData, selectedId, cardTemplate]);

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
      generatePreview(nextData, cardTemplate);
      framingPreviewTimerRef.current = null;
    }, 160);
  }, [generatePreview, selectedData, selectedId, cardTemplate]);

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
    generatePreview(selectedData, cardTemplate);
  // We intentionally run only when template changes after a selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardTemplate]);

  const buildCard = async (perf: TopPerformance) => {
    const competition = await resolvePerformanceCompetition(perf, competitionById);
    const brand = competition ? leagueBrandById.get(competition.brand_id) : undefined;
    const cardData = await buildPlayerPerformanceCardData(perf, competition, brand);
    cardData.sponsor_logo_urls = sponsorLogos.map((logo) => logo.url);
    return cardData;
  };

  /** Puts a stat line on screen as a card. `refreshQueue` also replaces its queued copy (its photo changed). */
  const showPerformance = async (perf: TopPerformance, refreshQueue = false) => {
    const token = ++selectionTokenRef.current;
    perfByIdRef.current.set(perf.id, perf);
    setSelectedPerf(perf);
    setBuilding(true);
    try {
      const cardData = await buildCard(perf);
      // A newer pick took over while this one was gathering its logos and photo.
      if (selectionTokenRef.current !== token) return;
      setSelectedData(cardData);

      if (refreshQueue || !queueIds.includes(perf.id)) {
        setQueueIds((prev) => (prev.includes(perf.id) ? prev : [...prev, perf.id]));
        setQueueCardCache((prev) => ({ ...prev, [perf.id]: cardData }));
      }

      // Generate the preview PNG immediately after building card data.
      generatePreview(cardData, cardTemplate);
    } catch (err) {
      if (selectionTokenRef.current !== token) return;
      console.error("[SocialTools] could not build the card:", err);
      setPreviewError(true);
    } finally {
      if (selectionTokenRef.current === token) setBuilding(false);
    }
  };

  const handleSelectPerformance = (perf: TopPerformance) => {
    void showPerformance(perf);
    // One column on phones and tablets: bring the card into view rather than leaving it below the list.
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  };

  // A photo added or switched anywhere in Swish Social (the strip under the
  // preview, or the Player photos tool) lands here: the list learns the new
  // photo and any card already made for that player is redrawn with it.
  usePlayerPhotoChange((change) => {
    const withPhoto = (perf: TopPerformance) =>
      photoChangeReaches(change, perf.player_id) ? { ...perf, player_photo_path: change.path } : perf;
    setPerformances((prev) => prev.map(withPhoto));

    perfByIdRef.current.forEach((perf, id) => {
      const next = withPhoto(perf);
      if (next === perf) return;
      perfByIdRef.current.set(id, next);
      if (id === selectedId) {
        void showPerformance(next, true);
      } else if (queueIds.includes(id)) {
        void buildCard(next)
          .then((card) => setQueueCardCache((prev) => ({ ...prev, [id]: card })))
          .catch((err) => console.error("[SocialTools] could not refresh a queued card:", err));
      }
    });
  });

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

  const handleSaveToPhotos = async () => {
    if (!shareFile) return;
    setShareNotice(null);
    if ((await shareImageFile(shareFile)) === "failed") {
      setShareNotice("Couldn't open the share sheet. Use Download file instead.");
    }
  };

  const handleDownload = async () => {
    if (!selectedData || selectedData === defaultData) return;
    
    try {
      // Reuse the already-generated blob; regenerate only if unavailable.
      const blob = socialBlobRef.current ?? await renderSocialCardToBlob(selectedData, cardTemplate);
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

  const overlayTemplate = selectedTemplate === "photo-overlay" || selectedTemplate === "photo-overlay-reel";
  const drawing = building || previewGenerating;
  // While a newly picked card is still being gathered, selectedData belongs to the previous one.
  const cardPhotoUrl = !selectedPerf
    ? null
    : building
      ? selectedPerf.player_photo_path
        ? playerPhotoUrl(selectedPerf.player_photo_path)
        : null
      : selectedData.background_photo_url || null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]">
        {/* Left side - Performance selector */}
        <Panel title="Top performances" icon={Trophy} description="Pick a stat line to turn it into a card.">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Select value={selectedLeague} onValueChange={handleLeagueChange}>
              <SelectTrigger className={FIELD} data-testid="select-league">
                {/* The trigger clamps its child span to one line with its own display; !flex keeps icon and text on a row. */}
                <span className="!flex min-w-0 items-center gap-2">
                  <Filter className="h-4 w-4 flex-none text-[color:var(--ch-accent)]" />
                  <SelectValue placeholder="All Leagues" />
                </span>
              </SelectTrigger>
              <SelectContent className={SELECT_MENU}>
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
              <SelectTrigger className={FIELD} data-testid="select-competition">
                <SelectValue
                  placeholder={
                    selectedLeague === ALL_FILTER_VALUE
                      ? "Choose a league first"
                      : "All Competitions"
                  }
                />
              </SelectTrigger>
              <SelectContent className={SELECT_MENU}>
                <SelectItem value={ALL_FILTER_VALUE}>All Competitions</SelectItem>
                {availableCompetitions.map((competition) => (
                  <SelectItem key={competition.league_id} value={competition.league_id}>
                    {competition.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className={FIELD} data-testid="select-time">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent className={SELECT_MENU}>
                {TIME_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative mt-2.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ch-muted)]" />
            <input
              type="text"
              placeholder="Search by player, team, or opponent..."
              value={performanceSearch}
              onChange={(e) => setPerformanceSearch(e.target.value)}
              className={`${FIELD} pl-9 ${performanceSearch ? "pr-9" : ""}`}
              data-testid="input-performance-search"
            />
            {performanceSearch && (
              <button
                type="button"
                onClick={() => setPerformanceSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" aria-busy="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="ch-skel h-[104px] !rounded-[10px]" />
                ))}
              </div>
            ) : filteredPerformances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-[color:var(--ch-text-2)]">
                <Search className="mb-2 h-7 w-7 text-[color:var(--ch-muted)]" />
                <p className="text-sm">
                  {performanceSearch.trim()
                    ? `No performances found matching "${performanceSearch}"`
                    : "No performances for these filters yet."}
                </p>
              </div>
            ) : (
              <>
                <div className="max-h-[min(68vh,780px)] min-h-[280px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {filteredPerformances.map((perf) => {
                      const on = selectedId === perf.id;
                      const queued = queueIds.includes(perf.id);
                      return (
                        <button
                          key={perf.id}
                          type="button"
                          onClick={() => handleSelectPerformance(perf)}
                          aria-pressed={on}
                          className={`ch-tile ch-hover w-full p-3.5 text-left ${
                            on ? "!border-[color:var(--ch-accent)] !bg-[color:var(--ch-accent-soft)]" : ""
                          }`}
                          data-testid={`card-performance-${perf.id}`}
                        >
                          {/* Spans throughout: a button may only hold phrasing content. */}
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-[color:var(--ch-text)]">
                                {perf.player_name}
                              </span>
                              <span className="block truncate text-[13px] text-[color:var(--ch-text-2)]">
                                {perf.team}
                              </span>
                              <span className="mt-1 block truncate text-xs text-[color:var(--ch-muted)]">
                                vs {perf.opponent} ({perf.player_team_score}-{perf.opponent_score})
                              </span>
                            </span>
                            <span className="flex-none text-right">
                              <span className="ch-display ch-num block text-[1.9rem] font-bold leading-none text-[color:var(--ch-accent)]">
                                {perf.spoints}
                              </span>
                              <span className="block text-[10px] font-semibold tracking-wider text-[color:var(--ch-muted)]">PTS</span>
                            </span>
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--ch-text-2)]">
                            <span>{perf.sreboundstotal} REB</span>
                            <span>{perf.sassists} AST</span>
                            {perf.ssteals ? <span>{perf.ssteals} STL</span> : null}
                            <span className="ml-auto flex items-center gap-1.5">
                              {!perf.player_photo_path && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ch-surface-3)] px-2 py-0.5 text-[10.5px] font-semibold text-[color:var(--ch-text-2)]"
                                  title="No photo is linked to this player yet. Select the card to add one."
                                >
                                  <CameraOff className="h-3 w-3" />
                                  No photo
                                </span>
                              )}
                              {queued && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                                  <Check className="h-3 w-3" />
                                  Queued
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--ch-border)] pt-3">
                  <span className={HINT}>
                    {performanceSearch.trim()
                      ? `${filteredPerformances.length} of ${performances.length} loaded`
                      : `${performances.length} loaded`}
                  </span>
                  {hasMorePerformances && (
                    <button type="button" onClick={loadMorePerformances} disabled={loadingMore} className={BTN_GHOST}>
                      {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                      {loadingMore ? "Loading more..." : "Load more"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </Panel>

        {/* Right side - Card preview, the player's photo and the way out */}
        <div ref={previewRef} className="scroll-mt-4 lg:sticky lg:top-4">
          <Panel
            title="Card preview"
            className="lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
            bodyClassName="space-y-3"
            action={
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className={`${FIELD} !h-9 !w-[190px]`} data-testid="select-template">
                  <SelectValue placeholder="Template" />
                </SelectTrigger>
                <SelectContent className={SELECT_MENU}>
                  {TEMPLATES.map((template) => (
                    <SelectItem key={template.value} value={template.value}>
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          >
            {/* Preview area */}
            <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-xl bg-[color:var(--ch-surface-3)]">
              {!selectedPerf ? (
                <p className="px-4 py-10 text-center text-sm text-[color:var(--ch-text-2)]">
                  Select a performance to see a preview
                </p>
              ) : drawing ? (
                <div className="flex flex-col items-center gap-3 py-12 text-[color:var(--ch-text-2)]">
                  <Loader2 className="h-7 w-7 animate-spin text-[color:var(--ch-accent)]" />
                  <span className="text-sm">Generating preview…</span>
                </div>
              ) : previewError ? (
                <div className="flex flex-col items-center gap-3 py-10 text-[color:var(--ch-text-2)]">
                  <AlertTriangle className="h-7 w-7 text-amber-500" />
                  <span className="px-4 text-center text-sm">Preview failed</span>
                  <button
                    type="button"
                    onClick={() => (selectedData === defaultData ? showPerformance(selectedPerf) : generatePreview(selectedData, cardTemplate))}
                    className={BTN_GHOST}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </div>
              ) : previewImgUrl ? (
                <img
                  src={previewImgUrl}
                  alt="Card preview"
                  className="block h-auto max-h-[66vh] w-auto max-w-full"
                  data-testid="img-card-preview"
                />
              ) : null}
            </div>

            {selectedPerf && (
              <PlayerPhotoControl
                key={selectedPerf.player_id || selectedPerf.id}
                playerId={selectedPerf.player_id}
                playerName={selectedPerf.player_name}
                photoUrl={cardPhotoUrl}
                standIn={!selectedPerf.player_photo_path}
              />
            )}

            <SaveActions
              canShare={canShareFiles}
              onSave={handleSaveToPhotos}
              saveDisabled={selectedId === null || drawing || !shareFile}
              onDownload={handleDownload}
              downloadDisabled={selectedId === null || drawing}
              downloadTestId="button-download"
              aside={
                selectedId !== null && (
                  <button
                    type="button"
                    onClick={() => generatePreview(selectedData, cardTemplate)}
                    disabled={drawing || selectedData === defaultData}
                    title="Regenerate preview"
                    aria-label="Regenerate preview"
                    className={`${BTN_GHOST} !h-11 !w-11 flex-none !px-0`}
                    data-testid="button-regenerate"
                  >
                    <RefreshCw className={`h-4 w-4 ${drawing ? "animate-spin" : ""}`} />
                  </button>
                )
              }
              notice={shareNotice && <p className={`text-center ${ERROR}`}>{shareNotice}</p>}
            />

            {overlayTemplate && (
              <div className="ch-tile space-y-4 p-3">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[color:var(--ch-text)]">Photo framing</p>
                      <p className={HINT}>Adjusts the card only. Your original photo stays unchanged.</p>
                    </div>
                    <button
                      type="button"
                      onClick={resetPhotoFraming}
                      disabled={!selectedId}
                      className={`${BTN_GHOST} flex-none`}
                      data-testid="button-reset-photo-framing"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <RangeField
                      label="Zoom"
                      display={`${Math.round((selectedData.photo_zoom ?? 1) * 100)}%`}
                      min={0.6}
                      max={2.5}
                      step={0.05}
                      value={selectedData.photo_zoom ?? 1}
                      onChange={(value) => applyPhotoFraming({ photo_zoom: value })}
                      disabled={!selectedId}
                      testId="slider-photo-zoom"
                    />
                    <RangeField
                      label="Horizontal"
                      display={`${Math.round(selectedData.photo_position_x ?? 50)}%`}
                      min={0}
                      max={100}
                      step={1}
                      value={selectedData.photo_position_x ?? 50}
                      onChange={(value) => applyPhotoFraming({ photo_position_x: value })}
                      disabled={!selectedId}
                      testId="slider-photo-position-x"
                    />
                    <RangeField
                      label="Vertical"
                      display={`${Math.round(selectedData.photo_position_y ?? selectedData.photo_focus_y ?? 50)}%`}
                      min={0}
                      max={100}
                      step={1}
                      value={selectedData.photo_position_y ?? selectedData.photo_focus_y ?? 50}
                      onChange={(value) => applyPhotoFraming({ photo_position_y: value })}
                      disabled={!selectedId}
                      testId="slider-photo-position-y"
                    />
                  </div>
                </div>

                <div className="border-t border-[color:var(--ch-border)] pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[color:var(--ch-text)]">Sponsor logos</p>
                      <p className={HINT}>Optional · up to 4 · included in preview and PNG</p>
                    </div>
                    {sponsorLogos.length < 4 && (
                      <label className={`${BTN_GHOST} flex-none cursor-pointer`}>
                        <ImagePlus className="h-4 w-4" />
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
                        <div
                          key={logo.id}
                          className="flex items-center gap-2 rounded-lg border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] p-2"
                        >
                          <div className="flex h-10 w-16 flex-none items-center justify-center rounded bg-[color:var(--ch-surface-3)] p-1">
                            <img src={logo.url} alt="" className="max-h-full max-w-full object-contain" />
                          </div>
                          <span className="min-w-0 flex-1 truncate text-xs text-[color:var(--ch-text-2)]">{logo.name}</span>
                          <button
                            type="button"
                            className={ICON_BTN}
                            disabled={index === 0}
                            onClick={() => moveSponsorLogo(index, -1)}
                            title="Move sponsor left"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className={ICON_BTN}
                            disabled={index === sponsorLogos.length - 1}
                            onClick={() => moveSponsorLogo(index, 1)}
                            title="Move sponsor right"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className={`${ICON_BTN} hover:!text-[color:var(--ch-loss)]`}
                            onClick={() => removeSponsorLogo(logo.id)}
                            title="Remove sponsor"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {halloweenSeason && (
              <label className="flex cursor-pointer items-center justify-center gap-2 text-[13px] text-[color:var(--ch-text-2)]" data-testid="toggle-halloween">
                <input
                  type="checkbox"
                  checked={halloweenTouch}
                  onChange={(e) => setHalloweenTouch(e.target.checked)}
                  className="h-4 w-4 accent-[#f97316]"
                />
                🎃 Halloween touch <span className="opacity-70">(cobweb and bats, until 7 Nov)</span>
              </label>
            )}

            <p className={`text-center ${HINT}`}>
              Card size: {selectedTemplate === "photo-overlay-reel" ? "1080×1920px (9:16 Reel cover)" : "1080×1350px (Instagram portrait)"}
            </p>
          </Panel>
        </div>
      </div>

      <PostQueueSection 
        cards={queueCards} 
        template={cardTemplate}
        loading={queueLoading} 
        onRemove={handleRemoveFromQueue}
        onClear={handleClearQueue}
      />
    </div>
  );
}
