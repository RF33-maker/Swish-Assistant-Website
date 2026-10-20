import { useMemo, useState } from "react";
import { Link } from "wouter";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import { onCourtFor, onCourtKey, type OnCourtEvent, type OnCourtPlayer } from "@/lib/onCourt";
import type { CommentaryPlayer } from "@/hooks/useLiveCommentary";

/** A player from the box score, as far as the on-court strip needs. */
export interface OnCourtBoxPlayer {
  name: string;
  playerId?: string | null;
  shirt?: string | number | null;
  starter?: boolean | null;
  points?: number | null;
  fouls?: number | null;
  href?: string | null;
}

interface Props {
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
  homePlayers: OnCourtBoxPlayer[];
  awayPlayers: OnCourtBoxPlayer[];
  events: OnCourtEvent[] | null | undefined;
  players: Record<string, CommentaryPlayer>;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
}

function surname(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function Face({ player, name, color }: { player?: CommentaryPlayer; name: string; color: string }) {
  const url = getPlayerPhotoUrlCached(player?.cutoutPath) || getPlayerPhotoUrlCached(player?.photoPath);
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-[color:var(--ch-border-strong)] flex items-end justify-center"
      style={{ background: `color-mix(in srgb, ${color} 80%, #000)` }}
    >
      {url && !failed ? (
        <img src={url} alt="" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover object-top" />
      ) : (
        <span className="self-center ch-display font-bold text-white text-sm">{initials(name)}</span>
      )}
    </span>
  );
}

/** The five on court for a side, or null when they cannot be worked out. */
function fiveFor(teamNo: 1 | 2, box: OnCourtBoxPlayer[], events: OnCourtEvent[] | null | undefined) {
  const starters: OnCourtPlayer[] = box.filter((p) => p.starter).map((p) => ({ playerId: p.playerId ?? null, shirt: p.shirt, teamNo }));
  const court = onCourtFor(teamNo, starters, events);
  if (!court) return null;
  const five = box.filter((p) => court.has(onCourtKey(teamNo, p.playerId, p.shirt)));
  return five.length === 5 ? five : null;
}

function Side({ team, color, five, players }: {
  team: string;
  color: string;
  five: OnCourtBoxPlayer[];
  players: Record<string, CommentaryPlayer>;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="ch-display text-xs font-semibold uppercase tracking-wide text-[color:var(--ch-text-2)]">{team}</span>
      </div>
      <ul className="grid grid-cols-5 gap-2">
        {five.map((p) => {
          const body = (
            <>
              <Face player={p.playerId ? players[p.playerId] : undefined} name={p.name} color={color} />
              <span className="mt-1 w-full truncate text-center text-xs font-medium text-[color:var(--ch-text)]">{surname(p.name)}</span>
              <span className="text-[11px] tabular-nums text-[color:var(--ch-text-2)]">{p.points ?? 0} pts</span>
              {(p.fouls ?? 0) >= 3 && <span className="text-[11px] tabular-nums text-amber-500">{p.fouls} fouls</span>}
            </>
          );
          return (
            <li key={p.playerId ?? `${p.shirt}-${p.name}`} className="min-w-0">
              {p.href ? (
                <Link href={p.href} className="flex flex-col items-center">{body}</Link>
              ) : (
                <div className="flex flex-col items-center">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The five players on court for each side, from the starters and the substitutions so far. */
export default function OnCourt({ homeTeam, awayTeam, homeColor, awayColor, homePlayers, awayPlayers, events, players }: Props) {
  const home = useMemo(() => fiveFor(1, homePlayers, events), [homePlayers, events]);
  const away = useMemo(() => fiveFor(2, awayPlayers, events), [awayPlayers, events]);
  // A side whose five cannot be worked out is left out rather than shown wrong.
  if (!home && !away) return null;
  return (
    <section className="ch-card mb-4 p-4" aria-label="On court now">
      <h3 className="ch-display mb-3 text-sm font-semibold text-[color:var(--ch-text)]">On court</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {home && <Side team={homeTeam} color={homeColor} five={home} players={players} />}
        {away && <Side team={awayTeam} color={awayColor} five={away} players={players} />}
      </div>
    </section>
  );
}
