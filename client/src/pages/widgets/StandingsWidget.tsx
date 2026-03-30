import { useEffect, useState } from "react";
import { supabase, getSupabaseForLeague, getDataLeagueId } from "@/lib/supabase";
import { type WidgetParams, isLightColor } from "@/lib/widgetUtils";
import WidgetLayout from "./WidgetLayout";

interface StandingRow {
  team: string;
  wins: number;
  losses: number;
  winPct: number;
  ppg: number;
}

interface GameResultEntry {
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
}

interface TeamRecord {
  wins: number;
  losses: number;
  totalPoints: number;
  games: number;
}

async function resolveLeague(leagueId?: string, leagueSlug?: string): Promise<{ id: string; name: string } | null> {
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

export default function StandingsWidget({ params }: { params: WidgetParams }) {
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [leagueName, setLeagueName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStandings = async () => {
      if (!params.leagueId && !params.leagueSlug) {
        setError("No league specified");
        setLoading(false);
        return;
      }

      try {
        const league = await resolveLeague(params.leagueId, params.leagueSlug);
        if (!league) {
          setError("League not found");
          setLoading(false);
          return;
        }
        setLeagueName(league.name);

        const leagueKey = params.leagueSlug || params.leagueId;
        const db = getSupabaseForLeague(leagueKey);
        const dataLeagueId = getDataLeagueId(leagueKey, league.id);

        const { data: allTeams } = await supabase
          .from("teams")
          .select("team_id, name")
          .eq("league_id", league.id);

        const teamRecords = new Map<string, TeamRecord>();

        if (allTeams && allTeams.length > 0) {
          allTeams.forEach(team => {
            teamRecords.set(team.name, { wins: 0, losses: 0, totalPoints: 0, games: 0 });
          });
        }

        const { data: gameResults, error: statsError } = await db
          .from("v_game_results")
          .select("home_team, away_team, home_score, away_score")
          .eq("league_id", dataLeagueId);

        if (statsError) {
          setError("Failed to fetch standings");
          setLoading(false);
          return;
        }

        if (gameResults && gameResults.length > 0) {
          gameResults.forEach((game: GameResultEntry) => {
            if (game.home_score == null || game.away_score == null) return;
            const homeScore = game.home_score;
            const awayScore = game.away_score;

            if (game.home_team) {
              if (!teamRecords.has(game.home_team)) {
                teamRecords.set(game.home_team, { wins: 0, losses: 0, totalPoints: 0, games: 0 });
              }
              const record = teamRecords.get(game.home_team)!;
              record.games++;
              record.totalPoints += homeScore;
              if (homeScore > awayScore) record.wins++;
              else if (homeScore < awayScore) record.losses++;
            }

            if (game.away_team) {
              if (!teamRecords.has(game.away_team)) {
                teamRecords.set(game.away_team, { wins: 0, losses: 0, totalPoints: 0, games: 0 });
              }
              const record = teamRecords.get(game.away_team)!;
              record.games++;
              record.totalPoints += awayScore;
              if (awayScore > homeScore) record.wins++;
              else if (awayScore < homeScore) record.losses++;
            }
          });
        }

        if (teamRecords.size === 0) {
          setError("No standings data available");
          setLoading(false);
          return;
        }

        let rows: StandingRow[] = Array.from(teamRecords.entries())
          .map(([team, data]) => ({
            team,
            wins: data.wins,
            losses: data.losses,
            winPct: data.games > 0 ? data.wins / data.games : 0,
            ppg: data.games > 0 ? data.totalPoints / data.games : 0,
          }))
          .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

        if (params.teamName) {
          const filterName = params.teamName.toLowerCase();
          rows = rows.filter(r => r.team.toLowerCase() === filterName);
        }

        setStandings(rows);
      } catch {
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchStandings();
  }, [params.leagueId, params.leagueSlug, params.teamName]);

  const primaryColor = params.primaryColor || '#ea580c';
  const accentColor = params.accentColor || '#f97316';
  const bgColor = params.bgColor || '#ffffff';
  const light = isLightColor(bgColor);
  const headerBg = light ? `${accentColor}15` : `${accentColor}30`;
  const borderColor = light ? '#e2e8f0' : '#334155';
  const subtextColor = light ? '#64748b' : '#94a3b8';

  const isCompact = params.layout === 'compact';
  const isWide = params.layout === 'wide';
  const cellPad = isCompact ? '5px 6px' : isWide ? '10px 14px' : '8px 10px';
  const cellPadSm = isCompact ? '5px 4px' : isWide ? '10px 8px' : '8px 6px';
  const baseFontSize = isCompact ? '11px' : isWide ? '14px' : '13px';
  const headerFontSize = isCompact ? '10px' : '11px';
  const titleFontSize = isCompact ? '13px' : '15px';

  return (
    <WidgetLayout params={params} loading={loading} error={error}>
      {leagueName && (
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-5 rounded-full" style={{ backgroundColor: primaryColor }} />
          <h3 style={{ fontSize: titleFontSize, fontWeight: 700 }}>{leagueName}</h3>
        </div>
      )}
      <div style={{ fontSize: headerFontSize, fontWeight: 600, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
        Standings
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: baseFontSize }}>
        <thead>
          <tr style={{ backgroundColor: headerBg }}>
            <th style={{ textAlign: 'left', padding: cellPad, fontWeight: 600, color: subtextColor, fontSize: headerFontSize, textTransform: 'uppercase' }}>#</th>
            <th style={{ textAlign: 'left', padding: cellPad, fontWeight: 600, color: subtextColor, fontSize: headerFontSize, textTransform: 'uppercase' }}>Team</th>
            <th style={{ textAlign: 'center', padding: cellPadSm, fontWeight: 600, color: subtextColor, fontSize: headerFontSize }}>W</th>
            <th style={{ textAlign: 'center', padding: cellPadSm, fontWeight: 600, color: subtextColor, fontSize: headerFontSize }}>L</th>
            <th style={{ textAlign: 'center', padding: cellPadSm, fontWeight: 600, color: subtextColor, fontSize: headerFontSize }}>PCT</th>
            <th style={{ textAlign: 'center', padding: cellPadSm, fontWeight: 600, color: subtextColor, fontSize: headerFontSize }}>PPG</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, idx) => (
            <tr key={row.team} style={{ borderBottom: `1px solid ${borderColor}` }}>
              <td style={{ padding: cellPad, fontWeight: 600, color: subtextColor }}>{idx + 1}</td>
              <td style={{ padding: cellPad, fontWeight: 600 }}>{row.team}</td>
              <td style={{ textAlign: 'center', padding: cellPadSm, fontWeight: 500 }}>{row.wins}</td>
              <td style={{ textAlign: 'center', padding: cellPadSm, fontWeight: 500 }}>{row.losses}</td>
              <td style={{ textAlign: 'center', padding: cellPadSm, fontWeight: 600, color: primaryColor }}>{(row.winPct * 100).toFixed(0)}%</td>
              <td style={{ textAlign: 'center', padding: cellPadSm, color: subtextColor }}>{row.ppg.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '10px', color: subtextColor, opacity: 0.7 }}>
        Powered by Swish Assistant
      </div>
    </WidgetLayout>
  );
}
