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
    "Who are the top scorers in this league?",
    "Show me the latest game results",
    "What are the current standings?",
    "Who leads in rebounds this season?",
    "Give me team performance stats"
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
      // Query Supabase based on user question
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
    const lowerQuestion = question.toLowerCase();
    
    try {
      // Determine what data to fetch based on the question
      if (lowerQuestion.includes('top scorer') || lowerQuestion.includes('leading scorer') || lowerQuestion.includes('points')) {
        const { data: players } = await supabase
          .from('game_player_stats')
          .select('name, points, team')
          .eq('league_id', leagueId)
          .order('points', { ascending: false })
          .limit(5);

        if (players && players.length > 0) {
          const topScorers = players.map((p, i) => `${i + 1}. ${p.name} (${p.team}) - ${p.points} pts`).join('\n');
          return `🏀 **Top Scorers in ${leagueName}:**\n\n${topScorers}`;
        }
      }

      if (lowerQuestion.includes('rebounds') || lowerQuestion.includes('rebound')) {
        const { data: players } = await supabase
          .from('game_player_stats')
          .select('name, rebounds_total, team')
          .eq('league_id', leagueId)
          .order('rebounds_total', { ascending: false })
          .limit(5);

        if (players && players.length > 0) {
          const topRebounders = players.map((p, i) => `${i + 1}. ${p.name} (${p.team}) - ${p.rebounds_total} reb`).join('\n');
          return `🏀 **Top Rebounders in ${leagueName}:**\n\n${topRebounders}`;
        }
      }

      if (lowerQuestion.includes('assists') || lowerQuestion.includes('playmaker')) {
        const { data: players } = await supabase
          .from('game_player_stats')
          .select('name, assists, team')
          .eq('league_id', leagueId)
          .order('assists', { ascending: false })
          .limit(5);

        if (players && players.length > 0) {
          const topAssists = players.map((p, i) => `${i + 1}. ${p.name} (${p.team}) - ${p.assists} ast`).join('\n');
          return `🏀 **Top Playmakers in ${leagueName}:**\n\n${topAssists}`;
        }
      }

      if (lowerQuestion.includes('game') || lowerQuestion.includes('result') || lowerQuestion.includes('recent')) {
        const { data: games } = await supabase
          .from('games')
          .select('game_date, home_team, away_team, home_score, away_score')
          .eq('league_id', leagueId)
          .order('game_date', { ascending: false })
          .limit(5);

        if (games && games.length > 0) {
          const recentGames = games.map(g => 
            `${g.home_team} ${g.home_score} - ${g.away_score} ${g.away_team} (${new Date(g.game_date).toLocaleDateString()})`
          ).join('\n');
          return `🏀 **Recent Games in ${leagueName}:**\n\n${recentGames}`;
        }
      }

      if (lowerQuestion.includes('standing') || lowerQuestion.includes('ranking') || lowerQuestion.includes('team performance')) {
        const { data: teams } = await supabase
          .from('teams')
          .select('name, wins, losses')
          .eq('league_id', leagueId)
          .order('wins', { ascending: false })
          .limit(8);

        if (teams && teams.length > 0) {
          const standings = teams.map((t, i) => 
            `${i + 1}. ${t.name} (${t.wins}-${t.losses})`
          ).join('\n');
          return `🏀 **Current Standings in ${leagueName}:**\n\n${standings}`;
        }
      }

      // Default response if no specific data found
      return `I can help you with information about ${leagueName}! Try asking about:
      
• Top scorers and player stats
• Recent game results
• Team standings
• Rebounds and assists leaders
• Player performance data

What would you like to know?`;

    } catch (error) {
      console.error('Error querying league data:', error);
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
              <li>• Top scorers and player stats</li>
              <li>• Recent game results</li>
              <li>• Team standings</li>
              <li>• Performance analytics</li>
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
        className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-yellow-50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-slate-800">League Assistant</h3>
          <span className="px-2 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-xs rounded-full font-medium">
            PREMIUM
          </span>
        </div>
        <Button variant="ghost" size="sm">
          {isExpanded ? '−' : '+'}
        </Button>
      </div>

      {isExpanded && (
        <div className="p-4">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-3">
                Ask me anything about {leagueName}! Here are some suggestions:
              </p>
              
              <div className="space-y-2">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestedQuestion(question)}
                    className="w-full text-left p-2 text-sm bg-orange-50 hover:bg-orange-100 rounded-lg text-slate-700 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.type === 'bot' && (
                    <Bot className="w-6 h-6 text-orange-500 mt-1 flex-shrink-0" />
                  )}
                  <div
                    className={`max-w-[80%] p-3 rounded-lg text-sm ${
                      message.type === 'user'
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-slate-800'
                    }`}
                  >
                    <div className="whitespace-pre-line">{message.content}</div>
                    <div className={`text-xs mt-1 ${
                      message.type === 'user' ? 'text-orange-100' : 'text-slate-500'
                    }`}>
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                  {message.type === 'user' && (
                    <User className="w-6 h-6 text-slate-400 mt-1 flex-shrink-0" />
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <Bot className="w-6 h-6 text-orange-500 mt-1 flex-shrink-0" />
                  <div className="bg-gray-100 text-slate-800 p-3 rounded-lg text-sm">
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

          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask about stats, games, players..."
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              className="text-sm"
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}