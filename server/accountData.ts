/**
 * Everything the site holds about one member's account, in one place: what a
 * data export gathers, and what deleting the account removes, unlinks or keeps.
 *
 * The promises this has to keep are in client/src/components/legal/policyFacts.tsx
 * (Privacy Policy and /data-management):
 *   - the account and what the member made is deleted 30 days after they ask;
 *   - published game statistics and the competitions they belong to are kept;
 *   - payment records are kept for six years (tax), no longer linked to a person;
 *   - a verified date of birth stays on the player row (removed only on request);
 *   - the record of terms accepted is kept, unlinked.
 *
 * ACCOUNT_LINKS lists every column that points at a user (foreign keys to
 * auth.users, plus the ones with no foreign key and the ones matched by email),
 * and how deletion and export handle each. scripts/accountData.test.ts fails if
 * a step or export section is missing for one of them. When you add a table that
 * stores a user id or email, add it there. scripts/account-data-audit.sql lists
 * the live columns to compare against.
 */

export type Who = { userId: string; email: string | null };

/** The slice of the Supabase client this module uses, so tests can pass a fake. */
export type Db = {
  from(table: string): any;
  schema(name: string): { from(table: string): any };
};

export interface AccountDataDeps {
  db: Db;
  /** Every file path under a folder (recursively), and removal. */
  storage: {
    listAll(bucket: string, folder: string): Promise<string[]>;
    remove(bucket: string, paths: string[]): Promise<void>;
  };
  /** Payment provider: cancel a subscription now. Null when no key is set. */
  payments: null | {
    liveKey: boolean;
    cancelSubscription(id: string): Promise<void>;
  };
  now?: () => Date;
}

// ── where the member's data is ─────────────────────────────────────────────

type Match = "user" | "email";

interface Located {
  table: string;
  schema?: string;
  column: string;
  match: Match;
  /** Also match rows by email in this column (for forms filled in before signing in). */
  emailColumn?: string;
}

export interface ExportSource extends Located {
  key: string;
  /** Leaves out other people's ids (admins who approved, reviewed, …). */
  select?: string;
}

/**
 * The export. `account` (from auth), `profile`, `owned_player_details` and
 * `creator_photos` are added by compileAccountExport itself.
 */
