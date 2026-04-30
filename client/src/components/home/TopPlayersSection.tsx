import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Users, Trophy } from "lucide-react";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";

type StatKey = "points" | "rebounds" | "assists";

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
  games: number;
}

const STAT_TABS: {
  key: StatKey;
  label: string;
  field: keyof LeaderRow;
  suffix: string;
  orderColumn: "avg_pts" | "avg_reb" | "avg_ast";
}[] = [
  { key: "points", label: "Points", field: "ppg", suffix: "PPG", orderColumn: "avg_pts" },
  { key: "rebounds", label: "Rebounds", field: "rpg", suffix: "RPG", orderColumn: "avg_reb" },
  { key: "assists", label: "Assists", field: "apg", suffix: "APG", orderColumn: "avg_ast" },
];

const LEAGUE_CYCLE_MS = 5000;
const STAT_CYCLE_MS = 15000;
const COOLDOWN_MS = 12000;
const MAX_LEAGUES = 6;
const PER_LEAGUE_FETCH_LIMIT = 50;

function PlayerCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-orange-100 dark:border-neutral-800 p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-neutral-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 bg-orange-100 dark:bg-neutral-800 rounded" />
          <div className="h-3 w-24 bg-orange-100 dark:bg-neutral-800 rounded" />
        </div>
        <div className="h-6 w-12 bg-orange-100 dark:bg-neutral-800 rounded" />
      </div>
    </div>
  );
}

