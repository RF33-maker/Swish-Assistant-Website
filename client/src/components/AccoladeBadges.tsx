import { useState } from "react";
import { createPortal } from "react-dom";
import { Medal, Gem, Sparkles, Star, X, ExternalLink } from "lucide-react";
import { withAlpha } from "@/lib/colorContrast";
import { useReadableTeamColor } from "@/hooks/useReadableColor";
import type { Accolade, AccoladeTier } from "@/lib/accolades";

const TIER_STYLE: Record<AccoladeTier, { fill: string; icon: string; ring: string; Icon: typeof Medal; tierLabel: string }> = {
  bronze: { fill: "linear-gradient(135deg, #d7a26b, #a05a2c)", icon: "#fff", ring: "#a05a2c", Icon: Medal, tierLabel: "Bronze" },
  silver: { fill: "linear-gradient(135deg, #e6e9ec, #9aa3ab)", icon: "#1f2937", ring: "#9aa3ab", Icon: Medal, tierLabel: "Silver" },
  gold: { fill: "linear-gradient(135deg, #ffe28a, #d9a520)", icon: "#5c3d00", ring: "#d9a520", Icon: Medal, tierLabel: "Gold" },
  platinum: { fill: "linear-gradient(135deg, #f2f5f7, #b9c6cf)", icon: "#2b3a42", ring: "#8fa3ad", Icon: Sparkles, tierLabel: "Platinum" },
  diamond: { fill: "linear-gradient(135deg, #bdf3ff, #4fc3e0)", icon: "#0b3a45", ring: "#4fc3e0", Icon: Gem, tierLabel: "Diamond" },
  star: { fill: "", icon: "", ring: "", Icon: Star, tierLabel: "Highlight" },
};

const formatLongDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
};

function AccoladeDetailModal({ accolade, accentColor, onClose }: { accolade: Accolade; accentColor: string; onClose: () => void }) {
  const isStar = accolade.tier === 'star';
  const style = TIER_STYLE[accolade.tier];
  const { Icon } = style;
  // Text colour must stay readable against the modal's own surface (white in
  // light mode, near-black in dark mode) — a raw team/tier colour like a dark
  // navy blue can otherwise vanish against a dark background.
  const readableValue = useReadableTeamColor(isStar ? accentColor : style.ring);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-sm mx-auto max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {style.tierLabel} Accolade{accolade.seasonLabel ? ` · ${accolade.seasonLabel}` : ''}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-full shadow-md mb-4"
            style={isStar ? { backgroundColor: withAlpha(accentColor, 0.15) } : { background: style.fill }}
          >
            {isStar ? (
              <Star className="w-8 h-8" fill={readableValue.body} stroke="none" />
            ) : (
              <Icon className="w-8 h-8" style={{ color: style.icon }} strokeWidth={2} />
            )}
          </div>

          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">{accolade.label}</h3>

          {accolade.value && (
            <div className="text-4xl font-black tabular-nums my-2" style={{ color: readableValue.body }}>
              {accolade.value}
              {accolade.unit && <span className="text-sm font-bold text-slate-400 dark:text-slate-500 ml-1.5">{accolade.unit}</span>}
            </div>
          )}

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-2">
            {accolade.description}
          </p>

          {(accolade.opponent || accolade.date) && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-neutral-800 w-full text-sm text-slate-500 dark:text-slate-400">
              {accolade.opponent && <div>vs {accolade.opponent}</div>}
              {accolade.date && <div>{formatLongDate(accolade.date)}</div>}
            </div>
          )}

          {accolade.gameKey && (
            <a
              href={`/game/${encodeURIComponent(accolade.gameKey)}`}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: accentColor }}
            >
              View Game
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function AccoladeBadges({ accolades, accentColor }: { accolades: Accolade[]; accentColor: string }) {
  const [selected, setSelected] = useState<Accolade | null>(null);
  // Keep the raw accentColor for tinted backgrounds, but use a contrast-safe
  // variant for the text/icon drawn on top of them — a dark team colour like
  // navy blue otherwise disappears against a dark-mode surface.
  const readableAccent = useReadableTeamColor(accentColor);

  if (accolades.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 py-2 mt-1" data-testid="accolade-badges">
      {accolades.map((a, i) => {
        const style = TIER_STYLE[a.tier];
        const title = [a.label, a.detail, a.seasonLabel].filter(Boolean).join(' — ');
        if (a.tier === 'star') {
          return (
            <button
              key={i}
              type="button"
              title={title}
              onClick={() => setSelected(a)}
              className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-transform hover:scale-105"
              style={{ backgroundColor: withAlpha(accentColor, 0.12), color: readableAccent.body }}
            >
              <span
                className="flex items-center justify-center w-5 h-5 rounded-full"
                style={{ backgroundColor: withAlpha(accentColor, 0.2) }}
              >
                <Star className="w-3 h-3" fill={readableAccent.body} stroke="none" />
              </span>
              {a.label}
              {a.seasonLabel && (
                <span className="font-normal opacity-60">· {a.seasonLabel}</span>
              )}
            </button>
          );
        }
        const { Icon } = style;
        return (
          <button
            key={i}
            type="button"
            title={title}
            onClick={() => setSelected(a)}
            className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-neutral-800 border cursor-pointer transition-transform hover:scale-105"
            style={{ borderColor: withAlpha(style.ring, 0.5) }}
          >
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full shadow-sm"
              style={{ background: style.fill }}
            >
              <Icon className="w-3 h-3" style={{ color: style.icon }} strokeWidth={2.5} />
            </span>
            {a.label}
            {a.seasonLabel && (
              <span className="font-normal opacity-60 text-slate-500 dark:text-slate-400">· {a.seasonLabel}</span>
            )}
          </button>
        );
      })}

      {selected && (
        <AccoladeDetailModal accolade={selected} accentColor={accentColor} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
