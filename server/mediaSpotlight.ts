import type { Express, Request, Response } from "express";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "./supabaseServiceClient";
import { sendViaResend } from "./claimEmail";

/**
 * Media Spotlight: the parts that need the service key.
 *
 *  - Invite links. An admin creates a photographer profile, then asks for an
 *    invite link for it. The link carries a random token; only its sha256 is
 *    stored. Links last 14 days and work once.
 *  - Claiming. The photographer opens the link, signs in, and the token is
 *    swapped for ownership: photographers.user_id is set and the profile is
 *    marked claimed. The row-level policies then let them edit it.
 *  - The "Are you a photographer?" form on the landing page, which lands in
 *    photographer_applications for an admin to follow up.
 *
 * Everything else (profiles, photos, tags, spotlights, the usage log) is read
 * and written by the browser under row-level security.
 */

type AdminGuard = (req: Request, res: Response) => Promise<string | null>;

interface Deps {
  requireAdmin: AdminGuard;
  authenticate: (req: Request) => Promise<string | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const INVITE_DAYS = 14;
const SITE_URL = (process.env.SITE_URL || "https://swishassistant.com").replace(/\/$/, "");

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inviteEmail(displayName: string, url: string) {
  const first = displayName.trim().split(/\s+/)[0] || "there";
  const subject = "Your Swish Assistant creator profile";
  const text = [
    `Hi ${first},`,
    `We've set up a creator profile for you on Swish Assistant's Media Spotlight. Claim it to add your work, choose how we may use it and how you'd like to be credited. Claiming also opens the creator space and gives your account Swish+, free.`,
    `Claim your profile: ${url}`,
    `The link works once and expires in ${INVITE_DAYS} days.`,
    `Swish Assistant\n${SITE_URL}`,
  ].join("\n\n");
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
  const html =
    `<div style="font-family:${font};font-size:15px;line-height:1.55;color:#18181b;max-width:560px;margin:0 auto;padding:24px">` +
    `<p>Hi ${escapeHtml(first)},</p>` +
    `<p>We've set up a creator profile for you on Swish Assistant's <strong>Media Spotlight</strong>. Claim it to add your work, choose how we may use it and how you'd like to be credited. Claiming also opens the creator space and gives your account Swish+, free.</p>` +
    `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;background:#f97316;color:#fff;font-weight:600;text-decoration:none;border-radius:8px">Claim your profile</a></p>` +
    `<p style="color:#52525b;font-size:13px">The link works once and expires in ${INVITE_DAYS} days. If the button doesn't work, copy this address into your browser:<br>${escapeHtml(url)}</p>` +
    `<p style="color:#52525b;font-size:13px">Swish Assistant · <a href="${SITE_URL}" style="color:#52525b">${SITE_URL.replace(/^https?:\/\//, "")}</a></p>` +
    `</div>`;
  return { subject, text, html };
}

/** "You're in": for someone who applied signed in, so the profile is already theirs. */
function welcomeEmail(displayName: string) {
  const first = displayName.trim().split(/\s+/)[0] || "there";
  const url = `${SITE_URL}/media/creators`;
  const subject = "You're in: your Swish Assistant creator profile";
  const text = [
    `Hi ${first},`,
    `Your creator profile on Swish Assistant is ready, and it's linked to your account. Add your work, pick the teams you cover and say which games you'll be at.`,
    `It also opens the creator space, where the people who shoot and create around the game talk, share work and find each other at games. Swish+ is included with your profile, free.`,
    `Open the creator space: ${url}`,
    `Swish Assistant\n${SITE_URL}`,
  ].join("\n\n");
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
  const html =
    `<div style="font-family:${font};font-size:15px;line-height:1.55;color:#18181b;max-width:560px;margin:0 auto;padding:24px">` +
    `<p>Hi ${escapeHtml(first)},</p>` +
    `<p>Your creator profile on Swish Assistant is ready, and it's linked to your account. Add your work, pick the teams you cover and say which games you'll be at.</p>` +
    `<p>It also opens the <strong>creator space</strong>, where the people who shoot and create around the game talk, share work and find each other at games. Swish+ is included with your profile, free.</p>` +
    `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;background:#f97316;color:#fff;font-weight:600;text-decoration:none;border-radius:8px">Open the creator space</a></p>` +
    `<p style="color:#52525b;font-size:13px">Swish Assistant · <a href="${SITE_URL}" style="color:#52525b">${SITE_URL.replace(/^https?:\/\//, "")}</a></p>` +
    `</div>`;
  return { subject, text, html };
}

const CRAFTS = ["photo", "video", "design", "social", "writing", "commentary"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** The account that signed up with this email, if there is one. */
async function findAccountByEmail(email: string): Promise<{ id: string; confirmed: boolean } | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) return { id: hit.id, confirmed: !!hit.email_confirmed_at };
    if (data.users.length < 1000) break;
  }
  return null;
}

