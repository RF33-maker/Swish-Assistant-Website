// src/components/GamesList.tsx
import React, { useEffect, useState } from "react";
import { supabase }   from "@/lib/supabase";
import { GameSummaryRow} from "./GameSummaryRow";
import type { PlayerStats } from "@shared/schema";

type Props = { leagueId: string };

export default function GamesList({ leagueId }: Props) {
  const [stats, setStats]   = useState<any[]>([]);  // Supabase returns data with string dates, not Date objects
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("player_stats")
      .select("*")  // Select all fields including raw s-prefixed stats
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
            <td>{stat.name || 'Unknown Player'}</td>
            <td>{stat.points ?? 0}</td>
            <td>{stat.rebounds_total ?? 0}</td>
            <td>{stat.assists ?? 0}</td>
            <td>
              <GameSummaryRow
                player={{ name: stat.name || 'Unknown Player' }}
                game={{
                  id:         stat.id,
                  game_date:  stat.game_date,
                  team:       stat.team || 'Unknown Team',
                  opponent:   stat.away_team || stat.home_team || 'Unknown',
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
