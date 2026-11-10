import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { MEDIA_QUERY_KEY, mediaApi, useMyPhotographer, type Craft, type OpenTo, type Photographer } from "@/lib/mediaSpotlight";
import { SPACE_BUCKET, uploadSpaceImage } from "@/lib/photoUpload";
import { parseScheduleTime } from "@/lib/scheduleTime";
import { isSameTeam } from "@shared/teamIdentity";

/**
 * The creator space: the teams a creator works with, the games they'll be at,
 * and the members-only board (supabase/migrations/20261110_creator_space.sql).
 *
 * A creator is an ordinary account with a claimed creator profile. Reads go
 * straight to the database, where row-level security lets creators and admins
 * in and nobody else. Board posts and replies are written through the server
 * (server/creatorSpace.ts), which checks each one first; team links, attendance
 * and likes are a creator's own rows and are written from here.
 */

export const CREATOR_KEY = [...MEDIA_QUERY_KEY, "creators"] as const;

// ── Who's a member ────────────────────────────────────────────────────────

/** Whether the signed-in account can use the creator space, and as whom. */
export function useCreatorAccess() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const mine = useMyPhotographer(user?.id);
  const me = mine.data && mine.data.status === "claimed" ? mine.data : null;
  return {
    loading: !!authLoading || (!!user && mine.isLoading),
    signedIn: !!user,
    userId: user?.id ?? null,
    /** Their creator profile; null for an admin who hasn't one (they post as the Swish team). */
    me,
    isAdmin: !!isAdmin,
    member: !!me || !!isAdmin,
    /** A profile exists for this account but isn't open yet (hidden by an admin). */
    pending: !!mine.data && !me,
  };
}

// ── Teams ─────────────────────────────────────────────────────────────────

export interface CreatorTeam {
  id: string;
  photographer_id: string;
  /** As the fixtures spell it, so games can be matched to it. */
  team_name: string;
  /** The competition it was picked from (for its logo); null when typed by hand. */
  league_id: string | null;
  role: string | null;
  position: number;
}

const TEAM_COLUMNS = "id, photographer_id, team_name, league_id, role, position";

export function useCreatorTeams(photographerId: string | undefined) {
  return useQuery({
    queryKey: [...CREATOR_KEY, "teams", photographerId],
    enabled: !!photographerId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CreatorTeam[]> => {
      const { data, error } = await supabase.from("creator_teams").select(TEAM_COLUMNS).eq("photographer_id", photographerId!).order("position").order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as CreatorTeam[];
    },
  });
}

export async function addCreatorTeam(photographerId: string, team: { team_name: string; league_id: string | null }, position: number) {
  const { error } = await supabase.from("creator_teams").insert({ photographer_id: photographerId, team_name: team.team_name, league_id: team.league_id, position });
  if (error && error.code !== "23505") throw new Error(error.message); // already on the list
}

