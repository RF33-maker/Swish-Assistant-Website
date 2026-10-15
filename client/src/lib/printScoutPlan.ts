/**
 * A printable scouting report, for saving as a PDF from the browser's print
 * dialog. Admin-only for now, while the report is tested.
 *
 * Built as a plain HTML string and opened in its own window, so it prints on
 * its own and does not drag the Coaches Hub page around with it. Everything
 * that comes from the plan or the data is escaped, and links are only ever
 * http(s). The layout is made for A4: a branded cover with both crests, the
 * opponent's numbers at a glance, the plan as numbered cards, then the roster
 * and each player's strengths and weaknesses with their headshots. Cards never
 * split across a page, and a footer carries the page number.
 */

import { describeStanding, ordinalOf, type Aspect, type Headshot, type ScoutRoster } from "../../../shared/scoutRoster";
import { playerNameKey } from "../../../shared/playerNameKey";

export interface PrintablePlan {
  headline: string;
  summary: string;
  howTheyPlay: string;
  defendingThem: { summary: string; keys: Array<{ call: string; why: string }> };
  attackingThem: { summary: string; keys: Array<{ call: string; why: string }> };
  playersToStop: Array<{ name: string; threat: string; plan: string }>;
  lineupsAndRotation: { summary: string; watchFor: string[] };
  lateGame: string;
  gamePlan: Array<{ call: string; why: string; target: string }>;
  confidence: string;
  confidenceReason: string;
}

/** The roster endpoint's response, as far as the printout needs it. */
export interface PrintableRoster extends ScoutRoster {
  leagueName: string | null;
  logos: { opponent: string | null; forTeam: string | null };
  season?: { label: string; wholeSeason: boolean; games: number; competitions: Array<{ name: string; games: number }> };
}

/** The headline numbers the agent keeps with a report. */
export interface PrintableTeaser {
  record?: string | null;
  gamesAnalysed?: number | null;
  keyNumbers?: Array<{ key: string; value: number | null; rank: number | null; of: number | null }>;
}

export interface PrintableMeta {
  opponentName: string;
  forTeamName?: string | null;
  competitionName?: string | null;
  gamesAnalysed?: number | null;
  dataThrough?: string | null;
  generatedAt?: string | null;
  brandColor?: string;
  /** Roster table, league-percentile profiles, headshots and club crests; left out when not loaded. */
  roster?: PrintableRoster | null;
  teaser?: PrintableTeaser | null;
}

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** The team colour as #rrggbb. Accepts hex or rgb(); anything else falls back to navy. */
export function toHexColor(value: string | undefined): string {
  const fallback = "#0b3c78";
  const v = (value || "").trim();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    return `#${h.toLowerCase()}`;
  }
  const rgb = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return fallback;
}

