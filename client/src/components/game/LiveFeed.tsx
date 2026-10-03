import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link } from "wouter";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import { HalfCourt, projectShot, CW, CH, COLOR_MADE, COLOR_MISSED } from "@/components/ShotChart";
import { KEY_MOMENT_IMPORTANCE, keyMoments, type CommentaryItem } from "@/lib/liveCommentary";
import type { CommentaryPlayer } from "@/hooks/useLiveCommentary";

interface ChartShot {
  x: number;
  y: number;
  success: boolean;
  player_id?: string | null;
  action_number?: number | null;
}

interface FeedProps {
  items: CommentaryItem[];
  players: Record<string, CommentaryPlayer>;
  shots: ChartShot[];
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
  isLive: boolean;
}

const ALL_PLAYS_IMPORTANCE = 20;

function timeLabel(item: CommentaryItem): string {
  const q = item.period <= 4 ? `Q${item.period}` : `OT${item.period - 4}`;
  const [m, s] = (item.clock || "").split(":").map(Number);
  return Number.isFinite(m) ? `${q} ${m}:${String(s || 0).padStart(2, "0")}` : q;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
}

function Headshot({ player, name, color }: { player?: CommentaryPlayer; name: string; color: string }) {
  const url = getPlayerPhotoUrlCached(player?.cutoutPath) || getPlayerPhotoUrlCached(player?.photoPath);
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-[color:var(--ch-border-strong)] flex items-end justify-center"
      style={{ background: `color-mix(in srgb, ${color} 80%, #000)` }}
    >
      {url && !failed ? (
        <img src={url} alt="" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover object-top" />
      ) : (
        <span className="self-center ch-display font-bold text-white text-lg">{initials(name)}</span>
      )}
    </span>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="ch-display ch-num text-xl font-bold leading-none text-[color:var(--ch-text)]">{value}</span>
      <span className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">{label}</span>
    </div>
  );
}

/** The play's shot on a half court, with the player's other shots faded behind it. */
function ShotLocation({ item, shots }: { item: CommentaryItem; shots: ChartShot[] }) {
  if (!item.shot) return null;
  const others = shots.filter((s) => s.player_id && s.player_id === item.playerId && s.action_number !== item.id);
  const focus = projectShot({ x: item.shot.x, y: item.shot.y, success: true });
  return (
    <div>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="mx-auto block h-auto w-full max-w-[250px]" role="img" aria-label="Where the shot was taken">
        <HalfCourt />
        {others.map((s, i) => {
          const p = projectShot({ x: s.x, y: s.y, success: s.success });
          return (
            <g key={i} transform={`translate(${p.sx} ${p.sy}) rotate(45)`} opacity={0.28}>
              <rect x={-5} y={-5} width={10} height={10} fill={s.success ? COLOR_MADE : COLOR_MISSED} />
            </g>
          );
        })}
        <circle cx={focus.sx} cy={focus.sy} r={22} fill={COLOR_MADE} opacity={0.25} />
        <g transform={`translate(${focus.sx} ${focus.sy}) rotate(45)`}>
          <rect x={-9} y={-9} width={18} height={18} fill={COLOR_MADE} stroke="#fff" strokeWidth={2} />
        </g>
      </svg>
      <p className="mt-1.5 text-center text-xs text-[color:var(--ch-muted)]">
        {item.shot.distanceFt != null ? `${item.shot.distanceFt}ft · ` : ""}Made · {timeLabel(item)}
        {others.length > 0 ? " · their other shots faded" : ""}
      </p>
    </div>
  );
}

