import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trophy, Filter } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { generatePlayerAnalysis, type PlayerAnalysisData } from "@/lib/ai-analysis";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerBanner } from "@/components/PlayerBanner";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { useReadableTeamColor } from "@/hooks/useReadableColor";
import { namesMatch, getMostCompleteName, slugToName, type PlayerMatch } from "@/lib/fuzzyMatch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ShotChart, { type ShotData } from "@/components/ShotChart";
import ShareableCard from "@/components/ShareableCard";
import { withAlpha } from "@/lib/colorContrast";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";

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
  "id, slug, full_name, team_name, position, shirtNumber, league_id, photo_path_bg_removed, photo_path, photo_focus_y, height_cm, date_of_birth";

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

interface PlayerOnOffRow {
  player_id: string;
  player_name: string;
  team_id: string | null;
  game_key: string;
  on_seconds: number | null;
  off_seconds: number | null;
  on_ortg: number | null;
  off_ortg: number | null;
  on_drtg: number | null;
  off_drtg: number | null;
  on_nrtg: number | null;
  off_nrtg: number | null;
  on_oreb_pct: number | null;
  off_oreb_pct: number | null;
  on_dreb_pct: number | null;
  off_dreb_pct: number | null;
  on_reb_pct: number | null;
  off_reb_pct: number | null;
  on_ast_pct: number | null;
  off_ast_pct: number | null;
  on_blk_pct: number | null;
  off_blk_pct: number | null;
  on_stl_pct: number | null;
  off_stl_pct: number | null;
  on_tov_pct: number | null;
  off_tov_pct: number | null;
}

const ON_OFF_METRICS: { key: string; label: string; isPercent: boolean; higherIsBetter: boolean }[] = [
  { key: 'ortg', label: 'ORTG', isPercent: false, higherIsBetter: true },
  { key: 'drtg', label: 'DRTG', isPercent: false, higherIsBetter: false },
  { key: 'nrtg', label: 'NRTG', isPercent: false, higherIsBetter: true },
  { key: 'oreb_pct', label: 'OREB%', isPercent: true, higherIsBetter: true },
  { key: 'dreb_pct', label: 'DREB%', isPercent: true, higherIsBetter: true },
  { key: 'reb_pct', label: 'REB%', isPercent: true, higherIsBetter: true },
  { key: 'ast_pct', label: 'AST%', isPercent: true, higherIsBetter: true },
  { key: 'blk_pct', label: 'BLK%', isPercent: true, higherIsBetter: true },
  { key: 'stl_pct', label: 'STL%', isPercent: true, higherIsBetter: true },
  { key: 'tov_pct', label: 'TOV%', isPercent: true, higherIsBetter: false },
];

interface PlayerProfileContentProps {
  playerSlug: string;
  brandColorOverride?: string;
  onBack?: () => void;
}

const getTeamAbbreviation = (name: string): string => {
  if (!name) return '—';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
  return words.map(w => w[0]).join('').toUpperCase().substring(0, 4);
};

