import { supabase } from "@/lib/supabase";

/**
 * Builds the two web-sized variants of a background-removed headshot in the
 * browser, at upload time (see components/PlayerHeadshot.tsx for what they
 * are and who reads them).
 *
 * The framing rules mirror the batch script that generated variants for the
 * existing library, so a photo uploaded here looks the same in an avatar as
 * one processed there: the head is found from the cutout's silhouette, and
 * the thumbnail shows it with some shoulder.
 */

const THUMB_PX = 192;
const WEB_MAX = 900;

interface Row { y: number; left: number; right: number }

/** Square (x, y, side) framing the head with some shoulder, from the alpha channel. */
function headBox(alpha: Uint8ClampedArray, width: number, height: number): { x: number; y: number; side: number } {
  const solid = (x: number, y: number) => alpha[(y * width + x) * 4 + 3] > 128;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height && top < 0; y++) for (let x = 0; x < width; x += 2) if (solid(x, y)) { top = y; break; }
  for (let y = height - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < width; x += 2) if (solid(x, y)) { bottom = y; break; }
  // No transparency to read (e.g. a JPEG): frame the top of the image.
  if (top < 0 || bottom - top < 20) return { x: 0, y: 0, side: Math.min(width, height) };

  const step = Math.max(1, Math.floor((bottom - top) / 400));
  const rows: Row[] = [];
  for (let y = top; y <= bottom; y += step) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x += step) if (solid(x, y)) { if (left < 0) left = x; right = x; }
    if (left >= 0) rows.push({ y, left, right });
  }
  if (rows.length < 20) return { x: 0, y: 0, side: Math.min(width, height) };

  const widths = rows.map((r) => r.right - r.left);
  const shoulder = Math.max(...widths);
  // Shoulders start where the silhouette first reaches most of its full
  // width; the neck is the narrowest row between the top of the head and
  // there — which copes with big hair, where the widest "head" row is hair.
  let shoulderIndex = widths.findIndex((w) => w >= 0.85 * shoulder);
  if (shoulderIndex < 0) shoulderIndex = widths.length - 1;
  let headHeight: number | null = null;
  const from = Math.max(1, Math.floor(shoulderIndex * 0.25));
  if (shoulderIndex - from >= 3) {
    let neck = from;
    for (let i = from; i < shoulderIndex; i++) if (widths[i] < widths[neck]) neck = i;
    if (widths[neck] < 0.75 * shoulder) headHeight = rows[neck].y - top;
  }
  if (headHeight == null || headHeight < 0.36 * shoulder || headHeight > shoulder) headHeight = 0.46 * shoulder;

  const headRows = rows.filter((r) => r.y <= top + headHeight! * 0.35);
  const centreRows = headRows.length ? headRows : rows.slice(0, 3);
  const cx = centreRows.reduce((s, r) => s + (r.left + r.right) / 2, 0) / centreRows.length;
  // Never tighter than most of the shoulder width, so a small avatar reads
  // as a person rather than a face crop.
  const side = Math.max(headHeight * 1.75, shoulder * 0.8);
  return { x: cx - side / 2, y: top - side * 0.09, side };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  // Safari can't encode WebP and silently returns PNG; the blob's own type is
  // sent as the content type, so the file is served correctly either way.
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

export async function buildHeadshotVariants(file: Blob): Promise<{ thumb: Blob; web: Blob } | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const source = document.createElement("canvas");
    source.width = bitmap.width;
    source.height = bitmap.height;
    const sourceCtx = source.getContext("2d", { willReadFrequently: true });
    if (!sourceCtx) return null;
    sourceCtx.drawImage(bitmap, 0, 0);
    const { data } = sourceCtx.getImageData(0, 0, source.width, source.height);
    const box = headBox(data, source.width, source.height);

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = THUMB_PX;
    thumbCanvas.height = THUMB_PX;
    const thumbCtx = thumbCanvas.getContext("2d");
    if (!thumbCtx) return null;
    thumbCtx.imageSmoothingQuality = "high";
    thumbCtx.drawImage(source, box.x, box.y, box.side, box.side, 0, 0, THUMB_PX, THUMB_PX);

    const scale = Math.min(1, WEB_MAX / Math.max(source.width, source.height));
    const webCanvas = document.createElement("canvas");
    webCanvas.width = Math.round(source.width * scale);
    webCanvas.height = Math.round(source.height * scale);
    const webCtx = webCanvas.getContext("2d");
    if (!webCtx) return null;
    webCtx.imageSmoothingQuality = "high";
    webCtx.drawImage(source, 0, 0, webCanvas.width, webCanvas.height);

    const [thumb, web] = await Promise.all([toBlob(thumbCanvas, 0.82), toBlob(webCanvas, 0.84)]);
    return thumb && web ? { thumb, web } : null;
  } finally {
    bitmap.close();
  }
}

/**
 * Generates and stores the variants for a headshot just uploaded to
 * `filePath`. Never throws: a photo without variants still displays (the
 * original is the fallback), so a failure here must not fail the upload.
 * Returns whether both variants were written.
 */
export async function uploadHeadshotVariants(file: Blob, filePath: string): Promise<boolean> {
  try {
    // If the variants can't be built, store the original under both names:
    // heavier, but never a stale thumbnail of the photo this one replaced.
    const variants = (await buildHeadshotVariants(file).catch(() => null)) ?? { thumb: file, web: file };
    const stem = filePath.replace(/\.[^./]+$/, "");
    const results = await Promise.all(
      (["thumb", "web"] as const).map((kind) =>
        supabase.storage.from("player-photos").upload(`${stem}.${kind}.webp`, variants[kind], {
          upsert: true,
          // Short cache so a replaced photo's variants are picked up promptly.
          cacheControl: "60",
          contentType: variants[kind].type || "image/webp",
        }),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) console.error("Headshot variants upload failed:", failed.error.message);
    return !failed;
  } catch (error) {
    console.error("Headshot variants could not be generated:", error);
    return false;
  }
}
