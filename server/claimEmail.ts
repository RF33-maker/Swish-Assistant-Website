import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabaseServiceClient";

/**
 * Player claims: approving through the server, and the email that goes with it.
 *
 * The page used to call the approve_claim RPC straight from the browser. It now
 * calls POST /api/admin/claims/:id/approve, which runs that same RPC with the
 * admin's own token (so is_app_admin() still decides who may approve) and then
 * emails the player. If the email fails the claim stays approved: the failure is
 * recorded on the claim and the admin can resend from the Approved tab.
 *
 * Email goes out through Resend's HTTP API. With RESEND_API_KEY unset nothing is
 * sent, and the claim shows as "Not emailed" so it can be resent once it is set.
 */

type AdminGuard = (req: Request, res: Response) => Promise<string | null>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE_URL = (process.env.SITE_URL || "https://swishassistant.com").replace(/\/$/, "");
const FROM = process.env.CLAIM_EMAIL_FROM || "Swish Assistant <noreply@swishassistant.com>";

export type EmailResult = { sent: true } | { sent: false; reason: string };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function approvalEmailContent(playerName: string, profileUrl: string | null, editUrl: string) {
  const first = playerName.trim().split(/\s+/)[0] || "there";
  const subject = "Your Swish Assistant player profile is approved";
  const lines = [
    `Hi ${first},`,
    `Good news: your claim for the ${playerName} profile on Swish Assistant has been approved. It is now yours, and your stats across your competitions are linked to it.`,
    profileUrl ? `View your profile: ${profileUrl}` : null,
    `Add a photo, your height, position and other details: ${editUrl}`,
    `If you didn't make this request, reply to this email and we'll sort it out.`,
    `Swish Assistant`,
  ].filter((l): l is string => !!l);

  const p = (t: string) => `<p style="margin:0 0 14px;line-height:1.5">${t}</p>`;
  const button = (href: string, label: string) =>
    `<p style="margin:0 0 14px"><a href="${escapeHtml(href)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${escapeHtml(label)}</a></p>`;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#1f2937;max-width:520px">` +
    p(`Hi ${escapeHtml(first)},`) +
    p(
      `Good news: your claim for the <strong>${escapeHtml(playerName)}</strong> profile on Swish Assistant has been approved. It is now yours, and your stats across your competitions are linked to it.`,
    ) +
    (profileUrl ? button(profileUrl, "View your profile") : "") +
    p(`Add a photo, your height, position and other details on <a href="${escapeHtml(editUrl)}">your edit page</a>.`) +
    p(`If you didn't make this request, reply to this email and we'll sort it out.`) +
    p(`Swish Assistant`) +
    `</div>`;
  return { subject, text: lines.join("\n\n"), html };
}

async function sendViaResend(
  to: string,
  content: { subject: string; text: string; html: string },
  idempotencyKey?: string,
): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "Email isn't set up yet (RESEND_API_KEY is missing)" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: FROM, to: [to], ...content }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { sent: true };
    const body: any = await res.json().catch(() => null);
    return { sent: false, reason: body?.message || `Email service returned ${res.status}` };
  } catch (e: any) {
    return { sent: false, reason: e?.name === "TimeoutError" ? "Email service timed out" : e?.message || "Couldn't reach the email service" };
  }
}

/**
 * Emails the owner of an approved claim and records the outcome on the claim.
 * Never throws: the caller has already approved the claim and needs a result to report.
 */
export async function sendClaimApprovalEmail(claimId: string, opts: { resend?: boolean } = {}): Promise<EmailResult> {
  const record = async (result: EmailResult) => {
    const { error } = await supabaseAdmin
      .from("player_claims")
      .update(
        result.sent
          ? { approval_email_sent_at: new Date().toISOString(), approval_email_error: null }
          : { approval_email_error: result.reason.slice(0, 300) },
      )
      .eq("id", claimId);
    if (error) console.error("[claim-email] couldn't record result:", error.message);
    return result;
  };

  try {
    const { data: claim } = await supabaseAdmin
      .from("player_claims")
      .select("id, status, user_id, player_id")
      .eq("id", claimId)
      .maybeSingle();
    if (!claim) return { sent: false, reason: "Claim not found" };
    if (claim.status !== "approved") return { sent: false, reason: "Only approved claims get this email" };

    const [{ data: user }, { data: player }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(claim.user_id),
      supabaseAdmin.from("players").select("full_name, profile_slug").eq("id", claim.player_id).maybeSingle(),
    ]);
    const to = user?.user?.email;
    if (!to) return record({ sent: false, reason: "This account has no email address" });

    const content = approvalEmailContent(
      player?.full_name || "player",
      player?.profile_slug ? `${SITE_URL}/p/${player.profile_slug}` : null,
      `${SITE_URL}/my-profile/edit`,
    );
    // The idempotency key makes a retried automatic send harmless; a manual
    // resend must go through, so it gets no key.
    const result = await sendViaResend(to, content, opts.resend ? undefined : `claim-approved/${claimId}`);
    if (!result.sent) console.error(`[claim-email] claim ${claimId}: ${result.reason}`);
    return record(result);
  } catch (e: any) {
    console.error("[claim-email] unexpected error:", e);
    return record({ sent: false, reason: e?.message || "Unexpected error sending email" });
  }
}

