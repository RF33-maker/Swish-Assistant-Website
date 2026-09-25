# Written analysis on the Coaches Hub reports

The match report and the pre-game scout report each compute and render their
own numbers. On top of those, Claude writes the prose: a headline, an
overview, a short interpretation under each section, and two to four
takeaways.

## Turning it on

Set one environment variable:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Locally that goes in `.env`; on Vercel it goes in the project's environment
variables. The server reads it at request time, so no rebuild is needed
locally — restart the dev server (`server/index.ts` does not hot-reload).

With no key set, the endpoint returns `{ narrative: null, reason:
"not_configured" }` and the reports render exactly as they did before, with
no error and no empty placeholder. That is the intended fallback, not a
failure state.

## How it works

`POST /api/reports/narrative` takes `{ kind, facts, sectionKeys }`:

- `kind` — `"match"` or `"scout"`
- `facts` — pre-computed values the report has already derived
- `sectionKeys` — the sections the report wants written

It returns `{ narrative }`, validated against a zod schema before it reaches
the client.

The model is only ever sent **derived facts, never raw tables**. It is asked
to interpret numbers the coach can already see on the page, which keeps the
request small and removes any opportunity to invent a statistic. The system
prompt forbids stating a number not present in the facts, and forbids
inventing players, scores, or context such as injuries or travel.

## Design constraints worth preserving

- **The deterministic report is the product.** The narrative is additive.
  Every failure path — missing key, API error, timeout, schema mismatch,
  model refusal — returns `narrative: null` with HTTP 200, and the client
  renders the numbers alone. A coach must never lose their box score because
  an LLM call failed.
- **Facts in, prose out.** If a new section is added to a report, send its
  derived values in `facts` and add its key to `sectionKeys`. Do not widen
  this into passing raw query results.
- **Schema is declared twice** — as JSON Schema for `output_config.format`
  and as zod for validation — because the SDK's `zodOutputFormat` helper
  targets zod 4 and this project is on zod 3. Keep the two in step.

## Model and cost

`claude-opus-5`, adaptive thinking at `medium` effort, `max_tokens: 4000`.
The system prompt is marked for caching, so repeat requests pay the cached
rate on that portion.

One report is a small request — the facts payload is capped at 20 KB and is
typically a few KB. Cost scales with how often coaches open reports, not with
league size.

`server/ai-analysis.ts` is a separate, older OpenAI integration used for
player blurbs elsewhere in the app. It is untouched by this feature.
