import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight, RotateCcw, Sparkles, Target, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useGreeting } from "@/lib/greeting";
import { fetchSuggestions, quotaLine, scopeLabel, type AskTurn } from "@/lib/askSwish";
import { withoutSeason } from "@/lib/leagueKeys";
import { useAskSwish } from "./AskSwishProvider";
import AskCardView from "./AskCards";
import AskBar from "./AskBar";
import MetaballField from "./MetaballField";
import AuroraField from "./AuroraField";
import AuroraWords from "./AuroraWords";

/** True inside the iOS app (Capacitor puts its bridge on window); false on the website. */
const isNativeApp =
  typeof window !== "undefined" &&
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

// How many full Ask panels are on screen in the app. While any is, the html
// element carries `ask-backdrop`: the strip under the clock and the header go
// see-through, so the background runs to the top of the screen under the logo.
let backdrops = 0;

/** The full page's living background: "aurora" (orange light curtains) or
 *  "ball" (the earlier orange metaball, MetaballField). Kept switchable so
 *  the ball can come back by changing this one word. */
const ASK_BACKGROUND: "aurora" | "ball" = "aurora";

/**
 * The conversation itself: used inside the side drawer and mobile sheet, on
 * the /ask page, and embedded in the scouting editor. The provider owns the
 * thread; this only draws it and takes input.
 *
 * Before the first question it's a greeting over a soft orange glow, with
 * questions to try; once you ask, the greeting steps aside and the answers
 * stream in above the bar.
 */

const BRAND = "#f97316";

interface Props {
  /** Drawer and sheet show a close button; the page and embeds do not. */
  onClose?: () => void;
  /** Larger type and input on the full page. */
  size?: "panel" | "page";
  /** Receives each finished answer (the scouting editor inserts it). */
  onAnswer?: (text: string) => void;
  autoFocus?: boolean;
  /** Replaces the question box's plus button (the app Home puts its Search / Ask switch there). */
  barLeading?: ReactNode;
  /** Runs the orange beam along the question box (the app Home's Ask mode). */
  barBeam?: boolean;
  /** Stands in for the welcome's own greeting (the app Home passes its date
   *  line and greeting). The box then sits straight under it, exactly where
   *  Home's search bar is, and only what's below the box flows in. */
  welcomeHeader?: ReactNode;
}

/** Space left above a question scrolled to the top: clear of the thread's faded top edge. */
const THREAD_TOP_GAP = 16;

const chip =
  "shrink-0 rounded-full border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-transparent px-3.5 py-2 text-[13px] leading-snug text-slate-700 dark:text-neutral-200 hover:border-orange-400 hover:text-orange-700 dark:hover:border-orange-500/60 dark:hover:text-orange-300 active:scale-[0.98] transition text-left";

