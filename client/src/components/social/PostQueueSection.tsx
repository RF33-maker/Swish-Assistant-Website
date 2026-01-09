import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, Filter, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SocialCardRenderer } from "./SocialCardRenderer";
import { supabase } from "@/lib/supabase";
import type { SocialCardRow } from "@/types/socialCards";

interface League {
  league_id: string;
  name: string;
}

export function PostQueueSection() {
  const [cards, setCards] = useState<SocialCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>("all");

  useEffect(() => {
    fetchLeagues();
  }, []);

  useEffect(() => {
    fetchQueuedCards();
  }, [selectedLeague]);

  const fetchLeagues = async () => {
    const { data, error } = await supabase
      .from("leagues")
      .select("league_id, name")
      .order("name");
    
    if (!error && data) {
      setLeagues(data);
    }
  };

  const fetchQueuedCards = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("social_cards")
        .select("*")
        .eq("ready_to_post", true)
        .eq("posted", false)
        .order("created_at", { ascending: false })
        .limit(8);
      
      if (selectedLeague !== "all") {
        query = query.eq("league_id", selectedLeague);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[PostQueue] Error fetching cards:", error);
        return;
      }

      setCards(data || []);
      setCurrentIndex(0);
    } catch (err) {
      console.error("[PostQueue] Failed to fetch queued cards:", err);
    } finally {
      setLoading(false);
    }
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-orange-900 dark:text-orange-400 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Post Queue ({cards.length} cards ready)
          </CardTitle>
          <Select value={selectedLeague} onValueChange={setSelectedLeague}>
            <SelectTrigger className="w-[180px] border-orange-200 dark:border-orange-700" data-testid="select-queue-league">
              <Filter className="h-4 w-4 mr-2 text-orange-500" />
              <SelectValue placeholder="All Leagues" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leagues</SelectItem>
              {leagues.map((league) => (
                <SelectItem key={league.league_id} value={league.league_id}>
                  {league.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <Calendar className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">No cards in the queue</p>
            <p className="text-sm mt-1">Cards marked as "ready to post" will appear here</p>
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
                  <SocialCardRenderer 
                    template={currentCard.template} 
                    data={currentCard.data} 
                  />
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
              
              {currentCard.caption && (
                <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-300 font-medium mb-1">Caption:</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{currentCard.caption}</p>
                </div>
              )}
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
