import { supabase } from "@/lib/supabase";

// Typed wrappers for the claimable-profile RPCs
// (supabase/migrations/20260930_claimable_profiles_0*.sql). Every ownership,
// admin and age-tier decision is made server-side; these only shape the data.

export type ClaimStatus = "pending" | "approved" | "rejected" | "revoked";

export interface MyClaim {
  claim_id: string;
  status: ClaimStatus;
  player_id: string;
  player_name: string;
  team_name: string | null;
  submitted_dob: string | null;
  rejection_reason: string | null;
  profile_slug: string | null;
  created_at: string;
  approved_at: string | null;
}

export interface PublicProfile {
  player_id: string;
  profile_slug: string;
  stats_slug: string | null;
  display_name: string;
  is_restricted: boolean;
  is_indexable: boolean;
  team_name: string | null;
  current_team: string | null;
  league_id: string | null;
  competition_name: string | null;
  shirt_number: number | null;
  position: string | null;
  height_cm: number | null;
  photo_path: string | null;
  photo_focus_y: number | null;
  bio: string | null;
  pinned_highlight_url: string | null;
  date_of_birth: string | null;
  age_years: number | null;
  instagram_handle: string | null;
}

export interface OwnerFields {
  player_id: string;
  bio: string | null;
  display_height_cm: number | null;
  position: string | null;
  pinned_highlight_url: string | null;
  photo_path: string | null;
  instagram_handle: string | null;
  updated_at?: string;
}

export interface AdminClaimRow {
  claim_id: string;
  status: ClaimStatus;
  method: "admin_code" | "admin_manual";
  player_id: string;
  player_name: string;
  team_name: string | null;
  competition_name: string | null;
  user_id: string;
  user_email: string | null;
  submitted_dob: string | null;
  verified_dob: string | null;
  existing_dob: string | null;
  existing_dob_verified: boolean;
  submitted_dob_tier: "adult" | "u18" | null;
  existing_dob_tier: "adult" | "u18" | null;
  dob_mismatch: boolean;
  tier_change: boolean;
  profile_slug: string | null;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  revoked_at: string | null;
}

export interface AdminPlayerRow {
  player_id: string;
  full_name: string;
  team_name: string | null;
  competition_name: string | null;
  slug: string | null;
  date_of_birth: string | null;
  dob_verified: boolean;
  tier: "adult" | "u18" | "unverified";
  claim_status: "unclaimed" | "pending" | "approved";
  active_claim_id: string | null;
  owner_email: string | null;
  live_code_expires_at: string | null;
}

export type RedeemResult =
  | { ok: true; claim_id: string; status: "pending" }
  | { ok: false; error: RedeemError };

export type RedeemError =
  | "not_signed_in"
  | "rate_limited"
  | "invalid_dob"
  | "already_owns_profile"
  | "already_pending"
  | "invalid_or_expired_code"
  | "player_already_claimed";

export const REDEEM_ERROR_MESSAGES: Record<RedeemError, string> = {
  not_signed_in: "Please sign in to claim a profile.",
  rate_limited: "Too many incorrect codes. Please wait an hour and try again.",
  invalid_dob: "Please enter a valid date of birth.",
  already_owns_profile: "Your account already owns a player profile.",
  already_pending: "You already have a claim waiting for verification.",
  invalid_or_expired_code: "That code isn't valid. Check it carefully — codes expire and can only be used once.",
  player_already_claimed: "This profile has already been claimed. Contact us if you think that's wrong.",
};

/** Postgres error text from an RPC, without the transport noise. */
export function rpcErrorMessage(error: { message?: string } | null | undefined, fallback = "Something went wrong"): string {
  return error?.message?.trim() || fallback;
}

export async function getMyClaim(): Promise<MyClaim | null> {
  const { data, error } = await supabase.rpc("get_my_claim").maybeSingle();
  if (error) throw new Error(rpcErrorMessage(error));
  return (data as MyClaim | null) ?? null;
}

export async function redeemClaimCode(code: string, dob: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc("redeem_claim_code", { p_code: code, p_submitted_dob: dob });
  if (error) throw new Error(rpcErrorMessage(error));
  return data as RedeemResult;
}

export async function getPublicProfile(slug: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc("get_public_profile", { p_slug: slug }).maybeSingle();
  if (error) throw new Error(rpcErrorMessage(error));
  return (data as PublicProfile | null) ?? null;
}

/** Age in whole years from a YYYY-MM-DD date, or null. */
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** "14 Mar 2008" from YYYY-MM-DD, without timezone drift. */
export function formatDob(dob: string | null | undefined): string {
  if (!dob) return "—";
  const d = new Date(`${dob}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? dob
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "6'2\" · 188 cm" */
export function formatHeight(cm: number | null | undefined): string | null {
  if (!cm) return null;
  const totalInches = Math.round(cm / 2.54);
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}" · ${cm} cm`;
}

/** Latest valid date of birth for the DOB inputs (matches the server's 5-year floor). */
export function maxDobInputValue(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().slice(0, 10);
}