export async function updateCreatorTeam(id: string, patch: { role?: string | null }) {
  const { error } = await supabase.from("creator_teams").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removeCreatorTeam(id: string) {
  const { error } = await supabase.from("creator_teams").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Fixtures and who'll be there ──────────────────────────────────────────

export interface Fixture {
  game_key: string;
  matchtime: string;
  hometeam: string;
  awayteam: string;
  league_id: string;
  status: string;
  /** Filled from the competitions list. */
  competition: string | null;
  competitionSlug: string | null;
  /** A women's competition: "London Lions" there is a different side from the men's. */
  women: boolean;
}

export interface CompInfo { name: string; slug: string; women: boolean }

/** Every public competition by id: its name, its page, and whether it's a women's competition. */
export function useCompetitionIndex(enabled = true) {
  return useQuery({
    queryKey: [...CREATOR_KEY, "competitions"],
    enabled,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Map<string, CompInfo>> => {
      const { data, error } = await supabase.from("competitions").select("league_id, name, slug, gender").eq("is_public", true);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((c) => [c.league_id as string, { name: c.name as string, slug: c.slug as string, women: /^women/i.test(String(c.gender ?? "").trim()) }]));
    },
  });
}

const FIXTURE_COLUMNS = "game_key, matchtime, hometeam, awayteam, league_id, status";

/** How far ahead the Games tab looks. */
export const FIXTURE_DAYS = 21;

/** Fixtures from a few hours ago (a game under way still counts) to three weeks out, public competitions only. */
export function useUpcomingFixtures(enabled = true) {
  const comps = useCompetitionIndex(enabled);
  const games = useQuery({
    queryKey: [...CREATOR_KEY, "fixtures"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const from = new Date(Date.now() - 3 * 3600e3).toISOString();
      const to = new Date(Date.now() + FIXTURE_DAYS * 86400e3).toISOString();
      const { data, error } = await supabase.from("game_schedule").select(FIXTURE_COLUMNS).in("status", ["scheduled", "live"]).gte("matchtime", from).lte("matchtime", to).order("matchtime").limit(1000);
      if (error) throw new Error(error.message);
      return (data ?? []) as Pick<Fixture, "game_key" | "matchtime" | "hometeam" | "awayteam" | "league_id" | "status">[];
    },
  });
  const data = useMemo((): Fixture[] | undefined => {
    if (!games.data || !comps.data) return undefined;
    return games.data
      .filter((g) => g.hometeam && g.awayteam && comps.data.has(g.league_id))
      .map((g) => {
        const c = comps.data.get(g.league_id)!;
        return { ...g, competition: c.name, competitionSlug: c.slug, women: c.women };
      });
  }, [games.data, comps.data]);
  return { data, isLoading: games.isLoading || comps.isLoading, isError: games.isError || comps.isError };
}

/**
 * Whether one of a creator's teams plays in this fixture. A team picked from a
 * women's competition only matches women's fixtures (and the other way round),
 * because some clubs use one name for both sides.
 */
export function coversFixture(team: Pick<CreatorTeam, "team_name" | "league_id">, g: Fixture, comps: Map<string, CompInfo> | undefined): boolean {
  if (!isSameTeam(g.hometeam, team.team_name) && !isSameTeam(g.awayteam, team.team_name)) return false;
  const mine = team.league_id ? comps?.get(team.league_id) : undefined;
  return !mine || mine.women === g.women;
}

export type AttendanceStatus = "going" | "maybe";
export type CreatorCard = Pick<Photographer, "id" | "slug" | "display_name" | "handle" | "avatar_path" | "crafts">;
const CARD_COLUMNS = "id, slug, display_name, handle, avatar_path, crafts";

export interface Attendance {
  id: string;
  photographer_id: string;
  game_key: string;
  status: AttendanceStatus;
  note: string | null;
  creator: CreatorCard | null;
  game: Pick<Fixture, "game_key" | "matchtime" | "hometeam" | "awayteam" | "league_id" | "status"> | null;
}

const ATTENDANCE_SELECT = `id, photographer_id, game_key, status, note, creator:photographers(${CARD_COLUMNS}), game:game_schedule!inner(${FIXTURE_COLUMNS})`;

/** Everyone's attendance for games still to come. Creators and admins only (the database decides). */
export function useAttendance(enabled = true) {
  return useQuery({
    queryKey: [...CREATOR_KEY, "attendance"],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Attendance[]> => {
      const { data, error } = await supabase
        .from("creator_attendance")
        .select(ATTENDANCE_SELECT)
        .gte("game.matchtime", new Date(Date.now() - 3 * 3600e3).toISOString())
        .limit(1000);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Attendance[];
    },
  });
}

/**
 * One creator's upcoming games, for their public profile. Comes back empty
 * unless they chose to show them (or the viewer is a creator).
 */
export function useCreatorUpcoming(photographerId: string | undefined) {
  return useQuery({
    queryKey: [...CREATOR_KEY, "upcoming", photographerId],
    enabled: !!photographerId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<Attendance[]> => {
      const { data, error } = await supabase
        .from("creator_attendance")
        .select(ATTENDANCE_SELECT)
        .eq("photographer_id", photographerId!)
        .gte("game.matchtime", new Date(Date.now() - 3 * 3600e3).toISOString())
        .limit(50);
      if (error) return [];
      return ((data ?? []) as unknown as Attendance[]).sort((a, b) => (a.game?.matchtime ?? "").localeCompare(b.game?.matchtime ?? ""));
    },
  });
}

/** Say you'll be at a game (or might be), change the note, or take yourself off it (status null). */
export function useSetAttendance(photographerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameKey, status, note }: { gameKey: string; status: AttendanceStatus | null; note?: string | null }) => {
      if (!photographerId) throw new Error("You need a creator profile to do that.");
      if (!status) {
        const { error } = await supabase.from("creator_attendance").delete().eq("photographer_id", photographerId).eq("game_key", gameKey);
        if (error) throw new Error(error.message);
        return;
      }
      const row: Record<string, unknown> = { photographer_id: photographerId, game_key: gameKey, status };
      if (note !== undefined) row.note = note?.trim() || null;
      const { error } = await supabase.from("creator_attendance").upsert(row, { onConflict: "photographer_id,game_key" });
      if (error) throw new Error(error.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CREATOR_KEY }),
  });
}

// ── The people ────────────────────────────────────────────────────────────

export interface Member extends Photographer {
  linked_teams: Pick<CreatorTeam, "team_name" | "league_id" | "role" | "position">[];
}