export default function AskSwishPanel({ onClose, size = "panel", onAnswer, autoFocus = true, barLeading, barBeam = false, welcomeHeader }: Props) {
  const { user } = useAuth();
  const { turns, busy, ask, stop, reset, scope, surface, quota, onAnswer: answerRef } = useAskSwish();
  const allowance = quotaLine(quota);
  const [wantsSignIn, setWantsSignIn] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scoped = scopeLabel(scope);
  const label = scoped ? withoutSeason(scoped) : null;
  const big = size === "page";
  const started = turns.length > 0;
  const backdrop = big && isNativeApp;

  useEffect(() => {
    if (!backdrop) return;
    const root = document.documentElement;
    backdrops += 1;
    root.classList.add("ask-backdrop");
    return () => {
      backdrops -= 1;
      if (backdrops === 0) root.classList.remove("ask-backdrop");
    };
  }, [backdrop]);

  useEffect(() => {
    if (!onAnswer) return;
    answerRef.current = onAnswer;
    return () => { if (answerRef.current === onAnswer) answerRef.current = null; };
  }, [onAnswer, answerRef]);

  const { data: groups = [] } = useQuery({
    queryKey: ["ask-swish", "suggestions", scope?.leagueId ?? null, scope?.gameKey ?? null, scope?.teamName ?? null, scope?.playerName ?? null, surface],
    queryFn: () => fetchSuggestions(scope, surface),
    staleTime: 60_000,
  });

  const last = turns[turns.length - 1];

  // Answers are read from the top: asking brings the new question up to the
  // top of the thread and the answer writes downwards under it, with the view
  // left where it is (no following the text to the bottom). The newest turn is
  // at least a thread's height tall so even a short one can reach the top.
  const threadRef = useRef<HTMLDivElement>(null);
  const lastTurnRef = useRef<HTMLDivElement>(null);
  const [threadHeight, setThreadHeight] = useState(0);
  const scrolledOnce = useRef(false);
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    setThreadHeight(el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => setThreadHeight(el.clientHeight));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const measured = threadHeight > 0;
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const turn = lastTurnRef.current;
    const top = turn ? thread.scrollTop + turn.getBoundingClientRect().top - thread.getBoundingClientRect().top - THREAD_TOP_GAP : 0;
    // A conversation restored on load jumps there; a new question glides.
    thread.scrollTo({ top: Math.max(0, top), behavior: scrolledOnce.current ? "smooth" : "auto" });
    scrolledOnce.current = true;
  }, [turns.length, measured]);
  // The sign-in prompt sits under everything, so that one still scrolls into view.
  useEffect(() => { if (wantsSignIn) endRef.current?.scrollIntoView({ block: "end" }); }, [wantsSignIn]);

  // The free strip between the end of the conversation and the bar, for the aurora's words.
  const openSpace = () => {
    const thread = threadRef.current;
    const content = lastTurnRef.current?.firstElementChild;
    return thread && content ? { top: content.getBoundingClientRect().bottom + 24, bottom: thread.getBoundingClientRect().bottom } : null;
  };

  const bar = (
    <>
      <AskBar onSubmit={(t) => submit(t)} groups={groups} autoFocus={autoFocus} big={big} dropDown={!started} leading={barLeading} beam={barBeam} />
      <p className={`mt-1.5 px-2 flex items-center justify-between gap-2 text-[10.5px] leading-tight ${big ? "ask-fineprint text-slate-500 dark:text-neutral-400" : "text-slate-400 dark:text-neutral-500"}`}>
        <span>Answers come from the site's own data. Check anything that matters against the page.</span>
        {allowance && <span className="shrink-0 tabular-nums">{allowance}</span>}
      </p>
    </>
  );

  const submit = (text: string) => {
    const q = text.trim();
    if (!q || busy) return false;
    if (!user) { setWantsSignIn(true); return false; }
    ask(q);
    return true;
  };

  return (
    <div className="ask-swish relative flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 dark:bg-[#0a0a0f] text-slate-900 dark:text-white">
      {/* The page, drawer and phone sheet get the living background (aurora, or the earlier metaball); embeds (the scouting editor) keep the plain glow. Both dim once a conversation is under way. */}
      {big || onClose ? (
        // In the app the full page's background fills the whole screen (fixed), behind the clock, the logo and the tab bar.
        <div aria-hidden="true" className={backdrop ? "pointer-events-none fixed inset-0" : "contents"}>
          {ASK_BACKGROUND === "aurora" ? (
            <>
              <AuroraField busy={busy} dim={started} />
              {/* Words only until the answer starts arriving, and only in the open space under the conversation. */}
              <AuroraWords active={busy && !!last && !last.answer && last.cards.length === 0} question={last?.question} status={last?.status} room={openSpace} />
            </>
          ) : (
            <MetaballField busy={busy} dim={started} />
          )}
        </div>
      ) : (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 flex justify-center transition-all duration-700 ${started ? "opacity-30 top-[55%]" : "top-[12%]"}`}
        >
          {/* The pulse scales this inner disc, so the centring stays on the wrapper. */}
          <div className="ask-glow w-[150%] max-w-[900px] shrink-0 aspect-square rounded-full bg-[radial-gradient(closest-side,rgba(249,115,22,0.20),rgba(249,115,22,0.07)_55%,transparent)] dark:bg-[radial-gradient(closest-side,rgba(249,115,22,0.30),rgba(249,115,22,0.09)_55%,transparent)]" />
        </div>
      )}

      {/* A header only where the panel needs one: the drawer's close, and a new conversation once there is one. */}
      {(onClose || started) && (
        <div className={`relative z-10 flex items-center gap-2 shrink-0 px-4 ${onClose ? "h-12 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#0a0a0f]/80 backdrop-blur" : "h-10"}`}>
          {onClose && (
            <>
              <Sparkles className="w-4 h-4 text-orange-500" aria-hidden="true" />
              <span className="font-semibold text-sm">Ask Swish</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            {started && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                New chat
              </button>
            )}
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close Ask Swish" className="h-8 w-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Thread */}
      <div ref={threadRef} className={`relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain ${welcomeHeader && !started ? "[mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]" : "[mask-image:linear-gradient(to_bottom,transparent,black_16px,black_calc(100%-20px),transparent)]"}`}>
        {started ? (
          <div className={`px-4 pt-2 pb-6 space-y-7 ${big ? "max-w-2xl mx-auto" : ""}`} role="log" aria-live="polite" aria-label="Conversation">
            {turns.map((t, i) => {
              const newest = i === turns.length - 1;
              return (
                <div
                  key={t.id}
                  ref={newest ? lastTurnRef : undefined}
                  // Tall enough to sit at the top: the thread less the top gap and the log's bottom padding.
                  style={newest && measured ? { minHeight: Math.max(0, threadHeight - THREAD_TOP_GAP - 24) } : undefined}
                >
                  <Turn turn={t} big={big} onPick={submit} busy={busy} />
                </div>
              );
            })}
          </div>
        ) : (
          <Welcome groups={groups} label={label} big={big} onPick={submit} bar={bar} header={welcomeHeader} />
        )}
        {wantsSignIn && !user && (
          <div className={`mx-4 mb-4 rounded-2xl border border-orange-300/60 dark:border-orange-500/30 px-4 py-3.5 text-sm ${big ? "max-w-2xl md:mx-auto" : ""}`}>
            <p className="font-semibold">Sign in to ask Swish</p>
            <p className="mt-1 text-slate-600 dark:text-neutral-300">A free account lets you ask anything about the stats, standings and fixtures on the site.</p>
            <div className="mt-3 flex gap-2">
              <a href="/auth" className="rounded-full bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">Log in</a>
              <a href="/auth?tab=register" className="rounded-full border border-orange-400/60 px-4 py-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300">Register free</a>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Once a conversation starts, the bar moves from under the greeting to the foot of the panel. */}
      {started && (
        <div className={`relative z-10 shrink-0 px-3 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${big ? "md:pb-6" : ""}`}>
          <div className={big ? "max-w-2xl mx-auto" : ""}>{bar}</div>
        </div>
      )}
    </div>
  );
}

/** The greeting, word by word, and questions to try. */
function Welcome({ groups, label, big, onPick, bar, header }: { groups: { label: string; questions: string[] }[]; label: string | null; big: boolean; onPick: (q: string) => void; bar: ReactNode; header?: ReactNode }) {
  const { name, part } = useGreeting();
  const hello = `Good ${part}${name ? `, ${name}` : ""}.`;
  const ask = label ? "What do you want to know?" : "What shall we look into?";
  let n = 0;
  const words = (text: string) =>
    text.split(" ").map((w, i) => (
      <span key={i} className="ask-word" style={{ animationDelay: `${120 + n++ * 70}ms` }}>
        {w}&nbsp;
      </span>
    ));

  const suggestions = (delay: number) =>
    groups.length > 0 && (
      <div className="ask-word pb-3 space-y-3.5" style={{ animationDelay: `${delay}ms` }}>
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-5 mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{g.label}</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide px-5 snap-x scroll-px-5">
              {g.questions.map((q) => (
                <button key={q} type="button" onClick={() => onPick(q)} className={`${chip} snap-start`}>{q}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  // The app Home: its own header and the box stay put (same spacing as Home's
  // search), and the line and questions underneath flow in.
  if (header) {
    return (
      <div className={big ? "max-w-2xl mx-auto" : ""}>
        <div className="px-5 pt-1">
          {header}
          <div className="relative z-20 mt-10">{bar}</div>
          <p className="ask-word mt-5 text-[14px] leading-relaxed text-slate-600 dark:text-neutral-400" style={{ animationDelay: "160ms" }}>
            {ask} Standings, scores, tip-offs, player and team stats, ratings, on/off and season highs.
          </p>
        </div>
        <div className="mt-6">{suggestions(260)}</div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-full flex-col justify-center ${big ? "max-w-2xl mx-auto" : ""}`}>
      <div className="px-5 pt-6 pb-5">
        <h2 className={`ch-display font-bold tracking-tight leading-[1.05] ${big ? "text-[2.25rem] md:text-[2.75rem]" : "text-[2rem]"}`}>
          <span className="text-slate-500 dark:text-neutral-400">{words(hello)}</span>
          <br />
          {words(ask)}
        </h2>
        {label && (
          <div className="ask-word mt-3 max-w-full" style={{ animationDelay: `${140 + n * 70}ms` }}>
            <p className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-orange-500/30 px-3 py-1 text-[12.5px] font-semibold text-orange-700 dark:text-orange-300">
              <Target className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Starting from {label}</span>
            </p>
          </div>
        )}
        <p className="ask-word mt-3 text-[14px] leading-relaxed text-slate-600 dark:text-neutral-400" style={{ animationDelay: `${160 + n * 70}ms` }}>
          Standings, scores, tip-offs, player and team stats, ratings, on/off and season highs, all from the site's data.
        </p>
      </div>

      {/* The bar sits in the middle until the first question. */}
      <div className="ask-word relative z-20 px-3 pb-6" style={{ animationDelay: `${220 + n * 70}ms` }}>{bar}</div>

      {suggestions(300 + n * 70)}
    </div>
  );
}

