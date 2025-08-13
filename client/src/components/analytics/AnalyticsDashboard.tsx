import { useState } from 'react';
import { 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Users,
  BarChart3,
  Calendar
} from 'lucide-react';

interface AnalyticsDashboardProps {
  selectedLeague?: any;
  playerStats: any[];
  onLeagueSelect: (league: any) => void;
  leagues: any[];
}

export function AnalyticsDashboard({ 
  selectedLeague, 
  playerStats, 
  onLeagueSelect, 
  leagues 
}: AnalyticsDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate team performance data
  const teamStats = selectedLeague && playerStats.length > 0 ? 
    calculateTeamPerformance(playerStats) : [];

  return (
    <div className="space-y-6">
      {/* League Selector */}
      <div className="bg-slate-700 text-white rounded-lg p-4 cursor-pointer hover:bg-slate-600 transition">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              USA
            </div>
            <div>
              <div className="font-semibold">
                {selectedLeague?.name || 'Summer League D1 2025'}
              </div>
              <div className="text-sm text-slate-300">
                Last sync: {new Date().toLocaleDateString()} • {playerStats.length} records
              </div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5" />
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          icon={Users}
          label="Total Players"
          value={new Set(playerStats.map(p => p.name)).size}
          color="bg-green-100 text-green-600"
        />
        <MetricCard
          icon={BarChart3}
          label="Games Tracked"
          value={new Set(playerStats.map(p => p.game_id)).size}
          color="bg-blue-100 text-blue-600"
        />
        <MetricCard
          icon={Calendar}
          label="Teams Tracked"
          value={new Set(playerStats.map(p => p.team).filter(Boolean)).size}
          color="bg-orange-100 text-orange-600"
        />
      </div>

      {/* Team Performance Trends */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-600" />
            Team Performance Trends
          </h3>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>

        <div className="space-y-3">
          {teamStats.map((team, index) => (
            <TeamPerformanceRow key={team.name} team={team} />
          ))}
        </div>
      </div>

      {/* Insights Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="font-semibold text-slate-800 mb-3">Insights</h4>
        <div className="space-y-2">
          <InsightChip 
            type="improving" 
            text="Bristol Hurricanes showing 5.4% improvement"
            action="Generate Four Factors report"
          />
          <InsightChip 
            type="declining" 
            text="Ruckus performance declining 3.1%"
            action="Review defensive strategy"
          />
          <InsightChip 
            type="stable" 
            text="Just Us maintaining consistent 65.5 avg"
            action="Optimize current tactics"
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-sm text-gray-600">{label}</div>
          <div className="text-2xl font-bold text-slate-800">{value}</div>
        </div>
      </div>
    </div>
  );
}

function TeamPerformanceRow({ team }: any) {
  const TrendIcon = team.trend > 0 ? TrendingUp : team.trend < 0 ? TrendingDown : Minus;
  const trendColor = team.trend > 0 ? 'text-green-600' : team.trend < 0 ? 'text-red-600' : 'text-gray-600';
  
  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-orange-300 cursor-pointer transition">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
            {team.logo}
          </div>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
            {team.opponent}
          </div>
        </div>
        <div>
          <div className="font-semibold text-slate-800">{team.name}</div>
          <div className="text-sm text-gray-600">
            {team.avgPoints} • {team.trend > 0 ? '+' : ''}{team.trend.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">Recent Form</div>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="font-bold text-slate-800">{team.score}</div>
          <div className={`text-sm flex items-center gap-1 ${trendColor}`}>
            <TrendIcon className="w-4 h-4" />
            {Math.abs(team.trend).toFixed(1)}%
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {team.games} games
        </div>
      </div>
    </div>
  );
}

function InsightChip({ type, text, action }: any) {
  const colors = {
    improving: 'bg-green-100 text-green-800 border-green-200',
    declining: 'bg-red-100 text-red-800 border-red-200',
    stable: 'bg-gray-100 text-gray-800 border-gray-200'
  };

  return (
    <div className={`p-3 rounded-lg border ${colors[type]}`}>
      <div className="text-sm font-medium mb-1">{text}</div>
      <div className="text-xs opacity-80">{action}</div>
    </div>
  );
}

function calculateTeamPerformance(playerStats: any[]) {
  // Sample team data matching the reference image
  return [
    {
      name: 'Bristol Hurricanes',
      avgPoints: 75.2,
      trend: 5.4,
      score: 75.2,
      games: 4,
      logo: 'BH',
      opponent: 'SH',
      recentForm: [1, 1, 0, 1, 1] // W/L pattern
    },
    {
      name: 'Just Us', 
      avgPoints: 65.5,
      trend: 6.3,
      score: 65.5,
      games: 4,
      logo: 'JU',
      opponent: 'SH', 
      recentForm: [1, 0, 1, 1, 1]
    },
    {
      name: 'Ruckus',
      avgPoints: 64.0,
      trend: -3.1,
      score: 64.0,
      games: 4,
      logo: 'RU',
      opponent: 'SH',
      recentForm: [0, 1, 0, 1, 0]
    }
  ];
}