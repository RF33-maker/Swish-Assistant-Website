import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, BarChart3, Activity } from 'lucide-react';

interface GamePerformance {
  date: string;
  points: number;
  rebounds: number;
  assists: number;
  fieldGoalPercent: number;
}

interface TeamTrend {
  team: string;
  games: GamePerformance[];
  averagePoints: number;
  trend: 'up' | 'down' | 'stable';
  trendPercent: number;
  recentForm: number[]; // Last 5 games points
}

interface TeamPerformanceTrendsProps {
  playerStats: any[];
  leagueId: string;
}

export default function TeamPerformanceTrends({ playerStats, leagueId }: TeamPerformanceTrendsProps) {
  const [teamTrends, setTeamTrends] = useState<TeamTrend[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [animationPhase, setAnimationPhase] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    calculateTeamTrends();
    // Start animation sequence
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, [playerStats]);

  useEffect(() => {
    if (isVisible && teamTrends.length > 0) {
      // Stagger the animation of trend cards
      const interval = setInterval(() => {
        setAnimationPhase(prev => (prev < teamTrends.length - 1 ? prev + 1 : prev));
      }, 200);
      
      const cleanup = setTimeout(() => clearInterval(interval), teamTrends.length * 200);
      return () => {
        clearInterval(interval);
        clearTimeout(cleanup);
      };
    }
  }, [isVisible, teamTrends.length]);

  const calculateTeamTrends = () => {
    if (!playerStats || playerStats.length === 0) return;

    // Group stats by team and game_id to properly separate games
    const teamGameStats: { [team: string]: { [gameId: string]: GamePerformance & { gameId: string } } } = {};
    
    playerStats.forEach(stat => {
      const team = stat.team;
      const gameId = stat.game_id;
      const date = stat.game_date;
      
      if (!team || !gameId || !date) return;
      
      if (!teamGameStats[team]) {
        teamGameStats[team] = {};
      }
      
      if (!teamGameStats[team][gameId]) {
        teamGameStats[team][gameId] = {
          date,
          gameId,
          points: 0,
          rebounds: 0,
          assists: 0,
          fieldGoalPercent: 0
        };
      }
      
      // Aggregate team stats for this game
      teamGameStats[team][gameId].points += stat.points || 0;
      teamGameStats[team][gameId].rebounds += stat.rebounds_total || 0;
      teamGameStats[team][gameId].assists += stat.assists || 0;
      teamGameStats[team][gameId].fieldGoalPercent += stat.field_goal_percent || 0;
    });

    // Calculate trends for each team
    const trends: TeamTrend[] = Object.entries(teamGameStats).map(([team, gameStats]) => {
      const games = Object.values(gameStats).sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      // Calculate average points
      const totalPoints = games.reduce((sum, game) => sum + game.points, 0);
      const averagePoints = games.length > 0 ? totalPoints / games.length : 0;
      
      // Calculate trend (comparing first half vs second half of games)
      let trend: 'up' | 'down' | 'stable' = 'stable';
      let trendPercent = 0;
      
      if (games.length >= 2) {
        const midPoint = Math.floor(games.length / 2);
        const firstHalfAvg = games.slice(0, midPoint).reduce((sum, g) => sum + g.points, 0) / midPoint;
        const secondHalfAvg = games.slice(midPoint).reduce((sum, g) => sum + g.points, 0) / (games.length - midPoint);
        
        const percentChange = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
        trendPercent = Math.abs(percentChange);
        
        if (percentChange > 5) trend = 'up';
        else if (percentChange < -5) trend = 'down';
        else trend = 'stable';
      }
      
      // Get recent form (last 5 games)
      const recentForm = games.slice(-5).map(game => game.points);
      
      return {
        team,
        games,
        averagePoints: Math.round(averagePoints * 100) / 100,
        trend,
        trendPercent: Math.round(trendPercent * 10) / 10,
        recentForm
      };
    }).sort((a, b) => b.averagePoints - a.averagePoints);

    setTeamTrends(trends);
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return 'text-green-600 bg-green-50 border-green-200';
      case 'down': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const MiniSparkline = ({ data, color }: { data: number[], color: string }) => {
    if (!data || data.length === 0) return null;
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    return (
      <div className="flex items-end h-8 gap-1">
        {data.map((value, index) => {
          const height = ((value - min) / range) * 100;
          return (
            <motion.div
              key={index}
              className={`w-2 ${color} rounded-sm`}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(height, 10)}%` }}
              transition={{ 
                delay: index * 0.1,
                duration: 0.6,
                ease: "easeOut"
              }}
            />
          );
        })}
      </div>
    );
  };

  if (!teamTrends || teamTrends.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-orange-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-orange-600" />
          <h3 className="text-lg font-semibold text-slate-800">Team Performance Trends</h3>
        </div>
        <p className="text-slate-500">No team performance data available yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-orange-200 p-6 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-6 flex-shrink-0">
        <Activity className="w-5 h-5 text-orange-600" />
        <h3 className="text-lg font-semibold text-slate-800">Team Performance Trends</h3>
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
          <BarChart3 className="w-4 h-4" />
          <span>Analyzing {teamTrends.length} teams</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {teamTrends.map((teamTrend, index) => (
          <AnimatePresence key={teamTrend.team}>
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ 
                opacity: isVisible && index <= animationPhase ? 1 : 0,
                y: isVisible && index <= animationPhase ? 0 : 20,
                scale: isVisible && index <= animationPhase ? 1 : 0.95
              }}
              transition={{ 
                duration: 0.5,
                ease: "easeOut",
                delay: index * 0.1
              }}
              className={`border rounded-lg p-4 cursor-pointer transition-all duration-300 hover:shadow-md ${
                selectedTeam === teamTrend.team 
                  ? 'border-orange-300 bg-orange-50 shadow-md' 
                  : 'border-gray-200 hover:border-orange-200 hover:bg-orange-25'
              }`}
              onClick={() => setSelectedTeam(
                selectedTeam === teamTrend.team ? null : teamTrend.team
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-medium text-slate-800 mb-1">{teamTrend.team}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-orange-600">
                      {teamTrend.averagePoints}
                    </span>
                    <span className="text-sm text-slate-500">avg pts</span>
                  </div>
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTrendColor(teamTrend.trend)}`}>
                  {getTrendIcon(teamTrend.trend)}
                  {teamTrend.trendPercent > 0 && (
                    <span>{teamTrend.trendPercent}%</span>
                  )}
                </div>
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">Recent Form</span>
                  <span className="text-xs text-slate-400">{teamTrend.games.length} games</span>
                </div>
                <MiniSparkline 
                  data={teamTrend.recentForm} 
                  color={teamTrend.trend === 'up' ? 'bg-green-400' : teamTrend.trend === 'down' ? 'bg-red-400' : 'bg-gray-400'}
                />
              </div>

              <AnimatePresence>
                {selectedTeam === teamTrend.team && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border-t border-orange-200 pt-3 mt-3"
                  >
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Games Played</span>
                        <div className="font-medium text-slate-800">{teamTrend.games.length}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Total Points</span>
                        <div className="font-medium text-slate-800">
                          {teamTrend.games.reduce((sum, game) => sum + game.points, 0)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Best Game</span>
                        <div className="font-medium text-slate-800">
                          {Math.max(...teamTrend.games.map(g => g.points))} pts
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Consistency</span>
                        <div className="font-medium text-slate-800">
                          {teamTrend.trend === 'stable' ? 'High' : teamTrend.trend === 'up' ? 'Improving' : 'Variable'}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: teamTrends.length * 0.1 + 0.5 }}
          className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg"
        >
          <div className="flex items-start gap-3">
            <BarChart3 className="w-5 h-5 text-orange-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-slate-800 mb-1">Performance Insights</h4>
              <p className="text-sm text-slate-600">
                Click on any team card to see detailed performance metrics. Trends are calculated by comparing 
                the first and second half of games played. Green trends indicate improvement, red indicates decline.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}