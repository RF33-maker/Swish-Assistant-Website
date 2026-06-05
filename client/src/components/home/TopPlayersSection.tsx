import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { Trophy } from "lucide-react";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";

interface LeagueOption {
  league_id: string;
  name: string;
  slug: string;
}

interface LeagueRow {
  league_id: string;
  name: string;
  slug: string;
  trending_position: number | null;
}

interface SeasonAverageRow {
  player_name: string | null;
  team_id: string | null;
  team_name: string | null;
  games_played: number | null;
  avg_pts: number | null;
  avg_reb: number | null;
  avg_ast: number | null;
  total_pts: number | null;
  total_reb: number | null;
  total_ast: number | null;
}

interface PlayerMetaRow {
  id: string;
  full_name: string | null;
  team_id: string | null;
  slug: string | null;
  photo_path_bg_removed: string | null;
}

interface LeaderRow {
  player_id: string;
  full_name: string;
  team: string;
  photo_url: string | null;
  slug: string | null;
  ppg: number;
  rpg: number;
  apg: number;
  total_pts: number;
  total_reb: number;
  total_ast: number;
}

const MAX_LEAGUES = 6;
const FETCH_LIMIT = 60;
const ORANGE = "rgb(249, 115, 22)";

type ViewMode = "averages" | "totals";

function LeaderCardSkeleton() {
  return (
    <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 md:p-4 animate-pulse">
      <div className="h-4 w-32 bg-gray-200 dark:bg-neutral-700 rounded mb-4" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-2.5 py-2 px-2">
          <div className="w-5 h-3 bg-gray-200 dark:bg-neutral-700 rounded" />
          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-neutral-700 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-28 bg-gray-200 dark:bg-neutral-700 rounded" />
            <div className="h-2.5 w-20 bg-gray-200 dark:bg-neutral-700 rounded" />
          </div>
          <div className="h-3 w-12 bg-gray-200 dark:bg-neutral-700 rounded" />
        </div>
      ))}
    </div>
  );
}

