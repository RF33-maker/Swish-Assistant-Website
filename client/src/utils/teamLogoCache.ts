import { supabase } from "@/lib/supabase";
import { DEBUG, debugLog } from "./debug";

const logoCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();
const dbLogosCache = new Map<string, Map<string, string>>();
const dbLogosFetching = new Map<string, Promise<Map<string, string>>>();

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

async function getDbLogosForLeague(leagueId: string): Promise<Map<string, string>> {
  if (dbLogosCache.has(leagueId)) {
    return dbLogosCache.get(leagueId)!;
  }

  if (dbLogosFetching.has(leagueId)) {
    return dbLogosFetching.get(leagueId)!;
  }

  const fetchPromise = (async () => {
    const map = new Map<string, string>();
    try {
      const { data, error } = await supabase
        .from("team_logos")
        .select("team_name, logo_url")
        .eq("league_id", leagueId);

      if (!error && data) {
        data.forEach((row: any) => {
          if (row.team_name && row.logo_url) {
            map.set(row.team_name, row.logo_url);
            map.set(normalizeTeamName(row.team_name), row.logo_url);
          }
        });
      }
    } catch (err) {
      debugLog("[TeamLogoCache] Error fetching team_logos table:", err);
    }
    dbLogosCache.set(leagueId, map);
    dbLogosFetching.delete(leagueId);
    return map;
  })();

  dbLogosFetching.set(leagueId, fetchPromise);
  return fetchPromise;
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
      const dbLogos = await getDbLogosForLeague(leagueId);
      const dbUrl = dbLogos.get(teamName) || dbLogos.get(normalizeTeamName(teamName));
      if (dbUrl) {
        debugLog(`[TeamLogoCache] Found logo in DB for "${teamName}"`);
        logoCache.set(cacheKey, dbUrl);
        inFlight.delete(cacheKey);
        return dbUrl;
      }

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
  dbLogosCache.delete(leagueId);
}

export function clearLogoCache(): void {
  logoCache.clear();
  inFlight.clear();
  dbLogosCache.clear();
  dbLogosFetching.clear();
}
