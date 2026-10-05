import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { checkPreferredName, sameName, splitName } from "@shared/preferredName";

/**
 * Preferred names: the name a player actually goes by.
 *
 *  - An admin sets one directly and it applies at once.
 *  - A player who has claimed their profile (an approved claim covering that
 *    player) requests one; it waits for an admin to approve it. A public stats
 *    site shouldn't let anyone retitle themselves without a look.
 *
 * Applying a name renames every players row the person owns (their claim's
 * rows, or the rows an admin lists), brings their box-score rows into line,
 * and records the old spellings in players.aliases so the stat-capture worker
 * keeps matching the feed's old name to this person instead of making a new
 * profile. Nothing is deleted, and the old spellings stay recorded.
 */

type AdminGuard = (req: Request, res: Response) => Promise<string | null>;

interface Deps {
  requireAdmin: AdminGuard;
  authenticate: (req: Request) => Promise<string | null>;
  withAliases: (existing: string[] | null | undefined, canonicalName: string, ...names: (string | null | undefined)[]) => string[];
  formatName: (name: string) => string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUESTS_PER_DAY = 5;

async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.app_metadata?.role === "admin";
}

/** The rows the user's approved claim covers, if it covers this player. */
async function ownedRows(userId: string, playerId: string): Promise<string[] | null> {
  const { data: claims } = await supabaseAdmin
    .from("player_claims")
    .select("id, player_id")
    .eq("user_id", userId)
    .eq("status", "approved");
  if (!claims?.length) return null;
  const claimIds = claims.map((c: any) => c.id);
  const { data: rows } = await supabaseAdmin.from("player_claim_rows").select("player_id, claim_id").in("claim_id", claimIds);
  const covered = new Set<string>();
  for (const c of claims as any[]) {
    const mine = (rows || []).filter((r: any) => r.claim_id === c.id).map((r: any) => r.player_id as string);
    const all = new Set<string>([c.player_id, ...mine]);
    if (all.has(playerId)) all.forEach((id) => covered.add(id));
  }
  return covered.size ? Array.from(covered) : null;
}

/** Rows that belong to this player's claim (if claimed), else just the row itself. */
async function rowsForPlayer(playerId: string): Promise<string[]> {
  const { data: link } = await supabaseAdmin.from("player_claim_rows").select("claim_id").eq("player_id", playerId).maybeSingle();
  if (!link?.claim_id) return [playerId];
  const { data: claim } = await supabaseAdmin.from("player_claims").select("status").eq("id", link.claim_id).maybeSingle();
  if (claim?.status !== "approved") return [playerId];
  const { data: rows } = await supabaseAdmin.from("player_claim_rows").select("player_id").eq("claim_id", link.claim_id);
  return Array.from(new Set([playerId, ...(rows || []).map((r: any) => r.player_id as string)]));
}

export async function applyPreferredName(ids: string[], name: string, deps: Deps) {
  const { firstname, familyname } = splitName(name);
  const { data: players, error } = await supabaseAdmin.from("players").select("id, full_name, aliases").in("id", ids);
  if (error) throw new Error(error.message);
  if (!players?.length) throw new Error("No matching player records");
  const known = players.map((p: any) => p.id as string);

  // Every spelling the person has been recorded under, so the worker keeps matching them.
  const { data: statNames } = await supabaseAdmin.from("player_stats").select("full_name").in("player_id", known).limit(5000);
  const spellings = Array.from(new Set((statNames || []).map((r: any) => r.full_name as string).filter(Boolean)));
  const oldNames = [...players.map((p: any) => p.full_name as string), ...spellings];

  for (const p of players as any[]) {
    const { error: upErr } = await supabaseAdmin
      .from("players")
      .update({ full_name: name, firstname, familyname, aliases: deps.withAliases(p.aliases, name, ...oldNames) })
      .eq("id", p.id);
    if (upErr) throw new Error(upErr.message);
  }
  const { error: statErr, count } = await supabaseAdmin
    .from("player_stats")
    .update({ full_name: name, firstname, familyname }, { count: "exact" })
    .in("player_id", known)
    .neq("full_name", name);
  if (statErr) throw new Error(statErr.message);
  return { records: known.length, statRows: count ?? 0 };
}

