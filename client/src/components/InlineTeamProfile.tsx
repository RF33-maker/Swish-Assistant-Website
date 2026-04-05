import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "@/components/TeamLogo";
import { normalizeTeamName } from "@/lib/teamUtils";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import ShotChart, { type ShotData } from "@/components/ShotChart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InlineTeamProfileProps {
  teamName: string;
  brandColor: string;
  leagueSlug: string;
  leagueId: string;
  onBack: () => void;
  onPlayerClick?: (slug: string) => void;
}

const PLAYER_STAT_COLUMNS: Record<string, { key: string; label: string }[]> = {
  Traditional: [
    { key: "spoints", label: "PTS" },
    { key: "sminutes", label: "MIN" },
    { key: "sfieldgoalsmade", label: "FGM" },
    { key: "sfieldgoalsattempted", label: "FGA" },
    { key: "sthreepointersmade", label: "3PM" },
    { key: "sthreepointersattempted", label: "3PA" },
    { key: "sfreethrowsmade", label: "FTM" },
    { key: "sfreethrowsattempted", label: "FTA" },
    { key: "sreboundstotal", label: "REB" },
    { key: "sassists", label: "AST" },
    { key: "sturnovers", label: "TO" },
    { key: "ssteals", label: "STL" },
    { key: "sblocks", label: "BLK" },
  ],
  Advanced: [
    { key: "efg_percent", label: "EFG%" },
    { key: "ts_percent", label: "TS%" },
    { key: "usage_percent", label: "USG%" },
    { key: "ast_percent", label: "AST%" },
    { key: "ast_to_ratio", label: "AST/TO" },
    { key: "oreb_percent", label: "OREB%" },
    { key: "dreb_percent", label: "DREB%" },
    { key: "reb_percent", label: "REB%" },
    { key: "tov_percent", label: "TOV%" },
    { key: "off_rating", label: "OFFRTG" },
    { key: "def_rating", label: "DEFRTG" },
    { key: "net_rating", label: "NETRTG" },
  ],
  Scoring: [
    { key: "pts_percent_2pt", label: "%PTS 2PT" },
    { key: "pts_percent_3pt", label: "%PTS 3PT" },
    { key: "pts_percent_ft", label: "%PTS FT" },
    { key: "pts_percent_pitp", label: "%PTS PITP" },
    { key: "pts_percent_fastbreak", label: "%PTS FBPS" },
  ],
};

const RATE_STATS = [
  'efg_percent', 'ts_percent', 'three_point_rate',
  'ast_percent', 'ast_to_ratio', 'oreb_percent', 'dreb_percent', 'reb_percent',
  'tov_percent', 'usage_percent', 'pie', 'off_rating', 'def_rating', 'net_rating',
  'pts_percent_2pt', 'pts_percent_3pt', 'pts_percent_ft',
  'pts_percent_midrange', 'pts_percent_pitp', 'pts_percent_fastbreak',
  'pts_percent_second_chance', 'pts_percent_off_turnovers'
];

const applyPlayerMode = (
  statKey: string, value: number, gamesPlayed: number, totalMinutes: number,
  playerMode: 'Total' | 'Per Game' | 'Per 40'
): number => {
  if (RATE_STATS.includes(statKey)) return value;
  if (statKey === 'sminutes') {
    if (playerMode === 'Total') return value;
    return gamesPlayed > 0 ? value / gamesPlayed : 0;
  }
  if (playerMode === 'Total') return value;
  if (playerMode === 'Per Game') return gamesPlayed > 0 ? value / gamesPlayed : 0;
  if (playerMode === 'Per 40') return totalMinutes > 0 ? (value / totalMinutes) * 40 : 0;
  return value;
};

