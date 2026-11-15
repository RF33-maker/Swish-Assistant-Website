import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { identityKey } from "@shared/teamIdentity";
import {
  ClubMark, eraName, isInProgress, seasonFromStart, seasonShort, seasonStart, teamLabel,
  type SeasonSummary,
} from "./shared";

/**
 * Every season on file as one row, oldest on the left: the side with the best league
 * record each year, the name the league went by at the time, and the years with nothing
 * on file left as gaps. Picking a season opens it in the spread underneath.
 */

type Slot = { year: number; label: string; season: SeasonSummary | null };
type Era = { name: string; from: number; to: number; firstYear: number; lastYear: number };

function buildSlots(seasons: SeasonSummary[]): Slot[] {
  const byYear = new Map(seasons.map((s) => [seasonStart(s.season), s]));
  const years = Array.from(byYear.keys()).filter(Number.isFinite);
  if (years.length === 0) return [];
  const slots: Slot[] = [];
  for (let y = Math.min(...years); y <= Math.max(...years); y++) {
    slots.push({ year: y, label: seasonFromStart(y), season: byYear.get(y) || null });
  }
  return slots;
}

// Runs of seasons played under the same league name ("BBL Championship", then "SLB Championship").
function buildEras(slots: Slot[]): Era[] {
  const eras: Era[] = [];
  slots.forEach((slot, i) => {
    if (!slot.season) return;
    const name = eraName(slot.season.competition);
    const last = eras[eras.length - 1];
    // A year with nothing on file doesn't end an era when the same name carries on after it.
    if (last && last.name === name) { last.to = i; last.lastYear = slot.year; }
    else eras.push({ name, from: i, to: i, firstYear: slot.year, lastYear: slot.year });
  });
  return eras;
}

const eraYears = (era: Era, isLast: boolean) => {
  const end = String((era.lastYear + 1) % 100).padStart(2, "0");
  return isLast ? `${era.firstYear} to now` : `${era.firstYear}–${end}`;
};

