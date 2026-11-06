/**
 * Who may use a Swish+ feature on the server.
 *
 *   full    members, coaches (Coach includes Swish+) and admins
 *   locked  Swish+ is on sale and this person doesn't have it
 *   hidden  Swish+ isn't on sale yet, so only admins see its features. That way nothing appears
 *           free and is later taken away.
 *
 * "On sale" is the same switch the client reads (VITE_SWISH_PLUS_LIVE), or SWISH_PLUS_LIVE where
 * the server's environment is set apart from the build's.
 */
export type PlusAccess = "full" | "locked" | "hidden";

export const plusLive = (): boolean =>
  (process.env.SWISH_PLUS_LIVE ?? process.env.VITE_SWISH_PLUS_LIVE) === "true";

export type Caller = { id: string; role: string | null } | null;

export function decidePlusAccess(live: boolean, who: Caller, hasPlus: boolean): PlusAccess {
  if (who?.role === "admin") return "full";
  if (!live) return "hidden";
  if (who?.role === "coach" || hasPlus) return "full";
  return "locked";
}
