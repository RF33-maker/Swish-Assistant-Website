import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import SectionHeader from "@/components/home/SectionHeader";
import { Reveal } from "@/components/home/motion";
import { HandleText, PhotographerAvatar, SocialLinks } from "@/components/media/PhotographerBits";
import { photoSrcSet, photoUrl, useCurrentSpotlight } from "@/lib/mediaSpotlight";

/**
 * Homepage: this week's Photographer of the Week, from the spotlight
 * schedule an admin keeps. Nothing scheduled, nothing shown.
 */
export default function PhotographerSpotlight() {
  const { data } = useCurrentSpotlight();
  if (!data) return null;
  const { spotlight, photographer, photos } = data;
  const href = `/media/photographers/${photographer.slug}`;
  const highlights = photos.slice(0, 4);

  return (
    <section className="py-12 md:py-16" aria-labelledby="spotlight-heading">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <SectionHeader
          id="spotlight-heading"
          eyebrow="Photographer of the week"
          title={photographer.display_name}
          description={spotlight.blurb || photographer.bio || undefined}
          action={
            <Link href="/media" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-4">
              Media Spotlight <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />

        <Reveal className="flex items-center gap-3">
          <Link href={href} className="flex items-center gap-3 group">
            <PhotographerAvatar photographer={photographer} size={44} />
            <span className="text-sm text-[color:var(--ch-text-2)] group-hover:text-[color:var(--ch-text)]">
              <HandleText handle={photographer.handle} className="font-medium" />
              {!photographer.handle && <span>View profile</span>}
            </span>
          </Link>
          <SocialLinks photographer={photographer} />
        </Reveal>

        {highlights.length > 0 && (
          <div className={`mt-5 grid gap-2.5 md:gap-3 ${highlights.length >= 4 ? "grid-cols-2 md:grid-cols-4" : highlights.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {highlights.map((p, i) => (
              <Reveal key={p.id} delay={i * 70}>
                <Link
                  href={`${href}?photo=${p.id}`}
                  className="group block overflow-hidden rounded-xl"
                  style={{ aspectRatio: highlights.length >= 4 ? "4 / 5" : "3 / 2", background: p.dominant_color || "var(--ch-surface-3)" }}
                  aria-label={p.caption || `Photo by ${photographer.display_name}`}
                >
                  <img
                    src={photoUrl(p, "thumb")}
                    srcSet={photoSrcSet(p)}
                    sizes="(min-width: 768px) 25vw, 50vw"
                    alt={p.caption || ""}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </Link>
              </Reveal>
            ))}
          </div>
        )}

        <Reveal className="mt-5">
          <Link href={href} className="ch-btn ch-btn-ghost h-10 gap-1.5 px-4" data-testid="home-spotlight-profile">
            See {photographer.display_name.split(" ")[0]}'s profile <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
