import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search } from "lucide-react";
import { normalizeTeamName } from "@/lib/teamUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface PlayerComparisonProps {
  leagueId: string;
  allPlayers: any[];
}

const areSimilarNames = (name1: string, name2: string): boolean => {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  if (n1 === n2) return true;
  const maxLength = Math.max(n1.length, n2.length);
  if (Math.abs(n1.length - n2.length) <= 2 && maxLength > 5) {
    let differences = 0;
    for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
      if (n1[i] !== n2[i]) differences++;
      if (differences > 2) return false;
    }
    return true;
  }
  return false;
};

const getStatName = (stat: any): string =>
  (stat.name || stat.full_name || `${stat.firstname || ''} ${stat.familyname || ''}`.trim()).toLowerCase().trim();

function aggregatePlayerStats(stats: any[], displayName: string, teamName: string) {
  const games = stats.length;
  if (games === 0) return null;

  let totalPoints = 0, totalRebounds = 0, totalAssists = 0, totalSteals = 0;
  let totalBlocks = 0, totalTurnovers = 0, totalFGM = 0, totalFGA = 0;
  let total3PM = 0, total3PA = 0, total2PM = 0, total2PA = 0;
  let totalFTM = 0, totalFTA = 0, totalMinutes = 0, totalPersonalFouls = 0;
  let totalOReb = 0, totalDReb = 0, totalPlusMinus = 0;

  let sumEfgPercent = 0, sumTsPercent = 0, sumThreePtRate = 0;
  let sumAstPercent = 0, sumAstToRatio = 0, sumOrebPercent = 0;
  let sumDrebPercent = 0, sumRebPercent = 0, sumTovPercent = 0;
  let sumUsagePercent = 0, sumPie = 0, sumOffRating = 0;
  let sumDefRating = 0, sumNetRating = 0;

  let sumPts2pt = 0, sumPts3pt = 0, sumPtsFt = 0, sumPtsMidrange = 0;
  let sumPtsPitp = 0, sumPtsFb = 0, sumPts2ndCh = 0, sumPtsOffTo = 0;

  stats.forEach((stat: any) => {
    totalPoints += stat.spoints || 0;
    totalRebounds += stat.sreboundstotal || 0;
    totalAssists += stat.sassists || 0;
    totalSteals += stat.ssteals || 0;
    totalBlocks += stat.sblocks || 0;
    totalTurnovers += stat.sturnovers || 0;
    totalFGM += stat.sfieldgoalsmade || 0;
    totalFGA += stat.sfieldgoalsattempted || 0;
    total3PM += stat.sthreepointersmade || 0;
    total3PA += stat.sthreepointersattempted || 0;
    total2PM += stat.stwopointersmade || 0;
    total2PA += stat.stwopointersattempted || 0;
    totalFTM += stat.sfreethrowsmade || 0;
    totalFTA += stat.sfreethrowsattempted || 0;
    totalPersonalFouls += stat.sfoulspersonal || 0;
    totalOReb += stat.sreboundsoffensive || 0;
    totalDReb += stat.sreboundsdefensive || 0;
    totalPlusMinus += stat.splusminus || 0;

    const minutesParts = stat.sminutes?.split(':');
    if (minutesParts && minutesParts.length === 2) {
      const minutes = parseInt(minutesParts[0]) + parseInt(minutesParts[1]) / 60;
      totalMinutes += minutes;
    }

    sumEfgPercent += stat.efg_percent || 0;
    sumTsPercent += stat.ts_percent || 0;
    sumThreePtRate += stat.three_point_rate || 0;
    sumAstPercent += stat.ast_percent || 0;
    sumAstToRatio += stat.ast_to_ratio || 0;
    sumOrebPercent += stat.oreb_percent || 0;
    sumDrebPercent += stat.dreb_percent || 0;
    sumRebPercent += stat.reb_percent || 0;
    sumTovPercent += stat.tov_percent || 0;
    sumUsagePercent += stat.usage_percent || 0;
    sumPie += stat.pie || 0;
    sumOffRating += stat.off_rating || 0;
    sumDefRating += stat.def_rating || 0;
    sumNetRating += stat.net_rating || 0;

    sumPts2pt += stat.pts_percent_2pt || 0;
    sumPts3pt += stat.pts_percent_3pt || 0;
    sumPtsFt += stat.pts_percent_ft || 0;
    sumPtsMidrange += stat.pts_percent_midrange || 0;
    sumPtsPitp += stat.pts_percent_pitp || 0;
    sumPtsFb += stat.pts_percent_fastbreak || 0;
    sumPts2ndCh += stat.pts_percent_second_chance || 0;
    sumPtsOffTo += stat.pts_percent_off_turnovers || 0;
  });

  return {
    name: displayName,
    team: teamName,
    games,
    ppg: (totalPoints / games).toFixed(1),
    rpg: (totalRebounds / games).toFixed(1),
    apg: (totalAssists / games).toFixed(1),
    spg: (totalSteals / games).toFixed(1),
    bpg: (totalBlocks / games).toFixed(1),
    tpg: (totalTurnovers / games).toFixed(1),
    mpg: (totalMinutes / games).toFixed(1),
    fpg: (totalPersonalFouls / games).toFixed(1),
    orpg: (totalOReb / games).toFixed(1),
    drpg: (totalDReb / games).toFixed(1),
    plusMinus: (totalPlusMinus / games).toFixed(1),
    fgPercentage: totalFGA > 0 ? ((totalFGM / totalFGA) * 100).toFixed(1) : '0.0',
    twoPercentage: total2PA > 0 ? ((total2PM / total2PA) * 100).toFixed(1) : '0.0',
    threePercentage: total3PA > 0 ? ((total3PM / total3PA) * 100).toFixed(1) : '0.0',
    ftPercentage: totalFTA > 0 ? ((totalFTM / totalFTA) * 100).toFixed(1) : '0.0',
    efgPercent: (sumEfgPercent / games).toFixed(1),
    tsPercent: (sumTsPercent / games).toFixed(1),
    threePtRate: (sumThreePtRate / games).toFixed(1),
    astPercent: (sumAstPercent / games).toFixed(1),
    astToRatio: (sumAstToRatio / games).toFixed(2),
    orebPercent: (sumOrebPercent / games).toFixed(1),
    drebPercent: (sumDrebPercent / games).toFixed(1),
    rebPercent: (sumRebPercent / games).toFixed(1),
    tovPercent: (sumTovPercent / games).toFixed(1),
    usagePercent: (sumUsagePercent / games).toFixed(1),
    pie: (sumPie / games).toFixed(1),
    offRating: (sumOffRating / games).toFixed(1),
    defRating: (sumDefRating / games).toFixed(1),
    netRating: (sumNetRating / games).toFixed(1),
    pts2ptPercent: (sumPts2pt / games).toFixed(1),
    pts3ptPercent: (sumPts3pt / games).toFixed(1),
    ptsFtPercent: (sumPtsFt / games).toFixed(1),
    ptsMidrangePercent: (sumPtsMidrange / games).toFixed(1),
    ptsPitpPercent: (sumPtsPitp / games).toFixed(1),
    ptsFbPercent: (sumPtsFb / games).toFixed(1),
    pts2ndChPercent: (sumPts2ndCh / games).toFixed(1),
    ptsOffToPercent: (sumPtsOffTo / games).toFixed(1),
  };
}

