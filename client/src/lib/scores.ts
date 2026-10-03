import { useQuery } from "@tanstack/react-query";

/**
 * Shared data layer for everything that shows scores: the /scores page, the
 * homepage block, and the live dot in the site nav. They all read the same
 * query key, so a visit that shows more than one of them makes one request.
 *
 * The rolling rules (24h results, "coming up" covering today and the next six
 * days) live on the server in GET /api/scores — see server/routes.ts.
 */

export interface ScoreGame {
  game_key: string;
  league_id: string;
  league_name: string;
  league_slug: string;
  match_time: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
}

export interface ScoreDay {
  date: string; // YYYY-MM-DD
  isToday: boolean;
  games: ScoreGame[];
}

export interface ScoresPayload {
  generatedAt: string;
  leagues: Array<{ league_id: string; name: string; slug: string }>;
  live: ScoreGame[];
  /** `games` is every upcoming game in tip-off order; `days` the same, by day. */
  upcoming: { date: string | null; isToday?: boolean; games: ScoreGame[]; days: ScoreDay[] };
  results: ScoreGame[];
}

/**
 * Up to `max` of the upcoming games, earliest days first, for a panel too
 * small to show them all. Within a day it takes one game per league in turn
 * (leagues in order of their first tip-off), so a busy league can't crowd the
 * others out. Each day's picks come back in tip-off order; days left with no
 * picks keep their full game list so callers can still mention them.
 */
export function pickAcrossLeagues(days: ScoreDay[], max: number): Array<ScoreDay & { shown: ScoreGame[] }> {
  let room = max;
  return days.map((day) => {
    const queues = new Map<string, ScoreGame[]>();
    for (const g of day.games) {
      if (!queues.has(g.league_id)) queues.set(g.league_id, []);
      queues.get(g.league_id)!.push(g);
    }
    const leagueQueues = Array.from(queues.values());
    const picked = new Set<ScoreGame>();
    while (room > 0 && picked.size < day.games.length) {
      for (const queue of leagueQueues) {
        const next = queue.shift();
        if (!next) continue;
        picked.add(next);
        if (--room === 0) break;
      }
    }
    return { ...day, shown: day.games.filter((g) => picked.has(g)) };
  });
}

export function useScores() {
  return useQuery<ScoresPayload>({
    queryKey: ["scores"],
    queryFn: async () => {
      const res = await fetch("/api/scores");
      if (!res.ok) throw new Error("Failed to load scores");
      return res.json();
    },
    staleTime: 15 * 1000,
    // Live scores move; poll while open, same cadence as the ticker.
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Match times are stored as UK wall-clock time labelled +00, so they're read
 * back in UTC — the same convention as every other time on the site. Using
 * Europe/London here would show every tip-off an hour late during BST.
 */
export function formatTipOff(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "Today", "Tomorrow", or "Friday 2 October" for a YYYY-MM-DD date. */
export function dayLabel(dateKey: string | null, isToday?: boolean): string {
  if (!dateKey) return "";
  if (isToday) return "Today";
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const tomorrow = new Date(`${todayKey}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (tomorrow.toISOString().slice(0, 10) === dateKey) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${dateKey}T12:00:00Z`));
}

/** The feed's live status is things like "Q3", "live", "halftime". */
export function liveLabel(status: string | null): string {
  const s = (status || "").trim();
  if (/^q[1-4]/i.test(s)) return s.toUpperCase().slice(0, 2);
  if (/^ot/i.test(s)) return "OT";
  if (/half/i.test(s)) return "Half time";
  return "Live";
}
