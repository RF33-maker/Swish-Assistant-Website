import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Calculator } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import {
  SWISH_SCORE_FT_SHARE,
  SWISH_SCORE_SHOOTING_WEIGHT,
  SWISH_SCORE_WEIGHTS,
  SWISH_SCORE_WIN_BONUS,
  formatSwishScore,
  swishScoreBreakdown,
} from "@shared/swishScore";

const SITE_URL = "https://swishassistant.com";

const W = SWISH_SCORE_WEIGHTS;
const WEIGHT_ROWS: { stat: string; weight: string; why: string }[] = [
  { stat: "Points", weight: `× ${W.pts}`, why: "Every point counts once here, and again in the shooting part below." },
  { stat: "Rebounds", weight: `× ${W.reb}`, why: "Ending the other team's possession, or giving yours another one." },
  { stat: "Assists", weight: `× ${W.ast}`, why: "Creating a basket for a teammate." },
  { stat: "Steals", weight: `× ${W.stl}`, why: "Taking a possession away, often for an easy basket the other way." },
  { stat: "Blocks", weight: `× ${W.blk}`, why: "Stopping a shot at the rim. Rarer than a steal, so worth a little more." },
  { stat: "Turnovers", weight: `× −${Math.abs(W.tov)}`, why: "Giving the ball away costs your team a possession." },
];

type Line = { pts: number; reb: number; ast: number; stl: number; blk: number; tov: number; fga: number; fta: number; won: boolean };
const EXAMPLE: Line = { pts: 24, reb: 8, ast: 5, stl: 2, blk: 1, tov: 3, fga: 17, fta: 5, won: true };
const FIELDS: { key: Exclude<keyof Line, "won">; label: string }[] = [
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "tov", label: "TOV" },
  { key: "fga", label: "FGA" },
  { key: "fta", label: "FTA" },
];

