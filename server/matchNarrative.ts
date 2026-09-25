import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Written analysis for the Coaches Hub match and scout reports.
 *
 * The reports already compute and display every number themselves; this adds
 * the writing around them. That split is deliberate — the deterministic
 * report is the source of truth and always renders, and this is an
 * enhancement layer that degrades to nothing if the key is missing, the API
 * is down, or the call times out. A coach should never lose their box score
 * because an LLM call failed.
 *
 * The model is given pre-computed facts, never raw tables: it is asked to
 * interpret numbers that have already been derived, which keeps the token
 * count small and removes any opportunity to invent a stat.
 *
 * Note: server/ai-analysis.ts is a separate, older OpenAI integration for
 * player blurbs. It is untouched — this is additive, not a migration.
 *
 * The schema is declared as raw JSON Schema rather than via the SDK's
 * zodOutputFormat helper: that helper targets zod 4 and this project is on
 * zod 3, and forcing a zod major upgrade across the whole app to shape one
 * response would be the wrong trade. The response is validated with the
 * project's own zod after parsing, so the guarantee is the same.
 */

const NarrativeSchema = z.object({
  headline: z
    .string()
    .describe("One sentence, max 20 words, capturing the story of the game or matchup."),
  overview: z
    .string()
    .describe("2-3 sentences of overall interpretation, referencing specific numbers from the facts."),
  sections: z
    .array(
      z.object({
        key: z
          .string()
          .describe("Which report section this belongs to: one of the section keys provided in the facts."),
        body: z
          .string()
          .describe("2-3 sentences explaining what this section's numbers mean for the coach."),
      })
    )
    .describe("One entry per section key provided. Do not invent section keys."),
  takeaways: z
    .array(z.string())
    .describe("2-4 short, concrete coaching points. Each one actionable, not a restatement of a stat."),
});

export type ReportNarrative = z.infer<typeof NarrativeSchema>;

/** Mirror of NarrativeSchema for output_config.format. Keep the two in step. */
const NARRATIVE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "overview", "sections", "takeaways"],
  properties: {
    headline: {
      type: "string",
      description: "One sentence, max 20 words, capturing the story of the game or matchup.",
    },
    overview: {
      type: "string",
      description: "2-3 sentences of overall interpretation, referencing specific numbers from the facts.",
    },
    sections: {
      type: "array",
      description: "One entry per section key provided. Do not invent section keys.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "body"],
        properties: {
          key: { type: "string", description: "One of the section keys provided in the request." },
          body: { type: "string", description: "2-3 sentences explaining what this section's numbers mean for the coach." },
        },
      },
    },
    takeaways: {
      type: "array",
      description: "2-4 short, concrete coaching points. Each actionable, not a restatement of a stat.",
      items: { type: "string" },
    },
  },
} as const;

// Kept byte-stable and sent first so it caches across every request. Any
// per-report content goes in the user message, after the breakpoint.
const SYSTEM_PROMPT = `You are an experienced basketball analyst writing for a coach who already has the numbers in front of them.

You will be given pre-computed facts about either a completed game (a match report) or an upcoming opponent (a scout report), along with the section keys the report is rendering.

Rules:
- Interpret and explain; do not simply restate numbers the coach can already read. Say what a number means and what follows from it.
- Reference specific figures from the facts to support each point. Never state a number that is not in the facts.
- If the facts do not support a claim, do not make it. Say less rather than speculating.
- Never invent player names, opponents, scores, or context such as injuries, travel, or crowd.
- Write plainly and directly, in British English. No hype, no cliché ("came to play", "left it all on the floor"), no exclamation marks.
- Address the coach's team in the second person ("you", "your bench"). Refer to the opposition by name.
- A close or unremarkable game should produce restrained writing. Do not manufacture drama.
- Return one section entry for each section key given, using exactly those keys.`;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

export function narrativeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface NarrativeRequest {
  kind: "match" | "scout";
  facts: unknown;
  sectionKeys: string[];
}

export async function generateReportNarrative({
  kind,
  facts,
  sectionKeys,
}: NarrativeRequest): Promise<ReportNarrative | null> {
  const client = getClient();
  if (!client) return null;

  const userContent =
    `Report type: ${kind === "match" ? "post-game match report" : "pre-game scout report"}\n\n` +
    `Section keys to write for: ${sectionKeys.join(", ")}\n\n` +
    `Facts (JSON):\n${JSON.stringify(facts, null, 2)}`;

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4000,
    // Adaptive thinking at medium effort: this is interpretation, not deep
    // reasoning, and medium keeps latency acceptable for a page load.
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: NARRATIVE_JSON_SCHEMA },
    },
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userContent }],
  } as any);

  if (response.stop_reason === "refusal") {
    console.error("[report-narrative] model declined:", response.stop_details);
    return null;
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  try {
    return NarrativeSchema.parse(JSON.parse(text));
  } catch (err) {
    console.error("[report-narrative] response did not match schema:", err);
    return null;
  }
}
