import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { extractColorsFromImage } from "@/lib/colorExtractor";
import {
  champion,
  displayTeamName,
  formatCupDate,
  gamesByRound,
  logoByTeam,
  resolveBracket,
  roundLabel,
  teamKey,
  teamsRemaining,
  type CupGameRow,
  type CupRound,
  type ResolvedCupGame,
} from "@shared/nationalCup";

/** The saved bracket for a competition. Empty for leagues without one, which is how the page knows to hide the tab. */
export function useCupBracketRows(leagueId: string | null | undefined) {
  return useQuery({
    queryKey: ["cup-bracket-games", leagueId],
    enabled: !!leagueId,
    staleTime: 60_000,
    queryFn: async (): Promise<CupGameRow[]> => {
      const { data, error } = await supabase.from("cup_bracket_games").select("*").eq("league_id", leagueId!).order("game_no").limit(255);
      if (error) throw error;
      return (data ?? []) as CupGameRow[];
    },
  });
}

/** Games that have LiveStats on the site, keyed by the two teams, so a bracket game can link through to its page. */
function useScheduledGameKeys(leagueId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["cup-bracket-schedule", leagueId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("game_schedule").select("game_key, hometeam, awayteam, status").eq("league_id", leagueId).limit(1000);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const g of data ?? []) {
        if (!g.hometeam || !g.awayteam) continue;
        map.set([teamKey(g.hometeam), teamKey(g.awayteam)].sort().join("|"), g.game_key);
      }
      return map;
    },
  });
}

function pairKey(game: ResolvedCupGame): string | null {
  if (!game.home.name || !game.away.name) return null;
  return [teamKey(game.home.name), teamKey(game.away.name)].sort().join("|");
}

// ── team colours, taken from each crest the same way team pages do ──────────

type Rgb = { r: number; g: number; b: number };
const MONOCHROME: Rgb = { r: 71, g: 79, b: 94 };
const NIGHT: Rgb = { r: 10, g: 14, b: 22 };
const css = (c: Rgb) => `rgb(${c.r}, ${c.g}, ${c.b})`;
const luma = (c: Rgb) => (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
const shade = (c: Rgb, f: number): Rgb => ({ r: Math.round(c.r * f), g: Math.round(c.g * f), b: Math.round(c.b * f) });
const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({ r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) });
const brandCache = new Map<string, Promise<Rgb | null>>();

function brandFor(logoUrl: string): Promise<Rgb | null> {
  let p = brandCache.get(logoUrl);
  if (!p) {
    // Black-and-white crests have no colour to pick, so they get a charcoal edge rather than none.
    p = extractColorsFromImage(logoUrl).then((c) => c?.primaryRgb ?? MONOCHROME);
    brandCache.set(logoUrl, p);
  }
  return p;
}

function useBrand(logoUrl: string | null | undefined): Rgb | null {
  const [rgb, setRgb] = useState<Rgb | null>(null);
  useEffect(() => {
    if (!logoUrl) {
      setRgb(null);
      return;
    }
    let live = true;
    brandFor(logoUrl).then((c) => live && setRgb(c));
    return () => {
      live = false;
    };
  }, [logoUrl]);
  return rgb;
}

// ── one team's row ──────────────────────────────────────────────────────────

