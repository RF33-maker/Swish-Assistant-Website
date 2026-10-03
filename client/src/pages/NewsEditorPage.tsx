import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Eye, Loader2, Newspaper } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import ArticleEditor from "@/components/news/editor/ArticleEditor";
import CoverImageField from "@/components/news/editor/CoverImageField";
import PreviewDialog from "@/components/news/editor/PreviewDialog";
import TagPicker from "@/components/news/editor/TagPicker";
import { mergeTags, tagsForGame, type PickedGame } from "@/components/news/editor/tagSearch";
import { fetchArticleForEdit, invalidateNewsQueries, removeNewsImages, saveArticle, type EditableArticle } from "@/lib/newsArticles";
import {
  ARTICLE_TYPES,
  EMPTY_ARTICLE_DOC,
  articleImageSources,
  articleReadingMinutes,
  articleWordCount,
  buildArticleSlug,
  isArticleType,
  plainTextToArticleDoc,
  type ArticleDoc,
  type ArticleTag,
  type ArticleType,
} from "@shared/newsArticle";

/**
 * The article editor: /news-manager/edit/new for a new article,
 * /news-manager/edit/<id> for an existing one.
 *
 * A draft saves itself a moment after each change, so nothing is lost if the
 * tab closes. A published article never changes behind the writer's back:
 * edits stay in the editor until "Update" is pressed.
 */

interface Draft {
  title: string;
  summary: string;
  content: ArticleDoc;
  articleType: ArticleType;
  tags: ArticleTag[];
  imageUrl: string | null;
  imageAlt: string;
  imageCredit: string;
  slug: string;
  sourceUrl: string;
  /** Card label of an article with no league tag (older articles' free text). */
  league: string | null;
}

const EMPTY_DRAFT: Draft = {
  title: "",
  summary: "",
  content: EMPTY_ARTICLE_DOC,
  articleType: "news",
  tags: [],
  imageUrl: null,
  imageAlt: "",
  imageCredit: "",
  slug: "",
  sourceUrl: "",
  league: null,
};

function draftFromArticle(article: EditableArticle): Draft {
  const doc = article.content as ArticleDoc | null;
  return {
    title: article.title ?? "",
    summary: article.summary ?? "",
    content: doc?.content?.length ? doc : plainTextToArticleDoc(article.body),
    articleType: isArticleType(article.article_type) ? article.article_type : "news",
    tags: article.tags,
    imageUrl: article.image_url ?? null,
    imageAlt: article.image_alt ?? "",
    imageCredit: article.image_credit ?? "",
    slug: article.slug ?? "",
    sourceUrl: article.source_url ?? "",
    league: article.league ?? null,
  };
}

const draftImages = (draft: Draft) => [draft.imageUrl, ...articleImageSources(draft.content)].filter((u): u is string => !!u);

type SaveStatus = "clean" | "dirty" | "saving" | "error";

const formatDay = (value: string | Date) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const formatTime = (value: Date) => value.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const LABEL = "block text-[13px] font-semibold text-[color:var(--ch-text)]";
const HINT = "mt-1 text-[12px] leading-snug text-[color:var(--ch-muted)]";

