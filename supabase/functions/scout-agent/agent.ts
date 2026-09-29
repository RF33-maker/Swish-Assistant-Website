/**
 * The reasoning step: turns a fact pack into a game plan.
 *
 * The model only ever sees pre-computed facts (facts.ts). It is told to quote
 * nothing that isn't in them, and the output is schema-constrained so the
 * site can render every part without parsing prose.
 */

const CALL = { type: "object", additionalProperties: false, required: ["call", "why"], properties: { call: { type: "string", description: "Imperative, max 12 words." }, why: { type: "string", description: "One sentence with the supporting numbers." } } } as const;

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "freeInsight", "howTheyPlay", "defendingThem", "attackingThem", "playersToStop", "lineupsAndRotation", "lateGame", "gamePlan", "confidence", "confidenceReason"],
  properties: {
    headline: { type: "string", description: "One sentence, max 18 words: the single most important thing about this opponent." },
    summary: { type: "string", description: "2-3 sentences: who they are and how the game is likely to be decided." },
    freeInsight: { type: "string", description: "One standalone, genuinely useful sentence a non-paying visitor can see. Quote one number." },
    howTheyPlay: { type: "string", description: "3-4 sentences on their identity: tempo, shot diet, where points come from, what they give up." },
    defendingThem: {
      type: "object", additionalProperties: false, required: ["summary", "keys"],
      properties: {
        summary: { type: "string", description: "2 sentences: the defensive approach you recommend against their offence." },
        keys: { type: "array", items: CALL, description: "2-4 defensive calls." },
      },
    },
    attackingThem: {
      type: "object", additionalProperties: false, required: ["summary", "keys"],
      properties: {
        summary: { type: "string", description: "2 sentences: where their defence is vulnerable." },
        keys: { type: "array", items: CALL, description: "2-4 offensive calls." },
      },
    },
    playersToStop: {
      type: "array", description: "2-4 players, most dangerous first. Only players on the recent roster.",
      items: {
        type: "object", additionalProperties: false, required: ["name", "threat", "plan"],
        properties: {
          name: { type: "string", description: "Exactly as given in the facts." },
          threat: { type: "string", description: "One sentence: what makes them dangerous, with numbers." },
          plan: { type: "string", description: "One sentence: how to guard them (force a side, deny, help off, go under, attack them on the other end, draw fouls on them)." },
        },
      },
    },
    lineupsAndRotation: {
      type: "object", additionalProperties: false, required: ["summary", "watchFor"],
      properties: {
        summary: { type: "string", description: "2-3 sentences: who starts, who closes, how deep they go, which units win and lose." },
        watchFor: { type: "array", items: { type: "string" }, description: "1-3 in-game triggers, e.g. 'When X sits, ...' or 'Their bench unit with Y has been outscored ...'." },
      },
    },
    lateGame: { type: "string", description: "2 sentences on close-game and run behaviour, and what that means for your timeouts and closing." },
    gamePlan: {
      type: "array", description: "The 3-5 things that win this game, most important first.",
      items: {
        type: "object", additionalProperties: false, required: ["call", "why", "target"],
        properties: {
          call: { type: "string", description: "Imperative, max 12 words. e.g. 'Load up on the drive, concede the above-the-break three'." },
          why: { type: "string", description: "One sentence tying it to specific facts." },
          target: { type: "string", description: "A measurable in-game target the bench can track, e.g. 'Under 10 fast-break points'." },
        },
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    confidenceReason: { type: "string", description: "One sentence on sample size and data coverage." },
  },
} as const;

/**
 * The free look: a short read written by a cheaper model, shared by every
 * non-paying visitor who opens this opponent. Enough to show the product is
 * real; the full plan (defensive/offensive keys, players to stop, lineup
 * triggers, late game) stays behind the coach plan.
 */
export const PREVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "freeInsight", "gamePlan", "confidence", "confidenceReason"],
  properties: {
    headline: PLAN_SCHEMA.properties.headline,
    summary: PLAN_SCHEMA.properties.summary,
    freeInsight: PLAN_SCHEMA.properties.freeInsight,
    gamePlan: { ...PLAN_SCHEMA.properties.gamePlan, description: "Exactly 2 of the most important things that win this game." },
    confidence: PLAN_SCHEMA.properties.confidence,
    confidenceReason: PLAN_SCHEMA.properties.confidenceReason,
  },
} as const;

