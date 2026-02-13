import { supabase } from "@/lib/supabase";
import { DEBUG, debugLog } from "./debug";

const logoCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

export function normalizeTeamName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "");
}

function normalizeTeamNameForFile(name: string): string {
  let normalized = name.trim();
  normalized = normalized.replace(/\s+Senior\s+Men\s*/gi, " ");
  normalized = normalized.replace(/!/g, "");
  normalized = normalized.replace(/\s+I(?![IVX])\s*$/i, "");
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized.replace(/\s+/g, "_");
}

interface GetTeamLogoCachedArgs {
  leagueId: string;
  teamName: string;
  bucket?: string;
}

export async function getTeamLogoCached(
  args: GetTeamLogoCachedArgs
): Promise<string | null> {
  const { leagueId, teamName, bucket = "team-logos" } = args;

  if (!leagueId || !teamName) {
    return null;
  }

  const cacheKey = `${leagueId}::${normalizeTeamName(teamName)}`;

  if (logoCache.has(cacheKey)) {
    return logoCache.get(cacheKey)!;
  }

  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey)!;
  }

  const fetchPromise = (async (): Promise<string | null> => {
    try {
      const extensions = ["png", "jpg", "jpeg", "gif", "webp"];

      const normalizedFileName = normalizeTeamNameForFile(teamName);
      const originalFileName = teamName.replace(/\s+/g, "_");

      const filenamesToTry = [
        normalizedFileName,
        originalFileName,
        `${normalizedFileName}_Senior_Men`,
        `${normalizedFileName}_Senior_Men_I`,
        `${originalFileName}_Senior_Men`,
        `${originalFileName}_Senior_Men_I`,
      ];

      const uniqueFilenames = Array.from(new Set(filenamesToTry));

      if (DEBUG) {
        debugLog(`[TeamLogoCache] Trying filenames for "${teamName}":`, uniqueFilenames);
      }

      for (const baseFileName of uniqueFilenames) {
        for (const ext of extensions) {
          const fileName = `${leagueId}_${baseFileName}.${ext}`;

          const { data } = supabase.storage
            .from(bucket)
            .getPublicUrl(fileName);

          try {
            const response = await fetch(data.publicUrl, { method: "HEAD" });
            if (response.ok) {
              const lastModified = response.headers.get("last-modified");
              const cacheBuster = lastModified
                ? new Date(lastModified).getTime()
                : Date.now();
              const urlWithCacheBuster = `${data.publicUrl}?t=${cacheBuster}`;

              debugLog(`[TeamLogoCache] Found logo: ${fileName}`);

              logoCache.set(cacheKey, urlWithCacheBuster);
              inFlight.delete(cacheKey);
              return urlWithCacheBuster;
            }
          } catch {
            // Continue to next extension
          }
        }
      }

      logoCache.set(cacheKey, null);
      inFlight.delete(cacheKey);
      return null;
    } catch (error) {
      debugLog("[TeamLogoCache] Error fetching logo:", error);
      logoCache.set(cacheKey, null);
      inFlight.delete(cacheKey);
      return null;
    }
  })();

  inFlight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export function invalidateLogoCacheEntry(leagueId: string, teamName: string): void {
  const cacheKey = `${leagueId}::${normalizeTeamName(teamName)}`;
  logoCache.delete(cacheKey);
  inFlight.delete(cacheKey);
}

export function clearLogoCache(): void {
  logoCache.clear();
  inFlight.clear();
}