function getPlayerComparisonRows(
  category: 'Traditional' | 'Advanced' | 'Scoring' | 'Misc',
  player1Stats: any,
  player2Stats: any
) {
  if (!player1Stats || !player2Stats) return [];
  switch (category) {
    case 'Traditional':
      return [
        { label: 'PPG', value1: player1Stats.ppg, value2: player2Stats.ppg },
        { label: 'RPG', value1: player1Stats.rpg, value2: player2Stats.rpg },
        { label: 'ORPG', value1: player1Stats.orpg, value2: player2Stats.orpg },
        { label: 'DRPG', value1: player1Stats.drpg, value2: player2Stats.drpg },
        { label: 'APG', value1: player1Stats.apg, value2: player2Stats.apg },
        { label: 'SPG', value1: player1Stats.spg, value2: player2Stats.spg },
        { label: 'BPG', value1: player1Stats.bpg, value2: player2Stats.bpg },
        { label: 'TPG', value1: player1Stats.tpg, value2: player2Stats.tpg, lowerIsBetter: true },
        { label: 'FPG', value1: player1Stats.fpg, value2: player2Stats.fpg, lowerIsBetter: true },
        { label: '+/-', value1: player1Stats.plusMinus, value2: player2Stats.plusMinus },
        { label: 'MPG', value1: player1Stats.mpg, value2: player2Stats.mpg },
        { label: 'FG%', value1: `${player1Stats.fgPercentage}%`, value2: `${player2Stats.fgPercentage}%` },
        { label: '2P%', value1: `${player1Stats.twoPercentage}%`, value2: `${player2Stats.twoPercentage}%` },
        { label: '3P%', value1: `${player1Stats.threePercentage}%`, value2: `${player2Stats.threePercentage}%` },
        { label: 'FT%', value1: `${player1Stats.ftPercentage}%`, value2: `${player2Stats.ftPercentage}%` },
      ];
    case 'Advanced':
      return [
        { label: 'eFG%', value1: `${player1Stats.efgPercent}%`, value2: `${player2Stats.efgPercent}%` },
        { label: 'TS%', value1: `${player1Stats.tsPercent}%`, value2: `${player2Stats.tsPercent}%` },
        { label: '3PT Rate', value1: `${player1Stats.threePtRate}%`, value2: `${player2Stats.threePtRate}%` },
        { label: 'AST%', value1: `${player1Stats.astPercent}%`, value2: `${player2Stats.astPercent}%` },
        { label: 'AST/TO', value1: player1Stats.astToRatio, value2: player2Stats.astToRatio },
        { label: 'OREB%', value1: `${player1Stats.orebPercent}%`, value2: `${player2Stats.orebPercent}%` },
        { label: 'DREB%', value1: `${player1Stats.drebPercent}%`, value2: `${player2Stats.drebPercent}%` },
        { label: 'REB%', value1: `${player1Stats.rebPercent}%`, value2: `${player2Stats.rebPercent}%` },
        { label: 'TOV%', value1: `${player1Stats.tovPercent}%`, value2: `${player2Stats.tovPercent}%`, lowerIsBetter: true },
        { label: 'USG%', value1: `${player1Stats.usagePercent}%`, value2: `${player2Stats.usagePercent}%` },
        { label: 'PIE', value1: `${player1Stats.pie}%`, value2: `${player2Stats.pie}%` },
        { label: 'OFF RTG', value1: player1Stats.offRating, value2: player2Stats.offRating },
        { label: 'DEF RTG', value1: player1Stats.defRating, value2: player2Stats.defRating, lowerIsBetter: true },
        { label: 'NET RTG', value1: player1Stats.netRating, value2: player2Stats.netRating },
      ];
    case 'Scoring':
      return [
        { label: 'PPG', value1: player1Stats.ppg, value2: player2Stats.ppg },
        { label: '%PTS 2PT', value1: `${player1Stats.pts2ptPercent}%`, value2: `${player2Stats.pts2ptPercent}%` },
        { label: '%PTS 3PT', value1: `${player1Stats.pts3ptPercent}%`, value2: `${player2Stats.pts3ptPercent}%` },
        { label: '%PTS FT', value1: `${player1Stats.ptsFtPercent}%`, value2: `${player2Stats.ptsFtPercent}%` },
        { label: '%PTS Midrange', value1: `${player1Stats.ptsMidrangePercent}%`, value2: `${player2Stats.ptsMidrangePercent}%` },
        { label: '%PTS PITP', value1: `${player1Stats.ptsPitpPercent}%`, value2: `${player2Stats.ptsPitpPercent}%` },
        { label: '%PTS FB', value1: `${player1Stats.ptsFbPercent}%`, value2: `${player2Stats.ptsFbPercent}%` },
        { label: '%PTS 2nd Ch', value1: `${player1Stats.pts2ndChPercent}%`, value2: `${player2Stats.pts2ndChPercent}%` },
        { label: '%PTS Off TO', value1: `${player1Stats.ptsOffToPercent}%`, value2: `${player2Stats.ptsOffToPercent}%` },
      ];
    case 'Misc':
      return [
        { label: 'PPG', value1: player1Stats.ppg, value2: player2Stats.ppg },
        { label: 'RPG', value1: player1Stats.rpg, value2: player2Stats.rpg },
        { label: 'APG', value1: player1Stats.apg, value2: player2Stats.apg },
        { label: 'MPG', value1: player1Stats.mpg, value2: player2Stats.mpg },
        { label: '+/-', value1: player1Stats.plusMinus, value2: player2Stats.plusMinus },
        { label: 'FPG', value1: player1Stats.fpg, value2: player2Stats.fpg, lowerIsBetter: true },
        { label: 'TPG', value1: player1Stats.tpg, value2: player2Stats.tpg, lowerIsBetter: true },
      ];
    default:
      return [];
  }
}

