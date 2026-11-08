import { useCallback, useEffect, useRef, useState } from "react";
import { saveFile } from "@/lib/saveFile";

/**
 * One tap to a PDF file: makes it, then downloads it (desktop) or opens the
 * share sheet with "Save to Files" (phones). A big report can take longer to
 * draw than a phone allows between the tap and the share sheet; then the
 * button turns into "Save PDF" and the next tap shares the finished file.
 */

export type PdfFile = { blob: Blob; fileName: string };
type Make = (onProgress: (done: number, total: number) => void) => Promise<PdfFile>;

export type PdfDownloadState = "idle" | "making" | "ready" | "saved" | "error";

export function usePdfDownload() {
  const [state, setState] = useState<PdfDownloadState>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const ready = useRef<PdfFile | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const settle = (next: PdfDownloadState) => {
    setState(next);
    clearTimeout(timer.current);
    if (next === "saved" || next === "error") timer.current = setTimeout(() => setState("idle"), next === "saved" ? 2500 : 6000);
  };

  const save = useCallback(async () => {
    const file = ready.current;
    if (!file) return;
    const result = await saveFile(file.blob, file.fileName);
    if (result === "cancelled") return; // keep the ready file for another go
    ready.current = null;
    settle("saved");
  }, []);

  const start = useCallback(async (make: Make) => {
    if (busy.current) return;
    if (ready.current) return save();
    busy.current = true;
    setProgress(null);
    settle("making");
    try {
      const file = await make((done, total) => setProgress({ done, total }));
      const result = await saveFile(file.blob, file.fileName, { retryOnTap: true });
      if (result === "needs-tap") {
        ready.current = file;
        settle("ready");
      } else {
        settle(result === "cancelled" ? "idle" : "saved");
      }
    } catch (err) {
      console.error("PDF download failed:", err);
      settle("error");
    } finally {
      busy.current = false;
    }
  }, [save]);

  const label =
    state === "making" ? (progress && progress.total > 1 ? `Making PDF ${progress.done}/${progress.total}` : "Making PDF…")
    : state === "ready" ? "Save PDF"
    : state === "saved" ? "PDF saved"
    : "Download PDF";

  return {
    state,
    label,
    start,
    busy: state === "making",
    /** A short line to show under the button, or null. */
    message:
      state === "ready" ? "Your PDF is ready. Tap Save PDF to keep or send it."
      : state === "error" ? "Couldn't make the PDF. Check your connection and try again."
      : null,
  };
}
