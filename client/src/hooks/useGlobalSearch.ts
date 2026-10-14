import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { teamPath } from "@shared/seo";
import { clubSlug } from "@shared/teamIdentity";

export type SearchSuggestion =
  | { type: "competition"; name: string; slug: string; logo_url: string | null }
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
  created_at: string | null;
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
  team_name: string | null;
}

// One row per kind, so the list stays short and every kind gets a look-in.
const MAX_LEAGUES = 3;
const MAX_COMPETITIONS = 3;
const MAX_TEAMS = 4;
const MAX_PLAYERS = 5;

// Matches that start with what was typed come first, then the shortest names.
function byRelevance(query: string) {
  const q = query.trim().toLowerCase();
  return (a: { name: string }, b: { name: string }) => {
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return aStarts - bStarts || a.name.length - b.name.length || a.name.localeCompare(b.name);
  };
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

export function areSamePlayer(a: string, b: string): boolean {
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

      const [leaguesResponse, competitionsResponse, teamsResponse] = await Promise.all([
        // Brand leagues (top-level series, e.g. "Hoopsfix Pro Am")
        supabase
          .from("leagues")
          .select("name, slug, logo_url")
          .ilike("name", `%${query}%`)
          .limit(5),
        // Season/tournament instances (e.g. "Hoopsfix Pro Am 2026")
        supabase
          .from("competitions")
          .select("name, slug, logo_url, competition_id")
          .or(`name.ilike.%${query}%`)
          .eq("is_public", true),
        supabase
          .from("teams")
          .select("name, league_id, competitions:league_id(name, slug, is_public, created_at)")
          .ilike("name", `%${query}%`)
          .limit(120),
      ]);

      const playersResponse = await supabase
        .from("players")
        .select("id, full_name, slug, photo_path_bg_removed, league_id")
        .ilike("full_name", `%${query}%`)
        .limit(60);

      // Brand league results (top-level series)
      const leagueBrands: LeagueRow[] = (leaguesResponse.data as any) || [];
      // Only surface standalone competitions (seasons not grouped under a brand league)
      const leagueNames = new Set(leagueBrands.map((l) => l.name.trim().toLowerCase()));
      const standaloneCompetitions: LeagueRow[] = ((competitionsResponse.data as any[] | null) || []).filter(
        (c: any) => !c.competition_id && c.slug && !/\s/.test(c.slug) && !leagueNames.has(String(c.name).trim().toLowerCase())
      );
      const players: PlayerRow[] = (playersResponse.data as PlayerRow[] | null) || [];
      const teams: TeamRow[] = (teamsResponse.data as TeamRow[] | null) || [];

      const playerTeamMap: Record<string, string> = {};
      if (players.length > 0) {
        const playerIds = players.map((p) => p.id);
        const { data: statsData } = await supabase
          .from("player_stats")
          .select("player_id, team_name")
          .in("player_id", playerIds)
          .limit(100);
        if (statsData) {
          (statsData as PlayerStatRow[]).forEach((s) => {
            const key = String(s.player_id);
            if (key && s.team_name && !playerTeamMap[key]) {
              playerTeamMap[key] = s.team_name;
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

      const uniquePlayers: SearchSuggestion[] = playerGroups.slice(0, 60).map((group) => {
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

      // A club is one record however many competitions it has played in
      // (league, cup, trophy, past seasons): grouped by its permanent page,
      // shown with the most recently created competition.
      const clubs = new Map<string, { latest: { row: TeamRow; league: LeagueRef | null }; leagueIds: Set<string> }>();
      teams.forEach((team) => {
        const league: LeagueRef | null = Array.isArray((team as any).competitions)
          ? ((team as any).competitions[0] ?? null)
          : (team as any).competitions;
        if (league?.is_public === false) return;
        const key = clubSlug(team.name);
        if (!key) return;
        const club = clubs.get(key);
        if (!club) {
          clubs.set(key, { latest: { row: team, league }, leagueIds: new Set([team.league_id]) });
          return;
        }
        club.leagueIds.add(team.league_id);
        if ((league?.created_at || "") > (club.latest.league?.created_at || "")) {
          club.latest = { row: team, league };
        }
      });

      const uniqueTeams: SearchSuggestion[] = Array.from(clubs.values())
        .map(({ latest, leagueIds }): Extract<SearchSuggestion, { type: "team" }> => {
          const leagueName = latest.league?.name || "";
          return {
            type: "team",
            name: latest.row.name,
            league_id: latest.row.league_id,
            league_name: leagueIds.size > 1 ? `${leagueIds.size} competitions` : leagueName,
            league_slug: latest.league?.slug || "",
          };
        })
        .sort(byRelevance(query))
        .slice(0, MAX_TEAMS);

      const formattedLeagues: SearchSuggestion[] = leagueBrands.map(
        (l): SearchSuggestion => ({
          type: "league",
          name: l.name,
          slug: l.slug,
          logo_url: l.logo_url ?? null,
        })
      );

      const formattedCompetitions: SearchSuggestion[] = standaloneCompetitions.map(
        (c): SearchSuggestion => ({
          type: "competition",
          name: c.name,
          slug: c.slug,
          logo_url: c.logo_url ?? null,
        })
      );

      const combined = [
        ...formattedLeagues.sort(byRelevance(query)).slice(0, MAX_LEAGUES),
        ...formattedCompetitions.sort(byRelevance(query)).slice(0, MAX_COMPETITIONS),
        ...uniqueTeams,
        ...uniquePlayers.sort(byRelevance(query)).slice(0, MAX_PLAYERS),
      ];
      setSuggestions(combined);
    };

    const delay = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(delay);
  }, [query]);

  const handleSelect = (item: SearchSuggestion) => {
    setQuery("");
    setSuggestions([]);

    if (item.type === "competition") {
      setLocation(`/competition/${item.slug}`);
    } else if (item.type === "league") {
      setLocation(`/league/${item.slug}`);
    } else if (item.type === "team") {
      // The permanent team page opens on its most recent competition.
      setLocation(teamPath(item.name) || `/team/${encodeURIComponent(item.name)}`);
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
      .from("competitions")
      .select("slug")
      .ilike("name", `%${query.toLowerCase()}%`)
      .eq("is_public", true);

    if (data && data.length > 0) {
      const first = data[0] as { slug: string };
      setLocation(`/competition/${first.slug}`);
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
