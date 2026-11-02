import { z } from "zod";
import type { AskCard, AskEvent, AskNavButton, AskScope, AskSurface } from "@shared/askSwish";
import { gamePath, playerPath, teamPath } from "@shared/seo";
import * as d from "./data";

/**
 * Ask Swish — the tools the model can call.
 *
 * Each tool returns a compact text block for the model and, where the answer
 * is naturally a table, pushes a card to the browser straight away (so the
 * user sees the standings before the model has finished writing about them).
 * Tools also collect navigation buttons for the entities they touched.
 *
 * Inputs are validated with zod before anything runs; the JSON schema the
 * model sees is written by hand beside it so the two stay in step.
 */

export interface ToolContext {
  scope: AskScope;
  surface: AskSurface;
  emit: (event: AskEvent) => void;
  nav: AskNavButton[];
  followUps: string[] | null;
  /** Names of tools run this turn, for the deterministic follow-up fallback. */
  ran: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  schema: z.ZodTypeAny;
  /** Only offered when the panel is mounted on these surfaces. */
  surfaces?: AskSurface[];
  run: (input: any, ctx: ToolContext) => Promise<string>;
}

const card = (ctx: ToolContext, c: AskCard) => ctx.emit({ type: "card", card: c });
const status = (ctx: ToolContext, text: string) => ctx.emit({ type: "status", text });

function addNav(ctx: ToolContext, button: AskNavButton | null) {
  if (!button || ctx.nav.some((b) => b.href === button.href)) return;
  if (ctx.nav.length < 4) ctx.nav.push(button);
}

/** Which competition a tool should look at: the named one, else the page's. */
async function resolveLeague(ctx: ToolContext, league?: string | null): Promise<d.Competition> {
  if (league) {
    const c = await d.findCompetition(league);
    if (c) return c;
    throw new Error(`No competition matches "${league}". Call search_entities to see what exists.`);
  }
  const c = await d.competitionById(ctx.scope.leagueId);
  if (c) return c;
  throw new Error("No competition in scope. Ask the user which competition they mean, or call search_entities.");
}

const leagueNav = (c: d.Competition): AskNavButton | null =>
  c.slug ? { label: c.name, href: `/league/${c.slug}`, kind: "competition" } : null;

// ---------- stat catalogue for leaders / records ----------

type Agg = { label: string; unit: string; lower?: boolean; needs?: "fga" | "tpa" | "fta" };

const PLAYER_TRAD: Record<string, { col: keyof d.PlayerGame } & Agg> = {
  pts: { col: "pts", label: "Points", unit: "PPG" },
  reb: { col: "reb", label: "Rebounds", unit: "RPG" },
  oreb: { col: "oreb", label: "Offensive rebounds", unit: "ORPG" },
  dreb: { col: "dreb", label: "Defensive rebounds", unit: "DRPG" },
  ast: { col: "ast", label: "Assists", unit: "APG" },
  stl: { col: "stl", label: "Steals", unit: "SPG" },
  blk: { col: "blk", label: "Blocks", unit: "BPG" },
  tov: { col: "tov", label: "Turnovers", unit: "TPG", lower: true },
  tpm: { col: "tpm", label: "3-pointers made", unit: "3PM/G" },
  fgm: { col: "fgm", label: "Field goals made", unit: "FGM/G" },
  ftm: { col: "ftm", label: "Free throws made", unit: "FTM/G" },
  plus_minus: { col: "plus_minus", label: "Plus/minus", unit: "+/-" },
  pitp: { col: "pitp", label: "Points in the paint", unit: "PITP/G" },
  fastbreak_pts: { col: "fastbreak_pts", label: "Fast-break points", unit: "FB/G" },
  second_chance_pts: { col: "second_chance_pts", label: "Second-chance points", unit: "2C/G" },
  pf: { col: "pf", label: "Fouls", unit: "PF/G", lower: true },
};
const PLAYER_PCT: Record<string, Agg & { calc: (t: Totals) => number | null }> = {
  fg_pct: { label: "Field-goal %", unit: "FG%", needs: "fga", calc: (t) => (t.fga ? (t.fgm / t.fga) * 100 : null) },
  tp_pct: { label: "3-point %", unit: "3P%", needs: "tpa", calc: (t) => (t.tpa ? (t.tpm / t.tpa) * 100 : null) },
  ft_pct: { label: "Free-throw %", unit: "FT%", needs: "fta", calc: (t) => (t.fta ? (t.ftm / t.fta) * 100 : null) },
  efg_pct: { label: "Effective FG%", unit: "eFG%", needs: "fga", calc: (t) => (t.fga ? ((t.fgm + 0.5 * t.tpm) / t.fga) * 100 : null) },
  ts_pct: { label: "True shooting %", unit: "TS%", needs: "fga", calc: (t) => { const tsa = t.fga + 0.44 * t.fta; return tsa ? (t.pts / (2 * tsa)) * 100 : null; } },
  min: { label: "Minutes", unit: "MPG", calc: (t) => t.min },
};
const PLAYER_ADV: Record<string, { col: keyof d.AdvancedGame } & Agg> = {
  off_rating: { col: "off_rating", label: "Offensive rating", unit: "ORtg" },
  def_rating: { col: "def_rating", label: "Defensive rating", unit: "DRtg", lower: true },
  net_rating: { col: "net_rating", label: "Net rating", unit: "Net" },
  usage_pct: { col: "usage_percent", label: "Usage %", unit: "USG%" },
  pie: { col: "pie", label: "Player impact estimate", unit: "PIE" },
  ast_pct: { col: "ast_percent", label: "Assist %", unit: "AST%" },
  reb_pct: { col: "reb_percent", label: "Rebound %", unit: "REB%" },
  tov_pct: { col: "tov_percent", label: "Turnover %", unit: "TOV%", lower: true },
  three_point_rate: { col: "three_point_rate", label: "3-point rate", unit: "3PAr" },
};
const TEAM_TRAD: Record<string, { col: keyof d.TeamGame } & Agg> = {
  pts: { col: "pts", label: "Points", unit: "PPG" }, reb: { col: "reb", label: "Rebounds", unit: "RPG" }, oreb: { col: "oreb", label: "Offensive rebounds", unit: "ORPG" },
  ast: { col: "ast", label: "Assists", unit: "APG" }, stl: { col: "stl", label: "Steals", unit: "SPG" }, blk: { col: "blk", label: "Blocks", unit: "BPG" },
  tov: { col: "tov", label: "Turnovers", unit: "TPG", lower: true }, tpm: { col: "tpm", label: "3-pointers made", unit: "3PM/G" },
  pitp: { col: "pitp", label: "Points in the paint", unit: "PITP/G" }, fastbreak_pts: { col: "fastbreak_pts", label: "Fast-break points", unit: "FB/G" },
  second_chance_pts: { col: "second_chance_pts", label: "Second-chance points", unit: "2C/G" }, pts_off_turnovers: { col: "pts_off_turnovers", label: "Points off turnovers", unit: "POT/G" },
  bench_pts: { col: "bench_pts", label: "Bench points", unit: "BP/G" }, pf: { col: "pf", label: "Fouls", unit: "PF/G", lower: true },
};
const TEAM_ADV: Record<string, { col: keyof d.AdvancedGame } & Agg> = {
  off_rating: { col: "off_rating", label: "Offensive rating", unit: "ORtg" }, def_rating: { col: "def_rating", label: "Defensive rating", unit: "DRtg", lower: true },
  net_rating: { col: "net_rating", label: "Net rating", unit: "Net" }, pace: { col: "pace", label: "Pace", unit: "poss/40" },
  efg_pct: { col: "efg_percent", label: "Effective FG%", unit: "eFG%" }, ts_pct: { col: "ts_percent", label: "True shooting %", unit: "TS%" },
  tov_pct: { col: "tov_percent", label: "Turnover %", unit: "TOV%", lower: true }, oreb_pct: { col: "oreb_percent", label: "Offensive rebound %", unit: "OREB%" },
  dreb_pct: { col: "dreb_percent", label: "Defensive rebound %", unit: "DREB%" }, reb_pct: { col: "reb_percent", label: "Rebound %", unit: "REB%" },
  ast_pct: { col: "ast_percent", label: "Assist %", unit: "AST%" }, three_point_rate: { col: "three_point_rate", label: "3-point rate", unit: "3PAr" },
  ft_rate: { col: "ft_rate", label: "Free-throw rate", unit: "FTr" }, opp_efg_pct: { col: "opp_efg_percent", label: "Opponent eFG%", unit: "opp eFG%", lower: true },
  pie: { col: "pie", label: "Team PIE", unit: "PIE" },
};
const STAT_KEYS = Array.from(new Set([...Object.keys(PLAYER_TRAD), ...Object.keys(PLAYER_PCT), ...Object.keys(PLAYER_ADV), ...Object.keys(TEAM_TRAD), ...Object.keys(TEAM_ADV), "pts_allowed", "point_diff"]));