export function PlayerComparison({ leagueId, allPlayers }: PlayerComparisonProps) {
  const [player1Id, setPlayer1Id] = useState<string>("");
  const [player2Id, setPlayer2Id] = useState<string>("");
  const [player1Stats, setPlayer1Stats] = useState<any>(null);
  const [player2Stats, setPlayer2Stats] = useState<any>(null);
  const [player1Raw, setPlayer1Raw] = useState<any[]>([]);
  const [player2Raw, setPlayer2Raw] = useState<any[]>([]);
  const [player1Display, setPlayer1Display] = useState<string>("");
  const [player2Display, setPlayer2Display] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [comparisonCategory, setComparisonCategory] = useState<'Traditional' | 'Advanced' | 'Scoring' | 'Misc'>('Traditional');
  const [view, setView] = useState<'season' | 'h2h'>('season');

  const [search1, setSearch1] = useState("");
  const [search2, setSearch2] = useState("");
  const [showDropdown1, setShowDropdown1] = useState(false);
  const [showDropdown2, setShowDropdown2] = useState(false);

  const dropdown1Ref = useRef<HTMLDivElement>(null);
  const dropdown2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdown1Ref.current && !dropdown1Ref.current.contains(event.target as Node)) {
        setShowDropdown1(false);
      }
      if (dropdown2Ref.current && !dropdown2Ref.current.contains(event.target as Node)) {
        setShowDropdown2(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchAllPlayerStats = async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from("player_stats")
      .select("*")
      .eq("league_id", leagueId);
    if (error) throw error;
    return data || [];
  };

  const filterStatsByPlayer = (allStats: any[], playerId: string): { raw: any[]; displayName: string; teamName: string } => {
    const selectedPlayer = allPlayers.find(p => p.playerKey === playerId);
    if (!selectedPlayer) return { raw: [], displayName: '', teamName: '' };
    const playerName = selectedPlayer.name.toLowerCase().trim();
    const stats = allStats.filter((stat: any) =>
      areSimilarNames(playerName, getStatName(stat))
    );
    return {
      raw: stats,
      displayName: selectedPlayer.name,
      teamName: stats[0]?.team || stats[0]?.team_name || '',
    };
  };

  const handleCompare = async () => {
    if (!player1Id || !player2Id) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const allStats = await fetchAllPlayerStats();
      const p1 = filterStatsByPlayer(allStats, player1Id);
      const p2 = filterStatsByPlayer(allStats, player2Id);
      setPlayer1Raw(p1.raw);
      setPlayer2Raw(p2.raw);
      setPlayer1Display(p1.displayName);
      setPlayer2Display(p2.displayName);
      setPlayer1Stats(aggregatePlayerStats(p1.raw, p1.displayName, p1.teamName));
      setPlayer2Stats(aggregatePlayerStats(p2.raw, p2.displayName, p2.teamName));
    } catch (error) {
      console.error("Error comparing players:", error);
      setFetchError("We couldn't load the comparison data. Please try again.");
      setPlayer1Raw([]);
      setPlayer2Raw([]);
      setPlayer1Stats(null);
      setPlayer2Stats(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (player1Id && player2Id) {
      handleCompare();
    } else {
      setFetchError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player1Id, player2Id]);

  const filteredPlayers1 = allPlayers.filter(player =>
    player.name?.toLowerCase().includes(search1.toLowerCase()) ||
    player.team?.toLowerCase().includes(search1.toLowerCase())
  ).slice(0, 10);

  const filteredPlayers2 = allPlayers.filter(player =>
    player.name?.toLowerCase().includes(search2.toLowerCase()) ||
    player.team?.toLowerCase().includes(search2.toLowerCase())
  ).slice(0, 10);

  const selectPlayer1 = (player: any) => {
    setPlayer1Id(player.playerKey);
    setSearch1(player.name);
    setShowDropdown1(false);
  };

  const selectPlayer2 = (player: any) => {
    setPlayer2Id(player.playerKey);
    setSearch2(player.name);
    setShowDropdown2(false);
  };

  // Build head-to-head data
  type PlayerH2HLine = { pts: number; reb: number; ast: number; min: string };
  type PlayerH2HGame = {
    game_id: string;
    date: string | null;
    team1Name: string;
    team2Name: string;
    p1Line: PlayerH2HLine;
    p2Line: PlayerH2HLine;
  };
  type PlayerH2H = {
    games: PlayerH2HGame[];
    p1Stats: ReturnType<typeof aggregatePlayerStats>;
    p2Stats: ReturnType<typeof aggregatePlayerStats>;
  };
  const h2h = useMemo<PlayerH2H>(() => {
    if (!player1Raw.length || !player2Raw.length) {
      return { games: [], p1Stats: null, p2Stats: null };
    }
    // Index player2's rows by game_id (fallback to game_key)
    const gameIdOf = (s: any) => s.game_id ?? s.game_key ?? null;
    const p2ByGame = new Map<string, any>();
    player2Raw.forEach((s: any) => {
      const gid = gameIdOf(s);
      if (gid != null) p2ByGame.set(String(gid), s);
    });

    const sharedP1: any[] = [];
    const sharedP2: any[] = [];
    const games: PlayerH2HGame[] = [];

    player1Raw.forEach((s1: any) => {
      const gid = gameIdOf(s1);
      if (gid == null) return;
      const s2 = p2ByGame.get(String(gid));
      if (!s2) return;

      // Require opposing teams
      const team1Id = s1.team_id ?? null;
      const team2Id = s2.team_id ?? null;
      if (team1Id != null && team2Id != null) {
        if (team1Id === team2Id) return;
      } else {
        const team1Norm = normalizeTeamName(s1.team_name || s1.team || '').toLowerCase();
        const team2Norm = normalizeTeamName(s2.team_name || s2.team || '').toLowerCase();
        if (!team1Norm || !team2Norm || team1Norm === team2Norm) return;
      }

      sharedP1.push(s1);
      sharedP2.push(s2);

      const minutesToStr = (raw: any): string => {
        if (typeof raw === 'string') return raw;
        if (typeof raw === 'number') return raw.toFixed(1);
        return '—';
      };

      games.push({
        game_id: gid,
        date: s1.game_date || s2.game_date || s1.created_at || s2.created_at || null,
        team1Name: s1.team_name || s1.team || '—',
        team2Name: s2.team_name || s2.team || '—',
        p1Line: {
          pts: s1.spoints ?? 0,
          reb: s1.sreboundstotal ?? 0,
          ast: s1.sassists ?? 0,
          min: minutesToStr(s1.sminutes),
        },
        p2Line: {
          pts: s2.spoints ?? 0,
          reb: s2.sreboundstotal ?? 0,
          ast: s2.sassists ?? 0,
          min: minutesToStr(s2.sminutes),
        },
      });
    });

    games.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });

    return {
      games,
      p1Stats: aggregatePlayerStats(sharedP1, player1Display, sharedP1[0]?.team_name || sharedP1[0]?.team || ''),
      p2Stats: aggregatePlayerStats(sharedP2, player2Display, sharedP2[0]?.team_name || sharedP2[0]?.team || ''),
    };
  }, [player1Raw, player2Raw, player1Display, player2Display]);

  const ComparisonRow = ({
    label,
    value1,
    value2,
    lowerIsBetter = false
  }: {
    label: string;
    value1: string | number;
    value2: string | number;
    lowerIsBetter?: boolean;
  }) => {
    const num1 = parseFloat(String(value1));
    const num2 = parseFloat(String(value2));
    const p1Better = lowerIsBetter ? num1 < num2 : num1 > num2;
    const p2Better = lowerIsBetter ? num2 < num1 : num2 > num1;

    return (
      <tr className="border-b border-gray-100 dark:border-neutral-700">
        <td className={`py-3 px-4 text-right font-medium ${p1Better ? 'text-orange-600' : p2Better ? 'text-slate-600 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {value1}
        </td>
        <td className="py-3 px-4 text-center font-semibold text-slate-800 dark:text-white bg-gray-50 dark:bg-neutral-800">
          {label}
        </td>
        <td className={`py-3 px-4 text-left font-medium ${p2Better ? 'text-orange-600' : p1Better ? 'text-slate-600 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {value2}
        </td>
      </tr>
    );
  };

  const renderHeaderRow = (s1: any, s2: any) => (
    <div className="flex flex-col md:flex-row items-center justify-between mb-6 md:mb-8 gap-4 md:gap-0">
      <div className="flex flex-col items-center space-y-2 md:space-y-3 w-full md:w-1/3">
        <div className="w-16 h-16 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800 border-2 md:border-4 border-orange-300 flex items-center justify-center">
          <div className="text-2xl md:text-4xl font-bold text-orange-600 dark:text-orange-400">{s1.name.charAt(0)}</div>
        </div>
        <div className="text-center">
          <h3 className="text-base md:text-lg font-bold text-slate-800 dark:text-white">{s1.name}</h3>
          <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">{s1.team}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{s1.games} games</p>
        </div>
      </div>
      <div className="flex items-center justify-center w-full md:w-1/3">
        <div className="text-2xl md:text-3xl font-black text-orange-500 tracking-wider">VS</div>
      </div>
      <div className="flex flex-col items-center space-y-2 md:space-y-3 w-full md:w-1/3">
        <div className="w-16 h-16 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 border-2 md:border-4 border-slate-300 dark:border-slate-500 flex items-center justify-center">
          <div className="text-2xl md:text-4xl font-bold text-slate-600 dark:text-slate-300">{s2.name.charAt(0)}</div>
        </div>
        <div className="text-center">
          <h3 className="text-base md:text-lg font-bold text-slate-800 dark:text-white">{s2.name}</h3>
          <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">{s2.team}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{s2.games} games</p>
        </div>
      </div>
    </div>
  );

  const renderStatsTable = (s1: any, s2: any) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-gray-200 dark:border-neutral-700">
            <th className="py-3 px-4 text-right font-bold text-slate-800 dark:text-white">{s1.name}</th>
            <th className="py-3 px-4 text-center font-bold text-slate-600 dark:text-slate-300">Stat</th>
            <th className="py-3 px-4 text-left font-bold text-slate-800 dark:text-white">{s2.name}</th>
          </tr>
        </thead>
        <tbody>
          {getPlayerComparisonRows(comparisonCategory, s1, s2).map((row, index) => (
            <ComparisonRow
              key={index}
              label={row.label}
              value1={row.value1}
              value2={row.value2}
              lowerIsBetter={row.lowerIsBetter}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  const formatDate = (raw: string | null) => {
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-6">Player Comparison</h2>

      {/* View Toggle */}
      <div className="mb-6">
        <Tabs value={view} onValueChange={(v) => setView(v as 'season' | 'h2h')}>
          <TabsList className="grid w-full md:w-96 grid-cols-2">
            <TabsTrigger value="season" data-testid="tab-player-season">Season Averages</TabsTrigger>
            <TabsTrigger value="h2h" data-testid="tab-player-h2h">Head-to-Head</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Category Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Comparison Category
        </label>
        <Select
          value={comparisonCategory}
          onValueChange={(value) => setComparisonCategory(value as typeof comparisonCategory)}
        >
          <SelectTrigger className="w-full md:w-64 bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-600 text-slate-700 dark:text-slate-200 hover:border-orange-300 focus:border-orange-500 focus:ring-orange-500">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
            <SelectItem value="Traditional">Traditional</SelectItem>
            <SelectItem value="Advanced">Advanced</SelectItem>
            <SelectItem value="Scoring">Scoring</SelectItem>
            <SelectItem value="Misc">Misc</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Player Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="relative" ref={dropdown1Ref}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Player 1
          </label>
          <div className="relative">
            <input
              type="text"
              value={search1}
              onChange={(e) => {
                setSearch1(e.target.value);
                setShowDropdown1(true);
                if (!e.target.value) {
                  setPlayer1Id("");
                  setPlayer1Stats(null);
                  setPlayer1Raw([]);
                }
              }}
              onFocus={() => setShowDropdown1(true)}
              placeholder="Search for a player..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              data-testid="input-player1-search"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          {showDropdown1 && search1 && filteredPlayers1.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredPlayers1.map((player, idx) => (
                <div
                  key={idx}
                  onClick={() => selectPlayer1(player)}
                  className="px-4 py-2 hover:bg-orange-50 dark:hover:bg-neutral-700 cursor-pointer border-b border-gray-100 dark:border-neutral-700 last:border-b-0"
                  data-testid={`option-player1-${idx}`}
                >
                  <div className="font-medium text-slate-800 dark:text-white">{player.name}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">{player.team} • {player.avgPoints} PPG</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="relative" ref={dropdown2Ref}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Player 2
          </label>
          <div className="relative">
            <input
              type="text"
              value={search2}
              onChange={(e) => {
                setSearch2(e.target.value);
                setShowDropdown2(true);
                if (!e.target.value) {
                  setPlayer2Id("");
                  setPlayer2Stats(null);
                  setPlayer2Raw([]);
                }
              }}
              onFocus={() => setShowDropdown2(true)}
              placeholder="Search for a player..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              data-testid="input-player2-search"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          {showDropdown2 && search2 && filteredPlayers2.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredPlayers2.map((player, idx) => (
                <div
                  key={idx}
                  onClick={() => selectPlayer2(player)}
                  className="px-4 py-2 hover:bg-orange-50 dark:hover:bg-neutral-700 cursor-pointer border-b border-gray-100 dark:border-neutral-700 last:border-b-0"
                  data-testid={`option-player2-${idx}`}
                >
                  <div className="font-medium text-slate-800 dark:text-white">{player.name}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">{player.team} • {player.avgPoints} PPG</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Comparison Results */}
      {isLoading ? (
        <div className="text-center py-8">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">Loading comparison...</p>
        </div>
      ) : fetchError ? (
        <div className="text-center py-10 px-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg" data-testid="error-player-compare">
          <p className="text-base font-semibold text-red-700 dark:text-red-300">{fetchError}</p>
          {player1Id && player2Id && (
            <button
              type="button"
              onClick={() => handleCompare()}
              className="mt-3 inline-flex items-center px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
              data-testid="button-player-compare-retry"
            >
              Try again
            </button>
          )}
        </div>
      ) : player1Stats && player2Stats ? (
        <div className="max-w-5xl mx-auto">
          <Tabs value={view} onValueChange={(v) => setView(v as 'season' | 'h2h')}>
            <TabsContent value="season" className="mt-0">
              {renderHeaderRow(player1Stats, player2Stats)}
              {renderStatsTable(player1Stats, player2Stats)}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-neutral-700">
                <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  <span className="text-orange-600 font-semibold">Orange</span> = Better stat
                  <span className="mx-2">•</span>
                  <span className="text-slate-600 dark:text-slate-400">Gray</span> = Lower stat
                </div>
              </div>
            </TabsContent>

            <TabsContent value="h2h" className="mt-0" data-testid="content-player-h2h">
              {h2h.games.length === 0 ? (
                <div className="text-center py-12 px-4 bg-gray-50 dark:bg-neutral-800 rounded-lg">
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                    No head-to-head matchups yet
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {player1Stats.name} and {player2Stats.name} haven't faced each other on opposing teams in this league.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-6 text-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Times Faced Off</p>
                    <p className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white" data-testid="text-player-h2h-count">
                      {h2h.games.length} game{h2h.games.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="mb-8 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200 dark:border-neutral-700">
                          <th className="py-2 px-3 text-left font-semibold text-slate-600 dark:text-slate-300">Date</th>
                          <th className="py-2 px-3 text-left font-semibold text-slate-600 dark:text-slate-300">Matchup</th>
                          <th className="py-2 px-3 text-center font-semibold text-slate-600 dark:text-slate-300">{player1Stats.name}</th>
                          <th className="py-2 px-3 text-center font-semibold text-slate-600 dark:text-slate-300">{player2Stats.name}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h2h.games.map((g, idx) => (
                          <tr key={`${g.game_id}-${idx}`} className="border-b border-gray-100 dark:border-neutral-700" data-testid={`row-player-h2h-game-${idx}`}>
                            <td className="py-2 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatDate(g.date)}</td>
                            <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                              {g.team1Name} <span className="text-slate-400">vs</span> {g.team2Name}
                            </td>
                            <td className="py-2 px-3 text-center tabular-nums text-slate-800 dark:text-white">
                              <span className="font-semibold">{g.p1Line.pts}</span>p / {g.p1Line.reb}r / {g.p1Line.ast}a
                              <div className="text-xs text-slate-500">{g.p1Line.min} min</div>
                            </td>
                            <td className="py-2 px-3 text-center tabular-nums text-slate-800 dark:text-white">
                              <span className="font-semibold">{g.p2Line.pts}</span>p / {g.p2Line.reb}r / {g.p2Line.ast}a
                              <div className="text-xs text-slate-500">{g.p2Line.min} min</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {h2h.p1Stats && h2h.p2Stats && (
                    <>
                      <div className="mb-3 text-center">
                        <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          In head-to-head games only
                        </p>
                      </div>
                      {renderHeaderRow(h2h.p1Stats, h2h.p2Stats)}
                      {renderStatsTable(h2h.p1Stats, h2h.p2Stats)}
                      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-neutral-700">
                        <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                          <span className="text-orange-600 font-semibold">Orange</span> = Better stat
                          <span className="mx-2">•</span>
                          <span className="text-slate-600 dark:text-slate-400">Gray</span> = Lower stat
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">Search and select two players to compare their stats</p>
          {allPlayers.length === 0 && (
            <p className="text-xs text-orange-500 mt-2">Loading players...</p>
          )}
        </div>
      )}
    </div>
  );
}
