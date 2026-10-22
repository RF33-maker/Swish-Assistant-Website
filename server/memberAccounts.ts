import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabaseServiceClient";

/**
 * Member profile and marketing-consent writes (POST /api/account/update-profile
 * and /api/account/update-marketing-consent).
 *
 * The accounts are shared with Scorers Table (scorerstable.app), which signs
 * people up straight against Supabase instead of through /api/account/register,
 * so those members arrive with no member_profiles row and no consent row. Before
 * either write, the profile row is created if it is missing, and the terms
 * acceptance Scorers Table kept in the auth user's user_metadata
 * (terms_accepted_at, terms_version) is copied into member_consents.
 *
 * The copy only ever repeats what the member's own sign-up recorded: nothing is
 * written when the timestamp or version is missing or not usable, the row is
 * typed by the version they accepted (not the site's own terms_v1), and it is
 * written once.
 */

export interface MemberUser {
  id: string;
  user_metadata?: Record<string, unknown> | null;
}

export interface ConsentRow {
  user_id: string;
  consent_type: string;
  accepted: boolean;
  accepted_at: string;
}

export interface ProfilePatch {
  display_name?: string | null;
  marketing_consent?: boolean;
  marketing_consent_at?: string | null;
  updated_at: string;
}

/** The database calls the account routes make, so tests can swap in memory. Every method throws on a database error. */
export interface MemberAccountStore {
  /** Inserts an empty profile for this member unless one exists. True when this call created it. */
  createProfileIfMissing(userId: string, now: string): Promise<boolean>;
  /** Updates the member's profile. False when there is no row to update. */
  updateProfile(userId: string, patch: ProfilePatch): Promise<boolean>;
  /** The given consent types this member already has a row for (accepted or not). */
  consentTypesOnFile(userId: string, types: string[]): Promise<string[]>;
  addConsents(rows: ConsentRow[]): Promise<void>;
}

export function supabaseStoreFor(db: SupabaseClient): MemberAccountStore {
  return {
    async createProfileIfMissing(userId, now) {
      // ON CONFLICT DO NOTHING: only a row this call inserted comes back.
      const { data, error } = await db
        .from("member_profiles")
        .upsert(
          { id: userId, marketing_consent: false, created_at: now, updated_at: now },
          { onConflict: "id", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },
    async updateProfile(userId, patch) {
      const { data, error } = await db.from("member_profiles").update(patch).eq("id", userId).select("id");
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },
    async consentTypesOnFile(userId, types) {
      const { data, error } = await db
        .from("member_consents")
        .select("consent_type")
        .eq("user_id", userId)
        .in("consent_type", types);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: { consent_type: string }) => r.consent_type);
    },
    async addConsents(rows) {
      const { error } = await db.from("member_consents").insert(rows);
      if (error) throw new Error(error.message);
    },
  };
}

export const supabaseMemberAccountStore = supabaseStoreFor(supabaseAdmin);

// The version ends up inside consent_type, so only a plain token is accepted.
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// A sign-up stamps the member's own device clock; allow for it running fast, but not for a date that hasn't happened.
const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * The terms acceptance recorded in a user's sign-up metadata, as the consent row
 * to keep, or null when there is none (or it cannot be trusted as written).
 */
export function termsConsentFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  now: Date,
): { consent_type: string; accepted_at: string } | null {
  const rawAt = metadata?.terms_accepted_at;
  const rawVersion = metadata?.terms_version;
  if (typeof rawAt !== "string" || typeof rawVersion !== "string") return null;

  const version = rawVersion.trim();
  if (!VERSION.test(version)) return null;

  const at = new Date(rawAt);
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + CLOCK_SKEW_MS) return null;

  return { consent_type: `terms_${version}`, accepted_at: at.toISOString() };
}

/**
 * Makes sure the member has a profile row and, if their sign-up metadata records
 * a terms acceptance, the matching consent row. Throws if the profile cannot be
 * created; a failure copying the consent is logged and retried on their next
 * save, so it never blocks the save itself.
 */