const TOTAL_KEYS = ["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "plus_minus", "pitp", "fastbreak_pts", "second_chance_pts", "pts_off_turnovers", "bench_pts"] as const;
type TotalKey = (typeof TOTAL_KEYS)[number];
type Totals = Record<TotalKey, number> & { games: number; min: number };

function zeroTotals(): Totals {
  const t = { games: 0, min: 0 } as Totals;
  for (const k of TOTAL_KEYS) t[k] = 0;
  return t;
}

function totalsByPlayer(games: d.PlayerGame[]): Map<string, Totals & { name: string; team: string; player_id: string | null }> {
  const out = new Map<string, Totals & { name: string; team: string; player_id: string | null }>();
  for (const g of games) {
    const key = g.player_id ?? `${g.player_name}|${g.team_name}`;
    let t = out.get(key);
    if (!t) { t = { ...zeroTotals(), name: g.player_name, team: g.team_name, player_id: g.player_id }; out.set(key, t); }
    t.games++;
    t.min += d.minutesOf(g.min);
    const row = g as unknown as Partial<Record<TotalKey, number | null>>;
    for (const k of TOTAL_KEYS) t[k] += row[k] ?? 0;
  }
  return out;
}

function totalsByTeam(games: d.TeamGame[]): Map<string, Totals & { name: string; pa: number }> {
  const out = new Map<string, Totals & { name: string; pa: number }>();
  for (const g of games) {
    let t = out.get(g.team_name);
    if (!t) { t = { ...zeroTotals(), name: g.team_name, pa: 0 }; out.set(g.team_name, t); }
    t.games++;
    const row = g as unknown as Partial<Record<TotalKey, number | null>>;
    for (const k of TOTAL_KEYS) t[k] += row[k] ?? 0;
  }
  return out;
}

/** Points allowed per team from the results (the team-log view has no opponent score). */
function pointsAllowed(results: d.ResultRow[]): Map<string, { games: number; pa: number; pf: number }> {
  const out = new Map<string, { games: number; pa: number; pf: number }>();
  const add = (team: string, pf: number, pa: number) => {
    const r = out.get(team) ?? { games: 0, pa: 0, pf: 0 };
    r.games++; r.pa += pa; r.pf += pf; out.set(team, r);
  };
  for (const g of results) { add(g.home_team, g.home_score, g.away_score); add(g.away_team, g.away_score, g.home_score); }
  return out;
}

const minGamesDefault = (maxGames: number) => Math.max(1, Math.round(maxGames * 0.5));

// ---------- the tools ----------

export const searchEntities: ToolDef = {
  name: "search_entities",
  description: "Find competitions, teams or players by name when the user names something not in scope, or asks about a league other than the one in view. Returns ids and the competition each belongs to. Use before other tools when you are not sure which competition a name belongs to.",
  input_schema: { type: "object", properties: { query: { type: "string", description: "Name or part of a name" }, kind: { type: "string", enum: ["any", "competition", "team", "player"] } }, required: ["query"] },
  schema: z.object({ query: z.string().min(1), kind: z.enum(["any", "competition", "team", "player"]).optional() }),
  async run({ query, kind = "any" }, ctx) {
    status(ctx, `Searching for "${query}"…`);
    const out: string[] = [];
    const comps = await d.visibleCompetitions();
    const byId = new Map(comps.map((c) => [c.league_id, c.name]));
    if (kind === "any" || kind === "competition") {
      const q = query.toLowerCase();
      const hits = comps.filter((c) => c.name.toLowerCase().includes(q) || (c.slug ?? "").includes(q)).slice(0, 8);
      const best = await d.findCompetition(query);
      if (best && !hits.includes(best)) hits.unshift(best);
      if (hits.length) out.push("Competitions:\n" + hits.map((c) => `- ${c.name} (league_id ${c.league_id}${c.season ? `, ${c.season}` : ""})`).join("\n"));
    }
    if (kind === "any" || kind === "team") {
      const ids = comps.map((c) => c.league_id);
      const { data } = await (await import("../supabaseServiceClient")).supabaseAdmin
        .from("teams").select("team_id, name, league_id").in("league_id", ids).ilike("name", `%${query}%`).limit(12);
      if (data?.length) out.push("Teams:\n" + data.map((t: any) => `- ${t.name} — ${byId.get(t.league_id) ?? "?"} (league_id ${t.league_id})`).join("\n"));
    }
    if (kind === "any" || kind === "player") {
      const players = await d.findPlayers(query, comps.map((c) => c.league_id));
      if (players.length) out.push("Players:\n" + players.slice(0, 12).map((p) => `- ${p.full_name} — ${p.team_name ?? "?"}, ${byId.get(p.league_id ?? "") ?? "?"} (league_id ${p.league_id})`).join("\n"));
    }
    return out.length ? out.join("\n\n") : `Nothing matched "${query}".`;
  },
};

export const getStandings: ToolDef = {
  name: "get_standings",
  description: "League table for a competition: wins, losses, points for/against, last five and streak. Use for standings, who is top, records, form.",
  input_schema: { type: "object", properties: { league: { type: "string", description: "Competition name, slug or league_id. Omit to use the competition in scope." }, limit: { type: "integer" } } },
  schema: z.object({ league: z.string().optional(), limit: z.number().int().positive().max(40).optional() }),
  async run({ league, limit }, ctx) {
    const comp = await resolveLeague(ctx, league);
    status(ctx, `Pulling ${comp.name} standings…`);
    const rows = d.computeStandings(await d.finalResults(await d.leagueFamily(comp.league_id)));
    if (!rows.length) return `${comp.name} has no completed games yet.`;
    const shown = rows.slice(0, limit ?? rows.length);
    card(ctx, {
      kind: "standings", title: `${comp.name} standings`,
      rows: shown.map((r, i) => ({ rank: i + 1, team: r.team, wins: r.wins, losses: r.losses, pct: `${Math.round((r.wins / Math.max(1, r.wins + r.losses)) * 100)}%`, pf: r.pf, pa: r.pa, last5: r.last5 })),
    });
    addNav(ctx, leagueNav(comp));
    return `${comp.name} standings (${rows.length} teams):\n` + shown.map((r, i) =>
      `${i + 1}. ${r.team} ${r.wins}-${r.losses}, PF ${d.fmt1(r.pf / Math.max(1, r.wins + r.losses))}/g PA ${d.fmt1(r.pa / Math.max(1, r.wins + r.losses))}/g, last5 ${r.last5 || "-"}, streak ${r.streak || "-"}`).join("\n");
  },
};

export const getLeaders: ToolDef = {
  name: "get_leaders",
  description: `Ranked leaders for one stat, players or teams, in a competition. Per-game averages by default (per="game"); per="total" for season totals. Stats: ${STAT_KEYS.join(", ")}. Percentages and advanced stats are averages with a minimum games/attempts qualifier; pts_allowed and point_diff are team defence. Optional team filter for "top scorers for X".`,
  input_schema: {
    type: "object",
    properties: {
      stat: { type: "string", enum: STAT_KEYS }, scope: { type: "string", enum: ["players", "teams"] }, per: { type: "string", enum: ["game", "total"] },
      league: { type: "string" }, team: { type: "string" }, min_games: { type: "integer" }, min_attempts_per_game: { type: "number" }, limit: { type: "integer" },
    },
    required: ["stat"],
  },
  schema: z.object({
    stat: z.string(), scope: z.enum(["players", "teams"]).optional(), per: z.enum(["game", "total"]).optional(), league: z.string().optional(),
    team: z.string().optional(), min_games: z.number().int().min(1).optional(), min_attempts_per_game: z.number().min(0).optional(), limit: z.number().int().min(1).max(25).optional(),
  }),
  async run(input, ctx) {
    const comp = await resolveLeague(ctx, input.league);
    const ids = await d.leagueFamily(comp.league_id);
    const scope = input.scope ?? "players";
    const per = input.per ?? "game";
    const limit = input.limit ?? 10;
    status(ctx, `Ranking ${scope} by ${input.stat} in ${comp.name}…`);

    if (scope === "players") {
      if (PLAYER_TRAD[input.stat] || PLAYER_PCT[input.stat]) {
        const games = await d.playerGames(ids, { team: input.team });
        const totals = Array.from(totalsByPlayer(games).values());
        const maxGames = Math.max(0, ...totals.map((t) => t.games));
        const minGames = input.min_games ?? minGamesDefault(maxGames);
        const def = PLAYER_TRAD[input.stat] ?? PLAYER_PCT[input.stat];
        const pctDef = PLAYER_PCT[input.stat];
        const minAtt = input.min_attempts_per_game ?? (pctDef?.needs === "fga" ? 4 : pctDef?.needs ? 1.5 : 0);
        const ranked = totals
          .filter((t) => t.games >= minGames && (!pctDef?.needs || t[pctDef.needs] / t.games >= minAtt))
          .map((t) => ({ t, v: pctDef ? (pctDef.calc(t) == null ? null : (input.stat === "min" ? t.min / t.games : pctDef.calc(t))) : (per === "total" ? t[(def as { col: TotalKey }).col] : t[(def as { col: TotalKey }).col] / t.games) }))
          .filter((x) => x.v != null)
          .sort((a, b) => (def.lower ? (a.v! - b.v!) : (b.v! - a.v!)))
          .slice(0, limit);
        if (!ranked.length) return `No qualifying players (min ${minGames} games${minAtt ? `, ${minAtt} attempts/g` : ""}).`;
        const unit = pctDef ? def.unit : per === "total" ? def.label.toUpperCase().slice(0, 3) : def.unit;
        card(ctx, {
          kind: "leaderboard", title: `${def.label} leaders — ${input.team ? input.team : comp.name}`, unit,
          rows: ranked.map((x, i) => ({ rank: i + 1, name: x.t.name, sub: `${x.t.team} · ${x.t.games} GP`, value: pctDef && input.stat !== "min" ? `${x.v!.toFixed(1)}%` : d.fmt1(x.v) })),
        });
        const top = ranked[0].t;
        addNav(ctx, top.player_id ? { label: top.name, href: playerPath({ full_name: top.name, id: top.player_id }) ?? "", kind: "player" } : null);
        addNav(ctx, leagueNav(comp));
        return `${def.label} leaders, ${comp.name}, ${per === "total" ? "season totals" : "per game"}, min ${minGames} games${minAtt ? `, ${minAtt} attempts/g` : ""}:\n` +
          ranked.map((x, i) => `${i + 1}. ${x.t.name} (${x.t.team}) ${pctDef && input.stat !== "min" ? x.v!.toFixed(1) + "%" : d.fmt1(x.v)} — ${x.t.games} GP, ${d.fmt1(x.t.pts / x.t.games)} ppg`).join("\n");
      }
      const adv = PLAYER_ADV[input.stat];
      if (!adv) return `Stat "${input.stat}" is not available for players. Try one of: ${[...Object.keys(PLAYER_TRAD), ...Object.keys(PLAYER_PCT), ...Object.keys(PLAYER_ADV)].join(", ")}.`;
      const rows = await d.playerAdvanced(ids, { team: input.team });
      const by = new Map<string, { name: string; team: string; player_id: string | null; vals: number[]; mins: number }>();
      for (const r of rows) {
        const v = r[adv.col] as number | null;
        if (v == null) continue;
        const key = r.player_id ?? `${r.player_name}|${r.team_name}`;
        const e = by.get(key) ?? { name: r.player_name ?? "", team: r.team_name, player_id: r.player_id ?? null, vals: [], mins: 0 };
        e.vals.push(Number(v)); e.mins += d.minutesOf(r.min); by.set(key, e);
      }
      const maxGames = Math.max(0, ...Array.from(by.values()).map((e) => e.vals.length));
      const minGames = input.min_games ?? minGamesDefault(maxGames);
      const ranked = Array.from(by.values())
        .filter((e) => e.vals.length >= minGames && e.mins / e.vals.length >= 10)
        .map((e) => ({ e, v: d.mean(e.vals)! }))
        .sort((a, b) => (adv.lower ? a.v - b.v : b.v - a.v)).slice(0, limit);
      if (!ranked.length) return `No qualifying players for ${adv.label} (min ${minGames} games, 10 min/g).`;
      card(ctx, { kind: "leaderboard", title: `${adv.label} leaders — ${comp.name}`, unit: adv.unit, rows: ranked.map((x, i) => ({ rank: i + 1, name: x.e.name, sub: `${x.e.team} · ${x.e.vals.length} GP`, value: d.fmt1(x.v) })) });
      addNav(ctx, leagueNav(comp));
      return `${adv.label} leaders (mean of per-game values, min ${minGames} games, 10 min/g), ${comp.name}:\n` + ranked.map((x, i) => `${i + 1}. ${x.e.name} (${x.e.team}) ${d.fmt1(x.v)} over ${x.e.vals.length} games`).join("\n");
    }

    // teams
    const results = await d.finalResults(ids);
    if (input.stat === "pts_allowed" || input.stat === "point_diff") {
      const pa = pointsAllowed(results);
      const ranked = Array.from(pa.entries()).map(([name, r]) => ({ name, games: r.games, v: input.stat === "pts_allowed" ? r.pa / r.games : (r.pf - r.pa) / r.games }))
        .sort((a, b) => (input.stat === "pts_allowed" ? a.v - b.v : b.v - a.v)).slice(0, limit);
      const label = input.stat === "pts_allowed" ? "Points allowed" : "Point differential";
      card(ctx, { kind: "leaderboard", title: `${label} — ${comp.name}`, unit: "per game", rows: ranked.map((x, i) => ({ rank: i + 1, name: x.name, sub: `${x.games} GP`, value: d.fmt1(x.v) })) });
      return `${label} per game, ${comp.name}:\n` + ranked.map((x, i) => `${i + 1}. ${x.name} ${d.fmt1(x.v)} (${x.games} GP)`).join("\n");
    }
    const tdef = TEAM_TRAD[input.stat];
    if (tdef || PLAYER_PCT[input.stat]) {
      const totals = Array.from(totalsByTeam(await d.teamGames(ids)).values());
      const pctDef = PLAYER_PCT[input.stat];
      const ranked = totals.map((t) => ({ t, v: pctDef ? pctDef.calc(t) : per === "total" ? t[tdef.col as TotalKey] : t[tdef.col as TotalKey] / t.games }))
        .filter((x) => x.v != null).sort((a, b) => ((tdef ?? pctDef).lower ? a.v! - b.v! : b.v! - a.v!)).slice(0, limit);
      const label = (tdef ?? pctDef).label;
      card(ctx, { kind: "leaderboard", title: `${label} — ${comp.name}`, unit: pctDef ? pctDef.unit : per === "total" ? "total" : tdef.unit, rows: ranked.map((x, i) => ({ rank: i + 1, name: x.t.name, sub: `${x.t.games} GP`, value: pctDef ? `${x.v!.toFixed(1)}%` : d.fmt1(x.v) })) });
      addNav(ctx, leagueNav(comp));
      return `${label} by team, ${comp.name}, ${per}:\n` + ranked.map((x, i) => `${i + 1}. ${x.t.name} ${pctDef ? x.v!.toFixed(1) + "%" : d.fmt1(x.v)} (${x.t.games} GP)`).join("\n");
    }
    const adv = TEAM_ADV[input.stat];
    if (!adv) return `Stat "${input.stat}" is not available for teams. Try: ${[...Object.keys(TEAM_TRAD), ...Object.keys(TEAM_ADV), "pts_allowed", "point_diff"].join(", ")}.`;
    const rows = await d.teamAdvanced(ids);
    const by = new Map<string, number[]>();
    for (const r of rows) { const v = r[adv.col] as number | null; if (v != null) by.set(r.team_name, [...(by.get(r.team_name) ?? []), Number(v)]); }
    const ranked = Array.from(by.entries()).map(([name, vals]) => ({ name, games: vals.length, v: d.mean(vals)! })).sort((a, b) => (adv.lower ? a.v - b.v : b.v - a.v)).slice(0, limit);
    card(ctx, { kind: "leaderboard", title: `${adv.label} — ${comp.name}`, unit: adv.unit, rows: ranked.map((x, i) => ({ rank: i + 1, name: x.name, sub: `${x.games} GP`, value: d.fmt1(x.v) })) });
    addNav(ctx, leagueNav(comp));
    return `${adv.label} by team (mean per game), ${comp.name}:\n` + ranked.map((x, i) => `${i + 1}. ${x.name} ${d.fmt1(x.v)} (${x.games} GP)`).join("\n");
  },
};

/** One player's season in a competition: averages, shooting, advanced, last five, ranks. */
async function playerProfile(ctx: ToolContext, name: string, comp: d.Competition, emitCard: boolean) {
  const ids = await d.leagueFamily(comp.league_id);
  const games = await d.playerGames(ids, { player: name, limit: 200 });
  if (!games.length) return null;
  // Several players can match a surname; take the one with the most games.
  const totals = Array.from(totalsByPlayer(games).values()).sort((a, b) => b.games - a.games);
  const t = totals[0];
  const mine = games.filter((g) => (g.player_id ?? `${g.player_name}|${g.team_name}`) === (t.player_id ?? `${t.name}|${t.team}`));
  const adv = (await d.playerAdvanced(ids, { player: t.name })).filter((r) => !t.player_id || r.player_id === t.player_id);
  const all = Array.from(totalsByPlayer(await d.playerGames(ids)).values());
  const maxGames = Math.max(0, ...all.map((x) => x.games));
  const pool = all.filter((x) => x.games >= minGamesDefault(maxGames));
  const rank = (k: "pts" | "reb" | "ast" | "stl" | "blk") => {
    const sorted = [...pool].sort((a, b) => b[k] / b.games - a[k] / a.games);
    const i = sorted.findIndex((x) => x === t || (x.player_id && x.player_id === t.player_id));
    return i >= 0 ? `${i + 1}/${sorted.length}` : "n/q";
  };
  const g = t.games;
  const onOff = t.player_id ? (await d.onOffProfiles(ids, { player: t.name })).find((r) => r.player_id === t.player_id) : undefined;
  const players = t.player_id ? [] : await d.findPlayers(t.name, ids);
  const pid = t.player_id ?? players[0]?.id ?? null;
  const slug = players[0]?.slug ?? null;
  if (emitCard) {
    card(ctx, {
      kind: "playerCard", name: t.name, team: t.team, competition: comp.name, gamesPlayed: g,
      totals: [
        { label: "PPG", value: d.fmt1(t.pts / g) }, { label: "RPG", value: d.fmt1(t.reb / g) }, { label: "APG", value: d.fmt1(t.ast / g) },
        { label: "SPG", value: d.fmt1(t.stl / g) }, { label: "BPG", value: d.fmt1(t.blk / g) }, { label: "MPG", value: d.fmt1(t.min / g) },
      ],
      shooting: [
        { label: "FG", made: t.fgm, attempted: t.fga, pct: d.pct(t.fgm, t.fga) }, { label: "3PT", made: t.tpm, attempted: t.tpa, pct: d.pct(t.tpm, t.tpa) }, { label: "FT", made: t.ftm, attempted: t.fta, pct: d.pct(t.ftm, t.fta) },
      ],
    });
  }
  addNav(ctx, { label: t.name, href: playerPath({ slug, full_name: t.name, id: pid }) ?? "", kind: "player" });
  addNav(ctx, { label: t.team, href: teamPath(t.team, comp.slug) ?? "", kind: "team" });
  const last5 = mine.slice(0, 5).map((x) => {
    const opp = x.side === "home" || (x.hometeam && d.isSameTeam(x.hometeam, x.team_name)) ? x.awayteam : x.hometeam;
    return `${d.ukDate(x.game_date)} v ${opp ?? "?"}: ${x.pts} pts, ${x.reb} reb, ${x.ast} ast, ${x.fgm}/${x.fga} FG, ${x.tpm}/${x.tpa} 3PT, +/- ${x.plus_minus ?? "–"}`;
  });
  const tsa = t.fga + 0.44 * t.fta;
  const text = [
    `${t.name} — ${t.team}, ${comp.name}: ${g} games, ${d.fmt1(t.min / g)} mpg`,
    `Averages: ${d.fmt1(t.pts / g)} pts, ${d.fmt1(t.reb / g)} reb (${d.fmt1(t.oreb / g)} off), ${d.fmt1(t.ast / g)} ast, ${d.fmt1(t.stl / g)} stl, ${d.fmt1(t.blk / g)} blk, ${d.fmt1(t.tov / g)} tov, +/- ${d.fmt1(t.plus_minus / g)}`,
    `Shooting: FG ${t.fgm}/${t.fga} (${d.pct(t.fgm, t.fga)}), 3PT ${t.tpm}/${t.tpa} (${d.pct(t.tpm, t.tpa)}), FT ${t.ftm}/${t.fta} (${d.pct(t.ftm, t.fta)}), eFG ${d.pct(t.fgm + 0.5 * t.tpm, t.fga)}, TS ${tsa ? ((t.pts / (2 * tsa)) * 100).toFixed(1) + "%" : "–"}`,
    `League rank (per game, qualified): pts ${rank("pts")}, reb ${rank("reb")}, ast ${rank("ast")}, stl ${rank("stl")}, blk ${rank("blk")}`,
    adv.length ? `Advanced (mean per game, ${adv.length} games): ORtg ${d.fmt1(d.mean(adv.map((a) => a.off_rating)))}, DRtg ${d.fmt1(d.mean(adv.map((a) => a.def_rating)))}, net ${d.fmt1(d.mean(adv.map((a) => a.net_rating)))}, USG ${d.fmt1(d.mean(adv.map((a) => a.usage_percent)))}%, PIE ${d.fmt1(d.mean(adv.map((a) => a.pie)))}, AST% ${d.fmt1(d.mean(adv.map((a) => a.ast_percent)))}, TOV% ${d.fmt1(d.mean(adv.map((a) => a.tov_percent)))}` : "Advanced: not available",
    onOff ? `On/off: team net rating ${d.fmt1(onOff.on_nrtg)} with them on vs ${d.fmt1(onOff.off_nrtg)} off (swing ${d.fmt1(onOff.adjusted_net_swing ?? onOff.raw_net_swing)}), ${d.fmt1(onOff.on_minutes)} on-court minutes, confidence ${onOff.sample_confidence ?? "?"}` : "On/off: not available",
    `Last ${last5.length} games:\n${last5.join("\n")}`,
    totals.length > 1 ? `Note: other players matched "${name}": ${totals.slice(1, 4).map((x) => `${x.name} (${x.team})`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
  return { text, totals: t };
}

export const getPlayer: ToolDef = {
  name: "get_player",
  description: "A player's season: averages, shooting splits, advanced numbers, league ranks, on/off impact and their last five games. Use for 'how is X doing', 'X's stats', 'is X a good shooter'.",
  input_schema: { type: "object", properties: { name: { type: "string" }, league: { type: "string", description: "Competition if not the one in scope" } }, required: ["name"] },
  schema: z.object({ name: z.string().min(2), league: z.string().optional() }),
  async run({ name, league }, ctx) {
    status(ctx, `Looking up ${name}…`);
    let comp: d.Competition | null = null;
    try { comp = await resolveLeague(ctx, league); } catch { comp = null; }
    if (comp) {
      const p = await playerProfile(ctx, name, comp, true);
      if (p) return p.text;
    }
    // Not in scope — find where they play.
    const comps = await d.visibleCompetitions();
    const found = await d.findPlayers(name, comps.map((c) => c.league_id));
    if (!found.length) return `No player named "${name}" found in any competition.`;
    const tried = new Set<string>();
    for (const f of found) {
      if (!f.league_id || tried.has(f.league_id)) continue;
      tried.add(f.league_id);
      const c = comps.find((x) => x.league_id === f.league_id);
      if (!c) continue;
      const p = await playerProfile(ctx, f.full_name, c, true);
      if (p) return `(Found in ${c.name}, not the competition in scope.)\n${p.text}`;
    }
    return `${found[0].full_name} is listed with ${found[0].team_name ?? "a team"} but has no game stats yet.`;
  },
};

async function teamProfile(ctx: ToolContext, name: string, comp: d.Competition, emitCard: boolean) {
  const ids = await d.leagueFamily(comp.league_id);
  const results = await d.finalResults(ids);
  const standings = d.computeStandings(results);
  const pos = standings.findIndex((r) => d.isSameTeam(r.team, name) || r.team.toLowerCase().includes(name.toLowerCase()));
  if (pos < 0) return null;
  const row = standings[pos];
  const games = (await d.teamGames(ids, { team: row.team })).filter((g) => d.isSameTeam(g.team_name, row.team));
  const t = totalsByTeam(games).get(row.team) ?? games.length ? Array.from(totalsByTeam(games).values())[0] : null;
  const adv = (await d.teamAdvanced(ids, { team: row.team })).filter((r) => d.isSameTeam(r.team_name, row.team));
  const pa = pointsAllowed(results).get(row.team);
  const players = Array.from(totalsByPlayer(await d.playerGames(ids, { team: row.team, limit: 1500 })).values())
    .filter((p) => d.isSameTeam(p.team, row.team)).sort((a, b) => b.pts / b.games - a.pts / a.games).slice(0, 6);
  const recent = results.filter((g) => d.isSameTeam(g.home_team, row.team) || d.isSameTeam(g.away_team, row.team)).slice(0, 5);
  const next = (await d.schedule(ids, new Date(), new Date(Date.now() + 45 * 86400000), row.team)).filter((s) => s.hometeam && s.awayteam && (d.isSameTeam(s.hometeam, row.team) || d.isSameTeam(s.awayteam, row.team)))[0];
  const gp = Math.max(1, row.wins + row.losses);
  const rk = (k: keyof d.AdvancedGame, lower = false) => {
    const all = new Map<string, number[]>();
    return (rowsAll: d.AdvancedGame[]) => {
      for (const r of rowsAll) { const v = r[k] as number | null; if (v != null) all.set(r.team_name, [...(all.get(r.team_name) ?? []), Number(v)]); }
      const ranked = Array.from(all.entries()).map(([n, vs]) => ({ n, v: d.mean(vs)! })).sort((a, b) => (lower ? a.v - b.v : b.v - a.v));
      const i = ranked.findIndex((x) => d.isSameTeam(x.n, row.team));
      return i >= 0 ? `${i + 1}/${ranked.length}` : "–";
    };
  };
  const advAll = adv.length ? await d.teamAdvanced(ids) : [];
  if (emitCard) {
    card(ctx, {
      kind: "table", title: `${row.team} — ${comp.name}`, subtitle: `${row.wins}-${row.losses}, ${pos + 1}${["st", "nd", "rd"][pos] ?? "th"} · last 5 ${row.last5 || "–"}`,
      columns: ["", "Value", "Rank"],
      rows: [
        ["Points for", d.fmt1(row.pf / gp), ""], ["Points against", d.fmt1(row.pa / gp), ""],
        ...(adv.length ? [
          ["Offensive rating", d.fmt1(d.mean(adv.map((a) => a.off_rating))), rk("off_rating")(advAll)],
          ["Defensive rating", d.fmt1(d.mean(adv.map((a) => a.def_rating))), rk("def_rating", true)(advAll)],
          ["Net rating", d.fmt1(d.mean(adv.map((a) => a.net_rating))), rk("net_rating")(advAll)],
          ["Pace", d.fmt1(d.mean(adv.map((a) => a.pace))), rk("pace")(advAll)],
          ["eFG%", d.fmt1(d.mean(adv.map((a) => a.efg_percent))), rk("efg_percent")(advAll)],
          ["TOV%", d.fmt1(d.mean(adv.map((a) => a.tov_percent))), rk("tov_percent", true)(advAll)],
          ["OREB%", d.fmt1(d.mean(adv.map((a) => a.oreb_percent))), rk("oreb_percent")(advAll)],
        ] as (string | number | null)[][] : []),
      ],
      highlightCol: 1,
    });
  }
  addNav(ctx, { label: row.team, href: teamPath(row.team, comp.slug) ?? "", kind: "team" });
  if (next) addNav(ctx, { label: `${next.hometeam} v ${next.awayteam}`, href: gamePath(comp.slug, next.game_key), kind: "game" });
  const text = [
    `${row.team} — ${comp.name}: ${row.wins}-${row.losses}, ${pos + 1} of ${standings.length}, last five ${row.last5 || "–"}, streak ${row.streak || "–"}`,
    `Scoring: ${d.fmt1(row.pf / gp)} for, ${d.fmt1(row.pa / gp)} against per game${pa ? "" : ""}`,
    t ? `Per game: ${d.fmt1(t.reb / t.games)} reb, ${d.fmt1(t.ast / t.games)} ast, ${d.fmt1(t.stl / t.games)} stl, ${d.fmt1(t.blk / t.games)} blk, ${d.fmt1(t.tov / t.games)} tov; FG ${d.pct(t.fgm, t.fga)}, 3PT ${d.pct(t.tpm, t.tpa)} on ${d.fmt1(t.tpa / t.games)} att, FT ${d.pct(t.ftm, t.fta)}; paint ${d.fmt1(t.pitp / t.games)}, fast break ${d.fmt1(t.fastbreak_pts / t.games)}, bench ${d.fmt1(t.bench_pts / t.games)}` : "",
    adv.length ? `Advanced (mean per game, rank in league): ORtg ${d.fmt1(d.mean(adv.map((a) => a.off_rating)))} (${rk("off_rating")(advAll)}), DRtg ${d.fmt1(d.mean(adv.map((a) => a.def_rating)))} (${rk("def_rating", true)(advAll)}), net ${d.fmt1(d.mean(adv.map((a) => a.net_rating)))} (${rk("net_rating")(advAll)}), pace ${d.fmt1(d.mean(adv.map((a) => a.pace)))} (${rk("pace")(advAll)}), eFG ${d.fmt1(d.mean(adv.map((a) => a.efg_percent)))}% (${rk("efg_percent")(advAll)}), TOV% ${d.fmt1(d.mean(adv.map((a) => a.tov_percent)))} (${rk("tov_percent", true)(advAll)}), OREB% ${d.fmt1(d.mean(adv.map((a) => a.oreb_percent)))} (${rk("oreb_percent")(advAll)}), opp eFG ${d.fmt1(d.mean(adv.map((a) => a.opp_efg_percent)))}% (${rk("opp_efg_percent", true)(advAll)})` : "Advanced: not available",
    players.length ? `Top players (ppg): ${players.map((p) => `${p.name} ${d.fmt1(p.pts / p.games)}/${d.fmt1(p.reb / p.games)}/${d.fmt1(p.ast / p.games)} in ${p.games}`).join("; ")}` : "",
    recent.length ? `Recent results:\n${recent.map((g) => `${d.ukDate(g.match_time)} ${g.home_team} ${g.home_score}-${g.away_score} ${g.away_team}`).join("\n")}` : "",
    next ? `Next: ${next.hometeam} v ${next.awayteam}, ${d.ukTime(next.matchtime)} UK (game_key ${next.game_key})` : "Next: no fixture in the next 45 days",
  ].filter(Boolean).join("\n");
  return { text, row };
}

export const getTeam: ToolDef = {
  name: "get_team",
  description: "A team's season in a competition: record and position, scoring for/against, per-game stats, advanced ratings with league ranks (four factors), top players, recent results and next fixture.",
  input_schema: { type: "object", properties: { name: { type: "string" }, league: { type: "string" } }, required: ["name"] },
  schema: z.object({ name: z.string().min(2), league: z.string().optional() }),
  async run({ name, league }, ctx) {
    status(ctx, `Looking up ${name}…`);
    let comp: d.Competition | null = null;
    try { comp = await resolveLeague(ctx, league); } catch { comp = null; }
    if (comp) { const t = await teamProfile(ctx, name, comp, true); if (t) return t.text; }
    const comps = await d.visibleCompetitions();
    const { supabaseAdmin } = await import("../supabaseServiceClient");
    const { data } = await supabaseAdmin.from("teams").select("name, league_id").ilike("name", `%${name}%`).in("league_id", comps.map((c) => c.league_id)).limit(10);
    for (const row of (data || []) as Array<{ name: string; league_id: string }>) {
      const c = comps.find((x) => x.league_id === row.league_id);
      if (!c) continue;
      const t = await teamProfile(ctx, row.name, c, true);
      if (t) return `(Found in ${c.name}, not the competition in scope.)\n${t.text}`;
    }
    return `No team matching "${name}" with completed games.`;
  },
};

export const compare: ToolDef = {
  name: "compare",
  description: "Side-by-side comparison of two players or two teams in a competition, with head-to-head results for teams. Use for 'X vs Y', 'who is better', 'compare'.",
  input_schema: { type: "object", properties: { kind: { type: "string", enum: ["players", "teams"] }, a: { type: "string" }, b: { type: "string" }, league: { type: "string" } }, required: ["kind", "a", "b"] },
  schema: z.object({ kind: z.enum(["players", "teams"]), a: z.string().min(2), b: z.string().min(2), league: z.string().optional() }),
  async run({ kind, a, b, league }, ctx) {
    const comp = await resolveLeague(ctx, league);
    status(ctx, `Comparing ${a} and ${b}…`);
    const ids = await d.leagueFamily(comp.league_id);
    const better = (x: number | null, y: number | null, lower = false): "a" | "b" | null => (x == null || y == null || x === y ? null : (lower ? x < y : x > y) ? "a" : "b");
    if (kind === "players") {
      const [pa, pb] = await Promise.all([playerProfile(ctx, a, comp, false), playerProfile(ctx, b, comp, false)]);
      if (!pa || !pb) return `Could not find ${!pa ? a : b} in ${comp.name}.`;
      const ta = pa.totals, tb = pb.totals;
      const g = (t: Totals) => Math.max(1, t.games);
      const line = (label: string, fa: number | null, fb: number | null, lower = false, suffix = "") => ({ label, a: `${d.fmt1(fa)}${suffix}`, b: `${d.fmt1(fb)}${suffix}`, better: better(fa, fb, lower) });
      const rows = [
        { label: "Games", a: `${ta.games}`, b: `${tb.games}`, better: null },
        line("Minutes", ta.min / g(ta), tb.min / g(tb)), line("Points", ta.pts / g(ta), tb.pts / g(tb)), line("Rebounds", ta.reb / g(ta), tb.reb / g(tb)),
        line("Assists", ta.ast / g(ta), tb.ast / g(tb)), line("Steals", ta.stl / g(ta), tb.stl / g(tb)), line("Blocks", ta.blk / g(ta), tb.blk / g(tb)), line("Turnovers", ta.tov / g(ta), tb.tov / g(tb), true),
        line("FG%", ta.fga ? (ta.fgm / ta.fga) * 100 : null, tb.fga ? (tb.fgm / tb.fga) * 100 : null, false, "%"),
        line("3P%", ta.tpa ? (ta.tpm / ta.tpa) * 100 : null, tb.tpa ? (tb.tpm / tb.tpa) * 100 : null, false, "%"),
        line("FT%", ta.fta ? (ta.ftm / ta.fta) * 100 : null, tb.fta ? (tb.ftm / tb.fta) * 100 : null, false, "%"),
        line("+/-", ta.plus_minus / g(ta), tb.plus_minus / g(tb)),
      ];
      card(ctx, { kind: "compare", title: `${comp.name} · per game`, a: `${ta.name} (${ta.team})`, b: `${tb.name} (${tb.team})`, rows });
      return `Comparison in ${comp.name} (per game):\n${rows.map((r) => `${r.label}: ${ta.name} ${r.a} | ${tb.name} ${r.b}`).join("\n")}\n\n${pa.text}\n\n${pb.text}`;
    }
    const [ta, tb] = await Promise.all([teamProfile(ctx, a, comp, false), teamProfile(ctx, b, comp, false)]);
    if (!ta || !tb) return `Could not find ${!ta ? a : b} in ${comp.name}.`;
    const results = await d.finalResults(ids);
    const h2h = results.filter((g) => (d.isSameTeam(g.home_team, ta.row.team) && d.isSameTeam(g.away_team, tb.row.team)) || (d.isSameTeam(g.home_team, tb.row.team) && d.isSameTeam(g.away_team, ta.row.team)));
    const advAll = await d.teamAdvanced(ids);
    const advOf = (team: string, k: keyof d.AdvancedGame) => d.mean(advAll.filter((r) => d.isSameTeam(r.team_name, team)).map((r) => r[k] as number | null));
    const gpa = Math.max(1, ta.row.wins + ta.row.losses), gpb = Math.max(1, tb.row.wins + tb.row.losses);
    const line = (label: string, fa: number | null, fb: number | null, lower = false) => ({ label, a: d.fmt1(fa), b: d.fmt1(fb), better: better(fa, fb, lower) });
    const rows = [
      { label: "Record", a: `${ta.row.wins}-${ta.row.losses}`, b: `${tb.row.wins}-${tb.row.losses}`, better: better(ta.row.wins / gpa, tb.row.wins / gpb) },
      line("Points for", ta.row.pf / gpa, tb.row.pf / gpb), line("Points against", ta.row.pa / gpa, tb.row.pa / gpb, true),
      line("Offensive rating", advOf(ta.row.team, "off_rating"), advOf(tb.row.team, "off_rating")), line("Defensive rating", advOf(ta.row.team, "def_rating"), advOf(tb.row.team, "def_rating"), true),
      line("Net rating", advOf(ta.row.team, "net_rating"), advOf(tb.row.team, "net_rating")), line("Pace", advOf(ta.row.team, "pace"), advOf(tb.row.team, "pace")),
      line("eFG%", advOf(ta.row.team, "efg_percent"), advOf(tb.row.team, "efg_percent")), line("TOV%", advOf(ta.row.team, "tov_percent"), advOf(tb.row.team, "tov_percent"), true),
      line("OREB%", advOf(ta.row.team, "oreb_percent"), advOf(tb.row.team, "oreb_percent")), line("Opp eFG%", advOf(ta.row.team, "opp_efg_percent"), advOf(tb.row.team, "opp_efg_percent"), true),
      { label: "Last 5", a: ta.row.last5 || "–", b: tb.row.last5 || "–", better: null },
    ];
    const h2hText = h2h.length ? h2h.map((g) => `${d.ukDate(g.match_time)} ${g.home_team} ${g.home_score}-${g.away_score} ${g.away_team}`).join("; ") : "no meetings yet this season";
    card(ctx, { kind: "compare", title: comp.name, a: ta.row.team, b: tb.row.team, rows, footer: `Head-to-head: ${h2hText}` });
    for (const g of h2h.slice(0, 2)) addNav(ctx, { label: `${g.home_team} v ${g.away_team}`, href: gamePath(comp.slug, g.game_key), kind: "game" });
    return `Comparison in ${comp.name}:\n${rows.map((r) => `${r.label}: ${ta.row.team} ${r.a} | ${tb.row.team} ${r.b}`).join("\n")}\nHead-to-head: ${h2hText}\n\n${ta.text}\n\n${tb.text}`;
  },
};

export const getScores: ToolDef = {
  name: "get_scores",
  description: "Scores and fixtures: live games, today's/yesterday's results, the last week's results, upcoming fixtures with tip-off times (UK), or a date. Omit league for all competitions. Use for 'what's on today', 'when do X play next', 'latest results', 'tip-off time'.",
  input_schema: { type: "object", properties: { range: { type: "string", enum: ["live", "today", "yesterday", "last_week", "upcoming", "date"] }, date: { type: "string", description: "YYYY-MM-DD when range is 'date'" }, league: { type: "string" }, team: { type: "string" }, all_competitions: { type: "boolean" } }, required: ["range"] },
  schema: z.object({ range: z.enum(["live", "today", "yesterday", "last_week", "upcoming", "date"]), date: z.string().optional(), league: z.string().optional(), team: z.string().optional(), all_competitions: z.boolean().optional() }),
  async run(input, ctx) {
    const now = new Date();
    const dayStart = (dt: Date) => { const x = new Date(dt); x.setUTCHours(0, 0, 0, 0); return x; };
    let from: Date, to: Date, title: string;
    switch (input.range) {
      case "live": from = new Date(now.getTime() - 4 * 3600e3); to = new Date(now.getTime() + 30 * 60e3); title = "Live now"; break;
      case "today": from = dayStart(now); to = new Date(dayStart(now).getTime() + 86400e3); title = "Today"; break;
      case "yesterday": from = new Date(dayStart(now).getTime() - 86400e3); to = dayStart(now); title = "Yesterday"; break;
      case "last_week": from = new Date(now.getTime() - 7 * 86400e3); to = now; title = "Last seven days"; break;
      case "upcoming": from = now; to = new Date(now.getTime() + 10 * 86400e3); title = "Coming up"; break;
      default: { const dt = input.date ? new Date(`${input.date}T00:00:00Z`) : dayStart(now); from = dt; to = new Date(dt.getTime() + 86400e3); title = d.ukDate(dt.toISOString()); }
    }
    let comp: d.Competition | null = null;
    if (!input.all_competitions) { try { comp = await resolveLeague(ctx, input.league); } catch { comp = null; } }
    status(ctx, comp ? `Checking ${comp.name} fixtures…` : "Checking fixtures across competitions…");
    const ids = comp ? await d.leagueFamily(comp.league_id) : (await d.visibleCompetitions()).map((c) => c.league_id);
    const rows = await d.schedule(ids, from, to, input.team);
    if (!rows.length) return `No games ${title.toLowerCase()}${comp ? ` in ${comp.name}` : ""}${input.team ? ` for ${input.team}` : ""}.`;
    const results = await d.resultsByKeys(rows.map((r) => r.game_key));
    const comps = new Map((await d.visibleCompetitions()).map((c) => [c.league_id, c]));
    const games = rows.map((r) => {
      const res = results.get(r.game_key);
      const hasScore = res != null && res.home_score != null && res.away_score != null;
      const state = res?.game_status === "Final" ? "final" : d.gameState(r.status, r.matchtime, hasScore);
      const c = comps.get(r.league_id);
      return { gameKey: r.game_key, leagueName: c?.name ?? r.competitionname, leagueSlug: c?.slug ?? null, home: r.hometeam ?? "TBC", away: r.awayteam ?? "TBC", homeScore: hasScore ? res!.home_score : null, awayScore: hasScore ? res!.away_score : null, state, matchTime: r.matchtime, statusLabel: r.status } as const;
    }).filter((g) => input.range !== "live" || g.state === "live");
    if (!games.length) return "No games are live right now.";
    card(ctx, { kind: "scores", title: `${title}${comp ? ` — ${comp.name}` : ""}`, games: games.slice(0, 30) });
    if (games.length <= 3) for (const g of games) addNav(ctx, { label: `${g.home} v ${g.away}`, href: gamePath(g.leagueSlug, g.gameKey), kind: "game" });
    return `${title}${comp ? `, ${comp.name}` : ""} (${games.length} games):\n` + games.slice(0, 40).map((g) =>
      `${d.ukTime(g.matchTime)} UK — ${g.home} ${g.homeScore ?? ""}${g.homeScore != null ? "-" : "v"}${g.awayScore ?? ""} ${g.away} [${g.state}${g.leagueName ? `, ${g.leagueName}` : ""}] game_key ${g.gameKey}`).join("\n");
  },
};

export const getGame: ToolDef = {
  name: "get_game",
  description: "One game: final/live score by quarter, team shooting and four factors, lead changes, and the top performers from the box score. Give a game_key (from get_scores or the page in scope) or two team names and optionally a date.",
  input_schema: { type: "object", properties: { game_key: { type: "string" }, home: { type: "string" }, away: { type: "string" }, league: { type: "string" }, date: { type: "string" } } },
  schema: z.object({ game_key: z.string().optional(), home: z.string().optional(), away: z.string().optional(), league: z.string().optional(), date: z.string().optional() }),
  async run(input, ctx) {
    let key = input.game_key ?? (!input.home && !input.away ? ctx.scope.gameKey ?? null : null);
    let comp: d.Competition | null = null;
    if (!key) {
      try { comp = await resolveLeague(ctx, input.league); } catch { comp = null; }
      const ids = comp ? await d.leagueFamily(comp.league_id) : (await d.visibleCompetitions()).map((c) => c.league_id);
      const team = input.home ?? input.away ?? "";
      const span = input.date ? [new Date(`${input.date}T00:00:00Z`), new Date(new Date(`${input.date}T00:00:00Z`).getTime() + 86400e3)] : [new Date(Date.now() - 120 * 86400e3), new Date(Date.now() + 30 * 86400e3)];
      const rows = (await d.schedule(ids, span[0], span[1], team)).filter((r) =>
        (!input.home || (r.hometeam && d.isSameTeam(r.hometeam, input.home)) || (r.awayteam && d.isSameTeam(r.awayteam, input.home))) &&
        (!input.away || (r.hometeam && d.isSameTeam(r.hometeam, input.away)) || (r.awayteam && d.isSameTeam(r.awayteam, input.away))));
      const past = rows.filter((r) => r.matchtime && new Date(r.matchtime).getTime() <= Date.now() + 3 * 3600e3);
      key = (past[past.length - 1] ?? rows[0])?.game_key ?? null;
      if (!key) return `No game found between ${input.home ?? "?"} and ${input.away ?? "?"}.`;
    }
    status(ctx, "Opening the game…");
    const g = await d.gameDetail(key);
    if (!g) return `No game detail for ${key} yet (it may not have started).`;
    const c = (await d.visibleCompetitions()).find((x) => x.league_id === g.league_id) ?? null;
    const box = await d.boxScore(key);
    const hasScore = g.home_score != null && g.away_score != null;
    const state = g.game_status === "Final" ? "final" : d.gameState(g.game_status, g.match_time, hasScore);
    const f = (label: string, h: any, a: any, suffix = "") => ({ label, home: `${h == null ? "–" : typeof h === "number" ? d.fmt1(h) : h}${suffix}`, away: `${a == null ? "–" : typeof a === "number" ? d.fmt1(a) : a}${suffix}` });
    const leaders = ["home", "away"].flatMap((side) => {
      const team = side === "home" ? g.home_team : g.away_team;
      return box.filter((b) => d.isSameTeam(b.team_name, team)).slice(0, 2).map((b) => ({ team, name: b.player_name, line: `${b.points} pts, ${b.rebounds} reb, ${b.assists} ast, ${b.fgm}/${b.fga} FG` }));
    });
    card(ctx, {
      kind: "game", title: `${g.home_team} v ${g.away_team}`, gameKey: key, leagueSlug: c?.slug ?? null, state, matchTime: g.match_time,
      home: { name: g.home_team, score: g.home_score, quarters: [g.home_q1, g.home_q2, g.home_q3, g.home_q4] },
      away: { name: g.away_team, score: g.away_score, quarters: [g.away_q1, g.away_q2, g.away_q3, g.away_q4] },
      factors: [f("FG%", g.home_fg_pct, g.away_fg_pct, "%"), f("3PT", `${g.home_3pm}/${g.home_3pa}`, `${g.away_3pm}/${g.away_3pa}`), f("FT", `${g.home_ftm}/${g.home_fta}`, `${g.away_ftm}/${g.away_fta}`), f("Rebounds", g.home_reb, g.away_reb), f("Assists", g.home_ast, g.away_ast), f("Turnovers", g.home_tov, g.away_tov), f("Paint", g.home_pitp, g.away_pitp), f("Fast break", g.home_fastbreak_pts, g.away_fastbreak_pts), f("Bench", g.home_bench_pts, g.away_bench_pts), f("eFG%", g.home_efg_pct, g.away_efg_pct, "%"), f("ORtg", g.home_off_rtg, g.away_off_rtg)],
      leaders,
    });
    addNav(ctx, { label: "Open game", href: gamePath(c?.slug, key), kind: "game" });
    const top = box.slice(0, 6).map((b) => `${b.player_name} (${b.team_name}): ${b.points} pts, ${b.rebounds} reb, ${b.assists} ast, ${b.stl ?? b.steals} stl, ${b.fgm}/${b.fga} FG, ${b.three_pm}/${b.three_pa} 3PT, ${b.minutes} min, +/- ${b.plus_minus}`).join("\n");
    return [
      `${g.home_team} ${g.home_score ?? "–"}-${g.away_score ?? "–"} ${g.away_team} [${state}] ${d.ukTime(g.match_time)} UK, ${c?.name ?? g.competition_name ?? ""} (game_key ${key})`,
      `Quarters: ${g.home_team} ${[g.home_q1, g.home_q2, g.home_q3, g.home_q4].map((q: any) => q ?? "–").join("/")} · ${g.away_team} ${[g.away_q1, g.away_q2, g.away_q3, g.away_q4].map((q: any) => q ?? "–").join("/")}; lead changes ${g.lead_changes ?? "–"}, ties ${g.times_tied ?? "–"}, biggest lead ${g.home_biggest_lead ?? "–"}/${g.away_biggest_lead ?? "–"}`,
      `${g.home_team}: FG ${g.home_fgm}/${g.home_fga} (${d.fmt1(g.home_fg_pct)}%), 3PT ${g.home_3pm}/${g.home_3pa}, FT ${g.home_ftm}/${g.home_fta}, reb ${g.home_reb} (${g.home_oreb} off), ast ${g.home_ast}, tov ${g.home_tov}, stl ${g.home_stl}, blk ${g.home_blk}, paint ${g.home_pitp}, FB ${g.home_fastbreak_pts}, 2nd chance ${g.home_second_chance_pts}, off TOs ${g.home_pts_off_tov}, bench ${g.home_bench_pts}, eFG ${d.fmt1(g.home_efg_pct)}%, TS ${d.fmt1(g.home_ts_pct)}%, pace ${d.fmt1(g.home_pace)}, ORtg ${d.fmt1(g.home_off_rtg)}, DRtg ${d.fmt1(g.home_def_rtg)}`,
      `${g.away_team}: FG ${g.away_fgm}/${g.away_fga} (${d.fmt1(g.away_fg_pct)}%), 3PT ${g.away_3pm}/${g.away_3pa}, FT ${g.away_ftm}/${g.away_fta}, reb ${g.away_reb} (${g.away_oreb} off), ast ${g.away_ast}, tov ${g.away_tov}, stl ${g.away_stl}, blk ${g.away_blk}, paint ${g.away_pitp}, FB ${g.away_fastbreak_pts}, 2nd chance ${g.away_second_chance_pts}, off TOs ${g.away_pts_off_tov}, bench ${g.away_bench_pts}, eFG ${d.fmt1(g.away_efg_pct)}%, TS ${d.fmt1(g.away_ts_pct)}%, pace ${d.fmt1(g.away_pace)}, ORtg ${d.fmt1(g.away_off_rtg)}, DRtg ${d.fmt1(g.away_def_rtg)}`,
      top ? `Top box-score lines:\n${top}` : "Box score not available yet.",
    ].join("\n");
  },
};

export const getOnOff: ToolDef = {
  name: "get_on_off",
  description: "On/off court impact: how a team's net rating changes with a player on the floor versus off. Ranks the biggest swings in a competition, or for one team, or returns one player's profile. Note sample confidence.",
  input_schema: { type: "object", properties: { league: { type: "string" }, player: { type: "string" }, team: { type: "string" }, limit: { type: "integer" }, lowest: { type: "boolean", description: "Rank the most negative swings instead" } } },
  schema: z.object({ league: z.string().optional(), player: z.string().optional(), team: z.string().optional(), limit: z.number().int().min(1).max(25).optional(), lowest: z.boolean().optional() }),
  async run(input, ctx) {
    const comp = await resolveLeague(ctx, input.league);
    status(ctx, `Working out on/off impact in ${comp.name}…`);
    const ids = await d.leagueFamily(comp.league_id);
    const teamRow = input.team ? await d.teamIdByName(ids, input.team) : null;
    const rows = await d.onOffProfiles(ids, { player: input.player, teamId: teamRow?.team_id, eligibleOnly: !input.player });
    if (!rows.length) return `No on/off data${input.player ? ` for ${input.player}` : ""} in ${comp.name} yet (needs lineup tracking from play-by-play).`;
    const swing = (r: d.OnOffRow) => r.adjusted_net_swing ?? r.raw_net_swing ?? ((r.on_nrtg ?? 0) - (r.off_nrtg ?? 0));
    const ranked = [...rows].sort((a, b) => (input.lowest ? swing(a) - swing(b) : swing(b) - swing(a))).slice(0, input.limit ?? 10);
    card(ctx, {
      kind: "table", title: `On/off impact — ${teamRow?.name ?? comp.name}`, subtitle: "Team net rating with the player on vs off, per 100 possessions",
      columns: ["Player", "On", "Off", "Swing", "Min on", "Confidence"],
      rows: ranked.map((r) => [r.player_name, d.fmt1(r.on_nrtg), d.fmt1(r.off_nrtg), (swing(r) >= 0 ? "+" : "") + d.fmt1(swing(r)), Math.round(r.on_minutes ?? 0), r.sample_confidence ?? "–"]),
      highlightCol: 3,
    });
    addNav(ctx, leagueNav(comp));
    return `On/off (team net rating per 100 possessions on vs off), ${teamRow?.name ?? comp.name}:\n` + ranked.map((r, i) => `${i + 1}. ${r.player_name}: on ${d.fmt1(r.on_nrtg)}, off ${d.fmt1(r.off_nrtg)}, swing ${d.fmt1(swing(r))}; ORtg ${d.fmt1(r.on_ortg)}/${d.fmt1(r.off_ortg)}, DRtg ${d.fmt1(r.on_drtg)}/${d.fmt1(r.off_drtg)}; ${Math.round(r.on_minutes ?? 0)} min on, ${r.games} games, confidence ${r.sample_confidence ?? "?"}${r.impact_summary_label ? ` (${r.impact_summary_label})` : ""}`).join("\n");
  },
};

export const getGameRecords: ToolDef = {
  name: "get_game_records",
  description: "Best single-game performances this season for a stat (players or teams): season highs, 'most points in a game', biggest wins (stat 'margin').",
  input_schema: { type: "object", properties: { stat: { type: "string", enum: ["pts", "reb", "ast", "stl", "blk", "tpm", "plus_minus", "margin"] }, scope: { type: "string", enum: ["players", "teams"] }, league: { type: "string" }, team: { type: "string" }, limit: { type: "integer" } }, required: ["stat"] },
  schema: z.object({ stat: z.enum(["pts", "reb", "ast", "stl", "blk", "tpm", "plus_minus", "margin"]), scope: z.enum(["players", "teams"]).optional(), league: z.string().optional(), team: z.string().optional(), limit: z.number().int().min(1).max(20).optional() }),
  async run(input, ctx) {
    const comp = await resolveLeague(ctx, input.league);
    status(ctx, `Finding season highs in ${comp.name}…`);
    const ids = await d.leagueFamily(comp.league_id);
    const limit = input.limit ?? 8;
    if (input.stat === "margin") {
      const results = await d.finalResults(ids);
      const ranked = results.map((g) => ({ g, m: Math.abs(g.home_score - g.away_score) })).sort((a, b) => b.m - a.m).slice(0, limit);
      card(ctx, { kind: "table", title: `Biggest margins — ${comp.name}`, columns: ["Date", "Game", "Margin"], rows: ranked.map((x) => [d.ukDate(x.g.match_time), `${x.g.home_team} ${x.g.home_score}-${x.g.away_score} ${x.g.away_team}`, x.m]), highlightCol: 2 });
      return `Biggest margins, ${comp.name}:\n` + ranked.map((x, i) => `${i + 1}. ${d.ukDate(x.g.match_time)} ${x.g.home_team} ${x.g.home_score}-${x.g.away_score} ${x.g.away_team} (by ${x.m}, game_key ${x.g.game_key})`).join("\n");
    }
    const label = PLAYER_TRAD[input.stat]?.label ?? input.stat;
    if ((input.scope ?? "players") === "players") {
      const games = (await d.playerGames(ids, { team: input.team })).filter((g) => (g as any)[input.stat] != null);
      const ranked = [...games].sort((a, b) => ((b as any)[input.stat] ?? 0) - ((a as any)[input.stat] ?? 0)).slice(0, limit);
      card(ctx, { kind: "table", title: `${label} — single-game highs, ${comp.name}`, columns: ["Player", "Game", label], rows: ranked.map((g) => [`${g.player_name} (${g.team_name})`, `${d.ukDate(g.game_date)} ${g.hometeam ?? ""} v ${g.awayteam ?? ""}`, (g as any)[input.stat]]), highlightCol: 2 });
      return `${label} single-game highs, ${comp.name}:\n` + ranked.map((g, i) => `${i + 1}. ${g.player_name} (${g.team_name}) ${(g as any)[input.stat]} — ${d.ukDate(g.game_date)} ${g.hometeam} v ${g.awayteam}: ${g.pts} pts, ${g.reb} reb, ${g.ast} ast, ${g.fgm}/${g.fga} FG (game_key ${g.game_key})`).join("\n");
    }
    const games = (await d.teamGames(ids, { team: input.team })).filter((g) => (g as any)[input.stat] != null);
    const ranked = [...games].sort((a, b) => ((b as any)[input.stat] ?? 0) - ((a as any)[input.stat] ?? 0)).slice(0, limit);
    card(ctx, { kind: "table", title: `${label} — team single-game highs, ${comp.name}`, columns: ["Team", "Game", label], rows: ranked.map((g) => [g.team_name, `${d.ukDate(g.game_date)} ${g.hometeam ?? ""} v ${g.awayteam ?? ""}`, (g as any)[input.stat]]), highlightCol: 2 });
    return `${label} team single-game highs, ${comp.name}:\n` + ranked.map((g, i) => `${i + 1}. ${g.team_name} ${(g as any)[input.stat]} — ${d.ukDate(g.game_date)} ${g.hometeam} v ${g.awayteam} (game_key ${g.game_key})`).join("\n");
  },
};

/** Scoring runs of at least `minRun` unanswered points, from the running score on each event. */
interface Run { teamNo: 1 | 2; team: string; points: number; from: string; to: string; period: number | null; startAction: number | null; endAction: number | null }

function scoringRuns(events: d.LiveEvent[], home: string, away: string, minRun = 7): Run[] {
  const runs: Run[] = [];
  let cur: { team: 1 | 2; points: number; from: string; period: number | null; startAction: number | null; lastAction: number | null } | null = null;
  let last: [number, number] | null = null;
  const close = (to: string) => {
    if (cur && cur.points >= minRun) runs.push({ teamNo: cur.team, team: cur.team === 1 ? home : away, points: cur.points, from: cur.from, to, period: cur.period, startAction: cur.startAction, endAction: cur.lastAction });
  };
  for (const e of events) {
    if (e.team_score == null || e.opp_score == null || !e.team_no) continue;
    const scores: [number, number] = e.team_no === 1 ? [e.team_score, e.opp_score] : [e.opp_score, e.team_score];
    if (!last) { last = scores; continue; }
    const dh = scores[0] - last[0], da = scores[1] - last[1];
    last = scores;
    if (dh <= 0 && da <= 0) continue;
    const who: 1 | 2 = dh > 0 ? 1 : 2;
    const pts = dh > 0 ? dh : da;
    if (cur && cur.team === who) { cur.points += pts; cur.lastAction = e.action_number; }
    else {
      close(`Q${e.period} ${e.clock}`);
      cur = { team: who, points: pts, from: `Q${e.period} ${e.clock}`, period: e.period, startAction: e.action_number, lastAction: e.action_number };
    }
  }
  close("end");
  return runs.sort((a, b) => b.points - a.points);
}

/** The five on court for the scoring team when a run started, from that game's lineup stints. */
function lineupDuringRun(run: Run, stints: d.LineupStint[], teamId: string | null): string | null {
  if (!teamId || run.startAction == null) return null;
  const hit = stints.find((s) => s.team_id === teamId && s.start_action != null && s.end_action != null && s.start_action <= run.startAction! && run.startAction! <= s.end_action);
  return hit?.lineup_names?.map((n) => n.split(" ").slice(-1)[0]).join(", ") ?? null;
}

export const getPlayByPlay: ToolDef = {
  name: "get_play_by_play",
  description: "Coaches Hub: the play-by-play of a game. mode 'runs' finds unanswered scoring runs; 'scoring' lists every score; 'clutch' is the last five minutes of Q4/OT; 'player' is one player's actions; 'all' is the full feed for one period. Use the game in scope unless a game_key is given.",
  surfaces: ["coaches-hub"],
  input_schema: { type: "object", properties: { game_key: { type: "string" }, mode: { type: "string", enum: ["runs", "scoring", "clutch", "player", "all"] }, period: { type: "integer" }, player: { type: "string" }, last_n: { type: "integer" } }, required: ["mode"] },
  schema: z.object({ game_key: z.string().optional(), mode: z.enum(["runs", "scoring", "clutch", "player", "all"]), period: z.number().int().min(1).max(8).optional(), player: z.string().optional(), last_n: z.number().int().min(5).max(150).optional() }),
  async run(input, ctx) {
    const key = input.game_key ?? ctx.scope.gameKey;
    if (!key) return "No game in scope — ask which game, or call get_scores to find its game_key.";
    status(ctx, "Reading the play-by-play…");
    const [events, g] = await Promise.all([d.playByPlay(key, input.mode === "all" ? input.period : undefined), d.gameDetail(key)]);
    if (!events.length) return "No play-by-play for this game.";
    const home = g?.home_team ?? "Home", away = g?.away_team ?? "Away";
    const teamOf = (e: d.LiveEvent) => (e.team_no === 1 ? home : e.team_no === 2 ? away : "");
    const line = (e: d.LiveEvent) => `Q${e.period} ${e.clock ?? ""} ${teamOf(e)} — ${e.description ?? `${e.player_name ?? ""} ${e.action_type ?? ""} ${e.sub_type ?? ""}`.trim()}${e.score ? ` [${e.score}]` : e.team_score != null ? ` [${e.team_no === 1 ? `${e.team_score}-${e.opp_score}` : `${e.opp_score}-${e.team_score}`}]` : ""}`;
    if (input.mode === "runs") {
      const runs = scoringRuns(events, home, away).slice(0, 10);
      if (!runs.length) return "No run of 7+ unanswered points.";
      const stints = await d.lineupStints(null, { gameKey: key });
      const teamIds: Record<1 | 2, string | null> = { 1: events.find((e) => e.team_no === 1 && e.team_id)?.team_id ?? null, 2: events.find((e) => e.team_no === 2 && e.team_id)?.team_id ?? null };
      const withLineups = runs.map((r) => ({ ...r, lineup: lineupDuringRun(r, stints, teamIds[r.teamNo]) }));
      card(ctx, { kind: "table", title: `Scoring runs — ${home} v ${away}`, columns: ["Team", "Run", "From", "To", "On court"], rows: withLineups.map((r) => [r.team, `${r.points}-0`, r.from, r.to, r.lineup ?? "–"]), highlightCol: 1 });
      return `Unanswered runs of 7+ (on-court five is the lineup when the run began):\n` + withLineups.map((r) => `${r.team} ${r.points}-0 from ${r.from} to ${r.to}${r.lineup ? ` — on court: ${r.lineup}` : " — lineup not tracked"}`).join("\n");
    }
    let pick = events;
    if (input.mode === "scoring") pick = events.filter((e) => e.scoring && e.success !== false && (e.points ?? 0) > 0);
    if (input.mode === "clutch") pick = events.filter((e) => (e.period ?? 0) >= 4 && e.clock && (() => { const m = /^(\d+):/.exec(e.clock!); return m ? Number(m[1]) < 5 : false; })());
    if (input.mode === "player") pick = events.filter((e) => input.player && (e.player_name ?? "").toLowerCase().includes(input.player.toLowerCase()));
    if (input.period && input.mode !== "all") pick = pick.filter((e) => e.period === input.period);
    const n = input.last_n ?? (input.mode === "all" ? 80 : 60);
    const shown = pick.slice(-n);
    return `${home} v ${away}, ${input.mode}${input.period ? ` Q${input.period}` : ""}, ${shown.length} of ${pick.length} events (last ${n}):\n` + shown.map(line).join("\n");
  },
};

export const getLineups: ToolDef = {
  name: "get_lineups",
  description: "Coaches Hub: five-man lineups for a team by minutes with net rating, for one game or the whole competition.",
  surfaces: ["coaches-hub"],
  input_schema: { type: "object", properties: { team: { type: "string" }, game_key: { type: "string" }, league: { type: "string" }, limit: { type: "integer" } }, required: ["team"] },
  schema: z.object({ team: z.string().min(2), game_key: z.string().optional(), league: z.string().optional(), limit: z.number().int().min(1).max(20).optional() }),
  async run(input, ctx) {
    const comp = await resolveLeague(ctx, input.league);
    const ids = await d.leagueFamily(comp.league_id);
    const teamRow = await d.teamIdByName(ids, input.team);
    if (!teamRow) return `No team "${input.team}" in ${comp.name}.`;
    status(ctx, `Totting up ${teamRow.name} lineups…`);
    const stints = await d.lineupStints(ids, { gameKey: input.game_key ?? (input.team ? undefined : ctx.scope.gameKey ?? undefined), teamId: teamRow.team_id });
    if (!stints.length) return `No lineup stints for ${teamRow.name}.`;
    const by = new Map<string, { names: string[]; secs: number; pf: number; pa: number; poss: number; games: Set<string> }>();
    for (const s of stints) {
      const e = by.get(s.lineup_key) ?? { names: s.lineup_names ?? [], secs: 0, pf: 0, pa: 0, poss: 0, games: new Set<string>() };
      e.secs += s.seconds_played ?? 0; e.pf += s.points_for ?? 0; e.pa += s.points_against ?? 0; e.poss += ((s.possessions_for ?? 0) + (s.possessions_against ?? 0)) / 2; e.games.add(s.game_key);
      by.set(s.lineup_key, e);
    }
    const ranked = Array.from(by.values()).sort((a, b) => b.secs - a.secs).slice(0, input.limit ?? 8)
      .map((e) => ({ ...e, mins: e.secs / 60, net: e.poss > 0 ? ((e.pf - e.pa) / e.poss) * 100 : null }));
    card(ctx, { kind: "table", title: `${teamRow.name} lineups${input.game_key ? "" : ` — ${comp.name}`}`, subtitle: "By minutes; net is per 100 possessions", columns: ["Lineup", "Min", "+/-", "Net/100", "GP"], rows: ranked.map((e) => [e.names.map((n) => n.split(" ").slice(-1)[0]).join(", "), d.fmt1(e.mins), e.pf - e.pa, e.net == null ? "–" : d.fmt1(e.net), e.games.size]), highlightCol: 3 });
    return `${teamRow.name} lineups by minutes:\n` + ranked.map((e, i) => `${i + 1}. ${e.names.join(", ")}: ${d.fmt1(e.mins)} min, ${e.pf}-${e.pa} (${e.pf - e.pa >= 0 ? "+" : ""}${e.pf - e.pa}), net ${e.net == null ? "–" : d.fmt1(e.net)} per 100 over ${e.games.size} games${e.mins < 15 ? " (small sample)" : ""}`).join("\n");
  },
};

export const suggestFollowUps: ToolDef = {
  name: "suggest_follow_ups",
  description: "Call once at the very end of your answer with three short follow-up questions the user might ask next, phrased as they would type them. They become tappable chips.",
  input_schema: { type: "object", properties: { questions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 } }, required: ["questions"] },
  schema: z.object({ questions: z.array(z.string().min(3).max(90)).min(1).max(3) }),
  async run({ questions }, ctx) {
    ctx.followUps = questions;
    return "Noted.";
  },
};

export const ALL_TOOLS: ToolDef[] = [searchEntities, getStandings, getLeaders, getPlayer, getTeam, compare, getScores, getGame, getOnOff, getGameRecords, getPlayByPlay, getLineups, suggestFollowUps];

export function toolsFor(surface: AskSurface): ToolDef[] {
  return ALL_TOOLS.filter((t) => !t.surfaces || t.surfaces.includes(surface));
}
