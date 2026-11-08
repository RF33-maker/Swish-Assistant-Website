/**
 * Turns one of our print-ready HTML documents (the scouting report, the
 * playbook) into a real A4 PDF file, so coaches get a download instead of the
 * browser's print dialog, which is confusing on desktop and close to unusable
 * on phones.
 *
 * The document is laid out in a hidden frame at the printed page width, then
 * cut into pages the way the print engine would: never through a line of text,
 * a picture, a table row or anything marked `break-inside: avoid`, always at a
 * `break-before: page`, and never straight after a heading (`break-after:
 * avoid`). Each page is drawn to a canvas and placed on the PDF page with the
 * Swish Assistant footer and page numbers, the same footer the print CSS gives.
 *
 * Pages are drawn one at a time so the canvases stay small enough for phones
 * (iOS Safari refuses canvases much past 16M pixels).
 */

import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

export interface PdfPageSetup {
  /** The print CSS's @page margins, in mm. */
  margin: { top: number; side: number; bottom: number };
  /** Footer on every page: a logo and label on the left, a title in the middle, page numbers on the right. */
  footer?: { left?: string; center?: string; logoUrl?: string | null };
  /** Running head in the top margin, left and right, from page two on. */
  header?: { left?: string; right?: string };
  /** PDF title in the file's properties. */
  title?: string;
  /** Called after each page is drawn. */
  onProgress?: (done: number, total: number) => void;
}

const A4 = { w: 210, h: 297 };
const PX_PER_MM = 96 / 25.4;
// 2x keeps text crisp in a PDF viewer while a page canvas stays ~3M pixels.
const SCALE = 2;
const LOAD_TIMEOUT_MS = 8000;
const OVERHANG_PX = 24;

type Box = { top: number; bottom: number };

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/** Writes the document into an off-screen frame `widthPx` wide and waits for its fonts and pictures (never for long). */
async function mountFrame(html: string, widthPx: number): Promise<HTMLIFrameElement> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${widthPx}px;height:1200px;border:0;pointer-events:none`;
  document.body.appendChild(frame);
  const loaded = new Promise<void>((resolve) => frame.addEventListener("load", () => resolve(), { once: true }));
  frame.srcdoc = html;
  await Promise.race([loaded, wait(LOAD_TIMEOUT_MS)]);
  const doc = frame.contentDocument!;
  const pictures = Array.from(doc.images).map((img) =>
    img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve(); }),
  );
  await Promise.race([Promise.all([doc.fonts?.ready, ...pictures]), wait(LOAD_TIMEOUT_MS)]);
  // Shrink the frame first so the height read is the content's, not the frame's, then open it to full
  // height so nothing is laid out against a short viewport. (A tall frame leaves a blank last page.)
  frame.style.height = "10px";
  frame.style.height = `${doc.documentElement.scrollHeight}px`;
  await nextFrame();
  return frame;
}

/**
 * Team crests, headshots and the logo, swapped for data URLs fetched fresh. A
 * crest the page already showed sits in the browser cache from a plain image
 * request, and some browsers (Safari especially) then refuse it to the
 * cross-origin read html2canvas makes, so the crest silently drops out of the
 * PDF. Fetching with the cache bypassed, and handing html2canvas the bytes,
 * avoids that. A picture that still can't be read keeps its link, as before.
 */
async function inlineImages(doc: Document) {
  const imgs = Array.from(doc.images).filter((img) => /^https?:/i.test(img.currentSrc || img.src));
  await Promise.all(imgs.map(async (img) => {
    const src = img.currentSrc || img.src;
    const data = await imageData(src, true);
    if (!data) return;
    const swapped = new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve(); });
    img.removeAttribute("srcset");
    img.src = data;
    await Promise.race([swapped, wait(3000)]);
  }));
}

/**
 * The canvas html2canvas draws on belongs to this page, not the frame, so the
 * frame's web fonts have to be loaded here too or the text falls back to Arial.
 */
async function shareFonts(doc: Document) {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href^="https://fonts.googleapis.com/"]'));
  await Promise.all(links.map((l) => {
    if (document.querySelector(`link[rel="stylesheet"][href="${CSS.escape(l.href)}"]`)) return Promise.resolve();
    const copy = document.createElement("link");
    copy.rel = "stylesheet";
    copy.href = l.href;
    const ready = new Promise<void>((resolve) => { copy.onload = copy.onerror = () => resolve(); });
    document.head.appendChild(copy);
    return ready;
  }));
  const faces: Promise<unknown>[] = [];
  doc.fonts?.forEach((f) => {
    if (f.status === "loaded") faces.push(document.fonts.load(`${f.style} ${f.weight} 16px "${f.family.replace(/"/g, "")}"`).catch(() => null));
  });
  await Promise.race([Promise.all(faces), wait(4000)]);
}

