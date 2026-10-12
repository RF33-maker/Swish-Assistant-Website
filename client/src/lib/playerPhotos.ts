import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Player photos for Swish Social: uploading one, pointing a player's records
 * at it, and telling every open studio so its cards redraw straight away,
 * with no reload and no filters to set again.
 */

const BUCKET = "player-photos";

export type PlayerRef = {
  /** The players row the photo is being added from, when there is one. */
  playerId?: string | null;
  name: string;
};

export type PlayerPhotoChange = {
  path: string;
  url: string;
  /** Every players row that now points at the photo. */
  playerIds: string[];
  /** The player's name, for views that lend a photo to a namesake record. */
  nameKey: string;
};

export type PhotoChoice = { path: string; url: string };

export function playerPhotoUrl(path: string, version?: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return version ? `${data.publicUrl}?v=${encodeURIComponent(version)}` : data.publicUrl;
}

export const playerNameKey = (name: string | null | undefined) => (name || "").toLowerCase().replace(/\s+/g, " ").trim();

/** Lineup stints can name someone with no players row; those carry a name key where the id should be. */
export const isPlayerId = (id: string | null | undefined): id is string =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// The player's folder also holds profile-page cutouts (primary.*), the
// headshot batches (headshot-*) and their generated thumb/web variants.
// Only the plain uploads are candidates for the socials photo.
const isSocialPhotoFile = (name: string) =>
  !name.startsWith(".") && !name.startsWith("headshot-") && !/\.(thumb|web)\.webp$/i.test(name);

// ── Telling the studios ────────────────────────────────────────────────────

type Listener = (change: PlayerPhotoChange) => void;
const listeners = new Set<Listener>();

/** Runs `handler` whenever a player's photo is added or switched anywhere in Swish Social. */
export function usePlayerPhotoChange(handler: Listener) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener: Listener = (change) => latest.current(change);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}

/** True when the change reached this record. */
export function photoChangeReaches(change: PlayerPhotoChange, playerId: string | null | undefined): boolean {
  return !!playerId && change.playerIds.includes(playerId);
}

/**
 * The weekly, leaders and lineup feeds lend a player with no photo the one
 * from another record with the same name. This mirrors that, so a card
 * patched in place shows what a reload would.
 */
export function photoChangeLendsTo(
  change: PlayerPhotoChange,
  player: { playerId?: string | null; name?: string | null; hasPhoto: boolean },
): boolean {
  if (photoChangeReaches(change, player.playerId)) return true;
  return !player.hasPhoto && !!change.nameKey && playerNameKey(player.name) === change.nameKey;
}

// ── Whose records ──────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type PlayerGroup = {
  /** Every players row treated as this person. */
  ids: string[];
  /** A linked identity group keeps its own copy of the photo. */
  identityId: string | null;
};

/**
 * One person usually has a players row per competition. Their identity group
 * (or verified claim) says which rows are theirs; without one, every row with
 * exactly the same name counts. The row the request came from is always
 * included, whatever it is called ("J. Walton").
 */
async function findPlayerGroup(player: PlayerRef): Promise<PlayerGroup> {
  const ids = new Set<string>();
  const playerId = isPlayerId(player.playerId) ? player.playerId : null;
  if (playerId) ids.add(playerId);
  let identityId: string | null = null;
  let linked = false;

  if (playerId) {
    try {
      const res = await fetch(`/api/player-identities/for-player/${playerId}`, { headers: await authHeaders() });
      if (res.ok) {
        const { identity } = (await res.json()) as { identity: { id: string; playerIds?: string[] } | null };
        if (identity?.playerIds?.length) {
          linked = true;
          identity.playerIds.forEach((id) => ids.add(id));
          // A verified claim groups rows the same way but has no identity record ("claim:<id>").
          if (!identity.id.startsWith("claim:")) identityId = identity.id;
        }
      }
    } catch (err) {
      console.warn("[playerPhotos] Identity lookup failed, matching by name instead:", err);
    }
  }

  const name = player.name.trim();
  if (!linked && name) {
    const { data, error } = await supabase
      .from("players")
      .select("id")
      .ilike("full_name", name.replace(/[\\%_]/g, "\\$&"));
    if (error) console.warn("[playerPhotos] Could not look up records by name:", error);
    (data || []).forEach((row: { id: string }) => ids.add(row.id));
  }

  return { ids: Array.from(ids), identityId };
}

