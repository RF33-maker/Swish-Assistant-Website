import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, MapPin, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "@/components/TeamLogo";
import { parseScheduleTime } from "@/lib/scheduleTime";
import { aggregateTeamStats } from "@/lib/teamStatsAggregate";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { adjustOpacity } from "@/lib/colorExtractor";

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
  game_key?: string | null;
  tot_spoints: number | null;
  [key: string]: unknown;
};

type FormResult = { won: boolean; teamScore: number; opponentScore: number };

const TEAM_STATS_SELECT = [
  "league_id", "team_id", "name", "numeric_id", "game_key", "tot_spoints",
  "tot_sfieldgoalsmade", "tot_sfieldgoalsattempted",
  "tot_sthreepointersmade", "tot_sthreepointersattempted",
  "tot_stwopointersmade", "tot_stwopointersattempted",
  "tot_sfreethrowsmade", "tot_sfreethrowsattempted",
  "tot_sreboundstotal", "tot_sreboundsoffensive", "tot_sreboundsdefensive",
  "tot_sassists", "tot_ssteals", "tot_sblocks", "tot_sturnovers",
  "tot_sfoulspersonal", "tot_splusminuspoints",
  "tot_spointsinthepaint", "tot_spointsfastbreak", "tot_spointssecondchance",
  "efg_percent", "ts_percent", "three_point_rate",
  "ast_percent", "ast_to_ratio", "oreb_percent", "dreb_percent", "reb_percent", "tov_percent",
  "pace", "off_rating", "def_rating", "net_rating",
  "pts_percent_2pt", "pts_percent_3pt", "pts_percent_ft", "pts_percent_midrange",
  "pts_percent_pitp", "pts_percent_fastbreak", "pts_percent_second_chance", "pts_percent_off_turnovers",
].join(",");

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

function computeStreak(form: FormResult[]): { count: number; type: "W" | "L" } | null {
  if (!form.length) return null;
  const first = form[0].won;
  let count = 0;
  for (const result of form) {
    if (result.won === first) count++;
    else break;
  }
  if (count < 2) return null;
  return { count, type: first ? "W" : "L" };
}