export type Tier = "full" | "preview";

export interface GamePlan {
  headline: string;
  summary: string;
  freeInsight: string;
  howTheyPlay: string;
  defendingThem: { summary: string; keys: Array<{ call: string; why: string }> };
  attackingThem: { summary: string; keys: Array<{ call: string; why: string }> };
  playersToStop: Array<{ name: string; threat: string; plan: string }>;
  lineupsAndRotation: { summary: string; watchFor: string[] };
  lateGame: string;
  gamePlan: Array<{ call: string; why: string; target: string }>;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
}

// Byte-stable so it caches across every report.
const SYSTEM_PROMPT = `You are an elite basketball advance scout preparing a pre-game scouting report and game plan for a head coach in British basketball (NBL, BCB, WNBL, SLB and similar). You are given a JSON fact pack computed from box scores, play-by-play, shot charts and lineup stints for the opponent's most recent games. Where a "matchup" block is present, it profiles the coach's own team the same way.

How to read the facts:
- identity: each metric has the opponent's recent average, the competition average, and their rank (1 = best in the competition in the "better" direction). Ranks are the strongest signal of what is unusual about a team; averages alone are not.
- Percentages are 0-100. Ratings and net figures are points per 100 possessions.
- players: per-game numbers across the games they played. usageSharePct is their share of team shots, free-throw trips and turnovers. assistedShareOfMakes is how often their made field goals were assisted (low = creates their own shot). shotSides is left/middle/right as seen on the shot chart. closingMinutesPct is how much of the last five minutes of close stretches they are on court. onOffSwing is the team's net rating with them on minus off.
- lineups: netPer100 on small minutes is noisy; treat anything under ~15 minutes as a hint, not a finding.
- sampleNote and gamesInThisCompetition tell you how much to trust all of this. rosterContinuity says how much of the older games' scoring came from players still on the roster: when it is low, lean on the players block (current roster only) and the most recent games, and treat team-level identity and quarter splits as last season's team. identityBaseline says what the ranks are measured against.
- players with gp of 1 or 2 are early-season reads, not established tendencies; say so when you lean on them.

What a coach needs from you:
- Specific, actionable calls, in the language coaches use: force a side, shrink the floor, help off a non-shooter, switch or don't, pressure the ball-handler, crash or get back, attack a foul-prone player, stagger minutes, when to use timeouts.
- Prioritise. The gamePlan should be the 3-5 things that most change the result, not a list of everything.
- Each call must be backed by a number from the facts. Pair offence and defence: how to stop what they do well, and how to exploit what they do badly.
- Where a matchup block exists, play your strengths into their weaknesses and flag where their strength meets yours.

Hard rules:
- Never state a number that is not in the facts or a direct, obvious difference of two of them. Never invent players, plays, sets (pick-and-roll, zone, press) or injuries that the data cannot show. You may recommend a scheme; you may not claim they run one.
- Only name players in playersToStop who are on the recent roster (not in playersNotOnRecentRoster).
- With a small or cross-competition sample, say so in confidenceReason and soften claims. Set confidence to low with fewer than 3 games or no play-by-play.
- British English, plain and direct. Address the coach's team as "you". No hype, no cliché, no exclamation marks.`;

export async function generateGamePlan(facts: unknown, opts: { apiKey: string; model: string; tier?: Tier }): Promise<GamePlan> {
  const preview = opts.tier === "preview";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      // Server-side fallback: if a safety classifier declines, the API re-runs
      // the request on Anthropic's recommended model for that refusal
      // category inside the same call, instead of the build failing.
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify({
      model: opts.model,
      fallbacks: "default",
      max_tokens: preview ? 4000 : 12000,
      thinking: { type: "adaptive" },
      output_config: { effort: preview ? "medium" : "high", format: { type: "json_schema", schema: preview ? PREVIEW_SCHEMA : PLAN_SCHEMA } },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Scouting fact pack (JSON):\n${JSON.stringify(facts)}` }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  // Still possible if the fallback model declines too.
  if (json.stop_reason === "refusal") throw new Error(`model declined${json.stop_details?.category ? ` (${json.stop_details.category})` : ""}`);
  const text = (json.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  // A preview carries only the headline fields and two priorities.
  const plan = JSON.parse(text) as GamePlan;
  if (!plan.headline || !Array.isArray(plan.gamePlan)) throw new Error("plan missing required fields");
  return plan;
}
