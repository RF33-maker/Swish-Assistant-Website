import { useState, useEffect } from 'react';
import { BarChart3, Users, TrendingUp, Search, Target } from 'lucide-react';
import SwishLogo from '@/assets/Swish Assistant Logo.png';

interface AnalyticsDashboardProps {
  selectedLeague: any;
  playerStats: any[];
  onLeagueSelect: (league: any) => void;
  leagues: any[];
}

export function AnalyticsDashboard({ selectedLeague, playerStats, onLeagueSelect, leagues }: AnalyticsDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredLeagues, setFilteredLeagues] = useState<any[]>([]);

  useEffect(() => {
    const filtered = leagues.filter(league => 
      league.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredLeagues(filtered);
  }, [leagues, searchQuery]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-6 h-6 text-orange-600" />
        <h2 className="text-xl font-bold text-slate-800">Analytics Dashboard</h2>
      </div>
      
      {/* League Selection */}
      <div className="mb-6">
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search your leagues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>

          {/* League Results */}
          {searchQuery && (
            <div className="border border-gray-200 rounded-md">
              {filteredLeagues.length > 0 ? (
                filteredLeagues.map(league => (
                  <button
                    key={league.league_id}
                    onClick={() => {
                      onLeagueSelect(league);
                      setSearchQuery('');
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none transition text-sm"
                  >
                    <div className="font-medium text-slate-800">{league.name}</div>
                    <div className="text-xs text-slate-500">Created {new Date(league.created_at).toLocaleDateString()}</div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500">No leagues found matching "{searchQuery}"</div>
              )}
            </div>
          )}

          {/* Selected League Display */}
          {selectedLeague && (
            <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-md">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <div>
                  <span className="font-medium text-slate-800">{selectedLeague.name}</span>
                  <span className="text-sm text-slate-500 ml-2">
                    ({playerStats.length} records)
                  </span>
                </div>
              </div>
              <button
                onClick={() => onLeagueSelect(null)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                ✕
              </button>
            </div>
          )}

          {/* Quick League Access for single league */}
          {leagues.length === 1 && !selectedLeague && (
            <button
              onClick={() => onLeagueSelect(leagues[0])}
              className="w-full p-3 border-2 border-dashed border-orange-300 rounded-md hover:border-orange-400 hover:bg-orange-50 transition text-center"
            >
              <div className="font-medium text-slate-800">{leagues[0].name}</div>
              <div className="text-sm text-orange-600">Click to select</div>
            </button>
          )}
        </div>
      </div>

      {/* Quick Stats Cards */}
      {selectedLeague && playerStats.length > 0 && (
        <div className="grid grid-cols-1 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Players</p>
                <p className="text-2xl font-bold text-slate-800">
                  {new Set(playerStats.map(p => p.name)).size}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <BarChart3 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Games Recorded</p>
                <p className="text-2xl font-bold text-slate-800">
                  {new Set(playerStats.map(p => p.game_id)).size}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Teams Tracked</p>
                <p className="text-2xl font-bold text-slate-800">
                  {new Set(playerStats.map(p => p.team).filter(Boolean)).size}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Coaching Tips */}
      {selectedLeague && (
        <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <img 
              src={SwishLogo} 
              alt="Coaching Tips" 
              className="w-6 h-6 mt-1 object-contain"
            />
            <div>
              <h3 className="font-semibold text-slate-800 mb-2">AI Insights</h3>
              <div className="text-sm text-slate-700 space-y-2">
                <p>
                  <strong>↗️ Green:</strong> Teams improving
                </p>
                <p>
                  <strong>↘️ Red:</strong> Teams declining
                </p>
                <p>
                  <strong>➡️ Stable:</strong> Consistent performance
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!selectedLeague && (
        <div className="text-center py-8 text-slate-500">
          <Target className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-semibold mb-2">Select a League</h3>
          <p className="text-sm">Choose a league above to view analytics</p>
        </div>
      )}
    </div>
  );
}