import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Helmet } from "react-helmet-async";
import { slugToName } from "@/lib/fuzzyMatch";
import { PlayerProfileContent } from "@/components/PlayerProfileContent";

export default function PlayerStatsPage() {
  const [match, params] = useRoute("/player/:slug");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const playerSlugOrId = params?.slug;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      const [leaguesResponse, playersResponse] = await Promise.all([
        supabase.from("leagues").select("name, slug").or(`name.ilike.%${searchQuery}%`).eq("is_public", true),
        supabase.from("player_stats").select("name, team, id").ilike("name", `%${searchQuery}%`).limit(10),
      ]);

      const leagues = leaguesResponse.data || [];
      const players = playersResponse.data || [];

      const uniquePlayers = players.reduce((acc: any[], player) => {
        if (!acc.some(p => p.name === player.name)) {
          acc.push({ name: player.name, team: player.team, player_id: player.id, type: 'player' });
        }
        return acc;
      }, []);

      const formattedLeagues = leagues.map(league => ({ ...league, type: 'league' }));
      setSearchSuggestions([...formattedLeagues, ...uniquePlayers].slice(0, 8));
    };

    const delayDebounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const handleSearchSelect = (item: any) => {
    setSearchQuery("");
    setSearchSuggestions([]);
    if (item.type === 'league') setLocation(`/league/${item.slug}`);
    else if (item.type === 'player') setLocation(`/player/${item.player_id}`);
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const { data, error } = await supabase
      .from("leagues").select("slug").ilike("name", `%${searchQuery.toLowerCase()}%`).eq("is_public", true);

    if (error) console.error("Supabase error:", error);

    if (data && data.length > 0) {
      setLocation(`/league/${data[0].slug}`);
    } else {
      const { data: playerData } = await supabase
        .from("player_stats").select("id, name").ilike("name", `%${searchQuery}%`).limit(1);

      if (playerData && playerData.length > 0) {
        setLocation(`/player/${playerData[0].id}`);
      } else {
        toast({ title: "No Results", description: "No players or leagues found with that name.", variant: "destructive" });
      }
    }
  };

  if (!playerSlugOrId) return null;

  const playerDisplayName = slugToName(playerSlugOrId);

  return (
    <>
      <Helmet>
        <title>{playerDisplayName ? `${playerDisplayName} | Player Stats | Swish Assistant` : "Player Profile | Swish Assistant"}</title>
        <meta name="description" content={playerDisplayName ? `View ${playerDisplayName}'s basketball stats, game-by-game performance, and AI-powered analysis on Swish Assistant.` : "Explore player stats and basketball performance data on Swish Assistant."} />
        <meta property="og:title" content={playerDisplayName ? `${playerDisplayName} | Player Stats | Swish Assistant` : "Player Profile | Swish Assistant"} />
        <meta property="og:description" content={playerDisplayName ? `View ${playerDisplayName}'s basketball stats on Swish Assistant.` : "Explore player stats and basketball performance data on Swish Assistant."} />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={`https://www.swishassistant.com/player/${playerSlugOrId}`} />
        <meta property="og:image" content="https://www.swishassistant.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={playerDisplayName ? `${playerDisplayName} | Player Stats | Swish Assistant` : "Player Profile | Swish Assistant"} />
        <meta name="twitter:description" content={playerDisplayName ? `${playerDisplayName}'s basketball stats on Swish Assistant.` : "Explore player stats on Swish Assistant."} />
        <link rel="canonical" href={`https://www.swishassistant.com/player/${playerSlugOrId}`} />
      </Helmet>

      <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
        <header className="bg-white dark:bg-neutral-900 shadow-sm sticky top-0 z-50 px-3 md:px-6 py-1.5 md:py-3">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center shrink-0">
              <img
                src={SwishLogo}
                alt="Swish Assistant"
                className="h-6 md:h-9 cursor-pointer"
                onClick={() => setLocation("/")}
              />
            </div>

            <form onSubmit={handleSearchSubmit} className="relative flex-1 md:max-w-md md:mx-6">
              <input
                type="text"
                placeholder="Search leagues or players"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1 md:py-2 border border-gray-300 dark:border-neutral-700 rounded-full text-xs md:text-sm bg-white dark:bg-neutral-800 text-slate-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <button
                type="submit"
                className="absolute right-0 top-0 h-full px-2.5 md:px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-full text-xs md:text-sm"
              >
                Go
              </button>

              {searchSuggestions.length > 0 && (
                <ul className="absolute z-50 mt-2 w-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {searchSuggestions.map((item, index) => (
                    <li
                      key={index}
                      onClick={() => handleSearchSelect(item)}
                      className="px-4 py-2 cursor-pointer hover:bg-orange-100 dark:hover:bg-neutral-800 text-left text-slate-800 dark:text-slate-200 text-sm"
                    >
                      <span className="font-medium">{item.name}</span>
                      {item.type === 'player' && item.team && (
                        <span className="text-xs text-slate-400 ml-2">{item.team}</span>
                      )}
                      <span className="text-xs text-slate-400 ml-2 capitalize">{item.type}</span>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          </div>
        </header>

        <div className="container mx-auto px-4 py-4 max-w-4xl">
          <PlayerProfileContent playerSlug={playerSlugOrId} />
        </div>
      </div>
    </>
  );
}
