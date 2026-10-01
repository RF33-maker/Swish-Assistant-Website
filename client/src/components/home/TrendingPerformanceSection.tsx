import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import CardFanCarousel from "@/components/ui/card-fan-carousel";
import SectionHeader from "@/components/home/SectionHeader";
import TradingCard, { type TradingCardPerformance } from "@/components/cards/TradingCard";
import { Flame, Loader2, Trophy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

interface PerfRow {
  league_id: string;
  game_date: string | null;
  game_key: string | null;
  player_id: string;
  full_name: string;
  team_id: string | null;
  team_name: string | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fgm?: number | null;
  fga: number | null;
  ftm?: number | null;
  fta: number | null;
  tpm?: number | null;
  tpa?: number | null;
  ts_pct: number | null;
  game_score: number | null;
  opponent_name?: string | null;
  game_result?: string | null;
}

interface PlayerMetaRow {
  id: string;
  slug: string | null;
  photo_path_bg_removed: string | null;
}

interface LeagueMetaRow {
  league_id: string;
  name: string | null;
}

interface TrendingCompetition {
  league_id: string;
  name: string;
  logo_url: string | null;
}

interface TrendingData {
  perfs: PerfRow[];
  leagueNames: Record<string, string>;
  leagueLogos: Record<string, string | null>;
  /** The picker's competitions, and the one shown (null for "latest"). */
  competitions: TrendingCompetition[];
  competitionId: string | null;
  /** `photoUrl` is the cut-out; `profilePhotoUrl` the ordinary profile photo. */
  playerMeta: Record<string, { slug: string | null; photoUrl: string | null; profilePhotoUrl: string | null; profileAvailable: boolean }>;
}

const ROTATE_MS = 6000;
/** The picker's default: the newest games, whichever competition they're in. */
const LATEST = "latest";

/** Where a performance's card opens: the player's profile, when it's public. */
function profileHref(perf: PerfRow, meta: TrendingData["playerMeta"][string] | undefined): string | null {
  // Fall back to the raw player_id only when we know the player's own league is
  // public — RLS hides the row (and the profile page 404s) otherwise.
  if (meta?.slug) return `/player/${meta.slug}`;
  if (perf.player_id && meta?.profileAvailable) return `/player/${perf.player_id}`;
  return null;
}

/** A trending row in the shared trading card's shape. */
function toCardPerformance(
  perf: PerfRow,
  leagueName: string | undefined,
  leagueLogo: string | null | undefined,
  meta: TrendingData["playerMeta"][string] | undefined,
): TradingCardPerformance {
  return {
    playerId: perf.player_id,
    playerName: perf.full_name,
    teamName: perf.team_name,
    leagueId: perf.league_id,
    leagueName,
    leagueLogo,
    gameDate: perf.game_date,
    opponentName: perf.opponent_name,
    gameResult: perf.game_result,
    gameScore: perf.game_score,
    pts: perf.pts,
    reb: perf.reb,
    ast: perf.ast,
    stl: perf.stl,
    blk: perf.blk,
    tov: perf.tov,
    fgm: perf.fgm,
    fga: perf.fga,
    tpm: perf.tpm,
    tpa: perf.tpa,
    ftm: perf.ftm,
    fta: perf.fta,
    tsPct: perf.ts_pct,
    cutoutUrl: meta?.photoUrl,
    profilePhotoUrl: meta?.profilePhotoUrl,
  };
}

/** Fetches one pick of trending performances: the latest, or one competition's. */
async function fetchTrending(competition: string): Promise<TrendingData> {
  const empty: TrendingData = { perfs: [], leagueNames: {}, leagueLogos: {}, playerMeta: {}, competitions: [], competitionId: null };
  try {
    const query = competition === LATEST ? "" : `?competition=${encodeURIComponent(competition)}`;
    const res = await fetch(`/api/home/trending-performances${query}`);
    if (!res.ok) return empty;
    const json = await res.json() as {
      perfs: PerfRow[];
      leagueNames: Record<string, string>;
      leagueLogos?: Record<string, string | null>;
      playerMeta: Record<string, { slug: string | null; photo_path_bg_removed: string | null; photo_path?: string | null; profileAvailable: boolean }>;
      competitions?: TrendingCompetition[];
      competitionId?: string | null;
    };
    const playerMeta: TrendingData["playerMeta"] = {};
    for (const [id, meta] of Object.entries(json.playerMeta || {})) {
      playerMeta[id] = {
        slug: meta.slug,
        photoUrl: getPlayerPhotoUrlCached(meta.photo_path_bg_removed),
        profilePhotoUrl: getPlayerPhotoUrlCached(meta.photo_path),
        profileAvailable: meta.profileAvailable,
      };
    }
    return {
      perfs: json.perfs || [],
      leagueNames: json.leagueNames || {},
      leagueLogos: json.leagueLogos || {},
      playerMeta,
      competitions: json.competitions || [],
      competitionId: json.competitionId ?? null,
    };
  } catch (err) {
    console.error("[TrendingPerf] fetch error", err);
    return empty;
  }
}

const trendingKey = (competition: string) => ["home", "trending-performance", "v17-competitions", competition];

/** A competition's logo in a small tile; a flame for "latest games". */
function CompetitionMark({ competition }: { competition?: TrendingCompetition }) {
  if (!competition) {
    return (
      <span className="h-6 w-6 shrink-0 rounded-md bg-orange-500/10 text-orange-500 flex items-center justify-center">
        <Flame className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="h-6 w-6 shrink-0 rounded-md bg-white ring-1 ring-black/5 flex items-center justify-center overflow-hidden">
      {competition.logo_url ? (
        <img src={competition.logo_url} alt="" className="h-5 w-5 object-contain" />
      ) : (
        <Trophy className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * The homepage's trending performances: the best recent stat lines across
 * our leagues, dealt out as a fanned hand of trading cards. The centre card
 * opens the player; side cards come to the centre; it advances on its own
 * every few seconds while it's on screen. A picker switches from the latest
 * games to any competition that's played recently.
 */
export default function TrendingPerformanceSection({
  headerClassName = "max-w-7xl mx-auto px-5 md:px-8",
}: {
  /** Where the heading sits, so it can line up with the page around it. */
  headerClassName?: string;
} = {}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [competition, setCompetition] = useState(LATEST);

  const { data, isLoading, isPlaceholderData } = useQuery<TrendingData>({
    queryKey: trendingKey(competition),
    queryFn: () => fetchTrending(competition),
    staleTime: 15 * 1000,
    refetchInterval: competition === LATEST ? 30 * 1000 : 60 * 1000,
    refetchOnWindowFocus: true,
    // Keep the current hand on the table while another competition loads.
    placeholderData: keepPreviousData,
  });

  // The picker keeps its list even if one competition's request fails.
  const [options, setOptions] = useState<TrendingCompetition[]>([]);
  useEffect(() => {
    if (data?.competitions.length) setOptions(data.competitions);
  }, [data?.competitions]);

  // Opening the picker warms every competition, so a choice lands quickly.
  const prefetchCompetitions = () => {
    for (const c of options) {
      void queryClient.prefetchQuery({
        queryKey: trendingKey(c.league_id),
        queryFn: () => fetchTrending(c.league_id),
        staleTime: 60 * 1000,
      });
    }
  };

  const perfs = data?.perfs ?? [];
  const leagueNames = data?.leagueNames ?? {};
  const leagueLogos = data?.leagueLogos ?? {};
  const playerMeta = data?.playerMeta ?? {};
  const selected = options.find((c) => c.league_id === competition);
  const switching = isPlaceholderData;

  const open = (perf: PerfRow) => {
    const href = profileHref(perf, playerMeta[perf.player_id]);
    if (href) setLocation(href);
  };

  if (competition === LATEST && !isLoading && perfs.length === 0) return null;

  const picker = options.length > 0 ? (
    <Select
      value={competition}
      onValueChange={setCompetition}
      onOpenChange={(isOpen) => { if (isOpen) prefetchCompetitions(); }}
    >
      <SelectTrigger
        aria-label="Show performances from"
        className="h-11 w-full sm:w-[290px] rounded-xl border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] px-3.5 text-left text-sm font-semibold text-[color:var(--ch-text)] shadow-[var(--ch-shadow)] focus:ring-2 focus:ring-orange-400/50 focus:ring-offset-0"
        data-testid="trending-competition-picker"
      >
        {/* The trigger line-clamps its direct span, so the row sits inside one. */}
        <span>
          <span className="flex items-center gap-2.5 min-w-0">
            {switching ? (
              <span className="h-6 w-6 shrink-0 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" aria-hidden="true" />
              </span>
            ) : (
              <CompetitionMark competition={selected} />
            )}
            <span className="truncate">{selected?.name ?? "Latest games"}</span>
          </span>
        </span>
      </SelectTrigger>
      <SelectContent className="rounded-xl p-1 shadow-xl" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
        <SelectItem value={LATEST} className="rounded-lg py-2 pr-3 text-sm font-medium">
          <span className="flex items-center gap-2.5">
            <CompetitionMark />
            Latest games
          </span>
        </SelectItem>
        {options.map((c) => (
          <SelectItem key={c.league_id} value={c.league_id} className="rounded-lg py-2 pr-3 text-sm font-medium">
            <span className="flex items-center gap-2.5 min-w-0">
              <CompetitionMark competition={c} />
              <span className="truncate">{c.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : undefined;

  return (
    <section className="py-10 md:py-14" aria-labelledby="trending-heading">
      <div className={headerClassName}>
        <SectionHeader
          id="trending-heading"
          eyebrow="Trending"
          title="Top performances"
          description={
            selected
              ? `The standout stat lines from the latest round in ${selected.name}. Tap a card to see the player.`
              : "The standout stat lines from across our leagues. Tap a card to see the player."
          }
          action={picker}
        />
      </div>
      {/* overflow-x-clip: the outer cards fan past the edges on small screens
          without causing a sideways scroll. The top padding is headroom for
          a hovered card's lift, so it never covers the heading. */}
      <div className="max-w-7xl mx-auto px-3 md:px-8 pt-6 md:pt-10 overflow-x-clip">
        {isLoading ? (
          <div className="fan-layout flex items-start justify-center gap-4" style={{ height: "calc(var(--fan-card-h) + 4rem)" }} aria-busy="true">
            {[-1, 0, 1].map((i) => (
              <div
                key={i}
                className="ch-skel rounded-[18px] shrink-0"
                style={{
                  width: "var(--fan-card-w)",
                  height: "var(--fan-card-h)",
                  transform: `translateY(${Math.abs(i) * 24}px) rotate(${i * 7}deg) scale(${i === 0 ? 1 : 0.93})`,
                  opacity: i === 0 ? 1 : 0.6,
                }}
              />
            ))}
          </div>
        ) : perfs.length === 0 ? (
          <div className="ch-card mx-auto max-w-md px-6 py-10 text-center text-sm text-[color:var(--ch-text-2)]">
            No standout performances in this competition yet.
          </div>
        ) : (
          <div className={`transition-opacity duration-300 ${switching ? "opacity-40" : ""}`} aria-busy={switching || undefined}>
            <CardFanCarousel
              // A new competition deals a fresh hand.
              key={data?.competitionId ?? LATEST}
              items={perfs}
              getKey={(p) => `${p.league_id}-${p.player_id}-${p.game_date}`}
              getLabel={(p) => `${p.full_name}, ${p.pts ?? 0} points`}
              autoAdvanceMs={ROTATE_MS}
              ariaLabel="Trending performances"
              onCenterClick={(i) => open(perfs[i])}
              renderCard={(p, { isCenter }) => (
                <TradingCard
                  perf={toCardPerformance(p, leagueNames[p.league_id], leagueLogos[p.league_id], playerMeta[p.player_id])}
                  onOpen={isCenter && profileHref(p, playerMeta[p.player_id]) ? () => open(p) : undefined}
                  // Only the front card leans; the fanned-out ones stay put.
                  tilt={isCenter}
                />
              )}
            />
          </div>
        )}
      </div>
    </section>
  );
}
