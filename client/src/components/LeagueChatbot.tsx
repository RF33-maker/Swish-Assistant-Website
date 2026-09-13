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
import { queryClient } from '@/lib/queryClient';
import type { StructuredContent, LeaderboardContent, ComparisonRow } from './league-chatbot/structuredContent';
import LeaderboardTable from './league-chatbot/LeaderboardTable';
import StandingsTable from './league-chatbot/StandingsTable';
import PlayerStatCard from './league-chatbot/PlayerStatCard';
import TeamComparisonCard from './league-chatbot/TeamComparisonCard';
import GameLogTable from './league-chatbot/GameLogTable';
import { useReadableTeamColor } from '@/hooks/useReadableColor';

function renderStructuredContent(data: StructuredContent, brandColor: string) {
  switch (data.kind) {
    case 'leaderboard':
      return <LeaderboardTable data={data} brandColor={brandColor} />;
    case 'standings':
      return <StandingsTable data={data} brandColor={brandColor} />;
    case 'playerCard':
      return <PlayerStatCard data={data} brandColor={brandColor} />;
    case 'comparison':
      return <TeamComparisonCard data={data} brandColor={brandColor} />;
    case 'gameLog':
      return <GameLogTable data={data} brandColor={brandColor} />;
    default:
      return null;
  }
}

// Per-leagueId snapshot cache keys. The snapshot (players, games, teams)
// rarely changes within a chat session, so we use TanStack Query's cache
// (configured with `staleTime: Infinity`) to avoid refetching the same
// three Supabase views on every chat turn.
const leagueSnapshotKey = (leagueId: string) =>
  ['supabase', 'league-chatbot', 'snapshot', leagueId] as const;

interface LeagueSnapshot {
  playersData: any[];
  gamesData: any[];
  teamsData: any[];
}

async function fetchLeagueSnapshot(leagueId: string): Promise<LeagueSnapshot> {
  const [playersDataResult, gamesDataResult, teamsDataResult] = await Promise.all([
    supabase
      .from('v_player_season_averages')
      .select('player_name, team_name, league_id, games_played, total_pts, total_reb, total_ast, total_stl, total_blk, total_tpm, total_tpa, total_fgm, total_fga, total_ftm, total_fta, season_fg_pct, season_tp_pct, season_ft_pct, avg_pts, avg_reb, avg_ast, avg_stl, avg_blk, avg_tpm')
      .eq('league_id', leagueId)
      .order('total_pts', { ascending: false })
      .limit(100),
    // `games` is unused/empty in production — completed results live in this view instead.
    // No `.limit()` here: standings (computeStandings) needs every completed game in
    // the season, not just the most recent ones. Callers that want "recent results"
    // slice the front of this already-descending-by-date array instead.
    supabase
      .from('v_game_results')
      .select('game_date:match_time, home_team, away_team, home_score, away_score')
      .eq('league_id', leagueId)
      .eq('game_status', 'Final')
      .order('match_time', { ascending: false })
      .limit(1000),
    supabase
      .from('v_team_season_averages')
      .select('team_name, team_id, league_id, games_played, avg_pts, avg_ast, avg_reb, avg_stl, avg_blk, avg_tov, avg_tpm, avg_tpa, season_tp_pct, avg_fgm, avg_fga, season_fg_pct, avg_ftm, avg_fta, avg_pitp, avg_fastbreak_pts')
      .eq('league_id', leagueId)
      .order('avg_pts', { ascending: false })
  ]);

  return {
    playersData: (playersDataResult.data || []) as any[],
    gamesData: (gamesDataResult.data || []) as any[],
    teamsData: (teamsDataResult.data || []) as any[],
  };
}

async function getLeagueSnapshot(leagueId: string): Promise<LeagueSnapshot> {
  return queryClient.fetchQuery({
    queryKey: leagueSnapshotKey(leagueId),
    queryFn: () => fetchLeagueSnapshot(leagueId),
  });
}

const LOADING_PHRASES = [
  'Checking the statbook…',
  'Crunching the numbers…',
  'Pulling up the data…',
  'Scanning the game logs…',
  'Analysing player records…',
  'Reviewing the play-by-play…',
];

interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  displayedContent?: string;
  timestamp: Date;
  suggestions?: string[];
  navigationButtons?: { label: string; id: string; type: 'player' | 'team' }[];
  structured?: StructuredContent;
}

interface LeagueChatbotProps {
  leagueId: string;
  leagueName: string;
  leagueSlug?: string;
  onResponseReceived?: (response: string) => void;
  isPanelMode?: boolean;
  isFloatingWidget?: boolean;
  suggestedQuestions?: string[];
  brandColor?: string;
}

