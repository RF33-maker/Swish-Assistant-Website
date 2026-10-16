/**
 * A printable playbook, for saving as a PDF from the browser's print dialog.
 *
 * Same approach as the scouting report (printScoutPlan.ts): a plain HTML
 * document opened in its own window, so it prints on its own and doesn't drag
 * the Coaches Hub around with it. The court diagrams, tables and wording come
 * from the playbook engine itself (rendered view-only into a hidden element and
 * read back), so the PDF matches what coaches see on screen and can't drift from
 * it. Everything the coach typed arrives as the engine's own DOM, escaped; only
 * the title and club name are written into the page here, and those are escaped.
 * Laid out for A4 with the Swish Assistant footer; a play never splits across a
 * page, and every step of a play sits side by side so a whole play reads at a glance.
 */

import { createPlaybook, type PlaybookData } from "./playbook/engine";
import playbookCss from "./playbook/playbook.css?raw";
import { buildPlaybookHtml, type PrintablePlaybookMeta } from "./playbookPrintHtml";

export type { PrintablePlaybookMeta };

/** The engine's own view-only markup for this playbook (the contents of its `.pb` root, which the print page supplies). */
export function renderPlaybookBody(data: PlaybookData): string {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;visibility:hidden;pointer-events:none";
  document.body.appendChild(host);
  try {
    const engine = createPlaybook(host, { initial: data, editable: false });
    const html = host.innerHTML;
    engine.destroy();
    return html;
  } finally {
    host.remove();
  }
}

/** Opens the printable playbook in a new window and starts the print dialog once fonts and pictures are in. Returns false if the browser blocked the window. */
export function printPlaybook(data: PlaybookData, meta: PrintablePlaybookMeta = {}): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  const html = buildPlaybookHtml(renderPlaybookBody(data), data.title || "Playbook", playbookCss, { ...meta, siteOrigin: meta.siteOrigin ?? window.location.origin });
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  const pictures = Array.from(win.document.images).map((img) =>
    img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve(); }),
  );
  const ready = Promise.all([win.document.fonts?.ready ?? Promise.resolve(), ...pictures]);
  // Never wait long: a slow picture should not stop the playbook printing.
  Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 6000))]).then(() => setTimeout(() => win.print(), 200));
  return true;
}
