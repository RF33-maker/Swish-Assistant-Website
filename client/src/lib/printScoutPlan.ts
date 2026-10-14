/**
 * A printable copy of a scouting game plan, for saving as a PDF from the
 * browser's print dialog. Admin-only for now, while the report is tested.
 *
 * Built as a plain HTML string and opened in its own window, so it prints on
 * its own and does not drag the Coaches Hub page around with it. Everything
 * that comes from the plan is escaped.
 */

import { describeStanding, ordinalOf, type Aspect, type ScoutRoster } from "../../../shared/scoutRoster";

/** The roster endpoint's response, as far as the printout needs it. */
export interface PrintableRoster extends ScoutRoster {
  leagueName: string | null;
  logos: { opponent: string | null; forTeam: string | null };
}

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

export interface PrintableMeta {
  opponentName: string;
  forTeamName?: string | null;
  competitionName?: string | null;
  gamesAnalysed?: number | null;
  dataThrough?: string | null;
  generatedAt?: string | null;
  brandColor?: string;
  /** Roster table, league-percentile profiles and club crests; left out when not loaded. */
  roster?: PrintableRoster | null;
}

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Only ever a plain colour in the page's own palette; anything else falls back.
const safeColor = (c: string | undefined) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#0b3c78");

const day = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// Crests are linked, not embedded; only ever an http(s) address.
const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : "");
const dash = (v: number | null) => (v == null ? "&ndash;" : String(v));

function aspectHtml(a: Aspect, kind: "up" | "down"): string {
  return `<li><span class="mk ${kind}">${kind === "up" ? "+" : "&minus;"}</span><div><p class="aspect">${esc(a.label)}</p><p class="val">${esc(a.text)}</p>
<div class="pbar"><span class="track"><span class="fill ${kind}" style="width:${Math.max(a.percentile, 3)}%"></span></span><b>${ordinalOf(a.percentile)} percentile</b></div>
<p class="gloss"><span class="tier ${kind}">${esc(a.tier)}</span> ${esc(describeStanding(a))}</p></div></li>`;
}

function rosterHtml(r: PrintableRoster, opponentName: string): string {
  const rows = r.roster
    .map((p) => `<tr class="${p.profiled ? "" : "dim"}"><td class="c">${esc(p.shirt ?? "")}</td><th scope="row">${esc(p.name)}</th><td>${p.gp}</td><td>${p.mpg}</td><td class="b">${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.tov}</td><td>${dash(p.fgPct)}</td><td>${dash(p.threePct)}</td><td>${dash(p.ftPct)}</td></tr>`)
    .join("");
  const profiles = r.profiles
    .map((p) => `<div class="pro"><div class="prohead"><span class="shirt">${p.shirt ? esc(p.shirt) : "&ndash;"}</span><div><h3>${esc(p.name)}</h3><p class="line">${p.mpg} min &middot; ${p.pts} pts &middot; ${p.reb} reb &middot; ${p.ast} ast &middot; ${p.gp} games</p></div></div>
<div class="two"><div><h4>Strengths</h4><ul class="aspects">${p.strengths.map((a) => aspectHtml(a, "up")).join("") || '<li class="none">No league-level strength yet.</li>'}</ul></div>
<div><h4>Weaknesses</h4><ul class="aspects">${p.weaknesses.map((a) => aspectHtml(a, "down")).join("") || '<li class="none">No league-level weakness yet.</li>'}</ul></div></div></div>`)
    .join("");
  const [lo, hi] = r.poolRange;
  const profilesBlock = r.profiles.length
    ? `<h2>Player profiles</h2>
<div class="guide"><h3>How to read this</h3><p>A percentile counts how many league players this player is ahead of. In a pool of ${r.poolSize}, the 96th percentile means ahead of about ${Math.round(0.96 * (r.poolSize - 1))} of the other ${r.poolSize - 1}, and the 5th means ahead of only about ${Math.round(0.05 * (r.poolSize - 1))}. Shooting percentages have fewer qualifying players (${lo} to ${hi} depending on the stat). A longer bar is always better: green is a strength, red a weakness. For turnovers and fouls the bar already counts fewer as better. Counting stats are compared per 40 minutes. Strengths are above the 60th percentile and weaknesses below the 40th. The sample is small early in a season.</p></div>${profiles}`
    : "";
  return `<h2>${esc(opponentName)} roster</h2><table><thead><tr><th class="c">#</th><th>Player</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>${rows}</tbody></table>${profilesBlock}`;
}

