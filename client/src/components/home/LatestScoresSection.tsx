import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "@/components/TeamLogo";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface LeagueRow {
  league_id: string;
  name: string;
  slug: string;
  trending_position: number | null;
}

interface GameRow {
  game_key: string;
  league_id: string;
  match_time: string | null;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  game_status: string | null;
}

interface ScoreItem {
  game_key: string;
  league_id: string;
  match_time: string | null;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  home_record: string;
  away_record: string;
}

interface LeagueGroup {
  league_id: string;
  league_name: string;
  league_slug: string;
  games: ScoreItem[];
}

const FINAL_STATUSES = new Set([
  "final", "finished", "complete", "completed", "ft", "full time", "full-time",
]);

function isFinal(s: string | null | undefined) {
  if (!s) return true; // assume final when scores present and no status given
  return FINAL_STATUSES.has(s.toLowerCase().trim());
}

function shortTeam(name: string): string {
  // Pull a 3–4 letter abbreviation from the team name (uppercase initials,
  // capped at 4 chars). Falls back to first 4 letters if no spaces.
  const cleaned = name.replace(/[^A-Za-z\s]/g, "").trim();
  if (!cleaned) return name.slice(0, 4).toUpperCase();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 4).toUpperCase();
  const initials = parts.map((p) => p[0]).join("").toUpperCase();
  return initials.slice(0, 4);
}

function formatDate(s: string | null) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function buildRecords(games: GameRow[]): Record<string, string> {
  const tally: Record<string, { w: number; l: number }> = {};
  games.forEach((g) => {
    if (!g.home_team || !g.away_team) return;
    if (g.home_score === null || g.away_score === null) return;
    if (!isFinal(g.game_status)) return;
    if (!tally[g.home_team]) tally[g.home_team] = { w: 0, l: 0 };
    if (!tally[g.away_team]) tally[g.away_team] = { w: 0, l: 0 };
    if (g.home_score > g.away_score) {
      tally[g.home_team].w += 1;
      tally[g.away_team].l += 1;
    } else if (g.away_score > g.home_score) {
      tally[g.away_team].w += 1;
      tally[g.home_team].l += 1;
    }
  });
  const out: Record<string, string> = {};
  Object.entries(tally).forEach(([team, r]) => {
    out[team] = `${r.w}-${r.l}`;
  });
  return out;
}

function ScoreCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-56 rounded-lg bg-neutral-900 border border-neutral-800 p-3 animate-pulse">
      <div className="h-3 w-16 bg-neutral-800 rounded mb-3" />
      <div className="space-y-2">
        <div className="h-5 bg-neutral-800 rounded" />
        <div className="h-5 bg-neutral-800 rounded" />
      </div>
    </div>
  );
}

