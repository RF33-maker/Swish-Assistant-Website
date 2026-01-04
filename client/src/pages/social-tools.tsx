import { useLocation } from "wouter";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PlayerPerformanceCardV1 } from "@/components/social/PlayerPerformanceCardV1";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";
import { useRef } from "react";
import html2canvas from "html2canvas";

const sampleData: PlayerPerformanceV1Data = {
  player_name: "Sample Player",
  team_name: "London Cavaliers",
  opponent_name: "Bristol Flyers",
  points: 41,
  rebounds: 41,
  assists: 41,
  steals: 41,
  blocks: 41,
  fg: "10/20",
  three_pt: "1/1",
  ft: "1/1",
  turnovers: 41,
  ts_percent: "41.1",
  plus_minus: "41.1",
  home_score: 100,
  away_score: 100,
  home_logo_url: "",
  away_logo_url: "",
  photo_url: "",
};

export default function SocialToolsPage() {
  const [, navigate] = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
      });
      
      const link = document.createElement("a");
      link.download = "player-performance-card.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Failed to generate image:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Swish Social Tool
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Generate social media graphics from your stats database
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700">
            <CardHeader>
              <CardTitle className="text-orange-900 dark:text-orange-400">
                Player Performance Card V1
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Preview the player performance card template with sample data. 
                The card is sized at 1080×1350px (Instagram portrait).
              </p>
              <Button
                onClick={handleDownload}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Download className="h-4 w-4 mr-2" />
                Download as PNG
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700">
            <CardHeader>
              <CardTitle className="text-orange-900 dark:text-orange-400">
                Sample Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 p-4 rounded-lg overflow-auto max-h-[300px]">
                {JSON.stringify(sampleData, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Card Preview (scaled to fit)
          </h2>
          <div className="bg-gray-200 dark:bg-gray-700 p-4 rounded-lg overflow-auto">
            <div 
              className="origin-top-left"
              style={{ transform: "scale(0.5)", transformOrigin: "top left" }}
            >
              <div ref={cardRef}>
                <PlayerPerformanceCardV1 data={sampleData} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
