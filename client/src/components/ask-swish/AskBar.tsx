import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Check, ChevronDown, Globe, Mic, Plus, RotateCcw, Sparkles, Square, Target } from "lucide-react";
import { scopeLabel as fullLabel, type AskScope } from "@/lib/askSwish";
import { withoutSeason } from "@/lib/leagueKeys";
import { useAskSwish } from "./AskSwishProvider";

const scopeLabel = (s: AskScope | null) => {
  const l = fullLabel(s);
  return l ? withoutSeason(l) : null;
};

/** True inside the iOS app (Capacitor puts its bridge on window); false on the website. */
const isNativeApp =
  typeof window !== "undefined" &&
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/**
 * Ask Swish's input: one rounded bar that grows with what you write (up to
 * eight lines, then scrolls). On the left a plus opens questions to try and a
 * new chat; on the right a chip says what Swish is looking at (the league,
 * team or game you came from, or everything) and can switch between them.
 * The button is send while there's something to send, stop while an answer
 * streams, and on the website a microphone when the bar is empty and the
 * browser can listen.
 */

const LINE = 24;
const MAX_ROWS = 8;

type Recogniser = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  interimResults: boolean;
  continuous: boolean;
  lang: string;
};

/** The browser's speech recogniser, if it has one. Not in the app: it would need microphone permission set up in iOS first. */
function recogniser(): (new () => Recogniser) | null {
  if (isNativeApp || typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recogniser; webkitSpeechRecognition?: new () => Recogniser };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface Props {
  /** Sends the question; returns false if it wasn't sent (signed out, busy), so the draft is kept. */
  onSubmit: (text: string) => boolean;
  groups: { label: string; questions: string[] }[];
  autoFocus?: boolean;
  big?: boolean;
  /** Open the menus below the bar (when it sits mid-page) rather than above. */
  dropDown?: boolean;
}

export default function AskBar({ onSubmit, groups, autoFocus = true, big = false, dropDown = false }: Props) {
  const id = useId();
  const { busy, stop, reset, turns, scope, setScope, clearScope, quota } = useAskSwish();
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState(1);
  const [opened, setOpened] = useState(false);
  const [menu, setMenu] = useState<null | "plus" | "scope">(null);
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const plusBtn = useRef<HTMLButtonElement>(null);
  const scopeBtn = useRef<HTMLButtonElement>(null);
  const menuEl = useRef<HTMLDivElement>(null);
  const speech = useRef<Recogniser | null>(null);
  const out = !!quota?.exhausted;

  // The page's own scope, kept so "All leagues" can be switched back.
  const pageScope = useRef<AskScope | null>(scope);
  if (scope) pageScope.current = scope;
  const here = pageScope.current ? scopeLabel(pageScope.current) : null;
  const label = scopeLabel(scope);

  useEffect(() => { if (autoFocus) area.current?.focus(); }, [autoFocus]);

  // Grow with the text, up to eight lines. An empty bar is one line (a
  // browser counts a wrapped placeholder as content). Once it has opened out
  // to full width it stays that way until it's emptied, so a line that only
  // just fits doesn't flip it back and forth.
  useLayoutEffect(() => {
    const a = area.current;
    if (!a) return;
    if (!draft) {
      a.style.height = `${LINE}px`;
      setRows(1);
      setOpened(false);
      return;
    }
    a.style.height = "auto";
    const r = Math.max(1, Math.min(MAX_ROWS, Math.round(a.scrollHeight / LINE)));
    a.style.height = `${r * LINE}px`;
    setRows(r);
    if (r > 1) setOpened(true);
  }, [draft, opened]);

  // Menus close on a tap elsewhere.
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuEl.current?.contains(t) && !plusBtn.current?.contains(t) && !scopeBtn.current?.contains(t)) setMenu(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 3600);
    return () => clearTimeout(t);
  }, [note]);
  useEffect(() => () => speech.current?.abort(), []);

  const send = (text = draft) => {
    if (!text.trim() || busy || out) return;
    speech.current?.stop();
    if (onSubmit(text) && text === draft) setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuEl.current?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? []);
    const k = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(k + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Close only the menu: on the website the drawer also listens for Escape.
      e.stopPropagation();
      const back = menu === "plus" ? plusBtn : scopeBtn;
      setMenu(null);
      back.current?.focus();
    }
  };
  useEffect(() => {
    if (menu) menuEl.current?.querySelector<HTMLElement>("[aria-checked='true'], [role^='menuitem']")?.focus();
  }, [menu]);

  // After a menu choice the website puts you back in the bar; the app doesn't, so the keyboard doesn't jump up.
  const refocus = () => { if (!isNativeApp) area.current?.focus(); };

  const SR = recogniser();
  const listen = () => {
    if (listening) { speech.current?.stop(); return; }
    if (!SR) return;
    const r = new SR();
    r.interimResults = true;
    r.continuous = false;
    r.lang = "en-GB";
    const before = draft ? `${draft.trimEnd()} ` : "";
    r.onresult = (e) => setDraft(before + Array.from(e.results).map((x) => x[0].transcript).join(""));
    r.onend = () => { setListening(false); area.current?.focus(); };
    r.onerror = () => { setListening(false); setNote("Couldn't hear that. Check the microphone and try again."); };
    speech.current = r;
    try { r.start(); setListening(true); } catch { setNote("Voice input isn't available right now."); }
  };

  const tries = groups.flatMap((g) => g.questions).slice(0, 6);
  const expanded = opened || rows > 1;
  const canSend = draft.trim().length > 0 && !out;
  const menuBox = `absolute ${dropDown ? "top-full mt-2 slide-in-from-top-1" : "bottom-full mb-2 slide-in-from-bottom-1"} z-30 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1014] p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)] animate-in fade-in duration-150`;
  const item = "w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] text-slate-700 dark:text-neutral-200 hover:bg-orange-500/10 focus:bg-orange-500/10 focus:outline-none";
  const iconBtn = "h-9 w-9 shrink-0 rounded-full grid place-items-center text-slate-500 dark:text-neutral-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/10 transition-colors";

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        data-listening={listening || undefined}
        className={`relative flex flex-wrap items-end gap-1 rounded-[26px] border bg-white dark:bg-[#0a0a0f] px-1.5 py-1.5 transition-[border-color,box-shadow] duration-200 shadow-[0_10px_30px_-14px_rgba(15,23,42,0.35)] dark:shadow-[0_0_0_1px_rgba(249,115,22,0.08),0_18px_40px_-18px_rgba(249,115,22,0.45)] ${
          listening ? "border-orange-500 ring-4 ring-orange-500/15" : "border-slate-200 dark:border-white/[0.12] focus-within:border-orange-400 dark:focus-within:border-orange-500/70 focus-within:ring-4 focus-within:ring-orange-500/10"
        }`}
      >
        {/* Plus: questions to try, and a fresh start. */}
        <div className="relative shrink-0">
          <button
            ref={plusBtn}
            type="button"
            className={iconBtn}
            aria-label="Questions to try and more"
            aria-haspopup="menu"
            aria-expanded={menu === "plus"}
            aria-controls={menu === "plus" ? `${id}-plus` : undefined}
            onClick={() => setMenu((m) => (m === "plus" ? null : "plus"))}
          >
            <Plus className={`h-5 w-5 transition-transform ${menu === "plus" ? "rotate-45" : ""}`} aria-hidden="true" />
          </button>
          {menu === "plus" && (
            <div ref={menuEl} id={`${id}-plus`} role="menu" aria-label="Ask Swish" onKeyDown={onMenuKey} className={`${menuBox} left-0`}>
              {turns.length > 0 && (
                <button type="button" role="menuitem" tabIndex={-1} className={item} onClick={() => { setMenu(null); reset(); refocus(); }}>
                  <RotateCcw className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                  New chat
                </button>
              )}
              {tries.length > 0 && (
                <>
                  <p className="px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-neutral-500">Questions to try</p>
                  {tries.map((q) => (
                    <button key={q} type="button" role="menuitem" tabIndex={-1} className={item} onClick={() => { setMenu(null); send(q); }}>
                      <Sparkles className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                      <span className="min-w-0">{q}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <label className={`min-w-0 flex-1 self-center ${expanded ? "order-first basis-full px-3 pt-1.5" : "px-1"}`}>
          <span className="sr-only">Ask Swish</span>
          <textarea
            ref={area}
            rows={1}
            value={draft}
            disabled={out}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={out ? "You're out of questions for now" : listening ? "Listening…" : label ? "Ask a question" : here ? "Ask anything" : "What do you want to find out?"}
            className={`block w-full resize-none bg-transparent leading-6 outline-none placeholder:text-slate-400 dark:placeholder:text-neutral-500 overflow-y-auto ${big ? "text-[16px]" : "text-[16px] md:text-[15px]"}`}
            style={{ height: LINE }}
          />
        </label>

        {expanded && <span className="flex-1" aria-hidden="true" />}

        {/* What Swish is looking at. */}
        {(here || label) && (
          <div className="relative shrink-0">
            <button
              ref={scopeBtn}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menu === "scope"}
              aria-controls={menu === "scope" ? `${id}-scope` : undefined}
              aria-label={`Looking at: ${label ?? "all leagues"}`}
              onClick={() => setMenu((m) => (m === "scope" ? null : "scope"))}
              className="h-9 inline-flex items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-orange-700 dark:text-orange-300 hover:bg-orange-500/10 transition-colors"
            >
              <span className="max-w-[96px] truncate">{label ?? "All leagues"}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
            {menu === "scope" && (
              <div ref={menuEl} id={`${id}-scope`} role="menu" aria-label="Looking at" onKeyDown={onMenuKey} className={`${menuBox} right-0`}>
                <p className="px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-neutral-500">Swish is looking at</p>
                {here && pageScope.current && (
                  <button type="button" role="menuitemradio" aria-checked={!!scope} tabIndex={-1} className={item} onClick={() => { setScope(pageScope.current); setMenu(null); refocus(); }}>
                    <Target className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{here}</span>
                      <span className="block text-[12px] text-slate-500 dark:text-neutral-400">Answers start from what you were viewing</span>
                    </span>
                    {scope && <Check className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />}
                  </button>
                )}
                <button type="button" role="menuitemradio" aria-checked={!scope} tabIndex={-1} className={item} onClick={() => { clearScope(); setMenu(null); refocus(); }}>
                  <Globe className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">All leagues</span>
                    <span className="block text-[12px] text-slate-500 dark:text-neutral-400">Anything across British basketball</span>
                  </span>
                  {!scope && <Check className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />}
                </button>
              </div>
            )}
          </div>
        )}

        {busy ? (
          <button type="button" onClick={stop} aria-label="Stop" className="h-9 w-9 shrink-0 rounded-full grid place-items-center bg-slate-900 text-white dark:bg-white dark:text-slate-900 transition-transform active:scale-95">
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
        ) : canSend || !SR ? (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="h-9 w-9 shrink-0 rounded-full grid place-items-center bg-orange-500 text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,0.8)] transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-white/10 dark:disabled:text-neutral-500"
          >
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" onClick={listen} aria-label={listening ? "Stop listening" : "Speak"} aria-pressed={listening} className={`${iconBtn} ${listening ? "!text-orange-500" : ""}`}>
            {listening ? (
              <span className="flex items-end gap-[3px] h-4" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => <i key={i} className="w-[3px] rounded-full bg-orange-500 animate-pulse" style={{ height: `${[8, 14, 10, 12][i]}px`, animationDelay: `${i * 120}ms` }} />)}
              </span>
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        )}
      </form>
      {note && <p className="mt-1.5 px-3 text-[12px] text-orange-700 dark:text-orange-300" aria-live="polite">{note}</p>}
    </div>
  );
}
