import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { Helmet } from "react-helmet-async";
import { BadgeCheck, BarChart3, Instagram, Loader2, Pencil, PlayCircle, UserRound } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import { normalizeInstagramHandle } from "@/lib/instagram";
import {
  type ProfileStatLine,
  type PublicProfile,
  formatDob,
  formatHeight,
  getMyClaim,
  getPublicProfile,
  getPublicProfileStats,
} from "@/lib/playerClaims";

// /p/:slug — a claimed player's shareable profile. Data comes from
// get_public_profile, which applies the age tiers server-side: under-18 and
// unverified players arrive with a masked name, no DOB/age/Instagram, and
// is_indexable = false. The page stays noindex until the server says otherwise.

export default function PublicProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProfile(undefined);
    getPublicProfile(slug)
      .then((p) => !cancelled && setProfile(p))
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!user || !profile) return setIsOwner(false);
    getMyClaim()
      .then((c) => setIsOwner(c?.status === "approved" && c.player_id === profile.player_id))
      .catch(() => setIsOwner(false));
  }, [user?.id, profile?.player_id]);

  const indexable = profile?.is_indexable === true;

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>{profile ? `${profile.display_name} | Swish Assistant` : "Player profile | Swish Assistant"}</title>
        <meta name="robots" content={indexable ? "index, follow" : "noindex, nofollow"} />
        {indexable && profile && <link rel="canonical" href={`https://swishassistant.com/p/${profile.profile_slug}`} />}
      </Helmet>
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-9 pb-16">
        {profile === undefined ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin text-[color:var(--ch-muted)]" />
          </div>
        ) : profile === null ? (
          <div className="ch-card ch-rise p-10 text-center">
            <UserRound className="mx-auto h-10 w-10 text-[color:var(--ch-muted)]" />
            <h1 className="mt-3 ch-display uppercase font-bold text-2xl text-[color:var(--ch-text)]">Profile not found</h1>
            <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">
              {error || "This link may be out of date, or the profile is no longer public."}
            </p>
            <Link href="/players" className="ch-btn ch-btn-ghost mt-5 h-9 px-4 text-[13px]">
              Browse players
            </Link>
          </div>
        ) : (
          <ProfileCard profile={profile} isOwner={isOwner} />
        )}
      </main>
    </div>
  );
}

