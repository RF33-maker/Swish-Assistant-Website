import { useRef, useState } from "react";
import { templates } from ".";
import { ScoutingReport } from "@/types/reportSchema";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export default function ReportPreview({
  data, templateId, onExported,
}: { data: ScoutingReport; templateId: string; onExported?: (blob: Blob) => void; }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tpl = templates.find(t => t.id === templateId) ?? templates[0];
  const [exportingPdf, setExportingPdf] = useState(false);

  async function exportPng() {
    if (!containerRef.current) return;
    const canvas = await html2canvas(containerRef.current, { scale: 2, useCORS: true });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.meta.player.replace(/\s+/g, "_")}_scouting.png`;
      a.click();
      URL.revokeObjectURL(url);
      onExported?.(blob);
    });
  }

  async function exportPdf() {
    if (!containerRef.current || exportingPdf) return;
    setExportingPdf(true);
    try {
      const canvas = await html2canvas(containerRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");

      // Fit the captured canvas onto A4 pages, preserving aspect ratio.
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pageHeight) {
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      } else {
        // Report is taller than one A4 page — slice it across multiple pages.
        let remainingHeight = imgHeight;
        let position = 0;
        while (remainingHeight > 0) {
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          remainingHeight -= pageHeight;
          position -= pageHeight;
          if (remainingHeight > 0) pdf.addPage();
        }
      }

      pdf.save(`${data.meta.player.replace(/\s+/g, "_")}_scouting.pdf`);
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border dark:border-neutral-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-neutral-800">
        <div className="text-sm text-slate-700 dark:text-slate-300">Template: <strong className="text-slate-900 dark:text-white">{tpl.name}</strong></div>
        <div className="flex items-center gap-2">
          <button onClick={exportPng} className="text-sm px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700">
            Export PNG
          </button>
          <button
            onClick={exportPdf}
            disabled={exportingPdf}
            className="text-sm px-3 py-1.5 rounded-md bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {exportingPdf ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>
      <div ref={containerRef} className="p-4 flex justify-center">
        {tpl.render(data)}
      </div>
    </div>
  );
}