import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Media Spotlight: the photographers who shoot the game, their photos, and
 * what Swish may do with each one. Public reads go straight to Supabase
 * (RLS decides what's visible); claims, invites and the "get involved" form
 * go through the server (server/mediaSpotlight.ts).
 */

export type PhotoPermission = "showcase_only" | "use_with_credit" | "ask_first" | "paid_license";
export type PhotographerStatus = "unclaimed" | "claimed" | "hidden";
export type ContactPreference = "instagram" | "x" | "website" | "email";
export type PhotoTagType = "player" | "team" | "league" | "event";
export type PhotoSize = "thumb" | "small" | "medium" | "large";
/** What a creator makes. Everyone here started as a photographer; the profile now covers the rest of the media crew too. */
export type Craft = "photo" | "video" | "design" | "social" | "writing" | "commentary";
/** What a creator is open to, shown to other creators so they know what to ask. */
export type OpenTo = "collabs" | "second_shooter" | "club_work" | "paid_work" | "mentoring";

export interface Socials {
  instagram?: string;
  x?: string;
  website?: string;
  email?: string;
}

export interface Photographer {
  id: string;
  user_id: string | null;
  slug: string;
  display_name: string;
  handle: string | null;
  bio: string | null;
  location: string | null;
  avatar_path: string | null;
  socials: Socials;
  contact_preference: ContactPreference;
  credit_line: string | null;
  default_permission: PhotoPermission;
  teams: string[];
  crafts: Craft[];
  open_to: OpenTo[];
  /** Whether the games they've said they'll be at show on their public profile (other creators always see them). */
  attendance_public: boolean;
  is_featured: boolean;
  featured_order: number | null;
  status: PhotographerStatus;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  photographer_id: string;
  storage_path: string;
  web_path: string;
  variant_ext: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  mime_type: string | null;
  dominant_color: string | null;
  caption: string | null;
  event_name: string | null;
  taken_at: string | null;
  permission: PhotoPermission;
  is_public: boolean;
  is_showcase: boolean;
  showcase_order: number | null;
  consent_at: string | null;
  created_at: string;
}

export interface PhotoTag {
  id: string;
  photo_id: string;
  tag_type: PhotoTagType;
  tag_value: string;
  ref_id: string | null;
}

export interface Spotlight {
  id: string;
  photographer_id: string;
  week_start: string;
  blurb: string | null;
  highlight_photo_ids: string[];
  created_at: string;
}

export const PHOTOGRAPHER_COLUMNS =
  "id, user_id, slug, display_name, handle, bio, location, avatar_path, socials, contact_preference, credit_line, default_permission, teams, crafts, open_to, attendance_public, is_featured, featured_order, status, created_at, updated_at";
export const PHOTO_COLUMNS =
  "id, photographer_id, storage_path, web_path, variant_ext, width, height, file_size, mime_type, dominant_color, caption, event_name, taken_at, permission, is_public, is_showcase, showcase_order, consent_at, created_at";

export const PERMISSIONS: Record<PhotoPermission, { label: string; short: string; description: string }> = {
  use_with_credit: {
    label: "Use with credit",
    short: "Credit",
    description: "Swish Assistant may use this photo in posts and graphics, always with your credit line.",
  },
  ask_first: {
    label: "Ask me first",
    short: "Ask first",
    description: "Swish Assistant must ask you before each use.",
  },
  showcase_only: {
    label: "Showcase only",
    short: "Showcase",
    description: "Shown on your profile only. Swish Assistant will not reuse it anywhere else.",
  },
  paid_license: {
    label: "Paid licence",
    short: "Licence",
    description: "Available to license for a fee (coming later; treated as ask-first for now).",
  },
};

export const PERMISSION_ORDER: PhotoPermission[] = ["use_with_credit", "ask_first", "showcase_only", "paid_license"];

export const TAG_TYPES: Record<PhotoTagType, string> = {
  player: "Player",
  team: "Team",
  league: "League",
  event: "Event",
};

export const CRAFTS: Record<Craft, { label: string; title: string }> = {
  photo: { label: "Photography", title: "Photographer" },
  video: { label: "Video", title: "Videographer" },
  design: { label: "Graphic design", title: "Designer" },
  social: { label: "Social media", title: "Social media" },
  writing: { label: "Writing", title: "Writer" },
  commentary: { label: "Commentary and broadcast", title: "Broadcaster" },
};
export const CRAFT_ORDER: Craft[] = ["photo", "video", "design", "social", "writing", "commentary"];

export const OPEN_TO: Record<OpenTo, string> = {
  collabs: "Collabs",
  second_shooter: "Second shooting",
  club_work: "Club work",
  paid_work: "Paid work",
  mentoring: "Mentoring",
};
export const OPEN_TO_ORDER: OpenTo[] = ["collabs", "second_shooter", "club_work", "paid_work", "mentoring"];

/** "Photographer", "Photographer and videographer", or "Creator" for three or more (or none set). */
export function craftTitle(crafts: Craft[] | null | undefined): string {
  const list = CRAFT_ORDER.filter((c) => crafts?.includes(c));
  if (list.length === 1) return CRAFTS[list[0]].title;
  if (list.length === 2) return `${CRAFTS[list[0]].title} and ${CRAFTS[list[1]].title.toLowerCase()}`;
  return "Creator";
}

export const MEDIA_QUERY_KEY = ["media"] as const;

const WEB_BUCKET = "photo-web";

export function webUrl(path: string): string {
  return supabase.storage.from(WEB_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Public URL of a resized variant. The original is never served. */
export function photoUrl(photo: Pick<Photo, "web_path" | "variant_ext">, size: PhotoSize): string {
  return webUrl(`${photo.web_path}/${size}.${photo.variant_ext}`);
}

/**
 * How big each web copy of a photo is. The thumb fills a grid tile on a
 * high-density phone; the small fills one on a high-density laptop (without
 * it those screens fall through to the medium, four times the download); the
 * medium fills a feed post or a laptop screen; the large fills a 4K monitor
 * edge to edge. A photo is never enlarged, so a copy is at most the size of
 * the original.
 */
export const VARIANT_RULES: Record<PhotoSize, { maxWidth?: number; maxLongEdge?: number; quality: number }> = {
  thumb: { maxWidth: 640, quality: 0.9 },
  small: { maxWidth: 1024, quality: 0.92 },
  medium: { maxLongEdge: 2048, quality: 0.93 },
  large: { maxLongEdge: 3840, quality: 0.95 },
};

/** Every copy, smallest first. */
export const PHOTO_SIZES: PhotoSize[] = ["thumb", "small", "medium", "large"];

/** The pixel width of one copy of a photo that is `width` x `height` at full size. */
export function variantWidth(width: number, height: number, size: PhotoSize): number {
  const rule = VARIANT_RULES[size];
  const scale = Math.min(1, rule.maxWidth ? rule.maxWidth / width : 1, rule.maxLongEdge ? rule.maxLongEdge / Math.max(width, height) : 1);
  return Math.max(1, Math.round(width * scale));
}

/** srcset across a photo's copies, for responsive <img>s. Pass `sizes` to leave some out (the lightbox has no use for the small ones). */
export function photoSrcSet(photo: Pick<Photo, "web_path" | "variant_ext"> & Partial<Pick<Photo, "width" | "height">>, sizes: PhotoSize[] = PHOTO_SIZES): string {
  // Without the photo's own size, assume one big enough for every copy to be at its full width.
  const w = photo.width || 6000;
  const h = photo.height || 4000;
  const seen = new Set<number>();
  return sizes
    .map((size) => ({ size, width: variantWidth(w, h, size) }))
    .filter(({ width }) => (seen.has(width) ? false : (seen.add(width), true)))
    .map(({ size, width }) => `${photoUrl(photo, size)} ${width}w`)
    .join(", ");
}

export function avatarUrl(p: Pick<Photographer, "avatar_path">): string | null {
  return p.avatar_path ? webUrl(p.avatar_path) : null;
}

export const cleanHandle = (h: string | null | undefined) => (h || "").trim().replace(/^@+/, "");

/** How the photographer wants to be credited; "📸 @handle" unless they set their own. */
export function creditLine(p: Pick<Photographer, "credit_line" | "handle" | "display_name">): string {
  if (p.credit_line?.trim()) return p.credit_line.trim();
  const h = cleanHandle(p.handle);
  return h ? `📸 @${h}` : `📸 ${p.display_name}`;
}

export function socialHref(key: keyof Socials, value: string | undefined): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  switch (key) {
    case "instagram":
      return /^https?:\/\//i.test(v) ? v : `https://instagram.com/${cleanHandle(v)}`;
    case "x":
      return /^https?:\/\//i.test(v) ? v : `https://x.com/${cleanHandle(v)}`;
    case "website":
      return /^https?:\/\//i.test(v) ? v : `https://${v}`;
    case "email":
      return `mailto:${v}`;
  }
}

/** Where "Work with me" goes: their preferred channel, else the first one they have. */
export function contactHref(p: Pick<Photographer, "socials" | "contact_preference" | "handle">): { href: string; label: string } | null {
  const socials = { ...(p.socials || {}) };
  if (!socials.instagram && p.handle) socials.instagram = cleanHandle(p.handle);
  const order: (keyof Socials)[] = [p.contact_preference, "instagram", "email", "website", "x"];
  for (const key of order) {
    const href = socialHref(key, socials[key]);
    if (href) {
      const label = key === "instagram" ? "Message on Instagram" : key === "email" ? "Email" : key === "website" ? "Visit website" : "Message on X";
      return { href, label };
    }
  }
  return null;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** The Monday of the week holding `date`, as YYYY-MM-DD (local time). */
export function weekStart(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatWeek(weekStartIso: string): string {
  const [y, m, d] = weekStartIso.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const f = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${f(start)} – ${f(end)} ${end.getFullYear()}`;
}

export function splitTeams(text: string): string[] {
  return Array.from(new Set(text.split(/[,\n]/).map((t) => t.trim()).filter(Boolean)));
}

/** Photos for a set of photographers: showcase picks first, then newest public ones. */
async function fetchStripPhotos(photographerIds: string[], perPhotographer = 10): Promise<Map<string, Photo[]>> {
  const out = new Map<string, Photo[]>();
  if (!photographerIds.length) return out;
  const { data, error } = await supabase
    .from("photos")
    .select(PHOTO_COLUMNS)
    .in("photographer_id", photographerIds)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(photographerIds.length * 60);
  if (error) throw new Error(error.message);
  for (const id of photographerIds) {
    const mine = ((data ?? []) as Photo[]).filter((p) => p.photographer_id === id);
    const showcase = mine.filter((p) => p.is_showcase).sort((a, b) => (a.showcase_order ?? 999) - (b.showcase_order ?? 999));
    const rest = mine.filter((p) => !p.is_showcase);
    out.set(id, [...showcase, ...rest].slice(0, perPhotographer));
  }
  return out;
}

/** Everyone the public can see, A–Z, with a strip of photos each. */
export function usePhotographerDirectory() {
  return useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "directory"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photographers")
        .select(PHOTOGRAPHER_COLUMNS)
        .neq("status", "hidden")
        .order("display_name");
      if (error) throw new Error(error.message);
      const photographers = (data ?? []) as Photographer[];
      const strips = await fetchStripPhotos(photographers.map((p) => p.id));
      return { photographers, strips };
    },
  });
}

/** The admin's hand-picked set for the landing page (falls back to the first few). */
export function useFeaturedPhotographers() {
  return useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "featured"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photographers")
        .select(PHOTOGRAPHER_COLUMNS)
        .neq("status", "hidden")
        .order("is_featured", { ascending: false })
        .order("featured_order", { ascending: true, nullsFirst: false })
        .order("display_name")
        .limit(4);
      if (error) throw new Error(error.message);
      const photographers = (data ?? []) as Photographer[];
      const strips = await fetchStripPhotos(photographers.map((p) => p.id));
      const [{ count: photographerCount }, { count: photoCount }] = await Promise.all([
        supabase.from("photographers").select("id", { count: "exact", head: true }).neq("status", "hidden"),
        supabase.from("photos").select("id", { count: "exact", head: true }).eq("is_public", true),
      ]);
      return { photographers, strips, photographerCount: photographerCount ?? 0, photoCount: photoCount ?? 0 };
    },
  });
}

export interface PhotographerProfile {
  photographer: Photographer;
  photos: Photo[];
  tags: Map<string, PhotoTag[]>;
}

/** One profile with its public gallery and tags. */
export function usePhotographerProfile(slug: string | undefined) {
  return useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "profile", slug],
    enabled: !!slug,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<PhotographerProfile | null> => {
      const { data: p, error } = await supabase.from("photographers").select(PHOTOGRAPHER_COLUMNS).eq("slug", slug!).maybeSingle();
      if (error) throw new Error(error.message);
      if (!p) return null;
      const photographer = p as Photographer;
      const { data: photoRows, error: photoErr } = await supabase
        .from("photos")
        .select(PHOTO_COLUMNS)
        .eq("photographer_id", photographer.id)
        .eq("is_public", true)
        .order("is_showcase", { ascending: false })
        .order("showcase_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (photoErr) throw new Error(photoErr.message);
      const photos = (photoRows ?? []) as Photo[];
      const tags = await fetchTags(photos.map((x) => x.id));
      return { photographer, photos, tags };
    },
  });
}

export async function fetchTags(photoIds: string[]): Promise<Map<string, PhotoTag[]>> {
  const map = new Map<string, PhotoTag[]>();
  if (!photoIds.length) return map;
  for (let i = 0; i < photoIds.length; i += 200) {
    const { data } = await supabase.from("photo_tags").select("id, photo_id, tag_type, tag_value, ref_id").in("photo_id", photoIds.slice(i, i + 200));
    for (const t of (data ?? []) as PhotoTag[]) {
      const list = map.get(t.photo_id) ?? [];
      list.push(t);
      map.set(t.photo_id, list);
    }
  }
  return map;
}

/** The signed-in user's own photographer profile, if an admin linked one to them. */
export function useMyPhotographer(userId: string | undefined) {
  return useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "mine", userId],
    enabled: !!userId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("photographers").select(PHOTOGRAPHER_COLUMNS).eq("user_id", userId!).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Photographer | null) ?? null;
    },
  });
}

export interface CurrentSpotlight {
  spotlight: Spotlight;
  photographer: Photographer;
  photos: Photo[];
}

/** This week's Photographer of the Week (or the most recent one scheduled). */
export function useCurrentSpotlight() {
  return useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "spotlight", weekStart()],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CurrentSpotlight | null> => {
      const { data: rows, error } = await supabase
        .from("spotlights")
        .select("id, photographer_id, week_start, blurb, highlight_photo_ids, created_at")
        .lte("week_start", weekStart())
        .order("week_start", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      const spotlight = (rows?.[0] as Spotlight | undefined) ?? null;
      if (!spotlight) return null;
      const { data: p } = await supabase.from("photographers").select(PHOTOGRAPHER_COLUMNS).eq("id", spotlight.photographer_id).neq("status", "hidden").maybeSingle();
      if (!p) return null;
      const photographer = p as Photographer;
      let photos: Photo[] = [];
      if (spotlight.highlight_photo_ids.length) {
        const { data } = await supabase.from("photos").select(PHOTO_COLUMNS).in("id", spotlight.highlight_photo_ids).eq("is_public", true);
        const byId = new Map(((data ?? []) as Photo[]).map((x) => [x.id, x]));
        photos = spotlight.highlight_photo_ids.map((id) => byId.get(id)).filter((x): x is Photo => !!x);
      }
      if (!photos.length) photos = (await fetchStripPhotos([photographer.id], 4)).get(photographer.id) ?? [];
      return { spotlight, photographer, photos };
    },
  });
}

/** Calls the Media Spotlight server endpoints with the signed-in user's token (if any). */
export async function mediaApi<T>(path: string, init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTakenAt(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
