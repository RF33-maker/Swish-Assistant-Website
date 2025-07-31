export interface PlayerAnalysisData {
  name: string;
  games_played: number;
  avg_points: number;
  avg_rebounds: number;
  avg_assists: number;
  avg_steals: number;
  avg_blocks: number;
  fg_percentage: number;
  three_point_percentage: number;
  ft_percentage: number;
}

export async function generatePlayerAnalysis(playerData: PlayerAnalysisData): Promise<string> {
  try {
    const response = await fetch('/api/ai-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(playerData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.analysis || "Dynamic player with well-rounded skills and strong court presence.";
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Skilled player with strong fundamentals and competitive drive.";
  }
}