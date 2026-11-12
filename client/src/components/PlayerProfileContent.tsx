import { useState, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { gamePath, playerSeoDescription, playerSeoTitle, teamPath } from "@shared/seo";
import { playerBio } from "@shared/recaps";
import EntityLink from "@/components/EntityLink";
import { useAskScope } from "@/components/ask-swish/AskSwishProvider";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { getTeamAbbreviation } from "@/lib/teamUtils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy, Instagram, LayoutDashboard, BarChart3, CalendarDays, Crosshair, Award, Lock, X as XIcon, BadgeCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { normalizeInstagramHandle } from "@/lib/instagram";
import {
  ALL_SEASONS,
  filterSlug,
  leagueFamilyName,
  readProfileFilter,
  seasonForCompetition,
  writeProfileFilter,
  type ProfileFilterState,
  type SeasonInfo,
} from "@/lib/profileFilter";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerBanner } from "@/components/PlayerBanner";
import { PlayerPerformanceSplits } from "@/components/PlayerPerformanceSplits";
import { PillTabBar } from "@/components/PillTabBar";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { useReadableTeamColor } from "@/hooks/useReadableColor";
import { namesMatch, getMostCompleteName, slugToName, type PlayerMatch } from "@/lib/fuzzyMatch";
import { formatPlayerDisplayName } from "@/lib/playerName";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ShotChart, { type ShotData } from "@/components/ShotChart";
import { generateShotChartCardBlob, generateStatTilesCardBlob } from "@/lib/generateProfileCards";
import ShareableCard from "@/components/ShareableCard";
import { FlatStat, StatBar } from "@/components/FlatStat";
import { parseMinutesPlayed, playedInGame } from "@/lib/gamesPlayed";
import { extractColorsFromImage } from "@/lib/colorExtractor";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import { useHeadshotUrl } from "@/components/PlayerHeadshot";
import { uploadHeadshotVariants } from "@/lib/headshotVariants";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { selectProfileMatches } from "@/lib/profileMatches";
import PreferredNameControl from "@/components/PreferredNameControl";
import TradingCard, { type TradingCardPerformance } from "@/components/cards/TradingCard";
import { requestTiltPermission } from "@/components/cards/TiltCard";
import { computeSwishScoreFor } from "@/lib/performanceCardUtils";
import { computePastSeasonAccolades, computePlayerAccolades } from "@/lib/accolades";
import { AccoladeChips, AccoladeCollection } from "@/components/cards/AccoladeCollection";
import type { AccoladeCardPlayer } from "@/components/cards/AccoladeCard";
import { fetchPlayerRecordMaxes, type RecordMaxes } from "@/lib/recordMaxes";
import { stopLabel } from "@/lib/leagueChildren";
import { useGameLogOnOff } from "@/hooks/useGameLogOnOff";

const EMPTY_RECORD_MAXES: RecordMaxes = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0 };

// Only the columns actually consumed by this profile view, so we never
// pull every column of the (wide) players table on a cold load.
//
// IMPORTANT: every entry must be a real column on the `players` table.
// An earlier draft listed aliased fields (`name`, `team`, `number`,
// `height`) that don't exist on the table, which caused the slug
// lookup to silently fail with "column does not exist" and render
// "Player Not Found". Downstream code already falls back to
// `team_name`, `shirtNumber`, and `height_cm` when alias fields are
// absent.
const PLAYER_PROFILE_COLUMNS =
  "id, slug, full_name, team_id, team_name, position, shirtNumber, league_id, photo_path_bg_removed, photo_path, photo_focus_y, height_cm, current_team";
// date_of_birth / social_instagram aren't publicly readable on `players`; they
// come from get_player_public_details, which only returns them for verified adults.

interface PlayerStat {
  id: string;
  player_id: string;
  game_id?: string;
  name?: string;
  player_name?: string;
  team_name?: string;
  team?: string;
  game_date: string;
  opponent?: string;
  is_home_player?: boolean;
  away_team?: string;
  home_team?: string;
  points?: number;
  rebounds_total?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  field_goals_made?: number;
  field_goals_attempted?: number;
  three_pointers_made?: number;
  three_pointers_attempted?: number;
  free_throws_made?: number;
  free_throws_attempted?: number;
  minutes_played?: number;
  league_id?: string;
  user_id?: string;
  firstname?: string;
  familyname?: string;
  full_name?: string;
  spoints?: number;
  sreboundstotal?: number;
  sassists?: number;
  ssteals?: number;
  sblocks?: number;
  sfieldgoalsmade?: number;
  sfieldgoalsattempted?: number;
  sthreepointersmade?: number;
  sthreepointersattempted?: number;
  sfreethrowsmade?: number;
  sfreethrowsattempted?: number;
  sminutes?: string;
  sturnovers?: number;
  turnovers?: number;
  created_at?: string;
  game_key?: string;
  players?: {
    full_name?: string;
    league_id?: string;
  };
}

/** "+7", "−3", "0" for the game log's on/off columns. */
const signedNumber = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');
const onOffTone = (v: number | undefined) =>
  v == null || v === 0
    ? 'text-[color:var(--ch-text-2)]'
    : v > 0 ? 'text-[color:var(--ch-win)]' : 'text-[color:var(--ch-loss)]';

interface SeasonAverages {
  games_played: number;
  avg_points: number;
  avg_rebounds: number;
  avg_assists: number;
  avg_steals: number;
  avg_blocks: number;
  fg_percentage: number;
  three_point_percentage: number;
  ft_percentage: number;
  avg_efficiency: number;
}

interface PlayerRankings {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fg_percentage: number;
  three_point_percentage: number;
  ft_percentage: number;
}


type ProfileTab = 'overview' | 'stats' | 'games' | 'splits' | 'accolades';
const PROFILE_TABS: ProfileTab[] = ['overview', 'stats', 'games', 'splits', 'accolades'];

interface PlayerProfileContentProps {
  playerSlug: string;
  brandColorOverride?: string;
  onBack?: () => void;
  linkedPlayerIds?: string[];
  /** Set the page title/description once the profile has loaded (the
   *  standalone /player page; not when shown inside a league page). */
  manageHead?: boolean;
}

/** One competition the player has games in, placed in a season and a league. */
interface CompetitionFacet {
  leagueId: string;
  name: string;
  /** filterSlug of familyName: the ?league= value. */
  familyKey: string;
  /** The league without its season ("NBL Division One"). */
  familyName: string;
  season: SeasonInfo;
  /** Time of the player's latest game in it. */
  last: number;
}

interface LeagueFamily {
  key: string;
  name: string;
  seasons: Set<string>;
  last: number;
}

const UNKNOWN_SEASON: SeasonInfo = { key: 'other', label: 'Other games', order: -1 };

interface ProfileFilterBarProps {
  seasons: SeasonInfo[];
  families: LeagueFamily[];
  /** The season in view, or ALL_SEASONS. */
  seasonValue: string;
  /** The league in view, or "" for every league. */
  leagueValue: string;
  onSeasonChange: (season: string) => void;
  onLeagueChange: (league: string) => void;
}

/**
 * Season and league pickers for the whole profile. Native selects: they cope
 * with long lists and open the phone's own picker.
 */