export const EXPORT_SOURCES: ExportSource[] = [
  { key: "public_profile", table: "profiles", column: "id", match: "user" },
  { key: "consent_records", table: "member_consents", column: "user_id", match: "user", select: "consent_type, accepted, accepted_at" },
  { key: "export_requests", table: "data_export_requests", column: "user_id", match: "user", select: "id, status, requested_at, ready_at" },
  { key: "deletion_requests", table: "deletion_requests", column: "user_id", match: "user", select: "id, status, reason, requested_at, scheduled_for" },

  { key: "follows", table: "user_follows", column: "user_id", match: "user", select: "kind, key, label, subtitle, league_id, created_at" },
  { key: "notification_settings", table: "notification_settings", column: "user_id", match: "user" },
  { key: "inbox", table: "inbox_items", column: "user_id", match: "user", select: "kind, title, summary, body, created_at, read_at" },

  { key: "comments", table: "feed_comments", column: "user_id", match: "user", select: "id, post_key, author_name, body, status, moderation, report_count, created_at, reviewed_at" },
  { key: "comment_reports_made", table: "feed_comment_reports", column: "user_id", match: "user", select: "comment_id, reason, created_at" },
  { key: "comment_restrictions", table: "feed_comment_mutes", column: "user_id", match: "user", select: "until, reason, created_at" },
  { key: "likes", table: "feed_likes", column: "user_id", match: "user", select: "post_key, created_at" },
  { key: "picks", table: "feed_picks", column: "user_id", match: "user", select: "post_key, pick, created_at, updated_at" },

  {
    key: "player_claims", table: "player_claims", column: "user_id", match: "user",
    select: "id, player_id, status, method, claim_scope, submitted_dob, verified_dob, dob_status, covered_player_ids, approved_at, rejected_at, rejection_reason, revoked_at, created_at, updated_at",
  },
  { key: "claim_code_attempts", table: "claim_redeem_attempts", column: "user_id", match: "user", select: "attempted_at, success" },
  { key: "player_name_requests", table: "player_name_requests", column: "requested_by", match: "user", select: "player_id, requested_name, status, decided_at, rejection_reason, created_at" },
  { key: "club_memberships", table: "club_members", column: "user_id", match: "user", select: "club_id, role, status, player_id, verified, source, requested_at, approved_at, revoked_at, created_at" },

  { key: "competitions_managed", table: "competition_managers", column: "user_id", match: "user", select: "league_id, created_at" },
  { key: "competitions_created", table: "competitions", column: "created_by", match: "user", select: "league_id, slug, name, created_at" },
  { key: "competitions_owned", table: "competitions", column: "user_id", match: "user", select: "league_id, slug, name, created_at" },

  { key: "plans", table: "user_entitlements", column: "user_id", match: "user", select: "entitlement, source, plan, founding, expires_at, cancel_at_period_end, external_ref, stripe_customer_id, created_at, updated_at" },
  {
    key: "coach_plan", table: "coach_access", column: "user_id", match: "user",
    select: "team_id, team_name, email, plan, status, access_until, cancel_at_period_end, verified, stripe_customer_id, stripe_subscription_id, stripe_payment_intent_id, created_at, updated_at",
  },

  { key: "coach_notes", table: "scout_coach_notes", column: "created_by", match: "user", select: "for_team_name, opponent_name, league_id, scope, player_name, kind, aspect_label, note, created_at, updated_at" },
  { key: "coach_activity", table: "coach_interactions", column: "user_id", match: "user", select: "kind, for_team_name, opponent_name, league_id, report_id, content, created_at" },
  { key: "playbooks_edited", table: "coach_playbooks", column: "updated_by", match: "user", select: "id, title, season, updated_at" },
  { key: "scouting_reports", table: "scouting_reports", column: "created_by", match: "user", select: "id, league_id, name, template_id, data, created_at" },
  { key: "scout_reports_requested", table: "scout_agent_reports", column: "requested_by", match: "user", select: "id, league_id, opponent_name, for_team_name, tier, window, status, edits, created_at, generated_at" },
  { key: "coach_reports_requested", table: "coach_reports", column: "requested_by", match: "user", select: "id, kind, league_id, team_name, game_key, week_start, status, title, created_at" },
  { key: "prep_tip_feedback", table: "prep_tip_feedback", column: "user_id", match: "user", select: "game_key, league_id, opponent, subject, tip_text, vote, created_at, updated_at" },
  { key: "ask_swish_usage", table: "ask_swish_questions", column: "user_id", match: "user", select: "asked_at, tier, surface, model, status, rounds, input_tokens, output_tokens" },

  {
    key: "creator_profile", table: "photographers", column: "user_id", match: "user",
    select: "id, slug, display_name, handle, bio, location, avatar_path, socials, contact_preference, credit_line, default_permission, teams, crafts, open_to, attendance_public, status, created_at, updated_at",
  },
  { key: "creator_applications", table: "photographer_applications", column: "user_id", emailColumn: "email", match: "user", select: "id, name, email, handle, teams, crafts, message, status, created_at" },
  { key: "creator_posts", table: "creator_posts", column: "user_id", match: "user", select: "id, topic, body, images, game_key, status, created_at" },
  { key: "creator_replies", table: "creator_post_replies", column: "user_id", match: "user", select: "post_id, body, status, created_at" },
  { key: "creator_likes", table: "creator_post_likes", column: "user_id", match: "user", select: "post_id, created_at" },
  { key: "creator_reports_made", table: "creator_reports", column: "user_id", match: "user", select: "target_type, target_id, reason, created_at" },

  { key: "scorers_table_organiser", schema: "capture", table: "organiser_access", column: "user_id", match: "user", select: "status, organisation, note, plan, requested_at, decided_at" },
  { key: "scorers_table_leagues", schema: "capture", table: "league_members", column: "user_id", match: "user", select: "league_uid, role, created_at" },
  { key: "scorers_table_teams", schema: "capture", table: "team_managers", column: "user_id", match: "user", select: "league_team_uid, created_at" },
  { key: "scorers_table_games", schema: "capture", table: "game_scorers", column: "user_id", match: "user", select: "game_uid, via_code, created_at" },
  { key: "scorers_table_corrections", schema: "capture", table: "correction_requests", column: "requested_by", match: "user", select: "game_uid, description, proposed, status, requested_at, reviewed_at, review_note" },

  { key: "messages", table: "contact_requests", column: "email", match: "email", select: "id, topic, name, email, message, player_name, page_url, status, created_at" },
  { key: "newsletter", table: "newsletter_signups", column: "email", match: "email", select: "id, email, name, source, created_at" },
];

// ── what deletion does ─────────────────────────────────────────────────────