/** Everything a page break must not cut through, plus the forced breaks, in document pixels. */
function measure(doc: Document, pageH: number) {
  const view = doc.defaultView!;
  const sy = view.scrollY;
  const keep: Box[] = [];
  const forced = new Set<number>();
  const glueAfter: Box[] = [];
  const add = (r: DOMRect | DOMRectReadOnly) => { if (r.height > 0) keep.push({ top: r.top + sy, bottom: r.bottom + sy }); };
  // Every element's box, keyed by a data attribute the cloned copies keep, so each page can hide what isn't its own.
  const boxes: Box[] = [];

  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>("*"))) {
    const cs = view.getComputedStyle(el);
    if (cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    el.setAttribute("data-pdf-box", String(boxes.length));
    boxes.push({ top: r.top + sy, bottom: r.bottom + sy });
    if (r.height <= 0) continue;
    if (cs.breakBefore === "page" || cs.breakBefore === "always") forced.add(Math.round(r.top + sy));
    if (cs.breakAfter === "page" || cs.breakAfter === "always") forced.add(Math.round(r.bottom + sy));
    const atomic = cs.breakInside === "avoid" || cs.breakInside === "avoid-page" || el.tagName === "TR" || el.tagName === "IMG" || el.tagName === "svg";
    // Something taller than a page has to split somewhere; its lines still won't.
    if (atomic && r.height < pageH * 0.95) add(r);
    if (cs.breakAfter === "avoid" || cs.breakAfter === "avoid-page") glueAfter.push({ top: r.top + sy, bottom: r.bottom + sy });
  }

  // Every line of text.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) add(r);
  }

  // A heading stays with the first thing after it.
  for (const h of glueAfter) {
    let next: Box | null = null;
    for (const b of keep) if (b.top >= h.bottom - 1 && (!next || b.top < next.top)) next = b;
    if (next && next.bottom - h.top < pageH * 0.9) keep.push({ top: h.top, bottom: next.bottom });
  }

  return { keep, boxes, forced: Array.from(forced).sort((a, b) => a - b) };
}

/** Page slices [top, bottom) in document pixels. */
function paginate(total: number, pageH: number, keep: Box[], forced: number[]): Box[] {
  const pages: Box[] = [];
  let start = 0;
  while (start < total - 2) {
    const limit = start + pageH;
    const force = forced.find((f) => f > start + 2 && f < limit);
    let cut: number;
    if (force != null) cut = force;
    else if (limit >= total) cut = total;
    else {
      // Walk the cut up past anything it would slice through.
      cut = limit;
      for (;;) {
        let above = cut;
        for (const b of keep) if (b.top < cut - 0.5 && b.bottom > cut + 0.5 && b.top < above) above = b.top;
        if (above === cut) break;
        cut = Math.floor(above);
      }
      // Nowhere clean to break in the bottom four-fifths of the page: cut where it is full.
      if (cut < start + pageH * 0.2) cut = limit;
    }
    pages.push({ top: start, bottom: cut });
    // A new page doesn't open on the gap a break left behind.
    let next = cut;
    if (force == null) {
      let first = Infinity;
      for (const b of keep) if (b.top >= cut && b.top < first) first = b.top;
      if (first - cut < 48) next = Math.max(cut, Math.floor(first) - 2);
    }
    start = next;
  }
  return pages;
}

