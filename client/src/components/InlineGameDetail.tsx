import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Calendar, Clock, Trophy, Link as LinkIcon, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LiveFeedPanel, LiveFeedStrip } from "@/components/game/LiveFeed";
import { useLiveCommentary } from "@/hooks/useLiveCommentary";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SharedBoxScore from "@/components/BoxScoreTable";
import { generatePlayCaption } from "@/utils/generatePlayCaption";
import type { ShotData } from "./ShotChart";
import TeamSplitShotChart from "./TeamSplitShotChart";
import PlayByPlay from "./PlayByPlay";
import UpcomingGamePreview, { type PreviewGame } from "./UpcomingGamePreview";
import GameScoreHero, { useMatchupColors } from "./game/GameScoreHero";
import { GameOverviewSections, TeamStatsComparison, GAME_TAB_LIST_CLASS, GAME_TAB_TRIGGER_CLASS, type GameLeaderPlayer } from "./game/GameOverview";
import { playerPath, teamPath } from "@shared/seo";
import { gameRecap } from "@shared/recaps";
import { normalizeEventPeriods, normalizeShotPeriods, periodLabel } from "@/lib/periodLabel";

export interface GameInfo {
  date: string;
  status: string | null;
  hometeam: string;
  awayteam: string;
  homeScore: number;
  awayScore: number;
  teams: string[];
  teamScores: Record<string, number>;
}

interface InlineGameDetailProps {
  gameKey: string;
  /** No longer used: the game view takes its colours from the two teams. */
  brandColor?: string;
  leagueName?: string;
  leagueSlug?: string;
  onBack: () => void;
  onGameInfoLoaded?: (info: GameInfo) => void;
  onSelectPlayer?: (playerSlug: string) => void;
}

interface PlayerStat {
  id?: string;
  /** players.id and slug, for linking to the player's page. */
  playerId?: string | null;
  slug?: string | null;
  firstname: string;
  familyname: string;
  team: string;
  jersey_number?: string | number | null;
  sminutes?: string;
  spoints: number;
  sfieldgoalsmade?: number;
  sfieldgoalsattempted?: number;
  sthreepointersmade?: number;
  sthreepointersattempted?: number;
  sfreethrowsmade?: number;
  sfreethrowsattempted?: number;
  sreboundstotal: number;
  sassists: number;
  ssteals?: number;
  sblocks?: number;
  sturnovers?: number;
  sfoulspersonal?: number;
}

interface TeamStatRow {
  name: string;
  tot_spoints: number;
  p1_score: number | null;
  p2_score: number | null;
  p3_score: number | null;
  p4_score: number | null;
  tot_sfieldgoalsmade: number;
  tot_sfieldgoalsattempted: number;
  tot_sthreepointersmade: number;
  tot_sthreepointersattempted: number;
  tot_sfreethrowsmade: number;
  tot_sfreethrowsattempted: number;
  tot_sreboundstotal: number;
  tot_sassists: number;
  tot_ssteals: number;
  tot_sblocks: number;
  tot_sturnovers: number;
}

interface LiveEvent {
  id: number;
  game_key: string;
  action_type: string;
  sub_type: string | null;
  period: number;
  clock: string;
  team_no: number;
  player_name: string | null;
  description: string | null;
  score: string;
  success: boolean;
  scoring: boolean;
  points: number | null;
}

interface LiveClock {
  period: number | null;
  periodType: string | null;
  clock: string | null;
}

function parseMinutes(s: string | null | undefined): string {
  if (!s) return "0:00";
  if (s.includes(":")) return s;
  const m = parseFloat(s);
  const w = Math.floor(m);
  const sec = Math.round((m - w) * 60);
  return `${w}:${sec.toString().padStart(2, "0")}`;
}

const fullName = (p: PlayerStat) => `${p.firstname} ${p.familyname}`.trim();

const toLeader = (p: PlayerStat): GameLeaderPlayer => ({
  name: fullName(p),
  spoints: p.spoints,
  sreboundstotal: p.sreboundstotal,
  sassists: p.sassists,
  ssteals: p.ssteals,
  sblocks: p.sblocks,
});