export interface DeletionStep extends Located {
  key: string;
  /** Extra equality filter, e.g. only preview-tier reports. */
  where?: Record<string, string>;
  /** Extra inequality filter, e.g. everything but preview-tier reports. */
  whereNot?: Record<string, string>;
  action: "delete" | "unlink" | "anonymise-payment";
  why: string;
}

/**
 * Table steps, run in this order before the auth user is deleted. Everything
 * not listed here goes with the auth user through its foreign key (ON DELETE
 * CASCADE removes the row, SET NULL drops the link); see ACCOUNT_LINKS.
 */
export const DELETION_STEPS: DeletionStep[] = [
  // League data is kept. These links used to CASCADE (or block the delete);
  // migration 20261116 makes them SET NULL, and unlinking here first keeps
  // deletion safe whether or not that migration has run.
  { key: "competitions.created_by", table: "competitions", column: "created_by", match: "user", action: "unlink", why: "Competitions stay; only who created them is removed." },
  { key: "competitions.user_id", table: "competitions", column: "user_id", match: "user", action: "unlink", why: "Competitions stay; only the owner link is removed." },
  { key: "player_stats.user_id", table: "player_stats", column: "user_id", match: "user", action: "unlink", why: "Published statistics stay; only who uploaded them is removed." },

  // Coach tools.
  { key: "scout_coach_notes", table: "scout_coach_notes", column: "created_by", match: "user", action: "delete", why: "The coach's own notes (no foreign key, so nothing removed them)." },
  { key: "scouting_reports", table: "scouting_reports", column: "created_by", match: "user", action: "delete", why: "The coach's saved reports (the foreign key blocked the delete)." },
  { key: "scout_agent_reports.preview", table: "scout_agent_reports", column: "requested_by", match: "user", where: { tier: "preview" }, action: "delete", why: "Preview reports are private to whoever asked for them." },
  { key: "scout_agent_reports.club", table: "scout_agent_reports", column: "requested_by", match: "user", whereNot: { tier: "preview" }, action: "unlink", why: "Full reports belong to the club (every coach there sees them); only who asked is removed." },
  { key: "coach_reports", table: "coach_reports", column: "requested_by", match: "user", action: "unlink", why: "One report per team and game, shared by the club; only who asked is removed." },
  { key: "coach_interactions", table: "coach_interactions", column: "user_id", match: "user", action: "delete", why: "What the coach did in the tools (SET NULL kept it)." },
  { key: "coach_playbooks.updated_by", table: "coach_playbooks", column: "updated_by", match: "user", action: "unlink", why: "Club playbook; only who last edited it is removed." },
  { key: "ask_swish_questions", table: "ask_swish_questions", column: "user_id", match: "user", action: "delete", why: "Ask Swish usage log (no foreign key)." },

  // Creators (the profile itself is closed by the creator-profile step).
  { key: "photographer_applications", table: "photographer_applications", column: "user_id", emailColumn: "email", match: "user", action: "delete", why: "Creator applications (SET NULL kept name and email)." },

  // Matched by email.
  { key: "contact_requests", table: "contact_requests", column: "email", match: "email", action: "delete", why: "Messages sent from the contact forms." },
  { key: "newsletter_signups", table: "newsletter_signups", column: "email", match: "email", action: "delete", why: "Newsletter sign-up for the same email." },

  // Payments: kept six years, no longer linked to a person.
  { key: "coach_access", table: "coach_access", column: "user_id", match: "user", action: "anonymise-payment", why: "Payment record kept for tax; user id, email and checkout session removed." },

  // Account records.
  { key: "member_consents", table: "member_consents", column: "user_id", match: "user", action: "unlink", why: "Record of terms accepted is kept, unlinked." },
  { key: "member_profiles", table: "member_profiles", column: "id", match: "user", action: "delete", why: "Profile." },
  { key: "data_export_requests", table: "data_export_requests", column: "user_id", match: "user", action: "delete", why: "Export requests." },
];

/** Steps that aren't one table and one column. They run before DELETION_STEPS. */
export const CUSTOM_STEPS = ["cancel-subscriptions", "owned-player-details", "creator-profile"] as const;

/**
 * Every column that points at a user, from the foreign-key metadata on
 * 2026-11-16 plus the columns with no foreign key. How deletion handles it:
 *   cascade        the row is deleted with the auth user (ON DELETE CASCADE)
 *   set-null       the row isn't the member's (it's a league's, a club's or
 *                  someone else's); only the link to them goes (ON DELETE SET NULL)
 *   step:<key>     a DELETION_STEPS entry, or custom:<name> for CUSTOM_STEPS
 *   kept:<why>     deliberately left
 * The third field is the export section that includes it, or "-" when the
 * column records an admin's action rather than the member's own data.
 */
