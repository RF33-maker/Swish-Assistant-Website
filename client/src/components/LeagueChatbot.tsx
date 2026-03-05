import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageCircle, Send, Lock, User, Bot, TrendingUp, BarChart3, Users, ExternalLink, X } from 'lucide-react';
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
  isFloatingWidget?: boolean;
  suggestedQuestions?: string[];
}

export default function LeagueChatbot({ leagueId, leagueName, leagueSlug, onResponseReceived, isPanelMode = false, isFloatingWidget = false, suggestedQuestions: propSuggestedQuestions }: LeagueChatbotProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(isPanelMode);
  const [isOverlayMode, setIsOverlayMode] = useState(false);
  const [isActivelyUsed, setIsActivelyUsed] = useState(isPanelMode);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
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

  // Tooltip: show after 1.5s, auto-dismiss after 6s
  useEffect(() => {
    if (!isFloatingWidget || !user) return;
    const showTimer = setTimeout(() => setShowTooltip(true), 1500);
    const hideTimer = setTimeout(() => setShowTooltip(false), 7500);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [isFloatingWidget, user]);

  const suggestedQuestions = propSuggestedQuestions ?? [
    "Who are the top 3 teams right now?",
    "Who is the best rebounding team right now?",
    "Who are the most efficient players in the league?",
    "Show me the top scorers this season",
    "Which team has the best defence?"
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
      // ── Step 1: Fetch real league data from Supabase views ───────────
      const [playersDataResult, gamesDataResult, teamsDataResult] = await Promise.all([
        supabase
          .from('v_player_season_averages')
          .select('player_name, team_name, league_id, games_played, total_pts, total_reb, total_ast, total_stl, total_blk, total_tpm, total_tpa, total_fgm, total_fga, total_ftm, total_fta, season_fg_pct, season_tp_pct, season_ft_pct, avg_pts, avg_reb, avg_ast, avg_stl, avg_blk')
          .eq('league_id', leagueId)
          .order('total_pts', { ascending: false })
          .limit(100),
        supabase
          .from('games')
          .select('game_date, home_team, away_team, home_score, away_score')
          .eq('league_id', leagueId)
          .order('game_date', { ascending: false })
          .limit(30),
        supabase
          .from('v_team_season_averages')
          .select('team_name, team_id, league_id, games_played, avg_pts, avg_ast, avg_reb, avg_stl, avg_blk, avg_tov, avg_tpm, avg_tpa, season_tp_pct, avg_fgm, avg_fga, season_fg_pct, avg_ftm, avg_fta, avg_pitp, avg_fastbreak_pts')
          .eq('league_id', leagueId)
          .order('avg_pts', { ascending: false })
      ]);

      const playersData = (playersDataResult.data || []) as any[];
      const gamesData = (gamesDataResult.data || []) as any[];
      const teamsData = (teamsDataResult.data || []) as any[];
      // Derive unique team names from player data for team scanning
      const uniqueTeamNames = [...new Set(playersData.map((p: any) => p.team_name).filter(Boolean))] as string[];

      // ── Helper: fuzzy player name match ───────────────────────────────
      const findPlayer = (searchName: string) => {
        const s = searchName.toLowerCase().trim();
        return playersData.find((p: any) => {
          const n = (p.player_name || '').toLowerCase();
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
        p.player_name?.toLowerCase().replace(/\s+/g, '-') || 'player';

      // ── Step 2: Intent detection ───────────────────────────────────────
      // Normalize apostrophes/quotes so "3's" (curly) matches "3's" (straight)
      const q = question.toLowerCase()
        .replace(/[\u2018\u2019\u201A\u201B\u02BC]/g, "'")
        .replace(/[\u201C\u201D]/g, '"');

      const is = (keywords: string[]) => keywords.some(k => q.includes(k));

      // ── Helper: find team by name scan — defined early so all handlers can use it ──
      const findTeamInQuestion = (): { name: string } | null => {
        let best: { name: string } | null = null;
        let bestLen = 0;
        for (const tn of uniqueTeamNames) {
          const lower = tn.toLowerCase();
          if (q.includes(lower) && lower.length > bestLen) { best = { name: tn }; bestLen = lower.length; }
        }
        if (best) return best;
        for (const tn of uniqueTeamNames) {
          const parts = tn.toLowerCase().split(' ').filter((w: string) => w.length >= 4);
          if (parts.some((part: string) => q.includes(part))) return { name: tn };
        }
        return null;
      };

      // ── STANDINGS / BEST TEAM ──────────────────────────────────────────
      const topNTeamsMatch = q.match(/top\s+(\d+)\s+teams?/);
      if (topNTeamsMatch || is(['standing', 'best team', 'top team', 'top teams', 'best teams',
               'teams right now', 'teams at the top', 'who are the best teams',
               'win-loss', 'win loss', 'who leads the league',
               'league leader', 'team rank', 'which team is first', 'which team is best',
               'who is winning', 'table', 'league table'])) {
        const standings = computeStandings();
        if (standings.length > 0) {
          const displayCount = topNTeamsMatch ? parseInt(topNTeamsMatch[1]) : standings.length;
          const rows = standings.slice(0, displayCount).map(([team, r], i) => {
            const gp = r.wins + r.losses;
            const pct = gp > 0 ? ((r.wins / gp) * 100).toFixed(0) : '0';
            return `${i + 1}. **${team}** — ${r.wins}W–${r.losses}L (${pct}%)`;
          }).join('\n');
          const [leader] = standings[0];
          const title = topNTeamsMatch ? `Top ${displayCount} Teams — ${leagueName}` : `${leagueName} Standings`;
          return {
            content: `### ${title}\n\n${rows}`,
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
            const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB') : 'TBD';
            const winner = g.home_score > g.away_score ? g.home_team : g.away_team;
            return `**${g.home_team}** ${g.home_score} – ${g.away_score} **${g.away_team}** *(${date})* ✓ ${winner}`;
          }).join('\n');
          return {
            content: `### Recent Results — ${leagueName}\n\n${rows}`,
            suggestions: ['Who are the top scorers?', 'Show me the standings', 'Top rebounders']
          };
        }
      }

      // ── TOP SCORERS ────────────────────────────────────────────────────
      if (is(['top scorer', 'top scorers', 'leading scorer', 'leading scorers', 'most points',
               'who scores the most', 'point leader', 'points leader', 'scoring leader',
               'scoring leaders', 'who leads in points', 'highest scorer', 'best scorer'])) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].sort((a: any, b: any) => (b.total_pts ?? 0) - (a.total_pts ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p: any, i: number) => `${i + 1}. **${p.player_name}** *(${p.team_name})* — ${p.total_pts ?? 0} pts`).join('\n');
          const top = sorted[0];
          const title = tf ? `Scoring Leaders — ${tf.name}` : `Scoring Leaders — ${leagueName}`;
          return {
            content: `### ${title}\n\n${rows}`,
            suggestions: [`How is ${top.player_name} performing?`, 'Top rebounders', 'Show me the standings'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
        if (tf) return { content: `No scoring data found for **${tf.name}** yet.`, suggestions: ['Show me the standings', 'Top scorers in the league'] };
      }

      // ── TOP REBOUNDERS ─────────────────────────────────────────────────
      if (is(['top rebounder', 'top rebounders', 'rebound leader', 'rebounding leader',
               'most rebounds', 'who grabs the most', 'who rebounds', 'board leader',
               'best rebounder', 'leading rebounder', 'who leads in rebounds'])) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].sort((a: any, b: any) => (b.total_reb ?? 0) - (a.total_reb ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p: any, i: number) => `${i + 1}. **${p.player_name}** *(${p.team_name})* — ${p.total_reb ?? 0} reb`).join('\n');
          const top = sorted[0];
          const title = tf ? `Rebounding Leaders — ${tf.name}` : `Rebounding Leaders — ${leagueName}`;
          return {
            content: `### ${title}\n\n${rows}`,
            suggestions: [`How is ${top.player_name} performing?`, 'Top scorers', 'Top assisters'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
        if (tf) return { content: `No rebounding data found for **${tf.name}** yet.`, suggestions: ['Show me the standings', 'Top rebounders in the league'] };
      }

      // ── TOP ASSISTERS ──────────────────────────────────────────────────
      if (is(['top assist', 'assist leader', 'most assists', 'who dishes', 'who passes the most',
               'playmaker', 'best passer', 'leading assister', 'assist king', 'who leads in assists'])) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].sort((a: any, b: any) => (b.total_ast ?? 0) - (a.total_ast ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p: any, i: number) => `${i + 1}. **${p.player_name}** *(${p.team_name})* — ${p.total_ast ?? 0} ast`).join('\n');
          const top = sorted[0];
          const title = tf ? `Assist Leaders — ${tf.name}` : `Assist Leaders — ${leagueName}`;
          return {
            content: `### ${title}\n\n${rows}`,
            suggestions: [`How is ${top.player_name} performing?`, 'Top scorers', 'Top rebounders'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
        if (tf) return { content: `No assist data found for **${tf.name}** yet.`, suggestions: ['Show me the standings', 'Top assisters in the league'] };
      }

      // ── TOP STEALERS ───────────────────────────────────────────────────
      if (is(['top steal', 'steal leader', 'most steals', 'who steals the most', 'defensive leader',
               'best defender', 'who leads in steals', 'steals leader'])) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].sort((a: any, b: any) => (b.total_stl ?? 0) - (a.total_stl ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p: any, i: number) => `${i + 1}. **${p.player_name}** *(${p.team_name})* — ${p.total_stl ?? 0} stl`).join('\n');
          const top = sorted[0];
          const title = tf ? `Steal Leaders — ${tf.name}` : `Steal Leaders — ${leagueName}`;
          return {
            content: `### ${title}\n\n${rows}`,
            suggestions: [`How is ${top.player_name} performing?`, 'Top blockers', 'Top scorers'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
        if (tf) return { content: `No steal data found for **${tf.name}** yet.`, suggestions: ['Show me the standings', 'Top defenders in the league'] };
      }

      // ── TOP BLOCKERS ───────────────────────────────────────────────────
      if (is(['top block', 'block leader', 'most blocks', 'who blocks the most', 'shot blocker',
               'who leads in blocks', 'blocks leader', 'best shot blocker'])) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].sort((a: any, b: any) => (b.total_blk ?? 0) - (a.total_blk ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p: any, i: number) => `${i + 1}. **${p.player_name}** *(${p.team_name})* — ${p.total_blk ?? 0} blk`).join('\n');
          const top = sorted[0];
          const title = tf ? `Block Leaders — ${tf.name}` : `Block Leaders — ${leagueName}`;
          return {
            content: `### ${title}\n\n${rows}`,
            suggestions: [`How is ${top.player_name} performing?`, 'Top stealers', 'Top scorers'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
        if (tf) return { content: `No block data found for **${tf.name}** yet.`, suggestions: ['Show me the standings', 'Top shot blockers in the league'] };
      }

      // ── EFFICIENCY / BEST OVERALL ──────────────────────────────────────
      if (is(['most efficient', 'most productive', 'best overall', 'best player',
               'who is the best', 'top performer', 'mvp', 'all-around'])) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].map((p: any) => ({
          ...p,
          eff: (p.total_pts ?? 0) + (p.total_reb ?? 0) + (p.total_ast ?? 0) + (p.total_stl ?? 0) + (p.total_blk ?? 0)
        })).sort((a: any, b: any) => b.eff - a.eff).slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p: any, i: number) => `${i + 1}. **${p.player_name}** *(${p.team_name})* — ${p.eff} total *(${p.total_pts ?? 0}pts / ${p.total_reb ?? 0}reb / ${p.total_ast ?? 0}ast)*`).join('\n');
          const top = sorted[0];
          const title = tf ? `Most Efficient Players — ${tf.name}` : `Most Efficient Players — ${leagueName}`;
          return {
            content: `### ${title}\n*Points + Rebounds + Assists + Steals + Blocks*\n\n${rows}`,
            suggestions: [`How is ${top.player_name} performing?`, 'Top scorers', 'Top rebounders'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
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
            content: `**${player.player_name}** plays for **${player.team_name}**.`,
            suggestions: [`How is ${player.player_name} performing?`, `Who are ${player.team_name}'s top players?`],
            navigationButtons: [{ label: `${player.player_name}'s Profile`, id: playerSlug(player), type: 'player' as const }]
          };
        }
        const sample = playersData.slice(0, 5).map((p: any) => `• ${p.player_name} (${p.team_name})`).join('\n');
        return {
          content: `I couldn't find a player named "${name}" in ${leagueName}.\n\nHere are some players in the league:\n${sample}`,
          suggestions: playersData.slice(0, 3).map((p: any) => `How is ${p.player_name} performing?`)
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

        // Check team first — avoids mistaking "How has [Team] been performing?" as a player query
        const teamFromStats = findTeamInQuestion();
        if (teamFromStats) {
          const teamStats = teamsData.find((t: any) => t.team_name?.toLowerCase() === teamFromStats.name.toLowerCase());
          const teamPlayers = [...playersData]
            .filter((p: any) => p.team_name?.toLowerCase() === teamFromStats.name.toLowerCase())
            .sort((a: any, b: any) => (b.total_pts ?? 0) - (a.total_pts ?? 0))
            .slice(0, 5);
          const playerRows = teamPlayers.map((p: any, i: number) => `${i + 1}. **${p.player_name}** — ${p.total_pts ?? 0}pts · ${p.total_reb ?? 0}reb · ${p.total_ast ?? 0}ast`).join('\n');
          const standings = computeStandings();
          const teamStanding = standings.findIndex(([t]) => t.toLowerCase() === teamFromStats.name.toLowerCase());
          const standingText = teamStanding >= 0 ? `*League Position: #${teamStanding + 1}*` : '';
          let seasonStatsBlock = '';
          if (teamStats) {
            const fg = teamStats.season_fg_pct != null ? `${Number(teamStats.season_fg_pct).toFixed(1)}%` : 'N/A';
            const tp = teamStats.season_tp_pct != null ? `${Number(teamStats.season_tp_pct).toFixed(1)}%` : 'N/A';
            seasonStatsBlock = `\n\n**Season Averages** *(${teamStats.games_played ?? '?'} games)*\n- **Points:** ${teamStats.avg_pts != null ? Number(teamStats.avg_pts).toFixed(1) : 'N/A'} ppg\n- **Rebounds:** ${teamStats.avg_reb != null ? Number(teamStats.avg_reb).toFixed(1) : 'N/A'} rpg\n- **Assists:** ${teamStats.avg_ast != null ? Number(teamStats.avg_ast).toFixed(1) : 'N/A'} apg\n- **3-Pointers:** ${teamStats.avg_tpm != null ? Number(teamStats.avg_tpm).toFixed(1) : 'N/A'}/game · 3PT%: ${tp}\n- **FG%:** ${fg} · Pts in Paint: ${teamStats.avg_pitp != null ? Number(teamStats.avg_pitp).toFixed(1) : 'N/A'} ppg`;
          }
          return {
            content: `### ${teamFromStats.name}\n${standingText}${seasonStatsBlock}\n\n**Top Players**\n${playerRows || 'No player data available'}`,
            suggestions: [`Who are the top scorers for ${teamFromStats.name}?`, `What are ${teamFromStats.name}'s advanced stats?`, 'Show me the standings']
          };
        }

        const player = findPlayer(name);
        if (player) {
          const pts = player.total_pts ?? 0;
          const reb = player.total_reb ?? 0;
          const ast = player.total_ast ?? 0;
          const stl = player.total_stl ?? 0;
          const blk = player.total_blk ?? 0;
          const fgm = player.total_fgm ?? 0;
          const fga = player.total_fga ?? 0;
          const tpm = player.total_tpm ?? 0;
          const tpa = player.total_tpa ?? 0;
          const ftm = player.total_ftm ?? 0;
          const fta = player.total_fta ?? 0;
          const fgPct = player.season_fg_pct != null ? `${player.season_fg_pct.toFixed(1)}` : (fga > 0 ? ((fgm/fga)*100).toFixed(1) : 'N/A');
          const tpPct = player.season_tp_pct != null ? `${player.season_tp_pct.toFixed(1)}` : (tpa > 0 ? ((tpm/tpa)*100).toFixed(1) : 'N/A');
          const ftPct = player.season_ft_pct != null ? `${player.season_ft_pct.toFixed(1)}` : (fta > 0 ? ((ftm/fta)*100).toFixed(1) : 'N/A');
          const badge = pts >= 200 ? 'Strong scorer who can put up big numbers!'
            : reb >= 100 ? 'Dominant presence in the paint!'
            : ast >= 60 ? 'Elite playmaker with great court vision!'
            : stl >= 30 ? 'Disruptive defender who creates turnovers!'
            : 'Well-rounded contributor on both ends!';
          return {
            content: `### ${player.player_name}\n*${player.team_name} · ${player.games_played ?? '?'} games*\n\n**Season Totals**\n- **Points:** ${pts}\n- **Rebounds:** ${reb}\n- **Assists:** ${ast}\n- **Steals:** ${stl}\n- **Blocks:** ${blk}\n\n**Shooting**\n- **FG:** ${fgm}/${fga} (${fgPct}%)\n- **3PT:** ${tpm}/${tpa} (${tpPct}%)\n- **FT:** ${ftm}/${fta} (${ftPct}%)\n\n*${badge}*`,
            suggestions: [`Who are ${player.team_name}'s top players?`, 'Top scorers in the league', 'Show me the standings'],
            navigationButtons: [{ label: `${player.player_name}'s Profile`, id: playerSlug(player), type: 'player' as const }]
          };
        }
        const sample = playersData.slice(0, 5).map((p: any) => `• ${p.player_name} (${p.team_name})`).join('\n');
        return {
          content: `I couldn't find a player named "${name}" in ${leagueName}.\n\nHere are some players in the league:\n${sample}`,
          suggestions: playersData.slice(0, 3).map((p: any) => `How is ${p.player_name} performing?`)
        };
      }

      // ── STAT MAP with companion stats ──────────────────────────────────
      interface StatDef {
        keywords: string[];
        column: string;
        label: string;
        companions?: { column?: string; label: string; compute?: (p: any) => string }[];
      }
      const STAT_MAP: StatDef[] = [
        {
          keywords: ["three pointer", "three-pointer", "3-pointer", "3 pointer", "three's", "3's", "3s", "threes", "triple", "from three", "from the three", "from deep", "beyond the arc"],
          column: 'total_tpm', label: '3-Pointers Made',
          companions: [
            { column: 'total_tpa', label: '3-Pointers Attempted' },
            { label: '3-Point %', compute: (p: any) => p.season_tp_pct != null ? `${Number(p.season_tp_pct).toFixed(1)}%` : (p.total_tpa > 0 ? ((p.total_tpm/p.total_tpa)*100).toFixed(1)+'%' : 'N/A') }
          ]
        },
        {
          keywords: ['field goal', 'fg', 'shooting', 'from the field', 'shot'],
          column: 'total_fgm', label: 'Field Goals Made',
          companions: [
            { column: 'total_fga', label: 'Field Goals Attempted' },
            { label: 'FG %', compute: (p: any) => p.season_fg_pct != null ? `${Number(p.season_fg_pct).toFixed(1)}%` : (p.total_fga > 0 ? ((p.total_fgm/p.total_fga)*100).toFixed(1)+'%' : 'N/A') }
          ]
        },
        {
          keywords: ['free throw', 'ft', 'foul shot', 'from the line'],
          column: 'total_ftm', label: 'Free Throws Made',
          companions: [
            { column: 'total_fta', label: 'Free Throws Attempted' },
            { label: 'FT %', compute: (p: any) => p.season_ft_pct != null ? `${Number(p.season_ft_pct).toFixed(1)}%` : (p.total_fta > 0 ? ((p.total_ftm/p.total_fta)*100).toFixed(1)+'%' : 'N/A') }
          ]
        },
        { keywords: ['point', 'score', 'scoring', 'pts'], column: 'total_pts', label: 'Points' },
        { keywords: ['rebound', 'board', 'glass'], column: 'total_reb', label: 'Rebounds' },
        { keywords: ['assist', 'dish', 'pass'], column: 'total_ast', label: 'Assists' },
        { keywords: ['steal'], column: 'total_stl', label: 'Steals' },
        { keywords: ['block', 'blk'], column: 'total_blk', label: 'Blocks' },
      ];

      const detectStat = (): StatDef | null => {
        for (const stat of STAT_MAP) {
          if (stat.keywords.some(k => q.includes(k))) return stat;
        }
        return null;
      };

      // ── Helper: find player by scanning whole question ─────────────────
      const findPlayerInQuestion = (): any | null => {
        for (const p of playersData) {
          const n = (p.player_name || '').toLowerCase();
          if (n && q.includes(n)) return p;
        }
        for (const p of playersData) {
          const parts = (p.player_name || '').toLowerCase().split(' ').filter((w: string) => w.length >= 4);
          if (parts.some((part: string) => q.includes(part))) return p;
        }
        return null;
      };

      // ── Helper: build stat summary line for a player row ──────────────
      const buildStatLine = (stat: StatDef, p: any): string => {
        const val = p[stat.column] ?? 0;
        let line = `${stat.label}: ${val}`;
        if (stat.companions) {
          for (const c of stat.companions) {
            if (c.compute) line += ` | ${c.label}: ${c.compute(p)}`;
            else if (c.column) line += ` | ${c.label}: ${p[c.column] ?? 0}`;
          }
        }
        return line;
      };

      // ── TEAM STAT MAP ──────────────────────────────────────────────────
      interface TeamStatDef {
        keywords: string[];
        column: string;
        label: string;
        isAdvanced?: boolean;
      }
      const TEAM_STAT_MAP: TeamStatDef[] = [
        { keywords: ['team scoring', 'team points', 'team scores the most', 'team score the most', 'highest scoring team', 'most points as a team', 'team ppg'], column: 'avg_pts', label: 'Avg Points Per Game' },
        { keywords: ['team rebounds', 'team rebound', 'best rebounding team', 'most team rebounds'], column: 'avg_reb', label: 'Avg Rebounds Per Game' },
        { keywords: ['team assists', 'team assist', 'best passing team', 'most team assists'], column: 'avg_ast', label: 'Avg Assists Per Game' },
        { keywords: ['team 3s', 'team three', 'team threes', 'team 3-pointer', 'most 3s as a team', 'team three pointer', 'most threes as a team'], column: 'avg_tpm', label: 'Avg 3-Pointers Made Per Game' },
        { keywords: ['team 3pt%', 'team three point percent', 'best three point shooting team', 'best 3pt team', 'best shooting team from three'], column: 'season_tp_pct', label: 'Team 3-Point %' },
        { keywords: ['team fg%', 'team field goal', 'best shooting team', 'team shooting percentage', 'team fg percent'], column: 'season_fg_pct', label: 'Team FG %' },
        { keywords: ['team steals', 'most team steals', 'team steal'], column: 'avg_stl', label: 'Avg Steals Per Game' },
        { keywords: ['team blocks', 'most team blocks', 'team block'], column: 'avg_blk', label: 'Avg Blocks Per Game' },
        { keywords: ['team turnovers', 'most turnovers', 'team tov', 'turnover prone'], column: 'avg_tov', label: 'Avg Turnovers Per Game' },
        { keywords: ['paint points', 'points in the paint', 'team pitp', 'inside scoring'], column: 'avg_pitp', label: 'Avg Points in the Paint Per Game' },
        { keywords: ['fast break', 'fastbreak', 'transition points', 'fast break points'], column: 'avg_fastbreak_pts', label: 'Avg Fast Break Points Per Game' },
      ];

      const detectTeamStat = (): TeamStatDef | null => {
        for (const stat of TEAM_STAT_MAP) {
          if (stat.keywords.some(k => q.includes(k))) return stat;
        }
        return null;
      };

      // ── ADVANCED STATS KEYWORDS ────────────────────────────────────────
      const isAdvancedQuery = is(['offensive rating', 'defensive rating', 'net rating', 'off rating', 'def rating',
        'efficiency rating', 'effective fg', 'efg', 'true shooting', 'ts%', 'pie', 'pace',
        'advanced stats', 'advanced stat', 'off rtg', 'def rtg', 'net rtg']);

      // ── TEAM STAT LEADERBOARD ──────────────────────────────────────────
      const detectedTeamStat = detectTeamStat();
      const isTeamLeaderboardQuery = is(['which team', 'what team', 'team that', 'best team for', 'top team for']);
      if (detectedTeamStat && teamsData.length > 0 && (isTeamLeaderboardQuery || is(['most', 'best', 'highest', 'top', 'leader'])) && !findPlayerInQuestion()) {
        const col = detectedTeamStat.column;
        const sorted = [...teamsData].sort((a: any, b: any) => (b[col] ?? 0) - (a[col] ?? 0)).slice(0, 5);
        const rows = sorted.map((t: any, i: number) => {
          const val = t[col] != null ? Number(t[col]).toFixed(1) : 'N/A';
          return `${i + 1}. ${t.team_name} — ${val}`;
        }).join('\n');
        return {
          content: `${detectedTeamStat.label} Leaders in ${leagueName}:\n\n${rows}`,
          suggestions: ['Show me the standings', 'Top scorers', `Which team scores the most?`]
        };
      }

      // ── ENTITY + STAT + "THIS SEASON" ─────────────────────────────────
      const isSeasonQuery = is(['this season', 'season total', 'all season', 'so far', 'this year', 'how many', 'how much']);
      const detectedStat = detectStat();

      // ── STAT LEADERBOARD: "top 3-point shooters", "who has made the most 3s" ──
      const isLeaderboardQuery = is(['most', 'who leads', 'who lead', 'who has the most', 'who have the most',
        'who made the most', 'top', 'leader', 'leaders', 'best', 'highest', 'ranked', 'who is best']);
      if (detectedStat && isLeaderboardQuery && !findPlayerInQuestion() && !findTeamInQuestion()) {
        const sorted = [...playersData]
          .sort((a: any, b: any) => (b[detectedStat.column] ?? 0) - (a[detectedStat.column] ?? 0))
          .slice(0, 5);
        if (sorted.length > 0) {
          const rows = sorted.map((p: any, i: number) => {
            const val = p[detectedStat.column] ?? 0;
            let extra = '';
            if (detectedStat.companions) {
              const attComp = detectedStat.companions.find(c => c.column);
              const pctComp = detectedStat.companions.find(c => c.compute);
              if (attComp?.column) {
                const att = p[attComp.column] ?? 0;
                const pct = pctComp ? pctComp.compute!(p) : '';
                extra = ` / ${att} att${pct ? ` (${pct})` : ''}`;
              }
            }
            return `${i + 1}. ${p.player_name} (${p.team_name}) — ${val} ${detectedStat.label}${extra}`;
          }).join('\n');
          const top = sorted[0];
          return {
            content: `### ${detectedStat.label} Leaders — ${leagueName}\n\n${rows}`,
            suggestions: [`How is ${top.player_name} performing?`, 'Top scorers', 'Show me the standings'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
      }

      if (isSeasonQuery && detectedStat) {
        const foundPlayer = findPlayerInQuestion();
        const foundTeam = findTeamInQuestion();

        if (foundPlayer) {
          const val = foundPlayer[detectedStat.column] ?? 0;
          let lines = [`${detectedStat.label}: ${val}`];
          if (detectedStat.companions) {
            for (const c of detectedStat.companions) {
              if (c.compute) lines.push(`${c.label}: ${c.compute(foundPlayer)}`);
              else if (c.column) lines.push(`${c.label}: ${foundPlayer[c.column] ?? 0}`);
            }
          }
          return {
            content: `### ${foundPlayer.player_name}\n*${foundPlayer.team_name}*\n\n${lines.map(l => `- **${l.split(': ')[0]}:** ${l.split(': ').slice(1).join(': ')}`).join('\n')}`,
            suggestions: [`How is ${foundPlayer.player_name} performing?`, `Who are ${foundPlayer.team_name}'s top players?`, 'Top scorers'],
            navigationButtons: [{ label: `${foundPlayer.player_name}'s Profile`, id: playerSlug(foundPlayer), type: 'player' as const }]
          };
        }

        if (foundTeam) {
          const teamPlayers = playersData.filter((p: any) => p.team_name?.toLowerCase() === foundTeam.name.toLowerCase());
          const total = teamPlayers.reduce((sum: number, p: any) => sum + (p[detectedStat.column] ?? 0), 0);
          let lines = [`${detectedStat.label}: ${total}`];
          if (detectedStat.companions) {
            for (const c of detectedStat.companions) {
              if (c.compute) {
                const attCol = detectedStat.companions.find(x => x.column)?.column;
                if (attCol) {
                  const totalAtt = teamPlayers.reduce((s: number, p: any) => s + (p[attCol] ?? 0), 0);
                  const pct = totalAtt > 0 ? ((total / totalAtt) * 100).toFixed(1) + '%' : 'N/A';
                  lines.push(`${c.label}: ${pct} (${total}/${totalAtt})`);
                }
              } else if (c.column) {
                const attTotal = teamPlayers.reduce((s: number, p: any) => s + (p[c.column!] ?? 0), 0);
                lines.push(`${c.label}: ${attTotal}`);
              }
            }
          }
          return {
            content: `### ${foundTeam.name} — Season Totals\n\n${lines.map(l => `- **${l.split(': ')[0]}:** ${l.split(': ').slice(1).join(': ')}`).join('\n')}\n\n*${teamPlayers.length} players on roster*`,
            suggestions: [`Who are ${foundTeam.name}'s top players?`, 'Top scorers', 'Show me the standings']
          };
        }
      }

      // ── ENTITY + "LAST N GAMES" ────────────────────────────────────────
      const lastNMatch = q.match(/(?:last|past|recent)\s+(\d+)\s+(?:game|match)/) ||
                         q.match(/(\d+)\s+(?:game|match)\s+(?:ago|back)/);
      const isLastGame = q.includes('last game') || q.includes('most recent game') || q.includes('latest game');
      const hasTimeScope = lastNMatch || isLastGame ||
        is(['last few games', 'past few games', 'recent games', 'recent form', 'current form', 'lately', 'recently']);

      if (hasTimeScope) {
        const limit = lastNMatch ? parseInt(lastNMatch[1]) : isLastGame ? 1 : 5;
        const foundPlayer = findPlayerInQuestion();
        const foundTeam = findTeamInQuestion();

        if (foundTeam) {
          const teamName = foundTeam.name;
          const [{ data: teamGames }, { data: teamAdvGames }] = await Promise.all([
            supabase
              .from('v_team_game_log')
              .select('game_key, game_date, pts, ast, reb, stl, blk, tov, tpm, tpa, tp_pct, fgm, fga, fg_pct, ftm, fta, ft_pct, pitp, fastbreak_pts, hometeam, awayteam, score')
              .eq('league_id', leagueId)
              .ilike('team_name', `%${teamName}%`)
              .order('game_date', { ascending: false })
              .limit(limit),
            supabase
              .from('v_team_advanced_game')
              .select('game_key, game_date, off_rating, def_rating, net_rating, efg_percent, ts_percent, pace, pie')
              .eq('league_id', leagueId)
              .ilike('team_name', `%${teamName}%`)
              .order('game_date', { ascending: false })
              .limit(limit)
          ]);

          if (teamGames && teamGames.length > 0) {
            const rows = teamGames.map((g: any) => {
              const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB') : 'Unknown';
              const isHome = (g.hometeam || '').toLowerCase().includes(teamName.toLowerCase());
              const opponent = isHome ? g.awayteam : g.hometeam;
              const scored = g.pts ?? g.score ?? 0;
              const tpPct = g.tp_pct != null ? `${Number(g.tp_pct).toFixed(0)}%` : 'N/A';
              const fgPct = g.fg_pct != null ? `${Number(g.fg_pct).toFixed(0)}%` : 'N/A';
              const adv = (teamAdvGames || []).find((a: any) => a.game_key === g.game_key);
              const advStr = adv && adv.off_rating != null
                ? `\nOffRtg: **${Number(adv.off_rating).toFixed(1)}** · DefRtg: **${Number(adv.def_rating).toFixed(1)}** · eFG%: **${Number(adv.efg_percent).toFixed(1)}%**`
                : '';
              return `**${date} vs ${opponent || '?'}**\n${scored}pts · ${g.reb ?? 0}reb · ${g.ast ?? 0}ast · ${g.stl ?? 0}stl\n3PT: ${g.tpm ?? 0}/${g.tpa ?? 0} (${tpPct}) · FG: ${g.fgm ?? 0}/${g.fga ?? 0} (${fgPct})${advStr}`;
            }).join('\n\n');
            const context = `${leagueName} — ${teamName} Last ${teamGames.length} Game(s):\n\n${rows}`;
            try {
              const BASE = getPythonBackendUrl();
              const resp = await fetch(`${BASE}/api/chat/league`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, league_id: leagueId, league_data: context }),
                signal: AbortSignal.timeout(15000)
              });
              if (resp.ok) { const d = await resp.json(); if (d.response) return { content: d.response, suggestions: d.suggestions || [] }; }
            } catch {}
            return { content: `${teamName} — Last ${teamGames.length} Game(s):\n\n${rows}`, suggestions: [`Top scorers on ${teamName}`, 'Show me the standings'] };
          }
        }

        if (foundPlayer) {
          const { data: playerGames } = await supabase
            .from('v_player_game_log')
            .select('game_date, pts, reb, ast, stl, blk, tpm, tpa, fgm, fga, fg_pct, tp_pct, hometeam, awayteam')
            .eq('league_id', leagueId)
            .ilike('player_name', `%${foundPlayer.player_name}%`)
            .order('game_date', { ascending: false })
            .limit(limit);

          if (playerGames && playerGames.length > 0) {
            const rows = playerGames.map((g: any) => {
              const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB') : 'Unknown';
              const opp = g.hometeam && g.awayteam ? g.awayteam : '';
              const fgPct = g.fg_pct != null ? `${Number(g.fg_pct).toFixed(0)}%` : 'N/A';
              const tpPct = g.tp_pct != null ? `${Number(g.tp_pct).toFixed(0)}%` : 'N/A';
              return `**${date} vs ${opp}**\n${g.pts ?? 0}pts · ${g.reb ?? 0}reb · ${g.ast ?? 0}ast · ${g.stl ?? 0}stl\n3PT: ${g.tpm ?? 0}/${g.tpa ?? 0} (${tpPct}) · FG: ${g.fgm ?? 0}/${g.fga ?? 0} (${fgPct})`;
            }).join('\n\n');
            const context = `${leagueName} — ${foundPlayer.player_name} Last ${playerGames.length} Game(s):\n\n${rows}`;
            try {
              const BASE = getPythonBackendUrl();
              const resp = await fetch(`${BASE}/api/chat/league`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, league_id: leagueId, league_data: context }),
                signal: AbortSignal.timeout(15000)
              });
              if (resp.ok) { const d = await resp.json(); if (d.response) return { content: d.response, suggestions: d.suggestions || [], navigationButtons: [{ label: `${foundPlayer.player_name}'s Profile`, id: playerSlug(foundPlayer), type: 'player' as const }] }; }
            } catch {}
            return { content: `### ${foundPlayer.player_name} — Last ${playerGames.length} Game(s)\n\n${rows}`, suggestions: [`How is ${foundPlayer.player_name} performing?`, 'Top scorers'], navigationButtons: [{ label: `${foundPlayer.player_name}'s Profile`, id: playerSlug(foundPlayer), type: 'player' as const }] };
          }
        }
      }

      // ── UNIVERSAL STAT-LINE FILTER ENGINE ─────────────────────────────
      // Parses any combination of thresholds: "20/10/10", "30pts 10reb", "60% FG", etc.
      const parseStatThresholds = (text: string) => {
        const t: { pts?: number; reb?: number; ast?: number; stl?: number; blk?: number;
                   fg_pct?: number; tp_pct?: number; ft_pct?: number; plus_minus?: number } = {};
        // Slash notation: 20/10/10 → pts/reb/ast, 30/10 → pts/reb
        const slash = text.match(/\b(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?(?:\/(\d+(?:\.\d+)?))?(?:\/\S*)?\b/);
        if (slash) {
          if (slash[1]) t.pts = parseFloat(slash[1]);
          if (slash[2]) t.reb = parseFloat(slash[2]);
          if (slash[3]) t.ast = parseFloat(slash[3]);
        }
        // Individual stat patterns (don't override slash notation values)
        const m = (re: RegExp) => { const r = text.match(re); return r ? parseFloat(r[1]) : undefined; };
        if (!t.pts) t.pts = m(/(\d+(?:\.\d+)?)\s*(?:pts?|points?|ppg)/);
        if (!t.reb) t.reb = m(/(\d+(?:\.\d+)?)\s*(?:reb(?:ounds?)?|rpg|boards?)/);
        if (!t.ast) t.ast = m(/(\d+(?:\.\d+)?)\s*(?:ass?ts?|assists?|apg|dimes?)/);
        if (!t.stl) t.stl = m(/(\d+(?:\.\d+)?)\s*(?:stls?|steals?|spg)/);
        if (!t.blk) t.blk = m(/(\d+(?:\.\d+)?)\s*(?:blks?|blocks?|bpg)/);
        const pmMatch = text.match(/\+(\d+(?:\.\d+)?)\s*(?:plus.?minus|±)?/);
        if (pmMatch) t.plus_minus = parseFloat(pmMatch[1]);
        // Percentages
        const fgMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:fg|field goal|from the field)/) ||
                        text.match(/(?:fg%?|field goal%?)\s*(?:above|over|of|at|above|:)?\s*(\d+(?:\.\d+)?)/);
        if (fgMatch) t.fg_pct = parseFloat(fgMatch[1]);
        const tpMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:3pt|three.?point|from three|from deep|from the arc)/) ||
                        text.match(/(?:3pt%?|three.?point%?)\s*(?:above|over|of|at|:)?\s*(\d+(?:\.\d+)?)/);
        if (tpMatch) t.tp_pct = parseFloat(tpMatch[1]);
        const ftMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:ft|free throw|from the line)/) ||
                        text.match(/(?:ft%?|free throw%?)\s*(?:above|over|of|at|:)?\s*(\d+(?:\.\d+)?)/);
        if (ftMatch) t.ft_pct = parseFloat(ftMatch[1]);
        // Remove undefined keys
        (Object.keys(t) as (keyof typeof t)[]).forEach(k => { if (t[k] === undefined) delete t[k]; });
        return t;
      };

      const buildFilterDesc = (t: ReturnType<typeof parseStatThresholds>): string => {
        const p: string[] = [];
        if (t.pts != null) p.push(`≥${t.pts}pts`);
        if (t.reb != null) p.push(`≥${t.reb}reb`);
        if (t.ast != null) p.push(`≥${t.ast}ast`);
        if (t.stl != null) p.push(`≥${t.stl}stl`);
        if (t.blk != null) p.push(`≥${t.blk}blk`);
        if (t.fg_pct != null) p.push(`≥${t.fg_pct}% FG`);
        if (t.tp_pct != null) p.push(`≥${t.tp_pct}% 3PT`);
        if (t.ft_pct != null) p.push(`≥${t.ft_pct}% FT`);
        if (t.plus_minus != null) p.push(`≥+${t.plus_minus} +/-`);
        return p.join(' · ');
      };

      const hasSlashNotation = /\b\d+(?:\.\d+)?\/\d+/.test(q);
      const isStatLineQuery = hasSlashNotation || is([
        'how many players', 'any player', 'which player', 'only player',
        'players with', 'players averaging', 'players who', 'players that',
        'players scoring', 'players putting up', 'players over', 'players above',
        'qualify', 'show me players', 'find players', 'list players',
        'teams with', 'teams averaging', 'team averaging', 'any team averaging',
        'which teams are', 'teams over', 'teams above'
      ]);

      if (isStatLineQuery) {
        const thresholds = parseStatThresholds(q);
        const hasThresholds = Object.keys(thresholds).length > 0;

        if (hasThresholds) {
          const isTeamScope = is(['which team', 'teams with', 'teams averaging', 'team averaging',
                                  'any team', 'what team', 'team that', 'which teams']);
          // Only use season averages when explicitly requested
          const isAveragesMode = is(['averaging', 'per game', 'per-game', 'ppg', 'rpg', 'apg',
                                     'spg', 'bpg', 'season average', 'avg', 'on average']);
          const filterDesc = buildFilterDesc(thresholds);
          const fmt = (v: number | null | undefined, dec = 1) => v != null ? Number(v).toFixed(dec) : 'N/A';

          // ── LAST N GAMES scope ────────────────────────────────────────
          const lastNScopeMatch = q.match(/(?:last|past|over\s+(?:the\s+)?last|in\s+(?:the\s+)?last)\s+(\d+)\s+(?:game|match)/);
          if (lastNScopeMatch && !isTeamScope) {
            const N = parseInt(lastNScopeMatch[1]);
            const { data: allGameLogs } = await supabase
              .from('v_player_game_log')
              .select('player_name, team_name, game_date, pts, reb, ast, stl, blk, fg_pct, tp_pct, ft_pct, plus_minus')
              .eq('league_id', leagueId)
              .order('game_date', { ascending: false })
              .limit(N * 150);

            if (allGameLogs && allGameLogs.length > 0) {
              // Group by player, take each player's last N games
              const playerMap: Record<string, any[]> = {};
              for (const row of allGameLogs as any[]) {
                if (!playerMap[row.player_name]) playerMap[row.player_name] = [];
                if (playerMap[row.player_name].length < N) playerMap[row.player_name].push(row);
              }
              const avgCol = (games: any[], col: string) => {
                const vals = games.map((g: any) => g[col]).filter((v: any) => v != null);
                return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
              };
              const playerAverages = Object.entries(playerMap)
                .filter(([, games]) => games.length >= Math.min(N, games.length))
                .map(([name, games]) => ({
                  player_name: name,
                  team_name: games[0].team_name,
                  avg_pts: avgCol(games, 'pts'),
                  avg_reb: avgCol(games, 'reb'),
                  avg_ast: avgCol(games, 'ast'),
                  avg_stl: avgCol(games, 'stl'),
                  avg_blk: avgCol(games, 'blk'),
                  avg_fg_pct: avgCol(games, 'fg_pct'),
                  avg_tp_pct: avgCol(games, 'tp_pct'),
                  avg_ft_pct: avgCol(games, 'ft_pct'),
                  avg_plus_minus: avgCol(games, 'plus_minus'),
                }));

              const matches = playerAverages.filter((p: any) => {
                if (thresholds.pts != null && (p.avg_pts ?? 0) < thresholds.pts) return false;
                if (thresholds.reb != null && (p.avg_reb ?? 0) < thresholds.reb) return false;
                if (thresholds.ast != null && (p.avg_ast ?? 0) < thresholds.ast) return false;
                if (thresholds.stl != null && (p.avg_stl ?? 0) < thresholds.stl) return false;
                if (thresholds.blk != null && (p.avg_blk ?? 0) < thresholds.blk) return false;
                if (thresholds.fg_pct != null && (p.avg_fg_pct ?? 0) < thresholds.fg_pct) return false;
                if (thresholds.tp_pct != null && (p.avg_tp_pct ?? 0) < thresholds.tp_pct) return false;
                if (thresholds.ft_pct != null && (p.avg_ft_pct ?? 0) < thresholds.ft_pct) return false;
                if (thresholds.plus_minus != null && (p.avg_plus_minus ?? 0) < thresholds.plus_minus) return false;
                return true;
              });

              const buildLastNRow = (p: any, i: number) => {
                const stats: string[] = [];
                if (thresholds.pts != null) stats.push(`${fmt(p.avg_pts)}pts`);
                if (thresholds.reb != null) stats.push(`${fmt(p.avg_reb)}reb`);
                if (thresholds.ast != null) stats.push(`${fmt(p.avg_ast)}ast`);
                if (thresholds.stl != null) stats.push(`${fmt(p.avg_stl)}stl`);
                if (thresholds.blk != null) stats.push(`${fmt(p.avg_blk)}blk`);
                if (thresholds.fg_pct != null) stats.push(`${fmt(p.avg_fg_pct)}% FG`);
                if (thresholds.tp_pct != null) stats.push(`${fmt(p.avg_tp_pct)}% 3PT`);
                if (thresholds.ft_pct != null) stats.push(`${fmt(p.avg_ft_pct)}% FT`);
                return `${i + 1}. **${p.player_name}** *(${p.team_name})* — ${stats.join(' · ')}`;
              };

              if (matches.length === 0) {
                const primaryCol = thresholds.pts != null ? 'avg_pts' : thresholds.reb != null ? 'avg_reb' : 'avg_ast';
                const closest = [...playerAverages].sort((a: any, b: any) => (b[primaryCol] ?? 0) - (a[primaryCol] ?? 0)).slice(0, 3);
                return {
                  content: `### No Matches — Last ${N} Games\n*Filter: ${filterDesc}*\n\nNo players averaged this stat line over their last ${N} games.\n\n**Closest players:**\n${closest.map(buildLastNRow).join('\n')}`,
                  suggestions: ['Top scorers', 'Top rebounders', 'Show me the standings']
                };
              }

              const sorted = [...matches].sort((a: any, b: any) => (b.avg_pts ?? 0) - (a.avg_pts ?? 0));
              const header = `### Last ${N} Games — ${filterDesc}\n*${matches.length} player${matches.length === 1 ? '' : 's'} qualify*\n\n`;
              if (matches.length === 1) {
                const p = sorted[0];
                const statLine = [
                  thresholds.pts != null ? `${fmt(p.avg_pts)}pts` : null,
                  thresholds.reb != null ? `${fmt(p.avg_reb)}reb` : null,
                  thresholds.ast != null ? `${fmt(p.avg_ast)}ast` : null,
                  thresholds.fg_pct != null ? `${fmt(p.avg_fg_pct)}% FG` : null,
                  thresholds.tp_pct != null ? `${fmt(p.avg_tp_pct)}% 3PT` : null,
                ].filter(Boolean).join('/');
                return {
                  content: `${header}**${p.player_name}** is the only player to average ${statLine} over the last ${N} games *(${p.team_name})*`,
                  suggestions: [`How is ${p.player_name} performing?`, 'Top scorers', 'Show me the standings'],
                  navigationButtons: [{ label: `${p.player_name}'s Profile`, id: playerSlug({ player_name: p.player_name }), type: 'player' as const }]
                };
              }
              return {
                content: `${header}${sorted.map(buildLastNRow).join('\n')}`,
                suggestions: ['Top scorers', 'Show me the standings', 'Top rebounders']
              };
            }
          }

          // ── TEAM SCOPE (season averages) ──────────────────────────────
          if (isTeamScope && teamsData.length > 0) {
            const matches = teamsData.filter((t: any) => {
              if (thresholds.pts != null && (t.avg_pts ?? 0) < thresholds.pts) return false;
              if (thresholds.reb != null && (t.avg_reb ?? 0) < thresholds.reb) return false;
              if (thresholds.ast != null && (t.avg_ast ?? 0) < thresholds.ast) return false;
              if (thresholds.stl != null && (t.avg_stl ?? 0) < thresholds.stl) return false;
              if (thresholds.blk != null && (t.avg_blk ?? 0) < thresholds.blk) return false;
              if (thresholds.fg_pct != null && (t.season_fg_pct ?? 0) < thresholds.fg_pct) return false;
              if (thresholds.tp_pct != null && (t.season_tp_pct ?? 0) < thresholds.tp_pct) return false;
              return true;
            });
            const buildTeamRow = (t: any, i: number) => {
              const stats: string[] = [];
              if (thresholds.pts != null) stats.push(`${fmt(t.avg_pts)}pts`);
              if (thresholds.reb != null) stats.push(`${fmt(t.avg_reb)}reb`);
              if (thresholds.ast != null) stats.push(`${fmt(t.avg_ast)}ast`);
              if (thresholds.stl != null) stats.push(`${fmt(t.avg_stl)}stl`);
              if (thresholds.fg_pct != null) stats.push(`${fmt(t.season_fg_pct)}% FG`);
              if (thresholds.tp_pct != null) stats.push(`${fmt(t.season_tp_pct)}% 3PT`);
              return `${i + 1}. **${t.team_name}** — ${stats.join(' · ')}`;
            };
            if (matches.length === 0) {
              const closest = [...teamsData].sort((a: any, b: any) => (b.avg_pts ?? 0) - (a.avg_pts ?? 0)).slice(0, 3);
              return {
                content: `### No Teams Match — *Filter: ${filterDesc}*\n\nNo teams average this stat line this season.\n\n**Closest teams:**\n${closest.map(buildTeamRow).join('\n')}`,
                suggestions: ['Show me the standings', 'Which team scores the most?', 'Top scorers']
              };
            }
            const sorted = [...matches].sort((a: any, b: any) => (b.avg_pts ?? 0) - (a.avg_pts ?? 0));
            return {
              content: `### Teams Matching: ${filterDesc}\n*${matches.length} team${matches.length === 1 ? '' : 's'} qualify — season per-game averages*\n\n${sorted.map(buildTeamRow).join('\n')}`,
              suggestions: ['Show me the standings', 'Top scorers', 'Which team scores the most?']
            };
          }

          // ── SEASON AVERAGES scope (explicit: "averaging", "per game", "ppg") ──
          if (isAveragesMode && !isTeamScope) {
            const matches = playersData.filter((p: any) => {
              if (thresholds.pts != null && (p.avg_pts ?? 0) < thresholds.pts) return false;
              if (thresholds.reb != null && (p.avg_reb ?? 0) < thresholds.reb) return false;
              if (thresholds.ast != null && (p.avg_ast ?? 0) < thresholds.ast) return false;
              if (thresholds.stl != null && (p.avg_stl ?? 0) < thresholds.stl) return false;
              if (thresholds.blk != null && (p.avg_blk ?? 0) < thresholds.blk) return false;
              if (thresholds.fg_pct != null && (p.season_fg_pct ?? 0) < thresholds.fg_pct) return false;
              if (thresholds.tp_pct != null && (p.season_tp_pct ?? 0) < thresholds.tp_pct) return false;
              if (thresholds.ft_pct != null && (p.season_ft_pct ?? 0) < thresholds.ft_pct) return false;
              return true;
            });
            const buildAvgRow = (p: any, i: number) => {
              const stats: string[] = [];
              if (thresholds.pts != null) stats.push(`${fmt(p.avg_pts)}pts`);
              if (thresholds.reb != null) stats.push(`${fmt(p.avg_reb)}reb`);
              if (thresholds.ast != null) stats.push(`${fmt(p.avg_ast)}ast`);
              if (thresholds.stl != null) stats.push(`${fmt(p.avg_stl)}stl`);
              if (thresholds.blk != null) stats.push(`${fmt(p.avg_blk)}blk`);
              if (thresholds.fg_pct != null) stats.push(`${fmt(p.season_fg_pct)}% FG`);
              if (thresholds.tp_pct != null) stats.push(`${fmt(p.season_tp_pct)}% 3PT`);
              if (thresholds.ft_pct != null) stats.push(`${fmt(p.season_ft_pct)}% FT`);
              return `${i + 1}. **${p.player_name}** *(${p.team_name})* — ${stats.join(' · ')}`;
            };
            if (matches.length === 0) {
              const primaryCol = thresholds.pts != null ? 'avg_pts' : thresholds.reb != null ? 'avg_reb' : 'avg_ast';
              const closest = [...playersData].sort((a: any, b: any) => (b[primaryCol] ?? 0) - (a[primaryCol] ?? 0)).slice(0, 3);
              return {
                content: `### No Players Match — *Season Averages · ${filterDesc}*\n\nNo players average this stat line per game this season.\n\n**Closest players:**\n${closest.map(buildAvgRow).join('\n')}`,
                suggestions: ['Top scorers', 'Top rebounders', 'Show me the standings']
              };
            }
            const sorted = [...matches].sort((a: any, b: any) => (b.avg_pts ?? 0) - (a.avg_pts ?? 0));
            const header = `### Season Averages — ${filterDesc}\n*${matches.length} player${matches.length === 1 ? '' : 's'} qualify*\n\n`;
            if (matches.length === 1) {
              const p = sorted[0];
              const statLine = [
                thresholds.pts != null ? `${fmt(p.avg_pts)}pts` : null,
                thresholds.reb != null ? `${fmt(p.avg_reb)}reb` : null,
                thresholds.ast != null ? `${fmt(p.avg_ast)}ast` : null,
                thresholds.fg_pct != null ? `${fmt(p.season_fg_pct)}% FG` : null,
                thresholds.tp_pct != null ? `${fmt(p.season_tp_pct)}% 3PT` : null,
              ].filter(Boolean).join('/');
              return {
                content: `${header}**${p.player_name}** is the only player averaging ${statLine} this season *(${p.team_name})*`,
                suggestions: [`How is ${p.player_name} performing?`, 'Top scorers', 'Show me the standings'],
                navigationButtons: [{ label: `${p.player_name}'s Profile`, id: playerSlug(p), type: 'player' as const }]
              };
            }
            return {
              content: `${header}${sorted.map(buildAvgRow).join('\n')}`,
              suggestions: [`How is ${sorted[0].player_name} performing?`, 'Top scorers', 'Show me the standings'],
              navigationButtons: [{ label: `${sorted[0].player_name}'s Profile`, id: playerSlug(sorted[0]), type: 'player' as const }]
            };
          }

          // ── SINGLE-GAME scope (default) — individual game performances ──
          // Query game log with server-side filters, group by player, count occurrences
          if (!isTeamScope) {
            let gameQuery = supabase
              .from('v_player_game_log')
              .select('player_name, team_name, game_date, pts, reb, ast, stl, blk, fg_pct, tp_pct, hometeam, awayteam')
              .eq('league_id', leagueId)
              .order('pts', { ascending: false })
              .limit(500);
            if (thresholds.pts != null) gameQuery = gameQuery.gte('pts', thresholds.pts);
            if (thresholds.reb != null) gameQuery = gameQuery.gte('reb', thresholds.reb);
            if (thresholds.ast != null) gameQuery = gameQuery.gte('ast', thresholds.ast);
            if (thresholds.stl != null) gameQuery = gameQuery.gte('stl', thresholds.stl);
            if (thresholds.blk != null) gameQuery = gameQuery.gte('blk', thresholds.blk);
            if (thresholds.fg_pct != null) gameQuery = gameQuery.gte('fg_pct', thresholds.fg_pct);
            if (thresholds.tp_pct != null) gameQuery = gameQuery.gte('tp_pct', thresholds.tp_pct);

            const { data: gameRows } = await gameQuery;

            if (gameRows) {
              // Group by player
              const playerGameMap: Record<string, { team_name: string; games: any[] }> = {};
              for (const g of gameRows as any[]) {
                if (!playerGameMap[g.player_name]) playerGameMap[g.player_name] = { team_name: g.team_name, games: [] };
                playerGameMap[g.player_name].games.push(g);
              }

              const totalGames = gameRows.length;

              if (totalGames === 0) {
                // Show closest single-game performances as fallback
                const { data: closestRows } = await supabase
                  .from('v_player_game_log')
                  .select('player_name, team_name, game_date, pts, reb, ast, fg_pct, hometeam, awayteam')
                  .eq('league_id', leagueId)
                  .order(thresholds.pts != null ? 'pts' : thresholds.reb != null ? 'reb' : 'ast', { ascending: false })
                  .limit(3);
                const closestStr = (closestRows || []).map((g: any, i: number) => {
                  const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?';
                  const opp = g.hometeam && g.awayteam ? (g.hometeam === g.team_name ? g.awayteam : g.hometeam) : '?';
                  return `${i + 1}. **${g.player_name}** *(${g.team_name})* — ${g.pts}pts · ${g.reb}reb · ${g.ast}ast · ${g.fg_pct != null ? g.fg_pct + '% FG' : ''} vs ${opp} (${date})`;
                }).join('\n');
                return {
                  content: `### No Games Match — *${filterDesc}*\n\nNo single-game performances hit this stat line this season.\n\n**Closest performances:**\n${closestStr}`,
                  suggestions: ['Top scorers', 'Top rebounders', 'Show me the standings']
                };
              }

              // Build player rows showing each qualifying game
              const playerEntries = Object.entries(playerGameMap).sort((a, b) => b[1].games.length - a[1].games.length || (b[1].games[0]?.pts ?? 0) - (a[1].games[0]?.pts ?? 0));
              const playerCount = playerEntries.length;

              const buildGameDetail = (g: any) => {
                const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?';
                const opp = g.hometeam && g.awayteam ? (g.hometeam === g.team_name ? g.awayteam : g.hometeam) : '?';
                const stats: string[] = [`${g.pts}pts`, `${g.reb}reb`, `${g.ast}ast`];
                if (thresholds.stl != null) stats.push(`${g.stl}stl`);
                if (thresholds.blk != null) stats.push(`${g.blk}blk`);
                if (thresholds.fg_pct != null) stats.push(`${g.fg_pct}% FG`);
                if (thresholds.tp_pct != null) stats.push(`${g.tp_pct != null ? Number(g.tp_pct).toFixed(0) : '?'}% 3PT`);
                return `  - ${date} vs ${opp} — ${stats.join(' · ')}`;
              };

              const rows = playerEntries.map(([name, { team_name, games }], i) => {
                const gameLines = games.map(buildGameDetail).join('\n');
                const countLabel = games.length === 1 ? '1 game' : `${games.length} games`;
                return `${i + 1}. **${name}** *(${team_name})* — ${countLabel}\n${gameLines}`;
              }).join('\n\n');

              const totalLabel = totalGames === 1 ? '1 game' : `${totalGames} games`;
              const playerLabel = playerCount === 1 ? '1 player' : `${playerCount} players`;

              if (totalGames === 1) {
                const [name, { team_name, games }] = playerEntries[0];
                const g = games[0];
                const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?';
                const opp = g.hometeam && g.awayteam ? (g.hometeam === g.team_name ? g.awayteam : g.hometeam) : '?';
                return {
                  content: `### Only 1 Game Matches: ${filterDesc}\n\n**${name}** *(${team_name})* has the only ${filterDesc} performance this season — **${g.pts}pts · ${g.reb}reb · ${g.ast}ast** vs ${opp} on ${date}`,
                  suggestions: [`How is ${name} performing?`, 'Top scorers', 'Show me the standings'],
                  navigationButtons: [{ label: `${name}'s Profile`, id: playerSlug({ player_name: name }), type: 'player' as const }]
                };
              }

              return {
                content: `### ${totalLabel} this season match: ${filterDesc}\n*${playerLabel} with qualifying game(s)*\n\n${rows}`,
                suggestions: playerEntries.length > 0 ? [`How is ${playerEntries[0][0]} performing?`, 'Top scorers', 'Show me the standings'] : ['Top scorers', 'Show me the standings']
              };
            }
          }
        }
      }

      // ── NAME SCAN FALLBACK: any question containing a player name ──────
      const scannedPlayer = findPlayerInQuestion();
      if (scannedPlayer) {
        const p = scannedPlayer;
        const pts = p.total_pts ?? 0;
        const reb = p.total_reb ?? 0;
        const ast = p.total_ast ?? 0;
        const stl = p.total_stl ?? 0;
        const blk = p.total_blk ?? 0;
        const fgm = p.total_fgm ?? 0;
        const fga = p.total_fga ?? 0;
        const tpm = p.total_tpm ?? 0;
        const tpa = p.total_tpa ?? 0;
        const ftm = p.total_ftm ?? 0;
        const fta = p.total_fta ?? 0;
        const fgPct = p.season_fg_pct != null ? Number(p.season_fg_pct).toFixed(1) : (fga > 0 ? ((fgm/fga)*100).toFixed(1) : 'N/A');
        const tpPct = p.season_tp_pct != null ? Number(p.season_tp_pct).toFixed(1) : (tpa > 0 ? ((tpm/tpa)*100).toFixed(1) : 'N/A');
        const ftPct = p.season_ft_pct != null ? Number(p.season_ft_pct).toFixed(1) : (fta > 0 ? ((ftm/fta)*100).toFixed(1) : 'N/A');
        return {
          content: `### ${p.player_name}\n*${p.team_name} · ${p.games_played ?? '?'} games*\n\n**Season Totals**\n- **Points:** ${pts}\n- **Rebounds:** ${reb}\n- **Assists:** ${ast}\n- **Steals:** ${stl}\n- **Blocks:** ${blk}\n\n**Shooting**\n- **FG:** ${fgm}/${fga} (${fgPct}%)\n- **3PT:** ${tpm}/${tpa} (${tpPct}%)\n- **FT:** ${ftm}/${fta} (${ftPct}%)`,
          suggestions: [`How is ${p.player_name} performing?`, `Who are ${p.team_name}'s top players?`, 'Top scorers'],
          navigationButtons: [{ label: `${p.player_name}'s Profile`, id: playerSlug(p), type: 'player' as const }]
        };
      }

      // ── ADVANCED STATS FOR A SPECIFIC TEAM ────────────────────────────
      if (isAdvancedQuery) {
        const foundTeam = findTeamInQuestion();
        if (foundTeam) {
          const teamName = foundTeam.name;
          const { data: advGames } = await supabase
            .from('v_team_advanced_game')
            .select('off_rating, def_rating, net_rating, pace, efg_percent, ts_percent, pie, tov_percent, oreb_percent, dreb_percent, ast_percent')
            .eq('league_id', leagueId)
            .ilike('team_name', `%${teamName}%`);

          if (advGames && advGames.length > 0) {
            const avg = (col: string) => {
              const vals = advGames.map((g: any) => g[col]).filter((v: any) => v != null);
              return vals.length > 0 ? (vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : null;
            };
            const fmt = (v: number | null, dec = 1) => v != null ? v.toFixed(dec) : 'N/A';
            const offRtg = avg('off_rating');
            const defRtg = avg('def_rating');
            const netRtg = offRtg != null && defRtg != null ? offRtg - defRtg : null;
            const teamSeasonStats = teamsData.find((t: any) => t.team_name?.toLowerCase() === teamName.toLowerCase());
            const seasonLine = teamSeasonStats ? `\nGames Played: ${teamSeasonStats.games_played ?? '?'} | Avg Pts: ${fmt(teamSeasonStats.avg_pts)} | FG%: ${fmt(teamSeasonStats.season_fg_pct)}% | 3PT%: ${fmt(teamSeasonStats.season_tp_pct)}%` : '';
            return {
              content: `### ${teamName} — Advanced Stats\n*Season averages over ${advGames.length} games*${teamSeasonStats ? `\nGP: ${teamSeasonStats.games_played ?? '?'} · Avg Pts: ${fmt(teamSeasonStats.avg_pts)} · FG%: ${fmt(teamSeasonStats.season_fg_pct)}% · 3PT%: ${fmt(teamSeasonStats.season_tp_pct)}%` : ''}\n\n**Ratings**\n- **OFF RTG:** ${fmt(offRtg)}\n- **DEF RTG:** ${fmt(defRtg)}\n- **NET RTG:** ${netRtg != null ? (netRtg >= 0 ? '+' : '') + fmt(netRtg) : 'N/A'}\n- **Pace:** ${fmt(avg('pace'))}\n\n**Efficiency**\n- **eFG%:** ${fmt(avg('efg_percent'))}%\n- **TS%:** ${fmt(avg('ts_percent'))}%\n- **PIE:** ${fmt(avg('pie'))}%\n\n**Other**\n- **TOV%:** ${fmt(avg('tov_percent'))}%\n- **OREB%:** ${fmt(avg('oreb_percent'))}%\n- **AST%:** ${fmt(avg('ast_percent'))}%`,
              suggestions: [`Last 5 games for ${teamName}`, `Who are ${teamName}'s top players?`, 'Show me the standings']
            };
          }
        }
      }

      // ── TEAM NAME SCAN FALLBACK ────────────────────────────────────────
      const scannedTeam = findTeamInQuestion();
      if (scannedTeam) {
        const teamStats = teamsData.find((t: any) =>
          t.team_name?.toLowerCase() === scannedTeam.name.toLowerCase()
        );
        const teamPlayers = [...playersData]
          .filter((p: any) => p.team_name?.toLowerCase() === scannedTeam.name.toLowerCase())
          .sort((a: any, b: any) => (b.total_pts ?? 0) - (a.total_pts ?? 0))
          .slice(0, 5);
        const playerRows = teamPlayers.map((p: any, i: number) => `${i+1}. **${p.player_name}** — ${p.total_pts ?? 0}pts · ${p.total_reb ?? 0}reb · ${p.total_ast ?? 0}ast`).join('\n');
        const standings = computeStandings();
        const teamStanding = standings.findIndex(([t]) => t.toLowerCase() === scannedTeam.name.toLowerCase());
        const standingText = teamStanding >= 0 ? `*League Position: #${teamStanding + 1}*` : '';

        let seasonStatsBlock = '';
        if (teamStats) {
          const fg = teamStats.season_fg_pct != null ? `${Number(teamStats.season_fg_pct).toFixed(1)}%` : 'N/A';
          const tp = teamStats.season_tp_pct != null ? `${Number(teamStats.season_tp_pct).toFixed(1)}%` : 'N/A';
          seasonStatsBlock = `\n\n**Season Averages** *(${teamStats.games_played ?? '?'} games)*\n- **Points:** ${teamStats.avg_pts != null ? Number(teamStats.avg_pts).toFixed(1) : 'N/A'} ppg\n- **Rebounds:** ${teamStats.avg_reb != null ? Number(teamStats.avg_reb).toFixed(1) : 'N/A'} rpg\n- **Assists:** ${teamStats.avg_ast != null ? Number(teamStats.avg_ast).toFixed(1) : 'N/A'} apg\n- **3-Pointers:** ${teamStats.avg_tpm != null ? Number(teamStats.avg_tpm).toFixed(1) : 'N/A'}/game · 3PT%: ${tp}\n- **FG%:** ${fg} · Pts in Paint: ${teamStats.avg_pitp != null ? Number(teamStats.avg_pitp).toFixed(1) : 'N/A'} ppg`;
        }

        return {
          content: `### ${scannedTeam.name}\n${standingText}${seasonStatsBlock}\n\n**Top Players**\n${playerRows || 'No player data available'}`,
          suggestions: [`Last 5 games for ${scannedTeam.name}`, `What are ${scannedTeam.name}'s advanced stats?`, 'Show me the standings']
        };
      }

      // ── Step 3: AI fallback for open-ended questions ───────────────────
      const topPlayers = [...playersData]
        .slice(0, 15)
        .map((p: any) => {
          const fgPct = p.season_fg_pct != null ? `${Number(p.season_fg_pct).toFixed(1)}%` : 'N/A';
          const tpPct = p.season_tp_pct != null ? `${Number(p.season_tp_pct).toFixed(1)}%` : 'N/A';
          const ftPct = p.season_ft_pct != null ? `${Number(p.season_ft_pct).toFixed(1)}%` : 'N/A';
          return `${p.player_name} (${p.team_name}): ${p.total_pts ?? 0}pts, ${p.total_reb ?? 0}reb, ${p.total_ast ?? 0}ast, ${p.total_stl ?? 0}stl, ${p.total_blk ?? 0}blk | 3PT: ${p.total_tpm ?? 0}/${p.total_tpa ?? 0} (${tpPct}) | FG: ${p.total_fgm ?? 0}/${p.total_fga ?? 0} (${fgPct}) | FT: ${p.total_ftm ?? 0}/${p.total_fta ?? 0} (${ftPct}) | GP: ${p.games_played ?? 0}`;
        })
        .join('\n');
      const recentGames = gamesData.slice(0, 8)
        .map((g: any) => `${g.home_team} ${g.home_score}–${g.away_score} ${g.away_team} (${g.game_date})`)
        .join('\n');
      const topTeams = teamsData.slice(0, 10).map((t: any) => {
        const fg = t.season_fg_pct != null ? `${Number(t.season_fg_pct).toFixed(1)}%` : 'N/A';
        const tp = t.season_tp_pct != null ? `${Number(t.season_tp_pct).toFixed(1)}%` : 'N/A';
        return `${t.team_name}: ${t.avg_pts != null ? Number(t.avg_pts).toFixed(1) : '?'}ppg, ${t.avg_reb != null ? Number(t.avg_reb).toFixed(1) : '?'}rpg, ${t.avg_ast != null ? Number(t.avg_ast).toFixed(1) : '?'}apg, 3PM/g: ${t.avg_tpm != null ? Number(t.avg_tpm).toFixed(1) : '?'} (${tp}), FG%: ${fg}, GP: ${t.games_played ?? '?'}`;
      }).join('\n');
      const leagueDataContext = `League: ${leagueName}\n\nTOP PLAYERS:\n${topPlayers || 'None'}\n\nTEAM SEASON AVERAGES:\n${topTeams || 'None'}\n\nRECENT RESULTS:\n${recentGames || 'None'}`;

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
        const teamCount = uniqueTeamNames.length;
        return {
          content: `Here's a snapshot of ${leagueName}:\n\n• Top Scorer: ${top.player_name} (${top.team_name}) — ${top.total_pts ?? 0} pts\n• Active Teams: ${teamCount}\n• Recent Games Logged: ${gamesData.length}\n\nTry asking:\n• "Top scorers"\n• "Top rebounders"\n• "Show me the standings"\n• "How is [player name] performing?"`,
          suggestions: ['Top scorers', 'Top rebounders', 'Show me the standings'],
          navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
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
                      <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-0 [&_h3]:mb-1 [&_strong]:font-semibold">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      </div>
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

  // ── FLOATING WIDGET MODE ──────────────────────────────────────────────────
  if (isFloatingWidget && user && leagueId) {
    return (
      <div className="fixed bottom-6 right-6 z-[9990] flex flex-col items-end gap-3">

        {/* Chat panel — slides up from button */}
        {isWidgetOpen && (
          <div className="w-80 h-[520px] bg-white rounded-2xl shadow-2xl border border-orange-200 flex flex-col overflow-hidden"
               style={{ animation: 'widgetSlideUp 0.2s ease-out' }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-yellow-500 p-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-white" />
                <span className="font-semibold text-white text-sm">League Assistant</span>
                <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">AI</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setMessages([]); setInputMessage(''); }}
                  className="text-white/70 hover:text-white text-xs transition-colors"
                  title="Clear chat"
                >
                  Clear
                </button>
                <button
                  onClick={() => setIsWidgetOpen(false)}
                  className="text-white hover:text-orange-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages / Suggestions area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 font-medium mb-3">Try asking about {leagueName}:</p>
                  {suggestedQuestions.slice(0, 4).map((question, index) => (
                    <button
                      key={index}
                      onClick={() => handleSendMessage(question)}
                      disabled={isLoading}
                      className="w-full text-left text-xs p-2.5 bg-orange-50 hover:bg-orange-100 text-slate-700 rounded-lg border border-orange-200 hover:border-orange-300 transition-colors leading-relaxed"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div key={message.id} className={`flex gap-2 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {message.type === 'bot' && <Bot className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" />}
                      <div className="flex flex-col max-w-[85%]">
                        <div className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                          message.type === 'user'
                            ? 'bg-orange-500 text-white'
                            : 'bg-slate-50 text-slate-800 border border-slate-200'
                        }`}>
                          <div className="prose prose-xs max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:mt-0 [&_h3]:mb-1">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                          </div>
                        </div>
                        {message.type === 'bot' && message.suggestions && message.suggestions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {message.suggestions.slice(0, 3).map((s, i) => (
                              <button
                                key={i}
                                onClick={() => handleSendMessage(s)}
                                disabled={isLoading}
                                className="px-2 py-1 text-[10px] bg-orange-50 hover:bg-orange-100 text-orange-700 rounded border border-orange-200 transition-colors"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                        {message.type === 'bot' && message.navigationButtons && message.navigationButtons.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {message.navigationButtons.map((button, i) => (
                              <Button
                                key={i}
                                onClick={() => {
                                  if (button.type === 'player') setLocation(`/player/${button.id}`);
                                  else if (button.type === 'team') setLocation(leagueSlug ? `/league/${leagueSlug}/team/${button.id}` : `/team/${button.id}`);
                                }}
                                variant="outline"
                                size="sm"
                                className="text-[10px] h-auto py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                              >
                                <ExternalLink className="w-2.5 h-2.5 mr-1" />
                                {button.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                      {message.type === 'user' && <User className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />}
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-2 justify-start">
                      <Bot className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" />
                      <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input bar */}
            <div className="p-3 border-t border-orange-100 flex gap-2 flex-shrink-0">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask about stats, players..."
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                className="text-xs py-2 px-3 border-orange-200 focus:border-orange-400"
                disabled={isLoading}
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() || isLoading}
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white px-3 flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Tooltip callout */}
        {showTooltip && !isWidgetOpen && (
          <div className="relative mr-2" style={{ animation: 'widgetSlideUp 0.3s ease-out' }}>
            <div className="bg-white border border-orange-300 rounded-xl shadow-lg px-4 py-3 text-sm text-slate-700 font-medium max-w-[200px] leading-snug">
              Query any stats you want instantly
              {/* Arrow pointing down-right toward the button */}
              <div className="absolute -bottom-2 right-4 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-orange-300" />
              <div className="absolute -bottom-[7px] right-[17px] w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-l-transparent border-r-transparent border-t-white" />
            </div>
          </div>
        )}

        {/* Glow button */}
        <div className="relative flex items-center justify-center">
          {/* Ping glow ring */}
          {!isWidgetOpen && (
            <div className="absolute inset-0 rounded-full bg-orange-400 opacity-50 animate-ping" />
          )}
          {/* Steady glow halo */}
          <div className={`absolute inset-0 rounded-full transition-all duration-300 ${
            isWidgetOpen
              ? 'shadow-[0_0_24px_rgba(249,115,22,0.7)]'
              : 'shadow-[0_0_20px_rgba(249,115,22,0.55)]'
          }`} />
          <button
            onClick={() => { setIsWidgetOpen(!isWidgetOpen); setShowTooltip(false); }}
            className="relative w-14 h-14 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform duration-150 shadow-lg"
            aria-label="Open League Assistant"
          >
            {isWidgetOpen
              ? <X className="w-6 h-6 text-white" />
              : <MessageCircle className="w-6 h-6 text-white" />
            }
          </button>
        </div>

        {/* Slide-up keyframe */}
        <style>{`
          @keyframes widgetSlideUp {
            from { opacity: 0; transform: translateY(12px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)   scale(1); }
          }
        `}</style>
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
                      <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-0 [&_h3]:mb-2 [&_strong]:font-semibold">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      </div>
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