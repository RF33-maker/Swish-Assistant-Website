import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, ImagePlus, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
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

/** Where a competition sits: its league (the brand above it) and its season. */
type CompetitionPlace = { leagueId: string; leagueName: string; season: string; createdAt: number };
type CompetitionDirectory = Map<string, CompetitionPlace>;

const OTHER_LEAGUE = "other";
let directoryRequest: Promise<CompetitionDirectory> | null = null;

/**
 * Every competition's league and season, keyed by slug. Loaded once and shared
 * by all the studios. A competition with no league of its own takes its parent's.
 */
function loadCompetitionDirectory(): Promise<CompetitionDirectory> {
  if (directoryRequest) return directoryRequest;
  directoryRequest = (async () => {
    const [{ data: leagueRows }, { data: competitionRows }] = await Promise.all([
      supabase.from("leagues").select("id, name"),
      supabase
        .from("competitions")
        .select("league_id, competition_id, parent_league_id, slug, season, created_at")
        .limit(5000),
    ]);
    const leagueName = new Map((leagueRows || []).map((l) => [l.id as string, l.name as string]));
    const byId = new Map((competitionRows || []).map((c) => [c.league_id as string, c]));
    const leagueOf = (id: string, seen = new Set<string>()): string | null => {
      const c = byId.get(id);
      if (!c || seen.has(id)) return null;
      seen.add(id);
      if (c.competition_id && leagueName.has(c.competition_id)) return c.competition_id;
      return c.parent_league_id ? leagueOf(c.parent_league_id, seen) : null;
    };
    const directory: CompetitionDirectory = new Map();
    (competitionRows || []).forEach((c) => {
      if (!c.slug) return;
      const leagueId = leagueOf(c.league_id);
      directory.set(c.slug, {
        leagueId: leagueId ?? OTHER_LEAGUE,
        leagueName: (leagueId && leagueName.get(leagueId)) || "Other competitions",
        season: (c.season || "").trim(),
        createdAt: c.created_at ? new Date(c.created_at).getTime() || 0 : 0,
      });
    });
    return directory;
  })().catch((error) => {
    console.warn("[SwishSocial] Could not group competitions by league:", error);
    directoryRequest = null;
    return new Map();
  });
  return directoryRequest;
}

/** The year a season starts in, for newest-first order ("2025/26", "Season 2025/26", "2026"). */
function seasonYear(season: string): number {
  const match = season.match(/(19|20)\d{2}/);
  if (match) return Number(match[0]);
  const numbered = season.match(/\d+/);
  return numbered ? Number(numbered[0]) : -1;
}

/**
 * League first, then the competition within it grouped by season, newest first,
 * the same way Top Performances narrows its list. The competitions offered are
 * still the studio's own (some studios only offer those with play-by-play).
 */