export default function LatestScoresSection() {
  const [, setLocation] = useLocation();
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: leagues } = await supabase
          .from("leagues")
          .select("league_id, name, slug, trending_position")
          .eq("is_public", true)
          .order("trending_position", { ascending: true, nullsFirst: false })
          .returns<LeagueRow[]>();

        if (!leagues || leagues.length === 0) {
          if (!cancelled) {
            setGroups([]);
            setLoading(false);
          }
          return;
        }

        const leagueMap: Record<string, LeagueRow> = {};
        leagues.forEach((l) => { leagueMap[l.league_id] = l; });
        const leagueIds = leagues.map((l) => l.league_id);

        const { data: games } = await supabase
          .from("v_game_results")
          .select("game_key, league_id, match_time, home_team, away_team, home_score, away_score, game_status")
          .in("league_id", leagueIds)
          .not("home_score", "is", null)
          .not("away_score", "is", null)
          .order("match_time", { ascending: false })
          .limit(300)
          .returns<GameRow[]>();

        if (cancelled) return;

        // Bucket by league preserving recency order
        const byLeague: Record<string, GameRow[]> = {};
        (games || []).forEach((g) => {
          if (!g.home_team || !g.away_team) return;
          if (g.home_score === null || g.away_score === null) return;
          if (!isFinal(g.game_status)) return;
          if (!byLeague[g.league_id]) byLeague[g.league_id] = [];
          byLeague[g.league_id].push(g);
        });

        // Build groups in league order, including only those with at least 1 game
        const result: LeagueGroup[] = [];
        leagues.forEach((l) => {
          const ls = byLeague[l.league_id];
          if (!ls || ls.length === 0) return;
          const records = buildRecords(ls);
          const items: ScoreItem[] = ls.slice(0, 4).map((g) => ({
            game_key: g.game_key,
            league_id: g.league_id,
            match_time: g.match_time,
            home_team: g.home_team as string,
            away_team: g.away_team as string,
            home_score: g.home_score as number,
            away_score: g.away_score as number,
            home_record: records[g.home_team as string] || "",
            away_record: records[g.away_team as string] || "",
          }));
          result.push({
            league_id: l.league_id,
            league_name: l.name,
            league_slug: l.slug,
            games: items,
          });
        });

        setGroups(result);
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  return (
    <section className="bg-[#0a0a0f] text-white border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 relative">
        {loading ? (
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3, 4].map((i) => <ScoreCardSkeleton key={i} />)}
          </div>
        ) : groups.length === 0 ? (
          <div className="text-xs text-neutral-400 py-2 text-center">
            No recent games yet.
          </div>
        ) : (
          <div className="relative">
            {/* Left button */}
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="Scroll scores left"
              className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-700 shadow"
            >
              <ChevronLeft className="h-4 w-4 text-white" />
            </button>

            <div
              ref={scrollRef}
              className="flex items-stretch gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 md:px-10"
              style={{ scrollbarWidth: "none" }}
            >
              {groups.map((grp) => (
                <div key={grp.league_id} className="flex flex-col gap-1.5 flex-shrink-0">
                  <div
                    className="text-[11px] font-bold tracking-wider text-white truncate max-w-[260px]"
                    title={grp.league_name}
                  >
                    {grp.league_name.toUpperCase()}
                  </div>
                  <div className="flex gap-2">
                    {grp.games.map((g) => {
                      const homeWon = g.home_score > g.away_score;
                      return (
                        <button
                          key={g.game_key}
                          onClick={() => setLocation(`/game/${g.game_key}`)}
                          className="snap-start text-left flex-shrink-0 w-[200px] rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 transition-colors duration-200 p-2.5"
                          data-testid={`score-card-${g.game_key}`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-neutral-300 font-medium">
                              {formatDate(g.match_time)}
                            </span>
                            <span className="text-[10px] text-neutral-400 font-medium uppercase">
                              Final
                            </span>
                          </div>

                          {/* Home row */}
                          <div className="flex items-center justify-between py-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="h-5 w-5 flex-shrink-0 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">
                                <TeamLogo teamName={g.home_team} leagueId={g.league_id} size="xs" />
                              </div>
                              <span className={`text-xs ${homeWon ? "font-bold text-white" : "text-neutral-300"}`}>
                                {shortTeam(g.home_team)}
                              </span>
                              {g.home_record && (
                                <span className="text-[10px] text-neutral-500">({g.home_record})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className={`text-sm tabular-nums ${homeWon ? "font-bold text-white" : "text-neutral-300"}`}>
                                {g.home_score}
                              </span>
                              {homeWon && <ChevronLeft className="h-3 w-3 text-white" />}
                            </div>
                          </div>

                          {/* Away row */}
                          <div className="flex items-center justify-between py-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="h-5 w-5 flex-shrink-0 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">
                                <TeamLogo teamName={g.away_team} leagueId={g.league_id} size="xs" />
                              </div>
                              <span className={`text-xs ${!homeWon ? "font-bold text-white" : "text-neutral-300"}`}>
                                {shortTeam(g.away_team)}
                              </span>
                              {g.away_record && (
                                <span className="text-[10px] text-neutral-500">({g.away_record})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className={`text-sm tabular-nums ${!homeWon ? "font-bold text-white" : "text-neutral-300"}`}>
                                {g.away_score}
                              </span>
                              {!homeWon && <ChevronLeft className="h-3 w-3 text-white" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Right button */}
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="Scroll scores right"
              className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-700 shadow"
            >
              <ChevronRight className="h-4 w-4 text-white" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
