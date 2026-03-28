import { useState, useEffect, useCallback, useRef } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_POSTS = 6;
const EMBED_VISIBLE_HEIGHT = 460;

interface InstagramCarouselProps {
  urls: string[];
}

function InstagramEmbed({ url }: { url: string }) {
  const embedUrl = getInstagramEmbedUrl(url);
  if (!embedUrl) return null;

  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{ height: EMBED_VISIBLE_HEIGHT }}
    >
      <iframe
        src={embedUrl}
        width="100%"
        height={EMBED_VISIBLE_HEIGHT + 200}
        className="border-0"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          overflow: "hidden",
        }}
        scrolling="no"
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
      />
    </div>
  );
}

function getInstagramEmbedUrl(url: string): string | null {
  if (!url) return null;

  const cleanUrl = url.split('?')[0];

  const profileRegex = /(?:instagram\.com\/)([A-Za-z0-9._]+)(?:\/)?$/;
  const profileMatch = cleanUrl.match(profileRegex);

  if (profileMatch) {
    return `https://www.instagram.com/${profileMatch[1]}/embed`;
  }

  const postRegex = /instagram\.com\/(p|reel|reels)\/([A-Za-z0-9_-]+)/;
  const postMatch = cleanUrl.match(postRegex);

  if (postMatch) {
    const type = postMatch[1];
    const id = postMatch[2];
    
    if (type === 'reel' || type === 'reels') {
      return `https://www.instagram.com/reel/${id}/embed`;
    } else {
      return `https://www.instagram.com/p/${id}/embed`;
    }
  }

  return null;
}

export function InstagramCarousel({ urls }: InstagramCarouselProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const cappedUrls = urls.slice(0, MAX_POSTS);

  const autoplayRef = useRef<ReturnType<typeof Autoplay> | null>(null);
  if (!autoplayRef.current) {
    autoplayRef.current = Autoplay({
      delay: 6000,
      stopOnInteraction: false,
      stopOnMouseEnter: false,
    });
  }

  useEffect(() => {
    if (!api) {
      return;
    }

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  const scrollPrev = useCallback(() => {
    api?.scrollPrev();
  }, [api]);

  const scrollNext = useCallback(() => {
    api?.scrollNext();
  }, [api]);

  const toggleAutoplay = useCallback(() => {
    const autoplay = autoplayRef.current;
    if (!autoplay) return;

    if (isPlaying) {
      autoplay.stop();
      setIsPlaying(false);
    } else {
      autoplay.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  if (!cappedUrls || cappedUrls.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">No Instagram posts available</p>
      </div>
    );
  }

  if (cappedUrls.length === 1) {
    const embedUrl = getInstagramEmbedUrl(cappedUrls[0]);
    if (!embedUrl) {
      return (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">Invalid Instagram URL</p>
        </div>
      );
    }

    return (
      <InstagramEmbed url={cappedUrls[0]} />
    );
  }

  return (
    <div className="relative" data-testid="instagram-carousel">
      <Carousel
        setApi={setApi}
        plugins={[autoplayRef.current]}
        opts={{
          align: "start",
          loop: true,
        }}
        className="w-full"
      >
        <CarouselContent>
          {cappedUrls.map((url, index) => {
            const embedUrl = getInstagramEmbedUrl(url);
            if (!embedUrl) return null;

            return (
              <CarouselItem key={index}>
                <InstagramEmbed url={url} />
              </CarouselItem>
            );
          })}
        </CarouselContent>

        <Button
          variant="outline"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 hover:bg-white shadow-lg z-10"
          onClick={scrollPrev}
          data-testid="carousel-prev-button"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">Previous post</span>
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 hover:bg-white shadow-lg z-10"
          onClick={scrollNext}
          data-testid="carousel-next-button"
        >
          <ChevronRight className="h-5 w-5" />
          <span className="sr-only">Next post</span>
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-4 right-4 h-8 w-8 rounded-full bg-white/90 hover:bg-white shadow-lg z-10"
          onClick={toggleAutoplay}
          data-testid="carousel-autoplay-toggle"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          <span className="sr-only">{isPlaying ? "Pause" : "Play"} autoplay</span>
        </Button>

        {count > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {Array.from({ length: count }).map((_, index) => (
              <button
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === current
                    ? "w-8 bg-orange-500"
                    : "w-2 bg-gray-300 hover:bg-gray-400"
                }`}
                onClick={() => api?.scrollTo(index)}
                aria-label={`Go to post ${index + 1}`}
                data-testid={`carousel-dot-${index}`}
              />
            ))}
          </div>
        )}
      </Carousel>
    </div>
  );
}
