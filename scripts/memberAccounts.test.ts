// Run with: npx tsx --test scripts/memberAccounts.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createClient } from "@supabase/supabase-js";

// The route module builds a Supabase client on import, so give it somewhere to point (nothing is ever called).
process.env.VITE_SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";

const { ensureMemberProfile, registerMemberAccountRoutes, supabaseStoreFor, termsConsentFromMetadata } = await import("../server/memberAccounts");
type ConsentRow = import("../server/memberAccounts").ConsentRow;
type MemberAccountStore = import("../server/memberAccounts").MemberAccountStore;
type MemberUser = import("../server/memberAccounts").MemberUser;
type ProfilePatch = import("../server/memberAccounts").ProfilePatch;

const NOW = new Date("2026-10-22T18:00:00.000Z");
const SIGNED_UP = "2026-10-20T09:30:15.123Z";

// What Scorers Table's supabase.auth.signUp stores on the auth user.
const scorersTableMeta = (over: Record<string, unknown> = {}) => ({
  full_name: "Sam Scorer",
  terms_accepted_at: SIGNED_UP,
  terms_version: "2026-10-draft-1",
  signed_up_via: "scorers-table",
  ...over,
});

// ---------- the metadata -> consent rule ----------

test("a sign-up's terms acceptance becomes a consent typed by the version they accepted, at the time they accepted", () => {
  assert.deepEqual(termsConsentFromMetadata(scorersTableMeta(), NOW), {
    consent_type: "terms_2026-10-draft-1",
    accepted_at: SIGNED_UP,
  });
});

test("nothing is recorded unless both the timestamp and the version are there and usable", () => {
  const none = (meta: Record<string, unknown> | null | undefined) => assert.equal(termsConsentFromMetadata(meta, NOW), null);
  none(undefined);
  none(null);
  none({});
  none({ full_name: "Site Member" });
  none(scorersTableMeta({ terms_accepted_at: undefined }));
  none(scorersTableMeta({ terms_version: undefined }));
  none(scorersTableMeta({ terms_accepted_at: "not a date" }));
  none(scorersTableMeta({ terms_accepted_at: 1760000000000 }));
  none(scorersTableMeta({ terms_accepted_at: true }));
  none(scorersTableMeta({ terms_version: "" }));
  none(scorersTableMeta({ terms_version: 2 }));
  none(scorersTableMeta({ terms_version: "v1 'or'" }));
  none(scorersTableMeta({ terms_version: "../../marketing" }));
  none(scorersTableMeta({ terms_version: "x".repeat(65) }));
});

test("a date that has not happened yet is not an acceptance, a device clock a few hours fast is", () => {
  assert.equal(termsConsentFromMetadata(scorersTableMeta({ terms_accepted_at: "2026-10-30T00:00:00Z" }), NOW), null);
  const fast = termsConsentFromMetadata(scorersTableMeta({ terms_accepted_at: "2026-10-22T20:00:00+00:00" }), NOW);
  assert.equal(fast?.accepted_at, "2026-10-22T20:00:00.000Z");
});

test("the version is trimmed and the timestamp is normalised", () => {
  const got = termsConsentFromMetadata(scorersTableMeta({ terms_version: " 2026-10-draft-1 ", terms_accepted_at: "2026-10-20T10:30:15+01:00" }), NOW);
  assert.deepEqual(got, { consent_type: "terms_2026-10-draft-1", accepted_at: "2026-10-20T09:30:15.000Z" });
});

// ---------- in-memory store ----------

function memory(seed: { profiles?: Record<string, { display_name: string | null; marketing_consent: boolean }>; consents?: ConsentRow[] } = {}) {
  const profiles = new Map<string, Record<string, unknown>>(Object.entries(seed.profiles ?? {}).map(([id, p]) => [id, { id, ...p }]));
  const consents: ConsentRow[] = [...(seed.consents ?? [])];
  const calls = { created: 0, updated: 0, failAddConsents: 0, failCreate: false };
  const store: MemberAccountStore = {
    async createProfileIfMissing(userId, now) {
      if (calls.failCreate) throw new Error("insert failed");
      if (profiles.has(userId)) return false;
      profiles.set(userId, { id: userId, display_name: null, marketing_consent: false, created_at: now, updated_at: now });
      calls.created++;
      return true;
    },
    async updateProfile(userId, patch: ProfilePatch) {
      const row = profiles.get(userId);
      if (!row) return false;
      Object.assign(row, patch);
      calls.updated++;
      return true;
    },
    async consentTypesOnFile(userId, types) {
      return consents.filter((c) => c.user_id === userId && types.includes(c.consent_type)).map((c) => c.consent_type);
    },
    async addConsents(rows) {
      if (calls.failAddConsents > 0) { calls.failAddConsents--; throw new Error("insert failed"); }
      consents.push(...rows);
    },
  };
  return { store, profiles, consents, calls };
}

