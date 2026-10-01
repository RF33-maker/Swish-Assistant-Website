import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, MapPin, RefreshCw } from "lucide-react";
import GameScoreHero, { StatCompareRow, useMatchupColors } from "@/components/game/GameScoreHero";
import GameStorylines, { StorylinePlayerLink } from "@/components/game/GameStorylines";
import TicketsCard from "@/components/game/TicketsCard";
import { buildGameStorylines } from "@/lib/gameStorylines";
import { fetchAndMergePlayerRankings } from "@/lib/playerRankings";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "@/components/TeamLogo";
import { parseScheduleTime } from "@/lib/scheduleTime";
import { aggregateTeamStats } from "@/lib/teamStatsAggregate";
import { playerPath, teamPath } from "@shared/seo";
import EntityLink from "@/components/EntityLink";

export type PreviewGame = {
  league_id: string;
  matchtime: string;
  hometeam: string;
  awayteam: string;
  competitionname?: string | null;
  venue?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  /** Where to buy tickets. Not stored anywhere yet, so the tickets card shows
   *  its "coming soon" placeholder until a source is added. */
  ticket_url?: string | null;
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
  // The team's permanent page, opened on this competition.
  const teamHref = (teamName: string) => teamPath(teamName, leagueSlug) || `/team/${encodeURIComponent(teamName)}`;
  // The canonical player page (inside the league page a click still opens it inline).
  const playerHref = (slug: string) => playerPath({ slug }) || `/player/${encodeURIComponent(slug)}`;

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

  const colors = useMatchupColors(game.hometeam, game.awayteam, game.league_id);

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

  // League-wide player ranks for the storylines, merged the same way as the
  // Coaches Hub and League Leaders so "leads the league" agrees with them.
  const { data: rankings, isLoading: rankingsLoading } = useQuery({
    queryKey: ["player-rankings", context?.leagueId],
    queryFn: () => fetchAndMergePlayerRankings(context!.leagueId),
    enabled: !!context?.leagueId,
    staleTime: 5 * 60_000,
  });

  const storylines = useMemo(() => {
    if (!context) return [];
    return buildGameStorylines({
      homeTeam: game.hometeam,
      awayTeam: game.awayteam,
      homeId: context.homeId,
      awayId: context.awayId,
      teamRows: context.rows,
      players: rankings || [],
      seasonLabel: context.previous ? "last season" : "this season",
    });
  }, [context, rankings, game.hometeam, game.awayteam]);

  const storyPlayerIds = useMemo(
    () => storylines.flatMap((s) => s.player?.playerIds ?? []),
    [storylines],
  );
  const { data: storySlugs } = useQuery({
    queryKey: ["storyline-player-slugs", ...storyPlayerIds],
    queryFn: async () => {
      const { data } = await supabase.from("players").select("id,slug").in("id", storyPlayerIds);
      return new Map((data || []).filter((r: any) => r.slug).map((r: any) => [r.id as string, r.slug as string]));
    },
    enabled: storyPlayerIds.length > 0,
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
    <div className="min-w-[46px] rounded-lg bg-black/30 px-1.5 py-1.5 text-center ring-1 ring-white/15 backdrop-blur-sm sm:min-w-[60px] sm:py-2">
      <strong className="ch-display block text-2xl font-bold leading-none tabular-nums text-white sm:text-[2rem]">{String(value).padStart(2, "0")}</strong>
      <span className="mt-1 block text-[8.5px] font-semibold uppercase tracking-[.16em] text-white/70 sm:text-[9.5px]">{label}</span>
    </div>
  );

  const contextLabel = context?.previous
    ? `Previous season${context.season ? ` · ${context.season}` : ""}`
    : "This season";

  // Both sides need the advanced numbers; one team's 0.0 pace would read as a real (and "better") rating.
  const hasAdvancedStats = (parseFloat(seasonStats.home?.pace || "0") > 0) && (parseFloat(seasonStats.away?.pace || "0") > 0);
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
    <main className={`${embedded ? "px-0 py-0" : "sa-pro min-h-[100dvh] px-4 py-6 sm:px-6"}`}>
      <div className={embedded ? "" : "mx-auto max-w-5xl"}>
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-[color:var(--ch-accent)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--ch-accent)]" />
          Game preview
        </div>
        <GameScoreHero
          leagueId={game.league_id}
          homeTeam={game.hometeam}
          awayTeam={game.awayteam}
          state="upcoming"
          colors={colors}
          homeHref={teamHref(game.hometeam)}
          awayHref={teamHref(game.awayteam)}
          homeSub={recordLabel(summaries.home, homeStreak)}
          awaySub={recordLabel(summaries.away, awayStreak)}
          homeExtra={<FormDots form={summaries.home.form} />}
          awayExtra={<FormDots form={summaries.away.form} />}
          center={
            <div className="text-center">
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[.28em] text-white/80">{arrived ? "Tip-off time" : "Tip-off in"}</div>
              <div className="mt-2 flex justify-center gap-1 sm:gap-1.5">
                {left.days > 0 && unit(left.days, "days")}{unit(left.hours, "hrs")}{unit(left.minutes, "min")}{unit(left.seconds, "sec")}
              </div>
            </div>
          }
          meta={[
            { icon: <CalendarDays />, label: fmtDate },
            { icon: <Clock3 />, label: fmtTime },
            ...(game.venue ? [{ icon: <MapPin />, label: game.venue }] : []),
          ]}
        />

        {arrived && (
          <div className="ch-card mt-4 flex flex-col gap-3 px-4 py-3 text-sm text-[color:var(--ch-text)] sm:flex-row sm:items-center sm:justify-between" style={{ boxShadow: "0 0 0 1px var(--ch-accent-soft), var(--ch-shadow)" }}>
            <span>Tip-off time has arrived. Live coverage will appear when the official game feed starts.</span>
            <button onClick={onRefresh} className="ch-btn ch-btn-ghost h-9 px-3 text-sm"><RefreshCw className="h-4 w-4" />Check for live coverage</button>
          </div>
        )}

        <TicketsCard homeTeam={game.hometeam} awayTeam={game.awayteam} ticketUrl={game.ticket_url} colors={colors} />

        <GameStorylines
          storylines={storylines}
          loading={contextLoading || (!!context?.leagueId && rankingsLoading)}
          colors={colors}
          seasonNote={context?.previous ? `Ranks from ${contextLabel.toLowerCase()}` : null}
          playerLink={(story, children) => {
            const ids = story.player?.playerIds ?? [];
            // The profile resolves a raw player id when there's no slug yet.
            const slug = ids.map((id) => storySlugs?.get(id)).find(Boolean) || ids[0];
            if (!slug) return children;
            return onSelectPlayer
              ? <StorylinePlayerLink href={playerHref(slug)} onClick={() => onSelectPlayer(slug)}>{children}</StorylinePlayerLink>
              : <StorylinePlayerLink href={playerHref(slug)}>{children}</StorylinePlayerLink>;
          }}
        />

        <section className="ch-card mt-4 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ch-eyebrow">Matchup context</h2>
            {!contextLoading && context?.rows.length ? <span className="text-xs font-medium text-[color:var(--ch-text-2)]">{contextLabel}</span> : null}
          </div>
          <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">
            {contextLoading
              ? "Loading team context…"
              : summaries.home.form.length || summaries.away.form.length
                ? `Recent form and records from ${context?.previous ? "the corresponding previous competition season" : "the current competition season"}.`
                : "No previous results are available for these teams yet."}
          </p>

          {(leaders.home.length > 0 || leaders.away.length > 0) && (
            <div className="mt-4 border-t border-[color:var(--ch-border)] pt-4">
              <h3 className="ch-eyebrow">Team leaders · {contextLabel}</h3>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <LeaderColumn teamName={game.hometeam} teamHref={teamHref(game.hometeam)} players={leaders.home} playerHref={playerHref} onSelectPlayer={onSelectPlayer} />
                <LeaderColumn teamName={game.awayteam} teamHref={teamHref(game.awayteam)} players={leaders.away} playerHref={playerHref} onSelectPlayer={onSelectPlayer} />
              </div>
            </div>
          )}
        </section>

        {snapshotRows.length > 0 && (
          <section className="ch-card mt-4 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ch-eyebrow">Season snapshot</h2>
              <span className="text-xs font-medium text-[color:var(--ch-text-2)]">{contextLabel}</span>
            </div>
            <div className="mt-4 grid gap-x-8 gap-y-3.5 md:grid-cols-2">
              {snapshotRows.map((row) => (
                <StatCompareRow
                  key={row.label}
                  label={row.label}
                  home={row.a}
                  away={row.b}
                  homeDisplay={`${row.a.toFixed(row.decimals)}${row.suffix || ""}`}
                  awayDisplay={`${row.b.toFixed(row.decimals)}${row.suffix || ""}`}
                  lowerIsBetter={row.lowerIsBetter}
                  colors={colors}
                />
              ))}
            </div>
          </section>
        )}

        {!contextLoading && (
          <section className="ch-card mt-4 p-4 md:p-5">
            <h2 className="ch-eyebrow">Head-to-head</h2>
            {headToHead.meetings.length > 0 ? (
              <div className="mt-3">
                <div className="text-sm text-[color:var(--ch-text-2)]">
                  <span className="font-semibold text-[color:var(--ch-text)]">{game.hometeam}</span> lead the series{" "}
                  <span className="ch-display ch-num text-base font-bold text-[color:var(--ch-text)]">{headToHead.homeWins}-{headToHead.awayWins}</span>{" "}
                  <span className="font-semibold text-[color:var(--ch-text)]">{game.awayteam}</span> {contextLabel.toLowerCase()}.
                </div>
                <div className="mt-3 space-y-1.5 text-sm">
                  {headToHead.meetings.slice(0, 5).map((meeting) => (
                    <div key={meeting.gameKey} className="ch-tile flex items-center justify-between px-3 py-1.5">
                      <span className="text-[color:var(--ch-muted)]">Meeting</span>
                      <span className="ch-num font-semibold text-[color:var(--ch-text)]">
                        {game.hometeam} {meeting.homeScore} – {meeting.awayScore} {game.awayteam}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">No previous meetings between these two teams yet.</p>
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
      <Link href={teamHref} className="block truncate text-xs font-semibold text-[color:var(--ch-text-2)] hover:underline">
        {teamName}
      </Link>
      <div className="mt-2 space-y-1.5">
        {players.length ? players.map((player) => (
          <div key={player.name} className="ch-tile px-3 py-2">
            {player.slug ? (
              <EntityLink
                href={playerHref(player.slug)}
                onNavigate={onSelectPlayer ? () => onSelectPlayer(player.slug as string) : undefined}
                className="block truncate text-sm font-semibold hover:underline"
              >
                {player.name}
              </EntityLink>
            ) : (
              <div className="truncate text-sm font-semibold">{player.name}</div>
            )}
            <div className="ch-num mt-0.5 text-xs font-semibold text-[color:var(--ch-text-2)]">{(player.points / player.games).toFixed(1)} PPG</div>
          </div>
        )) : <div className="text-xs text-[color:var(--ch-muted)]">No data yet</div>}
      </div>
    </div>
  );
}

function recordLabel(
  summary: { wins: number; losses: number },
  streak: { count: number; type: "W" | "L" } | null,
) {
  if (summary.wins + summary.losses === 0) return undefined;
  return `${summary.wins}-${summary.losses}${streak ? ` · ${streak.type}${streak.count}` : ""}`;
}

/** Last five results as small W/L chips, sat on the team colour in the hero. */
function FormDots({ form }: { form: FormResult[] }) {
  if (!form.length) return <span className="text-[11px] text-white/60">No recent form</span>;
  return (
    <div className="flex justify-center gap-1">
      {form.map((result, index) => (
        <span
          key={`${result.teamScore}-${result.opponentScore}-${index}`}
          title={`${result.won ? "Won" : "Lost"} ${result.teamScore}-${result.opponentScore}`}
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ring-1 ${result.won ? "bg-emerald-500 text-white ring-white/30" : "bg-black/35 text-white/85 ring-white/20"}`}
        >
          {result.won ? "W" : "L"}
        </span>
      ))}
    </div>
  );
}