export const ACCOUNT_LINKS: ReadonlyArray<readonly [string, string, string]> = [
  // account
  ["public.member_profiles.id", "step:member_profiles", "profile"],
  ["public.profiles.id", "cascade", "public_profile"],
  ["public.member_consents.user_id", "step:member_consents", "consent_records"],
  ["public.data_export_requests.user_id", "step:data_export_requests", "export_requests"],
  ["public.deletion_requests.user_id", "cascade", "deletion_requests"],
  ["public.app_admins.user_id", "cascade", "-"],
  // following, alerts, inbox, feed
  ["public.user_follows.user_id", "cascade", "follows"],
  ["public.notification_settings.user_id", "cascade", "notification_settings"],
  ["public.inbox_items.user_id", "cascade", "inbox"],
  ["public.feed_comments.user_id", "cascade", "comments"],
  ["public.feed_comments.author_name", "cascade", "comments"],
  ["public.feed_comments.reviewed_by", "set-null", "-"],
  ["public.feed_comment_reports.user_id", "cascade", "comment_reports_made"],
  ["public.feed_comment_mutes.user_id", "cascade", "comment_restrictions"],
  ["public.feed_comment_mutes.created_by", "set-null", "-"],
  ["public.feed_banned_terms.added_by", "set-null", "-"],
  ["public.feed_likes.user_id", "cascade", "likes"],
  ["public.feed_picks.user_id", "cascade", "picks"],
  // player claims
  ["public.player_claims.user_id", "cascade", "player_claims"],
  ["public.player_claims.submitted_dob", "cascade", "player_claims"],
  ["public.player_claims.verified_dob", "cascade", "player_claims"],
  ["public.player_claims.approved_by", "set-null", "-"],
  ["public.player_claims.rejected_by", "set-null", "-"],
  ["public.player_claims.revoked_by", "set-null", "-"],
  ["public.player_owner_fields.updated_by", "custom:owned-player-details", "owned_player_details"],
  ["public.claim_redeem_attempts.user_id", "cascade", "claim_code_attempts"],
  ["public.claim_codes.issued_by", "set-null", "-"],
  ["public.claim_codes.used_by", "set-null", "-"],
  ["public.player_name_requests.requested_by", "cascade", "player_name_requests"],
  ["public.player_name_requests.decided_by", "set-null", "-"],
  ["public.players.date_of_birth", "kept:A verified date of birth stays on the player row so the right privacy level keeps applying; removed only on request.", "player_claims"],
  ["public.players.dob_verified_by", "set-null", "-"],
  ["public.players.adult_confirmed_by", "set-null", "-"],
  ["public.club_members.user_id", "cascade", "club_memberships"],
  ["public.club_members.approved_by", "set-null", "-"],
  ["public.club_members.revoked_by", "set-null", "-"],
  // leagues and statistics
  ["public.competitions.created_by", "step:competitions.created_by", "competitions_created"],
  ["public.competitions.user_id", "step:competitions.user_id", "competitions_owned"],
  ["public.player_stats.user_id", "step:player_stats.user_id", "-"],
  ["public.competition_managers.user_id", "cascade", "competitions_managed"],
  ["public.competition_managers.added_by", "set-null", "-"],
  ["public.competition_upload_names.added_by", "set-null", "-"],
  ["public.news_articles.created_by", "set-null", "-"],
  ["public.reel_jobs.created_by", "set-null", "-"],
  ["public.agent_findings.decided_by", "set-null", "-"],
  ["public.agent_changes.reverted_by", "set-null", "-"],
  // paid plans
  ["public.user_entitlements.user_id", "cascade", "plans"],
  ["public.user_entitlements.stripe_customer_id", "cascade", "plans"],
  ["public.coach_access.user_id", "step:coach_access", "coach_plan"],
  ["public.coach_access.email", "step:coach_access", "coach_plan"],
  // coach tools
  ["public.scout_coach_notes.created_by", "step:scout_coach_notes", "coach_notes"],
  ["public.scouting_reports.created_by", "step:scouting_reports", "scouting_reports"],
  ["public.scout_agent_reports.requested_by", "step:scout_agent_reports.club", "scout_reports_requested"],
  ["public.coach_reports.requested_by", "step:coach_reports", "coach_reports_requested"],
  ["public.coach_interactions.user_id", "step:coach_interactions", "coach_activity"],
  ["public.coach_playbooks.updated_by", "step:coach_playbooks.updated_by", "playbooks_edited"],
  ["public.prep_tip_feedback.user_id", "cascade", "prep_tip_feedback"],
  ["public.ask_swish_questions.user_id", "step:ask_swish_questions", "ask_swish_usage"],
  // creators
  ["public.photographers.user_id", "custom:creator-profile", "creator_profile"],
  ["public.photographers.created_by", "set-null", "-"],
  ["public.photographer_invites.created_by", "set-null", "-"],
  ["public.photographer_invites.used_by", "set-null", "-"],
  ["public.photographer_applications.user_id", "step:photographer_applications", "creator_applications"],
  ["public.photographer_applications.email", "step:photographer_applications", "creator_applications"],
  ["public.spotlights.created_by", "set-null", "-"],
  ["public.photo_usage_log.used_by", "set-null", "-"],
  ["public.creator_posts.user_id", "cascade", "creator_posts"],
  ["public.creator_post_replies.user_id", "cascade", "creator_replies"],
  ["public.creator_post_likes.user_id", "cascade", "creator_likes"],
  ["public.creator_reports.user_id", "cascade", "creator_reports_made"],
  // matched by email
  ["public.contact_requests.email", "step:contact_requests", "messages"],
  ["public.newsletter_signups.email", "step:newsletter_signups", "newsletter"],
  // Scorers Table
  ["capture.organiser_access.user_id", "cascade", "scorers_table_organiser"],
  ["capture.organiser_access.decided_by", "set-null", "-"],
  ["capture.league_members.user_id", "cascade", "scorers_table_leagues"],
  ["capture.league_members.added_by", "set-null", "-"],
  ["capture.team_managers.user_id", "cascade", "scorers_table_teams"],
  ["capture.team_managers.added_by", "set-null", "-"],
  ["capture.game_scorers.user_id", "cascade", "scorers_table_games"],
  ["capture.game_scorers.added_by", "set-null", "-"],
  ["capture.correction_requests.requested_by", "cascade", "scorers_table_corrections"],
  ["capture.correction_requests.reviewed_by", "set-null", "-"],
  ["capture.leagues.created_by", "set-null", "-"],
  ["capture.games.created_by", "set-null", "-"],
  ["capture.games.finalized_by", "set-null", "-"],
  ["capture.stat_events.created_by", "set-null", "-"],
  ["capture.stat_events.voided_by", "set-null", "-"],
  // not the live site
  ["test.player_stats.user_id", "kept:Test schema copy of player_stats; no accounts are made there.", "-"],
  ["archive.*", "kept:Restore backups of league data taken before fixes; they hold uploader ids, not account data.", "-"],
];

