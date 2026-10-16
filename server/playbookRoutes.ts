import express, { type Express, type Request, type Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";

/**
 * Coaches Hub playbook API (public.coach_playbooks, RLS on with no policies).
 *
 * A coach account's playbook belongs to their club, so all of that team's
 * coaches share one set of plays. Anyone else who is signed in (admins, league
 * owners) keeps a personal playbook. Saves carry the `updatedAt` they were
 * built on, so one coach can't silently overwrite a teammate's newer save.
 */

/** Playbooks carry every play's court diagrams, which can pass the 100kb default. */
export const playbookBodyParser = express.json({ limit: "2mb" });

const MAX_BYTES = 1_500_000;

type Owner = { userId: string; key: string; shared: boolean };

async function resolveOwner(req: Request): Promise<Owner | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (error || !data.user) return null;
  const user = data.user;
  const teamId = user.app_metadata?.role === "coach" ? user.app_metadata?.team_id : null;
  if (teamId) return { userId: user.id, key: `team:${teamId}`, shared: true };
  return { userId: user.id, key: `user:${user.id}`, shared: false };
}

/** The shape the Playbook tab writes: a title and a list of sections. */
function isPlaybook(data: unknown): data is { title?: unknown; sections: unknown[] } {
  return !!data && typeof data === "object" && !Array.isArray(data) && Array.isArray((data as any).sections);
}

export function registerPlaybookRoutes(app: Express) {
  // GET /api/playbook -> { playbook, updatedAt, ownerKey, shared }
  app.get("/api/playbook", async (req: Request, res: Response) => {
    try {
      const owner = await resolveOwner(req);
      if (!owner) return res.status(401).json({ error: "Sign in to open your playbook" });
      const { data, error } = await supabaseAdmin
        .from("coach_playbooks")
        .select("data, updated_at")
        .eq("owner_key", owner.key)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return res.json({ playbook: data?.data ?? null, updatedAt: data?.updated_at ?? null, ownerKey: owner.key, shared: owner.shared });
    } catch (err: any) {
      console.error("[playbook] load failed:", err?.message);
      return res.status(500).json({ error: "Failed to load the playbook" });
    }
  });

  // PUT /api/playbook { data, baseUpdatedAt } -> { updatedAt }
  app.put("/api/playbook", async (req: Request, res: Response) => {
    try {
      const owner = await resolveOwner(req);
      if (!owner) return res.status(401).json({ error: "Sign in again to save your playbook" });
      const { data, baseUpdatedAt } = req.body || {};
      if (!isPlaybook(data)) return res.status(400).json({ error: "That isn't a playbook" });
      if (JSON.stringify(data).length > MAX_BYTES) return res.status(413).json({ error: "This playbook is too large to save. Remove some plays and try again." });

      const { data: existing, error: readErr } = await supabaseAdmin
        .from("coach_playbooks")
        .select("id, updated_at")
        .eq("owner_key", owner.key)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);

      // Someone else saved since this copy was loaded: don't overwrite their plays.
      if (existing && new Date(existing.updated_at).getTime() !== new Date(baseUpdatedAt || 0).getTime()) {
        return res.status(409).json({ error: "Someone on your team saved a newer version. Reload the page to see it.", updatedAt: existing.updated_at });
      }

      const now = new Date().toISOString();
      const title = typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 120) : "Team Playbook";
      const { error } = existing
        ? await supabaseAdmin.from("coach_playbooks").update({ data, title, updated_by: owner.userId, updated_at: now }).eq("id", existing.id)
        : await supabaseAdmin.from("coach_playbooks").insert({ owner_key: owner.key, data, title, updated_by: owner.userId, updated_at: now });
      if (error) throw new Error(error.message);
      return res.json({ updatedAt: now });
    } catch (err: any) {
      console.error("[playbook] save failed:", err?.message);
      return res.status(500).json({ error: "Couldn't save the playbook. Try again in a moment." });
    }
  });
}