export default function TopPlayersSection() {
  const [, setLocation] = useLocation();
  const [leagueIdx, setLeagueIdx] = useState(0);
  const [stat, setStat] = useState<StatKey>("points");
  const [statManuallySet, setStatManuallySet] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(
    typeof document !== "undefined" ? document.hidden : false
  );
  const cooldownRef = useRef<number | null>(null);

  // Eligible leagues (trending public ∩ has any season-average data)
  const { data: leagues = [], isLoading: loadingLeagues } = useQuery<LeagueOption[]>({
    queryKey: ["supabase", "home", "top-players", "eligible-leagues"],
    queryFn: async () => {
      const { data: lgs, error: lgsError } = await supabase
        .from("leagues")
        .select("league_id, name, slug, trending_position")
        .eq("is_public", true)
        .order("trending_position", { ascending: true, nullsFirst: false })
        .limit(20)
        .returns<LeagueRow[]>();

      if (lgsError) {
        console.error("[TopPlayers] leagues error", lgsError);
      }
      if (!lgs || lgs.length === 0) return [];

      const ids = lgs.map((l) => l.league_id);
      // Tiny probe: `v_player_season_averages` is server-aggregated, so
      // returning at most ~ids.length*4 rows is a tiny scan compared to
      // pulling 2000+ raw player_stats rows.
      //
      // The probe is only used as a *filter*: if it errors or returns
      // empty (e.g. under heavy Supabase load — we have observed
      // statement-timeout 57014 on adjacent views), we fall back to the
      // league list as-is. The per-league leaders query handles its own
      // empty state, so a non-eligible league simply renders the
      // existing "No player stats yet for this league" empty state
      // instead of the entire section vanishing.
      const { data: avgRows, error: avgError } = await supabase
        .from("v_player_season_averages")
        .select("league_id")
        .in("league_id", ids)
        .limit(ids.length * 4)
        .returns<{ league_id: string }[]>();

      if (avgError) {
        console.error("[TopPlayers] eligibility probe error", avgError);
      }

      const probeRows = avgRows || [];
      const probeFailed = !!avgError || probeRows.length === 0;
      const withData = new Set(probeRows.map((r) => r.league_id));
      const filtered = probeFailed
        ? lgs.slice(0, MAX_LEAGUES)
        : lgs.filter((l) => withData.has(l.league_id)).slice(0, MAX_LEAGUES);

      return filtered.map((l) => ({ league_id: l.league_id, name: l.name, slug: l.slug }));
    },
  });

  const currentLeague = leagues[leagueIdx] || null;
  const activeStatDef = STAT_TABS.find((t) => t.key === stat) ?? STAT_TABS[0];

  // Leaders for the current league + active stat, fetched from the
  // pre-aggregated season-averages view ordered by the active column so
  // we never compute a "top rebounders" or "top assisters" list from a
  // points-biased subset. Each (league, stat) pair caches independently
  // so switching tabs hits the network at most once per pair.
  const { data: leaders = null, isLoading: loadingLeaders } = useQuery<LeaderRow[] | null>({
    queryKey: [
      "supabase",
      "home",
      "top-players",
      "leaders",
      currentLeague?.league_id ?? "none",
      stat,
    ],
    enabled: !!currentLeague,
    queryFn: async () => {
      if (!currentLeague) return [];

      // The aggregate view does NOT expose `player_id`; it identifies a
      // row by (player_name, team_id, league_id). We resolve display
      // metadata (id / slug / photo) afterward via the `players` table
      // using the same (full_name, team_id) tuple.
      const { data: rows, error: rowsErr } = await supabase
        .from("v_player_season_averages")
        .select("player_name, team_id, team_name, games_played, avg_pts, avg_reb, avg_ast")
        .eq("league_id", currentLeague.league_id)
        .order(activeStatDef.orderColumn, { ascending: false })
        .limit(PER_LEAGUE_FETCH_LIMIT)
        .returns<SeasonAverageRow[]>();

      if (rowsErr) {
        console.error("[TopPlayers] leaders error", rowsErr);
        return [];
      }
      if (!rows || rows.length === 0) return [];

      const seasonRows = rows.filter(
        (r): r is SeasonAverageRow & { player_name: string } => Boolean(r.player_name),
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
          // Keep the first-seen entry as a fallback when team_id is
          // missing; we never overwrite so a later same-name player on
          // a different team can't poach the slug/photo.
          if (!playerByName.has(p.full_name)) {
            playerByName.set(p.full_name, p);
          }
        });
      }

      return seasonRows.map((r) => {
        const name = r.player_name;
        const teamMatch = r.team_id ? playerByNameTeam.get(`${name}::${r.team_id}`) : undefined;
        const meta = teamMatch ?? playerByName.get(name);
        // The view's identifier tuple is (player_name, team_id) — we
        // synthesize a stable React key from it so duplicate same-named
        // players on different teams don't collide.
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
          games: Number(r.games_played ?? 0) || 0,
        };
      });
    },
  });

  // Visibility-aware: pause cycle timers when tab hidden so we don't trigger refetches.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  const paused = hovered || interactionPaused || tabHidden;

  // Auto-cycle leagues every 5s
  useEffect(() => {
    if (paused || leagues.length <= 1) return;
    const t = window.setInterval(() => {
      setLeagueIdx((i) => (i + 1) % leagues.length);
    }, LEAGUE_CYCLE_MS);
    return () => window.clearInterval(t);
  }, [paused, leagues.length]);

  // Auto-cycle stats every 15s — but only until the user manually picks a stat.
  useEffect(() => {
    if (statManuallySet) return;
    if (hovered || tabHidden) return;
    const t = window.setInterval(() => {
      setStat((curr) => {
        const idx = STAT_TABS.findIndex((s) => s.key === curr);
        return STAT_TABS[(idx + 1) % STAT_TABS.length].key;
      });
    }, STAT_CYCLE_MS);
    return () => window.clearInterval(t);
  }, [statManuallySet, hovered, tabHidden]);

  useEffect(() => {
    return () => {
      if (cooldownRef.current !== null) {
        window.clearTimeout(cooldownRef.current);
        cooldownRef.current = null;
      }
    };
  }, []);

  const triggerCooldown = () => {
    setInteractionPaused(true);
    if (cooldownRef.current !== null) {
      window.clearTimeout(cooldownRef.current);
    }
    cooldownRef.current = window.setTimeout(() => {
      setInteractionPaused(false);
      cooldownRef.current = null;
    }, COOLDOWN_MS);
  };

  const sortedLeaders = useMemo(() => {
    if (!leaders) return [];
    const def = STAT_TABS.find((t) => t.key === stat) ?? STAT_TABS[0];
    return [...leaders]
      .sort((a, b) => (b[def.field] as number) - (a[def.field] as number))
      .slice(0, 5);
  }, [leaders, stat]);

  const activeDef = STAT_TABS.find((t) => t.key === stat) ?? STAT_TABS[0];

  const goToPlayer = (p: LeaderRow) => {
    setLocation(`/player/${p.slug || p.player_id}`);
  };

  return (
    <section
      className="py-16 md:py-20 bg-white dark:bg-neutral-950"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 md:mb-8 animate-fade-in-up">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
              Top Players
            </h2>
            <div className="w-16 h-1 bg-orange-500 rounded-full mt-2" />
            <p className="mt-3 text-slate-600 dark:text-slate-400 text-sm md:text-base">
              Leaders across our hosted leagues — cycling every few seconds.
            </p>
          </div>

          {/* Stat tabs */}
          <div className="inline-flex rounded-full bg-orange-100 dark:bg-neutral-800 p-1 self-start md:self-end">
            {STAT_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setStat(t.key);
                  setStatManuallySet(true);
                  triggerCooldown();
                }}
                className={`px-4 py-1.5 text-xs md:text-sm font-semibold rounded-full transition-all duration-200 ${
                  stat === t.key
                    ? "bg-white dark:bg-neutral-950 text-orange-600 dark:text-orange-400 shadow"
                    : "text-orange-700 dark:text-orange-300 hover:text-orange-900 dark:hover:text-orange-200"
                }`}
                data-testid={`stat-tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* League pills */}
        {leagues.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {leagues.map((l, i) => (
              <button
                key={l.league_id}
                onClick={() => { setLeagueIdx(i); triggerCooldown(); }}
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

        {loadingLeagues || (currentLeague && (loadingLeaders || !leaders)) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4].map((i) => <PlayerCardSkeleton key={i} />)}
          </div>
        ) : sortedLeaders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-orange-200 dark:border-neutral-800 p-10 text-center text-slate-500 dark:text-slate-400">
            <Trophy className="h-8 w-8 text-orange-400 mx-auto mb-3" />
            No player stats yet for this league.
          </div>
        ) : (
          <div
            key={`${currentLeague?.league_id}-${stat}`}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {sortedLeaders.map((p, i) => {
              const value = p[activeDef.field] as number;
              return (
                <button
                  key={p.player_id}
                  onClick={() => goToPlayer(p)}
                  className="text-left rounded-2xl bg-gradient-to-br from-white to-orange-50/40 dark:from-neutral-900 dark:to-neutral-900 border border-orange-100 dark:border-neutral-800 p-4 hover:border-orange-300 dark:hover:border-orange-500/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up"
                  style={{ animationDelay: `${i * 0.05}s`, opacity: 0, animationFillMode: "forwards" }}
                  data-testid={`top-player-${i}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-14 w-14 flex-shrink-0">
                      <div className="absolute -top-1 -left-1 z-10 h-5 w-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                        {i + 1}
                      </div>
                      {p.photo_url ? (
                        <img
                          src={p.photo_url}
                          alt={p.full_name}
                          className="h-14 w-14 rounded-full object-cover border-2 border-orange-200 dark:border-neutral-700"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-full bg-gradient-to-br from-orange-300 to-orange-500 flex items-center justify-center border-2 border-orange-200 dark:border-neutral-700">
                          <Users className="h-6 w-6 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white truncate">
                        {p.full_name}
                      </div>
                      {p.team && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {p.team}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums leading-none">
                        {value.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide mt-1">
                        {activeDef.suffix}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {leagues.length > 1 && (
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {leagues.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === leagueIdx ? "w-6 bg-orange-500" : "w-1.5 bg-orange-200 dark:bg-neutral-700"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