function ProfileCard({ profile, isOwner }: { profile: PublicProfile; isOwner: boolean }) {
  const photoUrl = getPlayerPhotoUrlCached(profile.photo_path);
  const height = formatHeight(profile.height_cm);
  const team = profile.current_team || profile.team_name;
  const igHandle = profile.instagram_handle ? normalizeInstagramHandle(profile.instagram_handle) : null;

  const facts: { label: string; value: string }[] = [];
  if (profile.position) facts.push({ label: "Position", value: profile.position });
  if (height) facts.push({ label: "Height", value: height });
  if (profile.shirt_number !== null && profile.shirt_number !== undefined) facts.push({ label: "Number", value: `#${profile.shirt_number}` });
  if (profile.age_years !== null) facts.push({ label: "Age", value: String(profile.age_years) });
  if (profile.date_of_birth) facts.push({ label: "Born", value: formatDob(profile.date_of_birth) });

  return (
    <article className="space-y-4">
      <section className="ch-card ch-rise overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          <div className="sm:w-56 shrink-0 bg-[color:var(--ch-surface-3)] aspect-[4/5] sm:aspect-auto sm:min-h-[260px] relative">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={profile.display_name}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: `50% ${profile.photo_focus_y ?? 20}%` }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <UserRound className="h-16 w-16 text-[color:var(--ch-muted)]" />
              </div>
            )}
          </div>

          <div className="flex-1 p-5 md:p-7">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">
              <BadgeCheck className="h-3.5 w-3.5" /> Verified player
            </div>
            <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3rem] text-[color:var(--ch-text)] break-words">
              {profile.display_name}
            </h1>
            {(team || profile.competition_name) && (
              <p className="mt-2 text-sm md:text-[15px] text-[color:var(--ch-text-2)]">
                {[team, profile.competition_name].filter(Boolean).join(" · ")}
              </p>
            )}

            {facts.length > 0 && (
              <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {facts.map((f) => (
                  <div key={f.label} className="rounded-xl bg-[color:var(--ch-surface-3)] px-3 py-2.5">
                    <dt className="text-[11px] uppercase tracking-wide text-[color:var(--ch-muted)]">{f.label}</dt>
                    <dd className="mt-0.5 font-semibold text-[color:var(--ch-text)]">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {profile.stats_slug && (
                <Link href={`/player/${profile.stats_slug}`} className="ch-btn ch-btn-primary h-9 px-4 text-[13px]">
                  <BarChart3 className="h-4 w-4" /> Stats & game log
                </Link>
              )}
              {profile.pinned_highlight_url && (
                <a
                  href={profile.pinned_highlight_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="ch-btn ch-btn-ghost h-9 px-4 text-[13px]"
                >
                  <PlayCircle className="h-4 w-4" /> Watch highlights
                </a>
              )}
              {igHandle && (
                <a
                  href={`https://www.instagram.com/${igHandle}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="ch-btn ch-btn-ghost h-9 px-4 text-[13px]"
                >
                  <Instagram className="h-4 w-4" /> @{igHandle}
                </a>
              )}
              {isOwner && (
                <Link href="/my-profile/edit" className="ch-btn ch-btn-ghost h-9 px-4 text-[13px]">
                  <Pencil className="h-4 w-4" /> Edit profile
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {profile.bio && (
        <section className="ch-card ch-rise p-5 md:p-7" style={{ animationDelay: "60ms" }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)]">About</h2>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-[color:var(--ch-text)]">{profile.bio}</p>
        </section>
      )}

      <ProfileStats slug={profile.profile_slug} statsSlug={profile.stats_slug} />
    </article>
  );
}

const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "—" : Number(n).toFixed(digits));

/** Games-weighted averages across competitions. Shooting % can't be rebuilt from averages, so it's left out. */
function careerLine(lines: ProfileStatLine[]) {
  const games = lines.reduce((n, l) => n + l.games, 0);
  const avg = (key: keyof ProfileStatLine) => {
    const withValue = lines.filter((l) => l[key] !== null);
    const g = withValue.reduce((n, l) => n + l.games, 0);
    return g ? withValue.reduce((n, l) => n + Number(l[key]) * l.games, 0) / g : null;
  };
  return {
    games,
    minutes_pg: avg("minutes_pg"),
    points_pg: avg("points_pg"),
    rebounds_pg: avg("rebounds_pg"),
    assists_pg: avg("assists_pg"),
  };
}

/**
 * Stats across every competition the profile covers (one claim can cover
 * several players rows — one per competition). "All" lists each competition;
 * picking one shows its averages.
 */
function ProfileStats({ slug, statsSlug }: { slug: string; statsSlug: string | null }) {
  const [lines, setLines] = useState<ProfileStatLine[] | null>(null);
  const [selected, setSelected] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    getPublicProfileStats(slug)
      .then((l) => !cancelled && setLines(l))
      .catch(() => !cancelled && setLines([]));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!lines || lines.length === 0) return null;

  const current = selected === "all" ? null : lines.find((l) => l.league_id === selected) ?? null;
  const career = careerLine(lines);
  const label = (l: ProfileStatLine) => l.competition_name || l.team_name || "Competition";

  return (
    <section className="ch-card ch-rise p-5 md:p-7 space-y-4" style={{ animationDelay: "120ms" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)]">Stats</h2>
        {statsSlug && (
          <Link href={`/player/${statsSlug}`} className="text-[13px] font-medium text-[color:var(--ch-accent)] hover:underline underline-offset-2">
            Full game log →
          </Link>
        )}
      </div>

      {lines.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Filter by competition">
          <button
            type="button"
            data-active={selected === "all"}
            onClick={() => setSelected("all")}
            className="ch-chip inline-flex items-center h-8 px-3 text-[13px]"
          >
            All competitions
          </button>
          {lines.map((l) => (
            <button
              key={l.league_id}
              type="button"
              data-active={selected === l.league_id}
              onClick={() => setSelected(l.league_id)}
              className="ch-chip inline-flex items-center h-8 px-3 text-[13px] max-w-full"
            >
              <span className="truncate">{label(l)}</span>
            </button>
          ))}
        </nav>
      )}

      {current || lines.length === 1 ? (
        <CompetitionTiles line={current ?? lines[0]} />
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--ch-muted)]">
                <th className="px-1 py-2 font-medium">Competition</th>
                <th className="px-1 py-2 font-medium text-right">GP</th>
                <th className="px-1 py-2 font-medium text-right">MIN</th>
                <th className="px-1 py-2 font-medium text-right">PTS</th>
                <th className="px-1 py-2 font-medium text-right">REB</th>
                <th className="px-1 py-2 font-medium text-right">AST</th>
                <th className="px-1 py-2 font-medium text-right">FG%</th>
                <th className="px-1 py-2 font-medium text-right">3P%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ch-border)]">
              {lines.map((l) => (
                <tr key={l.league_id} className="cursor-pointer hover:bg-[color:var(--ch-surface-3)]" onClick={() => setSelected(l.league_id)}>
                  <td className="px-1 py-2.5">
                    <span className="font-medium text-[color:var(--ch-text)]">{label(l)}</span>
                    {l.team_name && <span className="block text-[12px] text-[color:var(--ch-text-2)]">{l.team_name}</span>}
                  </td>
                  <td className="px-1 py-2.5 text-right tabular-nums">{l.games}</td>
                  <td className="px-1 py-2.5 text-right tabular-nums">{fmt(l.minutes_pg)}</td>
                  <td className="px-1 py-2.5 text-right tabular-nums font-semibold">{fmt(l.points_pg)}</td>
                  <td className="px-1 py-2.5 text-right tabular-nums">{fmt(l.rebounds_pg)}</td>
                  <td className="px-1 py-2.5 text-right tabular-nums">{fmt(l.assists_pg)}</td>
                  <td className="px-1 py-2.5 text-right tabular-nums">{fmt(l.fg_pct)}</td>
                  <td className="px-1 py-2.5 text-right tabular-nums">{fmt(l.three_pct)}</td>
                </tr>
              ))}
              <tr className="font-semibold text-[color:var(--ch-text)]">
                <td className="px-1 py-2.5">Career</td>
                <td className="px-1 py-2.5 text-right tabular-nums">{career.games}</td>
                <td className="px-1 py-2.5 text-right tabular-nums">{fmt(career.minutes_pg)}</td>
                <td className="px-1 py-2.5 text-right tabular-nums">{fmt(career.points_pg)}</td>
                <td className="px-1 py-2.5 text-right tabular-nums">{fmt(career.rebounds_pg)}</td>
                <td className="px-1 py-2.5 text-right tabular-nums">{fmt(career.assists_pg)}</td>
                <td className="px-1 py-2.5 text-right">—</td>
                <td className="px-1 py-2.5 text-right">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CompetitionTiles({ line }: { line: ProfileStatLine }) {
  const tiles: { label: string; value: string }[] = [
    { label: "Points", value: fmt(line.points_pg) },
    { label: "Rebounds", value: fmt(line.rebounds_pg) },
    { label: "Assists", value: fmt(line.assists_pg) },
    { label: "Steals", value: fmt(line.steals_pg) },
    { label: "Blocks", value: fmt(line.blocks_pg) },
    { label: "Minutes", value: fmt(line.minutes_pg) },
  ];
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[color:var(--ch-text-2)]">
        {[line.team_name, line.season].filter(Boolean).join(" · ")}
        {line.team_name || line.season ? " · " : ""}
        {line.games} {line.games === 1 ? "game" : "games"} · per game
      </p>
      <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-[color:var(--ch-surface-3)] px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-[color:var(--ch-muted)]">{t.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[color:var(--ch-text)]">{t.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[13px] text-[color:var(--ch-text-2)] tabular-nums">
        FG {fmt(line.fg_pct)}% · 3P {fmt(line.three_pct)}% · FT {fmt(line.ft_pct)}%
      </p>
    </div>
  );
}
