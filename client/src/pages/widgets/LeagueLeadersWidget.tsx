import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type WidgetParams, isLightColor } from "@/lib/widgetUtils";
import WidgetLayout from "./WidgetLayout";

interface LeaderEntry {
  name: string;
  team: string;
  value: number;
  displayValue: string;
  gamesPlayed: number;
}

interface LeaderCategory {
  title: string;
  players: LeaderEntry[];
}

interface PlayerStatRow {
  player_id: string | null;
  id: string;
  full_name: string | null;
  name: string | null;
  firstname: string | null;
  familyname: string | null;
  team: string | null;
  team_name: string | null;
  spoints: number | null;
  sreboundstotal: number | null;
  sassists: number | null;
  ssteals: number | null;
  sblocks: number | null;
  players: { full_name: string | null } | null;
}

interface AggregatedPlayer {
  name: string;
  team: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  gp: number;
}

async function resolvePublicLeague(leagueId?: string, leagueSlug?: string): Promise<{ id: string; name: string } | null> {
  if (leagueSlug) {
    const { data } = await supabase
      .from("leagues")
      .select("league_id, name")
      .eq("slug", leagueSlug)
      .eq("is_public", true)
      .single();
    return data ? { id: data.league_id, name: data.name } : null;
  }
  if (leagueId) {
    const { data } = await supabase
      .from("leagues")
      .select("league_id, name")
      .eq("league_id", leagueId)
      .eq("is_public", true)
      .single();
    return data ? { id: data.league_id, name: data.name } : null;
  }
  return null;
}

export default function LeagueLeadersWidget({ params }: { params: WidgetParams }) {
  const [categories, setCategories] = useState<LeaderCategory[]>([]);
  const [leagueName, setLeagueName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaders = async () => {
      if (!params.leagueId && !params.leagueSlug) {
        setError("No league specified");
        setLoading(false);
        return;
      }

      try {
        const league = await resolvePublicLeague(params.leagueId, params.leagueSlug);
        if (!league) {
          setError("League not found");
          setLoading(false);
          return;
        }
        setLeagueName(league.name);

        let allStats: PlayerStatRow[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: pageData } = await supabase
            .from("player_stats")
            .select("*, players:player_id(full_name)")
            .eq("league_id", league.id)
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (pageData && pageData.length > 0) {
            allStats = [...allStats, ...(pageData as PlayerStatRow[])];
            hasMore = pageData.length === pageSize;
            page++;
          } else {
            hasMore = false;
          }
        }

        if (allStats.length === 0) {
          setError("No stats data available");
          setLoading(false);
          return;
        }

        const playerMap = new Map<string, AggregatedPlayer>();

        allStats.forEach(stat => {
          const key = stat.player_id || stat.id;
          const name = stat.full_name || stat.players?.full_name || stat.name || `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || 'Unknown';
          const team = stat.team || stat.team_name || 'Unknown';

          if (!playerMap.has(key)) {
            playerMap.set(key, { name, team, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, gp: 0 });
          }

          const p = playerMap.get(key)!;
          p.gp++;
          p.points += stat.spoints || 0;
          p.rebounds += stat.sreboundstotal || 0;
          p.assists += stat.sassists || 0;
          p.steals += stat.ssteals || 0;
          p.blocks += stat.sblocks || 0;
        });

        const players = Array.from(playerMap.values());

        const makeCategory = (title: string, field: keyof Pick<AggregatedPlayer, 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks'>, suffix: string): LeaderCategory => ({
          title,
          players: players
            .map(p => ({
              name: p.name,
              team: p.team,
              value: p.gp > 0 ? p[field] / p.gp : 0,
              displayValue: `${p.gp > 0 ? (p[field] / p.gp).toFixed(1) : '0.0'} ${suffix}`,
              gamesPlayed: p.gp,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5),
        });

        setCategories([
          makeCategory('Points', 'points', 'PPG'),
          makeCategory('Rebounds', 'rebounds', 'RPG'),
          makeCategory('Assists', 'assists', 'APG'),
          makeCategory('Steals', 'steals', 'SPG'),
          makeCategory('Blocks', 'blocks', 'BPG'),
        ]);
      } catch {
        setError("Failed to load league leaders");
      } finally {
        setLoading(false);
      }
    };

    fetchLeaders();
  }, [params.leagueId, params.leagueSlug]);

  const primaryColor = params.primaryColor || '#ea580c';
  const accentColor = params.accentColor || '#f97316';
  const bgColor = params.bgColor || '#ffffff';
  const light = isLightColor(bgColor);
  const subtextColor = light ? '#64748b' : '#94a3b8';
  const cardBg = light ? '#f8fafc' : '#1e293b';
  const borderColor = light ? '#e2e8f0' : '#334155';

  const isCompact = params.layout === 'compact';
  const isWide = params.layout === 'wide';
  const titleFontSize = isCompact ? '13px' : '15px';
  const catTitleSize = isCompact ? '11px' : '12px';
  const playerNameSize = isCompact ? '11px' : isWide ? '13px' : '12px';
  const valueSize = isCompact ? '12px' : isWide ? '14px' : '13px';
  const rowPad = isCompact ? '4px 6px' : isWide ? '7px 10px' : '5px 8px';
  const leadersPerCategory = isCompact ? 3 : 5;

  const medalColors = ['#eab308', '#9ca3af', '#f97316'];

  return (
    <WidgetLayout params={params} loading={loading} error={error}>
      {leagueName && (
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-5 rounded-full" style={{ backgroundColor: primaryColor }} />
          <h3 style={{ fontSize: titleFontSize, fontWeight: 700 }}>{leagueName}</h3>
        </div>
      )}
      <div style={{ fontSize: isCompact ? '10px' : '11px', fontWeight: 600, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
        League Leaders
      </div>

      <div className="flex flex-col gap-4">
        {categories.map(cat => (
          <div key={cat.title}>
            <div style={{ fontSize: catTitleSize, fontWeight: 700, marginBottom: '6px', color: primaryColor, borderLeft: `3px solid ${accentColor}`, paddingLeft: '6px' }}>{cat.title}</div>
            <div className="flex flex-col gap-1">
              {cat.players.slice(0, leadersPerCategory).map((p, idx) => (
                <div
                  key={`${p.name}-${idx}`}
                  className="flex items-center justify-between"
                  style={{
                    backgroundColor: cardBg,
                    borderRadius: `${(params.borderRadius ?? 12) / 3}px`,
                    padding: rowPad,
                    border: `1px solid ${borderColor}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="flex items-center justify-center rounded-full text-white"
                      style={{
                        width: isCompact ? 18 : 22,
                        height: isCompact ? 18 : 22,
                        fontSize: isCompact ? '9px' : '10px',
                        fontWeight: 700,
                        backgroundColor: idx < 3 ? medalColors[idx] : subtextColor,
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: playerNameSize, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: isCompact ? '9px' : '10px', color: subtextColor }}>{p.team}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: valueSize, fontWeight: 700, color: primaryColor }}>{p.displayValue}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '10px', color: subtextColor, opacity: 0.7 }}>
        Powered by Swish Assistant
      </div>
    </WidgetLayout>
  );
}
