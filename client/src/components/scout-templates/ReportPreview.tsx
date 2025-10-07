import { useRef } from "react";
import { templates } from ".";
import { ScoutingReport } from "@/types/reportSchema";
import html2canvas from "html2canvas";

export default function ReportPreview({
  data, templateId, onExported,
}: { data: ScoutingReport; templateId: string; onExported?: (blob: Blob) => void; }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tpl = templates.find(t => t.id === templateId) ?? templates[0];

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

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="text-sm">Template: <strong>{tpl.name}</strong></div>
        <button onClick={exportPng} className="text-sm px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700">
          Export PNG
        </button>
      </div>
      <div ref={containerRef} className="p-4 flex justify-center">
        {tpl.render(data)}
      </div>
    </div>
  );
}