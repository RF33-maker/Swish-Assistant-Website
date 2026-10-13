import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, ExternalLink, Flame, Trophy } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import TradingCard, { type TradingCardPerformance } from "@/components/cards/TradingCard";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import { gamePath, playerPath } from "@shared/seo";
import {
  formatReportDay,
  formatWeekendRange,
  reportDayKey,
  type ReportGame,
  type ReportPerformer,
  type WeekendReportData,
} from "@shared/weekendReport";

/**
 * The weekend match report as readers see it: the weekend's scores (open a
 * row for the game's best lines, or go straight to its box score), the
 * numbers worth a mention, and the best performances as trading cards.
 *
 * It only displays what shared/weekendReport.ts built from the box scores,
 * and every game and player in it links to the page the figures came from.
 * Lists are plain <div role="list"> rather than <ul>: the article stylesheet
 * puts bullets and indents on any list inside a story.
 */

const CLOSE_MARGIN = 5;
const ALL_TEAMS = "";

const gameLink = (g: ReportGame, fallbackSlug: string) => gamePath(g.competitionSlug ?? fallbackSlug, g.gameKey);

function toCard(p: ReportPerformer, data: WeekendReportData, game: ReportGame | undefined): TradingCardPerformance {
  return {
    playerId: p.playerId,
    playerName: p.name,
    teamName: p.team,
    leagueId: game?.leagueId ?? null,
    leagueName: data.competitionName,
    gameDate: p.gameDate,
    opponentName: p.opponent,
    gameResult: p.result,
    gameScore: p.gameScore,
    pts: p.pts,
    reb: p.reb,
    ast: p.ast,
    stl: p.stl,
    blk: p.blk,
    tov: p.tov,
    fgm: p.fgm,
    fga: p.fga,
    tpm: p.tpm,
    tpa: p.tpa,
    ftm: p.ftm,
    fta: p.fta,
    tsPct: p.tsPct,
    cutoutUrl: getPlayerPhotoUrlCached(p.cutoutPath),
    profilePhotoUrl: getPlayerPhotoUrlCached(p.photoPath),
  };
}

function LeaderName({ leader }: { leader: { name: string; slug: string | null; playerId: string } }) {
  const href = playerPath({ slug: leader.slug, name: leader.name, id: leader.playerId });
  return href ? (
    <Link href={href} className="font-semibold text-[color:var(--ch-text)] hover:underline">{leader.name}</Link>
  ) : (
    <span className="font-semibold text-[color:var(--ch-text)]">{leader.name}</span>
  );
}

function SideRow({ team, leagueId, score, won }: { team: string; leagueId: string | null; score: number; won: boolean }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {leagueId ? <TeamLogo teamName={team} leagueId={leagueId} size="xs" className="shrink-0" /> : <span className="h-5 w-5 shrink-0" />}
      <span className={`min-w-0 flex-1 truncate text-[15px] ${won ? "font-bold text-[color:var(--ch-text)]" : "font-medium text-[color:var(--ch-text-2)]"}`}>{team}</span>
      <span className={`tabular-nums text-lg leading-none ${won ? "font-extrabold text-[color:var(--ch-text)]" : "font-semibold text-[color:var(--ch-text-2)]"}`}>{score}</span>
    </div>
  );
}

