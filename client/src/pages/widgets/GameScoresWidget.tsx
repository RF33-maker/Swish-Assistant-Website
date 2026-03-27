import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type WidgetParams, isLightColor } from "@/lib/widgetUtils";
import WidgetLayout from "./WidgetLayout";

interface GameScore {
  gameKey: string;
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
}

interface TeamStatEntry {
  game_key: string | null;
  name: string;
  tot_spoints: number | null;
  created_at: string;
}

interface ScheduleEntry {
  game_key: string;
  hometeam: string;
  awayteam: string;
  matchtime: string;
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

export default function GameScoresWidget({ params }: { params: WidgetParams }) {
  const [games, setGames] = useState<GameScore[]>([]);
  const [leagueName, setLeagueName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGames = async () => {
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

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const { data: teamStats } = await supabase
          .from("team_stats")
          .select("game_key, name, tot_spoints, created_at")
          .eq("league_id", league.id)
          .gte("created_at", thirtyDaysAgo.toISOString())
          .order("created_at", { ascending: false });

        if (!teamStats || teamStats.length === 0) {
          setError("No recent games found");
          setLoading(false);
          return;
        }

        const gameMap = new Map<string, TeamStatEntry[]>();
        (teamStats as TeamStatEntry[]).forEach(stat => {
          const key = stat.game_key;
          if (key) {
            if (!gameMap.has(key)) gameMap.set(key, []);
            gameMap.get(key)!.push(stat);
          }
        });

        const gameKeys = Array.from(gameMap.keys());
        const scheduleMap = new Map<string, ScheduleEntry>();

        if (gameKeys.length > 0) {
          const { data: schedData } = await supabase
            .from("game_schedule")
            .select("game_key, hometeam, awayteam, matchtime")
            .eq("league_id", league.id)
            .in("game_key", gameKeys);
          if (schedData) {
            (schedData as ScheduleEntry[]).forEach(s => {
              if (s.game_key) scheduleMap.set(s.game_key, s);
            });
          }
        }

        const results: GameScore[] = [];
        gameMap.forEach((teams, gameKey) => {
          if (teams.length === 2) {
            const sched = scheduleMap.get(gameKey);
            let homeTeam: string, awayTeam: string, homeScore: number, awayScore: number;

            if (sched) {
              homeTeam = sched.hometeam;
              awayTeam = sched.awayteam;
              const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
              const homeNorm = normalize(sched.hometeam);
              const homeStats = teams.find(t => normalize(t.name) === homeNorm);
              const awayStats = teams.find(t => normalize(t.name) !== homeNorm);
              homeScore = homeStats?.tot_spoints ?? teams[0].tot_spoints ?? 0;
              awayScore = awayStats?.tot_spoints ?? teams[1].tot_spoints ?? 0;
            } else {
              homeTeam = teams[0].name;
              awayTeam = teams[1].name;
              homeScore = teams[0].tot_spoints || 0;
              awayScore = teams[1].tot_spoints || 0;
            }

            results.push({
              gameKey,
              gameDate: sched?.matchtime || teams[0].created_at,
              homeTeam,
              awayTeam,
              homeScore,
              awayScore,
              status: 'Final',
            });
          }
        });

        let filtered = results;
        if (params.teamName) {
          const filterName = params.teamName.toLowerCase();
          filtered = results.filter(g =>
            g.homeTeam.toLowerCase() === filterName ||
            g.awayTeam.toLowerCase() === filterName
          );
        }

        filtered.sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime());
        setGames(filtered.slice(0, 10));
      } catch {
        setError("Failed to load game scores");
      } finally {
        setLoading(false);
      }
    };

    fetchGames();
  }, [params.leagueId, params.leagueSlug, params.teamName]);

  const primaryColor = params.primaryColor || '#ea580c';
  const accentColor = params.accentColor || '#f97316';
  const bgColor = params.bgColor || '#ffffff';
  const light = isLightColor(bgColor);
  const subtextColor = light ? '#64748b' : '#94a3b8';
  const cardBg = light ? '#f8fafc' : '#1e293b';
  const borderColor = light ? '#e2e8f0' : '#334155';

  const isCompact = params.layout === 'compact';
  const isWide = params.layout === 'wide';
  const cardPad = isCompact ? '7px 8px' : isWide ? '12px 16px' : '10px 12px';
  const teamFontSize = isCompact ? '11px' : isWide ? '14px' : '13px';
  const scoreFontSize = isCompact ? '13px' : isWide ? '17px' : '15px';
  const metaFontSize = isCompact ? '9px' : '10px';
  const titleFontSize = isCompact ? '13px' : '15px';
  const maxGames = isCompact ? 5 : 10;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const displayGames = games.slice(0, maxGames);

  return (
    <WidgetLayout params={params} loading={loading} error={error}>
      {leagueName && (
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-5 rounded-full" style={{ backgroundColor: primaryColor }} />
          <h3 style={{ fontSize: titleFontSize, fontWeight: 700 }}>{leagueName}</h3>
        </div>
      )}
      <div style={{ fontSize: metaFontSize, fontWeight: 600, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
        Recent Games
      </div>

      <div className="flex flex-col gap-2">
        {displayGames.map(game => {
          const homeWon = game.homeScore > game.awayScore;
          return (
            <div
              key={game.gameKey}
              style={{
                backgroundColor: cardBg,
                borderRadius: `${(params.borderRadius ?? 12) / 2}px`,
                padding: cardPad,
                border: `1px solid ${borderColor}`,
              }}
            >
              <div className="flex justify-between items-center mb-1">
                <span style={{ fontSize: metaFontSize, color: accentColor, textTransform: 'uppercase', fontWeight: 600 }}>Final</span>
                <span style={{ fontSize: metaFontSize, color: subtextColor }}>{formatDate(game.gameDate)}</span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span style={{ fontSize: teamFontSize, fontWeight: homeWon ? 700 : 400 }}>{game.homeTeam}</span>
                <span style={{ fontSize: scoreFontSize, fontWeight: 700, color: homeWon ? primaryColor : undefined }}>{game.homeScore}</span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ fontSize: teamFontSize, fontWeight: !homeWon ? 700 : 400 }}>{game.awayTeam}</span>
                <span style={{ fontSize: scoreFontSize, fontWeight: 700, color: !homeWon ? primaryColor : undefined }}>{game.awayScore}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '10px', color: subtextColor, opacity: 0.7 }}>
        Powered by Swish Assistant
      </div>
    </WidgetLayout>
  );
}
