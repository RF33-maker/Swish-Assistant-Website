import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "./supabaseServiceClient";
import {
  ARTICLE_TYPES,
  MAX_ARTICLE_TAGS,
  articleDocToPlainText,
  buildArticleSlug,
  isArticleImageSrc,
  sanitizeArticleDoc,
  sanitizeArticleTags,
  type ArticleTag,
} from "@shared/newsArticle";

/**
 * Create and update API for news articles.
 *
 * Saves go through here, not straight to Supabase from the browser, so that
 * every article is stored the same way: the body is rebuilt from an allowed
 * set of blocks, the slug is unique and stays put once set, the publish date
 * is stamped when the article first goes live, and its tags are replaced in
 * the same request. Reads and deletes stay in the browser under RLS.
 */

type AdminGuard = (req: Request, res: Response) => Promise<string | null>;

/** A long article's document can pass Express's 100kb default. Mount before the global JSON parser. */
export const newsArticleBodyParser = express.json({ limit: "1mb" });

const optionalText = (max: number) => z.string().max(max).nullish();

const articleInput = z.object({
  title: z.string().max(200, "Headline is too long").optional(),
  slug: z.string().max(120).regex(/^[a-z0-9-]*$/, "The URL can only use lowercase letters, numbers and hyphens").nullish(),
  summary: optionalText(500),
  content: z.unknown().optional(),
  // Plain-text body, for callers that don't send a `content` document.
  body: optionalText(200_000),
  league: optionalText(100),
  source_url: z.string().max(2000).regex(/^(https?:\/\/\S+)?$/i, "The source link must start with http:// or https://").nullish(),
  image_url: z.string().max(2000).refine((v) => !v || isArticleImageSrc(v), "The cover image must be an uploaded news image").nullish(),
  image_alt: optionalText(300),
  image_credit: optionalText(200),
  article_type: z.enum(ARTICLE_TYPES.map((t) => t.value) as [string, ...string[]]).optional(),
  is_published: z.boolean().optional(),
  tags: z.array(z.unknown()).max(MAX_ARTICLE_TAGS).optional(),
});

type ArticleInput = z.infer<typeof articleInput>;

const ARTICLE_COLUMNS =
  "id, title, slug, summary, body, content, article_type, image_url, image_alt, image_credit, source_url, league, published_at, first_published_at, updated_at, is_published";

async function resolveUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let suffix = 2;
  while (true) {
    let q = supabaseAdmin.from("news_articles").select("id").eq("slug", slug);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    if (!data || data.length === 0) return slug;
    slug = `${base}-${suffix++}`;
  }
}

const trimmedOrNull = (value: string | null | undefined) => value?.trim() || null;

/** The columns an input sets, shared by create and update. Throws a message for the client on bad content. */
function contentColumns(input: ArticleInput, tags: ArticleTag[] | undefined): Record<string, any> {
  const row: Record<string, any> = {};
  if (input.title !== undefined) row.title = input.title.trim();
  if (input.summary !== undefined) row.summary = trimmedOrNull(input.summary);
  if (input.content !== undefined) {
    const doc = sanitizeArticleDoc(input.content);
    if (!doc) throw new Error("The article body isn't in a format the editor can save.");
    row.content = doc;
    row.body = articleDocToPlainText(doc) || null;
  } else if (input.body !== undefined) {
    row.body = trimmedOrNull(input.body);
  }
  if (input.source_url !== undefined) row.source_url = trimmedOrNull(input.source_url);
  if (input.image_url !== undefined) row.image_url = input.image_url || null;
  if (input.image_alt !== undefined) row.image_alt = trimmedOrNull(input.image_alt);
  if (input.image_credit !== undefined) row.image_credit = trimmedOrNull(input.image_credit);
  if (input.article_type !== undefined) row.article_type = input.article_type;
  // The label shown on news cards: the article's league (or competition) tag
  // when it has one, otherwise whatever free text was sent.
  const primary = tags?.find((t) => t.kind === "league") ?? tags?.find((t) => t.kind === "competition");
  if (primary) row.league = primary.label.slice(0, 100);
  else if (input.league !== undefined) row.league = trimmedOrNull(input.league);
  return row;
}

