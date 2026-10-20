import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, CalendarDays, GraduationCap, Instagram, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";

/**
 * The preview a new season shows before its first game: last season in
 * numbers and its leaders per age group, with a way back to last season's
 * page. Data comes from /api/competition/:slug/season-recap.
 */

interface RecapPlayer {
  player_id: string;
  full_name: string;
  team: string;
  slug: string | null;
  photo_path_bg_removed: string | null;
  games: number;
  ppg: number;
  rpg: number;
  apg: number;
}

interface RecapAgeGroup {
  age_group: string;
  games: number;
  players: number;
  min_games: number;
  points: RecapPlayer[];
  rebounds: RecapPlayer[];
  assists: RecapPlayer[];
}

interface Signing {
  id: string;
  player_name: string;
  player_slug: string | null;
  destination: string;
  destination_type: string | null;
  destination_location: string | null;
  destination_logo_url: string | null;
  photo_url: string | null;
  note: string | null;
}

interface SeasonRecap {
  competition: { name: string; slug: string; season: string | null };
  totals: {
    games: number;
    players: number;
    teams: number;
    points: number;
    stops: number;
    first_game: string | null;
    last_game: string | null;
  };
  age_groups: RecapAgeGroup[];
}

const BOARDS: Array<{ key: "points" | "rebounds" | "assists"; title: string; stat: "ppg" | "rpg" | "apg"; unit: string }> = [
  { key: "points", title: "Points", stat: "ppg", unit: "PPG" },
  { key: "rebounds", title: "Rebounds", stat: "rpg", unit: "RPG" },
  { key: "assists", title: "Assists", stat: "apg", unit: "APG" },
];

// Season 1 reach and outcomes as REBA reported them (Instagram, 8 Oct 2026),
// covering 31 March to 31 August 2026. Not derived from Swish data.
const REACH = [
  { value: "15.6M", label: "Views" },
  { value: "20+", label: "Scholarships" },
  { value: "10+", label: "Pro deals" },
  { value: "Multiple", label: "National team call-ups" },
];

// Stop teams named only by number ("14U Team 1") say nothing about the player.
const GENERIC_TEAM = /\bteam\s*\d+$/i;

function monthRange(first: string | null, last: string | null): string | null {
  if (!first || !last) return null;
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { month: "long", timeZone: "Europe/London" });
  const year = new Date(last).getFullYear();
  return `${fmt(first)} to ${fmt(last)} ${year}`;
}