const users: Record<string, MemberUser> = {
  "scorers-user": { id: "scorers-user", user_metadata: scorersTableMeta() },
  "site-user": { id: "site-user", user_metadata: {} },
  "odd-user": { id: "odd-user", user_metadata: scorersTableMeta({ terms_accepted_at: "tomorrow-ish" }) },
};

async function withApp(store: MemberAccountStore, run: (url: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerMemberAccountRoutes(app, {
    store,
    now: () => NOW,
    authenticate: async (req) => {
      const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
      return users[token] ?? null;
    },
  });
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); } finally { server.close(); }
}

const post = (url: string, path: string, token: string | null, body: unknown) =>
  fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

// ---------- update-profile ----------

test("update-profile creates the missing profile, saves the name, and keeps the sign-up's terms acceptance once", async () => {
  const m = memory();
  await withApp(m.store, async (url) => {
    const first = await post(url, "/api/account/update-profile", "scorers-user", { displayName: "  Sam S  " });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { success: true });
    assert.equal(m.profiles.get("scorers-user")?.display_name, "Sam S");
    assert.equal(m.profiles.get("scorers-user")?.marketing_consent, false, "a new profile starts with no marketing consent");
    assert.deepEqual(m.consents, [{ user_id: "scorers-user", consent_type: "terms_2026-10-draft-1", accepted: true, accepted_at: SIGNED_UP }]);

    const second = await post(url, "/api/account/update-profile", "scorers-user", { displayName: "Sam Scorer" });
    assert.equal(second.status, 200);
    assert.equal(m.profiles.get("scorers-user")?.display_name, "Sam Scorer");
    assert.equal(m.consents.length, 1, "the acceptance is not written a second time");
    assert.equal(m.calls.created, 1);
  });
});

test("update-profile for a member who registered on the site changes nothing but the profile", async () => {
  const m = memory({
    profiles: { "site-user": { display_name: "Old Name", marketing_consent: true } },
    consents: [
      { user_id: "site-user", consent_type: "terms_v1", accepted: true, accepted_at: "2026-09-01T10:00:00.000Z" },
      { user_id: "site-user", consent_type: "privacy_v1", accepted: true, accepted_at: "2026-09-01T10:00:00.000Z" },
    ],
  });
  await withApp(m.store, async (url) => {
    const res = await post(url, "/api/account/update-profile", "site-user", { displayName: "New Name" });
    assert.equal(res.status, 200);
    assert.equal(m.profiles.get("site-user")?.display_name, "New Name");
    assert.equal(m.profiles.get("site-user")?.marketing_consent, true, "an existing marketing choice is left alone");
    assert.equal(m.consents.length, 2);
    assert.equal(m.calls.created, 0);
  });
});

test("a member with no sign-up metadata gets a profile but no invented consent", async () => {
  const m = memory();
  await withApp(m.store, async (url) => {
    const res = await post(url, "/api/account/update-profile", "site-user", { displayName: "No Record" });
    assert.equal(res.status, 200);
    assert.equal(m.profiles.get("site-user")?.display_name, "No Record");
    assert.deepEqual(m.consents, []);
  });
});

test("metadata that cannot be used records no consent, and the save still works", async () => {
  const m = memory();
  await withApp(m.store, async (url) => {
    const res = await post(url, "/api/account/update-profile", "odd-user", { displayName: "Odd" });
    assert.equal(res.status, 200);
    assert.equal(m.profiles.get("odd-user")?.display_name, "Odd");
    assert.deepEqual(m.consents, []);
  });
});

