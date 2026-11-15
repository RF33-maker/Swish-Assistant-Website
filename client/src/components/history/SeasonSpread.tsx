import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { gamePath } from "@shared/seo";
import { ClubMark, PlayerLink, STATS, TeamLink, isInProgress, teamLabel, type SeasonSummary } from "./shared";

/**
 * One season laid out in full: the top of the table on the left, the top three in each
 * stat on the right. `competitions` is a slot for that year's cups and play-offs.
 */
export default function SeasonSpread({
  season,
  gender,
  logos,
  onPrev,
  onNext,
  competitions,
}: {
  season: SeasonSummary;
  gender: string;
  logos?: Record<string, string>;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  competitions?: ReactNode;
}) {
  const live = isInProgress(season.season);
  const table = season.standings?.length ? season.standings : season.bestRecord ? [season.bestRecord] : [];
  const top = table[0];
  const rest = table.slice(1);
  const pct = (t: { wins: number; losses: number }) => (t.wins + t.losses > 0 ? t.wins / (t.wins + t.losses) : 0);

  return (
    // The key restarts the entrance each time another season is picked.
    <div key={season.season} className="ch-rise mt-8 border-t border-[color:var(--ch-border-strong)] pt-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h3 className="ch-display font-bold leading-none tracking-tight text-[3.25rem] md:text-[4.5rem] tabular-nums text-[color:var(--ch-text)]">
            {season.season}
          </h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <Link href={`/competition/${season.competitionSlug}`} className="font-semibold text-[color:var(--ch-text)] hover:underline">
              {season.competition}
            </Link>
            <span className="text-[color:var(--ch-text-2)]">
              {season.games} league games on file{live ? ", season in progress" : ""}
            </span>
          </div>
          {competitions && <div className="mt-2">{competitions}</div>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onPrev || undefined} disabled={!onPrev} aria-label="Earlier season" className="ch-btn ch-btn-ghost w-9 justify-center !p-0 disabled:opacity-35">
            <ChevronLeft className="h-4 w-4 shrink-0" />
          </button>
          <button onClick={onNext || undefined} disabled={!onNext} aria-label="Later season" className="ch-btn ch-btn-ghost w-9 justify-center !p-0 disabled:opacity-35">
            <ChevronRight className="h-4 w-4 shrink-0" />
          </button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-10">
        {/* Top of the table */}
        <div className="lg:col-span-4">
          <div className="ch-eyebrow">{live ? "Best record so far" : "Best record"}</div>
          {top ? (
            <>
              <div className="mt-4 flex items-center gap-4">
                <ClubMark name={top.team} logos={logos} size={84} />
                <div className="min-w-0">
                  <div className="ch-score leading-none text-[3.25rem] text-[color:var(--ch-text)]">
                    {top.wins}<span className="text-[color:var(--ch-muted)]">-</span>{top.losses}
                  </div>
                  <div className="mt-1.5 text-base font-semibold text-[color:var(--ch-text)] break-words">
                    <TeamLink name={top.team} competitionSlug={season.competitionSlug} gender={gender} />
                  </div>
                </div>
              </div>
              {rest.length > 0 && (
                <ol className="mt-6" start={2}>
                  {rest.map((t, i) => (
                    <li key={t.team} className="flex items-center gap-3 py-2 border-t border-[color:var(--ch-border)]">
                      <span className="w-4 text-xs font-bold tabular-nums text-[color:var(--ch-text-2)]">{i + 2}</span>
                      <ClubMark name={t.team} logos={logos} size={24} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--ch-text)]">
                        <TeamLink name={t.team} competitionSlug={season.competitionSlug} gender={gender} />
                      </span>
                      <span aria-hidden className="hidden sm:block w-16 h-1 rounded-full bg-[color:var(--ch-surface-3)] overflow-hidden">
                        <span className="block h-full rounded-full bg-[color:var(--ch-text-2)]" style={{ width: `${Math.round(pct(t) * 100)}%` }} />
                      </span>
                      <span className="w-12 text-right text-sm font-semibold tabular-nums text-[color:var(--ch-text)]">{t.wins}–{t.losses}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-[color:var(--ch-text-2)]">Too few results are on file to show a table for this season.</p>
          )}

          {(season.high || season.perTeamGame) && (
            <dl className="mt-6 grid grid-cols-2 gap-x-6 border-t border-[color:var(--ch-border)] pt-4">
              {season.high && (
                <div className="min-w-0">
                  <dt className="ch-eyebrow">Season high</dt>
                  <dd className="mt-1">
                    <Link href={gamePath(season.high.competitionSlug, season.high.gameKey)} className="text-xl font-bold tabular-nums text-[color:var(--ch-text)] hover:underline">
                      {season.high.value} <span className="text-xs font-semibold text-[color:var(--ch-text-2)]">pts</span>
                    </Link>
                    <PlayerLink name={season.high.name} href={season.high.href} className="block text-xs font-medium text-[color:var(--ch-text-2)] break-words" />
                  </dd>
                </div>
              )}
              {season.perTeamGame && (
                <div className="min-w-0">
                  <dt className="ch-eyebrow">Team average</dt>
                  <dd className="mt-1">
                    <span className="text-xl font-bold tabular-nums text-[color:var(--ch-text)]">
                      {season.perTeamGame.pts.toFixed(1)} <span className="text-xs font-semibold text-[color:var(--ch-text-2)]">pts</span>
                    </span>
                    <span className="block text-xs text-[color:var(--ch-text-2)]">{season.perTeamGame.tpm.toFixed(1)} threes a game</span>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {/* Leaders: the top three in each stat */}
        <div className="lg:col-span-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="ch-eyebrow">Season leaders</div>
            <div className="text-xs text-[color:var(--ch-text-2)]">Per game, {season.minGames}+ games played</div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-7">
            {STATS.map((stat) => {
              const list = season.leaders[stat.key] || [];
              const leader = list[0];
              if (!leader) return null;
              return (
                <div key={stat.key} className="min-w-0 border-t border-[color:var(--ch-border-strong)] pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{stat.label}</span>
                    <span className="text-xs text-[color:var(--ch-text-2)]">{stat.unit}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <ClubMark name={leader.team} logos={logos} size={36} />
                    <div className="min-w-0 flex-1">
                      <PlayerLink name={leader.name} href={leader.href} className="block truncate text-[15px] font-semibold text-[color:var(--ch-text)]" />
                      <div className="truncate text-xs text-[color:var(--ch-text-2)]">{teamLabel(leader.team, gender)}</div>
                    </div>
                    <span className="text-[1.75rem] font-bold leading-none tabular-nums text-[color:var(--ch-text)]">{leader.value.toFixed(1)}</span>
                  </div>
                  {list.slice(1).map((l, i) => (
                    <div key={l.key} className="mt-2.5 flex items-baseline gap-2 text-sm">
                      <span className="w-3 text-xs font-bold tabular-nums text-[color:var(--ch-text-2)]">{i + 2}</span>
                      <PlayerLink name={l.name} href={l.href} className="min-w-0 flex-1 truncate font-medium text-[color:var(--ch-text)]" />
                      <span className="font-semibold tabular-nums text-[color:var(--ch-text)]">{l.value.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