/** Postgres error codes the claim RPCs raise, mapped to HTTP statuses. */
function statusForRpcError(code: string | undefined): number {
  switch (code) {
    case "42501": return 403;
    case "P0002": return 404;
    case "22023":
    case "23505": return 409;
    default: return 400;
  }
}

export function registerClaimEmailRoutes(app: Express, deps: { requireAdmin: AdminGuard }) {
  // Approve a claim, then email the player. Body: { verifiedDob: "YYYY-MM-DD", playerIds?: string[] | null }.
  app.post("/api/admin/claims/:id/approve", async (req: Request, res: Response) => {
    try {
      if (!(await deps.requireAdmin(req, res))) return;
      const claimId = String(req.params.id);
      const { verifiedDob, playerIds } = req.body ?? {};
      if (!UUID.test(claimId)) return res.status(400).json({ error: "Invalid claim id" });
      if (typeof verifiedDob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(verifiedDob)) {
        return res.status(400).json({ error: "A verified date of birth is required" });
      }
      if (playerIds != null && !(Array.isArray(playerIds) && playerIds.every((id) => typeof id === "string" && UUID.test(id)))) {
        return res.status(400).json({ error: "Invalid player rows" });
      }

      // approve_claim decides "is this an admin" from auth.uid(), so it has to
      // run as the admin rather than with the service key.
      const asAdmin = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: req.headers.authorization! } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await asAdmin.rpc("approve_claim", {
        p_claim_id: claimId,
        p_verified_dob: verifiedDob,
        p_player_ids: playerIds ?? null,
      });
      if (error) return res.status(statusForRpcError(error.code)).json({ error: error.message || "Couldn't approve" });

      const email = await sendClaimApprovalEmail(claimId);
      res.json({ approved: true, emailSent: email.sent, emailError: email.sent ? null : email.reason });
    } catch (e) {
      console.error("[claims] approve failed:", e);
      res.status(500).json({ error: "Couldn't approve" });
    }
  });

  // Resend the approval email for an approved claim.
  app.post("/api/admin/claims/:id/resend-email", async (req: Request, res: Response) => {
    try {
      if (!(await deps.requireAdmin(req, res))) return;
      const claimId = String(req.params.id);
      if (!UUID.test(claimId)) return res.status(400).json({ error: "Invalid claim id" });
      const email = await sendClaimApprovalEmail(claimId, { resend: true });
      res.json({ emailSent: email.sent, emailError: email.sent ? null : email.reason });
    } catch (e) {
      console.error("[claims] resend failed:", e);
      res.status(500).json({ error: "Couldn't resend" });
    }
  });

  // When each approved claim was last emailed, for the Approved tab.
  app.get("/api/admin/claims/email-status", async (req: Request, res: Response) => {
    try {
      if (!(await deps.requireAdmin(req, res))) return;
      const { data, error } = await supabaseAdmin
        .from("player_claims")
        .select("id, approval_email_sent_at, approval_email_error")
        .eq("status", "approved");
      if (error) return res.status(500).json({ error: "Couldn't load email status" });
      const out: Record<string, { sentAt: string | null; error: string | null }> = {};
      for (const r of data ?? []) out[r.id] = { sentAt: r.approval_email_sent_at, error: r.approval_email_error };
      res.json(out);
    } catch (e) {
      console.error("[claims] email-status failed:", e);
      res.status(500).json({ error: "Couldn't load email status" });
    }
  });
}
