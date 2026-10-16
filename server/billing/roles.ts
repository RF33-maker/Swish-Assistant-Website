import { supabaseAdmin } from "../supabaseServiceClient";

/**
 * Switching the coach role on and off. The role lives in the user's auth
 * app_metadata (role "coach" + team_id), which is what the Coaches Hub and the
 * scouting reports already check. Admins keep their own role: paying must never
 * downgrade one.
 */

export interface CoachRoles {
  grant(userId: string, teamId: string): Promise<{ changed: boolean; reason?: string }>;
  /** Removes the coach role only if it is still for this team (an admin may have moved them). */
  revoke(userId: string, teamId?: string): Promise<{ changed: boolean }>;
}

export const supabaseCoachRoles: CoachRoles = {
  async grant(userId, teamId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) throw new Error(`user ${userId} not found`);
    const meta = data.user.app_metadata || {};
    if (meta.role === "admin") return { changed: false, reason: "admin keeps the admin role" };
    if (meta.role === "coach" && meta.team_id === teamId) return { changed: false };
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { ...meta, role: "coach", team_id: teamId },
    });
    if (updateError) throw new Error(updateError.message);
    return { changed: true };
  },
  async revoke(userId, teamId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) return { changed: false };
    const meta = { ...(data.user.app_metadata || {}) };
    if (meta.role !== "coach") return { changed: false };
    if (teamId && meta.team_id && meta.team_id !== teamId) return { changed: false };
    delete meta.role;
    delete meta.team_id;
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: meta });
    if (updateError) throw new Error(updateError.message);
    return { changed: true };
  },
};
