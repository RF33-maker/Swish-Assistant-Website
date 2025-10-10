import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Search } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";

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
    const { data: stats, error } = await supabase
      .from("team_stats")
      .select("*")
      .eq("name", teamName)
      .eq("league_id", leagueId);

    if (error || !stats || stats.length === 0) {
      return null;
    }

    const games = stats.length;
    let totalPoints = 0;
    let totalFGM = 0;
    let totalFGA = 0;
    let total3PM = 0;
    let total3PA = 0;
    let totalFTM = 0;
    let totalFTA = 0;
    let totalRebounds = 0;
    let totalAssists = 0;
    let totalSteals = 0;
    let totalBlocks = 0;
    let totalTurnovers = 0;

    stats.forEach((stat: any) => {
      totalPoints += stat.tot_spoints || 0;
      totalFGM += stat.tot_sfieldgoalsmade || 0;
      totalFGA += stat.tot_sfieldgoalsattempted || 0;
      total3PM += stat.tot_sthreepointersmade || 0;
      total3PA += stat.tot_sthreepointersattempted || 0;
      totalFTM += stat.tot_sfreethrowsmade || 0;
      totalFTA += stat.tot_sfreethrowsattempted || 0;
      totalRebounds += stat.tot_sreboundstotal || 0;
      totalAssists += stat.tot_sassists || 0;
      totalSteals += stat.tot_ssteals || 0;
      totalBlocks += stat.tot_sblocks || 0;
      totalTurnovers += stat.tot_sturnovers || 0;
    });

    return {
      name: teamName,
      games,
      ppg: (totalPoints / games).toFixed(1),
      rpg: (totalRebounds / games).toFixed(1),
      apg: (totalAssists / games).toFixed(1),
      spg: (totalSteals / games).toFixed(1),
      bpg: (totalBlocks / games).toFixed(1),
      tpg: (totalTurnovers / games).toFixed(1),
      fgPercentage: totalFGA > 0 ? ((totalFGM / totalFGA) * 100).toFixed(1) : '0.0',
      threePercentage: total3PA > 0 ? ((total3PM / total3PA) * 100).toFixed(1) : '0.0',
      ftPercentage: totalFTA > 0 ? ((totalFTM / totalFTA) * 100).toFixed(1) : '0.0',
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

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-6">Team Comparison</h2>
      
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
                <ComparisonRow label="PPG" value1={team1Stats.ppg} value2={team2Stats.ppg} />
                <ComparisonRow label="RPG" value1={team1Stats.rpg} value2={team2Stats.rpg} />
                <ComparisonRow label="APG" value1={team1Stats.apg} value2={team2Stats.apg} />
                <ComparisonRow label="SPG" value1={team1Stats.spg} value2={team2Stats.spg} />
                <ComparisonRow label="BPG" value1={team1Stats.bpg} value2={team2Stats.bpg} />
                <ComparisonRow label="TPG" value1={team1Stats.tpg} value2={team2Stats.tpg} lowerIsBetter />
                <ComparisonRow label="FG%" value1={`${team1Stats.fgPercentage}%`} value2={`${team2Stats.fgPercentage}%`} />
                <ComparisonRow label="3P%" value1={`${team1Stats.threePercentage}%`} value2={`${team2Stats.threePercentage}%`} />
                <ComparisonRow label="FT%" value1={`${team1Stats.ftPercentage}%`} value2={`${team2Stats.ftPercentage}%`} />
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
