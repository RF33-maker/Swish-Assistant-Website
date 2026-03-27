import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Check, Code, BarChart3, Users, Trophy, Gamepad2 } from "lucide-react";
import {
  type WidgetParams,
  type WidgetType,
  type WidgetLayout as WidgetLayoutType,
  WIDGET_DEFAULTS,
  LAYOUT_PRESETS,
  FONT_OPTIONS,
  buildWidgetUrl,
  buildEmbedCode,
} from "@/lib/widgetUtils";

interface LeagueOption {
  league_id: string;
  name: string;
  slug: string;
}

interface PlayerOption {
  id: string;
  full_name: string;
  name: string;
  slug: string;
  team: string;
}

const WIDGET_TYPES: Array<{ value: WidgetType; label: string; icon: typeof BarChart3; desc: string }> = [
  { value: 'standings', label: 'League Standings', icon: BarChart3, desc: 'Team win/loss records and rankings' },
  { value: 'player-stats', label: 'Player Stats Card', icon: Users, desc: 'Individual player stat summary' },
  { value: 'game-scores', label: 'Game Scores', icon: Gamepad2, desc: 'Recent game results and scores' },
  { value: 'league-leaders', label: 'League Leaders', icon: Trophy, desc: 'Top performers by category' },
];

export default function WidgetBuilder() {
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);

  const [widgetType, setWidgetType] = useState<WidgetType>('standings');
  const [leagueId, setLeagueId] = useState('');
  const [leagueSlug, setLeagueSlug] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [primaryColor, setPrimaryColor] = useState(WIDGET_DEFAULTS.primaryColor);
  const [accentColor, setAccentColor] = useState(WIDGET_DEFAULTS.accentColor);
  const [bgColor, setBgColor] = useState(WIDGET_DEFAULTS.bgColor);
  const [font, setFont] = useState(WIDGET_DEFAULTS.font);
  const [borderRadius, setBorderRadius] = useState(WIDGET_DEFAULTS.borderRadius);
  const [layout, setLayout] = useState<WidgetLayoutType>(WIDGET_DEFAULTS.layout);
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [customHeight, setCustomHeight] = useState<number | null>(null);

  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);

  useEffect(() => {
    const fetchLeagues = async () => {
      const { data } = await supabase
        .from("leagues")
        .select("league_id, name, slug")
        .eq("is_public", true)
        .order("name");
      if (data) setLeagues(data);
      setLoadingLeagues(false);
    };
    fetchLeagues();
  }, []);

  useEffect(() => {
    if (widgetType !== 'player-stats' || !leagueId) {
      setPlayers([]);
      return;
    }
    const fetchPlayers = async () => {
      setLoadingPlayers(true);
      const { data } = await supabase
        .from("players")
        .select("id, full_name, name, slug, team")
        .eq("league_id", leagueId)
        .order("full_name");
      if (data) setPlayers(data);
      setLoadingPlayers(false);
    };
    fetchPlayers();
  }, [widgetType, leagueId]);

  const supportsTeamFilter = widgetType === 'standings' || widgetType === 'game-scores';

  useEffect(() => {
    if (!supportsTeamFilter || !leagueId) {
      setTeams([]);
      setTeamName('');
      return;
    }
    const fetchTeams = async () => {
      setLoadingTeams(true);
      const { data } = await supabase
        .from("team_stats")
        .select("name")
        .eq("league_id", leagueId);
      if (data) {
        const uniqueNames = Array.from(new Set(data.map((t: { name: string }) => t.name).filter(Boolean)));
        uniqueNames.sort();
        setTeams(uniqueNames);
      }
      setLoadingTeams(false);
    };
    fetchTeams();
  }, [supportsTeamFilter, leagueId]);

  const dimensions = useMemo(() => {
    const preset = LAYOUT_PRESETS[layout];
    return {
      width: customWidth || preset.width,
      height: customHeight || preset.height,
    };
  }, [layout, customWidth, customHeight]);

  const widgetParams: WidgetParams = useMemo(() => ({
    type: widgetType,
    leagueId: leagueId || undefined,
    leagueSlug: leagueSlug || undefined,
    playerId: playerId || undefined,
    teamName: teamName || undefined,
    primaryColor,
    accentColor,
    bgColor,
    font,
    borderRadius,
    layout,
    width: dimensions.width,
    height: dimensions.height,
  }), [widgetType, leagueId, leagueSlug, playerId, teamName, primaryColor, accentColor, bgColor, font, borderRadius, layout, dimensions]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const widgetUrl = useMemo(() => buildWidgetUrl(baseUrl, widgetParams), [baseUrl, widgetParams]);
  const embedCode = useMemo(() => buildEmbedCode(widgetUrl, dimensions.width, dimensions.height), [widgetUrl, dimensions]);

  const iframeUrl = widgetUrl;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = embedCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeagueChange = (value: string) => {
    setLeagueId(value);
    const league = leagues.find(l => l.league_id === value);
    setLeagueSlug(league?.slug || '');
    setPlayerId('');
    setTeamName('');
  };

  const needsPlayer = widgetType === 'player-stats';
  const hasRequiredData = needsPlayer ? (!!playerId && !!leagueId) : !!leagueId;

  const labelStyle = "text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block";
  const inputStyle = "w-full px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5 text-orange-600" />
            <h1 className="text-xl font-bold text-slate-900">Widget Builder</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-xl border border-orange-100 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">1</span>
                Widget Type
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {WIDGET_TYPES.map(wt => {
                  const Icon = wt.icon;
                  const active = widgetType === wt.value;
                  return (
                    <button
                      key={wt.value}
                      onClick={() => setWidgetType(wt.value)}
                      className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left transition-all ${
                        active
                          ? 'border-orange-500 bg-orange-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/30'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? 'text-orange-600' : 'text-slate-400'}`} />
                      <span className={`text-xs font-semibold ${active ? 'text-orange-800' : 'text-slate-700'}`}>{wt.label}</span>
                      <span className="text-[10px] text-slate-400 leading-tight">{wt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-orange-100 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">2</span>
                Data Source
              </h2>

              <div>
                <label className={labelStyle}>League</label>
                <select
                  className={inputStyle}
                  value={leagueId}
                  onChange={e => handleLeagueChange(e.target.value)}
                  disabled={loadingLeagues}
                >
                  <option value="">Select a league...</option>
                  {leagues.map(l => (
                    <option key={l.league_id} value={l.league_id}>{l.name}</option>
                  ))}
                </select>
              </div>

              {needsPlayer && (
                <div>
                  <label className={labelStyle}>Player</label>
                  <select
                    className={inputStyle}
                    value={playerId}
                    onChange={e => setPlayerId(e.target.value)}
                    disabled={loadingPlayers || !leagueId}
                  >
                    <option value="">{!leagueId ? 'Select a league first...' : 'Select a player...'}</option>
                    {players.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name || p.name} {p.team ? `(${p.team})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {supportsTeamFilter && (
                <div>
                  <label className={labelStyle}>Team (optional filter)</label>
                  <select
                    className={inputStyle}
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    disabled={loadingTeams || !leagueId}
                  >
                    <option value="">{!leagueId ? 'Select a league first...' : 'All teams'}</option>
                    {teams.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-orange-100 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">3</span>
                Appearance
              </h2>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelStyle}>Primary</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded" />
                  </div>
                </div>
                <div>
                  <label className={labelStyle}>Accent</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <input type="text" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded" />
                  </div>
                </div>
                <div>
                  <label className={labelStyle}>Background</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)} className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded" />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelStyle}>Font</label>
                <select className={inputStyle} value={font} onChange={e => setFont(e.target.value)}>
                  {FONT_OPTIONS.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelStyle}>Border Radius: {borderRadius}px</label>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={borderRadius}
                  onChange={e => setBorderRadius(parseInt(e.target.value))}
                  className="w-full accent-orange-500"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-orange-100 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">4</span>
                Size & Layout
              </h2>

              <div className="flex gap-2">
                {(['compact', 'standard', 'wide'] as WidgetLayoutType[]).map(preset => (
                  <button
                    key={preset}
                    onClick={() => { setLayout(preset); setCustomWidth(null); setCustomHeight(null); }}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold capitalize transition-all border-2 ${
                      layout === preset && !customWidth
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-slate-200 text-slate-500 hover:border-orange-200'
                    }`}
                  >
                    {preset}
                    <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                      {LAYOUT_PRESETS[preset].width}x{LAYOUT_PRESETS[preset].height}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Custom Width (px)</label>
                  <input
                    type="number"
                    className={inputStyle}
                    placeholder={String(LAYOUT_PRESETS[layout].width)}
                    value={customWidth || ''}
                    onChange={e => setCustomWidth(e.target.value ? parseInt(e.target.value) : null)}
                    min={200}
                    max={1200}
                  />
                </div>
                <div>
                  <label className={labelStyle}>Custom Height (px)</label>
                  <input
                    type="number"
                    className={inputStyle}
                    placeholder={String(LAYOUT_PRESETS[layout].height)}
                    value={customHeight || ''}
                    onChange={e => setCustomHeight(e.target.value ? parseInt(e.target.value) : null)}
                    min={200}
                    max={1200}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-orange-100 shadow-sm p-5 space-y-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Code className="h-4 w-4 text-orange-600" />
                Embed Code
              </h2>
              <div className="bg-slate-900 text-green-400 text-xs p-3 rounded-lg font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                {hasRequiredData ? embedCode : '<iframe ...> Select data source above to generate embed code'}
              </div>
              <Button
                onClick={handleCopy}
                disabled={!hasRequiredData}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                size="sm"
              >
                {copied ? (
                  <><Check className="h-4 w-4 mr-1" /> Copied!</>
                ) : (
                  <><Copy className="h-4 w-4 mr-1" /> Copy Embed Code</>
                )}
              </Button>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="sticky top-6">
              <div className="bg-white rounded-xl border border-orange-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-slate-800">Live Preview</h2>
                  <span className="text-xs text-slate-400">{dimensions.width} x {dimensions.height}px</span>
                </div>

                <div
                  className="mx-auto overflow-hidden"
                  style={{
                    width: Math.min(dimensions.width, 600),
                    maxWidth: '100%',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    backgroundColor: '#f1f5f9',
                  }}
                >
                  {hasRequiredData ? (
                    <iframe
                      key={iframeUrl}
                      src={iframeUrl}
                      width={dimensions.width}
                      height={dimensions.height}
                      style={{
                        border: 'none',
                        maxWidth: '100%',
                        transform: dimensions.width > 600 ? `scale(${600 / dimensions.width})` : undefined,
                        transformOrigin: 'top left',
                        height: dimensions.width > 600 ? dimensions.height * (600 / dimensions.width) : dimensions.height,
                      }}
                      title="Widget Preview"
                    />
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center text-slate-400"
                      style={{ height: Math.min(dimensions.height, 400) }}
                    >
                      <Code className="h-10 w-10 mb-3 text-slate-300" />
                      <p className="text-sm font-medium">Select a data source</p>
                      <p className="text-xs mt-1">Choose a league{widgetType === 'player-stats' ? ' and player' : ''} to see a live preview</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
