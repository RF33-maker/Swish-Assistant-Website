import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { NewsArticle } from "@shared/schema";
import { Newspaper, ExternalLink } from "lucide-react";

function NewsCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-orange-100 dark:border-neutral-800 overflow-hidden animate-pulse">
      <div className="h-40 w-full bg-orange-100 dark:bg-neutral-800" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-20 bg-orange-100 dark:bg-neutral-800 rounded" />
        <div className="h-4 w-full bg-orange-100 dark:bg-neutral-800 rounded" />
        <div className="h-3 w-3/4 bg-orange-100 dark:bg-neutral-800 rounded" />
      </div>
    </div>
  );
}

export default function LatestNewsSection() {
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("news_articles")
          .select("*")
          .eq("is_published", true)
          .order("published_at", { ascending: false })
          .limit(6);
        if (cancelled) return;
        if (error) {
          setArticles([]);
        } else {
          setArticles((data || []) as NewsArticle[]);
        }
      } catch {
        if (!cancelled) setArticles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const formatDate = (s: string | Date | null) => {
    if (!s) return "";
    try {
      return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <section className="py-16 md:py-20 bg-gradient-to-b from-orange-50/40 to-white dark:from-neutral-900 dark:to-neutral-950">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-6 md:mb-8 animate-fade-in-up">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
            Latest News
          </h2>
          <div className="w-16 h-1 bg-orange-500 rounded-full mt-2" />
          <p className="mt-3 text-slate-600 dark:text-slate-400 text-sm md:text-base">
            Stories, updates and headlines across the leagues we host.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => <NewsCardSkeleton key={i} />)}
          </div>
        ) : !articles || articles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-orange-200 dark:border-neutral-800 p-10 text-center">
            <Newspaper className="h-8 w-8 text-orange-400 mx-auto mb-3" />
            <p className="text-slate-700 dark:text-slate-200 font-medium">No news yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Check back soon — fresh stories will land here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {articles.map((a, i) => {
              const card = (
                <article
                  className="group h-full rounded-2xl bg-white dark:bg-neutral-900 border border-orange-100 dark:border-neutral-800 overflow-hidden hover:border-orange-300 dark:hover:border-orange-500/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up flex flex-col"
                  style={{ animationDelay: `${i * 0.06}s`, opacity: 0, animationFillMode: "forwards" }}
                >
                  {a.image_url ? (
                    <div className="h-40 w-full overflow-hidden bg-orange-50 dark:bg-neutral-800">
                      <img
                        src={a.image_url}
                        alt={a.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="h-40 w-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center">
                      <Newspaper className="h-10 w-10 text-white/80" />
                    </div>
                  )}

                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      {a.league ? (
                        <span className="text-[10px] font-semibold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40 px-2 py-0.5 rounded-full uppercase tracking-wide truncate">
                          {a.league}
                        </span>
                      ) : <span />}
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                        {formatDate(a.published_at)}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug mb-2 line-clamp-2">
                      {a.title}
                    </h3>
                    {a.summary && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 flex-1">
                        {a.summary}
                      </p>
                    )}
                    {a.source_url && (
                      <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400">
                        Read more <ExternalLink className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                </article>
              );

              return a.source_url ? (
                <a
                  key={a.id}
                  href={a.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-full"
                >
                  {card}
                </a>
              ) : (
                <div key={a.id} className="h-full">{card}</div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
