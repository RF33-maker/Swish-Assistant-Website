import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

function area(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * useState that the browser remembers, so a refresh or a trip to another page
 * doesn't lose a choice. "local" keeps it between visits; "session" only for
 * this tab, for things that go stale (a search, the week being looked at).
 */
export function useStoredState<T>(key: string, initial: T, kind: "local" | "session" = "local"): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = area(kind)?.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const set: Dispatch<SetStateAction<T>> = useCallback(
    (next) =>
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          area(kind)?.setItem(key, JSON.stringify(resolved));
        } catch {
          // remembering it is a convenience only
        }
        return resolved;
      }),
    [key, kind],
  );

  return [value, set];
}
