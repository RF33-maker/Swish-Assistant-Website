import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { parseGameSlug } from "@/lib/gameSlug";
import { TeamLogo } from "@/components/TeamLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ExternalLink } from "lucide-react";

interface GameEmbedProps {
  slug: string;
  href: string;
}

function formatGameDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Europe/London",
    });
  } catch {
    return dateStr;
  }
}

function StatusBadge({ status, matchtime }: { status: string | null; matchtime: string }) {
  const norm = status?.toLowerCase() || "";
  if (norm === "final" || norm === "finished") {
    return (
      <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        Final
      </span>
    );
  }
  if (norm === "live" || norm === "in_progress") {
    return (
      <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 animate-pulse">
        Live
      </span>
    );
  }
  const gameTime = new Date(matchtime).getTime();
  if (gameTime > Date.now()) {
    return (
      <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
        Upcoming
      </span>
    );
  }
  return null;
}

export default function GameEmbed({ slug, href }: GameEmbedProps) {
  const parsed = parseGameSlug(slug);

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ["game-embed-schedule", slug],
    queryFn: async () => {
      if (!parsed) return null;
      const dateStart = `${parsed.date}T00:00:00+00:00`;
      const dateEnd = `${parsed.date}T23:59:59+00:00`;

      const { data, error } = await supabase
        .from("game_schedule")
        .select("game_key, league_id, matchtime, hometeam, awayteam, status, competitionname")
        .gte("matchtime", dateStart)
        .lte("matchtime", dateEnd);

      if (error || !data || !data.length) return null;

      const slugify = (name: string) =>
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      const match = data.find(
        (g) => slugify(g.hometeam) === parsed.home && slugify(g.awayteam) === parsed.away,
      );
      return match || null;
    },
    enabled: !!parsed,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: scoreData } = useQuery({
    queryKey: ["game-embed-score", scheduleData?.game_key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_game_results")
        .select("home_score, away_score")
        .eq("game_key", scheduleData!.game_key)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!scheduleData?.game_key,
    staleTime: 60 * 1000,
    retry: 1,
  });

  if (!parsed) {
    return (
      <a
        href={href}
        className="block my-1 text-orange-600 underline hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-sm break-all"
      >
        {href}
      </a>
    );
  }

  if (scheduleLoading) {
    return (
      <div className="my-4 rounded-xl border border-orange-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        <div className="p-4 flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-16" />
          <div className="flex-1 space-y-2 text-right flex flex-col items-end">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
        </div>
      </div>
    );
  }

  if (!scheduleData) {
    return (
      <a
        href={href}
        className="block my-1 text-orange-600 underline hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-sm break-all"
      >
        {href}
      </a>
    );
  }

  const status = scheduleData.status?.toLowerCase();
  const isFinal = status === "final" || status === "finished";
  const isLive = status === "live" || status === "in_progress";
  const hasScore = (isFinal || isLive) && scoreData;

  const homeScore = hasScore ? scoreData.home_score : null;
  const awayScore = hasScore ? scoreData.away_score : null;

  const homeWon = hasScore && homeScore != null && awayScore != null && homeScore > awayScore;
  const awayWon = hasScore && homeScore != null && awayScore != null && awayScore > homeScore;

  const leagueId = scheduleData.league_id;

  return (
    <Link href={href}>
      <a
        className="block my-4 rounded-xl border border-orange-100 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden hover:border-orange-300 dark:hover:border-orange-700 hover:shadow-md transition-all duration-200 no-underline group"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar: competition + status */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1 border-b border-orange-50 dark:border-neutral-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            {scheduleData.competitionname || "Basketball"}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={scheduleData.status} matchtime={scheduleData.matchtime} />
            <ExternalLink className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 group-hover:text-orange-500 transition-colors" />
          </div>
        </div>

        {/* Main score row */}
        <div className="px-4 py-3 flex items-center gap-3">
          {/* Home team */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <TeamLogo teamName={scheduleData.hometeam} leagueId={leagueId} size="sm" />
            <span
              className={`font-semibold text-sm truncate ${
                homeWon
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {scheduleData.hometeam}
            </span>
          </div>

          {/* Score or date */}
          <div className="flex-shrink-0 text-center px-2">
            {hasScore && homeScore != null && awayScore != null ? (
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-xl font-bold tabular-nums leading-none ${
                    homeWon
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {homeScore}
                </span>
                <span className="text-slate-300 dark:text-neutral-600 text-sm font-medium">–</span>
                <span
                  className={`text-xl font-bold tabular-nums leading-none ${
                    awayWon
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {awayScore}
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                {formatGameDate(scheduleData.matchtime)}
              </div>
            )}
            {hasScore && (
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 text-center">
                {formatGameDate(scheduleData.matchtime)}
              </div>
            )}
          </div>

          {/* Away team */}
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <span
              className={`font-semibold text-sm truncate text-right ${
                awayWon
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {scheduleData.awayteam}
            </span>
            <TeamLogo teamName={scheduleData.awayteam} leagueId={leagueId} size="sm" />
          </div>
        </div>
      </a>
    </Link>
  );
}
