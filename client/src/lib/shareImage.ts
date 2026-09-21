/**
 * Phones can't write to Photos directly from a web page; the share sheet's
 * "Save Image" is the way in. Only touch devices that can share files get it, so
 * desktops keep their normal download.
 */
export function supportsFileSharing(file: File): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] }) &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/** Opens the share sheet with just the file (no title/text, which would hide Save Image on iOS). */
export async function shareImageFile(file: File): Promise<"shared" | "cancelled" | "failed"> {
  try {
    await navigator.share({ files: [file] });
    return "shared";
  } catch (err) {
    return (err as Error)?.name === "AbortError" ? "cancelled" : "failed";
  }
}