function LeaderCard({
  title,
  items,
  displayFn,
}: {
  title: string;
  items: LeaderRow[];
  displayFn: (p: LeaderRow) => string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 md:p-4">
      <h3 className="text-sm font-semibold mb-3 px-1" style={{ color: ORANGE }}>
        {title}
      </h3>
      <div className="space-y-0">
        {items.map((p, idx) => {
          const photoUrl = p.photo_url;
          const isClickable = !!p.slug;
          const inner = (
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="text-xs font-bold w-5 text-center text-slate-400 dark:text-slate-500 shrink-0">
                {idx + 1}
              </span>
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={p.full_name}
                  className="w-8 h-8 rounded-full object-cover object-top flex-shrink-0 bg-gray-100 dark:bg-neutral-700"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: ORANGE + "22", color: ORANGE }}
                >
                  {p.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-medium truncate hover:underline"
                  style={{ color: ORANGE }}
                >
                  {p.full_name}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {p.team || "—"}
                </p>
              </div>
            </div>
          );

          const rowClass = `flex items-center justify-between py-2 px-2 rounded-md transition-colors ${
            isClickable
              ? "hover:bg-gray-100 dark:hover:bg-neutral-700 cursor-pointer"
              : ""
          }`;

          return isClickable ? (
            <Link
              key={p.player_id}
              href={`/player/${p.slug}`}
              className={rowClass}
            >
              {inner}
              <span className="text-sm font-semibold text-slate-800 dark:text-white whitespace-nowrap ml-2">
                {displayFn(p)}
              </span>
            </Link>
          ) : (
            <div key={p.player_id} className={rowClass}>
              {inner}
              <span className="text-sm font-semibold text-slate-800 dark:text-white whitespace-nowrap ml-2">
                {displayFn(p)}
              </span>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
            No data available
          </p>
        )}
      </div>
    </div>
  );
}

export default function TopPlayersSection() {
  const [leagueIdx, setLeagueIdx] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("averages");

  const { data: leagues = [], isLoading: loadingLeagues } = useQuery<LeagueOption[]>({
    queryKey: ["supabase", "home", "top-players-v2", "eligible-leagues"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: lgs, error: lgsError } = await supabase
        .from("competitions")
        .select("league_id, name, slug, trending_position")
        .eq("is_public", true)
        .not("trending_position", "is", null)
        .order("trending_position", { ascending: true, nullsFirst: false })
        .limit(20)
        .returns<LeagueRow[]>();

      if (lgsError) {
        console.error("[TopPlayers] leagues error", lgsError);
        return [];
      }
      if (!lgs || lgs.length === 0) return [];

      const filtered = lgs
        .filter((l) => !l.name?.toLowerCase().includes("reba"))
        .slice(0, MAX_LEAGUES);

      if (filtered.length === 0) return [];

      const ids = filtered.map((l) => l.league_id);
      const { data: avgRows, error: avgError } = await supabase
        .from("v_player_season_averages")
        .select("league_id")
        .in("league_id", ids)
        .limit(ids.length * 4)
        .returns<{ league_id: string }[]>();

      if (avgError) {
        console.error("[TopPlayers] eligibility probe error", avgError);
        return filtered.map((l) => ({ league_id: l.league_id, name: l.name, slug: l.slug }));
      }

      const withData = new Set((avgRows || []).map((r) => r.league_id));
      const probeFailed = !avgRows || avgRows.length === 0;
      const eligible = probeFailed
        ? filtered
        : filtered.filter((l) => withData.has(l.league_id));

      return eligible.map((l) => ({ league_id: l.league_id, name: l.name, slug: l.slug }));
    },
  });

  const currentLeague = leagues[leagueIdx] ?? null;

  const { data: allLeaders = null, isLoading: loadingLeaders } = useQuery<LeaderRow[] | null>({
    queryKey: ["supabase", "home", "top-players-v2", "leaders", currentLeague?.league_id ?? "none"],
    enabled: !!currentLeague,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!currentLeague) return null;

      const { data: rows, error: rowsErr } = await supabase
        .from("v_player_season_averages")
        .select(
          "player_name, team_id, team_name, games_played, avg_pts, avg_reb, avg_ast, total_pts, total_reb, total_ast"
        )
        .eq("league_id", currentLeague.league_id)
        .order("avg_pts", { ascending: false })
        .limit(FETCH_LIMIT)
        .returns<SeasonAverageRow[]>();

      if (rowsErr) {
        console.error("[TopPlayers] leaders error", rowsErr);
        return null;
      }
      if (!rows || rows.length === 0) return null;

      const seasonRows = rows.filter(
        (r): r is SeasonAverageRow & { player_name: string } => Boolean(r.player_name)
      );
      const names = Array.from(new Set(seasonRows.map((r) => r.player_name)));
      const playerByNameTeam = new Map<string, PlayerMetaRow>();
      const playerByName = new Map<string, PlayerMetaRow>();

      if (names.length > 0) {
        const { data: players, error: playersErr } = await supabase
          .from("players")
          .select("id, full_name, team_id, slug, photo_path_bg_removed")
          .in("full_name", names)
          .eq("league_id", currentLeague.league_id)
          .limit(names.length * 4)
          .returns<PlayerMetaRow[]>();

        if (playersErr) {
          console.error("[TopPlayers] players lookup error", playersErr);
        }

        (players || []).forEach((p) => {
          if (!p.full_name) return;
          if (p.team_id) {
            playerByNameTeam.set(`${p.full_name}::${p.team_id}`, p);
          }
          if (!playerByName.has(p.full_name)) {
            playerByName.set(p.full_name, p);
          }
        });
      }

      return seasonRows.map((r) => {
        const name = r.player_name;
        const teamMatch = r.team_id ? playerByNameTeam.get(`${name}::${r.team_id}`) : undefined;
        const meta = teamMatch ?? playerByName.get(name);
        const syntheticId = meta?.id || `${name}::${r.team_id ?? "noteam"}`;
        return {
          player_id: syntheticId,
          full_name: meta?.full_name || name || "Unknown",
          team: r.team_name || "",
          photo_url: meta ? getPlayerPhotoUrlCached(meta.photo_path_bg_removed) : null,
          slug: meta?.slug || null,
          ppg: Number(r.avg_pts ?? 0) || 0,
          rpg: Number(r.avg_reb ?? 0) || 0,
          apg: Number(r.avg_ast ?? 0) || 0,
          total_pts: Number(r.total_pts ?? 0) || 0,
          total_reb: Number(r.total_reb ?? 0) || 0,
          total_ast: Number(r.total_ast ?? 0) || 0,
        };
      });
    },
  });

  const isAverages = viewMode === "averages";

  const scoringLeaders = allLeaders
    ? [...allLeaders]
        .sort((a, b) => (isAverages ? b.ppg - a.ppg : b.total_pts - a.total_pts))
        .slice(0, 5)
    : [];
  const rebLeaders = allLeaders
    ? [...allLeaders]
        .sort((a, b) => (isAverages ? b.rpg - a.rpg : b.total_reb - a.total_reb))
        .slice(0, 5)
    : [];
  const astLeaders = allLeaders
    ? [...allLeaders]
        .sort((a, b) => (isAverages ? b.apg - a.apg : b.total_ast - a.total_ast))
        .slice(0, 5)
    : [];

  const isLoading = loadingLeagues || (!!currentLeague && loadingLeaders);
  const hasData = allLeaders && allLeaders.length > 0;

  return (
    <section className="py-16 md:py-20 bg-white dark:bg-neutral-950">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
              Top Players
            </h2>
            <div className="w-16 h-1 bg-orange-500 rounded-full mt-2" />
            <p className="mt-3 text-slate-600 dark:text-slate-400 text-sm md:text-base">
              Leaders across our hosted leagues.
            </p>
          </div>

          {/* Averages / Totals toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 p-1 self-start sm:self-end">
            <button
              onClick={() => setViewMode("averages")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                isAverages
                  ? "bg-white dark:bg-neutral-700 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              style={isAverages ? { color: ORANGE } : {}}
            >
              Averages
            </button>
            <button
              onClick={() => setViewMode("totals")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                !isAverages
                  ? "bg-white dark:bg-neutral-700 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              style={!isAverages ? { color: ORANGE } : {}}
            >
              Totals
            </button>
          </div>
        </div>

        {/* League pills */}
        {leagues.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {leagues.map((l, i) => (
              <button
                key={l.league_id}
                onClick={() => setLeagueIdx(i)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200 ${
                  i === leagueIdx
                    ? "bg-orange-500 text-white border-orange-500 shadow-md scale-105"
                    : "bg-white dark:bg-neutral-900 text-slate-600 dark:text-slate-300 border-orange-100 dark:border-neutral-800 hover:border-orange-300"
                }`}
                data-testid={`league-pill-${l.slug}`}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}

        {/* Leader cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <LeaderCardSkeleton key={i} />
            ))}
          </div>
        ) : !hasData ? (
          <div className="rounded-2xl border border-dashed border-orange-200 dark:border-neutral-800 p-10 text-center text-slate-500 dark:text-slate-400">
            <Trophy className="h-8 w-8 text-orange-400 mx-auto mb-3" />
            No player stats yet for this league.
          </div>
        ) : (
          <div
            key={currentLeague?.league_id}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <LeaderCard
              title="Scoring Leaders"
              items={scoringLeaders}
              displayFn={(p) =>
                isAverages ? `${p.ppg.toFixed(1)} PPG` : `${Math.round(p.total_pts)} PTS`
              }
            />
            <LeaderCard
              title="Rebounding Leaders"
              items={rebLeaders}
              displayFn={(p) =>
                isAverages ? `${p.rpg.toFixed(1)} RPG` : `${Math.round(p.total_reb)} REB`
              }
            />
            <LeaderCard
              title="Assist Leaders"
              items={astLeaders}
              displayFn={(p) =>
                isAverages ? `${p.apg.toFixed(1)} APG` : `${Math.round(p.total_ast)} AST`
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}
