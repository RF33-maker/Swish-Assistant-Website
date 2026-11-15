import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { prefersReducedMotion } from "@/components/home/motion";

/**
 * The History page's own bar: it sticks to the top once the page scrolls past it, lists
 * the page's sections with the one being read lit up, and, once stuck, carries a league
 * switcher so changing league never means scrolling back up.
 */

export type NavSection = { id: string; label: string };
export type NavLeague = { id: string; short: string; name: string; logo?: string };

/** Space the bar takes when stuck, if it can't be measured. */
export const NAV_OFFSET = 80;

/**
 * How far down the page a section has to sit to clear the stuck bar: the bar's sticky top
 * (0 on the website, below the status bar in the iOS app) plus its height, plus a gap.
 */
export function navOffset(): number {
  const bar = typeof document !== "undefined" ? document.querySelector<HTMLElement>("[data-history-nav]") : null;
  if (!bar) return NAV_OFFSET;
  const top = parseFloat(getComputedStyle(bar).top) || 0;
  return top + bar.offsetHeight + 16;
}

/** The section being read: the last one whose top has passed under the bar. */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current: string | null = null;
      const offset = navOffset();
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - offset - 24 <= 0) current = id;
      }
      // At the foot of the page the last section can be too short to reach the bar.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atEnd && ids.length) {
        const last = document.getElementById(ids[ids.length - 1]);
        if (last && last.getBoundingClientRect().top < window.innerHeight) current = ids[ids.length - 1];
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - navOffset();
  window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  try {
    const url = new URL(window.location.href);
    url.hash = id;
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    /* the jump still works without the URL */
  }
}

function LeagueMenu({ leagues, activeId, onPick }: { leagues: NavLeague[]; activeId: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const active = leagues.find((l) => l.id === activeId) || leagues[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`League: ${active.name}. Change league`}
        className="flex h-10 items-center gap-1.5 sm:gap-2 rounded-full pl-1.5 pr-2 sm:pr-3 text-sm font-semibold text-[color:var(--ch-text)] shadow-[inset_0_0_0_1px_var(--ch-border-strong)] hover:bg-[color:var(--ch-surface-2)] transition-colors"
      >
        {active.logo ? <img src={active.logo} alt="" className="h-7 w-7 object-contain" /> : <span className="w-1" />}
        {/* Phones show the logo alone, leaving the bar to the sections. */}
        <span className={`whitespace-nowrap ${active.logo ? "hidden sm:inline" : ""}`}>{active.short}</span>
        <ChevronDown className={`h-4 w-4 text-[color:var(--ch-text-2)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-72 max-w-[calc(100vw-32px)] rounded-xl border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] p-1.5 shadow-[var(--ch-shadow-lg)]">
          {leagues.map((l) => {
            const on = l.id === active.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => { setOpen(false); onPick(l.id); }}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${on ? "bg-[color:var(--ch-surface-2)]" : "hover:bg-[color:var(--ch-surface-2)]"}`}
              >
                {l.logo ? <img src={l.logo} alt="" className="h-8 w-8 shrink-0 object-contain" /> : <span className="h-8 w-8 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[color:var(--ch-text)]">{l.short}</span>
                  <span className="block text-xs text-[color:var(--ch-text-2)]">{l.name}</span>
                </span>
                {on && <Check className="h-4 w-4 shrink-0 text-[color:var(--ch-accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HistoryNav({
  leagues,
  activeLeague,
  onPickLeague,
  sections,
  className = "",
}: {
  leagues: NavLeague[];
  activeLeague: string;
  onPickLeague: (id: string) => void;
  sections: NavSection[];
  /** Spacing above the bar. It renders straight into the page's main column: a sticky bar only sticks inside its parent. */
  className?: string;
}) {
  const active = useActiveSection(sections.map((s) => s.id));
  const sentinel = useRef<HTMLDivElement | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);
  const links = useRef(new Map<string, HTMLButtonElement>());
  const [stuck, setStuck] = useState(false);

  // Stuck once the spot the bar starts from has scrolled up out of view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keep the lit link in view inside the strip (phones scroll it sideways).
  useEffect(() => {
    const link = active ? links.current.get(active) : null;
    const box = strip.current;
    if (!link || !box || box.scrollWidth <= box.clientWidth) return;
    // Measured against the strip itself: offsetLeft would count from the bar and overshoot.
    const offset = link.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    const left = offset - (box.clientWidth - link.offsetWidth) / 2;
    box.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [active]);

  return (
    <>
      <div ref={sentinel} aria-hidden className={`h-px ${className}`} />
      {/* Below lg the site's floating menu button sits top right, so the bar stops short of
          it and lines its links up with the button's middle. */}
      <div data-history-nav className={`sticky top-0 z-30 -mx-4 md:-mx-6 pl-4 pr-[68px] md:pl-6 lg:px-6 transition-[background-color,box-shadow] duration-200 ${stuck ? "ch-glass shadow-[0_1px_0_var(--ch-border-strong)]" : "shadow-[0_1px_0_var(--ch-border)]"}`}>
        <div className="flex h-16 pt-3 pb-2 lg:h-14 lg:py-0 items-center gap-3">
          {stuck && <LeagueMenu leagues={leagues} activeId={activeLeague} onPick={onPickLeague} />}
          <nav aria-label="On this page" className="min-w-0 flex-1">
            {/* The strip scrolls sideways on phones; the fade at its end says there is more. */}
            <div
              ref={strip}
              className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-lg:[mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)] max-lg:pr-6"
            >
              {sections.map((s) => {
                const on = s.id === active;
                return (
                  <button
                    key={s.id}
                    ref={(el) => { if (el) links.current.set(s.id, el); else links.current.delete(s.id); }}
                    type="button"
                    onClick={() => scrollToSection(s.id)}
                    aria-current={on ? "location" : undefined}
                    className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                      on
                        ? "bg-[color:var(--ch-text)] text-[color:var(--ch-bg)]"
                        : "text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)] hover:bg-[color:var(--ch-surface-2)]"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