/** Every creator who has joined, A to Z, with the teams they work with. */
export function useMembers(enabled = true) {
  return useQuery({
    queryKey: [...CREATOR_KEY, "members"],
    enabled,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from("photographers")
        .select("*, linked_teams:creator_teams(team_name, league_id, role, position)")
        .eq("status", "claimed")
        .not("user_id", "is", null)
        .order("display_name");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Member[]).map((m) => ({ ...m, linked_teams: [...(m.linked_teams ?? [])].sort((a, b) => a.position - b.position) }));
    },
  });
}

export type { Craft, OpenTo };

// ── The board ─────────────────────────────────────────────────────────────

export type Topic = "general" | "work" | "advice" | "gear" | "collab" | "question";

export const TOPICS: Record<Topic, { label: string; prompt: string }> = {
  general: { label: "General", prompt: "What's on your mind?" },
  work: { label: "My work", prompt: "Share something you made and say a little about it." },
  advice: { label: "Advice", prompt: "A tip, a lesson learned, something you wish you'd known." },
  gear: { label: "Gear", prompt: "Kit, settings, software: what's working for you?" },
  collab: { label: "Work together", prompt: "Looking for a second shooter, an editor, a designer? Say what and when." },
  question: { label: "Question", prompt: "Ask the room." },
};
export const TOPIC_ORDER: Topic[] = ["general", "work", "advice", "gear", "collab", "question"];

/** `full` is the bigger copy the full-screen view opens; older or small pictures have only `path`. */
export interface SpaceImage { path: string; w: number; h: number; full?: string }

export interface BoardPost {
  id: string;
  photographer_id: string | null;
  user_id: string;
  topic: Topic;
  body: string;
  images: SpaceImage[];
  game_key: string | null;
  status: "visible" | "held" | "removed";
  created_at: string;
  author: (CreatorCard & { teams: string[] }) | null;
  game: Pick<Fixture, "game_key" | "matchtime" | "hometeam" | "awayteam" | "league_id"> | null;
  likes: { user_id: string }[];
}

export interface BoardReply {
  id: string;
  post_id: string;
  photographer_id: string | null;
  user_id: string;
  body: string;
  status: "visible" | "held" | "removed";
  created_at: string;
  author: CreatorCard | null;
}

const POST_SELECT =
  `id, photographer_id, user_id, topic, body, images, game_key, status, created_at, ` +
  `author:photographers(${CARD_COLUMNS}, teams), game:game_schedule(game_key, matchtime, hometeam, awayteam, league_id), likes:creator_post_likes(user_id)`;
const REPLY_SELECT = `id, post_id, photographer_id, user_id, body, status, created_at, author:photographers(${CARD_COLUMNS})`;

const boardKey = [...CREATOR_KEY, "board"] as const;

/** The newest posts with their replies. `held` ones only come back for their author (and admins). */
export function useBoard(enabled = true) {
  return useQuery({
    queryKey: boardKey,
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 2 * 60 * 1000,
    queryFn: async (): Promise<{ posts: BoardPost[]; replies: Map<string, BoardReply[]> }> => {
      const { data, error } = await supabase.from("creator_posts").select(POST_SELECT).in("status", ["visible", "held"]).order("created_at", { ascending: false }).limit(60);
      if (error) throw new Error(error.message);
      const posts = (data ?? []) as unknown as BoardPost[];
      const replies = new Map<string, BoardReply[]>();
      if (posts.length) {
        const { data: rows, error: replyError } = await supabase
          .from("creator_post_replies")
          .select(REPLY_SELECT)
          .in("post_id", posts.map((p) => p.id))
          .in("status", ["visible", "held"])
          .order("created_at")
          .limit(1000);
        if (replyError) throw new Error(replyError.message);
        for (const r of (rows ?? []) as unknown as BoardReply[]) {
          (replies.get(r.post_id) ?? replies.set(r.post_id, []).get(r.post_id)!).push(r);
        }
      }
      return { posts, replies };
    },
  });
}

/** Short-lived links to the board's pictures (the bucket is private). */
export function useSpaceImages(paths: string[]) {
  const key = useMemo(() => [...paths].sort().join("|"), [paths]);
  return useQuery({
    queryKey: [...CREATOR_KEY, "images", key],
    enabled: paths.length > 0,
    staleTime: 45 * 60 * 1000,
    gcTime: 50 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from(SPACE_BUCKET).createSignedUrls(paths, 60 * 60);
      if (error) throw new Error(error.message);
      const out: Record<string, string> = {};
      for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
      return out;
    },
  });
}

type Written<T> = ({ nudge: true; message: string }) | ({ nudge?: false; held: boolean; message: string | null } & T);