export function registerPreferredNameRoutes(app: Express, deps: Deps) {
  // What can the signed-in user do for this player, and is a request already open?
  app.get("/api/players/:playerId/preferred-name", async (req: Request, res: Response) => {
    try {
      const { playerId } = req.params;
      if (!UUID.test(playerId)) return res.status(400).json({ error: "Invalid player" });
      const userId = await deps.authenticate(req);
      if (!userId) return res.json({ role: "none", pending: null });
      const admin = await isAdminUser(userId);
      const owned = admin ? null : await ownedRows(userId, playerId);
      const role = admin ? "admin" : owned ? "owner" : "none";
      if (role === "none") return res.json({ role, pending: null });
      const { data: pending } = await supabaseAdmin
        .from("player_name_requests")
        .select("id, requested_name, created_at")
        .eq("player_id", playerId)
        .eq("status", "pending")
        .maybeSingle();
      res.json({ role, pending: pending ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: set it now. Owner: ask for it.
  app.post("/api/players/:playerId/preferred-name", async (req: Request, res: Response) => {
    try {
      const { playerId } = req.params;
      if (!UUID.test(playerId)) return res.status(400).json({ error: "Invalid player" });
      const userId = await deps.authenticate(req);
      if (!userId) return res.status(401).json({ error: "Sign in to change a name" });

      const checked = checkPreferredName(String(req.body?.name ?? ""));
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      const name = deps.formatName(checked.name);

      const { data: player } = await supabaseAdmin.from("players").select("id, full_name").eq("id", playerId).maybeSingle();
      if (!player) return res.status(404).json({ error: "Player not found" });

      if (await isAdminUser(userId)) {
        const extra: unknown = req.body?.playerIds;
        const ids = new Set<string>(await rowsForPlayer(playerId));
        if (Array.isArray(extra)) for (const id of extra.slice(0, 50)) if (typeof id === "string" && UUID.test(id)) ids.add(id);
        const result = await applyPreferredName(Array.from(ids), name, deps);
        await supabaseAdmin
          .from("player_name_requests")
          .update({ status: "approved", decided_by: userId, decided_at: new Date().toISOString() })
          .eq("player_id", playerId)
          .eq("status", "pending");
        return res.json({ applied: true, name, ...result });
      }

      const owned = await ownedRows(userId, playerId);
      if (!owned) return res.status(403).json({ error: "Only the player who claimed this profile can ask for a preferred name" });
      if (sameName(name, player.full_name)) return res.status(400).json({ error: "That is already your name on the site." });

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("player_name_requests")
        .select("id", { count: "exact", head: true })
        .eq("requested_by", userId)
        .gte("created_at", since);
      if ((count ?? 0) >= REQUESTS_PER_DAY) return res.status(429).json({ error: "You've sent a few requests today. Please try again tomorrow." });

      // A new request replaces an open one.
      await supabaseAdmin
        .from("player_name_requests")
        .update({ status: "cancelled", decided_at: new Date().toISOString() })
        .eq("player_id", playerId)
        .eq("status", "pending");
      const { data: created, error } = await supabaseAdmin
        .from("player_name_requests")
        .insert({ player_id: playerId, requested_name: name, requested_by: userId })
        .select("id, requested_name, created_at")
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json({ applied: false, pending: created });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Owner: withdraw their open request.
  app.delete("/api/players/:playerId/preferred-name", async (req: Request, res: Response) => {
    try {
      const { playerId } = req.params;
      if (!UUID.test(playerId)) return res.status(400).json({ error: "Invalid player" });
      const userId = await deps.authenticate(req);
      if (!userId) return res.status(401).json({ error: "Sign in first" });
      const { error } = await supabaseAdmin
        .from("player_name_requests")
        .update({ status: "cancelled", decided_at: new Date().toISOString() })
        .eq("player_id", playerId)
        .eq("requested_by", userId)
        .eq("status", "pending");
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: the open requests.
  app.get("/api/admin/preferred-name-requests", async (req: Request, res: Response) => {
    try {
      const adminId = await deps.requireAdmin(req, res);
      if (!adminId) return;
      const { data: rows, error } = await supabaseAdmin
        .from("player_name_requests")
        .select("id, player_id, requested_name, requested_by, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) return res.status(500).json({ error: error.message });
      const ids = (rows || []).map((r: any) => r.player_id);
      const { data: players } = ids.length
        ? await supabaseAdmin.from("players").select("id, full_name, team_name, slug").in("id", ids)
        : { data: [] as any[] };
      const byId = new Map((players || []).map((p: any) => [p.id, p]));
      const requests = await Promise.all(
        (rows || []).map(async (r: any) => {
          const p: any = byId.get(r.player_id);
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.requested_by);
          return {
            id: r.id,
            player_id: r.player_id,
            current_name: p?.full_name ?? "",
            team_name: p?.team_name ?? null,
            slug: p?.slug ?? null,
            requested_name: r.requested_name,
            requested_by_email: u?.user?.email ?? null,
            created_at: r.created_at,
          };
        }),
      );
      res.json({ requests });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/preferred-name-requests/:id/approve", async (req: Request, res: Response) => {
    try {
      const adminId = await deps.requireAdmin(req, res);
      if (!adminId) return;
      const { id } = req.params;
      if (!UUID.test(id)) return res.status(400).json({ error: "Invalid request" });
      const { data: request } = await supabaseAdmin
        .from("player_name_requests")
        .select("id, player_id, requested_name, status")
        .eq("id", id)
        .maybeSingle();
      if (!request || request.status !== "pending") return res.status(404).json({ error: "That request is no longer open" });
      const checked = checkPreferredName(request.requested_name);
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      const name = deps.formatName(checked.name);
      const result = await applyPreferredName(await rowsForPlayer(request.player_id), name, deps);
      await supabaseAdmin
        .from("player_name_requests")
        .update({ status: "approved", decided_by: adminId, decided_at: new Date().toISOString() })
        .eq("id", id);
      res.json({ applied: true, name, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/preferred-name-requests/:id/reject", async (req: Request, res: Response) => {
    try {
      const adminId = await deps.requireAdmin(req, res);
      if (!adminId) return;
      const { id } = req.params;
      if (!UUID.test(id)) return res.status(400).json({ error: "Invalid request" });
      const reason = String(req.body?.reason ?? "").trim().slice(0, 300) || null;
      const { data, error } = await supabaseAdmin
        .from("player_name_requests")
        .update({ status: "rejected", decided_by: adminId, decided_at: new Date().toISOString(), rejection_reason: reason })
        .eq("id", id)
        .eq("status", "pending")
        .select("id");
      if (error) return res.status(500).json({ error: error.message });
      if (!data?.length) return res.status(404).json({ error: "That request is no longer open" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
