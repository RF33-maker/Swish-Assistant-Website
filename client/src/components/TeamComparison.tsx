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

          {/* Stats Comparison */}
          <div className="space-y-3 md:space-y-4">
            {/* Points Per Game */}
            {(() => {
              const t1Better = parseFloat(team1Stats.ppg) > parseFloat(team2Stats.ppg);
              const t2Better = parseFloat(team2Stats.ppg) > parseFloat(team1Stats.ppg);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team1Stats.ppg}
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Points Per Game</div>
                    <div className="text-xs text-slate-500">PPG</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team2Stats.ppg}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Rebounds Per Game */}
            {(() => {
              const t1Better = parseFloat(team1Stats.rpg) > parseFloat(team2Stats.rpg);
              const t2Better = parseFloat(team2Stats.rpg) > parseFloat(team1Stats.rpg);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team1Stats.rpg}
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Rebounds Per Game</div>
                    <div className="text-xs text-slate-500">RPG</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team2Stats.rpg}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Assists Per Game */}
            {(() => {
              const t1Better = parseFloat(team1Stats.apg) > parseFloat(team2Stats.apg);
              const t2Better = parseFloat(team2Stats.apg) > parseFloat(team1Stats.apg);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team1Stats.apg}
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Assists Per Game</div>
                    <div className="text-xs text-slate-500">APG</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team2Stats.apg}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Field Goal Percentage */}
            {(() => {
              const t1Better = parseFloat(team1Stats.fgPercentage) > parseFloat(team2Stats.fgPercentage);
              const t2Better = parseFloat(team2Stats.fgPercentage) > parseFloat(team1Stats.fgPercentage);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team1Stats.fgPercentage}%
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Field Goal %</div>
                    <div className="text-xs text-slate-500">FG%</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team2Stats.fgPercentage}%
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Three Point Percentage */}
            {(() => {
              const t1Better = parseFloat(team1Stats.threePercentage) > parseFloat(team2Stats.threePercentage);
              const t2Better = parseFloat(team2Stats.threePercentage) > parseFloat(team1Stats.threePercentage);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team1Stats.threePercentage}%
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Three Point %</div>
                    <div className="text-xs text-slate-500">3P%</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team2Stats.threePercentage}%
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Free Throw Percentage */}
            {(() => {
              const t1Better = parseFloat(team1Stats.ftPercentage) > parseFloat(team2Stats.ftPercentage);
              const t2Better = parseFloat(team2Stats.ftPercentage) > parseFloat(team1Stats.ftPercentage);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team1Stats.ftPercentage}%
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Free Throw %</div>
                    <div className="text-xs text-slate-500">FT%</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team2Stats.ftPercentage}%
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Blocks Per Game */}
            {(() => {
              const t1Better = parseFloat(team1Stats.bpg) > parseFloat(team2Stats.bpg);
              const t2Better = parseFloat(team2Stats.bpg) > parseFloat(team1Stats.bpg);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team1Stats.bpg}
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Blocks Per Game</div>
                    <div className="text-xs text-slate-500">BPG</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team2Stats.bpg}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Steals Per Game */}
            {(() => {
              const t1Better = parseFloat(team1Stats.spg) > parseFloat(team2Stats.spg);
              const t2Better = parseFloat(team2Stats.spg) > parseFloat(team1Stats.spg);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team1Stats.spg}
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Steals Per Game</div>
                    <div className="text-xs text-slate-500">SPG</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${t2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {team2Stats.spg}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Legend */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="text-xs text-slate-500 text-center">
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-orange-100 text-orange-600 rounded-full font-semibold">
                Orange = Better stat
              </span>
              <span className="ml-3 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-600 rounded-full">
                Gray = Lower stat
              </span>
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
