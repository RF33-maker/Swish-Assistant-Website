import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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

interface ScheduleRow {
  game_key: string;
  league_id: string;
  matchtime: string | null;
  hometeam: string | null;
  awayteam: string | null;
  status: string | null;
}

type ResultItem = {
  kind: "result";
  game_key: string;
  league_id: string;
  league_slug: string;
  match_time: string | null;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  home_record: string;
  away_record: string;
};

type UpcomingItem = {
  kind: "upcoming";
  game_key: string;
  league_id: string;
  league_slug: string;
  match_time: string;
  home_team: string;
  away_team: string;
  label: string; // "TONIGHT" | "TOMORROW" | "UPCOMING"
};

type LiveItem = {
  kind: "live";
  game_key: string;
  league_id: string;
  league_slug: string;
  match_time: string | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
};

type CardItem = ResultItem | UpcomingItem | LiveItem;

interface LeagueGroup {
  league_id: string;
  league_name: string;
  league_slug: string;
  games: CardItem[];
}

const FINAL_STATUSES = new Set([
  "final", "finished", "complete", "completed", "ft", "full time", "full-time",
]);

const LIVE_STATUS_KEYWORDS = ["live", "in_progress", "in progress", "playing", "q1", "q2", "q3", "q4", "ot", "halftime", "half time"];

function isFinal(s: string | null | undefined) {
  if (!s) return true; // assume final when scores present and no status given
  return FINAL_STATUSES.has(s.toLowerCase().trim());
}

function isLiveStatus(s: string | null | undefined): boolean {
  if (!s) return false;
  const lower = s.toLowerCase().trim();
  if (FINAL_STATUSES.has(lower)) return false;
  return LIVE_STATUS_KEYWORDS.some((k) => lower.includes(k));
}

