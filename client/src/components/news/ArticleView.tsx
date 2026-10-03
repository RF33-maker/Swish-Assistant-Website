import { Link } from "wouter";
import { CalendarDays, ExternalLink } from "lucide-react";
import ArticleBody from "@/components/news/ArticleBody";
import LegacyArticleBody from "@/components/news/LegacyArticleBody";
import ArticleTagChips from "@/components/news/ArticleTagChips";
import { articleTagHref, articleTypeLabel, type ArticleDoc, type ArticleTag } from "@shared/newsArticle";

export interface ArticleViewData {
  title: string;
  summary?: string | null;
  body?: string | null;
  content?: unknown;
  image_url?: string | null;
  image_alt?: string | null;
  image_credit?: string | null;
  league?: string | null;
  article_type?: string | null;
  published_at?: string | Date | null;
  source_url?: string | null;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

const KICKER = "inline-flex items-center h-6 px-2 rounded text-[10.5px] font-bold uppercase tracking-[0.08em]";

/**
 * An article as readers see it: kicker, headline, standfirst, cover image,
 * body and the pages it's tagged with. The public article page and the
 * editor's preview both render this, so the preview can't drift from the real
 * thing. With `preview`, links are shown but don't navigate.
 */
export default function ArticleView({
  article,
  tags = [],
  preview = false,
}: {
  article: ArticleViewData;
  tags?: ArticleTag[];
  preview?: boolean;
}) {
  const doc = article.content as ArticleDoc | null | undefined;
  const leagueTag = tags.find((t) => t.kind === "league") ?? tags.find((t) => t.kind === "competition");
  const leagueLabel = leagueTag?.label || article.league;
  const showType = !!article.article_type && article.article_type !== "news";

  return (
    <div
      onClickCapture={
        preview
          ? (e) => {
              if ((e.target as HTMLElement).closest("a")) {
                e.preventDefault();
                e.stopPropagation();
              }
            }
          : undefined
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2.5 text-xs">
        {leagueLabel &&
          (leagueTag ? (
            <Link href={articleTagHref(leagueTag)} className={`${KICKER} bg-orange-500 text-white hover:brightness-110`} data-testid="text-league-badge">
              {leagueLabel}
            </Link>
          ) : (
            <span className={`${KICKER} bg-orange-500 text-white`} data-testid="text-league-badge">
              {leagueLabel}
            </span>
          ))}
        {showType && (
          <span className={`${KICKER} border border-[color:var(--ch-border-strong)] text-[color:var(--ch-text-2)]`}>
            {articleTypeLabel(article.article_type)}
          </span>
        )}
        {article.published_at && (
          <span className="inline-flex items-center gap-1 font-medium text-[color:var(--ch-muted)]">
            <CalendarDays className="h-3.5 w-3.5" />
            <time dateTime={new Date(article.published_at).toISOString()}>{formatDate(article.published_at)}</time>
          </span>
        )}
      </div>

      <h1
        className="ch-display uppercase font-bold tracking-tight leading-[0.98] text-[2.1rem] md:text-[3rem] text-[color:var(--ch-text)] break-words"
        data-testid="text-article-title"
      >
        {article.title || "Untitled"}
      </h1>

      {article.summary && (
        <p className="mt-4 text-lg leading-relaxed text-[color:var(--ch-text-2)]" data-testid="text-article-summary">
          {article.summary}
        </p>
      )}

      {article.image_url && (
        <figure className="mt-7">
          <div className="rounded-[14px] overflow-hidden bg-[color:var(--ch-surface-3)] border border-[color:var(--ch-border)] shadow-[var(--ch-shadow)]">
            <img
              src={article.image_url}
              alt={article.image_alt || article.title}
              className="w-full h-auto object-cover"
              loading="eager"
              data-testid="img-article-cover"
            />
          </div>
          {article.image_credit && (
            <figcaption className="mt-2 text-[12px] text-[color:var(--ch-muted)]">Photo: {article.image_credit}</figcaption>
          )}
        </figure>
      )}

      <div className="mt-8">
        {doc?.content?.length ? (
          <ArticleBody doc={doc} />
        ) : article.body ? (
          <LegacyArticleBody body={article.body} />
        ) : (
          <p className="italic text-[color:var(--ch-muted)]">No article body yet.</p>
        )}
      </div>

      {tags.length > 0 && (
        <div className="mt-10 pt-6 border-t border-[color:var(--ch-border)]">
          <div className="ch-eyebrow mb-3">In this story</div>
          <ArticleTagChips tags={tags} />
        </div>
      )}

      {article.source_url && (
        <div className="mt-8 pt-6 border-t border-[color:var(--ch-border)]">
          <a
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--ch-accent)] hover:opacity-80"
            data-testid="link-source"
          >
            Read the original source <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  );
}