/** Export sections compileAccountExport adds on top of EXPORT_SOURCES. */
export const BUILT_IN_EXPORT_KEYS = ["account", "profile", "owned_player_details", "creator_photos", "creator_photo_usage"] as const;

// ── helpers ────────────────────────────────────────────────────────────────

const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

function narrow(q: any, step: { where?: Record<string, string>; whereNot?: Record<string, string> }) {
  for (const [col, val] of Object.entries(step.where || {})) q = q.eq(col, val);
  for (const [col, val] of Object.entries(step.whereNot || {})) q = q.neq(col, val);
  return q;
}

function tableOf(db: Db, loc: { schema?: string; table: string }) {
  return loc.schema && loc.schema !== "public" ? db.schema(loc.schema).from(loc.table) : db.from(loc.table);
}

function fail(what: string, error: any): never {
  throw new Error(`${what}: ${error?.message ?? error}`);
}

const sameEmail = (a: unknown, b: string) => typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Ids of rows whose email column is this email, compared case-insensitively. */
async function idsByEmail(db: Db, loc: { schema?: string; table: string }, column: string, email: string): Promise<string[]> {
  const pattern = email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await tableOf(db, loc).select(`id, ${column}`).ilike(column, pattern).limit(1000);
  if (error) {
    if (MISSING_TABLE.has(error.code)) return [];
    fail(`${loc.table} by email`, error);
  }
  return (data || []).filter((r: any) => sameEmail(r[column], email)).map((r: any) => String(r.id));
}

/** The row ids (or, for user matches, the filter) a located source covers. */
async function rowsFor(db: Db, loc: Located, who: Who, select: string): Promise<any[]> {
  const out: any[] = [];
  if (loc.match === "user") {
    const { data, error } = await tableOf(db, loc).select(select).eq(loc.column, who.userId).limit(10000);
    if (error) {
      if (MISSING_TABLE.has(error.code)) return [];
      fail(`${loc.table}.${loc.column}`, error);
    }
    out.push(...(data || []));
  }
  const emailColumn = loc.match === "email" ? loc.column : loc.emailColumn;
  if (emailColumn && who.email) {
    const ids = await idsByEmail(db, loc, emailColumn, who.email);
    if (ids.length) {
      const { data, error } = await tableOf(db, loc).select(select).in("id", ids);
      if (error) fail(`${loc.table} by email`, error);
      const seen = new Set(out.map((r: any) => r.id).filter(Boolean));
      out.push(...(data || []).filter((r: any) => !r.id || !seen.has(r.id)));
    }
  }
  return out;
}

