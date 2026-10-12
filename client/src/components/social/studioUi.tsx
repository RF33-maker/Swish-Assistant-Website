import type { ReactNode } from "react";
import { Download, ImagePlus, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BTN_GHOST, BTN_PRIMARY, FIELD, Field, HINT, SELECT_MENU, TALL } from "@/components/layout/proUi";

/**
 * Shared pieces for the Swish Social studios, so every studio reads as one
 * tool. The general building blocks (panel, field, buttons) come from
 * layout/proUi and are passed on from here.
 */
export { BTN_GHOST, BTN_PRIMARY, ERROR, FIELD, Field, HINT, Panel, SELECT_MENU, TALL } from "@/components/layout/proUi";

/** A labelled slider with its current value on the right. */
export function RangeField({
  label,
  display,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  testId,
}: {
  label: ReactNode;
  display: ReactNode;
  hint?: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label className="block space-y-2 text-xs font-medium text-[color:var(--ch-text-2)]">
      <span className="flex justify-between gap-2">
        {label}
        <span className="ch-num text-[color:var(--ch-muted)]">{display}</span>
      </span>
      <Slider
        className="ch-slider"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        disabled={disabled}
        data-testid={testId}
      />
      {hint && <span className={`block font-normal ${HINT}`}>{hint}</span>}
    </label>
  );
}

/** A tick-box with a line of explanation, as its own tile. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  testId,
  bare = false,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  testId?: string;
  bare?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${bare ? "" : "ch-tile p-3"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none accent-[color:var(--ch-accent)]"
        data-testid={testId}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-[color:var(--ch-text)]">{label}</span>
        {hint && <span className={`mt-0.5 block ${HINT}`}>{hint}</span>}
      </span>
    </label>
  );
}

export type CompetitionOption = { slug: string; name: string };

/** The competition a studio was last left on. */
export function readStoredCompetition(key: string): string | null {
  try {
    // The lineup studio once wrote its slug JSON-quoted into the key the other studios read.
    return localStorage.getItem(key)?.replace(/^"+|"+$/g, "") || null;
  } catch {
    return null;
  }
}

export function rememberCompetition(key: string, slug: string) {
  try {
    localStorage.setItem(key, slug);
  } catch {
    // remembering the competition is a convenience only
  }
}

export function CompetitionField({
  value,
  onChange,
  competitions,
}: {
  value: string;
  onChange: (slug: string) => void;
  competitions: CompetitionOption[];
}) {
  return (
    <Field label="Competition">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={FIELD} data-testid="select-competition">
          <SelectValue placeholder="Choose a competition" />
        </SelectTrigger>
        <SelectContent className={SELECT_MENU}>
          {!competitions.some((c) => c.slug === value) && <SelectItem value={value}>{value}</SelectItem>}
          {competitions.map((c) => (
            <SelectItem key={c.slug} value={c.slug}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** The card's colour: taken from the league logo unless the admin picks their own. */
export function ColourField({
  value,
  custom,
  onChange,
  onReset,
}: {
  value: string;
  custom: boolean;
  onChange: (hex: string) => void;
  onReset: () => void;
}) {
  return (
    <Field label="Card colour">
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#f97316"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 flex-none cursor-pointer rounded-lg border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] p-0.5"
          aria-label="Card colour"
        />
        <span className={HINT}>{custom ? "Custom (saved for this competition)" : "From the league logo"}</span>
        {custom && (
          <button type="button" className="text-xs font-medium text-[color:var(--ch-accent)] hover:underline" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
    </Field>
  );
}

/** Where a finished card is shown: the canvas (or image), a spinner while it draws, or why there is nothing. */
export function Stage({
  children,
  busy = false,
  empty,
  className = "",
}: {
  children: ReactNode;
  busy?: boolean;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative mx-auto w-full max-w-[640px] overflow-hidden rounded-xl bg-[color:var(--ch-surface-3)] ${className}`}>
      {children}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </div>
      )}
      {empty && !busy && <p className="px-4 py-12 text-center text-sm text-[color:var(--ch-text-2)]">{empty}</p>}
    </div>
  );
}

/**
 * Getting the finished card out. Phones that can share a file get "Save to
 * Photos" first (iOS only opens the share sheet straight from a tap, so the
 * file is made ahead of time); everything else downloads the PNG.
 */
export function SaveActions({
  canShare,
  onSave,
  saveDisabled,
  onDownload,
  downloadDisabled,
  downloading = false,
  downloadTestId = "button-download-file",
  aside,
  notice,
}: {
  canShare: boolean;
  onSave: () => void;
  saveDisabled: boolean;
  onDownload: () => void;
  downloadDisabled: boolean;
  downloading?: boolean;
  downloadTestId?: string;
  /** Sits beside the main button, e.g. a regenerate control. */
  aside?: ReactNode;
  notice?: ReactNode;
}) {
  const downloadIcon = downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {canShare ? (
          <button type="button" onClick={onSave} disabled={saveDisabled} className={`${BTN_PRIMARY} ${TALL} flex-1`} data-testid="button-save-to-photos">
            <ImagePlus className="h-4 w-4" />
            Save to Photos
          </button>
        ) : (
          <button type="button" onClick={onDownload} disabled={downloadDisabled} className={`${BTN_PRIMARY} ${TALL} flex-1`} data-testid={downloadTestId}>
            {downloadIcon}
            Download PNG
          </button>
        )}
        {aside}
      </div>
      {canShare && (
        <>
          <p className={`text-center ${HINT}`}>Tap Save Image in the menu that opens.</p>
          <button type="button" onClick={onDownload} disabled={downloadDisabled} className={`${BTN_GHOST} ${TALL} w-full`} data-testid={downloadTestId}>
            {downloadIcon}
            Download file
          </button>
        </>
      )}
      {notice}
    </div>
  );
}