async function imageData(url: string, fresh = false): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors", cache: fresh ? "no-store" : "default" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Renders a print-ready HTML document to an A4 PDF. */
export async function htmlToPdf(html: string, setup: PdfPageSetup): Promise<Blob> {
  const { margin, footer, header } = setup;
  const contentW = A4.w - margin.side * 2;
  const contentH = A4.h - margin.top - margin.bottom;
  const widthPx = Math.round(contentW * PX_PER_MM);
  const pageH = contentH * PX_PER_MM;

  const frame = await mountFrame(html, widthPx);
  try {
    const doc = frame.contentDocument!;
    const [, logo] = await Promise.all([shareFonts(doc), footer?.logoUrl ? imageData(footer.logoUrl) : Promise.resolve(null), inlineImages(doc)]);
    await nextFrame();
    const total = doc.documentElement.scrollHeight;
    const { keep, boxes, forced } = measure(doc, pageH);
    const pages = paginate(total, pageH, keep, forced);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    if (setup.title) pdf.setProperties({ title: setup.title, creator: "Swish Assistant" });
    const mmPerPx = contentW / widthPx;

    for (let i = 0; i < pages.length; i++) {
      const { top, bottom } = pages[i];
      // Small things that hang past their box (a shirt-number badge on a photo) belong to the page their box
      // starts on: that page draws a little past the break to show them whole, and the next page hides them.
      let overhang = 0;
      for (const b of boxes) if (b.top < bottom - 0.5 && b.bottom > bottom && b.bottom - bottom <= OVERHANG_PX) overhang = Math.max(overhang, b.bottom - bottom);
      if (i === pages.length - 1) overhang = 0;
      const h = Math.max(1, Math.ceil(bottom - top + overhang));
      const canvas = await html2canvas(doc.documentElement, {
        x: 0, y: top, width: widthPx, height: h,
        windowWidth: widthPx, windowHeight: total, scrollX: 0, scrollY: 0,
        scale: SCALE, useCORS: true, backgroundColor: "#ffffff", logging: false,
        onclone: (clone) => {
          clone.querySelectorAll<HTMLElement>("[data-pdf-box]").forEach((el) => {
            const b = boxes[Number(el.getAttribute("data-pdf-box"))];
            if (!b) return;
            const nextPages = overhang > 0 && b.top >= bottom - 0.5;
            const lastPages = b.top < top - 0.5 && b.bottom > top && b.bottom - top <= OVERHANG_PX;
            if (nextPages || lastPages) el.style.visibility = "hidden";
          });
        },
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", margin.side, margin.top, contentW, h * mmPerPx, undefined, "FAST");
      canvas.width = canvas.height = 0;

      // Footer, sitting in the bottom margin like the print version's.
      const y = A4.h - margin.bottom / 2 + 1;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.2);
      pdf.setTextColor(29, 36, 51);
      let x = margin.side;
      if (logo) {
        try { pdf.addImage(logo, "PNG", x, y - 3, 4, 4); x += 4.8; } catch { /* footer text alone */ }
      }
      if (footer?.left) pdf.text(footer.left, x, y);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(5.8);
      pdf.setTextColor(138, 147, 165);
      if (footer?.center) {
        const room = contentW - 70;
        const text = pdf.splitTextToSize(footer.center, room)[0] ?? "";
        pdf.text(text, A4.w / 2, y, { align: "center" });
      }
      pdf.text(`Page ${i + 1} of ${pages.length}`, A4.w - margin.side, y, { align: "right" });

      if (header && i > 0) {
        const hy = margin.top / 2 + 1;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(5.6);
        pdf.setCharSpace(0.5);
        pdf.setTextColor(93, 103, 121);
        if (header.left) pdf.text(header.left.toUpperCase(), margin.side, hy);
        pdf.setTextColor(138, 147, 165);
        if (header.right) pdf.text(header.right.toUpperCase(), A4.w - margin.side, hy, { align: "right" });
        pdf.setCharSpace(0);
      }

      setup.onProgress?.(i + 1, pages.length);
      await nextFrame();
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}