/** A textarea that grows with its text, for the headline and standfirst. */
function AutoTextarea({ value, className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  // The text re-wraps when the width changes (rotating a phone, resizing the window).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <textarea ref={ref} rows={1} value={value} className={`block w-full resize-none overflow-hidden bg-transparent outline-none ${className}`} {...props} />;
}

export default function NewsEditorPage() {
  const params = useParams<{ id: string }>();
  const routeId = params?.id || "new";
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // The body editor holds its own document; it's given a starting point each
  // time an article is loaded (editorSession changes), never on a save.
  const [initialContent, setInitialContent] = useState<ArticleDoc>(EMPTY_ARTICLE_DOC);
  const [editorSession, setEditorSession] = useState(0);
  const [published, setPublished] = useState<{ isPublished: boolean; publishedAt: string | null; slug: string | null }>({
    isPublished: false,
    publishedAt: null,
    slug: null,
  });
  const [slugAuto, setSlugAuto] = useState(true);
  const [status, setStatus] = useState<SaveStatus>("clean");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  // Saving reads the latest values through refs, so a save started by a
  // timer or a shortcut never works from a stale copy of the draft.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const articleIdRef = useRef<string | null>(null);
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  // Image files the article pointed at when last saved, and every one seen
  // while editing. The difference is cleaned up on leaving the editor (not
  // before: undo can bring a removed image back).
  const savedImagesRef = useRef<string[]>([]);
  const seenImagesRef = useRef(new Set<string>());

  draftImages(draft).forEach((url) => seenImagesRef.current.add(url));

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // After a new article's first save the URL changes to its id; that's this
    // same editing session, not a different article to load.
    if (routeId !== "new" && routeId === articleIdRef.current) return;
    let cancelled = false;
    const start = (next: Draft, article: EditableArticle | null) => {
      articleIdRef.current = article?.id ?? null;
      versionRef.current = 0;
      savedVersionRef.current = 0;
      savedImagesRef.current = draftImages(next);
      seenImagesRef.current = new Set(savedImagesRef.current);
      setDraft(next);
      setInitialContent(next.content);
      setEditorSession((n) => n + 1);
      setPublished({ isPublished: !!article?.is_published, publishedAt: article?.published_at ? String(article.published_at) : null, slug: article?.slug ?? null });
      // The URL keeps following the headline until it's published or edited by hand.
      setSlugAuto(!article?.is_published && (!next.slug || next.slug.startsWith(buildArticleSlug(next.title) || "\u0000")));
      setStatus("clean");
      setLastSavedAt(null);
      setLoadState("ready");
    };
    if (routeId === "new") {
      start(EMPTY_DRAFT, null);
      return;
    }
    setLoadState("loading");
    fetchArticleForEdit(routeId)
      .then((article) => {
        if (cancelled) return;
        if (!article) return setLoadState("missing");
        start(draftFromArticle(article), article);
      })
      .catch(() => !cancelled && setLoadState("error"));
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  // Remove image files that were uploaded or replaced but aren't in the saved article.
  useEffect(
    () => () => {
      const kept = new Set(savedImagesRef.current);
      removeNewsImages(Array.from(seenImagesRef.current).filter((url) => !kept.has(url)));
    },
    [],
  );

  // ── Edit ─────────────────────────────────────────────────────────────────
  const update = useCallback((patch: Partial<Draft> | ((current: Draft) => Partial<Draft>)) => {
    setDraft((current) => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) }));
    versionRef.current += 1;
    setStatus((s) => (s === "saving" ? s : "dirty"));
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const runSave = async (publish: boolean | undefined, announce: boolean): Promise<boolean> => {
    if (publish === undefined && articleIdRef.current && versionRef.current === savedVersionRef.current) return true;
    const version = versionRef.current;
    const current = draftRef.current;
    setStatus("saving");
    try {
      const result = await saveArticle(articleIdRef.current, {
        title: current.title,
        slug: current.slug,
        summary: current.summary,
        content: current.content,
        article_type: current.articleType,
        image_url: current.imageUrl,
        image_alt: current.imageAlt,
        image_credit: current.imageCredit,
        source_url: current.sourceUrl,
        league: current.league,
        tags: current.tags,
        ...(publish !== undefined ? { is_published: publish } : {}),
      });
      if (!articleIdRef.current) {
        articleIdRef.current = result.id;
        navigate(`/news-manager/edit/${result.id}`, { replace: true });
      }
      savedVersionRef.current = version;
      savedImagesRef.current = draftImages(current);
      setPublished({ isPublished: result.is_published, publishedAt: result.published_at ? String(result.published_at) : null, slug: result.slug ?? null });
      // The server may have changed the slug to keep it unique.
      setDraft((d) => (d.slug === current.slug && result.slug && result.slug !== d.slug ? { ...d, slug: result.slug } : d));
      setLastSavedAt(new Date());
      setStatus(versionRef.current === version ? "clean" : "dirty");
      invalidateNewsQueries();
      return true;
    } catch (err: any) {
      setStatus("error");
      if (announce) toast({ title: "Couldn't save", description: err?.message || "Check your connection and try again.", variant: "destructive" });
      return false;
    }
  };

  /** Saves one at a time: a save asked for while another is running waits its turn. */
  const save = (options: { publish?: boolean; announce?: boolean } = {}): Promise<boolean> => {
    const next = saveChainRef.current.then(() => runSave(options.publish, options.announce ?? true));
    saveChainRef.current = next.catch(() => false);
    return next;
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const hasWords = useMemo(() => articleWordCount(draft.content) > 0, [draft.content]);

  // Drafts save themselves shortly after the last change.
  useEffect(() => {
    if (loadState !== "ready" || status !== "dirty" || published.isPublished) return;
    if (!articleIdRef.current && !draft.title.trim() && !hasWords) return;
    const timer = setTimeout(() => saveRef.current({ announce: false }), 1500);
    return () => clearTimeout(timer);
  }, [draft, status, published.isPublished, loadState, hasWords]);

  const unsaved = status !== "clean";

  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const leave = async () => {
    if (unsaved) {
      if (published.isPublished) {
        if (!window.confirm("Your latest changes aren't live yet. Leave without updating the article?")) return;
      } else if ((articleIdRef.current || draft.title.trim() || hasWords) && !(await save())) {
        return;
      }
    }
    navigate("/news-manager");
  };

  const publish = async () => {
    setPublishOpen(false);
    if (await save({ publish: true })) toast({ title: "Published", description: "The article is live on the news page." });
  };

  const unpublish = async () => {
    if (!window.confirm("Take this article off the site? It becomes a draft again and you can republish it later.")) return;
    if (await save({ publish: false })) toast({ title: "Unpublished", description: "The article is a draft again." });
  };

  const onGamePicked = useCallback(
    (game: PickedGame) => update((current) => ({ tags: mergeTags(current.tags, tagsForGame(game)) })),
    [update],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  const words = useMemo(() => articleWordCount(draft.content), [draft.content]);
  const publishChecks = [
    !draft.imageUrl && "There's no cover image, so news cards will show a plain orange panel.",
    !draft.summary.trim() && "There's no standfirst, so cards and search results will use the opening lines instead.",
    !draft.tags.length && "There are no tags, so the article won't be linked to a league, team or game.",
    !hasWords && !draft.sourceUrl.trim() && "The article has no body text yet.",
  ].filter((v): v is string => !!v);

  const statusText =
    status === "saving"
      ? "Saving…"
      : status === "error"
        ? "Couldn't save"
        : status === "dirty"
          ? published.isPublished
            ? "Changes not live yet"
            : "Unsaved changes"
          : lastSavedAt
            ? `${published.isPublished ? "Updated" : "Saved"} ${formatTime(lastSavedAt)}`
            : published.isPublished
              ? "Live"
              : articleIdRef.current
                ? "Saved"
                : "";

  if (loadState !== "ready") {
    return (
      <div className="sa-pro flex min-h-screen items-center justify-center px-4">
        <Helmet>
          <title>Article editor | Swish Assistant</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        {loadState === "loading" ? (
          <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" />
        ) : (
          <div className="ch-card max-w-md p-8 text-center">
            <Newspaper className="mx-auto mb-3 h-8 w-8 text-[color:var(--ch-muted)]" />
            <h1 className="text-lg font-semibold">{loadState === "missing" ? "Article not found" : "Couldn't load the article"}</h1>
            <p className="mt-1.5 text-sm text-[color:var(--ch-text-2)]">
              {loadState === "missing" ? "It may have been deleted." : "Check your connection and try again."}
            </p>
            <button type="button" className="ch-btn ch-btn-primary mt-5 h-10 px-5" onClick={() => navigate("/news-manager")}>
              Back to articles
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sa-pro min-h-screen">
      <Helmet>
        <title>{`${draft.title.trim() || "New article"} | Article editor`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="sticky top-0 z-30 border-b border-[color:var(--ch-border)] bg-[color:var(--ch-surface)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 md:gap-3 md:px-6">
          <button type="button" onClick={leave} className="ch-btn -ml-1 px-2 text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]" data-testid="button-back-articles">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Articles</span>
          </button>
          <span
            className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
              published.isPublished ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]"
            }`}
            data-testid="status-article"
          >
            {published.isPublished ? "Published" : "Draft"}
          </span>
          <span
            className={`flex min-w-0 items-center gap-1.5 truncate text-[12.5px] ${status === "error" ? "text-[color:var(--ch-loss)]" : "text-[color:var(--ch-muted)]"}`}
            aria-live="polite"
            data-testid="status-save"
          >
            {status === "saving" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            {status === "clean" && statusText && <Check className="h-3.5 w-3.5 shrink-0" />}
            {status === "error" && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{statusText}</span>
            {status === "error" && (
              <button type="button" className="shrink-0 font-semibold underline underline-offset-2" onClick={() => save()}>
                Retry
              </button>
            )}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button type="button" className="ch-btn ch-btn-ghost" onClick={() => setPreviewOpen(true)} data-testid="button-preview">
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Preview</span>
            </button>
            {published.isPublished ? (
              <button type="button" className="ch-btn ch-btn-primary disabled:opacity-50" disabled={!unsaved || status === "saving"} onClick={() => save()} data-testid="button-update">
                Update
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="ch-btn ch-btn-ghost disabled:opacity-50 max-sm:!hidden"
                  disabled={!unsaved || status === "saving"}
                  onClick={() => save()}
                  data-testid="button-save-draft"
                >
                  Save draft
                </button>
                <button type="button" className="ch-btn ch-btn-primary disabled:opacity-50" disabled={status === "saving"} onClick={() => setPublishOpen(true)} data-testid="button-publish">
                  Publish
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-3 py-5 md:px-6 md:py-7 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <main className="ch-card min-w-0 p-5 md:p-9">
          <CoverImageField
            imageUrl={draft.imageUrl}
            alt={draft.imageAlt}
            credit={draft.imageCredit}
            onImageChange={(imageUrl) => update({ imageUrl })}
            onAltChange={(imageAlt) => update({ imageAlt })}
            onCreditChange={(imageCredit) => update({ imageCredit })}
          />

          <AutoTextarea
            value={draft.title}
            maxLength={200}
            placeholder="Headline"
            aria-label="Headline"
            className="ch-display mt-7 uppercase font-bold tracking-tight leading-[0.98] text-[2.1rem] md:text-[3rem] text-[color:var(--ch-text)] placeholder:text-[color:var(--ch-muted)]"
            onChange={(e) => {
              const title = e.target.value.replace(/\n/g, " ");
              update(slugAuto && !published.isPublished ? { title, slug: buildArticleSlug(title) } : { title });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                document.getElementById("article-standfirst")?.focus();
              }
            }}
            data-testid="input-title"
          />

          <AutoTextarea
            id="article-standfirst"
            value={draft.summary}
            maxLength={500}
            placeholder="Standfirst: a sentence or two that sums up the story"
            aria-label="Standfirst"
            className="mt-4 text-lg leading-relaxed text-[color:var(--ch-text-2)] placeholder:text-[color:var(--ch-muted)]"
            onChange={(e) => update({ summary: e.target.value })}
            data-testid="input-summary"
          />
          {draft.summary.length > 400 && <p className={HINT}>{draft.summary.length}/500</p>}

          <div className="mt-5">
            <ArticleEditor
              key={editorSession}
              initialContent={initialContent}
              onChange={(content) => update({ content })}
              onGamePicked={onGamePicked}
              toolbarClassName="top-14"
            />
          </div>

          <p className="mt-8 border-t border-[color:var(--ch-border)] pt-4 text-[12.5px] text-[color:var(--ch-muted)]" data-testid="text-word-count">
            {words === 1 ? "1 word" : `${words.toLocaleString("en-GB")} words`} · {articleReadingMinutes(words)} min read
          </p>
        </main>

        <aside className="mt-5 space-y-4 lg:sticky lg:top-[4.5rem] lg:mt-0 lg:max-h-[calc(100vh-5.5rem)] lg:self-start lg:overflow-y-auto lg:pb-2">
          {published.isPublished && (
            <section className="ch-card p-4">
              <div className={LABEL}>Published</div>
              <p className="mt-1 text-[13px] text-[color:var(--ch-text-2)]">
                {published.publishedAt ? `Live since ${formatDay(published.publishedAt)}.` : "This article is live."} Changes go live when you press Update.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-semibold">
                <a
                  href={`/news/${published.slug || articleIdRef.current}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[color:var(--ch-accent)] hover:opacity-80"
                  data-testid="link-view-article"
                >
                  View article <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button type="button" className="text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]" onClick={unpublish} data-testid="button-unpublish">
                  Unpublish
                </button>
              </div>
            </section>
          )}

          <section className="ch-card p-4">
            <div className={LABEL}>Type</div>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Article type">
              {ARTICLE_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  data-active={draft.articleType === type.value}
                  aria-pressed={draft.articleType === type.value}
                  onClick={() => update({ articleType: type.value })}
                  className="ch-chip h-8 px-3 text-[12.5px]"
                  data-testid={`type-${type.value}`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </section>

          <section className="ch-card p-4">
            <div className={LABEL}>Tags</div>
            <p className={`${HINT} mb-3`}>The league, teams, players and games this article is about. Readers can jump to each from the article.</p>
            <TagPicker tags={draft.tags} onChange={(tags) => update({ tags })} />
          </section>

          <section className="ch-card p-4">
            <label htmlFor="article-slug" className={LABEL}>
              Web address
            </label>
            <div className="mt-2 flex items-center overflow-hidden rounded-[10px] bg-[color:var(--ch-surface-3)] focus-within:ring-4 focus-within:ring-[color:var(--ch-accent-soft)]">
              <span className="shrink-0 pl-3 text-[13px] text-[color:var(--ch-muted)]">/news/</span>
              <input
                id="article-slug"
                className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-[13px] text-[color:var(--ch-text)] outline-none"
                value={draft.slug}
                maxLength={120}
                placeholder="made-from-the-headline"
                onChange={(e) => {
                  setSlugAuto(false);
                  update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-") });
                }}
                data-testid="input-slug"
              />
            </div>
            <p className={HINT}>
              {!published.isPublished
                ? "Follows the headline until you publish or change it yourself."
                : draft.slug !== (published.slug ?? "")
                  ? "Changing this breaks links to the article that have already been shared."
                  : "Where the article lives. Best left alone once it has been shared."}
            </p>
          </section>

          <details className="ch-card p-4">
            <summary className={`${LABEL} cursor-pointer select-none`}>More options</summary>
            <label htmlFor="article-source" className={`${LABEL} mt-4`}>
              Link to a story elsewhere
            </label>
            <input
              id="article-source"
              type="url"
              className="ch-input mt-2 h-10 w-full px-3 text-[13px]"
              value={draft.sourceUrl}
              maxLength={2000}
              placeholder="https://"
              onChange={(e) => update({ sourceUrl: e.target.value })}
              data-testid="input-source-url"
            />
            <p className={HINT}>Only for stories published on another site: news cards open this link instead of the article.</p>
          </details>
        </aside>
      </div>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        payload={{
          article: {
            title: draft.title,
            summary: draft.summary,
            content: draft.content,
            image_url: draft.imageUrl,
            image_alt: draft.imageAlt,
            image_credit: draft.imageCredit,
            league: draft.league,
            article_type: draft.articleType,
            published_at: published.publishedAt ?? new Date().toISOString(),
            source_url: draft.sourceUrl || null,
          },
          tags: draft.tags,
        }}
      />

      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent className="sa-pro bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] border-[color:var(--ch-border)]">
          <AlertDialogHeader>
            <AlertDialogTitle>{draft.title.trim() ? "Publish this article?" : "Add a headline first"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-[14px] text-[color:var(--ch-text-2)]">
                {draft.title.trim() ? (
                  <>
                    <p>It goes live straight away on the news page and the homepage.</p>
                    {publishChecks.length > 0 && (
                      <ul className="space-y-1.5 rounded-lg bg-[color:var(--ch-surface-3)] p-3 text-[13px]">
                        {publishChecks.map((check) => (
                          <li key={check} className="flex gap-2">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                            {check}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p>An article needs a headline before it can be published.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{draft.title.trim() ? "Not yet" : "OK"}</AlertDialogCancel>
            {draft.title.trim() && (
              <AlertDialogAction onClick={publish} className="bg-[color:var(--ch-accent)] text-white hover:brightness-110" data-testid="button-confirm-publish">
                Publish now
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
