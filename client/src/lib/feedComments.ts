import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Feed comments. Reading goes straight to the database (visible comments,
 * plus your own held ones); posting, removing and reporting go through the
 * site's server, which checks every comment first (server/feedComments.ts).
 */

export interface FeedComment {
  id: string;
  post_key: string;
  user_id: string;
  author_name: string;
  body: string;
  status: "visible" | "held" | "removed";
  created_at: string;
}

export type ReportReason = "abuse" | "hate" | "about_a_player" | "spam" | "other";

export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: "abuse", label: "Abusive or insulting" },
  { value: "hate", label: "Hateful or discriminatory" },
  { value: "about_a_player", label: "Personal about a player" },
  { value: "spam", label: "Spam or a scam" },
  { value: "other", label: "Something else" },
];

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Try again in a moment.");
  return json as T;
}

const countsKey = (keys: string[]) => ["feed-comment-counts", keys.join("|")] as const;

/** Visible comment counts for the posts on screen. */
export function useCommentCounts(postKeys: string[]) {
  return useQuery({
    queryKey: countsKey(postKeys),
    enabled: postKeys.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc("feed_comment_counts", { keys: postKeys });
      if (error) return {};
      const out: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ post_key: string; comments: number }>) out[row.post_key] = Number(row.comments);
      return out;
    },
  });
}

/** One post's comments, oldest first, so a conversation reads top to bottom. */
export function useComments(postKey: string | null) {
  return useQuery({
    queryKey: ["feed-comments", postKey],
    enabled: !!postKey,
    staleTime: 20 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async (): Promise<FeedComment[]> => {
      const { data, error } = await supabase
        .from("feed_comments")
        .select("id, post_key, user_id, author_name, body, status, created_at")
        .eq("post_key", postKey!)
        .in("status", ["visible", "held"])
        .order("created_at")
        .limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as FeedComment[];
    },
  });
}

const refresh = (qc: ReturnType<typeof useQueryClient>, postKey: string) => {
  void qc.invalidateQueries({ queryKey: ["feed-comments", postKey] });
  void qc.invalidateQueries({ queryKey: ["feed-comment-counts"] });
};

/**
 * Posting answers in one of two ways: the comment is saved (shown, or held for
 * a moderator), or, when the checks would hold it and `confirm` wasn't set,
 * nothing is saved and `nudge` asks the author to rethink it first.
 */
export type PostResult =
  | { nudge: true; message: string }
  | { nudge?: undefined; comment: FeedComment; held: boolean; message: string | null };

export function usePostComment(postKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; headline: string; confirm?: boolean }) =>
      send<PostResult>("POST", "/api/feed/comments", { postKey, ...input }),
    onSuccess: (r) => {
      if (!r.nudge) refresh(qc, postKey);
    },
  });
}

export function useRemoveComment(postKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send<{ ok: true }>("DELETE", `/api/feed/comments/${id}`),
    onSuccess: () => refresh(qc, postKey),
  });
}

export function useReportComment(postKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason: ReportReason }) =>
      send<{ ok: true; hidden?: boolean }>("POST", `/api/feed/comments/${input.id}/report`, { reason: input.reason }),
    onSuccess: () => refresh(qc, postKey),
  });
}

// ---- Moderators ----

export interface ModerationComment extends FeedComment {
  moderation: { source?: string; categories?: string[]; note?: string; verdict?: string; posted_after_prompt?: boolean };
  report_count: number;
}
export interface ModerationQueue {
  held: ModerationComment[];
  reported: ModerationComment[];
  mutes: Array<{ user_id: string; until: string | null; reason: string | null; name: string | null }>;
  terms: string[];
}

/** How many comments are waiting for review, for the admin menu's badge. Admins only (RLS). */
export function useHeldCommentCount(enabled: boolean) {
  return useQuery({
    queryKey: ["feed-moderation", "held-count"],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase.from("feed_comments").select("id", { count: "exact", head: true }).eq("status", "held");
      return error ? 0 : count ?? 0;
    },
  });
}

export function useModerationQueue(enabled: boolean) {
  return useQuery({ queryKey: ["feed-moderation"], enabled, queryFn: () => send<ModerationQueue>("GET", "/api/admin/feed-comments") });
}

export function useModerate() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["feed-moderation"] });
    void qc.invalidateQueries({ queryKey: ["feed-comments"] });
    void qc.invalidateQueries({ queryKey: ["feed-comment-counts"] });
  };
  return {
    review: useMutation({ mutationFn: (i: { id: string; action: "approve" | "remove" }) => send("POST", `/api/admin/feed-comments/${i.id}`, { action: i.action }), onSuccess: done }),
    mute: useMutation({ mutationFn: (i: { userId: string; days: number | null }) => send("POST", "/api/admin/feed-comment-mutes", i), onSuccess: done }),
    unmute: useMutation({ mutationFn: (userId: string) => send("DELETE", `/api/admin/feed-comment-mutes/${userId}`), onSuccess: done }),
    addTerm: useMutation({ mutationFn: (term: string) => send("POST", "/api/admin/feed-banned-terms", { term }), onSuccess: done }),
    removeTerm: useMutation({ mutationFn: (term: string) => send("DELETE", `/api/admin/feed-banned-terms/${encodeURIComponent(term)}`), onSuccess: done }),
  };
}