export interface NewPost { topic: Topic; body: string; files: File[]; gameKey: string | null; confirm?: boolean; uploaded?: SpaceImage[] }

/**
 * Posts to the board. Pictures go up first, into the author's own folder. The
 * server may answer with a `nudge` (it would be held for a moderator): show the
 * message and call again with `confirm` and the `uploaded` pictures to post anyway.
 */
export function useCreatePost(folder: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (post: NewPost): Promise<Written<{ post: BoardPost }> & { uploaded: SpaceImage[] }> => {
      if (!folder) throw new Error("You need a creator profile to post.");
      const uploaded = post.uploaded ?? [];
      if (!post.uploaded) for (const file of post.files) uploaded.push(await uploadSpaceImage(folder, file));
      const res = await mediaApi<Written<{ post: BoardPost }>>("/api/creators/posts", {
        body: { topic: post.topic, body: post.body, images: uploaded, gameKey: post.gameKey, confirm: post.confirm },
      });
      return { ...res, uploaded };
    },
    onSuccess: (res) => {
      if (!res.nudge) void queryClient.invalidateQueries({ queryKey: boardKey });
    },
  });
}

export function useCreateReply(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; confirm?: boolean }) =>
      mediaApi<Written<{ reply: BoardReply }>>(`/api/creators/posts/${postId}/replies`, { body: input }),
    onSuccess: (res) => {
      if (!res.nudge) void queryClient.invalidateQueries({ queryKey: boardKey });
    },
  });
}

export function useRemoveFromBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id }: { type: "post" | "reply"; id: string }) =>
      mediaApi<{ ok: true }>(type === "post" ? `/api/creators/posts/${id}` : `/api/creators/replies/${id}`, { method: "DELETE" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: boardKey }),
  });
}

export const REPORT_REASONS: Array<{ id: string; label: string }> = [
  { id: "abuse", label: "Abusive or aimed at someone" },
  { id: "hate", label: "Hateful" },
  { id: "stolen_work", label: "Someone else's work passed off as theirs" },
  { id: "spam", label: "Spam or selling" },
  { id: "other", label: "Something else" },
];

export function useReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: "post" | "reply"; id: string; reason: string }) => mediaApi<{ ok: true; hidden?: boolean }>("/api/creators/report", { body: input }),
    onSuccess: (res) => {
      if (res.hidden) void queryClient.invalidateQueries({ queryKey: boardKey });
    },
  });
}

/** Like or unlike a post; the count moves at once and settles from the database. */
export function useToggleLike(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, liked }: { postId: string; liked: boolean }) => {
      if (!userId) throw new Error("Sign in first.");
      const q = liked
        ? supabase.from("creator_post_likes").delete().eq("post_id", postId).eq("user_id", userId)
        : supabase.from("creator_post_likes").insert({ post_id: postId, user_id: userId });
      const { error } = await q;
      if (error && error.code !== "23505") throw new Error(error.message);
    },
    onMutate: async ({ postId, liked }) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      const before = queryClient.getQueryData<{ posts: BoardPost[]; replies: Map<string, BoardReply[]> }>(boardKey);
      if (before && userId) {
        queryClient.setQueryData(boardKey, {
          ...before,
          posts: before.posts.map((p) =>
            p.id !== postId ? p : { ...p, likes: liked ? p.likes.filter((l) => l.user_id !== userId) : [...p.likes, { user_id: userId }] },
          ),
        });
      }
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) queryClient.setQueryData(boardKey, ctx.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: boardKey }),
  });
}

// ── Dates ─────────────────────────────────────────────────────────────────
// A fixture's matchtime holds UK wall-clock digits (lib/scheduleTime.ts turns
// them into the real moment); these read it back as the UK day and time.

const UK = "Europe/London";
const ukDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: UK }).format(d);

/** The moment a fixture tips off. */
export const tipOff = (matchtime: string) => parseScheduleTime(matchtime);

/** The UK calendar day of a fixture, YYYY-MM-DD, for grouping. */
export const dayKey = (matchtime: string) => ukDay(tipOff(matchtime));

/** "Today", "Tomorrow", or "Sat 14 Nov", by the UK calendar. */
export function dayLabel(matchtime: string): string {
  const day = dayKey(matchtime);
  if (day === ukDay(new Date())) return "Today";
  if (day === ukDay(new Date(Date.now() + 86400e3))) return "Tomorrow";
  return tipOff(matchtime).toLocaleDateString("en-GB", { timeZone: UK, weekday: "short", day: "numeric", month: "short" });
}

export const tipTime = (matchtime: string) => tipOff(matchtime).toLocaleTimeString("en-GB", { timeZone: UK, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function ago(at: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}