export function PlayerProfileContent({ playerSlug, brandColorOverride, onBack }: PlayerProfileContentProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
  const [seasonAverages, setSeasonAverages] = useState<SeasonAverages | null>(null);
  const [playerRankings, setPlayerRankings] = useState<PlayerRankings | null>(null);
  const [playerInfo, setPlayerInfo] = useState<{ name: string; team: string; position?: string; number?: number; leagueId?: string; playerId?: string; photoPath?: string | null; sharePhotoPath?: string | null; photoFocusY?: number | null; previousTeams?: string[]; height?: string | null; heightCm?: number | null; dateOfBirth?: string | null } | null>(null);
  const [playerLeagues, setPlayerLeagues] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [playerMatches, setPlayerMatches] = useState<PlayerMatch[]>([]);
  const [nameVariations, setNameVariations] = useState<string[]>([]);
  const [selectedLeagueFilter, setSelectedLeagueFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [leagueNames, setLeagueNames] = useState<Map<string, string>>(new Map());
  const [playerShotChartRange, setPlayerShotChartRange] = useState<string>("season");
  const [careerStatsTab, setCareerStatsTab] = useState<string>("averages");
  const [photoUploading, setPhotoUploading] = useState(false);
  // Cache-buster appended to photo URLs so the browser/CDN doesn't serve a
  // stale (cached) version of the same storage path. Initialized on mount so
  // every page load gets a fresh URL (avoids cross-session staleness from
  // pre-bg-removal uploads), and bumped after every successful upload.
  const [photoCacheBuster, setPhotoCacheBuster] = useState<number>(() => Date.now());
  const [showFocusAdjuster, setShowFocusAdjuster] = useState(false);
  const [tempFocusY, setTempFocusY] = useState<number>(50);
  const [savingFocus, setSavingFocus] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { primaryColor: brandedPrimary } = useTeamBranding({
    teamName: playerInfo?.team || "",
    leagueId: playerInfo?.leagueId || "",
    enabled: !brandColorOverride && !!playerInfo?.team && !!playerInfo?.leagueId,
  });

  const primaryColor = brandColorOverride || brandedPrimary;
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

      const { error: updateError } = await supabase
        .from('players')
        .update({ photo_path_bg_removed: filePath })
        .eq('id', playerInfo.playerId);

      if (updateError) throw updateError;

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

      const playedStats = allStats.filter(stat => parseMinutesPlayed(stat) > 0);
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

    const fetchPlayerData = async () => {
      setLoading(true);
      try {
        let initialPlayer: any = null;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerSlug);

        if (isUUID) {
          const { data, error } = await supabase.from('players').select(PLAYER_PROFILE_COLUMNS).eq('id', playerSlug).single();
          if (data && !error) initialPlayer = data;
        } else {
          const { data, error } = await supabase.from('players').select(PLAYER_PROFILE_COLUMNS).eq('slug', playerSlug).single();
          if (data && !error) initialPlayer = data;

          if (!initialPlayer) {
            const searchName = slugToName(playerSlug);
            // Slug lookup failed — fall back to a small prefix-bounded
            // search.
            //
            // The previous code paged through `players` with
            // `.limit(10000)` when no direct ilike match was found,
            // scanning the whole table on every cold profile load. We
            // now:
            //   * use a prefix `ilike('full_name', '${name}%')` so an
            //     index on `full_name` can serve the lookup instead of
            //     a full sequential scan, and
            //   * project only the columns this component actually
            //     consumes via PLAYER_PROFILE_COLUMNS.
            //
            // The slug column is the canonical identifier; this
            // fallback only exists for legacy human-readable URLs.
            const { data: directMatch, error: directError } = await supabase
              .from('players')
              .select(PLAYER_PROFILE_COLUMNS)
              .ilike('full_name', `${searchName}%`)
              .limit(10);

            if (directMatch && directMatch.length > 0 && !directError) {
              initialPlayer = directMatch.find(player => namesMatch(player.full_name, searchName)) || directMatch[0];
            }
          }
        }

        if (!initialPlayer) {
          console.error('❌ Could not find player:', playerSlug);
          toast({
            title: "Player Not Found",
            description: "Could not find player with the specified identifier",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const searchTerms = initialPlayer.full_name.split(' ').filter((t: string) => t.length > 2);
        const searchQuery = searchTerms[searchTerms.length - 1] || initialPlayer.full_name;

        // Fetch only the small set of name-variant players we'll match
        // against. We use a contains-style match here intentionally: this
        // path needs to find variants with extra middle initials, suffixes,
        // accent stripping, etc. that the namesMatch dedupe handles. The
        // search term is the *last* significant token (typically a
        // surname), and we cap the fetch at 20 rows + only the columns
        // PLAYER_PROFILE_COLUMNS exposes — the previous `.limit(100)` with
        // `select('*')` was wasteful for what is essentially a dedupe loop.
        const { data: allPlayersData, error: allPlayersError } = await supabase
          .from('players').select(PLAYER_PROFILE_COLUMNS).ilike('full_name', `%${searchQuery}%`).limit(20);

        // Always keep the slug-resolved `initialPlayer` in the candidate set —
        // with the tighter limit, a common surname could push the canonical
        // record off the ilike result, breaking the namesMatch dedupe and
        // leaving `playerIds` empty for the stats fetch below.
        let allPlayers: any[] = [initialPlayer];
        if (!allPlayersError && allPlayersData && allPlayersData.length > 0) {
          const seen = new Set<string>([initialPlayer.id]);
          allPlayers = [
            initialPlayer,
            ...allPlayersData.filter((p: any) => {
              if (!p?.id || seen.has(p.id)) return false;
              seen.add(p.id);
              return true;
            }),
          ];
        }

        const matchingPlayers = allPlayers.filter(player => namesMatch(player.full_name, initialPlayer.full_name));

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

        const canonicalName = getMostCompleteName(variations);

        let pInfo = {
          name: canonicalName,
          team: initialPlayer.team_name || initialPlayer.team,
          position: initialPlayer.position,
          number: initialPlayer.shirtNumber ?? initialPlayer.number,
          leagueId: initialPlayer.league_id,
          playerId: initialPlayer.id,
          photoPath: initialPlayer.photo_path_bg_removed,
          sharePhotoPath: initialPlayer.photo_path,
          photoFocusY: initialPlayer.photo_focus_y,
          height: initialPlayer.height || null,
          heightCm: initialPlayer.height_cm || null,
          dateOfBirth: initialPlayer.date_of_birth || null,
        };

        const playerIds = matches.map(m => m.id);
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
        const statsResults = await Promise.all(
          playerIds.map(async (pid) => {
            const { data, error } = await supabase
              .from('player_stats')
              .select('*')
              .eq('player_id', pid)
              .order('created_at', { ascending: false })
              .limit(STATS_PER_PLAYER_LIMIT);
            return { data, error };
          })
        );
        const firstError = statsResults.find(r => r.error)?.error || null;
        const seenStatIds = new Set<string>();
        const mergedStats: any[] = [];
        for (const r of statsResults) {
          for (const row of (r.data || [])) {
            const k = row.id || `${row.player_id}::${row.game_key}`;
            if (seenStatIds.has(k)) continue;
            seenStatIds.add(k);
            mergedStats.push(row);
          }
        }
        mergedStats.sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });
        const stats = mergedStats;
        const statsError = firstError;

        const uniqueLeagueIds = Array.from(new Set([
          ...matches.map(m => m.league_id),
          ...(stats || []).map((s: any) => s.league_id),
        ].filter(Boolean)));

        const leagueInfoLocal = new Map<string, { name: string; parent_league_id?: string | null; age_group?: string | null; stop?: number | null }>();
        const leagueMapLocal = new Map<string, string>();

        if (uniqueLeagueIds.length > 0) {
          const { data: leaguesData } = await supabase
            .from('leagues')
            .select('league_id, name, parent_league_id, age_group, stop')
            .in('league_id', uniqueLeagueIds);

          if (leaguesData) {
            const parentIds: string[] = [];
            leaguesData.forEach(league => {
              leagueMapLocal.set(league.league_id, league.name);
              leagueInfoLocal.set(league.league_id, {
                name: league.name,
                parent_league_id: league.parent_league_id,
                age_group: league.age_group,
                stop: league.stop,
              });
              if (league.parent_league_id && !uniqueLeagueIds.includes(league.parent_league_id)) {
                parentIds.push(league.parent_league_id);
              }
            });

            const uniqueParentIds = Array.from(new Set(parentIds));
            if (uniqueParentIds.length > 0) {
              const { data: parentLeagues } = await supabase
                .from('leagues').select('league_id, name').in('league_id', uniqueParentIds);
              if (parentLeagues) {
                parentLeagues.forEach(pl => leagueMapLocal.set(pl.league_id, pl.name));
              }
            }

            setLeagueNames(leagueMapLocal);
          }
        }

        if (statsError) {
          console.error('❌ Error fetching player stats:', statsError);
          toast({
            title: "Error Loading Stats",
            description: "Failed to load player statistics",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        let statsWithOpponents = stats || [];
        if (stats && stats.length > 0) {
          const gameKeys = Array.from(new Set(stats.map(stat => stat.game_key).filter(Boolean)));

          if (gameKeys.length > 0) {
            const { data: gamesData, error: gamesError } = await supabase
              .from('game_schedule').select('game_key, hometeam, awayteam').in('game_key', gameKeys);

            if (!gamesError && gamesData && gamesData.length > 0) {
              const gameKeyMap = new Map<string, { hometeam: string; awayteam: string }>();
              gamesData.forEach(game => {
                if (game.game_key) gameKeyMap.set(game.game_key, { hometeam: game.hometeam, awayteam: game.awayteam });
              });

              statsWithOpponents = stats.map(stat => {
                let derivedOpponent = undefined;
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
                return { ...stat, opponent: derivedOpponent || stat.opponent };
              });
            }
          }

          const userId = stats[0].user_id;
          if (userId) {
            const { data: leaguesData } = await supabase
              .from('leagues').select('name, slug, user_id').eq('user_id', userId).eq('is_public', true);

            if (leaguesData && leaguesData.length > 0) {
              let actualLeague = leaguesData.find(league =>
                league.name.toLowerCase().includes('uwe') && league.name.toLowerCase().includes('d1')
              );
              if (!actualLeague) actualLeague = leaguesData[0];
              setPlayerLeagues([{ id: actualLeague.slug, name: actualLeague.name, slug: actualLeague.slug }]);
            } else {
              setPlayerLeagues([]);
            }
          }
        }

        statsWithOpponents = statsWithOpponents.map((stat: any) => {
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
            const stopSuffix = info.stop != null ? ` Stop ${info.stop}` : '';
            groupLabel = `${parentName}${ageSuffix}${stopSuffix}`;
          } else {
            groupKey = lid;
            groupLabel = leagueMapLocal.get(lid) || lid;
          }
          return { ...stat, _groupKey: groupKey, _groupLabel: groupLabel };
        });

        setPlayerStats(statsWithOpponents);

        if (statsWithOpponents && statsWithOpponents.length > 0 && statsWithOpponents[0].players) {
          const sortedByGameDate = [...statsWithOpponents].sort((a, b) => {
            const dateA = a.game_date ? new Date(a.game_date).getTime() : 0;
            const dateB = b.game_date ? new Date(b.game_date).getTime() : 0;
            return dateB - dateA;
          });
          const mostRecentStat = sortedByGameDate[0] || statsWithOpponents[0];

          const normalizeTeam = (t: string) => t.trim().toLowerCase();
          const allTeams = statsWithOpponents
            .map(s => s.team_name || s.team)
            .filter((team): team is string => Boolean(team));
          const teamMap = new Map<string, string>();
          allTeams.forEach(team => {
            const norm = normalizeTeam(team);
            if (!teamMap.has(norm)) teamMap.set(norm, team);
          });
          const uniqueTeams = Array.from(teamMap.values());
          const currentTeam = mostRecentStat.team_name || mostRecentStat.team || 'Unknown Team';
          const currentTeamNorm = normalizeTeam(currentTeam);
          const previousTeams = uniqueTeams.filter(t => normalizeTeam(t) !== currentTeamNorm);

          pInfo = {
            name: mostRecentStat.players?.full_name || mostRecentStat.full_name || mostRecentStat.name || `${mostRecentStat.firstname || ''} ${mostRecentStat.familyname || ''}`.trim() || 'Unknown Player',
            team: currentTeam,
            position: pInfo.position || mostRecentStat.playingposition || mostRecentStat.position,
            number: pInfo.number ?? mostRecentStat.shirtnumber ?? mostRecentStat.number,
            leagueId: mostRecentStat.league_id,
            playerId: pInfo.playerId,
            photoPath: pInfo.photoPath,
            photoFocusY: pInfo.photoFocusY,
            previousTeams: previousTeams.length > 0 ? previousTeams : undefined,
            height: pInfo.height,
            heightCm: pInfo.heightCm,
            dateOfBirth: pInfo.dateOfBirth,
          };
        }

        setPlayerInfo(pInfo);

        const gamesPlayed = (stats || []).filter(stat => parseMinutesPlayed(stat) > 0);

        if (gamesPlayed && gamesPlayed.length > 0) {
          if (!pInfo || !pInfo.name || pInfo.name === 'Unknown Player') {
            const fallbackName = gamesPlayed[0].players?.full_name || gamesPlayed[0].full_name || gamesPlayed[0].name || `${gamesPlayed[0].firstname || ''} ${gamesPlayed[0].familyname || ''}`.trim() || 'Unknown Player';
            const fallbackTeam = gamesPlayed[0].team_name || gamesPlayed[0].team || 'Unknown Team';

            const normalizeTeamFallback = (t: string) => t.trim().toLowerCase();
            const allTeamsFallback = gamesPlayed.map(s => s.team_name || s.team).filter((team): team is string => Boolean(team));
            const teamMapFallback = new Map<string, string>();
            allTeamsFallback.forEach(team => {
              const norm = normalizeTeamFallback(team);
              if (!teamMapFallback.has(norm)) teamMapFallback.set(norm, team);
            });
            const uniqueTeamsFallback = Array.from(teamMapFallback.values());
            const fallbackTeamNorm = normalizeTeamFallback(fallbackTeam);
            const previousTeamsFallback = uniqueTeamsFallback.filter(t => normalizeTeamFallback(t) !== fallbackTeamNorm);

            setPlayerInfo({
              name: fallbackName,
              team: fallbackTeam,
              position: pInfo.position || gamesPlayed[0].playingposition || gamesPlayed[0].position,
              number: pInfo.number ?? gamesPlayed[0].shirtnumber ?? gamesPlayed[0].number,
              leagueId: gamesPlayed[0].league_id,
              playerId: pInfo.playerId,
              photoPath: pInfo.photoPath,
              photoFocusY: pInfo.photoFocusY,
              previousTeams: previousTeamsFallback.length > 0 ? previousTeamsFallback : undefined,
              height: pInfo.height,
              heightCm: pInfo.heightCm,
              dateOfBirth: pInfo.dateOfBirth,
            });
          }

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

          const rankingLeagueId = gamesPlayed[0].league_id;
          if (rankingLeagueId) {
            const leagueOnlyGames = gamesPlayed.filter((g: any) => g.league_id === rankingLeagueId);
            if (leagueOnlyGames.length > 0) {
              const lt = leagueOnlyGames.reduce((acc: any, g: any) => ({
                points: acc.points + (g.spoints || 0),
                rebounds: acc.rebounds + (g.sreboundstotal || 0),
                assists: acc.assists + (g.sassists || 0),
                steals: acc.steals + (g.ssteals || 0),
                blocks: acc.blocks + (g.sblocks || 0),
                fg_made: acc.fg_made + (g.sfieldgoalsmade || 0),
                fg_att: acc.fg_att + (g.sfieldgoalsattempted || 0),
                three_made: acc.three_made + (g.sthreepointersmade || 0),
                three_att: acc.three_att + (g.sthreepointersattempted || 0),
                ft_made: acc.ft_made + (g.sfreethrowsmade || 0),
                ft_att: acc.ft_att + (g.sfreethrowsattempted || 0),
              }), { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg_made: 0, fg_att: 0, three_made: 0, three_att: 0, ft_made: 0, ft_att: 0 });
              const lg = leagueOnlyGames.length;
              const rankAverages: SeasonAverages = {
                games_played: lg,
                avg_points: lt.points / lg,
                avg_rebounds: lt.rebounds / lg,
                avg_assists: lt.assists / lg,
                avg_steals: lt.steals / lg,
                avg_blocks: lt.blocks / lg,
                fg_percentage: lt.fg_att > 0 ? (lt.fg_made / lt.fg_att) * 100 : 0,
                three_point_percentage: lt.three_att > 0 ? (lt.three_made / lt.three_att) * 100 : 0,
                ft_percentage: lt.ft_att > 0 ? (lt.ft_made / lt.ft_att) * 100 : 0,
                avg_efficiency: 0,
              };
              // Fire-and-forget: ranking math walks every player_stats row
              // in the league (5k+ for full-season leagues) and would
              // otherwise hold the "Loading…" spinner up for ~5–10s.
              // Letting it resolve in the background lets the profile
              // render immediately and the rank chips fill in shortly
              // after.
              calculateRankings(rankingLeagueId, rankAverages, pInfo.name, playerIds)
                .then((ranks) => { if (ranks) setPlayerRankings(ranks); })
                .catch((err) => console.warn('[Rankings] background error:', err));
            }
          }

          if (pInfo && averages) {
            setAnalysisLoading(true);
            try {
              const analysisData: PlayerAnalysisData = {
                name: pInfo.name,
                games_played: averages.games_played,
                avg_points: averages.avg_points,
                avg_rebounds: averages.avg_rebounds,
                avg_assists: averages.avg_assists,
                avg_steals: averages.avg_steals,
                avg_blocks: averages.avg_blocks,
                fg_percentage: averages.fg_percentage,
                three_point_percentage: averages.three_point_percentage,
                ft_percentage: averages.ft_percentage,
              };
              const analysis = await generatePlayerAnalysis(analysisData);
              setAiAnalysis(analysis);
            } catch (error) {
              console.error("❌ AI Analysis error:", error);
              setAiAnalysis("Dynamic player with strong fundamentals and competitive drive.");
            } finally {
              setAnalysisLoading(false);
            }
          }
        }
      } catch (error) {
        console.error('❌ PlayerProfileContent - Unexpected error:', error);
        toast({
          title: "Error",
          description: "Failed to load player data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [playerSlug]);

  const filteredStats = useMemo(() => {
    let stats = playerStats;
    if (selectedLeagueFilter !== "all") {
      stats = playerStats.filter(stat => {
        const statLeagueId = stat.players?.league_id || stat.league_id;
        return statLeagueId === selectedLeagueFilter;
      });
    }
    return stats.filter(stat => parseMinutesPlayed(stat) > 0);
  }, [playerStats, selectedLeagueFilter]);

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
    const sorted = [...playerStats]
      .filter(s => s.game_key)
      .sort((a, b) => new Date(b.game_date || b.created_at || '').getTime() - new Date(a.game_date || a.created_at || '').getTime());
    if (playerShotChartRange === "last5") return sorted.slice(0, 5).map(s => s.game_key).filter(Boolean) as string[];
    if (playerShotChartRange === "last10") return sorted.slice(0, 10).map(s => s.game_key).filter(Boolean) as string[];
    if (playerShotChartRange.startsWith("game:")) return [playerShotChartRange.replace("game:", "")];
    return sorted.map(s => s.game_key).filter(Boolean) as string[];
  }, [playerStats, playerShotChartRange]);

  const playerIdsForShots = useMemo(() => playerMatches.map(m => m.id), [playerMatches]);

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

  const { data: playerOnOffRows = [] } = useQuery<PlayerOnOffRow[]>({
    queryKey: ['player-on-off', playerIdsForShots],
    queryFn: async () => {
      if (playerIdsForShots.length === 0) return [];
      // The player_on_off Supabase view is expensive on a cold plan cache
      // and can exceed the 30s statement_timeout when hit directly from
      // the browser. We proxy through `/api/player-on-off/:id`, which
      // caches results in-memory on the server and retries transient
      // statement_timeout errors. Issue one request per linked player id
      // in parallel and merge/dedupe the rows.
      const results = await Promise.all(
        playerIdsForShots.map(async (pid) => {
          try {
            const res = await fetch(`/api/player-on-off/${pid}`);
            if (!res.ok) {
              console.error('player_on_off endpoint error for', pid, res.status);
              return [] as PlayerOnOffRow[];
            }
            const j = await res.json();
            return (j.rows || []) as PlayerOnOffRow[];
          } catch (err) {
            console.error('player_on_off fetch failed for', pid, err);
            return [] as PlayerOnOffRow[];
          }
        })
      );
      const seen = new Set<string>();
      const merged: PlayerOnOffRow[] = [];
      for (const arr of results) {
        for (const row of arr) {
          const key = `${row.player_id}::${row.game_key}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(row);
        }
      }
      return merged;
    },
    enabled: playerIdsForShots.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const onOffSummary = useMemo(() => {
    if (!playerOnOffRows || playerOnOffRows.length === 0 || !playerInfo?.name) return null;

    const canonicalName = playerInfo.name;
    const allowedGameKeys = new Set(
      filteredStats.map(s => s.game_key).filter((k): k is string => Boolean(k))
    );

    const rows = playerOnOffRows.filter(r => {
      const nameOk = r.player_name && namesMatch(canonicalName, r.player_name);
      const keyOk = allowedGameKeys.size === 0 || allowedGameKeys.has(r.game_key);
      return nameOk && keyOk;
    });

    if (rows.length === 0) return null;

    const summary = ON_OFF_METRICS.map(m => {
      let onSum = 0;
      let onWeight = 0;
      let offSum = 0;
      let offWeight = 0;
      for (const r of rows) {
        const onSec = r.on_seconds || 0;
        const offSec = r.off_seconds || 0;
        const onVal = (r as any)[`on_${m.key}`];
        const offVal = (r as any)[`off_${m.key}`];
        if (onVal != null && onSec > 0) {
          onSum += onVal * onSec;
          onWeight += onSec;
        }
        if (offVal != null && offSec > 0) {
          offSum += offVal * offSec;
          offWeight += offSec;
        }
      }
      const on = onWeight > 0 ? onSum / onWeight : null;
      const off = offWeight > 0 ? offSum / offWeight : null;
      const diff = on != null && off != null ? on - off : null;
      return { ...m, on, off, diff };
    });

    if (summary.every(m => m.on == null && m.off == null)) return null;
    return summary;
  }, [playerOnOffRows, playerInfo?.name, filteredStats]);

  const playerShotGamesWithKeys = useMemo(() => {
    if (!playerStats) return [];
    return playerStats
      .filter(s => s.game_key)
      .sort((a, b) => new Date(b.game_date || b.created_at || '').getTime() - new Date(a.game_date || a.created_at || '').getTime())
      .map(s => ({ game_key: s.game_key!, opponent: s.opponent || 'TBD', date: s.game_date || s.created_at || '' }))
      .filter((g, i, arr) => arr.findIndex(x => x.game_key === g.game_key) === i);
  }, [playerStats]);

  const playerPhotoUrl = useMemo(
    () => getPlayerPhotoUrlCached(playerInfo?.photoPath ?? null, photoCacheBuster || undefined),
    [playerInfo?.photoPath, photoCacheBuster]
  );

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

  const careerStats = useMemo(() => {
    if (!playerStats || playerStats.length === 0) return [];

    const leagueGroups = new Map<string, any[]>();
    playerStats.forEach((stat: any) => {
      const key = stat._groupKey || stat.league_id || 'unknown';
      if (!leagueGroups.has(key)) leagueGroups.set(key, []);
      leagueGroups.get(key)!.push(stat);
    });

    const seasons: any[] = [];
    leagueGroups.forEach((stats) => {
      const played = stats.filter((s: any) => parseMinutesPlayed(s) > 0);
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
  }, [playerStats, leagueNames]);

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

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatMinutes = (min: number) => min.toFixed(1);
  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{ borderColor: readablePrimary.accent }}></div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading player profile...</p>
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
    return (
      <>
        <td className={ct}>{gp}</td>
        <td className={ct}>{row.eff.toFixed(1)}</td>
        <td className={ct}>{(row.to / gp).toFixed(1)}</td>
        <td className={ct}>{row.fg_pct.toFixed(1)}</td>
        <td className={ct}>{row.tp_pct.toFixed(1)}</td>
        <td className={ct}>{row.ft_pct.toFixed(1)}</td>
        <td className={ct}>{(row.pts / gp).toFixed(1)}</td>
        <td className={ct}>{(row.reb / gp).toFixed(1)}</td>
        <td className={ct}>{(row.ast / gp).toFixed(1)}</td>
        <td className={ct}>{(row.stl / gp).toFixed(1)}</td>
        <td className={ct}>{(row.blk / gp).toFixed(1)}</td>
      </>
    );
  };

  return (
    <div className="animate-fade-in-up">
      {onBack && (
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      )}

      {playerInfo && (
        <div className="w-screen relative" style={{ marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)' }}>
          <PlayerBanner
            playerInfo={playerInfo}
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
            isAuthenticated={!!user}
          />
        </div>
      )}

      <div className="space-y-4 md:space-y-5 mt-4 md:mt-5">
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
          // Derive border / pill / track colours from the contrast-safe
          // `onWhite` accent so very light team colours (white, pale yellow)
          // still produce a visible tinted border, badge and progress track
          // instead of vanishing into the white tile.
          const shareAccent = readablePrimary.onWhite;
          const shareTileBorder = withAlpha(shareAccent, 0.18);
          const sharePillBg = withAlpha(shareAccent, 0.12);
          const filterLabel = selectedLeagueFilter !== "all"
            ? (leagueNames.get(selectedLeagueFilter) || 'Filtered')
            : null;

          const shareBlock = (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Season Averages
                </span>
                {filterLabel && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: sharePillBg, color: shareAccent }}
                  >
                    {filterLabel}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {seasonStats.map((stat, i) => (
                  <div
                    key={i}
                    className="rounded-xl px-2 py-3 flex flex-col items-center text-center bg-white"
                    style={{ border: `1px solid ${shareTileBorder}`, boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      {stat.label}
                    </div>
                    <div
                      className="text-3xl font-black tabular-nums leading-none"
                      style={{ color: shareAccent }}
                    >
                      {stat.value.toFixed(1)}
                    </div>
                    <div className="mt-2 h-[18px] flex items-center">
                      {stat.rank ? (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide tabular-nums"
                          style={{ backgroundColor: sharePillBg, color: shareAccent }}
                        >
                          {getOrdinalSuffix(stat.rank)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );

          return (
            <ShareableCard
              title="Season Averages"
              fileSlug="season-averages"
              player={{
                name: playerInfo?.name || "Player",
                team: playerInfo?.team || "",
                photoUrl: playerPhotoUrl,
                primaryColor,
              }}
              shareContent={shareBlock}
            >
              <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Season Averages</span>
                  {selectedLeagueFilter !== "all" && (
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: readablePrimary.accent, color: readablePrimary.body }}>
                      {leagueNames.get(selectedLeagueFilter) || 'Filtered'}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
                  {seasonStats.map((stat, i) => (
                    <div key={i} className={`text-center py-2 ${i >= 3 ? 'hidden md:block' : ''}`}>
                      <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
                        {stat.label} {stat.rank ? <span className="text-[10px] normal-case">{getOrdinalSuffix(stat.rank)}</span> : null}
                      </div>
                      <div className="text-2xl md:text-3xl font-black tabular-nums" style={{ color: readablePrimary.body }}>
                        {stat.value.toFixed(1)}
                      </div>
                    </div>
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
          // Derive accents from the contrast-safe `onWhite` variant so light
          // team colours (white / pale yellow) still produce a visible
          // border, rank pill and progress track on the white tile.
          const shareAccent = readablePrimary.onWhite;
          const shareTileBorder = withAlpha(shareAccent, 0.18);
          const sharePillBg = withAlpha(shareAccent, 0.12);
          const shareTrackBg = withAlpha(shareAccent, 0.15);

          const shareBlock = (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3 block">
                Shooting
              </span>
              <div className="grid grid-cols-3 gap-2.5">
                {shootingStats.map((stat, i) => (
                  <div
                    key={i}
                    className="rounded-xl px-2 pt-3 pb-3 flex flex-col items-center text-center bg-white"
                    style={{ border: `1px solid ${shareTileBorder}`, boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      {stat.label}
                    </div>
                    <div
                      className="text-3xl font-black tabular-nums leading-none"
                      style={{ color: shareAccent }}
                    >
                      {formatPercentage(stat.value)}
                    </div>
                    <div className="mt-2 h-[18px] flex items-center">
                      {stat.rank ? (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide tabular-nums"
                          style={{ backgroundColor: sharePillBg, color: shareAccent }}
                        >
                          {getOrdinalSuffix(stat.rank)}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="w-full mt-2.5 h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: shareTrackBg }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(stat.value, 100)}%`, backgroundColor: shareAccent }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );

          return (
            <ShareableCard
              title="Shooting Splits"
              fileSlug="shooting"
              player={{
                name: playerInfo?.name || "Player",
                team: playerInfo?.team || "",
                photoUrl: playerPhotoUrl,
                primaryColor,
              }}
              shareContent={shareBlock}
            >
              <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 block">Shooting</span>
                <div className="grid grid-cols-3 gap-4">
                  {shootingStats.map((stat, i) => (
                    <div key={i} className="text-center">
                      <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
                        {stat.label} {stat.rank ? <span className="text-[10px] normal-case">{getOrdinalSuffix(stat.rank)}</span> : null}
                      </div>
                      <div className="text-xl md:text-2xl font-black tabular-nums" style={{ color: readablePrimary.body }}>{formatPercentage(stat.value)}</div>
                      <div className="mt-1.5 bg-gray-100 dark:bg-neutral-700 h-1 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(stat.value, 100)}%`, backgroundColor: readablePrimary.accent }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ShareableCard>
          );
        })()}

        {onOffSummary && (
          <ShareableCard
            title="Team On/Off Impact"
            fileSlug="on-off-impact"
            player={{
              name: playerInfo?.name || "Player",
              team: playerInfo?.team || "",
              photoUrl: playerPhotoUrl,
              primaryColor,
            }}
          >
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4" data-testid="player-on-off-card">
            <span className="text-base md:text-lg font-bold text-slate-800 dark:text-white mb-3 block">Team on/off impact</span>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-100 dark:border-neutral-800 text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wider">
                    <th className="px-2 py-2 text-left font-semibold"></th>
                    <th className="px-2 py-2 text-right font-semibold">ON</th>
                    <th className="px-2 py-2 text-right font-semibold">OFF</th>
                    <th className="px-2 py-2 text-right font-semibold">DIFF</th>
                  </tr>
                </thead>
                <tbody>
                  {onOffSummary.map((m, idx) => {
                    const fmtVal = (v: number | null) => {
                      if (v == null) return '—';
                      return m.isPercent ? `${v.toFixed(1)}%` : v.toFixed(1);
                    };
                    const fmtDiff = (v: number | null) => {
                      if (v == null) return '—';
                      const abs = m.isPercent ? `${Math.abs(v).toFixed(1)}%` : Math.abs(v).toFixed(1);
                      const sign = v < 0 ? '\u2212' : '+';
                      return `${sign}${abs}`;
                    };
                    let diffColor = 'text-slate-700 dark:text-slate-300';
                    if (m.diff != null && m.diff !== 0) {
                      const better = m.higherIsBetter ? m.diff > 0 : m.diff < 0;
                      diffColor = better ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
                    }
                    return (
                      <tr
                        key={m.key}
                        className={`border-b border-gray-50 dark:border-neutral-800/50 ${idx % 2 === 1 ? 'bg-gray-50/50 dark:bg-neutral-800/30' : ''}`}
                        data-testid={`on-off-row-${m.key}`}
                      >
                        <td className="px-2 py-2 font-semibold uppercase tracking-wide text-xs text-slate-500 dark:text-slate-400">{m.label}</td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-800 dark:text-white tabular-nums">{fmtVal(m.on)}</td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-800 dark:text-white tabular-nums">{fmtVal(m.off)}</td>
                        <td className={`px-2 py-2 text-right font-semibold tabular-nums ${diffColor}`}>{fmtDiff(m.diff)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">How a player's team performs when they are on vs. off court.</p>
          </div>
          </ShareableCard>
        )}

        {careerStats.length > 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 overflow-hidden">
            <div className="p-4 pb-0 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <span className="text-base md:text-lg font-bold text-slate-800 dark:text-white">Career Stats</span>
              <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-700">
                {["averages", "totals", "advanced"].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setCareerStatsTab(tab)}
                    className={`px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium transition-colors capitalize ${
                      careerStatsTab === tab ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-neutral-800'
                    }`}
                    style={careerStatsTab === tab ? { backgroundColor: readablePrimary.onWhite } : {}}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-y border-gray-100 dark:border-neutral-800 text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wider">
                    <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Season</th>
                    <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Team</th>
                    {careerStatsTab === "averages" && (
                      <>
                        <th className="px-2 py-1.5 text-center font-semibold">GP</th>
                        <th className="px-2 py-1.5 text-center font-semibold">MIN</th>
                        <th className="px-2 py-1.5 text-center font-semibold">PTS</th>
                        <th className="px-2 py-1.5 text-center font-semibold">REB</th>
                        <th className="px-2 py-1.5 text-center font-semibold">AST</th>
                        <th className="px-2 py-1.5 text-center font-semibold">STL</th>
                        <th className="px-2 py-1.5 text-center font-semibold">BLK</th>
                        <th className="px-2 py-1.5 text-center font-semibold">TO</th>
                        <th className="px-2 py-1.5 text-center font-semibold">FG%</th>
                        <th className="px-2 py-1.5 text-center font-semibold">3P%</th>
                        <th className="px-2 py-1.5 text-center font-semibold">FT%</th>
                        <th className="px-2 py-1.5 text-center font-semibold">EFF</th>
                      </>
                    )}
                    {careerStatsTab === "totals" && (
                      <>
                        <th className="px-2 py-1.5 text-center font-semibold">GP</th>
                        <th className="px-2 py-1.5 text-center font-semibold">MIN</th>
                        <th className="px-2 py-1.5 text-center font-semibold">PTS</th>
                        <th className="px-2 py-1.5 text-center font-semibold">REB</th>
                        <th className="px-2 py-1.5 text-center font-semibold">AST</th>
                        <th className="px-2 py-1.5 text-center font-semibold">STL</th>
                        <th className="px-2 py-1.5 text-center font-semibold">BLK</th>
                        <th className="px-2 py-1.5 text-center font-semibold">TO</th>
                        <th className="px-2 py-1.5 text-center font-semibold">FG</th>
                        <th className="px-2 py-1.5 text-center font-semibold">3P</th>
                        <th className="px-2 py-1.5 text-center font-semibold">FT</th>
                        <th className="px-2 py-1.5 text-center font-semibold">EFF</th>
                      </>
                    )}
                    {careerStatsTab === "advanced" && (
                      <>
                        <th className="px-2 py-1.5 text-center font-semibold">GP</th>
                        <th className="px-2 py-1.5 text-center font-semibold">EFF</th>
                        <th className="px-2 py-1.5 text-center font-semibold">TO</th>
                        <th className="px-2 py-1.5 text-center font-semibold">FG%</th>
                        <th className="px-2 py-1.5 text-center font-semibold">3P%</th>
                        <th className="px-2 py-1.5 text-center font-semibold">FT%</th>
                        <th className="px-2 py-1.5 text-center font-semibold">PTS</th>
                        <th className="px-2 py-1.5 text-center font-semibold">REB</th>
                        <th className="px-2 py-1.5 text-center font-semibold">AST</th>
                        <th className="px-2 py-1.5 text-center font-semibold">STL</th>
                        <th className="px-2 py-1.5 text-center font-semibold">BLK</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {careerStats.map((row, idx) => (
                    <tr key={idx} className={`border-b border-gray-50 dark:border-neutral-800/50 text-slate-700 dark:text-slate-300 ${idx % 2 === 1 ? 'bg-gray-50/50 dark:bg-neutral-800/30' : ''}`}>
                      <td className="px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap max-w-[100px] truncate">{row.season}</td>
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <TeamLogo teamName={row.team} leagueId={row.leagueId} size="xs" className="flex-shrink-0" />
                          <span className="truncate max-w-[50px]">{getTeamAbbreviation(row.team)}</span>
                          {row.previousTeams && row.previousTeams.length > 0 && (
                            <span
                              className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[120px]"
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
                    <tr className="font-bold text-slate-900 dark:text-white border-t-2" style={{ borderColor: readablePrimary.accent }}>
                      <td className="px-2 py-1.5 text-xs uppercase" style={{ color: readablePrimary.body }}>Career</td>
                      <td className="px-2 py-1.5 text-xs"></td>
                      {renderCareerRow(careerTotals)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {playerLeagues.length > 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 block">Active Leagues</span>
            <div className="flex flex-wrap gap-2">
              {playerLeagues.map((league) => (
                <button
                  key={league.id}
                  onClick={() => setLocation(`/league/${league.slug}`)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 hover:border-orange-300 dark:hover:border-orange-500/50 bg-white dark:bg-neutral-800 hover:bg-orange-50 dark:hover:bg-neutral-700 transition-colors text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  <Trophy className="h-4 w-4 text-orange-500" />
                  {league.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <ShareableCard
          title="Shot Chart"
          fileSlug="shot-chart"
          player={{
            name: playerInfo?.name || "Player",
            team: playerInfo?.team || "",
            photoUrl: playerPhotoUrl,
            primaryColor,
          }}
          shareCaption={(() => {
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
          })()}
          shareContent={
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-100 dark:border-neutral-800 p-4">
              <ShotChart
                shots={playerShotData || []}
                loading={playerShotsLoading}
                compact
                emptyMessage="No shot data available for this player."
              />
            </div>
          }
        >
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Shot Chart</span>
            <Select value={playerShotChartRange} onValueChange={setPlayerShotChartRange}>
              <SelectTrigger className="w-full md:w-48 h-8 text-sm border-gray-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
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
            emptyMessage="No shot data available for this player."
            filters={{ showQuarterFilter: true, showResultFilter: true }}
          />
        </div>
        </ShareableCard>

        {playerMatches.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-orange-500" />
            <span className="text-sm text-slate-600 dark:text-slate-400">Competition:</span>
            <Select value={selectedLeagueFilter} onValueChange={setSelectedLeagueFilter}>
              <SelectTrigger className="w-auto min-w-[160px] h-8 text-sm border-gray-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white" data-testid="select-league-filter">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
                <SelectItem value="all" data-testid="select-league-all" className="dark:text-white dark:focus:bg-neutral-700">All Competitions</SelectItem>
                {Array.from(new Set(playerMatches.map(m => m.league_id))).filter(Boolean).map(leagueId => (
                  <SelectItem key={leagueId} value={leagueId} data-testid={`select-league-${leagueId}`} className="dark:text-white dark:focus:bg-neutral-700">
                    {leagueNames.get(leagueId) || leagueId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
            <span className="text-base md:text-lg font-bold text-slate-800 dark:text-white">Game Log</span>
          </div>
          {filteredStats.length === 0 ? (
            <div className="p-6 md:p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              No game statistics found for this player{selectedLeagueFilter !== "all" ? " in the selected competition" : ""}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-800 text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wider">
                    <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Date</th>
                    <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">OPP</th>
                    <th className="px-2 py-1.5 text-center font-semibold">MIN</th>
                    <th className="px-2 py-1.5 text-center font-semibold">FG</th>
                    <th className="px-2 py-1.5 text-center font-semibold">3PT</th>
                    <th className="px-2 py-1.5 text-center font-semibold">FT</th>
                    <th className="px-2 py-1.5 text-center font-semibold">REB</th>
                    <th className="px-2 py-1.5 text-center font-semibold">AST</th>
                    <th className="px-2 py-1.5 text-center font-semibold">STL</th>
                    <th className="px-2 py-1.5 text-center font-semibold">BLK</th>
                    <th className="px-2 py-1.5 text-center font-semibold">TO</th>
                    <th className="px-2 py-1.5 text-center font-semibold">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStats.map((game, index) => {
                    const opponentName = (game.opponent && game.opponent.trim()) || 'TBD';
                    return (
                      <tr
                        key={game.id}
                        className={`border-b border-gray-50 dark:border-neutral-800/50 text-slate-700 dark:text-slate-300 ${index % 2 === 1 ? 'bg-gray-50/50 dark:bg-neutral-800/30' : ''}`}
                        data-testid={`game-row-${game.id}`}
                      >
                        <td className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(game.game_date || game.created_at)}</td>
                        <td className="px-2 py-1.5 text-xs font-medium whitespace-nowrap">{opponentName}</td>
                        <td className="px-2 py-1.5 text-xs text-center whitespace-nowrap">{game.sminutes || '—'}</td>
                        <td className="px-2 py-1.5 text-xs text-center whitespace-nowrap">{game.sfieldgoalsmade || 0}-{game.sfieldgoalsattempted || 0}</td>
                        <td className="px-2 py-1.5 text-xs text-center whitespace-nowrap">{game.sthreepointersmade || 0}-{game.sthreepointersattempted || 0}</td>
                        <td className="px-2 py-1.5 text-xs text-center whitespace-nowrap">{game.sfreethrowsmade || 0}-{game.sfreethrowsattempted || 0}</td>
                        <td className="px-2 py-1.5 text-xs text-center">{game.sreboundstotal || game.rebounds_total || 0}</td>
                        <td className="px-2 py-1.5 text-xs text-center">{game.sassists || game.assists || 0}</td>
                        <td className="px-2 py-1.5 text-xs text-center">{game.ssteals || 0}</td>
                        <td className="px-2 py-1.5 text-xs text-center">{game.sblocks || 0}</td>
                        <td className="px-2 py-1.5 text-xs text-center">{game.sturnovers || game.turnovers || 0}</td>
                        <td className="px-2 py-1.5 text-xs text-center font-bold text-slate-900 dark:text-white">{game.spoints || game.points || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
