import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useMyClaim } from "@/lib/playerClaims";
import { useScores, type ScoreGame } from "@/lib/scores";
import { isSameTeam } from "@shared/teamIdentity";

/**
 * The app's Home headline: "Good morning/afternoon/evening, <name>", or
 * "It's gameday" when the player who claimed this account plays today.
 */

export type DayPart = "morning" | "afternoon" | "evening";

export function dayPart(now = new Date()): DayPart {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(now));
  return h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : "evening";
}

const ukDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);

/** First name: from the approved player claim, else the profile's name. */
function useFirstName() {
  const { user } = useAuth();
  const { data: claim } = useMyClaim(user?.id);
  const { data: profileName } = useQuery({
    queryKey: ["profile-name", user?.id],
    enabled: !!user && claim?.status !== "approved",
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("name").eq("id", user!.id).maybeSingle();
      return (data?.name as string | null) ?? null;
    },
  });
  const full = claim?.status === "approved" ? claim.player_name : profileName;
  return full?.trim().split(/\s+/)[0] || null;
}

export interface Greeting {
  name: string | null;
  part: DayPart;
  /** The claimed player's game today (not yet finished), if any. */
  gameday: ScoreGame | null;
  /** The claimed player's team, as the schedule names it. */
  team: string | null;
}

export function useGreeting(): Greeting {
  const { user } = useAuth();
  const { data: claim } = useMyClaim(user?.id);
  const { data: scores } = useScores();
  const name = useFirstName();
  const team = claim?.status === "approved" ? claim.team_name : null;

  let gameday: ScoreGame | null = null;
  if (team && scores) {
    const today = ukDate(new Date());
    // Match times are UK wall-clock stored as UTC, so the date part is the UK date.
    const plays = (g: ScoreGame) => g.match_time?.slice(0, 10) === today && (isSameTeam(g.home_team, team) || isSameTeam(g.away_team, team));
    gameday = scores.live.find(plays) ?? scores.upcoming.games.find(plays) ?? null;
  }
  return { name, part: dayPart(), gameday, team };
}