test("a failed consent copy does not block the save, and the next save writes it", async () => {
  const m = memory();
  m.calls.failAddConsents = 1;
  await withApp(m.store, async (url) => {
    const first = await post(url, "/api/account/update-profile", "scorers-user", { displayName: "Sam" });
    assert.equal(first.status, 200);
    assert.equal(m.profiles.get("scorers-user")?.display_name, "Sam");
    assert.deepEqual(m.consents, []);

    const second = await post(url, "/api/account/update-profile", "scorers-user", { displayName: "Sam" });
    assert.equal(second.status, 200);
    assert.equal(m.consents.length, 1);
    assert.equal(m.consents[0].accepted_at, SIGNED_UP);
  });
});

test("update-profile reports a profile it could not create instead of answering success", async () => {
  const m = memory();
  m.calls.failCreate = true;
  await withApp(m.store, async (url) => {
    const res = await post(url, "/api/account/update-profile", "scorers-user", { displayName: "Sam" });
    assert.equal(res.status, 500);
    assert.deepEqual(m.consents, [], "no consent is written for a profile that does not exist");
    assert.equal(m.profiles.size, 0);
  });
});

test("update-profile only ever writes the signed-in member's own row", async () => {
  const m = memory({ profiles: { "site-user": { display_name: "Untouched", marketing_consent: false } } });
  await withApp(m.store, async (url) => {
    const res = await post(url, "/api/account/update-profile", "scorers-user", { displayName: "Mine", id: "site-user", userId: "site-user" });
    assert.equal(res.status, 200);
    assert.equal(m.profiles.get("site-user")?.display_name, "Untouched");
    assert.equal(m.profiles.get("scorers-user")?.display_name, "Mine");
  });
});

test("update-profile needs a signed-in member and a string name", async () => {
  const m = memory();
  await withApp(m.store, async (url) => {
    assert.equal((await post(url, "/api/account/update-profile", null, { displayName: "x" })).status, 401);
    assert.equal((await post(url, "/api/account/update-profile", "nobody", { displayName: "x" })).status, 401);
    assert.equal((await post(url, "/api/account/update-profile", "scorers-user", { displayName: 7 })).status, 400);
    assert.equal(m.profiles.size, 0);
    assert.deepEqual(m.consents, []);
    const cleared = await post(url, "/api/account/update-profile", "scorers-user", { displayName: null });
    assert.equal(cleared.status, 200);
    assert.equal(m.profiles.get("scorers-user")?.display_name, null);
  });
});

// ---------- update-marketing-consent ----------

test("update-marketing-consent creates the missing profile, records the choice, and keeps the terms acceptance", async () => {
  const m = memory();
  await withApp(m.store, async (url) => {
    const res = await post(url, "/api/account/update-marketing-consent", "scorers-user", { accepted: true });
    assert.equal(res.status, 200);
    const profile = m.profiles.get("scorers-user");
    assert.equal(profile?.marketing_consent, true);
    assert.equal(profile?.marketing_consent_at, NOW.toISOString());
    assert.deepEqual(m.consents, [
      { user_id: "scorers-user", consent_type: "terms_2026-10-draft-1", accepted: true, accepted_at: SIGNED_UP },
      { user_id: "scorers-user", consent_type: "marketing", accepted: true, accepted_at: NOW.toISOString() },
    ]);

    const off = await post(url, "/api/account/update-marketing-consent", "scorers-user", { accepted: false });
    assert.equal(off.status, 200);
    assert.equal(profile?.marketing_consent, false);
    assert.equal(profile?.marketing_consent_at, null);
    assert.deepEqual(m.consents.map((c) => [c.consent_type, c.accepted]), [
      ["terms_2026-10-draft-1", true],
      ["marketing", true],
      ["marketing", false],
    ], "the withdrawal is appended, and the terms acceptance is not repeated");
  });
});

test("update-marketing-consent needs a signed-in member and a boolean", async () => {
  const m = memory();
  await withApp(m.store, async (url) => {
    assert.equal((await post(url, "/api/account/update-marketing-consent", null, { accepted: true })).status, 401);
    assert.equal((await post(url, "/api/account/update-marketing-consent", "scorers-user", { accepted: "yes" })).status, 400);
    assert.equal(m.profiles.size, 0);
    assert.deepEqual(m.consents, []);
  });
});

// ---------- ensureMemberProfile directly ----------

test("ensureMemberProfile reports what it did", async () => {
  const m = memory();
  const first = await ensureMemberProfile(m.store, users["scorers-user"], NOW.toISOString());
  assert.equal(first.created, true);
  assert.equal(first.consent?.consent_type, "terms_2026-10-draft-1");
  const again = await ensureMemberProfile(m.store, users["scorers-user"], NOW.toISOString());
  assert.deepEqual([again.created, again.consent], [false, null]);
});

