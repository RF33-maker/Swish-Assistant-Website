import { useState } from 'react';
import { 
  FileText, 
  Plus, 
  Grip, 
  ChevronRight,
  User,
  BarChart3,
  MessageCircle,
  Download,
  Settings,
  Palette,
  Calendar,
  MapPin
} from 'lucide-react';

interface ThreePaneEditorProps {
  selectedLeague?: any;
  onChatInsert?: (content: string) => void;
}

export function ThreePaneEditor({ selectedLeague, onChatInsert }: ThreePaneEditorProps) {
  const [activeTab, setActiveTab] = useState<'blocks' | 'templates'>('blocks');
  const [activeInspectorTab, setActiveInspectorTab] = useState<'assists' | 'context' | 'branding' | 'export'>('assists');

  const blocks = [
    { id: 'game-header', name: 'Game Header', icon: Calendar, count: 'GR' },
    { id: 'four-factors', name: 'Four Factors', icon: BarChart3, count: '33' },
    { id: 'player-card', name: 'Player Card', icon: User, count: '1.8' },
    { id: 'ai-summary', name: 'AI Summary', icon: MessageCircle, count: '5.3' },
    { id: 'tendencies', name: 'Tendencies', icon: ChevronRight, count: '' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Scouting Report</h2>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
            <MessageCircle className="w-4 h-4" />
            Assist
          </button>
        </div>
      </div>

      {/* 3-Pane Layout */}
      <div className="flex h-[600px]">
        {/* Left Pane - Blocks/Templates */}
        <div className="w-80 border-r border-gray-200 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('blocks')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                activeTab === 'blocks'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Blocks
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                activeTab === 'templates'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Templates
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'blocks' && (
              <div className="space-y-2">
                {blocks.map((block) => {
                  const IconComponent = block.icon;
                  return (
                    <div
                      key={block.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 cursor-pointer transition group"
                      draggable
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-gray-100 rounded group-hover:bg-orange-100 transition">
                          <IconComponent className="w-4 h-4 text-gray-600 group-hover:text-orange-600" />
                        </div>
                        <span className="font-medium text-slate-800 text-sm">{block.name}</span>
                      </div>
                      {block.count && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {block.count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'templates' && (
              <div className="space-y-4">
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="font-medium mb-1">No Templates Yet</h3>
                  <p className="text-sm">Create your first template from a completed report</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center Pane - Canvas */}
        <div className="flex-1 flex flex-col">
          {/* Canvas Header */}
          <div className="border-b border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Tendencies</span>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">8.25 %</span>
              </div>
              <button className="p-1 hover:bg-gray-100 rounded">
                <Settings className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Canvas Content */}
          <div className="flex-1 p-6 overflow-y-auto bg-white">
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Sample Content */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-bold text-lg mb-4">Tendencies</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-gray-600">Effective FG %</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">4.5%</span>
                        <span className="text-xs text-red-600">0.3%</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Turnover %</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">6.53</span>
                        <span className="text-xs text-green-600">+6.3</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-gray-600">Offensive Rebound %</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">2.23</span>
                        <span className="text-xs text-red-600">0.3%</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Free Throw Rate</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">1.23</span>
                        <span className="text-xs">4.7</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-bold text-lg mb-3">Tendencies</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Mason isos off gerrit aod hv pn.
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Pistol penn 1 minutes.
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    ICE side ball all screens
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane - Inspector */}
        <div className="w-80 border-l border-gray-200 flex flex-col">
          {/* Inspector Tabs */}
          <div className="border-b border-gray-200 px-4 py-3">
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setActiveInspectorTab('assists')}
                className={`px-3 py-2 text-xs font-medium rounded transition ${
                  activeInspectorTab === 'assists'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Assists
              </button>
              <button
                onClick={() => setActiveInspectorTab('context')}
                className={`px-3 py-2 text-xs font-medium rounded transition ${
                  activeInspectorTab === 'context'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Context
              </button>
            </div>
          </div>

          {/* Inspector Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeInspectorTab === 'assists' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-slate-800 mb-2">How can I help you?</h4>
                  <button className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Insert</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </button>
                </div>
              </div>
            )}

            {activeInspectorTab === 'context' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Context</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium text-slate-700 mb-1">Bears • Sharks</div>
                      <div className="text-xs text-gray-500">September 11, 2025</div>
                      <div className="text-xs text-gray-500">City Arena</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Branding</h4>
                  <div className="flex gap-2 mb-3">
                    <div className="w-6 h-6 bg-yellow-500 rounded"></div>
                    <div className="w-6 h-6 bg-blue-900 rounded"></div>
                    <div className="w-6 h-6 bg-red-600 rounded"></div>
                    <div className="w-6 h-6 bg-black rounded"></div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Export</h4>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option>Classic</option>
                    <option>Modern</option>
                    <option>Dark</option>
                  </select>
                  
                  <button className="w-full mt-3 px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition text-sm font-medium flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" />
                    PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}