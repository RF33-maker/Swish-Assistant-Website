import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, MapPin, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "@/components/TeamLogo";
import { parseScheduleTime } from "@/lib/scheduleTime";

export type PreviewGame = {
  league_id: string;
  matchtime: string;
  hometeam: string;
  awayteam: string;
  competitionname?: string | null;
  venue?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
};

type ContextRow = {
  league_id: string;
  team_id: string;
  name?: string | null;
  numeric_id: string;
  tot_spoints: number | null;
};

type FormResult = { won: boolean; teamScore: number; opponentScore: number };

function countdown(target: string) {
  const seconds = Math.max(0, Math.floor((parseScheduleTime(target).getTime() - Date.now()) / 1000));
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor(seconds / 3600) % 24,
    minutes: Math.floor(seconds / 60) % 60,
    seconds: seconds % 60,
  };
}

function competitionStage(value?: string | null) {
  const label = (value || "")
    .toLowerCase()
    .replace(/\b(19|20)\d{2}(?:\s*[/–-]\s*\d{2,4})?\b/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
  if (label.includes("trophy")) return "trophy";
  if (label.includes("playoff")) return "playoff";
  if (label.includes("cup")) return "cup";
  if (label.includes("regular")) return "regular";
  if (label === "season" || !label) return "regular";
  return label;
}

export default function UpcomingGamePreview({ game, onRefresh, embedded = false }: { game: PreviewGame; onRefresh?: () => void; embedded?: boolean }) {
  const [left, setLeft] = useState(() => countdown(game.matchtime));
  const arrived = left.days + left.hours + left.minutes + left.seconds === 0;

  useEffect(() => {
    setLeft(countdown(game.matchtime));
    const id = window.setInterval(() => setLeft(countdown(game.matchtime)), 1000);
    return () => window.clearInterval(id);
  }, [game.matchtime]);

  const teamIds = useMemo(
    () => [game.home_team_id, game.away_team_id].filter(Boolean) as string[],
    [game.home_team_id, game.away_team_id],
  );

  const { data: context, isLoading: contextLoading } = useQuery({
    queryKey: ["upcoming-context", game.league_id, ...teamIds],
    queryFn: async () => {
      const { data: currentRows } = await supabase
        .from("team_stats")
        .select("league_id,team_id,name,numeric_id,tot_spoints")
        .eq("league_id", game.league_id);
      const currentHome = (currentRows || []).find((row: any) =>
        row.team_id === game.home_team_id || row.name === game.hometeam
      );
      const currentAway = (currentRows || []).find((row: any) =>
        row.team_id === game.away_team_id || row.name === game.awayteam
      );
      const currentHasTeamData = !!currentHome || !!currentAway;
      if (currentHasTeamData) {
        return {
          rows: (currentRows || []) as ContextRow[],
          previous: false,
          season: null,
          leagueId: game.league_id,
          homeId: currentHome?.team_id || game.home_team_id || null,
          awayId: currentAway?.team_id || game.away_team_id || null,
        };
      }

      const { data: competition } = await supabase
        .from("competitions")
        .select("league_id,competition_id,parent_league_id,season,created_at")
        .eq("league_id", game.league_id)
        .maybeSingle();
      if (!competition) return {
        rows: [] as ContextRow[], previous: false, season: null, leagueId: game.league_id,
        homeId: game.home_team_id || null, awayId: game.away_team_id || null,
      };

      let siblingQuery = supabase
        .from("competitions")
        .select("league_id,season,created_at")
        .neq("league_id", game.league_id)
        .lt("created_at", competition.created_at)
        .order("created_at", { ascending: false })
        .limit(12);
      if (competition.competition_id) {
        siblingQuery = siblingQuery.eq("competition_id", competition.competition_id);
      } else if (competition.parent_league_id) {
        siblingQuery = siblingQuery.or(
          `league_id.eq.${competition.parent_league_id},parent_league_id.eq.${competition.parent_league_id}`,
        );
      } else {
        siblingQuery = siblingQuery.eq("parent_league_id", competition.league_id);
      }

      const { data: siblings } = await siblingQuery;
      const siblingIds = (siblings || []).map((s: any) => s.league_id).filter(Boolean);
      if (!siblingIds.length) return {
        rows: [] as ContextRow[], previous: false, season: null, leagueId: game.league_id,
        homeId: game.home_team_id || null, awayId: game.away_team_id || null,
      };

      const { data: targetRows } = await supabase
        .from("team_stats")
        .select("league_id,team_id,name,numeric_id,tot_spoints")
        .in("league_id", siblingIds);
      const currentStage = competitionStage(competition.season);
      const sameStageSiblings = (siblings || []).filter(
        (sibling: any) => competitionStage(sibling.season) === currentStage,
      );
      const selected = sameStageSiblings.find((sibling: any) =>
        (targetRows || []).some((row: any) =>
          row.league_id === sibling.league_id
          && (teamIds.includes(row.team_id) || row.name === game.hometeam || row.name === game.awayteam)
        ),
      );
      if (!selected) return {
        rows: [] as ContextRow[], previous: false, season: null, leagueId: game.league_id,
        homeId: game.home_team_id || null, awayId: game.away_team_id || null,
      };

      const { data: selectedRows } = await supabase
        .from("team_stats")
        .select("league_id,team_id,name,numeric_id,tot_spoints")
        .eq("league_id", selected.league_id);
      const historicalHome = (selectedRows || []).find((row: any) =>
        row.team_id === game.home_team_id || row.name === game.hometeam
      );
      const historicalAway = (selectedRows || []).find((row: any) =>
        row.team_id === game.away_team_id || row.name === game.awayteam
      );
      return {
        rows: (selectedRows || []) as ContextRow[],
        previous: true,
        season: selected.season || null,
        leagueId: selected.league_id,
        homeId: historicalHome?.team_id || game.home_team_id || null,
        awayId: historicalAway?.team_id || game.away_team_id || null,
      };
    },
    enabled: !!game.league_id && !!game.hometeam && !!game.awayteam,
  });

  const { data: leaders = [] } = useQuery({
    queryKey: ["upcoming-leaders", context?.leagueId, context?.homeId, context?.awayId],
    queryFn: async () => {
      const contextTeamIds = [context?.homeId, context?.awayId].filter(Boolean) as string[];
      if (!context?.leagueId || !contextTeamIds.length) return [];
      const { data } = await supabase
        .from("player_stats")
        .select("team_id,full_name,firstname,familyname,spoints")
        .eq("league_id", context.leagueId)
        .in("team_id", contextTeamIds);
      const totals = new Map<string, { name: string; team: string; points: number; games: number }>();
      (data || []).forEach((row: any) => {
        const name = row.full_name || `${row.firstname || ""} ${row.familyname || ""}`.trim();
        if (!name) return;
        const key = `${row.team_id}:${name}`;
        const item = totals.get(key) || { name, team: row.team_id, points: 0, games: 0 };
        item.points += Number(row.spoints || 0);
        item.games += 1;
        totals.set(key, item);
      });
      return Array.from(totals.values())
        .sort((a, b) => b.points / b.games - a.points / a.games)
        .slice(0, 4);
    },
    enabled: !!context?.leagueId && (!!context?.homeId || !!context?.awayId),
  });

  const summaries = useMemo(() => {
    const summarize = (teamId?: string | null) => {
      if (!teamId) return { form: [] as FormResult[], wins: 0, losses: 0 };
      const allRows = context?.rows || [];
      const results = allRows
        .filter((row) => row.team_id === teamId && row.numeric_id)
        .map((row) => {
          const opponent = allRows.find((candidate) =>
            candidate.numeric_id === row.numeric_id && candidate.team_id !== teamId
          );
          if (!opponent) return null;
          const teamScore = Number(row.tot_spoints || 0);
          const opponentScore = Number(opponent.tot_spoints || 0);
          return { numericId: String(row.numeric_id), won: teamScore > opponentScore, teamScore, opponentScore };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.numericId.localeCompare(a.numericId)) as Array<FormResult & { numericId: string }>;
      return {
        form: results.slice(0, 5),
        wins: results.filter((result) => result.won).length,
        losses: results.filter((result) => !result.won).length,
      };
    };
    return { home: summarize(context?.homeId), away: summarize(context?.awayId) };
  }, [context?.rows, context?.homeId, context?.awayId]);

  const date = parseScheduleTime(game.matchtime);
  const fmtDate = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const fmtTime = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const unit = (value: number, label: string) => (
    <div className="min-w-[50px] rounded-lg bg-slate-950/70 px-2 py-2 text-center sm:min-w-[58px]">
      <strong className="block text-lg tabular-nums text-white sm:text-xl">{String(value).padStart(2, "0")}</strong>
      <span className="text-[9px] uppercase tracking-[.18em] text-slate-400">{label}</span>
    </div>
  );

  const contextLabel = context?.previous
    ? `Previous season${context.season ? ` · ${context.season}` : ""}`
    : "This season";

  return (
    <main className={`${embedded ? "bg-transparent px-1 py-2" : "min-h-[100dvh] bg-[#f7f3eb] px-4 py-8 dark:bg-[#10141c] sm:px-6"} text-slate-900 dark:text-white`}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-orange-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
          Game preview
        </div>
        <section className="overflow-hidden rounded-[2rem] border border-orange-200/70 bg-[#172536] text-white shadow-2xl shadow-orange-950/10">
          <div className="relative p-5 sm:p-10">
            <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border-[28px] border-orange-500/15" />
            <div className="relative flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-orange-400" />{fmtDate}</span>
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-orange-400" />{fmtTime}</span>
            </div>
            <div className="relative mt-8 grid grid-cols-2 items-start gap-5 sm:mt-10 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-8">
              <Team name={game.hometeam} league={game.league_id} summary={summaries.home} />
              <div className="col-span-2 row-start-2 text-center sm:col-span-1 sm:row-start-auto">
                <div className="text-xs font-bold tracking-[.3em] text-orange-300">{arrived ? "TIP-OFF TIME" : "TIP-OFF IN"}</div>
                <div className="mt-3 flex justify-center gap-1.5">{unit(left.days, "days")}{unit(left.hours, "hrs")}{unit(left.minutes, "min")}{unit(left.seconds, "sec")}</div>
              </div>
              <Team name={game.awayteam} league={game.league_id} summary={summaries.away} />
            </div>
            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-5 text-sm text-slate-300">
              {game.venue
                ? <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-orange-400" />{game.venue}</span>
                : <span>Venue details will be added when available</span>}
            </div>
          </div>
        </section>

        {arrived && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-200 sm:flex-row sm:items-center sm:justify-between">
            <span>Tip-off time has arrived. Live coverage will appear when the official game feed starts.</span>
            <button onClick={onRefresh} className="inline-flex items-center gap-2 font-semibold"><RefreshCw className="h-4 w-4" />Check for live coverage</button>
          </div>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Matchup context</h2>
            {!contextLoading && context?.rows.length ? <span className="text-xs font-medium text-orange-700 dark:text-orange-300">{contextLabel}</span> : null}
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {contextLoading
              ? "Loading team context…"
              : summaries.home.form.length || summaries.away.form.length
                ? `Recent form and records from ${context?.previous ? "the corresponding previous competition season" : "the current competition season"}.`
                : "No previous results are available for these teams yet."}
          </p>
          {leaders.length > 0 && (
            <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Top performers · {contextLabel}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {leaders.map((player) => (
                  <div key={`${player.team}-${player.name}`} className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
                    <div className="truncate text-sm font-semibold">{player.name}</div>
                    <div className="mt-1 text-xs text-orange-600">{(player.points / player.games).toFixed(1)} PPG</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Team({
  name,
  league,
  summary,
}: {
  name: string;
  league: string;
  summary: { form: FormResult[]; wins: number; losses: number };
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 p-2 sm:h-24 sm:w-24">
        <TeamLogo teamName={name} leagueId={league} size="lg" />
      </div>
      <h1 className="text-base font-bold sm:text-xl">{name}</h1>
      {summary.wins + summary.losses > 0 && <div className="mt-1 text-xs text-slate-400">{summary.wins}-{summary.losses}</div>}
      <div className="mt-2 flex justify-center gap-1">
        {summary.form.length
          ? summary.form.map((result, index) => (
              <span
                key={`${result.teamScore}-${result.opponentScore}-${index}`}
                title={`${result.won ? "Won" : "Lost"} ${result.teamScore}-${result.opponentScore}`}
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white ${result.won ? "bg-emerald-500" : "bg-rose-500"}`}
              >
                {result.won ? "W" : "L"}
              </span>
            ))
          : <span className="text-xs text-slate-400">No recent form</span>}
      </div>
    </div>
  );
}