// ── export ─────────────────────────────────────────────────────────────────

export interface AuthUserFacts {
  email: string | null;
  email_confirmed_at?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/** Everything held about one account, as one JSON object for the member. */
export async function compileAccountExport(deps: AccountDataDeps, who: Who, auth: AuthUserFacts | null): Promise<Record<string, unknown>> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();

  // maybeSingle: an account made on Scorers Table has no profile row until it
  // first saves one here, and that is a null profile, not a failed export.
  const profileRes = await db.from("member_profiles").select("*").eq("id", who.userId).maybeSingle();
  if (profileRes.error) fail("member_profiles", profileRes.error);

  const sections: Record<string, unknown> = {};
  for (const src of EXPORT_SOURCES) {
    const rows = await rowsFor(db, src, who, src.select ?? "*");
    // One-row-per-user tables read better as an object.
    sections[src.key] = src.key === "notification_settings" || src.key === "public_profile" ? rows[0] ?? null : rows;
  }

  // The details the member added to the player profiles they hold.
  const primaryIds = ((sections.player_claims as any[]) || []).filter((c) => c.status === "approved").map((c) => c.player_id);
  let ownedPlayerDetails: any[] = [];
  if (primaryIds.length) {
    const { data, error } = await db.from("player_owner_fields")
      .select("player_id, bio, display_height_cm, position, pinned_highlight_url, photo_path, instagram_handle, updated_at")
      .in("player_id", primaryIds);
    if (error) fail("player_owner_fields", error);
    ownedPlayerDetails = data || [];
  }

  // Photos on the member's creator profile, and where Swish has used them.
  const photographerIds = ((sections.creator_profile as any[]) || []).map((p) => p.id);
  let creatorPhotos: any[] = [];
  let photoUsage: any[] = [];
  if (photographerIds.length) {
    const { data, error } = await db.from("photos")
      .select("id, photographer_id, caption, event_name, taken_at, permission, is_public, is_showcase, width, height, consent_at, created_at")
      .in("photographer_id", photographerIds);
    if (error) fail("photos", error);
    creatorPhotos = data || [];
    const photoIds = creatorPhotos.map((p) => p.id);
    if (photoIds.length) {
      const usage = await db.from("photo_usage_log").select("photo_id, used_at, context").in("photo_id", photoIds);
      if (usage.error) fail("photo_usage_log", usage.error);
      photoUsage = usage.data || [];
    }
  }

  return {
    exported_at: now.toISOString(),
    account: {
      id: who.userId,
      email: auth?.email ?? who.email ?? null,
      email_confirmed_at: auth?.email_confirmed_at ?? null,
      created_at: auth?.created_at ?? null,
      last_sign_in_at: auth?.last_sign_in_at ?? null,
      details_given_at_sign_up: auth?.user_metadata ?? null,
    },
    profile: profileRes.data ?? null,
    ...sections,
    owned_player_details: ownedPlayerDetails,
    creator_photos: creatorPhotos,
    creator_photo_usage: photoUsage,
  };
}

// ── deletion ───────────────────────────────────────────────────────────────

export interface StepResult {
  step: string;
  action: string;
  rows: number;
  detail?: string;
}

/** Counts the rows a step matches without changing them. */
async function countFor(db: Db, step: DeletionStep, who: Who): Promise<number> {
  if (step.match === "email" || step.emailColumn) {
    const rows = await rowsFor(db, step, who, "id");
    return rows.length;
  }
  let q = tableOf(db, step).select(step.column, { count: "exact", head: true }).eq(step.column, who.userId);
  q = narrow(q, step);
  const { count, error } = await q;
  if (error) {
    if (MISSING_TABLE.has(error.code)) return 0;
    fail(step.key, error);
  }
  return count ?? 0;
}

