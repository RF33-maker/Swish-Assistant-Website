import { supabase } from "@/lib/supabase";

const urlCache = new Map<string, string>();

export function getPlayerPhotoUrlCached(
  path: string | null | undefined,
  version?: string | number | null,
  bucket: string = "player-photos"
): string | null {
  if (!path) return null;
  const key = `${bucket}::${path}`;
  let baseUrl = urlCache.get(key);
  if (!baseUrl) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (!data?.publicUrl) return null;
    baseUrl = data.publicUrl;
    urlCache.set(key, baseUrl);
  }
  return version ? `${baseUrl}?v=${version}` : baseUrl;
}

export function invalidatePlayerPhotoUrl(
  path: string | null | undefined,
  bucket: string = "player-photos"
): void {
  if (!path) return;
  urlCache.delete(`${bucket}::${path}`);
}

export function clearPlayerPhotoCache(): void {
  urlCache.clear();
}
