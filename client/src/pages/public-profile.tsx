import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { Helmet } from "react-helmet-async";
import { BadgeCheck, BarChart3, Instagram, Loader2, Pencil, PlayCircle, UserRound } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import { normalizeInstagramHandle } from "@/lib/instagram";
import { type PublicProfile, formatDob, formatHeight, getMyClaim, getPublicProfile } from "@/lib/playerClaims";

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
    </article>
  );
}