async function runStep(db: Db, step: DeletionStep, who: Who, now: Date): Promise<number> {
  // Email-matched rows are found first, then changed by id.
  let ids: string[] | null = null;
  if (step.match === "email" || step.emailColumn) {
    ids = (await rowsFor(db, step, who, "id")).map((r: any) => String(r.id));
    if (!ids.length) return 0;
  }

  if (step.action === "anonymise-payment") {
    // Access ends with the account (its subscription was cancelled first), so
    // billing's expiry run and webhooks have nothing left to do with the row.
    const { error } = await tableOf(db, step)
      .update({ status: "canceled", access_until: now.toISOString(), cancel_at_period_end: false })
      .eq(step.column, who.userId)
      .in("status", ["active", "past_due"]);
    if (error && !MISSING_TABLE.has(error.code)) fail(step.key, error);
  }

  const base = tableOf(db, step);
  let q: any;
  if (step.action === "delete") q = base.delete({ count: "exact" });
  else if (step.action === "unlink") q = base.update({ [step.column]: null }, { count: "exact" });
  else {
    q = base.update({
      user_id: null,
      email: null,
      stripe_checkout_session_id: null,
      account_deleted_at: now.toISOString(),
    }, { count: "exact" });
  }
  q = ids ? q.in("id", ids) : q.eq(step.column, who.userId);
  q = narrow(q, step);
  const { count, error } = await q;
  if (error) {
    if (MISSING_TABLE.has(error.code)) return 0;
    fail(step.key, error);
  }
  return count ?? 0;
}

/**
 * Cancels the member's live subscriptions so nobody is charged after their
 * account is gone. Refuses (throws) when one can't be cancelled, so the
 * account isn't deleted with a subscription still running.
 */
async function cancelSubscriptions(deps: AccountDataDeps, who: Who, now: Date, dryRun: boolean): Promise<StepResult> {
  const { db } = deps;
  const subs = new Map<string, boolean>(); // subscription id → livemode

  const coach = await db.from("coach_access")
    .select("plan, status, livemode, stripe_subscription_id")
    .eq("user_id", who.userId);
  if (coach.error && !MISSING_TABLE.has(coach.error.code)) fail("coach_access", coach.error);
  for (const r of coach.data || []) {
    if (r.plan === "monthly" && r.stripe_subscription_id && (r.status === "active" || r.status === "past_due")) subs.set(r.stripe_subscription_id, !!r.livemode);
  }

  const plus = await db.from("user_entitlements")
    .select("source, external_ref, expires_at, livemode")
    .eq("user_id", who.userId)
    .eq("source", "stripe");
  if (plus.error && !MISSING_TABLE.has(plus.error.code)) fail("user_entitlements", plus.error);
  for (const r of plus.data || []) {
    if (r.external_ref && (!r.expires_at || new Date(r.expires_at).getTime() > now.getTime())) subs.set(r.external_ref, !!r.livemode);
  }

  const result: StepResult = { step: "cancel-subscriptions", action: dryRun ? "would cancel" : "cancelled", rows: subs.size };
  if (!subs.size) return result;

  const skipped: string[] = [];
  const done: string[] = [];
  for (const [id, livemode] of Array.from(subs)) {
    if (!deps.payments) throw new Error(`Subscription ${id} is still running and no payment key is set, so it can't be cancelled. Cancel it with the payment provider first.`);
    if (livemode && !deps.payments.liveKey) throw new Error(`Subscription ${id} is live but the server has a test key. Cancel it with the payment provider first.`);
    if (!livemode && deps.payments.liveKey) { skipped.push(id); continue; } // test-mode: never charges anyone
    if (!dryRun) { await deps.payments.cancelSubscription(id); done.push(id); }
  }
  // Mark Swish+ ended now, so a retry after a later failure doesn't find it again.
  // (The rows go with the auth user; coach_access is closed by its own step.)
  if (done.length) {
    const { error } = await db.from("user_entitlements")
      .update({ expires_at: now.toISOString(), cancel_at_period_end: false })
      .eq("user_id", who.userId)
      .eq("source", "stripe")
      .in("external_ref", done);
    if (error && !MISSING_TABLE.has(error.code)) fail("user_entitlements", error);
  }
  if (skipped.length) result.detail = `${skipped.length} test-mode subscription(s) left alone`;
  return result;
}

