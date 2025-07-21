import React, { useState } from "react";
import { supabase }      from "@/lib/supabase";



const BASE = import.meta.env.VITE_BACKEND_URL;


interface Player { name: string; }
interface Game {
  id:        string;
  game_date:      string;
  team:      string;
  opponent:  string;
  league_id: string;
}


export function GameSummaryRow({
  player,
  game,
}: {
  player: Player;
  game:   Game;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Guard against missing date
  if (!game?.game_date) {
    return (
      <div className="p-2 bg-red-100 text-red-800 rounded">
        ⚠️ No game date provided.
      </div>
    );
  }

  const generateSummary = async () => {
    setLoading(true);

    // 1) Fetch the stat line from Supabase using real column names
    const { data: stat, error: statErr } = await supabase
      .from("player_stats")
      .select("team, points, rebounds_total, assists")
      .eq("name",        player.name)
      .eq("game_date",   game.game_date)
      .single();

    if (statErr || !stat) {
      console.error("❌ Could not load stats:", statErr);
      setSummary("⚠️ No stats found for that player on that date.");
      setLoading(false);
      return;
    }

    // 2) Send everything into your AI endpoint
    try {
      const response = await fetch(`${BASE}/api/generate-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:       player.name,
          team:       stat.team,
          game_date:  game.game_date,
          points:     stat.points,
          rebounds:   stat.rebounds_total,
          assists:    stat.assists,
        }),
      });

      const json = await response.json();
      setSummary(json.summary);
    } catch (e) {
      console.error("❌ Fetch or display error:", e);
      setSummary("⚠️ Failed to generate summary.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={generateSummary}
        disabled={loading}
        className="px-4 py-2 rounded bg-orange-500 text-white disabled:opacity-50"
      >
        {loading ? "Loading…" : "Generate AI Summary"}
      </button>

      {summary && (
        <div className="p-4 bg-gray-100 rounded">
          {summary}
        </div>
      )}
    </div>
  );
}