export default function SeasonTimeline({
  seasons,
  selected,
  onSelect,
  logos,
  gender,
}: {
  seasons: SeasonSummary[];
  selected: string | null;
  onSelect: (season: string) => void;
  logos?: Record<string, string>;
  gender: string;
}) {
  const slots = useMemo(() => buildSlots(seasons), [seasons]);
  const eras = useMemo(() => buildEras(slots), [slots]);
  const scroller = useRef<HTMLDivElement | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  // Bring the chosen season into view inside the strip (phones scroll it sideways).
  useEffect(() => {
    const el = selected ? buttons.current.get(selected) : null;
    const box = scroller.current;
    if (!el || !box || box.scrollWidth <= box.clientWidth) return;
    const offset = el.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    box.scrollTo({ left: offset - (box.clientWidth - el.offsetWidth) / 2 });
  }, [selected, slots]);

  // Clubs by how many finished seasons they ended with the best record.
  const tally = useMemo(() => {
    const clubs = new Map<string, { name: string; count: number; latest: number }>();
    for (const s of seasons) {
      if (!s.bestRecord || isInProgress(s.season)) continue;
      const key = identityKey(s.bestRecord.team);
      const year = seasonStart(s.season);
      const c = clubs.get(key) || { name: s.bestRecord.team, count: 0, latest: 0 };
      c.count += 1;
      if (year > c.latest) { c.latest = year; c.name = s.bestRecord.team; }
      clubs.set(key, c);
    }
    return Array.from(clubs.values()).sort((a, b) => b.count - a.count || b.latest - a.latest);
  }, [seasons]);

  const move = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    for (let i = index + step; i >= 0 && i < slots.length; i += step) {
      const next = slots[i].season;
      if (next) {
        e.preventDefault();
        onSelect(next.season);
        buttons.current.get(next.season)?.focus();
        return;
      }
    }
  };

  if (slots.length === 0) return null;
  const columns = `repeat(${slots.length}, minmax(78px, 1fr))`;

  return (
    <div>
      <div ref={scroller} className="-mx-4 px-4 md:mx-0 md:px-0 pb-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]">
        <div className="grid gap-x-1" style={{ gridTemplateColumns: columns, minWidth: slots.length * 82 }}>
          {eras.map((era, i) => {
            const current = i === eras.length - 1;
            return (
              <div key={`${era.name}-${era.from}`} className="min-w-0 pb-3" style={{ gridColumn: `${era.from + 1} / ${era.to + 2}`, gridRow: 1 }}>
                <div className="flex items-baseline gap-2 min-w-0" title={`${era.name}, ${eraYears(era, current)}`}>
                  <span className={`truncate text-xs font-semibold ${current ? "text-[color:var(--ch-text)]" : "text-[color:var(--ch-text-2)]"}`}>{era.name}</span>
                  {era.to > era.from && <span className="shrink-0 text-xs tabular-nums text-[color:var(--ch-text-2)]">{eraYears(era, current)}</span>}
                </div>
                <div className={`mt-1.5 h-[3px] rounded-full ${current ? "bg-[color:var(--ch-accent)]" : "bg-[color:var(--ch-border-strong)]"}`} />
              </div>
            );
          })}

          {slots.map((slot, i) => {
            const s = slot.season;
            if (!s) {
              return (
                <div
                  key={slot.label}
                  className="flex flex-col items-center justify-end rounded-[10px] border border-dashed border-[color:var(--ch-border-strong)] px-1 pb-2.5 pt-3 text-center"
                  style={{ gridColumn: i + 1, gridRow: 2 }}
                >
                  <span className="text-[11px] leading-tight text-[color:var(--ch-text-2)]">Nothing on file</span>
                  <span className="mt-2 text-[13px] font-semibold tabular-nums text-[color:var(--ch-text-2)]">{seasonShort(slot.label)}</span>
                </div>
              );
            }
            const active = s.season === selected;
            const live = isInProgress(s.season);
            const best = s.bestRecord;
            return (
              <button
                key={slot.label}
                ref={(el) => { if (el) buttons.current.set(s.season, el); else buttons.current.delete(s.season); }}
                onClick={() => onSelect(s.season)}
                onKeyDown={(e) => move(e, i)}
                aria-pressed={active}
                aria-label={`${s.season}${best ? `, best record ${teamLabel(best.team, gender)} ${best.wins} wins ${best.losses} losses` : ""}${live ? ", season in progress" : ""}`}
                className={`group relative flex flex-col items-center rounded-[10px] px-1 pb-2.5 pt-3 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ch-accent)] ${
                  active ? "bg-[color:var(--ch-surface-2)] shadow-[inset_0_0_0_1px_var(--ch-border-strong)]" : "hover:bg-[color:var(--ch-surface-2)]"
                }`}
                style={{ gridColumn: i + 1, gridRow: 2 }}
              >
                <span className={`transition-transform duration-200 ${active ? "scale-110" : "group-hover:scale-105"}`}>
                  {best ? <ClubMark name={best.team} logos={logos} size={44} /> : <span className="block h-11 w-11 rounded-full border border-dashed border-[color:var(--ch-border-strong)]" />}
                </span>
                <span className="mt-2.5 text-[13px] font-semibold tabular-nums text-[color:var(--ch-text)]">
                  {best ? `${best.wins}–${best.losses}` : "–"}
                </span>
                <span className="mt-0.5 w-full truncate text-[11.5px] text-[color:var(--ch-text-2)]">
                  {best ? teamLabel(best.team, gender) : "No table"}
                </span>
                <span className={`mt-2 text-[13px] font-semibold tabular-nums ${active ? "text-[color:var(--ch-accent)]" : "text-[color:var(--ch-text-2)]"}`}>
                  {seasonShort(s.season)}
                </span>
                {live && <span className="text-[11px] font-medium text-[color:var(--ch-text-2)]">so far</span>}
                {active && <span aria-hidden className="absolute bottom-0 left-3 right-3 h-[3px] rounded-full bg-[color:var(--ch-accent)]" />}
              </button>
            );
          })}
        </div>
      </div>

      {tally.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">Most seasons with the best record</span>
          {tally.slice(0, 6).map((club) => (
            <span key={club.name} className="inline-flex items-center gap-2 text-sm text-[color:var(--ch-text)]">
              <ClubMark name={club.name} logos={logos} size={22} />
              <span className="font-medium">{teamLabel(club.name, gender)}</span>
              <span className="tabular-nums font-semibold text-[color:var(--ch-text-2)]">{club.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
