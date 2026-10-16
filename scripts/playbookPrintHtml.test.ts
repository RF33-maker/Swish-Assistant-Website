// Run with: npx tsx --test scripts/playbookPrintHtml.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildPlaybookHtml } from "../client/src/lib/playbookPrintHtml";
import { contrastRatio } from "../client/src/lib/brandColor";

const css = ".pb{color:red}";
const varOf = (html: string, name: string) => html.match(new RegExp(`--${name}:(#[0-9a-f]{6})`))?.[1];

test("the title and club are escaped in the page, title tag and footer", () => {
  const html = buildPlaybookHtml("<p>plays</p>", `<script>alert(1)</script> "Kings"`, css, { teamName: `A&B <i>Club</i>`, season: "2026/27" });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("<i>Club</i>"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("section titles in the contents are escaped", () => {
  const html = buildPlaybookHtml("", "T", css, { contents: [{ title: "<b>Zone</b>", sub: `"x"`, plays: 2, calls: 0 }] });
  assert.ok(!html.includes("<b>Zone</b>"));
  assert.match(html, /&lt;b&gt;Zone&lt;\/b&gt;/);
  assert.match(html, /2 plays/);
});

test("quotes and newlines can't break out of the CSS header and footer text", () => {
  const html = buildPlaybookHtml("", `x"; } body{display:none} /*`, css, { teamName: "Line one\nLine two\" } body{display:none}", season: `26"</style>` });
  for (const box of ["top-left", "top-right", "bottom-center"]) {
    const text = html.match(new RegExp(`@${box}\\{content:"([^]*?)";font`));
    assert.ok(text, `${box} rule present`);
    assert.ok(!text![1].includes("\n"));
    assert.ok(!/(^|[^\\])"/.test(text![1]), `every quote in the ${box} text is escaped`);
    assert.ok(!text![1].includes("<"), `no "<" in the ${box} text`);
  }
});

test("only http(s) origins become a logo link", () => {
  assert.ok(buildPlaybookHtml("", "T", css, { siteOrigin: "https://swishassistant.com" }).includes("https://swishassistant.com/icon-512.png"));
  assert.ok(!buildPlaybookHtml("", "T", css, { siteOrigin: "javascript:alert(1)" }).includes("icon-512.png"));
  assert.ok(!buildPlaybookHtml("", "T", css, { siteOrigin: "not a url" }).includes("icon-512.png"));
});

test("an http(s) crest goes on the cover and the page header", () => {
  const url = "https://example.supabase.co/storage/v1/object/public/team-logos/kings.png";
  const html = buildPlaybookHtml("", "T", css, { teamName: "Kings", crestUrl: url });
  assert.ok(html.includes(`<img src="${url}" alt="Kings">`));
  assert.ok(html.includes(`background:url("${url}") no-repeat`));
});

test("a crest that isn't http(s) is dropped and the club's initials stand in", () => {
  for (const crestUrl of ["javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "not a url", "//evil.test/x.png"]) {
    const html = buildPlaybookHtml("", "T", css, { teamName: "Gloucester City Kings", crestUrl });
    assert.ok(!html.includes("alert(1)") && !html.includes("evil.test"), crestUrl);
    assert.ok(!/@top-left\{[^}]*url\(/.test(html), "no crest in the header");
    assert.match(html, /class="cv-crest mono">GC</);
  }
});

test("a crest link can't leave its CSS url() or attribute", () => {
  const html = buildPlaybookHtml("", "T", css, { teamName: "K", crestUrl: `https://x.test/a.png") } body{display:none} /*"<b>` });
  const inCss = html.match(/background:url\("([^"]*)"\) no-repeat left center\/16px/);
  assert.ok(inCss, "the url() is still closed where the builder closes it");
  assert.ok(!/[\s<>"\\]/.test(inCss![1]));
  assert.ok(!html.includes(`"<b>`), "the link's own markup is encoded, not written out");
  assert.ok(html.includes("%3Cb%3E"));
});

test("initials skip symbols, and with no club the Swish Assistant mark stands in", () => {
  assert.match(buildPlaybookHtml("", "Stagger & Horns", css, {}), /class="cv-crest mono">SH</);
  assert.match(buildPlaybookHtml("", "Stagger & Horns", css, { siteOrigin: "https://swishassistant.com" }), /class="cv-crest"><img src="https:\/\/swishassistant\.com\/icon-512\.png"/);
});

test("a bad brand colour falls back to the Swish Assistant orange instead of reaching the stylesheet", () => {
  const html = buildPlaybookHtml("", "T", css, { brandColor: "red; } body{display:none}" });
  assert.ok(!html.includes("body{display:none}"));
  assert.equal(varOf(html, "brand"), "#f97316");
  assert.match(html, /--ch-accent:#[0-9a-f]{6}/);
});

test("ink stays readable on white paper whatever the club colour", () => {
  for (const brandColor of ["#f2c230", "#53d4c0", "#ffffff", "#0b1f3a", "rgb(249, 115, 22)"]) {
    const ink = varOf(buildPlaybookHtml("", "T", css, { brandColor }), "ink-b")!;
    assert.ok(contrastRatio(ink, "#ffffff") >= 4.5, `${brandColor} -> ${ink}`);
  }
  // A dark club keeps its own colour as ink.
  assert.equal(varOf(buildPlaybookHtml("", "T", css, { brandColor: "#0b1f3a" }), "ink-b"), "#0b1f3a");
});

test("the second colour is the accent, and the ink when the first can't be read", () => {
  const yellowNavy = buildPlaybookHtml("", "T", css, { brandColor: "#f2c230", secondaryColor: "#13294b" });
  assert.equal(varOf(yellowNavy, "accent"), "#13294b");
  assert.equal(varOf(yellowNavy, "ink-b"), "#13294b");
  // Too close to the first to tell apart: a shade of the first stands in.
  const tooClose = buildPlaybookHtml("", "T", css, { brandColor: "#f2c230", secondaryColor: "#f0c434" });
  assert.notEqual(varOf(tooClose, "accent"), "#f0c434");
  assert.notEqual(varOf(tooClose, "ink-b"), "#f0c434");
  // Not a colour at all.
  assert.ok(!buildPlaybookHtml("", "T", css, { brandColor: "#0b1f3a", secondaryColor: "gold; } x{" }).includes("gold"));
});

test("the controls are hidden and the engine's own header gives way to the cover", () => {
  const html = buildPlaybookHtml("", "T", css);
  assert.match(html, /\.pb-head,\.pb-nav,\.pb-play-btn[^{]*\{display:none!important\}/);
  assert.match(html, /<header class="cover">/);
});
