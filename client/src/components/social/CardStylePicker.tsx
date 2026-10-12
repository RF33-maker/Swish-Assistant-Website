import { useState } from "react";
import { CARD_STYLES, type CardStyle } from "@/lib/cardStyle";

// One choice across Swish Social, so the leaders cards and Team of the Week come out as a set.
const STYLE_KEY = "social-card-style";

function readStoredStyle(): CardStyle {
  try {
    const stored = localStorage.getItem(STYLE_KEY);
    return CARD_STYLES.find((s) => s.id === stored)?.id ?? "league";
  } catch {
    return "league";
  }
}

/** The card style last chosen in this browser, and a setter that remembers the next one. */
export function useCardStyle(): [CardStyle, (style: CardStyle) => void] {
  const [style, setStyle] = useState<CardStyle>(readStoredStyle);
  const choose = (next: CardStyle) => {
    setStyle(next);
    try {
      localStorage.setItem(STYLE_KEY, next);
    } catch {
      // remembering the style is a convenience only
    }
  };
  return [style, choose];
}

/** A thumbnail of each look, in the competition's colour where the look uses it. */
function swatch(style: CardStyle, hex: string): string {
  if (style === "swish") {
    return "radial-gradient(120% 90% at 100% 0%, rgba(249,115,22,0.8) 0%, rgba(249,115,22,0.16) 45%, transparent 70%), #111317";
  }
  return style === "court" ? `linear-gradient(180deg, #060505 18%, ${hex} 100%)` : `linear-gradient(180deg, ${hex} 0%, #0a0606 100%)`;
}

type Props = {
  value: CardStyle;
  onChange: (style: CardStyle) => void;
  /** The competition's card colour, for the thumbnails. */
  primaryHex: string;
};

export default function CardStylePicker({ value, onChange, primaryHex }: Props) {
  const hex = /^#[0-9a-f]{6}$/i.test(primaryHex) ? primaryHex : "#f97316";
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Style</span>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Card style">
        {CARD_STYLES.map((s) => {
          const on = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={s.hint}
              onClick={() => onChange(s.id)}
              data-testid={`style-${s.id}`}
              className={`rounded-lg border p-1.5 text-center transition ${
                on
                  ? "border-orange-500 ring-2 ring-orange-500/40"
                  : "border-orange-200 hover:border-orange-400 dark:border-orange-800 dark:hover:border-orange-600"
              }`}
            >
              <span className="block h-12 rounded-md" style={{ background: swatch(s.id, hex) }} />
              <span className={`mt-1 block text-xs font-medium ${on ? "text-orange-700 dark:text-orange-400" : "text-gray-700 dark:text-gray-300"}`}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{CARD_STYLES.find((s) => s.id === value)?.hint}.</p>
      {value === "swish" && (
        <p className="text-xs text-gray-500 dark:text-gray-400">The Swish style always uses Swish orange, whatever the competition's colour.</p>
      )}
    </div>
  );
}