/** What Swish is doing while the answer is on its way, a line every couple of seconds. */
const LOOKING = [
  "Looking through the statbook",
  "Pulling the box scores",
  "Analysing the numbers",
  "Checking the league tables",
  "Crunching the splits",
  "Comparing with the rest of the league",
  "Lining up the leaders",
];
/** Once the tables are in and the words are being written. */
const WRITING = ["Reading the results", "Picking out what matters", "Writing it up"];
const PHRASE_MS = 2400;

/**
 * Fading dots and a rotating line. A real step from the server ("Ranking
 * players by rim in NBL Division One…") leads, then the general lines carry
 * on so the wait never sits still.
 */
function Thinking({ status, writing }: { status: string | null; writing: boolean }) {
  const real = status && !/^thinking/i.test(status) ? status.replace(/…$/, "") : null;
  const lines = writing ? WRITING : LOOKING;
  const [step, setStep] = useState(0);
  // A new step from the server starts the line again.
  useEffect(() => setStep(0), [real, writing]);
  useEffect(() => {
    const t = window.setInterval(() => setStep((n) => n + 1), PHRASE_MS);
    return () => window.clearInterval(t);
  }, [real, writing]);
  const text = real && step === 0 ? real : lines[(real ? step - 1 : step) % lines.length];
  return (
    <div className="flex items-center gap-2.5 text-[13.5px]" role="status">
      <span className="flex gap-[3px]" aria-hidden="true">
        {[0, 0.2, 0.4].map((d) => (
          <span key={d} className="ask-fade-dot h-[5px] w-[5px] rounded-full bg-orange-500" style={{ animationDelay: `${d}s` }} />
        ))}
      </span>
      <span className="sr-only">Working on your answer</span>
      <span key={text} className="ask-phrase ask-shimmer truncate" aria-hidden="true">{text}…</span>
    </div>
  );
}

