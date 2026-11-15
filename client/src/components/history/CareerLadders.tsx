import { useMemo } from "react";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import { ClubMark, PlayerLink, teamLabel, type Career, type HistoryData } from "./shared";

/**
 * The top five careers in four totals, drawn to scale against the leader so the gaps
 * show. The full boards (averages, percentages, top 25) follow in AllTimeLeaders.
 */

const LADDERS: Array<{ key: "pts" | "reb" | "ast" | "gp"; title: string }> = [
  { key: "pts", title: "Career points" },
  { key: "reb", title: "Career rebounds" },
  { key: "ast", title: "Career assists" },
  { key: "gp", title: "Games played" },
];

const careerSpan = (c: Career) => {
  if (!c.first) return "";
  const start = c.first.match(/^(\d{4})/)?.[1];
  const end = c.last?.match(/(\d{2})$/)?.[1];
  if (c.first === c.last || !start || !end) return c.first;
  return `${start}–${end}`;
};

const photoSrc = (path: string | null) => (!path ? null : /^https?:/i.test(path) ? path : getPlayerPhotoUrlCached(path));

export default function CareerLadders({ data, gender }: { data: HistoryData; gender: string }) {
  const ladders = useMemo(
    () => LADDERS.map((ladder) => ({
      ...ladder,
      rows: [...data.careers].sort((a, b) => b[ladder.key] - a[ladder.key] || b.gp - a.gp).slice(0, 5),
    })),
    [data.careers],
  );
  if (data.careers.length < 5) return null;

  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
      {ladders.map((ladder) => {
        const leader = ladder.rows[0];
        const max = leader[ladder.key] || 1;
        const photo = photoSrc(leader.photo);
        return (
          <div key={ladder.key} className="min-w-0 border-t border-[color:var(--ch-border-strong)] pt-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{ladder.title}</div>
            <div className="mt-2 ch-score leading-none text-[3.25rem] text-[color:var(--ch-text)]">{leader[ladder.key].toLocaleString("en-GB")}</div>
            <div className="mt-3 flex items-center gap-3">
              {photo ? (
                <PlayerHeadshot
                  src={photo}
                  alt=""
                  loading="lazy"
                  className="h-11 w-11 shrink-0 rounded-full object-cover bg-[color:var(--ch-surface-2)]"
                  fallbackClassName="object-top"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <ClubMark name={leader.teams[0] || null} logos={data.logos} size={40} />
              )}
              <div className="min-w-0">
                <PlayerLink name={leader.name} href={leader.href} className="block truncate text-[15px] font-semibold text-[color:var(--ch-text)]" />
                <div className="truncate text-xs text-[color:var(--ch-text-2)]">
                  {[teamLabel(leader.teams[0] || null, gender), careerSpan(leader)].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
            <ol className="mt-4" start={2}>
              {ladder.rows.slice(1).map((c, i) => (
                <li key={c.key} className="py-1.5">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="w-3 text-xs font-bold tabular-nums text-[color:var(--ch-text-2)]">{i + 2}</span>
                    <PlayerLink name={c.name} href={c.href} className="min-w-0 flex-1 truncate font-medium text-[color:var(--ch-text)]" />
                    <span className="font-semibold tabular-nums text-[color:var(--ch-text)]">{c[ladder.key].toLocaleString("en-GB")}</span>
                  </div>
                  <div aria-hidden className="mt-1.5 ml-5 h-1 rounded-full bg-[color:var(--ch-surface-3)] overflow-hidden">
                    <div className="h-full rounded-full bg-[color:var(--ch-text-2)]" style={{ width: `${Math.max(2, Math.round((c[ladder.key] / max) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
