import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Users, Trophy } from "lucide-react";

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

interface PlayerStatRow {
  player_id: string | null;
  full_name: string | null;
  name: string | null;
  team: string | null;
  spoints: number | null;
  sreboundstotal: number | null;
  sassists: number | null;
  points: number | null;
  rebounds_total: number | null;
  assists: number | null;
}

interface PlayerMetaRow {
  id: string;
  full_name: string | null;
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

interface Aggregate {
  full_name: string;
  team: string;
  pts: number;
  reb: number;
  ast: number;
  games: number;
}

const STAT_TABS: { key: StatKey; label: string; field: keyof LeaderRow; suffix: string }[] = [
  { key: "points", label: "Points", field: "ppg", suffix: "PPG" },
  { key: "rebounds", label: "Rebounds", field: "rpg", suffix: "RPG" },
  { key: "assists", label: "Assists", field: "apg", suffix: "APG" },
];

const LEAGUE_CYCLE_MS = 5000;
const STAT_CYCLE_MS = 15000;
const COOLDOWN_MS = 12000;

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
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [leagueIdx, setLeagueIdx] = useState(0);
  const [stat, setStat] = useState<StatKey>("points");
  const [statManuallySet, setStatManuallySet] = useState(false);
  const [leaders, setLeaders] = useState<LeaderRow[] | null>(null);
  const [loadingLeaders, setLoadingLeaders] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const cooldownRef = useRef<number | null>(null);

  // Fetch leagues that have player_stats
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: lgs } = await supabase
        .from("leagues")
        .select("league_id, name, slug, trending_position")
        .eq("is_public", true)
        .order("trending_position", { ascending: true, nullsFirst: false })
        .limit(20)
        .returns<LeagueRow[]>();

      if (!lgs || lgs.length === 0) {
        if (!cancelled) setLeagues([]);
        return;
      }

      const ids = lgs.map((l) => l.league_id);
      const { data: statsRows } = await supabase
        .from("player_stats")
        .select("league_id")
        .in("league_id", ids)
        .limit(2000)
        .returns<{ league_id: string }[]>();

      const withData = new Set((statsRows || []).map((r) => r.league_id));
      const filtered = lgs.filter((l) => withData.has(l.league_id)).slice(0, 6);

      if (cancelled) return;
      setLeagues(filtered.map((l) => ({ league_id: l.league_id, name: l.name, slug: l.slug })));
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const currentLeague = leagues[leagueIdx] || null;

  // Fetch leaders for current league
  useEffect(() => {
    if (!currentLeague) {
      // No eligible league at all — exit the loading skeleton so the empty
      // state can render instead of perpetual skeletons.
      setLeaders([]);
      setLoadingLeaders(false);
      return;
    }
    let cancelled = false;
    setLoadingLeaders(true);

    const load = async () => {
      const { data: stats } = await supabase
        .from("player_stats")
        .select("player_id, full_name, name, team, spoints, sreboundstotal, sassists, points, rebounds_total, assists")
        .eq("league_id", currentLeague.league_id)
        .not("player_id", "is", null)
        .limit(3000)
        .returns<PlayerStatRow[]>();

      if (!stats || stats.length === 0) {
        if (!cancelled) {
          setLeaders([]);
          setLoadingLeaders(false);
        }
        return;
      }

      const agg: Record<string, Aggregate> = {};
      stats.forEach((s) => {
        if (!s.player_id) return;
        const id = String(s.player_id);
        if (!agg[id]) {
          agg[id] = {
            full_name: s.full_name || s.name || "Unknown",
            team: s.team || "",
            pts: 0, reb: 0, ast: 0, games: 0,
          };
        }
        const a = agg[id];
        a.pts += Number(s.spoints ?? s.points ?? 0) || 0;
        a.reb += Number(s.sreboundstotal ?? s.rebounds_total ?? 0) || 0;
        a.ast += Number(s.sassists ?? s.assists ?? 0) || 0;
        a.games += 1;
        if (!a.team && s.team) a.team = s.team;
        if (s.full_name && s.full_name.length > a.full_name.length) a.full_name = s.full_name;
      });

      const playerIds = Object.keys(agg);
      const { data: players } = await supabase
        .from("players")
        .select("id, full_name, slug, photo_path_bg_removed")
        .in("id", playerIds)
        .returns<PlayerMetaRow[]>();

      const playerMeta: Record<string, { slug: string | null; photo_url: string | null; full_name: string | null }> = {};
      (players || []).forEach((p) => {
        let photo_url: string | null = null;
        if (p.photo_path_bg_removed) {
          const { data } = supabase.storage.from("player-photos").getPublicUrl(p.photo_path_bg_removed);
          photo_url = data?.publicUrl || null;
        }
        playerMeta[String(p.id)] = {
          slug: p.slug || null,
          photo_url,
          full_name: p.full_name || null,
        };
      });

      const rows: LeaderRow[] = Object.entries(agg)
        .filter(([, v]) => v.games >= 1)
        .map(([id, v]) => ({
          player_id: id,
          full_name: playerMeta[id]?.full_name || v.full_name,
          team: v.team,
          photo_url: playerMeta[id]?.photo_url || null,
          slug: playerMeta[id]?.slug || null,
          ppg: v.pts / v.games,
          rpg: v.reb / v.games,
          apg: v.ast / v.games,
          games: v.games,
        }));

      if (cancelled) return;
      setLeaders(rows);
      setLoadingLeaders(false);
    };

    load();
    return () => { cancelled = true; };
  }, [currentLeague?.league_id]);

  const paused = hovered || interactionPaused;

  // Auto-cycle leagues every 5s
  useEffect(() => {
    if (paused || leagues.length <= 1) return;
    const t = window.setInterval(() => {
      setLeagueIdx((i) => (i + 1) % leagues.length);
    }, LEAGUE_CYCLE_MS);
    return () => window.clearInterval(t);
  }, [paused, leagues.length]);

  // Auto-cycle stats every 15s — but only until the user manually picks a stat.
  // League cycling continues independently of stat cycling.
  useEffect(() => {
    if (statManuallySet) return;
    if (hovered) return; // hover pauses stat cycle too, but interactionPaused does not block stat cycle override
    const t = window.setInterval(() => {
      setStat((curr) => {
        const idx = STAT_TABS.findIndex((s) => s.key === curr);
        return STAT_TABS[(idx + 1) % STAT_TABS.length].key;
      });
    }, STAT_CYCLE_MS);
    return () => window.clearInterval(t);
  }, [statManuallySet, hovered]);

  // Cleanup cooldown timer on unmount
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
                  // Brief pause on interaction (per spec) so the user can read
                  // the freshly-sorted leaders. League cycling resumes shortly.
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

        {loadingLeaders || !leaders ? (
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
