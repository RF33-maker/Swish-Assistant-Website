import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EMPTY_REVEAL, PACE, ingest, revealGapMs, revealNext, type PlayTime, type RevealState } from "@/lib/playPacing";

/** How long a play counts as arriving: must outlast `.ch-flow-in` in index.css. */
const ENTERING_MS = 1_700;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The wash of team colour behind a row flowing in. */
export const flowTint = (color: string) =>
  ({ "--ch-flow-tint": `color-mix(in srgb, ${color} 16%, transparent)` }) as CSSProperties;

interface Options<T, Id> {
  getId: (item: T) => Id;
  timeOf: (item: T) => PlayTime;
  live: boolean;
  /** Changing this shows everything at once, e.g. when the list is re-filtered. */
  resetKey?: unknown;
}

/**
 * Lets a live feed's new items out one at a time (see lib/playPacing). `items`
 * is oldest first. A page opened after the game shows everything at once, and
 * one watched live keeps pacing through the final plays as the status flips.
 */
export function usePacedReveal<T, Id>(items: T[], { getId, timeOf, live, resetKey }: Options<T, Id>) {
  const [state, setState] = useState<RevealState<Id>>(EMPTY_REVEAL as RevealState<Id>);
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  const watchedLive = useRef(false);
  if (live) watchedLive.current = true;
  const paced = watchedLive.current && !prefersReducedMotion();

  // During render, not in an effect, so a new play is never painted before it's queued.
  const resetting = seenResetKey !== resetKey;
  if (resetting) setSeenResetKey(resetKey);
  const next = ingest(resetting ? (EMPTY_REVEAL as RevealState<Id>) : state, items.map(getId), paced);
  if (next !== state) setState(next);

  const head = next.queue[0];
  const queued = next.queue.length;
  const lastOut = useRef<T | null>(null);
  const enteredAt = useRef(new Map<Id, number>());
  const deadline = useRef(0);
  const queuedBefore = useRef(0);

  // Each burst gets its own window, including one landing on a queue still draining.
  useEffect(() => {
    if (queued > queuedBefore.current) deadline.current = Date.now() + PACE.windowMs;
    queuedBefore.current = queued;
  }, [queued]);

  useEffect(() => {
    if (head === undefined) {
      lastOut.current = null;
      return;
    }
    const item = items.find((i) => getId(i) === head);
    if (item === undefined) return;
    const previous = lastOut.current ? timeOf(lastOut.current) : null;
    const gap = revealGapMs(previous, timeOf(item), queued, deadline.current - Date.now());
    const timer = window.setTimeout(() => {
      enteredAt.current.set(head, Date.now());
      lastOut.current = item;
      setState(revealNext);
    }, gap);
    return () => window.clearTimeout(timer);
    // Keyed to the head alone: plays joining the queue mustn't restart the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head]);

  const visible = useMemo(
    () => items.filter((item) => next.shown.has(getId(item))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, next.shown],
  );

  const isEntering = useCallback((id: Id) => {
    const at = enteredAt.current.get(id);
    return at !== undefined && Date.now() - at < ENTERING_MS;
  }, []);

  return { visible, isEntering };
}
