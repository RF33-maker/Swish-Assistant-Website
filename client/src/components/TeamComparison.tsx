import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Search } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import ShareableCard from "@/components/ShareableCard";
import { normalizeTeamName } from "@/lib/teamUtils";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface TeamComparisonProps {
  leagueId: string;
  allTeams: any[];
  brandColor?: string;
  scopedLeagueIds?: string[];
}

function aggregateTeamStats(filteredStats: any[], teamName: string) {
  const games = filteredStats.length;
  if (games === 0) return null;

  let totalPoints = 0, totalFGM = 0, totalFGA = 0, total3PM = 0, total3PA = 0;
  let total2PM = 0, total2PA = 0, totalFTM = 0, totalFTA = 0;
  let totalRebounds = 0, totalOReb = 0, totalDReb = 0;
  let totalAssists = 0, totalSteals = 0, totalBlocks = 0, totalTurnovers = 0;
  let totalPlusMinus = 0, totalPF = 0;
  let totalPitp = 0, totalFastbreak = 0, totalSecondChance = 0;

  let sumEfgPercent = 0, sumTsPercent = 0, sumThreePtRate = 0;
  let sumAstPercent = 0, sumAstToRatio = 0, sumOrebPercent = 0;
  let sumDrebPercent = 0, sumRebPercent = 0, sumTovPercent = 0;
  let sumPace = 0, sumOffRating = 0, sumDefRating = 0, sumNetRating = 0;

  let sumPts2pt = 0, sumPts3pt = 0, sumPtsFt = 0, sumPtsMidrange = 0;
  let sumPtsPitp = 0, sumPtsFb = 0, sumPts2ndCh = 0, sumPtsOffTo = 0;

  filteredStats.forEach((stat: any) => {
    totalPoints += stat.tot_spoints || 0;
    totalFGM += stat.tot_sfieldgoalsmade || 0;
    totalFGA += stat.tot_sfieldgoalsattempted || 0;
    total3PM += stat.tot_sthreepointersmade || 0;
    total3PA += stat.tot_sthreepointersattempted || 0;
    total2PM += stat.tot_stwopointersmade || 0;
    total2PA += stat.tot_stwopointersattempted || 0;
    totalFTM += stat.tot_sfreethrowsmade || 0;
    totalFTA += stat.tot_sfreethrowsattempted || 0;
    totalRebounds += stat.tot_sreboundstotal || 0;
    totalOReb += stat.tot_sreboundsoffensive || 0;
    totalDReb += stat.tot_sreboundsdefensive || 0;
    totalAssists += stat.tot_sassists || 0;
    totalSteals += stat.tot_ssteals || 0;
    totalBlocks += stat.tot_sblocks || 0;
    totalTurnovers += stat.tot_sturnovers || 0;
    totalPlusMinus += stat.tot_splusminus || 0;
    totalPF += stat.tot_sfoulspersonal || 0;
    totalPitp += stat.tot_pointsinpaint || 0;
    totalFastbreak += stat.tot_fastbreakpoints || 0;
    totalSecondChance += stat.tot_secondchancepoints || 0;

    sumEfgPercent += stat.efg_percent || 0;
    sumTsPercent += stat.ts_percent || 0;
    sumThreePtRate += stat.three_point_rate || 0;
    sumAstPercent += stat.ast_percent || 0;
    sumAstToRatio += stat.ast_to_ratio || 0;
    sumOrebPercent += stat.oreb_percent || 0;
    sumDrebPercent += stat.dreb_percent || 0;
    sumRebPercent += stat.reb_percent || 0;
    sumTovPercent += stat.tov_percent || 0;
    sumPace += stat.pace || 0;
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
    name: teamName,
    games,
    ppg: (totalPoints / games).toFixed(1),
    rpg: (totalRebounds / games).toFixed(1),
    orpg: (totalOReb / games).toFixed(1),
    drpg: (totalDReb / games).toFixed(1),
    apg: (totalAssists / games).toFixed(1),
    spg: (totalSteals / games).toFixed(1),
    bpg: (totalBlocks / games).toFixed(1),
    tpg: (totalTurnovers / games).toFixed(1),
    fpg: (totalPF / games).toFixed(1),
    plusMinus: (totalPlusMinus / games).toFixed(1),
    pitpPg: (totalPitp / games).toFixed(1),
    fbPg: (totalFastbreak / games).toFixed(1),
    secondChPg: (totalSecondChance / games).toFixed(1),
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
    pace: (sumPace / games).toFixed(1),
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

function getTeamComparisonRows(
  category: 'Traditional' | 'Advanced' | 'Scoring' | 'Misc',
  team1Stats: any,
  team2Stats: any
) {
  if (!team1Stats || !team2Stats) return [];
  switch (category) {
    case 'Traditional':
      return [
        { label: 'PPG', value1: team1Stats.ppg, value2: team2Stats.ppg },
        { label: 'RPG', value1: team1Stats.rpg, value2: team2Stats.rpg },
        { label: 'ORPG', value1: team1Stats.orpg, value2: team2Stats.orpg },
        { label: 'DRPG', value1: team1Stats.drpg, value2: team2Stats.drpg },
        { label: 'APG', value1: team1Stats.apg, value2: team2Stats.apg },
        { label: 'SPG', value1: team1Stats.spg, value2: team2Stats.spg },
        { label: 'BPG', value1: team1Stats.bpg, value2: team2Stats.bpg },
        { label: 'TPG', value1: team1Stats.tpg, value2: team2Stats.tpg, lowerIsBetter: true },
        { label: 'FPG', value1: team1Stats.fpg, value2: team2Stats.fpg, lowerIsBetter: true },
        { label: '+/-', value1: team1Stats.plusMinus, value2: team2Stats.plusMinus },
        { label: 'FG%', value1: `${team1Stats.fgPercentage}%`, value2: `${team2Stats.fgPercentage}%` },
        { label: '2P%', value1: `${team1Stats.twoPercentage}%`, value2: `${team2Stats.twoPercentage}%` },
        { label: '3P%', value1: `${team1Stats.threePercentage}%`, value2: `${team2Stats.threePercentage}%` },
        { label: 'FT%', value1: `${team1Stats.ftPercentage}%`, value2: `${team2Stats.ftPercentage}%` },
        { label: 'PITP', value1: team1Stats.pitpPg, value2: team2Stats.pitpPg },
        { label: 'FB PTS', value1: team1Stats.fbPg, value2: team2Stats.fbPg },
        { label: '2ND CH', value1: team1Stats.secondChPg, value2: team2Stats.secondChPg },
      ];
    case 'Advanced':
      return [
        { label: 'eFG%', value1: `${team1Stats.efgPercent}%`, value2: `${team2Stats.efgPercent}%` },
        { label: 'TS%', value1: `${team1Stats.tsPercent}%`, value2: `${team2Stats.tsPercent}%` },
        { label: '3PT Rate', value1: `${team1Stats.threePtRate}%`, value2: `${team2Stats.threePtRate}%` },
        { label: 'AST%', value1: `${team1Stats.astPercent}%`, value2: `${team2Stats.astPercent}%` },
        { label: 'AST/TO', value1: team1Stats.astToRatio, value2: team2Stats.astToRatio },
        { label: 'OREB%', value1: `${team1Stats.orebPercent}%`, value2: `${team2Stats.orebPercent}%` },
        { label: 'DREB%', value1: `${team1Stats.drebPercent}%`, value2: `${team2Stats.drebPercent}%` },
        { label: 'REB%', value1: `${team1Stats.rebPercent}%`, value2: `${team2Stats.rebPercent}%` },
        { label: 'TOV%', value1: `${team1Stats.tovPercent}%`, value2: `${team2Stats.tovPercent}%`, lowerIsBetter: true },
        { label: 'PACE', value1: team1Stats.pace, value2: team2Stats.pace },
        { label: 'OFF RTG', value1: team1Stats.offRating, value2: team2Stats.offRating },
        { label: 'DEF RTG', value1: team1Stats.defRating, value2: team2Stats.defRating, lowerIsBetter: true },
        { label: 'NET RTG', value1: team1Stats.netRating, value2: team2Stats.netRating },
      ];
    case 'Scoring':
      return [
        { label: 'PPG', value1: team1Stats.ppg, value2: team2Stats.ppg },
        { label: '%PTS 2PT', value1: `${team1Stats.pts2ptPercent}%`, value2: `${team2Stats.pts2ptPercent}%` },
        { label: '%PTS 3PT', value1: `${team1Stats.pts3ptPercent}%`, value2: `${team2Stats.pts3ptPercent}%` },
        { label: '%PTS FT', value1: `${team1Stats.ptsFtPercent}%`, value2: `${team2Stats.ptsFtPercent}%` },
        { label: '%PTS Midrange', value1: `${team1Stats.ptsMidrangePercent}%`, value2: `${team2Stats.ptsMidrangePercent}%` },
        { label: '%PTS PITP', value1: `${team1Stats.ptsPitpPercent}%`, value2: `${team2Stats.ptsPitpPercent}%` },
        { label: '%PTS FB', value1: `${team1Stats.ptsFbPercent}%`, value2: `${team2Stats.ptsFbPercent}%` },
        { label: '%PTS 2nd Ch', value1: `${team1Stats.pts2ndChPercent}%`, value2: `${team2Stats.pts2ndChPercent}%` },
        { label: '%PTS Off TO', value1: `${team1Stats.ptsOffToPercent}%`, value2: `${team2Stats.ptsOffToPercent}%` },
      ];
    case 'Misc':
      return [
        { label: 'PPG', value1: team1Stats.ppg, value2: team2Stats.ppg },
        { label: 'RPG', value1: team1Stats.rpg, value2: team2Stats.rpg },
        { label: 'APG', value1: team1Stats.apg, value2: team2Stats.apg },
        { label: '+/-', value1: team1Stats.plusMinus, value2: team2Stats.plusMinus },
        { label: 'FPG', value1: team1Stats.fpg, value2: team2Stats.fpg, lowerIsBetter: true },
        { label: 'TPG', value1: team1Stats.tpg, value2: team2Stats.tpg, lowerIsBetter: true },
        { label: 'PITP', value1: team1Stats.pitpPg, value2: team2Stats.pitpPg },
        { label: 'FB PTS', value1: team1Stats.fbPg, value2: team2Stats.fbPg },
        { label: '2ND CH', value1: team1Stats.secondChPg, value2: team2Stats.secondChPg },
      ];
    default:
      return [];
  }
}

export function TeamComparison({ leagueId, allTeams, brandColor, scopedLeagueIds }: TeamComparisonProps) {
  const [team1Name, setTeam1Name] = useState<string>("");
  const [team2Name, setTeam2Name] = useState<string>("");
  const [team1Stats, setTeam1Stats] = useState<any>(null);
  const [team2Stats, setTeam2Stats] = useState<any>(null);
  const [team1Raw, setTeam1Raw] = useState<any[]>([]);
  const [team2Raw, setTeam2Raw] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [comparisonCategory, setComparisonCategory] = useState<'Traditional' | 'Advanced' | 'Scoring' | 'Misc'>('Traditional');
  const [view, setView] = useState<'season' | 'h2h'>('season');
  const [team1LogoUrl, setTeam1LogoUrl] = useState<string | null>(null);
  const [team2LogoUrl, setTeam2LogoUrl] = useState<string | null>(null);

  // Resolve team-logo URLs for the share-card header band whenever the
  // selected teams change. Uses the same cached lookup as in-page <TeamLogo>.
  useEffect(() => {
    let cancelled = false;
    setTeam1LogoUrl(null);
    if (!team1Stats?.name || !leagueId) return;
    void getTeamLogoCached({ leagueId, teamName: team1Stats.name }).then((url) => {
      if (!cancelled) setTeam1LogoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [team1Stats?.name, leagueId]);
  useEffect(() => {
    let cancelled = false;
    setTeam2LogoUrl(null);
    if (!team2Stats?.name || !leagueId) return;
    void getTeamLogoCached({ leagueId, teamName: team2Stats.name }).then((url) => {
      if (!cancelled) setTeam2LogoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [team2Stats?.name, leagueId]);

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

  const fetchAllTeamStats = async (): Promise<any[]> => {
    const ids = scopedLeagueIds && scopedLeagueIds.length > 0 ? scopedLeagueIds : [leagueId];
    let query = supabase.from("team_stats").select("*");
    query = ids.length > 1 ? query.in("league_id", ids) : query.eq("league_id", ids[0]);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  };

  const handleCompare = async () => {
    if (!team1Name || !team2Name) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const allStats = await fetchAllTeamStats();
      const norm1 = normalizeTeamName(team1Name);
      const norm2 = normalizeTeamName(team2Name);
      const t1Raw = allStats.filter((s: any) => normalizeTeamName(s.name) === norm1);
      const t2Raw = allStats.filter((s: any) => normalizeTeamName(s.name) === norm2);
      setTeam1Raw(t1Raw);
      setTeam2Raw(t2Raw);
      setTeam1Stats(aggregateTeamStats(t1Raw, team1Name));
      setTeam2Stats(aggregateTeamStats(t2Raw, team2Name));
    } catch (error) {
      console.error("Error comparing teams:", error);
      setFetchError("We couldn't load the comparison data. Please try again.");
      setTeam1Raw([]);
      setTeam2Raw([]);
      setTeam1Stats(null);
      setTeam2Stats(null);
    } finally {
      setIsLoading(false);
    }
  };

  const scopedIdsKey = (scopedLeagueIds && scopedLeagueIds.length > 0 ? scopedLeagueIds : [leagueId]).slice().sort().join(',');
  useEffect(() => {
    if (team1Name && team2Name) {
      handleCompare();
    } else {
      setFetchError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team1Name, team2Name, scopedIdsKey]);

  const filteredTeams1 = allTeams.filter(team =>
    team.teamName?.toLowerCase().includes(search1.toLowerCase())
  ).slice(0, 10);

  const filteredTeams2 = allTeams.filter(team =>
    team.teamName?.toLowerCase().includes(search2.toLowerCase())
  ).slice(0, 10);

  const selectTeam1 = (team: any) => {
    setTeam1Name(team.teamName);
    setSearch1(team.teamName);
    setShowDropdown1(false);
  };

  const selectTeam2 = (team: any) => {
    setTeam2Name(team.teamName);
    setSearch2(team.teamName);
    setShowDropdown2(false);
  };

  // Build head-to-head data from the two raw arrays
  type TeamH2HGame = {
    game_key: string;
    date: string | null;
    homeIsTeam1: boolean;
    score1: number;
    score2: number;
    winner: string | null;
  };
  type TeamH2H = {
    games: TeamH2HGame[];
    team1Wins: number;
    team2Wins: number;
    team1Stats: ReturnType<typeof aggregateTeamStats>;
    team2Stats: ReturnType<typeof aggregateTeamStats>;
  };
  const h2h = useMemo<TeamH2H>(() => {
    if (!team1Raw.length || !team2Raw.length) {
      return { games: [], team1Wins: 0, team2Wins: 0, team1Stats: null, team2Stats: null };
    }
    const team2ByGame = new Map<string, any>();
    team2Raw.forEach((s: any) => { if (s.game_key) team2ByGame.set(s.game_key, s); });

    const sharedT1: any[] = [];
    const sharedT2: any[] = [];
    const games: TeamH2HGame[] = [];
    let team1Wins = 0;
    let team2Wins = 0;

    team1Raw.forEach((s1: any) => {
      if (!s1.game_key) return;
      const s2 = team2ByGame.get(s1.game_key);
      if (!s2) return;
      sharedT1.push(s1);
      sharedT2.push(s2);
      const score1 = s1.tot_spoints ?? 0;
      const score2 = s2.tot_spoints ?? 0;
      let winner: string | null = null;
      if (score1 > score2) { team1Wins++; winner = team1Name; }
      else if (score2 > score1) { team2Wins++; winner = team2Name; }

      const homeIsTeam1 = s1.side === '1' || s1.side === 1;
      const dateRaw = s1.game_date || s1.created_at || s2.game_date || s2.created_at || null;
      games.push({
        game_key: s1.game_key,
        date: dateRaw,
        homeIsTeam1,
        score1,
        score2,
        winner,
      });
    });

    games.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });

    return {
      games,
      team1Wins,
      team2Wins,
      team1Stats: aggregateTeamStats(sharedT1, team1Name),
      team2Stats: aggregateTeamStats(sharedT2, team2Name),
    };
  }, [team1Raw, team2Raw, team1Name, team2Name]);

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
    const t1Better = lowerIsBetter ? num1 < num2 : num1 > num2;
    const t2Better = lowerIsBetter ? num2 < num1 : num2 > num1;

    return (
      <tr className="border-b border-gray-100 dark:border-neutral-700">
        <td className={`py-3 px-4 text-right font-medium ${t1Better ? 'text-orange-600' : t2Better ? 'text-slate-600 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {value1}
        </td>
        <td className="py-3 px-4 text-center font-semibold text-slate-800 dark:text-white bg-gray-50 dark:bg-neutral-800">
          {label}
        </td>
        <td className={`py-3 px-4 text-left font-medium ${t2Better ? 'text-orange-600' : t1Better ? 'text-slate-600 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {value2}
        </td>
      </tr>
    );
  };

  const renderHeaderRow = (s1: any, s2: any) => (
    <div className="flex flex-col md:flex-row items-center justify-between mb-6 md:mb-8 gap-4 md:gap-0">
      <div className="flex flex-col items-center space-y-2 md:space-y-3 w-full md:w-1/3">
        <div className="w-16 h-16 md:w-32 md:h-32">
          <TeamLogo
            teamName={s1.name}
            leagueId={leagueId}
            size={64}
            className="border-2 md:border-4 border-orange-300 shadow-lg md:hidden"
          />
          <TeamLogo
            teamName={s1.name}
            leagueId={leagueId}
            size={128}
            className="border-4 border-orange-300 shadow-lg hidden md:block"
          />
        </div>
        <div className="text-center">
          <h3 className="text-base md:text-lg font-bold text-slate-800 dark:text-white">{s1.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{s1.games} games</p>
        </div>
      </div>
      <div className="flex items-center justify-center w-full md:w-1/3">
        <div className="text-2xl md:text-3xl font-black text-orange-500 tracking-wider">VS</div>
      </div>
      <div className="flex flex-col items-center space-y-2 md:space-y-3 w-full md:w-1/3">
        <div className="w-16 h-16 md:w-32 md:h-32">
          <TeamLogo
            teamName={s2.name}
            leagueId={leagueId}
            size={64}
            className="border-2 md:border-4 border-slate-300 shadow-lg md:hidden"
          />
          <TeamLogo
            teamName={s2.name}
            leagueId={leagueId}
            size={128}
            className="border-4 border-slate-300 shadow-lg hidden md:block"
          />
        </div>
        <div className="text-center">
          <h3 className="text-base md:text-lg font-bold text-slate-800 dark:text-white">{s2.name}</h3>
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
          {getTeamComparisonRows(comparisonCategory, s1, s2).map((row, index) => (
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

  // Share-card layout (renders cleanly inside ShareableCard's modal).
  const renderShareVsHeader = (s1: any, s2: any) => (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
        <div className="w-16 h-16 rounded-full bg-white border-2 border-orange-300 shadow flex items-center justify-center overflow-hidden p-1">
          <TeamLogo
            teamName={s1.name}
            leagueId={leagueId}
            size={56}
            className="!w-14 !h-14"
            crossOrigin="anonymous"
          />
        </div>
        <div className="text-center min-w-0 w-full">
          <div className="text-xs font-bold text-slate-800 leading-tight truncate" title={s1.name}>{s1.name}</div>
          <div className="text-[10px] text-slate-500">{s1.games} games</div>
        </div>
      </div>
      <div className="text-lg font-black text-orange-500 tracking-wider px-1 flex-shrink-0">VS</div>
      <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
        <div className="w-16 h-16 rounded-full bg-white border-2 border-slate-300 shadow flex items-center justify-center overflow-hidden p-1">
          <TeamLogo
            teamName={s2.name}
            leagueId={leagueId}
            size={56}
            className="!w-14 !h-14"
            crossOrigin="anonymous"
          />
        </div>
        <div className="text-center min-w-0 w-full">
          <div className="text-xs font-bold text-slate-800 leading-tight truncate" title={s2.name}>{s2.name}</div>
          <div className="text-[10px] text-slate-500">{s2.games} games</div>
        </div>
      </div>
    </div>
  );

  const renderShareTable = (s1: any, s2: any) => {
    const rows = getTeamComparisonRows(comparisonCategory, s1, s2);
    return (
      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="py-1.5 px-2 text-right font-bold text-slate-700 truncate max-w-[40%]">{s1.name}</th>
              <th className="py-1.5 px-2 text-center font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Stat</th>
              <th className="py-1.5 px-2 text-left font-bold text-slate-700 truncate max-w-[40%]">{s2.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const num1 = parseFloat(String(row.value1));
              const num2 = parseFloat(String(row.value2));
              const t1Better = row.lowerIsBetter ? num1 < num2 : num1 > num2;
              const t2Better = row.lowerIsBetter ? num2 < num1 : num2 > num1;
              return (
                <tr key={i} className={`border-t border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                  <td className={`py-1 px-2 text-right tabular-nums font-semibold ${t1Better ? 'text-orange-600' : 'text-slate-700'}`}>
                    {row.value1}
                  </td>
                  <td className="py-1 px-2 text-center font-semibold text-slate-600 text-[10px] uppercase tracking-wider">
                    {row.label}
                  </td>
                  <td className={`py-1 px-2 text-left tabular-nums font-semibold ${t2Better ? 'text-orange-600' : 'text-slate-700'}`}>
                    {row.value2}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderShareContent = () => {
    if (!team1Stats || !team2Stats) return null;
    if (view === 'season') {
      return (
        <div className="space-y-3">
          {renderShareVsHeader(team1Stats, team2Stats)}
          <div className="text-center">
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
              {comparisonCategory} • Season Averages
            </span>
          </div>
          {renderShareTable(team1Stats, team2Stats)}
        </div>
      );
    }
    // Head-to-Head
    if (h2h.games.length === 0) {
      return (
        <div className="space-y-3">
          {renderShareVsHeader(team1Stats, team2Stats)}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
            <p className="text-sm font-semibold text-slate-700">No head-to-head matchups yet</p>
            <p className="text-xs text-slate-500 mt-1">{team1Stats.name} and {team2Stats.name} haven't played each other.</p>
          </div>
        </div>
      );
    }
    const recordText = h2h.team1Wins > h2h.team2Wins
      ? `${team1Stats.name} leads ${h2h.team1Wins}-${h2h.team2Wins}`
      : h2h.team2Wins > h2h.team1Wins
        ? `${team2Stats.name} leads ${h2h.team2Wins}-${h2h.team1Wins}`
        : `Series tied ${h2h.team1Wins}-${h2h.team2Wins}`;
    return (
      <div className="space-y-3">
        {renderShareVsHeader(team1Stats, team2Stats)}
        <div className="text-center rounded-lg bg-orange-50 border border-orange-200 py-2 px-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Series Record</div>
          <div className="text-base font-black text-slate-800 mt-0.5">{recordText}</div>
          <div className="text-[10px] text-slate-500">{h2h.games.length} game{h2h.games.length !== 1 ? 's' : ''} played</div>
        </div>
        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="py-1.5 px-2 text-left font-semibold text-slate-600">Date</th>
                <th className="py-1.5 px-2 text-center font-semibold text-slate-600">Score</th>
                <th className="py-1.5 px-2 text-left font-semibold text-slate-600">Winner</th>
              </tr>
            </thead>
            <tbody>
              {h2h.games.slice(0, 6).map((g, idx) => {
                const scoreText = g.homeIsTeam1
                  ? `${g.score1} - ${g.score2}`
                  : `${g.score2} - ${g.score1}`;
                return (
                  <tr key={g.game_key || idx} className={`border-t border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                    <td className="py-1 px-2 text-slate-700 whitespace-nowrap">{formatDate(g.date)}</td>
                    <td className="py-1 px-2 text-center font-semibold tabular-nums text-slate-800">{scoreText}</td>
                    <td className="py-1 px-2 font-medium text-orange-600 truncate">{g.winner ?? 'Tie'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {h2h.games.length > 6 && (
            <div className="text-center text-[10px] text-slate-500 py-1 bg-slate-50">
              +{h2h.games.length - 6} more game{h2h.games.length - 6 !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        {h2h.team1Stats && h2h.team2Stats && (
          <>
            <div className="text-center">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                {comparisonCategory} • H2H Only
              </span>
            </div>
            {renderShareTable(h2h.team1Stats, h2h.team2Stats)}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-6">Team Comparison</h2>

      {/* View Toggle */}
      <div className="mb-6">
        <Tabs value={view} onValueChange={(v) => setView(v as 'season' | 'h2h')}>
          <TabsList className="grid w-full md:w-96 grid-cols-2">
            <TabsTrigger value="season" data-testid="tab-team-season">Season Averages</TabsTrigger>
            <TabsTrigger value="h2h" data-testid="tab-team-h2h">Head-to-Head</TabsTrigger>
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

      {/* Team Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="relative" ref={dropdown1Ref}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Team 1
          </label>
          <div className="relative">
            <input
              type="text"
              value={search1}
              onChange={(e) => {
                setSearch1(e.target.value);
                setShowDropdown1(true);
                if (!e.target.value) {
                  setTeam1Name("");
                  setTeam1Stats(null);
                  setTeam1Raw([]);
                }
              }}
              onFocus={() => setShowDropdown1(true)}
              placeholder="Search for a team..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              data-testid="input-team1-search"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          {showDropdown1 && search1 && filteredTeams1.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredTeams1.map((team, idx) => (
                <div
                  key={idx}
                  onClick={() => selectTeam1(team)}
                  className="px-4 py-2 hover:bg-orange-50 dark:hover:bg-neutral-700 cursor-pointer border-b border-gray-100 dark:border-neutral-700 last:border-b-0"
                  data-testid={`option-team1-${idx}`}
                >
                  <div className="font-medium text-slate-800 dark:text-white">{team.teamName}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">{team.avgPoints} PPG</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="relative" ref={dropdown2Ref}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Team 2
          </label>
          <div className="relative">
            <input
              type="text"
              value={search2}
              onChange={(e) => {
                setSearch2(e.target.value);
                setShowDropdown2(true);
                if (!e.target.value) {
                  setTeam2Name("");
                  setTeam2Stats(null);
                  setTeam2Raw([]);
                }
              }}
              onFocus={() => setShowDropdown2(true)}
              placeholder="Search for a team..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              data-testid="input-team2-search"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          {showDropdown2 && search2 && filteredTeams2.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredTeams2.map((team, idx) => (
                <div
                  key={idx}
                  onClick={() => selectTeam2(team)}
                  className="px-4 py-2 hover:bg-orange-50 dark:hover:bg-neutral-700 cursor-pointer border-b border-gray-100 dark:border-neutral-700 last:border-b-0"
                  data-testid={`option-team2-${idx}`}
                >
                  <div className="font-medium text-slate-800 dark:text-white">{team.teamName}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">{team.avgPoints} PPG</div>
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
        <div className="text-center py-10 px-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg" data-testid="error-team-compare">
          <p className="text-base font-semibold text-red-700 dark:text-red-300">{fetchError}</p>
          {team1Name && team2Name && (
            <button
              type="button"
              onClick={() => handleCompare()}
              className="mt-3 inline-flex items-center px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
              data-testid="button-team-compare-retry"
            >
              Try again
            </button>
          )}
        </div>
      ) : team1Stats && team2Stats ? (
        <ShareableCard
          title={view === 'season' ? 'Season Averages' : 'Head-to-Head'}
          fileSlug={`team-compare-${view}-${comparisonCategory.toLowerCase()}`}
          player={{
            name: `${team1Stats.name} vs ${team2Stats.name}`,
            team: 'Team Comparison',
            primaryColor: brandColor,
          }}
          shareCaption={comparisonCategory.toUpperCase()}
          shareContent={renderShareContent()}
          teamLogos={[
            { name: team1Stats.name, logoUrl: team1LogoUrl },
            { name: team2Stats.name, logoUrl: team2LogoUrl },
          ]}
        >
        <div className="max-w-5xl mx-auto pt-6">
          <Tabs value={view} onValueChange={(v) => setView(v as 'season' | 'h2h')}>
            <TabsContent value="season" className="mt-0">
              {renderHeaderRow(team1Stats, team2Stats)}
              {renderStatsTable(team1Stats, team2Stats)}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-neutral-700">
                <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  <span className="text-orange-600 font-semibold">Orange</span> = Better stat
                  <span className="mx-2">•</span>
                  <span className="text-slate-600 dark:text-slate-400">Gray</span> = Lower stat
                </div>
              </div>
            </TabsContent>

            <TabsContent value="h2h" className="mt-0" data-testid="content-team-h2h">
              {h2h.games.length === 0 ? (
                <div className="text-center py-12 px-4 bg-gray-50 dark:bg-neutral-800 rounded-lg">
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                    No head-to-head matchups yet
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {team1Stats.name} and {team2Stats.name} haven't played each other in this league.
                  </p>
                </div>
              ) : (
                <>
                  {/* Series record */}
                  <div className="mb-6 text-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Series Record</p>
                    <p className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white" data-testid="text-team-h2h-record">
                      {h2h.team1Wins > h2h.team2Wins ? (
                        <><span className="text-orange-600">{team1Stats.name}</span> leads {h2h.team1Wins}-{h2h.team2Wins}</>
                      ) : h2h.team2Wins > h2h.team1Wins ? (
                        <><span className="text-orange-600">{team2Stats.name}</span> leads {h2h.team2Wins}-{h2h.team1Wins}</>
                      ) : (
                        <>Series tied {h2h.team1Wins}-{h2h.team2Wins}</>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {h2h.games.length} game{h2h.games.length !== 1 ? 's' : ''} played
                    </p>
                  </div>

                  {/* Matchup list */}
                  <div className="mb-8 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200 dark:border-neutral-700">
                          <th className="py-2 px-3 text-left font-semibold text-slate-600 dark:text-slate-300">Date</th>
                          <th className="py-2 px-3 text-left font-semibold text-slate-600 dark:text-slate-300">Matchup</th>
                          <th className="py-2 px-3 text-center font-semibold text-slate-600 dark:text-slate-300">Score</th>
                          <th className="py-2 px-3 text-left font-semibold text-slate-600 dark:text-slate-300">Winner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h2h.games.map((g, idx) => {
                          const matchupText = g.homeIsTeam1
                            ? `${team1Stats.name} (H) vs ${team2Stats.name} (A)`
                            : `${team2Stats.name} (H) vs ${team1Stats.name} (A)`;
                          const scoreText = g.homeIsTeam1
                            ? `${g.score1} - ${g.score2}`
                            : `${g.score2} - ${g.score1}`;
                          return (
                            <tr key={g.game_key || idx} className="border-b border-gray-100 dark:border-neutral-700" data-testid={`row-team-h2h-game-${idx}`}>
                              <td className="py-2 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatDate(g.date)}</td>
                              <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{matchupText}</td>
                              <td className="py-2 px-3 text-center font-semibold tabular-nums text-slate-800 dark:text-white">{scoreText}</td>
                              <td className="py-2 px-3 font-medium text-orange-600">{g.winner ?? 'Tie'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* H2H averages */}
                  {h2h.team1Stats && h2h.team2Stats && (
                    <>
                      <div className="mb-3 text-center">
                        <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          In head-to-head games only
                        </p>
                      </div>
                      {renderHeaderRow(h2h.team1Stats, h2h.team2Stats)}
                      {renderStatsTable(h2h.team1Stats, h2h.team2Stats)}
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
        </ShareableCard>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">Search and select two teams to compare their stats</p>
          {allTeams.length === 0 && (
            <p className="text-xs text-orange-500 mt-2">Loading teams...</p>
          )}
        </div>
      )}
    </div>
  );
}
