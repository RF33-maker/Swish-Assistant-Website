import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowUpRight, Loader2, MapPin, Pencil } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import PhotoLightbox from "@/components/media/PhotoLightbox";
import { HandleText, PhotographerAvatar, SocialLinks, TeamChips } from "@/components/media/PhotographerBits";
import { Reveal } from "@/components/home/motion";
import { useAuth } from "@/hooks/use-auth";
import { avatarUrl, contactHref, craftTitle, creditLine, photoSrcSet, photoUrl, usePhotographerProfile, type Photo } from "@/lib/mediaSpotlight";
import { useCreatorTeams, useCreatorUpcoming } from "@/lib/creatorSpace";
import { FixtureLine, LinkedTeams } from "@/components/creators/CreatorBits";
import FollowButton from "@/components/FollowButton";

const SITE_URL = "https://swishassistant.com";

/**
 * /media/photographers/:slug — one photographer: who they are, how to book
 * them, and their public gallery. ?photo=<id> opens that photo in the lightbox.
 */
export default function PhotographerProfilePage({ params }: { params: { slug: string } }) {
  const { data, isLoading } = usePhotographerProfile(params.slug);
  const { user, isAdmin } = useAuth();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState<number | null>(null);

  const photos: Photo[] = data?.photos ?? [];

  // A link straight to one photo.
  useEffect(() => {
    const id = new URLSearchParams(search).get("photo");
    if (!id || !photos.length) return;
    const i = photos.findIndex((p) => p.id === id);
    if (i >= 0) setOpen(i);
  }, [search, photos]);

  const close = useCallback(() => {
    setOpen(null);
    if (new URLSearchParams(window.location.search).get("photo")) setLocation(`/media/photographers/${params.slug}`, { replace: true });
  }, [params.slug, setLocation]);

  const contact = useMemo(() => (data ? contactHref(data.photographer) : null), [data]);
  const { data: linkedTeams = [] } = useCreatorTeams(data?.photographer.id);
  // Empty unless they chose to show their games in public (or the viewer is a creator too).
  const { data: upcoming = [] } = useCreatorUpcoming(data?.photographer.id);

  if (isLoading) {
    return (
      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
        <SiteHeader />
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
        <Helmet><title>Photographer not found | Swish Assistant</title><meta name="robots" content="noindex" /></Helmet>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
          <h1 className="ch-display text-[2rem] font-bold uppercase tracking-tight text-[color:var(--ch-text)]">Photographer not found</h1>
          <p className="mt-2 text-[color:var(--ch-text-2)]">This profile may have moved or been taken down.</p>
          <Link href="/media/photographers" className="ch-btn ch-btn-ghost mt-6 h-10 px-4">All photographers</Link>
        </main>
      </div>
    );
  }

  const { photographer, tags } = data;
  const canonical = `${SITE_URL}/media/photographers/${photographer.slug}`;
  const description = photographer.bio?.slice(0, 160) || `${photographer.display_name}'s basketball work on Swish Assistant.`;
  const owner = !!user && photographer.user_id === user.id;
  const ogImage = photos[0] ? photoUrl(photos[0], "medium") : undefined;

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>{`${photographer.display_name} | Media Spotlight | Swish Assistant`}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={`${photographer.display_name} | Swish Assistant`} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="profile" />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <link rel="canonical" href={canonical} />
        {photographer.status === "hidden" && <meta name="robots" content="noindex" />}
      </Helmet>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-6 md:pt-9">
        <Link href="/media/photographers" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All photographers
        </Link>

        <header className="ch-rise mt-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-4 md:gap-6">
            <PhotographerAvatar photographer={photographer} size={88} className="md:!h-[112px] md:!w-[112px]" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">{craftTitle(photographer.crafts)}</div>
              <h1 className="ch-display mt-1 text-[2.25rem] font-bold uppercase leading-[0.92] tracking-tight text-[color:var(--ch-text)] md:text-[3.5rem]">
                {photographer.display_name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-[color:var(--ch-text-2)]">
                <HandleText handle={photographer.handle} className="font-medium" />
                {photographer.location && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden="true" />{photographer.location}</span>
                )}
              </div>
              {photographer.bio && <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-[color:var(--ch-text-2)]">{photographer.bio}</p>}
              {linkedTeams.length ? <LinkedTeams teams={linkedTeams} className="mt-3.5" /> : <TeamChips teams={photographer.teams} className="mt-3.5" />}
              <div className="mt-4">
                <FollowButton
                  follow={{ kind: "creator", key: photographer.slug, label: photographer.display_name, subtitle: craftTitle(photographer.crafts), image_url: avatarUrl(photographer), league_id: null, player_ids: [] }}
                />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
            <SocialLinks photographer={photographer} />
            <div className="flex flex-wrap gap-2">
              {contact && (
                <a href={contact.href} target={contact.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer" className="ch-btn ch-btn-primary h-10 gap-1.5 px-4" data-testid="photographer-contact">
                  Work with me <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {(owner || isAdmin) && (
                <Link href={owner ? "/media/dashboard" : `/media/dashboard?photographer=${photographer.id}`} className="ch-btn ch-btn-ghost h-10 gap-1.5 px-4">
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                </Link>
              )}
            </div>
            <p className="text-[12px] text-[color:var(--ch-muted)]">Credit: {creditLine(photographer)}</p>
          </div>
        </header>

        {upcoming.length > 0 && (
          <section className="mt-9" aria-labelledby="creator-upcoming">
            <h2 id="creator-upcoming" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-text-2)]">
              Where {photographer.display_name.split(/\s+/)[0]} will be
            </h2>
            <ul className="mt-2 divide-y divide-[color:var(--ch-border)] border-y border-[color:var(--ch-border)]">
              {upcoming.slice(0, 6).map((a) =>
                a.game ? (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <FixtureLine game={a.game} />
                    {a.status === "maybe" && <span className="text-[12px] text-[color:var(--ch-muted)]">Maybe</span>}
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        )}

        <section className="mt-10" aria-label="Gallery">
          {photos.length === 0 ? (
            <p className="border-t border-[color:var(--ch-border)] py-12 text-center text-[15px] text-[color:var(--ch-text-2)]">No photos yet.</p>
          ) : (
            <div className="columns-2 gap-2.5 md:columns-3 md:gap-3 lg:columns-4">
              {photos.map((p, i) => {
                const ratio = p.width && p.height ? p.width / p.height : 1.5;
                return (
                  <Reveal key={p.id} delay={Math.min(i, 8) * 40} className="mb-2.5 break-inside-avoid md:mb-3">
                    <button
                      type="button"
                      onClick={() => setOpen(i)}
                      className="group block w-full overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ch-accent)]"
                      style={{ aspectRatio: `${ratio}`, background: p.dominant_color || "var(--ch-surface-3)" }}
                      aria-label={p.caption || `Open photo ${i + 1}`}
                    >
                      <img
                        src={photoUrl(p, "thumb")}
                        srcSet={photoSrcSet(p)}
                        sizes="(min-width: 1024px) 270px, (min-width: 768px) 31vw, 45vw"
                        alt={p.caption || ""}
                        loading={i < 8 ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    </button>
                  </Reveal>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {open !== null && photos[open] && (
        <PhotoLightbox photos={photos} index={open} photographer={photographer} tags={tags} onClose={close} onIndexChange={setOpen} />
      )}
    </div>
  );
}
