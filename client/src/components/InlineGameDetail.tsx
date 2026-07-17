import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Calendar, Clock, MapPin, Link as LinkIcon, Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TeamLogo } from "./TeamLogo";
import { generatePlayCaption } from "@/utils/generatePlayCaption";
import ShotChart, { type ShotData } from "./ShotChart";
import { useReadableTeamColor } from "@/hooks/useReadableColor";

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
  brandColor: string;
  leagueName?: string;
  leagueSlug?: string;
  onBack: () => void;
  onGameInfoLoaded?: (info: GameInfo) => void;
}

interface PlayerStat {
  id?: string;
  firstname: string;
  familyname: string;
  team: string;
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

function parseMinutes(s: string | null | undefined): string {
  if (!s) return "0:00";
  if (s.includes(":")) return s;
  const m = parseFloat(s);
  const w = Math.floor(m);
  const sec = Math.round((m - w) * 60);
  return `${w}:${sec.toString().padStart(2, "0")}`;
}

function getTeamAbbr(name: string): string {
  if (!name) return "";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.substring(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

function getStatusBadge(status: string | null | undefined) {
  const s = (status || "").toLowerCase();
  if (s === "final" || s === "finished" || s === "completed")
    return <span className="px-3 py-1 bg-green-600 text-white text-sm font-semibold rounded-full">FINAL</span>;
  if (s === "live" || s === "in_progress" || s.includes("live"))
    return <span className="px-3 py-1 bg-red-500 text-white text-sm font-semibold rounded-full animate-pulse">LIVE</span>;
  return <span className="px-3 py-1 bg-slate-500 text-white text-sm font-semibold rounded-full">UPCOMING</span>;
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
  gameKey, brandColor, leagueName, leagueSlug, onBack, onGameInfoLoaded,
}: InlineGameDetailProps) {
  const [loading, setLoading] = useState(true);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [competitionName, setCompetitionName] = useState<string | null>(null);
  const [homeTeamStats, setHomeTeamStats] = useState<TeamStatRow | null>(null);
  const [awayTeamStats, setAwayTeamStats] = useState<TeamStatRow | null>(null);
  const [homePlayerStats, setHomePlayerStats] = useState<PlayerStat[]>([]);
  const [awayPlayerStats, setAwayPlayerStats] = useState<PlayerStat[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [shotData, setShotData] = useState<ShotData[]>([]);
  const [shotLoading, setShotLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("game");
  const [copied, setCopied] = useState(false);
  const readable = useReadableTeamColor(brandColor);

  useEffect(() => {
    if (!gameKey) return;
    setLoading(true);
    setActiveTab("game");
    setEventsLoaded(false);
    setLiveEvents([]);
    setShotData([]);

    (async () => {
      try {
        const { data: detail } = await supabase
          .from("v_game_detail")
          .select("*")
          .eq("game_key", gameKey)
          .limit(1)
          .maybeSingle();

        if (!detail) { setLoading(false); return; }

        const d = detail as any;
        if (d.league_id) setLeagueId(d.league_id);
        if (d.competitionname) setCompetitionName(d.competitionname);

        const homeName = d.home_team || "";
        const awayName = d.away_team || "";
        const homeScore = d.home_score ?? 0;
        const awayScore = d.away_score ?? 0;

        const info: GameInfo = {
          date: d.match_time || new Date().toISOString(),
          status: d.game_status || null,
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
            firstname: r.player_name || `${r.firstname || ""} ${r.familyname || ""}`.trim() || "Unknown",
            familyname: "",
            team: r.team_name || r.team || "",
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
          });

          const hasSide = boxRows.some((r: any) => r.side === "1" || r.side === "2");
          const allStats: PlayerStat[] = boxRows.map(toStat);
          const homeStats = (hasSide
            ? boxRows.filter((r: any) => r.side === "1")
            : boxRows.filter((r: any) => (r.team_name || r.team) === homeName)
          ).map(toStat).sort((a, b) => (b.spoints || 0) - (a.spoints || 0));
          const awayStats = (hasSide
            ? boxRows.filter((r: any) => r.side === "2")
            : boxRows.filter((r: any) => (r.team_name || r.team) === awayName)
          ).map(toStat).sort((a, b) => (b.spoints || 0) - (a.spoints || 0));

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
  }, [gameKey]);

  const fetchEventsAndShots = useCallback(async () => {
    if (eventsLoaded || !gameKey) return;
    setEventsLoading(true);
    setShotLoading(true);
    try {
      const [{ data: events }, { data: shots }] = await Promise.all([
        supabase.from("live_events").select("*").eq("game_key", gameKey).order("action_number", { ascending: true }),
        supabase.from("shot_chart").select("id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key").eq("game_key", gameKey),
      ]);
      if (events) { setLiveEvents(events); setEventsLoaded(true); }
      if (shots) setShotData(shots as ShotData[]);
    } finally {
      setEventsLoading(false);
      setShotLoading(false);
    }
  }, [gameKey, eventsLoaded]);

  useEffect(() => {
    if ((activeTab === "feed" || activeTab === "shots") && !eventsLoaded) {
      fetchEventsAndShots();
    }
  }, [activeTab, eventsLoaded, fetchEventsAndShots]);

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

  const sortedFeedEvents = [...liveEvents].sort((a, b) => {
    const pd = (b.period || 0) - (a.period || 0);
    if (pd !== 0) return pd;
    const parseClock = (c: string | null | undefined) => {
      if (!c) return 0;
      const parts = c.split(":").map(Number);
      return parts.length >= 2 ? parts[0] * 60 + parts[1] : parts[0] || 0;
    };
    return parseClock(a.clock) - parseClock(b.clock);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" style={{ color: brandColor }} />
      </div>
    );
  }

  if (!gameInfo) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-500 dark:text-slate-400">Game not found.</p>
        <button onClick={onBack} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-orange-500">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
    );
  }

  const { hometeam, awayteam, homeScore, awayScore, date, status } = gameInfo;
  const hasTeamStats = homeTeamStats !== null && awayTeamStats !== null;

  const tabActiveStyle = { backgroundColor: brandColor, color: "#fff" };

  const BoxScoreTable = ({ players, teamName, score }: { players: PlayerStat[]; teamName: string; score: number }) => (
    <div className="bg-white dark:bg-neutral-800 rounded-lg overflow-hidden border border-orange-100 dark:border-neutral-700">
      <div className="px-4 py-3 flex items-center gap-3 text-white" style={{ backgroundColor: brandColor }}>
        {leagueId && <TeamLogo teamName={teamName} leagueId={leagueId} size="sm" />}
        <h4 className="font-semibold flex-1 truncate">{teamName}</h4>
        {score != null && <span className="ml-auto text-2xl font-bold">{score}</span>}
      </div>
      {players.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-orange-50 dark:bg-neutral-900 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="text-left py-2 px-3 sticky left-0 bg-orange-50 dark:bg-neutral-900">Player</th>
                <th className="text-center py-2 px-2">MIN</th>
                <th className="text-center py-2 px-2">PTS</th>
                <th className="text-center py-2 px-2">REB</th>
                <th className="text-center py-2 px-2">AST</th>
                <th className="text-center py-2 px-2">STL</th>
                <th className="text-center py-2 px-2">BLK</th>
                <th className="text-center py-2 px-2">TO</th>
                <th className="text-center py-2 px-2">FG</th>
                <th className="text-center py-2 px-2">3PT</th>
                <th className="text-center py-2 px-2">FT</th>
              </tr>
            </thead>
            <tbody className="text-slate-800 dark:text-slate-200">
              {players.map((p, i) => (
                <tr key={i} className="border-t border-orange-100 dark:border-neutral-700 hover:bg-orange-50 dark:hover:bg-neutral-800">
                  <td className="py-2 px-3 sticky left-0 bg-white dark:bg-neutral-800 font-medium whitespace-nowrap">
                    {p.firstname} {p.familyname}
                  </td>
                  <td className="text-center py-2 px-2 text-slate-500">{parseMinutes(p.sminutes)}</td>
                  <td className="text-center py-2 px-2 font-semibold" style={{ color: readable.body }}>{p.spoints || 0}</td>
                  <td className="text-center py-2 px-2">{p.sreboundstotal || 0}</td>
                  <td className="text-center py-2 px-2">{p.sassists || 0}</td>
                  <td className="text-center py-2 px-2 text-slate-500">{p.ssteals || 0}</td>
                  <td className="text-center py-2 px-2 text-slate-500">{p.sblocks || 0}</td>
                  <td className="text-center py-2 px-2 text-slate-500">{p.sturnovers || 0}</td>
                  <td className="text-center py-2 px-2 text-slate-500 whitespace-nowrap">{p.sfieldgoalsmade || 0}/{p.sfieldgoalsattempted || 0}</td>
                  <td className="text-center py-2 px-2 text-slate-500 whitespace-nowrap">{p.sthreepointersmade || 0}/{p.sthreepointersattempted || 0}</td>
                  <td className="text-center py-2 px-2 text-slate-500 whitespace-nowrap">{p.sfreethrowsmade || 0}/{p.sfreethrowsattempted || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-slate-500 text-center italic">No player stats available</p>
      )}
    </div>
  );

  return (
    <div className="space-y-0 animate-fade-in-up">
      {/* Back + Copy link bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 text-slate-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
          title="Copy shareable link"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <LinkIcon className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden shadow-lg border border-orange-100 dark:border-neutral-800">
        {/* Hero header — matches GamePage */}
        <div className="bg-gradient-to-r from-orange-100 via-orange-50 to-orange-100 dark:from-neutral-800 dark:via-neutral-850 dark:to-neutral-800 p-6 md:p-8 border-b border-orange-200 dark:border-neutral-700">
          <div className="flex justify-center mb-4">
            {getStatusBadge(status)}
          </div>

          <div className="flex items-center justify-between gap-2 md:gap-8">
            {/* Home team */}
            <div className="flex-1 text-center min-w-0">
              <div className="flex justify-center mb-2 md:mb-3">
                {leagueId
                  ? <TeamLogo teamName={hometeam} leagueId={leagueId} size="md" className="md:w-20 md:h-20" />
                  : <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-neutral-700 flex items-center justify-center text-lg font-bold text-orange-500">{getTeamAbbr(hometeam)}</div>
                }
              </div>
              <h2 className="text-sm md:text-xl font-bold text-slate-800 dark:text-white truncate hidden md:block">{hometeam}</h2>
              <h2 className="text-base font-bold text-slate-800 dark:text-white md:hidden">{getTeamAbbr(hometeam)}</h2>
              <span className="text-xs mt-0.5 block" style={{ color: brandColor }}>HOME</span>
            </div>

            {/* Score */}
            <div className="flex flex-col items-center flex-shrink-0">
              {isGamePlayed ? (
                <div className="flex items-center gap-2 md:gap-4">
                  <span className="text-3xl md:text-6xl font-bold text-slate-800 dark:text-white">{homeScore}</span>
                  <span className="text-xl md:text-2xl text-slate-400">-</span>
                  <span className="text-3xl md:text-6xl font-bold text-slate-800 dark:text-white">{awayScore}</span>
                </div>
              ) : (
                <div className="text-xl md:text-3xl font-bold" style={{ color: brandColor }}>VS</div>
              )}
            </div>

            {/* Away team */}
            <div className="flex-1 text-center min-w-0">
              <div className="flex justify-center mb-2 md:mb-3">
                {leagueId
                  ? <TeamLogo teamName={awayteam} leagueId={leagueId} size="md" className="md:w-20 md:h-20" />
                  : <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-neutral-700 flex items-center justify-center text-lg font-bold text-blue-500">{getTeamAbbr(awayteam)}</div>
                }
              </div>
              <h2 className="text-sm md:text-xl font-bold text-slate-800 dark:text-white truncate hidden md:block">{awayteam}</h2>
              <h2 className="text-base font-bold text-slate-800 dark:text-white md:hidden">{getTeamAbbr(awayteam)}</h2>
              <span className="text-xs mt-0.5 block" style={{ color: brandColor }}>AWAY</span>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap justify-center gap-4 mt-6 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>{formatTime(date)}</span>
            </div>
            {competitionName && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>{competitionName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="p-4 md:p-6">
          {isGamePlayed ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-5 bg-orange-100 dark:bg-neutral-800 mb-4">
                {(["game", "boxscore", "teamstats", "shots", "feed"] as const).map((v) => (
                  <TabsTrigger
                    key={v}
                    value={v}
                    className="data-[state=active]:text-white text-xs md:text-sm"
                    style={activeTab === v ? tabActiveStyle : {}}
                  >
                    {v === "game" ? "Game" : v === "boxscore" ? "Box Score" : v === "teamstats" ? "Team Stats" : v === "shots" ? "Shots" : "Feed"}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* GAME TAB */}
              <TabsContent value="game" className="space-y-4">
                {/* Quarter scores */}
                {quarterScores.length > 0 && (
                  <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-orange-100 dark:border-neutral-700">
                    <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 uppercase tracking-wide">Quarter Scores</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-500 dark:text-slate-400 border-b border-orange-100 dark:border-neutral-700">
                          <th className="text-left py-2 px-2 font-medium">Team</th>
                          {quarterScores.map((q) => (
                            <th key={q.p} className="text-center py-2 px-2 font-medium">{q.p <= 4 ? `Q${q.p}` : `OT${q.p - 4}`}</th>
                          ))}
                          <th className="text-center py-2 px-2 font-semibold">T</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-800 dark:text-slate-200">
                        {([{ team: hometeam, side: "home" as const }, { team: awayteam, side: "away" as const }]).map(({ team, side }) => {
                          const tot = quarterScores.reduce((s, q) => s + (side === "home" ? q.home : q.away), 0);
                          const oppTot = quarterScores.reduce((s, q) => s + (side === "home" ? q.away : q.home), 0);
                          return (
                            <tr key={side} className={side === "home" ? "border-b border-orange-50 dark:border-neutral-700" : ""}>
                              <td className="py-2 px-2 font-medium flex items-center gap-2">
                                {leagueId && <TeamLogo teamName={team} leagueId={leagueId} size="sm" />}
                                <span className="hidden sm:inline">{team}</span>
                              </td>
                              {quarterScores.map((q) => {
                                const val = side === "home" ? q.home : q.away;
                                const opp = side === "home" ? q.away : q.home;
                                return (
                                  <td key={q.p} className={`text-center py-2 px-2 ${val > opp ? "font-bold" : ""}`}
                                    style={val > opp ? { color: brandColor } : {}}>
                                    {val}
                                  </td>
                                );
                              })}
                              <td className={`text-center py-2 px-2 font-bold ${tot > oppTot ? "" : ""}`}
                                style={tot > oppTot ? { color: brandColor } : {}}>
                                {tot}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Team comparison bars */}
                {hasTeamStats && (
                  <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-orange-100 dark:border-neutral-700">
                    <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 uppercase tracking-wide">Team Comparison</h3>
                    <div className="space-y-3">
                      {[
                        { label: "Points", home: homeTeamStats!.tot_spoints, away: awayTeamStats!.tot_spoints },
                        { label: "Rebounds", home: homeTeamStats!.tot_sreboundstotal, away: awayTeamStats!.tot_sreboundstotal },
                        { label: "Assists", home: homeTeamStats!.tot_sassists, away: awayTeamStats!.tot_sassists },
                        { label: "Steals", home: homeTeamStats!.tot_ssteals, away: awayTeamStats!.tot_ssteals },
                        { label: "Turnovers", home: homeTeamStats!.tot_sturnovers, away: awayTeamStats!.tot_sturnovers },
                      ].map((s) => {
                        const total = s.home + s.away;
                        const homePct = total > 0 ? (s.home / total) * 100 : 50;
                        return (
                          <div key={s.label}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-semibold text-slate-800 dark:text-white">{s.home}</span>
                              <span className="text-slate-500 dark:text-slate-400 text-xs">{s.label}</span>
                              <span className="font-semibold text-slate-800 dark:text-white">{s.away}</span>
                            </div>
                            <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-neutral-700">
                              <div className="transition-all duration-500" style={{ width: `${homePct}%`, backgroundColor: brandColor }} />
                              <div className="bg-blue-500 transition-all duration-500" style={{ width: `${100 - homePct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Shooting */}
                {hasTeamStats && (
                  <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-orange-100 dark:border-neutral-700">
                    <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 uppercase tracking-wide">Shooting</h3>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="font-semibold truncate" style={{ color: brandColor }}>{hometeam}</div>
                      <div />
                      <div className="font-semibold truncate" style={{ color: brandColor }}>{awayteam}</div>

                      <div className="text-slate-800 dark:text-white font-medium">{homeTeamStats!.tot_sfieldgoalsmade}/{homeTeamStats!.tot_sfieldgoalsattempted}</div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs">FG</div>
                      <div className="text-slate-800 dark:text-white font-medium">{awayTeamStats!.tot_sfieldgoalsmade}/{awayTeamStats!.tot_sfieldgoalsattempted}</div>

                      <div className="text-slate-800 dark:text-white font-medium">{homeTeamStats!.tot_sthreepointersmade}/{homeTeamStats!.tot_sthreepointersattempted}</div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs">3PT</div>
                      <div className="text-slate-800 dark:text-white font-medium">{awayTeamStats!.tot_sthreepointersmade}/{awayTeamStats!.tot_sthreepointersattempted}</div>

                      <div className="text-slate-800 dark:text-white font-medium">{homeTeamStats!.tot_sfreethrowsmade}/{homeTeamStats!.tot_sfreethrowsattempted}</div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs">FT</div>
                      <div className="text-slate-800 dark:text-white font-medium">{awayTeamStats!.tot_sfreethrowsmade}/{awayTeamStats!.tot_sfreethrowsattempted}</div>

                      <div className="text-slate-800 dark:text-white font-medium">
                        {homeTeamStats!.tot_sfieldgoalsattempted > 0 ? ((homeTeamStats!.tot_sfieldgoalsmade / homeTeamStats!.tot_sfieldgoalsattempted) * 100).toFixed(1) : "0.0"}%
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs">FG%</div>
                      <div className="text-slate-800 dark:text-white font-medium">
                        {awayTeamStats!.tot_sfieldgoalsattempted > 0 ? ((awayTeamStats!.tot_sfieldgoalsmade / awayTeamStats!.tot_sfieldgoalsattempted) * 100).toFixed(1) : "0.0"}%
                      </div>
                    </div>
                  </div>
                )}

                {/* Top scorers */}
                {(homePlayerStats.length > 0 || awayPlayerStats.length > 0) && (
                  <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-orange-100 dark:border-neutral-700">
                    <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 uppercase tracking-wide">Top Scorers</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[{ team: hometeam, players: homePlayerStats }, { team: awayteam, players: awayPlayerStats }].map(({ team, players }) => (
                        <div key={team} className="space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            {leagueId && <TeamLogo teamName={team} leagueId={leagueId} size="sm" />}
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{team}</span>
                          </div>
                          {[...players].slice(0, 3).map((p, i) => (
                            <div key={i} className="flex justify-between items-center text-sm">
                              <span className="text-slate-700 dark:text-slate-300">{p.firstname} {p.familyname}</span>
                              <span className="font-bold" style={{ color: readable.body }}>{p.spoints || 0} PTS</span>
                            </div>
                          ))}
                          {players.length === 0 && <p className="text-xs text-slate-400 italic">No data</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!hasTeamStats && !hasStats && (
                  <div className="bg-white dark:bg-neutral-800 rounded-lg p-8 border border-orange-100 dark:border-neutral-700 text-center">
                    <p className="text-slate-500 dark:text-slate-400 italic">Game statistics will appear here once the game starts.</p>
                  </div>
                )}
              </TabsContent>

              {/* BOX SCORE TAB */}
              <TabsContent value="boxscore" className="space-y-6">
                <BoxScoreTable players={homePlayerStats} teamName={hometeam} score={homeScore} />
                <BoxScoreTable players={awayPlayerStats} teamName={awayteam} score={awayScore} />
              </TabsContent>

              {/* TEAM STATS TAB */}
              <TabsContent value="teamstats">
                <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-orange-100 dark:border-neutral-700">
                  {hasTeamStats ? (
                    <div className="grid grid-cols-3 gap-4 text-center text-slate-800 dark:text-slate-200">
                      <div className="font-semibold truncate" style={{ color: brandColor }}>{hometeam}</div>
                      <div className="text-slate-500">Stat</div>
                      <div className="font-semibold truncate" style={{ color: brandColor }}>{awayteam}</div>

                      <div className="text-2xl font-bold" style={{ color: readable.body }}>{homeTeamStats!.tot_spoints}</div>
                      <div className="text-slate-500">Points</div>
                      <div className="text-2xl font-bold" style={{ color: readable.body }}>{awayTeamStats!.tot_spoints}</div>

                      <div>{homeTeamStats!.tot_sreboundstotal}</div>
                      <div className="text-slate-500">Rebounds</div>
                      <div>{awayTeamStats!.tot_sreboundstotal}</div>

                      <div>{homeTeamStats!.tot_sassists}</div>
                      <div className="text-slate-500">Assists</div>
                      <div>{awayTeamStats!.tot_sassists}</div>

                      <div>{homeTeamStats!.tot_ssteals}</div>
                      <div className="text-slate-500">Steals</div>
                      <div>{awayTeamStats!.tot_ssteals}</div>

                      <div>{homeTeamStats!.tot_sblocks}</div>
                      <div className="text-slate-500">Blocks</div>
                      <div>{awayTeamStats!.tot_sblocks}</div>

                      <div>{homeTeamStats!.tot_sturnovers}</div>
                      <div className="text-slate-500">Turnovers</div>
                      <div>{awayTeamStats!.tot_sturnovers}</div>

                      <div className="whitespace-nowrap">{homeTeamStats!.tot_sfieldgoalsmade}/{homeTeamStats!.tot_sfieldgoalsattempted}</div>
                      <div className="text-slate-500">FG</div>
                      <div className="whitespace-nowrap">{awayTeamStats!.tot_sfieldgoalsmade}/{awayTeamStats!.tot_sfieldgoalsattempted}</div>

                      <div className="whitespace-nowrap">{homeTeamStats!.tot_sthreepointersmade}/{homeTeamStats!.tot_sthreepointersattempted}</div>
                      <div className="text-slate-500">3PT</div>
                      <div className="whitespace-nowrap">{awayTeamStats!.tot_sthreepointersmade}/{awayTeamStats!.tot_sthreepointersattempted}</div>

                      <div className="whitespace-nowrap">{homeTeamStats!.tot_sfreethrowsmade}/{homeTeamStats!.tot_sfreethrowsattempted}</div>
                      <div className="text-slate-500">FT</div>
                      <div className="whitespace-nowrap">{awayTeamStats!.tot_sfreethrowsmade}/{awayTeamStats!.tot_sfreethrowsattempted}</div>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-center italic">Team stats will appear when available</p>
                  )}
                </div>
              </TabsContent>

              {/* SHOTS TAB */}
              <TabsContent value="shots">
                <ShotChart
                  shots={shotData}
                  loading={shotLoading}
                  emptyMessage="No shot data available for this game yet."
                  filters={{
                    showPlayerFilter: true,
                    showQuarterFilter: true,
                    showTeamFilter: true,
                    showResultFilter: true,
                    teamNames: { home: hometeam, away: awayteam },
                  }}
                />
              </TabsContent>

              {/* FEED TAB */}
              <TabsContent value="feed">
                <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-orange-100 dark:border-neutral-700">
                  {eventsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                    </div>
                  ) : sortedFeedEvents.length > 0 ? (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {sortedFeedEvents.map((event) => {
                        const caption = generatePlayCaption(event as any) || event.description || `${event.action_type} ${event.sub_type || ""}`.trim();
                        const clockDisplay = event.clock?.split(":").slice(0, 2).join(":") || "";
                        return (
                          <div
                            key={event.id}
                            className={`flex items-start gap-3 p-3 rounded-lg ${
                              event.team_no === 1
                                ? "bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500"
                                : "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500"
                            }`}
                          >
                            <div className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400 w-16">
                              <div className="font-semibold">Q{event.period}</div>
                              <div>{clockDisplay}</div>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                  event.scoring ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                                  event.action_type === "foul" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                                  event.action_type === "substitution" ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" :
                                  event.action_type === "turnover" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                                  event.action_type === "rebound" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                                  "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                }`}>
                                  {(event.action_type || "").toUpperCase()}
                                </span>
                                {event.player_name && (
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{event.player_name}</span>
                                )}
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-400">{caption}</p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{event.score || "0-0"}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic text-center py-8">Play-by-play data coming soon</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="bg-orange-50 dark:bg-neutral-800/50 rounded-lg p-4 text-center border border-orange-100 dark:border-neutral-700">
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Live stats and play-by-play data will appear when the game starts.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
