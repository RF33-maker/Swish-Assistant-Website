import type { NextFunction, Request, Response } from "express";

/**
 * Lets Vercel's CDN keep public stats responses for a short while, so a busy
 * page is worked out once a minute instead of once per visitor.
 *
 * Vercel's CDN only stores a function's response when it is told to with
 * s-maxage or Vercel-CDN-Cache-Control; a plain "public, max-age=N" only
 * reaches the browser. Until this, every stats request ran the server
 * function, and the account ran out of its monthly CPU allowance on
 * 2026-11-20.
 *
 * Only anonymous reads are shared: a request that carries a sign-in token can
 * see private competitions, so it is never stored and never served from the
 * shared copy (Vary: Authorization). Only 200s are stored, and a route that
 * says private or no-store keeps its word.
 */

/** Read-only routes that answer the same thing to every anonymous visitor. */
const PUBLIC_READ_PREFIXES = [
  "/api/public/",
  "/api/league/",
  "/api/leagues/",
  "/api/home/",
  "/api/game-switcher/",
  "/api/competition/",
  "/api/competition-display",
  "/api/player-on-off/",
  "/api/player-identities/for-player/",
  "/api/scores",
];

/** Short enough that live scores and new games show up within a minute. */
const CDN_MAX_AGE_SEC = 60;
/** While a visitor gets the stored copy, the CDN refreshes it in the background. */
const CDN_STALE_SEC = 600;

function isPublicRead(path: string): boolean {
  return PUBLIC_READ_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

/** The route's own max-age, if it set one shorter than ours (e.g. live scores at 15s). */
function routeMaxAge(cacheControl: string): number | null {
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl);
  return match ? Number(match[1]) : null;
}

export function cdnCachePublicReads(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!isPublicRead(req.path)) return next();

  // Signed-in readers can see private competitions: never share or store theirs.
  res.vary("Authorization");
  if (req.headers.authorization) return next();

  const writeHead = res.writeHead;
  res.writeHead = function (this: Response, ...args: any[]) {
    const status = typeof args[0] === "number" ? args[0] : res.statusCode;
    const cacheControl = String(res.getHeader("Cache-Control") || "");
    const storable =
      status === 200 &&
      !/\b(private|no-store|no-cache)\b/i.test(cacheControl) &&
      !res.getHeader("Set-Cookie") &&
      !res.getHeader("Vercel-CDN-Cache-Control");
    const own = routeMaxAge(cacheControl);
    // A route that asks for max-age=0 wants every read fresh.
    if (storable && own !== 0) {
      const maxAge = own !== null ? Math.min(own, CDN_MAX_AGE_SEC) : CDN_MAX_AGE_SEC;
      res.setHeader("Vercel-CDN-Cache-Control", `max-age=${maxAge}, stale-while-revalidate=${CDN_STALE_SEC}`);
    }
    return (writeHead as (...a: any[]) => any).apply(this, args);
  } as typeof res.writeHead;

  next();
}
