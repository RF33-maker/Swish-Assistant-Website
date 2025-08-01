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
}

interface LeagueChatbotProps {
  leagueId: string;
  leagueName: string;
}

export default function LeagueChatbot({ leagueId, leagueName }: LeagueChatbotProps) {
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
        content: response,
        timestamp: new Date()
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
  };

  const queryLeagueData = async (question: string, leagueId: string): Promise<string> => {
    try {
      const lowerQuestion = question.toLowerCase();
      
      // Gather comprehensive league data for OpenAI context
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

      console.log('League data retrieved for OpenAI:', { 
        players: playersData.data?.length, 
        games: gamesData.data?.length 
      });

      console.log('Players query result:', playersData);
      console.log('Games query result:', gamesData);

      if (playersData.error) {
        console.error('Players query error:', playersData.error);
      }
      if (gamesData.error) {
        console.error('Games query error:', gamesData.error);
      }

      // Prepare context data for OpenAI
      let contextData = `League: ${leagueName}\n\n`;
      
      if (playersData.data && playersData.data.length > 0) {
        contextData += "PLAYER STATISTICS:\n";
        playersData.data.forEach(p => {
          contextData += `${p.name} (${p.team}): ${p.points} pts, ${p.rebounds_total} reb, ${p.assists} ast, ${p.steals} stl, ${p.blocks} blk\n`;
        });
        contextData += "\n";
      }

      if (gamesData.data && gamesData.data.length > 0) {
        contextData += "RECENT GAMES:\n";
        gamesData.data.forEach(g => {
          const date = new Date(g.game_date).toLocaleDateString();
          contextData += `${g.home_team} ${g.home_score} - ${g.away_score} ${g.away_team} (${date})\n`;
        });
        contextData += "\n";
        
        // Calculate team records for context
        const teamRecords = new Map();
        gamesData.data.forEach(g => {
          [g.home_team, g.away_team].forEach(team => {
            if (!teamRecords.has(team)) {
              teamRecords.set(team, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
            }
          });
          
          if (g.home_score > g.away_score) {
            teamRecords.get(g.home_team).wins++;
            teamRecords.get(g.away_team).losses++;
          } else {
            teamRecords.get(g.away_team).wins++;
            teamRecords.get(g.home_team).losses++;
          }
          
          teamRecords.get(g.home_team).pointsFor += g.home_score;
          teamRecords.get(g.home_team).pointsAgainst += g.away_score;
          teamRecords.get(g.away_team).pointsFor += g.away_score;
          teamRecords.get(g.away_team).pointsAgainst += g.home_score;
        });
        
        if (teamRecords.size > 0) {
          contextData += "TEAM RECORDS:\n";
          Array.from(teamRecords.entries())
            .sort(([,a], [,b]) => {
              const aWinPct = a.wins / (a.wins + a.losses);
              const bWinPct = b.wins / (b.wins + b.losses);
              return bWinPct - aWinPct;
            })
            .forEach(([team, record]) => {
              const winPct = ((record.wins / (record.wins + record.losses)) * 100).toFixed(1);
              const avgFor = (record.pointsFor / (record.wins + record.losses)).toFixed(1);
              const avgAgainst = (record.pointsAgainst / (record.wins + record.losses)).toFixed(1);
              contextData += `${team}: ${record.wins}-${record.losses} (${winPct}%), ${avgFor} ppg for, ${avgAgainst} ppg against\n`;
            });
          contextData += "\n";
        }
      }

      console.log('Context prepared, generating intelligent response...');
      console.log('Question:', question);
      console.log('Lower question:', lowerQuestion);
      console.log('Players data available:', !!playersData.data, playersData.data?.length);
      console.log('Games data available:', !!gamesData.data, gamesData.data?.length);

      // Player team lookup questions
      if ((lowerQuestion.includes('who does') || lowerQuestion.includes('what team') || lowerQuestion.includes('play for') || lowerQuestion.includes('plays for')) && playersData.data) {
        // Extract player name from various question formats
        const teamQuestionPatterns = [
          /who does ([\w\s]+?) play for/,
          /what team (?:does|is) ([\w\s]+?) (?:play for|on|with)/,
          /([\w\s]+?) plays? for (?:what|which) team/,
          /where does ([\w\s]+?) play/
        ];
        
        let playerName = '';
        for (const pattern of teamQuestionPatterns) {
          const match = lowerQuestion.match(pattern);
          if (match) {
            playerName = match[1].trim();
            break;
          }
        }
        
        if (playerName) {
          const player = playersData.data.find(p => 
            p.name.toLowerCase().includes(playerName) || 
            playerName.includes(p.name.toLowerCase().split(' ')[0]) ||
            p.name.toLowerCase().split(' ')[0] === playerName.split(' ')[0]
          );
          
          if (player) {
            return `${player.name} plays for ${player.team}.\n\n💡 Want to know more? Try asking:\n• "How is ${player.name} doing?"\n• "Who are ${player.team}'s top players?"`;
          } else {
            return `I couldn't find a player named "${playerName}" in ${leagueName}. Try asking about one of these players:\n\n${playersData.data.slice(0, 5).map(p => `• ${p.name} (${p.team})`).join('\n')}`;
          }
        }
      }

      // Player performance questions  
      if (lowerQuestion.includes('how') && (lowerQuestion.includes('doing') || lowerQuestion.includes('performing'))) {
        // Extract player name from question
        const playerNameMatch = lowerQuestion.match(/how (?:is|are) ([\w\s]+?) (?:doing|performing)/);
        if (playerNameMatch && playersData.data) {
          const searchName = playerNameMatch[1].trim();
          const player = playersData.data.find(p => 
            p.name.toLowerCase().includes(searchName) || 
            searchName.includes(p.name.toLowerCase().split(' ')[0]) ||
            p.name.toLowerCase().split(' ')[0] === searchName.split(' ')[0]
          );
          
          if (player) {
            return `${player.name} is having a solid season with ${player.team}!\n\nSeason totals: ${player.points} pts, ${player.rebounds_total} reb, ${player.assists} ast, ${player.steals} stl, ${player.blocks} blk\n\n${player.points >= 30 ? '🔥 Strong scorer who can put up big numbers!' : player.rebounds_total >= 15 ? '💪 Solid presence in the paint with good rebounding!' : player.assists >= 10 ? '🎯 Great court vision and playmaking ability!' : '⚡ Well-rounded contributor on both ends!'}\n\n💡 Want to compare? Try asking:\n• "Who are the most efficient players?"\n• "Who does ${player.team} play next?"`;
          }
        }
      }

      if (lowerQuestion.includes('best team') || lowerQuestion.includes('top team')) {
        if (gamesData.data && gamesData.data.length > 0) {
          const teamRecords = new Map();
          gamesData.data.forEach(g => {
            [g.home_team, g.away_team].forEach(team => {
              if (!teamRecords.has(team)) {
                teamRecords.set(team, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
              }
            });
            
            if (g.home_score > g.away_score) {
              teamRecords.get(g.home_team).wins++;
              teamRecords.get(g.away_team).losses++;
            } else {
              teamRecords.get(g.away_team).wins++;
              teamRecords.get(g.home_team).losses++;
            }
            
            teamRecords.get(g.home_team).pointsFor += g.home_score;
            teamRecords.get(g.home_team).pointsAgainst += g.away_score;
            teamRecords.get(g.away_team).pointsFor += g.away_score;
            teamRecords.get(g.away_team).pointsAgainst += g.home_score;
          });

          const bestTeam = Array.from(teamRecords.entries())
            .sort(([,a], [,b]) => {
              const aWinPct = a.wins / (a.wins + a.losses);
              const bWinPct = b.wins / (b.wins + b.losses);
              return bWinPct - aWinPct;
            })[0];

          if (bestTeam) {
            const [teamName, record] = bestTeam;
            const winPct = ((record.wins / (record.wins + record.losses)) * 100).toFixed(1);
            const avgFor = (record.pointsFor / (record.wins + record.losses)).toFixed(1);
            const avgAgainst = (record.pointsAgainst / (record.wins + record.losses)).toFixed(1);
            
            return `${teamName} is the top team in ${leagueName}.\n\nRecord: ${record.wins}-${record.losses} (${winPct}% win rate)\nAveraging ${avgFor} points per game\nAllowing ${avgAgainst} points per game\n\n💡 Want to know more? Try asking:\n• "Who are ${teamName}'s top players?"\n• "Show me recent games"`;
          }
        }
      }

      if (lowerQuestion.includes('efficient') || lowerQuestion.includes('efficiency')) {
        if (playersData.data && playersData.data.length > 0) {
          const efficiencyPlayers = playersData.data
            .map(p => {
              const efficiency = p.points + p.rebounds_total + p.assists + p.steals + p.blocks;
              return { ...p, efficiency: efficiency.toFixed(1) };
            })
            .sort((a, b) => parseFloat(b.efficiency) - parseFloat(a.efficiency))
            .slice(0, 5);

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
        <div className="p-5">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <p className="text-base text-slate-600 mb-4">
                Ask me about {leagueName} stats! Here are some suggestions:
              </p>
              
              <div className="space-y-3">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestedQuestion(question)}
                    className="w-full text-left p-3 text-base bg-orange-50 hover:bg-orange-100 rounded-lg text-slate-700 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.type === 'bot' && (
                    <Bot className="w-7 h-7 text-orange-500 mt-1 flex-shrink-0" />
                  )}
                  <div
                    className={`max-w-[80%] p-4 rounded-lg text-base ${
                      message.type === 'user'
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-slate-800'
                    }`}
                  >
                    <div className="whitespace-pre-line">{message.content}</div>
                    <div className={`text-sm mt-2 ${
                      message.type === 'user' ? 'text-orange-100' : 'text-slate-500'
                    }`}>
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                  {message.type === 'user' && (
                    <User className="w-7 h-7 text-slate-400 mt-1 flex-shrink-0" />
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <Bot className="w-7 h-7 text-orange-500 mt-1 flex-shrink-0" />
                  <div className="bg-gray-100 text-slate-800 p-4 rounded-lg text-base">
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

          <div className="flex gap-3">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask about stats, games, players..."
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              className="text-base py-3"
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              size="default"
              className="bg-orange-500 hover:bg-orange-600 text-white px-4"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}