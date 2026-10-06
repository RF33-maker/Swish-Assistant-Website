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
// Where a player's reply goes. Unset, the email doesn't invite a reply, since noreply@ goes nowhere.
const REPLY_TO = process.env.CLAIM_EMAIL_REPLY_TO || "";

export type EmailResult = { sent: true } | { sent: false; reason: string };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The approval email, as a table-based layout with inline styles: the only
 * kind of HTML that renders the same in Gmail, Outlook and Apple Mail (none of
 * them reliably support <style> blocks, flexbox or external CSS). Every value
 * interpolated into it is escaped. Images must be absolute URLs, so the logo
 * is the one served from the site itself.
 */
export function approvalEmailContent(playerName: string, profileUrl: string | null, editUrl: string) {
  const first = playerName.trim().split(/\s+/)[0] || "there";
  const subject = "Your Swish Assistant player profile is approved";
  const preheader = "Your claim has been approved. Your stats are now linked to your profile.";
  const h = escapeHtml;
  const steps = [
    "Your games and stats from your competitions are now linked to your profile.",
    "Add a photo, your height, position and other details on your edit page.",
    "If the name on your stats isn't how you're known, you can request a preferred name.",
  ];
  const help = REPLY_TO
    ? `If you didn't make this request, just reply to this email and we'll sort it out.`
    : `If you didn't make this request, let us know through swishassistant.com and we'll sort it out.`;

  const text = [
    `Hi ${first},`,
    `Good news: your claim for the ${playerName} profile on Swish Assistant has been approved. It's now yours.`,
    steps.map((t) => `- ${t}`).join("\n"),
    profileUrl ? `View your profile: ${profileUrl}` : null,
    `Edit your profile: ${editUrl}`,
    help,
    `Swish Assistant\n${SITE_URL}`,
  ]
    .filter((l): l is string => !!l)
    .join("\n\n");

  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
  const button = (href: string, label: string, primary: boolean) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 6px 10px 0"><tr>` +
    `<td align="center" bgcolor="${primary ? "#f97316" : "#ffffff"}" style="border-radius:8px;${primary ? "" : "border:1px solid #d4d4d8;"}">` +
    `<a href="${h(href)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${font};font-size:15px;font-weight:600;line-height:20px;color:${primary ? "#ffffff" : "#27272a"};text-decoration:none;border-radius:8px">${h(label)}</a>` +
    `</td></tr></table>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${h(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${h(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5" style="background-color:#f4f4f5">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td align="left" style="padding:0 4px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle"><img src="${h(SITE_URL)}/icon-192.png" width="36" height="36" alt="" style="display:block;border:0;width:36px;height:36px"></td>
        <td style="vertical-align:middle;padding-left:10px;font-family:${font};font-size:15px;font-weight:700;letter-spacing:1.5px;color:#18181b">SWISH ASSISTANT</td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:14px;border:1px solid #e4e4e7;overflow:hidden">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td height="6" bgcolor="#f97316" style="background-color:#f97316;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:34px 36px 30px;font-family:${font};color:#27272a">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#ea580c">Profile approved</p>
          <h1 style="margin:0 0 18px;font-size:26px;line-height:32px;font-weight:700;color:#18181b">Welcome aboard, ${h(first)}</h1>
          <p style="margin:0 0 22px;font-size:16px;line-height:25px;color:#3f3f46">Good news: your claim for the <strong style="color:#18181b">${h(playerName)}</strong> profile has been approved. It's now yours.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fff7ed" style="background-color:#fff7ed;border:1px solid #fed7aa;border-radius:10px;margin:0 0 26px">
            <tr><td style="padding:16px 20px 6px;font-size:13px;font-weight:700;color:#9a3412">What happens next</td></tr>
            ${steps
              .map(
                (t) =>
                  `<tr><td style="padding:0 20px 10px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top" style="padding:1px 10px 0 0;font-size:15px;line-height:22px;color:#f97316">&#10003;</td><td style="font-size:15px;line-height:22px;color:#3f3f46">${h(t)}</td></tr></table></td></tr>`,
              )
              .join("\n            ")}
            <tr><td height="6" style="font-size:0;line-height:6px">&nbsp;</td></tr>
          </table>
          <div style="margin:0 0 6px">
            ${profileUrl ? button(profileUrl, "View your profile", true) : ""}${button(editUrl, "Edit your profile", !profileUrl)}
          </div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:20px 12px 0;font-family:${font};font-size:12px;line-height:19px;color:#71717a">
      ${h(help)}<br>
      You're receiving this because you claimed a player profile on <a href="${h(SITE_URL)}" style="color:#71717a;text-decoration:underline">Swish Assistant</a>.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, text, html };
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
      body: JSON.stringify({ from: FROM, to: [to], ...(REPLY_TO ? { reply_to: REPLY_TO } : {}), ...content }),
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
