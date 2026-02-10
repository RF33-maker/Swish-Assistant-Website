import { useState, useEffect, useRef } from "react"
import { useLocation } from "wouter"
import { supabase } from "@/lib/supabase"
import SwishLogo from "@/assets/Swish Assistant Logo.png"
import Ballpark from "@/assets/ballparksports.jpg"
import UL from "@/assets/uploadimage.png"
import BCB from "@/assets/BCB Logo.jpg"
import SLB from "@/assets/Super-League-Basketball-Logo.png"
import NBLBE from "@/assets/NBLBE.jpg"
import Chatbot from "@/assets/Chatbotimage.png"
import LeaguePage from "@/assets/League-page.png"
import ChatbotExample from "@/assets/Chatbotexample.png"
import { Button } from "@/components/ui/button"
import { Analytics } from "@vercel/analytics/next"
import { Search, ChevronDown, BarChart3, Zap, Clock, MessageSquare, Sparkles, TrendingUp, Trophy, FileText, Users } from "lucide-react"
import { ThemeToggle } from "@/components/ThemeToggle"
import { TeamLogo } from "@/components/TeamLogo"

function LeagueLogosCarousel() {
  const logos = [Ballpark, NBLBE, BCB, SLB]
  
  return (
    <section className="w-full bg-orange-500 py-10 text-white overflow-hidden">
      <h2 className="text-center text-sm uppercase mb-6">
        Already hosting these leagues and more!
      </h2>

      <div className="relative w-full">
        <div className="flex gap-6 md:gap-12 animate-infinite-scroll">
          {[...logos, ...logos].map((img, i) => (
            <div 
              key={i} 
              className="flex-shrink-0 flex items-center justify-center h-20 md:h-24 w-28 md:w-36"
            >
              <img
                src={img}
                alt={`League Logo ${(i % logos.length) + 1}`}
                className="h-14 md:h-20 w-auto object-contain rounded-xl shadow-md hover:shadow-lg transition duration-300 hover:scale-110"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PlayerSearchAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const [imgError, setImgError] = useState(false);

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="h-8 w-8 rounded-full object-cover flex-shrink-0 border border-orange-200 dark:border-neutral-600"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center flex-shrink-0">
      <Users className="h-4 w-4 text-white" />
    </div>
  );
}

export default function LandingPage() {
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [, setLocation] = useLocation()
  const [trendingLeagues, setTrendingLeagues] = useState<any[]>([]);
  const chatbotHeadingRef = useRef<HTMLHeadingElement>(null);
  const coachesHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.trim().length === 0) {
        setSuggestions([])
        return
      }

      const [leaguesResponse, playersResponse, teamsResponse] = await Promise.all([
        supabase
          .from("leagues")
          .select("name, slug")
          .or(`name.ilike.%${query}%`)
          .eq("is_public", true),
        supabase
          .from("players")
          .select("id, full_name, team, slug, photo_path, league_id")
          .ilike("full_name", `%${query}%`)
          .limit(10),
        supabase
          .from("teams")
          .select("name, league_id, leagues:league_id(name, slug, is_public)")
          .ilike("name", `%${query}%`)
          .limit(20)
      ]);

      const leagues = leaguesResponse.data || [];
      const players = playersResponse.data || [];
      const teams = teamsResponse.data || [];

      const uniquePlayers = players.reduce((acc: any[], player: any) => {
        if (!acc.some(p => p.full_name === player.full_name)) {
          let photoUrl: string | null = null;
          if (player.photo_path) {
            const { data: urlData } = supabase.storage.from('player-photos').getPublicUrl(player.photo_path);
            photoUrl = urlData?.publicUrl || null;
          }
          acc.push({
            name: player.full_name,
            team: player.team,
            player_id: player.id,
            player_slug: player.slug,
            photo_url: photoUrl,
            type: 'player'
          });
        }
        return acc;
      }, []);

      const uniqueTeams = teams.reduce((acc: any[], team: any) => {
        const leagueJoin = Array.isArray(team.leagues) ? team.leagues[0] : team.leagues;
        if (leagueJoin?.is_public === false) return acc;
        if (!acc.some(t => t.name === team.name && t.league_id === team.league_id)) {
          acc.push({
            name: team.name,
            league_id: team.league_id,
            league_name: leagueJoin?.name || '',
            league_slug: leagueJoin?.slug || '',
            type: 'team'
          });
        }
        return acc;
      }, []);

      const formattedLeagues = leagues.map(league => ({
        ...league,
        type: 'league'
      }));

      const combined = [...formattedLeagues, ...uniqueTeams, ...uniquePlayers].slice(0, 10);

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
    } else if (item.type === 'team') {
      const encodedName = encodeURIComponent(item.name);
      if (item.league_slug) {
        setLocation(`/league/${item.league_slug}/team/${encodedName}`)
      } else {
        setLocation(`/team/${encodedName}`)
      }
    } else if (item.type === 'player') {
      const identifier = item.player_slug || item.player_id;
      setLocation(`/player/${identifier}`)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    if (suggestions.length > 0) {
      handleSelect(suggestions[0])
      return
    }

    const { data, error } = await supabase
      .from("leagues")
      .select("slug")
      .ilike("name", `%${query.toLowerCase()}%`)
      .eq("is_public", true)

    if (error) console.error("Supabase error:", error)

    if (data && data.length > 0) {
      setLocation(`/league/${data[0].slug}`)
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

  // IntersectionObserver for animated underlines
  useEffect(() => {
    const options = {
      threshold: 0.5,
      rootMargin: '0px'
    };

    const callback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
        }
      });
    };

    const observer = new IntersectionObserver(callback, options);

    if (chatbotHeadingRef.current) {
      observer.observe(chatbotHeadingRef.current);
    }
    if (coachesHeadingRef.current) {
      observer.observe(coachesHeadingRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
      {/* Gradient Top Border */}
      <div className="h-[1px] bg-gradient-to-r from-orange-400 to-amber-400"></div>
      
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 bg-gradient-to-b from-[#fffaf5] to-transparent dark:from-neutral-950 dark:to-transparent">
        <div className="flex items-center gap-2">
          <img src={SwishLogo} alt="Swish Logo" className="h-8" />
          <span className="font-bold text-xl text-orange-600"></span>
        </div>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <ThemeToggle />
          <a 
            href="/auth" 
            className="text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition-colors relative group"
            data-testid="login-button"
          >
            Login
            <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-orange-500 transition-all duration-300 group-hover:w-full"></span>
          </a>
          <a 
            href="#subscribe" 
            className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-5 py-2 rounded-lg hover:shadow-lg hover:scale-105 transition-all duration-300 drop-shadow-md"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('subscribe')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Subscribe
          </a>
        </nav>
      </header>

      {/* Hero Section with Gradient Background */}
      <div className="bg-gradient-to-b from-[#fffaf5] to-white dark:from-neutral-950 dark:to-neutral-900 pt-4 md:pt-6 lg:pt-8 pb-12 md:pb-16 lg:pb-20">
        <img src={SwishLogo} alt="Swish Logo"
          className="mx-auto w-32 h-32 md:w-40 md:h-40 lg:w-44 lg:h-44 drop-shadow-lg mb-4 md:mb-6 lg:mb-8 animate-fade-in-up"
        />
        <main className="flex flex-col items-center justify-center px-6 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-slate-900 dark:text-white max-w-3xl leading-tight tracking-tight mb-6 md:mb-8 lg:mb-10 animate-fade-in-up" style={{ animationDelay: '0.2s', opacity: 0, animationFillMode: 'forwards' }}>
            The Home of Basketball Stats, Advanced Metrics & League Insights
            <br />
            <span className="text-orange-500 font-bold drop-shadow-sm text-2xl sm:text-3xl lg:text-4xl mt-2 inline-block">Search below.</span>
          </h1>

          {/* Search Bar with Suggestions */}
          <div className="w-full max-w-2xl relative">
          <div className="search-bar-animated-border transition-all duration-300 focus-within:scale-[1.02] animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
            <form
              onSubmit={handleSubmit}
              className="flex items-center shadow-lg rounded-full overflow-hidden bg-white dark:bg-neutral-900 relative z-10"
            >
              <Search className="ml-5 h-5 w-5 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find your league"
                className="flex-1 px-4 py-4 text-base text-slate-900 dark:text-white focus:outline-none bg-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </form>
          </div>

          {suggestions.length > 0 && (
            <ul className="absolute z-50 w-full bg-white dark:bg-neutral-900 border border-orange-200 dark:border-neutral-700 mt-1 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {suggestions.map((item, index) => (
                <li
                  key={index}
                  onClick={() => handleSelect(item)}
                  className="px-5 py-3 cursor-pointer hover:bg-orange-50 dark:hover:bg-neutral-800 text-left border-b border-orange-100 dark:border-neutral-800 last:border-b-0 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3">
                    {item.type === 'league' ? (
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center flex-shrink-0">
                        <Trophy className="h-4 w-4 text-white" />
                      </div>
                    ) : item.type === 'team' ? (
                      <div className="h-8 w-8 rounded-full bg-white dark:bg-neutral-800 border border-orange-200 dark:border-neutral-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                        <TeamLogo teamName={item.name} leagueId={item.league_id} size="sm" />
                      </div>
                    ) : (
                      <PlayerSearchAvatar name={item.name} photoUrl={item.photo_url} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-orange-900 dark:text-orange-300 text-sm truncate">{item.name}</div>
                      {item.type === 'player' && (
                        <div className="text-xs text-orange-600 dark:text-orange-400 truncate">{item.team}</div>
                      )}
                      {item.type === 'team' && (
                        <div className="text-xs text-orange-600 dark:text-orange-400 truncate">{item.league_name}</div>
                      )}
                      {item.type === 'league' && (
                        <div className="text-xs text-orange-600 dark:text-orange-400">League</div>
                      )}
                    </div>
                    <div className="text-xs text-orange-700 dark:text-orange-300 capitalize bg-orange-100 dark:bg-orange-900/50 px-2 py-1 rounded-full font-medium flex-shrink-0">
                      {item.type}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

        </div>

        {/* Suggestions */}
        <div className="mt-4 md:mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-3 max-w-xl w-full">
          {trendingLeagues.length > 0
            ? trendingLeagues.map((league, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect({ type: 'league', slug: league.slug })}
                  className="bg-gradient-to-r from-orange-100 to-amber-50 dark:from-neutral-800 dark:to-neutral-900 hover:scale-105 hover:shadow-md text-sm text-orange-800 dark:text-orange-300 px-5 py-3 rounded-xl text-left transition-all duration-300 flex items-center justify-between gap-3 animate-slide-in-left"
                  style={{ animationDelay: `${0.8 + i * 0.075}s`, opacity: 0, animationFillMode: 'forwards' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔥</span>
                    <span className="font-medium">Trending: {league.name}</span>
                  </div>
                  <span className="text-xs text-orange-600 dark:text-orange-400 bg-orange-200/50 dark:bg-orange-900/50 px-2 py-0.5 rounded-full whitespace-nowrap">Updated today</span>
                </button>
              ))
            : [
                { name: "SLB Championship 25/26", slug: "super-league-basketball-20252026" },
                { name: "British Championship Basketball", slug: "british-championship-basketball-20252026" },
                { name: "NBL Division One 25/26", slug: "national-basketball-league-d1-mens-20252026" },
                { name: "WNBL Division One 25/26", slug: "national-basketball-league-d1-womens-20252026" },
              ].map((league, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect({ type: 'league', slug: league.slug })}
                  className="bg-gradient-to-r from-orange-100 to-amber-50 dark:from-neutral-800 dark:to-neutral-900 hover:scale-105 hover:shadow-md text-sm text-orange-800 dark:text-orange-300 px-5 py-3 rounded-xl text-left transition-all duration-300 flex items-center justify-between gap-3 animate-slide-in-left"
                  style={{ animationDelay: `${0.8 + i * 0.075}s`, opacity: 0, animationFillMode: 'forwards' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔥</span>
                    <span className="font-medium">Trending: {league.name}</span>
                  </div>
                  <span className="text-xs text-orange-600 dark:text-orange-400 bg-orange-200/50 dark:bg-orange-900/50 px-2 py-0.5 rounded-full whitespace-nowrap">Updated today</span>
                </button>
              ))}
        </div>

        {/* Tagline */}
        <p className="mt-6 md:mt-8 text-slate-600 dark:text-slate-400 text-sm md:text-base font-medium max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: '1.1s', opacity: 0, animationFillMode: 'forwards' }}>
          Explore stats, track performance, drive narrative and discover the next MVP.
        </p>

        {/* League Logos Section */}
        <div className="mt-8 md:mt-12 w-full max-w-5xl mx-auto">
          {/* Heading */}
          <h2 className="text-center text-xs md:text-sm uppercase text-orange-600 font-semibold tracking-wide mb-4 md:mb-6 animate-fade-in-up" style={{ animationDelay: '1.2s', opacity: 0, animationFillMode: 'forwards' }}>
            Already hosting these leagues and more!
          </h2>
          
          {/* Logos Carousel */}
          <div className="overflow-hidden animate-fade-in-up" style={{ animationDelay: '1.3s', opacity: 0, animationFillMode: 'forwards' }}>
            <div className="flex gap-6 md:gap-8 animate-infinite-scroll">
              {[...([Ballpark, NBLBE, BCB, SLB]), ...([Ballpark, NBLBE, BCB, SLB]), ...([Ballpark, NBLBE, BCB, SLB])].map((img, i) => (
                <div 
                  key={i} 
                  className="flex-shrink-0 flex items-center justify-center bg-white dark:bg-neutral-900 rounded-lg shadow-sm hover:shadow-md p-4 transition-all duration-300 hover:scale-110"
                >
                  <img
                    src={img}
                    alt={`League ${i + 1}`}
                    className="h-12 md:h-16 w-auto object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="mt-8 md:mt-12 flex justify-center animate-fade-in-up" style={{ animationDelay: '1.5s', opacity: 0, animationFillMode: 'forwards' }}>
          <ChevronDown className="h-6 w-6 md:h-8 md:w-8 text-orange-500 animate-bounce" />
        </div>
        </main>
      </div>

       {/*What is Swish Assistant?*/}

      <section className="py-20 bg-gradient-to-b from-orange-50 to-[#fffaf5] dark:from-neutral-900 dark:to-neutral-900">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 items-center gap-12">

          {/* Left: Visual */}
          <div className="w-full flex justify-center">
            <img
              src={LeaguePage}
              alt="League Page Example"
              className="rounded-xl shadow-xl w-full max-w-md transition-all duration-300 hover:scale-105 hover:-translate-y-2"
            />
          </div>

          {/* Right: Text Content */}
          <div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
              Find your league and discover all the stats
            </h3>
            <div className="w-16 h-1 bg-orange-500 rounded-full mb-6"></div>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-6">
              Find the information you need quickly in just a few clicks. Access comprehensive stats and insights with even greater detail than ever before.
            </p>
            <ul className="text-left text-slate-700 dark:text-slate-300 space-y-3">
              <li className="flex items-start gap-3">
                <BarChart3 className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <span>Browse all hosted leagues in one place</span>
              </li>
              <li className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <span>Quick and easy access to top performances and player stats</span>
              </li>
              <li className="flex items-start gap-3">
                <Search className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <span>Discover detailed insights and compare players across teams</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Unified AI Features Section */}
      <section className="bg-gradient-to-b from-[#fffaf5] to-[#fffaf5] dark:from-neutral-900 dark:to-neutral-900 relative overflow-hidden shadow-[inset_0_-20px_40px_-20px_rgba(251,146,60,0.1)] dark:shadow-none">
        
        {/* AI-Powered Chatbot */}
        <div className="py-20">
          <div className="max-w-6xl mx-auto px-8 md:px-16 grid grid-cols-1 md:grid-cols-2 items-center gap-12 md:gap-16">

            {/* Left: Text Content */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <h3 ref={chatbotHeadingRef} className="text-2xl font-bold text-slate-900 dark:text-white underline-animate">
                  AI-Powered Chatbot
                </h3>
                <span className="bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full hover:scale-110 hover:shadow-[0_0_10px_rgba(255,102,0,0.4)] transition-all duration-300 ease-out">
                  Coming Soon
                </span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-6">
                We're building an AI-powered chatbot to make it super quick and easy to find what you need. Ask questions and get instant answers about players, teams, and stats.
              </p>
              <ul className="text-left text-slate-700 dark:text-slate-300 space-y-3">
                <li className="flex items-start gap-3 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: 0, animationFillMode: 'forwards' }}>
                  <Clock className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <span>Find information in seconds, not minutes</span>
                </li>
                <li className="flex items-start gap-3 animate-fade-in-up" style={{ animationDelay: '0.2s', opacity: 0, animationFillMode: 'forwards' }}>
                  <MessageSquare className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <span>Natural language queries about any league data</span>
                </li>
                <li className="flex items-start gap-3 animate-fade-in-up" style={{ animationDelay: '0.3s', opacity: 0, animationFillMode: 'forwards' }}>
                  <Sparkles className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <span>Coming soon to streamline your workflow</span>
                </li>
              </ul>
            </div>

            {/* Right: Visual */}
            <div className="w-full flex justify-center">
              <img
                src={Chatbot}
                alt="Chatbot Example"
                className="rounded-xl w-full max-w-lg transition-all duration-300 hover:scale-105"
                style={{ filter: 'drop-shadow(0 0 40px rgba(251, 146, 60, 0.3))' }}
              />
            </div>
          </div>
        </div>

        {/* Basketball Court Texture Pattern */}
        <div 
          className="absolute bottom-0 inset-x-0 h-1/2 opacity-[0.03] pointer-events-none dark:opacity-[0.02]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 50px,
              #fb923c 50px,
              #fb923c 51px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 50px,
              #fb923c 50px,
              #fb923c 51px
            )`
          }}
        />
        
        {/* Coaches Hub */}
        <div className="py-20 relative z-10">
          <div className="max-w-6xl mx-auto px-8 md:px-16 grid grid-cols-1 md:grid-cols-2 items-center gap-12">

            {/* Left: Text Content */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <h3 ref={coachesHeadingRef} className="text-2xl font-bold text-slate-900 dark:text-white underline-animate">
                  Coaches Hub
                </h3>
                <span className="bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full hover:scale-110 hover:shadow-[0_0_10px_rgba(255,102,0,0.4)] transition-all duration-300 ease-out">
                  Coming Soon
                </span>
              </div>
              <p className="text-orange-600 dark:text-orange-400 font-medium text-sm mb-4">
                Scouting simplified with AI insights.
              </p>
              <p className="text-gray-600 dark:text-slate-300 mb-6">
                A dedicated space for coaches to access detailed insights to help prep for your next game. See team trends, discover top players, and build your scouting reports with ease.
              </p>
              <ul className="text-left text-gray-600 dark:text-slate-300 space-y-3">
                <li className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <span><strong className="text-slate-900 dark:text-white">Detailed insights</strong> on team performance and trends</span>
                </li>
                <li className="flex items-start gap-3">
                  <Trophy className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <span>Quickly identify <strong className="text-slate-900 dark:text-white">top players</strong> and key matchups</span>
                </li>
                <li className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <span><strong className="text-slate-900 dark:text-white">Build comprehensive</strong> scouting reports effortlessly</span>
                </li>
              </ul>
            </div>

            {/* Right: Visual */}
            <div className="w-full flex justify-center">
              <img
                src={ChatbotExample}
                alt="Coaches Hub Example"
                className="rounded-xl w-full max-w-md shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Signup Section */}
      <section id="subscribe" className="py-20 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-neutral-800 dark:to-neutral-900 relative overflow-hidden flex items-center">
        {/* Background Logo */}
        <div className="absolute inset-0 flex items-center justify-center opacity-5 dark:opacity-[0.03]">
          <img 
            src={SwishLogo} 
            alt="Swish Logo Background" 
            className="w-96 h-96 object-contain transform rotate-12"
          />
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
            Stay Updated with Swish Assistant
          </h3>
          <p className="text-gray-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
            Get the latest news, feature updates, and tips delivered straight to your inbox. 
            Be the first to know about new league management features and AI improvements.
          </p>

          <form className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto mb-3">
            <input
              type="email"
              placeholder="Enter your email address"
              className="flex-1 px-5 py-3.5 rounded-xl border border-orange-200 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white dark:bg-neutral-800 dark:text-white dark:placeholder-slate-400 shadow-sm transition-all duration-200"
              required
            />
            <button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105"
            >
              Subscribe
            </button>
          </form>

          <p className="text-xs text-gray-400 dark:text-slate-500 italic">
            No spam, just updates. Unsubscribe anytime.
          </p>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="hidden py-20 bg-gradient-to-br from-slate-50 to-orange-50 relative">
        <div className="max-w-6xl mx-auto px-6 relative">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Choose the right plan for your team
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              From individual coaches to full league management, we have a plan that fits your needs and budget.
            </p>
          </div>

          {/* Blurred pricing content */}
          <div className="blur-sm pointer-events-none">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              {/* Free Tier */}
              <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-6 relative">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Free</h3>
                  <div className="text-3xl font-bold text-slate-900 mb-1">£0</div>
                  <p className="text-gray-600 text-sm mb-6">Perfect for trying out</p>

                  <ul className="text-left space-y-3 mb-8">
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>1 private league only</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>View all public leagues</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Limited AI queries</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400">✗</span>
                      <span className="text-gray-400">Public league hosting</span>
                    </li>
                  </ul>

                  {/* <Button 
                    size="lg" 
                    variant="outline"
                    className="w-full border-orange-200 text-orange-700 hover:bg-orange-50"
                  >
                    Get Started Free
                  </Button> */}
                </div>
              </div>

              {/* Individual Tier */}
              <div className="bg-white rounded-xl shadow-lg border-2 border-orange-200 p-6 relative">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Individual</h3>
                  <div className="text-3xl font-bold text-orange-600 mb-1">£5</div>
                  <p className="text-gray-600 text-sm mb-6">per month</p>

                  <ul className="text-left space-y-3 mb-8">
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Public league hosting</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Full AI league assistant</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>1 scouting report/month</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Advanced analytics</span>
                    </li>
                  </ul>

                  <Button 
                    size="lg"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Choose Individual
                  </Button>
                </div>
              </div>

              {/* All Access Tier */}
              <div className="bg-white rounded-xl shadow-lg border-2 border-purple-200 p-6 relative">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-xs font-semibold">POPULAR</span>
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">All Access</h3>
                  <div className="text-3xl font-bold text-purple-600 mb-1">£15</div>
                  <p className="text-gray-600 text-sm mb-6">per month</p>

                  <ul className="text-left space-y-3 mb-8">
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Multiple league creation</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Full AI assistant features</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Full league branding</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Unlimited scouting reports</span>
                    </li>
                  </ul>

                  <Button 
                    size="lg"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Choose All Access
                  </Button>
                </div>
              </div>

              {/* Full League/Season Tier */}
              <div className="bg-white rounded-xl shadow-lg border-2 border-blue-200 p-6 relative">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Full League</h3>
                  <div className="text-3xl font-bold text-blue-600 mb-1">Custom</div>
                  <p className="text-gray-600 text-sm mb-6">contact us</p>

                  <ul className="text-left space-y-3 mb-8">
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>All teams included</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Players & coaches access</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Dedicated support</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>White-label options</span>
                    </li>
                  </ul>

                  <Button 
                    size="lg"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Contact Sales
                  </Button>
                </div>
              </div>

            </div>

            <div className="text-center mt-12">
              <p className="text-gray-600 text-sm">
                All plans include secure data storage and regular backups. 
                <a href="#support" className="text-orange-600 hover:text-orange-700 underline ml-1">Need help choosing?</a>
              </p>
            </div>
          </div>

          {/* Beta Overlay Message */}
          <div className="absolute inset-0 flex items-center justify-center bg-white/20 backdrop-blur-md z-10">
            <div className="bg-white rounded-2xl shadow-2xl border-2 border-orange-200 p-8 max-w-md text-center animate-fade-in-up" style={{ animationDelay: '0.2s', opacity: 0, animationFillMode: 'forwards' }}>
              <h3 className="text-2xl font-bold text-slate-900 mb-3 flex items-center justify-center gap-2">
                <span className="text-2xl">🚀</span>
                Product in Beta
              </h3>
              <p className="text-gray-600 mb-6">
                Your stats, always free.
                We’re developing advanced tools that take your experience to the next level — from AI-powered insights to effortless scouting automation. Premium features launching soon!
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Please contact us if you have any questions or would like early access.
              </p>
              <Button 
                size="lg"
                className="w-full bg-orange-500 hover:bg-orange-600 hover:shadow-[0_0_20px_rgba(249,115,22,0.5)] text-white transition-all duration-300"
                onClick={() => window.location.href = '/contact-sales'}
              >
                Contact Us
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0a0a0f] text-white py-12 border-t-4 border-t-orange-500">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">

            {/* Company Info */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <img src={SwishLogo} alt="Swish Logo" className="h-8" />
                <span className="font-bold text-xl text-white">Swish Assistant</span>
                <div className="flex gap-3 ml-2">
                  <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-orange-400 transition-colors">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </a>
                  <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-orange-400 transition-colors">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                    </svg>
                  </a>
                  <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-orange-400 transition-colors">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  </a>
                </div>
              </div>
              <p className="text-gray-300 mb-4">
                Redefining how we see basketball stats.
                
                Our sport, your leagues, your players, your stats, all just a few clicks away.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold text-lg mb-4 text-white">Quick Links</h4>
              <ul className="space-y-2">
                {/* <li><a href="/auth" className="text-gray-300 hover:text-white transition-colors">Get Started</a></li>
                <li><a href="/auth" className="text-gray-300 hover:text-white transition-colors">Login</a></li>
                <li><a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-gray-300 hover:text-white transition-colors">Pricing</a></li> */}
                <li><a href="#subscribe" className="text-gray-300 hover:text-white transition-colors">Subscribe</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-lg mb-4 text-white">Legal</h4>
              <ul className="space-y-2">
                <li><a href="/privacy" className="text-gray-300 hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="text-gray-300 hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="/cookies" className="text-gray-300 hover:text-white transition-colors">Cookie Policy</a></li>
                <li><a href="#support" className="text-gray-300 hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              &copy; {new Date().getFullYear()} Swish Assistant. All rights reserved.
            </p>
            <div className="flex gap-6 mt-4 sm:mt-0">
              <a href="#twitter" className="text-gray-400 hover:text-orange-400 transition-colors">
                <span className="sr-only">Twitter</span>
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </a>
              <a href="#linkedin" className="text-gray-400 hover:text-orange-400 transition-colors">
                <span className="sr-only">LinkedIn</span>
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              <a href="#youtube" className="text-gray-400 hover:text-orange-400 transition-colors">
                <span className="sr-only">YouTube</span>
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}