/** White or near-black text, whichever reads on the colour. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.5 ? "#101623" : "#ffffff";
}

/** Text for a CSS string: anything that could end the string, the rule or the style block is removed or escaped. */
const cssText = (value: string): string =>
  value.replace(/[\\"<>{}\n\r]/g, " ").replace(/[^\x20-\x7e]/g, (c) => `\\${c.codePointAt(0)!.toString(16)} `);

// Links are only ever http(s); crests and headshots are linked, not embedded.
const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : "");

const BUCKET_MARKER = "/storage/v1/object/public/player-photos/";
/** The 192px face-framed thumbnail beside a player-photos file, or "" when the URL isn't one. */
function thumbOf(url: string): string {
  if (!url.includes(BUCKET_MARKER)) return "";
  const [base, query] = url.split("?");
  if (/\.(thumb|web)\.webp$/i.test(base)) return "";
  const dot = base.lastIndexOf(".");
  if (dot <= base.lastIndexOf("/")) return "";
  return `${base.slice(0, dot)}.thumb.webp${query ? `?${query}` : ""}`;
}

/** A headshot tile: the face-framed thumbnail, falling back to the original, then to initials. */
function headshot(photo: Headshot | null | undefined, name: string, shirt: string | null | undefined, cls: string): string {
  const url = safeUrl(photo?.url);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const badge = shirt ? `<i class="num">${esc(shirt)}</i>` : "";
  if (!url) return `<span class="hs ${cls} blank"><b>${esc(shirt || initials)}</b></span>`;
  const thumb = safeUrl(thumbOf(url)) || url;
  const focus = photo?.focusY != null ? Math.max(0, Math.min(100, Number(photo.focusY))) : 12;
  return `<span class="hs ${cls}"><img src="${esc(thumb)}" alt="${esc(name)}" style="object-position:50% ${focus}%" onerror="if(this.src!==this.dataset.o){this.src=this.dataset.o}else{this.remove()}" data-o="${esc(url)}">${badge}</span>`;
}

const day = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const KEY_LABELS: Record<string, string> = {
  pace: "Pace", offRating: "Off. rating", defRating: "Def. rating", efgPct: "eFG%", tovPct: "Turnover %", threeRate: "3PA rate",
};

function aspectHtml(a: Aspect, kind: "up" | "down"): string {
  return `<li><span class="mk ${kind}">${kind === "up" ? "+" : "&minus;"}</span><div><p class="aspect">${esc(a.label)}</p><p class="val">${esc(a.text)}</p>
<div class="pbar"><span class="track"><span class="fill ${kind}" style="width:${Math.max(a.percentile, 3)}%"></span></span><b>${ordinalOf(a.percentile)} percentile</b></div>
<p class="gloss"><span class="tier ${kind}">${esc(a.tier)}</span> ${esc(describeStanding(a))}</p></div></li>`;
}

const dash = (v: number | null) => (v == null ? "&ndash;" : String(v));

function rosterSection(r: PrintableRoster, opponentName: string): string {
  const rows = r.roster
    .map((p) => `<tr class="${p.profiled ? "" : "dim"}"><td class="who"><span class="rowhs">${headshot(p.photo, p.name, null, "xs")}</span>${esc(p.name)}</td><td class="c">${esc(p.shirt ?? "")}</td><td>${p.gp}</td><td>${p.mpg}</td><td class="b">${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.tov}</td><td>${dash(p.fgPct)}</td><td>${dash(p.threePct)}</td><td>${dash(p.ftPct)}</td></tr>`)
    .join("");
  return `<section class="newpage"><h2><span>Roster</span>${esc(opponentName)}</h2>
${seasonNote(r)}
<table class="roster"><thead><tr><th class="who">Player</th><th class="c">#</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>${rows}</tbody></table>
<p class="fine">Per-game averages from the box score${r.season ? `, ${esc(r.season.label)} season, all competitions` : ""}. Bold names are profiled on the next pages.</p></section>`;
}

function seasonNote(r: PrintableRoster): string {
  const s = r.season;
  if (!s || !s.wholeSeason || s.competitions.length === 0) return "";
  const where = s.competitions.map((c) => `${esc(c.name)} ${c.games}`).join(" &middot; ");
  return `<p class="season"><b>${s.games} game${s.games === 1 ? "" : "s"} this season</b>${s.competitions.length > 1 ? ", counted across every competition" : ""}: ${where}. Player numbers and percentiles use all of them.</p>`;
}

function profilesSection(r: PrintableRoster): string {
  if (!r.profiles.length) return "";
  const [lo, hi] = r.poolRange;
  const cards = r.profiles
    .map((p) => `<article class="pro"><header>${headshot(p.photo, p.name, p.shirt, "lg")}<div><h3>${esc(p.name)}</h3><p class="line">${p.mpg} min &middot; ${p.pts} pts &middot; ${p.reb} reb &middot; ${p.ast} ast &middot; ${p.gp} games</p></div></header>
<div class="two"><div><h4>Strengths</h4><ul class="aspects">${p.strengths.map((a) => aspectHtml(a, "up")).join("") || '<li class="none">No league-level strength yet in this sample.</li>'}${p.strengths.length > 0 && p.strengths.length < 3 ? `<li class="none">Only ${p.strengths.length} area${p.strengths.length === 1 ? "" : "s"} above the 60th percentile.</li>` : ""}</ul></div>
<div><h4>Weaknesses</h4><ul class="aspects">${p.weaknesses.map((a) => aspectHtml(a, "down")).join("") || '<li class="none">No league-level weakness yet in this sample.</li>'}${p.weaknesses.length > 0 && p.weaknesses.length < 3 ? `<li class="none">Only ${p.weaknesses.length} area${p.weaknesses.length === 1 ? "" : "s"} below the 40th percentile.</li>` : ""}</ul></div></div></article>`)
    .join("");
  return `<section><h2><span>Players</span>Strengths and weaknesses</h2>
<div class="guide"><h3>How to read this</h3><p>A percentile counts how many league players this player is ahead of. In a pool of ${r.poolSize}, the 96th percentile means ahead of about ${Math.round(0.96 * (r.poolSize - 1))} of the other ${r.poolSize - 1}, and the 5th means ahead of only about ${Math.round(0.05 * (r.poolSize - 1))}. Shooting percentages have fewer qualifying players (${lo} to ${hi} depending on the stat). A longer bar is always better: green is a strength, red a weakness. For turnovers and fouls the bar already counts fewer as better. Counting stats are compared per 40 minutes. Strengths are above the 60th percentile and weaknesses below the 40th.</p>
<ul class="scale"><li class="s1"><b>90+</b>Elite</li><li class="s2"><b>60&ndash;89</b>Strength</li><li class="s3"><b>40&ndash;59</b>Average, not shown</li><li class="s4"><b>11&ndash;39</b>Weakness</li><li class="s5"><b>0&ndash;10</b>Among the worst</li></ul></div>${cards}</section>`;
}

export function buildPlanHtml(plan: PrintablePlan, meta: PrintableMeta): string {
  const brand = toHexColor(meta.brandColor);
  const onBrand = readableOn(brand);
  const myCrest = safeUrl(meta.roster?.logos.forTeam);
  const oppCrest = safeUrl(meta.roster?.logos.opponent);
  const crest = (url: string, alt: string) => (url ? `<span class="crest"><img src="${esc(url)}" alt="${esc(alt)}"></span>` : "");
  const title = meta.forTeamName ? `${meta.forTeamName} v ${meta.opponentName}` : `Scouting report: ${meta.opponentName}`;
  const competition = meta.competitionName || meta.roster?.leagueName || "";
  const season = meta.roster?.season;

  // The roster's photos, to put a face on "players to stop".
  const photoByName = new Map<string, Headshot>();
  const rosterShirt = new Map<string, string | null>();
  for (const p of meta.roster?.roster ?? []) {
    const k = playerNameKey(p.name);
    if (k && p.photo) photoByName.set(k, p.photo);
    if (k) rosterShirt.set(k, p.shirt);
  }

  const chips = [
    `<span class="chip solid">Game plan</span>`,
    season?.wholeSeason && season.games
      ? `<span class="chip">${season.games} game${season.games === 1 ? "" : "s"} analysed, ${season.competitions.length > 1 ? `${season.competitions.length} competitions` : esc(season.competitions[0]?.name || "this season")}</span>`
      : meta.gamesAnalysed ? `<span class="chip">${meta.gamesAnalysed} games analysed${meta.dataThrough ? `, through ${esc(day(meta.dataThrough))}` : ""}</span>` : "",
    `<span class="chip">Confidence: ${esc(plan.confidence)}</span>`,
    meta.generatedAt ? `<span class="chip">Built ${esc(day(meta.generatedAt))}</span>` : "",
  ].filter(Boolean).join("");

  const numbers = (meta.teaser?.keyNumbers ?? []).filter((k) => k.value != null);
  const glance = numbers.length || meta.teaser?.record
    ? `<section class="glance"><h2 class="mini">${esc(meta.opponentName)} at a glance</h2><div class="tiles">
${meta.teaser?.record ? `<div class="tile"><b>${esc(meta.teaser.record)}</b><span>Record</span><i>${meta.teaser.gamesAnalysed ?? ""} games</i></div>` : ""}
${numbers.slice(0, 5).map((k) => {
  const ofN = k.of ?? 0;
  // Pace and three-point rate are styles, not strengths, so they stay neutral.
  const tone = k.rank && ofN && k.key !== "pace" && k.key !== "threeRate" ? (k.rank <= Math.ceil(ofN / 3) ? "up" : k.rank > ofN - Math.ceil(ofN / 3) ? "down" : "mid") : "mid";
  return `<div class="tile"><b>${esc(k.value)}</b><span>${esc(KEY_LABELS[k.key] || k.key)}</span><i class="${tone}">${k.rank && ofN ? `${ordinalOf(k.rank)} of ${ofN}` : "&nbsp;"}</i></div>`;
}).join("")}
</div></section>`
    : "";

  const keys = (list: Array<{ call: string; why: string }>) =>
    list.map((k) => `<li><p class="call">${esc(k.call)}</p><p class="why">${esc(k.why)}</p></li>`).join("");
  const stops = plan.playersToStop
    .map((p) => {
      const k = playerNameKey(p.name);
      return `<article class="stop">${headshot(photoByName.get(k) ?? null, p.name, rosterShirt.get(k) ?? null, "md")}<div><h3>${esc(p.name)}</h3><p><b>Threat</b> ${esc(p.threat)}</p><p><b>Plan</b> ${esc(p.plan)}</p></div></article>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{--brand:${brand};--on:${onBrand};--ink:#141a26;--muted:#586277;--line:#dfe4ed;--soft:#f4f6fa;--good:#17794a;--bad:#b3261e;--goodsoft:#e4f4ec;--badsoft:#fbe9e7;--disp:"Barlow Condensed","Arial Narrow",Arial,sans-serif;--body:"Inter",-apple-system,"Segoe UI",Arial,sans-serif}
  @page{size:A4;margin:13mm 12mm 17mm;
    @bottom-left{content:"${cssText(competition ? `${title}  \u00b7  ${competition}` : title)}";font:8.5px var(--body);color:#7b8496}
    @bottom-right{content:"Page " counter(page) " of " counter(pages);font:8.5px var(--body);color:#7b8496}}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html{font-size:13px}
  body{font:1rem/1.55 var(--body);color:var(--ink);margin:0;max-width:186mm}
  h1,h2,h3,h4,p,ul,ol{margin:0}ul,ol{padding:0;list-style:none}
  .cover{background:var(--brand);color:var(--on);border-radius:10px;padding:16px 20px 15px;border-bottom:5px solid rgba(255,255,255,.4)}
  .eyebrow{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;font-weight:600;opacity:.85}
  .match{display:flex;align-items:center;gap:14px;margin:9px 0 10px}
  .match h1{font:700 2.3rem/1 var(--disp);text-transform:uppercase;letter-spacing:.01em;flex:1;min-width:0}
  .crest{flex:none;width:62px;height:62px;background:#fff;border-radius:13px;padding:7px;display:flex;align-items:center;justify-content:center}
  .crest img{width:100%;height:100%;object-fit:contain}
  .chips{display:flex;flex-wrap:wrap;gap:6px}
  .chip{font-size:.72rem;font-weight:600;padding:2px 9px;border-radius:99px;border:1px solid color-mix(in srgb,var(--on) 45%,transparent)}
  .chip.solid{background:var(--on);color:var(--brand);border-color:var(--on);text-transform:uppercase;letter-spacing:.06em}
  .headline{font:700 1.65rem/1.15 var(--disp);margin:15px 0 6px}
  .summary{color:#2c3446;font-size:1.02rem}
  h2{font:700 1.45rem/1.1 var(--disp);text-transform:uppercase;letter-spacing:.015em;margin:20px 0 9px;padding-bottom:5px;border-bottom:2px solid var(--line);display:flex;align-items:baseline;gap:10px;break-after:avoid}
  h2 span{font:600 .62rem/1 var(--body);letter-spacing:.14em;color:var(--on);background:var(--brand);padding:3px 7px;border-radius:4px}
  h2.mini{font-size:1.05rem;margin:16px 0 7px;border:0;padding:0;color:var(--muted)}
  h3{font:700 1.15rem/1.15 var(--disp)}
  .tiles{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}
  .tile{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:8px 9px;display:flex;flex-direction:column;break-inside:avoid}
  .tile b{font:700 1.5rem/1 var(--disp)}.tile span{font-size:.68rem;color:var(--muted);font-weight:600;margin-top:2px}
  .tile i{font-style:normal;font-size:.66rem;font-weight:700;margin-top:3px;color:var(--muted)}.tile i.up{color:var(--good)}.tile i.down{color:var(--bad)}
  .plan{display:grid;gap:8px}
  .plan li{display:grid;grid-template-columns:34px 1fr;gap:11px;border:1px solid var(--line);border-radius:9px;padding:10px 12px;break-inside:avoid}
  .n{width:30px;height:30px;border-radius:50%;background:var(--brand);color:var(--on);font:700 1.15rem/30px var(--disp);text-align:center}
  .call{font-weight:700}.why{color:var(--muted);margin-top:1px}
  .target{margin-top:6px;display:inline-block;background:var(--soft);border-left:3px solid var(--brand);border-radius:0 5px 5px 0;padding:3px 9px;font-size:.88rem}
  .target b{font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-right:6px}
  .panel{background:var(--soft);border:1px solid var(--line);border-radius:9px;padding:10px 13px;break-inside:avoid}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .col h3{padding-left:9px;border-left:4px solid var(--brand);margin-bottom:5px}
  .keys li{padding:6px 0;border-top:1px solid var(--line);break-inside:avoid}
  .stops{display:grid;grid-template-columns:1fr 1fr;gap:9px}
  .stop{display:flex;gap:11px;border:1px solid var(--line);border-radius:9px;padding:10px 12px;break-inside:avoid}
  .stop p{margin-top:3px;font-size:.92rem}.stop p b{font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-right:5px}
  .hs{position:relative;flex:none;display:inline-block;border-radius:10px;background:color-mix(in srgb,var(--brand) 14%,#fff);overflow:visible}
  .hs img{width:100%;height:100%;object-fit:cover;border-radius:10px;display:block}
  .hs.blank{display:flex;align-items:center;justify-content:center;background:var(--brand);color:var(--on)}.hs.blank b{font:700 1.15em/1 var(--disp)}
  .hs.lg{width:52px;height:52px}.hs.lg.blank{font-size:1.4rem}.hs.md{width:46px;height:46px}.hs.md.blank{font-size:1.25rem}.hs.xs{width:22px;height:22px;border-radius:50%}.hs.xs img{border-radius:50%}.hs.xs.blank{font-size:.62rem}
  .hs .num{position:absolute;right:-5px;bottom:-5px;min-width:17px;height:17px;border-radius:5px;background:var(--brand);color:var(--on);font:700 .72rem/17px var(--disp);text-align:center;font-style:normal;box-shadow:0 0 0 2px #fff;padding:0 3px}
  .newpage{break-before:page}
  .season{background:var(--soft);border-left:3px solid var(--brand);border-radius:0 7px 7px 0;padding:7px 11px;font-size:.88rem;color:#2c3446;margin-bottom:9px;break-inside:avoid}
  table{width:100%;border-collapse:collapse;font-size:.9rem;font-variant-numeric:tabular-nums}
  th,td{padding:5px 6px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
  thead th{font-size:.62rem;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);background:var(--soft)}
  td.who,th.who{text-align:left}.c{text-align:center}td.who{font-weight:700;display:flex;align-items:center;gap:8px;border-bottom:0}td.b{font-weight:700}
  tbody tr{break-inside:avoid;border-bottom:1px solid var(--line)}tbody tr:nth-child(even){background:#fafbfd}
  tr.dim td{color:var(--muted)}tr.dim td.who{font-weight:400}.rowhs{display:inline-flex}
  table.roster td{vertical-align:middle}
  .fine{font-size:.78rem;color:var(--muted);margin-top:6px}
  .guide{border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:8px;padding:9px 13px;margin:2px 0 11px;break-inside:avoid}
  .guide h3{margin-bottom:3px}.guide p{font-size:.86rem;color:var(--muted)}
  .scale{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px}
  .scale li{background:var(--soft);border-radius:6px;padding:5px 7px;font-size:.72rem;color:var(--muted);border-bottom:3px solid var(--line)}.scale b{display:block;color:var(--ink);font-size:.82rem}
  .scale .s1,.scale .s2{border-bottom-color:var(--good)}.scale .s4,.scale .s5{border-bottom-color:var(--bad)}
  .pro{border:1px solid var(--line);border-radius:10px;padding:11px 14px;margin:0 0 10px;break-inside:avoid}
  .pro>header{display:flex;align-items:center;gap:12px;margin-bottom:9px}.line{color:var(--muted);font-size:.85rem}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  h4{font:600 .62rem/1 var(--body);letter-spacing:.11em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
  .aspects li{display:grid;grid-template-columns:18px 1fr;gap:8px;margin-bottom:8px}.aspects li.none{display:block;color:var(--muted);font-style:italic;font-size:.82rem}
  .mk{width:17px;height:17px;border-radius:50%;font:700 .85rem/17px var(--body);text-align:center}.mk.up{background:var(--goodsoft);color:var(--good)}.mk.down{background:var(--badsoft);color:var(--bad)}
  .aspect{font-weight:700;font-size:.92rem}.val{color:var(--muted);font-size:.85rem}.gloss{font-size:.74rem;color:var(--muted);margin-top:1px}
  .pbar{display:flex;align-items:center;gap:7px;margin-top:3px}.track{flex:1;height:5px;border-radius:9px;background:#e1e5ec;overflow:hidden}.fill{display:block;height:100%;border-radius:9px}.fill.up{background:var(--good)}.fill.down{background:var(--bad)}.pbar b{font-size:.72rem;white-space:nowrap}
  .tier{font-weight:700}.tier.up{color:var(--good)}.tier.down{color:var(--bad)}
  .closing{margin-top:20px;padding-top:9px;border-top:1px solid var(--line);color:var(--muted);font-size:.82rem;break-inside:avoid}
  .watch li{padding:5px 0 5px 11px;border-left:3px solid var(--line);margin-bottom:5px;break-inside:avoid}
</style></head><body>
<div class="cover"><div class="eyebrow">${meta.forTeamName ? `${esc(meta.forTeamName)} scouting report` : "Scouting report"}${competition ? ` &middot; ${esc(competition)}` : ""}${season && !competition.includes(season.label) ? ` &middot; ${esc(season.label)}` : ""}</div>
<div class="match">${meta.forTeamName ? crest(myCrest, meta.forTeamName) : ""}<h1>${esc(title)}</h1>${crest(oppCrest, meta.opponentName)}</div>
<div class="chips">${chips}</div></div>
<p class="headline">${esc(plan.headline)}</p><p class="summary">${esc(plan.summary)}</p>
${glance}
<h2><span>01</span>Game plan</h2><ol class="plan">${plan.gamePlan
    .map((g, i) => `<li><div class="n">${i + 1}</div><div><p class="call">${esc(g.call)}</p><p class="why">${esc(g.why)}</p><p class="target"><b>Target</b>${esc(g.target)}</p></div></li>`)
    .join("")}</ol>
<h2><span>02</span>How ${esc(meta.opponentName)} play</h2><div class="panel"><p>${esc(plan.howTheyPlay)}</p></div>
<div class="cols"><div class="col"><h2><span>03</span>Defending them</h2><p>${esc(plan.defendingThem.summary)}</p><ul class="keys">${keys(plan.defendingThem.keys)}</ul></div>
<div class="col"><h2><span>04</span>Attacking them</h2><p>${esc(plan.attackingThem.summary)}</p><ul class="keys">${keys(plan.attackingThem.keys)}</ul></div></div>
<h2><span>05</span>Players to stop</h2><div class="stops">${stops}</div>
<h2><span>06</span>Lineups and rotation</h2><div class="panel"><p>${esc(plan.lineupsAndRotation.summary)}</p></div><ul class="watch" style="margin-top:8px">${plan.lineupsAndRotation.watchFor.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
<h2><span>07</span>Late game</h2><div class="panel"><p>${esc(plan.lateGame)}</p></div>
${meta.roster && meta.roster.roster.length ? rosterSection(meta.roster, meta.opponentName) : ""}
${meta.roster ? profilesSection(meta.roster) : ""}
<p class="closing"><strong>Confidence: ${esc(plan.confidence)}.</strong> ${esc(plan.confidenceReason)}</p>
</body></html>`;
}

/** Opens the printable report in a new window and starts the print dialog once fonts and pictures are in. Returns false if the browser blocked the window. */
export function printScoutPlan(plan: PrintablePlan, meta: PrintableMeta): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(buildPlanHtml(plan, meta));
  win.document.close();
  win.focus();
  const pictures = Array.from(win.document.images).map((img) =>
    img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve(); }),
  );
  const ready = Promise.all([win.document.fonts?.ready ?? Promise.resolve(), ...pictures]);
  // Never wait long: a slow picture should not stop the report printing.
  Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 6000))]).then(() => setTimeout(() => win.print(), 200));
  return true;
}
