import { useMemo, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { identityKey } from "@shared/teamIdentity";
import { ClubMark, isInProgress, seasonStart, teamLabel, type HistoryData, type SeasonSummary } from "./shared";

/**
 * The league in four facts, read before anything else: the best season anyone has had,
 * the club that has topped the table most, the scoring record and the career points
 * leader. Each one takes you to the part of the page it comes from.
 */

type Fact = { key: string; label: string; value: string; mark?: ReactNode; who: string; detail: string; go: () => void };

export default function QuickLook({
  data,
  seasons,
  gender,
  onOpenSeason,
  onJump,
}: {
  data: HistoryData;
  seasons: SeasonSummary[];
  gender: string;
  onOpenSeason: (season: string) => void;
  onJump: (section: string) => void;
}) {
  const facts = useMemo(() => {
    const out: Fact[] = [];
    const finished = seasons.filter((s) => s.bestRecord && !isInProgress(s.season));

    // The best single season: highest win share, more wins breaking a tie.
    const best = [...finished].sort((a, b) => {
      const pa = a.bestRecord!.wins / Math.max(1, a.bestRecord!.wins + a.bestRecord!.losses);
      const pb = b.bestRecord!.wins / Math.max(1, b.bestRecord!.wins + b.bestRecord!.losses);
      return pb - pa || b.bestRecord!.wins - a.bestRecord!.wins;
    })[0];
    if (best?.bestRecord) {
      out.push({
        key: "best-season",
        label: "Best season",
        value: `${best.bestRecord.wins}–${best.bestRecord.losses}`,
        mark: <ClubMark name={best.bestRecord.team} logos={data.logos} size={30} />,
        who: teamLabel(best.bestRecord.team, gender),
        detail: best.season,
        go: () => onOpenSeason(best.season),
      });
    }

    // The club that finished top most often.
    const clubs = new Map<string, { name: string; count: number; latest: number }>();
    for (const s of finished) {
      const team = s.bestRecord!.team;
      const key = identityKey(team);
      const year = seasonStart(s.season);
      const c = clubs.get(key) || { name: team, count: 0, latest: 0 };
      c.count += 1;
      if (year > c.latest) { c.latest = year; c.name = team; }
      clubs.set(key, c);
    }
    const top = Array.from(clubs.values()).sort((a, b) => b.count - a.count || b.latest - a.latest)[0];
    if (top && top.count > 1) {
      out.push({
        key: "most-tops",
        label: "Most top spots",
        value: `${top.count}×`,
        mark: <ClubMark name={top.name} logos={data.logos} size={30} />,
        who: teamLabel(top.name, gender),
        detail: `top in ${top.count} of ${finished.length} seasons`,
        go: () => onJump("seasons"),
      });
    }

    const record = data.records.pts?.[0];
    if (record) {
      const tied = data.records.pts.filter((r) => r.value === record.value).length;
      out.push({
        key: "scoring-record",
        label: "Scoring record",
        value: String(record.value),
        who: tied > 1 ? `${record.name} and ${tied - 1} more` : record.name,
        detail: [teamLabel(record.team, gender), record.date?.slice(0, 4)].filter(Boolean).join(", "),
        go: () => onJump("records"),
      });
    }

    const career = [...data.careers].sort((a, b) => b.pts - a.pts)[0];
    if (career && data.careers.length >= 5) {
      out.push({
        key: "career-points",
        label: "Career points",
        value: career.pts.toLocaleString("en-GB"),
        who: career.name,
        detail: `${career.gp} games${career.seasons > 1 ? ` over ${career.seasons} seasons` : ""}`,
        go: () => onJump("careers"),
      });
    }
    return out;
  }, [data, seasons, gender, onOpenSeason, onJump]);

  if (facts.length < 2) return null;

  return (
    <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-x-6 sm:gap-x-8 gap-y-7">
      {facts.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={f.go}
          className="group min-w-0 border-t-2 border-[color:var(--ch-border-strong)] pt-3 text-left transition-colors hover:border-[color:var(--ch-accent)] focus-visible:outline-none focus-visible:border-[color:var(--ch-accent)]"
        >
          <span className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">
            {f.label}
            <ArrowDown aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 text-[color:var(--ch-accent)]" />
          </span>
          <span className="mt-2 flex items-center gap-2.5">
            {f.mark}
            <span className="ch-display font-bold leading-none tabular-nums text-[2rem] md:text-[2.4rem] text-[color:var(--ch-text)]">{f.value}</span>
          </span>
          <span className="mt-2 block text-[15px] font-semibold leading-snug text-[color:var(--ch-text)] break-words">{f.who}</span>
          <span className="mt-0.5 block text-sm leading-snug text-[color:var(--ch-text-2)]">{f.detail}</span>
        </button>
      ))}
    </div>
  );
}
