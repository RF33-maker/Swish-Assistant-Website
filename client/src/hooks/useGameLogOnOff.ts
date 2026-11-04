import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { gameLogOnOff, type GameLogBoxRow, type GameLogOnOff } from "@/lib/gameOnOff";

// A game has up to ~26 box rows, so 30 games stay under the 1,000-row cap.
const GAMES_PER_REQUEST = 30;

/**
 * Raw on/off for each row of a player's game log, keyed by the row's
 * player_stats id. Off needs the whole team's +/- for the game, so every box
 * row of those games is fetched. Rows whose game doesn't add up are left out.
 */
export function useGameLogOnOff(
  rows: Array<{ id: string; game_key?: string | null }>,
  enabled: boolean,
): Map<string, GameLogOnOff> {
  const gameKeys = useMemo(
    () => Array.from(new Set(rows.map((r) => r.game_key).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const { data: rowsByGame } = useQuery({
    queryKey: ["game-log-on-off", gameKeys],
    enabled: enabled && gameKeys.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < gameKeys.length; i += GAMES_PER_REQUEST) chunks.push(gameKeys.slice(i, i + GAMES_PER_REQUEST));
      const responses = await Promise.all(
        chunks.map((keys) =>
          supabase
            .from("player_stats")
            .select("id, game_key, team_id, team_name, spoints, splusminuspoints")
            .in("game_key", keys),
        ),
      );
      const byGame = new Map<string, GameLogBoxRow[]>();
      for (const { data, error } of responses) {
        if (error) throw error;
        for (const row of (data || []) as GameLogBoxRow[]) {
          if (!row.game_key) continue;
          const list = byGame.get(row.game_key);
          if (list) list.push(row);
          else byGame.set(row.game_key, [row]);
        }
      }
      return byGame;
    },
  });

  return useMemo(() => {
    const out = new Map<string, GameLogOnOff>();
    if (!rowsByGame) return out;
    for (const row of rows) {
      if (!row.game_key) continue;
      const value = gameLogOnOff(row.id, rowsByGame.get(row.game_key) ?? []);
      if (value) out.set(row.id, value);
    }
    return out;
  }, [rows, rowsByGame]);
}
