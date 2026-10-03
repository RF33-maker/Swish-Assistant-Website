import { gamePath } from "./seo";

/**
 * What a news article can contain, shared by the editor, the public article
 * page, the save API and the server-rendered HTML.
 *
 * The body is a Tiptap/ProseMirror document stored as JSON in
 * news_articles.content. Nothing here trusts that document: the API runs
 * sanitizeArticleDoc before storing it, and both renderers build their output
 * node by node from a fixed set of node types with escaped text, so there is
 * never raw HTML to sanitise.
 */

// ── Article types ──────────────────────────────────────────────────────────

export const ARTICLE_TYPES = [
  { value: "news", label: "News" },
  { value: "preview", label: "Preview" },
  { value: "recap", label: "Recap" },
  { value: "feature", label: "Feature" },
  { value: "roundup", label: "Round-up" },
] as const;

export type ArticleType = (typeof ARTICLE_TYPES)[number]["value"];

export function isArticleType(value: unknown): value is ArticleType {
  return ARTICLE_TYPES.some((t) => t.value === value);
}

export function articleTypeLabel(value: string | null | undefined): string {
  return ARTICLE_TYPES.find((t) => t.value === value)?.label ?? "News";
}

/** The URL slug a headline turns into: "Knights Win the Final!" → "knights-win-the-final". */
export function buildArticleSlug(title: string): string {
  return (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

// ── Tags: the pages an article is about ────────────────────────────────────
// A tag points at a page rather than a database row: `key` is whatever that
// page's URL uses (league and competition slugs, game_key, club slug, player
// slug). Player and team ids differ per competition and get merged, so a row
// id would go stale; the page key is what stays put.

export const ARTICLE_TAG_KINDS = ["league", "competition", "game", "team", "player"] as const;
export type ArticleTagKind = (typeof ARTICLE_TAG_KINDS)[number];

export interface ArticleTagContext {
  /** Competition a game or team tag was picked from, used to build its link. */
  competition_slug?: string;
  /** Tip-off time of a game tag (ISO). */
  matchtime?: string;
}

export interface ArticleTag {
  kind: ArticleTagKind;
  key: string;
  label: string;
  context?: ArticleTagContext | null;
}

export const MAX_ARTICLE_TAGS = 30;

export function articleTagHref(tag: ArticleTag): string {
  const key = encodeURIComponent(tag.key);
  const competition = tag.context?.competition_slug;
  switch (tag.kind) {
    case "league":
      return `/league/${key}`;
    case "competition":
      return `/competition/${key}`;
    case "game":
      return gamePath(competition, tag.key);
    case "team":
      return `/team/${key}${competition ? `?competition=${encodeURIComponent(competition)}` : ""}`;
    case "player":
      return `/player/${key}`;
  }
}

const cleanString = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";

export function sanitizeArticleTags(input: unknown): ArticleTag[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const tags: ArticleTag[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const kind = (raw as any).kind;
    if (!ARTICLE_TAG_KINDS.includes(kind)) continue;
    const key = cleanString((raw as any).key, 200);
    const label = cleanString((raw as any).label, 200);
    if (!key || !label || seen.has(`${kind}:${key}`)) continue;
    seen.add(`${kind}:${key}`);
    const rawContext = (raw as any).context;
    const context: ArticleTagContext = {};
    const competitionSlug = cleanString(rawContext?.competition_slug, 200);
    if (competitionSlug) context.competition_slug = competitionSlug;
    const matchtime = cleanString(rawContext?.matchtime, 40);
    if (matchtime && !Number.isNaN(Date.parse(matchtime))) context.matchtime = matchtime;
    tags.push({ kind, key, label, context: Object.keys(context).length ? context : null });
    if (tags.length >= MAX_ARTICLE_TAGS) break;
  }
  return tags;
}

// ── Body document ──────────────────────────────────────────────────────────

export type ArticleMark = { type: "bold" } | { type: "italic" } | { type: "link"; attrs: { href: string } };

export interface ArticleNode {
  type: string;
  attrs?: Record<string, any>;
  content?: ArticleNode[];
  marks?: ArticleMark[];
  text?: string;
}

export interface ArticleDoc {
  type: "doc";
  content: ArticleNode[];
}

export const EMPTY_ARTICLE_DOC: ArticleDoc = { type: "doc", content: [{ type: "paragraph" }] };

const MAX_NODES = 5000;
const MAX_DEPTH = 12;
const MAX_TEXT_LENGTH = 200_000;

/** Links may go to the web, an email address or another page on this site. */
export function isSafeArticleHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  const value = href.trim();
  if (!value || value.length > 2000 || /[\u0000-\u001f\s]/.test(value)) return false;
  return /^https?:\/\//i.test(value) || /^mailto:[^\s@]+@[^\s@]+$/i.test(value) || /^\/(?!\/)/.test(value);
}

/** Inline images have to be ones uploaded to the news-images bucket. */
export function isArticleImageSrc(src: unknown): src is string {
  return (
    typeof src === "string" &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/news-images\/[\w./%-]+$/i.test(src)
  );
}

const INLINE_CONTAINERS = new Set(["paragraph", "heading"]);
const BLOCK_CHILDREN: Record<string, Set<string>> = {
  doc: new Set(["paragraph", "heading", "bulletList", "orderedList", "blockquote", "horizontalRule", "figure", "gameEmbed"]),
  blockquote: new Set(["paragraph", "bulletList", "orderedList"]),
  bulletList: new Set(["listItem"]),
  orderedList: new Set(["listItem"]),
  listItem: new Set(["paragraph", "bulletList", "orderedList"]),
};

function sanitizeMarks(input: unknown): ArticleMark[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const marks: ArticleMark[] = [];
  for (const mark of input) {
    const type = (mark as any)?.type;
    if ((type === "bold" || type === "italic") && !marks.some((m) => m.type === type)) {
      marks.push({ type });
    } else if (type === "link" && !marks.some((m) => m.type === "link")) {
      const href = (mark as any)?.attrs?.href;
      if (isSafeArticleHref(href)) marks.push({ type: "link", attrs: { href: href.trim() } });
    }
  }
  return marks.length ? marks : undefined;
}

/**
 * Rebuilds a document from scratch, keeping only the node types, marks and
 * attributes an article is allowed to have. Returns null when the input isn't
 * a document at all.
 */
export function sanitizeArticleDoc(input: unknown): ArticleDoc | null {
  if (!input || typeof input !== "object" || (input as any).type !== "doc") return null;
  const budget = { nodes: 0, text: 0 };

  const inline = (raw: unknown): ArticleNode | null => {
    if (!raw || typeof raw !== "object" || ++budget.nodes > MAX_NODES) return null;
    const node = raw as ArticleNode;
    if (node.type === "hardBreak") return { type: "hardBreak" };
    if (node.type !== "text" || typeof node.text !== "string" || !node.text) return null;
    budget.text += node.text.length;
    if (budget.text > MAX_TEXT_LENGTH) return null;
    const marks = sanitizeMarks(node.marks);
    return marks ? { type: "text", text: node.text, marks } : { type: "text", text: node.text };
  };

  const block = (raw: unknown, parent: string, depth: number): ArticleNode | null => {
    if (!raw || typeof raw !== "object" || depth > MAX_DEPTH || ++budget.nodes > MAX_NODES) return null;
    const node = raw as ArticleNode;
    if (!BLOCK_CHILDREN[parent]?.has(node.type)) return null;
    const children = Array.isArray(node.content) ? node.content : [];

    if (INLINE_CONTAINERS.has(node.type)) {
      const content = children.map(inline).filter((n): n is ArticleNode => !!n);
      const out: ArticleNode = { type: node.type };
      if (node.type === "heading") out.attrs = { level: node.attrs?.level === 3 ? 3 : 2 };
      if (content.length) out.content = content;
      return out;
    }
    if (node.type === "horizontalRule") return { type: "horizontalRule" };
    if (node.type === "figure") {
      if (!isArticleImageSrc(node.attrs?.src)) return null;
      return {
        type: "figure",
        attrs: {
          src: node.attrs!.src,
          alt: cleanString(node.attrs?.alt, 300),
          caption: cleanString(node.attrs?.caption, 500),
          credit: cleanString(node.attrs?.credit, 200),
        },
      };
    }
    if (node.type === "gameEmbed") {
      const gameKey = cleanString(node.attrs?.gameKey, 200);
      if (!gameKey) return null;
      return {
        type: "gameEmbed",
        attrs: {
          gameKey,
          competitionSlug: cleanString(node.attrs?.competitionSlug, 200) || null,
          home: cleanString(node.attrs?.home, 200),
          away: cleanString(node.attrs?.away, 200),
          matchtime: cleanString(node.attrs?.matchtime, 40) || null,
        },
      };
    }

    const content = children.map((child) => block(child, node.type, depth + 1)).filter((n): n is ArticleNode => !!n);
    if (!content.length) return null;
    const out: ArticleNode = { type: node.type, content };
    if (node.type === "orderedList" && Number.isInteger(node.attrs?.start) && node.attrs!.start > 1) {
      out.attrs = { start: node.attrs!.start };
    }
    return out;
  };

  const content = (Array.isArray((input as any).content) ? (input as any).content : [])
    .map((child: unknown) => block(child, "doc", 1))
    .filter((n: ArticleNode | null): n is ArticleNode => !!n);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** An old plain-text body (one paragraph per line) as a document, for the editor. */
export function plainTextToArticleDoc(body: string | null | undefined): ArticleDoc {
  const paragraphs = String(body ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text): ArticleNode => ({ type: "paragraph", content: [{ type: "text", text }] }));
  return { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] };
}

