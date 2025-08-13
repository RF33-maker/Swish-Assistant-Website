import { useState } from 'react';
import { FileText, Users, BarChart3, Target, TrendingUp } from 'lucide-react';
import TeamPerformanceTrends from '@/components/TeamPerformanceTrends';
import SwishLogo from '@/assets/Swish Assistant Logo.png';

interface ThreePaneEditorProps {
  selectedLeague: any;
  playerStats: any[];
  onChatInsert: (content: string) => void;
}

export function ThreePaneEditor({ selectedLeague, playerStats, onChatInsert }: ThreePaneEditorProps) {
  const [activeSection, setActiveSection] = useState('trends');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-6 border-b border-gray-200">
        <BarChart3 className="w-6 h-6 text-orange-600" />
        <h2 className="text-xl font-bold text-slate-800">Team Performance Trends</h2>
        {selectedLeague && (
          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-sm rounded-full">
            {selectedLeague.name}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-hidden">
        {selectedLeague ? (
          <div className="h-full">
            <TeamPerformanceTrends 
              playerStats={playerStats} 
              leagueId={selectedLeague.league_id} 
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-800 mb-2">No League Selected</h3>
              <p className="text-slate-600 mb-4">
                Select a league from the analytics dashboard to view team performance trends.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <img 
                  src={SwishLogo} 
                  alt="Swish Assistant" 
                  className="w-4 h-4 object-contain"
                />
                <span>AI-powered insights coming soon</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}