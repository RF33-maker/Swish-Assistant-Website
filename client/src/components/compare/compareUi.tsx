import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Link2, Search, X } from "lucide-react";

/**
 * The pieces the league page's player and team comparisons are both built from,
 * so the two read as one tool: the chip rows, the search-and-pick box, the
 * head-to-head header, the stat rows with their bars, and the suggested matchups.
 */

export type CompareCategory = "Traditional" | "Advanced" | "Scoring" | "Misc";
export type CompareView = "season" | "h2h";

export const CATEGORY_OPTIONS: { value: CompareCategory; label: string }[] = [
  { value: "Traditional", label: "Traditional" },
  { value: "Advanced", label: "Advanced" },
  { value: "Scoring", label: "Scoring" },
  { value: "Misc", label: "Misc" },
];

export const VIEW_OPTIONS: { value: CompareView; label: string }[] = [
  { value: "season", label: "Season averages" },
  { value: "h2h", label: "Head-to-head" },
];

// ── the comparison in the page's address ─────────────────────────────────────

export function readCompareParam(key: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
}

/** Writes (or, for null, removes) query parameters without adding a step to the browser's history. */
export function writeCompareParams(params: Record<string, string | null>) {
  try {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // a link that carries the comparison is a convenience only
  }
}

/** Copies the page's address, which carries the comparison on show. */
export function CopyLinkButton({ testId }: { testId?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      // Opened from a player's or a game's page, the address still names that page; link to the league itself.
      const url = new URL(window.location.href);
      url.pathname = url.pathname.replace(/^\/league\/([^/]+).*$/, "/competition/$1");
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no clipboard access: the address bar still has the link
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      data-testid={testId}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--ch-border-strong)] px-2.5 text-xs font-medium text-[color:var(--ch-text-2)] transition hover:bg-[color:var(--ch-surface-3)] hover:text-[color:var(--ch-text)]"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}

// ── controls ─────────────────────────────────────────────────────────────────

export function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
  testIdPrefix,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testIdPrefix?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          data-active={o.value === value}
          aria-pressed={o.value === value}
          data-testid={testIdPrefix ? `${testIdPrefix}-${o.value.toLowerCase()}` : undefined}
          className="ch-chip inline-flex h-8 items-center px-3 text-xs"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type PickerOption = { key: string; title: string; sub?: string };

/**
 * A search box that lists matches underneath. The list opens as soon as the box is
 * focused, so there is something to pick before a letter is typed.
 */