function ProfileFilterBar({ seasons, families, seasonValue, leagueValue, onSeasonChange, onLeagueChange }: ProfileFilterBarProps) {
  const showSeason = seasons.length > 1;
  const showLeague = families.length > 1;
  if (!showSeason && !showLeague) return null;
  // Leagues the player played in during the chosen season.
  const leagueOptions = seasonValue === ALL_SEASONS
    ? families
    : families.filter((f) => f.seasons.has(seasonValue) || f.key === leagueValue);
  const selectClass = 'ch-input h-9 w-full sm:w-auto min-w-0 sm:max-w-[18rem] cursor-pointer pl-3 pr-8 text-[13px] font-medium truncate';
  return (
    <div className={`grid ${showSeason && showLeague ? 'grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : 'grid-cols-1'} sm:flex sm:items-center gap-2 w-full sm:w-auto`} data-testid="player-profile-filter">
      {showSeason && (
        <select
          value={seasonValue}
          onChange={(e) => onSeasonChange(e.target.value)}
          aria-label="Season"
          className={selectClass}
          data-testid="player-season-filter"
        >
          {seasons.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
          <option value={ALL_SEASONS}>All seasons</option>
        </select>
      )}
      {showLeague && (
        <select
          value={leagueValue}
          onChange={(e) => onLeagueChange(e.target.value)}
          aria-label="League"
          className={selectClass}
          data-testid="player-league-filter"
        >
          <option value="">All leagues</option>
          {leagueOptions.map((f) => (
            <option key={f.key} value={f.key}>{f.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export function PlayerProfileContent({ playerSlug, brandColorOverride, onBack, linkedPlayerIds, manageHead = false }: PlayerProfileContentProps) {
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
  const [seasonAverages, setSeasonAverages] = useState<SeasonAverages | null>(null);
  const [playerRankings, setPlayerRankings] = useState<PlayerRankings | null>(null);
  const [playerInfo, setPlayerInfo] = useState<{ name: string; team: string; position?: string; number?: number; leagueId?: string; playerId?: string; photoPath?: string | null; sharePhotoPath?: string | null; photoFocusY?: number | null; previousTeams?: string[]; height?: string | null; heightCm?: number | null; dateOfBirth?: string | null; instagramUrl?: string | null; instagramHandle?: string | null; dbCurrentTeam?: string | null; dbPreviousTeams?: string[] | null } | null>(null);
  const [playerLeagues, setPlayerLeagues] = useState<{ id: string; name: string; slug: string }[]>([]);
  // Ask Swish answers about this player by default while the profile is open.
  useAskScope(playerInfo?.name ? {
    playerName: playerInfo.name,
    playerId: playerInfo.playerId ?? null,
    teamName: playerInfo.team || null,
    leagueId: playerInfo.leagueId ?? playerLeagues[0]?.id ?? null,
    leagueName: playerLeagues.find((l) => l.id === playerInfo.leagueId)?.name ?? playerLeagues[0]?.name ?? null,
    leagueSlug: playerLeagues.find((l) => l.id === playerInfo.leagueId)?.slug ?? playerLeagues[0]?.slug ?? null,
  } : null);
  const [playerMatches, setPlayerMatches] = useState<PlayerMatch[]>([]);
  // Every id whose games the profile shows: name matches, identity links, linked ids.
  const [statsPlayerIds, setStatsPlayerIds] = useState<string[]>([]);
  const [nameVariations, setNameVariations] = useState<string[]>([]);
  // Season + league for every tab, read from and kept in the URL.
  const [filter, setFilter] = useState<ProfileFilterState>(() => readProfileFilter(window.location.search));
  const [singleLeagueBrandColor, setSingleLeagueBrandColor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [leagueNames, setLeagueNames] = useState<Map<string, string>>(new Map());
  const [leagueSlugs, setLeagueSlugs] = useState<Map<string, string>>(new Map());
  const [competitionParentMap, setCompetitionParentMap] = useState<Map<string, string>>(new Map());
  const [playerShotChartRange, setPlayerShotChartRange] = useState<string>("season");
  const [careerStatsTab, setCareerStatsTab] = useState<string>("averages");
  // ?tab= opens a section directly (e.g. back to the games after signing in).
  const [activeTab, setActiveTab] = useState<ProfileTab>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') as ProfileTab | null;
    return tab && PROFILE_TABS.includes(tab) ? tab : 'overview';
  });
  const [photoUploading, setPhotoUploading] = useState(false);
  // Cache-buster appended to photo URLs so the browser/CDN doesn't serve a
  // stale (cached) version of the same storage path. Initialized to 0 so a
  // normal page visit reuses the existing CDN cache (Date.now() on every
  // mount was forcing a fresh fetch on every visit and noticeably delaying
  // the banner photo). Only bumped after a successful upload so the freshly
  // uploaded image appears immediately.
  const [photoCacheBuster, setPhotoCacheBuster] = useState<number>(0);
  const [showFocusAdjuster, setShowFocusAdjuster] = useState(false);
  const [tempFocusY, setTempFocusY] = useState<number>(50);
  const [savingFocus, setSavingFocus] = useState(false);
  const [selectedGameForCard, setSelectedGameForCard] = useState<PlayerStat | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── The profile filter: one season + one league for every tab ────────────
  // Declared early so they are initialised before any useEffect that
  // references them (avoids temporal dead zone errors).

  // Every competition the player has games in, with its season and league.
  const competitionIndex = useMemo(() => {
    const latest = new Map<string, number>();
    for (const s of playerStats) {
      if (!s.league_id) continue;
      const t = new Date(s.game_date || s.created_at || '').getTime();
      const prev = latest.get(s.league_id);
      if (prev === undefined || Number.isNaN(prev) || t > prev) latest.set(s.league_id, t);
    }
    const index = new Map<string, CompetitionFacet>();
    for (const [leagueId, last] of Array.from(latest.entries())) {
      const name = leagueNames.get(leagueId) || '';
      const parentId = competitionParentMap.get(leagueId);
      const parentName = parentId && parentId !== leagueId ? leagueNames.get(parentId) || '' : '';
      const season = seasonForCompetition([name, parentName], Number.isNaN(last) ? null : last) ?? UNKNOWN_SEASON;
      // Competitions grouped under a parent (REBA stops, age groups) take its name.
      const familyName = leagueFamilyName(parentName || name || 'Other games');
      index.set(leagueId, {
        leagueId,
        name: name || 'Competition',
        familyKey: filterSlug(familyName) || leagueId,
        familyName,
        season,
        last: Number.isNaN(last) ? 0 : last,
      });
    }
    return index;
  }, [playerStats, leagueNames, competitionParentMap]);

  // Newest first.
  const filterSeasons = useMemo(() => {
    const byKey = new Map<string, SeasonInfo>();
    for (const c of Array.from(competitionIndex.values())) byKey.set(c.season.key, c.season);
    return Array.from(byKey.values()).sort((a, b) => b.order - a.order);
  }, [competitionIndex]);

  // Most recently played first.
  const leagueFamilies = useMemo(() => {
    const byKey = new Map<string, LeagueFamily>();
    for (const c of Array.from(competitionIndex.values())) {
      let f = byKey.get(c.familyKey);
      if (!f) {
        f = { key: c.familyKey, name: c.familyName, seasons: new Set(), last: 0 };
        byKey.set(c.familyKey, f);
      }
      f.seasons.add(c.season.key);
      f.last = Math.max(f.last, c.last);
    }
    return Array.from(byKey.values()).sort((a, b) => b.last - a.last);
  }, [competitionIndex]);

  const leagueFamily = filter.league ? leagueFamilies.find((f) => f.key === filter.league) ?? null : null;

  // No ?season= means the latest season (of the chosen league, if there is one).
  const activeSeason = useMemo<SeasonInfo | null>(() => {
    if (filter.season === ALL_SEASONS) return null;
    if (filter.season) return filterSeasons.find((s) => s.key === filter.season) ?? null;
    if (filterSeasons.length < 2) return null;
    const pool = leagueFamily ? filterSeasons.filter((s) => leagueFamily.seasons.has(s.key)) : filterSeasons;
    return pool[0] ?? null;
  }, [filter.season, filterSeasons, leagueFamily]);

  // The competitions in view; null when nothing is filtered out.
  const scopeLeagueIds = useMemo(() => {
    if (!activeSeason && !leagueFamily) return null;
    const ids = new Set<string>();
    for (const c of Array.from(competitionIndex.values())) {
      if (activeSeason && c.season.key !== activeSeason.key) continue;
      if (leagueFamily && c.familyKey !== leagueFamily.key) continue;
      ids.add(c.leagueId);
    }
    return ids;
  }, [activeSeason, leagueFamily, competitionIndex]);
  const scopeKey = scopeLeagueIds ? Array.from(scopeLeagueIds).sort().join(',') : 'all';
  const inScope = (leagueId?: string | null) => !scopeLeagueIds || (!!leagueId && scopeLeagueIds.has(leagueId));

  // "BCB Trophy · 2025-26", "2025-26", "BCB Trophy", or null for everything.
  const scopeLabel = [leagueFamily?.name, activeSeason?.label].filter(Boolean).join(' · ') || null;
  const seasonSelectValue = activeSeason?.key ?? ALL_SEASONS;

  const changeSeason = (season: string) => {
    setFilter((prev) => {
      const family = prev.league ? leagueFamilies.find((f) => f.key === prev.league) : undefined;
      // A league the player didn't play in that season would leave nothing to show.
      const keepLeague = !!family && (season === ALL_SEASONS || family.seasons.has(season));
      return { season, league: keepLeague ? prev.league : null };
    });
  };
  const changeLeague = (league: string) => {
    setFilter((prev) => ({ season: prev.season ?? activeSeason?.key ?? null, league: league || null }));
  };

  // The filter lives in the URL, so a refresh or a shared link keeps it.
  useEffect(() => {
    writeProfileFilter(filter);
  }, [filter]);

  // Another player in the same view starts from that page's own URL.
  const filterPlayerRef = useRef(playerSlug);
  useEffect(() => {
    if (filterPlayerRef.current === playerSlug) return;
    filterPlayerRef.current = playerSlug;
    setFilter(readProfileFilter(window.location.search));
  }, [playerSlug]);

  // Older links named one competition (?league=<competition slug or id>).
  // Once the names are in, turn that into its league and season.
  useEffect(() => {
    const raw = filter.league;
    if (!raw || leagueSlugs.size === 0 || leagueFamilies.some((f) => f.key === raw)) return;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const id = UUID_RE.test(raw) ? raw : Array.from(leagueSlugs.entries()).find(([, s]) => s === raw)?.[0];
    if (!id) return;
    const comp = competitionIndex.get(id);
    if (comp) {
      setFilter((prev) => ({ league: comp.familyKey, season: prev.season ?? comp.season.key }));
      return;
    }
    // A parent league: every season of its competitions.
    const child = Array.from(competitionIndex.values()).find((c) => competitionParentMap.get(c.leagueId) === id);
    if (child) setFilter((prev) => ({ league: child.familyKey, season: prev.season ?? ALL_SEASONS }));
  }, [filter.league, leagueSlugs, leagueFamilies, competitionIndex, competitionParentMap]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab === 'overview') params.delete('tab');
    else params.set('tab', activeTab);
    const search = params.toString();
    window.history.replaceState(window.history.state, '', search ? `${window.location.pathname}?${search}` : window.location.pathname);
  }, [activeTab]);

  // The newest game in view decides the team and league the banner shows.
  const latestScopedStat = useMemo(() => {
    if (!scopeLeagueIds) return null;
    let best: PlayerStat | null = null;
    let bestTime = -Infinity;
    for (const s of playerStats) {
      if (!s.league_id || !scopeLeagueIds.has(s.league_id)) continue;
      const t = new Date(s.game_date || s.created_at || '').getTime();
      if (best === null || t > bestTime) { best = s; bestTime = t; }
    }
    return best;
  }, [playerStats, scopeLeagueIds]);

  const teamBrandingLeagueId = latestScopedStat?.league_id || playerInfo?.leagueId || "";
  const teamNameForBranding = (latestScopedStat && (latestScopedStat.team_name || latestScopedStat.team)?.trim()) || playerInfo?.team || "";

  // A chosen league brings its own colour (brand_primary_colour, else the
  // colour of its logo, as league pages do).
  const hasLeagueFilter = !!leagueFamily;
  const leagueBrandId = hasLeagueFilter ? teamBrandingLeagueId : '';
  useEffect(() => {
    if (!leagueBrandId) {
      setSingleLeagueBrandColor(null);
      return;
    }
    const leagueId = leagueBrandId;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/league-logo/${encodeURIComponent(leagueId)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        // 1. Prefer the stored brand colour
        if (data?.brand_primary_colour) {
          setSingleLeagueBrandColor(data.brand_primary_colour);
          return;
        }
        // 2. Fall back: extract dominant color from the league logo image
        if (data?.logo_url) {
          const fullUrl = data.logo_url.startsWith('http')
            ? data.logo_url
            : `${window.location.origin}${data.logo_url}`;
          const extracted = await extractColorsFromImage(fullUrl);
          if (!cancelled && extracted?.primary) {
            setSingleLeagueBrandColor(extracted.primary);
            return;
          }
        }
        if (!cancelled) setSingleLeagueBrandColor(null);
      } catch {
        if (!cancelled) setSingleLeagueBrandColor(null);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueBrandId]);

  // Clickable league/team chips shown on the banner, for cross-navigation to
  // the currently-displayed league and team (mirrors teamBrandingLeagueId /
  // teamNameForBranding so the chips always match what the banner shows).
  const bannerLeagueChip = useMemo(() => {
    if (!teamBrandingLeagueId) return undefined;
    const slug = leagueSlugs.get(teamBrandingLeagueId);
    const name = leagueNames.get(teamBrandingLeagueId);
    if (!slug || !name) return undefined;
    return { label: name, href: `/competition/${slug}`, onClick: () => setLocation(`/competition/${slug}`) };
  }, [teamBrandingLeagueId, leagueSlugs, leagueNames, setLocation]);

  const bannerTeamChip = useMemo(() => {
    if (!teamBrandingLeagueId || !teamNameForBranding) return undefined;
    const slug = leagueSlugs.get(teamBrandingLeagueId);
    if (!slug) return undefined;
    const href = teamPath(teamNameForBranding, slug) || `/team/${encodeURIComponent(teamNameForBranding)}`;
    return { label: teamNameForBranding, href, onClick: () => setLocation(href) };
  }, [teamBrandingLeagueId, teamNameForBranding, leagueSlugs, setLocation]);

  // Always try the displayed team's logo, including inline profiles that pass
  // the parent league colour as an override. That override is only a fallback.
  const { colors: teamBrandingColors, primaryColor: brandedPrimary } = useTeamBranding({
    teamName: teamNameForBranding,
    leagueId: teamBrandingLeagueId,
    enabled: !!teamNameForBranding && !!teamBrandingLeagueId,
  });

  // A colour extracted from the displayed team's logo takes priority. League
  // colours remain the fallback when the team has no usable logo.
  const primaryColor =
    teamBrandingColors?.primary ||
    (hasLeagueFilter ? singleLeagueBrandColor : brandColorOverride) ||
    singleLeagueBrandColor ||
    brandedPrimary;
  const readablePrimary = useReadableTeamColor(primaryColor);

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !playerInfo?.playerId) return;

    setPhotoUploading(true);
    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `${playerInfo.playerId}/primary.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('player-photos')
        .upload(filePath, file, {
          upsert: true,
          // Short cache so subsequent uploads aren't served from the CDN cache.
          cacheControl: '60',
          // Explicit content type preserves the PNG MIME (and its alpha channel)
          // even if the browser's File.type is empty for some reason.
          contentType: file.type || (fileExtension === 'png' ? 'image/png' : undefined),
        });

      if (uploadError) throw uploadError;

      // Regenerate the web-sized variants for this path, so avatars and the
      // banner show the new photo rather than a stale thumbnail of the old one.
      await uploadHeadshotVariants(file, filePath);

      const { error: updateError } = await supabase
        .from('players')
        .update({ photo_path_bg_removed: filePath })
        .eq('id', playerInfo.playerId);

      if (updateError) throw updateError;

      // Also update every other record that shares the same name across leagues
      // so the photo appears consistently on every competition page.
      // Uses fuzzy matching (namesMatch) to catch abbreviated/alternate spellings
      // like "M. Hosten" or "Elvis" vs "Elvisi".
      if (playerInfo.name) {
        const nameParts = playerInfo.name.trim().split(/\s+/);
        const lastName = nameParts[nameParts.length - 1];
        const { data: candidates } = await supabase
          .from('players')
          .select('id, full_name')
          .ilike('full_name', `%${lastName}%`)
          .neq('id', playerInfo.playerId);
        const matchIds = (candidates || [])
          .filter((r: { id: string; full_name: string }) => namesMatch(r.full_name, playerInfo.name!))
          .map((r: { id: string }) => r.id);
        if (matchIds.length > 0) {
          await supabase
            .from('players')
            .update({ photo_path_bg_removed: filePath })
            .in('id', matchIds);
        }
      }

      setPlayerInfo(prev => prev ? { ...prev, photoPath: filePath } : null);
      // Bust browser/CDN cache so the freshly uploaded image is shown immediately.
      setPhotoCacheBuster(Date.now());
      setShowFocusAdjuster(true);
      setTempFocusY(50);

      toast({
        title: "Photo uploaded",
        description: "Adjust the focus point to ensure the face is visible",
      });
    } catch (error: any) {
      console.error('Photo upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload photo",
        variant: "destructive",
      });
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveFocus = async () => {
    if (!playerInfo?.playerId) return;

    setSavingFocus(true);
    try {
      const { error } = await supabase
        .from('players')
        .update({ photo_focus_y: tempFocusY })
        .eq('id', playerInfo.playerId);

      if (error) throw error;

      setPlayerInfo(prev => prev ? { ...prev, photoFocusY: tempFocusY } : null);
      setShowFocusAdjuster(false);

      toast({
        title: "Focus saved",
        description: "Photo positioning has been updated",
      });
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message || "Failed to save focus position",
        variant: "destructive",
      });
    } finally {
      setSavingFocus(false);
    }
  };

  const getOrdinalSuffix = (num: number): string => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return num + "st";
    if (j === 2 && k !== 12) return num + "nd";
    if (j === 3 && k !== 13) return num + "rd";
    return num + "th";
  };

  const calculateRankings = async (leagueId: string, currentAverages: SeasonAverages, playerName: string, knownPlayerIds: string[] = []): Promise<PlayerRankings | null> => {
    try {
      // Narrow column set + pagination. A `select('*')` over an entire
      // league's player_stats (often 5k+ rows for full-season leagues like
      // NBL Division One) frequently exceeds the 30s Supabase
      // statement_timeout, which previously left the player profile stuck
      // on the "Loading…" spinner. Selecting only the box-score fields the
      // ranking math actually consumes drops query weight by ~10x and lets
      // us page through past the default 1000-row cap.
      const RANK_COLUMNS = [
        'player_id', 'full_name', 'firstname', 'familyname',
        'sminutes',
        'spoints', 'sreboundstotal', 'sassists', 'ssteals', 'sblocks',
        'sfieldgoalsmade', 'sfieldgoalsattempted',
        'sthreepointersmade', 'sthreepointersattempted',
        'sfreethrowsmade', 'sfreethrowsattempted',
      ].join(',');
      const PAGE_SIZE = 1000;
      const MAX_PAGES = 20; // hard ceiling: 20k rows
      const allStats: any[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from('player_stats')
          .select(RANK_COLUMNS)
          .eq('league_id', leagueId)
          .range(from, to);
        if (error) {
          console.warn('[Rankings] page', page, 'error:', error.message);
          break;
        }
        if (!data || data.length === 0) break;
        allStats.push(...data);
        if (data.length < PAGE_SIZE) break;
      }

      if (!allStats || allStats.length === 0) return null;

      const playedStats = allStats.filter(stat => playedInGame(stat));
      if (playedStats.length === 0) return null;

      const playerTotals = new Map<string, any>();
      const playerIdToKey = new Map<string, string>();

      playedStats.forEach(stat => {
        const pid: string | undefined = stat.player_id;
        const nameKey = (
          stat.full_name?.trim().replace(/\s+/g, ' ') ||
          `${stat.firstname || ''} ${stat.familyname || ''}`.trim().replace(/\s+/g, ' ') ||
          'unknown'
        ).toLowerCase();
        const key = pid || nameKey;

        if (!playerTotals.has(key)) {
          playerTotals.set(key, {
            points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
            fg_made: 0, fg_attempted: 0, three_made: 0, three_attempted: 0,
            ft_made: 0, ft_attempted: 0, games: 0
          });
        }
        if (pid) playerIdToKey.set(pid, key);

        const totals = playerTotals.get(key);
        totals.points += stat.spoints || 0;
        totals.rebounds += stat.sreboundstotal || 0;
        totals.assists += stat.sassists || 0;
        totals.steals += stat.ssteals || 0;
        totals.blocks += stat.sblocks || 0;
        totals.fg_made += stat.sfieldgoalsmade || 0;
        totals.fg_attempted += stat.sfieldgoalsattempted || 0;
        totals.three_made += stat.sthreepointersmade || 0;
        totals.three_attempted += stat.sthreepointersattempted || 0;
        totals.ft_made += stat.sfreethrowsmade || 0;
        totals.ft_attempted += stat.sfreethrowsattempted || 0;
        totals.games += 1;
      });

      let currentPlayerKey: string | null = null;

      for (const pid of knownPlayerIds) {
        if (playerIdToKey.has(pid)) {
          currentPlayerKey = playerIdToKey.get(pid)!;
          break;
        }
      }

      if (!currentPlayerKey) {
        const normalizedPlayerName = playerName.trim().replace(/\s+/g, ' ').toLowerCase();
        for (const key of playerTotals.keys()) {
          if (key === normalizedPlayerName) { currentPlayerKey = key; break; }
        }
        if (!currentPlayerKey) {
          const nameParts = normalizedPlayerName.split(' ').filter(p => p.length > 1);
          for (const key of playerTotals.keys()) {
            if (nameParts.every(part => key.includes(part))) { currentPlayerKey = key; break; }
          }
        }
        if (!currentPlayerKey) {
          const lastName = normalizedPlayerName.split(' ').pop() || '';
          if (lastName.length > 1) {
            for (const key of playerTotals.keys()) {
              if (key.includes(lastName)) { currentPlayerKey = key; break; }
            }
          }
        }
      }

      let poolAverages = currentAverages;
      if (currentPlayerKey) {
        const ct = playerTotals.get(currentPlayerKey)!;
        const cg = ct.games || 1;
        poolAverages = {
          games_played: cg,
          avg_points: ct.points / cg,
          avg_rebounds: ct.rebounds / cg,
          avg_assists: ct.assists / cg,
          avg_steals: ct.steals / cg,
          avg_blocks: ct.blocks / cg,
          fg_percentage: ct.fg_attempted > 0 ? (ct.fg_made / ct.fg_attempted) * 100 : 0,
          three_point_percentage: ct.three_attempted > 0 ? (ct.three_made / ct.three_attempted) * 100 : 0,
          ft_percentage: ct.ft_attempted > 0 ? (ct.ft_made / ct.ft_attempted) * 100 : 0,
          avg_efficiency: 0,
        };
      }

      const rankings: { [key: string]: number[] } = {
        points: [], rebounds: [], assists: [], steals: [], blocks: [],
        fg_percentage: [], three_point_percentage: [], ft_percentage: []
      };

      playerTotals.forEach((totals) => {
        const games = totals.games || 1;
        rankings.points.push(totals.points / games);
        rankings.rebounds.push(totals.rebounds / games);
        rankings.assists.push(totals.assists / games);
        rankings.steals.push(totals.steals / games);
        rankings.blocks.push(totals.blocks / games);
        rankings.fg_percentage.push(totals.fg_attempted > 0 ? (totals.fg_made / totals.fg_attempted) * 100 : 0);
        rankings.three_point_percentage.push(totals.three_attempted > 0 ? (totals.three_made / totals.three_attempted) * 100 : 0);
        rankings.ft_percentage.push(totals.ft_attempted > 0 ? (totals.ft_made / totals.ft_attempted) * 100 : 0);
      });

      if (!currentPlayerKey) {
        rankings.points.push(currentAverages.avg_points);
        rankings.rebounds.push(currentAverages.avg_rebounds);
        rankings.assists.push(currentAverages.avg_assists);
        rankings.steals.push(currentAverages.avg_steals);
        rankings.blocks.push(currentAverages.avg_blocks);
        rankings.fg_percentage.push(currentAverages.fg_percentage);
        rankings.three_point_percentage.push(currentAverages.three_point_percentage);
        rankings.ft_percentage.push(currentAverages.ft_percentage);
      }

      const calculateRank = (values: number[], current: number): number =>
        values.filter(val => val > current).length + 1;

      return {
        points: calculateRank(rankings.points, poolAverages.avg_points),
        rebounds: calculateRank(rankings.rebounds, poolAverages.avg_rebounds),
        assists: calculateRank(rankings.assists, poolAverages.avg_assists),
        steals: calculateRank(rankings.steals, poolAverages.avg_steals),
        blocks: calculateRank(rankings.blocks, poolAverages.avg_blocks),
        fg_percentage: calculateRank(rankings.fg_percentage, poolAverages.fg_percentage),
        three_point_percentage: calculateRank(rankings.three_point_percentage, poolAverages.three_point_percentage),
        ft_percentage: calculateRank(rankings.ft_percentage, poolAverages.ft_percentage),
      };
    } catch (error) {
      console.error("❌ Error calculating rankings:", error);
      return null;
    }
  };

  useEffect(() => {
    if (!playerSlug) return;

    // Track a scheduled transient-retry timeout so we can cancel it
    // when the slug changes or the component unmounts (avoids stale
    // state updates and orphaned retry churn).
    let pendingRetryTimeout: number | null = null;
    let cancelled = false;
    // Bound transient retries — three attempts (the original call + two
    // re-queues) is enough to ride out an auth/RLS bootstrap race
    // without spinning forever on a persistent backend outage.
    const MAX_TRANSIENT_RETRIES = 2;
    let transientRetryCount = 0;

    const fetchPlayerData = async () => {
      if (cancelled) return;
      setLoading(true);
      // When a transient retry is scheduled below we set this flag so
      // the function-level finally does not flip loading to false and
      // briefly render an empty profile shell between attempts.
      let scheduledTransientRetry = false;
      try {
        let initialPlayer: any = null;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerSlug);

        // Direct slug navigation races auth/session/RLS bootstrap, which
        // means the very first players-table lookup can transiently come
        // back empty (a PGRST116 "no rows" response) or with a network /
        // 5xx / statement-timeout error even though the slug is valid.
        // We therefore retry every empty/failing result exactly once with
        // a small backoff before surfacing the destructive "Player Not
        // Found" toast — only a *second* "no rows" response is treated
        // as a definitive miss.
        const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
        const isNoRowError = (err: { code?: string; message?: string } | null | undefined) =>
          !!err && (err.code === 'PGRST116' || /no rows|0 rows/i.test(err?.message || ''));

        type LookupOutcome<T> =
          | { kind: 'found'; data: T }
          | { kind: 'empty' }       // definitive: the row really does not exist
          | { kind: 'transient' };  // both attempts hit a non-deterministic failure

        const lookupWithRetry = async <T,>(
          run: () => Promise<{ data: T | null; error: { code?: string; message?: string } | null }>,
        ): Promise<LookupOutcome<T>> => {
          let lastWasNoRow = false;
          let lastWasTransient = false;
          for (let attempt = 0; attempt < 2; attempt++) {
            const { data, error } = await run();
            if (data) return { kind: 'found', data };
            if (!error || isNoRowError(error)) {
              lastWasNoRow = true;
              lastWasTransient = false;
            } else {
              lastWasTransient = true;
              lastWasNoRow = false;
            }
            if (attempt === 0) await sleep(400);
          }
          if (lastWasNoRow) return { kind: 'empty' };
          if (lastWasTransient) return { kind: 'transient' };
          return { kind: 'empty' };
        };

        let lookupTransient = false;

        type PlayerRow = Record<string, any>;

        if (isUUID) {
          const r = await lookupWithRetry<PlayerRow>(() =>
            supabase.from('players').select(PLAYER_PROFILE_COLUMNS).eq('id', playerSlug).single()
          );
          if (r.kind === 'found') initialPlayer = r.data;
          if (r.kind === 'transient') lookupTransient = true;
        } else {
          const r = await lookupWithRetry<PlayerRow>(() =>
            supabase.from('players').select(PLAYER_PROFILE_COLUMNS).eq('slug', playerSlug).single()
          );
          if (r.kind === 'found') initialPlayer = r.data;
          if (r.kind === 'transient') lookupTransient = true;

          if (!initialPlayer && !lookupTransient) {
            // Step 1: re-query by slug without .single() — recovers from
            // transient PGRST116 failures on the primary lookup and also
            // handles hyphenated surnames (e.g. "Wise-Malcolm") where
            // slugToName() would convert the hyphen to a space, breaking
            // the name-based fallback below.
            const slugReRun = async () => {
              const { data, error } = await supabase
                .from('players')
                .select(PLAYER_PROFILE_COLUMNS)
                .eq('slug', playerSlug)
                .limit(1);
              const rows = data ?? [];
              return { data: rows.length > 0 ? rows[0] : null, error };
            };
            const slugRetry = await lookupWithRetry<PlayerRow>(slugReRun);
            if (slugRetry.kind === 'found') initialPlayer = slugRetry.data;
            if (slugRetry.kind === 'transient') lookupTransient = true;
          }

          if (!initialPlayer && !lookupTransient) {
            const searchName = slugToName(playerSlug);
            // Step 2: name-based ilike search for legacy slugs that have no
            // `slug` column entry yet.
            //
            // NOTE: slugToName converts all hyphens to spaces, so hyphenated
            // surnames won't match here — that's why we do the slug re-query
            // above first as the primary recovery path.
            const fallbackRun = async () => {
              const { data, error } = await supabase
                .from('players')
                .select(PLAYER_PROFILE_COLUMNS)
                .ilike('full_name', `${searchName}%`)
                .limit(10);
              const rows = data ?? [];
              return {
                data: rows.length > 0 ? rows : null,
                error,
              };
            };
            const fallback = await lookupWithRetry<PlayerRow[]>(fallbackRun);
            if (fallback.kind === 'transient') lookupTransient = true;
            if (fallback.kind === 'found') {
              initialPlayer =
                fallback.data.find((player) => namesMatch(player.full_name, searchName)) ||
                fallback.data[0];
            }
          }
        }

        if (!initialPlayer) {
          // Bail without toasting if the user navigated away or the
          // slug changed while our awaited lookups were in flight —
          // avoids a stale toast firing on a no-longer-mounted view.
          if (cancelled) return;
          if (lookupTransient) {
            if (transientRetryCount < MAX_TRANSIENT_RETRIES) {
              // Re-queue with the loading skeleton still visible.
              transientRetryCount++;
              scheduledTransientRetry = true;
              console.warn(
                `Player lookup transient failure (attempt ${transientRetryCount}/${MAX_TRANSIENT_RETRIES}), retrying:`,
                playerSlug,
              );
              pendingRetryTimeout = window.setTimeout(() => {
                pendingRetryTimeout = null;
                if (!cancelled) fetchPlayerData();
              }, 1500);
              return;
            }
            // Exhausted retries on a transient backend failure — this
            // is NOT a definitive "no such player", so surface a
            // generic load error instead of the misleading
            // "Player Not Found" toast.
            console.error('Player lookup transient failure exhausted:', playerSlug);
            toast({
              title: "Couldn't load player",
              description: "We're having trouble reaching the server. Please try again in a moment.",
              variant: "destructive",
            });
            return;
          }
          // Definitive no-row result after the retry — the slug really
          // doesn't map to a player.
          console.error('❌ Could not find player:', playerSlug);
          toast({
            title: "Player Not Found",
            description: "Could not find player with the specified identifier",
            variant: "destructive",
          });
          return;
        }

        const searchTerms = initialPlayer.full_name.split(' ').filter((t: string) => t.length > 2);
        const searchQuery = searchTerms[searchTerms.length - 1] || initialPlayer.full_name;

        // ── Identity group lookup ──────────────────────────────────────────────
        // Check whether this player belongs to a canonical identity group.
        // If so, we fetch all linked player_id rows directly — this is more
        // reliable than fuzzy name matching for players with name variations
        // across leagues (e.g. "Elvis" vs "Elvisi", "M. Hosten" vs "Myles Hosten").
        //
        let identityLinkedIds: string[] = [];
        try {
          const identityRes = await fetch(`/api/player-identities/for-player/${initialPlayer.id}`);
          if (identityRes.ok) {
            const { identity } = await identityRes.json();
            if (identity?.playerIds && Array.isArray(identity.playerIds)) {
              const dbLinked = identity.playerIds.filter((id: string) => id !== initialPlayer.id);
              // Merge DB-linked IDs without duplicating already-seeded ones
              const seen = new Set(identityLinkedIds);
              dbLinked.forEach((id: string) => { if (!seen.has(id)) { seen.add(id); identityLinkedIds.push(id); } });
            }
          }
        } catch {
          // Non-fatal — fall through to fuzzy matching below
        }

        // Every player row with the surname as a word, for namesMatch to sort
        // out (middle initials, suffixes, nicknames). The search term is the
        // last significant token (typically a surname). No row cap: a common
        // surname has well over a hundred rows once past seasons are in, and
        // a cap dropped the player's own older rows at random. Read in pages
        // of 1000 (the API's per-request maximum), ordered so pages don't overlap.
        const surnameLike = `${searchQuery.replace(/[,()*%\\]/g, '')}%`;
        const SURNAME_PAGE = 1000;
        const allPlayersData: any[] = [];
        for (let from = 0; from < 20 * SURNAME_PAGE; from += SURNAME_PAGE) {
          const { data: page, error: pageError } = await supabase
            .from('players').select(PLAYER_PROFILE_COLUMNS)
            // The surname as a word, not any substring: "%Saa%" would also catch every "Isaac".
            .or(`full_name.ilike.${surnameLike},full_name.ilike.% ${surnameLike}`)
            .order('id')
            .range(from, from + SURNAME_PAGE - 1);
          if (pageError) { console.warn("[PlayerProfile] name candidates:", pageError.message); break; }
          allPlayersData.push(...(page || []));
          if (!page || page.length < SURNAME_PAGE) break;
        }

        const identityPlayersRes = identityLinkedIds.length > 0
          ? await supabase.from('players').select(PLAYER_PROFILE_COLUMNS).in('id', identityLinkedIds)
          : { data: null as any, error: null };

        // Always keep the slug-resolved `initialPlayer` in the candidate set —
        // with the tighter limit, a common surname could push the canonical
        // record off the ilike result, breaking the namesMatch dedupe and
        // leaving `playerIds` empty for the stats fetch below.
        const seen = new Set<string>([initialPlayer.id]);
        let allPlayers: any[] = [initialPlayer];

        if (allPlayersData.length > 0) {
          allPlayers = [
            initialPlayer,
            ...allPlayersData.filter((p: any) => {
              if (!p?.id || seen.has(p.id)) return false;
              seen.add(p.id);
              return true;
            }),
          ];
        }

        // Inject any identity-group linked players that weren't caught by the
        // fuzzy name search (e.g. different surnames, initialised first names).
        if (identityPlayersRes.data && identityPlayersRes.data.length > 0) {
          for (const p of identityPlayersRes.data) {
            if (p?.id && !seen.has(p.id)) {
              seen.add(p.id);
              allPlayers.push(p);
            }
          }
        }

        // Filter by fuzzy name match OR explicit identity link
        const identityIdSet = new Set(identityLinkedIds);
        const matchingPlayers = selectProfileMatches(allPlayers, initialPlayer, identityIdSet);

        const matches: PlayerMatch[] = matchingPlayers.map(p => ({
          id: p.id,
          name: p.name || p.full_name,
          full_name: p.full_name,
          team: p.team_name || p.team,
          league_id: p.league_id,
          position: p.position,
          number: p.shirtNumber ?? p.number,
          slug: p.slug,
          matchScore: 1.0,
        }));

        setPlayerMatches(matches);

        const variations = Array.from(new Set(matches.map(m => m.full_name)));
        setNameVariations(variations);

        const canonicalName =
          formatPlayerDisplayName(initialPlayer.full_name) ||
          formatPlayerDisplayName(getMostCompleteName(variations));

        // In parent leagues (e.g. REBA SL) the same physical player has one
        // row per age-group competition. Only one row typically has
        // photo_path_bg_removed set — whichever competition received the
        // upload first. If the slug resolved to the photo-less record, scan
        // all fuzzy-matched rows and use the first photo we find so the
        // banner always renders the photo regardless of which record was
        // clicked.
        const photoSourceRecord = matchingPlayers.find(p => p.photo_path_bg_removed) ?? null;
        const bestPhotoBgRemoved: string | null = photoSourceRecord?.photo_path_bg_removed ?? null;
        const bestPhotoPath: string | null =
          matchingPlayers.find(p => p.photo_path)?.photo_path ?? null;
        // Use the focus-Y from whichever record owns the photo so the crop
        // position is always in sync with the image being displayed.
        const bestPhotoFocusY: number | null =
          initialPlayer.photo_path_bg_removed
            ? (initialPlayer.photo_focus_y ?? null)
            : (photoSourceRecord?.photo_focus_y ?? null);

        let pInfo = {
          name: canonicalName,
          team: initialPlayer.team_name || initialPlayer.team,
          position: initialPlayer.position,
          number: initialPlayer.shirtNumber ?? initialPlayer.number,
          leagueId: initialPlayer.league_id,
          playerId: initialPlayer.id,
          photoPath: initialPlayer.photo_path_bg_removed || bestPhotoBgRemoved,
          sharePhotoPath: initialPlayer.photo_path || bestPhotoPath,
          photoFocusY: bestPhotoFocusY,
          height: initialPlayer.height || null,
          heightCm: initialPlayer.height_cm || null,
          dateOfBirth: null,
          instagramHandle: null,
          dbCurrentTeam: initialPlayer.current_team || null,
          dbPreviousTeams: null,
        };

        const playerIds = matches.map(m => m.id);

        // Merge in any pre-aggregated IDs passed from the league page (e.g.
        // the same person appearing under different player_ids across REBA SL
        // age groups). These IDs are used only for the stats fetch — the
        // profile info and league names are resolved from the stats rows
        // themselves by the background enrichment pass.
        // Identity-group ids are definite links, so their games are fetched
        // even when their players row isn't readable here (players in
        // competitions that aren't public; their box scores can still be).
        const allStatsPlayerIds = Array.from(new Set([...playerIds, ...identityLinkedIds, ...(linkedPlayerIds || [])]));
        setStatsPlayerIds(allStatsPlayerIds);

        // Note: previously this query joined `players:player_id(full_name, league_id)`
        // which forced a costly nested lookup and frequently triggered Supabase
        // statement timeouts (code 57014) on players with many games. Both fields
        // are already denormalized onto each player_stats row (`full_name`,
        // `league_id`), so the join is redundant — the existing fallback chains
        // (`stat.players?.full_name || stat.full_name || …`) still resolve cleanly.
        //
        // Additional optimisation: fetch each player_id in its own request and
        // merge client-side. Postgres picks a much cheaper plan for `eq` than
        // for `in (...)` against the wide player_stats row when the
        // `player_id` filter is a single value (~600ms vs ~2.5s in our
        // testing, and on cold cache the `in()` variant routinely tripped the
        // 30s statement_timeout for players in larger leagues like NBL D1).
        // Most player profiles only have one canonical id, so the loop runs
        // once; multi-id career profiles still resolve in parallel.
        // Bound each per-player_id fetch — the profile UI only ever
        // surfaces the most recent ~few hundred games (career stats,
        // game log, shot chart). 1000 is enough headroom for a long
        // career while preventing unbounded scans on players with
        // anomalously large rowsets.
        const STATS_PER_PLAYER_LIMIT = 1000;
        // Project only the columns the profile, career stats, shot
        // chart and on/off filtering actually consume. `select('*')`
        // pulls the entire (very wide) player_stats row including
        // sequence numbers, raw FIBA payload fields, period splits,
        // etc. that the UI never uses — that wasted ~5x bytes per row
        // on the wire and made cold-cache loads noticeably slower.
        //
        // NOTE: `game_date` and `opponent` are deliberately NOT in
        // this projection. They do not exist in the live Supabase
        // `player_stats` schema (verified: requesting them returns
        // PostgREST 42703 "column does not exist"). The UI handles
        // their absence gracefully:
        //   - sort/display fallback: `stat.game_date || stat.created_at`
        //   - opponent is hydrated from `game_schedule` in the
        //     background enrichment (gameKeyMap lookup) using the
        //     player's `team_name` vs hometeam/awayteam.
        const STATS_COLUMNS = [
          'id', 'player_id', 'league_id', 'user_id',
          'created_at', 'game_key',
          'full_name', 'firstname', 'familyname',
          'team_name', 'team_id',
          'playingposition', 'shirtnumber',
          'sminutes',
          'spoints',
          'sreboundstotal', 'sreboundsoffensive', 'sreboundsdefensive',
          'sassists',
          'ssteals',
          'sblocks',
          'sturnovers',
          'sfieldgoalsmade', 'sfieldgoalsattempted',
          'sthreepointersmade', 'sthreepointersattempted',
          'sfreethrowsmade', 'sfreethrowsattempted',
          'eff_1', 'eff_2', 'eff_3', 'eff_4', 'eff_5', 'eff_6', 'eff_7',
        ].join(',');

        // Phase A: fan out the per-id stats fetch in parallel with the
        // matched-league lookup. Previously these ran sequentially.
        const matchLeagueIds = Array.from(
          new Set(matches.map((m) => m.league_id).filter(Boolean))
        );

        type LeagueInfo = { name: string; slug?: string | null; parent_league_id?: string | null; age_group?: string | null; stop?: number | null; stop_name?: string | null };
        type LeagueRow = { league_id: string } & LeagueInfo;

        const statsPromise = Promise.all(
          allStatsPlayerIds.map((pid) =>
            supabase
              .from('player_stats')
              .select(STATS_COLUMNS)
              .eq('player_id', pid)
              .order('created_at', { ascending: false })
              .limit(STATS_PER_PLAYER_LIMIT)
          )
        );

        // Helper: fetch league info via server endpoint (bypasses RLS /
        // column-name mismatch on the anon client's leagues table).
        const fetchLeagueInfo = async (ids: string[]): Promise<LeagueRow[]> => {
          if (ids.length === 0) return [];
          try {
            const resp = await fetch('/api/public/league-info', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids }),
            });
            if (!resp.ok) return [];
            const map = await resp.json() as Record<string, { name: string; slug: string | null; parent_league_id: string | null; age_group: string | null; stop: number | null; stop_name?: string | null }>;
            return Object.entries(map).map(([league_id, info]) => ({ league_id, ...info }));
          } catch {
            return [];
          }
        };

        const matchLeaguesPromise: Promise<{ data: LeagueRow[] }> =
          fetchLeagueInfo(matchLeagueIds).then(data => ({ data }));

        // Render the banner from the basic players-table info before
        // we wait on stats so a slow / timing-out player_stats query
        // doesn't leave the page blank.
        setPlayerInfo(pInfo);

        const statsResults = await statsPromise;

        const firstError = statsResults.find(r => r.error)?.error || null;
        if (firstError) {
          console.error('❌ Error fetching player stats:', firstError);
          toast({
            title: "Error Loading Stats",
            description: "Failed to load player statistics",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const seenStatIds = new Set<string>();
        const stats: any[] = [];
        for (const r of statsResults) {
          const rows = (r.data as any[] | null) || [];
          for (const row of rows) {
            const k = row.id || `${row.player_id}::${row.game_key}`;
            if (seenStatIds.has(k)) continue;
            seenStatIds.add(k);
            stats.push(row);
          }
        }
        stats.sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });

        // Override the static players-table team with the team from the
        // player's most recent game entry. Stats are now sorted newest-first
        // so the first row with a non-empty team_name is the latest team.
        // This fixes players who switch age groups or stops mid-season (e.g.
        // played 15U Stop 1 but is now on a 16U Stop 4 team).
        const latestTeamFromStats = stats.find(s => s.team_name?.trim())?.team_name?.trim();
        if (latestTeamFromStats) {
          pInfo = { ...pInfo, team: latestTeamFromStats };
        }

        // Render unenriched stats immediately so the loading spinner
        // clears as soon as the box scores are in hand. Group labels
        // and opponents will hydrate from the background enrichment
        // pass below.
        setPlayerStats(stats);
        setPlayerInfo(pInfo);

        const gamesPlayed = stats.filter(stat => playedInGame(stat));

        if (gamesPlayed.length > 0) {
          const sourceStats = gamesPlayed.length > 0 ? gamesPlayed : stats;
          const mostRecentStat = sourceStats[0];

          const normalizeTeam = (t: string) => t.trim().toLowerCase();
          const allTeams = sourceStats
            .map(s => s.team_name || s.team)
            .filter((team): team is string => Boolean(team));
          const teamMap = new Map<string, string>();
          allTeams.forEach(team => {
            const norm = normalizeTeam(team);
            if (!teamMap.has(norm)) teamMap.set(norm, team);
          });
          // Derive team from the absolute newest stat (regardless of minutes played)
          // so a player who switched teams but has 0 minutes in their latest game
          // still shows the correct current team.
          const newestStatWithTeam = stats.find(s => (s.team_name || s.team)?.trim());
          const currentTeam = newestStatWithTeam?.team_name?.trim() || newestStatWithTeam?.team?.trim()
            || mostRecentStat.team_name || mostRecentStat.team || 'Unknown Team';
          const currentTeamNorm = normalizeTeam(currentTeam);
          const previousTeams = Array.from(teamMap.values()).filter(t => normalizeTeam(t) !== currentTeamNorm);

          const resolvedName = pInfo.name
            || mostRecentStat.full_name
            || `${mostRecentStat.firstname || ''} ${mostRecentStat.familyname || ''}`.trim()
            || 'Unknown Player';

          pInfo = {
            ...pInfo,
            name: resolvedName,
            team: currentTeam,
            position: pInfo.position || mostRecentStat.playingposition || mostRecentStat.position,
            number: pInfo.number ?? mostRecentStat.shirtnumber ?? mostRecentStat.number,
            leagueId: mostRecentStat.league_id || pInfo.leagueId,
            previousTeams: previousTeams.length > 0 ? previousTeams : undefined,
          };
          setPlayerInfo(pInfo);

          const totals = gamesPlayed.reduce((acc, game) => ({
            points: acc.points + (game.spoints || game.points || 0),
            rebounds: acc.rebounds + (game.sreboundstotal || game.rebounds_total || 0),
            assists: acc.assists + (game.sassists || game.assists || 0),
            steals: acc.steals + (game.ssteals || 0),
            blocks: acc.blocks + (game.sblocks || 0),
            field_goals_made: acc.field_goals_made + (game.sfieldgoalsmade || 0),
            field_goals_attempted: acc.field_goals_attempted + (game.sfieldgoalsattempted || 0),
            three_pointers_made: acc.three_pointers_made + (game.sthreepointersmade || 0),
            three_pointers_attempted: acc.three_pointers_attempted + (game.sthreepointersattempted || 0),
            free_throws_made: acc.free_throws_made + (game.sfreethrowsmade || 0),
            free_throws_attempted: acc.free_throws_attempted + (game.sfreethrowsattempted || 0),
            turnovers: acc.turnovers + (game.sturnovers || game.turnovers || 0),
          }), {
            points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
            field_goals_made: 0, field_goals_attempted: 0,
            three_pointers_made: 0, three_pointers_attempted: 0,
            free_throws_made: 0, free_throws_attempted: 0, turnovers: 0,
          });

          const games = gamesPlayed.length;
          const averages = {
            games_played: games,
            avg_points: totals.points / games,
            avg_rebounds: totals.rebounds / games,
            avg_assists: totals.assists / games,
            avg_steals: totals.steals / games,
            avg_blocks: totals.blocks / games,
            fg_percentage: totals.field_goals_attempted > 0 ? (totals.field_goals_made / totals.field_goals_attempted) * 100 : 0,
            three_point_percentage: totals.three_pointers_attempted > 0 ? (totals.three_pointers_made / totals.three_pointers_attempted) * 100 : 0,
            ft_percentage: totals.free_throws_attempted > 0 ? (totals.free_throws_made / totals.free_throws_attempted) * 100 : 0,
            avg_efficiency: ((totals.points + totals.rebounds + totals.assists + totals.steals + totals.blocks) - (totals.field_goals_attempted - totals.field_goals_made) - (totals.free_throws_attempted - totals.free_throws_made) - totals.turnovers) / games,
          };
          setSeasonAverages(averages);

          // Rankings follow the profile filter (see the effect on rankingLeagueId).
        }

        // Background enrichment: derive opponents from game_schedule and
        // hydrate league names / parent labels / public-league pills.
        // Runs as fire-and-forget so the profile renders as soon as the
        // box scores are in hand; the stats list re-renders with
        // opponents and group labels once these queries return.
        (async () => {
          try {
            const matchLeaguesResp = await matchLeaguesPromise;
            const leagueInfoLocal = new Map<string, LeagueInfo>();
            const leagueMapLocal = new Map<string, string>();
            const leagueSlugsLocal = new Map<string, string>();
            const parentIds: string[] = [];
            for (const league of matchLeaguesResp.data || []) {
              leagueMapLocal.set(league.league_id, league.name);
              if (league.slug) leagueSlugsLocal.set(league.league_id, league.slug);
              leagueInfoLocal.set(league.league_id, {
                name: league.name,
                slug: league.slug,
                parent_league_id: league.parent_league_id,
                age_group: league.age_group,
                stop: league.stop,
                stop_name: league.stop_name,
              });
              if (league.parent_league_id) parentIds.push(league.parent_league_id);
            }

            const statsLeagueIds = new Set<string>(
              stats.map((s) => s.league_id).filter(Boolean)
            );
            const extraLeagueIds = Array.from(statsLeagueIds).filter(
              (lid) => !leagueInfoLocal.has(lid)
            );
            const gameKeys = Array.from(
              new Set(stats.map((stat) => stat.game_key).filter(Boolean))
            );
            const userId = stats.length > 0 ? stats[0].user_id : null;

            const extraLeagueInfoFetch: Promise<Record<string, { name: string; slug: string | null; parent_league_id: string | null; age_group: string | null; stop: number | null; stop_name?: string | null }>> =
              extraLeagueIds.length > 0
                ? fetchLeagueInfo(extraLeagueIds).then(rows => {
                    const result: Record<string, any> = {};
                    rows.forEach(row => { result[row.league_id] = { name: row.name, slug: row.slug || null, parent_league_id: row.parent_league_id || null, age_group: row.age_group || null, stop: row.stop ?? null, stop_name: row.stop_name ?? null }; });
                    return result;
                  }).catch(() => ({}))
                : Promise.resolve({});

            const [gamesResp, publicLeaguesResp, extraLeagueInfoMap] = await Promise.all([
              gameKeys.length > 0
                ? supabase
                    .from('game_schedule')
                    .select('game_key, hometeam, awayteam')
                    .in('game_key', gameKeys)
                : Promise.resolve({ data: [], error: null }),
              userId
                ? supabase
                    .from('leagues')
                    .select('name, slug, user_id')
                    .eq('user_id', userId)
                    .eq('is_public', true)
                : Promise.resolve({ data: [], error: null }),
              extraLeagueInfoFetch,
            ]);

            // Convert the server response back into the shape expected by the
            // enrichment loop below (same fields as the old Supabase response).
            const extraLeaguesResp = {
              data: Object.entries(extraLeagueInfoMap as Record<string, { name: string; slug: string | null; parent_league_id: string | null; age_group: string | null; stop: number | null; stop_name?: string | null }>).map(
                ([league_id, info]) => ({ league_id, ...info })
              ),
            };

            for (const league of (extraLeaguesResp.data || []) as LeagueRow[]) {
              leagueMapLocal.set(league.league_id, league.name);
              if (league.slug) leagueSlugsLocal.set(league.league_id, league.slug);
              leagueInfoLocal.set(league.league_id, {
                name: league.name,
                slug: league.slug,
                parent_league_id: league.parent_league_id,
                age_group: league.age_group,
                stop: league.stop,
                stop_name: league.stop_name,
              });
              if (league.parent_league_id) parentIds.push(league.parent_league_id);
            }

            const uniqueParentIds = Array.from(new Set(parentIds)).filter(
              (pid) => !leagueMapLocal.has(pid)
            );
            if (uniqueParentIds.length > 0) {
              const parentLeagues = await fetchLeagueInfo(uniqueParentIds);
              parentLeagues.forEach((pl) => {
                leagueMapLocal.set(pl.league_id, pl.name);
                if (pl.slug) leagueSlugsLocal.set(pl.league_id, pl.slug);
              });
            }

            if (leagueMapLocal.size > 0) {
              setLeagueNames(leagueMapLocal);
            }
            if (leagueSlugsLocal.size > 0) {
              setLeagueSlugs(leagueSlugsLocal);
            }

            // Build competition → effective-parent map for the league filter.
            // If a competition has no parent, it IS its own parent.
            const compParentLocal = new Map<string, string>();
            for (const [compId, info] of leagueInfoLocal) {
              compParentLocal.set(compId, info.parent_league_id || compId);
            }
            setCompetitionParentMap(compParentLocal);

            const gameKeyMap = new Map<string, { hometeam: string; awayteam: string }>();
            for (const game of (gamesResp.data || []) as Array<{ game_key: string; hometeam: string; awayteam: string }>) {
              if (game.game_key) gameKeyMap.set(game.game_key, { hometeam: game.hometeam, awayteam: game.awayteam });
            }

            const enriched = stats.map((stat) => {
              let derivedOpponent: string | undefined;
              if (stat.game_key) {
                const gameInfo = gameKeyMap.get(stat.game_key);
                if (gameInfo) {
                  const playerTeamNorm = (stat.team_name || '').trim().toLowerCase();
                  const homeTeamNorm = (gameInfo.hometeam || '').trim().toLowerCase();
                  const awayTeamNorm = (gameInfo.awayteam || '').trim().toLowerCase();
                  if (playerTeamNorm === homeTeamNorm) derivedOpponent = gameInfo.awayteam;
                  else if (playerTeamNorm === awayTeamNorm) derivedOpponent = gameInfo.hometeam;
                }
              }

              const lid = stat.league_id || '';
              const info = leagueInfoLocal.get(lid);
              let groupKey: string;
              let groupLabel: string;
              if (info?.parent_league_id) {
                const stopPart = info.stop != null ? `::stop${info.stop}` : '';
                const agePart = info.age_group ? `::${info.age_group}` : '';
                groupKey = `${info.parent_league_id}${agePart}${stopPart}`;
                const parentName = leagueMapLocal.get(info.parent_league_id) || info.parent_league_id;
                const ageSuffix = info.age_group ? ` ${info.age_group}` : '';
                const stopSuffix = info.stop != null ? ` ${stopLabel(info.stop, info.stop_name)}` : '';
                groupLabel = `${parentName}${ageSuffix}${stopSuffix}`;
              } else {
                groupKey = lid;
                groupLabel = leagueMapLocal.get(lid) || lid;
              }

              return {
                ...stat,
                opponent: derivedOpponent || stat.opponent,
                _groupKey: groupKey,
                _groupLabel: groupLabel,
              };
            });

            setPlayerStats(enriched);

            const publicLeaguesData = (publicLeaguesResp.data || []) as Array<{ name: string; slug: string }>;
            if (publicLeaguesData.length > 0) {
              const actualLeague = publicLeaguesData.find((league) =>
                league.name.toLowerCase().includes('uwe') && league.name.toLowerCase().includes('d1')
              ) || publicLeaguesData[0];
              setPlayerLeagues([{ id: actualLeague.slug, name: actualLeague.name, slug: actualLeague.slug }]);
            } else {
              setPlayerLeagues([]);
            }
          } catch (err) {
            console.warn('[PlayerProfile] enrichment background error:', err);
          }
        })();
      } catch (error) {
        console.error('❌ PlayerProfileContent - Unexpected error:', error);
        toast({
          title: "Error",
          description: "Failed to load player data",
          variant: "destructive",
        });
      } finally {
        // Don't drop the skeleton when a transient retry is queued —
        // we want the user to keep seeing the existing loading state
        // rather than a blank profile shell between retry attempts.
        if (!scheduledTransientRetry && !cancelled) {
          setLoading(false);
        }
      }
    };

    fetchPlayerData();

    return () => {
      cancelled = true;
      if (pendingRetryTimeout !== null) {
        window.clearTimeout(pendingRetryTimeout);
        pendingRetryTimeout = null;
      }
    };
  }, [playerSlug]);

  // The games every tab shows: the ones in the filter that the player played in.
  const filteredStats = useMemo(() => {
    const stats = scopeLeagueIds
      ? playerStats.filter(stat => !!stat.league_id && scopeLeagueIds.has(stat.league_id))
      : playerStats;
    return stats.filter(stat => playedInGame(stat));
  }, [playerStats, scopeLeagueIds]);

  // On/off for each game in the log, from the whole game's box +/-.
  const gameLogOnOff = useGameLogOnOff(filteredStats, activeTab === 'games');
  const showOnOffColumns = gameLogOnOff.size > 0;

  // Once the log mixes competitions (e.g. SLB and ENBL for the same club), each
  // game needs a tag saying which one it came from.
  const showCompetitionColumn = useMemo(
    () => new Set(filteredStats.map((g) => g.league_id).filter(Boolean)).size > 1,
    [filteredStats],
  );

  const pinnedGames = useMemo(() => {
    if (filteredStats.length === 0) return [];
    const sorted = [...filteredStats].sort((a, b) => {
      const da = new Date(a.game_date || a.created_at || '').getTime();
      const db = new Date(b.game_date || b.created_at || '').getTime();
      return db - da;
    });
    const mostRecent = sorted[0];
    // Results aren't loaded yet here, so the win bonus is left out of the pick.
    const bestGame = [...filteredStats].sort((a, b) => computeSwishScoreFor(b) - computeSwishScoreFor(a))[0];
    if (mostRecent.id === bestGame.id) return [{ stat: mostRecent, label: 'Latest · Best', heading: 'Latest & best game' }];
    return [
      { stat: mostRecent, label: 'Latest', heading: 'Latest game' },
      { stat: bestGame, label: 'Best', heading: 'Best game' },
    ];
  }, [filteredStats]);

  const filteredSeasonAverages = useMemo(() => {
    if (!filteredStats || filteredStats.length === 0) return null;

    const totals = filteredStats.reduce((acc, game) => ({
      points: acc.points + (game.spoints || game.points || 0),
      rebounds: acc.rebounds + (game.sreboundstotal || game.rebounds_total || 0),
      assists: acc.assists + (game.sassists || game.assists || 0),
      steals: acc.steals + (game.ssteals || game.steals || 0),
      blocks: acc.blocks + (game.sblocks || game.blocks || 0),
      field_goals_made: acc.field_goals_made + (game.sfieldgoalsmade || game.field_goals_made || 0),
      field_goals_attempted: acc.field_goals_attempted + (game.sfieldgoalsattempted || game.field_goals_attempted || 0),
      three_pointers_made: acc.three_pointers_made + (game.sthreepointersmade || game.three_pointers_made || 0),
      three_pointers_attempted: acc.three_pointers_attempted + (game.sthreepointersattempted || game.three_pointers_attempted || 0),
      free_throws_made: acc.free_throws_made + (game.sfreethrowsmade || game.free_throws_made || 0),
      free_throws_attempted: acc.free_throws_attempted + (game.sfreethrowsattempted || game.free_throws_attempted || 0),
      turnovers: acc.turnovers + (game.sturnovers || game.turnovers || 0),
    }), {
      points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
      field_goals_made: 0, field_goals_attempted: 0,
      three_pointers_made: 0, three_pointers_attempted: 0,
      free_throws_made: 0, free_throws_attempted: 0, turnovers: 0,
    });

    const games = filteredStats.length;
    return {
      games_played: games,
      avg_points: totals.points / games,
      avg_rebounds: totals.rebounds / games,
      avg_assists: totals.assists / games,
      avg_steals: totals.steals / games,
      avg_blocks: totals.blocks / games,
      fg_percentage: totals.field_goals_attempted > 0 ? (totals.field_goals_made / totals.field_goals_attempted) * 100 : 0,
      three_point_percentage: totals.three_pointers_attempted > 0 ? (totals.three_pointers_made / totals.three_pointers_attempted) * 100 : 0,
      ft_percentage: totals.free_throws_attempted > 0 ? (totals.free_throws_made / totals.free_throws_attempted) * 100 : 0,
      avg_efficiency: ((totals.points + totals.rebounds + totals.assists + totals.steals + totals.blocks) - (totals.field_goals_attempted - totals.field_goals_made) - (totals.free_throws_attempted - totals.free_throws_made) - totals.turnovers) / games,
    };
  }, [filteredStats]);

  // League ranks only mean something inside one competition, so they show
  // when the filter (or the player's whole record) is a single competition.
  const rankingLeagueId = scopeLeagueIds
    ? (scopeLeagueIds.size === 1 ? Array.from(scopeLeagueIds)[0] : null)
    : (competitionIndex.size === 1 ? Array.from(competitionIndex.keys())[0] : null);
  const rankingKey = rankingLeagueId && filteredSeasonAverages && playerInfo?.name
    ? [rankingLeagueId, playerInfo.name, playerMatches.map((m) => m.id).join('+'),
       ...Object.values(filteredSeasonAverages).map((v) => Number(v).toFixed(3))].join('|')
    : '';
  const rankingInputRef = useRef({ filteredSeasonAverages, name: playerInfo?.name, ids: playerMatches.map((m) => m.id) });
  rankingInputRef.current = { filteredSeasonAverages, name: playerInfo?.name, ids: playerMatches.map((m) => m.id) };
  useEffect(() => {
    setPlayerRankings(null);
    const { filteredSeasonAverages: averages, name, ids } = rankingInputRef.current;
    if (!rankingKey || !rankingLeagueId || !averages || !name) return;
    let cancelled = false;
    calculateRankings(rankingLeagueId, averages, name, ids)
      .then((ranks) => { if (!cancelled && ranks) setPlayerRankings(ranks); })
      .catch((err) => console.warn('[Rankings] error:', err));
    return () => { cancelled = true; };
    // calculateRankings is a plain helper of this component; rankingKey covers its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankingKey]);

  const nameVariationsWithLeagues = useMemo(() => {
    if (playerMatches.length <= 1) return [];
    const variations = playerMatches.map(match => ({
      name: match.full_name,
      leagueId: match.league_id,
      leagueName: leagueNames.get(match.league_id) || 'Unknown League',
    }));
    return variations.filter((v, index, self) => index === self.findIndex(t => t.name === v.name));
  }, [playerMatches, leagueNames]);

  const playerShotGameKeys = useMemo(() => {
    if (!playerStats || playerStats.length === 0) return [];
    const baseStats = playerStats.filter(s => inScope(s.league_id));
    const sorted = [...baseStats]
      .filter(s => s.game_key)
      .sort((a, b) => new Date(b.game_date || b.created_at || '').getTime() - new Date(a.game_date || a.created_at || '').getTime());
    if (playerShotChartRange === "last5") return sorted.slice(0, 5).map(s => s.game_key).filter(Boolean) as string[];
    if (playerShotChartRange === "last10") return sorted.slice(0, 10).map(s => s.game_key).filter(Boolean) as string[];
    if (playerShotChartRange.startsWith("game:")) return [playerShotChartRange.replace("game:", "")];
    return sorted.map(s => s.game_key).filter(Boolean) as string[];
  }, [playerStats, playerShotChartRange, scopeLeagueIds]);

  const playerIdsForShots = useMemo(
    () => Array.from(new Set([...playerMatches.map(m => m.id), ...statsPlayerIds])),
    [playerMatches, statsPlayerIds],
  );

  const { data: playerShotData, isLoading: playerShotsLoading } = useQuery({
    queryKey: ['player-shot-chart', playerIdsForShots, playerShotGameKeys],
    queryFn: async () => {
      if (playerIdsForShots.length === 0 || playerShotGameKeys.length === 0) return [];
      const { data, error } = await supabase
        .from('shot_chart')
        .select('id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key')
        .in('player_id', playerIdsForShots)
        .in('game_key', playerShotGameKeys);
      if (error) { console.error('Player shot chart error:', error); return []; }
      return (data || []) as ShotData[];
    },
    enabled: playerIdsForShots.length > 0 && playerShotGameKeys.length > 0,
  });


  const playerShotGamesWithKeys = useMemo(() => {
    if (!playerStats) return [];
    const baseStats = playerStats.filter(s => inScope(s.league_id));
    return baseStats
      .filter(s => s.game_key)
      .sort((a, b) => new Date(b.game_date || b.created_at || '').getTime() - new Date(a.game_date || a.created_at || '').getTime())
      .map(s => ({ game_key: s.game_key!, opponent: s.opponent || 'TBD', date: s.game_date || s.created_at || '' }))
      .filter((g, i, arr) => arr.findIndex(x => x.game_key === g.game_key) === i);
  }, [playerStats, scopeLeagueIds]);

  // A game picked for the shot chart may not be in a new filter.
  useEffect(() => {
    setPlayerShotChartRange((range) => (range.startsWith('game:') ? 'season' : range));
  }, [scopeKey]);

  const playerPhotoOriginalUrl = useMemo(
    () => getPlayerPhotoUrlCached(playerInfo?.photoPath ?? null, photoCacheBuster || undefined),
    [playerInfo?.photoPath, photoCacheBuster]
  );
  // The banner and cards show the web-sized variant (tens of KB) rather than
  // the multi-MB original; falls back to the original when there isn't one.
  const playerPhotoUrl = useHeadshotUrl(playerPhotoOriginalUrl, "web");

  // Resolve the team logo URL once for the share-card header band on all
  // four ShareableCards rendered below (Season Averages, Shooting Splits,
  // On/Off Impact, Shot Chart). Uses the same cached lookup as in-page
  // <TeamLogo>, so it's typically a cache hit.
  const [shareTeamLogoUrl, setShareTeamLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setShareTeamLogoUrl(null);
    const teamName = playerInfo?.team;
    const leagueId = playerInfo?.leagueId;
    if (!teamName || !leagueId) return;
    void getTeamLogoCached({ leagueId, teamName }).then((url) => {
      if (!cancelled) setShareTeamLogoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [playerInfo?.team, playerInfo?.leagueId]);

  // DOB and Instagram are tier-gated server-side: get_player_public_details only
  // returns them (and the /p/ slug) for players with a verified DOB who are 18+.
  // Fetched separately so a failure here never breaks the main profile load.
  const [claimInfo, setClaimInfo] = useState<{ isClaimed: boolean; profileSlug: string | null } | null>(null);
  useEffect(() => {
    const playerId = playerInfo?.playerId;
    setClaimInfo(null);
    if (!playerId) return;
    let cancelled = false;
    supabase
      .rpc('get_player_public_details', { p_player_id: playerId })
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const details = data as {
          date_of_birth: string | null;
          instagram_handle: string | null;
          is_claimed: boolean;
          profile_slug: string | null;
        };
        setClaimInfo({ isClaimed: details.is_claimed, profileSlug: details.profile_slug });
        if (!details.date_of_birth && !details.instagram_handle) return;
        setPlayerInfo(prev => prev ? {
          ...prev,
          dateOfBirth: details.date_of_birth,
          instagramHandle: details.instagram_handle,
          // Owner-set values are bare handles; legacy roster values are full URLs.
          instagramUrl: details.instagram_handle
            ? `https://www.instagram.com/${normalizeInstagramHandle(details.instagram_handle)}`
            : null,
        } : null);
      });
    return () => { cancelled = true; };
  }, [playerInfo?.playerId]);

  // Separate photo for share/social graphics — uses photo_path (original/non-bg-removed).
  // Falls back to the bg-removed banner photo if no original is set so existing players
  // still get a player image on shareable cards.
  const playerSharePhotoUrl = useMemo(() => {
    if (playerInfo?.sharePhotoPath) {
      const url = getPlayerPhotoUrlCached(
        playerInfo.sharePhotoPath,
        photoCacheBuster || undefined
      );
      return url ?? playerPhotoUrl;
    }
    return playerPhotoUrl;
  }, [playerInfo?.sharePhotoPath, playerPhotoUrl, photoCacheBuster]);

  // What the downloadable cards say about the player; they are drawn in the club's colour.
  const sharePlayer = {
    name: playerInfo?.name || "Player",
    team: playerInfo?.team || "",
    // The social photo where there is one (as on the leaders cards); the focus point belongs to the banner cut-out.
    photoUrl: playerSharePhotoUrl,
    photoFocusY: playerInfo?.sharePhotoPath ? null : playerInfo?.photoFocusY,
    teamLogoUrl: shareTeamLogoUrl,
    primaryColor,
  };
  const shareFilterLabel = scopeLabel;
  /** The stretch of games the shot chart is showing, for its card. */
  const shotRangeLabel = (): string | undefined => {
    if (playerShotChartRange === "season") return "Full Season";
    if (playerShotChartRange === "last10") return "Last 10 Games";
    if (playerShotChartRange === "last5") return "Last 5 Games";
    if (playerShotChartRange.startsWith("game:")) {
      const key = playerShotChartRange.replace("game:", "");
      const g = playerShotGamesWithKeys.find((g) => g.game_key === key);
      return g
        ? `vs ${g.opponent} • ${new Date(g.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
        : "Selected Game";
    }
    return undefined;
  };

  const careerStats = useMemo(() => {
    if (!playerStats || playerStats.length === 0) return [];

    const baseStats = playerStats.filter((stat: any) => inScope(stat.league_id));

    const leagueGroups = new Map<string, any[]>();
    baseStats.forEach((stat: any) => {
      const key = stat._groupKey || stat.league_id || 'unknown';
      if (!leagueGroups.has(key)) leagueGroups.set(key, []);
      leagueGroups.get(key)!.push(stat);
    });

    const seasons: any[] = [];
    leagueGroups.forEach((stats) => {
      const played = stats.filter((s: any) => playedInGame(s));
      if (played.length === 0) return;
      const gp = played.length;
      const totals = played.reduce((acc: any, g: any) => ({
        pts: acc.pts + (g.spoints || g.points || 0),
        reb: acc.reb + (g.sreboundstotal || g.rebounds_total || 0),
        ast: acc.ast + (g.sassists || g.assists || 0),
        stl: acc.stl + (g.ssteals || 0),
        blk: acc.blk + (g.sblocks || 0),
        fgm: acc.fgm + (g.sfieldgoalsmade || 0),
        fga: acc.fga + (g.sfieldgoalsattempted || 0),
        tpm: acc.tpm + (g.sthreepointersmade || 0),
        tpa: acc.tpa + (g.sthreepointersattempted || 0),
        ftm: acc.ftm + (g.sfreethrowsmade || 0),
        fta: acc.fta + (g.sfreethrowsattempted || 0),
        to: acc.to + (g.sturnovers || g.turnovers || 0),
        min: acc.min + parseMinutesPlayed(g),
      }), { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, to: 0, min: 0 });
      const first = played[0] as any;

      // Pick the most-recent team as the current team for this league/season,
      // and collect any other teams played for as previous teams. This handles
      // mid-season team-switchers within the same league.
      const playedSortedDesc = [...played].sort((a: any, b: any) => {
        const da = a.game_date ? new Date(a.game_date).getTime() : 0;
        const db = b.game_date ? new Date(b.game_date).getTime() : 0;
        return db - da;
      });
      const mostRecent = playedSortedDesc[0] || first;
      const team = mostRecent.team_name || mostRecent.team || first.team_name || first.team || '';
      const normalizeTeam = (t: string) => (t || '').trim().toLowerCase();
      const teamMap = new Map<string, string>();
      played.forEach((g: any) => {
        const t = g.team_name || g.team;
        if (!t) return;
        const norm = normalizeTeam(t);
        if (!teamMap.has(norm)) teamMap.set(norm, t);
      });
      const currentTeamNorm = normalizeTeam(team);
      const previousTeams = Array.from(teamMap.values()).filter(t => normalizeTeam(t) !== currentTeamNorm);

      const leagueId = first.league_id || first._groupKey || '';
      const season = first._groupLabel || leagueNames.get(leagueId) || leagueId;
      seasons.push({
        leagueId, season, team, previousTeams, gp, ...totals,
        fg_pct: totals.fga > 0 ? (totals.fgm / totals.fga) * 100 : 0,
        tp_pct: totals.tpa > 0 ? (totals.tpm / totals.tpa) * 100 : 0,
        ft_pct: totals.fta > 0 ? (totals.ftm / totals.fta) * 100 : 0,
        eff: ((totals.pts + totals.reb + totals.ast + totals.stl + totals.blk) - (totals.fga - totals.fgm) - (totals.fta - totals.ftm) - totals.to) / gp,
      });
    });
    return seasons;
  }, [playerStats, leagueNames, scopeLeagueIds]);

  const careerTotals = useMemo(() => {
    if (careerStats.length === 0) return null;
    const gp = careerStats.reduce((s, r) => s + r.gp, 0);
    const t = careerStats.reduce((acc, r) => ({
      pts: acc.pts + r.pts, reb: acc.reb + r.reb, ast: acc.ast + r.ast,
      stl: acc.stl + r.stl, blk: acc.blk + r.blk, fgm: acc.fgm + r.fgm,
      fga: acc.fga + r.fga, tpm: acc.tpm + r.tpm, tpa: acc.tpa + r.tpa,
      ftm: acc.ftm + r.ftm, fta: acc.fta + r.fta, to: acc.to + r.to, min: acc.min + r.min,
    }), { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, to: 0, min: 0 });
    return {
      gp, ...t,
      fg_pct: t.fga > 0 ? (t.fgm / t.fga) * 100 : 0,
      tp_pct: t.tpa > 0 ? (t.tpm / t.tpa) * 100 : 0,
      ft_pct: t.fta > 0 ? (t.ftm / t.fta) * 100 : 0,
      eff: ((t.pts + t.reb + t.ast + t.stl + t.blk) - (t.fga - t.fgm) - (t.fta - t.ftm) - t.to) / gp,
    };
  }, [careerStats]);

  type StatHigh = { label: string; value: number; opponent: string; date: string; gameKey: string | null; leagueId?: string };
  const computeHighs = (games: any[]): StatHigh[] => {
    if (games.length === 0) return [];
    const pick = (label: string, getter: (g: any) => number): StatHigh => {
      const best = games.reduce((a, b) => (getter(b) > getter(a) ? b : a));
      return {
        label,
        value: getter(best),
        opponent: (best.opponent && best.opponent.trim()) || 'TBD',
        date: best.game_date || best.created_at || '',
        gameKey: best.game_key || null,
        leagueId: best.league_id || undefined,
      };
    };
    return [
      pick('PTS', g => g.spoints ?? g.points ?? 0),
      pick('REB', g => g.sreboundstotal ?? g.rebounds_total ?? 0),
      pick('AST', g => g.sassists ?? g.assists ?? 0),
      pick('STL', g => g.ssteals ?? g.steals ?? 0),
      pick('BLK', g => g.sblocks ?? g.blocks ?? 0),
      pick('3PM', g => g.sthreepointersmade ?? g.three_pointers_made ?? 0),
    ];
  };

  // Career highs always cover every game regardless of the league filter —
  // "career" means career. Season highs auto-detect the most recently played
  // league/season (the same one the "Most Recent" pinned game comes from).
  const playedCareerGames = useMemo(
    () => (playerStats as any[]).filter(s => playedInGame(s)),
    [playerStats]
  );
  const careerHighs = useMemo(() => computeHighs(playedCareerGames), [playedCareerGames]);

  const currentSeason = useMemo(() => {
    if (playedCareerGames.length === 0) return null;
    const sorted = [...playedCareerGames].sort((a, b) => {
      const da = new Date(a.game_date || a.created_at || '').getTime();
      const db = new Date(b.game_date || b.created_at || '').getTime();
      return db - da;
    });
    const key = sorted[0]._groupKey || sorted[0].league_id || 'unknown';
    const label = sorted[0]._groupLabel || leagueNames.get(sorted[0].league_id) || 'Current Season';
    const games = playedCareerGames.filter(g => (g._groupKey || g.league_id || 'unknown') === key);
    return { label, leagueId: sorted[0].league_id as string | undefined, games };
  }, [playedCareerGames, leagueNames]);

  const seasonHighs = useMemo(
    () => currentSeason ? computeHighs(currentSeason.games) : [],
    [currentSeason]
  );

  // Every league_id that collapses to the same parent brand as the current
  // season — the same parent grouping the profile filter uses to combine
  // e.g. "Hoopsfix Pro-Am 2024-25" + "2025-26" into one filter entry. Reused
  // here to scope the "all-time" record-holder check to the whole
  // competition's history, not just this one season.
  const allTimeLeagueIds = useMemo(() => {
    const currentLeagueId = currentSeason?.leagueId;
    if (!currentLeagueId) return [];
    const parentId = competitionParentMap.get(currentLeagueId) || currentLeagueId;
    const ids = new Set<string>([currentLeagueId, parentId]);
    for (const [compId, pId] of competitionParentMap) {
      if (pId === parentId) ids.add(compId);
    }
    return Array.from(ids);
  }, [currentSeason?.leagueId, competitionParentMap]);

  const [seasonRecordMaxes, setSeasonRecordMaxes] = useState<RecordMaxes>(EMPTY_RECORD_MAXES);
  const [allTimeRecordMaxes, setAllTimeRecordMaxes] = useState<RecordMaxes>(EMPTY_RECORD_MAXES);

  useEffect(() => {
    let cancelled = false;
    const currentLeagueId = currentSeason?.leagueId;
    if (!currentLeagueId) {
      setSeasonRecordMaxes(EMPTY_RECORD_MAXES);
      setAllTimeRecordMaxes(EMPTY_RECORD_MAXES);
      return;
    }
    fetchPlayerRecordMaxes([currentLeagueId]).then(m => { if (!cancelled) setSeasonRecordMaxes(m); });
    fetchPlayerRecordMaxes(allTimeLeagueIds.length > 0 ? allTimeLeagueIds : [currentLeagueId])
      .then(m => { if (!cancelled) setAllTimeRecordMaxes(m); });
    return () => { cancelled = true; };
  }, [currentSeason?.leagueId, allTimeLeagueIds]);

  // Best single-game marks scoped to the SAME league_id set as
  // allTimeRecordMaxes — must not use the unscoped `careerHighs`, which can
  // come from a totally different competition and would false-positive a
  // Diamond/Platinum medal against this competition's record.
  const competitionHighs = useMemo(() => {
    if (allTimeLeagueIds.length === 0) return [];
    const idSet = new Set(allTimeLeagueIds);
    const games = playedCareerGames.filter(g => idSet.has(g.league_id));
    return computeHighs(games);
  }, [playedCareerGames, allTimeLeagueIds]);

  const playerAccolades = useMemo(() => computePlayerAccolades(
    seasonHighs,
    competitionHighs,
    careerStats,
    currentSeason?.leagueId ?? null,
    currentSeason?.label ?? '',
    playerRankings,
    seasonRecordMaxes,
    allTimeRecordMaxes,
  ), [seasonHighs, competitionHighs, careerStats, currentSeason, playerRankings, seasonRecordMaxes, allTimeRecordMaxes]);

  // ── The accolade collection ───────────────────────────────────────────────
  // Every season the player has played (the same groups as the career table),
  // newest first — the first is the current season.
  const playedSeasons = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; leagueIds: Set<string>; games: any[]; last: number }>();
    for (const g of playedCareerGames) {
      const key = g._groupKey || g.league_id || 'unknown';
      let group = groups.get(key);
      if (!group) {
        group = { key, label: g._groupLabel || leagueNames.get(g.league_id) || 'Season', leagueIds: new Set(), games: [], last: 0 };
        groups.set(key, group);
      }
      if (g.league_id) group.leagueIds.add(g.league_id);
      group.games.push(g);
      const played = new Date(g.game_date || g.created_at || '').getTime();
      if (played > group.last) group.last = played;
    }
    return Array.from(groups.values()).sort((a, b) => b.last - a.last);
  }, [playedCareerGames, leagueNames]);

  // Past seasons keep the season records the player set in them.
  const pastSeasons = useMemo(() => playedSeasons.slice(1), [playedSeasons]);
  const { data: pastSeasonMaxes } = useQuery({
    queryKey: ['past-season-record-maxes', pastSeasons.map((s) => `${s.key}:${Array.from(s.leagueIds).sort().join('+')}`).join('|')],
    enabled: pastSeasons.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const entries = await Promise.all(
        pastSeasons.map(async (s) => [s.key, await fetchPlayerRecordMaxes(Array.from(s.leagueIds))] as const),
      );
      return Object.fromEntries(entries) as Record<string, RecordMaxes>;
    },
  });
  const accoladeCollection = useMemo(() => {
    const past = pastSeasonMaxes
      ? computePastSeasonAccolades(pastSeasons.map((s) => ({
          label: s.label,
          leagueId: Array.from(s.leagueIds)[0],
          highs: computeHighs(s.games),
          maxes: pastSeasonMaxes[s.key] ?? EMPTY_RECORD_MAXES,
        })))
      : [];
    return [...playerAccolades, ...past];
    // computeHighs is a plain helper of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerAccolades, pastSeasons, pastSeasonMaxes]);

  // Highs and accolades for the games in the filter.
  const scopeHighs = useMemo(
    () => (scopeLeagueIds ? computeHighs(filteredStats) : []),
    // computeHighs is a plain helper of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredStats, scopeLeagueIds],
  );
  const scopedAccolades = useMemo(
    () => (scopeLeagueIds ? accoladeCollection.filter((a) => !!a.leagueId && scopeLeagueIds.has(a.leagueId)) : accoladeCollection),
    [accoladeCollection, scopeLeagueIds],
  );

  // ── Trading cards (Latest, Best, and any game picked from the log) ────────
  // Each card needs its game's result and its league's logo on top of the
  // player's own stat row.
  const cardStats = useMemo(
    () => [...pinnedGames.map((p) => p.stat), ...(selectedGameForCard ? [selectedGameForCard] : [])],
    [pinnedGames, selectedGameForCard],
  );
  const cardGameKeys = useMemo(
    () => Array.from(new Set(cardStats.map((s) => s.game_key).filter((k): k is string => !!k))).sort(),
    [cardStats],
  );
  const cardLeagueIds = useMemo(
    () => Array.from(new Set([
      ...cardStats.map((s) => s.league_id || s.players?.league_id),
      ...accoladeCollection.map((a) => a.leagueId),
    ].filter((id): id is string => !!id))).sort(),
    [cardStats, accoladeCollection],
  );
  const { data: cardResults } = useQuery({
    queryKey: ["player-card-results", cardGameKeys.join(",")],
    enabled: cardGameKeys.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("v_game_results")
        .select("game_key,home_team,away_team,home_score,away_score")
        .in("game_key", cardGameKeys);
      return (data || []) as { game_key: string; home_team: string | null; away_team: string | null; home_score: number | null; away_score: number | null }[];
    },
  });
  const { data: cardLeagues } = useQuery({
    queryKey: ["competition-display", cardLeagueIds.join(",")],
    enabled: cardLeagueIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/competition-display?ids=${cardLeagueIds.map(encodeURIComponent).join(",")}`);
      return res.ok ? ((await res.json()) as Record<string, { name: string | null; logo: string | null }>) : {};
    },
  });

  useEffect(() => {
    if (!selectedGameForCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"][data-state="open"]')) return;
      setSelectedGameForCard(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedGameForCard]);

  /** "W 89-66" from the player's side of the game, when the score is known. */
  const gameResultFor = (stat: PlayerStat): string | null => {
    const game = cardResults?.find((g) => g.game_key === stat.game_key);
    if (!game || game.home_score == null || game.away_score == null) return null;
    const team = (stat.team_name || stat.team || "").toLowerCase();
    const isHome = stat.is_home_player ?? (!!team && (game.home_team || "").toLowerCase() === team);
    const mine = isHome ? game.home_score : game.away_score;
    const theirs = isHome ? game.away_score : game.home_score;
    return `${mine > theirs ? "W" : mine < theirs ? "L" : "T"} ${mine}-${theirs}`;
  };

  const toCardPerformance = (stat: PlayerStat): TradingCardPerformance => {
    const leagueId = stat.league_id || stat.players?.league_id || null;
    const pts = stat.spoints ?? stat.points ?? 0;
    const fga = stat.sfieldgoalsattempted ?? stat.field_goals_attempted ?? 0;
    const fta = stat.sfreethrowsattempted ?? stat.free_throws_attempted ?? 0;
    const shots = fga + 0.44 * fta;
    const parentId = leagueId ? competitionParentMap.get(leagueId) : undefined;
    const gameResult = gameResultFor(stat);
    return {
      playerId: playerInfo?.playerId || stat.player_id,
      playerName: playerInfo?.name || stat.full_name || "",
      teamName: stat.team_name || stat.team || null,
      leagueId,
      // The public competition name, as the homepage cards show it.
      leagueName: (leagueId && cardLeagues?.[leagueId]?.name) || (leagueId && leagueNames.get(leagueId)) || (parentId && leagueNames.get(parentId)) || null,
      leagueLogo: leagueId ? cardLeagues?.[leagueId]?.logo ?? null : null,
      gameDate: stat.game_date || stat.created_at || null,
      opponentName: stat.opponent?.trim() || null,
      gameResult,
      gameScore: Math.round(computeSwishScoreFor(stat, gameResult ? gameResult.startsWith("W") : null) * 10) / 10,
      pts,
      reb: stat.sreboundstotal ?? stat.rebounds_total ?? 0,
      ast: stat.sassists ?? stat.assists ?? 0,
      stl: stat.ssteals ?? stat.steals ?? 0,
      blk: stat.sblocks ?? stat.blocks ?? 0,
      tov: stat.sturnovers ?? stat.turnovers ?? 0,
      fgm: stat.sfieldgoalsmade ?? stat.field_goals_made ?? null,
      fga,
      tpm: stat.sthreepointersmade ?? stat.three_pointers_made ?? null,
      tpa: stat.sthreepointersattempted ?? stat.three_pointers_attempted ?? null,
      ftm: stat.sfreethrowsmade ?? stat.free_throws_made ?? null,
      fta,
      tsPct: shots > 0 ? pts / (2 * shots) : null,
      cutoutUrl: playerPhotoUrl,
      profilePhotoUrl: playerSharePhotoUrl,
    };
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatMinutes = (min: number) => min.toFixed(1);
  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{ borderColor: readablePrimary.accent }}></div>
          <p className="text-sm text-[color:var(--ch-muted)]">Loading player profile...</p>
        </div>
      </div>
    );
  }

  const ct = "px-2 py-1.5 text-center text-xs whitespace-nowrap";

  const renderCareerRow = (row: any) => {
    const gp = row.gp;
    if (careerStatsTab === "averages") return (
      <>
        <td className={ct}>{gp}</td>
        <td className={ct}>{formatMinutes(row.min / gp)}</td>
        <td className={ct}>{(row.pts / gp).toFixed(1)}</td>
        <td className={ct}>{(row.reb / gp).toFixed(1)}</td>
        <td className={ct}>{(row.ast / gp).toFixed(1)}</td>
        <td className={ct}>{(row.stl / gp).toFixed(1)}</td>
        <td className={ct}>{(row.blk / gp).toFixed(1)}</td>
        <td className={ct}>{(row.to / gp).toFixed(1)}</td>
        <td className={ct}>{row.fg_pct.toFixed(1)}</td>
        <td className={ct}>{row.tp_pct.toFixed(1)}</td>
        <td className={ct}>{row.ft_pct.toFixed(1)}</td>
        <td className={`${ct} font-semibold`}>{row.eff.toFixed(1)}</td>
      </>
    );
    if (careerStatsTab === "totals") return (
      <>
        <td className={ct}>{gp}</td>
        <td className={ct}>{Math.round(row.min)}</td>
        <td className={ct}>{row.pts}</td>
        <td className={ct}>{row.reb}</td>
        <td className={ct}>{row.ast}</td>
        <td className={ct}>{row.stl}</td>
        <td className={ct}>{row.blk}</td>
        <td className={ct}>{row.to}</td>
        <td className={ct}>{row.fgm}-{row.fga}</td>
        <td className={ct}>{row.tpm}-{row.tpa}</td>
        <td className={ct}>{row.ftm}-{row.fta}</td>
        <td className={`${ct} font-semibold`}>{row.eff.toFixed(1)}</td>
      </>
    );
    // Advanced metrics
    const tsDen = 2 * (row.fga + 0.44 * row.fta);
    const ts = tsDen > 0 ? (row.pts / tsDen) * 100 : 0;
    const efg = row.fga > 0 ? ((row.fgm + 0.5 * row.tpm) / row.fga) * 100 : 0;
    const pps = row.fga > 0 ? row.pts / row.fga : 0;
    const astTo = row.to > 0 ? row.ast / row.to : (row.ast > 0 ? Infinity : 0);
    const tpar = row.fga > 0 ? row.tpa / row.fga : 0;
    const ftr = row.fga > 0 ? row.fta / row.fga : 0;
    const stk = (row.stl + row.blk) / gp;
    const fmtRatio = (v: number) => (v === Infinity ? '∞' : v.toFixed(2));
    return (
      <>
        <td className={ct}>{gp}</td>
        <td className={ct}>{formatMinutes(row.min / gp)}</td>
        <td className={ct}>{ts.toFixed(1)}</td>
        <td className={ct}>{efg.toFixed(1)}</td>
        <td className={ct}>{pps.toFixed(2)}</td>
        <td className={ct}>{fmtRatio(astTo)}</td>
        <td className={ct}>{tpar.toFixed(2)}</td>
        <td className={ct}>{ftr.toFixed(2)}</td>
        <td className={ct}>{stk.toFixed(1)}</td>
        <td className={`${ct} font-semibold`}>{row.eff.toFixed(1)}</td>
      </>
    );
  };

  // Sections of the profile. The full game log is for signed-in visitors.
  const profileTabs: { key: ProfileTab; label: string; icon: typeof LayoutDashboard; locked?: boolean }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'stats', label: 'Stats', icon: BarChart3 },
    { key: 'games', label: 'Games', icon: CalendarDays },
    { key: 'splits', label: 'Splits', icon: Crosshair },
    { key: 'accolades', label: 'Accolades', icon: Award },
  ];

  // Sign-in links from the games gate come back to this profile's games.
  const authHref = (register: boolean) => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'games');
    const next = encodeURIComponent(`${window.location.pathname}?${params.toString()}`);
    return register ? `/auth?tab=register&next=${next}` : `/auth?next=${next}`;
  };

  const profileFilter = (
    <ProfileFilterBar
      seasons={filterSeasons}
      families={leagueFamilies}
      seasonValue={seasonSelectValue}
      leagueValue={leagueFamily?.key ?? ''}
      onSeasonChange={changeSeason}
      onLeagueChange={changeLeague}
    />
  );
  const hasProfileFilter = filterSeasons.length > 1 || leagueFamilies.length > 1;
  // Across more than one season the averages are career averages.
  const averagesAreCareer = !activeSeason && filterSeasons.length > 1;

  const pillStyle = { color: readablePrimary.body };

  // Beside the cards, the last section sits level with their bottom edge.
  // Plenty of players have no accolades, so their highs take that slot.
  const sideHighs = scopedAccolades.length > 0 ? [] : (scopeLeagueIds ? scopeHighs : seasonHighs.length > 0 ? seasonHighs : careerHighs).slice(0, 3);
  const sideHighsTitle = scopeLeagueIds ? (activeSeason ? 'Season highs' : 'League highs') : seasonHighs.length > 0 ? 'Season highs' : 'Career highs';

  const collectionPlayer: AccoladeCardPlayer = {
    id: playerInfo?.playerId || playerSlug,
    name: playerInfo?.name || '',
    cutoutUrl: playerPhotoUrl,
    profilePhotoUrl: playerSharePhotoUrl,
    teamColor: primaryColor || '#f97316',
  };

  // Same strings the server renders (shared/seo.ts): Google indexes the page
  // after this runs, so it needs the team and real averages too.
  const seoInput = playerInfo ? {
    name: playerInfo.name,
    team: playerInfo.team,
    competition: playerLeagues[0]?.name ?? null,
    games: seasonAverages?.games_played ?? 0,
    ppg: seasonAverages?.avg_points ?? 0,
    rpg: seasonAverages?.avg_rebounds ?? 0,
    apg: seasonAverages?.avg_assists ?? 0,
  } : null;

  return (
    <div className="ch-rise" style={{ '--ch-accent': readablePrimary.body } as CSSProperties}>
      {manageHead && seoInput && (
        <Helmet>
          <title>{playerSeoTitle(seoInput)}</title>
          <meta name="description" content={playerSeoDescription(seoInput)} />
          <meta property="og:title" content={playerSeoTitle(seoInput)} />
          <meta property="og:description" content={playerSeoDescription(seoInput)} />
        </Helmet>
      )}
      {onBack && (
        <div className="mb-4">
          <button type="button" onClick={onBack} className="ch-btn ch-btn-ghost">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      )}

      {playerInfo && (
        <PlayerBanner
          playerInfo={scopeLeagueIds && teamNameForBranding && teamBrandingLeagueId
            ? { ...playerInfo, team: teamNameForBranding, leagueId: teamBrandingLeagueId }
            : playerInfo}
          playerPhotoUrl={playerPhotoUrl}
          showFocusAdjuster={showFocusAdjuster}
          setShowFocusAdjuster={setShowFocusAdjuster}
          tempFocusY={tempFocusY}
          setTempFocusY={setTempFocusY}
          handleSaveFocus={handleSaveFocus}
          savingFocus={savingFocus}
          handlePhotoUpload={handlePhotoUpload}
          photoUploading={photoUploading}
          fileInputRef={fileInputRef}
          canEditPhoto={isAdmin}
          brandColorOverride={primaryColor || undefined}
          leagueChip={bannerLeagueChip}
          teamChip={bannerTeamChip}
          bio={seoInput ? playerBio({ ...seoInput, position: playerInfo?.position, team: playerInfo?.team || null }) : null}
        />
      )}

      {/* Only admins and the player who claimed this profile see this. */}
      {playerInfo?.playerId && (
        <div className="mt-3 flex justify-end empty:hidden">
          <PreferredNameControl
            playerId={playerInfo.playerId}
            currentName={playerInfo.name}
            relatedPlayerIds={playerMatches.map((m) => m.id)}
          />
        </div>
      )}

      {/* Section tabs, with the league filter alongside on wide screens */}
      <div className="mt-4 md:mt-5 flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-2 border-b border-[color:var(--ch-border)]">
        <nav className="flex items-stretch gap-1 overflow-x-auto scrollbar-hide -mx-1" aria-label="Player sections">
          {profileTabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={(e) => {
                  setActiveTab(tab.key);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-2 h-12 px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-[color:var(--ch-text)]' : 'text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]'
                }`}
                data-testid={`player-tab-${tab.key}`}
              >
                <tab.icon className="w-4 h-4" style={active ? { color: readablePrimary.body } : undefined} />
                {tab.label}
                {tab.locked && <Lock className="w-3 h-3 text-[color:var(--ch-muted)]" aria-label="Sign in required" />}
                <span
                  className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full transition-opacity"
                  style={{ backgroundColor: readablePrimary.accent, opacity: active ? 1 : 0 }}
                />
              </button>
            );
          })}
        </nav>
        {hasProfileFilter && <div className="pb-2 sm:pb-2.5 sm:shrink-0 min-w-0">{profileFilter}</div>}
      </div>

      <div className="mt-5 md:mt-6 space-y-8 md:space-y-10">
        {activeTab === 'overview' && <>
        {playerInfo && (
          <div className="flex flex-wrap items-center gap-2">
            {playerInfo.dbCurrentTeam && (
              <span className="ch-chip inline-flex items-center gap-2 h-8 px-3 text-[13px]">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">Current team</span>
                <span className="font-medium text-[color:var(--ch-text)]">{playerInfo.dbCurrentTeam}</span>
              </span>
            )}
            {playerInfo.dbPreviousTeams && playerInfo.dbPreviousTeams.length > 0 && (
              <span className="ch-chip inline-flex items-center gap-2 h-8 px-3 text-[13px] max-w-full">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ch-muted)] shrink-0">Also played for</span>
                <span className="truncate text-[color:var(--ch-text)]">{playerInfo.dbPreviousTeams.join(", ")}</span>
              </span>
            )}
            {playerInfo.instagramHandle && (
              <a
                href={`https://www.instagram.com/${normalizeInstagramHandle(playerInfo.instagramHandle)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ch-chip inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium text-pink-600 dark:text-pink-400"
              >
                <Instagram className="w-3.5 h-3.5" aria-hidden="true" />
                @{playerInfo.instagramHandle.replace(/^@/, "")}
              </a>
            )}
            {/* Claimed: verified adults link to their /p/ profile; minors' /p/ links stay share-by-link only. */}
            {claimInfo?.isClaimed ? (
              claimInfo.profileSlug && (
                <Link
                  href={`/p/${claimInfo.profileSlug}`}
                  className="ch-chip inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium sm:ml-auto"
                  data-testid="verified-player-profile"
                >
                  <BadgeCheck className="w-3.5 h-3.5" style={{ color: readablePrimary.body }} aria-hidden="true" />
                  Verified profile
                </Link>
              )
            ) : (
              <>
                {/* Players request a claim code (see "Own your page" on the homepage), then redeem it at /claim */}
                <Link
                  href={`/contact-sales?topic=player-page&player=${encodeURIComponent(playerInfo.name)}&url=${encodeURIComponent(window.location.origin + window.location.pathname)}`}
                  className="ch-chip inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium sm:ml-auto"
                  data-testid="claim-player-page"
                >
                  <BadgeCheck className="w-3.5 h-3.5" style={{ color: readablePrimary.body }} aria-hidden="true" />
                  Is this you? Claim this page
                </Link>
                <Link
                  href="/claim"
                  className="ch-chip inline-flex items-center h-8 px-3 text-[13px] font-medium"
                  data-testid="redeem-claim-code"
                >
                  Have a code?
                </Link>
              </>
            )}
          </div>
        )}

        <div className="pp-overview">
        <div className="pp-overview-grid">
          {pinnedGames.length > 0 && playerInfo && (
            <section className="min-w-0" aria-labelledby="player-performances-heading">
              <h2 id="player-performances-heading" className="sr-only">Performances</h2>
              {/* Room below for the cards' shadow inside the scroller, given back
                  so this column ends at the cards and lines up with the stats. */}
              <div className="tc-sizes -mx-4 px-4 scroll-px-4 sm:mx-0 sm:px-0 sm:scroll-px-0 flex gap-4 md:gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-16 -mb-16">
                {pinnedGames.map(({ stat, label, heading }) => (
                  <div key={stat.id} className="snap-start shrink-0" style={{ width: "var(--fan-card-w)" }}>
                    <h3 className="ch-section-title mb-4">{heading}</h3>
                    <TradingCard perf={toCardPerformance(stat)} shareTitle={`${label} performance`} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className={`pp-side min-w-0 ${scopedAccolades.length > 0 || sideHighs.length > 0 ? 'pp-side-fill' : ''}`}>
        {filteredSeasonAverages && (() => {
          type StatTile = { value: number; label: string; rank?: number };
          const seasonStats: StatTile[] = [
            { value: filteredSeasonAverages.avg_points, label: "PTS", rank: playerRankings?.points },
            { value: filteredSeasonAverages.avg_rebounds, label: "REB", rank: playerRankings?.rebounds },
            { value: filteredSeasonAverages.avg_assists, label: "AST", rank: playerRankings?.assists },
            { value: filteredSeasonAverages.avg_steals, label: "STL", rank: playerRankings?.steals },
            { value: filteredSeasonAverages.avg_blocks, label: "BLK", rank: playerRankings?.blocks },
            { value: filteredSeasonAverages.avg_efficiency, label: "EFF" },
          ];
          const filterLabel = scopeLabel;

          // The downloadable card: drawn on a canvas in the Swish Social look, in the club's colour.
          const generateCardBlob = () =>
            generateStatTilesCardBlob({
              player: sharePlayer,
              title: averagesAreCareer ? "CAREER AVERAGES" : "SEASON AVERAGES",
              banner: shareFilterLabel || "All competitions",
              games: filteredSeasonAverages.games_played,
              tiles: seasonStats.map((stat) => ({ label: stat.label, value: stat.value.toFixed(1), rank: stat.rank })),
            });

          return (
            <ShareableCard
              flat
              title={averagesAreCareer ? "Career Averages" : "Season Averages"}
              fileSlug="season-averages"
              player={{
                name: playerInfo?.name || "Player",
                team: playerInfo?.team || "",
                photoUrl: playerPhotoUrl,
                photoFocusY: playerInfo?.photoFocusY,
                primaryColor,
                teamLogoUrl: shareTeamLogoUrl,
              }}
              generateCardBlob={generateCardBlob}
              // The image is drawn by generateCardBlob, so the hidden capture layout isn't needed.
              shareContent={<></>}
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-4 pr-10">
                  <h3 className="whitespace-nowrap ch-section-title">{averagesAreCareer ? 'Career averages' : 'Season averages'}</h3>
                  {filterLabel && (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] truncate" style={pillStyle}>
                      {filterLabel}
                    </span>
                  )}
                </div>
                <div className="pp-tiles-6 grid grid-cols-3 gap-x-6 gap-y-5">
                  {seasonStats.map((stat, i) => (
                    <FlatStat key={i} label={stat.label} value={stat.value.toFixed(1)} rank={stat.rank ? getOrdinalSuffix(stat.rank) : undefined} rankColor={readablePrimary.body} />
                  ))}
                </div>
              </div>
            </ShareableCard>
          );
        })()}

        {filteredSeasonAverages && (() => {
          type ShootingTile = { value: number; label: string; rank?: number };
          const shootingStats: ShootingTile[] = [
            { value: filteredSeasonAverages.fg_percentage, label: "FG%", rank: playerRankings?.fg_percentage },
            { value: filteredSeasonAverages.three_point_percentage, label: "3PT%", rank: playerRankings?.three_point_percentage },
            { value: filteredSeasonAverages.ft_percentage, label: "FT%", rank: playerRankings?.ft_percentage },
          ];
          const generateCardBlob = () =>
            generateStatTilesCardBlob({
              player: sharePlayer,
              title: "SHOOTING SPLITS",
              banner: shareFilterLabel || "All competitions",
              games: filteredSeasonAverages.games_played,
              tiles: shootingStats.map((stat) => ({
                label: stat.label,
                value: `${stat.value.toFixed(1)}%`,
                rank: stat.rank,
                fill: stat.value / 100,
              })),
            });

          return (
            <ShareableCard
              flat
              title="Shooting Splits"
              fileSlug="shooting"
              player={{
                name: playerInfo?.name || "Player",
                team: playerInfo?.team || "",
                photoUrl: playerPhotoUrl,
                photoFocusY: playerInfo?.photoFocusY,
                primaryColor,
                teamLogoUrl: shareTeamLogoUrl,
              }}
              generateCardBlob={generateCardBlob}
              shareContent={<></>}
            >
              <div>
                <h3 className="ch-section-title mb-4 pr-10">Shooting</h3>
                <div className="pp-tiles-6 grid grid-cols-3 gap-x-6 gap-y-5">
                  {shootingStats.map((stat, i) => (
                    <FlatStat key={i} label={stat.label} value={formatPercentage(stat.value)} rank={stat.rank ? getOrdinalSuffix(stat.rank) : undefined} rankColor={readablePrimary.body}>
                      <StatBar percent={stat.value} color={readablePrimary.accent} />
                    </FlatStat>
                  ))}
                </div>
              </div>
            </ShareableCard>
          );
        })()}

        {sideHighs.length > 0 && (
          <div>
            <h3 className="ch-section-title mb-4">{sideHighsTitle}</h3>
            <div className="pp-tiles-6 grid grid-cols-3 gap-x-6 gap-y-5">
              {sideHighs.map((stat) => <FlatStat key={stat.label} label={stat.label} value={stat.value} />)}
            </div>
          </div>
        )}

        {scopedAccolades.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="ch-section-title">Accolades</h3>
              <button
                type="button"
                onClick={() => setActiveTab('accolades')}
                className="text-xs font-semibold hover:underline underline-offset-2"
                style={{ color: readablePrimary.body }}
              >
                View the collection ({scopedAccolades.length})
              </button>
            </div>
            <div className="pp-accolades">
              <AccoladeChips
                accolades={scopedAccolades}
                teamColor={primaryColor || '#f97316'}
                readableTeamColor={readablePrimary.body}
                onOpen={() => setActiveTab('accolades')}
              />
            </div>
          </div>
        )}
          </div>
        </div>
        </div>
        </>}

        {activeTab === 'splits' && playerInfo?.playerId && (
          // Every id the player has (one per competition), so each competition's on/off is found.
          <PlayerPerformanceSplits
            playerId={playerInfo.playerId}
            playerIds={Array.from(new Set([playerInfo.playerId, ...playerMatches.map((m) => m.id), ...statsPlayerIds]))}
            leagueIds={scopeLeagueIds ? Array.from(scopeLeagueIds) : []}
            playerName={playerInfo.name}
            playerTeam={playerInfo.team}
            playerPhotoUrl={playerPhotoUrl}
            primaryColor={primaryColor}
            teamLogoUrl={shareTeamLogoUrl}
          />
        )}

        {activeTab === 'stats' && <>
        {(careerHighs.length > 0 || seasonHighs.length > 0) && (() => {
          const HighsGrid = ({ highs }: { highs: StatHigh[] }) => (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-5">
              {highs.map((stat, i) => (
                <FlatStat key={i} label={stat.label} value={stat.value}>
                  <div className="mt-1 text-[11px] leading-tight text-[color:var(--ch-text-2)]">
                    vs {stat.opponent}
                    <br />
                    {stat.date ? formatDate(stat.date) : ''}
                  </div>
                </FlatStat>
              ))}
            </div>
          );
          // A player with only one season on record has identical season/career
          // highs — showing both blocks would just be the same numbers twice.
          const isSingleSeason = !!currentSeason && currentSeason.games.length === playedCareerGames.length;
          // With a filter on, the highs are those games' highs; the career
          // highs follow when the filter leaves some games out.
          if (scopeLeagueIds) {
            const coversCareer = filteredStats.length === playedCareerGames.length;
            return (
              <div className="space-y-8">
                {scopeHighs.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h3 className="whitespace-nowrap ch-section-title">{coversCareer ? 'Career high' : activeSeason ? 'Season high' : 'League high'}</h3>
                      {scopeLabel && (
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] truncate" style={pillStyle}>
                          {scopeLabel}
                        </span>
                      )}
                    </div>
                    <HighsGrid highs={scopeHighs} />
                  </div>
                )}
                {careerHighs.length > 0 && !coversCareer && (
                  <div>
                    <h3 className="ch-section-title mb-4">Career high</h3>
                    <HighsGrid highs={careerHighs} />
                  </div>
                )}
              </div>
            );
          }
          return (
            <div className="space-y-8">
              {seasonHighs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="whitespace-nowrap ch-section-title">{isSingleSeason ? 'Season / career high' : 'Season high'}</h3>
                    {currentSeason && (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] truncate" style={pillStyle}>
                        {currentSeason.label}
                      </span>
                    )}
                  </div>
                  <HighsGrid highs={seasonHighs} />
                </div>
              )}
              {careerHighs.length > 0 && !isSingleSeason && (
                <div>
                  <h3 className="ch-section-title mb-4">Career high</h3>
                  <HighsGrid highs={careerHighs} />
                </div>
              )}
            </div>
          );
        })()}

        {careerStats.length > 0 && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                <h3 className="ch-section-title">{activeSeason ? 'Season stats' : 'Career stats'}</h3>
                {activeSeason && filterSeasons.length > 1 && (
                  <p className="mt-1.5 text-xs text-[color:var(--ch-text-2)]">
                    {activeSeason.label} only.{' '}
                    <button type="button" className="font-semibold hover:underline underline-offset-2" style={pillStyle} onClick={() => changeSeason(ALL_SEASONS)}>
                      Every season
                    </button>
                  </p>
                )}
              </div>
              <div className="ch-seg self-start" role="tablist" aria-label="Career stats view">
                {["averages", "totals", "advanced"].map(tab => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={careerStatsTab === tab}
                    data-active={careerStatsTab === tab}
                    onClick={() => setCareerStatsTab(tab)}
                    className="px-3 h-8 text-xs font-semibold capitalize"
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto mt-4">
              <table className="ch-table ch-table-flat w-full text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--ch-border-strong)]">
                    <th className="px-2 py-2 text-left whitespace-nowrap">Season</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Team</th>
                    {careerStatsTab === "averages" && (
                      <>
                        <th className="px-2 py-2 text-center">GP</th>
                        <th className="px-2 py-2 text-center">MIN</th>
                        <th className="px-2 py-2 text-center">PTS</th>
                        <th className="px-2 py-2 text-center">REB</th>
                        <th className="px-2 py-2 text-center">AST</th>
                        <th className="px-2 py-2 text-center">STL</th>
                        <th className="px-2 py-2 text-center">BLK</th>
                        <th className="px-2 py-2 text-center">TO</th>
                        <th className="px-2 py-2 text-center">FG%</th>
                        <th className="px-2 py-2 text-center">3P%</th>
                        <th className="px-2 py-2 text-center">FT%</th>
                        <th className="px-2 py-2 text-center">EFF</th>
                      </>
                    )}
                    {careerStatsTab === "totals" && (
                      <>
                        <th className="px-2 py-2 text-center">GP</th>
                        <th className="px-2 py-2 text-center">MIN</th>
                        <th className="px-2 py-2 text-center">PTS</th>
                        <th className="px-2 py-2 text-center">REB</th>
                        <th className="px-2 py-2 text-center">AST</th>
                        <th className="px-2 py-2 text-center">STL</th>
                        <th className="px-2 py-2 text-center">BLK</th>
                        <th className="px-2 py-2 text-center">TO</th>
                        <th className="px-2 py-2 text-center">FG</th>
                        <th className="px-2 py-2 text-center">3P</th>
                        <th className="px-2 py-2 text-center">FT</th>
                        <th className="px-2 py-2 text-center">EFF</th>
                      </>
                    )}
                    {careerStatsTab === "advanced" && (
                      <>
                        <th className="px-2 py-2 text-center" title="Games Played">GP</th>
                        <th className="px-2 py-2 text-center" title="Minutes Per Game">MPG</th>
                        <th className="px-2 py-2 text-center" title="True Shooting %">TS%</th>
                        <th className="px-2 py-2 text-center" title="Effective Field Goal %">eFG%</th>
                        <th className="px-2 py-2 text-center" title="Points Per Shot (PTS / FGA)">PPS</th>
                        <th className="px-2 py-2 text-center" title="Assist to Turnover Ratio">AST/TO</th>
                        <th className="px-2 py-2 text-center" title="3-Point Attempt Rate (3PA / FGA)">3PAr</th>
                        <th className="px-2 py-2 text-center" title="Free Throw Rate (FTA / FGA)">FTr</th>
                        <th className="px-2 py-2 text-center" title="Stocks per game (STL + BLK)">STK</th>
                        <th className="px-2 py-2 text-center" title="Efficiency per game">EFF</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {careerStats.map((row, idx) => (
                    <tr key={idx} className="border-b border-[color:var(--ch-border)] text-[color:var(--ch-text)] tabular-nums">
                      <td className="px-2 py-2 text-xs font-medium text-[color:var(--ch-text-2)] whitespace-nowrap max-w-[100px] truncate">{row.season}</td>
                      <td className="px-2 py-2 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <TeamLogo teamName={row.team} leagueId={row.leagueId} size="xs" className="flex-shrink-0" />
                          {leagueSlugs.get(row.leagueId) ? (
                            <Link
                              href={teamPath(row.team, leagueSlugs.get(row.leagueId)) || `/team/${encodeURIComponent(row.team)}`}
                              className="truncate max-w-[50px] font-medium hover:underline underline-offset-2"
                            >
                              {getTeamAbbreviation(row.team)}
                            </Link>
                          ) : (
                            <span className="truncate max-w-[50px] font-medium">{getTeamAbbreviation(row.team)}</span>
                          )}
                          {row.previousTeams && row.previousTeams.length > 0 && (
                            <span
                              className="text-[10px] text-[color:var(--ch-muted)] truncate max-w-[120px]"
                              title={`Previous teams: ${row.previousTeams.join(', ')}`}
                            >
                              (prev: {row.previousTeams.map((t: string) => getTeamAbbreviation(t)).join(', ')})
                            </span>
                          )}
                        </div>
                      </td>
                      {renderCareerRow(row)}
                    </tr>
                  ))}
                  {careerTotals && careerStats.length > 1 && (
                    <tr className="font-bold text-[color:var(--ch-text)] border-t-2 tabular-nums" style={{ borderColor: readablePrimary.accent }}>
                      <td className="px-2 py-2 text-xs uppercase" style={{ color: readablePrimary.body }}>{scopeLeagueIds ? 'Total' : 'Career'}</td>
                      <td className="px-2 py-2 text-xs"></td>
                      {renderCareerRow(careerTotals)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {playerLeagues.length > 0 && (
          <div>
            <h3 className="ch-section-title mb-4">Active leagues</h3>
            <div className="flex flex-wrap gap-2">
              {playerLeagues.map((league) => (
                <Link
                  key={league.id}
                  href={`/competition/${league.slug}`}
                  className="ch-chip inline-flex items-center gap-2 h-9 px-3.5 text-[13px] font-medium"
                >
                  <Trophy className="h-4 w-4" style={{ color: readablePrimary.body }} />
                  {league.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {playerInfo?.instagramUrl && (
          <div>
            <a
              href={playerInfo.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)" }}
            >
              <Instagram className="h-4 w-4" />
              Follow on Instagram
            </a>
          </div>
        )}
        </>}

        {activeTab === 'splits' && <ShareableCard
          flat
          title="Shot Chart"
          fileSlug="shot-chart"
          player={{
            name: playerInfo?.name || "Player",
            team: playerInfo?.team || "",
            photoUrl: playerPhotoUrl,
            photoFocusY: playerInfo?.photoFocusY,
            primaryColor,
            teamLogoUrl: shareTeamLogoUrl,
          }}
          shareCaption={shotRangeLabel()}
          generateCardBlob={() =>
            generateShotChartCardBlob({ player: sharePlayer, shots: playerShotData || [], banner: shotRangeLabel() || "Full season" })
          }
          // The image is drawn by generateCardBlob, so the hidden capture layout isn't needed.
          shareContent={<></>}
        >
        <div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 md:pr-10">
            <h3 className="ch-section-title">Shot chart</h3>
            <Select value={playerShotChartRange} onValueChange={setPlayerShotChartRange}>
              <SelectTrigger className="w-full md:w-52 h-9 text-sm rounded-lg border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] text-[color:var(--ch-text)]">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="season">Full Season</SelectItem>
                <SelectItem value="last10">Last 10 Games</SelectItem>
                <SelectItem value="last5">Last 5 Games</SelectItem>
                {playerShotGamesWithKeys.map((g) => (
                  <SelectItem key={g.game_key} value={`game:${g.game_key}`}>
                    vs {g.opponent} ({new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ShotChart
            shots={playerShotData || []}
            loading={playerShotsLoading}
            compact
            flat
            emptyMessage="No shot data available for this player."
            filters={{ showQuarterFilter: true, showResultFilter: true }}
          />
        </div>
        </ShareableCard>}

        {/* The game log is public (search engines index it too); making cards
            from games is what an account adds. */}
        {activeTab === 'games' && !user && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="games-signup-prompt">
            <p className="text-sm text-[color:var(--ch-text-2)]">
              Make a shareable card from any of {playerInfo?.name ? `${playerInfo.name.split(" ")[0]}'s` : "these"} games. It's free.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Link href={authHref(true)} className="ch-btn ch-btn-primary h-9 px-4" data-testid="games-gate-register">Create free account</Link>
              <Link href={authHref(false)} className="ch-btn ch-btn-ghost h-9 px-4" data-testid="games-gate-signin">Sign in</Link>
            </div>
          </div>
        )}

        {activeTab === 'games' && <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="ch-section-title">Game log</h3>
            <div className="flex items-center gap-3 text-xs text-[color:var(--ch-muted)]">
              {filteredStats.length > 0 && (
                <span className="hidden sm:block">Tap a game for its card</span>
              )}
              {scopeLabel && <span>{scopeLabel}</span>}
            </div>
          </div>
          {filteredStats.length === 0 ? (
            <div className="py-5 text-sm text-[color:var(--ch-text-2)]">
              No games for this player{scopeLabel ? ` in ${scopeLabel}` : ""}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ch-table ch-table-flat w-full text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--ch-border-strong)]">
                    <th className="px-2 py-2 text-left whitespace-nowrap">Date</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Opp</th>
                    {showCompetitionColumn && <th className="px-2 py-2 text-left whitespace-nowrap">Competition</th>}
                    <th className="px-2 py-2 text-center">MIN</th>
                    <th className="px-2 py-2 text-center">FG</th>
                    <th className="px-2 py-2 text-center">3PT</th>
                    <th className="px-2 py-2 text-center">FT</th>
                    <th className="px-2 py-2 text-center">REB</th>
                    <th className="px-2 py-2 text-center">AST</th>
                    <th className="px-2 py-2 text-center">STL</th>
                    <th className="px-2 py-2 text-center">BLK</th>
                    <th className="px-2 py-2 text-center">TO</th>
                    <th className="px-2 py-2 text-center">PTS</th>
                    {showOnOffColumns && (
                      <>
                        <th className="px-2 py-2 text-center" title="Points scored minus conceded with the player on court (box score +/-)">ON</th>
                        <th className="px-2 py-2 text-center" title="Points scored minus conceded while the player sat">OFF</th>
                        <th className="px-2 py-2 text-center" title="On minus off">SWING</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredStats.map((game) => {
                    const opponentName = (game.opponent && game.opponent.trim()) || 'TBD';
                    const onOff = gameLogOnOff.get(game.id);
                    return (
                      <tr
                        key={game.id}
                        onClick={() => {
                          // Must run inside the tap for iOS to allow motion access.
                          requestTiltPermission();
                          setSelectedGameForCard(game);
                        }}
                        className="border-b border-[color:var(--ch-border)] text-[color:var(--ch-text)] tabular-nums cursor-pointer"
                        data-testid={`game-row-${game.id}`}
                      >
                        <td className="px-2 py-2 text-xs text-[color:var(--ch-text-2)] whitespace-nowrap">
                          {game.game_key ? (
                            <EntityLink
                              href={gamePath(leagueSlugs.get(game.league_id || ""), game.game_key)}
                              className="hover:underline underline-offset-2"
                            >
                              {formatDate(game.game_date || game.created_at || '')}
                            </EntityLink>
                          ) : formatDate(game.game_date || game.created_at || '')}
                        </td>
                        <td className="px-2 py-2 text-xs font-medium whitespace-nowrap">
                          <EntityLink href={opponentName !== 'TBD' ? teamPath(opponentName, leagueSlugs.get(game.league_id || "")) : null} className="hover:underline underline-offset-2">
                            {opponentName}
                          </EntityLink>
                        </td>
                        {showCompetitionColumn && (
                          <td className="px-2 py-2 text-xs whitespace-nowrap">
                            {leagueNames.get(game.league_id || "") ? (
                              <span
                                className="inline-block max-w-[9rem] truncate align-middle rounded-md border border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)] px-1.5 py-0.5 text-[10.5px] font-medium text-[color:var(--ch-text-2)]"
                                title={leagueNames.get(game.league_id || "")}
                              >
                                {leagueNames.get(game.league_id || "")}
                              </span>
                            ) : '—'}
                          </td>
                        )}
                        <td className="px-2 py-2 text-xs text-center whitespace-nowrap">{game.sminutes || '—'}</td>
                        <td className="px-2 py-2 text-xs text-center whitespace-nowrap">{game.sfieldgoalsmade || 0}-{game.sfieldgoalsattempted || 0}</td>
                        <td className="px-2 py-2 text-xs text-center whitespace-nowrap">{game.sthreepointersmade || 0}-{game.sthreepointersattempted || 0}</td>
                        <td className="px-2 py-2 text-xs text-center whitespace-nowrap">{game.sfreethrowsmade || 0}-{game.sfreethrowsattempted || 0}</td>
                        <td className="px-2 py-2 text-xs text-center">{game.sreboundstotal || game.rebounds_total || 0}</td>
                        <td className="px-2 py-2 text-xs text-center">{game.sassists || game.assists || 0}</td>
                        <td className="px-2 py-2 text-xs text-center">{game.ssteals || 0}</td>
                        <td className="px-2 py-2 text-xs text-center">{game.sblocks || 0}</td>
                        <td className="px-2 py-2 text-xs text-center">{game.sturnovers || game.turnovers || 0}</td>
                        <td className="px-2 py-2 text-xs text-center font-bold">{game.spoints || game.points || 0}</td>
                        {showOnOffColumns && (
                          <>
                            <td className={`px-2 py-2 text-xs text-center ${onOffTone(onOff?.on)}`}>{onOff ? signedNumber(onOff.on) : '—'}</td>
                            <td className={`px-2 py-2 text-xs text-center ${onOffTone(onOff?.off)}`}>{onOff ? signedNumber(onOff.off) : '—'}</td>
                            <td className={`px-2 py-2 text-xs text-center font-semibold ${onOffTone(onOff?.swing)}`}>{onOff ? signedNumber(onOff.swing) : '—'}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {showOnOffColumns && (
                <p className="mt-2 text-[11px] text-[color:var(--ch-muted)]">
                  On is the score with the player on court (the box score +/-), off is the score while they sat, and swing is the difference.
                </p>
              )}
            </div>
          )}
        </div>}

        {activeTab === 'accolades' && (
          <section aria-labelledby="player-collection-heading" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2
                  id="player-collection-heading"
                  className="ch-section-title"
                >
                  The collection
                </h2>
                <p className="mt-1.5 text-sm text-[color:var(--ch-text-2)]">
                  Records, league-leader finishes and career-best seasons, one holder per season. Tap a card to flip it.
                </p>
              </div>
              {scopedAccolades.length > 0 && (
                <span className="text-xs font-medium tabular-nums text-[color:var(--ch-muted)]">
                  {scopedAccolades.length} card{scopedAccolades.length === 1 ? '' : 's'}
                  {scopedAccolades.length < accoladeCollection.length ? ` of ${accoladeCollection.length}` : ''}
                </span>
              )}
            </div>
            {scopeLabel && scopedAccolades.length === 0 && accoladeCollection.length > 0 && (
              <p className="text-sm text-[color:var(--ch-text-2)]">
                No cards from {scopeLabel}.{' '}
                <button type="button" className="font-semibold hover:underline underline-offset-2" style={pillStyle} onClick={() => setFilter({ season: ALL_SEASONS, league: null })}>
                  Show all {accoladeCollection.length}
                </button>
              </p>
            )}
            {!(scopeLabel && scopedAccolades.length === 0 && accoladeCollection.length > 0) && (
              <AccoladeCollection
                accolades={scopedAccolades}
                player={collectionPlayer}
                seasonOrder={playedSeasons.map((s) => s.label)}
                competitions={cardLeagues ?? {}}
              />
            )}
          </section>
        )}
      </div>

      {selectedGameForCard && playerInfo && createPortal(
        // The card, on its own over the page. sa-pro gives it the card's
        // colour tokens outside the profile's tree. z-50 (not higher) so the
        // card's own download/share dialog, also z-50 but portalled after
        // this, opens on top instead of behind it.
        <div
          className="sa-pro fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ background: "rgba(0, 0, 0, 0.6)" }}
          onClick={() => setSelectedGameForCard(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${playerInfo.name} performance card`}
        >
          <div className="tc-sizes relative" style={{ width: "var(--fan-card-w)" }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSelectedGameForCard(null)}
              className="absolute -top-12 right-0 h-9 w-9 rounded-full bg-white/90 text-slate-700 hover:bg-white flex items-center justify-center shadow-md transition-colors"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>
            <TradingCard perf={toCardPerformance(selectedGameForCard)} shareTitle="Performance card" />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