function Crest({ url, name, px }: { url: string | null | undefined; name: string; px: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: px, height: px };
  if (!url || failed) {
    return (
      <span className="shrink-0 rounded-full bg-[color:var(--ch-surface-3)] text-[color:var(--ch-muted)] flex items-center justify-center font-bold" style={{ ...box, fontSize: px * 0.5 }} aria-hidden>
        {displayTeamName(name).charAt(0)}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-[5px] bg-white flex items-center justify-center overflow-hidden shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" style={box}>
      <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className="max-w-[88%] max-h-[88%] object-contain" />
    </span>
  );
}

function Side({ side, game, logos, compact }: { side: ResolvedCupGame["home"]; game: ResolvedCupGame; logos: Map<string, string>; compact: boolean }) {
  const logo = side.name ? logos.get(teamKey(side.name)) : undefined;
  const brand = useBrand(logo);
  const decided = game.status === "final";
  const lost = decided && !side.winner;
  const rowH = compact ? 22 : 30;
  const px = compact ? 16 : 20;

  // The row is the club's colour, solid, with a gradient finish and a light edge along the top.
  // Losers are the same colour sunk towards black, so a result still reads at a glance.
  let fill: React.CSSProperties = { height: rowH, background: "var(--ch-surface-3)", color: "var(--ch-text)" };
  let ink = "var(--ch-text)";
  let pill: React.CSSProperties = { background: "rgba(0,0,0,0.22)", color: ink };
  if (brand) {
    const from = lost ? mix(brand, NIGHT, 0.55) : brand;
    const lightFill = luma(from) > 150;
    const to = shade(from, lightFill ? 0.8 : 0.58);
    ink = lightFill ? "#0b0f17" : "#ffffff";
    fill = {
      height: rowH,
      background: `linear-gradient(100deg, ${css(from)} 0%, ${css(to)} 100%)`,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
      color: ink,
    };
    pill = side.winner
      ? { background: "rgba(255,255,255,0.94)", color: "#0b0f17" }
      : { background: "rgba(0,0,0,0.28)", color: ink };
  }

  if (!side.name) {
    const text = game.isBye && side === game.away ? "Bye" : side.waitingOn ? `Winner of G${side.waitingOn}` : "To be decided";
    return (
      <div className="flex items-center gap-2 pl-3 pr-2.5" style={{ height: rowH }}>
        <span className="truncate italic leading-none text-[color:var(--ch-muted)]" style={{ fontSize: compact ? 11 : 12 }}>
          {text}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 pl-2 pr-2" style={fill}>
      <Crest url={logo} name={side.name} px={px} />
      <span
        className={`flex-1 min-w-0 truncate leading-none tracking-[-0.01em] ${side.winner ? "font-bold" : lost ? "font-medium opacity-80" : "font-semibold"}`}
        style={{ fontSize: compact ? 11.5 : 12.5 }}
        title={side.name}
      >
        {displayTeamName(side.name)}
      </span>
      {side.score !== null && (
        <span
          className="tabular-nums leading-none font-bold rounded-md px-1.5 py-[3px] min-w-[26px] text-center"
          style={{ fontSize: compact ? 11 : 12, ...pill }}
        >
          {game.forfeit && side.winner ? "W/O" : game.forfeit ? "–" : side.score}
        </span>
      )}
    </div>
  );
}

// ── one game ────────────────────────────────────────────────────────────────

function GameCard({
  game,
  gameKey,
  logos,
  compact,
  onOpenGame,
}: {
  game: ResolvedCupGame;
  gameKey: string | null;
  logos: Map<string, string>;
  compact: boolean;
  onOpenGame: (gameKey: string) => void;
}) {
  const footer =
    game.status === "bye"
      ? "Through on a bye"
      : [game.date ? formatCupDate(game.date) : null, game.status !== "final" && game.tipTime ? game.tipTime : null, game.forfeit ? "Forfeit" : null].filter(Boolean).join(" · ");
  const body = (
    <>
      <div className="divide-y divide-black/25 overflow-hidden rounded-t-[9px]">
        <Side side={game.home} game={game} logos={logos} compact={compact} />
        <Side side={game.away} game={game} logos={logos} compact={compact} />
      </div>
      {!compact && (
        <div className="flex items-center justify-between gap-2 px-2.5 h-[20px] border-t border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)] rounded-b-[9px]">
          <span className="truncate text-[10.5px] leading-none text-[color:var(--ch-muted)]">{footer || `G${game.gameNo}`}</span>
          {gameKey && (
            <span className="shrink-0 text-[10px] font-semibold leading-none uppercase tracking-wide text-[color:var(--ch-accent)]">
              {game.status === "final" ? "Stats" : "Preview"}
            </span>
          )}
        </div>
      )}
    </>
  );
  const cls = `block w-full text-left rounded-[10px] border bg-[color:var(--ch-surface)] shadow-[var(--ch-shadow)] ${compact ? "rounded-[8px]" : ""} ${
    game.status === "upcoming" ? "border-[color:var(--ch-border-strong)]" : "border-[color:var(--ch-border)]"
  }`;
  const title = compact ? [displayTeamName(game.home.name ?? "TBD"), "v", displayTeamName(game.away.name ?? "TBD"), footer && `· ${footer}`].join(" ") : undefined;
  return gameKey ? (
    <button type="button" onClick={() => onOpenGame(gameKey)} title={title} className={`${cls} transition-shadow hover:shadow-[var(--ch-shadow-lg)]`} data-testid={`cup-game-${game.gameNo}`}>
      {body}
    </button>
  ) : (
    <div className={cls} title={title} data-testid={`cup-game-${game.gameNo}`}>
      {body}
    </div>
  );
}

// ── the tree ────────────────────────────────────────────────────────────────

const COMPACT_ROUNDS: CupRound[] = ["R1"]; // 64 games: smaller cards so the first round stays a sensible height

function Tree({
  rounds,
  logos,
  keyFor,
  onOpenGame,
}: {
  rounds: { round: CupRound; label: string; games: ResolvedCupGame[] }[];
  logos: Map<string, string>;
  keyFor: (g: ResolvedCupGame) => string | null;
  onOpenGame: (gameKey: string) => void;
}) {
  const first = rounds[0];
  const slot = COMPACT_ROUNDS.includes(first.round) ? 54 : 100; // height given to each game in the first column; later rounds double
  const height = first.games.length * slot;
  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-2">
      <div className="flex min-w-max">
        {rounds.map((r, ri) => {
          const compact = COMPACT_ROUNDS.includes(r.round);
          return (
            <div key={r.round} className="flex">
              <div className={`${compact ? "w-[196px]" : "w-[224px]"} shrink-0`}>
                <div className="h-8 flex items-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{r.label}</span>
                </div>
                <div className="flex flex-col" style={{ height }}>
                  {r.games.map((g) => (
                    <div key={g.gameNo} className="flex-1 flex items-center">
                      <div className="w-full">
                        <GameCard game={g} gameKey={keyFor(g)} logos={logos} compact={compact} onOpenGame={onOpenGame} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {ri < rounds.length - 1 && (
                <div className="w-6 shrink-0">
                  <div className="h-8" />
                  <div className="flex flex-col" style={{ height }} aria-hidden>
                    {Array.from({ length: Math.ceil(r.games.length / 2) }, (_, i) => (
                      <div key={i} className="flex-1 relative">
                        <div className="absolute left-0 right-1/2 top-[25%] bottom-[25%] border-y border-r border-[color:var(--ch-border-strong)] rounded-r-md" />
                        <div className="absolute left-1/2 right-0 top-1/2 border-t border-[color:var(--ch-border-strong)]" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── the tab ─────────────────────────────────────────────────────────────────

type View = "bracket" | "full";

export function CupBracket({ leagueId, rows, onOpenGame }: { leagueId: string; rows: CupGameRow[]; onOpenGame: (gameKey: string) => void }) {
  const games = useMemo(() => resolveBracket(rows), [rows]);
  const rounds = useMemo(() => gamesByRound(games), [games]);
  const logos = useMemo(() => logoByTeam(rows), [rows]);
  const { data: scheduled } = useScheduledGameKeys(leagueId, rows.length > 0);
  const [view, setView] = useState<View>("bracket");

  const knockout = rounds.filter((r) => r.round !== "R1" && r.round !== "R64");
  const hasEarlier = rounds.some((r) => r.round === "R1" || r.round === "R64");
  const champ = champion(games);
  const left = teamsRemaining(games);
  const nextGames = games
    .filter((g) => g.status === "upcoming" && g.date)
    .sort((a, b) => (a.date! === b.date! ? (a.tipTime ?? "").localeCompare(b.tipTime ?? "") : a.date!.localeCompare(b.date!)));
  const nextDate = nextGames[0]?.date ?? null;
  const nextRound = nextGames[0]?.round ?? null;

  const keyFor = (g: ResolvedCupGame): string | null => {
    const k = pairKey(g);
    return k ? scheduled?.get(k) ?? null : null;
  };

  const tabs: { id: View; label: string; show: boolean }[] = [
    { id: "bracket", label: "Last 32", show: knockout.length > 0 },
    { id: "full", label: "Full draw", show: hasEarlier },
  ];
  const shown = view === "full" || knockout.length === 0 ? rounds : knockout;

  return (
    <div className="ch-card p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] md:text-base font-semibold tracking-tight text-[color:var(--ch-text)]">Knockout bracket</h2>
          <p className="mt-1 text-[13px] text-[color:var(--ch-text-2)]">
            {champ ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[color:var(--ch-text)]">
                <Trophy className="w-4 h-4 text-[color:var(--ch-accent)]" />
                {displayTeamName(champ)} are the champions
              </span>
            ) : (
              <>
                {left} {left === 1 ? "team" : "teams"} left
                {nextDate && nextRound ? ` · ${roundLabel(nextRound)} next, ${formatCupDate(nextDate)}` : ""}
              </>
            )}
          </p>
        </div>
        {tabs.filter((t) => t.show).length > 1 && (
          <div className="inline-flex rounded-lg border border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)] p-0.5" role="tablist" aria-label="Bracket size">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={view === t.id}
                  onClick={() => setView(t.id)}
                  className={`px-3 h-8 rounded-md text-[12.5px] font-medium transition-colors ${view === t.id ? "bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] shadow-[var(--ch-shadow)]" : "text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"}`}
                >
                  {t.label}
                </button>
              ))}
          </div>
        )}
      </div>

      {shown.length > 0 && <Tree rounds={shown} logos={logos} keyFor={keyFor} onOpenGame={onOpenGame} />}

      <p className="mt-4 text-[11.5px] leading-relaxed text-[color:var(--ch-muted)]">
        Scores and crests come from Basketball England. Games with live stats link through: "Preview" opens the game before tip-off and "Stats" opens the box score.
        {view === "full" ? " Round 1 byes are teams that went straight into the Round of 64." : ""}
      </p>
    </div>
  );
}
