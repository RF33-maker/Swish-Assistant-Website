import { supabase } from "@/lib/supabase";
import { PHOTO_COLUMNS, PHOTO_SIZES, VARIANT_RULES, variantWidth, type Photo, type PhotoPermission, type PhotoSize } from "@/lib/mediaSpotlight";

/**
 * Photo uploads, done in the browser.
 *
 * The site runs on serverless functions with a request limit of a few MB, so
 * a 25 MB original can't pass through the API. Instead the browser sends the
 * original straight to the private photo-originals bucket, untouched, and
 * makes the copies the site shows itself (sizes and quality in VARIANT_RULES:
 * the large one fills a 4K screen and is encoded so compression can't be
 * seen), uploading those to the public photo-web bucket. Re-encoding through
 * a canvas drops the EXIF block, so no camera or location data reaches the
 * public copies. Storage policies let a photographer write only under their
 * own folder.
 */

export const ORIGINAL_BUCKET = "photo-originals";
export const WEB_BUCKET = "photo-web";
export const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024;

export type VariantName = PhotoSize;
const VARIANT_NAMES: VariantName[] = PHOTO_SIZES;

export interface PreparedImage {
  width: number;
  height: number;
  dominantColor: string;
  variantExt: "webp" | "jpg";
  variants: Record<VariantName, Blob>;
}

const ACCEPTED = /^image\/(jpeg|png|webp|heic|heif)$/i;

export function acceptsFile(file: File): string | null {
  if (!ACCEPTED.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return "Only JPEG, PNG, WebP or HEIC images.";
  if (file.size > MAX_ORIGINAL_BYTES) return "Files must be 30 MB or smaller.";
  return null;
}

/** Decodes through an <img>, which honours EXIF orientation in every modern browser. */
function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser can't read that image. Try a JPEG."));
    };
    img.src = url;
  });
}

/** Scales down in halves for a clean result, then to the exact width. Never scales up. */
function downscale(source: CanvasImageSource, srcW: number, srcH: number, targetW: number): HTMLCanvasElement {
  let w = srcW;
  let h = srcH;
  let current: CanvasImageSource = source;
  while (w / 2 > targetW) {
    const c = document.createElement("canvas");
    c.width = Math.round(w / 2);
    c.height = Math.round(h / 2);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, c.width, c.height);
    current = c;
    w = c.width;
    h = c.height;
  }
  const out = document.createElement("canvas");
  out.width = Math.min(targetW, w);
  out.height = Math.round((out.width / w) * h);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(current, 0, 0, out.width, out.height);
  return out;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function averageColor(canvas: HTMLCanvasElement): string {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, 1, 1);
  const px = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Reads the image and makes the three web variants. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const img = await decode(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) throw new Error("Couldn't read the image size.");

  // Encode WebP where the browser can; older Safari gives back a PNG for a
  // WebP request, so fall back to JPEG there and say so in variant_ext.
  let variantExt: "webp" | "jpg" = "webp";
  const encode = async (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
    if (variantExt === "webp") {
      const webp = await toBlob(canvas, "image/webp", quality);
      if (webp && webp.type === "image/webp") return webp;
      variantExt = "jpg";
    }
    const jpg = await toBlob(canvas, "image/jpeg", Math.min(0.97, quality + 0.02));
    if (!jpg) throw new Error("Couldn't encode the image.");
    return jpg;
  };

  // Each copy is cut from the one above it, never enlarged past the original.
  const large = downscale(img, width, height, variantWidth(width, height, "large"));
  const medium = downscale(large, large.width, large.height, variantWidth(width, height, "medium"));
  const small = downscale(medium, medium.width, medium.height, variantWidth(width, height, "small"));
  const thumb = downscale(small, small.width, small.height, variantWidth(width, height, "thumb"));
  const dominantColor = averageColor(thumb);

  // Settle the format on the first encode so every copy matches.
  const largeBlob = await encode(large, VARIANT_RULES.large.quality);
  const mediumBlob = await encode(medium, VARIANT_RULES.medium.quality);
  const smallBlob = await encode(small, VARIANT_RULES.small.quality);
  const thumbBlob = await encode(thumb, VARIANT_RULES.thumb.quality);

  return { width, height, dominantColor, variantExt, variants: { thumb: thumbBlob, small: smallBlob, medium: mediumBlob, large: largeBlob } };
}

const extOf = (file: File) => {
  const m = file.name.match(/\.([a-z0-9]+)$/i);
  const ext = (m?.[1] || "").toLowerCase();
  if (ext) return ext === "jpeg" ? "jpg" : ext;
  return file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
};

export interface UploadFields {
  caption?: string;
  event_name?: string;
  taken_at?: string | null;
  permission: PhotoPermission;
  is_public?: boolean;
  is_showcase?: boolean;
}

