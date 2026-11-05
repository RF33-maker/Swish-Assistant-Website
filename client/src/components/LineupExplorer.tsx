import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusGate } from "@/components/PlusGate";
import { authHeaders } from "@/lib/billingApi";
import { usePlusAccess } from "@/lib/plus";
import type { ComboSize, LineupCombo, LineupExploreResponse, LineupOffCourt, LineupPlayer } from "@/types/lineups";

/**
 * Swish+: every five-man unit, three-man group and pair a team has used, sortable, with the four
 * factors for and against, and each player's numbers on and off the floor. Sits under the free
 * "Best lineups" panel on team pages.
 */

const SIZES: { key: ComboSize; label: string; defaultMin: number }[] = [
  { key: 5, label: "Fives", defaultMin: 8 },
  { key: 3, label: "Threes", defaultMin: 20 },
  { key: 2, label: "Pairs", defaultMin: 40 },
  { key: 1, label: "On/off", defaultMin: 40 },
];
const MIN_OPTIONS = [4, 8, 12, 20, 40, 80];
const PAGE = 25;

type SortKey = "minutes" | "games" | "plusMinus" | "net" | "ortg" | "drtg" | "efg" | "tov" | "oreb" | "ftr" | "offNet" | "swing";
type Side = "for" | "against";

type Column = { key: SortKey; label: string; title: string; lowerIsBetter?: (side: Side) => boolean; value: (u: LineupCombo, side: Side) => number | null; format: (v: number | null) => string };

