import type { ReactNode } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import GameFlowSummary from "@/components/GameFlowSummary";
import { overtimeScores, type RawGameEvent } from "@/lib/gameFlow";
import { StatCompareRow, type MatchupColors } from "./GameScoreHero";
import EntityLink from "@/components/EntityLink";

/**
 * The body of a played game's Game and Team Stats tabs, shared by the league
 * page's inline game view and the standalone /game page.
 */

export interface GameTeamTotals {
  tot_spoints: number;
  p1_score: number | null;
  p2_score: number | null;
  p3_score: number | null;
  p4_score: number | null;
  tot_sfieldgoalsmade: number;
  tot_sfieldgoalsattempted: number;
  tot_sthreepointersmade: number;
  tot_sthreepointersattempted: number;
  tot_sfreethrowsmade: number;
  tot_sfreethrowsattempted: number;
  tot_sreboundstotal: number;
  tot_sassists: number;
  tot_ssteals: number;
  tot_sblocks: number;
  tot_sturnovers: number;
}

export interface GameLeaderPlayer {
  name: string;
  spoints: number;
  sreboundstotal: number;
  sassists: number;
  ssteals?: number | null;
  sblocks?: number | null;
  /** The player's page, so leader names are real links. */
  href?: string | null;
  onSelect?: (() => void) | null;
}

type Colors = Pick<MatchupColors, "home" | "away">;

const LEADER_CATEGORIES = [
  { key: "spoints", label: "PTS" },
  { key: "sreboundstotal", label: "REB" },
  { key: "sassists", label: "AST" },
  { key: "ssteals", label: "STL" },
  { key: "sblocks", label: "BLK" },
] as const;

/** A titled card on the game view. */
export function GameSection({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`ch-card p-4 md:p-5 ${className}`}>
      <h3 className="ch-eyebrow mb-3.5">{title}</h3>
      {children}
    </section>
  );
}

export function GameEmptyCard({ children }: { children: ReactNode }) {
  return (
    <div className="ch-card p-8 text-center">
      <p className="text-sm text-[color:var(--ch-text-2)]">{children}</p>
    </div>
  );
}

const n = (v: number | null | undefined) => v || 0;
const pct = (made: number, att: number) => (att > 0 ? (made / att) * 100 : 0);
const pctLabel = (made: number, att: number) => (
  <>
    {pct(made, att).toFixed(1)}%
    <span className="ml-1.5 text-[11px] font-normal text-[color:var(--ch-muted)]">{made}/{att}</span>
  </>
);