export function buildPlanHtml(plan: PrintablePlan, meta: PrintableMeta): string {
  const brand = safeColor(meta.brandColor);
  const myCrest = safeUrl(meta.roster?.logos.forTeam);
  const oppCrest = safeUrl(meta.roster?.logos.opponent);
  const crest = (url: string, alt: string) => (url ? `<span class="crest"><img src="${esc(url)}" alt="${esc(alt)}"></span>` : "");
  const keys = (list: Array<{ call: string; why: string }>) =>
    list.map((k) => `<li><p class="call">${esc(k.call)}</p><p class="why">${esc(k.why)}</p></li>`).join("");
  const title = meta.forTeamName ? `${meta.forTeamName} v ${meta.opponentName}` : `Scouting report: ${meta.opponentName}`;
  const bits = [
    meta.competitionName,
    meta.gamesAnalysed ? `${meta.gamesAnalysed} games analysed${meta.dataThrough ? `, through ${day(meta.dataThrough)}` : ""}` : "",
    `Confidence: ${plan.confidence}`,
    meta.generatedAt ? `Built ${day(meta.generatedAt)}` : "",
  ].filter(Boolean);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  :root{--brand:${brand};--ink:#141a26;--muted:#586277;--line:#dfe4ed}
  *{box-sizing:border-box}
  body{font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:var(--ink);margin:0;padding:22px 28px;max-width:820px}
  h1,h2,h3{font-family:"Arial Narrow",Arial,sans-serif;margin:0;line-height:1.15}
  .band{background:var(--brand);color:#fff;border-radius:8px;padding:16px 20px;border-bottom:4px solid #c8141c;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .band .eyebrow{font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.85}
  .band h1{font-size:30px;text-transform:uppercase;margin:4px 0 6px}
  .band p{margin:0;font-size:11px;opacity:.9}
  .lede{font-size:15px;font-weight:600;margin:16px 0 4px}
  h2{font-size:18px;margin:18px 0 6px;padding-bottom:3px;border-bottom:2px solid var(--line)}
  ol,ul{margin:6px 0 0;padding:0;list-style:none}
  li{margin:0 0 8px;break-inside:avoid}
  .call{font-weight:600;margin:0}.why{color:var(--muted);margin:1px 0 0}
  .n{display:inline-block;width:18px;font-weight:700;color:#c8141c}
  .target{margin:3px 0 0 18px;font-size:12px}.target b{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#c8141c}
  .keys li{padding-left:10px;border-left:3px solid var(--line)}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .player{border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin:0 0 8px;break-inside:avoid}
  .player h3{font-size:14px}.player p{margin:3px 0 0}.player b{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#c8141c}
  .foot{margin-top:18px;padding-top:8px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}
  .match{display:flex;align-items:center;gap:14px;margin:8px 0 6px}.match h1{margin:0}
  .crest{flex:none;width:52px;height:52px;background:#fff;border-radius:10px;padding:5px;display:flex;align-items:center;justify-content:center}.crest img{width:100%;height:100%;object-fit:contain}
  table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px}th,td{padding:4px 6px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}thead th{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:#f4f6fa;-webkit-print-color-adjust:exact;print-color-adjust:exact}tbody th{text-align:left;font-weight:600}td.c,th.c{text-align:center}thead th:nth-child(2){text-align:left}td.b{font-weight:700}tr.dim th,tr.dim td{color:var(--muted);font-weight:400}
  .guide{border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:6px;padding:8px 12px;margin:6px 0 10px;break-inside:avoid}.guide h3{font-size:13px}.guide p{margin:3px 0 0;font-size:11.5px;color:var(--muted)}
  .pro{border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin:0 0 10px;break-inside:avoid}.prohead{display:flex;align-items:center;gap:10px;margin-bottom:8px}.prohead h3{font-size:14px}.line{margin:0;color:var(--muted);font-size:11px}
  .shirt{flex:none;width:34px;height:34px;border-radius:8px;background:var(--brand);color:#fff;font:700 18px "Arial Narrow",Arial,sans-serif;display:flex;align-items:center;justify-content:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}h4{margin:0 0 5px;font:600 9.5px Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
  .aspects{margin:0}.aspects li{display:grid;grid-template-columns:18px 1fr;gap:7px;margin:0 0 7px}.aspects li.none{display:block;color:var(--muted);font-style:italic;font-size:11px}
  .mk{width:16px;height:16px;border-radius:50%;font:700 12px/16px Arial,sans-serif;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}.mk.up{background:#e4f4ec;color:#17794a}.mk.down{background:#fbe9e7;color:#b3261e}
  .aspect{margin:0;font-weight:600;font-size:12px}.val{margin:0;color:var(--muted);font-size:11px}.gloss{margin:2px 0 0;font-size:10px;color:var(--muted)}
  .pbar{display:flex;align-items:center;gap:6px;margin-top:2px}.track{flex:1;height:5px;border-radius:9px;background:#e1e5ec;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}.fill{display:block;height:100%;border-radius:9px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.fill.up{background:#17794a}.fill.down{background:#b3261e}.pbar b{font-size:10px;white-space:nowrap}
  .tier{font-weight:700}.tier.up{color:#17794a}.tier.down{color:#b3261e}
  @media print{body{padding:0}.cols{gap:14px}}
</style></head><body>
<div class="band"><div class="eyebrow">${meta.forTeamName ? `${esc(meta.forTeamName)} scouting report` : "Scouting report"}${meta.competitionName ? ` &middot; ${esc(meta.competitionName)}` : ""}</div>
<div class="match">${meta.forTeamName ? crest(myCrest, meta.forTeamName) : ""}<h1>${esc(title)}</h1>${crest(oppCrest, meta.opponentName)}</div><p>${esc(bits.join("  ·  "))}</p></div>
<p class="lede">${esc(plan.headline)}</p><p>${esc(plan.summary)}</p>
<h2>Game plan</h2><ol>${plan.gamePlan
    .map((g, i) => `<li><p class="call"><span class="n">${i + 1}</span>${esc(g.call)}</p><p class="why" style="margin-left:18px">${esc(g.why)}</p><p class="target"><b>Target</b> ${esc(g.target)}</p></li>`)
    .join("")}</ol>
<h2>How ${esc(meta.opponentName)} play</h2><p>${esc(plan.howTheyPlay)}</p>
<div class="cols"><div><h2>Defending them</h2><p>${esc(plan.defendingThem.summary)}</p><ul class="keys">${keys(plan.defendingThem.keys)}</ul></div>
<div><h2>Attacking them</h2><p>${esc(plan.attackingThem.summary)}</p><ul class="keys">${keys(plan.attackingThem.keys)}</ul></div></div>
<h2>Players to stop</h2>${plan.playersToStop
    .map((p) => `<div class="player"><h3>${esc(p.name)}</h3><p><b>Threat</b> ${esc(p.threat)}</p><p><b>Plan</b> ${esc(p.plan)}</p></div>`)
    .join("")}
${meta.roster && meta.roster.roster.length ? rosterHtml(meta.roster, meta.opponentName) : ""}
<h2>Lineups and rotation</h2><p>${esc(plan.lineupsAndRotation.summary)}</p><ul class="keys">${plan.lineupsAndRotation.watchFor.map((w) => `<li><p>${esc(w)}</p></li>`).join("")}</ul>
<h2>Late game</h2><p>${esc(plan.lateGame)}</p>
<p class="foot"><strong>Confidence: ${esc(plan.confidence)}.</strong> ${esc(plan.confidenceReason)}</p>
</body></html>`;
}

/** Opens the printable plan in a new window and starts the print dialog. Returns false if the browser blocked the window. */
export function printScoutPlan(plan: PrintablePlan, meta: PrintableMeta): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(buildPlanHtml(plan, meta));
  win.document.close();
  win.focus();
  // Give the new document a moment to lay out before the dialog opens.
  setTimeout(() => win.print(), 350);
  return true;
}
