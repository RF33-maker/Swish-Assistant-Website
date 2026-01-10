import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Calendar, Download, Loader2, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PlayerPerformanceCardV1 } from "./PlayerPerformanceCardV1";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";
import useEmblaCarousel from "embla-carousel-react";
import html2canvas from "html2canvas";

type Props = {
  cards: PlayerPerformanceV1Data[];
  loading?: boolean;
  onRemove?: (index: number) => void;
  onClear?: () => void;
};

export function PostQueueSection({ cards, loading = false, onRemove, onClear }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const renderContainerRef = useRef<HTMLDivElement>(null);
  
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
    
    try {
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        setDownloadProgress(i + 1);
        
        const cardElement = document.getElementById(`download-card-${i}`);
        if (!cardElement) continue;
        
        const canvas = await html2canvas(cardElement, {
          scale: 1,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
          width: 1080,
          height: 1350,
        });
        
        const link = document.createElement("a");
        const safeName = card.player_name.replace(/[^a-zA-Z0-9]/g, "_");
        link.download = `${safeName}_${card.points}pts_${i + 1}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error("Error downloading cards:", error);
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

  return (
    <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700 mt-8">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-orange-900 dark:text-orange-400 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Post Queue ({cards.length} cards ready)
          </CardTitle>
          {cards.length > 0 && (
            <div className="flex items-center gap-2">
              {onClear && (
                <Button
                  onClick={onClear}
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  size="sm"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
              <Button
                onClick={downloadAllCards}
                disabled={isDownloading}
                className="bg-orange-500 hover:bg-orange-600 text-white"
                size="sm"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {downloadProgress}/{cards.length}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download All
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <Calendar className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">No cards in the queue</p>
            <p className="text-sm mt-1">Click performances above to add them here</p>
          </div>
        ) : (
          <div className="relative">
            {/* Navigation Arrows - Desktop */}
            <Button
              variant="outline"
              size="icon"
              onClick={scrollPrev}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 md:h-12 md:w-12 border-orange-200 dark:border-orange-700 bg-white/90 dark:bg-gray-800/90 shadow-lg hidden sm:flex"
              data-testid="button-queue-prev"
            >
              <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
            </Button>

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
                          className="bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden shadow-lg relative group"
                          style={{ width: "302px", height: "378px" }}
                        >
                          {onRemove && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemove(index);
                              }}
                              className="absolute top-2 right-2 z-20 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                              title="Remove from queue"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                          <div 
                            className="origin-top-left"
                            style={{ 
                              transform: "scale(0.28)",
                              transformOrigin: "top left",
                            }}
                          >
                            <PlayerPerformanceCardV1 data={card} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Navigation Arrows - Desktop */}
            <Button
              variant="outline"
              size="icon"
              onClick={scrollNext}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 md:h-12 md:w-12 border-orange-200 dark:border-orange-700 bg-white/90 dark:bg-gray-800/90 shadow-lg hidden sm:flex"
              data-testid="button-queue-next"
            >
              <ChevronRight className="h-5 w-5 md:h-6 md:w-6" />
            </Button>
            
            {/* Dot Indicators */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {cards.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => emblaApi?.scrollTo(idx)}
                  className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full transition-colors ${
                    idx === selectedIndex
                      ? "bg-orange-500"
                      : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
                  }`}
                  data-testid={`button-queue-dot-${idx}`}
                />
              ))}
            </div>
            
            {/* Current Card Info */}
            {currentCard && (
              <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-300">
                <span className="font-semibold">{currentCard.player_name}</span>
                <span className="mx-2 hidden sm:inline">•</span>
                <br className="sm:hidden" />
                <span>{currentCard.points} PTS, {currentCard.rebounds} REB, {currentCard.assists} AST</span>
              </div>
            )}
            
            {/* Mobile swipe hint */}
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2 sm:hidden">
              Swipe to browse cards
            </p>
          </div>
        )}
      </CardContent>
      
      {/* Hidden container for full-size card rendering (for download) */}
      <div
        ref={renderContainerRef}
        className="fixed left-[-9999px] top-0"
        style={{ zIndex: -1 }}
      >
        {cards.map((card, index) => (
          <div
            key={index}
            id={`download-card-${index}`}
            style={{ width: 1080, height: 1350 }}
          >
            <PlayerPerformanceCardV1 data={card} />
          </div>
        ))}
      </div>
    </Card>
  );
}
