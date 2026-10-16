import express, { type Express, type Request, type Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { isSeasonLabel, seasonLabel } from "@shared/season";
import { teamClubKey } from "./teamIdentityService";

/**
 * Coaches Hub playbook API (public.coach_playbooks, RLS on with no policies).
 *
 * A coach account's playbook belongs to their club, so all of that team's
 * coaches share one set of plays. A club has a separate team_id in every
 * competition, so the playbook is keyed on club identity (the same grouping the
 * hub's competition switcher uses), not on whichever team_id the account holds. Anyone else who is signed in (admins, league
 * owners) keeps a personal playbook. Saves carry the `updatedAt` they were
 * built on, so one coach can't silently overwrite a teammate's newer save.
 */

/** Playbooks carry every play's court diagrams, which can pass the 100kb default. */
export const playbookBodyParser = express.json({ limit: "2mb" });

const MAX_BYTES = 1_500_000;

type Owner = { userId: string; key: string; shared: boolean };

/** `team:club:<club key>` for any of a club's competition entries; the raw id if the team can't be named. */
async function teamOwnerKey(teamId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("teams").select("name").eq("team_id", teamId).limit(1).maybeSingle();
  return data?.name ? `team:club:${teamClubKey(data.name)}` : `team:${teamId}`;
}

async function resolveOwner(req: Request): Promise<Owner | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (error || !data.user) return null;
  const user = data.user;
  const teamId = user.app_metadata?.role === "coach" ? user.app_metadata?.team_id : null;
  if (teamId) return { userId: user.id, key: await teamOwnerKey(teamId), shared: true };
  return { userId: user.id, key: `user:${user.id}`, shared: false };
}

/** The shape the Playbook tab writes: a title and a list of sections. */
function isPlaybook(data: unknown): data is { title?: unknown; sections: unknown[] } {
  return !!data && typeof data === "object" && !Array.isArray(data) && Array.isArray((data as any).sections);
}

export function registerPlaybookRoutes(app: Express) {
  // GET /api/playbook?season=2026/27 -> { playbook, updatedAt, ownerKey, shared, season, currentSeason, seasons }
  // `seasons` lists every season this owner has saved a playbook for, newest first.
  app.get("/api/playbook", async (req: Request, res: Response) => {
    try {
      const owner = await resolveOwner(req);
      if (!owner) return res.status(401).json({ error: "Sign in to open your playbook" });
      const currentSeason = seasonLabel();
      const asked = req.query.season;
      if (asked !== undefined && !isSeasonLabel(asked)) return res.status(400).json({ error: "That isn't a season" });
      const season = (asked as string | undefined) ?? currentSeason;

      const [row, list] = await Promise.all([
        supabaseAdmin.from("coach_playbooks").select("data, updated_at").eq("owner_key", owner.key).eq("season", season).maybeSingle(),
        supabaseAdmin.from("coach_playbooks").select("season, title, updated_at").eq("owner_key", owner.key).order("season", { ascending: false }),
      ]);
      if (row.error) throw new Error(row.error.message);
      if (list.error) throw new Error(list.error.message);
      const seasons = (list.data ?? []).map((r) => ({ season: r.season, title: r.title, updatedAt: r.updated_at }));
      return res.json({ playbook: row.data?.data ?? null, updatedAt: row.data?.updated_at ?? null, ownerKey: owner.key, shared: owner.shared, season, currentSeason, seasons });
    } catch (err: any) {
      console.error("[playbook] load failed:", err?.message);
      return res.status(500).json({ error: "Failed to load the playbook" });
    }
  });

  // PUT /api/playbook { data, baseUpdatedAt, season } -> { updatedAt }
  app.put("/api/playbook", async (req: Request, res: Response) => {
    try {
      const owner = await resolveOwner(req);
      if (!owner) return res.status(401).json({ error: "Sign in again to save your playbook" });
      const { data, baseUpdatedAt, season: askedSeason } = req.body || {};
      if (askedSeason !== undefined && !isSeasonLabel(askedSeason)) return res.status(400).json({ error: "That isn't a season" });
      const season: string = askedSeason ?? seasonLabel();
      if (!isPlaybook(data)) return res.status(400).json({ error: "That isn't a playbook" });
      if (JSON.stringify(data).length > MAX_BYTES) return res.status(413).json({ error: "This playbook is too large to save. Remove some plays and try again." });

      const { data: existing, error: readErr } = await supabaseAdmin
        .from("coach_playbooks")
        .select("id, updated_at")
        .eq("owner_key", owner.key)
        .eq("season", season)
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
        : await supabaseAdmin.from("coach_playbooks").insert({ owner_key: owner.key, season, data, title, updated_by: owner.userId, updated_at: now });
      if (error) throw new Error(error.message);
      return res.json({ updatedAt: now });
    } catch (err: any) {
      console.error("[playbook] save failed:", err?.message);
      return res.status(500).json({ error: "Couldn't save the playbook. Try again in a moment." });
    }
  });
}