const signed = (v: number | null, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`);
const fixed = (v: number | null, digits = 1) => (v == null ? "—" : v.toFixed(digits));

const COLUMNS: Column[] = [
  { key: "minutes", label: "Min", title: "Minutes together", value: (u) => u.minutes, format: (v) => fixed(v) },
  { key: "games", label: "GP", title: "Games played together", value: (u) => u.games, format: (v) => fixed(v, 0) },
  { key: "plusMinus", label: "+/-", title: "Points scored minus allowed", value: (u) => u.plusMinus, format: (v) => signed(v, 0) },
  { key: "net", label: "Net", title: "Net rating: points scored minus allowed per 100 possessions", value: (u) => u.net, format: (v) => signed(v) },
  { key: "ortg", label: "Off", title: "Offensive rating: points scored per 100 possessions", value: (u) => u.ortg, format: (v) => fixed(v) },
  { key: "drtg", label: "Def", title: "Defensive rating: points allowed per 100 possessions", lowerIsBetter: () => true, value: (u) => u.drtg, format: (v) => fixed(v) },
  { key: "efg", label: "eFG%", title: "Effective field goal %: threes count 1.5 times", lowerIsBetter: (s) => s === "against", value: (u, s) => (s === "for" ? u.efg : u.oppEfg), format: (v) => fixed(v) },
  { key: "tov", label: "TOV%", title: "Turnovers per 100 plays", lowerIsBetter: (s) => s === "for", value: (u, s) => (s === "for" ? u.tovPct : u.oppTovPct), format: (v) => fixed(v) },
  { key: "oreb", label: "OREB%", title: "Share of missed shots rebounded by the attacking team", lowerIsBetter: (s) => s === "against", value: (u, s) => (s === "for" ? u.orebPct : u.oppOrebPct), format: (v) => fixed(v) },
  { key: "ftr", label: "FT/FGA", title: "Free throws made per field goal attempt (x100)", lowerIsBetter: (s) => s === "against", value: (u, s) => (s === "for" ? u.ftRate : u.oppFtRate), format: (v) => fixed(v) },
];

/** On/off view: the factor columns show the value on the floor, with the change from off beneath. */
type Factor = { key: SortKey; label: string; title: string; lowerIsBetter: (side: Side) => boolean; on: (u: LineupCombo, side: Side) => number | null; off: (o: LineupOffCourt, side: Side) => number | null };
const FACTORS: Factor[] = [
  { key: "efg", label: "eFG%", title: "Effective field goal %, with them on the floor", lowerIsBetter: (s) => s === "against", on: (u, s) => (s === "for" ? u.efg : u.oppEfg), off: (o, s) => (s === "for" ? o.efg : o.oppEfg) },
  { key: "tov", label: "TOV%", title: "Turnovers per 100 plays, with them on the floor", lowerIsBetter: (s) => s === "for", on: (u, s) => (s === "for" ? u.tovPct : u.oppTovPct), off: (o, s) => (s === "for" ? o.tovPct : o.oppTovPct) },
  { key: "oreb", label: "OREB%", title: "Offensive rebound %, with them on the floor", lowerIsBetter: (s) => s === "against", on: (u, s) => (s === "for" ? u.orebPct : u.oppOrebPct), off: (o, s) => (s === "for" ? o.orebPct : o.oppOrebPct) },
  { key: "ftr", label: "FT/FGA", title: "Free throws made per 100 shots, with them on the floor", lowerIsBetter: (s) => s === "against", on: (u, s) => (s === "for" ? u.ftRate : u.oppFtRate), off: (o, s) => (s === "for" ? o.ftRate : o.oppFtRate) },
];
const swing = (u: LineupCombo) => (u.net != null && u.off?.net != null ? u.net - u.off.net : null);
const onOffValue = (u: LineupCombo, key: SortKey, side: Side): number | null => {
  if (key === "minutes") return u.minutes;
  if (key === "net") return u.net;
  if (key === "offNet") return u.off?.net ?? null;
  if (key === "swing") return swing(u);
  return FACTORS.find((f) => f.key === key)?.on(u, side) ?? null;
};

const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
};

type Props = { slug: string; teamName: string; accentColor: string };

export function LineupExplorer(props: Props) {
  const { visible } = usePlusAccess();
  if (!visible) return null;
  return (
    <section className="mt-10 border-t border-[color:var(--ch-border)] pt-6" aria-label="Every lineup" data-testid="lineup-explorer">
      <div className="mb-4">
        <h2 className="ch-section-title flex items-center gap-2">
          Every lineup
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)]">Swish+</span>
        </h2>
        <p className="mt-1.5 text-xs text-[color:var(--ch-text-2)] md:text-sm">
          Every five-man unit, three-man group and pair this team has used, with how they score, defend, shoot, rebound and look after the ball, and how the team plays with each player on the floor and off it.
        </p>
      </div>
      <PlusGate what="Every lineup, three-man group and pair" detail="Sort every combination this team has used by net rating, minutes or the four factors, for and against, and see each player's on/off four factors." height={340}>
        <ExplorerBody {...props} />
      </PlusGate>
    </section>
  );
}

function ExplorerBody({ slug, teamName, accentColor }: Props) {
  const [size, setSize] = useState<ComboSize>(5);
  const [minMinutes, setMinMinutes] = useState(8);
  const [withKey, setWithKey] = useState("any");
  const [side, setSide] = useState<Side>("for");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "net", desc: true });
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, isError } = useQuery<LineupExploreResponse | null>({
    queryKey: ["lineup-explore", slug, teamName, size, minMinutes],
    enabled: !!slug && !!teamName,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const params = new URLSearchParams({ team_name: teamName, size: String(size), minMinutes: String(minMinutes) });
      const res = await fetch(`/api/league/${encodeURIComponent(slug)}/lineups/explore?${params}`, { headers: await authHeaders() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as LineupExploreResponse;
    },
  });

  const players = useMemo(() => new Map((data?.players ?? []).map((p) => [p.key, p])), [data]);

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    const value = (u: LineupCombo) => (size === 1 || !col ? onOffValue(u, sort.key, side) : col.value(u, side));
    const list = (data?.units ?? []).filter((u) => size === 1 || withKey === "any" || u.keys.includes(withKey));
    return list.slice().sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (sort.desc ? vb - va : va - vb) || (b.minutes ?? 0) - (a.minutes ?? 0);
    });
  }, [data, withKey, sort, side, size]);

  const chooseSize = (s: ComboSize) => {
    setSize(s);
    setMinMinutes(SIZES.find((x) => x.key === s)!.defaultMin);
    setShowAll(false);
    if (s === 1) setSort({ key: "swing", desc: true });
    else if (sort.key === "offNet" || sort.key === "swing") setSort({ key: "net", desc: true });
  };
  const chooseSort = (c: { key: SortKey; lowerIsBetter?: (side: Side) => boolean }) => {
    const betterLow = c.lowerIsBetter?.(side) ?? false;
    setSort((cur) => (cur.key === c.key ? { key: c.key, desc: !cur.desc } : { key: c.key, desc: !betterLow }));
  };

  const segment = <T extends string | number>(items: { key: T; label: string }[], value: T, onPick: (v: T) => void, label: string) => (
    <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={String(it.key)}
          type="button"
          onClick={() => onPick(it.key)}
          aria-pressed={value === it.key}
          className={`px-3 py-1.5 text-xs font-medium transition-colors md:text-sm ${
            value === it.key ? "text-white" : "text-slate-600 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-neutral-800"
          }`}
          style={value === it.key ? { backgroundColor: accentColor } : undefined}
        >
          {it.label}
        </button>
      ))}
    </div>
  );

  const rosterOptions: LineupPlayer[] = data?.players ?? [];
  const shown = showAll ? rows : rows.slice(0, PAGE);
  const sizeWord = size === 5 ? "unit" : size === 3 ? "group" : size === 2 ? "pair" : "player";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {segment(SIZES, size, chooseSize, "Lineup size")}
        {size !== 1 && <Select value={withKey} onValueChange={(v) => { setWithKey(v); setShowAll(false); }}>
          <SelectTrigger className="h-8 w-auto gap-2 border-gray-200 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white md:text-sm" aria-label="Only lineups with this player">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="dark:border-neutral-700 dark:bg-neutral-800">
            <SelectItem value="any">With anyone</SelectItem>
            {rosterOptions.map((p) => (
              <SelectItem key={p.key} value={p.key}>With {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>}
        <Select value={String(minMinutes)} onValueChange={(v) => { setMinMinutes(Number(v)); setShowAll(false); }}>
          <SelectTrigger className="h-8 w-auto gap-2 border-gray-200 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white md:text-sm" aria-label="Minimum minutes together">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="dark:border-neutral-700 dark:bg-neutral-800">
            {MIN_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>{size === 1 ? `Min. ${n} minutes on` : `Min. ${n} minutes together`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {segment([{ key: "for" as Side, label: "For" }, { key: "against" as Side, label: "Against" }], side, (s) => setSide(s), "Four factors for or against")}
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: accentColor }} /></div>
      ) : isError || !data ? (
        <p className="py-8 text-center text-sm text-[color:var(--ch-text-2)]">{isError ? "Couldn't load lineups right now." : "Lineup data isn't available for this competition."}</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-[color:var(--ch-text-2)]">
          {data.coverage.games === 0 ? "No lineup data has been recorded for this team yet." : size === 1 ? `No player has played ${minMinutes}+ minutes yet. Try a lower minimum.` : `No ${sizeWord} has played ${minMinutes}+ minutes together yet. Try a lower minimum.`}
        </p>
      ) : size === 1 ? (
        <OnOffTable rows={showAll ? rows : rows.slice(0, PAGE)} total={rows.length} showAll={showAll} onToggle={() => setShowAll((s) => !s)} players={players} side={side} sort={sort} onSort={chooseSort} accentColor={accentColor} coverage={data.coverage} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm" data-testid="lineup-explorer-table">
              <thead>
                <tr className="border-b border-[color:var(--ch-border)] text-[11px] uppercase tracking-wide text-[color:var(--ch-muted)]">
                  <th className="py-2 pr-3 text-left font-semibold">{size === 5 ? "Lineup" : size === 3 ? "Group" : "Pair"}</th>
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key;
                    const four = ["efg", "tov", "oreb", "ftr"].includes(c.key);
                    return (
                      <th key={c.key} className="px-1.5 py-2 text-right font-semibold" aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
                        <button type="button" onClick={() => chooseSort(c)} title={c.title} className={`inline-flex items-center gap-0.5 uppercase ${active ? "text-[color:var(--ch-text)]" : ""}`}>
                          {four && side === "against" ? `Opp ${c.label}` : c.label}
                          {active && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.keys.join("|")} className="border-b border-[color:var(--ch-border)] align-top">
                    <td className="py-2.5 pr-3 text-[13px] leading-snug text-[color:var(--ch-text)]">
                      {u.keys.map((k) => players.get(k)?.name ?? k).map(shortName).join(" · ")}
                    </td>
                    {COLUMNS.map((c) => {
                      const v = c.value(u, side);
                      const color = c.key === "net" && v != null ? (v > 0 ? "var(--ch-win)" : v < 0 ? "var(--ch-loss)" : undefined) : undefined;
                      return (
                        <td key={c.key} className={`px-1.5 py-2.5 text-right tabular-nums ${c.key === "net" ? "font-semibold" : "text-[color:var(--ch-text-2)]"}`} style={color ? { color } : undefined}>
                          {c.format(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > PAGE && (
            <div className="mt-3 text-center">
              <button type="button" onClick={() => setShowAll((s) => !s)} className="text-sm font-semibold" style={{ color: accentColor }}>
                {showAll ? "Show fewer" : `Show all ${rows.length}`}
              </button>
            </div>
          )}
          <p className="mt-4 text-xs text-[color:var(--ch-text-2)]">
            {data.coverage.games > 0 && `Built from ${data.coverage.used} of ${data.coverage.games} games where the lineup tracking matches the box score. `}
            {size !== 5 && `A ${sizeWord}'s numbers cover every minute they shared the floor, whoever else was on. `}
            eFG% counts threes as 1.5 shots; TOV% is turnovers per 100 plays; OREB% is the share of missed shots the attacking team got back; FT/FGA is free throws made per 100 shots. Switch to Against to see what opponents did with this {sizeWord} on the floor.
          </p>
        </>
      )}
    </div>
  );
}

