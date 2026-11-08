import { Link } from "wouter";
import type { AskCard, CompareCard, GameCard, ScoresCard, TableCard } from "@shared/askSwish";
import { gamePath } from "@shared/seo";
import { LiveDot } from "@/components/ui/live-dot";
import LeaderboardTable from "@/components/league-chatbot/LeaderboardTable";
import StandingsTable from "@/components/league-chatbot/StandingsTable";
import PlayerStatCard from "@/components/league-chatbot/PlayerStatCard";

/**
 * The cards an answer can carry. Leaderboards, standings and player cards
 * reuse the League Assistant's components; the rest are new shapes.
 */

const shell = "rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden";
const head = "px-3.5 py-2.5 border-b border-gray-200 dark:border-neutral-700";

function Table({ data, brandColor }: { data: TableCard; brandColor: string }) {
  return (
    <div className={shell}>
      <div className={head}>
        <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{data.title}</h4>
        {data.subtitle && <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">{data.subtitle}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {data.columns.some(Boolean) && (
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                {data.columns.map((c, i) => (
                  <th key={i} className={`px-3 py-1.5 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {data.rows.map((row, r) => (
              <tr key={r} className="border-t border-gray-100 dark:border-neutral-800">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-3 py-1.5 whitespace-nowrap ${c === 0 ? "text-left text-slate-800 dark:text-white font-medium" : "text-right tabular-nums text-slate-600 dark:text-neutral-300"} ${c === data.highlightCol ? "font-bold" : ""}`}
                    style={c === data.highlightCol && r === 0 ? { color: brandColor } : undefined}
                  >
                    {cell ?? "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Compare({ data, brandColor }: { data: CompareCard; brandColor: string }) {
  return (
    <div className={shell}>
      <div className={`${head} grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white`}>
        <span className="truncate">{data.a}</span>
        <span className="text-[11px] font-normal text-slate-400 dark:text-neutral-500">{data.title ?? "vs"}</span>
        <span className="truncate text-right">{data.b}</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-neutral-800">
              <td className="px-3 py-1.5 tabular-nums w-[30%]" style={row.better === "a" ? { color: brandColor, fontWeight: 700 } : undefined}>{row.a}</td>
              <td className="px-2 py-1.5 text-center text-xs text-slate-500 dark:text-neutral-400">{row.label}</td>
              <td className="px-3 py-1.5 tabular-nums text-right w-[30%]" style={row.better === "b" ? { color: brandColor, fontWeight: 700 } : undefined}>{row.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.footer && <p className="px-3.5 py-2 text-xs text-slate-500 dark:text-neutral-400 border-t border-gray-100 dark:border-neutral-800">{data.footer}</p>}
    </div>
  );
}

const tipOff = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "TBC";

function Scores({ data }: { data: ScoresCard }) {
  return (
    <div className={shell}>
      <div className={head}><h4 className="text-sm font-semibold text-slate-800 dark:text-white">{data.title}</h4></div>
      <ul>
        {data.games.map((g) => {
          const winnerHome = g.state !== "upcoming" && g.homeScore != null && g.awayScore != null && g.homeScore > g.awayScore;
          const winnerAway = g.state !== "upcoming" && g.homeScore != null && g.awayScore != null && g.awayScore > g.homeScore;
          return (
            <li key={g.gameKey} className="border-t border-gray-100 dark:border-neutral-800">
              <Link href={gamePath(g.leagueSlug, g.gameKey)} className="block px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-neutral-800/60 transition-colors">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className={`truncate ${winnerHome ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-neutral-200"}`}>{g.home}</div>
                    <div className={`truncate ${winnerAway ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-neutral-200"}`}>{g.away}</div>
                  </div>
                  {g.state === "upcoming" ? (
                    <div className="text-right text-xs text-slate-500 dark:text-neutral-400 whitespace-nowrap">{tipOff(g.matchTime)}</div>
                  ) : (
                    <div className="text-right tabular-nums">
                      <div className={winnerHome ? "font-bold" : ""}>{g.homeScore ?? "–"}</div>
                      <div className={winnerAway ? "font-bold" : ""}>{g.awayScore ?? "–"}</div>
                    </div>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-neutral-500">
                  {g.state === "live" && <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold"><LiveDot />Live</span>}
                  {g.state === "final" && <span>Final</span>}
                  {g.leagueName && <span className="truncate">{g.leagueName}</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Game({ data, brandColor }: { data: GameCard; brandColor: string }) {
  const homeWon = data.state === "final" && data.home.score != null && data.away.score != null && data.home.score > data.away.score;
  const awayWon = data.state === "final" && data.home.score != null && data.away.score != null && data.away.score > data.home.score;
  return (
    <div className={shell}>
      <Link href={gamePath(data.leagueSlug, data.gameKey)} className="block px-3.5 py-3 hover:bg-slate-50 dark:hover:bg-neutral-800/60 transition-colors">
        <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-neutral-500 mb-1.5">
          <span>{data.state === "live" ? <span className="text-red-600 dark:text-red-400 font-semibold">Live</span> : data.state === "final" ? "Final" : "Upcoming"}</span>
          <span>{tipOff(data.matchTime)}</span>
        </div>
        {[data.home, data.away].map((side, i) => {
          const won = i === 0 ? homeWon : awayWon;
          return (
            <div key={i} className="flex items-center justify-between gap-3 py-0.5">
              <span className={`truncate text-sm ${won ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-neutral-200"}`}>{side.name}</span>
              <span className="flex items-center gap-2 tabular-nums">
                <span className="text-[11px] text-slate-400 dark:text-neutral-500">{side.quarters.map((q) => q ?? "–").join(" · ")}</span>
                <span className={`text-lg ${won ? "font-bold" : "font-medium"}`} style={won ? { color: brandColor } : undefined}>{side.score ?? "–"}</span>
              </span>
            </div>
          );
        })}
      </Link>
      {data.factors && data.factors.length > 0 && (
        <div className="border-t border-gray-100 dark:border-neutral-800 px-3.5 py-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
          {data.factors.map((f) => (
            <div key={f.label} className="flex justify-between gap-2 text-slate-600 dark:text-neutral-300">
              <span className="tabular-nums">{f.home}</span>
              <span className="text-slate-400 dark:text-neutral-500">{f.label}</span>
              <span className="tabular-nums">{f.away}</span>
            </div>
          ))}
        </div>
      )}
      {data.leaders && data.leaders.length > 0 && (
        <ul className="border-t border-gray-100 dark:border-neutral-800 px-3.5 py-2 text-xs space-y-0.5">
          {data.leaders.map((l, i) => (
            <li key={i} className="flex justify-between gap-2"><span className="font-medium text-slate-800 dark:text-white truncate">{l.name}</span><span className="text-slate-500 dark:text-neutral-400 whitespace-nowrap">{l.line}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AskCardView({ card, brandColor }: { card: AskCard; brandColor: string }) {
  switch (card.kind) {
    case "leaderboard": return <LeaderboardTable data={card} brandColor={brandColor} />;
    case "standings": return <StandingsTable data={card} brandColor={brandColor} />;
    case "playerCard": return <PlayerStatCard data={card} brandColor={brandColor} />;
    case "table": return <Table data={card} brandColor={brandColor} />;
    case "compare": return <Compare data={card} brandColor={brandColor} />;
    case "scores": return <Scores data={card} />;
    case "game": return <Game data={card} brandColor={brandColor} />;
    default: return null;
  }
}
