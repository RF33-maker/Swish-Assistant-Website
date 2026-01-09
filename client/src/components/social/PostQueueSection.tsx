import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PlayerPerformanceCardV1 } from "./PlayerPerformanceCardV1";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";

type Props = {
  cards: PlayerPerformanceV1Data[];
  loading?: boolean;
};

export function PostQueueSection({ cards, loading = false }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : cards.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < cards.length - 1 ? prev + 1 : 0));
  };

  const currentCard = cards[currentIndex];

  return (
    <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700 mt-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-orange-900 dark:text-orange-400 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Post Queue ({cards.length} cards ready)
        </CardTitle>
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
            <p className="text-sm mt-1">Top performances will appear here</p>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={goToPrevious}
              className="shrink-0 h-12 w-12 border-orange-200 dark:border-orange-700"
              data-testid="button-queue-prev"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>

            <div className="flex-1 overflow-hidden">
              <div className="bg-gray-200 dark:bg-gray-700 p-4 rounded-lg">
                <div 
                  className="mx-auto origin-top"
                  style={{ 
                    transform: "scale(0.4)", 
                    transformOrigin: "top center",
                    width: "1080px",
                    height: "540px",
                    position: "relative",
                    left: "50%",
                    marginLeft: "-540px"
                  }}
                >
                  <PlayerPerformanceCardV1 data={currentCard} />
                </div>
              </div>
              
              <div className="flex items-center justify-center gap-2 mt-4">
                {cards.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      idx === currentIndex
                        ? "bg-orange-500"
                        : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
                    }`}
                    data-testid={`button-queue-dot-${idx}`}
                  />
                ))}
              </div>
              
              <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-300">
                <span className="font-semibold">{currentCard.player_name}</span>
                <span className="mx-2">•</span>
                <span>{currentCard.points} PTS, {currentCard.rebounds} REB, {currentCard.assists} AST</span>
              </div>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={goToNext}
              className="shrink-0 h-12 w-12 border-orange-200 dark:border-orange-700"
              data-testid="button-queue-next"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
