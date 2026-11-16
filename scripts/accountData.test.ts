// Run with: npx tsx --test scripts/accountData.test.ts
//
// Account deletion and export (server/accountData.ts) against an in-memory
// database: what is deleted, what is only unlinked, what is kept, and that
// another member's rows are never touched. Plus a coverage check that every
// column pointing at a user has a deletion rule and an export section.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_LINKS,
  BUILT_IN_EXPORT_KEYS,
  CUSTOM_STEPS,
  DELETION_STEPS,
  EXPORT_SOURCES,
  compileAccountExport,
  runAccountDeletion,
  type AccountDataDeps,
} from "../server/accountData";

// ── a tiny stand-in for the Supabase query builder ─────────────────────────

type Row = Record<string, any>;

class FakeDb {
  tables = new Map<string, Row[]>();
  constructor(seed: Record<string, Row[]>) {
    for (const [name, rows] of Object.entries(seed)) {
      this.tables.set(name.includes(".") ? name : `public.${name}`, rows.map((r) => ({ ...r })));
    }
  }
  from(table: string) { return new FakeQuery(this, `public.${table}`); }
  schema(name: string) { return { from: (table: string) => new FakeQuery(this, `${name}.${table}`) }; }
  rows(name: string): Row[] { return this.tables.get(name.includes(".") ? name : `public.${name}`) || []; }
}

