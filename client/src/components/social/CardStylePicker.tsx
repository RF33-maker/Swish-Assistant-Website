import { useEffect, useState } from "react";
import { Field } from "@/components/social/studioUi";
import { availableCardStyles, CARD_STYLES, usesLeagueColour, type CardStyle } from "@/lib/cardStyle";

// One choice across Swish Social, so the leaders cards and Team of the Week come out as a set.
const STYLE_KEY = "social-card-style";
const STYLE_EVENT = "social-card-style-change";

function readStoredStyle(): CardStyle {
  try {
    const stored = localStorage.getItem(STYLE_KEY);
    // A seasonal look that has gone out of season falls back to the default.
    return availableCardStyles().find((s) => s.id === stored)?.id ?? "league";
  } catch {
    return "league";
  }
}

/** Sets the card style for every studio on the page at once, and remembers it. */
export function setSharedCardStyle(next: CardStyle) {
  try {
    localStorage.setItem(STYLE_KEY, next);
  } catch {
    // remembering the style is a convenience only
  }
  window.dispatchEvent(new CustomEvent<CardStyle>(STYLE_EVENT, { detail: next }));
}

/** The card style last chosen in this browser, and a setter that remembers the next one. */
export function useCardStyle(): [CardStyle, (style: CardStyle) => void] {
  const [style, setStyle] = useState<CardStyle>(readStoredStyle);
  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<CardStyle>).detail;
      if (CARD_STYLES.some((s) => s.id === next)) setStyle(next);
    };
    window.addEventListener(STYLE_EVENT, onChange);
    return () => window.removeEventListener(STYLE_EVENT, onChange);
  }, []);
  return [style, setSharedCardStyle];
}

/** A thumbnail of each look, in the competition's colour where the look uses it. */
function swatch(style: CardStyle, hex: string): string {
  if (style === "halloween") {
    return [
      "radial-gradient(circle at 86% 22%, #fde2b0 0 10%, rgba(253,186,116,0.35) 11%, transparent 34%)",
      "radial-gradient(120% 70% at 0% 100%, rgba(109,40,217,0.55), transparent 70%)",
      "linear-gradient(180deg, #1d1033 0%, #060409 100%)",
    ].join(", ");
  }
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
  const styles = availableCardStyles();
  const hint = CARD_STYLES.find((s) => s.id === value)?.hint;
  const ownColours =
    value === "swish"
      ? "It always uses Swish orange, whatever the competition's colour."
      : value === "halloween"
        ? "It brings its own colours, whatever the competition's colour."
        : "";
  return (
    <Field label="Style" hint={usesLeagueColour(value) ? `${hint}.` : `${hint}. ${ownColours}`}>
      <div className={`grid gap-2 ${styles.length > 3 ? "grid-cols-2" : "grid-cols-3"}`} role="radiogroup" aria-label="Card style">
        {styles.map((s) => {
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
                {s.id === "halloween" ? "🎃 " : ""}
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}
