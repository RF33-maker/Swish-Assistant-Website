import { Link } from "wouter";
import { TeamLogo } from "@/components/TeamLogo";
import { normalizeTeamName } from "@/lib/teamUtils";
import { formatTipOff, liveLabel, type ScoreGame } from "@/lib/scores";

function TeamRow({
  name, leagueId, score, muted,
}: { name: string; leagueId: string; score: number | null; muted?: boolean }) {
  // Logos are looked up by the raw feed name; only the displayed text is
  // tidied, so "Gloucester City Kings Senior Men I" reads as the club.
  return (
    <div className={`flex items-center gap-3 ${muted ? "text-slate-400 dark:text-neutral-500" : "text-slate-900 dark:text-white"}`}>
      <TeamLogo teamName={name} leagueId={leagueId} size="sm" />
      <span className="flex-1 min-w-0 truncate text-[15px] font-medium">{normalizeTeamName(name) || name}</span>
      {score != null && <span className="text-lg font-bold tabular-nums">{score}</span>}
    </div>
  );
}

/** One game as a small scoreboard: league and status on top, a line per team. */
export default function ScoreGameCard({ game, kind }: { game: ScoreGame; kind: "live" | "upcoming" | "result" }) {
  const hasScores = game.home_score != null && game.away_score != null;
  const homeWon = kind === "result" && hasScores && game.home_score! > game.away_score!;
  const awayWon = kind === "result" && hasScores && game.away_score! > game.home_score!;

  return (
    <Link
      href={`/competition/${game.league_slug}/game/${encodeURIComponent(game.game_key)}`}
      className="block rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 active:scale-[0.99] hover:border-orange-300 dark:hover:border-neutral-600 transition"
    >
      <div className="flex items-center justify-between gap-3 mb-2.5 text-xs">
        <span className="truncate text-slate-500 dark:text-neutral-400">{game.league_name}</span>
        {kind === "live" ? (
          <span className="flex items-center gap-1.5 shrink-0 font-semibold text-red-600 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {liveLabel(game.status)}
          </span>
        ) : kind === "upcoming" ? (
          <span className="shrink-0 font-semibold text-slate-700 dark:text-neutral-200 tabular-nums">{formatTipOff(game.match_time)}</span>
        ) : (
          <span className="shrink-0 text-slate-500 dark:text-neutral-400">Final</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <TeamRow name={game.home_team} leagueId={game.league_id} score={kind === "upcoming" ? null : game.home_score} muted={awayWon} />
        <TeamRow name={game.away_team} leagueId={game.league_id} score={kind === "upcoming" ? null : game.away_score} muted={homeWon} />
      </div>
    </Link>
  );
}
