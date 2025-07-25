import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import LeagueDefaultImage from "@/assets/league-default.png";
import React from "react";
import { GameSummaryRow } from "./GameSummaryRow";


  export default function LeaguePage() {
    const { slug } = useParams();
    const [search, setSearch] = useState("");
    const [location, navigate] = useLocation();
    const [league, setLeague] = useState(null);
    const [topScorer, setTopScorer] = useState<PlayerStat | null>(null);
    const [topRebounder, setTopRebounder] = useState<PlayerStat | null>(null);
    const [topAssists, setTopAssists] = useState<PlayerStat | null>(null);
    const [standings, setStandings] = useState([]);
    const [schedule, setSchedule] = useState([]);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [gameSummaries, setGameSummaries] = useState<any[]>([]);
    const [playerStats, setPlayerStats] = useState<any[]>([]);
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [playerSearch, setPlayerSearch] = useState("");
    const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
    const [prompt, setPrompt] = useState("");
    const [sortField, setSortField] = useState("points");
    const [sortOrder, setSortOrder] = useState("desc");
    const [sortBy, setSortBy] = useState("points");
    


    useEffect(() => {
      const fetchSuggestions = async () => {
        if (search.trim().length === 0) {
          setSuggestions([]);
          return;
        }

        const { data, error } = await supabase
          .from("leagues")
          .select("name, slug")
          .ilike("name", `%${search}%`)
          .eq("is_public", true)
          .limit(5);

        if (!error) {
          setSuggestions(data || []);
        } else {
          console.error("Suggestion error:", error);
        }
      };

      const delay = setTimeout(fetchSuggestions, 300);
      return () => clearTimeout(delay);
    }, [search]);


    useEffect(() => {
      const fetchLeague = async () => {
        const { data, error } = await supabase
          .from("leagues")
          .select("*")
          .eq("slug", slug)
          .single();
        console.log("Resolved league from slug:", slug, "→ ID:", data?.league_id);


        if (data?.league_id) {
          const fetchTopStats = async () => {
            const { data: scorerData } = await supabase
              .from("player_stats")
              .select("name, points")
              .eq("league_id", data.league_id)
              .order("points", { ascending: false })
              .limit(1)
              .single();

            const { data: reboundData } = await supabase
              .from("player_stats")
              .select("name, rebounds_total")
              .eq("league_id", data.league_id)
              .order("rebounds_total", { ascending: false })
              .limit(1)
              .single();

            const { data: assistData } = await supabase
              .from("player_stats")
              .select("name, assists")
              .eq("league_id", data.league_id)
              .order("assists", { ascending: false })
              .limit(1)
              .single();

            const { data: recentGames } = await supabase
              .from("player_stats")
              .select("name, team_name, game_date, points, assists, rebounds_total")
              .eq("league_id", data.league_id)
              .order("game_date", { ascending: false })
              .limit(5);

            const { data: allPlayerStats } = await supabase
              .from("player_stats")
              .select("*")
              .eq("league_id", data.league_id);

            setTopScorer(scorerData);
            setTopRebounder(reboundData);
            setTopAssists(assistData);
            setGameSummaries(recentGames || []);
            setPlayerStats(allPlayerStats || []);
          };

          fetchTopStats();
        }

        if (error) console.error("Failed to fetch league:", error);
        setLeague(data);
      };

      fetchLeague();
    }, [slug]);

    const handleSearch = () => {
      if (search.trim()) {
        navigate(`/league/${search}`);
      }
    };

    const sortMap: Record<string, string> = {
      "Top Scorers": "points",
      "Top Rebounders": "rebounds_total",
      "Top Playmakers": "assists",
    };

    const sortedStats = [...playerStats].sort((a, b) => {
      const aValue = a[sortField] ?? 0;
      const bValue = b[sortField] ?? 0;
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    });

    const getTopList = (key: string) => {
      const grouped = playerStats.reduce((acc, curr) => {
        const playerKey = curr.name;
        if (!acc[playerKey]) {
          acc[playerKey] = { ...curr, games: 1 };
        } else {
          acc[playerKey][key] += curr[key];
          acc[playerKey].games += 1;
        }
        return acc;
      }, {});

      const players = Object.values(grouped).map((p: any) => ({
        ...p,
        avg: (p[key] / p.games).toFixed(1),
      }));

      return players.sort((a, b) => b.avg - a.avg).slice(0, 5);
    };

    const topScorers = getTopList("points");
    const topRebounders = getTopList("rebounds_total");
    const topAssistsList = getTopList("assists");


    if (!league) {
      return <div className="p-6 text-slate-600">Loading league...</div>;
    }

    return (
      <div className="min-h-screen bg-[#fffaf1]">
        <header className="bg-white shadow-sm sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={SwishLogo}
              alt="Swish Assistant"
              className="h-9 cursor-pointer"
              onClick={() => navigate("/")}
            />
          </div>

          <div className="relative w-full max-w-md mx-6">
            <input
              type="text"
              placeholder="Search leagues or players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full px-4 py-2 border border-gray-300 rounded-full text-sm"
            />
            <button
              onClick={handleSearch}
              className="absolute right-0 top-0 h-full px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-full text-sm"
            >
              Go
            </button>

            {suggestions.length > 0 && (
              <ul className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {suggestions.map((item, index) => (
                  <li
                    key={index}
                    onClick={() => {
                      setSearch("");
                      setSuggestions([]);
                      navigate(`/league/${item.slug}`);
                    }}
                    className="px-4 py-2 cursor-pointer hover:bg-orange-100 text-left text-slate-800"
                  >
                    {item.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-6 text-sm font-medium text-slate-600">
            <a href="#" className="hover:text-orange-500">Overview</a>
            <a href="#" className="hover:text-orange-500">Stats</a>
            <a href="#" className="hover:text-orange-500">Schedule</a>
            <a href="#" className="hover:text-orange-500">Insights</a>
          </div>
        </header>

        <section className="mb-10">
          <div
            className="rounded-xl overflow-hidden shadow relative h-52 sm:h-64 md:h-80 bg-gray-200"
            style={{
              backgroundImage: `url(${league?.banner_url || LeagueDefaultImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-6">
              <h2 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-md">
                {league?.name || "League Name"}
              </h2>
              <p className="text-sm text-white/90 mt-1">
                Organised by {league?.organiser_name || "BallParkSports"}
              </p>
            </div>
          </div>
        </section>

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-slate-800">AI Game Summary</h2>
          <p className="text-sm text-slate-600 mt-2">
            {aiSummary || "2023/24 season Gloucester City Kings had a strong showing this season, led by ${scorerData?.name} who averaged ${scorerData?.points} points per game."}
          </p>
        </div>

        <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          <section className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-slate-800">Recent Game Summaries</h2>
              {gameSummaries.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {gameSummaries.map((game, index) => (
                    <li key={index} className="text-sm text-slate-600">
                      {game.name} ({game.team_name}) scored {game.points} pts, {game.assists} ast, {game.rebounds_total} reb on {game.game_date}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600 mt-2">No recent games available.</p>
              )}
            </div>

            <section id="stats" className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-6">Top Performers</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {([
                  { title: "Top Scorers", list: topScorers, label: "PPG", key: "avg" },
                  { title: "Top Rebounders", list: topRebounders, label: "RPG", key: "avg" },
                  { title: "Top Playmakers", list: topAssistsList, label: "APG", key: "avg" },
                ] as const).map(({ title, list, label, key }) => (
                  <div key={title} className="bg-gray-50 rounded-lg p-4 shadow-inner">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 text-center">{title}</h3>
                    <ul className="space-y-1 text-sm text-slate-800">
                      {Array.isArray(list) &&
                        list.map((p, i) => (
                          <li key={`${title}-${p.name}-${i}`} className="flex justify-between">
                            <span>{p.name}</span>
                            <span className="font-medium text-orange-500">
                              {p[key]} {label}
                            </span>
                          </li>
                        ))}
                    </ul>
                    <div className="text-right pt-2">
                      <button
                        onClick={() => {
                          const sortKey = sortMap[title as keyof typeof sortMap];
                          if (sortKey) {
                            setSortBy(sortKey);
                            setSortOrder("desc");
                            document.getElementById("player-stat-explorer")?.scrollIntoView({ behavior: "smooth" });
                          }
                        }}
                        className="text-sm text-orange-500 hover:underline"
                      >
                        Full List →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-slate-800">Player Stat Explorer</h2>

              <input
                type="text"
                placeholder="Search players..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded mb-4"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
              />

              {playerStats.length > 0 ? (
                <div>
                  {/* Sorting Controls */}
                  <div className="flex gap-4 mb-3 items-center">
                    <label className="text-sm text-slate-700 font-medium">
                      Sort by:
                      <select
                        className="ml-2 border border-orange-300 text-orange-600 bg-orange-50 px-2 py-1 rounded shadow-sm hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                        value={sortField}
                        onChange={(e) => setSortField(e.target.value)}
                      >
                        <option value="points">Points</option>
                        <option value="rebounds_total">Rebounds</option>
                        <option value="assists">Assists</option>
                      </select>
                    </label>

                    <button
                      className="flex items-center gap-1 text-sm text-slate-600 hover:text-orange-600 transition"
                      onClick={() =>
                        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                      }
                    >
                      {sortOrder === "asc" ? (
                        <span>
                          ⬆️ <span className="underline">Ascending</span>
                        </span>
                      ) : (
                        <span>
                          ⬇️ <span className="underline">Descending</span>
                        </span>
                      )}
                    </button>
                  </div>


                  {/* Stats Table */}
                  <table className="mt-4 w-full text-sm text-left text-slate-700">
                    <thead>
                      <tr>
                        <th className="px-2 py-1">Name</th>
                        <th className="px-2 py-1">PTS</th>
                        <th className="px-2 py-1">REB</th>
                        <th className="px-2 py-1">AST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...playerStats]
                        .filter((p) =>
                          p.name.toLowerCase().includes(playerSearch.toLowerCase())
                        )
                        .sort((a, b) => {
                          const aVal = a[sortField] ?? 0;
                          const bVal = b[sortField] ?? 0;
                          return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
                        })
                        .map((p, i) => {
                          const uniqueKey = `player-${p.id || p.name}-${p.game_date || 'no-date'}-${i}`;
                          return (
                            <React.Fragment key={uniqueKey}>
                              <tr
                                className="border-t cursor-pointer hover:bg-orange-50"
                                onClick={() =>
                                  setExpandedPlayer(expandedPlayer === i ? null : i)
                                }
                              >
                                <td className="px-2 py-1">{p.name}</td>
                                <td className="px-2 py-1">{p.points}</td>
                                <td className="px-2 py-1">{p.rebounds_total}</td>
                                <td className="px-2 py-1">{p.assists}</td>
                              </tr>

                              {expandedPlayer === i && (
                                <tr>
                                  <td colSpan={4}>
                                    <GameSummaryRow
                                      player={{ name: p.name }}
                                      game={{
                                        id: p.id,
                                        game_date: p.game_date,
                                        team: p.team,
                                        opponent: p.opponent,
                                        league_id: league.id,
                                      }}
                                    />

                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-600 mt-2">No player data available.</p>
              )}

            </div>

          </section>

          <aside className="bg-white rounded-xl shadow p-4 space-y-6">
            {/* Instagram Embed */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Instagram Feed</h3>
              <iframe
                src="https://www.instagram.com/p/EXAMPLE/embed"
                width="100%"
                height="400"
                className="rounded-md"
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
              ></iframe>
            </div>

            {/* YouTube Embed */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Latest Highlights</h3>
              <iframe
                width="100%"
                height="250"
                src="https://www.youtube.com/embed/VIDEO_ID"
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>

            {/* Comment Section Placeholder */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Community Comments</h3>
              <p className="text-xs text-slate-500">💬 Only logged-in users can post.</p>
              <div className="text-xs italic text-slate-400 mt-2">Coming soon...</div>
            </div>
          </aside>


        </main>
      </div>
    );
  }

