import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowUpIcon, ArrowDownIcon, MinusIcon, Search } from "lucide-react";

interface PlayerComparisonProps {
  leagueId: string;
  allPlayers: any[];
}

export function PlayerComparison({ leagueId, allPlayers }: PlayerComparisonProps) {
  const [player1Id, setPlayer1Id] = useState<string>("");
  const [player2Id, setPlayer2Id] = useState<string>("");
  const [player1Stats, setPlayer1Stats] = useState<any>(null);
  const [player2Stats, setPlayer2Stats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Search states
  const [search1, setSearch1] = useState("");
  const [search2, setSearch2] = useState("");
  const [showDropdown1, setShowDropdown1] = useState(false);
  const [showDropdown2, setShowDropdown2] = useState(false);
  
  // Refs for click outside
  const dropdown1Ref = useRef<HTMLDivElement>(null);
  const dropdown2Ref = useRef<HTMLDivElement>(null);
  
  // Close dropdowns when clicking outside
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

  const fetchPlayerStats = async (playerId: string) => {
    const { data: stats, error } = await supabase
      .from("player_stats")
      .select("*")
      .eq("player_id", playerId)
      .eq("league_id", leagueId);

    if (error || !stats || stats.length === 0) {
      return null;
    }

    // Aggregate stats
    let totalPoints = 0;
    let totalRebounds = 0;
    let totalAssists = 0;
    let totalSteals = 0;
    let totalBlocks = 0;
    let totalTurnovers = 0;
    let totalFGM = 0;
    let totalFGA = 0;
    let total3PM = 0;
    let total3PA = 0;
    let totalFTM = 0;
    let totalFTA = 0;
    let totalMinutes = 0;
    let totalPersonalFouls = 0;
    const games = stats.length;

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
      totalFTM += stat.sfreethrowsmade || 0;
      totalFTA += stat.sfreethrowsattempted || 0;
      totalPersonalFouls += stat.sfoulspersonal || 0;

      const minutesParts = stat.sminutes?.split(':');
      if (minutesParts && minutesParts.length === 2) {
        const minutes = parseInt(minutesParts[0]) + parseInt(minutesParts[1]) / 60;
        totalMinutes += minutes;
      }
    });

    return {
      name: stats[0].name || stats[0].full_name || `${stats[0].firstname || ''} ${stats[0].familyname || ''}`.trim(),
      team: stats[0].team,
      games,
      ppg: (totalPoints / games).toFixed(1),
      rpg: (totalRebounds / games).toFixed(1),
      apg: (totalAssists / games).toFixed(1),
      spg: (totalSteals / games).toFixed(1),
      bpg: (totalBlocks / games).toFixed(1),
      tpg: (totalTurnovers / games).toFixed(1),
      mpg: (totalMinutes / games).toFixed(1),
      fpg: (totalPersonalFouls / games).toFixed(1),
      fgPercentage: totalFGA > 0 ? ((totalFGM / totalFGA) * 100).toFixed(1) : '0.0',
      threePercentage: total3PA > 0 ? ((total3PM / total3PA) * 100).toFixed(1) : '0.0',
      ftPercentage: totalFTA > 0 ? ((totalFTM / totalFTA) * 100).toFixed(1) : '0.0',
      totalPoints,
      totalRebounds,
      totalAssists,
      totalSteals,
      totalBlocks,
      totalTurnovers,
      totalFGM,
      totalFGA,
      total3PM,
      total3PA,
      totalFTM,
      totalFTA
    };
  };

  const handleCompare = async () => {
    if (!player1Id || !player2Id) return;
    
    setIsLoading(true);
    try {
      const [p1Stats, p2Stats] = await Promise.all([
        fetchPlayerStats(player1Id),
        fetchPlayerStats(player2Id)
      ]);
      
      setPlayer1Stats(p1Stats);
      setPlayer2Stats(p2Stats);
    } catch (error) {
      console.error("Error comparing players:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (player1Id && player2Id) {
      handleCompare();
    }
  }, [player1Id, player2Id]);

  // Filter players based on search
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
    setSearch1(`${player.name} - ${player.team}`);
    setShowDropdown1(false);
  };

  const selectPlayer2 = (player: any) => {
    setPlayer2Id(player.playerKey);
    setSearch2(`${player.name} - ${player.team}`);
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
    const p1Better = lowerIsBetter ? num1 < num2 : num1 > num2;
    const p2Better = lowerIsBetter ? num2 < num1 : num2 > num1;

    return (
      <tr className="border-b border-gray-100">
        <td className={`py-3 px-4 text-right font-medium ${p1Better ? 'text-green-600' : p2Better ? 'text-slate-600' : 'text-slate-700'}`}>
          {value1}
        </td>
        <td className="py-3 px-4 text-center font-semibold text-slate-800 bg-gray-50">
          {label}
        </td>
        <td className={`py-3 px-4 text-left font-medium ${p2Better ? 'text-green-600' : p1Better ? 'text-slate-600' : 'text-slate-700'}`}>
          {value2}
        </td>
      </tr>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-6">Player Comparison</h2>
      
      {/* Player Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Player 1 Search */}
        <div className="relative" ref={dropdown1Ref}>
          <label className="block text-sm font-medium text-slate-700 mb-2">
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
                }
              }}
              onFocus={() => setShowDropdown1(true)}
              placeholder="Search for a player..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              data-testid="input-player1-search"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          {showDropdown1 && search1 && filteredPlayers1.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredPlayers1.map((player, idx) => (
                <div
                  key={idx}
                  onClick={() => selectPlayer1(player)}
                  className="px-4 py-2 hover:bg-orange-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  data-testid={`option-player1-${idx}`}
                >
                  <div className="font-medium text-slate-800">{player.name}</div>
                  <div className="text-xs text-slate-600">{player.team} • {player.avgPoints} PPG</div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Player 2 Search */}
        <div className="relative" ref={dropdown2Ref}>
          <label className="block text-sm font-medium text-slate-700 mb-2">
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
                }
              }}
              onFocus={() => setShowDropdown2(true)}
              placeholder="Search for a player..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              data-testid="input-player2-search"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          {showDropdown2 && search2 && filteredPlayers2.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredPlayers2.map((player, idx) => (
                <div
                  key={idx}
                  onClick={() => selectPlayer2(player)}
                  className="px-4 py-2 hover:bg-orange-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  data-testid={`option-player2-${idx}`}
                >
                  <div className="font-medium text-slate-800">{player.name}</div>
                  <div className="text-xs text-slate-600">{player.team} • {player.avgPoints} PPG</div>
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
      ) : player1Stats && player2Stats ? (
        <div className="max-w-5xl mx-auto">
          {/* Player Headers with Image Placeholders */}
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 md:mb-8 gap-4 md:gap-0">
            {/* Player 1 */}
            <div className="flex flex-col items-center space-y-2 md:space-y-3 w-full md:w-1/3">
              <div className="w-16 h-16 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 border-2 md:border-4 border-orange-300 flex items-center justify-center">
                <div className="text-2xl md:text-4xl font-bold text-orange-600">{player1Stats.name.charAt(0)}</div>
              </div>
              <div className="text-center">
                <h3 className="text-base md:text-lg font-bold text-slate-800">{player1Stats.name}</h3>
                <p className="text-xs md:text-sm text-slate-600">{player1Stats.team}</p>
                <p className="text-xs text-slate-500 mt-1">{player1Stats.games} games</p>
              </div>
            </div>

            {/* VS Divider */}
            <div className="flex items-center justify-center w-full md:w-1/3">
              <div className="text-2xl md:text-3xl font-black text-orange-500 tracking-wider">VS</div>
            </div>

            {/* Player 2 */}
            <div className="flex flex-col items-center space-y-2 md:space-y-3 w-full md:w-1/3">
              <div className="w-16 h-16 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border-2 md:border-4 border-slate-300 flex items-center justify-center">
                <div className="text-2xl md:text-4xl font-bold text-slate-600">{player2Stats.name.charAt(0)}</div>
              </div>
              <div className="text-center">
                <h3 className="text-base md:text-lg font-bold text-slate-800">{player2Stats.name}</h3>
                <p className="text-xs md:text-sm text-slate-600">{player2Stats.team}</p>
                <p className="text-xs text-slate-500 mt-1">{player2Stats.games} games</p>
              </div>
            </div>
          </div>

          {/* Stats Comparison - Head to Head Style */}
          <div className="space-y-3 md:space-y-4">
            {/* Points Per Game */}
            {(() => {
              const p1Better = parseFloat(player1Stats.ppg) > parseFloat(player2Stats.ppg);
              const p2Better = parseFloat(player2Stats.ppg) > parseFloat(player1Stats.ppg);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player1Stats.ppg}
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Points Per Game</div>
                    <div className="text-xs text-slate-500">PPG</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player2Stats.ppg}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Rebounds Per Game */}
            {(() => {
              const p1Better = parseFloat(player1Stats.rpg) > parseFloat(player2Stats.rpg);
              const p2Better = parseFloat(player2Stats.rpg) > parseFloat(player1Stats.rpg);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player1Stats.rpg}
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Rebounds Per Game</div>
                    <div className="text-xs text-slate-500">RPG</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player2Stats.rpg}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Assists Per Game */}
            {(() => {
              const p1Better = parseFloat(player1Stats.apg) > parseFloat(player2Stats.apg);
              const p2Better = parseFloat(player2Stats.apg) > parseFloat(player1Stats.apg);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player1Stats.apg}
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Assists Per Game</div>
                    <div className="text-xs text-slate-500">APG</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player2Stats.apg}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Field Goal Percentage */}
            {(() => {
              const p1Better = parseFloat(player1Stats.fgPercentage) > parseFloat(player2Stats.fgPercentage);
              const p2Better = parseFloat(player2Stats.fgPercentage) > parseFloat(player1Stats.fgPercentage);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player1Stats.fgPercentage}%
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Field Goal %</div>
                    <div className="text-xs text-slate-500">FG%</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player2Stats.fgPercentage}%
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Three Point Percentage */}
            {(() => {
              const p1Better = parseFloat(player1Stats.threePercentage) > parseFloat(player2Stats.threePercentage);
              const p2Better = parseFloat(player2Stats.threePercentage) > parseFloat(player1Stats.threePercentage);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player1Stats.threePercentage}%
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Three Point %</div>
                    <div className="text-xs text-slate-500">3P%</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player2Stats.threePercentage}%
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Free Throw Percentage */}
            {(() => {
              const p1Better = parseFloat(player1Stats.ftPercentage) > parseFloat(player2Stats.ftPercentage);
              const p2Better = parseFloat(player2Stats.ftPercentage) > parseFloat(player1Stats.ftPercentage);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player1Stats.ftPercentage}%
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Free Throw %</div>
                    <div className="text-xs text-slate-500">FT%</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player2Stats.ftPercentage}%
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Blocks Per Game */}
            {(() => {
              const p1Better = parseFloat(player1Stats.bpg) > parseFloat(player2Stats.bpg);
              const p2Better = parseFloat(player2Stats.bpg) > parseFloat(player1Stats.bpg);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player1Stats.bpg}
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Blocks Per Game</div>
                    <div className="text-xs text-slate-500">BPG</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player2Stats.bpg}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Steals Per Game */}
            {(() => {
              const p1Better = parseFloat(player1Stats.spg) > parseFloat(player2Stats.spg);
              const p2Better = parseFloat(player2Stats.spg) > parseFloat(player1Stats.spg);
              return (
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-end order-2 md:order-1">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p1Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player1Stats.spg}
                    </div>
                  </div>
                  <div className="text-center w-full md:w-auto md:min-w-[200px] order-1 md:order-2">
                    <div className="font-bold text-slate-800 text-base md:text-lg">Steals Per Game</div>
                    <div className="text-xs text-slate-500">SPG</div>
                  </div>
                  <div className="w-full md:w-auto md:flex-1 md:flex md:justify-start order-3">
                    <div className={`px-4 py-2 md:px-6 md:py-3 rounded-full ${p2Better ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'} font-bold text-lg md:text-2xl min-w-[80px] md:min-w-[100px] text-center`}>
                      {player2Stats.spg}
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
          <p className="text-sm">Search and select two players to compare their stats</p>
          {allPlayers.length === 0 && (
            <p className="text-xs text-orange-500 mt-2">Loading players...</p>
          )}
        </div>
      )}
    </div>
  );
}
