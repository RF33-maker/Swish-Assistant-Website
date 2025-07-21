// src/components/GamesList.tsx
import React, { useEffect, useState } from "react";
import { supabase }   from "@/lib/supabase";
import { GameSummaryRow} from "./GameSummaryRow";


interface StatRow {
  id:              string;
  name:            string;
  game_date:       string;
  team:            string;
  opponent:        string;
  league_id:       string;
  points:          number;
  rebounds_total:  number;
  assists:         number;
}

type Props = { leagueId: string };

export default function GamesList({ leagueId }: Props) {
  const [stats, setStats]   = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("player_stats")
      .select("id, name, game_date, team, opponent, league_id, points, rebounds_total, assists")
      .eq("league_id", leagueId)                // ← only this league
      .order("game_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else        setStats(data || []);
        setLoading(false);
      });
  }, [leagueId]);

  if (loading) return <div>Loading stats…</div>;
  if (!stats.length) return <div>No stats available for this league.</div>;

  return (
    <table className="w-full table-auto border-collapse">
      <thead>
        <tr>
          <th>Name</th><th>PTS</th><th>REB</th><th>AST</th><th>Action</th>
        </tr>
      </thead>
      <tbody>
        {stats.map(stat => (
          <tr key={stat.id} className="border-t">
            <td>{stat.name}</td>
            <td>{stat.points}</td>
            <td>{stat.rebounds_total}</td>
            <td>{stat.assists}</td>
            <td>
              <GameSummaryRow
                player={{ name: stat.name }}
                game={{
                  id:         stat.id,
                  game_date:  stat.game_date,
                  team:       stat.team,
                  opponent:   stat.opponent,
                  league_id:  stat.league_id,
                }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
