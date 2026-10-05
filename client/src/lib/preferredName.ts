import { supabase } from "@/lib/supabase";

// Calls to the preferred-name endpoints (server/preferredNames.ts). The server
// decides who may do what; these just carry the signed-in user's token.

export type NameRole = "admin" | "owner" | "none";

export interface PendingNameRequest {
  id: string;
  requested_name: string;
  created_at: string;
}

export interface AdminNameRequest {
  id: string;
  player_id: string;
  current_name: string;
  team_name: string | null;
  slug: string | null;
  requested_name: string;
  requested_by_email: string | null;
  created_at: string;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Something went wrong. Please try again.");
  return body as T;
}

export const getNameAccess = (playerId: string) =>
  call<{ role: NameRole; pending: PendingNameRequest | null }>(`/api/players/${playerId}/preferred-name`);

export const submitPreferredName = (playerId: string, name: string, playerIds?: string[]) =>
  call<{ applied: boolean; name?: string; records?: number; statRows?: number; pending?: PendingNameRequest }>(
    `/api/players/${playerId}/preferred-name`,
    { method: "POST", body: JSON.stringify({ name, playerIds }) },
  );

export const withdrawNameRequest = (playerId: string) =>
  call<{ ok: boolean }>(`/api/players/${playerId}/preferred-name`, { method: "DELETE" });

export const listNameRequests = () => call<{ requests: AdminNameRequest[] }>("/api/admin/preferred-name-requests");

export const approveNameRequest = (id: string) =>
  call<{ applied: boolean; name: string }>(`/api/admin/preferred-name-requests/${id}/approve`, { method: "POST" });

export const rejectNameRequest = (id: string, reason: string) =>
  call<{ ok: boolean }>(`/api/admin/preferred-name-requests/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
