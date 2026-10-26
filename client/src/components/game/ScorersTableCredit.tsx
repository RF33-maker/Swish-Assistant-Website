import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const SCORERS_TABLE_URL = "https://scorerstable.app";

/** True when the game's stats were scored in Scorers Table (published rows carry source_type 'swish_stats'). */
export function useCapturedWithScorersTable(gameKey: string | null | undefined): boolean {
  const [captured, setCaptured] = useState(false);
  useEffect(() => {
    if (!gameKey) { setCaptured(false); return; }
    let cancelled = false;
    supabase
      .from("team_stats")
      .select("source_type")
      .eq("game_key", gameKey)
      .eq("source_type", "swish_stats")
      .limit(1)
      .then(({ data }) => { if (!cancelled) setCaptured(!!data?.length); });
    return () => { cancelled = true; };
  }, [gameKey]);
  return captured;
}

/** Pill for the game hero. */
export function ScorersTableBadge() {
  return (
    <a
      href={SCORERS_TABLE_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="captured-with-scorers-table"
      title="Swish Assistant's own stat capture tool"
      className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:text-white"
    >
      Captured with Scorers Table
    </a>
  );
}

/** Line under the box score. */
export function ScorersTableNote() {
  return (
    <p className="text-xs text-[color:var(--ch-muted)]" data-testid="scorers-table-note">
      Stats captured with{" "}
      <a href={SCORERS_TABLE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-[color:var(--ch-text)] underline-offset-2 hover:underline">
        Scorers Table
      </a>
      , Swish Assistant's own stat capture tool.
    </p>
  );
}