const inlineText = (node: ArticleNode): string =>
  (node.content ?? []).map((child) => (child.type === "hardBreak" ? "\n" : child.text ?? "")).join("");

export function gameEmbedLabel(attrs: Record<string, any> | undefined): string {
  return attrs?.home && attrs?.away ? `${attrs.home} v ${attrs.away}` : "Game";
}

/**
 * The body as plain text, one block per paragraph. Stored in
 * news_articles.body for search-result descriptions and anything that reads
 * the old plain-text column.
 */
export function articleDocToPlainText(doc: ArticleDoc | null | undefined): string {
  const blocks: string[] = [];
  // Only a list item's first block carries its bullet or number.
  const walk = (nodes: ArticleNode[], firstPrefix = "") => {
    nodes.forEach((node, index) => {
      const prefix = index === 0 ? firstPrefix : "";
      switch (node.type) {
        case "paragraph":
        case "heading": {
          const text = inlineText(node).trim();
          if (text) blocks.push(prefix + text);
          break;
        }
        case "bulletList":
          (node.content ?? []).forEach((item) => walk(item.content ?? [], "• "));
          break;
        case "orderedList":
          (node.content ?? []).forEach((item, i) => walk(item.content ?? [], `${(node.attrs?.start ?? 1) + i}. `));
          break;
        case "blockquote":
          walk(node.content ?? [], prefix);
          break;
        case "figure":
          if (node.attrs?.caption) blocks.push(String(node.attrs.caption));
          break;
        case "gameEmbed":
          blocks.push(gameEmbedLabel(node.attrs));
          break;
      }
    });
  };
  walk(doc?.content ?? []);
  return blocks.join("\n\n");
}