export async function ensureMemberProfile(
  store: MemberAccountStore,
  user: MemberUser,
  now: string,
): Promise<{ created: boolean; consent: ConsentRow | null }> {
  const created = await store.createProfileIfMissing(user.id, now);
  if (created) {
    console.log(`[member-accounts] Created profile for ${user.id} (signed_up_via=${String(user.user_metadata?.signed_up_via ?? "unknown")})`);
  }

  let consent: ConsentRow | null = null;
  const accepted = termsConsentFromMetadata(user.user_metadata, new Date(now));
  if (accepted) {
    try {
      const onFile = await store.consentTypesOnFile(user.id, [accepted.consent_type]);
      if (!onFile.includes(accepted.consent_type)) {
        const row: ConsentRow = { user_id: user.id, consent_type: accepted.consent_type, accepted: true, accepted_at: accepted.accepted_at };
        await store.addConsents([row]);
        consent = row;
        console.log(`[member-accounts] Recorded ${row.consent_type} for ${user.id} from sign-up metadata`);
      }
    } catch (err: any) {
      console.error(`[member-accounts] consent copy failed for ${user.id}:`, err?.message);
    }
  }
  return { created, consent };
}

export interface MemberAccountDeps {
  store: MemberAccountStore;
  /** The signed-in caller (from the bearer token), or null. */
  authenticate: (req: Request) => Promise<MemberUser | null>;
  now: () => Date;
}

async function supabaseAuthenticate(req: Request): Promise<MemberUser | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (error || !data.user) return null;
  return { id: data.user.id, user_metadata: data.user.user_metadata };
}

export function registerMemberAccountRoutes(app: Express, overrides: Partial<MemberAccountDeps> = {}): void {
  const deps: MemberAccountDeps = {
    store: supabaseMemberAccountStore,
    authenticate: supabaseAuthenticate,
    now: () => new Date(),
    ...overrides,
  };

  // POST /api/account/update-profile
  // Authenticated endpoint to update the member's display name only.
  // Marketing consent is handled by /api/account/update-marketing-consent.
  // No direct client UPDATE path exists on member_profiles (RLS has no UPDATE
  // policy), so server endpoints are the only write path.
  app.post("/api/account/update-profile", async (req: Request, res: Response) => {
    const user = await deps.authenticate(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const { displayName } = req.body ?? {};
    if (typeof displayName !== "string" && displayName !== null && displayName !== undefined) {
      return res.status(400).json({ error: "displayName must be a string or null" });
    }

    const now = deps.now().toISOString();
    try {
      await ensureMemberProfile(deps.store, user, now);
      const saved = await deps.store.updateProfile(user.id, {
        display_name: displayName?.trim() || null,
        updated_at: now,
      });
      if (!saved) throw new Error("no profile row to update");
    } catch (err: any) {
      console.error("[update-profile] error:", err?.message);
      return res.status(500).json({ error: err?.message ?? "Failed to save profile" });
    }

    return res.json({ success: true });
  });

  // POST /api/account/update-marketing-consent
  // Authenticated endpoint for members to update their marketing preference.
  // Updates member_profiles and appends a consent audit row — the only two
  // places marketing_consent is intentionally written.
  app.post("/api/account/update-marketing-consent", async (req: Request, res: Response) => {
    const user = await deps.authenticate(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const { accepted } = req.body ?? {};
    if (typeof accepted !== "boolean") {
      return res.status(400).json({ error: "accepted (boolean) is required" });
    }

    const now = deps.now().toISOString();

    try {
      await ensureMemberProfile(deps.store, user, now);
      const saved = await deps.store.updateProfile(user.id, {
        marketing_consent: accepted,
        marketing_consent_at: accepted ? now : null,
        updated_at: now,
      });
      if (!saved) throw new Error("no profile row to update");
    } catch (err: any) {
      console.error("[update-marketing-consent] profile error:", err?.message);
      return res.status(500).json({ error: "Failed to update preference" });
    }

    try {
      await deps.store.addConsents([{ user_id: user.id, consent_type: "marketing", accepted, accepted_at: now }]);
    } catch (err: any) {
      // Still return success — the preference is saved; log the audit failure.
      console.error("[update-marketing-consent] consent audit error:", err?.message);
    }

    console.log(`[update-marketing-consent] User ${user.id} set marketing=${accepted}`);
    return res.json({ success: true });
  });
}
