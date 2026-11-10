import { Link } from "wouter";
import { ArrowRight, MapPin } from "lucide-react";
import { Reveal } from "@/components/home/motion";
import { type Photo, type Photographer } from "@/lib/mediaSpotlight";
import PhotoStrip from "./PhotoStrip";
import { HandleText, PhotographerAvatar, SocialLinks, TeamChips } from "./PhotographerBits";

/**
 * One photographer in the directory and on the landing page: who they are,
 * who they shoot, where to find them, and a drifting strip of their work.
 */
export default function PhotographerRow({ photographer, photos, delay = 0, stripHeight = 150 }: { photographer: Photographer; photos: Photo[]; delay?: number; stripHeight?: number }) {
  const href = `/media/photographers/${photographer.slug}`;
  return (
    <Reveal delay={delay} className="border-t border-[color:var(--ch-border)] py-7 md:py-9">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Link href={href} className="shrink-0">
            <PhotographerAvatar photographer={photographer} size={56} />
          </Link>
          <div className="min-w-0">
            <h3 className="ch-display text-[1.6rem] font-bold uppercase leading-none tracking-tight text-[color:var(--ch-text)] md:text-[2rem]">
              <Link href={href} className="hover:text-[color:var(--ch-accent)]">{photographer.display_name}</Link>
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--ch-text-2)]">
              <HandleText handle={photographer.handle} className="font-medium" />
              {photographer.location && (
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{photographer.location}</span>
              )}
            </div>
            <TeamChips teams={photographer.teams} className="mt-2.5" max={6} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:pt-1">
          <SocialLinks photographer={photographer} />
          <Link href={href} className="ch-btn ch-btn-ghost h-9 gap-1.5 px-3.5 text-[13px]">
            View profile <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <PhotoStrip photos={photos} slug={photographer.slug} height={stripHeight} className="mt-5 rounded-xl" />
    </Reveal>
  );
}
