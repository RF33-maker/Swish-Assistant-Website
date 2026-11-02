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
          className="fixed z-[9000] bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:right-6 lg:bottom-6 inline-flex items-center gap-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-neutral-900 pl-3.5 pr-4 py-2.5 text-sm font-semibold shadow-lg shadow-black/20 hover:shadow-xl hover:-translate-y-px transition-all"
        >
          <Sparkles className="w-4 h-4 text-orange-400 dark:text-orange-500" aria-hidden="true" />
          Ask Swish
        </button>
      )}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Ask Swish"
          className="fixed z-[9000] inset-0 lg:inset-auto lg:top-0 lg:right-0 lg:bottom-0 lg:w-[420px] xl:w-[460px] bg-white dark:bg-[#0a0a0f] lg:border-l lg:border-slate-200 lg:dark:border-neutral-800 lg:shadow-2xl animate-in slide-in-from-bottom lg:slide-in-from-right duration-200"
        >
          <AskSwishPanel onClose={close} />
        </div>
      )}
    </>
  );
}
