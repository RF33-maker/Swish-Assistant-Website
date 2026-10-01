import { useRoute } from "wouter";
import { Helmet } from "react-helmet-async";
import { slugToName } from "@/lib/fuzzyMatch";
import { playerSeoDescription, playerSeoTitle } from "@shared/seo";
import { PlayerProfileContent } from "@/components/PlayerProfileContent";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";

export default function PlayerStatsPage() {
  const [, params] = useRoute("/player/:slug");
  const [, pagedParams] = useRoute("/player/:slug/games/page/:page");

  const canonicalPlayerSegment = pagedParams?.slug || params?.slug;
  const generatedIdMatch = canonicalPlayerSegment?.match(/--([0-9a-f]{8}-[0-9a-f-]{27,})$/i);
  const playerSlugOrId = generatedIdMatch?.[1] || canonicalPlayerSegment;

  if (!playerSlugOrId) return null;

  // The name part of the URL: "victor-olarerin--<uuid>" → "victor-olarerin".
  // A bare id has no name to show, so the title stays generic until then.
  const nameSegment = (canonicalPlayerSegment || "")
    .replace(/(^|--)[0-9a-f]{8}-[0-9a-f-]{27,}$/i, "");
  const playerDisplayName = nameSegment ? slugToName(nameSegment) : "";
  // Matches the server's canonical: encoded, and game-log pages 2+ are their own URL.
  const canonicalHref = `https://swishassistant.com/player/${encodeURIComponent(canonicalPlayerSegment || "")}${pagedParams?.page && pagedParams.page !== "1" ? `/games/page/${pagedParams.page}` : ""}`;

  return (
    <>
      {/* Until the profile loads, the name from the URL; PlayerProfileContent
          then sets the full title (team, averages) from the same builders the
          server uses for this page's HTML. */}
      <Helmet>
        <title>{playerDisplayName ? playerSeoTitle({ name: playerDisplayName }) : `Player Profile | Swish Assistant`}</title>
        <meta name="description" content={playerDisplayName ? playerSeoDescription({ name: playerDisplayName }) : "Explore player stats and basketball performance data on Swish Assistant."} />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={canonicalHref} />
        <meta property="og:image" content="https://swishassistant.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={canonicalHref} />
      </Helmet>

      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
        <SiteHeader />
        <main className="max-w-6xl mx-auto px-4 md:px-6 py-5 md:py-7">
          <PlayerProfileContent playerSlug={playerSlugOrId} manageHead />
        </main>
      </div>
    </>
  );
}
