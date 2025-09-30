import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from "lucide-react";

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
      name: stats[0].name || stats[0].full_name,
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

  const getComparisonIcon = (val1: number, val2: number, lowerIsBetter = false) => {
    if (val1 === val2) {
      return <MinusIcon className="w-4 h-4 text-gray-400" />;
    }
    
    const isP1Better = lowerIsBetter ? val1 < val2 : val1 > val2;
    
    if (isP1Better) {
      return <ArrowUpIcon className="w-4 h-4 text-green-600" />;
    } else {
      return <ArrowDownIcon className="w-4 h-4 text-red-600" />;
    }
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
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Player 1
          </label>
          <select
            value={player1Id}
            onChange={(e) => setPlayer1Id(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            data-testid="select-player1"
          >
            <option value="">Select a player...</option>
            {allPlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name} - {player.team}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Player 2
          </label>
          <select
            value={player2Id}
            onChange={(e) => setPlayer2Id(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            data-testid="select-player2"
          >
            <option value="">Select a player...</option>
            {allPlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name} - {player.team}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison Results */}
      {isLoading ? (
        <div className="text-center py-8">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-600 mt-2">Loading comparison...</p>
        </div>
      ) : player1Stats && player2Stats ? (
        <div>
          {/* Player Headers */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-800">{player1Stats.name}</h3>
              <p className="text-sm text-slate-600">{player1Stats.team}</p>
              <p className="text-xs text-slate-500 mt-1">{player1Stats.games} games</p>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-2xl font-bold text-orange-500">VS</div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-800">{player2Stats.name}</h3>
              <p className="text-sm text-slate-600">{player2Stats.team}</p>
              <p className="text-xs text-slate-500 mt-1">{player2Stats.games} games</p>
            </div>
          </div>

          {/* Stats Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                <ComparisonRow label="PPG" value1={player1Stats.ppg} value2={player2Stats.ppg} />
                <ComparisonRow label="RPG" value1={player1Stats.rpg} value2={player2Stats.rpg} />
                <ComparisonRow label="APG" value1={player1Stats.apg} value2={player2Stats.apg} />
                <ComparisonRow label="SPG" value1={player1Stats.spg} value2={player2Stats.spg} />
                <ComparisonRow label="BPG" value1={player1Stats.bpg} value2={player2Stats.bpg} />
                <ComparisonRow label="TPG" value1={player1Stats.tpg} value2={player2Stats.tpg} lowerIsBetter />
                <ComparisonRow label="MPG" value1={player1Stats.mpg} value2={player2Stats.mpg} />
                <ComparisonRow label="FG%" value1={`${player1Stats.fgPercentage}%`} value2={`${player2Stats.fgPercentage}%`} />
                <ComparisonRow label="3P%" value1={`${player1Stats.threePercentage}%`} value2={`${player2Stats.threePercentage}%`} />
                <ComparisonRow label="FT%" value1={`${player1Stats.ftPercentage}%`} value2={`${player2Stats.ftPercentage}%`} />
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-xs text-slate-500 space-y-1">
              <div className="font-semibold text-slate-600 mb-2">Legend:</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <span>PPG = Points Per Game</span>
                <span>RPG = Rebounds Per Game</span>
                <span>APG = Assists Per Game</span>
                <span>SPG = Steals Per Game</span>
                <span>BPG = Blocks Per Game</span>
                <span>TPG = Turnovers Per Game</span>
                <span>MPG = Minutes Per Game</span>
                <span>FG% = Field Goal %</span>
                <span>3P% = Three Point %</span>
                <span>FT% = Free Throw %</span>
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="text-green-600 font-semibold">Green</span> = Better stat
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-slate-600">Gray</span> = Worse stat
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">Select two players to compare their stats</p>
        </div>
      )}
    </div>
  );
}
