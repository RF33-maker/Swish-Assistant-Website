import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { sendViaResend } from "./claimEmail";

/**
 * The public contact form ("Claim this page", coaches, leagues, general).
 *
 * POST /api/contact-sales stores the request in contact_requests and emails the
 * admin, with the visitor as Reply-To so answering is just "reply". The player
 * claim requests then show up on the Player Claims page (Requests tab), where
 * they can be answered with a claim code or an assignment.
 *
 * If this route fails, the form falls back to opening the visitor's own email
 * app, so a request is never lost to an outage.
 */

type AdminGuard = (req: Request, res: Response) => Promise<string | null>;

const TOPICS = ["general", "player-page", "coach", "league"] as const;
type Topic = (typeof TOPICS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOTIFY_TO = process.env.ADMIN_NOTIFY_EMAIL || "automatedathleteswa@gmail.com";
const SITE_URL = (process.env.SITE_URL || "https://swishassistant.com").replace(/\/$/, "");

const SUBJECTS: Record<Topic, string> = {
  general: "Swish Assistant enquiry",
  "player-page": "Claim request",
  coach: "Coaches Hub request",
  league: "League enquiry",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Best-effort limit per visitor (per server instance): enough to stop a form
// being hammered without blocking a real person who makes a typo and resends.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    recent.set(key, hits);
    return true;
  }
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) {
    recent.forEach((v, k) => {
      if (v.every((t: number) => now - t >= WINDOW_MS)) recent.delete(k);
    });
  }
  return false;
}

function isSiteUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && (u.hostname === "swishassistant.com" || u.hostname.endsWith(".swishassistant.com"));
  } catch {
    return false;
  }
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function registerContactRequestRoutes(app: Express, deps: { requireAdmin: AdminGuard }) {
  app.post("/api/contact-sales", async (req: Request, res: Response) => {
    try {
      const b = req.body ?? {};
      // Hidden field real visitors never fill in; bots do. Pretend it worked.
      if (clean(b.website, 100)) return res.json({ ok: true });

      const topic: Topic = TOPICS.includes(b.topic) ? b.topic : "general";
      const name = clean(b.name, 120);
      const email = clean(b.email, 200).toLowerCase();
      const message = clean(b.message, 4000);
      const playerName = clean(b.player, 160) || null;
      const pageUrl = clean(b.pageUrl, 500) || null;
      if (!name || !EMAIL.test(email) || !message) {
        return res.status(400).json({ error: "Name, a valid email and a message are required" });
      }
      // Only links to this site are kept; it is shown to the admin as a link.
      const safePageUrl = pageUrl && isSiteUrl(pageUrl) ? pageUrl : null;

      const ip = String(req.headers["x-forwarded-for"] ?? req.ip ?? "").split(",")[0].trim();
      if (rateLimited(`${ip}|${email}`)) return res.status(429).json({ error: "Too many requests. Please try again later." });

      const { error } = await supabaseAdmin
        .from("contact_requests")
        .insert({ topic, name, email, message, player_name: playerName, page_url: safePageUrl });
      if (error) {
        console.error("[contact] couldn't store request:", error.message);
        return res.status(500).json({ error: "Couldn't send your message" });
      }

      // The admin notification is a courtesy: the request is already saved and
      // visible on the Player Claims page, so a failed email isn't the visitor's
      // problem. It is awaited because a serverless function can be frozen the
      // moment the response goes out.
      const lines = [
        `From: ${name} <${email}>`,
        playerName ? `Player: ${playerName}` : null,
        safePageUrl ? `Page: ${safePageUrl}` : null,
        "",
        message,
        ...(topic === "player-page" ? ["", `Answer it from Player Claims: ${SITE_URL}/admin/player-claims`] : []),
      ].filter((l): l is string => l !== null);
      const html =
        `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#1f2937;max-width:560px">` +
        `<p style="margin:0 0 4px"><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt;</p>` +
        (playerName ? `<p style="margin:0 0 4px">Player: ${escapeHtml(playerName)}</p>` : "") +
        (safePageUrl ? `<p style="margin:0 0 4px">Page: <a href="${escapeHtml(safePageUrl)}">${escapeHtml(safePageUrl)}</a></p>` : "") +
        `<p style="margin:14px 0;white-space:pre-wrap;line-height:1.5">${escapeHtml(message)}</p>` +
        (topic === "player-page"
          ? `<p style="margin:0"><a href="${SITE_URL}/admin/player-claims">Answer it from Player Claims</a></p>`
          : "") +
        `</div>`;
      const notified = await sendViaResend(NOTIFY_TO, { subject: `${SUBJECTS[topic]}: ${name}`, text: lines.join("\n"), html }, undefined, email);
      if (!notified.sent) console.error(`[contact] notification not sent: ${notified.reason}`);

      res.json({ ok: true });
    } catch (e) {
      console.error("[contact] failed:", e);
      res.status(500).json({ error: "Couldn't send your message" });
    }
  });

  // Requests for the admin page. ?topic=player-page by default.
  app.get("/api/admin/contact-requests", async (req: Request, res: Response) => {
    try {
      if (!(await deps.requireAdmin(req, res))) return;
      const topic = TOPICS.includes(req.query.topic as Topic) ? (req.query.topic as Topic) : "player-page";
      const { data, error } = await supabaseAdmin
        .from("contact_requests")
        .select("id, topic, name, email, message, player_name, page_url, status, handled_at, created_at")
        .eq("topic", topic)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return res.status(500).json({ error: "Couldn't load requests" });
      res.json(data ?? []);
    } catch (e) {
      console.error("[contact] list failed:", e);
      res.status(500).json({ error: "Couldn't load requests" });
    }
  });

  // Mark a request handled (or put it back to new). Body: { status: "new" | "handled" }.
  app.patch("/api/admin/contact-requests/:id", async (req: Request, res: Response) => {
    try {
      if (!(await deps.requireAdmin(req, res))) return;
      const id = String(req.params.id);
      const status = req.body?.status;
      if (!UUID.test(id)) return res.status(400).json({ error: "Invalid request id" });
      if (status !== "new" && status !== "handled") return res.status(400).json({ error: "Invalid status" });
      const { error } = await supabaseAdmin
        .from("contact_requests")
        .update({ status, handled_at: status === "handled" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) return res.status(500).json({ error: "Couldn't update the request" });
      res.json({ ok: true });
    } catch (e) {
      console.error("[contact] update failed:", e);
      res.status(500).json({ error: "Couldn't update the request" });
    }
  });
}
