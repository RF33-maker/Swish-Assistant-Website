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
    // Use the external backend for AI analysis instead of local API
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://sab-backend.onrender.com';
    const response = await fetch(`${backendUrl}/api/ai-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(playerData),
      // Add timeout to prevent long waits on cold starts
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.analysis || generateFallbackAnalysis(playerData);
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return generateFallbackAnalysis(playerData);
  }
}

// Generate a smart fallback analysis based on player stats
function generateFallbackAnalysis(playerData: PlayerAnalysisData): string {
  const { avg_points, avg_rebounds, avg_assists, fg_percentage, three_point_percentage } = playerData;
  
  let analysis = "";
  
  // Determine primary role
  if (avg_points >= 20) {
    analysis += "Prolific scorer";
  } else if (avg_points >= 15) {
    analysis += "Solid offensive contributor";
  } else if (avg_assists >= 5) {
    analysis += "Skilled playmaker";
  } else if (avg_rebounds >= 8) {
    analysis += "Strong rebounder";
  } else {
    analysis += "Well-rounded player";
  }
  
  // Add shooting analysis
  if (three_point_percentage >= 40) {
    analysis += " with excellent three-point shooting";
  } else if (three_point_percentage >= 35) {
    analysis += " with reliable perimeter shooting";
  } else if (fg_percentage >= 50) {
    analysis += " with efficient field goal shooting";
  }
  
  // Add additional strengths
  if (avg_rebounds >= 8 && avg_assists >= 4) {
    analysis += " and strong all-around fundamentals";
  } else if (avg_assists >= 6) {
    analysis += " and excellent court vision";
  } else if (avg_rebounds >= 10) {
    analysis += " and dominant board presence";
  } else {
    analysis += " with solid basketball fundamentals";
  }
  
  analysis += ".";
  
  return analysis;
}