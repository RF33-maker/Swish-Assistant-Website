import { useEffect } from "react";
import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";
import { useAskSwish } from "./AskSwishProvider";
import AskSwishPanel from "./AskSwishPanel";

/**
 * The one entry point mounted for the whole site: a pill (bottom-right on
 * desktop, bottom-centre on phones) and the surface it opens — a right-hand
 * drawer over the page on desktop, a full-screen sheet on phones. The page
 * underneath stays where it was, so the scope stays what the user can see.
 */

// No pill where it would get in the way or make no sense.
const HIDDEN_ON = ["/auth", "/ask", "/widget", "/embed", "/reset-password", "/r/"];

export default function AskSwishLauncher() {
  const [location] = useLocation();
  const { isOpen, open, close } = useAskSwish();
  const hidden = HIDDEN_ON.some((p) => location === p || location.startsWith(p));

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    // Lock page scroll on phones while the sheet covers it.
    const mq = window.matchMedia("(max-width: 1023px)");
    const prev = document.body.style.overflow;
    if (mq.matches) document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [isOpen, close]);

  if (hidden) return null;

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => open()}
          aria-label="Ask Swish"
          data-testid="ask-swish-launcher"
          className="group fixed z-[9000] bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:right-6 lg:bottom-6 inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#0a0a0f] text-slate-900 dark:text-white pl-1.5 pr-4 py-1.5 text-sm font-semibold shadow-[0_10px_30px_-14px_rgba(15,23,42,0.45)] dark:shadow-[0_0_0_1px_rgba(249,115,22,0.08),0_18px_40px_-18px_rgba(249,115,22,0.55)] hover:border-orange-400 dark:hover:border-orange-500/70 hover:-translate-y-px active:scale-[0.98] transition-all"
        >
          {/* The same orange disc as the send button inside, so the pill reads as the bar it opens. */}
          <span className="h-8 w-8 shrink-0 rounded-full grid place-items-center bg-orange-500 text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,0.8)]" aria-hidden="true">
            <Sparkles className="w-4 h-4" />
          </span>
          Ask Swish
        </button>
      )}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Ask Swish"
          className="fixed z-[9000] inset-0 lg:inset-auto lg:top-0 lg:right-0 lg:bottom-0 lg:w-[420px] xl:w-[460px] bg-slate-50 dark:bg-[#0a0a0f] lg:border-l lg:border-slate-200 lg:dark:border-white/10 lg:shadow-2xl animate-in slide-in-from-bottom lg:slide-in-from-right duration-200"
        >
          <AskSwishPanel onClose={close} />
        </div>
      )}
    </>
  );
}
