import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
});

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
    const prompt = `Analyze this basketball player's statistics and provide a brief, engaging description of their playing style and strengths. Keep it under 40 words.

Player: ${playerData.name}
Games: ${playerData.games_played}
Points per game: ${playerData.avg_points.toFixed(1)}
Rebounds per game: ${playerData.avg_rebounds.toFixed(1)}
Assists per game: ${playerData.avg_assists.toFixed(1)}
Steals per game: ${playerData.avg_steals.toFixed(1)}
Blocks per game: ${playerData.avg_blocks.toFixed(1)}
Field Goal %: ${playerData.fg_percentage.toFixed(1)}%
Three Point %: ${playerData.three_point_percentage.toFixed(1)}%
Free Throw %: ${playerData.ft_percentage.toFixed(1)}%

Focus on their primary role (scorer, defender, playmaker, etc.) and key strengths. Be specific and basketball-focused.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a basketball analyst. Provide concise, accurate player descriptions based on statistics. Focus on playing style, not just numbers."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.7
    });

    return response.choices[0].message.content?.trim() || "Dynamic player with well-rounded skills and strong court presence.";
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Skilled player with strong fundamentals and competitive drive.";
  }
}