/** A fresh single-use claim link for a profile; earlier unused links stop working. */
async function createInvite(photographerId: string, email: string, adminId: string): Promise<{ url: string; expiresAt: string } | { error: string }> {
  await supabaseAdmin.from("photographer_invites").update({ expires_at: new Date().toISOString() }).eq("photographer_id", photographerId).is("used_at", null);
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from("photographer_invites").insert({
    photographer_id: photographerId,
    token_hash: hashToken(token),
    sent_to: email || null,
    created_by: adminId,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };
  return { url: `${SITE_URL}/media/claim/${token}`, expiresAt };
}

// The application form is open to the world, so cap it per address.
const applyHits = new Map<string, number[]>();
function tooManyApplications(ip: string): boolean {
  const now = Date.now();
  const recent = (applyHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  recent.push(now);
  applyHits.set(ip, recent);
  return recent.length > 5;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function registerMediaSpotlightRoutes(app: Express, deps: Deps) {
  // What an invite link points at, so the claim page can say whose profile it is.
  app.get("/api/media/invites/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      if (!TOKEN.test(token)) return res.json({ ok: false, reason: "invalid" });
      const { data: invite } = await supabaseAdmin
        .from("photographer_invites")
        .select("id, photographer_id, expires_at, used_at")
        .eq("token_hash", hashToken(token))
        .maybeSingle();
      if (!invite) return res.json({ ok: false, reason: "invalid" });
      if (invite.used_at) return res.json({ ok: false, reason: "used" });
      if (new Date(invite.expires_at).getTime() < Date.now()) return res.json({ ok: false, reason: "expired" });
      const { data: p } = await supabaseAdmin
        .from("photographers")
        .select("id, slug, display_name, handle, status, user_id")
        .eq("id", invite.photographer_id)
        .maybeSingle();
      if (!p) return res.json({ ok: false, reason: "invalid" });
      if (p.user_id) return res.json({ ok: false, reason: "claimed" });
      res.json({ ok: true, photographer: { slug: p.slug, display_name: p.display_name, handle: p.handle } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Signed in: take the profile.
  app.post("/api/media/invites/:token/claim", async (req: Request, res: Response) => {
    try {
      const userId = await deps.authenticate(req);
      if (!userId) return res.status(401).json({ error: "Sign in to claim this profile" });
      const { token } = req.params;
      if (!TOKEN.test(token)) return res.status(400).json({ error: "This invite link isn't valid" });

      const { data: invite } = await supabaseAdmin
        .from("photographer_invites")
        .select("id, photographer_id, expires_at, used_at")
        .eq("token_hash", hashToken(token))
        .maybeSingle();
      if (!invite) return res.status(400).json({ error: "This invite link isn't valid" });
      if (invite.used_at) return res.status(400).json({ error: "This invite link has already been used" });
      if (new Date(invite.expires_at).getTime() < Date.now()) return res.status(400).json({ error: "This invite link has expired. Ask us for a new one." });

      const { data: p } = await supabaseAdmin.from("photographers").select("id, slug, user_id, status").eq("id", invite.photographer_id).maybeSingle();
      if (!p) return res.status(400).json({ error: "This profile no longer exists" });
      if (p.user_id && p.user_id !== userId) return res.status(400).json({ error: "This profile has already been claimed" });

      const { data: existing } = await supabaseAdmin.from("photographers").select("id, slug").eq("user_id", userId).maybeSingle();
      if (existing && existing.id !== p.id) {
        return res.status(400).json({ error: "Your account already owns a photographer profile", slug: existing.slug });
      }

      const { error: upErr } = await supabaseAdmin
        .from("photographers")
        .update({ user_id: userId, status: p.status === "hidden" ? "hidden" : "claimed" })
        .eq("id", p.id);
      if (upErr) return res.status(500).json({ error: upErr.message });
      await supabaseAdmin.from("photographer_invites").update({ used_at: new Date().toISOString(), used_by: userId }).eq("id", invite.id);
      res.json({ ok: true, slug: p.slug });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: a fresh invite link for a profile, emailed if an address is given.
  app.post("/api/admin/media/photographers/:id/invite", async (req: Request, res: Response) => {
    try {
      const adminId = await deps.requireAdmin(req, res);
      if (!adminId) return;
      const { id } = req.params;
      if (!UUID.test(id)) return res.status(400).json({ error: "Invalid photographer" });
      const email = str(req.body?.email, 200);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "That email address doesn't look right" });

      const { data: p } = await supabaseAdmin.from("photographers").select("id, display_name, user_id").eq("id", id).maybeSingle();
      if (!p) return res.status(404).json({ error: "Photographer not found" });
      if (p.user_id) return res.status(400).json({ error: "This profile is already claimed" });

      const invite = await createInvite(id, email, adminId);
      if ("error" in invite) return res.status(500).json({ error: invite.error });
      const emailResult = email ? await sendViaResend(email, inviteEmail(p.display_name, invite.url), `media-invite-${id}-${Date.now()}`) : null;
      res.json({ url: invite.url, expires_at: invite.expiresAt, email: emailResult });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: hand a ready-made profile straight to someone who already has a
  // Swish account, found by the email they signed up with. Same end state as
  // claiming through an invite link (the profile is theirs, and Swish+ comes
  // with it), without them needing the link.
  app.post("/api/admin/media/photographers/:id/link", async (req: Request, res: Response) => {
    try {
      const adminId = await deps.requireAdmin(req, res);
      if (!adminId) return;
      const { id } = req.params;
      if (!UUID.test(id)) return res.status(400).json({ error: "Invalid profile" });
      const email = str(req.body?.email, 200).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "That email address doesn't look right" });

      const { data: p } = await supabaseAdmin.from("photographers").select("id, slug, display_name, user_id, status").eq("id", id).maybeSingle();
      if (!p) return res.status(404).json({ error: "Profile not found" });
      if (p.user_id) return res.status(400).json({ error: "This profile already belongs to an account. Unlink it first." });

      const account = await findAccountByEmail(email);
      if (!account) return res.status(404).json({ error: "No Swish account uses that email. Ask them to sign up first, or send an invite link instead." });
      if (!account.confirmed) return res.status(400).json({ error: "That account hasn't confirmed its email yet. Link it once they have." });
      const { data: existing } = await supabaseAdmin.from("photographers").select("id, display_name").eq("user_id", account.id).maybeSingle();
      if (existing) return res.status(400).json({ error: `That account already owns a profile (${existing.display_name}).` });

      const { error: upErr } = await supabaseAdmin
        .from("photographers")
        .update({ user_id: account.id, status: p.status === "hidden" ? "hidden" : "claimed" })
        .eq("id", p.id);
      if (upErr) return res.status(500).json({ error: upErr.message });
      // Any invite link still out for this profile has nothing left to claim.
      await supabaseAdmin.from("photographer_invites").update({ expires_at: new Date().toISOString() }).eq("photographer_id", p.id).is("used_at", null);

      const emailResult = req.body?.notify === false ? null : await sendViaResend(email, welcomeEmail(p.display_name), `media-welcome-${p.id}`);
      res.json({ ok: true, slug: p.slug, hidden: p.status === "hidden", email: emailResult });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: take a profile back from its account (a wrong link, or someone
  // leaving). The profile and its photos stay; the account loses the creator
  // space and the Swish+ that came with it.
  app.post("/api/admin/media/photographers/:id/unlink", async (req: Request, res: Response) => {
    try {
      const adminId = await deps.requireAdmin(req, res);
      if (!adminId) return;
      const { id } = req.params;
      if (!UUID.test(id)) return res.status(400).json({ error: "Invalid profile" });
      const { data: p } = await supabaseAdmin.from("photographers").select("id, user_id, status").eq("id", id).maybeSingle();
      if (!p) return res.status(404).json({ error: "Profile not found" });
      if (!p.user_id) return res.json({ ok: true });
      const { error } = await supabaseAdmin
        .from("photographers")
        .update({ user_id: null, status: p.status === "hidden" ? "hidden" : "unclaimed" })
        .eq("id", p.id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: say yes to an application. Makes the creator's profile from what
  // they sent. If they applied signed in, the profile is theirs at once (and
  // Swish+ with it); otherwise they get a claim link by email.
  app.post("/api/admin/media/applications/:id/approve", async (req: Request, res: Response) => {
    try {
      const adminId = await deps.requireAdmin(req, res);
      if (!adminId) return;
      const { id } = req.params;
      if (!UUID.test(id)) return res.status(400).json({ error: "Invalid application" });
      const { data: a } = await supabaseAdmin
        .from("photographer_applications")
        .select("id, name, email, handle, teams, crafts, user_id, photographer_id")
        .eq("id", id)
        .maybeSingle();
      if (!a) return res.status(404).json({ error: "Application not found" });
      if (a.photographer_id) return res.status(400).json({ error: "This application already has a profile" });

      // An account holds one creator profile.
      let ownerId: string | null = a.user_id ?? null;
      if (ownerId) {
        const { data: existing } = await supabaseAdmin.from("photographers").select("id").eq("user_id", ownerId).maybeSingle();
        if (existing) ownerId = null;
      }

      const base = slugify(a.name) || "creator";
      let slug = base;
      for (let n = 2; n < 50; n++) {
        const { data: clash } = await supabaseAdmin.from("photographers").select("id").eq("slug", slug).maybeSingle();
        if (!clash) break;
        slug = `${base}-${n}`;
      }

      const { data: p, error } = await supabaseAdmin
        .from("photographers")
        .insert({
          slug,
          display_name: a.name,
          handle: a.handle || null,
          crafts: (a.crafts as string[] | null)?.length ? a.crafts : ["photo"],
          user_id: ownerId,
          status: ownerId ? "claimed" : "unclaimed",
          created_by: adminId,
        })
        .select("id, slug, display_name")
        .single();
      if (error || !p) return res.status(500).json({ error: error?.message || "Couldn't create the profile" });

      // The teams they said they cover, linked to a real team where the name matches.
      const names = Array.from(new Set(String(a.teams || "").split(/[,\n]/).map((t) => t.trim()).filter(Boolean))).slice(0, 12);
      for (let i = 0; i < names.length; i++) {
        const { data: team } = await supabaseAdmin.from("teams").select("name, league_id").ilike("name", names[i]).order("created_at", { ascending: false }).limit(1).maybeSingle();
        await supabaseAdmin.from("creator_teams").insert({ photographer_id: p.id, team_name: team?.name ?? names[i], league_id: team?.league_id ?? null, position: i });
      }

      await supabaseAdmin.from("photographer_applications").update({ status: "done", photographer_id: p.id }).eq("id", a.id);

      if (ownerId) {
        const emailResult = await sendViaResend(a.email, welcomeEmail(p.display_name), `media-welcome-${p.id}`);
        return res.json({ photographer: p, claimed: true, email: emailResult });
      }
      const invite = await createInvite(p.id, a.email, adminId);
      if ("error" in invite) return res.status(500).json({ error: invite.error });
      const emailResult = await sendViaResend(a.email, inviteEmail(p.display_name, invite.url), `media-invite-${p.id}-${Date.now()}`);
      res.json({ photographer: p, claimed: false, url: invite.url, email: emailResult });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // "Are you a photographer? Get in touch."
  app.post("/api/media/apply", async (req: Request, res: Response) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";
      if (tooManyApplications(ip)) return res.status(429).json({ error: "Too many requests. Please try again later." });
      const name = str(req.body?.name, 120);
      const email = str(req.body?.email, 200);
      const handle = str(req.body?.handle, 80).replace(/^@+/, "");
      const teams = str(req.body?.teams, 400);
      const message = str(req.body?.message, 2000);
      const crafts = Array.isArray(req.body?.crafts) ? CRAFTS.filter((c) => req.body.crafts.includes(c)) : [];
      if (!name || !email) return res.status(400).json({ error: "Your name and email are needed" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "That email address doesn't look right" });
      // Signed in: remember the account, so approving can hand the profile straight to it.
      const userId = await deps.authenticate(req);
      const { error } = await supabaseAdmin
        .from("photographer_applications")
        .insert({ name, email, handle: handle || null, teams: teams || null, message: message || null, crafts, user_id: userId });
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
