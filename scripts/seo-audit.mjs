#!/usr/bin/env node
/**
 * SEO audit: fetches the sitemap and a sample of every page type as Googlebot,
 * and checks what a search engine needs to index each page.
 *
 *   node scripts/seo-audit.mjs                         # production
 *   node scripts/seo-audit.mjs --base http://localhost:5050 --sample 20
 *   node scripts/seo-audit.mjs --base https://<preview>.vercel.app \
 *     --header "x-vercel-protection-bypass: <secret>"
 *   node scripts/seo-audit.mjs --only team --sample 1000     # every team URL
 *   node scripts/seo-audit.mjs --url /player/wickens-simba   # one page, in detail
 *
 * Every sitemap URL should: answer 200 without a redirect, have a canonical
 * pointing at itself, not be noindex, have a title and an <h1> naming the
 * player/team/competition, carry valid JSON-LD and real crawlable text.
 * Exits 1 if any sampled URL fails, so it can run in CI after a deploy.
 *
 * This proves what Google is *served*. Whether Google has *indexed* it is
 * Search Console's job: Pages report, Sitemaps report and URL Inspection.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = opt("base", "https://swishassistant.com").replace(/\/$/, "");
const SAMPLE = Number(opt("sample", 40));
const ONE_URL = opt("url", null);
const ONLY = opt("only", null);
const CONCURRENCY = Number(opt("concurrency", 4));
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const headers = { "user-agent": UA };
args.forEach((a, i) => {
  if (a === "--header" && args[i + 1]) {
    const [k, ...v] = args[i + 1].split(":");
    headers[k.trim()] = v.join(":").trim();
  }
});
const SITE = "https://swishassistant.com";

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function get(path, redirect = "manual") {
  const t0 = Date.now();
  const res = await fetch(BASE + path, { headers, redirect });
  const text = res.status === 200 ? await res.text() : "";
  return { res, text, ms: Date.now() - t0 };
}

async function sitemapPaths() {
  const { res, text } = await get("/sitemap.xml", "follow");
  if (res.status !== 200) throw new Error(`/sitemap.xml answered ${res.status}`);
  const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
  if (!text.includes("<sitemapindex")) return locs(text).map((u) => u.replace(SITE, ""));
  const children = locs(text).map((u) => u.replace(SITE, ""));
  const docs = await Promise.all(children.map((p) => get(p, "follow").then((r) => r.text)));
  return docs.flatMap(locs).map((u) => u.replace(SITE, ""));
}

const typeOf = (p) =>
  p.startsWith("/player/") ? "player"
    : /\/team\//.test(p) ? "team"
    : /\/game\//.test(p) ? "game"
    : /^\/competition\/[^/]+$/.test(p) ? "competition"
    : p.startsWith("/news/") ? "news"
    : "hub";

async function audit(path) {
  const problems = [];
  let r;
  try {
    r = await get(path);
  } catch (e) {
    return { path, problems: [`fetch failed: ${e.message}`] };
  }
  const { res, text: html, ms } = r;
  if (res.status !== 200) {
    problems.push(`status ${res.status}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}`);
    return { path, status: res.status, ms, problems };
  }
  const canonical = decode((html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/) || [])[1] || "");
  const canonicals = (html.match(/rel="canonical"/g) || []).length;
  const robots = (html.match(/<meta name="robots" content="([^"]+)"/) || [])[1] || "";
  const title = decode((html.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1] || "").trim();
  const h1 = decode(((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/<[^>]+>/g, "")).trim();
  const crawlable = (html.split('id="crawlable-content"')[1] || "").split("</main>")[0];
  const textLen = crawlable.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

  const expected = SITE + path;
  if (!canonical) problems.push("no canonical");
  else if (canonical !== expected && decodeURIComponent(canonical) !== decodeURIComponent(expected)) problems.push(`canonical → ${canonical.replace(SITE, "")}`);
  if (canonicals > 1) problems.push(`${canonicals} canonical tags`);
  if (/noindex/i.test(robots)) problems.push(`robots: ${robots} (but listed in the sitemap)`);
  if (!title) problems.push("no <title>");
  if (!h1) problems.push("no <h1>");
  if (!crawlable) problems.push("no server-rendered content");
  else if (textLen < 150) problems.push(`thin content (${textLen} chars)`);
  if (/No public game (log|statistics) (is|are) available yet/.test(crawlable)) problems.push("player has no games (an empty page in the sitemap)");
  if (!jsonLdBlocks.length) problems.push("no JSON-LD");
  for (const b of jsonLdBlocks) {
    try { JSON.parse(b[1]); } catch { problems.push("invalid JSON-LD"); }
  }
  // A player/team/competition/game/article page's subject (its h1 minus
  // "Stats & Game Log" etc.) should be in the title: it's what people search.
  const subject = h1.replace(/\s+(Stats & Game Log|Roster & Stats)$/i, "").trim();
  if (typeOf(path) !== "hub" && subject && title && !title.toLowerCase().includes(subject.toLowerCase().slice(0, 40))) {
    problems.push(`title doesn't name "${subject}"`);
  }
  return { path, status: 200, ms, title, h1, canonical, robots, textLen, problems };
}

async function pool(items, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const item = items[i++];
      out.push(await fn(item));
      await new Promise((r) => setTimeout(r, 100));
    }
  }));
  return out;
}

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

async function main() {
  if (ONE_URL) {
    console.log(JSON.stringify(await audit(ONE_URL), null, 2));
    return;
  }
  console.log(`SEO audit of ${BASE} as Googlebot\n`);
  const robots = await get("/robots.txt", "follow");
  console.log(`robots.txt: ${robots.res.status}${/Sitemap:/i.test(robots.text) ? ", lists the sitemap" : ", NO sitemap line"}`);

  const paths = await sitemapPaths();
  const byType = {};
  for (const p of paths) (byType[typeOf(p)] ||= []).push(p);
  console.log(`sitemap: ${paths.length} URLs — ${Object.entries(byType).map(([t, v]) => `${v.length} ${t}`).join(", ")}\n`);

  const sample = Object.entries(byType)
    .filter(([type]) => !ONLY || type === ONLY)
    .flatMap(([, v]) => shuffle(v).slice(0, SAMPLE));
  const results = await pool(sample, audit);
  let failures = 0;
  for (const type of Object.keys(byType).filter((t) => !ONLY || t === ONLY)) {
    const rows = results.filter((r) => typeOf(r.path) === type);
    const bad = rows.filter((r) => r.problems.length);
    failures += bad.length;
    const ms = rows.map((r) => r.ms || 0).sort((a, b) => a - b);
    console.log(`${type.padEnd(12)} ${rows.length - bad.length}/${rows.length} pass   median ${ms[Math.floor(ms.length / 2)] ?? "-"}ms`);
    for (const r of bad.slice(0, 8)) console.log(`   ✗ ${r.path}\n       ${r.problems.join("; ")}`);
    if (bad.length > 8) console.log(`   … and ${bad.length - 8} more`);
  }
  console.log(`\n${failures ? `FAIL: ${failures} of ${results.length} sampled URLs have problems` : `PASS: all ${results.length} sampled URLs are indexable`}`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
