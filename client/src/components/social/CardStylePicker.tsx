import { useState } from "react";
import { Field } from "@/components/social/studioUi";
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
  const hint = CARD_STYLES.find((s) => s.id === value)?.hint;
  return (
    <Field
      label="Style"
      hint={value === "swish" ? `${hint}. It always uses Swish orange, whatever the competition's colour.` : `${hint}.`}
    >
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
              className={`rounded-lg border bg-[color:var(--ch-surface)] p-1.5 text-center transition ${
                on
                  ? "border-[color:var(--ch-accent)] ring-1 ring-[color:var(--ch-accent)]"
                  : "border-[color:var(--ch-border)] hover:border-[color:var(--ch-border-strong)]"
              }`}
            >
              <span className="block h-12 rounded-md" style={{ background: swatch(s.id, hex) }} />
              <span className={`mt-1 block text-xs font-medium ${on ? "text-[color:var(--ch-text)]" : "text-[color:var(--ch-text-2)]"}`}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}
