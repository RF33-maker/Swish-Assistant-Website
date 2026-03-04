import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Lock, User, Bot, TrendingUp, BarChart3, Users, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { useLocation } from 'wouter';
import { getPythonBackendUrl } from '@/lib/backendUrl';

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
  leagueSlug?: string;
  onResponseReceived?: (response: string) => void;
  isPanelMode?: boolean;
}

export default function LeagueChatbot({ leagueId, leagueName, leagueSlug, onResponseReceived, isPanelMode = false }: LeagueChatbotProps) {
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

  const suggestedQuestions = [
    "Who are the top 3 teams right now?",
    "Who does Jaron Thames play for?",
    "Who is the best rebounding team right now?",
    "Who are the most efficient players in the league?",
    "Show me the top scorers this month"
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
      // ── Step 1: Fetch real league data from Supabase ──────────────────
      const [playersDataResult, gamesDataResult] = await Promise.all([
        supabase
          .from('player_stats')
          .select('id, name, spoints, srebounds_total, sassists, ssteals, sblocks, team, player_id, players:player_id(slug)')
          .eq('league_id', leagueId)
          .order('spoints', { ascending: false })
          .limit(30),
        supabase
          .from('games')
          .select('game_date, home_team, away_team, home_score, away_score')
          .eq('league_id', leagueId)
          .order('game_date', { ascending: false })
          .limit(20)
      ]);

      const playersData = (playersDataResult.data || []) as any[];
      const gamesData = (gamesDataResult.data || []) as any[];

      // ── Helper: fuzzy player name match ───────────────────────────────
      const findPlayer = (searchName: string) => {
        const s = searchName.toLowerCase().trim();
        return playersData.find(p => {
          const n = p.name.toLowerCase();
          if (n.includes(s) || s.includes(n)) return true;
          const sw = s.split(' ');
          const pw = n.split(' ');
          return sw.some((w: string) => pw.some((pw2: string) => pw2.includes(w) || w.includes(pw2)));
        });
      };

      // ── Helper: compute standings from games ──────────────────────────
      const computeStandings = () => {
        const records: Record<string, { wins: number; losses: number; pf: number; pa: number }> = {};
        gamesData.forEach(g => {
          if (!records[g.home_team]) records[g.home_team] = { wins: 0, losses: 0, pf: 0, pa: 0 };
          if (!records[g.away_team]) records[g.away_team] = { wins: 0, losses: 0, pf: 0, pa: 0 };
          records[g.home_team].pf += g.home_score;
          records[g.home_team].pa += g.away_score;
          records[g.away_team].pf += g.away_score;
          records[g.away_team].pa += g.home_score;
          if (g.home_score > g.away_score) {
            records[g.home_team].wins++;
            records[g.away_team].losses++;
          } else {
            records[g.away_team].wins++;
            records[g.home_team].losses++;
          }
        });
        return Object.entries(records).sort((a, b) => {
          const aPct = a[1].wins / Math.max(1, a[1].wins + a[1].losses);
          const bPct = b[1].wins / Math.max(1, b[1].wins + b[1].losses);
          return bPct - aPct;
        });
      };

      const playerSlug = (p: any) =>
        (Array.isArray(p.players) ? p.players[0]?.slug : p.players?.slug) || p.player_id || p.id;

      // ── Step 2: Intent detection ───────────────────────────────────────
      const q = question.toLowerCase();

      const is = (keywords: string[]) => keywords.some(k => q.includes(k));

      // ── STANDINGS / BEST TEAM ──────────────────────────────────────────
      if (is(['standing', 'best team', 'top team', 'win-loss', 'win loss', 'who leads the league',
               'league leader', 'team rank', 'which team is first', 'which team is best',
               'who is winning', 'table', 'league table'])) {
        const standings = computeStandings();
        if (standings.length > 0) {
          const rows = standings.map(([team, r], i) => {
            const gp = r.wins + r.losses;
            const pct = gp > 0 ? ((r.wins / gp) * 100).toFixed(0) : '0';
            return `${i + 1}. ${team} — ${r.wins}-${r.losses} (${pct}%)`;
          }).join('\n');
          const [leader] = standings[0];
          return {
            content: `${leagueName} Standings:\n\n${rows}\n\nTry asking:\n• "Who are ${leader}'s top players?"\n• "Top scorers in the league"`,
            suggestions: [`Who are ${leader}'s top players?`, 'Top scorers in the league', 'Recent game results'],
            navigationButtons: [{ label: `${leader}'s Record`, id: leader, type: 'team' as const }]
          };
        }
      }

      // ── RECENT RESULTS ─────────────────────────────────────────────────
      if (is(['recent game', 'last game', 'latest game', 'recent result', 'latest result',
               'game result', 'what happened', 'scores', 'game score', 'last match',
               'recent match', 'show me games', 'show games'])) {
        if (gamesData.length > 0) {
          const rows = gamesData.slice(0, 8).map(g => {
            const date = g.game_date ? new Date(g.game_date).toLocaleDateString() : 'TBD';
            const winner = g.home_score > g.away_score ? g.home_team : g.away_team;
            return `${g.home_team} ${g.home_score} – ${g.away_score} ${g.away_team} (${date}) ✓ ${winner}`;
          }).join('\n');
          return {
            content: `Recent Results in ${leagueName}:\n\n${rows}\n\nTry asking:\n• "Who are the top scorers?"\n• "Show me the standings"`,
            suggestions: ['Who are the top scorers?', 'Show me the standings', 'Top rebounders']
          };
        }
      }

      // ── TOP SCORERS ────────────────────────────────────────────────────
      if (is(['top scorer', 'top scorers', 'leading scorer', 'leading scorers', 'most points',
               'who scores the most', 'point leader', 'points leader', 'scoring leader',
               'scoring leaders', 'who leads in points', 'highest scorer', 'best scorer'])) {
        const sorted = [...playersData].sort((a, b) => (b.spoints ?? 0) - (a.spoints ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p, i) => `${i + 1}. ${p.name} (${p.team}) — ${p.spoints ?? 0} pts`).join('\n');
          const top = sorted[0];
          return {
            content: `Scoring Leaders in ${leagueName}:\n\n${rows}\n\nTry asking:\n• "How is ${top.name} performing?"\n• "Top rebounders"`,
            suggestions: [`How is ${top.name} performing?`, 'Top rebounders', 'Show me the standings'],
            navigationButtons: [{ label: `${top.name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
      }

      // ── TOP REBOUNDERS ─────────────────────────────────────────────────
      if (is(['top rebounder', 'top rebounders', 'rebound leader', 'rebounding leader',
               'most rebounds', 'who grabs the most', 'who rebounds', 'board leader',
               'best rebounder', 'leading rebounder', 'who leads in rebounds'])) {
        const sorted = [...playersData].sort((a, b) => (b.srebounds_total ?? 0) - (a.srebounds_total ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p, i) => `${i + 1}. ${p.name} (${p.team}) — ${p.srebounds_total ?? 0} reb`).join('\n');
          const top = sorted[0];
          return {
            content: `Rebounding Leaders in ${leagueName}:\n\n${rows}\n\nTry asking:\n• "How is ${top.name} performing?"\n• "Top scorers"`,
            suggestions: [`How is ${top.name} performing?`, 'Top scorers', 'Top assisters'],
            navigationButtons: [{ label: `${top.name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
      }

      // ── TOP ASSISTERS ──────────────────────────────────────────────────
      if (is(['top assist', 'assist leader', 'most assists', 'who dishes', 'who passes the most',
               'playmaker', 'best passer', 'leading assister', 'assist king', 'who leads in assists'])) {
        const sorted = [...playersData].sort((a, b) => (b.sassists ?? 0) - (a.sassists ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p, i) => `${i + 1}. ${p.name} (${p.team}) — ${p.sassists ?? 0} ast`).join('\n');
          const top = sorted[0];
          return {
            content: `Assist Leaders in ${leagueName}:\n\n${rows}\n\nTry asking:\n• "How is ${top.name} performing?"\n• "Top scorers"`,
            suggestions: [`How is ${top.name} performing?`, 'Top scorers', 'Top rebounders'],
            navigationButtons: [{ label: `${top.name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
      }

      // ── TOP STEALERS ───────────────────────────────────────────────────
      if (is(['top steal', 'steal leader', 'most steals', 'who steals the most', 'defensive leader',
               'best defender', 'who leads in steals', 'steals leader'])) {
        const sorted = [...playersData].sort((a, b) => (b.ssteals ?? 0) - (a.ssteals ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p, i) => `${i + 1}. ${p.name} (${p.team}) — ${p.ssteals ?? 0} stl`).join('\n');
          const top = sorted[0];
          return {
            content: `Steal Leaders in ${leagueName}:\n\n${rows}\n\nTry asking:\n• "How is ${top.name} performing?"\n• "Top blockers"`,
            suggestions: [`How is ${top.name} performing?`, 'Top blockers', 'Top scorers'],
            navigationButtons: [{ label: `${top.name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
      }

      // ── TOP BLOCKERS ───────────────────────────────────────────────────
      if (is(['top block', 'block leader', 'most blocks', 'who blocks the most', 'shot blocker',
               'who leads in blocks', 'blocks leader', 'best shot blocker'])) {
        const sorted = [...playersData].sort((a, b) => (b.sblocks ?? 0) - (a.sblocks ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p, i) => `${i + 1}. ${p.name} (${p.team}) — ${p.sblocks ?? 0} blk`).join('\n');
          const top = sorted[0];
          return {
            content: `Block Leaders in ${leagueName}:\n\n${rows}\n\nTry asking:\n• "How is ${top.name} performing?"\n• "Top stealers"`,
            suggestions: [`How is ${top.name} performing?`, 'Top stealers', 'Top scorers'],
            navigationButtons: [{ label: `${top.name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
      }

      // ── EFFICIENCY / BEST OVERALL ──────────────────────────────────────
      if (is(['most efficient', 'most productive', 'best overall', 'best player',
               'who is the best', 'top performer', 'mvp', 'all-around'])) {
        const sorted = [...playersData].map(p => ({
          ...p,
          eff: (p.spoints ?? 0) + (p.srebounds_total ?? 0) + (p.sassists ?? 0) + (p.ssteals ?? 0) + (p.sblocks ?? 0)
        })).sort((a, b) => b.eff - a.eff).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p, i) => `${i + 1}. ${p.name} (${p.team}) — ${p.eff} total production (${p.spoints ?? 0}pts / ${p.srebounds_total ?? 0}reb / ${p.sassists ?? 0}ast)`).join('\n');
          const top = sorted[0];
          return {
            content: `Most Efficient Players in ${leagueName}:\n(Points + Rebounds + Assists + Steals + Blocks)\n\n${rows}\n\nTry asking:\n• "How is ${top.name} performing?"\n• "Top scorers"`,
            suggestions: [`How is ${top.name} performing?`, 'Top scorers', 'Top rebounders'],
            navigationButtons: [{ label: `${top.name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
      }

      // ── PLAYER TEAM LOOKUP ─────────────────────────────────────────────
      const teamLookupMatch =
        q.match(/who does (.+?) play/) ||
        q.match(/what team (?:is|does) (.+?) (?:on|play)/) ||
        q.match(/(.+?)'s team/) ||
        q.match(/which team (?:is|does) (.+?) (?:on|play)/);
      if (teamLookupMatch) {
        const name = teamLookupMatch[1].trim();
        const player = findPlayer(name);
        if (player) {
          return {
            content: `${player.name} plays for ${player.team}.`,
            suggestions: [`How is ${player.name} performing?`, `Who are ${player.team}'s top players?`],
            navigationButtons: [{ label: `${player.name}'s Profile`, id: playerSlug(player), type: 'player' as const }]
          };
        }
        const sample = playersData.slice(0, 5).map((p: any) => `• ${p.name} (${p.team})`).join('\n');
        return {
          content: `I couldn't find a player named "${name}" in ${leagueName}.\n\nHere are some players in the league:\n${sample}`,
          suggestions: playersData.slice(0, 3).map((p: any) => `How is ${p.name} performing?`)
        };
      }

      // ── PLAYER STATS LOOKUP ────────────────────────────────────────────
      const statsMatch =
        q.match(/how is (.+?) (?:doing|performing|playing)/) ||
        q.match(/stats (?:for|of) (.+)/) ||
        q.match(/tell me about (.+)/) ||
        q.match(/(.+?)'s stats/) ||
        q.match(/show me (.+?)'s performance/) ||
        q.match(/how has (.+?) been/);
      if (statsMatch) {
        const name = statsMatch[1].trim();
        const player = findPlayer(name);
        if (player) {
          const pts = player.spoints ?? 0;
          const reb = player.srebounds_total ?? 0;
          const ast = player.sassists ?? 0;
          const stl = player.ssteals ?? 0;
          const blk = player.sblocks ?? 0;
          const badge = pts >= 30 ? 'Strong scorer who can put up big numbers!'
            : reb >= 15 ? 'Dominant presence in the paint!'
            : ast >= 10 ? 'Elite playmaker with great court vision!'
            : stl >= 5 ? 'Disruptive defender who creates turnovers!'
            : 'Well-rounded contributor on both ends!';
          return {
            content: `${player.name} — ${player.team}\n\nSeason Totals:\n• Points: ${pts}\n• Rebounds: ${reb}\n• Assists: ${ast}\n• Steals: ${stl}\n• Blocks: ${blk}\n\n${badge}`,
            suggestions: [`Who are ${player.team}'s top players?`, 'Top scorers in the league', 'Show me the standings'],
            navigationButtons: [{ label: `${player.name}'s Profile`, id: playerSlug(player), type: 'player' as const }]
          };
        }
        const sample = playersData.slice(0, 5).map((p: any) => `• ${p.name} (${p.team})`).join('\n');
        return {
          content: `I couldn't find a player named "${name}" in ${leagueName}.\n\nHere are some players in the league:\n${sample}`,
          suggestions: playersData.slice(0, 3).map((p: any) => `How is ${p.name} performing?`)
        };
      }

      // ── Step 3: AI fallback for open-ended questions ───────────────────
      const topPlayers = [...playersData]
        .slice(0, 15)
        .map((p: any) => `${p.name} (${p.team}): ${p.spoints ?? 0} pts, ${p.srebounds_total ?? 0} reb, ${p.sassists ?? 0} ast, ${p.ssteals ?? 0} stl, ${p.sblocks ?? 0} blk`)
        .join('\n');
      const recentGames = gamesData.slice(0, 8)
        .map((g: any) => `${g.home_team} ${g.home_score}–${g.away_score} ${g.away_team} (${g.game_date})`)
        .join('\n');
      const leagueDataContext = `League: ${leagueName}\n\nTOP PLAYERS:\n${topPlayers || 'None'}\n\nRECENT RESULTS:\n${recentGames || 'None'}`;

      try {
        const BASE = getPythonBackendUrl();
        const response = await fetch(`${BASE}/api/chat/league`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, league_id: leagueId, league_data: leagueDataContext }),
          signal: AbortSignal.timeout(15000)
        });
        if (response.ok) {
          const data = await response.json();
          if (data.response || data.answer) {
            return {
              content: data.response || data.answer,
              suggestions: data.suggestions || [],
              navigationButtons: data.navigation_buttons || []
            };
          }
        }
      } catch (backendError) {
        console.error('Backend request failed:', backendError);
      }

      // ── Final fallback: league snapshot ───────────────────────────────
      if (playersData.length > 0) {
        const top = playersData[0];
        const teamCount = new Set(playersData.map((p: any) => p.team)).size;
        return {
          content: `Here's a snapshot of ${leagueName}:\n\n• Top Scorer: ${top.name} (${top.team}) — ${top.spoints ?? 0} pts\n• Active Teams: ${teamCount}\n• Recent Games Logged: ${gamesData.length}\n\nTry asking:\n• "Top scorers"\n• "Top rebounders"\n• "Show me the standings"\n• "How is [player name] performing?"`,
          suggestions: ['Top scorers', 'Top rebounders', 'Show me the standings'],
          navigationButtons: [{ label: `${top.name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
        };
      }

      return `I can help you explore ${leagueName}! Try asking "top scorers", "top rebounders", "standings", or "how is [player name] performing?"`;

    } catch (error) {
      console.error('Error in queryLeagueData:', error);
      return "I'm having trouble accessing league data right now. Please try again in a moment.";
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
            COMING SOON
          </span>
        </div>

        <div className="text-center py-6">
          <MessageCircle className="w-12 h-12 text-orange-400 mx-auto mb-3" />
          <h4 className="font-medium text-slate-800 mb-2">Coming Soon</h4>
          <p className="text-sm text-slate-600 mb-4">
            Get instant insights about {leagueName} - player stats, game results, and more!
          </p>

          <div className="bg-orange-50 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-orange-700 mb-2">
              <BarChart3 className="w-4 h-4" />
              <span className="font-medium">What you'll be able to ask:</span>
            </div>
            <ul className="text-xs text-orange-600 space-y-1">
              <li>• Top scorers and rebounders</li>
              <li>• Recent game results</li>
              <li>• Team standings</li>
              <li>• Player performance stats</li>
            </ul>
          </div>

          <div className="text-xs text-slate-500 italic">
            This feature is currently in development and will be available soon!
          </div>
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

                    {/* Navigation buttons - Player profile links */}
                    {message.type === 'bot' && message.navigationButtons && message.navigationButtons.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {message.navigationButtons.map((button, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              if (button.type === 'player') {
                                setLocation(`/player/${button.id}`);
                              } else if (button.type === 'team') {
                                setLocation(leagueSlug ? `/league/${leagueSlug}/team/${button.id}` : `/team/${button.id}`);
                              }
                            }}
                            className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors border border-blue-200 flex items-center gap-1"
                          >
                            <User className="w-3 h-3" />
                            {button.label}
                            <ExternalLink className="w-2 h-2" />
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
      {/* Overlay backdrop - render to document body */}
      {isOverlayMode && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-[9998]"
          onClick={() => setIsOverlayMode(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}

      {/* Main chatbot container */}
      <div className={`bg-white rounded-xl border border-orange-200 overflow-hidden transition-all duration-500 ease-in-out ${
        isOverlayMode 
          ? 'fixed z-[9999] shadow-2xl' 
          : isActivelyUsed || isExpanded
            ? 'relative shadow-lg transform scale-[1.02]'
            : 'relative shadow-sm'
      }`}
      style={isOverlayMode ? {
        position: 'fixed',
        top: '1rem',
        left: '1rem',
        right: '1rem',
        bottom: '1rem',
        maxWidth: '80rem',
        margin: '0 auto',
        zIndex: 9999
      } : {}}>
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
                {!isPanelMode && (
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
                )}
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
                                    setLocation(leagueSlug ? `/league/${leagueSlug}/team/${button.id}` : `/team/${button.id}`);
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