import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../supabaseServiceClient";

/**
 * How the site's server reaches the Anthropic API.
 *
 * With ANTHROPIC_API_KEY in the environment it calls Anthropic directly.
 * Without one it goes through the anthropic-proxy edge function, which holds
 * the project's key as an Edge Function secret (shared with scout-agent) and
 * admits callers that present the scout_agent_cron_secret from Vault. The
 * site's own environment then never needs a copy of the key.
 */

export type AnthropicClientOptions = { apiKey: string; baseURL?: string; defaultHeaders?: Record<string, string> };

let cache: { at: number; options: AnthropicClientOptions | null } | null = null;

export async function anthropicClientOptions(): Promise<AnthropicClientOptions | null> {
  if (process.env.ANTHROPIC_API_KEY) return { apiKey: process.env.ANTHROPIC_API_KEY };
  if (cache && Date.now() - cache.at < 10 * 60e3) return cache.options;
  const { data, error } = await supabaseAdmin.rpc("scout_agent_secret", { p_name: "scout_agent_cron_secret" });
  if (error) console.error("[anthropic] secret lookup failed:", error.message);
  const secret = (data as string | null) ?? null;
  const options = secret && process.env.VITE_SUPABASE_URL
    ? { apiKey: "proxied", baseURL: `${process.env.VITE_SUPABASE_URL}/functions/v1/anthropic-proxy`, defaultHeaders: { "x-scout-secret": secret } }
    : null;
  cache = { at: Date.now(), options };
  return options;
}

export function anthropicClient(options: AnthropicClientOptions, extra: { maxRetries?: number; timeout?: number } = {}): Anthropic {
  return new Anthropic({ ...options, ...extra });
}
