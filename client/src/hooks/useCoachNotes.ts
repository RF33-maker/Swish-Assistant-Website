import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CoachNote, NoteKind } from "@shared/coachNotes";
import { playerNameKey } from "@shared/playerNameKey";

/**
 * A coach's private notes on an opponent (see server/scoutAgentRoutes.ts). They
 * are for what the numbers can't know, and the scouting agent reads them the
 * next time it builds this coach's plan. Only the coach's own club (or an
 * admin previewing it) can read or write them.
 */

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export interface NoteInput {
  scope: "team" | "player";
  playerName?: string | null;
  kind?: NoteKind | null;
  /** Empty removes the note. */
  note: string;
}

export function useCoachNotes(leagueId: string, opponentName: string, forTeamName: string | null | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ["scout-coach-notes", leagueId, opponentName, forTeamName || ""];
  const active = enabled && !!leagueId && !!opponentName && !!forTeamName;

  const query = useQuery<CoachNote[] | null>({
    queryKey,
    enabled: active,
    staleTime: 60_000,
    queryFn: async () => {
      const qs = new URLSearchParams({ leagueId, opponent: opponentName, forTeam: forTeamName! });
      const res = await fetch(`/api/scout-agent/notes?${qs}`, { headers: await authHeaders() });
      if (res.status === 401 || res.status === 403) return null; // not this coach's report: no notes UI
      if (!res.ok) throw new Error(`notes returned ${res.status}`);
      return (await res.json()).notes as CoachNote[];
    },
  });

  const save = useMutation({
    mutationFn: async (input: NoteInput) => {
      const res = await fetch("/api/scout-agent/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ leagueId, opponent: opponentName, forTeam: forTeamName, ...input }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `save returned ${res.status}`);
      return json.notes as CoachNote[];
    },
    onSuccess: (notes) => queryClient.setQueryData(queryKey, notes),
  });

  const noteFor = useCallback(
    (playerName: string) => {
      // The server's own key (first initial + surname, accents folded), so "D. Crnac" finds "Dzana Crnac".
      const key = playerNameKey(playerName);
      return (query.data || []).find((n) => n.scope === "player" && n.playerName && playerNameKey(n.playerName) === key) ?? null;
    },
    [query.data],
  );

  return {
    /** null when the viewer can't have notes for this report (not this coach's club). */
    notes: query.data ?? null,
    canEdit: active && Array.isArray(query.data),
    isLoading: query.isLoading,
    saving: save.isPending,
    error: save.error instanceof Error ? save.error.message : null,
    save: save.mutateAsync,
    noteFor,
    teamNote: (query.data || []).find((n) => n.scope === "team") ?? null,
    updatedAt: (query.data || []).map((n) => n.updatedAt).sort().pop() ?? null,
  };
}
