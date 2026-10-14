/**
 * Which roles the app shows an account, including the admin's "view as team"
 * preview. Pure, so the rules can be tested.
 *
 * The preview adds the coach view on top of the account: an admin stays an
 * admin (every admin tool keeps working) and is also a coach for the chosen
 * team. Anyone who is not a signed-in admin never gets a preview on the live
 * site (`previewAllowed` is false for them), and nothing here changes what the
 * server allows: it reads the real login token.
 */
export interface RoleInput {
  realUser: any | null;
  /** The team to preview as, already checked against `previewAllowed`. */
  viewAsTeam: string | null;
}

export interface Roles {
  user: any | null;
  isAdmin: boolean;
  isCoach: boolean;
  isRealAdmin: boolean;
  teamId: string | null;
}

export function isRealAdmin(realUser: any | null): boolean {
  return realUser?.app_metadata?.role === "admin";
}

/** The preview is for the dev server, or a signed-in admin on the live site. */
export function previewAllowed(realUser: any | null, isDev: boolean): boolean {
  return isDev || isRealAdmin(realUser);
}

export function resolveRoles({ realUser, viewAsTeam }: RoleInput): Roles {
  const realAdmin = isRealAdmin(realUser);
  const user = viewAsTeam
    ? {
        ...(realUser ?? { id: "00000000-0000-0000-0000-000000000000", email: "coach-preview@localhost" }),
        email_confirmed_at: realUser?.email_confirmed_at ?? new Date(0).toISOString(),
        app_metadata: { ...(realUser?.app_metadata ?? {}), role: realAdmin ? "admin" : "coach", team_id: viewAsTeam },
      }
    : realUser;
  const isAdmin = user?.app_metadata?.role === "admin";
  const isCoach = !!viewAsTeam || user?.app_metadata?.role === "coach";
  return { user, isAdmin, isCoach, isRealAdmin: realAdmin, teamId: isCoach ? (user?.app_metadata?.team_id ?? null) : null };
}