function likeToRegex(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "%") out += ".*";
    else if (c === "_") out += ".";
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`, "i");
}

class FakeQuery {
  private op: "select" | "update" | "delete" = "select";
  private cols = "*";
  private head = false;
  private values: Row = {};
  private filters: Array<(r: Row) => boolean> = [];
  private single = false;
  private max = Infinity;
  constructor(private db: FakeDb, private name: string) {}

  select(cols = "*", opts: { head?: boolean } = {}) {
    if (this.op === "select") { this.cols = cols; this.head = !!opts.head; }
    return this;
  }
  update(values: Row) { this.op = "update"; this.values = values; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  not(c: string, op: string, v: any) {
    assert.equal(op, "is");
    this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v));
    return this;
  }
  ilike(c: string, pattern: string) { const re = likeToRegex(pattern); this.filters.push((r) => typeof r[c] === "string" && re.test(r[c])); return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.single = true; return this; }

  private run() {
    const table = this.db.tables.get(this.name);
    if (!table) return { data: null, count: null, error: { code: "42P01", message: `relation ${this.name} does not exist` } };
    const hit = table.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "delete") {
      this.db.tables.set(this.name, table.filter((r) => !hit.includes(r)));
      return { data: null, count: hit.length, error: null };
    }
    if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.values);
      return { data: null, count: hit.length, error: null };
    }
    const picked = hit.slice(0, this.max).map((r) => {
      if (this.cols.trim() === "*") return { ...r };
      const out: Row = {};
      for (const c of this.cols.split(",").map((s) => s.trim())) out[c] = r[c];
      return out;
    });
    if (this.head) return { data: null, count: hit.length, error: null };
    if (this.single) return { data: picked[0] ?? null, count: null, error: null };
    return { data: picked, count: picked.length, error: null };
  }
  then(resolve: (v: any) => any, reject?: (e: any) => any) {
    try { return Promise.resolve(this.run()).then(resolve, reject); } catch (e) { return Promise.reject(e).then(resolve, reject); }
  }
}

class FakeStorage {
  files = new Map<string, string[]>();
  constructor(seed: Record<string, string[]>) { for (const [b, p] of Object.entries(seed)) this.files.set(b, [...p]); }
  async listAll(bucket: string, folder: string) { return (this.files.get(bucket) || []).filter((p) => p.startsWith(`${folder}/`)); }
  async remove(bucket: string, paths: string[]) { this.files.set(bucket, (this.files.get(bucket) || []).filter((p) => !paths.includes(p))); }
}

// ── one coach who did a bit of everything, and someone else ────────────────

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const MY_EMAIL = "Coach_Person@Example.com";
const NOW = new Date("2026-12-20T12:00:00.000Z");
const FUTURE = "2027-01-15T00:00:00.000Z";
const PAST = "2026-11-01T00:00:00.000Z";

function world() {
  const db = new FakeDb({
    competitions: [
      { league_id: "L1", slug: "mine", name: "My League", created_by: ME, user_id: ME },
      { league_id: "L2", slug: "theirs", name: "Their League", created_by: OTHER, user_id: OTHER },
    ],
    player_stats: [{ id: 1, user_id: ME, points: 20 }, { id: 2, user_id: OTHER, points: 9 }],
    scout_coach_notes: [{ id: "n1", created_by: ME, note: "press them" }, { id: "n2", created_by: OTHER, note: "zone" }],
    scouting_reports: [{ id: "s1", created_by: ME, name: "Mine" }, { id: "s2", created_by: OTHER, name: "Theirs" }],
    scout_agent_reports: [
      { id: "preview-mine", requested_by: ME, tier: "preview" },
      { id: "full-club", requested_by: ME, tier: "full" },
      { id: "preview-other", requested_by: OTHER, tier: "preview" },
    ],
    coach_reports: [{ id: "r1", requested_by: ME, team_name: "Mohawks" }],
    coach_interactions: [{ id: "i1", user_id: ME, content: {} }, { id: "i2", user_id: OTHER, content: {} }],
    coach_playbooks: [{ id: "pb1", updated_by: ME, title: "Club playbook" }],
    ask_swish_questions: [{ id: 1, user_id: ME }, { id: 2, user_id: OTHER }],
    photographer_applications: [
      { id: "a1", user_id: ME, email: "old@example.com", name: "Me" },
      { id: "a2", user_id: null, email: "coach_person@example.com", name: "Me, signed out" },
      { id: "a3", user_id: null, email: "someone@example.com", name: "Someone" },
    ],
    // "_" is a LIKE wildcard: coachXperson must survive.
    contact_requests: [
      { id: "c1", email: "COACH_PERSON@example.com", message: "hi" },
      { id: "c2", email: "coachXperson@example.com", message: "not me" },
    ],
    newsletter_signups: [{ id: "nl1", email: "coach_person@example.com" }, { id: "nl2", email: "other@example.com" }],
    coach_access: [
      {
        id: "ca1", user_id: ME, team_id: "T1", team_name: "Mohawks", email: "coach_person@example.com",
        plan: "monthly", status: "active", livemode: true, access_until: FUTURE, cancel_at_period_end: false,
        stripe_customer_id: "cus_1", stripe_subscription_id: "sub_coach", stripe_checkout_session_id: "cs_1", stripe_payment_intent_id: null,
      },
      { id: "ca2", user_id: OTHER, team_id: "T2", team_name: "Riders", email: "other@example.com", plan: "season", status: "active", livemode: true, stripe_checkout_session_id: "cs_2" },
    ],
    user_entitlements: [
      { id: "e1", user_id: ME, entitlement: "plus", source: "stripe", external_ref: "sub_plus", expires_at: FUTURE, livemode: true },
      { id: "e2", user_id: ME, entitlement: "plus", source: "stripe", external_ref: "sub_lapsed", expires_at: PAST, livemode: true },
    ],
    member_consents: [{ id: "mc1", user_id: ME, consent_type: "terms_v2", accepted: true }],
    member_profiles: [{ id: ME, display_name: "Coach" }, { id: OTHER, display_name: "Other" }],
    data_export_requests: [{ id: "x1", user_id: ME, status: "delivered" }],
    player_claims: [
      { id: "pc1", player_id: "P1", user_id: ME, status: "approved" },
      { id: "pc2", player_id: "P2", user_id: ME, status: "rejected" },
    ],
    player_owner_fields: [{ player_id: "P1", bio: "mine" }, { player_id: "P2", bio: "not mine" }, { player_id: "P3", bio: "theirs" }],
    photographers: [{ id: "ph1", user_id: ME, slug: "me" }, { id: "ph2", user_id: OTHER, slug: "them" }],
    photos: [{ id: "f1", photographer_id: "ph1", caption: "dunk" }, { id: "f2", photographer_id: "ph2", caption: "theirs" }],
    photo_usage_log: [{ id: "u1", photo_id: "f1", context: "player page" }],
    // Export-only tables (deletion leaves these to the foreign keys).
    profiles: [{ id: ME, name: "Coach" }],
    user_follows: [{ id: "fo1", user_id: ME, kind: "team", key: "mohawks", label: "Mohawks" }, { id: "fo2", user_id: OTHER, kind: "team", key: "riders", label: "Riders" }],
    notification_settings: [{ user_id: ME, enabled: true }],
    inbox_items: [], feed_comments: [{ id: "cm1", user_id: ME, body: "great game", reviewed_by: OTHER }], feed_comment_reports: [],
    feed_comment_mutes: [], feed_likes: [], feed_picks: [], claim_redeem_attempts: [], player_name_requests: [],
    club_members: [], competition_managers: [], deletion_requests: [{ id: "d1", user_id: ME, status: "pending" }],
    prep_tip_feedback: [], creator_posts: [], creator_post_replies: [], creator_post_likes: [], creator_reports: [],
    "capture.organiser_access": [], "capture.league_members": [{ league_uid: "CL1", user_id: ME, role: "scorer" }],
    "capture.team_managers": [], "capture.game_scorers": [], "capture.correction_requests": [],
  });
  const storage = new FakeStorage({
    "player-photos": ["owners/P1/me.webp", "owners/P3/them.webp"],
    "photo-web": ["ph1/f1/thumb.webp", "ph1/avatar.webp", "ph2/f2/thumb.webp"],
    "photo-originals": ["ph1/f1.jpg", "ph2/f2.jpg"],
    "creator-space": ["ph1/posts/a.webp", "swish/b.webp"],
  });
  const cancelled: string[] = [];
  const deps: AccountDataDeps = {
    db,
    storage,
    payments: { liveKey: true, async cancelSubscription(id) { cancelled.push(id); } },
    now: () => NOW,
  };
  return { db, storage, cancelled, deps };
}

const who = { userId: ME, email: MY_EMAIL };
const ids = (rows: Row[], key = "id") => rows.map((r) => r[key]).sort();

// ── deletion ───────────────────────────────────────────────────────────────

test("league data stays: competitions and stats are unlinked, never deleted", async () => {
  const { db, deps } = world();
  await runAccountDeletion(deps, who);
  assert.deepEqual(ids(db.rows("competitions"), "league_id"), ["L1", "L2"]);
  const mine = db.rows("competitions").find((c) => c.league_id === "L1")!;
  assert.equal(mine.created_by, null);
  assert.equal(mine.user_id, null);
  assert.equal(db.rows("competitions").find((c) => c.league_id === "L2")!.created_by, OTHER);
  assert.deepEqual(db.rows("player_stats").map((r) => [r.id, r.user_id, r.points]), [[1, null, 20], [2, OTHER, 9]]);
});

test("coach tools: own notes and reports go, club-shared reports are only unlinked", async () => {
  const { db, deps } = world();
  await runAccountDeletion(deps, who);
  assert.deepEqual(ids(db.rows("scout_coach_notes")), ["n2"]);
  assert.deepEqual(ids(db.rows("scouting_reports")), ["s2"]);
  assert.deepEqual(ids(db.rows("scout_agent_reports")), ["full-club", "preview-other"]);
  assert.equal(db.rows("scout_agent_reports").find((r) => r.id === "full-club")!.requested_by, null);
  assert.equal(db.rows("coach_reports")[0].requested_by, null);
  assert.deepEqual(ids(db.rows("coach_interactions")), ["i2"]);
  assert.equal(db.rows("coach_playbooks")[0].updated_by, null);
  assert.deepEqual(ids(db.rows("ask_swish_questions")), [2]);
});

test("rows found by email are matched exactly, case-insensitively", async () => {
  const { db, deps } = world();
  await runAccountDeletion(deps, who);
  assert.deepEqual(ids(db.rows("contact_requests")), ["c2"]);
  assert.deepEqual(ids(db.rows("newsletter_signups")), ["nl2"]);
  assert.deepEqual(ids(db.rows("photographer_applications")), ["a3"]);
});

test("payments: running subscriptions are cancelled and the record is kept without the person", async () => {
  const { db, deps, cancelled } = world();
  await runAccountDeletion(deps, who);
  assert.deepEqual(cancelled.sort(), ["sub_coach", "sub_plus"]);
  const kept = db.rows("coach_access").find((r) => r.id === "ca1")!;
  assert.equal(kept.user_id, null);
  assert.equal(kept.email, null);
  assert.equal(kept.stripe_checkout_session_id, null);
  assert.equal(kept.stripe_customer_id, "cus_1");
  assert.equal(kept.stripe_subscription_id, "sub_coach");
  assert.equal(kept.status, "canceled");
  assert.equal(kept.account_deleted_at, NOW.toISOString());
  const theirs = db.rows("coach_access").find((r) => r.id === "ca2")!;
  assert.equal(theirs.user_id, OTHER);
  assert.equal(theirs.email, "other@example.com");
  assert.equal(theirs.status, "active");
});

test("player profile details and creator profile go, with their files", async () => {
  const { db, storage, deps } = world();
  await runAccountDeletion(deps, who);
  // Only the approved claim's details; P2's claim was rejected, so its row isn't the member's.
  assert.deepEqual(ids(db.rows("player_owner_fields"), "player_id"), ["P2", "P3"]);
  assert.deepEqual(storage.files.get("player-photos"), ["owners/P3/them.webp"]);
  assert.deepEqual(ids(db.rows("photographers")), ["ph2"]);
  assert.deepEqual(storage.files.get("photo-web"), ["ph2/f2/thumb.webp"]);
  assert.deepEqual(storage.files.get("photo-originals"), ["ph2/f2.jpg"]);
  assert.deepEqual(storage.files.get("creator-space"), ["swish/b.webp"]);
});

test("account records: consent kept unlinked, profile and export requests deleted", async () => {
  const { db, deps } = world();
  await runAccountDeletion(deps, who);
  assert.deepEqual(db.rows("member_consents").map((r) => [r.id, r.user_id]), [["mc1", null]]);
  assert.deepEqual(ids(db.rows("member_profiles")), [OTHER]);
  assert.deepEqual(db.rows("data_export_requests"), []);
});

test("running it twice is safe (a failed run is fixed by retrying)", async () => {
  const { db, deps, cancelled } = world();
  await runAccountDeletion(deps, who);
  const second = await runAccountDeletion(deps, who);
  assert.ok(second.every((s) => s.rows === 0), JSON.stringify(second.filter((s) => s.rows)));
  assert.deepEqual(cancelled.sort(), ["sub_coach", "sub_plus"]);
  assert.equal(db.rows("coach_access").length, 2);
});

test("dry run changes nothing and reports what it would touch", async () => {
  const { db, storage, deps, cancelled } = world();
  const before = JSON.stringify([...db.tables]);
  const filesBefore = JSON.stringify([...storage.files]);
  const steps = await runAccountDeletion(deps, who, { dryRun: true });
  assert.equal(JSON.stringify([...db.tables]), before);
  assert.equal(JSON.stringify([...storage.files]), filesBefore);
  assert.deepEqual(cancelled, []);
  const rows = Object.fromEntries(steps.map((s) => [s.step, s.rows]));
  assert.equal(rows["cancel-subscriptions"], 2);
  assert.equal(rows["player_stats.user_id"], 1);
  assert.equal(rows["scout_agent_reports.preview"], 1);
  assert.equal(rows["scout_agent_reports.club"], 1);
  assert.equal(rows["contact_requests"], 1);
  assert.equal(rows["photographer_applications"], 2);
  assert.equal(rows["creator-profile"], 1);
  assert.match(steps.find((s) => s.step === "creator-profile")!.detail!, /^4 file/);
});

test("refuses to start when a live subscription can't be cancelled", async () => {
  const { db, deps } = world();
  const before = JSON.stringify([...db.tables]);
  await assert.rejects(runAccountDeletion({ ...deps, payments: null }, who), /no payment key/);
  await assert.rejects(runAccountDeletion({ ...deps, payments: { liveKey: false, async cancelSubscription() {} } }, who), /test key/);
  assert.equal(JSON.stringify([...db.tables]), before);
});

test("a table that doesn't exist yet counts as nothing to do", async () => {
  const { db, deps } = world();
  db.tables.delete("public.coach_reports");
  const steps = await runAccountDeletion(deps, who);
  assert.equal(steps.find((s) => s.step === "coach_reports")!.rows, 0);
});

// ── export ─────────────────────────────────────────────────────────────────

test("export has a section for every source, with only the member's rows", async () => {
  const { deps } = world();
  const out = await compileAccountExport(deps, who, { email: MY_EMAIL, created_at: "2026-09-01T00:00:00Z", user_metadata: { full_name: "Coach Person" } });
  for (const key of [...EXPORT_SOURCES.map((s) => s.key), ...BUILT_IN_EXPORT_KEYS]) assert.ok(key in out, `missing section ${key}`);
  assert.equal((out.account as any).email, MY_EMAIL);
  assert.deepEqual((out.account as any).details_given_at_sign_up, { full_name: "Coach Person" });
  assert.equal((out.profile as any).display_name, "Coach");
  assert.deepEqual((out.follows as any[]).map((f) => f.key), ["mohawks"]);
  assert.deepEqual((out.messages as any[]).map((m) => m.id), ["c1"]);
  assert.deepEqual((out.creator_applications as any[]).map((a) => a.id).sort(), ["a1", "a2"]);
  assert.deepEqual((out.owned_player_details as any[]).map((o) => o.player_id), ["P1"]);
  assert.deepEqual((out.creator_photos as any[]).map((p) => p.id), ["f1"]);
  assert.deepEqual((out.creator_photo_usage as any[]).map((u) => u.context), ["player page"]);
  assert.deepEqual((out.scorers_table_leagues as any[]).map((l) => l.league_uid), ["CL1"]);
  assert.equal((out.notification_settings as any).enabled, true);
  // Other people's ids (the admin who reviewed a comment) aren't handed over.
  assert.ok(!("reviewed_by" in (out.comments as any[])[0]));
  assert.ok(!JSON.stringify(out).includes(OTHER));
});

// ── coverage: every user link has a rule ───────────────────────────────────

test("every column that points at a user has a deletion rule and an export section", () => {
  const stepKeys = new Set(DELETION_STEPS.map((s) => s.key));
  const custom = new Set<string>(CUSTOM_STEPS);
  const exportKeys = new Set<string>([...EXPORT_SOURCES.map((s) => s.key), ...BUILT_IN_EXPORT_KEYS]);
  const seen = new Set<string>();

  for (const [col, how, section] of ACCOUNT_LINKS) {
    assert.ok(!seen.has(col), `${col} listed twice`);
    seen.add(col);
    if (how.startsWith("step:")) assert.ok(stepKeys.has(how.slice(5)), `${col}: no deletion step ${how}`);
    else if (how.startsWith("custom:")) assert.ok(custom.has(how.slice(7) as any), `${col}: no custom step ${how}`);
    else if (how.startsWith("kept:")) assert.ok(how.length > 10, `${col}: say why it's kept`);
    else assert.ok(how === "cascade" || how === "set-null", `${col}: unknown handling ${how}`);
    if (section !== "-") assert.ok(exportKeys.has(section), `${col}: no export section ${section}`);
    // A row deleted with the account is the member's data, so the export must carry it.
    if (how === "cascade" && !col.startsWith("public.app_admins")) assert.notEqual(section, "-", `${col} is the member's data but isn't exported`);
  }

  const located = (s: { schema?: string; table: string; column: string; emailColumn?: string }) =>
    [`${s.schema ?? "public"}.${s.table}.${s.column}`, ...(s.emailColumn ? [`${s.schema ?? "public"}.${s.table}.${s.emailColumn}`] : [])];
  for (const step of DELETION_STEPS) for (const c of located(step)) assert.ok(seen.has(c), `deletion step ${step.key} touches ${c}, which isn't in ACCOUNT_LINKS`);
  for (const src of EXPORT_SOURCES) for (const c of located(src)) assert.ok(seen.has(c), `export ${src.key} reads ${c}, which isn't in ACCOUNT_LINKS`);
});
