import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Copy, Check, Code, BarChart3, Users, Trophy, Gamepad2, BookOpen } from "lucide-react";
import AdminPageShell from "@/components/layout/AdminPageShell";
import { BTN_GHOST, BTN_PRIMARY, FIELD, Field, HINT, TALL } from "@/components/layout/proUi";
import {
  type WidgetParams,
  type WidgetType,
  type WidgetLayout as WidgetLayoutType,
  WIDGET_DEFAULTS,
  LAYOUT_PRESETS,
  FONT_OPTIONS,
  buildWidgetUrl,
  buildEmbedCode,
  buildResponsiveEmbedCode,
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
  const [copied, setCopied] = useState(false);

  const [embedMode, setEmbedMode] = useState<'fixed' | 'responsive'>('fixed');
  const [widgetType, setWidgetType] = useState<WidgetType>('standings');
  const [leagueId, setLeagueId] = useState('');
  const [leagueSlug, setLeagueSlug] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [primaryColor, setPrimaryColor] = useState<string>(WIDGET_DEFAULTS.primaryColor);
  const [accentColor, setAccentColor] = useState<string>(WIDGET_DEFAULTS.accentColor);
  const [bgColor, setBgColor] = useState<string>(WIDGET_DEFAULTS.bgColor);
  const [font, setFont] = useState<string>(WIDGET_DEFAULTS.font);
  const [borderRadius, setBorderRadius] = useState<number>(WIDGET_DEFAULTS.borderRadius);
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
        .from("competitions")
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
      try {
        let allStats: any[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: pageData, error: pageError } = await supabase
            .from("player_stats")
            .select("player_id, firstname, familyname, team_name, players:player_id(id, full_name, slug)")
            .eq("league_id", leagueId)
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (pageError) {
            console.error("[WidgetBuilder] Error loading players:", pageError);
            setPlayers([]);
            return;
          }

          if (pageData && pageData.length > 0) {
            allStats = [...allStats, ...pageData];
            hasMore = pageData.length === pageSize;
            page++;
          } else {
            hasMore = false;
          }
        }

        const playerMap = new Map<string, PlayerOption>();
        allStats.forEach((stat: any) => {
          const pid = stat.player_id;
          if (!pid || playerMap.has(pid)) return;
          const p = stat.players;
          const fullName = p?.full_name || `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || 'Unknown';
          playerMap.set(pid, {
            id: p?.id || pid,
            full_name: fullName,
            name: fullName,
            slug: p?.slug || pid,
            team: stat.team_name || '',
          });
        });
        const sorted = Array.from(playerMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
        setPlayers(sorted);
      } finally {
        setLoadingPlayers(false);
      }
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
  const embedCode = useMemo(
    () => embedMode === 'responsive'
      ? buildResponsiveEmbedCode(widgetUrl, dimensions.height)
      : buildEmbedCode(widgetUrl, dimensions.width, dimensions.height),
    [widgetUrl, dimensions, embedMode],
  );

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

  const choice = (active: boolean) =>
    `rounded-[10px] border text-left transition-colors ${
      active
        ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-text)]"
        : "border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)] text-[color:var(--ch-text-2)] hover:border-[color:var(--ch-border-strong)]"
    }`;
  const colourField = (label: string, value: string, set: (v: string) => void) => (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => set(e.target.value)}
          aria-label={`${label} colour`}
          className="h-9 w-9 flex-none cursor-pointer rounded-lg border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] p-0.5"
        />
        <input type="text" value={value} onChange={e => set(e.target.value)} className={`${FIELD} !h-9 min-w-0 !px-2 !text-xs`} />
      </div>
    </Field>
  );
  const step = (n: number) => (
    <span className="ch-num flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[color:var(--ch-accent-soft)] text-[11px] font-bold text-[color:var(--ch-accent)]">
      {n}
    </span>
  );
  const heading = "flex items-center gap-2 text-sm font-semibold text-[color:var(--ch-text)]";

  return (
    <AdminPageShell
      title="Widget builder"
      description="Build an embeddable widget for standings, player stats, scores or league leaders, then copy its code."
      width="max-w-7xl"
      actions={
        <a href="/embed" target="_blank" rel="noopener noreferrer" className={BTN_GHOST}>
          <BookOpen className="h-4 w-4" />
          Embed guide
        </a>
      }
    >
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <section className="ch-card space-y-4 p-4 sm:p-5">
            <h2 className={heading}>
              {step(1)}
              Widget Type
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {WIDGET_TYPES.map(wt => {
                const Icon = wt.icon;
                const active = widgetType === wt.value;
                return (
                  <button
                    key={wt.value}
                    type="button"
                    onClick={() => setWidgetType(wt.value)}
                    aria-pressed={active}
                    className={`${choice(active)} flex flex-col items-start gap-1 p-3`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-[color:var(--ch-accent)]' : 'text-[color:var(--ch-muted)]'}`} />
                    <span className="text-xs font-semibold text-[color:var(--ch-text)]">{wt.label}</span>
                    <span className="text-[10.5px] leading-tight text-[color:var(--ch-muted)]">{wt.desc}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ch-card space-y-4 p-4 sm:p-5">
            <h2 className={heading}>
              {step(2)}
              Data Source
            </h2>

            <Field label="League">
              <select
                className={FIELD}
                value={leagueId}
                onChange={e => handleLeagueChange(e.target.value)}
                disabled={loadingLeagues}
              >
                <option value="">Select a league...</option>
                {leagues.map(l => (
                  <option key={l.league_id} value={l.league_id}>{l.name}</option>
                ))}
              </select>
            </Field>

            {needsPlayer && (
              <Field label="Player">
                <select
                  className={FIELD}
                  value={playerId}
                  onChange={e => setPlayerId(e.target.value)}
                  disabled={loadingPlayers || !leagueId}
                >
                  <option value="">{!leagueId ? 'Select a league first...' : 'Select a player...'}</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name || p.name} {p.team ? `(${p.team})` : ''}</option>
                  ))}
                </select>
              </Field>
            )}

            {supportsTeamFilter && (
              <Field label="Team (optional filter)">
                <select
                  className={FIELD}
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  disabled={loadingTeams || !leagueId}
                >
                  <option value="">{!leagueId ? 'Select a league first...' : 'All teams'}</option>
                  {teams.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
            )}
          </section>

          <section className="ch-card space-y-4 p-4 sm:p-5">
            <h2 className={heading}>
              {step(3)}
              Appearance
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {colourField("Primary", primaryColor, setPrimaryColor)}
              {colourField("Accent", accentColor, setAccentColor)}
              {colourField("Background", bgColor, setBgColor)}
            </div>

            <Field label="Font">
              <select className={FIELD} value={font} onChange={e => setFont(e.target.value)}>
                {FONT_OPTIONS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>

            <Field label={`Border Radius: ${borderRadius}px`}>
              <input
                type="range"
                min={0}
                max={24}
                value={borderRadius}
                onChange={e => setBorderRadius(parseInt(e.target.value))}
                className="w-full accent-[color:var(--ch-accent)]"
              />
            </Field>
          </section>

          <section className="ch-card space-y-4 p-4 sm:p-5">
            <h2 className={heading}>
              {step(4)}
              Size & Layout
            </h2>

            <div className="flex gap-2">
              {(['compact', 'standard', 'wide'] as WidgetLayoutType[]).map(preset => {
                const active = layout === preset && !customWidth;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => { setLayout(preset); setCustomWidth(null); setCustomHeight(null); }}
                    aria-pressed={active}
                    className={`${choice(active)} flex-1 px-3 py-2 text-center text-xs font-semibold capitalize`}
                  >
                    {preset}
                    <span className="mt-0.5 block text-[10.5px] font-normal text-[color:var(--ch-muted)]">
                      {LAYOUT_PRESETS[preset].width}x{LAYOUT_PRESETS[preset].height}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Custom Width (px)">
                <input
                  type="number"
                  className={FIELD}
                  placeholder={String(LAYOUT_PRESETS[layout].width)}
                  value={customWidth || ''}
                  onChange={e => setCustomWidth(e.target.value ? parseInt(e.target.value) : null)}
                  min={200}
                  max={1200}
                />
              </Field>
              <Field label="Custom Height (px)">
                <input
                  type="number"
                  className={FIELD}
                  placeholder={String(LAYOUT_PRESETS[layout].height)}
                  value={customHeight || ''}
                  onChange={e => setCustomHeight(e.target.value ? parseInt(e.target.value) : null)}
                  min={200}
                  max={1200}
                />
              </Field>
            </div>
          </section>

          <section className="ch-card space-y-3 p-4 sm:p-5">
            <h2 className={heading}>
              <Code className="h-4 w-4 text-[color:var(--ch-accent)]" />
              Embed Code
            </h2>
            <div className="flex gap-2">
              {(['fixed', 'responsive'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEmbedMode(mode)}
                  aria-pressed={embedMode === mode}
                  className={`${choice(embedMode === mode)} flex-1 px-3 py-2 text-center text-xs font-semibold`}
                >
                  {mode === 'fixed' ? 'Fixed size' : 'Responsive'}
                  <span className="mt-0.5 block text-[10.5px] font-normal text-[color:var(--ch-muted)]">
                    {mode === 'fixed' ? `${dimensions.width}x${dimensions.height}` : '100% width'}
                  </span>
                </button>
              ))}
            </div>
            <p className={HINT}>
              Want widgets to auto-resize to their content?{' '}
              <a href="/embed#auto-resize" target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--ch-accent)] hover:underline">See the embed guide</a>
              .
            </p>
            <div className="overflow-x-auto whitespace-pre-wrap break-all rounded-[10px] bg-[#0b1220] p-3 font-mono text-xs leading-relaxed text-emerald-400">
              {hasRequiredData ? embedCode : '<iframe ...> Select data source above to generate embed code'}
            </div>
            <button type="button" onClick={handleCopy} disabled={!hasRequiredData} className={`${BTN_PRIMARY} ${TALL} w-full`}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy Embed Code"}
            </button>
          </section>
        </div>

        <div className="lg:sticky lg:top-4 lg:col-span-3">
          <section className="ch-card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="ch-display text-[1.4rem] font-bold uppercase leading-none tracking-tight text-[color:var(--ch-text)]">Live preview</h2>
              <span className={`ch-num ${HINT}`}>{dimensions.width} x {dimensions.height}px</span>
            </div>

            {/* The widget keeps its own colours, so its frame stays light whatever the site theme. */}
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
                  className="flex flex-col items-center justify-center text-slate-500"
                  style={{ height: Math.min(dimensions.height, 400) }}
                >
                  <Code className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-sm font-medium">Select a data source</p>
                  <p className="mt-1 text-xs">Choose a league{widgetType === 'player-stats' ? ' and player' : ''} to see a live preview</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </AdminPageShell>
  );
}
