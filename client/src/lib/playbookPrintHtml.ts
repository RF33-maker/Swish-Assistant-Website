/**
 * The printable playbook page, as a string. Pure (no DOM, no CSS import) so it
 * can be tested on its own; printPlaybook.ts supplies the engine's markup and
 * stylesheet and opens the window.
 *
 * Branded like the scouting report (printScoutPlan.ts): page one opens on a
 * band in the club's colour with its crest, then what the playbook holds and
 * the diagram key. Ink in the club's colours is checked against the white page
 * (brandColor.ts), so a yellow club never prints yellow text. Every page carries
 * the club's crest at the top and the Swish Assistant footer at the bottom.
 */

import { brandInk, contrastRatio, mixHex, parseHexColor, readableOn, secondColor } from "./brandColor";

export interface PrintablePlaybookMeta {
  /** The club, on the cover and in the page header and footer. */
  teamName?: string | null;
  /** "2026/27". */
  season?: string | null;
  /** The club's colour. Falls back to the Swish Assistant orange. */
  brandColor?: string | null;
  /** The club's second colour. Missing, or too close to the first, and a shade of the first stands in. */
  secondaryColor?: string | null;
  /** The club's crest (team logos table or storage). Missing, and the club's initials stand in. */
  crestUrl?: string | null;
  /** What the playbook holds, in order, for the contents on page one. */
  contents?: Array<{ title: string; sub?: string | null; plays: number; calls: number }> | null;
  /** When the PDF was made (ISO), printed on the cover. */
  printedAt?: string | null;
  /** Where the site is served from. The print window is about:blank, so the logo needs an absolute link. */
  siteOrigin?: string | null;
}

/** The Swish Assistant orange, for a playbook with no club colour. */
const SWISH_ORANGE = "#f97316";

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

/**
 * An http(s) link, as the URL parser writes it out (quotes, spaces and angle
 * brackets percent-encoded), or "" for anything else. The crest sits in an
 * attribute and in a CSS url("..."), so anything that could end either is refused.
 */
function safeUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return /["'\\<>\s]/.test(u.href) ? "" : u.href;
  } catch {
    return "";
  }
}

// Words that start with a letter or digit, so "Stagger & Horns" reads SH, not S&.
const initialsOf = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z0-9\u00c0-\u024f]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

const day = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// A half court in the club's lettering colour, faint behind the cover title.
const COURT = `<svg class="cv-court" viewBox="0 0 240 200" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4"><path d="M92,0 L92,98 L148,98 L148,0"/><path d="M92,98 A28,28 0 0 0 148,98"/><path d="M92,98 A28,28 0 0 1 148,98" stroke-dasharray="5 5"/><path d="M18,0 L18,52 A104,104 0 0 0 222,52 L222,0"/><circle cx="120" cy="27" r="7"/></g></svg>`;