function QuarterTable({ homeTeam, awayTeam, home, away, leagueId, colors, events }: {
  homeTeam: string; awayTeam: string; home: GameTeamTotals; away: GameTeamTotals; leagueId?: string | null; colors: Colors;
  events?: unknown[] | null;
}) {
  const quarters = ([1, 2, 3, 4] as const)
    .map((p) => ({ p, home: n(home[`p${p}_score`]), away: n(away[`p${p}_score`]) }))
    .filter((q) => q.home > 0 || q.away > 0);
  if (quarters.length === 0) return null;

  // Only quarters 1-4 are stored, so any overtime shows up as the gap between the
  // final score and the four-quarter sum.
  const regulation = (side: "home" | "away") => quarters.reduce((s, q) => s + q[side], 0);
  const ot = { home: Math.max(0, n(home.tot_spoints) - regulation("home")), away: Math.max(0, n(away.tot_spoints) - regulation("away")) };
  const hasOt = n(home.tot_spoints) > 0 && n(away.tot_spoints) > 0 && (ot.home > 0 || ot.away > 0);

  // With more than one overtime, split the gap per overtime using the play-by-play.
  // Only trust the split if it adds back up to the gap; otherwise show it as one OT.
  const split = hasOt && events ? overtimeScores(events as RawGameEvent[]) : [];
  const splitAddsUp =
    split.length > 1 &&
    split.reduce((s, o) => s + o.home, 0) === ot.home &&
    split.reduce((s, o) => s + o.away, 0) === ot.away;
  const otColumns: { key: string; label: string; home: number; away: number }[] = !hasOt
    ? []
    : splitAddsUp
      ? split.map((o) => ({ key: `ot${o.period}`, label: `OT${o.period - 4}`, home: o.home, away: o.away }))
      : [{ key: "ot", label: "OT", home: ot.home, away: ot.away }];

  return (
    <GameSection title="Quarter by quarter">
      <div className="overflow-x-auto">
        <table className="ch-table w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--ch-border)]">
              <th className="text-left py-2 pr-2">Team</th>
              {quarters.map((q) => <th key={q.p} className="text-center py-2 px-1 sm:px-1.5 w-9 sm:w-11">Q{q.p}</th>)}
              {otColumns.map((c) => <th key={c.key} className="text-center py-2 px-1 sm:px-1.5 w-9 sm:w-11">{c.label}</th>)}
              <th className="text-center py-2 pl-1 sm:pl-1.5 w-10 sm:w-12">T</th>
            </tr>
          </thead>
          <tbody>
            {([{ team: homeTeam, side: "home" as const }, { team: awayTeam, side: "away" as const }]).map(({ team, side }) => {
              const tot = hasOt ? n((side === "home" ? home : away).tot_spoints) : regulation(side);
              const oppTot = hasOt ? n((side === "home" ? away : home).tot_spoints) : regulation(side === "home" ? "away" : "home");
              const teamColor = colors[side];
              return (
                <tr key={side} className={side === "home" ? "border-b border-[color:var(--ch-border)]" : ""}>
                  <td className="py-2.5 pr-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: teamColor }} />
                      {leagueId && <span className="hidden shrink-0 sm:inline-flex"><TeamLogo teamName={team} leagueId={leagueId} size="xs" /></span>}
                      <span className="min-w-0 break-words text-xs leading-tight font-medium text-[color:var(--ch-text)] line-clamp-3 sm:line-clamp-none sm:truncate sm:text-sm">
                        {team}
                      </span>
                    </span>
                  </td>
                  {quarters.map((q) => {
                    const val = q[side];
                    const opp = q[side === "home" ? "away" : "home"];
                    return (
                      <td key={q.p} className={`ch-num text-center py-2.5 px-1 sm:px-1.5 ${val > opp ? "font-bold text-[color:var(--ch-text)]" : "text-[color:var(--ch-text-2)]"}`}>
                        {val}
                      </td>
                    );
                  })}
                  {otColumns.map((c) => (
                    <td key={c.key} className={`ch-num text-center py-2.5 px-1 sm:px-1.5 ${c[side] > c[side === "home" ? "away" : "home"] ? "font-bold text-[color:var(--ch-text)]" : "text-[color:var(--ch-text-2)]"}`}>
                      {c[side]}
                    </td>
                  ))}
                  <td className="ch-display ch-num text-center py-2.5 pl-1 sm:pl-1.5 text-lg font-bold" style={{ color: tot > oppTot ? teamColor : "var(--ch-text-2)" }}>
                    {tot}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GameSection>
  );
}

/** Made/attempted for FG, 3PT and FT, home and away, shared by the Game and Team Stats tabs. */
function shootingLines(home: GameTeamTotals, away: GameTeamTotals) {
  return [
    { key: "fg", short: "FG%", label: "Field goals", hm: home.tot_sfieldgoalsmade, ha: home.tot_sfieldgoalsattempted, am: away.tot_sfieldgoalsmade, aa: away.tot_sfieldgoalsattempted },
    { key: "3p", short: "3PT%", label: "Three pointers", hm: home.tot_sthreepointersmade, ha: home.tot_sthreepointersattempted, am: away.tot_sthreepointersmade, aa: away.tot_sthreepointersattempted },
    { key: "ft", short: "FT%", label: "Free throws", hm: home.tot_sfreethrowsmade, ha: home.tot_sfreethrowsattempted, am: away.tot_sfreethrowsmade, aa: away.tot_sfreethrowsattempted },
  ];
}

function ShootingRow({ line, label, colors }: { line: ReturnType<typeof shootingLines>[number]; label: string; colors: Colors }) {
  return (
    <StatCompareRow
      label={label}
      colors={colors}
      home={pct(n(line.hm), n(line.ha))}
      away={pct(n(line.am), n(line.aa))}
      homeDisplay={pctLabel(n(line.hm), n(line.ha))}
      awayDisplay={pctLabel(n(line.am), n(line.aa))}
    />
  );
}

function ShootingRows({ home, away, colors }: { home: GameTeamTotals; away: GameTeamTotals; colors: Colors }) {
  return (
    <div className="space-y-3.5">
      {shootingLines(home, away).map((line) => <ShootingRow key={line.key} line={line} label={line.short} colors={colors} />)}
    </div>
  );
}

function CountingRows({ home, away, colors, withShooting = false }: { home: GameTeamTotals; away: GameTeamTotals; colors: Colors; withShooting?: boolean }) {
  return (
    <div className="grid gap-x-8 gap-y-3.5 md:grid-cols-2">
      <StatCompareRow label="Points" home={n(home.tot_spoints)} away={n(away.tot_spoints)} colors={colors} />
      <StatCompareRow label="Rebounds" home={n(home.tot_sreboundstotal)} away={n(away.tot_sreboundstotal)} colors={colors} />
      <StatCompareRow label="Assists" home={n(home.tot_sassists)} away={n(away.tot_sassists)} colors={colors} />
      <StatCompareRow label="Steals" home={n(home.tot_ssteals)} away={n(away.tot_ssteals)} colors={colors} />
      <StatCompareRow label="Blocks" home={n(home.tot_sblocks)} away={n(away.tot_sblocks)} colors={colors} />
      <StatCompareRow label="Turnovers" home={n(home.tot_sturnovers)} away={n(away.tot_sturnovers)} colors={colors} lowerIsBetter />
      {withShooting && shootingLines(home, away).map((line) => (
        <ShootingRow key={line.key} line={line} label={line.label} colors={colors} />
      ))}
    </div>
  );
}

function LeadersCard({ homeTeam, awayTeam, homePlayers, awayPlayers, leagueId, colors }: {
  homeTeam: string; awayTeam: string; homePlayers: GameLeaderPlayer[]; awayPlayers: GameLeaderPlayer[]; leagueId?: string | null; colors: Colors;
}) {
  return (
    <GameSection title="Team leaders">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {[
          { team: homeTeam, players: homePlayers, color: colors.home },
          { team: awayTeam, players: awayPlayers, color: colors.away },
        ].map(({ team, players, color }) => (
          <div key={team} className="ch-tile p-3 border-t-[3px]" style={{ borderTopColor: color }}>
            <div className="flex items-center gap-2 mb-2.5">
              {leagueId && <TeamLogo teamName={team} leagueId={leagueId} size="xs" />}
              <span className="truncate text-sm font-semibold text-[color:var(--ch-text)]">{team}</span>
            </div>
            {players.length === 0 ? (
              <p className="text-xs text-[color:var(--ch-muted)]">No data</p>
            ) : (
              <div className="divide-y divide-[color:var(--ch-border)]">
                {LEADER_CATEGORIES.map(({ key, label }) => {
                  const leader = [...players].sort((a, b) => n(b[key]) - n(a[key]))[0];
                  return (
                    <div key={key} className="flex items-center gap-3 py-1.5 text-sm">
                      <span className="w-8 shrink-0 text-[10.5px] font-semibold tracking-[0.07em] text-[color:var(--ch-muted)]">{label}</span>
                      <span className="min-w-0 flex-1 truncate text-[color:var(--ch-text)]">
                        {leader.href ? (
                          <EntityLink href={leader.href} onNavigate={leader.onSelect || undefined} className="hover:underline underline-offset-2">{leader.name}</EntityLink>
                        ) : leader.name}
                      </span>
                      <span className="ch-display ch-num text-lg font-bold" style={{ color }}>{n(leader[key])}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </GameSection>
  );
}

/** Everything on the Game tab once a game has stats. */
export function GameOverviewSections({
  homeTeam, awayTeam, leagueId, home, away, homePlayers, awayPlayers, events, colors, recap,
}: {
  homeTeam: string;
  awayTeam: string;
  leagueId?: string | null;
  home: GameTeamTotals | null;
  away: GameTeamTotals | null;
  homePlayers: GameLeaderPlayer[];
  awayPlayers: GameLeaderPlayer[];
  events?: unknown[] | null;
  colors: Colors;
  /** A written recap of the result (shared/recaps.ts gameRecap). */
  recap?: string[];
}) {
  const hasTeamStats = !!home && !!away;
  const hasPlayers = homePlayers.length > 0 || awayPlayers.length > 0;

  if (!hasTeamStats && !hasPlayers) {
    return <GameEmptyCard>Game statistics will appear here once the game starts.</GameEmptyCard>;
  }

  return (
    <div className="space-y-4">
      {recap && recap.length > 0 && (
        <GameSection title="Game recap">
          <p className="text-[15px] leading-relaxed text-[color:var(--ch-text)]" data-testid="game-recap">{recap.join(" ")}</p>
        </GameSection>
      )}
      {hasTeamStats && (
        // grid-cols-1 is minmax(0, 1fr): without it a wide table (a 4-5 overtime game) stretches
        // the whole column on a phone instead of scrolling inside its own card.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <QuarterTable homeTeam={homeTeam} awayTeam={awayTeam} home={home!} away={away!} leagueId={leagueId} colors={colors} events={events} />
          <GameSection title="Shooting">
            <ShootingRows home={home!} away={away!} colors={colors} />
          </GameSection>
        </div>
      )}

      {hasTeamStats && (
        <GameSection title="Team comparison">
          <CountingRows home={home!} away={away!} colors={colors} />
        </GameSection>
      )}

      {hasPlayers && (
        <LeadersCard homeTeam={homeTeam} awayTeam={awayTeam} homePlayers={homePlayers} awayPlayers={awayPlayers} leagueId={leagueId} colors={colors} />
      )}

      {events && events.length > 0 && (
        <GameSection title="Game flow">
          <GameFlowSummary events={events as any} homeTeam={homeTeam} awayTeam={awayTeam} />
        </GameSection>
      )}
    </div>
  );
}

/** The Team Stats tab: every team total side by side. */
export function TeamStatsComparison({ homeTeam, awayTeam, home, away, colors }: {
  homeTeam: string; awayTeam: string; home: GameTeamTotals | null; away: GameTeamTotals | null; colors: Colors;
}) {
  if (!home || !away) return <GameEmptyCard>Team stats will appear when available.</GameEmptyCard>;
  return (
    <section className="ch-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm font-semibold">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors.home }} />
          <span className="truncate text-[color:var(--ch-text)]">{homeTeam}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[color:var(--ch-text)]">{awayTeam}</span>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors.away }} />
        </span>
      </div>
      <CountingRows home={home} away={away} colors={colors} withShooting />
    </section>
  );
}

/** The five game tabs in the redesign's segmented style. */
export const GAME_TAB_LIST_CLASS = "ch-seg !flex h-auto w-full justify-start overflow-x-auto scrollbar-hide mb-4 md:!grid md:grid-cols-5";
export const GAME_TAB_TRIGGER_CLASS = "shrink-0 whitespace-nowrap px-3.5 py-2 text-xs md:text-sm";
