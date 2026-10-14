/**
 * A printable copy of a scouting game plan, for saving as a PDF from the
 * browser's print dialog. Admin-only for now, while the report is tested.
 *
 * Built as a plain HTML string and opened in its own window, so it prints on
 * its own and does not drag the Coaches Hub page around with it. Everything
 * that comes from the plan is escaped.
 */

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

export function buildPlanHtml(plan: PrintablePlan, meta: PrintableMeta): string {
  const brand = safeColor(meta.brandColor);
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
  @media print{body{padding:0}.cols{gap:14px}}
</style></head><body>
<div class="band"><div class="eyebrow">Scouting report${meta.competitionName ? ` &middot; ${esc(meta.competitionName)}` : ""}</div>
<h1>${esc(title)}</h1><p>${esc(bits.join("  ·  "))}</p></div>
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
