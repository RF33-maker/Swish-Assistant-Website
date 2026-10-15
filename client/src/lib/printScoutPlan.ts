/**
 * A printable scouting report, for saving as a PDF from the browser's print
 * dialog. Admin-only for now, while the report is tested.
 *
 * Built as a plain HTML string and opened in its own window, so it prints on
 * its own and does not drag the Coaches Hub page around with it. Everything
 * that comes from the plan or the data is escaped, and links are only ever
 * http(s). The layout is made for A4 and branded to the coach's own club: page
 * one is the brief (both crests, the read, the opponent's numbers and the calls
 * with their bench targets), then the plan in full, the roster, and each
 * player's strengths and weaknesses with their headshots. Cards never split
 * across a page, and every page carries the Swish Assistant footer.
 */

import { describeStanding, ordinalOf, type Aspect, type Headshot, type ScoutRoster } from "../../../shared/scoutRoster";
import { playerNameKey } from "../../../shared/playerNameKey";
import { noteKindLabel, type CoachNote } from "../../../shared/coachNotes";
import { brandInk, mixHex, readableOn, secondColor, toHexColor } from "./brandColor";

export { readableOn, toHexColor };

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
  /** The club's second colour. Missing, or too close to the first, and a shade of the first stands in. */
  secondaryColor?: string | null;
  /** Where the site is served from. The print window is about:blank, so the Swish Assistant logo needs an absolute link. */
  siteOrigin?: string | null;
  /** Roster table, league-percentile profiles, headshots and club crests; left out when not loaded. */
  roster?: PrintableRoster | null;
  teaser?: PrintableTeaser | null;
  /** "last 5 games" when the report was read over a window rather than the whole season. */
  windowLabel?: string | null;
  /** The coach's own notes on this opponent, printed so the reader sees what the plan was told. */
  coachNotes?: CoachNote[] | null;
}

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Text for a CSS string: anything that could end the string, the rule or the style block is removed or escaped. */
const cssText = (value: string): string =>
  value.replace(/[\\"<>{}\n\r]/g, " ").replace(/[^\x20-\x7e]/g, (c) => `\\${c.codePointAt(0)!.toString(16)} `);

// Links are only ever http(s); crests and headshots are linked, not embedded.
const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : "");

/** A bare http(s) origin, so it can sit inside a CSS url() and an attribute without escaping. */
const safeOrigin = (o: string | null | undefined) => (o && /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(o) ? o : "");

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

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** A headshot tile: the face-framed thumbnail, falling back to the original, then to initials. */
function headshot(photo: Headshot | null | undefined, name: string, shirt: string | null | undefined, cls: string): string {
  const url = safeUrl(photo?.url);
  const badge = shirt ? `<i class="num">${esc(shirt)}</i>` : "";
  if (!url) return `<span class="hs ${cls} blank"><b>${esc(shirt || initialsOf(name))}</b></span>`;
  const thumb = safeUrl(thumbOf(url)) || url;
  const focus = photo?.focusY != null ? Math.max(0, Math.min(100, Number(photo.focusY))) : 12;
  return `<span class="hs ${cls}"><img src="${esc(thumb)}" alt="${esc(name)}" style="object-position:50% ${focus}%" onerror="if(this.src!==this.dataset.o){this.src=this.dataset.o}else{this.remove()}" data-o="${esc(url)}">${badge}</span>`;
}

const day = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

const KEY_LABELS: Record<string, string> = {
  pace: "Pace", offRating: "Off. rating", defRating: "Def. rating", efgPct: "eFG%", tovPct: "Turnover %", threeRate: "3PA rate",
};

// A small target mark for the bench-target callouts, drawn in the club's ink.
const TARGET_ICON = `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="3.5"/><circle cx="8" cy="8" r=".9" class="dot"/></svg>`;

function aspectHtml(a: Aspect, kind: "up" | "down"): string {
  return `<li><span class="mk ${kind}">${kind === "up" ? "+" : "&minus;"}</span><div><p class="aspect">${esc(a.label)}</p><p class="val">${esc(a.text)}</p>
<div class="pbar"><span class="track"><span class="fill ${kind}" style="width:${Math.max(a.percentile, 3)}%"></span></span><b>${ordinalOf(a.percentile)} percentile</b></div>
<p class="gloss"><span class="tier ${kind}">${esc(a.tier)}</span> ${esc(describeStanding(a))}</p></div></li>`;
}

const dash = (v: number | null) => (v == null ? "&ndash;" : String(v));

function rosterSection(r: PrintableRoster, opponentName: string): string {
  const rows = r.roster
    .map((p) => `<tr class="${p.profiled ? "" : "dim"}"><td class="c sh">${esc(p.shirt ?? "")}</td><td class="who"><span class="rowhs">${headshot(p.photo, p.name, null, "xs")}</span>${esc(p.name)}</td><td>${p.gp}</td><td>${p.mpg}</td><td class="b">${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.tov}</td><td>${dash(p.fgPct)}</td><td>${dash(p.threePct)}</td><td>${dash(p.ftPct)}</td></tr>`)
    .join("");
  return `<section class="newpage"><h2><span>Roster</span>${esc(opponentName)}</h2>
${seasonNote(r)}
<table class="roster"><thead><tr><th class="c">#</th><th class="who">Player</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>${rows}</tbody></table>
<p class="fine">Per-game averages from the box score${r.season ? `, ${esc(r.season.label)} season, all competitions` : ""}, most minutes first. Bold names are profiled on the next pages.</p></section>`;
}

function seasonNote(r: PrintableRoster): string {
  const s = r.season;
  if (!s || !s.wholeSeason || s.competitions.length === 0) return "";
  const where = s.competitions.map((c) => `${esc(c.name)} ${c.games}`).join(" &middot; ");
  return `<p class="season"><b>${s.games} game${s.games === 1 ? "" : "s"} this season</b>${s.competitions.length > 1 ? ", counted across every competition" : ""}: ${where}. Player numbers and percentiles use all of them.</p>`;
}

function noteLine(n: CoachNote | undefined): string {
  return n ? `<p class="pnote"><b>Your note${n.kind ? ` &middot; ${esc(noteKindLabel(n.kind))}` : ""}</b>${esc(n.note)}</p>` : "";
}

function profilesSection(r: PrintableRoster, notes: Map<string, CoachNote>): string {
  if (!r.profiles.length) return "";
  const [lo, hi] = r.poolRange;
  const cards = r.profiles
    .map((p) => `<article class="pro"><header>${headshot(p.photo, p.name, p.shirt, "lg")}<div><h3>${esc(p.name)}</h3><p class="line"><b>${p.pts}</b> pts <b>${p.reb}</b> reb <b>${p.ast}</b> ast <span>&middot;</span> ${p.mpg} min <span>&middot;</span> ${p.gp} games</p></div></header>
${noteLine(notes.get(playerNameKey(p.name)))}<div class="two"><div><h4>Strengths</h4><ul class="aspects">${p.strengths.map((a) => aspectHtml(a, "up")).join("") || '<li class="none">No league-level strength yet in this sample.</li>'}${p.strengths.length > 0 && p.strengths.length < 3 ? `<li class="none">Only ${p.strengths.length} area${p.strengths.length === 1 ? "" : "s"} above the 60th percentile.</li>` : ""}</ul></div>
<div><h4>Weaknesses</h4><ul class="aspects">${p.weaknesses.map((a) => aspectHtml(a, "down")).join("") || '<li class="none">No league-level weakness yet in this sample.</li>'}${p.weaknesses.length > 0 && p.weaknesses.length < 3 ? `<li class="none">Only ${p.weaknesses.length} area${p.weaknesses.length === 1 ? "" : "s"} below the 40th percentile.</li>` : ""}</ul></div></div></article>`)
    .join("");
  return `<section class="profiles"><div class="keep"><h2><span>Players</span>Strengths and weaknesses</h2>
<div class="guide"><h3>How to read this</h3><p>A percentile counts how many league players this player is ahead of. In a pool of ${r.poolSize}, the 96th percentile means ahead of about ${Math.round(0.96 * (r.poolSize - 1))} of the other ${r.poolSize - 1}, and the 5th means ahead of only about ${Math.round(0.05 * (r.poolSize - 1))}. Shooting percentages have fewer qualifying players (${lo} to ${hi} depending on the stat). A longer bar is always better: green is a strength, red a weakness. For turnovers and fouls the bar already counts fewer as better. Counting stats are compared per 40 minutes. Strengths are above the 60th percentile and weaknesses below the 40th.</p>
<ul class="scale"><li class="s1"><b>90+</b>Elite</li><li class="s2"><b>60&ndash;89</b>Strength</li><li class="s3"><b>40&ndash;59</b>Average, not shown</li><li class="s4"><b>11&ndash;39</b>Weakness</li><li class="s5"><b>0&ndash;10</b>Among the worst</li></ul></div></div>${cards}</section>`;
}

export function buildPlanHtml(plan: PrintablePlan, meta: PrintableMeta): string {
  const brand = toHexColor(meta.brandColor);
  const onBrand = readableOn(brand);
  const second = secondColor(brand, meta.secondaryColor);
  // Ink in the club's colours has to read on white paper: the first colour when
  // it does, else the second (a yellow club's navy), else the first deepened.
  const ink = brandInk(brand, second, "#ffffff");
  const light = onBrand !== "#ffffff";
  const accent = second ?? mixHex(brand, light ? "#000000" : "#ffffff", light ? 0.3 : 0.45);
  const band = light ? mixHex(brand, "#ffffff", 0.24) : mixHex(brand, "#000000", 0.2);
  const tint = mixHex(brand, "#ffffff", 0.94);
  const tint2 = mixHex(brand, "#ffffff", 0.86);
  const origin = safeOrigin(meta.siteOrigin);
  const logo = origin ? `${origin}/icon-512.png` : "";

  const myCrest = safeUrl(meta.roster?.logos.forTeam);
  const oppCrest = safeUrl(meta.roster?.logos.opponent);
  const crest = (url: string, name: string) =>
    url ? `<span class="crest"><img src="${esc(url)}" alt="${esc(name)}"></span>` : `<span class="mono">${esc(initialsOf(name))}</span>`;
  const title = meta.forTeamName ? `${meta.forTeamName} v ${meta.opponentName}` : `Scouting report: ${meta.opponentName}`;
  const competition = meta.competitionName || meta.roster?.leagueName || "";
  const season = meta.roster?.season;
  const built = day(meta.generatedAt);

  // The roster's photos, to put a face on "players to stop".
  const photoByName = new Map<string, Headshot>();
  const rosterShirt = new Map<string, string | null>();
  for (const p of meta.roster?.roster ?? []) {
    const k = playerNameKey(p.name);
    if (k && p.photo) photoByName.set(k, p.photo);
    if (k) rosterShirt.set(k, p.shirt);
  }

  const noteByPlayer = new Map<string, CoachNote>();
  for (const n of meta.coachNotes ?? []) if (n.scope === "player" && n.playerName) noteByPlayer.set(playerNameKey(n.playerName), n);
  const teamNote = (meta.coachNotes ?? []).find((n) => n.scope === "team");
  const notesBlock = meta.coachNotes && meta.coachNotes.length
    ? `<section class="notes"><h2 class="mini">Your notes on ${esc(meta.opponentName)}, which this plan was told</h2>
${teamNote ? `<p class="nt"><b>Team</b>${esc(teamNote.note)}</p>` : ""}${Array.from(noteByPlayer.values()).map((n) => `<p class="nt"><b>${esc(n.playerName)} &middot; ${esc(noteKindLabel(n.kind))}</b>${esc(n.note)}</p>`).join("")}</section>`
    : "";

  const sample = season?.wholeSeason && season.games
    ? `${season.games} game${season.games === 1 ? "" : "s"} analysed, ${season.competitions.length > 1 ? `${season.competitions.length} competitions` : esc(season.competitions[0]?.name || "this season")}`
    : meta.gamesAnalysed ? `${meta.gamesAnalysed} games analysed${meta.dataThrough ? `, through ${esc(day(meta.dataThrough))}` : ""}` : "";
  const facts = [
    sample ? ["Sample", sample] : null,
    ["Games read", meta.windowLabel ? esc(capitalise(meta.windowLabel)) : "Whole season"],
    ["Confidence", esc(capitalise(plan.confidence || ""))],
    built ? ["Built", esc(built)] : null,
  ].filter((f): f is string[] => !!f).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  const side = (name: string, url: string, role: string) =>
    `<div class="side">${crest(url, name)}<p class="role">${role}</p><p class="nm">${esc(name)}</p></div>`;
  const cover = `<header class="cover"><div class="cv-in">
<div class="cv-top"><span>${meta.forTeamName ? `${esc(meta.forTeamName)} scouting report` : "Scouting report"}</span><span>${esc(competition)}${season && !competition.includes(season.label) ? `${competition ? " &middot; " : ""}${esc(season.label)}` : ""}</span></div>
<div class="lockup${meta.forTeamName ? "" : " solo"}"><i class="court" aria-hidden="true"></i>${meta.forTeamName ? `${side(meta.forTeamName, myCrest, "Prepared for")}<span class="vs">v</span>` : ""}${side(meta.opponentName, oppCrest, "Opponent")}</div>
</div><dl class="facts">${facts}</dl><div class="stripe"></div></header>`;

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

  const callCount = plan.gamePlan.length;
  const brief = callCount
    ? `<section class="brief"><h2 class="mini">The game plan in ${WORDS[callCount] || callCount} call${callCount === 1 ? "" : "s"}</h2><ol class="calls">${plan.gamePlan
      .map((g, i) => `<li><span class="cn">${i + 1}</span><p class="cc">${esc(g.call)}</p><p class="ct">${TARGET_ICON}${esc(g.target)}</p></li>`)
      .join("")}</ol></section>`
    : "";

  const keys = (list: Array<{ call: string; why: string }>) =>
    list.map((k) => `<li><p class="call">${esc(k.call)}</p><p class="why">${esc(k.why)}</p></li>`).join("");
  const face = (name: string, size: string) => {
    const k = playerNameKey(name);
    return headshot(photoByName.get(k) ?? null, name, rosterShirt.get(k) ?? null, size);
  };
  const stops = plan.playersToStop.map((p) =>
    `<article class="stop"><header>${face(p.name, "md")}<h3>${esc(p.name)}</h3></header><dl><dt>Threat</dt><dd>${esc(p.threat)}</dd><dt>Plan</dt><dd>${esc(p.plan)}</dd></dl></article>`);
  const faces = plan.playersToStop.length
    ? `<section class="faces"><h2 class="mini">Players to stop</h2><div class="fl">${plan.playersToStop.slice(0, 4).map((p) => `<div class="face">${face(p.name, "sm")}<p>${esc(p.name)}</p></div>`).join("")}</div></section>`
    : "";
  const planCards = plan.gamePlan
    .map((g, i) => `<li><span class="n">${i + 1}</span><div><p class="call">${esc(g.call)}</p><p class="why">${esc(g.why)}</p><p class="target">${TARGET_ICON}<b>Bench target</b><span>${esc(g.target)}</span></p></div></li>`);

  const footerTitle = cssText(competition ? `${title}  ·  ${competition}` : title);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{--brand:${brand};--on:${onBrand};--ink-b:${ink};--accent:${accent};--band:${band};--tint:${tint};--tint2:${tint2};
    --ink:#121826;--text:#2b3345;--muted:#5d6779;--faint:#8a93a5;--line:#e3e7ee;--soft:#f5f7fa;
    --good:#17794a;--bad:#b3261e;--goodsoft:#e4f4ec;--badsoft:#fbe9e7;
    --disp:"Barlow Condensed","Arial Narrow",Arial,sans-serif;--body:"Inter",-apple-system,"Segoe UI",Arial,sans-serif}
  @page{size:A4;margin:14mm 13mm 18mm;
    @bottom-left{content:"Swish Assistant";font:600 8px/1 var(--body);letter-spacing:.03em;color:#1d2433;${logo ? `background:url("${logo}") no-repeat left center/15px 15px;padding-left:17px;` : ""}}
    @bottom-center{content:"${footerTitle}";font:7.5px/1 var(--body);color:#8a93a5}
    @bottom-right{content:"Page " counter(page) " of " counter(pages);font:500 7.5px/1 var(--body);color:#8a93a5;font-variant-numeric:tabular-nums}}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html{font-size:12.5px}
  body{font:1rem/1.55 var(--body);color:var(--text);margin:0;max-width:184mm;font-feature-settings:"cv11","ss01"}
  h1,h2,h3,h4,p,ul,ol,dl,dd{margin:0}ul,ol{padding:0;list-style:none}
  b,strong{color:var(--ink)}

  /* Cover: the club's colour, both crests either side of a half-court line. */
  .cover{background:var(--brand);color:var(--on);border-radius:12px;overflow:hidden;break-inside:avoid}
  .cv-in{padding:15px 20px 6px;position:relative}
  .cv-top{display:flex;justify-content:space-between;gap:16px;font:600 .66rem/1.3 var(--body);letter-spacing:.14em;text-transform:uppercase;opacity:.82}
  .lockup{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;padding:16px 0 18px}
  .lockup.solo{grid-template-columns:1fr}
  .court{position:absolute;inset:-60px 0 -40px;pointer-events:none}
  .court::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1.5px solid color-mix(in srgb,var(--on) 16%,transparent)}
  .court::after{content:"";position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border:1.5px solid color-mix(in srgb,var(--on) 16%,transparent);border-radius:50%}
  .lockup.solo .court{display:none}
  .side{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0}
  .crest,.mono{width:70px;height:70px;border-radius:16px;background:#fff;display:flex;align-items:center;justify-content:center;padding:8px}
  .crest img{width:100%;height:100%;object-fit:contain}
  .mono{font:700 1.9rem/1 var(--disp);color:var(--ink-b)}
  .role{margin-top:11px;font:600 .6rem/1 var(--body);letter-spacing:.16em;text-transform:uppercase;opacity:.75}
  .nm{margin-top:5px;font:700 2.35rem/.98 var(--disp);text-transform:uppercase;letter-spacing:.01em;overflow-wrap:anywhere}
  .vs{position:relative;font:600 1.3rem/1 var(--disp);text-transform:uppercase;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--brand);box-shadow:0 0 0 1.5px color-mix(in srgb,var(--on) 30%,transparent);opacity:.95}
  .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));background:var(--band);padding:9px 20px 10px}
  .facts div{padding:0 12px;border-left:1px solid color-mix(in srgb,var(--on) 22%,transparent)}.facts div:first-child{padding-left:0;border-left:0}
  .facts dt{font:600 .56rem/1.2 var(--body);letter-spacing:.14em;text-transform:uppercase;opacity:.72}
  .facts dd{font:600 .82rem/1.3 var(--body);margin-top:2px}
  .stripe{height:5px;background:var(--accent)}

  /* Section heads: a small numbered kicker over a condensed title. */
  h2{font:700 1.6rem/1.05 var(--disp);text-transform:uppercase;letter-spacing:.01em;color:var(--ink);margin:24px 0 11px;break-after:avoid}
  h2 span{display:flex;align-items:center;gap:8px;font:700 .6rem/1 var(--body);letter-spacing:.12em;color:var(--ink-b);margin-bottom:5px}
  h2 span::after{content:"";flex:1;height:1px;background:var(--line)}
  h2.mini{font:600 .64rem/1 var(--body);letter-spacing:.16em;color:var(--muted);margin:22px 0 9px;display:flex;align-items:center;gap:10px}
  h2.mini::after{content:"";flex:1;height:1px;background:var(--line)}
  h3{font:700 1.18rem/1.15 var(--disp);color:var(--ink);letter-spacing:.005em}
  .keep{break-inside:avoid}

  /* Page one: the read, the numbers and the calls. */
  .lede{margin-top:20px;padding-left:14px;border-left:3px solid var(--brand)}
  .headline{font:600 1.85rem/1.1 var(--disp);color:var(--ink);letter-spacing:.003em}
  .summary{margin-top:8px;font-size:1.04rem;line-height:1.6;color:var(--text)}
  .tiles{display:grid;grid-template-columns:repeat(6,1fr);border-top:2px solid var(--ink);border-bottom:1px solid var(--line)}
  .tile{padding:9px 10px 9px;display:flex;flex-direction:column;border-left:1px solid var(--line);break-inside:avoid}.tile:first-child{border-left:0;padding-left:2px}
  .tile b{font:700 1.85rem/1 var(--disp);color:var(--ink);font-variant-numeric:tabular-nums}
  .tile span{font:600 .6rem/1.2 var(--body);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:4px}
  .tile i{font-style:normal;font-size:.7rem;font-weight:600;margin-top:2px;color:var(--faint)}.tile i.up{color:var(--good)}.tile i.down{color:var(--bad)}
  .calls{border-top:1px solid var(--line)}
  .calls li{display:grid;grid-template-columns:30px 1fr 39%;gap:12px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--line);break-inside:avoid}
  .cn{font:700 1.35rem/1 var(--disp);color:var(--ink-b)}
  .cc{font-weight:700;color:var(--ink);font-size:.98rem;line-height:1.35}
  .ct{font-size:.86rem;color:var(--text);line-height:1.4;padding-left:20px;position:relative}
  .ct .ico{position:absolute;left:0;top:2px}
  .ico{width:12px;height:12px;fill:none;stroke:var(--ink-b);stroke-width:1.6;flex:none}.ico .dot{fill:var(--ink-b);stroke:none}

  /* The plan in full. */
  .newpage{break-before:page}
  .newpage>h2:first-child,.newpage>.keep:first-child>h2:first-child,.newpage>.notes:first-child{margin-top:0}
  .plan li{display:grid;grid-template-columns:44px 1fr;gap:6px;padding:13px 0;border-top:1px solid var(--line);break-inside:avoid}
  .gp .keep .plan li{border-top:2px solid var(--ink)}
  .n{font:700 2rem/.9 var(--disp);color:var(--ink-b);font-variant-numeric:tabular-nums}
  .call{font-weight:700;color:var(--ink);font-size:1.02rem;line-height:1.35}.why{color:var(--muted);margin-top:2px}
  .target{margin-top:8px;display:flex;align-items:baseline;gap:8px;background:var(--tint);border-left:3px solid var(--brand);border-radius:0 6px 6px 0;padding:6px 11px;font-size:.92rem;color:var(--ink);font-weight:600}
  .target .ico{position:relative;top:2px}
  .target b{font:700 .58rem/1.4 var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-b);white-space:nowrap}
  .lead{font-size:1.06rem;line-height:1.62;color:var(--text)}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:22px;break-inside:avoid}
  .cols .sum{color:var(--text)}
  .keys{margin-top:10px;counter-reset:k}
  .keys li{padding:8px 0 8px 22px;border-top:1px solid var(--line);position:relative;break-inside:avoid;counter-increment:k}
  .keys li::before{content:counter(k);position:absolute;left:0;top:9px;font:700 .95rem/1 var(--disp);color:var(--ink-b)}
  .keys .call{font-size:.95rem}.keys .why{font-size:.9rem}
  .stops{display:grid;grid-template-columns:1fr 1fr;gap:10px}.stops.more{margin-top:10px}
  .fl{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .face{display:flex;align-items:center;gap:10px;min-width:0}
  .face p{font-weight:600;color:var(--ink);font-size:.86rem;line-height:1.3}
  .stop{border:1px solid var(--line);border-radius:10px;padding:12px 13px;break-inside:avoid;background:#fff}
  .stop header{display:flex;align-items:center;gap:12px;margin-bottom:9px;padding-bottom:9px;border-bottom:1px solid var(--line)}
  .stop dl{display:grid;grid-template-columns:46px 1fr;gap:5px 8px;font-size:.9rem}
  .stop dt{font:700 .56rem/1.9 var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  .stop dd{color:var(--text)}.stop dd:last-child{color:var(--ink);font-weight:500}
  .watch{margin-top:10px}
  .watch li{display:grid;grid-template-columns:16px 1fr;gap:8px;padding:6px 0;border-top:1px solid var(--line);break-inside:avoid}
  .watch li::before{content:"";width:7px;height:7px;margin-top:6px;border-top:2px solid var(--ink-b);border-right:2px solid var(--ink-b);transform:rotate(45deg)}
  .panel{background:var(--tint);border-radius:10px;padding:12px 15px;break-inside:avoid}
  .blk{break-inside:avoid}
  .confidence{margin-top:18px;display:flex;gap:12px;align-items:baseline;border-top:2px solid var(--ink);padding-top:9px;font-size:.88rem;color:var(--muted);break-inside:avoid}
  .confidence strong{font:700 .6rem/1.5 var(--body);letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;color:var(--ink)}

  /* Notes, roster and profiles. */
  .notes{margin:0 0 4px;background:var(--tint);border-left:3px solid var(--brand);border-radius:0 10px 10px 0;padding:11px 15px;break-inside:avoid}
  .notes h2.mini{margin:0 0 6px}.notes h2.mini::after{display:none}
  .nt{font-size:.9rem;margin-top:5px;color:var(--ink)}.nt b,.pnote b{display:block;font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .pnote{background:var(--tint);border-left:3px solid var(--brand);border-radius:0 6px 6px 0;padding:6px 11px;margin:-2px 0 10px;font-size:.88rem;color:var(--ink)}
  .hs{position:relative;flex:none;display:inline-block;border-radius:10px;background:var(--tint2);overflow:visible}
  .hs img{width:100%;height:100%;object-fit:cover;border-radius:10px;display:block}
  .hs.blank{display:flex;align-items:center;justify-content:center;background:var(--brand);color:var(--on)}.hs.blank b{font:700 1.15em/1 var(--disp);color:var(--on)}
  .hs.lg{width:56px;height:56px}.hs.lg.blank{font-size:1.45rem}.hs.md{width:50px;height:50px}.hs.md.blank{font-size:1.3rem}.hs.sm{width:40px;height:40px;border-radius:9px}.hs.sm img{border-radius:9px}.hs.sm.blank{font-size:1.05rem}.hs.xs{width:22px;height:22px;border-radius:50%}.hs.xs img{border-radius:50%}.hs.xs.blank{font-size:.6rem}
  .hs .num{position:absolute;right:-5px;bottom:-5px;min-width:18px;height:18px;border-radius:5px;background:var(--brand);color:var(--on);font:700 .74rem/18px var(--disp);text-align:center;font-style:normal;box-shadow:0 0 0 2px #fff;padding:0 3px}
  .season{background:var(--soft);border-left:3px solid var(--brand);border-radius:0 7px 7px 0;padding:7px 11px;font-size:.88rem;color:var(--text);margin-bottom:11px;break-inside:avoid}
  table{width:100%;border-collapse:collapse;font-size:.9rem;font-variant-numeric:tabular-nums}
  th,td{padding:5px 6px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
  thead th{font:700 .58rem/1.2 var(--body);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--ink);padding-top:0}
  td.who,th.who{text-align:left}.c{text-align:center}td.who{font-weight:700;color:var(--ink);display:flex;align-items:center;gap:9px;border-bottom:0}td.b{font-weight:700;color:var(--ink)}
  td.sh{color:var(--muted);width:28px}
  tbody tr{break-inside:avoid;border-bottom:1px solid var(--line)}tbody tr:nth-child(even){background:#fafbfc}
  tr.dim td{color:var(--faint)}tr.dim td.who{font-weight:400;color:var(--muted)}.rowhs{display:inline-flex}
  table.roster td{vertical-align:middle}
  .fine{font-size:.76rem;color:var(--faint);margin-top:7px}
  .guide{background:var(--soft);border-radius:10px;padding:11px 14px;margin:0 0 12px;break-inside:avoid}
  .guide h3{margin-bottom:3px}.guide p{font-size:.86rem;color:var(--muted)}
  .scale{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:9px}
  .scale li{background:#fff;border-radius:6px;padding:5px 8px;font-size:.72rem;color:var(--muted);border-bottom:3px solid var(--line)}.scale b{display:block;font-size:.82rem}
  .scale .s1,.scale .s2{border-bottom-color:var(--good)}.scale .s4,.scale .s5{border-bottom-color:var(--bad)}
  .pro{border:1px solid var(--line);border-radius:12px;padding:13px 15px;margin:0 0 10px;break-inside:avoid}
  .pro>header{display:flex;align-items:center;gap:13px;margin-bottom:11px;padding-bottom:10px;border-bottom:1px solid var(--line)}
  .line{color:var(--muted);font-size:.86rem;margin-top:2px}.line b{font-weight:700}.line span{color:var(--line);margin:0 3px}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  h4{font:700 .58rem/1 var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
  .aspects li{display:grid;grid-template-columns:18px 1fr;gap:8px;margin-bottom:9px}.aspects li.none{display:block;color:var(--muted);font-style:italic;font-size:.82rem}
  .mk{width:17px;height:17px;border-radius:50%;font:700 .85rem/17px var(--body);text-align:center}.mk.up{background:var(--goodsoft);color:var(--good)}.mk.down{background:var(--badsoft);color:var(--bad)}
  .aspect{font-weight:700;font-size:.92rem;color:var(--ink)}.val{color:var(--muted);font-size:.85rem}.gloss{font-size:.74rem;color:var(--muted);margin-top:1px}
  .pbar{display:flex;align-items:center;gap:7px;margin-top:3px}.track{flex:1;height:5px;border-radius:9px;background:#e6e9ef;overflow:hidden}.fill{display:block;height:100%;border-radius:9px}.fill.up{background:var(--good)}.fill.down{background:var(--bad)}.pbar b{font-size:.72rem;white-space:nowrap}
  .tier{font-weight:700}.tier.up{color:var(--good)}.tier.down{color:var(--bad)}
  .colophon{margin-top:26px;display:flex;align-items:center;gap:11px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:.8rem;break-inside:avoid}
  .colophon img{width:30px;height:30px}
  .colophon b{display:block;font:700 .95rem/1.1 var(--disp);letter-spacing:.06em;text-transform:uppercase}
</style></head><body>
${cover}
<section class="lede"><p class="headline">${esc(plan.headline)}</p><p class="summary">${esc(plan.summary)}</p></section>
${glance}
${brief}
${faces}
<div class="newpage">
${notesBlock}
<section class="gp"><div class="keep"><h2><span>01</span>Game plan</h2>${planCards[0] ? `<ol class="plan">${planCards[0]}</ol>` : ""}</div>${planCards.length > 1 ? `<ol class="plan rest" start="2">${planCards.slice(1).join("")}</ol>` : ""}</section>
<section class="blk"><h2><span>02</span>How ${esc(meta.opponentName)} play</h2><p class="lead">${esc(plan.howTheyPlay)}</p></section>
<div class="cols"><div class="col"><h2><span>03</span>Defending them</h2><p class="sum">${esc(plan.defendingThem.summary)}</p><ul class="keys">${keys(plan.defendingThem.keys)}</ul></div>
<div class="col"><h2><span>04</span>Attacking them</h2><p class="sum">${esc(plan.attackingThem.summary)}</p><ul class="keys">${keys(plan.attackingThem.keys)}</ul></div></div>
<section><div class="keep"><h2><span>05</span>Players to stop</h2><div class="stops">${stops.slice(0, 2).join("")}</div></div>${stops.length > 2 ? `<div class="stops more">${stops.slice(2).join("")}</div>` : ""}</section>
<section class="blk"><h2><span>06</span>Lineups and rotation</h2><p>${esc(plan.lineupsAndRotation.summary)}</p>${plan.lineupsAndRotation.watchFor.length ? `<ul class="watch">${plan.lineupsAndRotation.watchFor.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}</section>
<section class="blk"><h2><span>07</span>Late game</h2><div class="panel"><p>${esc(plan.lateGame)}</p></div>
<p class="confidence"><strong>Confidence: ${esc(plan.confidence)}</strong><span>${esc(plan.confidenceReason)}</span></p></section>
</div>
${meta.roster && meta.roster.roster.length ? rosterSection(meta.roster, meta.opponentName) : ""}
${meta.roster ? profilesSection(meta.roster, noteByPlayer) : ""}
<footer class="colophon">${logo ? `<img src="${logo}" alt="">` : ""}<div><b>Prepared by Swish Assistant</b>${esc(title)}${competition ? ` &middot; ${esc(competition)}` : ""}${built ? ` &middot; Built ${esc(built)}` : ""}</div></footer>
</body></html>`;
}

/** Opens the printable report in a new window and starts the print dialog once fonts and pictures are in. Returns false if the browser blocked the window. */
export function printScoutPlan(plan: PrintablePlan, meta: PrintableMeta): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(buildPlanHtml(plan, { ...meta, siteOrigin: meta.siteOrigin ?? window.location.origin }));
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