const better = (diff: number | null, lowerIsBetter: boolean) => (diff == null || Math.abs(diff) < 0.05 ? undefined : (diff > 0) !== lowerIsBetter ? "var(--ch-win)" : "var(--ch-loss)");

function OnOffTable({
  rows, total, showAll, onToggle, players, side, sort, onSort, accentColor, coverage,
}: {
  rows: LineupCombo[];
  total: number;
  showAll: boolean;
  onToggle: () => void;
  players: Map<string, LineupPlayer>;
  side: Side;
  sort: { key: SortKey; desc: boolean };
  onSort: (c: { key: SortKey; lowerIsBetter?: (side: Side) => boolean }) => void;
  accentColor: string;
  coverage: { games: number; used: number };
}) {
  const head = (c: { key: SortKey; label: string; title: string; lowerIsBetter?: (side: Side) => boolean }) => {
    const active = sort.key === c.key;
    return (
      <th key={c.key} className="px-1.5 py-2 text-right font-semibold" aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
        <button type="button" onClick={() => onSort(c)} title={c.title} className={`inline-flex items-center gap-0.5 uppercase ${active ? "text-[color:var(--ch-text)]" : ""}`}>
          {c.label}
          {active && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
        </button>
      </th>
    );
  };
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm" data-testid="lineup-onoff-table">
          <thead>
            <tr className="border-b border-[color:var(--ch-border)] text-[11px] uppercase tracking-wide text-[color:var(--ch-muted)]">
              <th className="py-2 pr-3 text-left font-semibold">Player</th>
              {head({ key: "minutes", label: "Min", title: "Minutes on the floor" })}
              {head({ key: "net", label: "On", title: "Net rating with them on the floor" })}
              {head({ key: "offNet", label: "Off", title: "Net rating with them off the floor, in the same games" })}
              {head({ key: "swing", label: "Swing", title: "On minus off" })}
              {FACTORS.map((f) => head({ ...f, label: side === "against" ? `Opp ${f.label}` : f.label }))}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const sw = swing(u);
              return (
                <tr key={u.keys.join("|")} className="border-b border-[color:var(--ch-border)] align-top">
                  <td className="py-2.5 pr-3 text-[13px] leading-snug text-[color:var(--ch-text)]">{players.get(u.keys[0])?.name ?? u.keys[0]}</td>
                  <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">
                    {fixed(u.minutes)}
                    {u.off && <div className="text-[11px] text-[color:var(--ch-muted)]">{fixed(u.off.minutes)} off</div>}
                  </td>
                  <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text)]">{signed(u.net)}</td>
                  <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">{signed(u.off?.net ?? null)}</td>
                  <td className="px-1.5 py-2.5 text-right font-semibold tabular-nums" style={{ color: better(sw, false) }}>{signed(sw)}</td>
                  {FACTORS.map((f) => {
                    const on = f.on(u, side);
                    const off = u.off ? f.off(u.off, side) : null;
                    const diff = on != null && off != null ? on - off : null;
                    return (
                      <td key={f.key} className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">
                        {fixed(on)}
                        {diff != null && <div className="text-[11px]" style={{ color: better(diff, f.lowerIsBetter(side)) ?? "var(--ch-muted)" }}>{signed(diff)} vs off</div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div className="mt-3 text-center">
          <button type="button" onClick={onToggle} className="text-sm font-semibold" style={{ color: accentColor }}>
            {showAll ? "Show fewer" : `Show all ${total}`}
          </button>
        </div>
      )}
      <p className="mt-4 text-xs text-[color:var(--ch-text-2)]">
        {coverage.games > 0 && `Built from ${coverage.used} of ${coverage.games} games where the lineup tracking matches the box score. `}
        On is the team with this player on the floor; off is the team in the same games while they sat. Green under a number means the team did better with them on.
        {" "}Switch to Against to see what opponents did. A dash means too few minutes off the floor to compare.
      </p>
    </>
  );
}