async function replaceTags(articleId: string, tags: ArticleTag[]): Promise<string | null> {
  const { error: deleteError } = await supabaseAdmin.from("news_article_tags").delete().eq("article_id", articleId);
  if (deleteError) return deleteError.message;
  if (!tags.length) return null;
  const { error } = await supabaseAdmin.from("news_article_tags").insert(
    tags.map((tag, index) => ({
      article_id: articleId,
      kind: tag.kind,
      key: tag.key,
      label: tag.label,
      context: tag.context ?? null,
      sort_order: index,
    })),
  );
  return error?.message ?? null;
}

async function loadTags(articleId: string): Promise<ArticleTag[]> {
  const { data } = await supabaseAdmin
    .from("news_article_tags")
    .select("kind, key, label, context")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true });
  return (data as ArticleTag[] | null) ?? [];
}

function sendSaveError(res: Response, error: { code?: string; message: string }) {
  if (error.code === "23505") return res.status(409).json({ error: "Another article already uses that URL. Change the URL slug and save again." });
  return res.status(500).json({ error: error.message });
}

export function registerNewsArticleRoutes(app: Express, requireAdmin: AdminGuard) {
  // POST /api/news-articles — create an article (a draft unless is_published is true)
  app.post("/api/news-articles", async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req, res);
      if (!userId) return;

      const parsed = articleInput.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid article" });
      const input = parsed.data;
      const tags = input.tags ? sanitizeArticleTags(input.tags) : undefined;

      let row: Record<string, any>;
      try {
        row = contentColumns(input, tags);
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
      row.title = row.title ?? "";
      const publishing = input.is_published === true;
      if (publishing && !row.title) return res.status(400).json({ error: "Add a headline before publishing." });

      const base = input.slug?.trim() || buildArticleSlug(row.title);
      row.slug = base ? await resolveUniqueSlug(base) : null;
      row.is_published = publishing;
      row.created_by = userId;
      if (publishing) row.first_published_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin.from("news_articles").insert(row).select(ARTICLE_COLUMNS).single();
      if (error) return sendSaveError(res, error);

      if (tags) {
        const tagError = await replaceTags(data.id, tags);
        if (tagError) return res.status(500).json({ error: `The article was saved but its tags weren't: ${tagError}` });
      }
      res.json({ ...data, tags: tags ?? [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/news-articles/:id — update the fields sent; `tags`, when sent, replaces the article's tags
  app.patch("/api/news-articles/:id", async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req, res);
      if (!userId) return;

      const { id } = req.params;
      const parsed = articleInput.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid article" });
      const input = parsed.data;
      const tags = input.tags ? sanitizeArticleTags(input.tags) : undefined;

      const { data: existing, error: loadError } = await supabaseAdmin
        .from("news_articles")
        .select("id, title, slug, is_published, first_published_at")
        .eq("id", id)
        .maybeSingle();
      if (loadError) return res.status(500).json({ error: loadError.message });
      if (!existing) return res.status(404).json({ error: "Article not found" });

      let row: Record<string, any>;
      try {
        row = contentColumns(input, tags);
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }

      const title: string = row.title ?? existing.title ?? "";
      const willBePublished = input.is_published ?? existing.is_published;
      if (willBePublished && !title) return res.status(400).json({ error: "Add a headline before publishing." });

      // A slug only changes when a different one is asked for; an article
      // without one gets it from the headline as soon as there is one.
      const requested = input.slug?.trim();
      if (requested && requested !== existing.slug) row.slug = await resolveUniqueSlug(requested, id);
      else if (!existing.slug && title) row.slug = await resolveUniqueSlug(buildArticleSlug(title) || `article-${id.slice(0, 8)}`, id);

      if (input.is_published !== undefined) row.is_published = input.is_published;
      // The publish date is when the article first went live, not when its
      // draft was started. Unpublishing and republishing keeps the original.
      if (input.is_published === true && !existing.first_published_at) {
        const now = new Date().toISOString();
        row.published_at = now;
        row.first_published_at = now;
      }
      row.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin.from("news_articles").update(row).eq("id", id).select(ARTICLE_COLUMNS).single();
      if (error) return sendSaveError(res, error);

      if (tags) {
        const tagError = await replaceTags(id, tags);
        if (tagError) return res.status(500).json({ error: `The article was saved but its tags weren't: ${tagError}` });
      }
      res.json({ ...data, tags: tags ?? (await loadTags(id)) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
