export const DEBUG = import.meta.env.DEV && import.meta.env.VITE_DEBUG === "true";

export function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    console.log(...args);
  }
}
