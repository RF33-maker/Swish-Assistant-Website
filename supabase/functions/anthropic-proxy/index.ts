import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * anthropic-proxy — lets the website's server call the Anthropic API with
 * the key this project already holds as an Edge Function secret (the one
 * scout-agent uses), so the key lives in one place and never has to be
 * copied into the site's own environment.
 *
 * Forwards any request under /anthropic-proxy/v1/... to api.anthropic.com,
 * streaming the response straight back. Callers prove themselves with the
 * same shared secret as scout-agent (x-scout-secret, from Vault via
 * public.scout_agent_secret), so nothing on the open internet can spend
 * the key through here.
 */

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

let expected: string | null | undefined;
async function sharedSecret(): Promise<string | null> {
  if (expected !== undefined) return expected;
  const { data, error } = await db.rpc("scout_agent_secret", { p_name: "scout_agent_cron_secret" });
  if (error) console.error("secret lookup failed", error.message);
  expected = (data as string | null) ?? null;
  return expected;
}

const FORWARDED = ["content-type", "accept", "anthropic-version", "anthropic-beta", "x-stainless-retry-count", "x-stainless-timeout"];

Deno.serve(async (req) => {
  const secret = await sharedSecret();
  if (!secret || req.headers.get("x-scout-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorised" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 503, headers: { "content-type": "application/json" } });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/anthropic-proxy/, "");
  if (!path.startsWith("/v1/")) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });

  const headers = new Headers({ "x-api-key": apiKey });
  for (const h of FORWARDED) { const v = req.headers.get(h); if (v) headers.set(h, v); }
  if (!headers.has("anthropic-version")) headers.set("anthropic-version", "2023-06-01");

  const upstream = await fetch(`https://api.anthropic.com${path}${url.search}`, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
  });
  const out = new Headers();
  for (const h of ["content-type", "request-id", "x-request-id", "retry-after", "anthropic-ratelimit-requests-remaining", "anthropic-ratelimit-tokens-remaining", "cache-control"]) {
    const v = upstream.headers.get(h); if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
});
