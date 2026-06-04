import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export type SearchSuggestion =
  | { type: "league"; name: string; slug: string; logo_url: string | null }
  | { type: "team"; name: string; league_id: string; league_name: string; league_slug: string }
  | { type: "player"; name: string; team: string; player_id: string | number; player_slug: string | null; photo_url: string | null };

interface LeagueRow {
  name: string;
  slug: string;
  logo_url: string | null;
}

interface LeagueRef {
  name: string;
  slug: string;
  is_public: boolean;
}

interface TeamRow {
  name: string;
  league_id: string;
  leagues: LeagueRef | LeagueRef[] | null;
}

interface PlayerRow {
  id: string | number;
  full_name: string;
  slug: string | null;
  photo_path_bg_removed: string | null;
  league_id: string | null;
}

interface PlayerStatRow {
  player_id: string | number;
  team: string | null;
}

function isAbbreviated(name: string): boolean {
  const parts = name.trim().split(/\s+/);
  return parts.some((p) => p.length <= 2 || p.includes("."));
}

function getNameParts(name: string): { first: string; last: string } {
  const clean = name.toLowerCase().replace(/[.\-']/g, "").replace(/\s+/g, " ").trim();
  const parts = clean.split(" ").filter((p) => !["jr", "sr", "ii", "iii", "iv"].includes(p));
  return { first: parts[0] || "", last: parts[parts.length - 1] || "" };
}

function areSamePlayer(a: string, b: string): boolean {
  const pa = getNameParts(a);
  const pb = getNameParts(b);
  if (pa.last !== pb.last) return false;
  if (pa.first === pb.first) return true;
  if (
    pa.first.length >= 1 &&
    pb.first.length >= 1 &&
    pa.first[0] === pb.first[0] &&
    (pa.first.length <= 2 || pb.first.length <= 2)
  )
    return true;
  return false;
}

export function useGlobalSearch() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.trim().length === 0) {
        setSuggestions([]);
        return;
      }

      const [leaguesResponse, teamsResponse] = await Promise.all([
        supabase
          .from("leagues")
          .select("name, slug, logo_url")
          .or(`name.ilike.%${query}%`)
          .eq("is_public", true),
        supabase
          .from("teams")
          .select("name, league_id, leagues:league_id(name, slug, is_public)")
          .ilike("name", `%${query}%`)
          .limit(20),
      ]);

      const playersResponse = await supabase
        .from("players")
        .select("id, full_name, slug, photo_path_bg_removed, league_id")
        .ilike("full_name", `%${query}%`)
        .limit(30);

      const leagues: LeagueRow[] = (leaguesResponse.data as LeagueRow[] | null) || [];
      const players: PlayerRow[] = (playersResponse.data as PlayerRow[] | null) || [];
      const teams: TeamRow[] = (teamsResponse.data as TeamRow[] | null) || [];

      const playerTeamMap: Record<string, string> = {};
      if (players.length > 0) {
        const playerIds = players.map((p) => p.id);
        const { data: statsData } = await supabase
          .from("player_stats")
          .select("player_id, team")
          .in("player_id", playerIds)
          .limit(100);
        if (statsData) {
          (statsData as PlayerStatRow[]).forEach((s) => {
            const key = String(s.player_id);
            if (key && s.team && !playerTeamMap[key]) {
              playerTeamMap[key] = s.team;
            }
          });
        }
      }

      const playerGroups: PlayerRow[][] = [];
      players.forEach((player) => {
        const existingGroup = playerGroups.find((group) =>
          group.some((p) => areSamePlayer(p.full_name, player.full_name))
        );
        if (existingGroup) {
          existingGroup.push(player);
        } else {
          playerGroups.push([player]);
        }
      });

      const uniquePlayers: SearchSuggestion[] = playerGroups.map((group) => {
        group.sort((a, b) => {
          if (a.photo_path_bg_removed && !b.photo_path_bg_removed) return -1;
          if (!a.photo_path_bg_removed && b.photo_path_bg_removed) return 1;
          const aAbbr = isAbbreviated(a.full_name);
          const bAbbr = isAbbreviated(b.full_name);
          if (!aAbbr && bAbbr) return -1;
          if (aAbbr && !bAbbr) return 1;
          if (b.full_name.length !== a.full_name.length) return b.full_name.length - a.full_name.length;
          return String(a.id).localeCompare(String(b.id));
        });
        const best = group[0];
        let photoUrl: string | null = null;
        if (best.photo_path_bg_removed) {
          const { data: urlData } = supabase.storage
            .from("player-photos")
            .getPublicUrl(best.photo_path_bg_removed);
          photoUrl = urlData?.publicUrl || null;
        }
        return {
          type: "player",
          name: best.full_name,
          team: playerTeamMap[String(best.id)] || "",
          player_id: best.id,
          player_slug: best.slug,
          photo_url: photoUrl,
        } satisfies SearchSuggestion;
      });

      const uniqueTeams: SearchSuggestion[] = teams.reduce<SearchSuggestion[]>((acc, team) => {
        const leagueJoin: LeagueRef | null = Array.isArray(team.leagues)
          ? (team.leagues[0] ?? null)
          : team.leagues;
        if (leagueJoin?.is_public === false) return acc;
        const alreadyPresent = acc.some(
          (t) => t.type === "team" && t.name === team.name && t.league_id === team.league_id
        );
        if (!alreadyPresent) {
          acc.push({
            type: "team",
            name: team.name,
            league_id: team.league_id,
            league_name: leagueJoin?.name || "",
            league_slug: leagueJoin?.slug || "",
          } satisfies SearchSuggestion);
        }
        return acc;
      }, []);

      const formattedLeagues: SearchSuggestion[] = leagues.map(
        (league): SearchSuggestion => ({
          type: "league",
          name: league.name,
          slug: league.slug,
          logo_url: league.logo_url ?? null,
        })
      );

      const combined = [...formattedLeagues, ...uniqueTeams, ...uniquePlayers].slice(0, 10);
      setSuggestions(combined);
    };

    const delay = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(delay);
  }, [query]);

  const handleSelect = (item: SearchSuggestion) => {
    setQuery("");
    setSuggestions([]);

    if (item.type === "league") {
      setLocation(`/league/${item.slug}`);
    } else if (item.type === "team") {
      const encodedName = encodeURIComponent(item.name);
      if (item.league_slug) {
        setLocation(`/league/${item.league_slug}/team/${encodedName}`);
      } else {
        setLocation(`/team/${encodedName}`);
      }
    } else if (item.type === "player") {
      const identifier = item.player_slug || item.player_id;
      setLocation(`/player/${identifier}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (suggestions.length > 0) {
      handleSelect(suggestions[0]);
      return;
    }

    const { data } = await supabase
      .from("leagues")
      .select("slug")
      .ilike("name", `%${query.toLowerCase()}%`)
      .eq("is_public", true);

    if (data && data.length > 0) {
      const first = data[0] as { slug: string };
      setLocation(`/league/${first.slug}`);
    }
  };

  const clearSuggestions = () => setSuggestions([]);

  return {
    query,
    setQuery,
    suggestions,
    handleSelect,
    handleSubmit,
    clearSuggestions,
  };
}
