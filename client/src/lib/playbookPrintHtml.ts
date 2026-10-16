/**
 * The printable playbook page, as a string. Pure (no DOM, no CSS import) so it
 * can be tested on its own; printPlaybook.ts supplies the engine's markup and
 * stylesheet and opens the window.
 */

import { toHexColor } from "./brandColor";

export interface PrintablePlaybookMeta {
  /** The club, shown in the page footer. */
  teamName?: string | null;
  /** "2026/27". */
  season?: string | null;
  /** The club's colour, as the hub's accent. Falls back to the Swish Assistant orange. */
  brandColor?: string | null;
  /** Where the site is served from. The print window is about:blank, so the logo needs an absolute link. */
  siteOrigin?: string | null;
}

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * A string safe to put inside a CSS "..." literal (page-footer text) that sits in a <style>
 * element: quotes and backslashes are escaped, and "<" becomes a CSS escape so "</style>" can't
 * close the element and let the rest through as HTML.
 */
const cssText = (value: string): string =>
  value.replace(/[\\"]/g, "\\$&").replace(/</g, "\\3c ").replace(/[\r\n]+/g, " ");

/** Only http(s) origins: the logo link is written into the page. */
function safeOrigin(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : "";
  } catch {
    return "";
  }
}

export function buildPlaybookHtml(bodyHtml: string, title: string, css: string, meta: PrintablePlaybookMeta = {}): string {
  const accent = toHexColor(meta.brandColor ?? undefined);
  const origin = safeOrigin(meta.siteOrigin);
  const logo = origin ? `${origin}/icon-512.png` : "";
  const club = (meta.teamName ?? "").trim();
  const footerTitle = cssText([club, title, meta.season].filter(Boolean).join("  ·  "));

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc([title, meta.season].filter(Boolean).join(" "))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
/* Print overrides: light paper, no controls, plays kept whole. */
:root{--ch-accent:${accent};--body:"Inter",-apple-system,"Segoe UI",Arial,sans-serif}
@page{size:A4;margin:14mm 13mm 18mm;
  @bottom-left{content:"Swish Assistant";font:600 8px/1 var(--body);letter-spacing:.03em;color:#1d2433;${logo ? `background:url("${logo}") no-repeat left center/15px 15px;padding-left:17px;` : ""}}
  @bottom-center{content:"${footerTitle}";font:7.5px/1 var(--body);color:#8a93a5}
  @bottom-right{content:"Page " counter(page) " of " counter(pages);font:500 7.5px/1 var(--body);color:#8a93a5;font-variant-numeric:tabular-nums}}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
html{font-size:12px}
body{margin:0;background:#fff;max-width:184mm}
.pb{font-size:12px}
.pb-wrap{gap:20px}
.pb-head h1{font-size:40px}
.pb-head p,.pb-nav,.pb-play-btn,.pb-bar,.pb-anim,.pb-hint,.pb-banner,.pb-tools,.pb-edit-only,.pb-copy,.pb-steps,.pb-mini{display:none!important}
.pb-sec{break-before:auto}
.pb-sec h2,.pb-head{break-after:avoid}
.pb-play{break-inside:avoid;box-shadow:none;padding:12px}
.pb-frames{grid-template-columns:repeat(3,1fr);gap:10px}
.pb-frames figure{break-inside:avoid}
.pb-tbl{break-inside:avoid;overflow:visible}
.pb-tbl tr{break-inside:avoid}
.colophon{margin-top:22px;padding-top:10px;border-top:1px solid #e3e7ee;display:flex;align-items:center;gap:9px;font:500 8.5px/1.4 var(--body);color:#5d6779}
.colophon img{width:22px;height:22px;border-radius:5px}
.colophon b{display:block;color:#121826;font-weight:700;font-size:9px}
</style></head><body>
<div class="pb">${bodyHtml}</div>
<footer class="colophon">${logo ? `<img src="${logo}" alt="">` : ""}<div><b>Prepared by Swish Assistant</b>${esc([club, title, meta.season].filter(Boolean).join(" · "))}</div></footer>
</body></html>`;
}

