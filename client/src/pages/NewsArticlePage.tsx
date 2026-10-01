import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/supabase";
import type { NewsArticle } from "@shared/schema";
import { ArrowLeft, ExternalLink, Newspaper, CalendarDays } from "lucide-react";
import GameEmbed from "@/components/GameEmbed";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { isGameSlug } from "@/lib/gameSlug";

const ARTICLE_COLUMNS =
  "id, title, summary, body, image_url, source_url, league, published_at, is_published";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Matches a game URL in any of its forms:
//   https://swishassistant.com/game/{slug}
//   https://swishassistant.com/game/{slug}
//   /game/{slug}
const GAME_URL_SOURCE =
  "(?:https?:\\/\\/(?:www\\.)?swishassistant\\.com)?\\/game\\/([\\w-]+)";

// Returns the game slug if the entire trimmed line is a bare game URL, else null.
function extractBareGameSlug(line: string): string | null {
  const trimmed = line.trim();
  const bare = /^(?:https?:\/\/(?:www\.)?swishassistant\.com)?\/game\/([\w-]+)\/?$/.exec(trimmed);
  if (!bare) return null;
  const slug = bare[1];
  return isGameSlug(slug) ? slug : null;
}

// Renders a plain-text line, turning any inline game URLs into anchor hyperlinks.
function renderLineWithInlineLinks(line: string, lineKey: string): React.ReactNode {
  const re = new RegExp(GAME_URL_SOURCE, "g");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const slug = match[1];
    const href = `/game/${slug}`;
    parts.push(
      <a
        key={`${lineKey}-link-${match.index}`}
        href={href}
        className="font-medium text-[color:var(--ch-accent)] underline underline-offset-2 hover:opacity-80"
        target="_blank"
        rel="noopener noreferrer"
      >
        {match[0]}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// Parses an article body into React nodes, promoting bare game URLs to GameEmbed cards.
function parseArticleBody(body: string): React.ReactNode[] {
  const lines = body.split("\n");
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      // Blank line → paragraph spacer
      nodes.push(<div key={`sp-${i}`} className="h-4" aria-hidden />);
      continue;
    }

    const gameSlug = extractBareGameSlug(trimmed);
    if (gameSlug) {
      nodes.push(
        <GameEmbed key={`embed-${i}`} slug={gameSlug} href={`/game/${gameSlug}`} />,
      );
      continue;
    }

    nodes.push(
      <p key={`p-${i}`} className="mb-4">
        {renderLineWithInlineLinks(line, `l${i}`)}
      </p>,
    );
  }

  return nodes;
}

const SITE_URL = "https://swishassistant.com";
const PUBLISHER_LOGO = `${SITE_URL}/icon-192.png`;

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <SiteHeader />
      <main className="pb-16">
        <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-8">
          <Link
            href="/news"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)] transition-colors"
            data-testid="link-home"
          >
            <ArrowLeft className="h-4 w-4" /> All news
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-10" data-testid="news-not-found">
      <div className="ch-card p-10 text-center">
        <Newspaper className="h-9 w-9 mx-auto text-[color:var(--ch-muted)] mb-3" />
        <h1 className="ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2rem] text-[color:var(--ch-text)]">
          Article not found
        </h1>
        <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">{message}</p>
        <Link href="/news" className="ch-btn ch-btn-primary h-10 px-5 mt-6">Back to news</Link>
      </div>
    </div>
  );
}