export function CompetitionField({
  value,
  onChange,
  competitions,
}: {
  value: string;
  onChange: (slug: string) => void;
  competitions: CompetitionOption[];
}) {
  const [directory, setDirectory] = useState<CompetitionDirectory>(new Map());
  useEffect(() => {
    let cancelled = false;
    void loadCompetitionDirectory().then((d) => !cancelled && setDirectory(d));
    return () => {
      cancelled = true;
    };
  }, []);

  const placeOf = (slug: string): CompetitionPlace =>
    directory.get(slug) ?? { leagueId: OTHER_LEAGUE, leagueName: "Other competitions", season: "", createdAt: 0 };

  // Leagues A–Z, "Other" last.
  const leagues = useMemo(() => {
    const names = new Map<string, string>();
    competitions.forEach((c) => {
      const place = directory.get(c.slug);
      names.set(place?.leagueId ?? OTHER_LEAGUE, place?.leagueName ?? "Other competitions");
    });
    return Array.from(names, ([id, name]) => ({ id, name })).sort((a, b) => {
      if ((a.id === OTHER_LEAGUE) !== (b.id === OTHER_LEAGUE)) return a.id === OTHER_LEAGUE ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [competitions, directory]);

  // The league follows the competition picked, until another league is chosen.
  const [chosenLeague, setChosenLeague] = useState<string | null>(null);
  const valueLeague = directory.size ? placeOf(value).leagueId : null;
  const league = chosenLeague ?? valueLeague;
  useEffect(() => {
    setChosenLeague(null);
  }, [value]);

  const seasons = useMemo(() => {
    const groups = new Map<string, CompetitionOption[]>();
    competitions.forEach((c) => {
      const place = placeOf(c.slug);
      if (place.leagueId !== league) return;
      const group = groups.get(place.season) || [];
      group.push(c);
      groups.set(place.season, group);
    });
    return Array.from(groups, ([season, list]) => ({
      season,
      list: list.sort((a, b) => a.name.localeCompare(b.name)),
    })).sort((a, b) => seasonYear(b.season) - seasonYear(a.season) || b.season.localeCompare(a.season));
    // placeOf reads the directory, which is a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitions, directory, league]);

  const known = competitions.some((c) => c.slug === value);
  const inLeague = seasons.some((s) => s.list.some((c) => c.slug === value));

  // Picking a league opens its newest competition, so the card is never left on another league's.
  const chooseLeague = (id: string) => {
    setChosenLeague(id);
    const newest = competitions
      .filter((c) => placeOf(c.slug).leagueId === id)
      .sort((a, b) => {
        const pa = placeOf(a.slug);
        const pb = placeOf(b.slug);
        return seasonYear(pb.season) - seasonYear(pa.season) || pb.createdAt - pa.createdAt;
      })[0];
    if (newest && newest.slug !== value) onChange(newest.slug);
  };

  // Until the leagues are known, the plain list keeps the studio usable.
  if (!directory.size) {
    return (
      <Field label="Competition">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className={FIELD} data-testid="select-competition">
            <SelectValue placeholder="Choose a competition" />
          </SelectTrigger>
          <SelectContent className={SELECT_MENU}>
            {!known && <SelectItem value={value}>{value}</SelectItem>}
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

  return (
    <>
      <Field label="League">
        <Select value={league ?? undefined} onValueChange={chooseLeague}>
          <SelectTrigger className={FIELD} data-testid="select-competition-league">
            <SelectValue placeholder="Choose a league" />
          </SelectTrigger>
          <SelectContent className={SELECT_MENU}>
            {leagues.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Competition">
        <Select value={inLeague ? value : undefined} onValueChange={onChange}>
          <SelectTrigger className={FIELD} data-testid="select-competition">
            <SelectValue placeholder="Choose a competition" />
          </SelectTrigger>
          <SelectContent className={SELECT_MENU}>
            {!known && league === valueLeague && <SelectItem value={value}>{value}</SelectItem>}
            {seasons.map(({ season, list }, i) => (
              <SelectGroup key={season || "none"}>
                {i > 0 && <SelectSeparator />}
                {seasons.length > 1 && <SelectLabel className="text-xs text-[color:var(--ch-muted)]">{season || "No season"}</SelectLabel>}
                {list.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
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

/**
 * "f97316" or "#F97316" -> "#f97316"; anything else -> null. Three-digit shorthand is left out on
 * purpose: every six-digit code passes through three digits while it is being typed.
 */
export function parseHexColour(text: string): string | null {
  const t = text.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(t) ? `#${t.toLowerCase()}` : null;
}

/**
 * One colour, set two ways: the browser's colour picker (with its RGB sliders) or a typed hex code.
 * The two stay in step; a half-typed code is left alone until it is a whole one.
 */
export function ColourHexInput({
  value,
  onChange,
  label,
  testId,
}: {
  value: string;
  onChange: (hex: string) => void;
  /** What the colour is for, read out by screen readers. */
  label: string;
  testId?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = parseHexColour(draft) === null;
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={parseHexColour(value) ?? "#f97316"}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 flex-none cursor-pointer rounded-lg border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] p-0.5"
        aria-label={`${label}: colour picker`}
        data-testid={testId ? `${testId}-picker` : undefined}
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const hex = parseHexColour(e.target.value);
          if (hex) onChange(hex);
        }}
        onBlur={() => setDraft(value)}
        maxLength={7}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        placeholder="#f97316"
        aria-label={`${label}: hex code`}
        aria-invalid={invalid}
        className={`${FIELD} !w-[6.5rem] flex-none font-mono text-[13px] uppercase ${invalid ? "!border-red-500/70" : ""}`}
        data-testid={testId ? `${testId}-hex` : undefined}
      />
    </div>
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