export function articleWordCount(doc: ArticleDoc | null | undefined): number {
  const text = articleDocToPlainText(doc).trim();
  return text ? text.split(/\s+/).length : 0;
}

/** Minutes to read at 220 words a minute, never less than one. */
export function articleReadingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220));
}

/** Every inline image in the body, so their files can be cleaned up with the article. */
export function articleImageSources(doc: ArticleDoc | null | undefined): string[] {
  const sources: string[] = [];
  const walk = (nodes: ArticleNode[]) =>
    nodes.forEach((node) => {
      if (node.type === "figure" && typeof node.attrs?.src === "string") sources.push(node.attrs.src);
      if (node.content) walk(node.content);
    });
  walk(doc?.content ?? []);
  return sources;
}

/** Every game embedded in the body. */
export function articleGameKeys(doc: ArticleDoc | null | undefined): string[] {
  return (doc?.content ?? []).filter((n) => n.type === "gameEmbed" && n.attrs?.gameKey).map((n) => String(n.attrs!.gameKey));
}

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/**
 * The body as plain semantic HTML for the server-rendered page that search
 * engines read. Text is escaped and links are re-checked, so this is safe to
 * build from a stored document even if it skipped sanitizeArticleDoc.
 */
export function articleDocToHtml(doc: ArticleDoc | null | undefined): string {
  const inlineHtml = (node: ArticleNode): string =>
    (node.content ?? [])
      .map((child) => {
        if (child.type === "hardBreak") return "<br />";
        let html = escapeHtml(child.text ?? "");
        for (const mark of child.marks ?? []) {
          if (mark.type === "bold") html = `<strong>${html}</strong>`;
          else if (mark.type === "italic") html = `<em>${html}</em>`;
          else if (mark.type === "link" && isSafeArticleHref(mark.attrs?.href)) {
            html = `<a href="${escapeHtml(mark.attrs.href)}">${html}</a>`;
          }
        }
        return html;
      })
      .join("");

  const blockHtml = (node: ArticleNode): string => {
    const children = () => (node.content ?? []).map(blockHtml).join("");
    switch (node.type) {
      case "paragraph":
        return `<p>${inlineHtml(node)}</p>`;
      case "heading":
        return node.attrs?.level === 3 ? `<h3>${inlineHtml(node)}</h3>` : `<h2>${inlineHtml(node)}</h2>`;
      case "bulletList":
        return `<ul>${children()}</ul>`;
      case "orderedList":
        return `<ol>${children()}</ol>`;
      case "listItem":
        return `<li>${children()}</li>`;
      case "blockquote":
        return `<blockquote>${children()}</blockquote>`;
      case "horizontalRule":
        return "<hr />";
      case "figure": {
        if (!isArticleImageSrc(node.attrs?.src)) return "";
        const caption = [node.attrs?.caption, node.attrs?.credit].filter(Boolean).join(" · ");
        return `<figure><img src="${escapeHtml(node.attrs!.src)}" alt="${escapeHtml(node.attrs?.alt)}" />${
          caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""
        }</figure>`;
      }
      case "gameEmbed":
        return node.attrs?.gameKey
          ? `<p><a href="${escapeHtml(gamePath(node.attrs.competitionSlug, String(node.attrs.gameKey)))}">${escapeHtml(gameEmbedLabel(node.attrs))}</a></p>`
          : "";
      default:
        return "";
    }
  };

  return (doc?.content ?? []).map(blockHtml).join("");
}
