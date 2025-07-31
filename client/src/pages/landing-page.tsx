import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { supabase } from "@/lib/supabase"
import SwishLogo from "@/assets/Swish Assistant Logo.png"
import CMBC from "@/assets/cmbc.jpg"
import Ballpark from "@/assets/ballparksports.jpg"
import GCK from "@/assets/GCK.jpg"
import UL from "@/assets/uploadimage.png"
import Chatbot from "@/assets/Chatbotimage.png"

export default function LandingPage() {
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [, setLocation] = useLocation()
  const [trendingLeagues, setTrendingLeagues] = useState<any[]>([]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.trim().length === 0) {
        setSuggestions([])
        return
      }

      // Search both leagues and players
      console.log("🔍 Searching for:", query);
      
      const [leaguesResponse, playersResponse] = await Promise.all([
        supabase
          .from("leagues")
          .select("name, slug")
          .or(`name.ilike.%${query}%`)
          .eq("is_public", true),
        supabase
          .from("player_stats")
          .select("name, team, id")
          .ilike("name", `%${query}%`)
          .limit(10)
      ]);

      console.log("📊 Players response:", playersResponse);
      console.log("📊 Players data:", playersResponse.data);
      console.log("📊 Players error:", playersResponse.error);

      const leagues = leaguesResponse.data || [];
      const players = playersResponse.data || [];

      // Remove duplicate players (same name) and format
      const uniquePlayers = players.reduce((acc: any[], player) => {
        if (!acc.some(p => p.name === player.name)) {
          acc.push({
            name: player.name,
            team: player.team,
            player_id: player.id,
            type: 'player'
          });
        }
        return acc;
      }, []);

      // Format leagues
      const formattedLeagues = leagues.map(league => ({
        ...league,
        type: 'league'
      }));

      // Combine and limit results
      const combined = [...formattedLeagues, ...uniquePlayers].slice(0, 8);

      console.log("Query input:", query)
      console.log("Leagues found:", leagues.length)
      console.log("Players found:", uniquePlayers.length)
      console.log("Combined suggestions:", combined);

      setSuggestions(combined)
    }

    const delayDebounce = setTimeout(fetchSuggestions, 300)
    return () => clearTimeout(delayDebounce)
  }, [query])


  const handleSelect = (item: any) => {
    setQuery("")
    setSuggestions([])
    
    if (item.type === 'league') {
      setLocation(`/league/${item.slug}`)
    } else if (item.type === 'player') {
      setLocation(`/player/${item.player_id}`)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    const { data, error } = await supabase
      .from("leagues")
      .select("slug")
      .ilike("name", `%${query.toLowerCase()}%`)
      .eq("is_public", true)


    if (error) console.error("Supabase error:", error)

    if (data && data.length > 0) {
      setLocation(`/league/${data[0].slug}`)
    } else {
      alert("No public league found with that name.")
    }

  }

  useEffect(() => {
    const fetchTrending = async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("name, slug")
        .eq("is_public", true)
        .order("updated_at", { ascending: false })
        .limit(4);

      if (!error) setTrendingLeagues(data || []);
    };

    fetchTrending();
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-2">
          <img src={SwishLogo} alt="Swish Logo" className="h-8" />
          <span className="font-bold text-xl text-orange-600"></span>
        </div>
        <nav className="flex gap-6 text-sm text-slate-600 font-medium">
          <a href="/auth">Get Started</a>
          <a href="/auth">Login</a>
        </nav>
      </header>

      {/* Hero */}
      <img src={SwishLogo} alt="Swish Logo"
        className="mx-auto w-64 h-64 -mb -14"
      />
      <main className="flex flex-col items-center justify-center px-6 pt-6 pb-36 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 max-w-2xl leading-tight">
          Our sport, your leagues, your stats, powered by AI. <br />
          <span className="text-orange-500">Search below.</span>
        </h1>

        {/* Search Bar with Suggestions */}
        <div className="mt-10 w-full max-w-2xl relative">
          <form
            onSubmit={handleSubmit}
            className="flex items-center shadow-lg rounded-full border border-gray-200 overflow-hidden"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for players or leagues..."
              className="flex-1 px-5 py-4 text-base text-white focus:outline-none"
            />
            <button
              type="submit"
              className="bg-orange-500 text-white font-semibold px-6 py-4 hover:bg-orange-600 transition"
            >
              Ask
            </button>
          </form>

          {suggestions.length > 0 && (
            <ul className="absolute z-50 w-full bg-white border border-orange-200 mt-1 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {suggestions.map((item, index) => (
                <li
                  key={index}
                  onClick={() => handleSelect(item)}
                  className="px-5 py-3 cursor-pointer hover:bg-orange-50 text-left border-b border-orange-100 last:border-b-0 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3">
                    {item.type === 'league' ? (
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center">
                        <span className="text-white text-sm">🏆</span>
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center">
                        <span className="text-white text-sm">👤</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-medium text-orange-900 text-sm">{item.name}</div>
                      {item.type === 'player' && (
                        <div className="text-xs text-orange-600">{item.team}</div>
                      )}
                      {item.type === 'league' && (
                        <div className="text-xs text-orange-600">League</div>
                      )}
                    </div>
                    <div className="text-xs text-orange-700 capitalize bg-orange-100 px-2 py-1 rounded-full font-medium">
                      {item.type}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

        </div>

        {/* Suggestions */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4 max-w-xl w-full">
          {trendingLeagues.length > 0
            ? trendingLeagues.map((league, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect({ type: 'league', slug: league.slug })}
                  className="bg-orange-100 hover:bg-orange-200 text-sm text-orange-800 px-5 py-3 rounded-lg text-left transition"
                >
                  🔥 Trending: {league.name}
                </button>
              ))
            : [
                { name: "UWE Summer League D1", slug: "uwe-summer-league-d1" },
                { name: "UWE Summer League D2", slug: "uwe-summer-league-d2" },
                { name: "NBL D3 Gloucester City Kings", slug: "nbl-d3-gck" },
              ].map((league, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect({ type: 'league', slug: league.slug })}
                  className="bg-orange-100 hover:bg-orange-200 text-sm text-orange-800 px-5 py-3 rounded-lg text-left transition"
                >
                  🔥 Trending: {league.name}
                </button>
              ))}
        </div>


      </main>

      {/*used by teams and leagues across the UK*/}
    
      <section className="w-full bg-orange-500 py-10 text-white">
        <h2 className="text-center text-sm uppercase mb-6">
          Already being used by teams and these leagues
        </h2>

        <div className="w-full flex justify-center">
          <div className="flex gap-12 overflow-x-auto px-4 max-w-6xl">
            {[Ballpark, CMBC, GCK].map((img, i) => (
              <div key={i} className="flex items-center justify-center h-24">
                <img
                  src={img}
                  alt={`Logo ${i}`}
                  className="h-20 w-auto object-contain rounded-xl shadow-md hover:shadow-lg transition duration-300 hover:scale-110"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

       {/*What is Swish Assistant?*/}

      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 items-center gap-12">

          {/* Left: Visual */}
          <div className="w-full flex justify-center">
            <img
              src={UL}
              alt="Upload Example"
              className="rounded-xl shadow-lg w-full max-w-md"
            />
          </div>

          {/* Right: Text Content */}
          <div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">
              Upload Your Game Files Instantly
            </h3>
            <p className="text-gray-600 mb-4">
              Drag and drop your FIBA LiveStats PDFs and let Swish Assistant handle
              the rest — extracting stats, linking players, and saving you hours.
            </p>
            <ul className="text-left text-gray-600 list-disc list-inside space-y-2">
              <li>Auto-parses your PDFs into clean stat lines</li>
              <li>Assigns data to your selected league</li>
              <li>Triggers visual summaries and AI responses</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 items-center gap-12">

          {/* Left: Text Content */}
          <div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">
              Ask the AI Anything
            </h3>
            <p className="text-gray-600 mb-4">
              Use natural language to ask questions like “Who leads the league in assists?” or “Show me Rhys Farrell’s last 5 games.”
            </p>
            <ul className="text-left text-gray-600 list-disc list-inside space-y-2">
              <li>Chatbot understands players, teams & stats</li>
              <li>Pulls data live from your uploaded games</li>
              <li>Gives you quick, coach-friendly answers</li>
            </ul>
          </div>

          {/* Right: Visual */}
          <div className="w-full flex justify-center">
            <img
              src={Chatbot}
              alt="Chatbot Example"
              className="rounded-xl shadow-lg w-full max-w-md"
            />
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 items-center gap-12">

          {/* Left: Visual */}
          <div className="w-full flex justify-center">
            <img
              src="/assets/demo-upload.png" // Replace with your screenshot
              alt="Upload Example"
              className="rounded-xl shadow-lg w-full max-w-md"
            />
          </div>

          {/* Right: Text Content */}
          <div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">
              Create a league and showcase your stats
            </h3>
            <p className="text-gray-600 mb-4">
              Create a public league where you can showcase your stats and compare with other players and teams. Don't waste all that data you captured and give it a place to thrive.
            </p>
            <ul className="text-left text-gray-600 list-disc list-inside space-y-2">
              <li>Personalize the league to be branded in your own way</li>
              <li>Quick and easy for players and coaches to see top performances</li>
              <li>Allow users to engage, interact and see how they compare to the rest</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 items-center gap-12">

          {/* Left: Text Content */}
          <div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">
              Create scouting reports in minutes
            </h3>
            <p className="text-gray-600 mb-4">
              Once the data has been uploaded you can ask the chatbot anything, player scoring, player summeries based off last few games. Then instantly save it to a document for your players and satff to read before and after games.
            </p>
            <ul className="text-left text-gray-600 list-disc list-inside space-y-2">
              <li>Chatbot understands players, teams & stats</li>
              <li>Pulls data live from your uploaded games</li>
              <li>Gives you quick, coach-friendly answers</li>
            </ul>
          </div>

          {/* Right: Visual */}
          <div className="w-full flex justify-center">
            <img
              src="/assets/demo-chatbot.png" // Swap this with your visual
              alt="Chatbot Example"
              className="rounded-xl shadow-lg w-full max-w-md"
            />
          </div>
        </div>
      </section>


      {/* [rest of your landing page unchanged] */}
    </div>
  )
}