// ── Changing the photo ─────────────────────────────────────────────────────

/** Points every record for this player at `path` and tells the open studios. */
export async function applyPlayerPhoto(player: PlayerRef, path: string): Promise<PlayerPhotoChange> {
  const group = await findPlayerGroup(player);
  if (group.ids.length === 0) throw new Error("No player record found to attach the photo to.");

  if (group.identityId) {
    const res = await fetch(`/api/player-identities/${group.identityId}/sync-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ photoPath: path }),
    }).catch(() => null);
    // The rows are updated below either way; this only keeps the group's own copy in step.
    if (!res?.ok) console.warn("[playerPhotos] Identity group photo not updated:", res?.status);
  }

  const { data, error } = await supabase.from("players").update({ photo_path: path }).in("id", group.ids).select("id");
  if (error) throw error;
  const playerIds = (data || []).map((row: { id: string }) => row.id);
  if (playerIds.length === 0) {
    throw new Error("The photo couldn't be linked to the player. Check you are signed in as an admin.");
  }

  const change: PlayerPhotoChange = { path, url: playerPhotoUrl(path), playerIds, nameKey: playerNameKey(player.name) };
  listeners.forEach((listener) => listener(change));
  return change;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function extensionFor(file: File): string {
  const fromName = (file.name.includes(".") ? file.name.split(".").pop() || "" : "").toLowerCase();
  return EXTENSIONS[file.type] || (/^[a-z0-9]{2,5}$/.test(fromName) ? fromName : "jpg");
}

/** Cards are drawn in the browser, so a photo it can't decode (HEIC straight off a phone, say) would upload and then never show. */
function browserCanShow(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (ok: boolean) => {
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    img.src = url;
  });
}

/** Uploads a new photo into the player's folder and links it to all their records. */
export async function uploadPlayerPhoto(player: PlayerRef & { playerId: string }, file: File): Promise<PlayerPhotoChange> {
  if (!isPlayerId(player.playerId)) throw new Error("This player has no record to attach a photo to.");
  if (!(await browserCanShow(file))) {
    throw new Error("That file isn't a picture a browser can show. Save it as a JPG or PNG and try again.");
  }

  // A new file name for every upload, so a re-upload can never be served
  // from the cache of an earlier one, and earlier photos stay selectable.
  // (The profile page keeps its cutouts at <id>/primary.*; stay clear of it.)
  const path = `${player.playerId}/social-${Date.now()}.${extensionFor(file)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type || undefined,
  });
  if (error) throw error;

  return applyPlayerPhoto(player, path);
}

// ── What is already on file ────────────────────────────────────────────────

/**
 * Photos already held for this player, newest first: what their records point
 * at, plus earlier uploads in their folders. Profile-page cutouts are left
 * out. `current` is the photo on the record asked about.
 */
export async function listPlayerPhotos(player: PlayerRef): Promise<{ current: string | null; choices: PhotoChoice[] }> {
  const { ids } = await findPlayerGroup(player);
  if (ids.length === 0) return { current: null, choices: [] };

  const [{ data: rows }, folders] = await Promise.all([
    supabase.from("players").select("id, photo_path, photo_path_bg_removed").in("id", ids),
    Promise.all(
      ids.map(async (id) => {
        const { data } = await supabase.storage
          .from(BUCKET)
          .list(id, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
        return (data || [])
          .filter((f) => f.id && isSocialPhotoFile(f.name))
          .map((f) => ({ path: `${id}/${f.name}`, version: f.updated_at || f.created_at || "" }));
      }),
    ),
  ]);

  const records = (rows || []) as { id: string; photo_path: string | null; photo_path_bg_removed: string | null }[];
  const cutouts = new Set(records.map((r) => r.photo_path_bg_removed).filter(Boolean));
  const found = new Map<string, string>();
  folders
    .flat()
    .filter((f) => !cutouts.has(f.path))
    .forEach((f) => found.set(f.path, f.version));
  // A record can point at a photo kept in a folder outside this group.
  records.forEach((r) => {
    if (r.photo_path && !found.has(r.photo_path)) found.set(r.photo_path, "");
  });

  const choices = Array.from(found.entries())
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([path, version]) => ({ path, url: playerPhotoUrl(path, version || undefined) }));
  const own = player.playerId ? records.find((r) => r.id === player.playerId) : records.find((r) => r.photo_path);

  return { current: own?.photo_path ?? null, choices };
}