function PlayerRow({ player, rank, stat, unit }: { player: RecapPlayer; rank: number; stat: "ppg" | "rpg" | "apg"; unit: string }) {
  const photo = getPlayerPhotoUrlCached(player.photo_path_bg_removed);
  const body = (
    <>
      <span className="w-4 text-xs font-semibold tabular-nums text-[color:var(--ch-muted)]">{rank}</span>
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[color:var(--ch-surface-2,rgba(120,120,120,0.12))] flex items-center justify-center">
        {photo ? (
          <PlayerHeadshot src={photo} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <span className="text-[11px] font-semibold text-[color:var(--ch-muted)]">
            {player.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-semibold leading-snug text-[color:var(--ch-text)] group-hover:underline underline-offset-2">{player.full_name}</div>
        <div className="truncate text-[11px] text-[color:var(--ch-muted)]">
          {player.team && !GENERIC_TEAM.test(player.team) ? `${player.team} · ` : ""}{player.games} games
        </div>
      </div>
      <div className="text-right">
        <div className="text-base font-bold tabular-nums text-[color:var(--ch-text)]">{player[stat].toFixed(1)}</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ch-muted)]">{unit}</div>
      </div>
    </>
  );
  return player.slug ? (
    <Link href={`/player/${player.slug}`} className="group flex items-center gap-3 py-2">{body}</Link>
  ) : (
    <div className="flex items-center gap-3 py-2">{body}</div>
  );
}

function SigningCard({ signing }: { signing: Signing }) {
  const initials = signing.player_name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  const meta = [signing.destination_type, signing.destination_location].filter(Boolean).join(" · ");
  const body = (
    <>
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[color:var(--ch-surface-2,rgba(120,120,120,0.12))] flex items-center justify-center">
        {signing.photo_url ? (
          <img src={signing.photo_url} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <span className="text-sm font-semibold text-[color:var(--ch-muted)]">{initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold leading-snug text-[color:var(--ch-text)] group-hover:underline underline-offset-2">{signing.player_name}</div>
        <div className="mt-0.5 text-sm leading-snug text-[color:var(--ch-text-2)]">
          Signed with <span className="font-semibold text-[color:var(--ch-text)]">{signing.destination}</span>
        </div>
        {meta && <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ch-muted)]">{meta}</div>}
        {signing.note && <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--ch-text-2)]">{signing.note}</p>}
      </div>
      {signing.destination_logo_url && (
        <img src={signing.destination_logo_url} alt="" className="h-10 w-10 shrink-0 object-contain" />
      )}
    </>
  );
  const className = "group flex items-start gap-3 rounded-xl border border-[color:var(--ch-border)] p-3.5";
  return signing.player_slug ? (
    <Link href={`/player/${signing.player_slug}`} className={`${className} ch-hover`}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export default function SeasonPreview({ previousSlug, seasonLabel, instagramUrl }: { previousSlug: string; seasonLabel: string; instagramUrl?: string | null }) {
  const { data: signings = [] } = useQuery<Signing[]>({
    queryKey: ["player-signings", previousSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_signings")
        .select("id, player_name, player_slug, destination, destination_type, destination_location, destination_logo_url, photo_url, note")
        .eq("competition_slug", previousSlug)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      return error ? [] : ((data || []) as Signing[]);
    },
    staleTime: 10 * 60 * 1000,
  });
  const { data: recap, isLoading } = useQuery<SeasonRecap | null>({
    queryKey: ["api", "season-recap", previousSlug],
    queryFn: async () => {
      const res = await fetch(`/api/competition/${encodeURIComponent(previousSlug)}/season-recap`);
      return res.ok ? res.json() : null;
    },
    staleTime: 30 * 60 * 1000,
  });
  const [ageIdx, setAgeIdx] = useState(0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="ch-skel h-40 rounded-[14px]" />
        <div className="ch-skel h-72 rounded-[14px]" />
      </div>
    );
  }
  if (!recap) return null;

  const previousLabel = recap.competition.season || recap.competition.name;
  const { totals } = recap;
  const group = recap.age_groups[Math.min(ageIdx, recap.age_groups.length - 1)];
  const span = monthRange(totals.first_game, totals.last_game);
  const numbers = [
    { label: "Games", value: totals.games },
    // Player names are typed per stop, so spelling variants inflate the
    // distinct count; a safe floor reads better than a precise wrong number.
    { label: "Players", value: totals.players, display: totals.players >= 500 ? "500+" : `${Math.floor(totals.players / 50) * 50}+` },
    { label: "Teams", value: totals.teams },
    { label: "Points scored", value: totals.points },
  ];

  return (
    <div className="space-y-6" data-testid="season-preview">
      <section className="ch-card p-5 md:p-7">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {seasonLabel} preview
        </div>
        <h2 className="mt-2 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[1.8rem] md:text-[2.3rem] text-[color:var(--ch-text)]">
          {seasonLabel} is coming
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--ch-text-2)]">
          Fixtures, results and stats will appear here from the first stop. Until then, here is how {previousLabel} went
          {totals.stops > 0 ? ` across ${totals.stops} stops` : ""}{span ? `, ${span}` : ""}.
        </p>
        <p className="mt-2 text-sm font-semibold text-[color:var(--ch-text)]">Season 2 starts October 26 to 29.</p>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {numbers.map((n) => (
            <div key={n.label} className="rounded-xl border border-[color:var(--ch-border)] px-4 py-3">
              <div className="ch-display text-[1.7rem] md:text-[2rem] font-bold leading-none tabular-nums text-[color:var(--ch-text)]">
                {"display" in n && n.display ? n.display : n.value.toLocaleString("en-GB")}
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">{n.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-5" data-testid="season-reach">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ch-muted)]">
            {previousLabel} exposure and outcomes
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {REACH.map((r) => (
              <div key={r.label} className="rounded-xl border border-[color:var(--ch-accent)] px-4 py-3">
                <div className="ch-display text-[1.7rem] md:text-[2rem] font-bold leading-none tabular-nums text-[color:var(--ch-text)]">{r.value}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">{r.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[color:var(--ch-muted)]">Figures reported by REBA, 31 March to 31 August 2026.</p>
        </div>

        <Link
          href={`/competition/${recap.competition.slug}`}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-2"
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Explore {previousLabel}: every game, stop and stat
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </section>

      {signings.length > 0 && (
        <section className="ch-card p-4 md:p-6" aria-labelledby="season-preview-signings" data-testid="season-signings">
          <h2 id="season-preview-signings" className="flex items-center gap-2 text-[15px] md:text-base font-semibold tracking-tight text-[color:var(--ch-text)]">
            <GraduationCap className="h-4 w-4 text-[color:var(--ch-accent)]" aria-hidden="true" />
            Where they signed
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--ch-muted)]">{previousLabel} players who earned their next move.</p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {signings.map((s) => <SigningCard key={s.id} signing={s} />)}
          </div>
        </section>
      )}

      <section className="ch-card p-5 md:p-6 border-[color:var(--ch-accent)]" data-testid="season-cta">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">{seasonLabel}</div>
        <h2 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[1.6rem] md:text-[2rem] text-[color:var(--ch-text)]">
          Could you be next?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--ch-text-2)]">
          Every game at a REBA SL stop is tracked here, so your stats, box scores and profile follow you all season.
          {signings.length > 0 ? " Put your game in front of the people who make the next move happen." : ""}
        </p>
        {instagramUrl && (
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ch-btn ch-btn-primary mt-4 inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold"
          >
            <Instagram className="h-4 w-4" aria-hidden="true" />
            Follow REBA for stop dates and sign-ups
          </a>
        )}
      </section>

      {group && (
        <section className="ch-card p-4 md:p-6" aria-labelledby="season-preview-leaders">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="season-preview-leaders" className="text-[15px] md:text-base font-semibold tracking-tight text-[color:var(--ch-text)]">
                {previousLabel} standouts
              </h2>
              <p className="mt-0.5 text-xs text-[color:var(--ch-muted)]">
                Per-game leaders by age group{group ? `, minimum ${group.min_games} games` : ""}. Players to watch in {seasonLabel}.
              </p>
            </div>
            {recap.age_groups.length > 1 && (
              <div className="ch-seg self-start overflow-x-auto max-w-full" role="tablist" aria-label="Age group">
                {recap.age_groups.map((g, i) => (
                  <button
                    key={g.age_group}
                    role="tab"
                    aria-selected={i === ageIdx}
                    data-active={i === ageIdx}
                    onClick={() => setAgeIdx(i)}
                    className="px-3 h-8 text-xs font-semibold whitespace-nowrap"
                  >
                    {g.age_group}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-5">
            {BOARDS.map((b) => (
              <div key={b.key}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ch-muted)]">{b.title}</div>
                <div className="divide-y divide-[color:var(--ch-border)]">
                  {group[b.key].map((p, i) => (
                    <PlayerRow key={p.player_id + b.key} player={p} rank={i + 1} stat={b.stat} unit={b.unit} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-[color:var(--ch-muted)]">
            {group.age_group}: {group.games} games, {group.players} players in {previousLabel}.
          </div>
        </section>
      )}
    </div>
  );
}
