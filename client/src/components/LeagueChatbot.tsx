import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Lock, User, Bot, TrendingUp, BarChart3, Users, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { useLocation } from 'wouter';

interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  navigationButtons?: { label: string; id: string; type: 'player' | 'team' }[];
}

interface LeagueChatbotProps {
  leagueId: string;
  leagueName: string;
  onResponseReceived?: (response: string) => void;
}

interface LeagueChatbotProps {
  leagueId: string;
  leagueName: string;
  onResponseReceived?: (response: string) => void;
  isPanelMode?: boolean; // New prop to indicate it's in a side panel
}

export default function LeagueChatbot({ leagueId, leagueName, onResponseReceived, isPanelMode = false }: LeagueChatbotProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(isPanelMode);
  const [isOverlayMode, setIsOverlayMode] = useState(false);
  const [isActivelyUsed, setIsActivelyUsed] = useState(isPanelMode);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation(); // Hook for routing

  // Auto-expand when user starts interacting
  useEffect(() => {
    if (messages.length > 0 || inputMessage.trim().length > 0) {
      setIsActivelyUsed(true);
      setIsExpanded(true);
    }
  }, [messages.length, inputMessage]);

  // Auto-collapse after period of inactivity
  useEffect(() => {
    if (!isActivelyUsed) return;

    const timer = setTimeout(() => {
      if (messages.length === 0 && inputMessage.trim().length === 0) {
        setIsActivelyUsed(false);
        setIsExpanded(false);
      }
    }, 30000); // 30 seconds of inactivity

    return () => clearTimeout(timer);
  }, [messages, inputMessage, isActivelyUsed]);

  const handleMinimize = () => {
    setIsActivelyUsed(false);
    setIsExpanded(false);
    setMessages([]);
    setInputMessage('');
  };

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

  const handleSendMessage = async (messageText?: string) => {
    const message = messageText || inputMessage;
    if (!message.trim() || !user || isLoading || !leagueId) return;

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
        suggestions: typeof response === 'string' ? undefined : response.suggestions,
        navigationButtons: typeof response === 'string' ? undefined : response.navigationButtons
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

  const queryLeagueData = async (question: string, leagueId: string): Promise<{ content: string; suggestions?: string[]; navigationButtons?: { label: string; id: string; type: 'player' | 'team' }[] } | string> => {
    try {
      // First try to use the backend API
      const BASE = import.meta.env.VITE_BACKEND_URL;

      if (BASE) {
        console.log('🚀 Attempting backend chat request...');
        console.log('Backend URL:', BASE);
        console.log('Question:', question);
        console.log('League ID:', leagueId);

        try {
          const response = await fetch(`${BASE}/api/chat/league`, {
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
                suggestions: data.suggestions || [],
                navigationButtons: data.navigation_buttons || []
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
      const [playersDataResult, gamesDataResult] = await Promise.all([
        supabase
          .from('player_stats')
          .select('id, name, points, rebounds_total, assists, steals, blocks, team')
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

      const playersData = playersDataResult.data || [];
      const gamesData = gamesDataResult.data || [];

      console.log('League data retrieved for local processing:', { 
        players: playersData.length, 
        games: gamesData.length 
      });
      
      // Debug: Log available player names
      if (playersData.length > 0) {
        console.log('Available players:', playersData.map(p => p.name).join(', '));
      }

      // Enhanced Pattern-based intelligent responses

      // Player team lookup
      if (lowerQuestion.includes('who does') && (lowerQuestion.includes('play for') || lowerQuestion.includes('play on'))) {
        const playerNameMatch = lowerQuestion.match(/who does (.+?) play/);
        if (playerNameMatch) {
          const playerName = playerNameMatch[1].trim();
          console.log('Looking for player:', playerName);

          const player = playersData.find(p => {
            const playerNameLower = playerName.toLowerCase();
            const pNameLower = p.name.toLowerCase();
            
            // Direct match
            if (pNameLower.includes(playerNameLower) || playerNameLower.includes(pNameLower)) {
              return true;
            }
            
            // Split and check individual words
            const searchWords = playerNameLower.split(' ');
            const playerWords = pNameLower.split(' ');
            
            // Check if any search word matches any player word
            return searchWords.some(searchWord => 
              playerWords.some(playerWord => 
                playerWord.includes(searchWord) || searchWord.includes(playerWord)
              )
            );
          });

          if (player) {
            return {
              content: `${player.name} plays for ${player.team}.`,
              suggestions: [`How is ${player.name} performing?`, `Who are ${player.team}'s top players?`],
              navigationButtons: [{ label: `${player.name}'s Profile`, id: player.id, type: 'player' }]
            };
          } else {
            const availablePlayers = playersData.slice(0, 5).map(p => `• ${p.name} (${p.team})`).join('\n');
            return {
              content: `I couldn't find a player named "${playerName}" in ${leagueName}. Here are some available players:\n\n${availablePlayers || 'No player data available'}`,
              suggestions: playersData.slice(0, 3).map(p => `How is ${p.name} performing?`)
            };
          }
        }
      }

      // Player performance analysis
      if (lowerQuestion.includes('how is') && (lowerQuestion.includes('doing') || lowerQuestion.includes('playing'))) {
        const nameMatch = lowerQuestion.match(/how is (.+?) (doing|playing)/);
        if (nameMatch) {
          const searchName = nameMatch[1].trim();
          console.log('Searching for player performance:', searchName);

          const player = playersData.find(p => {
            const searchNameLower = searchName.toLowerCase();
            const pNameLower = p.name.toLowerCase();
            
            // Direct match
            if (pNameLower.includes(searchNameLower) || searchNameLower.includes(pNameLower)) {
              return true;
            }
            
            // Split and check individual words
            const searchWords = searchNameLower.split(' ');
            const playerWords = pNameLower.split(' ');
            
            // Check if any search word matches any player word
            return searchWords.some(searchWord => 
              playerWords.some(playerWord => 
                playerWord.includes(searchWord) || searchWord.includes(playerWord)
              )
            );
          });

          if (player) {
            return {
              content: `${player.name} is having a solid season with ${player.team}!\n\nSeason totals: ${player.points} pts, ${player.rebounds_total} reb, ${player.assists} ast, ${player.steals} stl, ${player.blocks} blk\n\n${player.points >= 30 ? '🔥 Strong scorer who can put up big numbers!' : player.rebounds_total >= 15 ? '💪 Solid presence in the paint with good rebounding!' : player.assists >= 10 ? '🎯 Great court vision and playmaking ability!' : '⚡ Well-rounded contributor on both ends!'}`,
              suggestions: [`Who is ${player.name}'s team?`, `Who does ${player.team} play next?`],
              navigationButtons: [{ label: `${player.name}'s Profile`, id: player.id, type: 'player' }]
            };
          } else {
            const availablePlayers = playersData.slice(0, 5).map(p => `• ${p.name} (${p.team})`).join('\n');
            return {
              content: `I couldn't find a player named "${searchName}" in ${leagueName}. Here are some available players:\n\n${availablePlayers || 'No player data available'}`,
              suggestions: playersData.slice(0, 3).map(p => `How is ${p.name} performing?`)
            };
          }
        }
      }

      // Team analysis
      if (lowerQuestion.includes('best team') || lowerQuestion.includes('top team')) {
        if (gamesData.length > 0) {
          const teamRecords: { [team: string]: { wins: number; losses: number; pointsFor: number; pointsAgainst: number } } = {};

          gamesData.forEach(game => {
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

            // Attempt to find a team ID for the button, if available. For now, we use the team name.
            // In a real app, you'd have a mapping or a way to fetch team IDs.
            const teamId = teamName; // Placeholder for actual team ID lookup

            return {
              content: `${teamName} is the top team in ${leagueName}.\n\nRecord: ${record.wins}-${record.losses} (${winPct}% win rate)\nAveraging ${avgFor} points per game\nAllowing ${avgAgainst} points per game\n\n💡 Want to know more? Try asking:\n• "Who are ${teamName}'s top players?"\n• "Show me recent games"`,
              suggestions: [`Who are ${teamName}'s top players?`, `Show me recent games for ${teamName}`],
              navigationButtons: [{ label: `${teamName}'s Profile`, id: teamId, type: 'team' }]
            };
          }
        }
      }

      // Most efficient players
      if (lowerQuestion.includes('efficient') || lowerQuestion.includes('best player') || lowerQuestion.includes('most productive')) {
        if (playersData.length > 0) {
          const efficiencyPlayers = playersData.map(p => ({
            ...p,
            efficiency: p.points + p.rebounds_total + p.assists + p.steals + p.blocks
          })).sort((a, b) => b.efficiency - a.efficiency).slice(0, 5);

          const topPlayer = efficiencyPlayers[0];
          const efficiencyList = efficiencyPlayers.map((p, i) => 
            `${i + 1}. ${p.name} (${p.team}) - ${p.efficiency} total production`
          ).join('\n');

          return {
            content: `Most Efficient Players in ${leagueName}:\n(Based on total statistical production)\n\n${efficiencyList}\n\n${topPlayer.name} leads with ${topPlayer.efficiency} total production.\n\n💡 Want more details? Try asking:\n• "How is ${topPlayer.name} performing?"\n• "Who leads in rebounds?"`,
            suggestions: [`How is ${topPlayer.name} performing?`, `Who leads in rebounds?`],
            navigationButtons: [{ label: `${topPlayer.name}'s Profile`, id: topPlayer.id, type: 'player' }]
          };
        }
      }

      // Broader question matching for common terms
      if (lowerQuestion.includes('rebound') || lowerQuestion.includes('board')) {
        const topRebounder = playersData.length > 0 ? playersData.find(p => p.rebounds_total === Math.max(...playersData.map(player => player.rebounds_total))) : null;
        if (topRebounder) {
          return {
            content: `Rebounding Leaders in ${leagueName}:\n\n${playersData.sort((a, b) => b.rebounds_total - a.rebounds_total).slice(0, 5).map((p, i) => `${i + 1}. ${p.name} (${p.team}) - ${p.rebounds_total} rebounds`).join('\n')}\n\n💡 Want player details? Try asking:\n• "How is ${topRebounder.name} performing?"\n• "Who are the most efficient players?"`,
            suggestions: [`How is ${topRebounder.name} performing?`, `Who are the most efficient players?`],
            navigationButtons: [{ label: `${topRebounder.name}'s Profile`, id: topRebounder.id, type: 'player' }]
          };
        }
      }

      if (lowerQuestion.includes('scorer') || lowerQuestion.includes('scoring') || lowerQuestion.includes('points') || lowerQuestion.includes('top')) {
        const topScorer = playersData.length > 0 ? playersData[0] : null;
        if (topScorer) {
          return {
            content: `Scoring Leaders in ${leagueName}:\n\n${playersData.slice(0, 5).map((p, i) => `${i + 1}. ${p.name} (${p.team}) - ${p.points} points`).join('\n')}\n\n💡 Want more details? Try asking:\n• "How is ${topScorer.name} performing?"\n• "Who is the best team?"`,
            suggestions: [`How is ${topScorer.name} performing?`, `Who is the best team?`],
            navigationButtons: [{ label: `${topScorer.name}'s Profile`, id: topScorer.id, type: 'player' }]
          };
        }
      }

      // General response with data
      if (playersData.length > 0) {
        const topPlayer = playersData[0];

        return {
          content: `Here's what's happening in ${leagueName}:\n\n🏀 League Leaders:\n• Top Scorer: ${topPlayer.name} (${topPlayer.team}) - ${topPlayer.points} points\n• Games Played: ${gamesData.length || 'Several'} recent games\n• Teams Competing: ${new Set(playersData.map(p => p.team)).size} active teams\n\n💡 Try asking me:\n• "How is [Player Name] performing?"\n• "Who is the best team?"\n• "Who are the most efficient players?"`,
          suggestions: [`How is ${topPlayer.name} performing?`, `Who is the best team?`, `Who are the most efficient players?`],
          navigationButtons: [{ label: `${topPlayer.name}'s Profile`, id: topPlayer.id, type: 'player' }]
        };
      }

      return `I can help you explore ${leagueName} data! Try asking about specific players, team performance, or statistical leaders.`;


    } catch (error) {
      console.error('Error querying league data:', error);

      // Fallback to simple data response if OpenAI fails
      try {
        const { data: players } = await supabase
          .from('player_stats')
          .select('id, name, points, rebounds_total, assists, team')
          .eq('league_id', leagueId)
          .order('points', { ascending: false })
          .limit(3);

        if (players && players.length > 0) {
          return {
            content: `Here's some quick ${leagueName} data:\n\nTop Performers:\n${players.map((p, i) => `${i + 1}. ${p.name} (${p.team}) - ${p.points}pts, ${p.rebounds_total}reb, ${p.assists}ast`).join('\n')}\n\n(AI analysis temporarily unavailable - please try again)`,
            navigationButtons: players.map(p => ({ label: `${p.name}'s Profile`, id: p.id, type: 'player' }))
          };
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

  if (!leagueId) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-slate-800">League Assistant</h3>
          <span className="px-2 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-xs rounded-full font-medium">
            PREMIUM
          </span>
        </div>
        <div className="text-center text-slate-500">Please select a league to use the assistant.</div>
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

  // In panel mode, always show expanded and don't allow overlay
  if (isPanelMode) {
    return (
      <div className="bg-white rounded-xl border border-orange-200 overflow-hidden h-full flex flex-col shadow-lg">
        {/* Header - Always visible in panel mode */}
        <div className="bg-gradient-to-r from-orange-100 to-yellow-100 p-4 border-b border-orange-200">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-5 h-5 text-orange-600" />
            <h3 className="text-lg font-semibold text-slate-800">League Assistant</h3>
            <span className="px-3 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-sm rounded-full font-medium">
              ACTIVE
            </span>
          </div>
        </div>

        {/* Chat Content - Flexible height */}
        <div className="flex-1 flex flex-col p-4 min-h-0">
          {messages.length === 0 ? (
            <div className="space-y-4 flex-1">
              <p className="text-base text-slate-600 mb-4">
                Ask me about {leagueName} stats!
              </p>
              <div className="space-y-3">
                {suggestedQuestions.slice(0, 3).map((question, index) => (
                  <div key={index} className="flex gap-2 items-start p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="flex-1 text-sm text-slate-700">
                      {question}
                    </div>
                    <Button
                      onClick={() => handleSendMessage(question)}
                      disabled={isLoading}
                      size="sm"
                      className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 flex-shrink-0"
                    >
                      <Send className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto mb-4 min-h-0">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.type === 'bot' && (
                    <Bot className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" />
                  )}
                  <div className="flex flex-col max-w-[85%]">
                    <div
                      className={`p-3 rounded-lg text-sm leading-relaxed ${
                        message.type === 'user'
                          ? 'bg-orange-500 text-white'
                          : 'bg-white text-slate-800 shadow-sm border border-slate-200'
                      }`}
                    >
                      <div className="whitespace-pre-line">{message.content}</div>
                    </div>
                    
                    {/* Suggestion buttons - compact for panel */}
                    {message.type === 'bot' && message.suggestions && message.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {message.suggestions.slice(0, 2).map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSendMessage(suggestion)}
                            className="px-2 py-1 text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 rounded transition-colors border border-orange-200"
                            disabled={isLoading}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {message.type === 'user' && (
                    <User className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <Bot className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" />
                  <div className="bg-white text-slate-800 p-3 rounded-lg text-sm shadow-sm border border-slate-200">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input Area - Always at bottom */}
          <div className="flex gap-2 pt-2 border-t border-gray-200">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask about stats, games, players..."
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              className="text-sm py-2 px-3 border-2 border-orange-300 ring-2 ring-orange-100"
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Overlay backdrop */}
      {isOverlayMode && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsOverlayMode(false)}
        />
      )}

      {/* Main chatbot container */}
      <div className={`bg-white rounded-xl border border-orange-200 overflow-hidden transition-all duration-500 ease-in-out ${
        isOverlayMode 
          ? 'fixed top-4 left-4 right-4 bottom-4 z-50 max-w-5xl mx-auto shadow-2xl' 
          : isActivelyUsed || isExpanded
            ? 'relative shadow-lg transform scale-[1.02]'
            : 'relative shadow-sm'
      }`}>
        <div 
          className={`flex items-center justify-between p-5 cursor-pointer transition-all duration-300 ${
            isActivelyUsed || isExpanded
              ? 'bg-gradient-to-r from-orange-100 to-yellow-100'
              : 'bg-gradient-to-r from-orange-50 to-yellow-50'
          }`}
          onClick={() => {
            if (!isOverlayMode && !isPanelMode) {
              setIsExpanded(!isExpanded);
            }
          }}
        >
          <div className="flex items-center gap-3">
            <MessageCircle className={`w-6 h-6 transition-all duration-300 ${
              isActivelyUsed || isExpanded ? 'text-orange-600' : 'text-orange-500'
            }`} />
            <h3 className="text-lg font-semibold text-slate-800">League Assistant</h3>
            <span className={`px-3 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-sm rounded-full font-medium transition-all duration-300 ${
              isActivelyUsed || isExpanded ? 'scale-105' : ''
            }`}>
              {isActivelyUsed ? 'ACTIVE' : 'PREMIUM'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {(isExpanded || isOverlayMode) && (
              <>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOverlayMode(!isOverlayMode);
                  }}
                  className="text-sm text-slate-800 hover:bg-orange-100"
                >
                  {isOverlayMode ? 'Minimize' : 'Expand'}
                </Button>
                {!isOverlayMode && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMinimize();
                    }}
                    className="text-sm hover:bg-orange-100 text-slate-600"
                  >
                    Reset
                  </Button>
                )}
              </>
            )}
            <Button variant="ghost" size="sm" className="text-lg text-slate-800">
              {(isExpanded || isOverlayMode) ? '−' : '+'}
            </Button>
          </div>
        </div>

      {(isExpanded || isOverlayMode) && (
        <div className={`p-6 transition-all duration-500 ease-in-out ${
          isOverlayMode ? 'h-full flex flex-col' : 'animate-in slide-in-from-top-2'
        }`}>
          {messages.length === 0 ? (
            <div className="space-y-4 mb-6">
              <p className="text-base text-slate-600 mb-4">
                Ask me about {leagueName} stats! Here are some suggestions:
              </p>

              <div className="space-y-3">
                {suggestedQuestions.map((question, index) => (
                  <div key={index} className="flex gap-2 items-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="flex-1 text-base text-slate-700">
                      {question}
                    </div>
                    <Button
                      onClick={() => handleSendMessage(question)}
                      disabled={isLoading}
                      size="sm"
                      className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 flex-shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={`space-y-8 overflow-y-auto mb-6 p-6 bg-slate-50 rounded-lg ${
              isOverlayMode ? 'flex-1 max-h-none' : 'max-h-[400px]'
            }`}>
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
                    
                    {message.type === 'bot' && (
                      <div className="mt-3 space-y-2">
                        {/* Navigation Buttons */}
                        {message.navigationButtons && message.navigationButtons.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {message.navigationButtons.map((button, index) => (
                              <Button
                                key={index}
                                onClick={() => {
                                  if (button.type === 'player') {
                                    setLocation(`/player/${button.id}`);
                                  } else if (button.type === 'team') {
                                    setLocation(`/team/${button.id}`);
                                  }
                                }}
                                variant="outline"
                                size="sm"
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 hover:border-blue-300"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                {button.label}
                              </Button>
                            ))}
                          </div>
                        )}

                        {/* Suggestion Buttons */}
                        {message.suggestions && message.suggestions.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {message.suggestions.map((suggestion, index) => (
                              <button
                                key={index}
                                onClick={() => handleSendMessage(suggestion)}
                                className="px-3 py-2 text-sm bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg transition-colors border border-orange-200 hover:border-orange-300 font-medium"
                                disabled={isLoading}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Always show follow-up suggestions for bot messages */}
                        {message.type === 'bot' && (!message.suggestions || message.suggestions.length === 0) && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            <button
                              onClick={() => handleSendMessage("Tell me more")}
                              className="px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors border border-gray-200 hover:border-gray-300"
                              disabled={isLoading}
                            >
                              Tell me more
                            </button>
                            <button
                              onClick={() => handleSendMessage("Show me stats")}
                              className="px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors border border-gray-200 hover:border-gray-300"
                              disabled={isLoading}
                            >
                              Show me stats
                            </button>
                          </div>
                        )}
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

          {/* Input Area - Always visible when expanded */}
          <div className={`flex gap-3 pt-4 border-t border-gray-200 ${isOverlayMode ? 'flex-shrink-0' : ''}`}>
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask about stats, games, players..."
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              onFocus={() => {
                setIsActivelyUsed(true);
                setIsExpanded(true);
              }}
              className={`text-base py-4 px-4 transition-all duration-300 border-2 ${
                isOverlayMode ? 'text-lg py-5' : ''
              } ${
                isActivelyUsed || isExpanded ? 'border-orange-300 ring-2 ring-orange-100' : 'border-gray-300'
              }`}
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              size="default"
              className={`bg-orange-500 hover:bg-orange-600 text-white px-6 py-4 ${isOverlayMode ? 'px-8 py-5' : ''}`}
            >
              <Send className={`w-4 h-4 ${isOverlayMode ? 'w-5 h-5' : ''}`} />
            </Button>
          </div>
        </div>
      )}

      {/* Close button for overlay mode */}
      {isOverlayMode && (
        <button
          onClick={() => setIsOverlayMode(false)}
          className="fixed top-6 right-6 z-60 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-lg font-bold transition-colors"
        >
          ×
        </button>
      )}
    </div>
    </>
  );
}