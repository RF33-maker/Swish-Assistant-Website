import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.VITE_BACKEND_URL;

export default function VisualizationSection() {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState("Rhys Farrell");
  const [playerList, setPlayerList] = useState<string[]>([]);

  useEffect(() => {
    async function fetchPlayerList() {
      try {
        const res = await fetch("${BASE}/players");
        const names = await res.json();
        setPlayerList(names);

        // ✅ Ensure a valid default
        if (names.length > 0 && !selectedPlayer) {
          setSelectedPlayer(names[0]);
        }
      } catch (err) {
        console.error("❌ Failed to fetch player list:", err);
      }
    }

    fetchPlayerList();
  }, []);

  useEffect(() => {
    if (!selectedPlayer) return;

    const fetchChartData = async () => {
      setLoading(true);
      try {
        const playerName = encodeURIComponent(selectedPlayer);
        const res = await fetch('${BASE}/chart_summary/${playerName}');
        const data = await res.json();
        setChartData(data);
      } catch (err) {
        console.error("❌ Error fetching chart data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [selectedPlayer]);


  return (
    
        <section className="py-12 px-4 sm:px-6 lg:px-8 bg-neutral-50">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-2">Visualization</h2>
            <p className="text-neutral-600 mb-8">How this player performed recently</p>

            {/* Player Dropdown */}
            <div className="mb-4">
              <label htmlFor="player-select" className="block mb-1 text-sm font-medium text-neutral-700">
                Select Player
              </label>
              <select
                id="player-select"
                className="w-full p-2 border border-neutral-300 rounded-md"
                value={selectedPlayer}
                onChange={(e) => setSelectedPlayer(e.target.value)}
              >
                {playerList.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white shadow-lg rounded-xl overflow-hidden">
              <div className="border-b border-neutral-200 px-6 py-4 bg-neutral-50 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="h-3 w-3 bg-red-500 rounded-full"></div>
                  <div className="ml-2 h-3 w-3 bg-yellow-500 rounded-full"></div>
                  <div className="ml-2 h-3 w-3 bg-green-500 rounded-full"></div>
                  <span className="ml-4 text-sm text-neutral-500">Game Stat Summary</span>
                </div>
                <Button variant="ghost" size="icon">
                  <Maximize className="h-4 w-4" />
                </Button>
              </div>

              <div className="p-6 h-[400px] bg-neutral-100">
                {loading ? (
                  <p className="text-center text-neutral-500">Loading chart...</p>
                ) : chartData.length === 0 ? (
                  <p className="text-center text-neutral-500">No data available.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="stat" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="last_game" fill="#8884d8" name="Last Game" />
                      <Bar dataKey="previous_game" fill="#82ca9d" name="Previous Game" />
                      <Bar dataKey="average" fill="#ccc" name="Season Avg" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </section>
      );
    }  
