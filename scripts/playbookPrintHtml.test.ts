// Run with: npx tsx --test scripts/playbookPrintHtml.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildPlaybookHtml } from "../client/src/lib/playbookPrintHtml";

const css = ".pb{color:red}";

test("the title and club are escaped in the page, title tag and footer", () => {
  const html = buildPlaybookHtml("<p>plays</p>", `<script>alert(1)</script> "Kings"`, css, { teamName: `A&B <i>Club</i>`, season: "2026/27" });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("<i>Club</i>"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("quotes and newlines can't break out of the CSS footer text", () => {
  const html = buildPlaybookHtml("", `x"; } body{display:none} /*`, css, { teamName: "Line one\nLine two" });
  const footer = html.match(/@bottom-center\{content:"([^]*?)";font/);
  assert.ok(footer, "footer rule present");
  assert.ok(!footer![1].includes("\n"));
  assert.ok(!/(^|[^\\])"/.test(footer![1]), "every quote in the footer text is escaped");
});

test("only http(s) origins become a logo link", () => {
  assert.ok(buildPlaybookHtml("", "T", css, { siteOrigin: "https://swishassistant.com" }).includes("https://swishassistant.com/icon-512.png"));
  assert.ok(!buildPlaybookHtml("", "T", css, { siteOrigin: "javascript:alert(1)" }).includes("icon-512.png"));
  assert.ok(!buildPlaybookHtml("", "T", css, { siteOrigin: "not a url" }).includes("icon-512.png"));
});

test("a bad brand colour falls back instead of reaching the stylesheet", () => {
  const html = buildPlaybookHtml("", "T", css, { brandColor: "red; } body{display:none}" });
  assert.ok(!html.includes("display:none}") || html.includes(".pb-head p"));
  assert.match(html, /--ch-accent:#[0-9a-fA-F]{6}/);
});

test("the controls are hidden and the intro, written for the screen, is left out", () => {
  const html = buildPlaybookHtml("", "T", css);
  assert.match(html, /\.pb-head p,\.pb-nav,\.pb-play-btn[^{]*\{display:none!important\}/);
});
