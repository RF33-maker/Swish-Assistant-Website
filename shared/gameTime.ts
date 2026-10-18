/**
 * Game times, and how to tell when one is wrong.
 *
 * `game_schedule.matchtime` holds UK wall-clock time labelled +00 (the
 * schedule sheets carry no timezone), and the whole site reads it back in UTC
 * so a 19:30 tip-off shows as 19:30. That means during BST the stored value is
 * an hour later than the real instant. Anything comparing matchtime with the
 * clock has to turn it back into a real instant first (see
 * client/src/lib/scheduleTime.ts, which does the same for the countdown).
 *
 * The review page uses these helpers to flag games whose stored time disagrees
 * with what the scorers' feed did: a game that started hours away from its
 * listed time, one marked live or final that is dated in the future, one still
 * "scheduled" long after tip-off, or one stuck live.
 */

const UK_TIME_ZONE = "Europe/London";

const STORED = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?/;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Gap between the listed and observed start before a game is flagged. Scorers often start a few minutes late. */
export const START_MISMATCH_MINUTES = 45;
/** A live-captured game has period events spread over its length; a back-filled one has them all within seconds. */
export const MIN_CAPTURE_SPAN_MINUTES = 30;
/** A "scheduled" game this long after its listed tip-off never started as listed. */
export const NEVER_STARTED_AFTER_HOURS = 3;
/** Nothing is live this long after its listed tip-off. */
export const STUCK_LIVE_AFTER_HOURS = 6;
/** A live game whose feed has shown no period event for this long has stopped (a quarter and a break fit well inside it). */
export const FEED_SILENT_MINUTES = 90;
/** A live or final game listed this far in the future is dated wrongly. */
export const FUTURE_DATED_HOURS = 2;

const pad = (n: number) => String(n).padStart(2, "0");

/** The real instant a stored (UK wall-clock) match time refers to. */
export function storedToInstant(stored: string): Date | null {
  const m = STORED.exec(stored);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "0"] = m;
  const wallAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Math.floor(Number(s)));
  const ukAtCandidate = ukWallClockMs(new Date(wallAsUtc));
  return new Date(wallAsUtc - (ukAtCandidate - wallAsUtc));
}

/** UK wall-clock reading of an instant, as milliseconds as if that reading were UTC. */
function ukWallClockMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value || 0);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
}

/** An instant as the UK wall-clock string the schedule stores: "YYYY-MM-DDTHH:mm". */
export function instantToWallClock(instant: Date): string {
  const d = new Date(ukWallClockMs(instant));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Round an instant to the nearest five minutes. */
export function roundToFiveMinutes(instant: Date): Date {
  const step = 5 * 60 * 1000;
  return new Date(Math.round(instant.getTime() / step) * step);
}

/** Check a "YYYY-MM-DDTHH:mm" wall-clock entry and turn it into the value stored in matchtime. */
export function wallClockToStored(wall: unknown): string | null {
  if (typeof wall !== "string") return null;
  const m = WALL_CLOCK.exec(wall.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (y < 2020 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const check = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return `${wall.trim()}:00+00:00`;
}

export type TimeFindingKind = "start_mismatch" | "future_dated" | "stuck_live" | "never_started";

export interface TimeFinding {
  kind: TimeFindingKind;
  /** Plain-English reason shown on the review page. */
  reason: string;
  /** Wall-clock time to offer as the fix ("YYYY-MM-DDTHH:mm"), when the feed gives one. */
  suggested: string | null;
}

export interface GameTimeInput {
  status: string | null;
  /** The stored match time. */
  matchtime: string;
  /** When the feed first showed period 1 starting, if the game was captured live (ISO). */
  observedStart?: string | null;
  /** Minutes between the first and last period event we saved; small means the game was back-filled, not captured live. */
  captureSpanMinutes?: number | null;
  /** When the feed last produced a period event for this game (ISO), if it has produced any. */
  lastFeedActivity?: string | null;
}

const isPlayed = (status: string | null) => status === "live" || status === "final";

function describeGap(minutes: number): string {
  const abs = Math.abs(minutes);
  const text = abs >= 120 ? `${Math.round(abs / 60)} hours` : `${Math.round(abs)} minutes`;
  return text;
}

/** Whether a game's stored time looks wrong, and why. Returns null when nothing looks off. */
export function assessGameTime(game: GameTimeInput, now: Date = new Date()): TimeFinding | null {
  const expected = storedToInstant(game.matchtime);
  if (!expected) return null;

  const observed = game.observedStart ? new Date(game.observedStart) : null;
  const trustedObserved =
    observed && !Number.isNaN(observed.getTime()) && (game.captureSpanMinutes ?? 0) >= MIN_CAPTURE_SPAN_MINUTES ? observed : null;

  if (trustedObserved) {
    const gapMinutes = (trustedObserved.getTime() - expected.getTime()) / 60000;
    if (Math.abs(gapMinutes) > START_MISMATCH_MINUTES) {
      return {
        kind: "start_mismatch",
        reason: `The feed shows this game starting ${describeGap(gapMinutes)} ${gapMinutes < 0 ? "before" : "after"} its listed time.`,
        suggested: instantToWallClock(roundToFiveMinutes(trustedObserved)),
      };
    }
    return null;
  }

  const hoursFromTip = (now.getTime() - expected.getTime()) / 3600000;

  if (isPlayed(game.status) && hoursFromTip < -FUTURE_DATED_HOURS) {
    return {
      kind: "future_dated",
      reason: `Marked ${game.status} but listed ${describeGap(hoursFromTip * 60)} in the future.`,
      suggested: null,
    };
  }
  if (game.status === "live") {
    const last = game.lastFeedActivity ? new Date(game.lastFeedActivity) : null;
    const silentMinutes = last && !Number.isNaN(last.getTime()) ? (now.getTime() - last.getTime()) / 60000 : null;
    if (silentMinutes !== null && silentMinutes > FEED_SILENT_MINUTES && hoursFromTip > 0) {
      return {
        kind: "stuck_live",
        reason: `Still marked live, but the feed has shown nothing for ${describeGap(silentMinutes)}; the scorer has probably stopped.`,
        suggested: null,
      };
    }
    if (silentMinutes === null && hoursFromTip > STUCK_LIVE_AFTER_HOURS) {
      return {
        kind: "stuck_live",
        reason: `Still marked live ${describeGap(hoursFromTip * 60)} after its listed tip-off, with no feed data.`,
        suggested: null,
      };
    }
  }
  if (game.status === "scheduled" && hoursFromTip > NEVER_STARTED_AFTER_HOURS) {
    return {
      kind: "never_started",
      reason: `Listed ${describeGap(hoursFromTip * 60)} ago and no feed data yet; it may have been moved or postponed.`,
      suggested: null,
    };
  }
  return null;
}
