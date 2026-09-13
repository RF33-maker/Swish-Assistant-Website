import { useEffect, useRef, useState } from "react";

export interface PillTab {
  key: string;
  label: string;
}

interface PillTabBarProps {
  tabs: PillTab[];
  active: string;
  onChange: (key: string) => void;
  accentColor: string;
}

export function PillTabBar({ tabs, active, onChange, accentColor }: PillTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Fixed tab labels fit on most phones, but not the narrowest ones (e.g.
  // iPhone SE) — rather than assume a scrollable row is always fully
  // visible, detect real overflow and fade the edge that still has more
  // content, so a cut-off tab (like "Accolades") reads as "scroll for
  // more" instead of looking broken.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [tabs]);

  const maskDirection =
    canScrollLeft && canScrollRight ? "both" : canScrollLeft ? "left" : canScrollRight ? "right" : "none";
  const maskImage =
    maskDirection === "both"
      ? "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)"
      : maskDirection === "left"
        ? "linear-gradient(to right, transparent, black 24px)"
        : maskDirection === "right"
          ? "linear-gradient(to right, black calc(100% - 24px), transparent)"
          : undefined;

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-0.5 md:gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 w-full md:w-fit overflow-x-auto flex-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={maskImage ? { WebkitMaskImage: maskImage, maskImage } : undefined}
    >
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`px-2 md:px-4 py-1.5 text-xs md:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            active === tab.key ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-neutral-800'
          }`}
          style={active === tab.key ? { backgroundColor: accentColor } : {}}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
