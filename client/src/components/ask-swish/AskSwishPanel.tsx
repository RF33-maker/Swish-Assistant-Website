import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { isNativeShell, plusHref } from "@/lib/plus";
import { Link } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, ChevronRight, Loader2, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchSuggestions, quotaLine, scopeLabel, type AskTurn } from "@/lib/askSwish";
import { useAskSwish } from "./AskSwishProvider";
import AskCardView from "./AskCards";

/**
 * The conversation itself: used inside the side drawer and mobile sheet, on
 * the /ask page, and embedded in the scouting editor. The provider owns the
 * thread; this only draws it and takes input.
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
}

export default function AskSwishPanel({ onClose, size = "panel", onAnswer, autoFocus = true }: Props) {
  const { user } = useAuth();
  const { turns, busy, ask, stop, reset, scope, surface, quota, onAnswer: answerRef } = useAskSwish();
  const allowance = quotaLine(quota);
  const outOfQuestions = !!quota?.exhausted;
  const [draft, setDraft] = useState("");
  const [wantsSignIn, setWantsSignIn] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const label = scopeLabel(scope);

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
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns.length, last?.answer.length, last?.cards.length, last?.status, wantsSignIn]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const submit = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (!user) { setWantsSignIn(true); return; }
    setDraft("");
    ask(q);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(draft); }
  };

  const big = size === "page";
  const chip = "rounded-full border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-slate-700 dark:text-neutral-200 hover:border-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors text-left";

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-[#0a0a0f] text-slate-900 dark:text-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0f] shrink-0">
        <Sparkles className="w-4 h-4 text-orange-500" aria-hidden="true" />
        <span className="font-semibold text-sm">Ask Swish</span>
        {label && (
          <span className="ml-1 hidden sm:inline-flex items-center gap-1 max-w-[50%] rounded-full bg-orange-50 dark:bg-neutral-800 px-2 py-0.5 text-[11px] text-orange-700 dark:text-orange-300 truncate" title={`Answers default to ${label}`}>
            <span className="truncate">{label}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {turns.length > 0 && (
            <button type="button" onClick={reset} aria-label="New conversation" title="New conversation" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-800 transition-colors">
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close Ask Swish" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
        {turns.length === 0 ? (
          <EmptyState groups={groups} label={label} big={big} onPick={submit} chip={chip} />
        ) : (
          turns.map((t) => <Turn key={t.id} turn={t} big={big} onPick={submit} chip={chip} busy={busy} />)
        )}
        {wantsSignIn && !user && (
          <div className="rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/30 p-4 text-sm">
            <p className="font-semibold text-slate-900 dark:text-white">Sign in to ask Swish</p>
            <p className="mt-1 text-slate-600 dark:text-neutral-300">A free account lets you ask anything about the stats, standings and fixtures on the site.</p>
            <div className="mt-3 flex gap-2">
              <a href="/auth" className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">Log in</a>
              <a href="/auth?tab=register" className="rounded-lg border border-orange-300 dark:border-orange-800 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30">Register free</a>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0f] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(draft); }}
          className={`flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 px-3 py-2 focus-within:border-orange-400 dark:focus-within:border-orange-500 transition-colors ${big ? "text-base" : "text-sm"}`}
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder={outOfQuestions ? "You're out of questions for now" : label ? `Ask about ${label}…` : "Ask about any player, team, game or league…"}
            disabled={outOfQuestions}
            aria-label="Ask Swish"
            className="flex-1 min-w-0 resize-none bg-transparent py-1 outline-none placeholder:text-slate-400 dark:placeholder:text-neutral-500 max-h-32"
            style={{ height: "auto" }}
            onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 128)}px`; }}
          />
          {busy ? (
            <button type="button" onClick={stop} aria-label="Stop" className="h-8 w-8 shrink-0 rounded-full bg-slate-800 dark:bg-neutral-200 text-white dark:text-neutral-900 flex items-center justify-center">
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim() || outOfQuestions} aria-label="Send" className="h-8 w-8 shrink-0 rounded-full bg-orange-500 text-white flex items-center justify-center disabled:opacity-40 hover:bg-orange-600 transition-colors">
              <ArrowUp className="w-4 h-4" />
            </button>
          )}
        </form>
        <p className="mt-1.5 px-1 flex items-center justify-between gap-2 text-[10px] text-slate-400 dark:text-neutral-500">
          <span>Answers come from the site's own data. Check anything that matters against the page.</span>
          {allowance && <span className="shrink-0 tabular-nums">{allowance}</span>}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ groups, label, big, onPick, chip }: { groups: { label: string; questions: string[] }[]; label: string | null; big: boolean; onPick: (q: string) => void; chip: string }) {
  return (
    <div className={big ? "max-w-2xl mx-auto" : ""}>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" aria-hidden="true" />
        </div>
        <div>
          <p className={`font-semibold ${big ? "text-xl" : "text-sm"}`}>{label ? `Ask me about ${label}` : "Ask me about British basketball"}</p>
          <p className={`text-slate-600 dark:text-neutral-400 mt-1 ${big ? "text-base" : "text-sm"}`}>
            Standings, scores and tip-off times, player and team stats, advanced ratings, on/off impact, comparisons and season highs — every answer comes from the site's data.
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500 mb-1.5">{g.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.questions.map((q) => (
                <button key={q} type="button" onClick={() => onPick(q)} className={chip}>{q}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Turn({ turn, big, onPick, chip, busy }: { turn: AskTurn; big: boolean; onPick: (q: string) => void; chip: string; busy: boolean }) {
  const { quota } = useAskSwish();
  const prose = useMemo(() => `prose prose-slate dark:prose-invert max-w-none ${big ? "prose-base" : "prose-sm"} [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_strong]:font-semibold`, [big]);
  return (
    <div className={big ? "max-w-2xl mx-auto" : ""}>
      <div className="flex justify-end">
        <div className={`max-w-[85%] rounded-2xl rounded-br-md bg-orange-500 text-white px-3.5 py-2 ${big ? "text-base" : "text-sm"}`}>{turn.question}</div>
      </div>
      <div className="mt-3 flex gap-2.5">
        <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          {turn.cards.map((card, i) => <AskCardView key={i} card={card} brandColor={BRAND} />)}
          {turn.answer && (
            <div className={prose}><ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown></div>
          )}
          {turn.status && (
            <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-neutral-400"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />{turn.status}</p>
          )}
          {!turn.done && !turn.status && !turn.answer && turn.cards.length === 0 && (
            <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-neutral-400"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Thinking…</p>
          )}
          {turn.error && turn.error.code === "rate_limited" ? (
            <div className="rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/30 px-3.5 py-3 text-sm">
              <p className="text-slate-800 dark:text-neutral-100">{turn.error.message}</p>
              {quota?.tier === "free" && !isNativeShell() && (
                <a href={plusHref("/ask")} className="mt-2 inline-block rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">Get Swish+</a>
              )}
            </div>
          ) : turn.error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {turn.error.message}
              {turn.error.code === "unauthenticated" && <> <a href="/auth" className="underline font-semibold">Log in</a></>}
            </div>
          )}
          {turn.done && turn.nav.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {turn.nav.map((b) => (
                <Link key={b.href} href={b.href} className="inline-flex items-center gap-1 rounded-lg border border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/30 px-2.5 py-1 text-xs font-medium text-orange-800 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40">
                  {b.label}<ChevronRight className="w-3 h-3" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
          {turn.done && !busy && turn.followUps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
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