export function buildPlaybookHtml(bodyHtml: string, title: string, css: string, meta: PrintablePlaybookMeta = {}): string {
  const brand = parseHexColor(meta.brandColor) ?? SWISH_ORANGE;
  const onBrand = readableOn(brand);
  const second = secondColor(brand, meta.secondaryColor);
  // Ink in the club's colours has to read on white paper: the first colour when
  // it does, else the second (a yellow club's navy), else the first deepened.
  const ink = brandInk(brand, second, "#ffffff");
  const light = onBrand !== "#ffffff";
  const accent = second ?? mixHex(brand, light ? "#000000" : "#ffffff", light ? 0.3 : 0.45);
  const band = light ? mixHex(brand, "#ffffff", 0.24) : mixHex(brand, "#000000", 0.2);
  const tint = mixHex(brand, "#ffffff", 0.93);
  // Rules and bars only need to be seen, not read: the club's colour unless it all but vanishes on white.
  const rule = contrastRatio(brand, "#ffffff") >= 1.6 ? brand : ink;
  const origin = safeOrigin(meta.siteOrigin);
  const logo = origin ? `${origin}/icon-512.png` : "";
  const crest = safeUrl(meta.crestUrl);
  const club = (meta.teamName ?? "").trim();
  const season = (meta.season ?? "").trim();
  const footerTitle = cssText([club, title, season].filter(Boolean).join("  ·  "));
  const headerTitle = cssText(club || title);

  const contents = (meta.contents ?? []).filter((s) => s && (s.title || s.plays || s.calls));
  const plays = contents.reduce((n, s) => n + (s.plays || 0), 0);
  const calls = contents.reduce((n, s) => n + (s.calls || 0), 0);
  const printed = day(meta.printedAt);
  const facts = [
    season ? ["Season", esc(season)] : null,
    contents.length ? ["Sections", String(contents.length)] : null,
    plays ? ["Plays", String(plays)] : null,
    calls ? ["Calls", String(calls)] : null,
    printed ? ["Printed", esc(printed)] : null,
  ].filter((f): f is string[] => !!f).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  // The crest; else the club's initials; with no club at all, the Swish Assistant mark.
  const mark = crest
    ? `<span class="cv-crest"><img src="${esc(crest)}" alt="${esc(club)}"></span>`
    : club || !logo
      ? `<span class="cv-crest mono">${esc(initialsOf(club || title) || "PB")}</span>`
      : `<span class="cv-crest"><img src="${logo}" alt="Swish Assistant"></span>`;
  const cover = `<header class="cover"><div class="cv-in">${COURT}${mark}<div class="cv-text">
<p class="cv-kick">${club ? `${esc(club)} <i>&middot;</i> ` : ""}Playbook</p><h1>${esc(title)}</h1>${season ? `<p class="cv-season">${esc(season)} season</p>` : ""}</div></div>
${facts ? `<dl class="facts">${facts}</dl>` : ""}<div class="stripe"></div></header>`;

  const toc = contents.length
    ? `<section class="toc"><h2 class="mini">In this playbook</h2><ol>${contents
      .map((s, i) => `<li><b>${String(i + 1).padStart(2, "0")}</b><span><em>${esc(s.title || "Section")}</em>${s.sub ? `<small>${esc(s.sub)}</small>` : ""}</span><i>${[s.plays ? plural(s.plays, "play") : "", s.calls ? plural(s.calls, "call") : ""].filter(Boolean).join(", ")}</i></li>`)
      .join("")}</ol></section>`
    : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc([club, title, season].filter(Boolean).join(" - "))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
/* Print overrides: light paper in the club's colours, no controls, plays kept whole. */
:root{--ch-accent:${ink};--brand:${brand};--on:${onBrand};--ink-b:${ink};--accent:${accent};--band:${band};--tint:${tint};--rule:${rule};
  --ink:#121826;--text:#2b3345;--muted:#5d6779;--faint:#8a93a5;--line:#e3e7ee;--soft:#f5f7fa;
  --disp:"Barlow Condensed","Arial Narrow",Arial,sans-serif;--body:"Inter",-apple-system,"Segoe UI",Arial,sans-serif}
@page{size:A4;margin:15mm 13mm 16mm;
  @top-left{content:"${headerTitle}";font:600 7.5px/1 var(--body);letter-spacing:.12em;text-transform:uppercase;color:#5d6779;${crest ? `background:url("${crest}") no-repeat left center/16px 16px;padding-left:20px;` : ""}}
  @top-right{content:"Playbook${season ? `  ·  ${cssText(season)}` : ""}";font:600 7.5px/1 var(--body);letter-spacing:.12em;text-transform:uppercase;color:#8a93a5}
  @bottom-left{content:"Swish Assistant";font:600 8px/1 var(--body);letter-spacing:.03em;color:#1d2433;${logo ? `background:url("${logo}") no-repeat left center/15px 15px;padding-left:17px;` : ""}}
  @bottom-center{content:"${footerTitle}";font:7.5px/1 var(--body);color:#8a93a5}
  @bottom-right{content:"Page " counter(page) " of " counter(pages);font:500 7.5px/1 var(--body);color:#8a93a5;font-variant-numeric:tabular-nums}}
@page:first{@top-left{content:none;background:none}@top-right{content:none}}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html{font-size:12px}
body{margin:0;background:#fff;max-width:184mm;font:1rem/1.5 var(--body);color:var(--text);font-feature-settings:"cv11","ss01"}

/* Cover: the club's colour and crest, a faint half court behind the title. */
.cover{background:var(--brand);color:var(--on);border-radius:12px;overflow:hidden;break-inside:avoid}
.cv-in{position:relative;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:20px;padding:24px 24px 22px}
.cv-court{position:absolute;right:-18px;top:-26px;height:190px;opacity:.14;pointer-events:none}
.cv-crest{position:relative;width:96px;height:96px;border-radius:18px;background:#fff;display:flex;align-items:center;justify-content:center;padding:9px;box-shadow:0 0 0 3px color-mix(in srgb,var(--on) 16%,transparent)}
.cv-crest img{width:100%;height:100%;object-fit:contain}
.cv-crest.mono{font:700 2.7rem/1 var(--disp);color:var(--ink-b);letter-spacing:.02em}
.cv-text{position:relative;min-width:0}
.cv-kick{margin:0;font:600 .66rem/1.3 var(--body);letter-spacing:.16em;text-transform:uppercase;opacity:.85}
.cv-kick i{font-style:normal;opacity:.6;margin:0 2px}
.cover h1{margin:6px 0 0;font:700 3.15rem/.94 var(--disp);text-transform:uppercase;letter-spacing:.005em;text-wrap:balance;overflow-wrap:anywhere}
.cv-season{display:inline-block;margin:11px 0 0;padding:3px 10px;border-radius:999px;border:1px solid color-mix(in srgb,var(--on) 38%,transparent);font:600 .7rem/1.3 var(--body);letter-spacing:.08em;text-transform:uppercase}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));margin:0;background:var(--band);padding:9px 24px 10px}
.facts div{padding:0 12px;border-left:1px solid color-mix(in srgb,var(--on) 22%,transparent)}.facts div:first-child{padding-left:0;border-left:0}
.facts dt{font:600 .56rem/1.2 var(--body);letter-spacing:.14em;text-transform:uppercase;opacity:.72}
.facts dd{margin:2px 0 0;font:600 .86rem/1.3 var(--body);font-variant-numeric:tabular-nums}
.stripe{height:5px;background:var(--accent)}

/* Small headings and the contents. */
h2.mini{font:600 .64rem/1 var(--body);letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:18px 0 8px;display:flex;align-items:center;gap:10px;break-after:avoid}
h2.mini::after{content:"";flex:1;height:1px;background:var(--line)}
.toc{break-inside:avoid}
.toc ol{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;column-gap:22px;border-top:2px solid var(--ink)}
.toc li{display:grid;grid-template-columns:26px 1fr auto;align-items:baseline;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)}
.toc b{font:700 1.05rem/1 var(--disp);color:var(--ink-b);font-variant-numeric:tabular-nums}
.toc em{font:700 1.08rem/1.1 var(--disp);font-style:normal;text-transform:uppercase;letter-spacing:.02em;color:var(--ink)}
.toc small{margin-left:6px;font-size:.78rem;color:var(--muted)}
.toc i{font-style:normal;font-size:.74rem;font-weight:600;color:var(--muted);white-space:nowrap}

/* The engine's page, on paper. */
.pb{--pb-ink:#0b1220;--pb-ink-2:var(--text);--pb-muted:var(--faint);--pb-line:var(--line);--pb-line-strong:#d3d9e2;--pb-surface:#fff;--pb-surface-2:#fff;
  --pb-court:#fff;--pb-courtline:#b9c1cd;--pb-accent:var(--ink-b);--pb-radius:10px;--pb-display:var(--disp);--pb-body:var(--body);
  font-size:12px;letter-spacing:0;color:var(--text);counter-reset:sec}
/* Block flow rather than flex, so the page breaks can look back for a better place to fall. */
.pb-wrap,.pb-sec{display:block}
.pb-wrap>*+*{margin-top:15px}
.pb-sec>*+*{margin-top:9px}
.pb-head,.pb-nav,.pb-play-btn,.pb-bar,.pb-anim,.pb-hint,.pb-banner,.pb-tools,.pb-edit-only,.pb-copy,.pb-steps,.pb-mini,.pb-row:has(>.pb-play-btn){display:none!important}

/* The diagram key, under the contents. */
.pb-legend{margin-top:-2px;gap:6px 18px;padding:9px 14px;border-radius:9px;background:var(--soft);font-size:.8rem;color:var(--text);break-inside:avoid}
.pb-legend::before{content:"Key";font:700 .58rem/1 var(--body);letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-right:4px}

/* Sections: numbered, condensed, ruled in the club's colour. */
.pb-sec{counter-increment:sec;break-before:auto}
.pb-sec h2{display:flex;align-items:baseline;gap:4px 10px;font:700 1.7rem/1 var(--disp);letter-spacing:.015em;color:var(--ink);padding-bottom:6px;border-bottom:2.5px solid var(--rule);break-after:avoid;margin-top:4px}
.pb-sec h2::before{content:counter(sec,decimal-leading-zero);color:var(--ink-b);font-variant-numeric:tabular-nums;padding-right:10px;border-right:1.5px solid var(--line)}
.pb-sec h2 small{font:500 .86rem/1.3 var(--body);color:var(--muted)}

/* Play cards: a bar in the second colour, a tag in the first, the read, then every step side by side. */
.pb-play{break-inside:avoid;box-shadow:none;border:1px solid var(--line);border-radius:10px;padding:0 0 10px;gap:7px;overflow:hidden}
.pb-play>*{margin-left:13px!important;margin-right:13px!important}
.pb-play-head{margin:0!important;padding:8px 13px 7px;background:var(--tint);border-bottom:1px solid var(--line);box-shadow:inset 4px 0 0 var(--accent);gap:3px 10px;align-items:center}
.pb-tag{font:700 .6rem/1 var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--on);background:var(--brand);padding:4px 7px 3px;border-radius:4px}
.pb-play h3{font:700 1.55rem/1.05 var(--disp);letter-spacing:.02em;color:var(--ink)}
.pb-check{margin-left:auto;font:600 .62rem/1 var(--body);letter-spacing:.06em;text-transform:uppercase;color:#8a5a00;background:#fff;border:1px solid #f0c36d;padding:3px 7px;border-radius:999px}
.pb-check::before{content:"To "}
.pb-play .pb-sub{font-size:.92rem;line-height:1.5;color:var(--text)}
.pb-reads{list-style:none;counter-reset:rd;padding:0;gap:3px;font-size:.9rem;color:var(--text)}
.pb-reads li{counter-increment:rd;display:grid;grid-template-columns:18px 1fr;gap:4px}
.pb-reads li::before{content:counter(rd) ".";font:700 .95rem/1.35 var(--disp);color:var(--ink-b)}
.pb-frames{grid-template-columns:repeat(4,1fr);gap:8px 10px}
.pb-frames figure{break-inside:avoid;gap:4px}
.pb-court svg{border:1px solid #d3d9e2;border-radius:7px;background:#fff;shape-rendering:geometricPrecision}
.pb figcaption{display:grid;grid-template-columns:auto 1fr;align-items:start;gap:6px;font-size:.76rem;line-height:1.35;color:var(--text)}
.pb figcaption b{display:flex;align-items:center;justify-content:center;width:15px;height:15px;margin-top:.5px;border-radius:50%;background:var(--brand);color:var(--on);font:700 .72rem/1 var(--disp)}
.pb figcaption>span:first-child{grid-column:1/-1}
.pb-note{font-size:.84rem;line-height:1.45;color:var(--ink);background:var(--tint);border-left:3px solid var(--rule);border-radius:0 6px 6px 0;padding:6px 10px}

/* Calls tables. */
.pb-two{gap:12px}
.pb-tbl{break-inside:avoid;overflow:visible;border:1px solid var(--line);border-radius:9px}
.pb-tbl table{font-size:.92rem}
.pb-tbl th,.pb-tbl td{padding:6px 11px}
.pb-tbl th{font:700 .58rem/1.25 var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-b);background:var(--tint);border-bottom:2px solid var(--rule)}
.pb-tbl tr{break-inside:avoid}
.pb-tbl tbody tr:nth-child(even){background:#fafbfc}
.pb-tbl td.pb-call{font:700 1.08rem/1.25 var(--disp);letter-spacing:.03em;color:var(--ink)}
.pb-sw{width:10px;height:10px;margin-right:7px}

.colophon{margin-top:14px;padding-top:8px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;font:500 .74rem/1.35 var(--body);color:var(--muted);break-before:avoid;break-inside:avoid}
.colophon img{width:22px;height:22px}
.colophon b{display:block;font:700 .88rem/1.1 var(--disp);letter-spacing:.06em;text-transform:uppercase;color:var(--ink)}
</style></head><body>
${cover}
${toc}
<div class="pb">${bodyHtml}</div>
<footer class="colophon">${logo ? `<img src="${logo}" alt="">` : ""}<div><b>Prepared by Swish Assistant</b>${esc([club, title, season].filter(Boolean).join(" · "))}</div></footer>
</body></html>`;
}
