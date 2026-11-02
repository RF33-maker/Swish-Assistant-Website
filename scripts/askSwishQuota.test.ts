/**
 * Drives the Ask Swish quota through six questions for a made-up free
 * account and checks the hourly cap closes the gate on the sixth.
 *
 *   npx tsx scripts/askSwishQuota.test.ts
 *
 * Without the ask_swish_questions table it exercises the in-memory
 * fallback; with it, it writes six rows for a random user id (harmless, but
 * they count towards nothing real).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { quotaFor, recordQuestion, recordUsage, LIMITS } from "../server/askSwish/quota";

async function main() {
  const user = randomUUID();
  const max = LIMITS.free.hour;
  console.log(`free limits: ${LIMITS.free.hour}/h ${LIMITS.free.week}/w ${LIMITS.free.month}/m; pro: ${LIMITS.pro.hour}/h ${LIMITS.pro.week}/w ${LIMITS.pro.month}/m`);
  for (let i = 1; i <= max + 1; i++) {
    const q = await quotaFor(user, "free");
    const open = !q.exhausted;
    console.log(`question ${i}: used ${q.hour.used}/${q.hour.max} this hour, ${q.week.used}/${q.week.max} this week → ${open ? "allowed" : `blocked by ${q.exhausted}, resets ${q.resetAt}`}`);
    if (i <= max && !open) throw new Error(`blocked too early at ${i}`);
    if (i > max && open) throw new Error(`not blocked at ${i}`);
    if (open) {
      const id = await recordQuestion(user, "free", "test-model", "site");
      await recordUsage(id, { rounds: 1, input: 10, cacheWrite: 0, cacheRead: 0, output: 5 }, "done");
    }
  }
  const pro = await quotaFor(randomUUID(), "pro");
  if (pro.exhausted) throw new Error("fresh pro account should not be blocked");
  console.log("ok");
}

main().catch((err) => { console.error(err); process.exit(1); });
