/**
 * Try Ask Swish from the terminal, without the site or a sign-in:
 *
 *   npx tsx scripts/ask-swish-try.ts "Who leads NBL D1 in scoring?"
 *   npx tsx scripts/ask-swish-try.ts --league nbl-division-1-2026-2027 --surface coaches-hub "Biggest runs in the last game?"
 *
 * Prints status lines, cards (as JSON) and the streamed answer. Uses
 * ANTHROPIC_API_KEY from the environment, else the Vault secret the server
 * uses. Each run costs one model call.
 */
import "dotenv/config";
import { runAskSwish } from "../server/askSwish/agent";
import { anthropicClientOptions } from "../server/askSwish/anthropicClient";
import { findCompetition } from "../server/askSwish/data";
import { ALL_TOOLS, type ToolContext } from "../server/askSwish/tools";
import type { AskSurface } from "../shared/askSwish";

const OPTS = ["league", "surface", "model", "game", "tool", "input"];

/** `--tool get_leaders --input '{"stat":"pts"}'` runs one tool with no model call. */
async function runTool(name: string, input: string, scope: Record<string, unknown>, surface: AskSurface) {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  if (!tool) { console.error(`No tool ${name}. Tools: ${ALL_TOOLS.map((t) => t.name).join(", ")}`); process.exit(1); }
  const parsed = tool.schema.safeParse(JSON.parse(input || "{}"));
  if (!parsed.success) { console.error("Invalid input:", parsed.error.issues); process.exit(1); }
  const ctx: ToolContext = {
    scope, surface, nav: [], followUps: null, ran: [],
    emit: (e) => { if (e.type === "card") console.log(`[card ${e.card.kind}] ${JSON.stringify(e.card)}`); else if (e.type === "status") console.log(`[${e.text}]`); },
  };
  const started = Date.now();
  console.log(await tool.run(parsed.data, ctx));
  if (ctx.nav.length) console.log(`[nav] ${JSON.stringify(ctx.nav)}`);
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const question = args.filter((a, i) => !a.startsWith("--") && !OPTS.some((o) => args[i - 1] === `--${o}`)).join(" ");

  if (opt("tool")) {
    const league = opt("league") ? await findCompetition(opt("league")!) : null;
    await runTool(opt("tool")!, opt("input") ?? "{}", league ? { leagueId: league.league_id, leagueName: league.name, leagueSlug: league.slug, gameKey: opt("game") ?? null } : { gameKey: opt("game") ?? null }, (opt("surface") as AskSurface) ?? "site");
    return;
  }
  if (!question) { console.error("Give a question, or --tool <name> --input '{...}'."); process.exit(1); }

  const client = await anthropicClientOptions();
  if (!client) { console.error("No ANTHROPIC_API_KEY in the environment and no shared secret for the anthropic-proxy function."); process.exit(2); }
  console.log(client.baseURL ? "(via anthropic-proxy)" : "(direct)");

  const league = opt("league") ? await findCompetition(opt("league")!) : null;
  const scope = league ? { leagueId: league.league_id, leagueName: league.name, leagueSlug: league.slug, gameKey: opt("game") ?? null } : { gameKey: opt("game") ?? null };
  const started = Date.now();
  const usage = await runAskSwish({
    client,
    model: opt("model") ?? process.env.ASK_SWISH_MODEL ?? "claude-sonnet-5-5",
    effort: "medium",
    messages: [{ role: "user", content: question }],
    scope,
    surface: (opt("surface") as AskSurface) ?? "site",
    signal: new AbortController().signal,
    emit: (e) => {
      if (e.type === "text") process.stdout.write(e.delta);
      else if (e.type === "status") console.log(`\n[${e.text}]`);
      else if (e.type === "card") console.log(`\n[card ${e.card.kind}] ${JSON.stringify(e.card).slice(0, 600)}`);
      else console.log(`\n[${e.type}] ${JSON.stringify(e).slice(0, 400)}`);
    },
  });
  console.log(`\n\n(${((Date.now() - started) / 1000).toFixed(1)}s) usage: ${JSON.stringify(usage)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
