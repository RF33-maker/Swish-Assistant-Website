import { supabase } from "@/lib/supabase";
import type { AskCard, AskEvent, AskNavButton, AskQuota, AskRequest, AskScope, AskSuggestionGroup, AskSurface } from "@shared/askSwish";

export type { AskCard, AskEvent, AskNavButton, AskQuota, AskScope, AskSuggestionGroup, AskSurface };

/** One question and everything that came back for it. */
export interface AskTurn {
  id: string;
  question: string;
  answer: string;
  cards: AskCard[];
  nav: AskNavButton[];
  followUps: string[];
  /** The tool currently running, while the answer streams. */
  status: string | null;
  error: { message: string; code?: string } | null;
  done: boolean;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

/**
 * Send one turn and feed every event back as it arrives. Resolves when the
 * stream closes; throws only on a transport failure (an in-band error comes
 * through as an `error` event).
 */
export async function streamAsk(request: AskRequest, onEvent: (event: AskEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Ask Swish failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try { onEvent(JSON.parse(line.slice(5).trim()) as AskEvent); } catch { /* a partial frame; the next read completes it */ }
      }
    }
  }
}

export async function fetchSuggestions(scope: AskScope | null, surface: AskSurface): Promise<AskSuggestionGroup[]> {
  const params = new URLSearchParams({ surface });
  for (const k of ["leagueId", "gameKey", "teamName", "playerName"] as const) {
    const v = scope?.[k];
    if (v) params.set(k, v);
  }
  const res = await fetch(`/api/ask/suggestions?${params.toString()}`);
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json.groups) ? json.groups : [];
}

/** The signed-in account's allowance; null when signed out or unavailable. */
export async function fetchQuota(): Promise<AskQuota | null> {
  const headers = await authHeader();
  if (!headers.Authorization) return null;
  const res = await fetch("/api/ask/quota", { headers });
  if (!res.ok) return null;
  const json = await res.json();
  return json.quota ?? null;
}

/** "3 of 5 free questions left this hour": the window closest to running out. */
export function quotaLine(quota: AskQuota | null): string | null {
  if (!quota || quota.exhausted) return null;
  const free = quota.tier === "free";
  const windows = [
    { label: "this hour", ...quota.hour },
    { label: "this week", ...quota.week },
    { label: "this month", ...quota.month },
  ].filter((w) => w.max > 0).map((w) => ({ ...w, left: w.max - w.used, ratio: (w.max - w.used) / w.max })).sort((a, b) => a.ratio - b.ratio);
  const tightest = windows[0];
  if (!tightest) return null;
  // Paid accounts only hear about it when they are close.
  if (!free && tightest.ratio > 0.2) return null;
  return `${tightest.left} of ${tightest.max}${free ? " free" : ""} questions left ${tightest.label}`;
}

/** A one-line label for the scope chip. */
export function scopeLabel(scope: AskScope | null): string | null {
  if (!scope) return null;
  if (scope.gameLabel) return scope.gameLabel;
  if (scope.playerName) return scope.playerName;
  if (scope.teamName) return scope.teamName;
  return scope.leagueName ?? null;
}