function shortTeam(name: string): string {
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

function formatTime(s: string | null) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function upcomingLabel(matchTime: string, now: Date): string {
  const t = new Date(matchTime);
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const today = startOfDay(now).getTime();
  const day = startOfDay(t).getTime();
  const dayDiff = Math.round((day - today) / (24 * 60 * 60 * 1000));
  if (dayDiff <= 0) return "TONIGHT";
  if (dayDiff === 1) return "TOMORROW";
  return "UPCOMING";
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

const LATEST_SCORES_LIMIT = 80;
const SLOTS_PER_LEAGUE = 4;
const UPCOMING_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export default function LatestScoresSection() {
  const [, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: groups = [], isLoading: loading } = useQuery<LeagueGroup[]>({
    queryKey: ["supabase", "home", "latest-scores", LATEST_SCORES_LIMIT],
    queryFn: async () => {
      const { data: leagues } = await supabase
        .from("leagues")
        .select("league_id, name, slug, trending_position")
        .eq("is_public", true)
        .order("trending_position", { ascending: true, nullsFirst: false })
        .returns<LeagueRow[]>();

      if (!leagues || leagues.length === 0) return [];

      const leagueIds = leagues.map((l) => l.league_id);
      const slugById: Record<string, string> = {};
      leagues.forEach((l) => { slugById[l.league_id] = l.slug; });

      const now = new Date();
      const windowEnd = new Date(now.getTime() + UPCOMING_WINDOW_MS);

      const [resultsRes, scheduleRes] = await Promise.all([
        supabase
          .from("v_game_results")
          .select("game_key, league_id, match_time, home_team, away_team, home_score, away_score, game_status")
          .in("league_id", leagueIds)
          .not("home_score", "is", null)
          .not("away_score", "is", null)
          .order("match_time", { ascending: false })
          .limit(LATEST_SCORES_LIMIT)
          .returns<GameRow[]>(),
        supabase
          .from("game_schedule")
          .select("game_key, league_id, matchtime, hometeam, awayteam, status")
          .in("league_id", leagueIds)
          .gte("matchtime", now.toISOString())
          .lte("matchtime", windowEnd.toISOString())
          .order("matchtime", { ascending: true })
          .limit(200)
          .returns<ScheduleRow[]>(),
      ]);

      const games = resultsRes.data;
      const schedule = scheduleRes.data;

      const liveByLeague: Record<string, LiveItem[]> = {};
      const liveKeys = new Set<string>();
      const finishedKeys = new Set<string>();
      const resultsByLeague: Record<string, GameRow[]> = {};

      (games || []).forEach((g) => {
        if (!g.home_team || !g.away_team) return;
        // Live: explicit live status, OR partial scores with a non-final status.
        if (g.game_status && !isFinal(g.game_status) && isLiveStatus(g.game_status)) {
          if (g.game_key) liveKeys.add(g.game_key);
          if (!liveByLeague[g.league_id]) liveByLeague[g.league_id] = [];
          liveByLeague[g.league_id].push({
            kind: "live",
            game_key: g.game_key,
            league_id: g.league_id,
            league_slug: slugById[g.league_id] || "",
            match_time: g.match_time,
            home_team: g.home_team as string,
            away_team: g.away_team as string,
            home_score: g.home_score,
            away_score: g.away_score,
          });
          return;
        }
        if (g.home_score === null || g.away_score === null) return;
        if (!isFinal(g.game_status)) return;
        if (g.game_key) finishedKeys.add(g.game_key);
        if (!resultsByLeague[g.league_id]) resultsByLeague[g.league_id] = [];
        resultsByLeague[g.league_id].push(g);
      });

      const upcomingByLeague: Record<string, UpcomingItem[]> = {};
      (schedule || []).forEach((s) => {
        if (!s.game_key || !s.hometeam || !s.awayteam || !s.matchtime) return;
        if (finishedKeys.has(s.game_key) || liveKeys.has(s.game_key)) return;
        const statusLower = (s.status || "").toLowerCase();
        if (FINAL_STATUSES.has(statusLower)) return;

        // Live game found in schedule (status indicates live)
        if (isLiveStatus(s.status)) {
          liveKeys.add(s.game_key);
          if (!liveByLeague[s.league_id]) liveByLeague[s.league_id] = [];
          liveByLeague[s.league_id].push({
            kind: "live",
            game_key: s.game_key,
            league_id: s.league_id,
            league_slug: slugById[s.league_id] || "",
            match_time: s.matchtime,
            home_team: s.hometeam,
            away_team: s.awayteam,
            home_score: null,
            away_score: null,
          });
          return;
        }

        if (!upcomingByLeague[s.league_id]) upcomingByLeague[s.league_id] = [];
        upcomingByLeague[s.league_id].push({
          kind: "upcoming",
          game_key: s.game_key,
          league_id: s.league_id,
          league_slug: slugById[s.league_id] || "",
          match_time: s.matchtime,
          home_team: s.hometeam,
          away_team: s.awayteam,
          label: upcomingLabel(s.matchtime, now),
        });
      });

      const groups: LeagueGroup[] = [];
      leagues.forEach((l) => {
        const live = liveByLeague[l.league_id] || [];
        const upcoming = upcomingByLeague[l.league_id] || [];
        const ls = resultsByLeague[l.league_id] || [];
        if (live.length === 0 && upcoming.length === 0 && ls.length === 0) return;

        const records = buildRecords(ls);
        const resultItems: ResultItem[] = ls.map((g) => ({
          kind: "result",
          game_key: g.game_key,
          league_id: g.league_id,
          league_slug: l.slug,
          match_time: g.match_time,
          home_team: g.home_team as string,
          away_team: g.away_team as string,
          home_score: g.home_score as number,
          away_score: g.away_score as number,
          home_record: records[g.home_team as string] || "",
          away_record: records[g.away_team as string] || "",
        }));

        const liveSlice = live.slice(0, SLOTS_PER_LEAGUE);
        let remaining = Math.max(0, SLOTS_PER_LEAGUE - liveSlice.length);
        const upcomingSlice = upcoming.slice(0, remaining);
        remaining = Math.max(0, remaining - upcomingSlice.length);
        const items: CardItem[] = [
          ...liveSlice,
          ...upcomingSlice,
          ...resultItems.slice(0, remaining),
        ];

        groups.push({
          league_id: l.league_id,
          league_name: l.name,
          league_slug: l.slug,
          games: items,
        });
      });

      // Smart league ordering: leagues with LIVE games first, then leagues
      // with UPCOMING (within 2 days), then by trending_position. Within
      // upcoming-tier, sort by soonest tip-off so the most imminent matchup
      // surfaces leftmost.
      const trendingPos: Record<string, number> = {};
      leagues.forEach((l, idx) => {
        trendingPos[l.league_id] = l.trending_position ?? idx + 10000;
      });
      const soonestUpcoming: Record<string, number> = {};
      Object.entries(upcomingByLeague).forEach(([lid, list]) => {
        if (list.length === 0) return;
        const min = list.reduce((acc, u) => Math.min(acc, new Date(u.match_time).getTime()), Infinity);
        soonestUpcoming[lid] = min;
      });

      groups.sort((a, b) => {
        const aLive = (liveByLeague[a.league_id] || []).length > 0;
        const bLive = (liveByLeague[b.league_id] || []).length > 0;
        if (aLive !== bLive) return aLive ? -1 : 1;

        const aUp = soonestUpcoming[a.league_id];
        const bUp = soonestUpcoming[b.league_id];
        if (aUp !== undefined && bUp !== undefined) return aUp - bUp;
        if (aUp !== undefined) return -1;
        if (bUp !== undefined) return 1;

        return (trendingPos[a.league_id] ?? 0) - (trendingPos[b.league_id] ?? 0);
      });

      return groups;
    },
  });

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  const handleCardClick = (g: CardItem) => {
    if (g.kind === "result" || g.kind === "live") {
      setLocation(`/game/${g.game_key}`);
    } else if (g.league_slug) {
      setLocation(`/league/${g.league_slug}`);
    }
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
            No recent or upcoming games yet.
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
                      if (g.kind === "live") {
                        const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
                        return (
                          <button
                            key={g.game_key}
                            onClick={() => handleCardClick(g)}
                            className="snap-start text-left flex-shrink-0 w-[200px] rounded-md bg-neutral-900 hover:bg-neutral-800 border border-red-500/60 hover:border-red-500/90 transition-colors duration-200 p-2.5"
                            data-testid={`live-card-${g.game_key}`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] text-neutral-300 font-medium">
                                {formatDate(g.match_time)}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                LIVE
                              </span>
                            </div>

                            <div className="flex items-center justify-between py-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="h-5 w-5 flex-shrink-0 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">
                                  <TeamLogo teamName={g.home_team} leagueId={g.league_id} size="xs" />
                                </div>
                                <span className={`text-xs ${homeWon ? "font-bold text-white" : "text-neutral-300"}`}>
                                  {shortTeam(g.home_team)}
                                </span>
                              </div>
                              <span className={`text-sm tabular-nums ${homeWon ? "font-bold text-white" : "text-neutral-300"}`}>
                                {g.home_score ?? "—"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between py-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="h-5 w-5 flex-shrink-0 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">
                                  <TeamLogo teamName={g.away_team} leagueId={g.league_id} size="xs" />
                                </div>
                                <span className={`text-xs ${!homeWon ? "font-bold text-white" : "text-neutral-300"}`}>
                                  {shortTeam(g.away_team)}
                                </span>
                              </div>
                              <span className={`text-sm tabular-nums ${!homeWon ? "font-bold text-white" : "text-neutral-300"}`}>
                                {g.away_score ?? "—"}
                              </span>
                            </div>
                          </button>
                        );
                      }
                      if (g.kind === "upcoming") {
                        return (
                          <button
                            key={g.game_key}
                            onClick={() => handleCardClick(g)}
                            className="snap-start text-left flex-shrink-0 w-[200px] rounded-md bg-neutral-900 hover:bg-neutral-800 border border-orange-500/40 hover:border-orange-500/70 transition-colors duration-200 p-2.5"
                            data-testid={`upcoming-card-${g.game_key}`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] text-neutral-300 font-medium">
                                {formatDate(g.match_time)} · {formatTime(g.match_time)}
                              </span>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                                {g.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 py-0.5 min-w-0">
                              <div className="h-5 w-5 flex-shrink-0 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">
                                <TeamLogo teamName={g.home_team} leagueId={g.league_id} size="xs" />
                              </div>
                              <span className="text-xs text-neutral-200 truncate">
                                {shortTeam(g.home_team)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 py-0.5 min-w-0">
                              <div className="h-5 w-5 flex-shrink-0 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">
                                <TeamLogo teamName={g.away_team} leagueId={g.league_id} size="xs" />
                              </div>
                              <span className="text-xs text-neutral-200 truncate">
                                {shortTeam(g.away_team)}
                              </span>
                            </div>
                          </button>
                        );
                      }

                      const homeWon = g.home_score > g.away_score;
                      return (
                        <button
                          key={g.game_key}
                          onClick={() => handleCardClick(g)}
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