/** Details the member added to the player profiles they hold (bio, photo, …), and the photo files. */
async function removeOwnedPlayerDetails(deps: AccountDataDeps, who: Who, dryRun: boolean): Promise<StepResult> {
  const { db } = deps;
  const claims = await db.from("player_claims").select("player_id, status").eq("user_id", who.userId).eq("status", "approved");
  if (claims.error) fail("player_claims", claims.error);
  const playerIds: string[] = Array.from(new Set((claims.data || []).map((c: any) => String(c.player_id))));
  const result: StepResult = { step: "owned-player-details", action: dryRun ? "would delete" : "deleted", rows: 0 };
  if (!playerIds.length) return result;

  const fields = await db.from("player_owner_fields").select("player_id").in("player_id", playerIds);
  if (fields.error) fail("player_owner_fields", fields.error);
  result.rows = (fields.data || []).length;

  let files = 0;
  for (const id of playerIds) {
    const paths = await deps.storage.listAll("player-photos", `owners/${id}`);
    files += paths.length;
    if (!dryRun && paths.length) await deps.storage.remove("player-photos", paths);
  }
  if (!dryRun && result.rows) {
    const { error } = await db.from("player_owner_fields").delete().in("player_id", playerIds);
    if (error) fail("player_owner_fields", error);
  }
  result.detail = `${files} photo file(s)`;
  return result;
}

const CREATOR_BUCKETS = ["photo-originals", "photo-web", "creator-space"];

/**
 * Closes the member's creator profile: its files in every creator bucket, then
 * the profile row, which cascades to photos, spotlights, invites, teams,
 * attendance and posts. Graphics already published with their credit are
 * elsewhere and stay, as the policy says.
 */
async function closeCreatorProfile(deps: AccountDataDeps, who: Who, dryRun: boolean): Promise<StepResult> {
  const { db } = deps;
  const { data, error } = await db.from("photographers").select("id").eq("user_id", who.userId);
  if (error) fail("photographers", error);
  const ids: string[] = (data || []).map((p: any) => String(p.id));
  const result: StepResult = { step: "creator-profile", action: dryRun ? "would delete" : "deleted", rows: ids.length };
  if (!ids.length) return result;

  let files = 0;
  for (const id of ids) {
    for (const bucket of CREATOR_BUCKETS) {
      const paths = await deps.storage.listAll(bucket, id);
      files += paths.length;
      if (!dryRun && paths.length) await deps.storage.remove(bucket, paths);
    }
  }
  if (!dryRun) {
    const del = await db.from("photographers").delete().in("id", ids);
    if (del.error) fail("photographers", del.error);
  }
  result.detail = `${files} file(s)`;
  return result;
}

/**
 * Removes, unlinks or anonymises everything in this module's steps. Run it
 * before deleting the auth user, which takes the rest by cascade. Every step
 * can be run again safely, so a failure part-way is fixed by retrying.
 * With dryRun, nothing changes and each step reports what it would touch.
 */
export async function runAccountDeletion(deps: AccountDataDeps, who: Who, opts: { dryRun?: boolean } = {}): Promise<StepResult[]> {
  const dryRun = !!opts.dryRun;
  const now = deps.now?.() ?? new Date();
  const results: StepResult[] = [];

  results.push(await cancelSubscriptions(deps, who, now, dryRun));
  results.push(await removeOwnedPlayerDetails(deps, who, dryRun));
  results.push(await closeCreatorProfile(deps, who, dryRun));

  for (const step of DELETION_STEPS) {
    if (step.match === "email" && !who.email) {
      results.push({ step: step.key, action: "skipped", rows: 0, detail: "no email on the account" });
      continue;
    }
    const rows = dryRun ? await countFor(deps.db, step, who) : await runStep(deps.db, step, who, now);
    const verb = step.action === "anonymise-payment" ? "anonymise" : step.action;
    results.push({ step: step.key, action: dryRun ? `would ${verb}` : verb, rows });
  }
  return results;
}

// ── the real dependencies ──────────────────────────────────────────────────

/** Wires the service-role client and the payment provider. */
export function liveAccountDataDeps(
  client: any,
  payments: AccountDataDeps["payments"],
): AccountDataDeps {
  return {
    db: client as Db,
    payments,
    storage: {
      async listAll(bucket, folder) {
        const out: string[] = [];
        const walk = async (prefix: string) => {
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset });
            if (error) {
              if (/not found/i.test(error.message || "")) return;
              fail(`storage ${bucket}/${prefix}`, error);
            }
            for (const item of data || []) {
              const path = `${prefix}/${item.name}`;
              // Folders come back without an id.
              if (item.id == null) await walk(path);
              else out.push(path);
            }
            if (!data || data.length < 1000) return;
          }
        };
        await walk(folder.replace(/\/+$/, ""));
        return out;
      },
      async remove(bucket, paths) {
        for (let i = 0; i < paths.length; i += 100) {
          const { error } = await client.storage.from(bucket).remove(paths.slice(i, i + 100));
          if (error) fail(`storage ${bucket}`, error);
        }
      },
    },
  };
}