/** The play, its player and the shot, in a small overlay over the page. */
function QuickView({ item, players, shots, teamName, color, onClose }: {
  item: CommentaryItem | null; players: FeedProps["players"]; shots: ChartShot[]; teamName: string; color: string; onClose: () => void;
}) {
  const player = item?.playerId ? players[item.playerId] : undefined;
  const name = item?.playerName || player?.name || "";
  const line = item?.line;
  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sa-pro max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[420px] gap-0 overflow-y-auto rounded-2xl border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] p-0 text-[color:var(--ch-text)]">
        {item && (
          <>
            <div className="px-4 pb-3 pt-4" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${color} 28%, transparent), transparent)` }}>
              <DialogTitle className="sr-only">{name || "Play"}</DialogTitle>
              <DialogDescription className="sr-only">{item.text}</DialogDescription>
              {name && line ? (
                <div className="flex items-center gap-3 pr-6">
                  <Headshot player={player} name={name} color={color} />
                  <div className="min-w-0">
                    {player?.slug ? (
                      <Link href={`/player/${player.slug}`} className="block truncate font-semibold text-[color:var(--ch-text)] hover:underline">{name}</Link>
                    ) : (
                      <span className="block truncate font-semibold text-[color:var(--ch-text)]">{name}</span>
                    )}
                    <span className="block truncate text-xs text-[color:var(--ch-muted)]">{teamName}</span>
                    <span className="block text-xs text-[color:var(--ch-muted)] tabular-nums">{timeLabel(item)} · {item.homeScore}–{item.awayScore}</span>
                  </div>
                </div>
              ) : (
                <p className="pr-6 text-xs text-[color:var(--ch-muted)] tabular-nums">{timeLabel(item)} · {item.homeScore}–{item.awayScore}</p>
              )}
              <p className="mt-3 text-[14px] leading-snug text-[color:var(--ch-text)]">
                <span aria-hidden="true">{item.emoji} </span>{item.text}
              </p>
            </div>

            <div className="flex flex-col gap-3 px-4 pb-4">
              {line && (
                <div className="rounded-xl bg-[color:var(--ch-surface-2)] p-3 ring-1 ring-inset ring-[color:var(--ch-border)]">
                  <div className="grid grid-cols-5 gap-1">
                    <StatBox label="PTS" value={line.pts} />
                    <StatBox label="REB" value={line.reb} />
                    <StatBox label="AST" value={line.ast} />
                    <StatBox label="STL" value={line.stl} />
                    <StatBox label="BLK" value={line.blk} />
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-1 border-t border-[color:var(--ch-border)] pt-2 text-center text-[11px] text-[color:var(--ch-text-2)] tabular-nums">
                    <span>FG {line.fgm}/{line.fga}</span>
                    <span>3PT {line.tpm}/{line.tpa}</span>
                    <span>FT {line.ftm}/{line.fta}</span>
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-[color:var(--ch-muted)]">Line as it stood after this play</p>
                </div>
              )}
              <ShotLocation item={item} shots={shots} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Live text commentary for a game: a feed of the key moments, newest first,
 * with an All plays toggle. Tapping a line opens the player, their line so far
 * and where the shot came from. Meant to sit beside (desktop) or inside a
 * sheet over (phones) the game's box score and tabs.
 */
export function LiveFeedPanel({ items, players, shots, homeTeam, awayTeam, homeColor, awayColor, isLive, className = "", inSheet = false }: FeedProps & { className?: string; inSheet?: boolean }) {
  const [mode, setMode] = useState<"key" | "all">("key");
  const [openId, setOpenId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fresh, setFresh] = useState(0);
  const topIdRef = useRef<number | null>(null);

  const shown = useMemo(
    () => keyMoments(items, mode === "key" ? KEY_MOMENT_IMPORTANCE : ALL_PLAYS_IMPORTANCE),
    [items, mode],
  );
  const open = openId != null ? items.find((i) => i.id === openId && i.kind !== "final") ?? null : null;

  // New plays slide in at the top; if the reader has scrolled down, offer a pill instead of jumping.
  useEffect(() => {
    const top = shown[0]?.id ?? null;
    const prev = topIdRef.current;
    topIdRef.current = top;
    if (prev == null || top == null || top === prev) return;
    const el = scrollRef.current;
    if (el && el.scrollTop > 40) setFresh((n) => n + shown.findIndex((i) => i.id === prev));
  }, [shown]);

  return (
    <div className={`ch-card flex min-h-0 flex-col overflow-hidden ${className}`} data-testid="live-feed">
      <div className={`flex items-center justify-between gap-2 border-b border-[color:var(--ch-border)] py-3 pl-4 ${inSheet ? "pr-12" : "pr-4"}`}>
        <h3 className="ch-eyebrow flex items-center gap-2">
          {isLive && (
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          {isLive ? "Live feed" : "Game feed"}
        </h3>
        {(
          <div className="flex rounded-lg bg-[color:var(--ch-surface-2)] p-0.5 text-xs font-semibold" role="group" aria-label="Feed detail">
            {(["key", "all"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`rounded-md px-2.5 py-1 transition-colors ${mode === m ? "bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] shadow-sm" : "text-[color:var(--ch-muted)]"}`}
              >
                {m === "key" ? "Key moments" : "All plays"}
              </button>
            ))}
          </div>
        )}
      </div>

      {(
        <div className="relative min-h-0 flex-1">
          {fresh > 0 && (
            <button
              type="button"
              onClick={() => { scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); setFresh(0); }}
              className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white shadow-lg"
            >
              {fresh} new {fresh === 1 ? "play" : "plays"}
            </button>
          )}
          <div ref={scrollRef} onScroll={(e) => { if ((e.target as HTMLElement).scrollTop < 40) setFresh(0); }} className="h-full overflow-y-auto" aria-live="polite">
            {shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-[color:var(--ch-muted)]">No standout plays yet.</p>
            ) : (
              <ul className="divide-y divide-[color:var(--ch-border)]">
                {shown.map((item) => {
                  const tappable = item.kind !== "final" && item.kind !== "period-start" && item.kind !== "period-end";
                  const color = item.teamNo === 1 ? homeColor : item.teamNo === 2 ? awayColor : "transparent";
                  const body = (
                    <>
                      <span className="w-[3px] shrink-0 self-stretch rounded-full" style={{ background: color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="flex items-center gap-2 text-[11px] text-[color:var(--ch-muted)] tabular-nums">
                          <span className="font-semibold uppercase tracking-[0.08em]">{timeLabel(item)}</span>
                          <span>{item.homeScore}–{item.awayScore}</span>
                        </span>
                        <span className="mt-0.5 block text-[14px] leading-snug text-[color:var(--ch-text)]">
                          <span aria-hidden="true">{item.emoji} </span>{item.text}
                        </span>
                      </span>
                      {tappable && (
                        <span className="inline-flex shrink-0 items-center gap-1 self-center rounded-full bg-[color:var(--ch-surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ch-text-2)] ring-1 ring-inset ring-[color:var(--ch-border)]">
                          <Maximize2 className="h-3 w-3" aria-hidden="true" /> Expand
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li key={`${item.id}-${item.kind}`}>
                      {tappable ? (
                        <button type="button" onClick={() => setOpenId(item.id)} className="flex w-full gap-3 px-4 py-3 hover:bg-[color:var(--ch-surface-2)] focus-visible:outline-none focus-visible:bg-[color:var(--ch-surface-2)]">
                          {body}
                        </button>
                      ) : (
                        <div className="flex gap-3 px-4 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      <QuickView
        item={open}
        players={players}
        shots={shots}
        teamName={open?.teamNo === 1 ? homeTeam : open?.teamNo === 2 ? awayTeam : ""}
        color={open?.teamNo === 2 ? awayColor : homeColor}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

/** Phones: the latest two key moments under the score, opening the full feed in a sheet. */
export function LiveFeedStrip(props: FeedProps) {
  const [sheet, setSheet] = useState(false);
  const latest = useMemo(() => keyMoments(props.items).slice(0, 2), [props.items]);
  if (latest.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setSheet(true)}
        className="ch-card w-full overflow-hidden text-left"
        aria-label="Open the full game feed"
        data-testid="live-feed-strip"
      >
        <span className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="ch-eyebrow flex items-center gap-2">
            {props.isLive && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse motion-reduce:animate-none" aria-hidden="true" />}
            {props.isLive ? "Live feed" : "Game feed"}
          </span>
          <span className="flex items-center text-xs font-semibold text-orange-500">See all <ChevronRight className="h-3.5 w-3.5" /></span>
        </span>
        {latest.map((item) => (
          <span key={item.id} className="block px-4 py-2 text-[13.5px] leading-snug text-[color:var(--ch-text)] border-t border-[color:var(--ch-border)] first:border-t-0">
            <span className="mr-1.5 text-[11px] font-semibold text-[color:var(--ch-muted)] tabular-nums">{timeLabel(item)}</span>
            <span aria-hidden="true">{item.emoji} </span>{item.text}
          </span>
        ))}
      </button>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="flex h-[85vh] flex-col gap-0 p-0 rounded-t-2xl sa-pro">
          <SheetHeader className="sr-only"><SheetTitle>Game feed</SheetTitle></SheetHeader>
          <LiveFeedPanel {...props} inSheet className="h-full !rounded-none !border-0 !shadow-none" />
        </SheetContent>
      </Sheet>
    </>
  );
}