export function ComparePicker({
  label,
  search,
  onSearch,
  options,
  onSelect,
  onClear,
  placeholder,
  testId,
}: {
  label: string;
  search: string;
  onSearch: (text: string) => void;
  /** Already filtered by `search`, best matches first. */
  options: PickerOption[];
  onSelect: (key: string) => void;
  onClear: () => void;
  placeholder: string;
  /** e.g. "player1": gives input-player1-search and option-player1-0. */
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ch-text)]">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ch-muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            onSearch(e.target.value);
            setOpen(true);
            if (!e.target.value) onClear();
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="ch-input h-10 w-full pl-9 pr-9 text-sm"
          data-testid={`input-${testId}-search`}
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              onSearch("");
              onClear();
            }}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[color:var(--ch-muted)] hover:bg-[color:var(--ch-surface-3)] hover:text-[color:var(--ch-text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && options.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] shadow-xl">
          {options.map((o, idx) => (
            <button
              key={`${o.key}-${idx}`}
              type="button"
              onClick={() => {
                onSelect(o.key);
                setOpen(false);
              }}
              className="block w-full border-b border-[color:var(--ch-border)] px-3 py-2 text-left last:border-b-0 hover:bg-[color:var(--ch-surface-3)]"
              data-testid={`option-${testId}-${idx}`}
            >
              <span className="block truncate text-sm font-medium text-[color:var(--ch-text)]">{o.title}</span>
              {o.sub && <span className="block truncate text-xs text-[color:var(--ch-text-2)]">{o.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type Suggestion = { label: string; detail: string; first: string; second: string };

/** One-tap matchups, shown while nothing has been picked. */
export function Suggestions({
  intro,
  suggestions,
  onPick,
  loading,
}: {
  intro: string;
  suggestions: Suggestion[];
  onPick: (s: Suggestion) => void;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[color:var(--ch-border-strong)] p-4 md:p-6" data-testid="compare-suggestions">
      <p className="text-center text-sm text-[color:var(--ch-text-2)]">{loading ? "Loading…" : intro}</p>
      {suggestions.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {suggestions.map((s, idx) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onPick(s)}
              data-testid={`compare-suggestion-${idx}`}
              className="ch-tile ch-hover p-3 text-left"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ch-muted)]">{s.label}</span>
              <span className="mt-1 block text-sm font-semibold text-[color:var(--ch-text)]">{s.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── results ──────────────────────────────────────────────────────────────────

/** "Birmingham City University Senior Men" -> "Birmingham City University", as elsewhere on the site. */
export function shortTeamName(name: string | null | undefined): string {
  return (name || "").replace(/\s+Senior\s+(Men|Women)\b/gi, "").replace(/\s+I\s*$/, "").replace(/\s+/g, " ").trim();
}

export type CompareSide = {
  name: string;
  /** A player's club. */
  sub?: string;
  games: number;
  /** A headshot or a crest; initials are shown when there is none. */
  media?: ReactNode;
};

function SideBadge({ side, accent }: { side: CompareSide; accent?: string }) {
  const initials = side.name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <div
        className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full bg-[color:var(--ch-surface-3)] ring-2 md:h-24 md:w-24"
        style={{ ["--tw-ring-color" as string]: accent || "var(--ch-border-strong)" }}
      >
        {side.media ?? <span className="text-lg font-bold text-[color:var(--ch-text-2)] md:text-2xl">{initials || "?"}</span>}
      </div>
      <div className="min-w-0 max-w-full">
        <h3 className="text-sm font-bold leading-tight text-[color:var(--ch-text)] md:text-lg">{side.name}</h3>
        {side.sub && <p className="mt-0.5 truncate text-xs text-[color:var(--ch-text-2)] md:text-sm">{side.sub}</p>}
        <p className="ch-num mt-0.5 text-[11px] text-[color:var(--ch-muted)]">
          {side.games} game{side.games === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}

/** Averages over only a handful of games swing a lot; say so rather than let the numbers speak alone. */
function sampleNote(left: CompareSide, right: CompareSide): string | null {
  const few = [left, right].filter((s) => s.games < 3);
  if (few.length === 2) return "Both have played fewer than 3 games, so these averages can change quickly.";
  if (few.length === 1) return `${few[0].name} has played only ${few[0].games} game${few[0].games === 1 ? "" : "s"}, so those averages can change quickly.`;
  const [lo, hi] = left.games <= right.games ? [left, right] : [right, left];
  return hi.games >= lo.games * 2 ? `${hi.name} has played ${hi.games} games to ${lo.name}'s ${lo.games}.` : null;
}

export function CompareHeader({ left, right, accent, caption }: { left: CompareSide; right: CompareSide; accent?: string; caption?: string }) {
  const note = sampleNote(left, right);
  return (
    <div className="mb-5 md:mb-7">
      {caption && <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[color:var(--ch-muted)]">{caption}</p>}
      <div className="flex items-start justify-between gap-2 md:gap-6">
        <SideBadge side={left} accent={accent} />
        <span className="mt-5 flex-none text-sm font-black tracking-widest text-[color:var(--ch-muted)] md:mt-9 md:text-xl">VS</span>
        <SideBadge side={right} />
      </div>
      {note && (
        <p className="mx-auto mt-3 max-w-xl rounded-lg bg-[color:var(--ch-surface-3)] px-3 py-1.5 text-center text-xs text-[color:var(--ch-text-2)]" data-testid="compare-sample-note">
          {note}
        </p>
      )}
    </div>
  );
}

/** What the abbreviations in the stat rows stand for. */
const STAT_NAMES: Record<string, string> = {
  PPG: "Points",
  RPG: "Rebounds",
  ORPG: "Offensive rebounds",
  DRPG: "Defensive rebounds",
  APG: "Assists",
  SPG: "Steals",
  BPG: "Blocks",
  TPG: "Turnovers",
  FPG: "Fouls",
  MPG: "Minutes",
  "+/-": "Plus/minus",
  "FG%": "Field goals",
  "2P%": "Two-pointers",
  "3P%": "Three-pointers",
  "FT%": "Free throws",
  PITP: "Points in the paint",
  "FB PTS": "Fast-break points",
  "2ND CH": "Second-chance points",
  "eFG%": "Effective field goal %",
  "TS%": "True shooting %",
  "3PT Rate": "Share of shots from three",
  "AST%": "Assist rate",
  "AST/TO": "Assists per turnover",
  "OREB%": "Offensive rebound rate",
  "DREB%": "Defensive rebound rate",
  "REB%": "Rebound rate",
  "TOV%": "Turnover rate",
  "USG%": "Usage rate",
  PIE: "Player impact estimate",
  PACE: "Possessions per game",
  "OFF RTG": "Points scored per 100",
  "DEF RTG": "Points allowed per 100",
  "NET RTG": "Net points per 100",
  "%PTS 2PT": "Points from twos",
  "%PTS 3PT": "Points from threes",
  "%PTS FT": "Points from free throws",
  "%PTS Midrange": "Points from mid-range",
  "%PTS PITP": "Points in the paint",
  "%PTS FB": "Points on the fast break",
  "%PTS 2nd Ch": "Second-chance points",
  "%PTS Off TO": "Points off turnovers",
};

export type CompareRowData = { label: string; value1: string | number; value2: string | number; lowerIsBetter?: boolean };

export type ScoredRow = CompareRowData & { n1: number; n2: number; lead: 0 | 1 | 2 };

/** Works out who is better in each stat, and drops the stats neither side has a number for. */
export function scoreRows(rows: CompareRowData[]): ScoredRow[] {
  return rows
    .map((row) => {
      const n1 = parseFloat(String(row.value1));
      const n2 = parseFloat(String(row.value2));
      const better1 = row.lowerIsBetter ? n1 < n2 : n1 > n2;
      const better2 = row.lowerIsBetter ? n2 < n1 : n2 > n1;
      return { ...row, n1, n2, lead: (better1 ? 1 : better2 ? 2 : 0) as 0 | 1 | 2 };
    })
    // A stat neither side has a number for (a feed that doesn't record it) says nothing.
    .filter((row) => Number.isFinite(row.n1) && Number.isFinite(row.n2) && !(row.n1 === 0 && row.n2 === 0));
}

function Bar({ share, lit, accent, toRight }: { share: number; lit: boolean; accent: string; toRight?: boolean }) {
  return (
    <span className={`flex h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--ch-surface-3)] ${toRight ? "" : "justify-end"}`}>
      <span
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(3, Math.min(100, share * 100))}%`, backgroundColor: lit ? accent : "var(--ch-border-strong)" }}
      />
    </span>
  );
}

/**
 * The stat rows: each side's number, with a bar showing how the two compare. The
 * side that is better in a stat has its bar in the league's colour and its number in bold.
 */
export function CompareRows({
  rows,
  leftName,
  rightName,
  accent,
}: {
  rows: CompareRowData[];
  leftName: string;
  rightName: string;
  accent?: string;
}) {
  const colour = accent || "var(--ch-accent)";
  const scored = scoreRows(rows);
  if (scored.length === 0) {
    return <p className="py-8 text-center text-sm text-[color:var(--ch-text-2)]">These stats aren't recorded for this competition. Try another category.</p>;
  }
  const leads1 = scored.filter((r) => r.lead === 1).length;
  const leads2 = scored.filter((r) => r.lead === 2).length;
  const level = scored.length - leads1 - leads2;
  const hasLowerIsBetter = scored.some((r) => r.lowerIsBetter);

  return (
    <div>
      <div className="mb-4 rounded-xl bg-[color:var(--ch-surface-3)] p-3" data-testid="compare-summary">
        <div className="flex items-baseline justify-between gap-3 text-xs text-[color:var(--ch-text-2)]">
          <span className="min-w-0 truncate">
            <strong className="ch-num text-base text-[color:var(--ch-text)]">{leads1}</strong> {leftName}
          </span>
          <span className="flex-none text-[10px] uppercase tracking-wider text-[color:var(--ch-muted)]">
            leads of {scored.length}
            {level > 0 ? ` · ${level} level` : ""}
          </span>
          <span className="min-w-0 truncate text-right">
            {rightName} <strong className="ch-num text-base text-[color:var(--ch-text)]">{leads2}</strong>
          </span>
        </div>
        <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
          {leads1 > 0 && <span style={{ flex: leads1, backgroundColor: colour }} />}
          {level > 0 && <span className="bg-[color:var(--ch-border)]" style={{ flex: level }} />}
          {leads2 > 0 && <span className="bg-[color:var(--ch-text-2)]" style={{ flex: leads2 }} />}
        </div>
      </div>

      <ul className="divide-y divide-[color:var(--ch-border)]">
        {scored.map((row) => {
          const top = Math.max(Math.abs(row.n1), Math.abs(row.n2)) || 1;
          const full = STAT_NAMES[row.label];
          return (
            <li key={row.label} className="grid grid-cols-[3.25rem_minmax(0,1fr)_5.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 py-2.5 md:grid-cols-[4rem_minmax(0,1fr)_9rem_minmax(0,1fr)_4rem] md:gap-3">
              <span className={`ch-num text-right text-sm md:text-base ${row.lead === 1 ? "font-bold text-[color:var(--ch-text)]" : "text-[color:var(--ch-text-2)]"}`}>
                {row.value1}
              </span>
              <Bar share={Math.abs(row.n1) / top} lit={row.lead === 1} accent={colour} />
              <span className="text-center leading-tight" title={full}>
                <span className="block text-xs font-semibold text-[color:var(--ch-text)]">{row.label}</span>
                {full && <span className="hidden text-[10px] text-[color:var(--ch-muted)] md:block">{full}</span>}
              </span>
              <Bar share={Math.abs(row.n2) / top} lit={row.lead === 2} accent={colour} toRight />
              <span className={`ch-num text-left text-sm md:text-base ${row.lead === 2 ? "font-bold text-[color:var(--ch-text)]" : "text-[color:var(--ch-text-2)]"}`}>
                {row.value2}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-center text-xs text-[color:var(--ch-muted)]">
        The coloured bar and bold number mark the better side in each stat.
        {hasLowerIsBetter ? " In some stats, such as turnovers and fouls, fewer is better." : ""}
      </p>
    </div>
  );
}

export function CompareLoading() {
  return (
    <div className="py-10 text-center">
      <div className="inline-block h-7 w-7 animate-spin rounded-full border-[3px] border-[color:var(--ch-border-strong)] border-t-[color:var(--ch-text)]" />
      <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">Loading comparison…</p>
    </div>
  );
}

export function CompareError({ message, onRetry, testId }: { message: string; onRetry?: () => void; testId?: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--ch-border-strong)] px-4 py-8 text-center" data-testid={testId}>
      <p className="text-sm font-semibold text-[color:var(--ch-loss)]">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="ch-btn ch-btn-ghost mt-3 justify-center" data-testid={testId ? `${testId}-retry` : undefined}>
          Try again
        </button>
      )}
    </div>
  );
}

export function CompareEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl bg-[color:var(--ch-surface-3)] px-4 py-10 text-center">
      <p className="text-sm font-semibold text-[color:var(--ch-text)]">{title}</p>
      {children && <p className="mt-1 text-sm text-[color:var(--ch-text-2)]">{children}</p>}
    </div>
  );
}
