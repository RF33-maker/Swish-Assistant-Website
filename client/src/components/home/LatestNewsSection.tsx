import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import type { NewsArticle } from "@shared/schema";
import { Newspaper, ArrowRight } from "lucide-react";
import { FeatureStory, HeadlineRow, NEWS_COLUMNS } from "@/components/news/NewsCards";
import SectionHeader from "@/components/home/SectionHeader";
import { Reveal } from "@/components/home/motion";

/**
 * Homepage news, laid out like a sports front page: the newest story as a
 * large image-led lead, the next few as a headline list beside it.
 */
export default function LatestNewsSection() {
  const { data: articles = null, isLoading: loading } = useQuery<NewsArticle[]>({
    queryKey: ["supabase", "news_articles", "latest", 6],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_articles")
        .select(NEWS_COLUMNS)
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(6);
      if (error) return [];
      return (data || []) as NewsArticle[];
    },
  });

  const [lead, ...rest] = articles ?? [];

  return (
    <section className="py-12 md:py-16" aria-labelledby="news-heading">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <SectionHeader
          id="news-heading"
          eyebrow="Latest news"
          title="Top stories"
          description="Stories, updates and headlines across the leagues we host."
          action={
            <Link href="/news" className="ch-btn ch-btn-ghost h-10 px-4">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
            <div className="ch-skel lg:col-span-2 h-[420px] lg:h-[560px] rounded-[14px]" />
            <div className="ch-card p-4 space-y-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="ch-skel h-[68px]" />)}
            </div>
          </div>
        ) : !lead ? (
          <div className="ch-card border-dashed p-10 text-center">
            <Newspaper className="h-8 w-8 text-[color:var(--ch-muted)] mx-auto mb-3" />
            <p className="text-[color:var(--ch-text)] font-medium">No news yet</p>
            <p className="text-sm text-[color:var(--ch-text-2)] mt-1">
              Check back soon — fresh stories will land here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
            <Reveal className={rest.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
              <FeatureStory article={lead} />
            </Reveal>
            {rest.length > 0 && (
              <Reveal delay={120} className="ch-card px-4 py-2 md:px-5 md:py-3 flex flex-col">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)] pt-2 pb-1">More headlines</div>
                <div className="divide-y divide-[color:var(--ch-border)] flex-1">
                  {rest.slice(0, 5).map((a) => (
                    <div key={a.id} className="py-1">
                      <HeadlineRow article={a} />
                    </div>
                  ))}
                </div>
              </Reveal>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
