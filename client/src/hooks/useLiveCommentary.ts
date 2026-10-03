import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  buildCommentary,
  type CommentaryEvent,
  type CommentaryItem,
  type CommentaryShot,
  type SeasonBest,
} from "@/lib/liveCommentary";
import { buildUnambiguousFullNameAliases, expandUnambiguousPlayerName } from "@/lib/playerName";

export interface CommentaryPlayer {
  name: string;
  slug: string | null;
  photoPath: string | null;
  cutoutPath: string | null;
}

interface Options {
  gameKey: string;
  leagueId: string | null | undefined;
  homeTeam: string;
  awayTeam: string;
  events: CommentaryEvent[] | null | undefined;
  shots: (CommentaryShot & { player_id?: string | null })[] | null | undefined;
  isFinal: boolean;
  isLive: boolean;
  /** Full names known from the box score, to expand initials like "T. Fairbairn". */
  knownNames?: Array<string | null | undefined>;
}

/**
 * The game's live commentary: the engine's lines plus the players behind them
 * (full names and photos) and each one's earlier-game bests for season highs.
 * Rebuilt from the rows on every refresh, so scorer corrections show up.
 */
export function useLiveCommentary({
  gameKey, leagueId, homeTeam, awayTeam, events, shots, isFinal, isLive, knownNames = [],
}: Options): {
  items: CommentaryItem[];
  players: Record<string, CommentaryPlayer>;
  /** The shots, each tagged with the same player id the play-by-play uses. */
  shots: Array<CommentaryShot & { player_id?: string | null; success: boolean }>;
} {
  const playerIds = useMemo(
    () => Array.from(new Set((events ?? []).map((e) => e.player_id).filter((id): id is string => !!id))).sort(),
    [events],
  );
  const idsKey = playerIds.join(",");

  const { data: players } = useQuery({
    queryKey: ["commentary-players", idsKey],
    enabled: playerIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("players")
        .select("id, full_name, slug, photo_path, photo_path_bg_removed")
        .in("id", playerIds);
      const out: Record<string, { name: string; slug: string | null; photoPath: string | null; cutoutPath: string | null }> = {};
      for (const p of (data ?? []) as { id: string; full_name: string | null; slug: string | null; photo_path: string | null; photo_path_bg_removed: string | null }[]) {
        out[p.id] = { name: p.full_name || "", slug: p.slug, photoPath: p.photo_path, cutoutPath: p.photo_path_bg_removed };
      }
      return out;
    },
  });

  // Each player's best marks in their other games of this competition.
  const { data: seasonBests } = useQuery({
    queryKey: ["commentary-season-bests", leagueId, gameKey, idsKey],
    enabled: !!leagueId && playerIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("player_stats")
        .select("player_id, game_key, spoints, sthreepointersmade, sreboundstotal, sassists")
        .eq("league_id", leagueId as string)
        .in("player_id", playerIds)
        .neq("game_key", gameKey)
        .limit(3000);
      const bests: Record<string, SeasonBest> = {};
      for (const r of (data ?? []) as { player_id: string; spoints: number | null; sthreepointersmade: number | null; sreboundstotal: number | null; sassists: number | null }[]) {
        const b = (bests[r.player_id] ||= { games: 0, points: 0, threes: 0, rebounds: 0, assists: 0 });
        b.games++;
        b.points = Math.max(b.points, r.spoints ?? 0);
        b.threes = Math.max(b.threes, r.sthreepointersmade ?? 0);
        b.rebounds = Math.max(b.rebounds, r.sreboundstotal ?? 0);
        b.assists = Math.max(b.assists, r.sassists ?? 0);
      }
      return bests;
    },
  });

  const namesKey = knownNames.filter(Boolean).join("|");
  const playerNames = useMemo(() => {
    const aliases = buildUnambiguousFullNameAliases([
      ...knownNames,
      ...Object.values(players ?? {}).map((p) => p.name),
    ]);
    const out: Record<string, string> = {};
    for (const [id, p] of Object.entries(players ?? {})) {
      if (p.name) out[id] = expandUnambiguousPlayerName(p.name, aliases);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, namesKey]);

  const items = useMemo(
    () =>
      events && events.length > 0
        ? buildCommentary({ events, shots: shots ?? [], homeTeam, awayTeam, playerNames, seasonBests, isFinal })
        : [],
    // isLive is part of the key so a status flip re-renders promptly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, shots, homeTeam, awayTeam, playerNames, seasonBests, isFinal, isLive],
  );

  const resolvedPlayers = useMemo(() => {
    const out: Record<string, CommentaryPlayer> = {};
    for (const [id, p] of Object.entries(players ?? {})) out[id] = { ...p, name: playerNames[id] || p.name };
    return out;
  }, [players, playerNames]);

  // The shot chart keeps its own player ids, so tie each shot to its player
  // through the play it belongs to.
  const taggedShots = useMemo(() => {
    const playerByAction = new Map<number, string>();
    for (const e of events ?? []) if (e.action_number != null && e.player_id) playerByAction.set(e.action_number, e.player_id);
    return (shots ?? []).map((s) => ({
      ...s,
      success: !!s.success,
      player_id: (s.action_number != null && playerByAction.get(s.action_number)) || s.player_id || null,
    }));
  }, [events, shots]);

  return { items, players: resolvedPlayers, shots: taggedShots };
}
