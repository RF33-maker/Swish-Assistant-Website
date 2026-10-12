import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar, Download, Loader2, X, Trash2 } from "lucide-react";
import { PlayerPerformanceCardV1 } from "./PlayerPerformanceCardV1";
import { BTN_GHOST, BTN_PRIMARY, ERROR, HINT, Panel } from "./studioUi";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";
import useEmblaCarousel from "embla-carousel-react";
import { renderSocialCardToBlob } from "@/lib/socialCardCapture";

type Props = {
  cards: PlayerPerformanceV1Data[];
  loading?: boolean;
  onRemove?: (index: number) => void;
  onClear?: () => void;
  template?: string;
};

export function PostQueueSection({ cards, loading = false, onRemove, onClear, template = "default" }: Props) {
  const isReel = template === "photo-overlay-reel";
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "center",
    skipSnaps: false,
    dragFree: false,
  });

  const downloadAllCards = async () => {
    if (cards.length === 0 || isDownloading) return;
    
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadError(null);
    
    try {
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        setDownloadProgress(i + 1);
        
        const blob = await renderSocialCardToBlob(card, template);
        if (!blob) continue;
        
        const link = document.createElement("a");
        const safeName = card.player_name.replace(/[^a-zA-Z0-9]/g, "_");
        link.download = `${safeName}_${card.points}pts_${i + 1}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error("Error downloading cards:", error);
      setDownloadError("A card asset did not finish loading. Please try the download again.");
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Reinitialize when cards change
  useEffect(() => {
    if (emblaApi) {
      emblaApi.reInit();
    }
  }, [emblaApi, cards.length]);

  const currentCard = cards[selectedIndex];

  const arrow =
    "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] shadow-[var(--ch-shadow-lg)] transition hover:bg-[color:var(--ch-surface-3)] sm:flex";

  return (
    <Panel
      title={`Post queue (${cards.length} card${cards.length === 1 ? "" : "s"} ready)`}
      icon={Calendar}
      action={
        cards.length > 0 && (
          <div className="flex items-center gap-2">
            {onClear && (
              <button type="button" onClick={onClear} className={`${BTN_GHOST} hover:!text-[color:var(--ch-loss)]`}>
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            )}
            <button type="button" onClick={downloadAllCards} disabled={isDownloading} className={BTN_PRIMARY}>
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {downloadProgress}/{cards.length}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download All
                </>
              )}
            </button>
          </div>
        )
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-[color:var(--ch-accent)]" />
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-[color:var(--ch-text-2)]">
          <Calendar className="mb-3 h-10 w-10 text-[color:var(--ch-muted)]" />
          <p className="font-semibold text-[color:var(--ch-text)]">No cards in the queue</p>
          <p className="mt-1 text-sm">Click performances above to add them here</p>
        </div>
      ) : (
        <div className="relative">
          {/* Navigation Arrows - Desktop */}
          <button type="button" onClick={scrollPrev} aria-label="Previous card" className={`${arrow} left-0`} data-testid="button-queue-prev">
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Embla Carousel */}
          <div className="overflow-hidden mx-0 sm:mx-14" ref={emblaRef}>
            <div className="flex touch-pan-y">
              {cards.map((card, index) => {
                const isSelected = index === selectedIndex;
                const distance = Math.abs(index - selectedIndex);
                // Handle loop wrapping
                const wrappedDistance = Math.min(distance, cards.length - distance);
                
                return (
                  <div
                    key={index}
                    className="flex-none px-1 sm:px-2 md:px-3 transition-all duration-300 ease-out flex justify-center"
                    style={{
                      width: "320px",
                    }}
                  >
                    <div
                      className={`
                        transition-all duration-300 ease-out
                        ${isSelected 
                          ? "scale-100 opacity-100" 
                          : wrappedDistance === 1 
                            ? "scale-90 opacity-70" 
                            : "scale-80 opacity-50"
                        }
                      `}
                    >
                      <div 
                        className="group relative overflow-hidden rounded-lg bg-[color:var(--ch-surface-3)] shadow-[var(--ch-shadow-lg)]"
                        style={{ width: isReel ? "216px" : "302px", height: isReel ? "384px" : "378px" }}
                      >
                        {onRemove && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemove(index);
                            }}
                            className="absolute top-2 right-2 z-20 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shadow-lg"
                            title="Remove from queue"
                            aria-label={`Remove ${card.player_name} from the queue`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                        <div 
                          className="origin-top-left"
                          style={{ 
                            transform: `scale(${isReel ? 0.2 : 0.28})`,
                            transformOrigin: "top left",
                          }}
                        >
                          <PlayerPerformanceCardV1 data={card} template={template} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation Arrows - Desktop */}
          <button type="button" onClick={scrollNext} aria-label="Next card" className={`${arrow} right-0`} data-testid="button-queue-next">
            <ChevronRight className="h-5 w-5" />
          </button>
          
          {/* Dot Indicators */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {cards.map((_, idx) => (
              <button
                key={idx}
                onClick={() => emblaApi?.scrollTo(idx)}
                aria-label={`Go to card ${idx + 1}`}
                className={`h-2 w-2 rounded-full transition-colors md:h-2.5 md:w-2.5 ${
                  idx === selectedIndex
                    ? "bg-[color:var(--ch-accent)]"
                    : "bg-[color:var(--ch-border-strong)] hover:bg-[color:var(--ch-muted)]"
                }`}
                data-testid={`button-queue-dot-${idx}`}
              />
            ))}
          </div>
          
          {/* Current Card Info */}
          {currentCard && (
            <div className="mt-4 text-center text-sm text-[color:var(--ch-text-2)]">
              <span className="font-semibold text-[color:var(--ch-text)]">{currentCard.player_name}</span>
              <span className="mx-2 hidden sm:inline">•</span>
              <br className="sm:hidden" />
              <span>{currentCard.points} PTS, {currentCard.rebounds} REB, {currentCard.assists} AST</span>
            </div>
          )}

          {downloadError && (
            <p className={`mt-3 text-center ${ERROR}`} role="alert">
              {downloadError}
            </p>
          )}
          
          {/* Mobile swipe hint */}
          <p className={`mt-2 text-center sm:hidden ${HINT}`}>
            Swipe to browse cards
          </p>
        </div>
      )}
    </Panel>
  );
}