export function InlineTeamProfile({ teamName, brandColor, leagueSlug, leagueId, onBack, onPlayerClick }: InlineTeamProfileProps) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'overview' | 'playerStats' | 'shotChart'>('overview');
  const [playerStatsCategory, setPlayerStatsCategory] = useState<'Traditional' | 'Advanced' | 'Scoring'>('Traditional');
  const [playerStatsView, setPlayerStatsView] = useState<'Total' | 'Per Game' | 'Per 40'>('Per Game');
  const [statsSortColumn, setStatsSortColumn] = useState<string>('PTS');
  const [statsSortDirection, setStatsSortDirection] = useState<'asc' | 'desc'>('desc');
  const [shotChartRange, setShotChartRange] = useState<string>("season");

  const normalizedTeamName = useMemo(() => normalizeTeamName(decodeURIComponent(teamName)), [teamName]);

  const { data: teamData, isLoading } = useQuery({
    queryKey: ['inline-team-profile', normalizedTeamName, leagueId],
    queryFn: async () => {
      const { data: allTeamStats, error } = await supabase
        .from("player_stats")
        .select("*, players:player_id(slug)")
        .eq("league_id", leagueId)
        .ilike("team_name", `%${normalizedTeamName}%`);

      if (error) throw error;

      const allStats = (allTeamStats || []).filter((stat: any) =>
        normalizeTeamName(stat.team_name || stat.team || '') === normalizedTeamName
      );

      const gamesByGameKey = allStats.reduce((acc: Record<string, any>, stat: any) => {
        if (!acc[stat.game_key]) {
          acc[stat.game_key] = {
            game_key: stat.game_key,
            created_at: stat.created_at,
            home_team: stat.home_team,
            away_team: stat.away_team,
            playerStats: []
          };
        }
        acc[stat.game_key].playerStats.push(stat);
        return acc;
      }, {});

      const playerIds = Array.from(new Set(allStats.map((s: any) => s.player_id).filter(Boolean)));
      const gameKeys = Object.keys(gamesByGameKey);

      const [{ data: teamStatsRows }, { data: allGamesStats }] = await Promise.all([
        supabase.from("team_stats").select("*").in("game_key", gameKeys),
        supabase.from("player_stats").select("spoints, player_id, game_key").in("game_key", gameKeys),
      ]);

      if (teamStatsRows) {
        const statsByGame: Record<string, any[]> = {};
        teamStatsRows.forEach((stat: any) => {
          if (!statsByGame[stat.game_key]) statsByGame[stat.game_key] = [];
          statsByGame[stat.game_key].push(stat);
        });
        Object.keys(statsByGame).forEach((gameKey: string) => {
          const teamsInGame = statsByGame[gameKey];
          const ourTeam = teamsInGame.find((t: any) => normalizeTeamName(t.name) === normalizedTeamName);
          const opponent = teamsInGame.find((t: any) => normalizeTeamName(t.name) !== normalizedTeamName);
          if (gamesByGameKey[gameKey] && opponent) {
            gamesByGameKey[gameKey].opponent_name = opponent.name;
            gamesByGameKey[gameKey].is_home_game = ourTeam?.side === "1";
          }
        });
      }

      const opponentStatsByGame = (allGamesStats || []).reduce((acc: Record<string, any[]>, stat: any) => {
        if (!playerIds.includes(stat.player_id)) {
          if (!acc[stat.game_key]) acc[stat.game_key] = [];
          acc[stat.game_key].push(stat);
        }
        return acc;
      }, {});

      let wins = 0, losses = 0;
      const games = Object.values(gamesByGameKey).map((gameData: any) => {
        const ourScore = gameData.playerStats.reduce((sum: number, stat: any) => sum + (stat.spoints || 0), 0);
        const opponent = gameData.opponent_name || 'Unknown';
        const isHome = gameData.is_home_game || false;
        const opponentStats = opponentStatsByGame[gameData.game_key] || [];
        const opponentScore = opponentStats.reduce((sum: number, stat: any) => sum + (stat.spoints || 0), 0);
        const isWin = ourScore > opponentScore;
        if (isWin) wins++; else losses++;
        return { totalPoints: ourScore, date: gameData.created_at, opponent, opponentScore, isWin, isHome, game_key: gameData.game_key };
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const playerStatsMap = new Map<string, any>();
      allStats.forEach((stat: any) => {
        const playerId = stat.player_id || stat.id;
        if (!playerId) return;
        const playerName = stat.full_name || stat.name || 'Unknown';
        const playerSlug = stat.players?.slug || null;
        if (!playerStatsMap.has(playerId)) {
          playerStatsMap.set(playerId, {
            id: playerId, name: playerName, slug: playerSlug,
            position: stat.position || '', games: 0, totalMinutes: 0, rawStats: [],
            totalPoints: 0, totalRebounds: 0, totalAssists: 0, totalSteals: 0, totalBlocks: 0, totalTurnovers: 0
          });
        }
        const p = playerStatsMap.get(playerId)!;
        const mins = typeof stat.sminutes === 'string' ? parseFloat(stat.sminutes) || 0 : (stat.sminutes || 0);
        if (mins > 0) {
          p.games += 1;
          p.totalMinutes += mins;
          p.rawStats.push(stat);
          p.totalPoints += stat.spoints || 0;
          p.totalRebounds += stat.sreboundstotal || 0;
          p.totalAssists += stat.sassists || 0;
          p.totalSteals += stat.ssteals || 0;
          p.totalBlocks += stat.sblocks || 0;
          p.totalTurnovers += stat.sturnovers || 0;
        }
        if (playerName.length > p.name.length) p.name = playerName;
      });

      const roster = Array.from(playerStatsMap.values())
        .filter(p => p.games > 0)
        .sort((a, b) => (b.totalPoints / b.games) - (a.totalPoints / a.games));

      const totalGames = games.length;
      const avgTeamPoints = totalGames > 0
        ? Math.round((games.reduce((s, g) => s + g.totalPoints, 0) / totalGames) * 10) / 10
        : 0;

      const statFields = [
        'spoints', 'sfieldgoalsmade', 'sfieldgoalsattempted',
        'sthreepointersmade', 'sthreepointersattempted',
        'sfreethrowsmade', 'sfreethrowsattempted',
        'sreboundsoffensive', 'sreboundsdefensive', 'sreboundstotal',
        'sassists', 'sturnovers', 'ssteals', 'sblocks', 'sfoulspersonal'
      ];
      const totals: Record<string, number> = {};
      statFields.forEach(f => { totals[f] = 0; });
      allStats.forEach((stat: any) => { statFields.forEach(f => { totals[f] += (stat[f] || 0); }); });
      const perGame = Object.fromEntries(statFields.map(f => [f, totalGames > 0 ? totals[f] / totalGames : 0]));

      return {
        name: decodeURIComponent(teamName),
        roster,
        games,
        totalGames,
        avgTeamPoints,
        wins,
        losses,
        totals,
        perGame,
        allStats,
      };
    },
    enabled: !!normalizedTeamName && !!leagueId,
  });

  const activePlayerStatColumns = useMemo(() =>
    PLAYER_STAT_COLUMNS[playerStatsCategory] || PLAYER_STAT_COLUMNS['Traditional'],
    [playerStatsCategory]
  );

  const sortedRoster = useMemo(() => {
    if (!teamData?.roster) return [];
    return [...teamData.roster].sort((a: any, b: any) => {
      let valueA: number, valueB: number;
      if (statsSortColumn === 'GP') {
        valueA = a.games || 0; valueB = b.games || 0;
      } else {
        const column = activePlayerStatColumns.find((col: any) => col.label === statsSortColumn);
        if (column) {
          const isRateStat = RATE_STATS.includes(column.key);
          const aggA = a.rawStats.reduce((acc: number, stat: any) => {
            const v = stat[column.key];
            return acc + (typeof v === 'number' ? v : (typeof v === 'string' && !isNaN(parseFloat(v)) ? parseFloat(v) : 0));
          }, 0);
          const aggB = b.rawStats.reduce((acc: number, stat: any) => {
            const v = stat[column.key];
            return acc + (typeof v === 'number' ? v : (typeof v === 'string' && !isNaN(parseFloat(v)) ? parseFloat(v) : 0));
          }, 0);
          const baseA = isRateStat && a.rawStats.length > 0 ? aggA / a.rawStats.length : aggA;
          const baseB = isRateStat && b.rawStats.length > 0 ? aggB / b.rawStats.length : aggB;
          valueA = applyPlayerMode(column.key, baseA, a.games, a.totalMinutes || 0, playerStatsView);
          valueB = applyPlayerMode(column.key, baseB, b.games, b.totalMinutes || 0, playerStatsView);
        } else { valueA = 0; valueB = 0; }
      }
      return statsSortDirection === 'desc' ? valueB - valueA : valueA - valueB;
    });
  }, [teamData?.roster, statsSortColumn, statsSortDirection, playerStatsView, activePlayerStatColumns]);

  const selectedGames = useMemo(() => {
    if (!teamData?.games) return [];
    const sorted = teamData.games.filter((g: any) => g.game_key);
    if (shotChartRange === "last5") return sorted.slice(0, 5);
    if (shotChartRange === "last10") return sorted.slice(0, 10);
    if (shotChartRange.startsWith("game:")) {
      const gk = shotChartRange.replace("game:", "");
      return sorted.filter((g: any) => g.game_key === gk);
    }
    return sorted;
  }, [teamData?.games, shotChartRange]);

  const gameKeys = useMemo(() => selectedGames.map((g: any) => g.game_key).filter(Boolean) as string[], [selectedGames]);
  const teamNoByGameKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of selectedGames) { if (g.game_key) map.set(g.game_key, g.isHome ? 1 : 2); }
    return map;
  }, [selectedGames]);

  const { data: shotEvents, isLoading: shotsLoading } = useQuery({
    queryKey: ['inline-team-shot-chart', normalizedTeamName, leagueId, gameKeys],
    queryFn: async () => {
      if (gameKeys.length === 0) return [];
      const { data, error } = await supabase
        .from('shot_chart')
        .select('id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key')
        .in('game_key', gameKeys);
      if (error) return [];
      return ((data || []) as ShotData[]).filter(e => {
        if (!e.game_key || e.team_no == null) return false;
        const expectedTeamNo = teamNoByGameKey.get(e.game_key);
        return expectedTeamNo != null && e.team_no === expectedTeamNo;
      });
    },
    enabled: gameKeys.length > 0 && activeTab === 'shotChart',
  });

  const cTd = "px-2 py-1.5 text-center text-xs whitespace-nowrap";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: brandColor }} />
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Team not found</p>
        <button onClick={onBack} className="mt-3 text-sm font-medium hover:underline" style={{ color: brandColor }}>
          <ArrowLeft className="h-4 w-4 inline mr-1" /> Go back
        </button>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-4 md:space-y-5 animate-fade-in-up">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:underline"
        style={{ color: brandColor }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="relative rounded-xl overflow-hidden shadow-lg">
        <div className="relative min-h-[160px] md:min-h-[200px]" style={{ background: `linear-gradient(135deg, ${brandColor}22 0%, ${brandColor}44 100%)` }}>
          <div className="relative z-10 p-5 md:p-8">
            <div className="flex items-center gap-4 mb-3">
              <TeamLogo teamName={teamData.name} leagueId={leagueId} size="xl" className="flex-shrink-0" />
              <div>
                <h1 className="text-xl md:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white leading-tight">
                  {teamData.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white/80 dark:bg-neutral-800/80 text-slate-700 dark:text-slate-300 backdrop-blur-sm">
                    {teamData.roster.length} Players
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm" style={{ color: brandColor }}>
                    {teamData.wins}-{teamData.losses}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white/80 dark:bg-neutral-800/80 text-slate-700 dark:text-slate-300 backdrop-blur-sm">
                    {teamData.avgTeamPoints} PPG
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-700 w-fit">
        {(["overview", "playerStats", "shotChart"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium transition-colors capitalize ${
              activeTab === tab ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-neutral-800'
            }`}
            style={activeTab === tab ? { backgroundColor: brandColor } : {}}
          >
            {tab === 'playerStats' ? 'Player Stats' : tab === 'shotChart' ? 'Shot Chart' : 'Overview'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 block">Team Averages</span>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
              {[
                { value: teamData.perGame.spoints || 0, label: "PTS" },
                { value: teamData.perGame.sreboundstotal || 0, label: "REB" },
                { value: teamData.perGame.sassists || 0, label: "AST" },
                { value: teamData.perGame.ssteals || 0, label: "STL" },
                { value: teamData.perGame.sblocks || 0, label: "BLK" },
                { value: teamData.perGame.sturnovers || 0, label: "TO" },
              ].map((stat, i) => (
                <div key={i} className="text-center py-2">
                  <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{stat.label}</div>
                  <div className="text-xl md:text-2xl font-black tabular-nums" style={{ color: brandColor }}>{stat.value.toFixed(1)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 block">Shooting</span>
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: teamData.totals.sfieldgoalsattempted > 0 ? (teamData.totals.sfieldgoalsmade / teamData.totals.sfieldgoalsattempted) * 100 : 0, label: "FG%" },
                { value: teamData.totals.sthreepointersattempted > 0 ? (teamData.totals.sthreepointersmade / teamData.totals.sthreepointersattempted) * 100 : 0, label: "3PT%" },
                { value: teamData.totals.sfreethrowsattempted > 0 ? (teamData.totals.sfreethrowsmade / teamData.totals.sfreethrowsattempted) * 100 : 0, label: "FT%" },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{stat.label}</div>
                  <div className="text-xl md:text-2xl font-black tabular-nums" style={{ color: brandColor }}>{stat.value.toFixed(1)}%</div>
                  <div className="mt-1.5 bg-gray-100 dark:bg-neutral-700 h-1 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(stat.value, 100)}%`, backgroundColor: brandColor }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
              <span className="text-base md:text-lg font-bold text-slate-800 dark:text-white">Roster</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-800 text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wider">
                    <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap sticky left-0 bg-white dark:bg-neutral-900 z-10">Player</th>
                    <th className="px-2 py-1.5 text-center font-semibold">GP</th>
                    <th className="px-2 py-1.5 text-center font-semibold">PTS</th>
                    <th className="px-2 py-1.5 text-center font-semibold">REB</th>
                    <th className="px-2 py-1.5 text-center font-semibold">AST</th>
                    <th className="px-2 py-1.5 text-center font-semibold">STL</th>
                    <th className="px-2 py-1.5 text-center font-semibold">BLK</th>
                    <th className="px-2 py-1.5 text-center font-semibold">TO</th>
                  </tr>
                </thead>
                <tbody>
                  {teamData.roster.map((player: any, idx: number) => (
                    <tr
                      key={player.id}
                      className={`border-b border-gray-50 dark:border-neutral-800/50 text-slate-700 dark:text-slate-300 ${idx % 2 === 1 ? 'bg-gray-50/50 dark:bg-neutral-800/30' : ''} ${player.slug ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700' : ''}`}
                      onClick={() => {
                        if (player.slug && onPlayerClick) onPlayerClick(player.slug);
                        else if (player.slug) navigate(`/player/${player.slug}`);
                      }}
                    >
                      <td className="px-2 py-1.5 text-xs font-medium whitespace-nowrap sticky left-0 bg-white dark:bg-neutral-900 z-10">{player.name}</td>
                      <td className={cTd}>{player.games}</td>
                      <td className={cTd}>{(player.totalPoints / player.games).toFixed(1)}</td>
                      <td className={cTd}>{(player.totalRebounds / player.games).toFixed(1)}</td>
                      <td className={cTd}>{(player.totalAssists / player.games).toFixed(1)}</td>
                      <td className={cTd}>{(player.totalSteals / player.games).toFixed(1)}</td>
                      <td className={cTd}>{(player.totalBlocks / player.games).toFixed(1)}</td>
                      <td className={cTd}>{(player.totalTurnovers / player.games).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
              <span className="text-base md:text-lg font-bold text-slate-800 dark:text-white">Recent Games</span>
            </div>
            {teamData.games.length === 0 ? (
              <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-sm">No games found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-neutral-800 text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wider">
                      <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Date</th>
                      <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">OPP</th>
                      <th className="px-2 py-1.5 text-center font-semibold">W/L</th>
                      <th className="px-2 py-1.5 text-center font-semibold">PTS</th>
                      <th className="px-2 py-1.5 text-center font-semibold">OPP PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamData.games.map((game: any, idx: number) => (
                      <tr key={idx} className={`border-b border-gray-50 dark:border-neutral-800/50 text-slate-700 dark:text-slate-300 ${idx % 2 === 1 ? 'bg-gray-50/50 dark:bg-neutral-800/30' : ''}`}>
                        <td className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(game.date)}</td>
                        <td className="px-2 py-1.5 text-xs font-medium whitespace-nowrap">{game.isHome ? 'vs' : '@'} {game.opponent}</td>
                        <td className="px-2 py-1.5 text-xs text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${game.isWin ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'}`}>
                            {game.isWin ? 'W' : 'L'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-center font-bold text-slate-900 dark:text-white">{game.totalPoints}</td>
                        <td className="px-2 py-1.5 text-xs text-center">{game.opponentScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'playerStats' && (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 overflow-hidden">
          <div className="p-4 pb-0">
            <span className="text-base md:text-lg font-bold text-slate-800 dark:text-white">Player Statistics</span>
            <div className="flex flex-col md:flex-row gap-3 mt-3">
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Category</label>
                <Select value={playerStatsCategory} onValueChange={(v) => setPlayerStatsCategory(v as any)}>
                  <SelectTrigger className="w-full h-8 text-xs bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
                    <SelectItem value="Traditional">Traditional</SelectItem>
                    <SelectItem value="Advanced">Advanced</SelectItem>
                    <SelectItem value="Scoring">Scoring</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Mode</label>
                <Select value={playerStatsView} onValueChange={(v) => setPlayerStatsView(v as any)}>
                  <SelectTrigger className="w-full h-8 text-xs bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
                    <SelectItem value="Per Game">Per Game</SelectItem>
                    <SelectItem value="Total">Total</SelectItem>
                    <SelectItem value="Per 40">Per 40</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-y border-gray-100 dark:border-neutral-800 text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wider">
                  <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap sticky left-0 bg-white dark:bg-neutral-900 z-10">Player</th>
                  <th
                    className={`px-2 py-1.5 text-center font-semibold cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800 ${statsSortColumn === 'GP' ? '' : ''}`}
                    style={statsSortColumn === 'GP' ? { color: brandColor } : {}}
                    onClick={() => { if (statsSortColumn === 'GP') setStatsSortDirection(d => d === 'desc' ? 'asc' : 'desc'); else { setStatsSortColumn('GP'); setStatsSortDirection('desc'); } }}
                  >
                    GP {statsSortColumn === 'GP' && <span className="text-[8px]">{statsSortDirection === 'desc' ? '▼' : '▲'}</span>}
                  </th>
                  {activePlayerStatColumns.map((col) => (
                    <th
                      key={col.key}
                      className="px-2 py-1.5 text-center font-semibold cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800"
                      style={statsSortColumn === col.label ? { color: brandColor } : {}}
                      onClick={() => { if (statsSortColumn === col.label) setStatsSortDirection(d => d === 'desc' ? 'asc' : 'desc'); else { setStatsSortColumn(col.label); setStatsSortDirection('desc'); } }}
                    >
                      {col.label} {statsSortColumn === col.label && <span className="text-[8px]">{statsSortDirection === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRoster.map((player: any, idx: number) => (
                  <tr
                    key={player.id}
                    className={`border-b border-gray-50 dark:border-neutral-800/50 text-slate-700 dark:text-slate-300 ${idx % 2 === 1 ? 'bg-gray-50/50 dark:bg-neutral-800/30' : ''} ${player.slug ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700' : ''}`}
                    onClick={() => {
                      if (player.slug && onPlayerClick) onPlayerClick(player.slug);
                      else if (player.slug) navigate(`/player/${player.slug}`);
                    }}
                  >
                    <td className="px-2 py-1.5 text-xs font-medium whitespace-nowrap sticky left-0 bg-white dark:bg-neutral-900 z-10">{player.name}</td>
                    <td className={cTd}>{player.games}</td>
                    {activePlayerStatColumns.map((column) => {
                      const isRateStat = RATE_STATS.includes(column.key);
                      const aggregatedValue = player.rawStats.reduce((acc: number, stat: any) => {
                        const v = stat[column.key];
                        return acc + (typeof v === 'number' ? v : (typeof v === 'string' && !isNaN(parseFloat(v)) ? parseFloat(v) : 0));
                      }, 0);
                      const baseValue = isRateStat && player.rawStats.length > 0 ? aggregatedValue / player.rawStats.length : aggregatedValue;
                      const value = applyPlayerMode(column.key, baseValue, player.games, player.totalMinutes || 0, playerStatsView);
                      return (
                        <td key={column.key} className={cTd}>{value === 0 ? '0.0' : value.toFixed(1)}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'shotChart' && (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Shot Chart</span>
            <Select value={shotChartRange} onValueChange={setShotChartRange}>
              <SelectTrigger className="w-full md:w-48 h-8 text-sm border-gray-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
                <SelectItem value="season">Full Season</SelectItem>
                <SelectItem value="last10">Last 10 Games</SelectItem>
                <SelectItem value="last5">Last 5 Games</SelectItem>
                {teamData.games.filter((g: any) => g.game_key).map((g: any) => (
                  <SelectItem key={g.game_key} value={`game:${g.game_key}`}>
                    vs {g.opponent} ({formatDate(g.date)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ShotChart
            shots={shotEvents || []}
            loading={shotsLoading}
            compact
            emptyMessage="No shot data available."
            filters={{ showPlayerFilter: true, showQuarterFilter: true, showResultFilter: true }}
          />
        </div>
      )}
    </div>
  );
}