// ---------- the Supabase store, against a stubbed network (nothing leaves this process) ----------

type Seen = { method: string; url: URL; headers: Headers; body: any };

function stubbedStore(reply: (seen: Seen) => { status: number; body: unknown }) {
  const seen: Seen[] = [];
  const stubFetch: typeof fetch = async (input, init) => {
    const req = new Request(input as any, init);
    const text = await req.text();
    const record: Seen = { method: req.method, url: new URL(req.url), headers: req.headers, body: text ? JSON.parse(text) : undefined };
    seen.push(record);
    const { status, body } = reply(record);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  const db = createClient("http://stub.invalid", "service-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: stubFetch } });
  return { store: supabaseStoreFor(db), seen };
}

test("the store creates a profile with INSERT ... ON CONFLICT DO NOTHING and says whether it did", async () => {
  const made = stubbedStore(() => ({ status: 201, body: [{ id: "u1" }] }));
  assert.equal(await made.store.createProfileIfMissing("u1", NOW.toISOString()), true);
  const [req] = made.seen;
  assert.equal(req.method, "POST");
  assert.equal(req.url.pathname, "/rest/v1/member_profiles");
  assert.equal(req.url.searchParams.get("on_conflict"), "id");
  assert.match(req.headers.get("prefer") ?? "", /resolution=ignore-duplicates/);
  assert.match(req.headers.get("prefer") ?? "", /return=representation/);
  assert.deepEqual(req.body, { id: "u1", marketing_consent: false, created_at: NOW.toISOString(), updated_at: NOW.toISOString() });

  const existing = stubbedStore(() => ({ status: 201, body: [] }));
  assert.equal(await existing.store.createProfileIfMissing("u1", NOW.toISOString()), false, "nothing inserted: the profile was already there");
});

test("the store updates only the member's own row and says whether a row matched", async () => {
  const hit = stubbedStore(() => ({ status: 200, body: [{ id: "u1" }] }));
  assert.equal(await hit.store.updateProfile("u1", { display_name: "Sam", updated_at: NOW.toISOString() }), true);
  assert.equal(hit.seen[0].method, "PATCH");
  assert.equal(hit.seen[0].url.pathname, "/rest/v1/member_profiles");
  assert.equal(hit.seen[0].url.searchParams.get("id"), "eq.u1");
  assert.deepEqual(hit.seen[0].body, { display_name: "Sam", updated_at: NOW.toISOString() });

  const miss = stubbedStore(() => ({ status: 200, body: [] }));
  assert.equal(await miss.store.updateProfile("u1", { updated_at: NOW.toISOString() }), false, "zero rows updated is reported, not treated as success");
});

test("the store looks up and inserts consent rows for the member only", async () => {
  const lookup = stubbedStore(() => ({ status: 200, body: [{ consent_type: "terms_2026-10-draft-1" }] }));
  assert.deepEqual(await lookup.store.consentTypesOnFile("u1", ["terms_2026-10-draft-1"]), ["terms_2026-10-draft-1"]);
  assert.equal(lookup.seen[0].url.searchParams.get("user_id"), "eq.u1");
  assert.equal(lookup.seen[0].url.searchParams.get("consent_type"), "in.(terms_2026-10-draft-1)");

  const insert = stubbedStore(() => ({ status: 201, body: null }));
  const row = { user_id: "u1", consent_type: "terms_2026-10-draft-1", accepted: true, accepted_at: SIGNED_UP };
  await insert.store.addConsents([row]);
  assert.equal(insert.seen[0].method, "POST");
  assert.equal(insert.seen[0].url.pathname, "/rest/v1/member_consents");
  assert.deepEqual(insert.seen[0].body, [row]);
});

test("the store turns a database error into a thrown error", async () => {
  const failing = stubbedStore(() => ({ status: 500, body: { message: "boom", code: "XX000" } }));
  await assert.rejects(failing.store.createProfileIfMissing("u1", NOW.toISOString()), /boom/);
  await assert.rejects(failing.store.updateProfile("u1", { updated_at: NOW.toISOString() }), /boom/);
  await assert.rejects(failing.store.consentTypesOnFile("u1", ["x"]), /boom/);
  await assert.rejects(failing.store.addConsents([]), /boom/);
});
