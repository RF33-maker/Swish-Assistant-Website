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
        <div className="mt-3 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-md shadow-sm space-y-3 text-sm text-slate-800">
          {/* Extract sections using line breaks or regex */}
          {(() => {
            const titleMatch = summary.match(/Title Headline:\s*"(.*?)"/);
            const summaryMatch = summary.match(/2\. Summary:\s*([\s\S]*?)3\. Coaching Tip:/);
            const coachingMatch = summary.match(/3\. Coaching Tip:\s*([\s\S]*)/); 

            return (
              <>
                {titleMatch && (
                  <h3 className="text-lg font-semibold text-orange-600">
                    {titleMatch[1]}
                  </h3>
                )}
                {summaryMatch && (
                  <p className="leading-relaxed">{summaryMatch[1].trim()}</p>
                )}
                {coachingMatch && (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1">Coaching Tip</p>
                    <p className="leading-relaxed">{coachingMatch[1].trim()}</p>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
}

