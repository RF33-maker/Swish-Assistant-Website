import { useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { gamePath } from "@shared/seo";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import { ClubMark, PlayerLink, STATS, formatDate, teamLabel, type GameRecord, type HistoryData, type StatKey } from "./shared";

/**
 * The single-game records as a board: the scoring record across the top with the
 * games that came closest, then one plaque per other stat.
 */

const RECORD_TITLE: Record<StatKey, string> = {
  pts: "Most points in a game",
  reb: "Rebounds",
  ast: "Assists",
  stl: "Steals",
  blk: "Blocks",
  tpm: "3-pointers",
};

/**
 * An oval fade: the face stays clear and every edge melts into the page, so cut-outs and
 * photos with their own background both sit in it. It is cut furthest on the right, where
 * the number lies over it.
 */
const OVAL = "radial-gradient(ellipse 58% 62% at 44% 40%, #000 38%, transparent 100%)";
const FADE: CSSProperties = { maskImage: OVAL, WebkitMaskImage: OVAL };

/**
 * The record holder's photo, set just left of the number and fading into it, so the
 * figure has a face. Only shown when every holder of the record is the same player:
 * one face beside a shared record would credit the wrong person.
 */
const facePath = (holders: GameRecord[]) =>
  holders[0]?.photo && holders.every((r) => r.key === holders[0].key) ? holders[0].photo : null;

function RecordFace({ holders, className }: { holders: GameRecord[]; className: string }) {
  const [failed, setFailed] = useState(false);
  const path = facePath(holders);
  if (failed || !path) return null;
  const src = /^https?:/i.test(path) ? path : getPlayerPhotoUrlCached(path);
  if (!src) return null;
  return (
    <div aria-hidden className={`pointer-events-none shrink-0 select-none ${className}`}>
      <PlayerHeadshot
        src={src}
        variant="web"
        alt=""
        loading="lazy"
        className="h-full w-full object-cover object-top"
        style={FADE}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function Fixture({ record, gender, logos, size = 20 }: { record: GameRecord; gender: string; logos?: Record<string, string>; size?: number }) {
  return (
    <Link href={gamePath(record.competitionSlug, record.gameKey)} className="group/fx inline-flex items-center gap-2 text-[color:var(--ch-text-2)]">
      <ClubMark name={record.team} logos={logos} size={size} />
      <span className="min-w-0 group-hover/fx:underline">
        {teamLabel(record.team, gender)}{record.opponent ? ` v ${teamLabel(record.opponent, gender)}` : ""}
      </span>
      {record.opponent && <ClubMark name={record.opponent} logos={logos} size={size} />}
    </Link>
  );
}

export default function RecordBoard({ data, gender }: { data: HistoryData; gender: string }) {
  const points = data.records.pts || [];
  const top = points[0];
  if (!top) return null;
  const tiedTop = points.filter((r) => r.value === top.value);
  const chasers = points.filter((r) => r.value < top.value).slice(0, 4);
  const line = top.line ? STATS.filter((s) => s.key !== "pts" && (top.line![s.key] || 0) > 0) : [];
  // A plaque with a face stands taller, so the plaques beside it give their numbers the
  // same height and the names underneath still line up: in pairs on phones, all five wide.
  const plaqueFaces = STATS.filter((s) => s.key !== "pts").map((s) => {
    const best = data.records[s.key] || [];
    return Boolean(best[0] && facePath(best.filter((r) => r.value === best[0].value)));
  });
  const faceInPair = (i: number) => plaqueFaces[i - (i % 2)] || plaqueFaces[i - (i % 2) + 1];
  const faceInRow = plaqueFaces.some(Boolean);

  return (
    <div className="mt-8 grid grid-cols-2 lg:grid-cols-5 gap-x-6 md:gap-x-8 gap-y-9">
      {/* The scoring record */}
      <div className="col-span-2 lg:col-span-5 border-t-2 border-[color:var(--ch-accent)]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-10">
          <div className="lg:col-span-7 pt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{RECORD_TITLE.pts}</div>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
              <div className="flex items-end">
                <RecordFace holders={tiedTop} className="-mr-12 md:-mr-16 h-[150px] w-[124px] md:h-[204px] md:w-[170px]" />
                <div className="relative ch-score leading-[0.8] text-[5.5rem] md:text-[7.5rem] text-[color:var(--ch-accent)]">{top.value}</div>
              </div>
              <div className="min-w-[200px] flex-1 pb-1">
                {tiedTop.slice(0, 2).map((r) => (
                  <div key={`${r.gameKey}-${r.key}`} className="mb-2 last:mb-0">
                    <PlayerLink name={r.name} href={r.href} className="block ch-display font-bold leading-tight text-2xl md:text-[2rem] text-[color:var(--ch-text)] break-words" />
                    <div className="mt-1.5 text-sm"><Fixture record={r} gender={gender} logos={data.logos} /></div>
                    <div className="mt-1 text-sm text-[color:var(--ch-text-2)]">
                      {/* Each part stays whole: "2025-26" must not split over two lines. */}
                      {[formatDate(r.date), r.competition].filter(Boolean).map((part, i) => (
                        <span key={i}>{i > 0 && " · "}<span className="whitespace-nowrap">{part}</span></span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {line.length > 0 && tiedTop.length === 1 && (
              <dl className="mt-6 flex flex-wrap items-end gap-x-7 gap-y-3 border-t border-[color:var(--ch-border)] pt-4">
                <div className="w-full sm:w-auto pb-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">In the same game</div>
                {line.map((s) => (
                  <div key={s.key}>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{s.label}</dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums text-[color:var(--ch-text)]">{top.line![s.key]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {chasers.length > 0 && (
            <div className="lg:col-span-5 mt-6 lg:mt-0 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">The closest anyone else has come</div>
              <ol className="mt-3">
                {chasers.map((r) => (
                  <li key={`${r.gameKey}-${r.key}`} className="flex items-center gap-3 py-2.5 border-b last:border-b-0 border-[color:var(--ch-border)]">
                    <span className="w-9 text-xl font-bold tabular-nums text-[color:var(--ch-text)]">{r.value}</span>
                    <ClubMark name={r.team} logos={data.logos} size={26} />
                    <div className="min-w-0 flex-1">
                      <PlayerLink name={r.name} href={r.href} className="block truncate text-sm font-semibold text-[color:var(--ch-text)]" />
                      <Link href={gamePath(r.competitionSlug, r.gameKey)} className="block truncate text-[13px] text-[color:var(--ch-text-2)] hover:underline">
                        {r.opponent ? `v ${teamLabel(r.opponent, gender)} · ` : ""}{formatDate(r.date)}
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* One plaque per other stat */}
      {STATS.filter((s) => s.key !== "pts").map((stat, i, all) => {
        const best = data.records[stat.key] || [];
        const record = best[0];
        if (!record) return null;
        const tied = best.filter((r) => r.value === record.value);
        // Five plaques in two columns leave one over: the last runs the full width on phones.
        const wide = i === all.length - 1 && all.length % 2 === 1;
        return (
          <div key={stat.key} className={`min-w-0 border-t border-[color:var(--ch-border-strong)] pt-4 ${wide ? "col-span-2 lg:col-span-1" : ""}`}>
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{RECORD_TITLE[stat.key]}</div>
            <div className={`mt-2 flex items-end ${faceInPair(i) ? "min-h-[84px]" : ""} ${faceInRow ? "lg:min-h-[84px]" : ""}`}>
              <RecordFace holders={tied} className="-mr-6 h-[84px] w-[70px]" />
              <div className="relative ch-score leading-none text-[3.5rem] text-[color:var(--ch-text)]">{record.value}</div>
            </div>
            {tied.slice(0, 2).map((r) => (
              <div key={`${r.gameKey}-${r.key}`} className="mt-3">
                <PlayerLink name={r.name} href={r.href} className="block text-sm font-semibold text-[color:var(--ch-text)] break-words" />
                <Link href={gamePath(r.competitionSlug, r.gameKey)} className="mt-1.5 flex items-start gap-2 text-[13px] text-[color:var(--ch-text-2)] hover:underline">
                  <ClubMark name={r.team} logos={data.logos} size={18} className="mt-px" />
                  <span className="min-w-0">
                    {teamLabel(r.team, gender)}{r.opponent ? ` v ${teamLabel(r.opponent, gender)}` : ""}
                    <span className="block text-xs text-[color:var(--ch-text-2)]">{formatDate(r.date)}</span>
                  </span>
                </Link>
              </div>
            ))}
            {tied.length > 2 && <div className="mt-2 text-xs text-[color:var(--ch-text-2)]">and {tied.length - 2} more</div>}
          </div>
        );
      })}
    </div>
  );
}
