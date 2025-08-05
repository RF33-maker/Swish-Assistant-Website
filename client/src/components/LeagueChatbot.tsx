import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Lock, User, Bot, TrendingUp, BarChart3, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';

interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  suggestions?: string[];
}

interface LeagueChatbotProps {
  leagueId: string;
  leagueName: string;
  onResponseReceived?: (response: string) => void;
}

export default function LeagueChatbot({ leagueId, leagueName, onResponseReceived }: LeagueChatbotProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleLogin = () => {
    window.location.href = '/api/login';
  };

  const suggestedQuestions = [
    "How is Marcos Perez Tosca doing?",
    "Who does Rhys Farrell play for?",
    "Who is the best team?",
    "Who are the most efficient players?",
    "Show me the top scorers"
  ];

  const handleSuggestedQuestion = (question: string) => {
    if (!user) return;
    setInputMessage(question);
    handleSendMessage(question);
  };

  const handleSendMessage = async (messageText?: string) => {
    const message = messageText || inputMessage;
    if (!message.trim() || !user || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: message,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await queryLeagueData(message, leagueId);

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: typeof response === 'string' ? response : response.content,
        timestamp: new Date(),
        suggestions: typeof response === 'string' ? undefined : response.suggestions
      };

      setMessages(prev => [...prev, botMessage]);

      // Call the response callback if provided
      if (onResponseReceived) {
        const responseContent = typeof response === 'string' ? response : response.content;
        onResponseReceived(responseContent);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: "I'm sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
  };

  const queryLeagueData = async (question: string, leagueId: string): Promise<{ content: string; suggestions?: string[] } | string> => {
    try {
      // First try to use the backend API
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      
      if (backendUrl) {
        console.log('🚀 Attempting backend chat request...');
        console.log('Backend URL:', backendUrl);
        console.log('Question:', question);
        console.log('League ID:', leagueId);

        try {
          const response = await fetch(`${backendUrl}/api/chat/league`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              question: question,
              league_id: leagueId,
              context: "coaching_chatbot"
            }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });

          console.log('Backend response status:', response.status);
          console.log('Backend response headers:', Object.fromEntries(response.headers.entries()));

          if (response.ok) {
            const data = await response.json();
            console.log('✅ Backend response received:', data);
            
            if (data.response || data.answer) {
              return {
                content: data.response || data.answer,
                suggestions: data.suggestions || []
              };
            }
          } else {
            const errorText = await response.text();
            console.error('❌ Backend response error:', response.status, errorText);
          }
        } catch (backendError) {
          console.error('❌ Backend request failed:', backendError);
        }
      } else {
        console.log('⚠️ No backend URL configured, using fallback');
      }

      // Fallback to local Supabase processing
      console.log('🔄 Falling back to local Supabase processing...');
      const lowerQuestion = question.toLowerCase();

      // Gather comprehensive league data for local processing
      const [playersData, gamesData] = await Promise.all([
        supabase
          .from('player_stats')
          .select('name, points, rebounds_total, assists, steals, blocks, team')
          .eq('league_id', leagueId)
          .order('points', { ascending: false })
          .limit(20),
        supabase
          .from('games')
          .select('game_date, home_team, away_team, home_score, away_score')
          .eq('league_id', leagueId)
          .order('game_date', { ascending: false })
          .limit(15)
      ]);

      console.log('League data retrieved for local processing:', { 
        players: playersData.data?.length || 0, 
        games: gamesData.data?.length || 0 
      });
      console.log('Players query result:', playersData);
      console.log('Games query result:', gamesData);

      console.log('Context prepared, generating local response...');
      console.log('Question:', question);
      console.log('Lower question:', lowerQuestion);
      console.log('Players data available:', !!playersData.data, playersData.data?.length || 0);
      console.log('Games data available:', !!gamesData.data, gamesData.data?.length || 0);

      // Enhanced Pattern-based intelligent responses

      // Player team lookup
      if (lowerQuestion.includes('who does') && (lowerQuestion.includes('play for') || lowerQuestion.includes('play on'))) {
        const playerNameMatch = lowerQuestion.match(/who does (.+?) play/);
        if (playerNameMatch) {
          const playerName = playerNameMatch[1].trim();
          console.log('Looking for player:', playerName);

          const player = playersData.data?.find(p => 
            p.name.toLowerCase().includes(playerName) ||
            playerName.includes(p.name.toLowerCase().split(' ')[0]) ||
            p.name.toLowerCase().split(' ')[0] === playerName.split(' ')[0]
          );

          if (player) {
            return {
              content: `${player.name} plays for ${player.team}.`,
              suggestions: [`How is ${player.name} doing?`, `Who are ${player.team}'s top players?`]
            };
          } else {
            return `I couldn't find a player named "${playerName}" in ${leagueName}. Try asking about one of these players:\n\n${playersData.data?.slice(0, 5).map(p => `• ${p.name} (${p.team})`).join('\n') || 'No player data available'}`;
          }
        }
      }

      // Player performance analysis
      if (lowerQuestion.includes('how is') && (lowerQuestion.includes('doing') || lowerQuestion.includes('playing'))) {
        const nameMatch = lowerQuestion.match(/how is (.+?) (doing|playing)/);
        if (nameMatch) {
          const searchName = nameMatch[1].trim();
          console.log('Searching for player performance:', searchName);

          const player = playersData.data?.find(p => 
            p.name.toLowerCase().includes(searchName) ||
            searchName.includes(p.name.toLowerCase().split(' ')[0]) ||
            p.name.toLowerCase().split(' ')[0] === searchName.split(' ')[0]
          );

          if (player) {
            return {
              content: `${player.name} is having a solid season with ${player.team}!\n\nSeason totals: ${player.points} pts, ${player.rebounds_total} reb, ${player.assists} ast, ${player.steals} stl, ${player.blocks} blk\n\n${player.points >= 30 ? '🔥 Strong scorer who can put up big numbers!' : player.rebounds_total >= 15 ? '💪 Solid presence in the paint with good rebounding!' : player.assists >= 10 ? '🎯 Great court vision and playmaking ability!' : '⚡ Well-rounded contributor on both ends!'}`,
              suggestions: [`Who are the most efficient players?`, `Who does ${player.team} play next?`]
            };
          }
        }
      }

      // Team analysis
      if (lowerQuestion.includes('best team') || lowerQuestion.includes('top team')) {
        if (gamesData.data && gamesData.data.length > 0) {
          const teamRecords: { [team: string]: { wins: number; losses: number; pointsFor: number; pointsAgainst: number } } = {};

          gamesData.data.forEach(game => {
            if (!teamRecords[game.home_team]) {
              teamRecords[game.home_team] = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
            }
            if (!teamRecords[game.away_team]) {
              teamRecords[game.away_team] = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
            }

            teamRecords[game.home_team].pointsFor += game.home_score;
            teamRecords[game.home_team].pointsAgainst += game.away_score;
            teamRecords[game.away_team].pointsFor += game.away_score;
            teamRecords[game.away_team].pointsAgainst += game.home_score;

            if (game.home_score > game.away_score) {
              teamRecords[game.home_team].wins++;
              teamRecords[game.away_team].losses++;
            } else {
              teamRecords[game.away_team].wins++;
              teamRecords[game.home_team].losses++;
            }
          });

          const sortedTeams = Object.entries(teamRecords).sort((a, b) => {
            const aWinPct = a[1].wins / (a[1].wins + a[1].losses);
            const bWinPct = b[1].wins / (b[1].wins + b[1].losses);
            return bWinPct - aWinPct;
          });

          if (sortedTeams.length > 0) {
            const [teamName, record] = sortedTeams[0];
            const winPct = ((record.wins / (record.wins + record.losses)) * 100).toFixed(1);
            const avgFor = (record.pointsFor / (record.wins + record.losses)).toFixed(1);
            const avgAgainst = (record.pointsAgainst / (record.wins + record.losses)).toFixed(1);

            return `${teamName} is the top team in ${leagueName}.\n\nRecord: ${record.wins}-${record.losses} (${winPct}% win rate)\nAveraging ${avgFor} points per game\nAllowing ${avgAgainst} points per game\n\n💡 Want to know more? Try asking:\n• "Who are ${teamName}'s top players?"\n• "Show me recent games"`;
          }
        }
      }

      // Most efficient players
      if (lowerQuestion.includes('efficient') || lowerQuestion.includes('best player') || lowerQuestion.includes('most productive')) {
        if (playersData.data && playersData.data.length > 0) {
          const efficiencyPlayers = playersData.data.map(p => ({
            ...p,
            efficiency: p.points + p.rebounds_total + p.assists + p.steals + p.blocks
          })).sort((a, b) => b.efficiency - a.efficiency).slice(0, 5);

          const topPlayer = efficiencyPlayers[0];
          const efficiencyList = efficiencyPlayers.map((p, i) => 
            `${i + 1}. ${p.name} (${p.team}) - ${p.efficiency} total production`
          ).join('\n');

          return `Most Efficient Players in ${leagueName}:\n(Based on total statistical production)\n\n${efficiencyList}\n\n${topPlayer.name} leads with ${topPlayer.efficiency} total production.\n\n💡 Want more details? Try asking:\n• "How is ${topPlayer.name} doing?"\n• "Who leads in rebounds?"`;
        }
      }

      // Broader question matching for common terms
      if (lowerQuestion.includes('rebound') || lowerQuestion.includes('board')) {
        const topRebounder = playersData.data?.[0] ? playersData.data.find(p => p.rebounds_total === Math.max(...playersData.data.map(player => player.rebounds_total))) : null;
        if (topRebounder) {
          return `Rebounding Leaders in ${leagueName}:\n\n${playersData.data?.sort((a, b) => b.rebounds_total - a.rebounds_total).slice(0, 5).map((p, i) => `${i + 1}. ${p.name} (${p.team}) - ${p.rebounds_total} rebounds`).join('\n')}\n\n💡 Want player details? Try asking:\n• "How is ${topRebounder.name} doing?"\n• "Who are the most efficient players?"`;
        }
      }

      if (lowerQuestion.includes('scorer') || lowerQuestion.includes('scoring') || lowerQuestion.includes('points') || lowerQuestion.includes('top')) {
        const topScorer = playersData.data?.[0];
        if (topScorer) {
          return `Scoring Leaders in ${leagueName}:\n\n${playersData.data?.slice(0, 5).map((p, i) => `${i + 1}. ${p.name} (${p.team}) - ${p.points} points`).join('\n')}\n\n💡 Want more details? Try asking:\n• "How is ${topScorer.name} doing?"\n• "Who is the best team?"`;
        }
      }

      // General response with data
      if (playersData.data && playersData.data.length > 0) {
        const topPlayer = playersData.data[0];

        return `Here's what's happening in ${leagueName}:\n\n🏀 League Leaders:\n• Top Scorer: ${topPlayer.name} (${topPlayer.team}) - ${topPlayer.points} points\n• Games Played: ${gamesData.data?.length || 'Several'} recent games\n• Teams Competing: ${new Set(playersData.data.map(p => p.team)).size} active teams\n\n💡 Try asking me:\n• "How is [Player Name] doing?"\n• "Who is the best team?"\n• "Who are the most efficient players?"`;
      }

      return `I can help you explore ${leagueName} data! Try asking about specific players, team performance, or statistical leaders.`;


    } catch (error) {
      console.error('Error querying league data:', error);

      // Fallback to simple data response if OpenAI fails
      try {
        const { data: players } = await supabase
          .from('player_stats')
          .select('name, points, rebounds_total, assists, team')
          .eq('league_id', leagueId)
          .order('points', { ascending: false })
          .limit(3);

        if (players && players.length > 0) {
          return `Here's some quick ${leagueName} data:\n\nTop Performers:\n${players.map((p, i) => `${i + 1}. ${p.name} (${p.team}) - ${p.points}pts, ${p.rebounds_total}reb, ${p.assists}ast`).join('\n')}\n\n(AI analysis temporarily unavailable - please try again)`;
        }
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
      }

      return "I'm having trouble accessing the league data right now. Please try again in a moment.";
    }
  };

  if (authLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-slate-800">League Assistant</h3>
          <span className="px-2 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-xs rounded-full font-medium">
            PREMIUM
          </span>
        </div>
        <div className="text-center text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-slate-800">League Assistant</h3>
          <span className="px-2 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-xs rounded-full font-medium">
            PREMIUM
          </span>
        </div>

        <div className="text-center py-6">
          <Lock className="w-12 h-12 text-orange-400 mx-auto mb-3" />
          <h4 className="font-medium text-slate-800 mb-2">Premium Feature</h4>
          <p className="text-sm text-slate-600 mb-4">
            Get instant insights about {leagueName} - player stats, game results, and more!
          </p>

          <div className="bg-orange-50 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-orange-700 mb-2">
              <BarChart3 className="w-4 h-4" />
              <span className="font-medium">Ask about:</span>
            </div>
            <ul className="text-xs text-orange-600 space-y-1">
              <li>• Top scorers and rebounders</li>
              <li>• Recent game results</li>
              <li>• Team standings</li>
              <li>• Player performance stats</li>
            </ul>
          </div>

          <Button onClick={handleLogin} className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white">
            <User className="w-4 h-4 mr-2" />
            Login to Access
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden">
      <div 
        className="flex items-center justify-between p-5 bg-gradient-to-r from-orange-50 to-yellow-50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6 text-orange-500" />
          <h3 className="text-lg font-semibold text-slate-800">League Assistant</h3>
          <span className="px-3 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-sm rounded-full font-medium">
            PREMIUM
          </span>
        </div>
        <Button variant="ghost" size="sm" className="text-lg">
          {isExpanded ? '−' : '+'}
        </Button>
      </div>

      {isExpanded && (
        <div className="p-6">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <p className="text-base text-slate-600 mb-4">
                Ask me about {leagueName} stats! Here are some suggestions:
              </p>

              <div className="space-y-3">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={async () => {
                      if (!user || isLoading) return;

                      const userMessage: Message = {
                        id: Date.now().toString(),
                        type: 'user',
                        content: question,
                        timestamp: new Date()
                      };

                      setMessages(prev => [...prev, userMessage]);
                      setIsLoading(true);

                      try {
                        const response = await queryLeagueData(question, leagueId);

                        const botMessage: Message = {
                          id: (Date.now() + 1).toString(),
                          type: 'bot',
                          content: typeof response === 'string' ? response : response.content,
                          timestamp: new Date(),
                          suggestions: typeof response === 'string' ? undefined : response.suggestions
                        };

                        setMessages(prev => [...prev, botMessage]);

                        // Trigger response received callback for scouting reports
                        if (onResponseReceived) {
                          onResponseReceived(typeof response === 'string' ? response : response.content);
                        }
                        if (onResponseReceived) {
                          onResponseReceived(typeof response === 'string' ? response : response.content);
                        }
                      } catch (error) {
                        const errorMessage: Message = {
                          id: (Date.now() + 1).toString(),
                          type: 'bot',
                          content: "I'm sorry, I encountered an error while processing your request. Please try again.",
                          timestamp: new Date()
                        };
                        setMessages(prev => [...prev, errorMessage]);
                      }

                      setIsLoading(false);
                    }}
                    className="w-full text-left p-4 text-base bg-orange-50 hover:bg-orange-100 rounded-lg text-slate-700 transition-colors border border-orange-200 hover:border-orange-300"
                    disabled={isLoading}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8 max-h-[600px] overflow-y-auto mb-8 p-6 bg-slate-50 rounded-lg">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.type === 'bot' && (
                    <Bot className="w-7 h-7 text-orange-500 mt-1 flex-shrink-0" />
                  )}
                  <div className="flex flex-col max-w-[80%]">
                    <div
                      className={`p-5 rounded-lg text-base leading-relaxed ${
                        message.type === 'user'
                          ? 'bg-orange-500 text-white'
                          : 'bg-white text-slate-800 shadow-sm border border-slate-200'
                      }`}
                    >
                      <div className="whitespace-pre-line">{message.content}</div>
                      <div className={`text-sm mt-2 ${
                        message.type === 'user' ? 'text-orange-100' : 'text-slate-500'
                      }`}>
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                    {message.type === 'bot' && message.suggestions && message.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {message.suggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={async () => {
                              if (!user || isLoading) return;

                              const userMessage: Message = {
                                id: Date.now().toString(),
                                type: 'user',
                                content: suggestion,
                                timestamp: new Date()
                              };

                              setMessages(prev => [...prev, userMessage]);
                              setIsLoading(true);

                              try {
                                const response = await queryLeagueData(suggestion, leagueId);

                                const botMessage: Message = {
                                  id: (Date.now() + 1).toString(),
                                  type: 'bot',
                                  content: typeof response === 'string' ? response : response.content,
                                  timestamp: new Date(),
                                  suggestions: typeof response === 'string' ? undefined : response.suggestions
                                };

                                setMessages(prev => [...prev, botMessage]);
                              } catch (error) {
                                const errorMessage: Message = {
                                  id: (Date.now() + 1).toString(),
                                  type: 'bot',
                                  content: "I'm sorry, I encountered an error while processing your request. Please try again.",
                                  timestamp: new Date()
                                };
                                setMessages(prev => [...prev, errorMessage]);
                              }

                              setIsLoading(false);
                            }}
                            className="px-3 py-1 text-sm bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-md transition-colors border border-orange-200 hover:border-orange-300"
                            disabled={isLoading}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {message.type === 'user' && (
                    <User className="w-7 h-7 text-slate-400 mt-1 flex-shrink-0" />
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <Bot className="w-7 h-7 text-orange-500 mt-1 flex-shrink-0" />
                  <div className="bg-white text-slate-800 p-5 rounded-lg text-base shadow-sm border border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-slate-400 rounded-full animate-bounce"></div>
                      <div className="w-3 h-3 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-3 h-3 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask about stats, games, players..."
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              className="text-base py-4 px-4"
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              size="default"
              className="bg-orange-500 hover:bg-orange-600 text-white px-6"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}