import { useParams } from "wouter";
import { parseWidgetParams, type WidgetType } from "@/lib/widgetUtils";
import StandingsWidget from "./StandingsWidget";
import PlayerStatsWidget from "./PlayerStatsWidget";
import GameScoresWidget from "./GameScoresWidget";
import LeagueLeadersWidget from "./LeagueLeadersWidget";

const VALID_TYPES: WidgetType[] = ['standings', 'player-stats', 'game-scores', 'league-leaders'];

function isValidWidgetType(value: string): value is WidgetType {
  return VALID_TYPES.includes(value as WidgetType);
}

export default function WidgetPage() {
  const { type } = useParams<{ type: string }>();

  if (!type || !isValidWidgetType(type)) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#ef4444', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: 8 }}>Invalid Widget Type</div>
        <div style={{ fontSize: '13px', color: '#64748b' }}>
          "{type}" is not a valid widget type. Supported types: standings, player-stats, game-scores, league-leaders.
        </div>
      </div>
    );
  }

  const searchParams = new URLSearchParams(window.location.search);
  const params = parseWidgetParams(searchParams);
  params.type = type;

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100vh',
    margin: 0,
    padding: 0,
    overflow: 'hidden',
    background: 'transparent',
  };

  return (
    <div style={containerStyle}>
      {params.type === 'standings' && <StandingsWidget params={params} />}
      {params.type === 'player-stats' && <PlayerStatsWidget params={params} />}
      {params.type === 'game-scores' && <GameScoresWidget params={params} />}
      {params.type === 'league-leaders' && <LeagueLeadersWidget params={params} />}
    </div>
  );
}
