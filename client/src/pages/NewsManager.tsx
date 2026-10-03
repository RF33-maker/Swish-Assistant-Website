import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ExternalLink, ImageOff, Loader2, Newspaper, PenLine, Plus, Trash2 } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
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
import { supabase } from "@/lib/supabase";
import { NEWS_QUERY_KEY, deleteArticle, invalidateNewsQueries } from "@/lib/newsArticles";
import { articleTypeLabel } from "@shared/newsArticle";
import type { NewsArticle } from "@shared/schema";

/**
 * /news-manager — every article, drafts included, with the way into the
 * editor (pages/NewsEditorPage) for a new or existing one.
 */

type ListArticle = Pick<
  NewsArticle,
  "id" | "title" | "slug" | "summary" | "image_url" | "league" | "article_type" | "published_at" | "updated_at" | "is_published"
>;

const LIST_COLUMNS = "id, title, slug, summary, image_url, league, article_type, published_at, updated_at, is_published";
const NEW_ARTICLE_PATH = "/news-manager/edit/new";

type Filter = "all" | "draft" | "published";

const formatDay = (value: string | Date | null) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function NewsManager() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingDelete, setPendingDelete] = useState<ListArticle | null>(null);

  const { data: articles = [], isLoading, isError, error, refetch } = useQuery<ListArticle[]>({
    queryKey: [...NEWS_QUERY_KEY, "manager-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("news_articles").select(LIST_COLUMNS).order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ListArticle[];
    },
  });

  const counts = useMemo(
    () => ({
      all: articles.length,
      draft: articles.filter((a) => !a.is_published).length,
      published: articles.filter((a) => a.is_published).length,
    }),
    [articles],
  );
  const shown = articles.filter((a) => filter === "all" || (filter === "published") === a.is_published);

  const deleteMutation = useMutation({
    mutationFn: (article: ListArticle) => deleteArticle(article.id),
    onSuccess: () => {
      invalidateNewsQueries();
      toast({ title: "Article deleted", description: "The article has been removed." });
      setPendingDelete(null);
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.message || "Could not delete the article.", variant: "destructive" });
    },
  });

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>News manager | Swish Assistant</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <SiteHeader />
      <main className="max-w-4xl mx-auto px-4 md:px-6 pt-6 md:pt-9 pb-16">
        <header className="ch-rise">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">News manager</div>
              <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3rem] text-[color:var(--ch-text)]">
                Articles
              </h1>
              <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">Write, edit and publish the stories on the news page.</p>
            </div>
            <Link href={NEW_ARTICLE_PATH} className="ch-btn ch-btn-primary h-10 px-4 text-[14px]" data-testid="button-new-article">
              <Plus className="h-4 w-4" /> New article
            </Link>
          </div>
        </header>

        <div className="ch-seg mt-7" role="group" aria-label="Filter articles">
          {(
            [
              ["all", "All"],
              ["draft", "Drafts"],
              ["published", "Published"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" data-active={filter === value} onClick={() => setFilter(value)} className="h-8 px-3.5 text-[13px]" data-testid={`filter-${value}`}>
              {label}
              {!isLoading && <span className="ml-1.5 text-[color:var(--ch-muted)]">{counts[value]}</span>}
            </button>
          ))}
        </div>

        <section className="ch-card ch-rise mt-4 overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-[color:var(--ch-border)]" data-testid="news-list-loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <div className="ch-skel h-[54px] w-24 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="ch-skel h-4 w-2/3" />
                    <div className="ch-skel h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-10 text-center" data-testid="news-list-error">
              <p className="font-semibold text-[color:var(--ch-text)]">Couldn't load articles</p>
              <p className="mt-1 text-sm text-[color:var(--ch-text-2)]">{(error as any)?.message || "Please try again."}</p>
              <button type="button" className="ch-btn ch-btn-ghost mt-4" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          ) : shown.length === 0 ? (
            <div className="p-10 text-center" data-testid="news-list-empty">
              <Newspaper className="mx-auto mb-3 h-8 w-8 text-[color:var(--ch-muted)]" />
              <p className="font-semibold text-[color:var(--ch-text)]">
                {articles.length === 0 ? "No articles yet" : filter === "draft" ? "No drafts" : "Nothing published yet"}
              </p>
              <p className="mt-1 text-sm text-[color:var(--ch-text-2)]">
                {articles.length === 0 ? "Write your first story to fill the news page." : "Switch the filter to see your other articles."}
              </p>
              {articles.length === 0 && (
                <Link href={NEW_ARTICLE_PATH} className="ch-btn ch-btn-primary mt-4 h-10 px-4" data-testid="button-empty-new-article">
                  <Plus className="h-4 w-4" /> New article
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--ch-border)]" data-testid="news-list">
              {shown.map((a) => (
                <li key={a.id} className="group relative flex items-center gap-4 p-4 hover:bg-[color:var(--ch-surface-2)]" data-testid={`news-item-${a.id}`}>
                  <div className="flex h-[54px] w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[color:var(--ch-surface-3)]">
                    {a.image_url ? (
                      <img src={a.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-[color:var(--ch-muted)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* The whole row opens the editor; the buttons on the right sit above this link. */}
                    <Link
                      href={`/news-manager/edit/${a.id}`}
                      className="block truncate text-[15px] font-semibold text-[color:var(--ch-text)] after:absolute after:inset-0"
                      data-testid={`button-edit-${a.id}`}
                    >
                      {a.title || "Untitled draft"}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[color:var(--ch-muted)]">
                      <span
                        className={`inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-bold uppercase tracking-[0.06em] ${
                          a.is_published ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]"
                        }`}
                      >
                        {a.is_published ? "Published" : "Draft"}
                      </span>
                      {a.article_type !== "news" && <span>{articleTypeLabel(a.article_type)}</span>}
                      {a.league && <span className="truncate">{a.league}</span>}
                      <span>{a.is_published ? `Published ${formatDay(a.published_at)}` : `Edited ${formatDay(a.updated_at)}`}</span>
                    </div>
                  </div>
                  <div className="relative z-10 flex shrink-0 items-center gap-1">
                    <span className="mr-1 hidden items-center gap-1.5 text-[13px] font-semibold text-[color:var(--ch-text-2)] group-hover:text-[color:var(--ch-text)] sm:inline-flex pointer-events-none">
                      <PenLine className="h-3.5 w-3.5" /> Edit
                    </span>
                    {a.is_published && (
                      <a
                        href={`/news/${a.slug || a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View article"
                        aria-label={`View ${a.title}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ch-text-2)] hover:bg-[color:var(--ch-surface-3)] hover:text-[color:var(--ch-text)]"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      title="Delete article"
                      aria-label={`Delete ${a.title || "untitled draft"}`}
                      onClick={() => setPendingDelete(a)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ch-text-2)] hover:bg-[color:var(--ch-surface-3)] hover:text-[color:var(--ch-loss)]"
                      data-testid={`button-delete-${a.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="sa-pro bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] border-[color:var(--ch-border)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this article?</AlertDialogTitle>
            <AlertDialogDescription className="text-[color:var(--ch-text-2)]">
              "{pendingDelete?.title || "Untitled draft"}" will be permanently removed, along with its images. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending} data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete);
              }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
