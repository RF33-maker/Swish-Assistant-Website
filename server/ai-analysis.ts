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
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.log("OpenAI API key not found, using fallback analysis");
      return "Skilled player with strong fundamentals and competitive drive.";
    }

    console.log("Generating AI analysis for player:", playerData.name);
    
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

    console.log("Calling OpenAI API...");
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

    const analysis = response.choices[0].message.content?.trim() || "Dynamic player with well-rounded skills and strong court presence.";
    console.log("AI analysis generated successfully:", analysis);
    return analysis;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
    }
    return "Skilled player with strong fundamentals and competitive drive.";
  }
}

export async function generateChatResponse(question: string, context: string, leagueName: string): Promise<string> {
  try {
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.log("OpenAI API key not found, using fallback response");
      return "I'm currently unable to provide detailed analysis. Please try again later.";
    }

    console.log("Generating AI chat response for league:", leagueName);
    console.log("Question:", question);
    
    const prompt = `You are a basketball league assistant for ${leagueName}. Answer the user's question using the provided league data. Be conversational, informative, and engaging. Use basketball terminology naturally and provide specific insights based on the data.

LEAGUE DATA:
${context}

USER QUESTION: ${question}

Provide a helpful response that:
- Directly answers their question using the provided data
- Includes specific statistics and names when relevant
- Uses a friendly, knowledgeable tone
- Adds basketball insights or context where appropriate
- Keeps the response focused and concise (under 200 words)

If the data doesn't contain enough information to answer the question fully, acknowledge this and suggest what else the user might ask about instead.`;

    console.log("Calling OpenAI API for chat response...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert basketball league assistant for ${leagueName}. You provide insightful, engaging responses about league statistics, player performance, and game analysis using the provided data.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    });

    const chatResponse = response.choices[0].message.content?.trim() || "I'm having trouble analyzing that information right now. Could you try asking about specific player stats or recent games?";
    console.log("AI chat response generated successfully");
    return chatResponse;
  } catch (error) {
    console.error("AI Chat Response Error:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
    }
    return "I'm having trouble processing your request right now. Please try asking about player statistics, recent games, or team standings.";
  }
}