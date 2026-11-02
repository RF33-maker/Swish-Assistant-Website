/**
 * Live plays reach the site in bursts: the worker writes whatever is new about
 * every 15 seconds, usually 3 plays, 13 at the top end, and 100 after a gap.
 * This lets a burst out one play at a time so a feed follows the game instead
 * of jumping. Plays are spaced by the gap between them on the game clock, so a
 * rebound lands a beat after the miss, and the pace tightens as the queue grows
 * so the feed never drifts behind the next burst.
 */
export const PACE = {
  /** Clear a burst in this long, before the next one lands. */
  windowMs: 12_000,
  /** The first play of a burst: it's already late, so don't hold it. */
  firstGapMs: 150,
  /** Long enough to read a line; tighter only when the queue needs it. */
  floorMs: 900,
  /** The tightest it gets, however far behind: still one play at a time. */
  minGapMs: 350,
  maxGapMs: 4_000,
  /** More queued than this means the reader was away or the feed stalled. */
  maxQueue: 20,
  /** Catching up shows the backlog at once and flows only the newest few. */
  keepWhenCatchingUp: 8,
};

export interface PlayTime {
  period: number;
  clock: string | null | undefined;
}

/** Seconds left on a game clock like "07:43:00" (minutes, seconds, hundredths). */
export function clockSeconds(clock: string | null | undefined): number {
  if (!clock) return 0;
  const parts = clock.split(":").map(Number);
  if (parts.length >= 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return parts[0] || 0;
}

/**
 * How long to wait before letting the next play out, with `queued` waiting and
 * `remainingMs` left of the burst's window. Sharing the time left, rather than
 * a whole window, is what stops a big burst running on into the next one.
 */
export function revealGapMs(
  previous: PlayTime | null,
  next: PlayTime | null,
  queued: number,
  remainingMs: number = PACE.windowMs,
): number {
  if (!previous) return PACE.firstGapMs;
  const even = Math.max(remainingMs, 0) / Math.max(queued, 1);
  const floor = Math.max(PACE.minGapMs, Math.min(PACE.floorMs, even));
  const ceiling = Math.max(floor, Math.min(PACE.maxGapMs, even * 1.5));
  const clockGap = next && previous.period === next.period
    ? (clockSeconds(previous.clock) - clockSeconds(next.clock)) * 1000
    : even;
  return Math.min(ceiling, Math.max(floor, clockGap));
}

export interface RevealState<Id> {
  seeded: boolean;
  shown: Set<Id>;
  /** Waiting to be let out, oldest first. */
  queue: Id[];
}

export const EMPTY_REVEAL: RevealState<never> = { seeded: false, shown: new Set(), queue: [] };

/**
 * Take the current list of ids, oldest first. The first list shows at once, as
 * does everything when `paced` is off. After that, new ids join the queue.
 * Returns the same state when nothing changed.
 */
export function ingest<Id>(state: RevealState<Id>, ids: Id[], paced: boolean): RevealState<Id> {
  if (ids.length === 0) return state.seeded ? (EMPTY_REVEAL as RevealState<Id>) : state;
  const queued = new Set(state.queue);
  const fresh = ids.filter((id) => !state.shown.has(id) && !queued.has(id));

  if (!state.seeded || !paced) {
    if (state.seeded && fresh.length === 0 && state.queue.length === 0) return state;
    return { seeded: true, shown: new Set(ids), queue: [] };
  }

  const present = new Set(ids);
  const stillQueued = state.queue.filter((id) => present.has(id));
  if (fresh.length === 0 && stillQueued.length === state.queue.length) return state;

  const queue = [...stillQueued, ...fresh];
  if (queue.length <= PACE.maxQueue) return { ...state, queue };
  const backlog = queue.slice(0, -PACE.keepWhenCatchingUp);
  return {
    ...state,
    shown: new Set([...Array.from(state.shown), ...backlog]),
    queue: queue.slice(-PACE.keepWhenCatchingUp),
  };
}

/** Let the oldest queued play out. */
export function revealNext<Id>(state: RevealState<Id>): RevealState<Id> {
  if (state.queue.length === 0) return state;
  const [next, ...queue] = state.queue;
  const shown = new Set(state.shown);
  shown.add(next);
  return { ...state, shown, queue };
}