export default function UpcomingGamePreview({ game, onRefresh, embedded = false, leagueSlug, onSelectPlayer }: { game: PreviewGame; onRefresh?: () => void; embedded?: boolean; leagueSlug?: string; onSelectPlayer?: (playerSlug: string) => void }) {
  const teamHref = (teamName: string) => leagueSlug
    ? `/competition/${leagueSlug}/team/${encodeURIComponent(teamName)}`
    : `/team/${encodeURIComponent(teamName)}`;
  const playerHref = (slug: string) => leagueSlug
    ? `/competition/${leagueSlug}/player/${encodeURIComponent(slug)}`
    : `/player/${encodeURIComponent(slug)}`;

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

  const homeBranding = useTeamBranding({ teamName: game.hometeam, leagueId: game.league_id });
  const awayBranding = useTeamBranding({ teamName: game.awayteam, leagueId: game.league_id });
  const homeRgb = homeBranding.colors?.primaryRgb;
  const awayRgb = awayBranding.colors?.primaryRgb;
  const heroBackgroundStyle = homeRgb && awayRgb
    ? {
        backgroundImage: `linear-gradient(90deg, ${adjustOpacity(homeRgb, 0.5)} 0%, ${adjustOpacity(homeRgb, 0.16)} 38%, ${adjustOpacity(awayRgb, 0.16)} 62%, ${adjustOpacity(awayRgb, 0.5)} 100%)`,
      }
    : undefined;

  const { data: context, isLoading: contextLoading } = useQuery({
    queryKey: ["upcoming-context", game.league_id, ...teamIds],
    queryFn: async () => {
      const { data: currentRows } = await supabase
        .from("team_stats")
        .select(TEAM_STATS_SELECT)
        .eq("league_id", game.league_id)
        .returns<any[]>();
      const currentHome = (currentRows || []).find((row: any) =>
        row.team_id === game.home_team_id || row.name === game.hometeam
      );
      const currentAway = (currentRows || []).find((row: any) =>
        row.team_id === game.away_team_id || row.name === game.awayteam
      );
      const currentHasTeamData = !!currentHome || !!currentAway;
      if (currentHasTeamData) {
        return {
          rows: (currentRows || []) as unknown as ContextRow[],
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
        rows: [] as unknown as ContextRow[], previous: false, season: null, leagueId: game.league_id,
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
        rows: [] as unknown as ContextRow[], previous: false, season: null, leagueId: game.league_id,
        homeId: game.home_team_id || null, awayId: game.away_team_id || null,
      };

      const { data: targetRows } = await supabase
        .from("team_stats")
        .select(TEAM_STATS_SELECT)
        .in("league_id", siblingIds)
        .returns<any[]>();
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
        rows: [] as unknown as ContextRow[], previous: false, season: null, leagueId: game.league_id,
        homeId: game.home_team_id || null, awayId: game.away_team_id || null,
      };

      const { data: selectedRows } = await supabase
        .from("team_stats")
        .select(TEAM_STATS_SELECT)
        .eq("league_id", selected.league_id)
        .returns<any[]>();
      const historicalHome = (selectedRows || []).find((row: any) =>
        row.team_id === game.home_team_id || row.name === game.hometeam
      );
      const historicalAway = (selectedRows || []).find((row: any) =>
        row.team_id === game.away_team_id || row.name === game.awayteam
      );
      return {
        rows: (selectedRows || []) as unknown as ContextRow[],
        previous: true,
        season: selected.season || null,
        leagueId: selected.league_id,
        homeId: historicalHome?.team_id || game.home_team_id || null,
        awayId: historicalAway?.team_id || game.away_team_id || null,
      };
    },
    enabled: !!game.league_id && !!game.hometeam && !!game.awayteam,
  });

  const { data: leaders = { home: [], away: [] } } = useQuery({
    queryKey: ["upcoming-leaders", context?.leagueId, context?.homeId, context?.awayId],
    queryFn: async () => {
      const contextTeamIds = [context?.homeId, context?.awayId].filter(Boolean) as string[];
      if (!context?.leagueId || !contextTeamIds.length) return { home: [], away: [] };
      const { data } = await supabase
        .from("player_stats")
        .select("team_id,player_id,full_name,firstname,familyname,spoints")
        .eq("league_id", context.leagueId)
        .in("team_id", contextTeamIds);
      const totals = new Map<string, { name: string; team: string; points: number; games: number; playerId: string | null }>();
      (data || []).forEach((row: any) => {
        const name = row.full_name || `${row.firstname || ""} ${row.familyname || ""}`.trim();
        if (!name) return;
        const key = `${row.team_id}:${name}`;
        const item = totals.get(key) || { name, team: row.team_id, points: 0, games: 0, playerId: row.player_id || null };
        item.points += Number(row.spoints || 0);
        item.games += 1;
        totals.set(key, item);
      });
      const sorted = Array.from(totals.values()).sort((a, b) => b.points / b.games - a.points / a.games);
      const home = sorted.filter((p) => p.team === context?.homeId).slice(0, 3);
      const away = sorted.filter((p) => p.team === context?.awayId).slice(0, 3);

      const playerIds = [...home, ...away].map((p) => p.playerId).filter(Boolean) as string[];
      const slugById = new Map<string, string>();
      if (playerIds.length) {
        const { data: playerRows } = await supabase
          .from("players")
          .select("id,slug")
          .in("id", playerIds);
        (playerRows || []).forEach((row: any) => {
          if (row.slug) slugById.set(row.id, row.slug);
        });
      }
      // Fall back to the player's raw id when public.players has no slug yet —
      // PlayerProfileContent resolves a UUID directly, so this stays reliable
      // for newly-parsed players instead of guessing a name-derived slug.
      const withSlug = (p: typeof home[number]) => ({
        ...p,
        slug: (p.playerId ? slugById.get(p.playerId) : null) || p.playerId,
      });
      return { home: home.map(withSlug), away: away.map(withSlug) };
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

  const homeStreak = useMemo(() => computeStreak(summaries.home.form), [summaries.home.form]);
  const awayStreak = useMemo(() => computeStreak(summaries.away.form), [summaries.away.form]);

  const seasonStats = useMemo(() => {
    const rows = context?.rows || [];
    const homeRows = context?.homeId ? rows.filter((row) => row.team_id === context.homeId) : [];
    const awayRows = context?.awayId ? rows.filter((row) => row.team_id === context.awayId) : [];
    return {
      home: aggregateTeamStats(homeRows, game.hometeam),
      away: aggregateTeamStats(awayRows, game.awayteam),
    };
  }, [context?.rows, context?.homeId, context?.awayId, game.hometeam, game.awayteam]);

  const headToHead = useMemo(() => {
    const rows = context?.rows || [];
    if (!context?.homeId || !context?.awayId) return { meetings: [] as any[], homeWins: 0, awayWins: 0 };
    const homeRows = rows.filter((row) => row.team_id === context.homeId && row.game_key);
    const awayByGame = new Map(
      rows.filter((row) => row.team_id === context.awayId && row.game_key).map((row) => [row.game_key, row]),
    );
    const meetings = homeRows
      .map((homeRow) => {
        const awayRow = awayByGame.get(homeRow.game_key as string);
        if (!awayRow) return null;
        const homeScore = Number(homeRow.tot_spoints || 0);
        const awayScore = Number(awayRow.tot_spoints || 0);
        return {
          gameKey: homeRow.game_key as string,
          numericId: String(homeRow.numeric_id || ""),
          homeScore,
          awayScore,
          homeWon: homeScore > awayScore,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.numericId.localeCompare(a.numericId)) as Array<{
        gameKey: string; numericId: string; homeScore: number; awayScore: number; homeWon: boolean;
      }>;
    return {
      meetings,
      homeWins: meetings.filter((m) => m.homeWon).length,
      awayWins: meetings.filter((m) => !m.homeWon).length,
    };
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

  const hasAdvancedStats = (parseFloat(seasonStats.home?.pace || "0") > 0) || (parseFloat(seasonStats.away?.pace || "0") > 0);
  const snapshotRows = seasonStats.home && seasonStats.away ? [
    { label: "PPG", a: parseFloat(seasonStats.home.ppg), b: parseFloat(seasonStats.away.ppg), decimals: 1 },
    { label: "RPG", a: parseFloat(seasonStats.home.rpg), b: parseFloat(seasonStats.away.rpg), decimals: 1 },
    { label: "APG", a: parseFloat(seasonStats.home.apg), b: parseFloat(seasonStats.away.apg), decimals: 1 },
    { label: "FG%", a: parseFloat(seasonStats.home.fgPercentage), b: parseFloat(seasonStats.away.fgPercentage), decimals: 1, suffix: "%" },
    { label: "3P%", a: parseFloat(seasonStats.home.threePercentage), b: parseFloat(seasonStats.away.threePercentage), decimals: 1, suffix: "%" },
    ...(hasAdvancedStats ? [
      { label: "PACE", a: parseFloat(seasonStats.home.pace), b: parseFloat(seasonStats.away.pace), decimals: 1 },
      { label: "OFF RTG", a: parseFloat(seasonStats.home.offRating), b: parseFloat(seasonStats.away.offRating), decimals: 1 },
      { label: "DEF RTG", a: parseFloat(seasonStats.home.defRating), b: parseFloat(seasonStats.away.defRating), decimals: 1, lowerIsBetter: true },
    ] : []),
  ] : [];

  return (
    <main className={`${embedded ? "bg-transparent px-1 py-2" : "min-h-[100dvh] bg-[#f7f3eb] px-4 py-8 dark:bg-[#10141c] sm:px-6"} text-slate-900 dark:text-white`}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-orange-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
          Game preview
        </div>
        <section className="relative overflow-hidden rounded-[2rem] border border-orange-200/70 bg-[#172536] text-white shadow-2xl shadow-orange-950/10">
          {heroBackgroundStyle && <div className="absolute inset-0" style={heroBackgroundStyle} />}
          <div className="relative p-5 sm:p-10">
            <div className="relative flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-slate-300" />{fmtDate}</span>
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-300" />{fmtTime}</span>
            </div>
            <div className="relative mt-8 grid grid-cols-2 items-start gap-5 sm:mt-10 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-8">
              <Team name={game.hometeam} league={game.league_id} summary={summaries.home} streak={homeStreak} href={teamHref(game.hometeam)} />
              <div className="col-span-2 row-start-2 text-center sm:col-span-1 sm:row-start-auto">
                <div className="text-xs font-bold tracking-[.3em] text-orange-300">{arrived ? "TIP-OFF TIME" : "TIP-OFF IN"}</div>
                <div className="mt-3 flex justify-center gap-1.5">{unit(left.days, "days")}{unit(left.hours, "hrs")}{unit(left.minutes, "min")}{unit(left.seconds, "sec")}</div>
              </div>
              <Team name={game.awayteam} league={game.league_id} summary={summaries.away} streak={awayStreak} href={teamHref(game.awayteam)} />
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

          {(leaders.home.length > 0 || leaders.away.length > 0) && (
            <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Team leaders · {contextLabel}</h3>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <LeaderColumn teamName={game.hometeam} teamHref={teamHref(game.hometeam)} players={leaders.home} playerHref={playerHref} onSelectPlayer={onSelectPlayer} />
                <LeaderColumn teamName={game.awayteam} teamHref={teamHref(game.awayteam)} players={leaders.away} playerHref={playerHref} onSelectPlayer={onSelectPlayer} />
              </div>
            </div>
          )}
        </section>

        {snapshotRows.length > 0 && (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Season snapshot</h2>
              <span className="text-xs font-medium text-orange-700 dark:text-orange-300">{contextLabel}</span>
            </div>
            <div className="mt-4 space-y-3">
              {snapshotRows.map((row) => {
                const total = row.a + row.b;
                const aPct = total > 0 ? (row.a / total) * 100 : 50;
                const aBetter = row.lowerIsBetter ? row.a < row.b : row.a > row.b;
                const bBetter = row.lowerIsBetter ? row.b < row.a : row.b > row.a;
                return (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className={`font-semibold ${aBetter ? "" : "text-slate-500 dark:text-slate-400"}`} style={aBetter ? { color: homeBranding.primaryColor } : undefined}>
                        {row.a.toFixed(row.decimals)}{row.suffix || ""}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{row.label}</span>
                      <span className={`font-semibold ${bBetter ? "" : "text-slate-500 dark:text-slate-400"}`} style={bBetter ? { color: awayBranding.primaryColor } : undefined}>
                        {row.b.toFixed(row.decimals)}{row.suffix || ""}
                      </span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-neutral-700">
                      <div className="transition-all duration-500" style={{ width: `${aPct}%`, backgroundColor: homeBranding.primaryColor }} />
                      <div className="transition-all duration-500" style={{ width: `${100 - aPct}%`, backgroundColor: awayBranding.primaryColor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {!contextLoading && (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
            <h2 className="font-semibold">Head-to-head</h2>
            {headToHead.meetings.length > 0 ? (
              <div className="mt-3">
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-white">{game.hometeam}</span> lead the series{" "}
                  <span className="font-semibold text-orange-600 dark:text-orange-400">{headToHead.homeWins}-{headToHead.awayWins}</span>{" "}
                  <span className="font-semibold text-slate-800 dark:text-white">{game.awayteam}</span> {contextLabel.toLowerCase()}.
                </div>
                <div className="mt-3 space-y-1.5 text-sm">
                  {headToHead.meetings.slice(0, 5).map((meeting) => (
                    <div key={meeting.gameKey} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
                      <span className="text-slate-500 dark:text-slate-400">Meeting</span>
                      <span className="font-semibold text-slate-800 dark:text-white">
                        {game.hometeam} {meeting.homeScore} – {meeting.awayScore} {game.awayteam}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No previous meetings between these two teams yet.</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function LeaderColumn({
  teamName,
  teamHref,
  players,
  playerHref,
  onSelectPlayer,
}: {
  teamName: string;
  teamHref: string;
  players: Array<{ name: string; points: number; games: number; slug?: string | null }>;
  playerHref: (slug: string) => string;
  onSelectPlayer?: (playerSlug: string) => void;
}) {
  return (
    <div>
      <Link href={teamHref} className="block truncate text-xs font-semibold text-slate-500 hover:underline dark:text-slate-400">
        {teamName}
      </Link>
      <div className="mt-2 space-y-1.5">
        {players.length ? players.map((player) => (
          <div key={player.name} className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
            {player.slug ? (
              onSelectPlayer ? (
                <button
                  type="button"
                  onClick={() => onSelectPlayer(player.slug as string)}
                  className="truncate text-sm font-semibold hover:underline text-left"
                >
                  {player.name}
                </button>
              ) : (
                <Link href={playerHref(player.slug)} className="truncate text-sm font-semibold hover:underline">
                  {player.name}
                </Link>
              )
            ) : (
              <div className="truncate text-sm font-semibold">{player.name}</div>
            )}
            <div className="mt-0.5 text-xs text-orange-600">{(player.points / player.games).toFixed(1)} PPG</div>
          </div>
        )) : <div className="text-xs italic text-slate-400">No data yet</div>}
      </div>
    </div>
  );
}

function Team({
  name,
  league,
  summary,
  streak,
  href,
}: {
  name: string;
  league: string;
  summary: { form: FormResult[]; wins: number; losses: number };
  streak: { count: number; type: "W" | "L" } | null;
  href: string;
}) {
  return (
    <div className="text-center">
      <Link href={href} className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 p-2 transition-opacity hover:opacity-80 sm:h-24 sm:w-24">
        <TeamLogo teamName={name} leagueId={league} size="lg" />
      </Link>
      <Link href={href}>
        <h1 className="text-base font-bold hover:underline sm:text-xl">{name}</h1>
      </Link>
      {summary.wins + summary.losses > 0 && (
        <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <span>{summary.wins}-{summary.losses}</span>
          {streak && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${streak.type === "W" ? "bg-emerald-500" : "bg-rose-500"}`}>
              {streak.type}{streak.count}
            </span>
          )}
        </div>
      )}
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
