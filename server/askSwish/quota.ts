import { supabaseAdmin as db } from "../supabaseServiceClient";
import type { AskQuota, AskTier, AskUsage } from "@shared/askSwish";

/**
 * Ask Swish quotas: how many questions an account may ask per hour, week
 * and month. Free members get a taste, Swish+ members get plenty for a fan
 * or player, and coach and admin accounts ("pro") get enough for a working
 * week of prep. Swish+ comes with Coach, so a coach is never on "plus". Counts come from
 * ask_swish_questions, so they survive deploys and are shared across server
 * instances; until that table exists the hourly limit is kept in memory so
 * the feature still works, just without the longer windows.
 *
 * Override with ASK_SWISH_LIMITS_FREE / _PLUS / _PRO as "hour,week,month".
 */

export type Tier = AskTier;
export interface Limits { hour: number; week: number; month: number }

function parseLimits(raw: string | undefined, fallback: Limits): Limits {
  const parts = (raw ?? "").split(",").map((n) => Number(n.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return fallback;
  return { hour: parts[0], week: parts[1], month: parts[2] };
}

export const LIMITS: Record<Tier, Limits> = {
  // Free stays at what it was before Swish+ (never take away what is free today).
  free: parseLimits(process.env.ASK_SWISH_LIMITS_FREE, { hour: 5, week: 30, month: 80 }),
  plus: parseLimits(process.env.ASK_SWISH_LIMITS_PLUS, { hour: 30, week: 150, month: 300 }),
  pro: parseLimits(process.env.ASK_SWISH_LIMITS_PRO, { hour: 150, week: 1500, month: 5000 }),
};

const WINDOW_MS = { hour: 3600e3, week: 7 * 86400e3, month: 30 * 86400e3 } as const;
type Window = keyof typeof WINDOW_MS;

// Fallback when the table is missing: hourly only, per process.
const memory = new Map<string, number[]>();
let tableMissing = false;

async function countSince(userId: string, since: Date): Promise<number | null> {
  const { count, error } = await db
    .from("ask_swish_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("asked_at", since.toISOString());
  // A missing table answers 204 with a null count and no error, so a null count is also "unavailable".
  if (error || count == null) {
    if (!tableMissing) console.warn("[ask-swish] quota table unavailable, hourly limit in memory only:", error?.message ?? "no count returned");
    tableMissing = true;
    return null;
  }
  return count;
}

/** The oldest question inside a window, which is when that window frees a slot. */
async function resetAt(userId: string, window: Window, limit: number): Promise<string> {
  const since = new Date(Date.now() - WINDOW_MS[window]);
  const { data } = await db
    .from("ask_swish_questions")
    .select("asked_at")
    .eq("user_id", userId)
    .gte("asked_at", since.toISOString())
    .order("asked_at", { ascending: true })
    .limit(Math.max(1, limit));
  const oldest = data?.[0]?.asked_at ? new Date(data[0].asked_at).getTime() : Date.now();
  return new Date(oldest + WINDOW_MS[window]).toISOString();
}

export async function quotaFor(userId: string, tier: Tier): Promise<AskQuota> {
  const limits = LIMITS[tier];
  const now = Date.now();
  const counts: Record<Window, number> = { hour: 0, week: 0, month: 0 };
  const dbHour = await countSince(userId, new Date(now - WINDOW_MS.hour));
  if (dbHour == null) {
    counts.hour = (memory.get(userId) ?? []).filter((t) => now - t < WINDOW_MS.hour).length;
  } else {
    counts.hour = dbHour;
    counts.week = (await countSince(userId, new Date(now - WINDOW_MS.week))) ?? 0;
    counts.month = (await countSince(userId, new Date(now - WINDOW_MS.month))) ?? 0;
  }
  const exhausted = (["hour", "week", "month"] as Window[]).find((w) => counts[w] >= limits[w] && (w === "hour" || dbHour != null)) ?? null;
  return {
    tier,
    hour: { used: counts.hour, max: limits.hour },
    week: { used: counts.week, max: limits.week },
    month: { used: counts.month, max: limits.month },
    exhausted,
    resetAt: exhausted ? (dbHour == null ? new Date(now + WINDOW_MS.hour).toISOString() : await resetAt(userId, exhausted, limits[exhausted])) : null,
  };
}

/** Records the question as it starts, so an abandoned stream still counts. Returns the row id, or null without the table. */
export async function recordQuestion(userId: string, tier: Tier, model: string, surface: string): Promise<number | null> {
  if (tableMissing) { memory.set(userId, [...(memory.get(userId) ?? []), Date.now()]); return null; }
  const { data, error } = await db.from("ask_swish_questions").insert({ user_id: userId, tier, model, surface }).select("id").single();
  if (error) { tableMissing = true; memory.set(userId, [...(memory.get(userId) ?? []), Date.now()]); return null; }
  return data.id as number;
}

export async function recordUsage(id: number | null, usage: AskUsage | null, status: "done" | "failed"): Promise<void> {
  if (id == null) return;
  await db.from("ask_swish_questions").update({
    status,
    rounds: usage?.rounds ?? null, input_tokens: usage?.input ?? null, cache_write_tokens: usage?.cacheWrite ?? null,
    cache_read_tokens: usage?.cacheRead ?? null, output_tokens: usage?.output ?? null,
  }).eq("id", id);
}
