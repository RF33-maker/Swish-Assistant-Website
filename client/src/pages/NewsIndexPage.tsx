import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/supabase";
import type { NewsArticle } from "@shared/schema";
import { Newspaper } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { FeatureStory, HeadlineRow, NewsCard, NEWS_COLUMNS } from "@/components/news/NewsCards";

const SITE_URL = "https://swishassistant.com";

/**
 * /news — every published story, laid out like the homepage's news: the
 * newest as the lead with the next few as headlines beside it, then the rest
 * as a grid.
 */
export default function NewsIndexPage() {
  const { data: articles = [], isLoading } = useQuery<NewsArticle[]>({
    queryKey: ["supabase", "news_articles", "index"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_articles")
        .select(NEWS_COLUMNS)
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      if (error) return [];
      return (data || []) as NewsArticle[];
    },
  });

  const canonical = `${SITE_URL}/news`;
  const description =
    "Basketball news, league updates, and stories from competitions on Swish Assistant.";

  const [lead, ...rest] = articles;
  const headlines = rest.slice(0, 4);
  const more = rest.slice(4);

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Latest News | Swish Assistant</title>
        <meta name="description" content={description} />
        <meta property="og:title" content="Latest News | Swish Assistant" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={canonical} />
      </Helmet>
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-4 md:px-6 pt-6 md:pt-9 pb-16">
        <header className="ch-rise mb-6 md:mb-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">News</div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3.25rem] text-[color:var(--ch-text)]">
            Latest news
          </h1>
          <p className="mt-2 text-sm md:text-[15px] text-[color:var(--ch-text-2)] max-w-2xl">
            Stories, updates and headlines across the leagues we host.
          </p>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
            <div className="ch-skel lg:col-span-2 h-[420px] lg:h-[520px] rounded-[14px]" />
            <div className="ch-card p-4 space-y-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="ch-skel h-[68px]" />)}
            </div>
          </div>
        ) : !lead ? (
          <div className="ch-card border-dashed p-12 text-center">
            <Newspaper className="h-9 w-9 text-[color:var(--ch-muted)] mx-auto mb-3" />
            <p className="font-medium text-[color:var(--ch-text)] text-lg">No news yet</p>
            <p className="text-sm text-[color:var(--ch-text-2)] mt-1">Check back soon — fresh stories will land here.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
              <div className={headlines.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
                <FeatureStory article={lead} />
              </div>
              {headlines.length > 0 && (
                <div className="ch-card px-4 py-2 md:px-5 md:py-3 flex flex-col">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)] pt-2 pb-1">More headlines</div>
                  <div className="divide-y divide-[color:var(--ch-border)] flex-1">
                    {headlines.map((a) => (
                      <div key={a.id} className="py-1">
                        <HeadlineRow article={a} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {more.length > 0 && (
              <section className="mt-10 md:mt-12" aria-labelledby="more-stories-heading">
                <h2
                  id="more-stories-heading"
                  className="ch-display uppercase font-bold tracking-tight leading-none text-[1.5rem] md:text-[1.75rem] text-[color:var(--ch-text)] mb-4"
                >
                  More stories
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                  {more.map((a) => <NewsCard key={a.id} article={a} />)}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
