import { lazy, type ComponentType } from "react";

const RELOADED_AT_KEY = "swish:chunk-reload-at";

/**
 * React.lazy for code-split pages and panels, plus a `preload()` that fetches
 * the chunk without rendering it.
 *
 * After a deploy, a tab still running the old build asks for chunk files that
 * no longer exist. The first time that happens we reload to pick up the new
 * build. If we're offline, or a reload in the last 10 seconds already hit the
 * same error, the error goes on to the error boundary instead of looping.
 */
export function lazyWithReload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  const Component = lazy(() =>
    load().catch((error) => {
      if (reloadOnce()) return new Promise<never>(() => {});
      throw error;
    }),
  );
  return Object.assign(Component, { preload: load });
}

function reloadOnce(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY) || 0);
    if (Date.now() - last < 10_000) return false;
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
