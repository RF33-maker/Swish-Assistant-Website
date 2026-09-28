import { useQuery } from "@tanstack/react-query";

/**
 * Shared data layer for everything that shows scores: the /scores page, the
 * homepage block, and the live dot in the site nav. They all read the same
 * query key, so a visit that shows more than one of them makes one request.
 *
 * The rolling rules (24h results, "coming up" rolling forward to the next day
 * with games) live on the server in GET /api/scores — see server/routes.ts.
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

export interface ScoresPayload {
  generatedAt: string;
  leagues: Array<{ league_id: string; name: string; slug: string }>;
  live: ScoreGame[];
  upcoming: { date: string | null; isToday?: boolean; games: ScoreGame[] };
  results: ScoreGame[];
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