export default function NewsArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || "";

  const isUUID = UUID_REGEX.test(slug);

  const {
    data: article,
    isLoading,
    isError,
  } = useQuery<NewsArticle | null>({
    queryKey: ["supabase", "news_articles", "detail", slug],
    enabled: !!slug,
    queryFn: async () => {
      if (isUUID) {
        const { data, error } = await supabase
          .from("news_articles")
          .select(ARTICLE_COLUMNS)
          .eq("id", slug)
          .eq("is_published", true)
          .maybeSingle();
        if (error) throw error;
        return (data as NewsArticle | null) ?? null;
      }
      // Slug-based lookup — slug column may not exist yet in the DB.
      // If the query errors (e.g. column missing), return null so the
      // page shows "not found" instead of crashing.
      const { data, error } = await supabase
        .from("news_articles")
        .select(ARTICLE_COLUMNS)
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) return null;
      return (data as NewsArticle | null) ?? null;
    },
  });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  if (!slug) {
    return (
      <PageShell>
        <NotFound message="The article you're looking for doesn't exist or is no longer available." />
      </PageShell>
    );
  }

  if (isLoading || (isUUID && article?.slug)) {
    return (
      <PageShell>
        <article className="max-w-3xl mx-auto px-4 md:px-6 pt-6">
          <div className="ch-skel h-4 w-24 mb-4" />
          <div className="ch-skel h-10 w-full mb-3" />
          <div className="ch-skel h-10 w-3/4 mb-6" />
          <div className="ch-skel h-72 w-full rounded-[14px] mb-8" />
          <div className="space-y-3">
            <div className="ch-skel h-4 w-full" />
            <div className="ch-skel h-4 w-full" />
            <div className="ch-skel h-4 w-5/6" />
            <div className="ch-skel h-4 w-4/5" />
          </div>
        </article>
      </PageShell>
    );
  }

  if (isError || !article) {
    return (
      <PageShell>
        <NotFound message="This story may have been unpublished or removed." />
      </PageShell>
    );
  }

  const description =
    (article.summary && article.summary.trim()) ||
    (article.body
      ? article.body.replace(/\s+/g, " ").trim().slice(0, 160)
      : `${article.title} — read the full story on Swish Assistant.`);

  const canonicalSlug = article.slug || article.id;
  const canonical = `${SITE_URL}/news/${canonicalSlug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description,
    url: canonical,
    ...(article.published_at && {
      datePublished: new Date(article.published_at).toISOString(),
      dateModified: new Date(article.published_at).toISOString(),
    }),
    ...(article.image_url && { image: article.image_url }),
    publisher: {
      "@type": "Organization",
      name: "Swish Assistant",
      logo: {
        "@type": "ImageObject",
        url: PUBLISHER_LOGO,
      },
    },
  };

  return (
    <PageShell>
      <Helmet>
        <title>{`${article.title} | Swish Assistant`}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={`${article.title} | Swish Assistant`} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        {article.image_url && (
          <meta property="og:image" content={article.image_url} />
        )}
        {article.published_at && (
          <meta
            property="article:published_time"
            content={new Date(article.published_at).toISOString()}
          />
        )}
        <meta name="twitter:card" content={article.image_url ? "summary_large_image" : "summary"} />
        <meta name="twitter:title" content={`${article.title} | Swish Assistant`} />
        <meta name="twitter:description" content={description} />
        {article.image_url && (
          <meta name="twitter:image" content={article.image_url} />
        )}
        <link rel="canonical" href={canonical} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <article className="max-w-3xl mx-auto px-4 md:px-6 pt-6 ch-rise" data-testid="news-article">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
          {article.league && (
            <span
              className="inline-flex items-center h-6 px-2 rounded text-[10.5px] font-bold uppercase tracking-[0.08em] bg-orange-500 text-white"
              data-testid="text-league-badge"
            >
              {article.league}
            </span>
          )}
          {article.published_at && (
            <span className="inline-flex items-center gap-1 font-medium text-[color:var(--ch-muted)]">
              <CalendarDays className="h-3.5 w-3.5" />
              <time dateTime={new Date(article.published_at).toISOString()}>
                {formatDate(article.published_at)}
              </time>
            </span>
          )}
        </div>

        <h1
          className="ch-display uppercase font-bold tracking-tight leading-[0.98] text-[2.1rem] md:text-[3rem] text-[color:var(--ch-text)]"
          data-testid="text-article-title"
        >
          {article.title}
        </h1>

        {article.summary && (
          <p
            className="mt-4 text-lg leading-relaxed text-[color:var(--ch-text-2)]"
            data-testid="text-article-summary"
          >
            {article.summary}
          </p>
        )}

        {article.image_url && (
          <div className="mt-7 rounded-[14px] overflow-hidden bg-[color:var(--ch-surface-3)] border border-[color:var(--ch-border)] shadow-[var(--ch-shadow)]">
            <img
              src={article.image_url}
              alt={article.title}
              className="w-full h-auto object-cover"
              loading="eager"
              data-testid="img-article-cover"
            />
          </div>
        )}

        {article.body ? (
          <div
            className="mt-8 text-[16px] md:text-[17px] leading-[1.75] text-[color:var(--ch-text)]"
            data-testid="text-article-body"
          >
            {parseArticleBody(article.body)}
          </div>
        ) : (
          <p className="mt-8 italic text-[color:var(--ch-muted)]">
            No article body provided.
          </p>
        )}

        {article.source_url && (
          <div className="mt-10 pt-6 border-t border-[color:var(--ch-border)]">
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

        <div className="mt-10">
          <Link href="/news" className="ch-btn ch-btn-ghost h-10 px-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to all news
          </Link>
        </div>
      </article>
    </PageShell>
  );
}