function GameRow({
  game,
  fallbackSlug,
  open,
  flash,
  onToggle,
}: {
  game: ReportGame;
  fallbackSlug: string;
  open: boolean;
  flash: boolean;
  onToggle: () => void;
}) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  const panelId = `wr-panel-${game.gameKey}`;
  return (
    <div
      id={`wr-game-${game.gameKey}`}
      role="listitem"
      className={`rounded-xl border bg-[color:var(--ch-surface)] transition-shadow ${
        flash ? "border-orange-400 shadow-[0_0_0_3px_rgba(249,115,22,0.25)]" : "border-[color:var(--ch-border)]"
      }`}
      data-testid={`report-game-${game.gameKey}`}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3.5 py-3 text-left hover:bg-[color:var(--ch-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60"
        >
          <span className="min-w-0 flex-1 space-y-1.5">
            <SideRow team={game.home} leagueId={game.leagueId} score={game.homeScore} won={game.homeScore > game.awayScore} />
            <SideRow team={game.away} leagueId={game.leagueId} score={game.awayScore} won={game.awayScore > game.homeScore} />
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1.5">
            {margin <= CLOSE_MARGIN && (
              <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-orange-600 dark:text-orange-400">Close</span>
            )}
            <ChevronDown className={`h-4 w-4 text-[color:var(--ch-muted)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </span>
        </button>
        <Link
          href={gameLink(game, fallbackSlug)}
          className="flex shrink-0 items-center gap-1 rounded-r-xl border-l border-[color:var(--ch-border)] px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--ch-accent)] hover:bg-[color:var(--ch-surface-2)]"
          aria-label={`Box score: ${game.home} ${game.homeScore}, ${game.away} ${game.awayScore}`}
          title="Box score"
        >
          {/* Icon only on a phone, so the team names get the room. */}
          <span className="hidden sm:inline">Box score</span>
          <ExternalLink className="h-3.5 w-3.5 sm:h-3 sm:w-3" aria-hidden="true" />
        </Link>
      </div>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-[color:var(--ch-border)] px-3.5 py-3.5 text-sm">
          {game.recap && <p className="leading-relaxed text-[color:var(--ch-text)]">{game.recap}</p>}

          {game.quarters && (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-center text-[13px] tabular-nums">
                <caption className="sr-only">Points by period</caption>
                {/* Fixed period columns, so the team name takes what's left and truncates. */}
                <colgroup>
                  <col />
                  {game.quarters.home.map((_, i) => (
                    <col key={i} className="w-9 sm:w-12" />
                  ))}
                  <col className="w-11 sm:w-14" />
                </colgroup>
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">
                    <th scope="col" className="py-1 text-left font-semibold">Team</th>
                    {game.quarters.home.map((_, i) => (
                      <th key={i} scope="col" className="px-0 py-1 font-semibold">{i < 4 ? `Q${i + 1}` : game.quarters!.home.length > 5 ? `OT${i - 3}` : "OT"}</th>
                    ))}
                    <th scope="col" className="px-0 py-1 font-semibold">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    [game.home, game.quarters.home, game.homeScore, game.homeScore > game.awayScore],
                    [game.away, game.quarters.away, game.awayScore, game.awayScore > game.homeScore],
                  ] as const).map(([team, periods, total, won]) => (
                    <tr key={team} className="border-t border-[color:var(--ch-border)]">
                      <th scope="row" title={team} className={`truncate py-1.5 pr-2 text-left ${won ? "font-bold text-[color:var(--ch-text)]" : "font-medium text-[color:var(--ch-text-2)]"}`}>{team}</th>
                      {periods.map((p, i) => (
                        <td key={i} className="px-0 py-1.5 text-[color:var(--ch-text-2)]">{p}</td>
                      ))}
                      <td className={`px-0 py-1.5 ${won ? "font-extrabold text-[color:var(--ch-text)]" : "font-semibold text-[color:var(--ch-text-2)]"}`}>{total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {game.leaders && game.leaders.some((t) => t.pts || t.reb || t.ast) ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {game.leaders.map((t) => (
                <div key={t.team} className="min-w-0 rounded-lg bg-[color:var(--ch-surface-2)] px-3 py-2.5">
                  <div className="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">{t.team}</div>
                  <div className="mt-1.5 space-y-1" role="list">
                    {([["Points", t.pts], ["Rebounds", t.reb], ["Assists", t.ast]] as const).map(([label, leader]) =>
                      leader ? (
                        <div key={label} role="listitem" className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate">
                            <span className="text-[12px] text-[color:var(--ch-muted)]">{label} </span>
                            <LeaderName leader={leader} />
                          </span>
                          <span className="font-bold tabular-nums text-[color:var(--ch-text)]">{leader.value}</span>
                        </div>
                      ) : null,
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : game.stars.length ? (
            <div className="space-y-1.5" role="list" aria-label="Best performances in this game">
              {game.stars.map((s) => (
                <div key={`${s.playerId}-${s.name}`} role="listitem" className="flex flex-wrap items-baseline gap-x-2 text-[color:var(--ch-text-2)]">
                  <LeaderName leader={{ name: s.name, slug: s.slug, playerId: s.playerId }} />
                  {s.team && <span className="text-[12px] text-[color:var(--ch-muted)]">{s.team}</span>}
                  <span className="tabular-nums">{s.pts} pts · {s.reb} reb · {s.ast} ast</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[color:var(--ch-muted)]">No individual stats were recorded for this game.</p>
          )}

          <Link
            href={gameLink(game, fallbackSlug)}
            className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--ch-accent)] hover:underline"
          >
            Full box score
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}

const chip =
  "inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60";

export default function WeekendReportBlock({ data }: { data: WeekendReportData }) {
  const [, setLocation] = useLocation();
  const [team, setTeam] = useState(ALL_TEAMS);
  const [closeOnly, setCloseOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);

  const teams = useMemo(
    () => Array.from(new Set(data.games.flatMap((g) => [g.home, g.away]))).sort((a, b) => a.localeCompare(b)),
    [data.games],
  );
  const visible = useMemo(
    () =>
      data.games.filter(
        (g) =>
          (!team || g.home === team || g.away === team) && (!closeOnly || Math.abs(g.homeScore - g.awayScore) <= CLOSE_MARGIN),
      ),
    [data.games, team, closeOnly],
  );
  const days = useMemo(() => {
    const groups: { key: string; label: string; games: ReportGame[] }[] = [];
    for (const g of visible) {
      const key = reportDayKey(g.matchTime);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.games.push(g);
      else groups.push({ key, label: formatReportDay(g.matchTime), games: [g] });
    }
    return groups;
  }, [visible]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // A talking point opens its game and brings it into view.
  const jumpTo = (gameKey: string | null) => {
    if (!gameKey) return;
    setTeam(ALL_TEAMS);
    setCloseOnly(false);
    setOpen((prev) => new Set(prev).add(gameKey));
    setFlash(gameKey);
  };
  useEffect(() => {
    if (!flash) return;
    const frame = requestAnimationFrame(() => document.getElementById(`wr-game-${flash}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    const timer = window.setTimeout(() => setFlash(null), 2200);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [flash]);

  const gameByKey = useMemo(() => new Map(data.games.map((g) => [g.gameKey, g])), [data.games]);
  const totalPoints = data.games.reduce((sum, g) => sum + g.homeScore + g.awayScore, 0);
  const closeCount = data.games.filter((g) => Math.abs(g.homeScore - g.awayScore) <= CLOSE_MARGIN).length;

  return (
    <div className="not-prose space-y-8" data-testid="weekend-report">
      <section aria-label="Weekend summary" className="rounded-2xl border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] p-4 md:p-5">
        <div className="ch-eyebrow">{formatWeekendRange(data.from, data.to)}</div>
        <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--ch-text-2)]">{data.lede}</p>
        {data.games.length > 0 && (
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Games", value: data.games.length },
              { label: "Points", value: totalPoints.toLocaleString("en-GB") },
              { label: `Within ${CLOSE_MARGIN}`, value: closeCount },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-[color:var(--ch-surface-2)] px-2 py-2.5">
                <dd className="ch-display text-2xl font-bold leading-none text-[color:var(--ch-text)] tabular-nums">{s.value}</dd>
                <dt className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ch-muted)]">{s.label}</dt>
              </div>
            ))}
          </dl>
        )}
      </section>

      {data.callouts.length > 0 && (
        <section aria-labelledby="wr-talking">
          <h2 id="wr-talking">Talking points</h2>
          <div className="mt-3 flex flex-col gap-2" role="list">
            {data.callouts.map((c, i) => (
              <button
                key={`${c.kind}-${i}`}
                type="button"
                role="listitem"
                onClick={() => jumpTo(c.gameKey)}
                disabled={!c.gameKey || !gameByKey.has(c.gameKey)}
                className="flex items-start gap-2.5 rounded-xl border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] px-3.5 py-2.5 text-left text-[14px] leading-snug text-[color:var(--ch-text)] hover:border-orange-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 disabled:cursor-default disabled:hover:border-[color:var(--ch-border)]"
              >
                {c.kind === "triple-double" || c.kind === "top-scorer" ? (
                  <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                ) : (
                  <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                )}
                <span>{c.text}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="wr-scores">
        <h2 id="wr-scores">Scores</h2>
        {data.games.length === 0 ? (
          <p className="mt-3 text-[color:var(--ch-muted)]">No completed games this weekend.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="wr-team">Filter by team</label>
              <select
                id="wr-team"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="h-10 max-w-full rounded-full border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] px-3.5 text-[13px] font-semibold text-[color:var(--ch-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60"
              >
                <option value={ALL_TEAMS}>All teams</option>
                {teams.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                type="button"
                aria-pressed={closeOnly}
                onClick={() => setCloseOnly((v) => !v)}
                className={`${chip} ${
                  closeOnly
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] hover:border-orange-300"
                }`}
              >
                Close games
              </button>
              <button
                type="button"
                onClick={() => setOpen((prev) => (prev.size >= visible.length && visible.length > 0 ? new Set() : new Set(visible.map((g) => g.gameKey))))}
                className={`${chip} ml-auto border-transparent text-[color:var(--ch-accent)] hover:underline`}
              >
                {visible.length > 0 && visible.every((g) => open.has(g.gameKey)) ? "Collapse all" : "Expand all"}
              </button>
            </div>

            {visible.length === 0 ? (
              <p className="mt-4 text-[color:var(--ch-muted)]">No games match those filters.</p>
            ) : (
              <div className="mt-4 space-y-5">
                {days.map((day) => (
                  <div key={day.key || "undated"}>
                    {day.label && <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--ch-muted)]">{day.label}</h3>}
                    <div className="space-y-2" role="list">
                      {day.games.map((g) => (
                        <GameRow
                          key={g.gameKey}
                          game={g}
                          fallbackSlug={data.competitionSlug}
                          open={open.has(g.gameKey)}
                          flash={flash === g.gameKey}
                          onToggle={() => toggle(g.gameKey)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {data.performances.length > 0 && (
        <section aria-labelledby="wr-top">
          <h2 id="wr-top">Top performances</h2>
          <p className="mt-2 text-[14px] text-[color:var(--ch-text-2)]">The best single-game lines of the weekend by Game Score. Tap a card for the player.</p>
          <div
            className="tc-sizes -mx-4 mt-2 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-8 pt-3 scrollbar-hide sm:mx-0 sm:scroll-px-0 sm:px-0 md:gap-5"
            role="list"
          >
            {data.performances.map((p) => {
              const href = playerPath({ slug: p.slug, name: p.name, id: p.playerId });
              const game = gameByKey.get(p.gameKey);
              return (
                <div key={`${p.playerId}-${p.gameKey}`} role="listitem" className="shrink-0 snap-start" style={{ width: "var(--fan-card-w)" }}>
                  <TradingCard
                    perf={toCard(p, data, game)}
                    shareTitle={`${data.competitionName} weekend performance`}
                    onOpen={href ? () => setLocation(href) : undefined}
                  />
                  {game && (
                    <Link
                      href={gameLink(game, data.competitionSlug)}
                      className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--ch-accent)] hover:underline"
                    >
                      Full box score
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-[12px] text-[color:var(--ch-muted)]">
        Built automatically from the box scores, then checked again a few days later in case a stat is corrected.{" "}
        <Link href={`/competition/${encodeURIComponent(data.competitionSlug)}`} className="font-semibold text-[color:var(--ch-accent)] hover:underline">
          Go to {data.competitionName}
        </Link>
      </p>
    </div>
  );
}
