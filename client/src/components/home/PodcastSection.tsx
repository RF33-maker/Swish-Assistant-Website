import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, ExternalLink, Headphones, Play, Podcast } from "lucide-react";

type PodcastEpisode = {
  title: string;
  description: string;
  publishedAt: string | null;
  duration: string | null;
  artworkUrl: string | null;
  episodeUrl: string | null;
  audioUrl: string | null;
};

type PodcastResponse = {
  episode: PodcastEpisode | null;
  platforms: {
    youtube: string | null;
    spotify: string | null;
    apple: string | null;
  };
};

type Platform = keyof PodcastResponse["platforms"];

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  spotify: "Spotify",
  apple: "Apple Podcasts",
};

function PlatformLink({
  platform,
  url,
}: {
  platform: Platform;
  url: string | null;
}) {
  const label = PLATFORM_LABELS[platform];
  const badge = platform === "youtube" ? "YT" : platform === "spotify" ? "SP" : "AP";
  const className =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors";

  if (!url) {
    return (
      <span
        data-testid={`link-podcast-${platform}`}
        aria-disabled="true"
        title={`${label} link coming soon`}
        className={`${className} cursor-not-allowed border-white/10 bg-white/5 text-white/40`}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-[9px] font-bold">
          {badge}
        </span>
        {label}
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`link-podcast-${platform}`}
      className={`${className} border-white/15 bg-white/10 text-white hover:border-orange-300/60 hover:bg-orange-500/20 focus:outline-none focus:ring-2 focus:ring-orange-300`}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-400/20 text-[9px] font-bold text-orange-200">
        {badge}
      </span>
      {label}
      <ExternalLink className="h-3.5 w-3.5 text-orange-200" aria-hidden="true" />
    </a>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function PodcastSkeleton() {
  return (
    <div className="grid animate-pulse gap-6 md:grid-cols-[220px_1fr] md:items-center">
      <div className="aspect-square rounded-2xl bg-white/10" />
      <div className="space-y-4">
        <div className="h-3 w-28 rounded bg-white/10" />
        <div className="h-8 max-w-lg rounded bg-white/10" />
        <div className="h-16 max-w-2xl rounded bg-white/10" />
        <div className="h-11 w-52 rounded-xl bg-white/10" />
      </div>
    </div>
  );
}

export default function PodcastSection() {
  const { data, isLoading, isError } = useQuery<PodcastResponse>({
    queryKey: ["/api/public/podcast/latest"],
    queryFn: async () => {
      const response = await fetch("/api/public/podcast/latest");
      if (!response.ok) throw new Error("Podcast feed unavailable");
      return response.json() as Promise<PodcastResponse>;
    },
    staleTime: 15 * 60 * 1000,
    retry: false,
  });

  const episode = data?.episode;
  const description = episode?.description
    ? episode.description.length > 280
      ? `${episode.description.slice(0, 280).trimEnd()}…`
      : episode.description
    : "Listen to the latest episode of The Swish Roundup.";

  return (
    <section
      className="relative overflow-hidden bg-neutral-950 py-14 text-white md:py-18"
      aria-labelledby="latest-podcast-heading"
    >
      <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-orange-500/15 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-300">
              <Podcast className="h-4 w-4" aria-hidden="true" />
              The Swish Roundup
            </div>
            <h2 id="latest-podcast-heading" className="text-2xl font-bold md:text-3xl">
              Latest Podcast
            </h2>
            <div className="mt-2 h-1 w-16 rounded-full bg-orange-500" />
          </div>
          <Headphones className="hidden h-10 w-10 text-orange-300/40 sm:block" aria-hidden="true" />
        </div>

        <div className="rounded-3xl border border-orange-300/20 bg-gradient-to-br from-white/[0.11] to-white/[0.04] p-5 shadow-2xl shadow-orange-950/20 md:p-7">
          {isLoading ? (
            <PodcastSkeleton />
          ) : isError || !episode ? (
            <div className="flex flex-col items-start gap-3 py-5 sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-500/20 text-orange-300">
                <Podcast className="h-7 w-7" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-semibold text-white">The latest episode is on its way</h3>
                <p className="mt-1 text-sm text-white/60">
                  Check back soon for the newest episode of The Swish Roundup.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center md:gap-8">
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 shadow-xl shadow-orange-950/30">
                {episode.artworkUrl ? (
                  <img
                    src={episode.artworkUrl}
                    alt={`Artwork for ${episode.title}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Podcast className="h-20 w-20 text-white/80" aria-hidden="true" />
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  Listen now
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-orange-200/80">
                  {episode.publishedAt && (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatDate(episode.publishedAt)}
                    </span>
                  )}
                  {episode.duration && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      {episode.duration}
                    </span>
                  )}
                </div>
                <h3 className="max-w-3xl text-xl font-bold leading-tight text-white md:text-3xl">
                  {episode.title}
                </h3>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/65 md:text-base">
                  {description}
                </p>

                <div className="mt-6 flex flex-wrap gap-2.5" aria-label="Listen on">
                  <PlatformLink platform="youtube" url={data.platforms.youtube} />
                  <PlatformLink platform="spotify" url={data.platforms.spotify} />
                  <PlatformLink platform="apple" url={data.platforms.apple} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}