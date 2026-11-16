/**
 * Dry run of account deletion and export against the real database. Changes
 * nothing: deletion runs with dryRun, so every step only counts.
 *
 *   DOTENV_CONFIG_PATH=.env node --import dotenv/config node_modules/.bin/tsx scripts/account-data-dry-run.ts
 *
 * With no arguments it uses a random user id and an `.invalid` email, which
 * match nobody: a schema check that every table and column the code touches
 * exists (and that the capture schema is reachable), without reading anyone's
 * data. Pass a user id (and --email) only for an account that has asked to be
 * deleted, or a test account, to preview what processing it would do; the admin
 * endpoint's ?dryRun=true does the same.
 *
 *   ... scripts/account-data-dry-run.ts <user-id> --email <their email>
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { compileAccountExport, liveAccountDataDeps, runAccountDeletion } from "../server/accountData";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see the usage note at the top).");
  process.exit(1);
}

const args = process.argv.slice(2);
const emailAt = args.indexOf("--email");
const email = emailAt >= 0 ? args[emailAt + 1] : "nobody@account-dry-run.invalid";
const userId = args.find((a, i) => !a.startsWith("--") && i !== emailAt + 1) ?? randomUUID();
const probe = !args.some((a, i) => !a.startsWith("--") && i !== emailAt + 1);

const client = createClient(url, key, { auth: { persistSession: false } });
const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const deps = liveAccountDataDeps(client, {
  liveKey: !/^(sk|rk)_test_/.test(stripeKey),
  async cancelSubscription() {
    throw new Error("dry run: never cancels");
  },
});

const who = { userId, email };
console.log(probe ? `Schema check with a random id (${userId}) that matches nobody.\n` : `Dry run for ${userId} <${email}>.\n`);

const steps = await runAccountDeletion(deps, who, { dryRun: true });
const width = Math.max(...steps.map((s) => s.step.length));
for (const s of steps) console.log(`${s.step.padEnd(width)}  ${s.action.padEnd(16)} ${String(s.rows).padStart(5)}${s.detail ? `  (${s.detail})` : ""}`);

const exported = await compileAccountExport(deps, who, null);
const sections = Object.entries(exported).filter(([k]) => k !== "exported_at" && k !== "account");
const filled = sections.filter(([, v]) => (Array.isArray(v) ? v.length : v != null));
console.log(`\nExport: ${sections.length} sections compiled, ${filled.length} with data${probe ? " (expected 0)" : ""}.`);
if (probe && filled.length) {
  console.error("A random id matched data:", filled.map(([k]) => k).join(", "));
  process.exit(1);
}
