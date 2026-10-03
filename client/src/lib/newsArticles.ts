import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import type { NewsArticle } from "@shared/schema";
import { articleImageSources, type ArticleDoc, type ArticleTag, type ArticleType } from "@shared/newsArticle";

/**
 * Loading, saving and deleting news articles from the admin pages, plus image
 * uploads. Saves go through /api/news-articles (which cleans the body and
 * keeps the slug unique); reads, deletes and uploads go straight to Supabase
 * under the admin-only policies.
 */

export const NEWS_BUCKET = "news-images";
/** Every news query on the site starts with this key, so one invalidation refreshes them all. */
export const NEWS_QUERY_KEY = ["supabase", "news_articles"] as const;

export const EDITOR_COLUMNS =
  "id, title, slug, summary, body, content, article_type, image_url, image_alt, image_credit, source_url, league, published_at, first_published_at, updated_at, is_published";

export type EditableArticle = NewsArticle & { tags: ArticleTag[] };

/** What the editor sends on every save. */
export interface ArticlePayload {
  title: string;
  slug: string;
  summary: string;
  content: ArticleDoc;
  article_type: ArticleType;
  image_url: string | null;
  image_alt: string;
  image_credit: string;
  source_url: string;
  league: string | null;
  tags: ArticleTag[];
  is_published?: boolean;
}

export function invalidateNewsQueries() {
  queryClient.invalidateQueries({ queryKey: NEWS_QUERY_KEY });
}

export async function fetchArticleTags(articleId: string): Promise<ArticleTag[]> {
  const { data, error } = await supabase
    .from("news_article_tags")
    .select("kind, key, label, context")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as ArticleTag[] | null) ?? [];
}

/** An article with its tags, drafts included (admins only, enforced by RLS). */
export async function fetchArticleForEdit(id: string): Promise<EditableArticle | null> {
  const { data, error } = await supabase.from("news_articles").select(EDITOR_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...(data as unknown as NewsArticle), tags: await fetchArticleTags(id) };
}

export async function saveArticle(id: string | null, payload: ArticlePayload): Promise<EditableArticle> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const res = await fetch(id ? `/api/news-articles/${id}` : "/api/news-articles", {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || "Couldn't save the article.");
  return json as EditableArticle;
}

export async function deleteArticle(id: string) {
  const { data: article } = await supabase.from("news_articles").select("image_url, content").eq("id", id).maybeSingle();
  // Delete the row first: RLS returns no error when it blocks a delete, so
  // check a row actually went before removing its images.
  const { data, error } = await supabase.from("news_articles").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The article wasn't deleted. Check you're signed in as an admin.");
  if (article) await removeNewsImages([article.image_url, ...articleImageSources(article.content as ArticleDoc | null)]);
}

// ── Images ─────────────────────────────────────────────────────────────────

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2000;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Photos straight off a phone or camera are far bigger than a page needs.
 * Anything wider or taller than 2000px is scaled down before upload (JPEG and
 * WebP re-encoded as JPEG, PNG kept as PNG); smaller images go up untouched.
 */
async function prepareImage(file: File): Promise<{ blob: Blob; type: string }> {
  if (!IMAGE_TYPES[file.type]) throw new Error("Images must be JPG, PNG or WebP.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That image couldn't be read. Try saving it as a JPG or PNG.");
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= MAX_UPLOAD_BYTES) {
    bitmap.close();
    return { blob: file, type: file.type };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await canvasBlob(canvas, type, 0.86);
  if (!blob) throw new Error("That image couldn't be processed.");
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("That image is too large, even after resizing. Try a JPG instead.");
  return { blob, type };
}

/** Uploads an image to the news bucket and returns its public URL. */
export async function uploadNewsImage(file: File, folder: "articles" | "articles/inline"): Promise<string> {
  const { blob, type } = await prepareImage(file);
  const path = `${folder}/${crypto.randomUUID()}.${IMAGE_TYPES[type]}`;
  const { error } = await supabase.storage
    .from(NEWS_BUCKET)
    .upload(path, blob, { upsert: false, contentType: type, cacheControl: "31536000" });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return supabase.storage.from(NEWS_BUCKET).getPublicUrl(path).data.publicUrl;
}

function storagePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${NEWS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx === -1 ? null : decodeURIComponent(publicUrl.substring(idx + marker.length));
}

/** Removes uploaded images by public URL. Best effort: a leftover file is harmless. */
export async function removeNewsImages(urls: Array<string | null | undefined>) {
  const paths = urls.map(storagePath).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from(NEWS_BUCKET).remove(paths).catch(() => null);
}

export function isImageFile(file: File | null | undefined): file is File {
  return !!file && !!IMAGE_TYPES[file.type];
}
