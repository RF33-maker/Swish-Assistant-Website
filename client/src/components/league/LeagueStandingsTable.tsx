import { teamPath } from "@shared/seo";
import EntityLink from "@/components/EntityLink";
import { TeamLogo } from "@/components/TeamLogo";

export type GameResult = "W" | "L";

export interface TeamForm {
  /** Up to five results, oldest first, so the newest sits on the right. */
  lastFive: GameResult[];
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
}

export const EMPTY_TEAM_FORM: TeamForm = { lastFive: [], homeWins: 0, homeLosses: 0, awayWins: 0, awayLosses: 0 };

/**
 * Last five results and home/away records per team, keyed by the name the
 * standings rows end up with (they normalize names twice).
 */
export function buildTeamForm(games: any[], normalize: (name: string) => string) {
  const form = new Map<string, TeamForm>();
  const addResult = (name: string, side: "home" | "away", result: GameResult) => {
    const key = normalize(normalize(name));
    const team = form.get(key) ?? { ...EMPTY_TEAM_FORM, lastFive: [] };
    if (team.lastFive.length < 5) team.lastFive.unshift(result);
    if (side === "home") result === "W" ? team.homeWins++ : team.homeLosses++;
    else result === "W" ? team.awayWins++ : team.awayLosses++;
    form.set(key, team);
  };

  [...games]
    .filter(g => g.home_score != null && g.away_score != null && g.home_score !== g.away_score)
    .sort((a, b) => new Date(b.match_time ?? 0).getTime() - new Date(a.match_time ?? 0).getTime())
    .forEach(g => {
      const homeWon = g.home_score > g.away_score;
      if (g.home_team) addResult(g.home_team, "home", homeWon ? "W" : "L");
      if (g.away_team) addResult(g.away_team, "away", homeWon ? "L" : "W");
    });

  return form;
}

const formatPct = (pct: number) => (pct ?? 0).toFixed(3).replace(/^0/, "");

const formatDiff = (diff: number) => {
  const rounded = diff.toFixed(1);
  return diff > 0 ? `+${rounded}` : rounded;
};

const headCell = "py-3 px-2.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap";
const numberCell = "py-3 px-2.5 text-center tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap";

function LastFive({ results }: { results: GameResult[] }) {
  const emptySlots = Math.max(0, 5 - results.length);
  return (
    <div
      className="flex items-center justify-center gap-[3px]"
      aria-label={results.length > 0 ? `Last ${results.length}, oldest first: ${results.join(" ")}` : "No games played"}
    >
      {Array.from({ length: emptySlots }).map((_, index) => (
        <span key={`empty-${index}`} className="h-[18px] w-[18px] rounded-[3px] border border-gray-200 dark:border-neutral-700" />
      ))}
      {results.map((result, index) => (
        <span
          key={index}
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-[3px] text-[10px] font-bold leading-none text-white ${
            result === "W" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {result}
        </span>
      ))}
    </div>
  );
}

interface Props {
  rows: any[];
  leagueId?: string;
  slug?: string;
  getLogoUrl: (teamName: string) => string | undefined;
}

export default function LeagueStandingsTable({ rows, leagueId, slug, getLogoUrl }: Props) {
  if (rows.length === 0) {
    return <div className="text-center py-8 text-gray-500 text-sm">No standings data available</div>;
  }

  return (
    <div className="overflow-x-auto -mx-4 md:mx-0">
      <table className="ch-table w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b-2 border-gray-200 dark:border-neutral-700">
            <th className={`${headCell} text-left sticky left-0 bg-white dark:bg-neutral-900 z-10`}>Team</th>
            <th className={`${headCell} text-center`}>W</th>
            <th className={`${headCell} text-center`}>L</th>
            <th className={`${headCell} text-center`}>PCT</th>
            <th className={`${headCell} text-center`}>Home</th>
            <th className={`${headCell} text-center`}>Away</th>
            <th className={`${headCell} text-center`}>PPG</th>
            <th className={`${headCell} text-center`}>OPPG</th>
            <th className={`${headCell} text-center`}>Diff</th>
            <th className={`${headCell} text-center`}>Last 5</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((team, index) => {
            const teamName = team.originalName || team.team;
            const ppg = team.games > 0 ? team.pointsFor / team.games : 0;
            const oppg = team.games > 0 ? team.pointsAgainst / team.games : 0;
            const diff = ppg - oppg;
            return (
              <tr
                key={`${team.team}-${index}`}
                className="border-b border-gray-100 dark:border-neutral-700 hover:bg-[color:var(--ch-surface-2)] transition-colors group"
              >
                <td className="py-3 px-2.5 sticky left-0 z-10 max-w-[150px] md:max-w-[190px] xl:max-w-none bg-white dark:bg-neutral-900 group-hover:bg-[color:var(--ch-surface-2)] transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 shrink-0 text-right font-medium text-slate-600 dark:text-slate-400 text-xs tabular-nums">{team.rank ?? index + 1}</span>
                    <TeamLogo teamName={teamName} leagueId={leagueId ?? ""} size="sm" logoUrl={getLogoUrl(teamName)} />
                    <EntityLink href={teamPath(teamName, slug)} className="truncate font-medium text-slate-800 dark:text-slate-200 hover:underline underline-offset-2">{team.team}</EntityLink>
                  </div>
                </td>
                <td className={`${numberCell} font-semibold`}>{team.wins}</td>
                <td className={`${numberCell} font-semibold`}>{team.losses}</td>
                <td className={numberCell}>{formatPct(team.winPct)}</td>
                <td className={numberCell}>{team.homeWins ?? 0}-{team.homeLosses ?? 0}</td>
                <td className={numberCell}>{team.awayWins ?? 0}-{team.awayLosses ?? 0}</td>
                <td className={numberCell}>{ppg.toFixed(1)}</td>
                <td className={numberCell}>{oppg.toFixed(1)}</td>
                <td className={`${numberCell} font-semibold ${diff > 0 ? "!text-green-600 dark:!text-green-400" : diff < 0 ? "!text-red-600 dark:!text-red-400" : ""}`}>{formatDiff(diff)}</td>
                <td className="py-3 px-2.5"><LastFive results={team.lastFive ?? []} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StandingsLegend() {
  const items = [
    ["PCT", "Win Percentage"],
    ["Home", "Home Record"],
    ["Away", "Away Record"],
    ["PPG", "Points Per Game"],
    ["OPPG", "Opponent Points Per Game"],
    ["Diff", "Point Differential Per Game"],
    ["Last 5", "Most Recent Game on the Right"],
  ];
  return (
    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-neutral-700 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex gap-x-4 gap-y-1 flex-wrap">
        {items.map(([label, meaning]) => (
          <span key={label}><span className="font-semibold">{label}</span> = {meaning}</span>
        ))}
      </div>
    </div>
  );
}