const pickLink = (p: { href: string | null; onSelect: (() => void) | null }) => ({ href: p.href, onSelect: p.onSelect });

function formatLiveClock(clock: string | null | undefined): string | null {
  if (!clock) return null;
  const [minutes, seconds] = clock.split(":");
  const minuteValue = Number.parseInt(minutes, 10);
  const secondValue = Number.parseInt(seconds, 10);
  if (!Number.isFinite(minuteValue) || !Number.isFinite(secondValue)) return clock;
  return `${minuteValue}:${secondValue.toString().padStart(2, "0")}`;
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

function formatTime(s: string): string {
  return new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function InlineGameDetail({
  gameKey, leagueSlug, onBack, onGameInfoLoaded, onSelectPlayer,
}: InlineGameDetailProps) {
  const [loading, setLoading] = useState(true);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [scheduledGame, setScheduledGame] = useState<PreviewGame | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [competitionName, setCompetitionName] = useState<string | null>(null);
  const [homeTeamStats, setHomeTeamStats] = useState<TeamStatRow | null>(null);
  const [awayTeamStats, setAwayTeamStats] = useState<TeamStatRow | null>(null);
  const [homePlayerStats, setHomePlayerStats] = useState<PlayerStat[]>([]);
  const [awayPlayerStats, setAwayPlayerStats] = useState<PlayerStat[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [liveClock, setLiveClock] = useState<LiveClock | null>(null);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [shotData, setShotData] = useState<ShotData[]>([]);
  const [shotLoading, setShotLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("game");
  // Bumped to quietly reload the box score while the game is on.
  const [refreshTick, setRefreshTick] = useState(0);
  const loadedKeyRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);
  const colors = useMatchupColors(gameInfo?.hometeam ?? "", gameInfo?.awayteam ?? "", leagueId);

  useEffect(() => {
    if (!gameKey) return;
    // A refresh of the game already on screen keeps what's shown and swaps in
    // the new numbers; only a different game starts from a blank slate.
    const isRefresh = loadedKeyRef.current === gameKey;
    loadedKeyRef.current = gameKey;
    if (!isRefresh) {
      setLoading(true);
      setScheduledGame(null);
      setActiveTab("game");
      setEventsLoaded(false);
      setLiveEvents([]);
      setLiveClock(null);
      setShotData([]);
      setGameInfo(null);
      setLeagueId(null);
      setCompetitionName(null);
      setHomeTeamStats(null);
      setAwayTeamStats(null);
      setHomePlayerStats([]);
      setAwayPlayerStats([]);
    }

    (async () => {
      try {
        const [{ data: detail }, { data: scheduled }] = await Promise.all([
          supabase
            .from("v_game_detail")
            .select("*")
            .eq("game_key", gameKey)
            .limit(1)
            .maybeSingle(),
          supabase
            .from("game_schedule")
            .select("game_key,league_id,matchtime,hometeam,awayteam,status,competitionname,home_team_id,away_team_id")
            .eq("game_key", gameKey)
            .limit(1)
            .maybeSingle(),
        ]);

        if (!detail) {
          if (scheduled) {
            setScheduledGame(scheduled as PreviewGame);
          }
          setLoading(false);
          return;
        }

        const d = detail as any;
        if (d.league_id) setLeagueId(d.league_id);
        if (d.competitionname) setCompetitionName(d.competitionname);

        let homeName = d.home_team || "";
        let awayName = d.away_team || "";
        const homeScore = d.home_score ?? 0;
        const awayScore = d.away_score ?? 0;

        // Detect when v_game_detail returns a coach name instead of a real team name.
        // This happens when home_team / away_team equals the coach fields on the same row.
        const looksLikeCoach = (name: string) =>
          !!name && (name === d.home_coach || name === d.away_coach);

        if (looksLikeCoach(homeName) || looksLikeCoach(awayName)) {
          const { data: tsRows } = await supabase
            .from("team_stats")
            .select("name, tot_spoints")
            .eq("game_key", gameKey);

          if (tsRows && tsRows.length > 0) {
            const teamNames = Array.from(
              new Set(tsRows.map((r: any) => r.name).filter(Boolean))
            ) as string[];

            if (teamNames.length >= 2) {
              const scoreFor = (name: string) =>
                (tsRows as any[])
                  .filter((r: any) => r.name === name)
                  .reduce((acc: number, r: any) => acc + (r.tot_spoints || 0), 0);

              const s0 = scoreFor(teamNames[0]);
              const s1 = scoreFor(teamNames[1]);

              if (s0 === homeScore && s1 === awayScore) {
                homeName = teamNames[0];
                awayName = teamNames[1];
              } else if (s1 === homeScore && s0 === awayScore) {
                homeName = teamNames[1];
                awayName = teamNames[0];
              } else {
                homeName = teamNames[0];
                awayName = teamNames[1];
              }
            } else if (teamNames.length === 1) {
              if (!looksLikeCoach(homeName)) {
                awayName = teamNames[0];
              } else {
                homeName = teamNames[0];
              }
            }
          }
        }

        const info: GameInfo = {
          date: d.match_time || new Date().toISOString(),
          // The schedule poller owns the official lifecycle state. The detail
          // view can contain stats while a game is still in progress and may
          // incorrectly infer "Final" from their presence.
          status: scheduled?.status || d.game_status || null,
          hometeam: homeName,
          awayteam: awayName,
          homeScore,
          awayScore,
          teams: [homeName, awayName].filter(Boolean),
          teamScores: { [homeName]: homeScore, [awayName]: awayScore },
        };
        setGameInfo(info);
        if (onGameInfoLoaded) onGameInfoLoaded(info);

        const makeTeamRow = (prefix: "home" | "away", name: string): TeamStatRow => ({
          name,
          tot_spoints: d[`${prefix}_score`] ?? 0,
          p1_score: d[`${prefix}_q1`] ?? null,
          p2_score: d[`${prefix}_q2`] ?? null,
          p3_score: d[`${prefix}_q3`] ?? null,
          p4_score: d[`${prefix}_q4`] ?? null,
          tot_sfieldgoalsmade: d[`${prefix}_fgm`] ?? 0,
          tot_sfieldgoalsattempted: d[`${prefix}_fga`] ?? 0,
          tot_sthreepointersmade: d[`${prefix}_3pm`] ?? 0,
          tot_sthreepointersattempted: d[`${prefix}_3pa`] ?? 0,
          tot_sfreethrowsmade: d[`${prefix}_ftm`] ?? 0,
          tot_sfreethrowsattempted: d[`${prefix}_fta`] ?? 0,
          tot_sreboundstotal: d[`${prefix}_reb`] ?? 0,
          tot_sassists: d[`${prefix}_ast`] ?? 0,
          tot_ssteals: d[`${prefix}_stl`] ?? 0,
          tot_sblocks: d[`${prefix}_blk`] ?? 0,
          tot_sturnovers: d[`${prefix}_tov`] ?? 0,
        });

        if (homeName) setHomeTeamStats(makeTeamRow("home", homeName));
        if (awayName) setAwayTeamStats(makeTeamRow("away", awayName));

        let { data: boxRows, error: boxErr } = await supabase
          .from("v_box_score")
          .select("*")
          .eq("game_key", gameKey)
          .order("points", { ascending: false });

        if (boxErr) {
          const { data: fallback } = await supabase
            .from("player_stats")
            .select("*")
            .eq("game_key", gameKey)
            .order("spoints", { ascending: false });
          if (fallback) {
            boxRows = fallback.map((s: any) => ({
              ...s,
              player_name: s.full_name || `${s.firstname || ""} ${s.familyname || ""}`.trim() || "Unknown",
              team_name: s.team_name || s.team || "",
              points: s.spoints || 0,
              assists: s.sassists || 0,
              rebounds: s.sreboundstotal || 0,
              steals: s.ssteals || 0,
              blocks: s.sblocks || 0,
              turnovers: s.sturnovers || 0,
              minutes: s.sminutes,
              fgm: s.sfieldgoalsmade, fga: s.sfieldgoalsattempted,
              three_pm: s.sthreepointersmade, three_pa: s.sthreepointersattempted,
              ftm: s.sfreethrowsmade, fta: s.sfreethrowsattempted,
            }));
          }
        }

        if (boxRows && boxRows.length > 0) {
          const toStat = (r: any): PlayerStat => ({
            id: r.id || r.player_id,
            playerId: r.player_id ?? null,
            firstname: r.player_name || `${r.firstname || ""} ${r.familyname || ""}`.trim() || "Unknown",
            familyname: "",
            team: r.team_name || r.team || "",
            jersey_number: r.jersey_number ?? r.shirtnumber ?? null,
            sminutes: r.minutes ?? r.sminutes,
            spoints: r.points ?? r.spoints ?? 0,
            sfieldgoalsmade: r.fgm ?? r.sfieldgoalsmade,
            sfieldgoalsattempted: r.fga ?? r.sfieldgoalsattempted,
            sthreepointersmade: r.three_pm ?? r.sthreepointersmade,
            sthreepointersattempted: r.three_pa ?? r.sthreepointersattempted,
            sfreethrowsmade: r.ftm ?? r.sfreethrowsmade,
            sfreethrowsattempted: r.fta ?? r.sfreethrowsattempted,
            sreboundstotal: r.rebounds ?? r.sreboundstotal ?? 0,
            sassists: r.assists ?? r.sassists ?? 0,
            ssteals: r.steals ?? r.ssteals,
            sblocks: r.blocks ?? r.sblocks,
            sturnovers: r.turnovers ?? r.sturnovers,
            // v_box_score names this column `fouls`; the player_stats fallback keeps `sfoulspersonal`.
            sfoulspersonal: r.fouls ?? r.sfoulspersonal ?? 0,
          });

          const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();

          // --- Name correction using box score as ground truth ---
          // v_game_detail sometimes has a coach name where a team name should be.
          // If the current homeName/awayName don't appear in the box score team
          // names, replace with whatever the box score actually contains.
          const hasSideField = boxRows.some((r: any) => r.side === "1" || r.side === "2");
          if (!hasSideField) {
            const boxTeamNames = Array.from(
              new Set(boxRows.map((r: any) => (r.team_name || r.team || "") as string).filter(Boolean))
            ) as string[];

            const homeInBox = boxTeamNames.some(t => norm(t) === norm(homeName));
            const awayInBox = boxTeamNames.some(t => norm(t) === norm(awayName));

            if (!homeInBox || !awayInBox) {
              // One or both names are wrong — figure out the correct ones
              const scoreFor = (t: string) =>
                boxRows.filter((r: any) => norm(r.team_name || r.team) === norm(t))
                  .reduce((acc: number, r: any) => acc + (r.points ?? r.spoints ?? 0), 0);

              if (!homeInBox && awayInBox) {
                const candidates = boxTeamNames.filter(t => norm(t) !== norm(awayName));
                if (candidates.length > 0) homeName = candidates[0];
              } else if (!awayInBox && homeInBox) {
                const candidates = boxTeamNames.filter(t => norm(t) !== norm(homeName));
                if (candidates.length > 0) awayName = candidates[0];
              } else if (boxTeamNames.length >= 2) {
                // Both wrong — try score matching, fall back to position order
                const s0 = scoreFor(boxTeamNames[0]);
                const s1 = scoreFor(boxTeamNames[1]);
                if (s0 === homeScore && s1 === awayScore) {
                  homeName = boxTeamNames[0]; awayName = boxTeamNames[1];
                } else if (s1 === homeScore && s0 === awayScore) {
                  homeName = boxTeamNames[1]; awayName = boxTeamNames[0];
                } else {
                  homeName = boxTeamNames[0]; awayName = boxTeamNames[1];
                }
              }

              // Re-apply corrected names to all downstream state
              const correctedInfo: GameInfo = {
                ...info,
                hometeam: homeName,
                awayteam: awayName,
                teams: [homeName, awayName].filter(Boolean),
                teamScores: { [homeName]: homeScore, [awayName]: awayScore },
              };
              setGameInfo(correctedInfo);
              if (onGameInfoLoaded) onGameInfoLoaded(correctedInfo);
              if (homeName) setHomeTeamStats(makeTeamRow("home", homeName));
              if (awayName) setAwayTeamStats(makeTeamRow("away", awayName));
            }
          }
          // --- End name correction ---

          const homeNorm = norm(homeName);
          const awayNorm = norm(awayName);
          // Use side field when present on a row, fall back to case-insensitive
          // team_name match. This handles the mixed case where one team has side
          // values in v_box_score and the other does not (e.g. Just Cardio).
          const matchesHome = (r: any) =>
            r.side === "1" || (!r.side && norm(r.team_name || r.team) === homeNorm);
          const matchesAway = (r: any) =>
            r.side === "2" || (!r.side && norm(r.team_name || r.team) === awayNorm);

          const allStats: PlayerStat[] = boxRows.map(toStat);
          const homeStats = boxRows.filter(matchesHome)
            .map(toStat).sort((a, b) => (b.spoints || 0) - (a.spoints || 0));
          const awayStats = boxRows.filter(matchesAway)
            .map(toStat).sort((a, b) => (b.spoints || 0) - (a.spoints || 0));

          // Slugs, so names link to the canonical player page (no redirect hop).
          const playerIds = Array.from(new Set([...homeStats, ...awayStats].map((p) => p.playerId).filter(Boolean))) as string[];
          if (playerIds.length) {
            const { data: slugRows } = await supabase.from("players").select("id, slug").in("id", playerIds);
            const slugById = new Map((slugRows || []).map((row: any) => [row.id, row.slug]));
            for (const p of [...homeStats, ...awayStats]) p.slug = (p.playerId && slugById.get(p.playerId)) || null;
          }
          setHomePlayerStats(homeStats);
          setAwayPlayerStats(awayStats);

          if (!homeName || !awayName) {
            const teams = Array.from(new Set(allStats.map((s) => s.team).filter(Boolean)));
            if (teams.length >= 2) {
              const calcScore = (t: string) => allStats.filter((s) => s.team === t).reduce((n, s) => n + (s.spoints || 0), 0);
              const updatedInfo: GameInfo = {
                ...info,
                hometeam: teams[0],
                awayteam: teams[1],
                teams,
                teamScores: { [teams[0]]: calcScore(teams[0]), [teams[1]]: calcScore(teams[1]) },
              };
              setGameInfo(updatedInfo);
              if (onGameInfoLoaded) onGameInfoLoaded(updatedInfo);
            }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [gameKey, refreshTick]);

  const fetchEventsAndShots = useCallback(async () => {
    if (eventsLoaded || !gameKey) return;
    setEventsLoading(true);
    setShotLoading(true);
    try {
      const [{ data: events }, { data: shots }] = await Promise.all([
        supabase.from("live_events").select("*").eq("game_key", gameKey).order("action_number", { ascending: true }),
        supabase.from("shot_chart").select("id, action_number, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key").eq("game_key", gameKey),
      ]);
      const normalized = events ? normalizeEventPeriods(events) : null;
      if (normalized) { setLiveEvents(normalized); setEventsLoaded(true); }
      if (shots) setShotData(normalizeShotPeriods(shots as ShotData[], normalized ?? []));
    } finally {
      setEventsLoading(false);
      setShotLoading(false);
    }
  }, [gameKey, eventsLoaded]);

  useEffect(() => {
    if ((activeTab === "game" || activeTab === "feed" || activeTab === "shots") && !eventsLoaded) {
      fetchEventsAndShots();
    }
  }, [activeTab, eventsLoaded, fetchEventsAndShots]);

  useEffect(() => {
    const status = (gameInfo?.status || "").toLowerCase();
    const gameIsLive = status === "live" || status === "in_progress" || status.includes("live");
    if (!gameIsLive) {
      setLiveClock(null);
      return;
    }

    let active = true;
    const fetchLiveClock = async () => {
      const { data } = await supabase
        .from("live_events")
        .select("period,period_type,clock")
        .eq("game_key", gameKey)
        .order("action_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active && data) {
        setLiveClock({ period: data.period ?? null, periodType: data.period_type ?? null, clock: data.clock ?? null });
      }
    };

    fetchLiveClock();
    const interval = window.setInterval(fetchLiveClock, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [gameKey, gameInfo?.status]);

  // Keep a game that's in progress (or about to start) up to date without the
  // viewer reloading: the box score and score, and the play-by-play and shots.
  const statusLower = (gameInfo?.status || (scheduledGame as { status?: string | null } | null)?.status || "").toLowerCase();
  const scheduledTip = scheduledGame?.matchtime ? Date.parse(scheduledGame.matchtime) : NaN;
  const shouldPoll =
    statusLower.includes("live") || statusLower === "in_progress" ||
    (!gameInfo && !!scheduledGame && statusLower !== "final" && Number.isFinite(scheduledTip) &&
      scheduledTip <= Date.now() + 30 * 60 * 1000 && scheduledTip >= Date.now() - 12 * 60 * 60 * 1000);

  useEffect(() => {
    if (!shouldPoll || !gameKey) return;
    let active = true;
    const refreshFeed = async () => {
      const [{ data: events }, { data: shots }] = await Promise.all([
        supabase.from("live_events").select("*").eq("game_key", gameKey).order("action_number", { ascending: true }),
        supabase.from("shot_chart").select("id, action_number, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key").eq("game_key", gameKey),
      ]);
      if (!active) return;
      const normalized = events ? normalizeEventPeriods(events) : null;
      if (normalized) setLiveEvents(normalized);
      if (shots) setShotData(normalizeShotPeriods(shots as ShotData[], normalized ?? []));
    };
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setRefreshTick((n) => n + 1);
      if (eventsLoaded) void refreshFeed();
    };
    const interval = window.setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [shouldPoll, gameKey, eventsLoaded]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const isLive = ((gameInfo?.status || "").toLowerCase().includes("live") || gameInfo?.status?.toLowerCase() === "in_progress");
  const isFinalStatus = ["final", "finished", "completed"].includes((gameInfo?.status || "").toLowerCase());
  const hasStats = homePlayerStats.length > 0 || awayPlayerStats.length > 0;
  const isGamePlayed = isFinalStatus || isLive || hasStats;

  const quarterScores = (() => {
    if (!homeTeamStats || !awayTeamStats) return [];
    const qs = [
      { p: 1, home: homeTeamStats.p1_score || 0, away: awayTeamStats.p1_score || 0 },
      { p: 2, home: homeTeamStats.p2_score || 0, away: awayTeamStats.p2_score || 0 },
      { p: 3, home: homeTeamStats.p3_score || 0, away: awayTeamStats.p3_score || 0 },
      { p: 4, home: homeTeamStats.p4_score || 0, away: awayTeamStats.p4_score || 0 },
    ];
    return qs.filter((q) => q.home > 0 || q.away > 0);
  })();

  // Live text commentary (kept above the early returns so hook order is stable).
  const feedStatus = (gameInfo?.status || "").toLowerCase();
  const feedLive = feedStatus.includes("live") || feedStatus === "in_progress";
  const { items: feedItems, players: feedPlayers, shots: feedShots } = useLiveCommentary({
    gameKey,
    leagueId,
    homeTeam: gameInfo?.hometeam ?? "",
    awayTeam: gameInfo?.awayteam ?? "",
    events: liveEvents as any,
    shots: shotData as any,
    isFinal: ["final", "finished", "complete", "completed", "ft"].includes(feedStatus),
    isLive: feedLive,
    knownNames: [...homePlayerStats, ...awayPlayerStats].map((p) => fullName(p)),
    roster: [
      ...homePlayerStats.map((p) => ({ playerId: p.playerId ?? null, name: fullName(p), shirt: p.jersey_number, teamNo: 1 as const, points: p.spoints })),
      ...awayPlayerStats.map((p) => ({ playerId: p.playerId ?? null, name: fullName(p), shirt: p.jersey_number, teamNo: 2 as const, points: p.spoints })),
    ],
  });

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="ch-skel h-9 w-24" />
        <div className="ch-skel h-[240px] md:h-[300px] !rounded-[14px]" />
        <div className="ch-skel h-11" />
        <div className="ch-skel h-48 !rounded-[14px]" />
      </div>
    );
  }

  if (!gameInfo && scheduledGame) {
    return (
      <div className="space-y-3">
        <button onClick={onBack} className="ch-btn ch-btn-ghost h-9 px-3 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to league
        </button>
        <UpcomingGamePreview game={scheduledGame} embedded leagueSlug={leagueSlug} onSelectPlayer={onSelectPlayer} />
      </div>
    );
  }

  if (!gameInfo) {
    return (
      <div className="ch-card py-16 text-center">
        <p className="text-[color:var(--ch-text-2)]">Game not found.</p>
        <button onClick={onBack} className="mt-4 ch-btn ch-btn-ghost h-9 px-3 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
    );
  }

  const { hometeam, awayteam, homeScore, awayScore, date, status } = gameInfo;

  const teamHref = (team: string) => teamPath(team, leagueSlug) || undefined;
  // A player's page; inside the league page a plain click opens them inline.
  const linked = <T extends PlayerStat>(p: T) => {
    const href = playerPath({ slug: p.slug, full_name: fullName(p), id: p.playerId });
    const key = p.slug || p.playerId;
    return { ...p, href, onSelect: onSelectPlayer && key ? () => onSelectPlayer(key) : null };
  };
  const quarterOf = (row: TeamStatRow | null, q: 1 | 2 | 3 | 4) => (row ? row[`p${q}_score`] || 0 : 0);
  const topOf = (players: PlayerStat[]) => players[0] ? { name: fullName(players[0]), pts: players[0].spoints || 0, reb: players[0].sreboundstotal, ast: players[0].sassists } : null;
  const recap = isFinalStatus
    ? gameRecap({
        home: hometeam,
        away: awayteam,
        homeScore,
        awayScore,
        competition: competitionName,
        date,
        quarters: ([1, 2, 3, 4] as const).map((q) => ({ home: quarterOf(homeTeamStats, q), away: quarterOf(awayTeamStats, q) })),
        topHome: topOf(homePlayerStats),
        topAway: topOf(awayPlayerStats),
      })
    : [];
  const liveLabel = isLive && liveClock
    ? [periodLabel(liveClock.period, liveClock.periodType), formatLiveClock(liveClock.clock)]
        .filter(Boolean).join(" · ")
    : null;
  const BoxScoreTable = ({ players, teamName, score, color }: { players: PlayerStat[]; teamName: string; score: number; color: string }) => (
    <SharedBoxScore
      players={players.map(linked)}
      teamName={teamName}
      teamHref={teamHref(teamName)}
      score={score}
      leagueId={leagueId ?? undefined}
      headerColor={color}
      formatMinutes={parseMinutes}
    />
  );

  const TABS = [
    ["game", "Game"],
    ["boxscore", "Box Score"],
    ["teamstats", "Team Stats"],
    ["shots", "Shots"],
    ["feed", "Play by Play"],
  ] as const;

  return (
    <div className="space-y-0 animate-fade-in-up">
      {/* Back + Copy link bar */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="ch-btn ch-btn-ghost h-9 px-3 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button onClick={handleCopyLink} className="ch-btn ch-btn-ghost h-9 px-3 text-xs" title="Copy shareable link">
          {copied ? <Check className="h-3.5 w-3.5 text-[color:var(--ch-win)]" /> : <LinkIcon className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      <GameScoreHero
        leagueId={leagueId}
        homeTeam={hometeam}
        awayTeam={awayteam}
        homeScore={isGamePlayed ? homeScore : null}
        awayScore={isGamePlayed ? awayScore : null}
        state={isLive ? "live" : isFinalStatus || hasStats ? "final" : "upcoming"}
        liveLabel={liveLabel}
        homeHref={teamHref(hometeam)}
        awayHref={teamHref(awayteam)}
        colors={colors}
        meta={[
          { icon: <Calendar />, label: formatDate(date) },
          { icon: <Clock />, label: formatTime(date) },
          ...(competitionName ? [{ icon: <Trophy />, label: competitionName }] : []),
        ]}
      />

      <div className="mt-4 md:mt-5">
        {isGamePlayed ? (
          <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start xl:gap-5">
          <div className="min-w-0">
          {feedItems.length > 0 && (
            <div className="mb-4 xl:hidden">
              <LiveFeedStrip
                items={feedItems}
                players={feedPlayers}
                shots={feedShots}
                homeTeam={hometeam}
                awayTeam={awayteam}
                homeColor={colors.homeFill}
                awayColor={colors.awayFill}
                isLive={isLive}
                leagueId={leagueId}
              />
            </div>
          )}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Scrolls on a phone, where five labels don't fit; a fixed grid from md up. */}
            <TabsList className={GAME_TAB_LIST_CLASS}>
              {TABS.map(([v, label]) => (
                <TabsTrigger key={v} value={v} className={GAME_TAB_TRIGGER_CLASS}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* GAME TAB */}
            <TabsContent value="game" className="mt-0">
              <GameOverviewSections
                homeTeam={hometeam}
                awayTeam={awayteam}
                leagueId={leagueId}
                home={homeTeamStats}
                away={awayTeamStats}
                homePlayers={homePlayerStats.map((p) => ({ ...toLeader(p), ...pickLink(linked(p)) }))}
                awayPlayers={awayPlayerStats.map((p) => ({ ...toLeader(p), ...pickLink(linked(p)) }))}
                events={eventsLoading ? null : liveEvents}
                colors={colors}
                recap={recap}
              />
            </TabsContent>

            {/* BOX SCORE TAB */}
            <TabsContent value="boxscore" className="mt-0 space-y-5">
              <BoxScoreTable players={homePlayerStats} teamName={hometeam} score={homeScore} color={colors.homeFill} />
              <BoxScoreTable players={awayPlayerStats} teamName={awayteam} score={awayScore} color={colors.awayFill} />
            </TabsContent>

            {/* TEAM STATS TAB */}
            <TabsContent value="teamstats" className="mt-0">
              <TeamStatsComparison homeTeam={hometeam} awayTeam={awayteam} home={homeTeamStats} away={awayTeamStats} colors={colors} />
            </TabsContent>

            {/* SHOTS TAB */}
            <TabsContent value="shots" className="mt-0">
              <TeamSplitShotChart
                shots={shotData}
                loading={shotLoading}
                emptyMessage="No shot data available for this game yet."
                homeTeam={hometeam}
                awayTeam={awayteam}
                showPlayerFilter
                showQuarterFilter
                showResultFilter
              />
            </TabsContent>

            {/* FEED TAB */}
            <TabsContent value="feed" className="mt-0">
              <PlayByPlay
                events={liveEvents}
                homeTeam={hometeam}
                awayTeam={awayteam}
                loading={eventsLoading}
                emptyMessage="Play-by-play data coming soon."
                describeEvent={(event, previousScoredEvent) =>
                  generatePlayCaption(event as any, previousScoredEvent as any) || event.description || `${event.action_type} ${event.sub_type || ""}`.trim()
                }
              />
            </TabsContent>
          </Tabs>
          </div>
          {feedItems.length > 0 && (
            <aside className="hidden xl:block xl:sticky xl:top-20" aria-label="Game feed">
              <LiveFeedPanel
                items={feedItems}
                players={feedPlayers}
                shots={feedShots}
                homeTeam={hometeam}
                awayTeam={awayteam}
                homeColor={colors.homeFill}
                awayColor={colors.awayFill}
                isLive={isLive}
                leagueId={leagueId}
                className="max-h-[calc(100vh-7rem)]"
              />
            </aside>
          )}
          </div>
        ) : (
          <div className="ch-card p-5 text-center">
            <p className="text-sm text-[color:var(--ch-text-2)]">
              Live stats and play-by-play data will appear when the game starts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
