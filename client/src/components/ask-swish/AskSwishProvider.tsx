import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { fetchQuota, streamAsk, type AskQuota, type AskScope, type AskSurface, type AskTurn } from "@/lib/askSwish";

/**
 * One conversation for the whole site.
 *
 * The panel can be opened from the rail, the floating pill or any page, and
 * the thread survives navigation: ask about a game, open the player's page,
 * ask a follow-up. Pages declare what they are showing with `useAskScope`,
 * and the latest declaration is what the assistant looks at by default.
 * The thread is kept in sessionStorage so a reload doesn't lose it.
 */

const STORAGE_KEY = "swish:ask:turns";
const MAX_TURNS = 30;

interface AskSwishContextValue {
  isOpen: boolean;
  open: (question?: string) => void;
  close: () => void;
  toggle: () => void;
  scope: AskScope | null;
  setScope: (scope: AskScope | null) => void;
  /** Ask about everything rather than the page you came from (until a page sets a scope again). */
  clearScope: () => void;
  surface: AskSurface;
  setSurface: (surface: AskSurface) => void;
  turns: AskTurn[];
  busy: boolean;
  ask: (question: string) => void;
  stop: () => void;
  reset: () => void;
  /** The account's allowance, refreshed on open and after every answer. */
  quota: AskQuota | null;
  refreshQuota: () => void;
  /** Called with the finished answer of each turn (the scout editor inserts it). */
  onAnswer: React.MutableRefObject<((text: string) => void) | null>;
}

const AskSwishContext = createContext<AskSwishContextValue | null>(null);

function loadTurns(): AskTurn[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const turns = raw ? (JSON.parse(raw) as AskTurn[]) : [];
    // A turn cut off by a reload should not look like it is still streaming.
    return turns.map((t) => (t.done ? t : { ...t, done: true, status: null, error: t.answer ? null : { message: "That answer was interrupted." } }));
  } catch {
    return [];
  }
}

function saveTurns(turns: AskTurn[]) {
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-MAX_TURNS))); } catch { /* storage full or blocked */ }
}

export function AskSwishProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScopeState] = useState<AskScope | null>(null);
  const [surface, setSurface] = useState<AskSurface>("site");
  const [turns, setTurns] = useState<AskTurn[]>(() => (typeof window === "undefined" ? [] : loadTurns()));
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<AskQuota | null>(null);
  const refreshQuota = useCallback(() => { fetchQuota().then(setQuota).catch(() => {}); }, []);
  useEffect(() => { if (isOpen) refreshQuota(); }, [isOpen, refreshQuota]);
  const abortRef = useRef<AbortController | null>(null);
  const onAnswer = useRef<((text: string) => void) | null>(null);
  const [location] = useLocation();

  useEffect(() => { saveTurns(turns); }, [turns]);
  // The scope follows the page; a change of page outside the panel's own
  // route also closes nothing — the user may well be reading an answer.
  useEffect(() => { if (location.startsWith("/ask")) setIsOpen(false); }, [location]);

  const setScope = useCallback((next: AskScope | null) => {
    setScopeState((prev) => {
      if (!next) return prev;
      const same = prev && JSON.stringify(prev) === JSON.stringify(next);
      return same ? prev : next;
    });
  }, []);

  const clearScope = useCallback(() => setScopeState(null), []);

  const stop = useCallback(() => { abortRef.current?.abort(); abortRef.current = null; setBusy(false); }, []);

  const ask = useCallback((question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const turn: AskTurn = { id, question: q, answer: "", cards: [], nav: [], followUps: [], status: "Thinking…", error: null, done: false };
    const history = turns.filter((t) => t.done && !t.error).slice(-6).flatMap((t) => [
      { role: "user" as const, content: t.question },
      { role: "assistant" as const, content: t.answer || "(answered with a card)" },
    ]);
    setTurns((prev) => [...prev, turn]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const update = (patch: (t: AskTurn) => AskTurn) => setTurns((prev) => prev.map((t) => (t.id === id ? patch(t) : t)));
    let answer = "";
    streamAsk({ messages: [...history, { role: "user", content: q }], scope: scope ?? undefined, surface }, (event) => {
      switch (event.type) {
        case "status": update((t) => ({ ...t, status: event.text })); break;
        case "card": update((t) => ({ ...t, cards: [...t.cards, event.card], status: null })); break;
        case "text": answer += event.delta; update((t) => ({ ...t, answer: t.answer + event.delta, status: null })); break;
        case "nav": update((t) => ({ ...t, nav: event.buttons })); break;
        case "followups": update((t) => ({ ...t, followUps: event.questions })); break;
        case "error": update((t) => ({ ...t, error: { message: event.message, code: event.code }, status: null })); if (event.quota) setQuota(event.quota); break;
        case "done": if (event.quota) setQuota(event.quota); break;
      }
    }, controller.signal)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        update((t) => ({ ...t, error: { message: err instanceof Error ? err.message : "Ask Swish is unreachable right now." } }));
      })
      .finally(() => {
        update((t) => ({ ...t, done: true, status: null }));
        if (abortRef.current === controller) { abortRef.current = null; setBusy(false); }
        if (answer && onAnswer.current) onAnswer.current(answer);
      });
  }, [busy, turns, scope, surface]);

  const open = useCallback((question?: string) => {
    setIsOpen(true);
    if (question) setTimeout(() => ask(question), 0);
  }, [ask]);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const reset = useCallback(() => { stop(); setTurns([]); }, [stop]);

  const value = useMemo<AskSwishContextValue>(() => ({ isOpen, open, close, toggle, scope, setScope, clearScope, surface, setSurface, turns, busy, ask, stop, reset, quota, refreshQuota, onAnswer }), [isOpen, open, close, toggle, scope, setScope, clearScope, surface, turns, busy, ask, stop, reset, quota, refreshQuota]);
  return <AskSwishContext.Provider value={value}>{children}</AskSwishContext.Provider>;
}

export function useAskSwish(): AskSwishContextValue {
  const ctx = useContext(AskSwishContext);
  if (!ctx) throw new Error("useAskSwish must be used within AskSwishProvider");
  return ctx;
}

/**
 * Pages call this with what they are showing. The scope sticks after the
 * page unmounts (so a follow-up asked from the next page still refers to it)
 * until another page declares its own.
 */
export function useAskScope(scope: AskScope | null, surface: AskSurface = "site") {
  const { setScope, setSurface } = useAskSwish();
  const key = JSON.stringify(scope);
  useEffect(() => {
    if (scope && (scope.leagueId || scope.gameKey || scope.teamName || scope.playerName)) setScope(scope);
    setSurface(surface);
    return () => { setSurface("site"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, surface, setScope, setSurface]);
}
