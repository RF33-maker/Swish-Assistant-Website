import type { Request } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { teamClubKey } from "./teamIdentityService";
import { getLeagueSides } from "./teamSides";

/**
 * Which club a signed-in account belongs to, for the API routes that scope
 * data to a club (playbook, scouting plans).
 *
 * A club has a separate team_id in every competition, so an account's own
 * app_metadata.team_id is only one of its competition entries. The club is the
 * key teamClubKey() gives that entry's name, read in its own competition so a
 * women's "London Lions" is not the men's club. Approved rows in
 * public.club_members (migration 20261018) take precedence; accounts
 * provisioned before it, with no member rows, still resolve through team_id.
 */

export type MemberRow = { status: string; club: { id: string; club_key: string } | null };

/**
 * - member: an approved coach row; its club is the account's club.
 * - blocked: coach rows exist but none is approved (pending or revoked). The
 *   account's app_metadata still says coach until the server rewrites it, so
 *   this must not fall back to team_id.
 * - legacy: no member rows at all; a hand-provisioned coach scoped by team_id.
 */
export type CoachStanding =
  | { kind: "member"; clubId: string; clubKey: string }
  | { kind: "blocked" }
  | { kind: "legacy" };

export function coachStanding(rows: MemberRow[]): CoachStanding {
  const approved = rows.find((r) => r.status === "approved" && r.club);
  if (approved?.club) return { kind: "member", clubId: approved.club.id, clubKey: approved.club.club_key };
  return rows.length > 0 ? { kind: "blocked" } : { kind: "legacy" };
}

export type ClubContext = {
  userId: string;
  /** app_metadata.role: 'admin' | 'coach' | anything else as null. */
  role: "admin" | "coach" | null;
  /** The account's own app_metadata.team_id (one competition entry), when a coach. */
  teamId: string | null;
  /** The club's identity key, or null when the account has no club (or it can't be resolved). */
  clubKey: string | null;
  clubId: string | null;
  access: "member" | "legacy" | "blocked" | "none";
};

/** The club key for one competition entry, or null when the team can't be found. */
export async function clubKeyForTeam(teamId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("teams").select("name, league_id").eq("team_id", teamId).limit(1).maybeSingle();
  if (!data?.name) return null;
  // Read in its own competition: the women's "London Lions" is not the men's club.
  const sides = await getLeagueSides();
  return teamClubKey(sides.name(data.name, data.league_id));
}

/** True when `teamName`, as it appears in `leagueId`, is this account's club. */
export async function isInClub(ctx: ClubContext, teamName: string, leagueId: string): Promise<boolean> {
  if (!ctx.clubKey) return false;
  const sides = await getLeagueSides();
  return teamClubKey(sides.name(teamName, leagueId)) === ctx.clubKey;
}

async function coachRows(userId: string): Promise<MemberRow[]> {
  const { data, error } = await supabaseAdmin
    .from("club_members")
    .select("status, club:clubs(id, club_key)")
    .eq("user_id", userId)
    .eq("role", "coach");
  if (error) {
    // Before the migration is applied the table doesn't exist: behave as if there are no rows.
    console.error("[clubs] member lookup failed:", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({ status: r.status, club: Array.isArray(r.club) ? (r.club[0] ?? null) : (r.club ?? null) }));
}

/** The signed-in account behind a request, with its club; null when the request isn't authenticated. */
export async function resolveClub(req: Request): Promise<ClubContext | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (error || !data.user) return null;
  const user = data.user;
  const raw = user.app_metadata?.role;
  const role = raw === "admin" || raw === "coach" ? raw : null;
  const teamId = role === "coach" ? (user.app_metadata?.team_id ?? null) : null;
  const base = { userId: user.id, role, teamId, clubKey: null, clubId: null } as const;
  if (role !== "coach") return { ...base, access: "none" };

  const standing = coachStanding(await coachRows(user.id));
  if (standing.kind === "member") return { ...base, clubKey: standing.clubKey, clubId: standing.clubId, access: "member" };
  if (standing.kind === "blocked") return { ...base, access: "blocked" };
  return { ...base, clubKey: teamId ? await clubKeyForTeam(teamId) : null, access: "legacy" };
}
