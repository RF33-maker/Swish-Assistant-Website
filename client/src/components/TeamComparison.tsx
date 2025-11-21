import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Search } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { normalizeTeamName } from "@/lib/teamUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TeamComparisonProps {
  leagueId: string;
  allTeams: any[];
}

export function TeamComparison({ leagueId, allTeams }: TeamComparisonProps) {
  const [team1Name, setTeam1Name] = useState<string>("");
  const [team2Name, setTeam2Name] = useState<string>("");
  const [team1Stats, setTeam1Stats] = useState<any>(null);
  const [team2Stats, setTeam2Stats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [comparisonCategory, setComparisonCategory] = useState<'Traditional' | 'Advanced' | 'Scoring' | 'Misc'>('Traditional');
  
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

  const fetchTeamStats = async (teamName: string) => {
    // Fetch all team stats for the league to handle name variations
    const { data: stats, error } = await supabase
      .from("team_stats")
      .select("*")
      .eq("league_id", leagueId);

    if (error || !stats) {
      return null;
    }

    // Filter by normalized team name to handle variations like "Team I", "Team Senior Men I", etc.
    const normalizedSearchName = normalizeTeamName(teamName);
    const filteredStats = stats.filter(stat => 
      normalizeTeamName(stat.name) === normalizedSearchName
    );

    if (filteredStats.length === 0) {
      return null;
    }

    const games = filteredStats.length;
    let totalPoints = 0, totalFGM = 0, totalFGA = 0, total3PM = 0, total3PA = 0;
    let total2PM = 0, total2PA = 0, totalFTM = 0, totalFTA = 0;
    let totalRebounds = 0, totalOReb = 0, totalDReb = 0;
    let totalAssists = 0, totalSteals = 0, totalBlocks = 0, totalTurnovers = 0;
    let totalPlusMinus = 0, totalPF = 0;
    let totalPitp = 0, totalFastbreak = 0, totalSecondChance = 0;
    
    // Advanced stats (will be averaged)
    let sumEfgPercent = 0, sumTsPercent = 0, sumThreePtRate = 0;
    let sumAstPercent = 0, sumAstToRatio = 0, sumOrebPercent = 0;
    let sumDrebPercent = 0, sumRebPercent = 0, sumTovPercent = 0;
    let sumPace = 0, sumOffRating = 0, sumDefRating = 0, sumNetRating = 0;
    
    // Scoring distribution
    let sumPts2pt = 0, sumPts3pt = 0, sumPtsFt = 0, sumPtsMidrange = 0;
    let sumPtsPitp = 0, sumPtsFb = 0, sumPts2ndCh = 0, sumPtsOffTo = 0;

    filteredStats.forEach((stat: any) => {
      // Traditional stats
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
      
      // Advanced stats
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
      
      // Scoring distribution
      sumPts2pt += stat.pts_percent_2pt || 0;
      sumPts3pt += stat.pts_percent_3pt || 0;
      sumPtsFt += stat.pts_percent_ft || 0;
      sumPtsMidrange += stat.pts_percent_midrange || 0;
      sumPtsPitp += stat.pts_percent_pitp || 0;
      sumPtsFb += stat.pts_percent_fastbreak || 0;
      sumPts2ndCh += stat.pts_percent_second_chance || 0;
      sumPtsOffTo += stat.pts_percent_off_turnovers || 0;
    });

    if (games === 0) {
      return null;
    }

    return {
      name: teamName,
      games,
      // Traditional stats
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
      // Advanced stats (averaged, already stored as percentages in DB)
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
      // Scoring distribution (already stored as percentages in DB)
      pts2ptPercent: (sumPts2pt / games).toFixed(1),
      pts3ptPercent: (sumPts3pt / games).toFixed(1),
      ptsFtPercent: (sumPtsFt / games).toFixed(1),
      ptsMidrangePercent: (sumPtsMidrange / games).toFixed(1),
      ptsPitpPercent: (sumPtsPitp / games).toFixed(1),
      ptsFbPercent: (sumPtsFb / games).toFixed(1),
      pts2ndChPercent: (sumPts2ndCh / games).toFixed(1),
      ptsOffToPercent: (sumPtsOffTo / games).toFixed(1),
    };
  };

  const handleCompare = async () => {
    if (!team1Name || !team2Name) return;
    
    setIsLoading(true);
    try {
      const [t1Stats, t2Stats] = await Promise.all([
        fetchTeamStats(team1Name),
        fetchTeamStats(team2Name)
      ]);
      
      setTeam1Stats(t1Stats);
      setTeam2Stats(t2Stats);
    } catch (error) {
      console.error("Error comparing teams:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (team1Name && team2Name) {
      handleCompare();
    }
  }, [team1Name, team2Name]);

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
      <tr className="border-b border-gray-100">
        <td className={`py-3 px-4 text-right font-medium ${t1Better ? 'text-orange-600' : t2Better ? 'text-slate-600' : 'text-slate-700'}`}>
          {value1}
        </td>
        <td className="py-3 px-4 text-center font-semibold text-slate-800 bg-gray-50">
          {label}
        </td>
        <td className={`py-3 px-4 text-left font-medium ${t2Better ? 'text-orange-600' : t1Better ? 'text-slate-600' : 'text-slate-700'}`}>
          {value2}
        </td>
      </tr>
    );
  };

  // Get comparison rows based on selected category
  const getComparisonRows = () => {
    if (!team1Stats || !team2Stats) return [];
    
    switch (comparisonCategory) {
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
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-6">Team Comparison</h2>
      
      {/* Category Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Comparison Category
        </label>
        <Select
          value={comparisonCategory}
          onValueChange={(value) => setComparisonCategory(value as typeof comparisonCategory)}
        >
          <SelectTrigger className="w-full md:w-64 bg-white border-slate-200 text-slate-700 hover:border-orange-300 focus:border-orange-500 focus:ring-orange-500">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Traditional">Traditional</SelectItem>
            <SelectItem value="Advanced">Advanced</SelectItem>
            <SelectItem value="Scoring">Scoring</SelectItem>
            <SelectItem value="Misc">Misc</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Team Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Team 1 Search */}
        <div className="relative" ref={dropdown1Ref}>
          <label className="block text-sm font-medium text-slate-700 mb-2">
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
                }
              }}
              onFocus={() => setShowDropdown1(true)}
              placeholder="Search for a team..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              data-testid="input-team1-search"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          {showDropdown1 && search1 && filteredTeams1.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredTeams1.map((team, idx) => (
                <div
                  key={idx}
                  onClick={() => selectTeam1(team)}
                  className="px-4 py-2 hover:bg-orange-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  data-testid={`option-team1-${idx}`}
                >
                  <div className="font-medium text-slate-800">{team.teamName}</div>
                  <div className="text-xs text-slate-600">{team.avgPoints} PPG</div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Team 2 Search */}
        <div className="relative" ref={dropdown2Ref}>
          <label className="block text-sm font-medium text-slate-700 mb-2">
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
                }
              }}
              onFocus={() => setShowDropdown2(true)}
              placeholder="Search for a team..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              data-testid="input-team2-search"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          {showDropdown2 && search2 && filteredTeams2.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredTeams2.map((team, idx) => (
                <div
                  key={idx}
                  onClick={() => selectTeam2(team)}
                  className="px-4 py-2 hover:bg-orange-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  data-testid={`option-team2-${idx}`}
                >
                  <div className="font-medium text-slate-800">{team.teamName}</div>
                  <div className="text-xs text-slate-600">{team.avgPoints} PPG</div>
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
          <p className="text-sm text-slate-600 mt-2">Loading comparison...</p>
        </div>
      ) : team1Stats && team2Stats ? (
        <div className="max-w-5xl mx-auto">
          {/* Team Headers with Team Logos */}
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 md:mb-8 gap-4 md:gap-0">
            {/* Team 1 */}
            <div className="flex flex-col items-center space-y-2 md:space-y-3 w-full md:w-1/3">
              <div className="w-16 h-16 md:w-32 md:h-32">
                <TeamLogo 
                  teamName={team1Stats.name}
                  leagueId={leagueId}
                  size={64}
                  className="border-2 md:border-4 border-orange-300 shadow-lg md:hidden"
                />
                <TeamLogo 
                  teamName={team1Stats.name}
                  leagueId={leagueId}
                  size={128}
                  className="border-4 border-orange-300 shadow-lg hidden md:block"
                />
              </div>
              <div className="text-center">
                <h3 className="text-base md:text-lg font-bold text-slate-800">{team1Stats.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{team1Stats.games} games</p>
              </div>
            </div>

            {/* VS Divider */}
            <div className="flex items-center justify-center w-full md:w-1/3">
              <div className="text-2xl md:text-3xl font-black text-orange-500 tracking-wider">VS</div>
            </div>

            {/* Team 2 */}
            <div className="flex flex-col items-center space-y-2 md:space-y-3 w-full md:w-1/3">
              <div className="w-16 h-16 md:w-32 md:h-32">
                <TeamLogo 
                  teamName={team2Stats.name}
                  leagueId={leagueId}
                  size={64}
                  className="border-2 md:border-4 border-slate-300 shadow-lg md:hidden"
                />
                <TeamLogo 
                  teamName={team2Stats.name}
                  leagueId={leagueId}
                  size={128}
                  className="border-4 border-slate-300 shadow-lg hidden md:block"
                />
              </div>
              <div className="text-center">
                <h3 className="text-base md:text-lg font-bold text-slate-800">{team2Stats.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{team2Stats.games} games</p>
              </div>
            </div>
          </div>

          {/* Stats Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="py-3 px-4 text-right font-bold text-slate-800">{team1Stats.name}</th>
                  <th className="py-3 px-4 text-center font-bold text-slate-600">Stat</th>
                  <th className="py-3 px-4 text-left font-bold text-slate-800">{team2Stats.name}</th>
                </tr>
              </thead>
              <tbody>
                {getComparisonRows().map((row, index) => (
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

          {/* Legend */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="text-xs text-slate-500 text-center">
              <span className="text-orange-600 font-semibold">Orange</span> = Better stat
              <span className="mx-2">•</span>
              <span className="text-slate-600">Gray</span> = Lower stat
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">Search and select two teams to compare their stats</p>
          {allTeams.length === 0 && (
            <p className="text-xs text-orange-500 mt-2">Loading teams...</p>
          )}
        </div>
      )}
    </div>
  );
}
