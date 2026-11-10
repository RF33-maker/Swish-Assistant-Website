import type { Express, Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabaseServiceClient";
import { activeMute, aiCheck, bannedTerms, tidyBody, userFrom } from "./feedComments";
import { filterComment } from "@shared/commentFilter";

/**
 * The creator space board (public.creator_posts, creator_post_replies).
 *
 * Reading is done by the browser under row-level security: only creators (an
 * account with a claimed creator profile) and admins can see the board. Every
 * write comes through here so it is checked first, the same way Feed comments
 * are, with two differences that suit a small, invited group:
 *
 *   - links and contact details are allowed (members share their work, their
 *     kit and how to reach them);
 *   - when the AI check can't run, the post still goes up (the word list has
 *     already run) and is marked for an admin to glance at, rather than held.
 *
 * A post the checks would stop is offered back to its author first; posting
 * anyway saves it as `held` for an admin. Two reports from different members
 * hold a post or reply until an admin looks at it.
 */

const POST_MAX = 2000;
const REPLY_MAX = 1000;
const MAX_IMAGES = 6;
const PER_MINUTE = 4;
const POSTS_PER_DAY = 12;
const REPLIES_PER_DAY = 80;
const REPORTS_TO_HOLD = 2;
const TOPICS = ["general", "work", "advice", "gear", "collab", "question"];
const REASONS = ["abuse", "hate", "spam", "stolen_work", "other"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHERE =
  "the creator space, a members-only board where basketball photographers, videographers and designers talk shop. " +
  "Links to their work, kit talk, rates, contact details and offers to work together are all normal here. " +
  "Blunt but constructive feedback on someone's work is allowed; insults aimed at the person are not.";

/** What the rethink prompt says, by the first reason the checks gave (the Feed's wording is about players and games). */
const NUDGE: Record<string, string> = {
  banned_words: "It has a word that isn't allowed here.",
  hate: "It could read as hateful towards a group of people.",
  harassment: "It reads like it's aimed at a person rather than their work.",
  threat: "It could read as a threat, even if it's meant as a joke.",
  sexual: "Comments about anyone's looks or body aren't allowed here.",
  self_harm: "It could read as encouraging someone to hurt themselves.",
  personal_info: "It seems to share someone else's personal details.",
  about_a_player_personally: "It's about a player as a person, not their basketball.",
  spam: "It looks like spam.",
};
const nudgeFor = (categories: string[]) => categories.map((c) => NUDGE[c]).find(Boolean) ?? "It might break the board's rules.";

const POST_COLUMNS = "id, photographer_id, user_id, topic, body, images, game_key, status, moderation, report_count, created_at";
const REPLY_COLUMNS = "id, post_id, photographer_id, user_id, body, status, moderation, report_count, created_at";

interface Member {
  user: User;
  /** Their creator profile; null for an admin posting as the Swish team. */
  photographerId: string | null;
  admin: boolean;
}

async function isAdminUser(user: User): Promise<boolean> {
  if (user.app_metadata?.role === "admin") return true;
  const { data } = await supabaseAdmin.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return !!data;
}

/** The creator (or admin) behind a request, or null with the response already sent. */
async function memberFrom(req: Request, res: Response): Promise<Member | null> {
  const user = await userFrom(req);
  if (!user) {
    res.status(401).json({ error: "Sign in first." });
    return null;
  }
  const [{ data: profile }, admin] = await Promise.all([
    supabaseAdmin.from("photographers").select("id").eq("user_id", user.id).eq("status", "claimed").maybeSingle(),
    isAdminUser(user),
  ]);
  if (!profile && !admin) {
    res.status(403).json({ error: "The creator space is for creators with a Swish profile." });
    return null;
  }
  return { user, photographerId: profile?.id ?? null, admin };
}

const since = (ms: number) => new Date(Date.now() - ms).toISOString();

async function countMine(table: "creator_posts" | "creator_post_replies", userId: string, from: string): Promise<number> {
  const { count, error } = await supabaseAdmin.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", from);
  if (error || count == null) throw new Error(error?.message ?? "Couldn't count posts");
  return count;
}

type Checked = { status: "visible" | "held"; moderation: Record<string, unknown> };

// Verdicts already given, so "Post anyway" doesn't pay for a second check of the same words.
const recentVerdicts = new Map<string, Checked & { at: number }>();

/**
 * Runs the word list and the AI check. Returns the status to save with, or a
 * `nudge` when the checks would hold it and the author hasn't confirmed.
 */
async function check(userId: string, body: string, headline: string, confirm: boolean): Promise<Checked | { nudge: string }> {
  const key = `${userId}|${body}`;
  const known = recentVerdicts.get(key);
  let result: Checked;
  const filtered = filterComment(body, await bannedTerms(), { wordsOnly: true });
  if (!filtered.ok) {
    result = { status: "held", moderation: { source: "filter", categories: ["banned_words"] } };
  } else if (confirm && known && Date.now() - known.at < 15 * 60e3) {
    result = { status: known.status, moderation: known.moderation };
  } else {
    const verdict = await aiCheck(body, { headline, playerPost: false, newAccount: false, where: WHERE });
    if (!verdict) result = { status: "visible", moderation: { source: "unchecked", note: "The automatic check couldn't run." } };
    else if (verdict.verdict === "hold") result = { status: "held", moderation: { source: "ai", categories: verdict.categories, note: verdict.note } };
    else result = { status: "visible", moderation: { source: "ai", verdict: "allow" } };
  }
  if (result.status === "held" && !confirm) {
    recentVerdicts.set(key, { ...result, at: Date.now() });
    if (recentVerdicts.size > 1000) recentVerdicts.delete(recentVerdicts.keys().next().value!);
    return { nudge: nudgeFor((result.moderation.categories as string[]) ?? []) };
  }
  recentVerdicts.delete(key);
  if (result.status === "held") result.moderation = { ...result.moderation, posted_after_prompt: true };
  return result;
}

/** Whether the account may write right now; sends the refusal itself. */
async function mayWrite(member: Member, res: Response, table: "creator_posts" | "creator_post_replies"): Promise<boolean> {
  const mute = await activeMute(member.user.id);
  if (mute) {
    res.status(403).json({ error: "Your account can't post at the moment." });
    return false;
  }
  const [posts, replies] = await Promise.all([countMine("creator_posts", member.user.id, since(60e3)), countMine("creator_post_replies", member.user.id, since(60e3))]);
  if (posts + replies >= PER_MINUTE) {
    res.status(429).json({ error: "Slow down a little, then try again." });
    return false;
  }
  const today = await countMine(table, member.user.id, since(24 * 3600e3));
  if (today >= (table === "creator_posts" ? POSTS_PER_DAY : REPLIES_PER_DAY)) {
    res.status(429).json({ error: "That's the most for today. Back tomorrow." });
    return false;
  }
  return true;
}

type BoardImage = { path: string; w: number; h: number; full?: string };

function cleanImages(raw: unknown, folder: string): BoardImage[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_IMAGES) return null;
  // Only files the author put in their own folder: the board's copy, and its full-size twin.
  const own = (path: string) => path.startsWith(`${folder}/posts/`) && /^[a-z0-9-]+\/posts\/[0-9a-f-]{36}(-full)?\.(webp|jpg)$/i.test(path);
  const out: BoardImage[] = [];
  for (const item of raw) {
    const path = String(item?.path ?? "");
    const full = item?.full == null ? undefined : String(item.full);
    const w = Math.round(Number(item?.w));
    const h = Math.round(Number(item?.h));
    if (!own(path) || (full !== undefined && !own(full))) return null;
    if (!(w > 0 && w <= 8000 && h > 0 && h <= 8000)) return null;
    out.push(full ? { path, w, h, full } : { path, w, h });
  }
  return out;
}

export function registerCreatorSpaceRoutes(app: Express) {
  // POST /api/creators/posts { topic, body, images?, gameKey?, confirm? }
  //   -> { post, held, message } or { nudge: true, message } (nothing saved)
  app.post("/api/creators/posts", async (req: Request, res: Response) => {
    try {
      const member = await memberFrom(req, res);
      if (!member) return;
      const topic = String(req.body?.topic ?? "general");
      if (!TOPICS.includes(topic)) return res.status(400).json({ error: "Pick a topic." });
      const body = tidyBody(req.body?.body);
      if (!body) return res.status(400).json({ error: "Write something first." });
      if (body.length > POST_MAX) return res.status(400).json({ error: `Keep it under ${POST_MAX} characters.` });
      const images = cleanImages(req.body?.images, member.photographerId ?? "swish");
      if (!images) return res.status(400).json({ error: "Those pictures couldn't be attached." });
      let gameKey: string | null = null;
      if (req.body?.gameKey) {
        const { data: game } = await supabaseAdmin.from("game_schedule").select("game_key").eq("game_key", String(req.body.gameKey)).maybeSingle();
        if (!game) return res.status(400).json({ error: "That game isn't on the schedule." });
        gameKey = game.game_key;
      }
      if (!(await mayWrite(member, res, "creator_posts"))) return;

      const checked = await check(member.user.id, body, `A new post (${topic})`, req.body?.confirm === true);
      if ("nudge" in checked) return res.json({ nudge: true, message: checked.nudge });

      const { data: post, error } = await supabaseAdmin
        .from("creator_posts")
        .insert({ photographer_id: member.photographerId, user_id: member.user.id, topic, body, images, game_key: gameKey, status: checked.status, moderation: checked.moderation })
        .select(POST_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return res.json({
        post,
        held: checked.status === "held",
        message: checked.status === "held" ? "Thanks. Your post is waiting for a moderator before others can see it." : null,
      });
    } catch (err: any) {
      console.error("[creator-space] post failed:", err?.message ?? err);
      return res.status(500).json({ error: "Couldn't post that. Try again in a moment." });
    }
  });

  // POST /api/creators/posts/:id/replies { body, confirm? }
  app.post("/api/creators/posts/:id/replies", async (req: Request, res: Response) => {
    try {
      const member = await memberFrom(req, res);
      if (!member) return;
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: "That post has gone." });
      const body = tidyBody(req.body?.body);
      if (!body) return res.status(400).json({ error: "Write something first." });
      if (body.length > REPLY_MAX) return res.status(400).json({ error: `Keep it under ${REPLY_MAX} characters.` });
      const { data: post } = await supabaseAdmin.from("creator_posts").select("id, body, status").eq("id", req.params.id).maybeSingle();
      if (!post || post.status !== "visible") return res.status(404).json({ error: "That post has gone." });
      if (!(await mayWrite(member, res, "creator_post_replies"))) return;

      const checked = await check(member.user.id, body, `A reply to: ${String(post.body).slice(0, 160)}`, req.body?.confirm === true);
      if ("nudge" in checked) return res.json({ nudge: true, message: checked.nudge });

      const { data: reply, error } = await supabaseAdmin
        .from("creator_post_replies")
        .insert({ post_id: post.id, photographer_id: member.photographerId, user_id: member.user.id, body, status: checked.status, moderation: checked.moderation })
        .select(REPLY_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return res.json({
        reply,
        held: checked.status === "held",
        message: checked.status === "held" ? "Thanks. Your reply is waiting for a moderator before others can see it." : null,
      });
    } catch (err: any) {
      console.error("[creator-space] reply failed:", err?.message ?? err);
      return res.status(500).json({ error: "Couldn't post that reply. Try again in a moment." });
    }
  });

  // DELETE /api/creators/posts/:id · /api/creators/replies/:id  (its author, or an admin)
  const remove = (table: "creator_posts" | "creator_post_replies") => async (req: Request, res: Response) => {
    try {
      const member = await memberFrom(req, res);
      if (!member) return;
      if (!UUID.test(req.params.id)) return res.status(404).json({ error: "That has already gone." });
      const { data: row } = await supabaseAdmin.from(table).select(table === "creator_posts" ? "id, user_id, moderation, images" : "id, user_id, moderation").eq("id", req.params.id).maybeSingle();
      const found = row as { id: string; user_id: string; moderation: object; images?: unknown } | null;
      if (!found) return res.status(404).json({ error: "That has already gone." });
      const own = found.user_id === member.user.id;
      if (!own && !member.admin) return res.status(403).json({ error: "That isn't yours to remove." });
      const { error } = await supabaseAdmin
        .from(table)
        .update({ status: "removed", moderation: { ...found.moderation, removed_by: own ? "author" : "admin" } })
        .eq("id", found.id);
      if (error) throw new Error(error.message);
      // A removed post's pictures go with it.
      if (table === "creator_posts" && Array.isArray(found.images) && found.images.length) {
        await supabaseAdmin.storage.from("creator-space").remove(found.images.flatMap((i: any) => [i.path, i.full].filter(Boolean).map(String)));
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[creator-space] remove failed:", err?.message ?? err);
      return res.status(500).json({ error: "Couldn't remove that." });
    }
  };
  app.delete("/api/creators/posts/:id", remove("creator_posts"));
  app.delete("/api/creators/replies/:id", remove("creator_post_replies"));

  // POST /api/creators/report { type: "post" | "reply", id, reason }
  app.post("/api/creators/report", async (req: Request, res: Response) => {
    try {
      const member = await memberFrom(req, res);
      if (!member) return;
      const type = req.body?.type === "reply" ? "reply" : "post";
      const id = String(req.body?.id ?? "");
      const reason = String(req.body?.reason ?? "other");
      if (!UUID.test(id) || !REASONS.includes(reason)) return res.status(400).json({ error: "Pick a reason." });
      const table = type === "post" ? "creator_posts" : "creator_post_replies";
      const { data: row } = await supabaseAdmin.from(table).select("id, user_id, status, moderation").eq("id", id).maybeSingle();
      if (!row || row.status !== "visible") return res.json({ ok: true });
      if (row.user_id === member.user.id) return res.status(400).json({ error: "That's your own." });

      const { error: insertError } = await supabaseAdmin.from("creator_reports").insert({ target_type: type, target_id: id, user_id: member.user.id, reason });
      if (insertError && insertError.code !== "23505") throw new Error(insertError.message); // a second report from the same person counts once
      const { count } = await supabaseAdmin.from("creator_reports").select("target_id", { count: "exact", head: true }).eq("target_type", type).eq("target_id", id);
      const reports = count ?? 0;
      const hold = reports >= REPORTS_TO_HOLD;
      await supabaseAdmin
        .from(table)
        .update({ report_count: reports, ...(hold ? { status: "held", moderation: { ...(row.moderation as object), source: "reports" } } : {}) })
        .eq("id", id);
      return res.json({ ok: true, hidden: hold });
    } catch (err: any) {
      console.error("[creator-space] report failed:", err?.message ?? err);
      return res.status(500).json({ error: "Couldn't send that report." });
    }
  });

  // ---- Moderators ----

  const requireAdmin = async (req: Request, res: Response): Promise<User | null> => {
    const user = await userFrom(req);
    if (!user || !(await isAdminUser(user))) {
      res.status(user ? 403 : 401).json({ error: "Admins only." });
      return null;
    }
    return user;
  };

  // GET /api/admin/creators/queue -> { posts, replies }: everything held or reported
  app.get("/api/admin/creators/queue", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const [posts, replies] = await Promise.all([
        supabaseAdmin.from("creator_posts").select(`${POST_COLUMNS}, author:photographers(display_name, slug)`).or("status.eq.held,and(status.eq.visible,report_count.gt.0)").order("created_at", { ascending: false }).limit(100),
        supabaseAdmin.from("creator_post_replies").select(`${REPLY_COLUMNS}, author:photographers(display_name, slug)`).or("status.eq.held,and(status.eq.visible,report_count.gt.0)").order("created_at", { ascending: false }).limit(100),
      ]);
      const failed = [posts, replies].find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
      return res.json({ posts: posts.data ?? [], replies: replies.data ?? [] });
    } catch (err: any) {
      console.error("[creator-space] queue failed:", err?.message ?? err);
      return res.status(500).json({ error: "Couldn't load the queue." });
    }
  });

  // POST /api/admin/creators/review { type, id, action: "approve" | "remove" }
  app.post("/api/admin/creators/review", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const type = req.body?.type === "reply" ? "reply" : "post";
      const id = String(req.body?.id ?? "");
      const action = req.body?.action;
      if (!UUID.test(id) || (action !== "approve" && action !== "remove")) return res.status(400).json({ error: "Approve or remove." });
      const table = type === "post" ? "creator_posts" : "creator_post_replies";
      const { data: row } = await supabaseAdmin.from(table).select("id, moderation").eq("id", id).maybeSingle();
      if (!row) return res.status(404).json({ error: "That has gone." });
      const { error } = await supabaseAdmin
        .from(table)
        .update({
          status: action === "approve" ? "visible" : "removed",
          ...(action === "approve" ? { report_count: 0 } : {}),
          moderation: { ...(row.moderation as object), reviewed: action },
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
      if (action === "approve") await supabaseAdmin.from("creator_reports").delete().eq("target_type", type).eq("target_id", id);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[creator-space] review failed:", err?.message ?? err);
      return res.status(500).json({ error: "Couldn't save that." });
    }
  });
}