/** Sends the original and the variants up, then records the photo. */
export async function uploadPhoto(
  photographerId: string,
  file: File,
  prepared: PreparedImage,
  fields: UploadFields,
  onProgress?: (step: string) => void,
): Promise<Photo> {
  const photoId = crypto.randomUUID();
  const originalPath = `${photographerId}/${photoId}.${extOf(file)}`;
  const webPath = `${photographerId}/${photoId}`;
  const mime = prepared.variantExt === "webp" ? "image/webp" : "image/jpeg";

  onProgress?.("Uploading original");
  const { error: origErr } = await supabase.storage
    .from(ORIGINAL_BUCKET)
    .upload(originalPath, file, { contentType: file.type || "image/jpeg", cacheControl: "31536000", upsert: false });
  if (origErr) throw new Error(`Original upload failed: ${origErr.message}`);

  for (const name of VARIANT_NAMES) {
    onProgress?.(`Uploading ${name}`);
    const { error } = await supabase.storage
      .from(WEB_BUCKET)
      .upload(`${webPath}/${name}.${prepared.variantExt}`, prepared.variants[name], { contentType: mime, cacheControl: "31536000", upsert: true });
    if (error) throw new Error(`${name} upload failed: ${error.message}`);
  }

  onProgress?.("Saving");
  const { data, error } = await supabase
    .from("photos")
    .insert({
      id: photoId,
      photographer_id: photographerId,
      storage_path: originalPath,
      web_path: webPath,
      variant_ext: prepared.variantExt,
      width: prepared.width,
      height: prepared.height,
      file_size: file.size,
      mime_type: file.type || null,
      dominant_color: prepared.dominantColor,
      caption: fields.caption?.trim() || null,
      event_name: fields.event_name?.trim() || null,
      taken_at: fields.taken_at || null,
      permission: fields.permission,
      is_public: fields.is_public ?? true,
      is_showcase: fields.is_showcase ?? false,
      consent_at: new Date().toISOString(),
    })
    .select(PHOTO_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as Photo;
}

/** Removes a photo's files and row. */
export async function deletePhoto(photo: Photo): Promise<void> {
  await supabase.storage.from(WEB_BUCKET).remove(VARIANT_NAMES.map((n) => `${photo.web_path}/${n}.${photo.variant_ext}`));
  await supabase.storage.from(ORIGINAL_BUCKET).remove([photo.storage_path]);
  const { error } = await supabase.from("photos").delete().eq("id", photo.id);
  if (error) throw new Error(error.message);
}

/** A square avatar, 512px, into the public bucket under the photographer's folder. */
export async function uploadAvatar(photographerId: string, file: File): Promise<string> {
  const img = await decode(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  // Crop to the square (held to a size every phone's canvas can take), then scale down in halves like a photo.
  const square = document.createElement("canvas");
  square.width = square.height = Math.min(side, 2560);
  const sctx = square.getContext("2d")!;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(img, sx, sy, side, side, 0, 0, square.width, square.height);
  const canvas = downscale(square, square.width, square.height, 640);
  let blob = await toBlob(canvas, "image/webp", 0.93);
  let ext = "webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await toBlob(canvas, "image/jpeg", 0.95);
    ext = "jpg";
  }
  if (!blob) throw new Error("Couldn't encode the avatar.");
  const path = `${photographerId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(WEB_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export const SPACE_BUCKET = "creator-space";

/** A board picture's two sizes: `path` is what the board shows, `full` what opens full-screen (absent when the picture is small). */
export interface SpaceUpload { path: string; w: number; h: number; full?: string }

const SPACE_SHOWN = 2048;
const SPACE_FULL = 3840;

/**
 * A picture shared on the creator board, into the private creator-space
 * bucket under the author's folder: one copy sized for the board, and a
 * full-size one (up to 4K on its long edge) for the full-screen view. Both are
 * re-encoded, which drops the EXIF block, at a quality where compression
 * can't be seen. A picture is never enlarged.
 */
export async function uploadSpaceImage(folder: string, file: File): Promise<SpaceUpload> {
  const img = await decode(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) throw new Error("Couldn't read the image size.");
  const long = Math.max(width, height);
  const widthAt = (edge: number) => Math.max(1, Math.round(width * Math.min(1, edge / long)));

  let ext: "webp" | "jpg" = "webp";
  const encode = async (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
    if (ext === "webp") {
      const webp = await toBlob(canvas, "image/webp", quality);
      if (webp && webp.type === "image/webp") return webp;
      ext = "jpg";
    }
    const jpg = await toBlob(canvas, "image/jpeg", Math.min(0.97, quality + 0.02));
    if (!jpg) throw new Error("Couldn't encode the image.");
    return jpg;
  };
  const put = async (path: string, blob: Blob) => {
    const { error } = await supabase.storage.from(SPACE_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
    if (error) throw new Error(error.message);
  };

  const id = crypto.randomUUID();
  const fullCanvas = downscale(img, width, height, widthAt(SPACE_FULL));
  const shownCanvas = downscale(fullCanvas, fullCanvas.width, fullCanvas.height, widthAt(SPACE_SHOWN));
  // Small pictures need only the one copy, at the full-size quality.
  const twoSizes = long > SPACE_SHOWN;
  const shown = await encode(shownCanvas, twoSizes ? 0.93 : 0.95);
  const path = `${folder}/posts/${id}.${ext}`;
  await put(path, shown);
  if (!twoSizes) return { path, w: shownCanvas.width, h: shownCanvas.height };
  const full = `${folder}/posts/${id}-full.${ext}`;
  await put(full, await encode(fullCanvas, 0.95));
  return { path, w: shownCanvas.width, h: shownCanvas.height, full };
}

/** A short-lived link to the full-quality original, for the photographer and admins only. */
export async function originalDownloadUrl(photo: Photo): Promise<string> {
  const { data, error } = await supabase.storage.from(ORIGINAL_BUCKET).createSignedUrl(photo.storage_path, 60 * 10, { download: true });
  if (error || !data) throw new Error(error?.message || "Couldn't create a download link.");
  return data.signedUrl;
}