export default function LeagueChatbot({ leagueId, leagueName, leagueSlug, onResponseReceived, isPanelMode = false, isFloatingWidget = false, suggestedQuestions: propSuggestedQuestions, brandColor = '#f97316' }: LeagueChatbotProps) {
  const readableBrand = useReadableTeamColor(brandColor).body;
  const { user, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(isPanelMode);
  const [isOverlayMode, setIsOverlayMode] = useState(false);
  const [isActivelyUsed, setIsActivelyUsed] = useState(isPanelMode);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMentionedPlayer = useRef<any>(null);
  const lastMentionedTeam = useRef<string | null>(null);
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

  // Cycling loading phrase
  useEffect(() => {
    if (!isLoading) { setLoadingPhraseIdx(0); return; }
    const id = setInterval(() => setLoadingPhraseIdx(i => (i + 1) % LOADING_PHRASES.length), 1800);
    return () => clearInterval(id);
  }, [isLoading]);

  // Typewriter effect for incoming bot messages
  useEffect(() => {
    if (typingIntervalRef.current) { clearInterval(typingIntervalRef.current); typingIntervalRef.current = null; }
    const typing = messages.find(m => m.displayedContent !== undefined && m.displayedContent.length < m.content.length);
    if (!typing) return;
    typingIntervalRef.current = setInterval(() => {
      setMessages(prev => prev.map(m => {
        if (m.id !== typing.id || m.displayedContent === undefined) return m;
        const next = m.content.slice(0, (m.displayedContent.length) + 6);
        return { ...m, displayedContent: next };
      }));
      scrollToBottom();
    }, 10);
    return () => { if (typingIntervalRef.current) clearInterval(typingIntervalRef.current); };
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
      const structured = typeof response === 'string' ? undefined : response.structured;

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: typeof response === 'string' ? response : response.content,
        // Structured answers render immediately as a component — no typewriter
        // effect, which is driven by displayedContent staying undefined here.
        displayedContent: structured ? undefined : '',
        timestamp: new Date(),
        suggestions: typeof response === 'string' ? undefined : response.suggestions,
        navigationButtons: typeof response === 'string' ? undefined : response.navigationButtons,
        structured,
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

  const queryLeagueData = async (question: string, leagueId: string): Promise<{ content: string; suggestions?: string[]; navigationButtons?: { label: string; id: string; type: 'player' | 'team' }[]; structured?: StructuredContent } | string> => {
    try {
      // ── Step 1: Fetch real league data from Supabase views ───────────
      // Cached per-leagueId via TanStack Query so multi-turn chat reuses
      // a single network round-trip instead of refetching all three views
      // on every user question.
      const { playersData, gamesData, teamsData } = await getLeagueSnapshot(leagueId);
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

      // Shared row-builder for the six per-stat leaderboards below — same
      // shape every time (rank, player name, team, one value column).
      const buildLeaderboardRows = (sorted: any[], valueOf: (p: any) => string): LeaderboardContent['rows'] =>
        sorted.map((p: any, i: number) => ({ rank: i + 1, name: p.player_name, sub: p.team_name, value: valueOf(p) }));

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

      // ── Single-game / margin detection — hoisted above the season-total leaderboards ──
      // so a query like "most points a team has scored in a game" doesn't get swallowed by
      // the generic "most points" (season-total) handler before it ever reaches the
      // dedicated single-game-record / margin handlers further down.
      const isSingleGameRecordQuery = is([
        'in a single game', 'in one game', 'single game record', 'game record',
        'in a game', 'best game', 'highest in a game', 'most in a game', 'in any game',
        'single game', 'in any single game', 'best single', 'ever scored in a game',
        'most points in a game', 'most rebounds in a game', 'most assists in a game',
        'most 3s in a game', 'most steals in a game', 'most blocks in a game',
        'career high', 'career best', 'season high', 'season best', 'game high',
        'personal best', 'biggest game', 'monster game', 'huge game', 'best outing',
        'franchise record', 'record for', 'in a match', 'in one match', 'single match',
        'exploded for', 'went off for'
      ]);
      const isMarginQuery = is(['biggest win', 'biggest blowout', 'largest margin', 'biggest margin',
        'margin of victory', 'blowout', 'closest game', 'closest margin', 'tightest game',
        'nail-biter', 'nailbiter', 'biggest upset']);

      // ── AI ENHANCE HELPER ──────────────────────────────────────────────
      // Sends structured raw data to the Python/OpenAI backend to get a
      // well-formatted, NBA-style narrative response. Falls back to the
      // pre-built content if the AI call fails or times out.
      type ChatbotResponse = { content: string; suggestions?: string[]; navigationButtons?: { label: string; id: string; type: 'player' | 'team' }[]; structured?: StructuredContent };
      const aiEnhance = async (rawData: string, fallback: ChatbotResponse): Promise<ChatbotResponse> => {
        const attempt = async () => {
          const BASE = getPythonBackendUrl();
          const resp = await fetch(`${BASE}/api/chat/league`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, league_id: leagueId, league_data: rawData }),
            signal: AbortSignal.timeout(25000)
          });
          if (resp.ok) {
            const d = await resp.json();
            if (d.response) return { content: d.response, suggestions: d.suggestions?.length ? d.suggestions : fallback.suggestions, navigationButtons: fallback.navigationButtons };
          }
          return null;
        };
        try {
          const result = await attempt();
          if (result) return result;
        } catch {}
        try {
          await new Promise(r => setTimeout(r, 500));
          const result = await attempt();
          if (result) return result;
        } catch {}
        return fallback;
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
          const [leader] = standings[0];
          const title = topNTeamsMatch ? `Top ${displayCount} Teams — ${leagueName}` : `${leagueName} Standings`;
          return {
            content: title,
            structured: {
              kind: 'standings',
              title,
              rows: standings.slice(0, displayCount).map(([team, r], i) => {
                const gp = r.wins + r.losses;
                return {
                  rank: i + 1,
                  team,
                  wins: r.wins,
                  losses: r.losses,
                  pct: gp > 0 ? `${((r.wins / gp) * 100).toFixed(0)}%` : '0%',
                };
              }),
            },
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
          const rawRows = gamesData.slice(0, 8).map(g => {
            const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB') : 'TBD';
            const winner = g.home_score > g.away_score ? g.home_team : g.away_team;
            return `${date}: ${g.home_team} ${g.home_score} - ${g.away_score} ${g.away_team} (Winner: ${winner})`;
          }).join('\n');
          const fallbackRows = gamesData.slice(0, 8).map(g => {
            const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB') : 'TBD';
            const winner = g.home_score > g.away_score ? g.home_team : g.away_team;
            return `**${g.home_team}** ${g.home_score} – ${g.away_score} **${g.away_team}** *(${date})* ✓ ${winner}`;
          }).join('\n');
          return aiEnhance(`${leagueName} Recent Game Results:\n\n${rawRows}`, {
            content: `### Recent Results — ${leagueName}\n\n${fallbackRows}`,
            suggestions: ['Who are the top scorers?', 'Show me the standings', 'Top rebounders']
          });
        }
      }

      // ── TOP SCORERS ────────────────────────────────────────────────────
      if (is(['top scorer', 'top scorers', 'leading scorer', 'leading scorers', 'most points',
               'who scores the most', 'point leader', 'points leader', 'scoring leader',
               'scoring leaders', 'who leads in points', 'highest scorer', 'best scorer'])
          && !isSingleGameRecordQuery && !isMarginQuery) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].sort((a: any, b: any) => (b.total_pts ?? 0) - (a.total_pts ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const top = sorted[0];
          const title = tf ? `Scoring Leaders — ${tf.name}` : `Scoring Leaders — ${leagueName}`;
          return {
            content: title,
            structured: { kind: 'leaderboard', title, unit: 'PTS', rows: buildLeaderboardRows(sorted, (p) => `${p.total_pts ?? 0}`) },
            suggestions: [`How is ${top.player_name} performing?`, 'Top rebounders', 'Show me the standings'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
        if (tf) return { content: `No scoring data found for **${tf.name}** yet.`, suggestions: ['Show me the standings', 'Top scorers in the league'] };
      }

      // ── TOP REBOUNDERS ─────────────────────────────────────────────────
      if (is(['top rebounder', 'top rebounders', 'rebound leader', 'rebounding leader',
               'most rebounds', 'who grabs the most', 'who rebounds', 'board leader',
               'best rebounder', 'leading rebounder', 'who leads in rebounds'])
          && !isSingleGameRecordQuery && !isMarginQuery) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].sort((a: any, b: any) => (b.total_reb ?? 0) - (a.total_reb ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const top = sorted[0];
          const title = tf ? `Rebounding Leaders — ${tf.name}` : `Rebounding Leaders — ${leagueName}`;
          return {
            content: title,
            structured: { kind: 'leaderboard', title, unit: 'REB', rows: buildLeaderboardRows(sorted, (p) => `${p.total_reb ?? 0}`) },
            suggestions: [`How is ${top.player_name} performing?`, 'Top scorers', 'Top assisters'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
        if (tf) return { content: `No rebounding data found for **${tf.name}** yet.`, suggestions: ['Show me the standings', 'Top rebounders in the league'] };
      }

      // ── TOP ASSISTERS ──────────────────────────────────────────────────
      if (is(['top assist', 'assist leader', 'most assists', 'who dishes', 'who passes the most',
               'playmaker', 'best passer', 'leading assister', 'assist king', 'who leads in assists'])
          && !isSingleGameRecordQuery && !isMarginQuery) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].sort((a: any, b: any) => (b.total_ast ?? 0) - (a.total_ast ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const top = sorted[0];
          const title = tf ? `Assist Leaders — ${tf.name}` : `Assist Leaders — ${leagueName}`;
          return {
            content: title,
            structured: { kind: 'leaderboard', title, unit: 'AST', rows: buildLeaderboardRows(sorted, (p) => `${p.total_ast ?? 0}`) },
            suggestions: [`How is ${top.player_name} performing?`, 'Top scorers', 'Top rebounders'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
        if (tf) return { content: `No assist data found for **${tf.name}** yet.`, suggestions: ['Show me the standings', 'Top assisters in the league'] };
      }

      // ── TOP STEALERS ───────────────────────────────────────────────────
      if (is(['top steal', 'steal leader', 'most steals', 'who steals the most', 'defensive leader',
               'best defender', 'who leads in steals', 'steals leader'])
          && !isSingleGameRecordQuery && !isMarginQuery) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].sort((a: any, b: any) => (b.total_stl ?? 0) - (a.total_stl ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const top = sorted[0];
          const title = tf ? `Steal Leaders — ${tf.name}` : `Steal Leaders — ${leagueName}`;
          return {
            content: title,
            structured: { kind: 'leaderboard', title, unit: 'STL', rows: buildLeaderboardRows(sorted, (p) => `${p.total_stl ?? 0}`) },
            suggestions: [`How is ${top.player_name} performing?`, 'Top blockers', 'Top scorers'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
        if (tf) return { content: `No steal data found for **${tf.name}** yet.`, suggestions: ['Show me the standings', 'Top defenders in the league'] };
      }

      // ── TOP BLOCKERS ───────────────────────────────────────────────────
      if (is(['top block', 'block leader', 'most blocks', 'who blocks the most', 'shot blocker',
               'who leads in blocks', 'blocks leader', 'best shot blocker'])
          && !isSingleGameRecordQuery && !isMarginQuery) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].sort((a: any, b: any) => (b.total_blk ?? 0) - (a.total_blk ?? 0)).slice(0, 5);
        if (sorted.length > 0) {
          const top = sorted[0];
          const title = tf ? `Block Leaders — ${tf.name}` : `Block Leaders — ${leagueName}`;
          return {
            content: title,
            structured: { kind: 'leaderboard', title, unit: 'BLK', rows: buildLeaderboardRows(sorted, (p) => `${p.total_blk ?? 0}`) },
            suggestions: [`How is ${top.player_name} performing?`, 'Top stealers', 'Top scorers'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          };
        }
        if (tf) return { content: `No block data found for **${tf.name}** yet.`, suggestions: ['Show me the standings', 'Top shot blockers in the league'] };
      }

      // ── EFFICIENCY / BEST OVERALL ──────────────────────────────────────
      if (is(['most efficient', 'most productive', 'best overall', 'best player',
               'who is the best', 'top performer', 'mvp', 'all-around'])
          && !isSingleGameRecordQuery && !isMarginQuery) {
        const tf = findTeamInQuestion();
        const pool = tf ? playersData.filter((p: any) => p.team_name?.toLowerCase() === tf.name.toLowerCase()) : playersData;
        const sorted = [...pool].map((p: any) => ({
          ...p,
          eff: (p.total_pts ?? 0) + (p.total_reb ?? 0) + (p.total_ast ?? 0) + (p.total_stl ?? 0) + (p.total_blk ?? 0)
        })).sort((a: any, b: any) => b.eff - a.eff).slice(0, 5);
        if (sorted.length > 0) {
          const top = sorted[0];
          const title = tf ? `Most Efficient Players — ${tf.name}` : `Most Efficient Players — ${leagueName}`;
          return {
            content: title,
            structured: {
              kind: 'leaderboard', title, unit: 'PTS+REB+AST+STL+BLK',
              rows: sorted.map((p: any, i: number) => ({
                rank: i + 1,
                name: p.player_name,
                sub: `${p.team_name} · ${p.total_pts ?? 0}pts / ${p.total_reb ?? 0}reb / ${p.total_ast ?? 0}ast`,
                value: `${p.eff}`,
              })),
            },
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
          const standings = computeStandings();
          const teamStanding = standings.findIndex(([t]) => t.toLowerCase() === teamFromStats.name.toLowerCase());
          const standingRecord = teamStanding >= 0 ? standings[teamStanding][1] : null;
          const standingPos = teamStanding >= 0 ? `#${teamStanding + 1} in the league` : 'standing unknown';
          const fg = teamStats?.season_fg_pct != null ? `${Number(teamStats.season_fg_pct).toFixed(1)}%` : 'N/A';
          const tp = teamStats?.season_tp_pct != null ? `${Number(teamStats.season_tp_pct).toFixed(1)}%` : 'N/A';
          const rawData = [
            `TEAM: ${teamFromStats.name}`,
            `FOCUS: Describe this team's overall performance — use team-level stats as the main subject, not individual players.`,
            ``,
            `TEAM OVERVIEW:`,
            `- League standing: ${standingPos}`,
            standingRecord ? `- Record: ${standingRecord.wins}W-${standingRecord.losses}L` : '',
            `- Games played: ${teamStats?.games_played ?? '?'}`,
            `- Avg points per game: ${teamStats?.avg_pts != null ? Number(teamStats.avg_pts).toFixed(1) : 'N/A'}`,
            `- Avg rebounds per game: ${teamStats?.avg_reb != null ? Number(teamStats.avg_reb).toFixed(1) : 'N/A'}`,
            `- Avg assists per game: ${teamStats?.avg_ast != null ? Number(teamStats.avg_ast).toFixed(1) : 'N/A'}`,
            `- FG%: ${fg} | 3PT%: ${tp}`,
            `- Avg 3PM per game: ${teamStats?.avg_tpm != null ? Number(teamStats.avg_tpm).toFixed(1) : 'N/A'}`,
            `- Pts in Paint per game: ${teamStats?.avg_pitp != null ? Number(teamStats.avg_pitp).toFixed(1) : 'N/A'}`,
            ``,
            `ROSTER (top 5 by points):`,
            ...teamPlayers.map((p: any, i: number) => `${i + 1}. ${p.player_name} — ${p.total_pts ?? 0}pts, ${p.total_reb ?? 0}reb, ${p.total_ast ?? 0}ast in ${p.games_played ?? '?'} games`)
          ].filter(Boolean).join('\n');
          const playerRows = teamPlayers.map((p: any, i: number) => `${i + 1}. **${p.player_name}** — ${p.total_pts ?? 0}pts · ${p.total_reb ?? 0}reb · ${p.total_ast ?? 0}ast`).join('\n');
          const standingText = teamStanding >= 0 ? `*League Position: #${teamStanding + 1}${standingRecord ? ` (${standingRecord.wins}W-${standingRecord.losses}L)` : ''}*\n\n` : '';
          const seasonStatsBlock = teamStats ? `**Season Averages** *(${teamStats.games_played ?? '?'} games)*\n- **Points:** ${teamStats.avg_pts != null ? Number(teamStats.avg_pts).toFixed(1) : 'N/A'} ppg\n- **Rebounds:** ${teamStats.avg_reb != null ? Number(teamStats.avg_reb).toFixed(1) : 'N/A'} rpg\n- **Assists:** ${teamStats.avg_ast != null ? Number(teamStats.avg_ast).toFixed(1) : 'N/A'} apg\n- **3-Pointers:** ${teamStats.avg_tpm != null ? Number(teamStats.avg_tpm).toFixed(1) : 'N/A'}/game · 3PT%: ${tp}\n- **FG%:** ${fg} · Pts in Paint: ${teamStats.avg_pitp != null ? Number(teamStats.avg_pitp).toFixed(1) : 'N/A'} ppg\n\n` : '';
          return aiEnhance(rawData, {
            content: `### ${teamFromStats.name}\n\n${standingText}${seasonStatsBlock}**Top Players**\n${playerRows || 'No player data available'}`,
            suggestions: [`Who are the top scorers for ${teamFromStats.name}?`, `How has ${teamFromStats.name} been performing recently?`, 'Show me the standings']
          });
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
          return {
            content: `### ${player.player_name}\n*${player.team_name} · ${player.games_played ?? '?'} games*\n\n**Season Totals**\n- **Points:** ${pts}\n- **Rebounds:** ${reb}\n- **Assists:** ${ast}\n- **Steals:** ${stl}\n- **Blocks:** ${blk}\n\n**Shooting**\n- **FG:** ${fgm}/${fga} (${fgPct}%)\n- **3PT:** ${tpm}/${tpa} (${tpPct}%)\n- **FT:** ${ftm}/${fta} (${ftPct}%)`,
            structured: {
              kind: 'playerCard',
              name: player.player_name,
              team: player.team_name,
              gamesPlayed: player.games_played ?? 0,
              totals: [
                { label: 'PTS', value: `${pts}` },
                { label: 'REB', value: `${reb}` },
                { label: 'AST', value: `${ast}` },
                { label: 'STL', value: `${stl}` },
                { label: 'BLK', value: `${blk}` },
                { label: 'PPG', value: player.avg_pts != null ? Number(player.avg_pts).toFixed(1) : '0.0' },
              ],
              shooting: [
                { label: 'FG', made: fgm, attempted: fga, pct: `${fgPct}%` },
                { label: '3PT', made: tpm, attempted: tpa, pct: `${tpPct}%` },
                { label: 'FT', made: ftm, attempted: fta, pct: `${ftPct}%` },
              ],
            },
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
        avgColumn?: string;
        avgLabel?: string;
        attemptsColumn?: string;
        companions?: { column?: string; label: string; compute?: (p: any) => string }[];
      }

      const parseMinAttemptsPerGame = (query: string): number | null => {
        const patterns = [
          /min(?:imum)?\s+(\d+(?:\.\d+)?)\s*(?:attempts?\s*)?(?:per\s*game|\/\s*g(?:ame)?|a\s*game|pg)/i,
          /at\s+least\s+(\d+(?:\.\d+)?)\s*(?:attempts?\s*)?(?:per\s*game|\/\s*g(?:ame)?|a\s*game|pg)/i,
          /(\d+(?:\.\d+)?)\+?\s*(?:attempts?\s*)?(?:per\s*game|\/\s*g(?:ame)?|a\s*game|pg)/i,
          /min(?:imum)?\s+(\d+(?:\.\d+)?)\s*(?:attempts?|att)/i,
          /at\s+least\s+(\d+(?:\.\d+)?)\s*(?:attempts?|att)/i,
        ];
        for (const pat of patterns) {
          const m = query.match(pat);
          if (m) return parseFloat(m[1]);
        }
        return null;
      };

      const STAT_MAP: StatDef[] = [
        {
          keywords: ["3pt%", "3pt pct", "3-point percentage", "three point percent", "three point percentage", "3 point percentage", "3-point%", "three-point percentage", "3p%", "three pt%"],
          column: 'total_tpm', label: '3-Point %', avgColumn: 'season_tp_pct', avgLabel: '3PT%',
          attemptsColumn: 'total_tpa',
          companions: [
            { column: 'total_tpm', label: '3-Pointers Made' },
            { column: 'total_tpa', label: '3-Pointers Attempted' },
          ]
        },
        {
          keywords: ["three pointer", "three-pointer", "3-pointer", "3 pointer", "three's", "3's", "3s", "threes", "triple", "from three", "from the three", "from deep", "beyond the arc"],
          column: 'total_tpm', label: '3-Pointers Made', avgColumn: 'avg_tpm', avgLabel: '3PM/G',
          companions: [
            { column: 'total_tpa', label: '3-Pointers Attempted' },
            { label: '3-Point %', compute: (p: any) => p.season_tp_pct != null ? `${Number(p.season_tp_pct).toFixed(1)}%` : (p.total_tpa > 0 ? ((p.total_tpm/p.total_tpa)*100).toFixed(1)+'%' : 'N/A') }
          ]
        },
        {
          keywords: ['fg%', 'fg pct', 'field goal percentage', 'field goal%', 'field goal', 'fg', 'shooting', 'from the field', 'shot'],
          column: 'total_fgm', label: 'Field Goals Made', avgColumn: 'season_fg_pct', avgLabel: 'FG%',
          attemptsColumn: 'total_fga',
          companions: [
            { column: 'total_fga', label: 'Field Goals Attempted' },
            { label: 'FG %', compute: (p: any) => p.season_fg_pct != null ? `${Number(p.season_fg_pct).toFixed(1)}%` : (p.total_fga > 0 ? ((p.total_fgm/p.total_fga)*100).toFixed(1)+'%' : 'N/A') }
          ]
        },
        {
          keywords: ['ft%', 'ft pct', 'free throw percentage', 'free throw%', 'free throw', 'ft', 'foul shot', 'from the line'],
          column: 'total_ftm', label: 'Free Throws Made', avgColumn: 'season_ft_pct', avgLabel: 'FT%',
          attemptsColumn: 'total_fta',
          companions: [
            { column: 'total_fta', label: 'Free Throws Attempted' },
            { label: 'FT %', compute: (p: any) => p.season_ft_pct != null ? `${Number(p.season_ft_pct).toFixed(1)}%` : (p.total_fta > 0 ? ((p.total_ftm/p.total_fta)*100).toFixed(1)+'%' : 'N/A') }
          ]
        },
        { keywords: ['point', 'score', 'scoring', 'pts'], column: 'total_pts', label: 'Points', avgColumn: 'avg_pts', avgLabel: 'PPG' },
        { keywords: ['rebound', 'board', 'glass'], column: 'total_reb', label: 'Rebounds', avgColumn: 'avg_reb', avgLabel: 'RPG' },
        { keywords: ['assist', 'dish', 'pass'], column: 'total_ast', label: 'Assists', avgColumn: 'avg_ast', avgLabel: 'APG' },
        { keywords: ['steal'], column: 'total_stl', label: 'Steals', avgColumn: 'avg_stl', avgLabel: 'SPG' },
        { keywords: ['block', 'blk'], column: 'total_blk', label: 'Blocks', avgColumn: 'avg_blk', avgLabel: 'BPG' },
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

      // ── Conversational context: remember last mentioned player/team ────
      // Update stored context whenever a player or team is directly named
      const directPlayer = findPlayerInQuestion();
      if (directPlayer) lastMentionedPlayer.current = directPlayer;
      const directTeam = findTeamInQuestion();
      if (directTeam) lastMentionedTeam.current = directTeam.name;

      // Detect pronoun follow-ups (uses "he/his/him" or "they/their" without naming an entity)
      const isPronounPlayer = /\b(he|his|him|this player|the player)\b/.test(q) && !directPlayer;
      const isPronounTeam   = /\b(they|their|them|this team|the team)\b/.test(q) && !directTeam && !directPlayer;

      // Contextual resolvers — fall back to last mentioned entity when pronouns are detected
      const resolveContextualPlayer = (): any | null =>
        directPlayer ?? (isPronounPlayer && lastMentionedPlayer.current ? lastMentionedPlayer.current : null);
      const resolveContextualTeam = (): { name: string } | null =>
        directTeam ?? (isPronounTeam && lastMentionedTeam.current ? { name: lastMentionedTeam.current } : null);

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

      // ── TEAM COMPARISON ────────────────────────────────────────────────
      const findTwoTeamsInQuestion = (): [string, string] | null => {
        const found: string[] = [];
        const sortedNames = [...uniqueTeamNames].sort((a, b) => b.length - a.length);
        for (const tn of sortedNames) {
          if (q.includes(tn.toLowerCase()) && !found.includes(tn)) found.push(tn);
          if (found.length === 2) break;
        }
        if (found.length < 2) {
          for (const tn of sortedNames) {
            if (found.includes(tn)) continue;
            const parts = tn.toLowerCase().split(' ').filter((w: string) => w.length >= 4);
            if (parts.some((part: string) => q.includes(part))) found.push(tn);
            if (found.length === 2) break;
          }
        }
        return found.length === 2 ? [found[0], found[1]] : null;
      };

      const isCompareQuery = is(['compare', 'head to head', 'head-to-head']) ||
        /\bvs\.?\s/.test(q) || !!q.match(/compare .+ (and|vs|versus) .+/);

      if (isCompareQuery) {
        const twoteams = findTwoTeamsInQuestion();
        if (twoteams) {
          const [teamA, teamB] = twoteams;
          const cmpStat = detectStat();

          const [{ data: gamesA }, { data: gamesB }] = await Promise.all([
            supabase
              .from('v_team_game_log')
              .select('game_key, game_date, pts, reb, ast, stl, blk, tov, fgm, fga, fg_pct, tpm, tpa, tp_pct, hometeam, awayteam')
              .eq('league_id', leagueId)
              .ilike('team_name', `%${teamA}%`)
              .order('game_date', { ascending: false })
              .limit(20),
            supabase
              .from('v_team_game_log')
              .select('game_key, game_date, pts, reb, ast, stl, blk, tov, fgm, fga, fg_pct, tpm, tpa, tp_pct, hometeam, awayteam')
              .eq('league_id', leagueId)
              .ilike('team_name', `%${teamB}%`)
              .order('game_date', { ascending: false })
              .limit(20)
          ]);

          const h2hGames = (gamesA || []).filter((g: any) => {
            const opp = ((g.hometeam || '') + ' ' + (g.awayteam || '')).toLowerCase();
            return opp.includes(teamB.toLowerCase());
          });

          const statsA = teamsData.find((t: any) => t.team_name?.toLowerCase() === teamA.toLowerCase());
          const statsB = teamsData.find((t: any) => t.team_name?.toLowerCase() === teamB.toLowerCase());

          let h2hBlock = '';
          const h2hRowsStructured: (ComparisonRow & { winner?: string })[] = [];
          if (h2hGames.length > 0) {
            const h2hRows = h2hGames.slice(0, 5).map((g: any) => {
              const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB') : '?';
              const isAHome = (g.hometeam || '').toLowerCase().includes(teamA.toLowerCase());
              const gB = (gamesB || []).find((gb: any) => gb.game_key === g.game_key);
              const apts = g.pts ?? 0;
              const bpts = gB?.pts ?? 0;
              const winner = apts > bpts ? teamA : (bpts > apts ? teamB : 'Draw');
              let statLine = '';
              if (cmpStat) {
                const col = cmpStat.column.replace('total_', '');
                const aVal = g[col] ?? 0;
                const bVal = gB ? (gB[col] ?? 0) : '?';
                statLine = `\n  ${cmpStat.label}: **${teamA}** ${aVal} · **${teamB}** ${bVal}`;
              } else {
                statLine = `\n  Pts: **${teamA}** ${apts} · **${teamB}** ${bpts} · Reb: ${g.reb ?? 0}/${gB?.reb ?? '?'} · Ast: ${g.ast ?? 0}/${gB?.ast ?? '?'}`;
              }
              h2hRowsStructured.push({ label: date, a: `${apts}`, b: `${bpts}`, winner });
              return `**${date}** — ${isAHome ? teamA : teamB} (Home) · ✓ ${winner}${statLine}`;
            }).join('\n\n');
            h2hBlock = `**Head-to-Head Results** (${h2hGames.length} game${h2hGames.length !== 1 ? 's' : ''})\n\n${h2hRows}\n\n`;
          } else {
            h2hBlock = `*No head-to-head games found between these teams this season.*\n\n`;
          }

          const fmt = (v: any) => v != null ? Number(v).toFixed(1) : 'N/A';
          const header = `| Stat | ${teamA} | ${teamB} |`;
          const divider = `|------|${'-'.repeat(teamA.length + 2)}|${'-'.repeat(teamB.length + 2)}|`;
          const tableRows = [
            ['Points', `${fmt(statsA?.avg_pts)} ppg`, `${fmt(statsB?.avg_pts)} ppg`],
            ['Rebounds', `${fmt(statsA?.avg_reb)} rpg`, `${fmt(statsB?.avg_reb)} rpg`],
            ['Assists', `${fmt(statsA?.avg_ast)} apg`, `${fmt(statsB?.avg_ast)} apg`],
            ['Steals', `${fmt(statsA?.avg_stl)} spg`, `${fmt(statsB?.avg_stl)} spg`],
            ['Blocks', `${fmt(statsA?.avg_blk)} bpg`, `${fmt(statsB?.avg_blk)} bpg`],
            ['FG%', `${fmt(statsA?.season_fg_pct)}%`, `${fmt(statsB?.season_fg_pct)}%`],
            ['3PT%', `${fmt(statsA?.season_tp_pct)}%`, `${fmt(statsB?.season_tp_pct)}%`],
            ['Games Played', `${statsA?.games_played ?? 'N/A'}`, `${statsB?.games_played ?? 'N/A'}`],
          ].map(([stat, a, b]) => `| ${stat} | ${a} | ${b} |`).join('\n');
          const avgBlock = `**Season Averages**\n\n${header}\n${divider}\n${tableRows}`;

          const content = `### ${teamA} vs ${teamB}\n\n${h2hBlock}${avgBlock}`;

          return {
            content,
            structured: {
              kind: 'comparison',
              teamA, teamB,
              rows: [
                { label: 'Points', a: `${fmt(statsA?.avg_pts)} ppg`, b: `${fmt(statsB?.avg_pts)} ppg` },
                { label: 'Rebounds', a: `${fmt(statsA?.avg_reb)} rpg`, b: `${fmt(statsB?.avg_reb)} rpg` },
                { label: 'Assists', a: `${fmt(statsA?.avg_ast)} apg`, b: `${fmt(statsB?.avg_ast)} apg` },
                { label: 'Steals', a: `${fmt(statsA?.avg_stl)} spg`, b: `${fmt(statsB?.avg_stl)} spg` },
                { label: 'Blocks', a: `${fmt(statsA?.avg_blk)} bpg`, b: `${fmt(statsB?.avg_blk)} bpg` },
                { label: 'FG%', a: `${fmt(statsA?.season_fg_pct)}%`, b: `${fmt(statsB?.season_fg_pct)}%` },
                { label: '3PT%', a: `${fmt(statsA?.season_tp_pct)}%`, b: `${fmt(statsB?.season_tp_pct)}%` },
                { label: 'Games Played', a: `${statsA?.games_played ?? 'N/A'}`, b: `${statsB?.games_played ?? 'N/A'}` },
              ],
              h2h: h2hRowsStructured.length > 0 ? h2hRowsStructured : undefined,
            },
            suggestions: [
              `Who are the top scorers for ${teamA}?`,
              `Who are the top scorers for ${teamB}?`,
              'Show me the standings'
            ]
          };
        }
      }

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

      // ── ADVANCED TEAM LEADERBOARD (NET RTG, OFF RTG, DEF RTG, eFG%, TS%, PACE, PIE) ──
      const isTeamLeaderboardQuery = is(['which team', 'what team', 'team that', 'best team for', 'top team for']);
      const isGeneralLeaderboard = isTeamLeaderboardQuery || is(['most', 'best', 'highest', 'top', 'leader', 'most efficient', 'most effective']);
      if (isAdvancedQuery && isGeneralLeaderboard && !findPlayerInQuestion()) {
        type AdvMetric = { col: string; label: string; unit: string; ascending?: boolean };
        const advMetricMap: { keywords: string[]; metric: AdvMetric }[] = [
          { keywords: ['net rtg', 'net rating', 'netrtg', 'net eff'], metric: { col: 'net_rating', label: 'Net Rating (NET RTG)', unit: '' } },
          { keywords: ['off rtg', 'offensive rating', 'offrtg', 'off rating'], metric: { col: 'off_rating', label: 'Offensive Rating (OFF RTG)', unit: '' } },
          { keywords: ['def rtg', 'defensive rating', 'defrtg', 'def rating'], metric: { col: 'def_rating', label: 'Defensive Rating (DEF RTG)', unit: '', ascending: true } },
          { keywords: ['efg', 'effective fg', 'effective field goal', 'efg%'], metric: { col: 'efg_percent', label: 'Effective FG% (eFG%)', unit: '%' } },
          { keywords: ['true shooting', 'ts%', 'ts %'], metric: { col: 'ts_percent', label: 'True Shooting % (TS%)', unit: '%' } },
          { keywords: ['pace'], metric: { col: 'pace', label: 'Pace', unit: '' } },
          { keywords: ['pie'], metric: { col: 'pie', label: 'Player Impact Estimate (PIE)', unit: '%' } },
        ];
        let chosenMetric: AdvMetric = { col: 'net_rating', label: 'Net Rating (NET RTG)', unit: '' };
        for (const entry of advMetricMap) {
          if (entry.keywords.some(k => q.includes(k))) { chosenMetric = entry.metric; break; }
        }

        const { data: advRows } = await supabase
          .from('v_team_advanced_game')
          .select('team_name, net_rating, off_rating, def_rating, efg_percent, ts_percent, pace, pie')
          .eq('league_id', leagueId);

        if (advRows && advRows.length > 0) {
          const standings = computeStandings();
          const standingsMap = Object.fromEntries(standings);
          const aggMap: Record<string, { sum: number; count: number }> = {};
          for (const row of advRows) {
            const tn = row.team_name as string;
            const val = (row as any)[chosenMetric.col];
            if (val == null || val === 0) continue;
            if (!aggMap[tn]) aggMap[tn] = { sum: 0, count: 0 };
            aggMap[tn].sum += Number(val);
            aggMap[tn].count++;
          }
          const ranked = Object.entries(aggMap)
            .map(([tn, { sum, count }]) => ({ tn, avg: sum / count }))
            .sort((a, b) => chosenMetric.ascending ? a.avg - b.avg : b.avg - a.avg)
            .slice(0, 5);

          const rows = ranked.map(({ tn, avg }, i) => {
            const rec = standingsMap[tn];
            const record = rec ? ` (${rec.wins}W-${rec.losses}L)` : '';
            return `${i + 1}. **${tn}**${record} — ${avg.toFixed(1)}${chosenMetric.unit}`;
          }).join('\n');

          const title = `${chosenMetric.label} Leaders — ${leagueName}`;
          return {
            content: `### ${title}\n\n${rows}`,
            structured: {
              kind: 'leaderboard', title, unit: chosenMetric.unit,
              rows: ranked.map(({ tn, avg }, i) => {
                const rec = standingsMap[tn];
                return { rank: i + 1, name: tn, sub: rec ? `${rec.wins}W-${rec.losses}L` : undefined, value: avg.toFixed(1) };
              }),
            },
            suggestions: ['Show me the standings', 'Which team has the best offensive rating?', 'Which team has the best defensive rating?']
          };
        }
      }

      // ── TEAM STAT LEADERBOARD (traditional stats) ──────────────────────
      const detectedTeamStat = detectTeamStat();
      if (detectedTeamStat && teamsData.length > 0 && isGeneralLeaderboard && !findPlayerInQuestion()) {
        const col = detectedTeamStat.column;
        const standings = computeStandings();
        const standingsMap = Object.fromEntries(standings);
        const sorted = [...teamsData].sort((a: any, b: any) => (b[col] ?? 0) - (a[col] ?? 0)).slice(0, 5);
        const rows = sorted.map((t: any, i: number) => {
          const val = t[col] != null ? Number(t[col]).toFixed(1) : 'N/A';
          const rec = standingsMap[t.team_name];
          const record = rec ? ` (${rec.wins}W-${rec.losses}L)` : '';
          return `${i + 1}. **${t.team_name}**${record} — ${val}`;
        }).join('\n');
        const teamStatTitle = `${detectedTeamStat.label} Leaders — ${leagueName}`;
        return {
          content: `### ${teamStatTitle}\n\n${rows}`,
          structured: {
            kind: 'leaderboard', title: teamStatTitle, unit: '',
            rows: sorted.map((t: any, i: number) => {
              const rec = standingsMap[t.team_name];
              return {
                rank: i + 1, name: t.team_name,
                sub: rec ? `${rec.wins}W-${rec.losses}L` : undefined,
                value: t[col] != null ? Number(t[col]).toFixed(1) : 'N/A',
              };
            }),
          },
          suggestions: ['Show me the standings', 'Top scorers', `Which team scores the most?`]
        };
      }

      // ── ENTITY + STAT + "THIS SEASON" ─────────────────────────────────
      const isSeasonQuery = is(['this season', 'season total', 'all season', 'so far', 'this year', 'how many', 'how much']);
      const detectedStat = detectStat();

      // ── BIGGEST MARGIN / BLOWOUT / CLOSEST GAME ─────────────────────────
      // (isSingleGameRecordQuery / isMarginQuery are computed earlier, above the
      // season-total leaderboards, so those don't steal these queries first.)
      if (isMarginQuery) {
        const wantClosest = is(['closest', 'tightest', 'nail-biter', 'nailbiter']);
        const tf = findTeamInQuestion();
        const pool = tf ? gamesData.filter((g: any) => g.home_team === tf.name || g.away_team === tf.name) : gamesData;
        const ranked = [...pool]
          .map((g: any) => ({ ...g, margin: Math.abs((g.home_score ?? 0) - (g.away_score ?? 0)) }))
          .sort((a, b) => wantClosest ? a.margin - b.margin : b.margin - a.margin)
          .slice(0, 5);
        if (ranked.length > 0) {
          const title = `${wantClosest ? 'Closest' : 'Biggest'} Games${tf ? ` — ${tf.name}` : ''} — ${leagueName}`;
          return {
            content: title,
            structured: {
              kind: 'leaderboard', title, unit: 'PT MARGIN',
              rows: ranked.map((g: any, i: number) => {
                const winner = g.home_score > g.away_score ? g.home_team : g.away_team;
                const loser = g.home_score > g.away_score ? g.away_team : g.home_team;
                const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?';
                return { rank: i + 1, name: `${winner} def. ${loser}`, sub: date, value: `${g.margin}` };
              }),
            },
            suggestions: ['Show me the standings', 'Top scorers', wantClosest ? 'Biggest blowout' : 'Closest game']
          };
        }
      }

      // Shared stat → per-game-log-column mapping, used by both the team and player branches below.
      const gameLogColMap: Record<string, { gameCol: string; label: string }> = {
        total_tpm:  { gameCol: 'tpm',  label: '3-Pointers Made' },
        total_pts:  { gameCol: 'pts',  label: 'Points' },
        total_reb:  { gameCol: 'reb',  label: 'Rebounds' },
        total_ast:  { gameCol: 'ast',  label: 'Assists' },
        total_stl:  { gameCol: 'stl',  label: 'Steals' },
        total_blk:  { gameCol: 'blk',  label: 'Blocks' },
        total_fgm:  { gameCol: 'fgm',  label: 'Field Goals Made' },
        total_ftm:  { gameCol: 'ftm',  label: 'Free Throws Made' },
      };

      // ── TEAM SINGLE-GAME RECORD: "most points a team has scored in a game", "Newcastle Knights' biggest game" ──
      const isTeamScopedRecordQuery = isSingleGameRecordQuery && (
        is(['as a team', 'a team has', 'a team score', 'team record', 'team high', 'team single game',
            'team single-game', 'team game high', "team's biggest", 'biggest team game',
            'highest team score', 'most points a team', 'most points by a team', 'team combined', 'team total'])
        || (is(['team']) && !findPlayerInQuestion())
      );
      if (isTeamScopedRecordQuery) {
        const stat = detectStat();
        const mapped = stat ? gameLogColMap[stat.column] : null;
        const gameCol = mapped?.gameCol ?? 'pts';
        const statLabel = mapped?.label ?? 'Points';
        const tf = findTeamInQuestion();

        let teamGameQuery = supabase
          .from('v_team_game_log')
          .select('team_name, game_date, pts, reb, ast, stl, blk, tpm, tpa, fgm, fga, fg_pct, ftm, fta, hometeam, awayteam')
          .eq('league_id', leagueId)
          .order(gameCol, { ascending: false })
          .limit(10);
        if (tf) teamGameQuery = (teamGameQuery as any).ilike('team_name', `%${tf.name}%`);

        const { data: teamGameRows } = await teamGameQuery;

        if (teamGameRows && teamGameRows.length > 0) {
          const top5 = (teamGameRows as any[]).slice(0, 5);
          const title = tf ? `${statLabel} — Team Single-Game Record (${tf.name})` : `${statLabel} — Team Single-Game Records (${leagueName})`;
          return {
            content: title,
            structured: {
              kind: 'leaderboard', title, unit: statLabel.toUpperCase(),
              rows: top5.map((g: any, i: number) => {
                const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?';
                const opp = g.hometeam && g.awayteam ? (g.hometeam === g.team_name ? g.awayteam : g.hometeam) : '?';
                return { rank: i + 1, name: g.team_name, sub: `vs ${opp} · ${date}`, value: `${g[gameCol] ?? 0}` };
              }),
            },
            suggestions: [
              `Who leads the league in ${statLabel.toLowerCase()}?`,
              'Show me the standings',
              tf ? `How is ${tf.name} performing?` : 'Biggest win margin'
            ]
          };
        }
      }

      // ── PLAYER SINGLE-GAME RECORD ───────────────────────────────────────
      if (isSingleGameRecordQuery && !isTeamScopedRecordQuery && !findPlayerInQuestion()) {
        const stat = detectStat();
        const mapped = stat ? gameLogColMap[stat.column] : null;
        const gameCol = mapped?.gameCol ?? 'pts';
        const statLabel = mapped?.label ?? 'Points';
        const tf = findTeamInQuestion();

        let gameQuery = supabase
          .from('v_player_game_log')
          .select('player_name, team_name, game_date, pts, reb, ast, stl, blk, tpm, tpa, fgm, fga, fg_pct, tp_pct, hometeam, awayteam')
          .eq('league_id', leagueId)
          .order(gameCol, { ascending: false })
          .limit(10);
        if (tf) gameQuery = (gameQuery as any).ilike('team_name', `%${tf.name}%`);

        const { data: singleGameRows } = await gameQuery;

        if (singleGameRows && singleGameRows.length > 0) {
          const top5 = (singleGameRows as any[]).slice(0, 5);
          const title = tf ? `${statLabel} — Single-Game Records (${tf.name})` : `${statLabel} — Single-Game Records (${leagueName})`;
          const topGame = top5[0];
          return {
            content: title,
            structured: {
              kind: 'leaderboard', title, unit: statLabel.toUpperCase(),
              rows: top5.map((g: any, i: number) => {
                const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?';
                const opp = g.hometeam && g.awayteam ? (g.hometeam === g.team_name ? g.awayteam : g.hometeam) : '?';
                return { rank: i + 1, name: g.player_name, sub: `${g.team_name} · vs ${opp} · ${date}`, value: `${g[gameCol] ?? 0}` };
              }),
            },
            suggestions: [
              `How is ${topGame.player_name} performing?`,
              stat ? `Who leads the league in ${statLabel.toLowerCase()}?` : 'Top scorers',
              'Show me the standings'
            ],
            navigationButtons: [{ label: `${topGame.player_name}'s Profile`, id: playerSlug(topGame), type: 'player' as const }]
          };
        } else {
          const seasonCol = stat?.column ?? 'total_pts';
          const top5Season = [...playersData]
            .sort((a: any, b: any) => (b[seasonCol] ?? 0) - (a[seasonCol] ?? 0))
            .slice(0, 5);
          if (top5Season.length > 0) {
            const top = top5Season[0];
            const title = `${statLabel} Leaders — ${leagueName}`;
            return {
              content: `${title} (no per-game logs available — season totals shown instead)`,
              structured: {
                kind: 'leaderboard', title, unit: statLabel.toUpperCase(),
                rows: top5Season.map((p: any, i: number) => {
                  const avgKey = seasonCol.replace('total_', 'avg_');
                  const avgVal = p[avgKey] != null ? `${Number(p[avgKey]).toFixed(1)}/game` : undefined;
                  return { rank: i + 1, name: p.player_name, sub: p.team_name ? `${p.team_name}${avgVal ? ` · ${avgVal}` : ''}` : avgVal, value: `${p[seasonCol] ?? 0}` };
                }),
              },
              suggestions: [
                `How is ${top.player_name} performing?`,
                `Who leads the league in ${statLabel.toLowerCase()}?`,
                'Show me the standings'
              ],
              navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
            };
          }
        }
      }

      // ── STAT LEADERBOARD: "top scorers", "who averages the most points", "leaders in rebounds" ──
      const isLeaderboardQuery = is(['most', 'who leads', 'who lead', 'who has the most', 'who have the most',
        'who made the most', 'top', 'leader', 'leaders', 'best', 'highest', 'ranked', 'who is best',
        'averages the most', 'per game leader', 'ppg leader', 'rpg leader', 'apg leader']);
      if (detectedStat && isLeaderboardQuery && !isSingleGameRecordQuery && !findPlayerInQuestion() && !findTeamInQuestion()) {
        const sortCol = detectedStat.avgColumn ?? detectedStat.column;
        const isPercentStat = sortCol === 'season_fg_pct' || sortCol === 'season_tp_pct' || sortCol === 'season_ft_pct';
        const attCol = detectedStat.attemptsColumn;
        const userThreshold = parseMinAttemptsPerGame(q);
        const defaultThreshold = sortCol === 'season_tp_pct' ? 1.5 : 1.0;
        const perGameThreshold = isPercentStat ? (userThreshold ?? defaultThreshold) : 0;
        const eligible = isPercentStat && attCol
          ? playersData.filter((p: any) => {
              const gp = p.games_played ?? 1;
              const totalAtt = p[attCol] ?? 0;
              return gp > 0 && (totalAtt / gp) >= perGameThreshold;
            })
          : playersData;
        const sorted = [...eligible]
          .sort((a: any, b: any) => (b[sortCol] ?? 0) - (a[sortCol] ?? 0))
          .slice(0, 5);
        if (sorted.length > 0) {
          const leagueAvg = eligible.length > 0
            ? (eligible.reduce((sum: number, p: any) => sum + (p[sortCol] ?? 0), 0) / eligible.length)
            : null;
          const thresholdNote = isPercentStat ? `\n_Minimum ${perGameThreshold} attempts per game to qualify (${eligible.length} players qualified)_` : '';
          const rows = sorted.map((p: any, i: number) => {
            const avgVal = p[sortCol] != null ? Number(p[sortCol]).toFixed(1) : 'N/A';
            const totalVal = p[detectedStat.column] ?? 0;
            const gp = p.games_played ?? '?';
            const isPercent = isPercentStat;
            const mainLabel = detectedStat.avgLabel ?? detectedStat.label;
            return `${i + 1}. ${p.player_name} (${p.team_name}) — ${avgVal}${isPercent ? '%' : ''} ${mainLabel} · ${totalVal} total · ${gp} GP`;
          }).join('\n');
          const leagueAvgLine = leagueAvg != null
            ? `\nLeague average: ${leagueAvg.toFixed(1)}${isPercentStat ? '%' : ''} ${detectedStat.avgLabel ?? detectedStat.label}`
            : '';
          const rawData = `${leagueName} — ${detectedStat.label} Leaders (ranked by per-game average):\n\n${rows}${leagueAvgLine}${thresholdNote}\n\nProvide a concise NBA-style analysis of these rankings, noting standout performers and context.`;
          const top = sorted[0];
          return aiEnhance(rawData, {
            content: `### ${detectedStat.label} Leaders (Per Game) — ${leagueName}\n\n${rows}${leagueAvgLine}${thresholdNote}`,
            suggestions: [`How is ${top.player_name} performing?`, `Where does ${top.player_name} rank in rebounds?`, 'Show me the standings'],
            navigationButtons: [{ label: `${top.player_name}'s Profile`, id: playerSlug(top), type: 'player' as const }]
          });
        }
      }

      if (isSeasonQuery && detectedStat) {
        const foundPlayer = resolveContextualPlayer();
        const foundTeam = resolveContextualTeam();

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
        const foundPlayer = resolveContextualPlayer();
        const foundTeam = resolveContextualTeam();

        if (foundTeam) {
          const teamName = foundTeam.name;
          const { data: teamGames } = await supabase
            .from('v_team_game_log')
            .select('game_key, game_date, pts, ast, reb, stl, blk, tov, tpm, tpa, tp_pct, fgm, fga, fg_pct, ftm, fta, ft_pct, pitp, fastbreak_pts, hometeam, awayteam, score')
            .eq('league_id', leagueId)
            .ilike('team_name', `%${teamName}%`)
            .order('game_date', { ascending: false })
            .limit(limit);

          if (teamGames && teamGames.length > 0) {
            const title = `${teamName} — Last ${teamGames.length} Game${teamGames.length !== 1 ? 's' : ''}`;
            return {
              content: title,
              structured: {
                kind: 'gameLog', title,
                rows: teamGames.map((g: any) => {
                  const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Unknown';
                  const isHome = (g.hometeam || '').toLowerCase().includes(teamName.toLowerCase());
                  const opponent = isHome ? g.awayteam : g.hometeam;
                  const tpPct = g.tp_pct != null ? `${Number(g.tp_pct).toFixed(0)}%` : 'N/A';
                  const fgPct = g.fg_pct != null ? `${Number(g.fg_pct).toFixed(0)}%` : 'N/A';
                  return {
                    date, opponent: opponent || '?', isHome,
                    pts: g.pts ?? g.score ?? 0, reb: g.reb ?? 0, ast: g.ast ?? 0,
                    shootingLine: `FG ${g.fgm ?? 0}/${g.fga ?? 0} (${fgPct}) · 3PT ${g.tpm ?? 0}/${g.tpa ?? 0} (${tpPct})`,
                  };
                }),
              },
              suggestions: [`Top scorers on ${teamName}`, 'Show me the standings']
            };
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
            const title = `${foundPlayer.player_name} — Last ${playerGames.length} Game${playerGames.length !== 1 ? 's' : ''}`;
            return {
              content: title,
              structured: {
                kind: 'gameLog', title,
                rows: playerGames.map((g: any) => {
                  const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Unknown';
                  const isHome = (g.hometeam || '').toLowerCase().includes((foundPlayer.team_name || '').toLowerCase());
                  const opp = isHome ? g.awayteam : g.hometeam;
                  const fgPct = g.fg_pct != null ? `${Number(g.fg_pct).toFixed(0)}%` : 'N/A';
                  const tpPct = g.tp_pct != null ? `${Number(g.tp_pct).toFixed(0)}%` : 'N/A';
                  return {
                    date, opponent: opp || '?', isHome,
                    pts: g.pts ?? 0, reb: g.reb ?? 0, ast: g.ast ?? 0,
                    shootingLine: `FG ${g.fgm ?? 0}/${g.fga ?? 0} (${fgPct}) · 3PT ${g.tpm ?? 0}/${g.tpa ?? 0} (${tpPct})`,
                  };
                }),
              },
              suggestions: [`How is ${foundPlayer.player_name} performing?`, 'Top scorers'],
              navigationButtons: [{ label: `${foundPlayer.player_name}'s Profile`, id: playerSlug(foundPlayer), type: 'player' as const }]
            };
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

              const aiRawData = [
                `${leagueName} — Single-game performances matching: ${filterDesc}`,
                `Total qualifying games this season: ${totalGames}`,
                `Players with qualifying game(s): ${playerCount}`,
                ``,
                ...playerEntries.map(([name, { team_name, games }]) => {
                  const gameLines = games.map((g: any) => {
                    const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?';
                    const opp = g.hometeam && g.awayteam ? (g.hometeam === g.team_name ? g.awayteam : g.hometeam) : '?';
                    return `  ${date} vs ${opp} — ${g.pts}pts · ${g.reb}reb · ${g.ast}ast`;
                  }).join('\n');
                  return `${name} (${team_name}) — ${games.length} qualifying game(s):\n${gameLines}`;
                })
              ].join('\n');

              if (totalGames === 1) {
                const [name, { team_name, games }] = playerEntries[0];
                const g = games[0];
                const date = g.game_date ? new Date(g.game_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?';
                const opp = g.hometeam && g.awayteam ? (g.hometeam === g.team_name ? g.awayteam : g.hometeam) : '?';
                return aiEnhance(aiRawData, {
                  content: `### Only 1 Game Matches: ${filterDesc}\n\n**${name}** *(${team_name})* has the only ${filterDesc} performance this season — **${g.pts}pts · ${g.reb}reb · ${g.ast}ast** vs ${opp} on ${date}`,
                  suggestions: [`How is ${name} performing?`, 'Top scorers', 'Show me the standings'],
                  navigationButtons: [{ label: `${name}'s Profile`, id: playerSlug({ player_name: name }), type: 'player' as const }]
                });
              }

              return aiEnhance(aiRawData, {
                content: `### ${totalLabel} this season match: ${filterDesc}\n*${playerLabel} with qualifying game(s)*\n\n${rows}`,
                suggestions: playerEntries.length > 0 ? [`How is ${playerEntries[0][0]} performing?`, 'Top scorers', 'Show me the standings'] : ['Top scorers', 'Show me the standings']
              });
            }
          }
        }
      }

      // ── PLAYER DEEP ANALYSIS: strengths, weaknesses, playmaking, scoring, defence, rebounding ──
      const isPlayerAnalysisQuery = is([
        'strength', 'weakness', 'weakness', 'how good is', 'analyse', 'analyze', 'analysis',
        'playmaking', 'playmaker', 'passing ability', 'vision', 'assist rate',
        'scoring ability', 'scorer', 'shooting ability', 'offensive', 'offense',
        'defence', 'defense', 'defensive ability', 'defender', 'stopper',
        'rebounding', 'rebounder', 'on the boards', 'glass',
        'usage', 'efficiency', 'impact', 'contribution', 'how effective',
        'breakdown', 'profile', 'scouting', 'scout report', 'evaluate', 'assessment',
        'how does', 'what kind of', 'style of play', 'role', 'impact'
      ]);

      const analysisPlayer = resolveContextualPlayer();
      if (isPlayerAnalysisQuery && analysisPlayer) {
        const p = analysisPlayer;

        const fgm = p.total_fgm ?? 0;
        const fga = p.total_fga ?? 0;
        const tpm = p.total_tpm ?? 0;
        const tpa = p.total_tpa ?? 0;
        const ftm = p.total_ftm ?? 0;
        const fta = p.total_fta ?? 0;
        const fgPct = p.season_fg_pct != null ? Number(p.season_fg_pct).toFixed(1) : (fga > 0 ? ((fgm/fga)*100).toFixed(1) : 'N/A');
        const tpPct = p.season_tp_pct != null ? Number(p.season_tp_pct).toFixed(1) : (tpa > 0 ? ((tpm/tpa)*100).toFixed(1) : 'N/A');
        const ftPct = p.season_ft_pct != null ? Number(p.season_ft_pct).toFixed(1) : (fta > 0 ? ((ftm/fta)*100).toFixed(1) : 'N/A');
        const gp = p.games_played ?? 1;
        const avgPts = p.avg_pts != null ? Number(p.avg_pts).toFixed(1) : (gp > 0 ? (p.total_pts / gp).toFixed(1) : 'N/A');
        const avgReb = p.avg_reb != null ? Number(p.avg_reb).toFixed(1) : (gp > 0 ? (p.total_reb / gp).toFixed(1) : 'N/A');
        const avgAst = p.avg_ast != null ? Number(p.avg_ast).toFixed(1) : (gp > 0 ? (p.total_ast / gp).toFixed(1) : 'N/A');
        const avgStl = p.avg_stl != null ? Number(p.avg_stl).toFixed(1) : (gp > 0 ? (p.total_stl / gp).toFixed(1) : 'N/A');
        const avgBlk = p.avg_blk != null ? Number(p.avg_blk).toFixed(1) : (gp > 0 ? (p.total_blk / gp).toFixed(1) : 'N/A');

        const { data: advRows } = await supabase
          .from('v_player_advanced_game')
          .select('efg_percent, ts_percent, usage_percent, ast_percent, oreb_percent, dreb_percent, reb_percent, tov_percent, pie, off_rating, def_rating, net_rating, three_point_rate, pts_percent_2pt, pts_percent_3pt, pts_percent_ft, pts_percent_pitp, pts_percent_fastbreak, min')
          .eq('league_id', leagueId)
          .ilike('player_name', `%${p.player_name}%`)
          .gt('min', '0:00');

        const fmtAdv = (vals: any[], col: string, dec = 1) => {
          const filtered = (vals || []).map(r => r[col]).filter((v: any) => v != null && !isNaN(Number(v)));
          if (filtered.length === 0) return 'N/A';
          return (filtered.reduce((a: number, b: any) => a + Number(b), 0) / filtered.length).toFixed(dec);
        };

        const hasAdv = advRows && advRows.length > 0;

        const traditionalSection = [
          `TRADITIONAL STATS (${gp} games played):`,
          `  Per game: ${avgPts} PPG | ${avgReb} RPG | ${avgAst} APG | ${avgStl} SPG | ${avgBlk} BPG`,
          `  Season totals: ${p.total_pts ?? 0} pts | ${p.total_reb ?? 0} reb | ${p.total_ast ?? 0} ast | ${p.total_stl ?? 0} stl | ${p.total_blk ?? 0} blk`,
          `  Shooting: FG ${fgm}/${fga} (${fgPct}%) | 3PT ${tpm}/${tpa} (${tpPct}%) | FT ${ftm}/${fta} (${ftPct}%)`,
        ].join('\n');

        const advancedSection = hasAdv ? [
          `ADVANCED METRICS (season averages across ${advRows!.length} games):`,
          `  Efficiency: eFG% ${fmtAdv(advRows!, 'efg_percent')}% | TS% ${fmtAdv(advRows!, 'ts_percent')}% | PIE ${fmtAdv(advRows!, 'pie')}%`,
          `  Usage & Creation: USG% ${fmtAdv(advRows!, 'usage_percent')}% | AST% ${fmtAdv(advRows!, 'ast_percent')}% | TOV% ${fmtAdv(advRows!, 'tov_percent')}%`,
          `  Rebounding: OREB% ${fmtAdv(advRows!, 'oreb_percent')}% | DREB% ${fmtAdv(advRows!, 'dreb_percent')}% | REB% ${fmtAdv(advRows!, 'reb_percent')}%`,
          `  Ratings: OFF RTG ${fmtAdv(advRows!, 'off_rating')} | DEF RTG ${fmtAdv(advRows!, 'def_rating')} | NET RTG ${fmtAdv(advRows!, 'net_rating')}`,
          `  Shot distribution: 2PT% of pts ${fmtAdv(advRows!, 'pts_percent_2pt')}% | 3PT% of pts ${fmtAdv(advRows!, 'pts_percent_3pt')}% | FT% of pts ${fmtAdv(advRows!, 'pts_percent_ft')}%`,
          `  3PT rate (share of FGA from 3): ${fmtAdv(advRows!, 'three_point_rate')}%`,
          `  Paint pts share: ${fmtAdv(advRows!, 'pts_percent_pitp')}% | Fastbreak pts share: ${fmtAdv(advRows!, 'pts_percent_fastbreak')}%`,
        ].join('\n') : 'ADVANCED METRICS: Not available for this player.';

        const leagueContext = (() => {
          const leagueAvgPts = playersData.length > 0
            ? (playersData.reduce((s: number, pl: any) => s + (pl.avg_pts ?? 0), 0) / playersData.length).toFixed(1)
            : 'N/A';
          const leagueAvgAst = playersData.length > 0
            ? (playersData.reduce((s: number, pl: any) => s + (pl.avg_ast ?? 0), 0) / playersData.length).toFixed(1)
            : 'N/A';
          const leagueAvgReb = playersData.length > 0
            ? (playersData.reduce((s: number, pl: any) => s + (pl.avg_reb ?? 0), 0) / playersData.length).toFixed(1)
            : 'N/A';
          const rankPts = [...playersData].sort((a: any, b: any) => (b.avg_pts ?? 0) - (a.avg_pts ?? 0)).findIndex((pl: any) => pl.player_name === p.player_name) + 1;
          const rankAst = [...playersData].sort((a: any, b: any) => (b.avg_ast ?? 0) - (a.avg_ast ?? 0)).findIndex((pl: any) => pl.player_name === p.player_name) + 1;
          const rankReb = [...playersData].sort((a: any, b: any) => (b.avg_reb ?? 0) - (a.avg_reb ?? 0)).findIndex((pl: any) => pl.player_name === p.player_name) + 1;
          return [
            `LEAGUE CONTEXT (${leagueName}, ${playersData.length} players):`,
            `  League avg per game: ${leagueAvgPts} PPG | ${leagueAvgReb} RPG | ${leagueAvgAst} APG`,
            `  ${p.player_name}'s league rank: Scoring #${rankPts || '?'} | Assists #${rankAst || '?'} | Rebounds #${rankReb || '?'}`,
          ].join('\n');
        })();

        const focusNote = is(['playmaking', 'playmaker', 'passing', 'assist', 'vision', 'dish'])
          ? 'FOCUS: Analyse this player\'s playmaking — AST%, assist totals, TOV%, usage, and creation ability.'
          : is(['scoring', 'scorer', 'offensive', 'offense', 'shooting'])
          ? 'FOCUS: Analyse this player\'s scoring — PPG, eFG%, TS%, shot distribution (2PT/3PT/FT/paint), usage.'
          : is(['defence', 'defense', 'defensive', 'defender', 'stopper'])
          ? 'FOCUS: Analyse this player\'s defence — DEF RTG, steals, blocks, net rating, and defensive impact.'
          : is(['rebound', 'rebounding', 'boards', 'glass'])
          ? 'FOCUS: Analyse this player\'s rebounding — OREB%, DREB%, REB%, total boards, boards per game.'
          : 'FOCUS: Provide a full strengths/weaknesses breakdown covering scoring, playmaking, defence, and rebounding.';

        const rawData = [
          `PLAYER ANALYSIS REQUEST: ${question}`,
          `Player: ${p.player_name} | Team: ${p.team_name} | League: ${leagueName}`,
          ``,
          focusNote,
          ``,
          traditionalSection,
          ``,
          advancedSection,
          ``,
          leagueContext,
          ``,
          `Provide a detailed, NBA-coaching-style analysis addressing the user's specific question. Use the traditional and advanced stats as evidence. Highlight genuine strengths with supporting numbers, and note any areas for improvement. Be specific and insightful.`
        ].join('\n');

        return aiEnhance(rawData, {
          content: `### ${p.player_name} — Player Analysis\n*${p.team_name} · ${gp} games*\n\n**Traditional Stats**\n- **Points:** ${avgPts} PPG (${p.total_pts ?? 0} total)\n- **Assists:** ${avgAst} APG (${p.total_ast ?? 0} total)\n- **Rebounds:** ${avgReb} RPG (${p.total_reb ?? 0} total)\n- **Steals/Blocks:** ${avgStl}/${avgBlk} per game\n\n**Shooting**\n- **FG:** ${fgm}/${fga} (${fgPct}%)\n- **3PT:** ${tpm}/${tpa} (${tpPct}%)\n- **FT:** ${ftm}/${fta} (${ftPct}%)\n\n${hasAdv ? `**Advanced**\n- **eFG%:** ${fmtAdv(advRows!, 'efg_percent')}% · **TS%:** ${fmtAdv(advRows!, 'ts_percent')}%\n- **USG%:** ${fmtAdv(advRows!, 'usage_percent')}% · **AST%:** ${fmtAdv(advRows!, 'ast_percent')}%\n- **NET RTG:** ${fmtAdv(advRows!, 'net_rating')}\n- **PIE:** ${fmtAdv(advRows!, 'pie')}%` : ''}`,
          suggestions: [
            `What are ${p.player_name}'s scoring strengths?`,
            `What is ${p.player_name}'s defensive impact?`,
            `Who are ${p.team_name}'s top players?`
          ],
          navigationButtons: [{ label: `${p.player_name}'s Profile`, id: playerSlug(p), type: 'player' as const }]
        });
      }

      // ── PLAYER LEAGUE RANK: "where does [player] rank in scoring / how does he compare?" ──
      const isRankQuery = is(['rank', 'ranked', 'where does', 'compare in', 'in the league', 'compared to league',
        'compared to other', 'how does he compare', 'league rank', 'league standing in', 'how does she compare',
        'compared to the rest', 'compared to everyone', 'vs the league', 'league average']);
      const rankPlayer = resolveContextualPlayer();
      const rankStat = detectedStat ?? (
        is(['scoring', 'point', 'pts', 'ppg']) ? STAT_MAP.find(s => s.label === 'Points') :
        is(['rebound', 'board', 'rpg']) ? STAT_MAP.find(s => s.label === 'Rebounds') :
        is(['assist', 'apg']) ? STAT_MAP.find(s => s.label === 'Assists') :
        null
      ) ?? null;
      if (isRankQuery && rankPlayer && rankStat) {
        const sortCol = rankStat.avgColumn ?? rankStat.column;
        const isPercent = sortCol === 'season_fg_pct' || sortCol === 'season_tp_pct' || sortCol === 'season_ft_pct';
        const rankAttCol = rankStat.attemptsColumn;
        const rankUserThreshold = parseMinAttemptsPerGame(q);
        const rankDefaultThreshold = sortCol === 'season_tp_pct' ? 1.5 : 1.0;
        const rankPerGameThreshold = isPercent ? (rankUserThreshold ?? rankDefaultThreshold) : 0;
        const qualifiedPlayers = isPercent && rankAttCol
          ? playersData.filter((p: any) => {
              const gp = p.games_played ?? 1;
              const totalAtt = p[rankAttCol] ?? 0;
              return gp > 0 && (totalAtt / gp) >= rankPerGameThreshold;
            })
          : playersData;
        const sortedAll = [...qualifiedPlayers].sort((a: any, b: any) => (b[sortCol] ?? 0) - (a[sortCol] ?? 0));
        const playerIsQualified = sortedAll.some(p => p.player_name === rankPlayer.player_name);
        const playerRank = playerIsQualified
          ? sortedAll.findIndex(p => p.player_name === rankPlayer.player_name) + 1
          : -1;
        const playerValNum = rankPlayer[sortCol] != null ? Number(rankPlayer[sortCol]) : 0;
        const hypotheticalRank = !playerIsQualified
          ? sortedAll.filter((p: any) => (p[sortCol] ?? 0) > playerValNum).length + 1
          : playerRank;
        const leagueAvg = sortedAll.length > 0
          ? sortedAll.reduce((sum, p: any) => sum + (p[sortCol] ?? 0), 0) / sortedAll.length
          : null;
        const showRows: any[] = sortedAll.slice(0, 3);
        if (playerIsQualified && playerRank > 3) {
          if (playerRank > 4) showRows.push(null);
          showRows.push(sortedAll[playerRank - 1]);
          if (playerRank < sortedAll.length) showRows.push(sortedAll[playerRank]);
        }
        if (!playerIsQualified) {
          const existingNames = new Set(showRows.filter(Boolean).map((p: any) => p.player_name));
          if (hypotheticalRank > 3) {
            if (hypotheticalRank > 4) showRows.push(null);
            const aboveIdx = hypotheticalRank - 2;
            if (aboveIdx >= 0 && aboveIdx < sortedAll.length && !existingNames.has(sortedAll[aboveIdx].player_name)) {
              showRows.push(sortedAll[aboveIdx]);
            }
          }
          showRows.push(rankPlayer);
          const belowIdx = hypotheticalRank - 1;
          if (belowIdx < sortedAll.length && !existingNames.has(sortedAll[belowIdx].player_name)) {
            showRows.push(sortedAll[belowIdx]);
          }
        }

        const fmtRow = (p: any, rank: number, unqualifiedTag?: boolean) => {
          const val = p[sortCol] != null ? Number(p[sortCol]).toFixed(1) : 'N/A';
          const isTarget = p.player_name === rankPlayer.player_name;
          const uqLabel = unqualifiedTag ? ' (unqualified)' : '';
          return `${isTarget ? '▶' : ' '} ${rank}. ${p.player_name} (${p.team_name}) — ${val}${isPercent ? '%' : ''} ${rankStat.avgLabel ?? rankStat.label} · ${p.games_played ?? '?'} GP${uqLabel}`;
        };
        const tableRows = showRows.map((p, i) => {
          if (p === null) return '   ...';
          if (!playerIsQualified && p.player_name === rankPlayer.player_name) {
            return fmtRow(p, hypotheticalRank, true);
          }
          const rank = sortedAll.findIndex(x => x.player_name === p.player_name) + 1;
          return fmtRow(p, rank);
        }).join('\n');

        const playerVal = rankPlayer[sortCol] != null ? Number(rankPlayer[sortCol]).toFixed(1) : 'N/A';
        const leagueAvgStr = leagueAvg != null ? leagueAvg.toFixed(1) : 'N/A';
        const rankNote = playerIsQualified
          ? `ranks #${playerRank} of ${sortedAll.length} qualified players`
          : `does not meet the minimum ${rankPerGameThreshold} attempts/game threshold to qualify — would rank #${hypotheticalRank} of ${sortedAll.length} qualified players if eligible`;
        const thresholdLine = isPercent ? `Qualification threshold: ${rankPerGameThreshold} attempts per game (${sortedAll.length} players qualified)` : '';
        const rawData = [
          `${leagueName} — ${rankStat.label} League Rankings (per game):`,
          ``,
          tableRows,
          ``,
          `Player in focus: ${rankPlayer.player_name} (${rankPlayer.team_name}) — ${rankNote}`,
          `Their average: ${playerVal}${isPercent ? '%' : ''} ${rankStat.avgLabel ?? rankStat.label}`,
          `League average: ${leagueAvgStr}${isPercent ? '%' : ''} ${rankStat.avgLabel ?? rankStat.label}`,
          thresholdLine,
          ``,
          `Write a concise NBA-style analysis of where ${rankPlayer.player_name} ranks in ${rankStat.label.toLowerCase()}, comparing them to the league average and nearby players. Be specific and insightful.`
        ].join('\n');

        const rankDisplay = playerIsQualified ? `#${playerRank}` : `Unqualified (would be #${hypotheticalRank})`;
        const thresholdFooter = isPercent ? `\n_Minimum ${rankPerGameThreshold} attempts per game to qualify_` : '';
        return aiEnhance(rawData, {
          content: `### ${rankPlayer.player_name} — ${rankStat.label} Ranking\n*${rankDisplay} in ${leagueName}*\n\n${tableRows}\n\n*League average: ${leagueAvgStr}${isPercent ? '%' : ''} ${rankStat.avgLabel ?? rankStat.label}*${thresholdFooter}`,
          suggestions: [
            `How is ${rankPlayer.player_name} performing overall?`,
            `Where does ${rankPlayer.player_name} rank in assists?`,
            `Top scorers in the league`
          ],
          navigationButtons: [{ label: `${rankPlayer.player_name}'s Profile`, id: playerSlug(rankPlayer), type: 'player' as const }]
        });
      }

      // ── NAME SCAN FALLBACK: any question containing a player name (or pronoun follow-up) ──
      const scannedPlayer = resolveContextualPlayer();
      if (scannedPlayer) {
        const p = scannedPlayer;
        const gp = p.games_played ?? 1;
        const fgm = p.total_fgm ?? 0;
        const fga = p.total_fga ?? 0;
        const tpm = p.total_tpm ?? 0;
        const tpa = p.total_tpa ?? 0;
        const ftm = p.total_ftm ?? 0;
        const fta = p.total_fta ?? 0;
        const fgPct = p.season_fg_pct != null ? Number(p.season_fg_pct).toFixed(1) : (fga > 0 ? ((fgm/fga)*100).toFixed(1) : 'N/A');
        const tpPct = p.season_tp_pct != null ? Number(p.season_tp_pct).toFixed(1) : (tpa > 0 ? ((tpm/tpa)*100).toFixed(1) : 'N/A');
        const ftPct = p.season_ft_pct != null ? Number(p.season_ft_pct).toFixed(1) : (fta > 0 ? ((ftm/fta)*100).toFixed(1) : 'N/A');
        const avgPts = p.avg_pts != null ? Number(p.avg_pts).toFixed(1) : (gp > 0 ? ((p.total_pts ?? 0) / gp).toFixed(1) : 'N/A');
        const avgReb = p.avg_reb != null ? Number(p.avg_reb).toFixed(1) : (gp > 0 ? ((p.total_reb ?? 0) / gp).toFixed(1) : 'N/A');
        const avgAst = p.avg_ast != null ? Number(p.avg_ast).toFixed(1) : (gp > 0 ? ((p.total_ast ?? 0) / gp).toFixed(1) : 'N/A');
        const avgStl = p.avg_stl != null ? Number(p.avg_stl).toFixed(1) : (gp > 0 ? ((p.total_stl ?? 0) / gp).toFixed(1) : 'N/A');
        const avgBlk = p.avg_blk != null ? Number(p.avg_blk).toFixed(1) : (gp > 0 ? ((p.total_blk ?? 0) / gp).toFixed(1) : 'N/A');
        // League rank context for the AI
        const ptsRank = [...playersData].sort((a: any, b: any) => (b.avg_pts ?? 0) - (a.avg_pts ?? 0)).findIndex(x => x.player_name === p.player_name) + 1;
        const rawData = [
          `${leagueName} — Player: ${p.player_name} (${p.team_name}) · ${gp} games`,
          ``,
          `Season Averages:`,
          `  Points: ${avgPts} PPG (${p.total_pts ?? 0} total) — ranks #${ptsRank} in league`,
          `  Rebounds: ${avgReb} RPG (${p.total_reb ?? 0} total)`,
          `  Assists: ${avgAst} APG (${p.total_ast ?? 0} total)`,
          `  Steals: ${avgStl} SPG · Blocks: ${avgBlk} BPG`,
          `Shooting: FG ${fgm}/${fga} (${fgPct}%) · 3PT ${tpm}/${tpa} (${tpPct}%) · FT ${ftm}/${fta} (${ftPct}%)`,
          ``,
          `Answer the user's question about ${p.player_name}. Lead with per-game averages, not totals.`
        ].join('\n');
        return aiEnhance(rawData, {
          content: `### ${p.player_name}\n*${p.team_name} · ${gp} games*\n\n**Season Averages**\n- **Points:** ${avgPts} PPG (${p.total_pts ?? 0} total)\n- **Rebounds:** ${avgReb} RPG\n- **Assists:** ${avgAst} APG\n- **Steals/Blocks:** ${avgStl}/${avgBlk} per game\n\n**Shooting**\n- **FG:** ${fgm}/${fga} (${fgPct}%)\n- **3PT:** ${tpm}/${tpa} (${tpPct}%)\n- **FT:** ${ftm}/${fta} (${ftPct}%)`,
          suggestions: [`How is ${p.player_name} performing?`, `Where does ${p.player_name} rank in scoring?`, `Who are ${p.team_name}'s top players?`],
          navigationButtons: [{ label: `${p.player_name}'s Profile`, id: playerSlug(p), type: 'player' as const }]
        });
      }

      // ── ADVANCED STATS FOR A SPECIFIC TEAM ────────────────────────────
      if (isAdvancedQuery) {
        const foundTeam = resolveContextualTeam();
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
      const scannedTeam = resolveContextualTeam();
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
        const teamRecord = teamStanding >= 0 ? standings[teamStanding][1] : null;
        const recordStr = teamRecord ? `${teamRecord.wins}W-${teamRecord.losses}L` : null;
        const standingText = teamStanding >= 0 ? `*League Position: #${teamStanding + 1}${recordStr ? ` · ${recordStr}` : ''}*` : '';

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
      const fallbackStandings = computeStandings();
      const fallbackStandingsMap = Object.fromEntries(fallbackStandings);
      const topTeams = teamsData.slice(0, 10).map((t: any) => {
        const fg = t.season_fg_pct != null ? `${Number(t.season_fg_pct).toFixed(1)}%` : 'N/A';
        const tp = t.season_tp_pct != null ? `${Number(t.season_tp_pct).toFixed(1)}%` : 'N/A';
        const rec = fallbackStandingsMap[t.team_name];
        const record = rec ? ` [${rec.wins}W-${rec.losses}L]` : '';
        return `${t.team_name}${record}: ${t.avg_pts != null ? Number(t.avg_pts).toFixed(1) : '?'}ppg, ${t.avg_reb != null ? Number(t.avg_reb).toFixed(1) : '?'}rpg, ${t.avg_ast != null ? Number(t.avg_ast).toFixed(1) : '?'}apg, 3PM/g: ${t.avg_tpm != null ? Number(t.avg_tpm).toFixed(1) : '?'} (${tp}), FG%: ${fg}, GP: ${t.games_played ?? '?'}`;
      }).join('\n');
      // If this is a pronoun follow-up, prepend the last mentioned player's details so the AI
      // knows which player "he/his/him" refers to — without relying on the AI to guess.
      let contextualPlayerNote = '';
      if (isPronounPlayer && lastMentionedPlayer.current) {
        const lp = lastMentionedPlayer.current;
        const lpFg = lp.season_fg_pct != null ? `${Number(lp.season_fg_pct).toFixed(1)}%` : 'N/A';
        const lpTp = lp.season_tp_pct != null ? `${Number(lp.season_tp_pct).toFixed(1)}%` : 'N/A';
        contextualPlayerNote = `CONTEXT: The user's question uses a pronoun (he/his/him) referring to the previously discussed player: ${lp.player_name} (${lp.team_name}) — ${lp.total_pts ?? 0}pts, ${lp.total_reb ?? 0}reb, ${lp.total_ast ?? 0}ast | FG%: ${lpFg} | 3PT%: ${lpTp} | GP: ${lp.games_played ?? 0}. Answer the question specifically about ${lp.player_name}.\n\n`;
      }
      const leagueDataContext = `${contextualPlayerNote}League: ${leagueName}\n\nTOP PLAYERS:\n${topPlayers || 'None'}\n\nTEAM SEASON AVERAGES:\n${topTeams || 'None'}\n\nRECENT RESULTS:\n${recentGames || 'None'}`;

      try {
        const BASE = getPythonBackendUrl();
        const response = await fetch(`${BASE}/api/chat/league`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, league_id: leagueId, league_data: leagueDataContext }),
          signal: AbortSignal.timeout(25000)
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
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-orange-200 dark:border-neutral-800 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
          <h3 className="font-semibold text-slate-800 dark:text-white">League Assistant</h3>
        </div>
        <div className="text-center text-slate-500 dark:text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!leagueId) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-orange-200 dark:border-neutral-800 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
          <h3 className="font-semibold text-slate-800 dark:text-white">League Assistant</h3>
        </div>
        <div className="text-center text-slate-500 dark:text-slate-400">Please select a league to use the assistant.</div>
      </div>
    );
  }

  // The chatbot is not yet available in this release. Show a "coming later"
  // experience for all users (authenticated or not) until the entitlement is
  // activated server-side.
  {
    const comingSoonUi = (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-orange-200 dark:border-neutral-800 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
          <h3 className="font-semibold text-slate-800 dark:text-white">League Assistant</h3>
          <span className="px-2 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-xs rounded-full font-medium">
            COMING SOON
          </span>
        </div>

        <div className="text-center py-6">
          <MessageCircle className="w-12 h-12 text-orange-400 dark:text-orange-500 mx-auto mb-3" />
          <h4 className="font-medium text-slate-800 dark:text-white mb-2">Coming Soon</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Get instant insights about {leagueName ?? "your league"} — player stats, game results, and more!
          </p>

          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300 mb-2">
              <BarChart3 className="w-4 h-4" />
              <span className="font-medium">What you&apos;ll be able to ask:</span>
            </div>
            <ul className="text-xs text-orange-600 dark:text-orange-400 space-y-1">
              <li>• Top scorers and rebounders</li>
              <li>• Recent game results</li>
              <li>• Team standings</li>
              <li>• Player performance stats</li>
            </ul>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-500 italic">
            This feature is currently in development and will be available soon!
          </div>
        </div>
      </div>
    );
    // Chatbot enabled. Flip back to `true` to restore the "Coming Soon" placeholder.
    if (false as boolean) return comingSoonUi;
  }

  if (!user) {
    return null; // unreachable — kept for future entitlement gate
  }

  // In panel mode, always show expanded and don't allow overlay
  if (isPanelMode) {
    const bubbleProseClasses = "prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-0 [&_h3]:mb-1.5 [&_strong]:font-semibold [&_table]:text-xs [&_table]:my-2 [&_th]:text-left [&_th]:font-semibold [&_th]:pb-1 [&_td]:py-0.5 [&_td]:pr-3";

    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden h-full flex flex-col shadow-lg">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <MessageCircle className="w-5 h-5" style={{ color: readableBrand }} />
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">League Assistant</h3>
          </div>
        </div>

        {/* Chat Content */}
        <div className="flex-1 flex flex-col p-4 min-h-0">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Ask about {leagueName} — standings, stats, players, anything.
              </p>
              <div className="space-y-2">
                {suggestedQuestions.slice(0, 4).map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleSendMessage(question)}
                    disabled={isLoading}
                    className="w-full flex items-center gap-3 text-left p-3 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60 transition-colors disabled:opacity-60"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = brandColor; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = ''; }}
                  >
                    <MessageCircle className="w-4 h-4 shrink-0 text-slate-400 dark:text-neutral-500" />
                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{question}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto mb-3 min-h-0 pr-1">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.type === 'bot' && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: `${brandColor}1a` }}
                    >
                      <Bot className="w-4 h-4" style={{ color: readableBrand }} />
                    </div>
                  )}
                  <div className={`flex flex-col ${message.structured ? 'max-w-full flex-1' : 'max-w-[88%]'}`}>
                    {message.structured ? (
                      renderStructuredContent(message.structured, brandColor)
                    ) : (
                      <div
                        className={`px-3.5 py-2.5 text-sm leading-relaxed ${
                          message.type === 'user'
                            ? 'text-white rounded-2xl rounded-tr-sm'
                            : 'bg-gray-50 dark:bg-neutral-800 text-slate-800 dark:text-slate-100 border border-gray-200 dark:border-neutral-700 rounded-2xl rounded-tl-sm'
                        }`}
                        style={message.type === 'user' ? { backgroundColor: brandColor } : undefined}
                      >
                        <div className={bubbleProseClasses}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.type === 'bot' && message.displayedContent !== undefined ? message.displayedContent : message.content}</ReactMarkdown>
                          {message.type === 'bot' && message.displayedContent !== undefined && message.displayedContent.length < message.content.length && (
                            <span className="animate-pulse font-bold" style={{ color: readableBrand }}>▌</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Suggestion chips */}
                    {message.type === 'bot' && message.suggestions && message.suggestions.length > 0 && (message.displayedContent === undefined || message.displayedContent.length >= message.content.length) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {message.suggestions.slice(0, 2).map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSendMessage(suggestion)}
                            className="px-2.5 py-1 text-xs rounded-full transition-colors border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-slate-300 hover:text-white"
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = brandColor; (e.currentTarget as HTMLElement).style.borderColor = brandColor; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; (e.currentTarget as HTMLElement).style.borderColor = ''; }}
                            disabled={isLoading}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Navigation buttons - profile/team links */}
                    {message.type === 'bot' && message.navigationButtons && message.navigationButtons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {message.navigationButtons.map((button, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              if (button.type === 'player') {
                                setLocation(`/player/${button.id}`);
                              } else if (button.type === 'team') {
                                setLocation(leagueSlug ? `/competition/${leagueSlug}/team/${button.id}` : `/team/${button.id}`);
                              }
                            }}
                            className="px-2.5 py-1 text-xs rounded-full transition-colors border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 flex items-center gap-1"
                          >
                            <User className="w-3 h-3" />
                            {button.label}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {message.type === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-neutral-700 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-slate-500 dark:text-neutral-400" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: `${brandColor}1a` }}
                  >
                    <Bot className="w-4 h-4" style={{ color: readableBrand }} />
                  </div>
                  <div className="bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm">
                    <span className="italic text-slate-500 dark:text-slate-400">{LOADING_PHRASES[loadingPhraseIdx]}</span>
                    <span className="animate-pulse font-bold ml-0.5" style={{ color: readableBrand }}>▌</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-neutral-800 shrink-0">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask about stats, games, players..."
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              className="text-sm py-2 px-3.5 rounded-full border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus-visible:ring-1"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              aria-label="Send message"
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: brandColor }}
            >
              <Send className="w-4 h-4" />
            </button>
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
          <div className="w-96 h-[560px] bg-white rounded-2xl shadow-2xl border border-orange-200 flex flex-col overflow-hidden"
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
                      <div className={`flex flex-col ${message.structured ? 'max-w-full flex-1' : 'max-w-[85%]'}`}>
                        {message.structured ? (
                          renderStructuredContent(message.structured, brandColor)
                        ) : (
                          <div className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                            message.type === 'user'
                              ? 'bg-orange-500 text-white'
                              : 'bg-slate-50 text-slate-800 border border-slate-200'
                          }`}>
                            <div className="prose prose-sm max-w-none text-xs [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-0.5 [&_p]:text-xs [&_ul]:my-0.5 [&_ul]:text-xs [&_ol]:my-0.5 [&_li]:my-0 [&_li]:text-xs [&_h3]:text-xs [&_h3]:font-bold [&_h3]:mt-0 [&_h3]:mb-0.5 [&_strong]:font-semibold [&_table]:text-xs [&_td]:text-xs [&_th]:text-xs">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.type === 'bot' && message.displayedContent !== undefined ? message.displayedContent : message.content}</ReactMarkdown>
                              {message.type === 'bot' && message.displayedContent !== undefined && message.displayedContent.length < message.content.length && (
                                <span className="animate-pulse text-orange-400 font-bold">▌</span>
                              )}
                            </div>
                          </div>
                        )}
                        {message.type === 'bot' && message.suggestions && message.suggestions.length > 0 && (message.displayedContent === undefined || message.displayedContent.length >= message.content.length) && (
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
                                  else if (button.type === 'team') setLocation(leagueSlug ? `/competition/${leagueSlug}/team/${button.id}` : `/team/${button.id}`);
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
                        <span className="text-orange-500 italic text-xs">{LOADING_PHRASES[loadingPhraseIdx]}</span>
                        <span className="animate-pulse text-orange-400 font-bold ml-0.5">▌</span>
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.type === 'bot' && message.displayedContent !== undefined ? message.displayedContent : message.content}</ReactMarkdown>
                        {message.type === 'bot' && message.displayedContent !== undefined && message.displayedContent.length < message.content.length && (
                          <span className="animate-pulse text-orange-400 font-bold">▌</span>
                        )}
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
                                    setLocation(leagueSlug ? `/competition/${leagueSlug}/team/${button.id}` : `/team/${button.id}`);
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
                    <span className="text-orange-500 italic">{LOADING_PHRASES[loadingPhraseIdx]}</span>
                    <span className="animate-pulse text-orange-400 font-bold ml-0.5">▌</span>
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