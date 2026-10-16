/**
 * Saves a generated file on desktop and phones.
 *
 * jsPDF's own `save()` falls back to navigating the tab to a data URL on iOS
 * Safari, which hangs on larger files and strands the user on the PDF with no
 * way back. On touch devices we hand the file to the native share sheet instead
 * ("Save to Files", AirDrop, Drive...) and only fall back to an anchor download
 * when that is unavailable.
 */

export type SaveResult = "shared" | "downloaded" | "cancelled";

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  // iPadOS reports itself as a Mac, so also check for touch points.
  const ipad = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return coarse || ipad || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export async function saveFile(blob: Blob, fileName: string): Promise<SaveResult> {
  if (isTouchDevice() && typeof navigator.canShare === "function" && typeof navigator.share === "function") {
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return "shared";
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return "cancelled";
        // NotAllowedError (the user gesture expired during a slow render) and
        // the like: fall through to a normal download.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking straight away cancels the download on mobile browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