const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const signed = (v: number) => `${v < 0 ? "−" : "+"} ${one(Math.abs(v))}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="ch-display uppercase font-bold tracking-tight text-[1.6rem] md:text-[2rem] leading-none text-[color:var(--ch-text)]">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] md:text-base leading-relaxed text-[color:var(--ch-text-2)]">{children}</div>
    </section>
  );
}

function ScoreCalculator() {
  const [line, setLine] = useState<Line>(EXAMPLE);
  const b = swishScoreBreakdown(line);
  const set = (key: Exclude<keyof Line, "won">, raw: string) => {
    const v = Math.max(0, Math.min(200, Math.floor(Number(raw) || 0)));
    setLine((l) => ({ ...l, [key]: v }));
  };

  return (
    <div className="ch-card rounded-[var(--ch-radius)] border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] p-4 md:p-6">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">
        <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
        Try it
      </div>
      <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">Type in any box score line to see its Swish Score.</p>

      <div className="mt-4 grid grid-cols-4 sm:grid-cols-8 gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ch-muted)]">{f.label}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={line[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              className="w-full rounded-md border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface-2)] px-2 py-1.5 text-center tabular-nums text-[color:var(--ch-text)] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </label>
        ))}
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-[color:var(--ch-text)]">
        <input
          type="checkbox"
          checked={line.won}
          onChange={(e) => setLine((l) => ({ ...l, won: e.target.checked }))}
          className="h-4 w-4 accent-orange-500"
        />
        Their team won
      </label>

      <dl className="mt-5 divide-y divide-[color:var(--ch-border)] text-sm tabular-nums">
        <div className="flex justify-between py-2">
          <dt className="text-[color:var(--ch-text-2)]">Box score</dt>
          <dd className="text-[color:var(--ch-text)]">{one(b.box)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-2">
          <dt className="text-[color:var(--ch-text-2)]">
            Shooting: {SWISH_SCORE_SHOOTING_WEIGHT} × ({line.pts} pts − {one(b.shotsUsed)} shots used)
          </dt>
          <dd className="text-[color:var(--ch-text)] whitespace-nowrap">{signed(b.shooting)}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-[color:var(--ch-text-2)]">Win</dt>
          <dd className="text-[color:var(--ch-text)]">+ {b.win}</dd>
        </div>
        <div className="flex items-baseline justify-between pt-3">
          <dt className="font-semibold uppercase tracking-wide text-[color:var(--ch-text)]">Swish Score</dt>
          <dd className="ch-display font-bold text-[2.25rem] leading-none text-[color:var(--ch-accent)]">{formatSwishScore(b.total)}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => setLine(EXAMPLE)}
        className="mt-3 text-xs font-semibold text-[color:var(--ch-accent)] hover:underline"
      >
        Reset to the example
      </button>
    </div>
  );
}

/**
 * /swish-score: how the Swish Score is worked out, in the open, so anyone can
 * check why a player won Player of the Week. Numbers come from shared/swishScore.ts.
 */
export default function SwishScorePage() {
  const canonical = `${SITE_URL}/swish-score`;
  const description =
    "How Swish Score works: the formula behind Player of the Week, Team of the Week and top performances on Swish Assistant.";

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Swish Score | Swish Assistant</title>
        <meta name="description" content={description} />
        <meta property="og:title" content="Swish Score | Swish Assistant" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <link rel="canonical" href={canonical} />
      </Helmet>
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 md:px-6 pt-10 md:pt-16 pb-20">
        <div className="ch-rise">
          <span className="inline-flex items-center rounded-full bg-orange-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">
            How we rank performances
          </span>
          <h1 className="mt-4 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.5rem] md:text-[4rem] text-[color:var(--ch-text)]">
            Swish Score
          </h1>
          <p className="mt-5 text-lg md:text-xl text-[color:var(--ch-text-2)] max-w-2xl">
            One number for one game. It picks Player of the Week, Team of the Week and the top performances you see
            across the site. Here is exactly how it is worked out, so anyone can check it.
          </p>
        </div>

        <div className="mt-10 rounded-[var(--ch-radius)] border border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)] p-4 md:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)]">The formula</p>
          <p className="mt-3 font-mono text-[13px] md:text-[15px] leading-relaxed text-[color:var(--ch-text)] break-words">
            PTS + {W.reb} REB + {W.ast} AST + {W.stl} STL + {W.blk} BLK − {Math.abs(W.tov)} TOV
            <br />+ {SWISH_SCORE_SHOOTING_WEIGHT} × (PTS − FGA − {SWISH_SCORE_FT_SHARE} FTA)
            <br />+ {SWISH_SCORE_WIN_BONUS} if the team won
          </p>
        </div>

        <Section title="1. The box score">
          <p>Each stat is worth a set amount, based on how much it usually helps a team win a possession.</p>
          <div className="overflow-hidden rounded-[var(--ch-radius)] border border-[color:var(--ch-border)]">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[color:var(--ch-border)]">
                {WEIGHT_ROWS.map((r) => (
                  <tr key={r.stat} className="bg-[color:var(--ch-surface)]">
                    <td className="px-3 py-2.5 font-semibold text-[color:var(--ch-text)] whitespace-nowrap">{r.stat}</td>
                    <td className="px-3 py-2.5 tabular-nums text-[color:var(--ch-accent)] whitespace-nowrap">{r.weight}</td>
                    <td className="px-3 py-2.5 text-[color:var(--ch-text-2)]">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="2. Shooting">
          <p>
            Scoring 20 points on 10 shots is better than scoring 20 on 25. So the score compares the points a player
            scored with the shots they used to get them.
          </p>
          <p>
            <strong className="text-[color:var(--ch-text)]">Shots used</strong> is field goal attempts plus{" "}
            {SWISH_SCORE_FT_SHARE} for every free throw attempt. That is the same count used for true shooting %: a
            trip to the line for two free throws uses about one shot.
          </p>
          <p>
            A player who scores one point per shot used, roughly 50% true shooting, breaks even. Every point above that
            adds {SWISH_SCORE_SHOOTING_WEIGHT}, and every point below it takes {SWISH_SCORE_SHOOTING_WEIGHT} away. A
            hot shooting night on lots of shots is worth the most. One make from one shot is worth very little.
          </p>
        </Section>

        <Section title="3. The win">
          <p>
            Players on the winning team get {SWISH_SCORE_WIN_BONUS} points. It is small on purpose: enough to split two
            close performances, not enough to beat a clearly bigger night in a loss.
          </p>
        </Section>

        <div className="mt-12">
          <ScoreCalculator />
        </div>

        <Section title="How the awards are picked">
          <p>
            <strong className="text-[color:var(--ch-text)]">Player of the Week</strong> is the highest Swish Score from
            a single game played Monday to Sunday.
          </p>
          <p>
            <strong className="text-[color:var(--ch-text)]">Team of the Week</strong> is the five highest single-game
            Swish Scores of the week, one game per player.
          </p>
          <p>
            We never add a player's games together. Some teams play twice in a weekend and others once, so totals would
            reward the schedule, not the performance. Every player is judged on their best game.
          </p>
        </Section>

        <Section title="Where it comes from">
          <p>
            Swish Score builds on John Hollinger's Game Score, a well-known way to sum up a box score in one number. It
            gives rebounds, steals and blocks more weight, and adds the win, to suit the leagues we cover. The numbers
            come straight from each game's official box score.
          </p>
          <p className="text-sm text-[color:var(--ch-muted)]">
            Updated 20 October 2026. The old fixed bonus for shooting % is gone: it gave a 1-for-1 night as much as a
            30-point one, and missed shots barely counted. The shooting part above replaced it.
          </p>
        </Section>
      </main>
    </div>
  );
}