function Turn({ turn, big, onPick, busy }: { turn: AskTurn; big: boolean; onPick: (q: string) => boolean; busy: boolean }) {
  const { quota } = useAskSwish();
  const prose = useMemo(() => `prose prose-slate dark:prose-invert max-w-none ${big ? "prose-base" : "prose-sm"} [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-slate-900 dark:[&_strong]:text-white [&_a]:text-orange-600 dark:[&_a]:text-orange-400`, [big]);
  const live = !turn.done;
  return (
    <div className="ask-turn">
      <div className="flex justify-end">
        <div className={`max-w-[85%] rounded-[22px] rounded-br-md border border-orange-500/25 bg-orange-500/10 px-4 py-2.5 text-slate-900 dark:text-white ${big ? "text-[15px]" : "text-sm"}`}>
          {turn.question}
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <div className={`h-7 w-7 shrink-0 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 grid place-items-center mt-0.5 ${live ? "animate-pulse" : ""}`}>
          <Sparkles className="w-3.5 h-3.5 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {/* The words come first; the tables and lists they're drawn from
              follow once the answer is written, one after another. */}
          {turn.answer && (
            <div className={prose}><ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown></div>
          )}
          {live && !turn.error && (turn.status || !turn.answer) && (
            <Thinking status={turn.status} writing={!turn.status && turn.cards.length > 0} />
          )}
          {turn.done && turn.cards.length > 0 && (
            <div className="space-y-3 pt-1">
              {turn.cards.map((card, i) => (
                <div key={i} className="ask-card-in" style={{ animationDelay: `${120 + i * 110}ms` }}>
                  <AskCardView card={card} brandColor={BRAND} />
                </div>
              ))}
            </div>
          )}
          {turn.error && turn.error.code === "rate_limited" ? (
            <div className="rounded-2xl border border-orange-300/60 dark:border-orange-500/30 px-4 py-3 text-sm">
              <p className="text-slate-800 dark:text-neutral-100">{turn.error.message}</p>
              {quota?.tier === "free" && (
                <a href="/coach-access" className="mt-2.5 inline-block rounded-full bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">See coach plans</a>
              )}
            </div>
          ) : turn.error && (
            <div className="rounded-2xl border border-red-300/60 dark:border-red-500/30 px-4 py-2.5 text-[13px] text-red-700 dark:text-red-300">
              {turn.error.message}
              {turn.error.code === "unauthenticated" && <> <a href="/auth" className="underline font-semibold">Log in</a></>}
            </div>
          )}
          {turn.done && turn.nav.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {turn.nav.map((b) => (
                <Link key={b.href} href={b.href} className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-orange-600 transition-colors">
                  {b.label}<ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
          {turn.done && !busy && turn.followUps.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {turn.followUps.map((q) => (
                <button key={q} type="button" onClick={() => onPick(q)} className={chip}>{q}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
