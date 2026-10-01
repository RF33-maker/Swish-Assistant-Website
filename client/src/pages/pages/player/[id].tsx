import { useRoute } from "wouter";
import { Helmet } from "react-helmet-async";
import { slugToName } from "@/lib/fuzzyMatch";
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

  return (
    <>
      <Helmet>
        <title>{playerDisplayName ? `${playerDisplayName} | Player Stats | Swish Assistant` : "Player Profile | Swish Assistant"}</title>
        <meta name="description" content={playerDisplayName ? `View ${playerDisplayName}'s basketball stats, game-by-game performance, and AI-powered analysis on Swish Assistant.` : "Explore player stats and basketball performance data on Swish Assistant."} />
        <meta property="og:title" content={playerDisplayName ? `${playerDisplayName} | Player Stats | Swish Assistant` : "Player Profile | Swish Assistant"} />
        <meta property="og:description" content={playerDisplayName ? `View ${playerDisplayName}'s basketball stats on Swish Assistant.` : "Explore player stats and basketball performance data on Swish Assistant."} />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={`https://swishassistant.com/player/${canonicalPlayerSegment}`} />
        <meta property="og:image" content="https://swishassistant.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={playerDisplayName ? `${playerDisplayName} | Player Stats | Swish Assistant` : "Player Profile | Swish Assistant"} />
        <meta name="twitter:description" content={playerDisplayName ? `${playerDisplayName}'s basketball stats on Swish Assistant.` : "Explore player stats on Swish Assistant."} />
        <link rel="canonical" href={`https://swishassistant.com/player/${canonicalPlayerSegment}`} />
      </Helmet>

      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
        <SiteHeader />
        <main className="max-w-6xl mx-auto px-4 md:px-6 py-5 md:py-7">
          <PlayerProfileContent playerSlug={playerSlugOrId} />
        </main>
      </div>
    </>
  );
}
