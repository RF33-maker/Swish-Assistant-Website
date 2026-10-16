import { useRef, useState } from "react";
import { templates } from ".";
import { ScoutingReport } from "@/types/reportSchema";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { saveFile } from "@/lib/saveFile";

const MAX_CANVAS_PIXELS = 12_000_000;

export default function ReportPreview({
  data, templateId, onExported,
}: { data: ScoutingReport; templateId: string; onExported?: (blob: Blob) => void; }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tpl = templates.find(t => t.id === templateId) ?? templates[0];
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileBase = data.meta.player.replace(/\s+/g, "_");

  // Phones cap canvas area (iOS Safari: ~16M px), and a 2x capture of a tall
  // report blows past it, so scale down to stay well inside the limit.
  async function capture() {
    const el = containerRef.current!;
    const area = el.scrollWidth * el.scrollHeight;
    const scale = Math.max(1, Math.min(2, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(area, 1))));
    return html2canvas(el, { scale, useCORS: true });
  }

  async function exportPng() {
    if (!containerRef.current || exporting) return;
    setExporting("png");
    setError(null);
    try {
      const canvas = await capture();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not render the report image");
      await saveFile(blob, `${fileBase}_scouting.png`);
      onExported?.(blob);
    } catch (err) {
      console.error("Scouting report PNG export failed:", err);
      setError("Could not export the image. Try again.");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    if (!containerRef.current || exporting) return;
    setExporting("pdf");
    setError(null);
    try {
      const canvas = await capture();

      // Fit the captured canvas onto A4 pages, preserving aspect ratio. Each
      // page gets its own JPEG slice, so the file stays small and the browser
      // isn't asked to hash one huge PNG per page.
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const slicePx = Math.floor((pageHeight * canvas.width) / pageWidth);

      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");

      for (let top = 0, page = 0; top < canvas.height; top += slicePx, page++) {
        const h = Math.min(slicePx, canvas.height - top);
        slice.height = h;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, h);
        ctx.drawImage(canvas, 0, top, canvas.width, h, 0, 0, canvas.width, h);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, pageWidth, (h * pageWidth) / canvas.width);
        // Yield so the "Exporting…" state paints and the page stays responsive on phones.
        await new Promise((r) => setTimeout(r, 0));
      }

      await saveFile(pdf.output("blob"), `${fileBase}_scouting.pdf`);
    } catch (err) {
      console.error("Scouting report PDF export failed:", err);
      setError("Could not export the PDF. Try again.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border dark:border-neutral-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-neutral-800">
        <div className="text-sm text-slate-700 dark:text-slate-300">Template: <strong className="text-slate-900 dark:text-white">{tpl.name}</strong></div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPng}
            disabled={!!exporting}
            className="text-sm px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {exporting === "png" ? "Exporting…" : "Export PNG"}
          </button>
          <button
            onClick={exportPdf}
            disabled={!!exporting}
            className="text-sm px-3 py-1.5 rounded-md bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {exporting === "pdf" ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>
      {error && <p className="px-4 py-2 text-xs text-red-600" role="alert">{error}</p>}
      <div ref={containerRef} className="p-4 flex justify-center">
        {tpl.render(data)}
      </div>
    </div>
  );
}