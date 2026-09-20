import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ImagePlus, Star, Trophy, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import TopPerformancesStudio from "@/components/social/TopPerformancesStudio";
import WeeklyAwardsStudio from "@/components/social/WeeklyAwardsStudio";
import { PlayerPhotoUploader } from "@/components/social/PlayerPhotoUploader";
import { PlayerIdentityManager } from "@/components/social/PlayerIdentityManager";

type SectionId = "performances" | "team-of-the-week" | "player-of-the-week" | "photos";

type Section = {
  id: SectionId;
  group: "Templates" | "Tools";
  label: string;
  blurb: string;
  icon: LucideIcon;
};

// Add new post templates here and they appear in the hub automatically.
const SECTIONS: Section[] = [
  {
    id: "performances",
    group: "Templates",
    label: "Top performances",
    blurb: "Single-game stat cards with photo overlay and reel variants",
    icon: Trophy,
  },
  {
    id: "team-of-the-week",
    group: "Templates",
    label: "Team of the Week",
    blurb: "The five best game scores across a week, side by side",
    icon: Users,
  },
  {
    id: "player-of-the-week",
    group: "Templates",
    label: "Player of the Week",
    blurb: "The week's best performance as a full-photo card",
    icon: Star,
  },
  {
    id: "photos",
    group: "Tools",
    label: "Player photos",
    blurb: "Upload photos and link duplicate player records",
    icon: ImagePlus,
  },
];

const SCORE_KEY = "weekly-awards-show-game-score";

function readShowGameScore(): boolean {
  try {
    return localStorage.getItem(SCORE_KEY) !== "off";
  } catch {
    return true;
  }
}

function initialSection(): SectionId {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return SECTIONS.some((s) => s.id === tab) ? (tab as SectionId) : "performances";
}

function Tile({ section, active, onSelect }: { section: Section; active: boolean; onSelect: () => void }) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`tab-${section.id}`}
      className={`flex h-full w-full min-w-0 items-start gap-2.5 rounded-xl border p-3 text-left transition sm:gap-3 sm:p-4 ${
        active
          ? "border-orange-500 bg-orange-50 shadow-sm ring-1 ring-orange-500 dark:bg-orange-900/20"
          : "border-orange-200 bg-white hover:border-orange-400 hover:bg-orange-50/60 dark:border-orange-700 dark:bg-gray-800 dark:hover:bg-orange-900/10"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg sm:h-9 sm:w-9 ${
          active ? "bg-orange-500 text-white" : "bg-orange-100 text-orange-600 dark:bg-orange-900/30"
        }`}
      >
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
          {section.group === "Templates" ? "Template" : "Tool"}
        </span>
        <span className="block text-sm font-semibold leading-tight text-gray-900 dark:text-white sm:text-base">{section.label}</span>
        <span className="mt-0.5 hidden text-xs leading-snug text-gray-600 dark:text-gray-400 sm:block">{section.blurb}</span>
      </span>
    </button>
  );
}

export default function SocialToolsPage() {
  const [, navigate] = useLocation();
  const [active, setActive] = useState<SectionId>(initialSection);
  // Shared by Team and Player of the Week so the two cards always agree.
  const [showGameScore, setShowGameScore] = useState(readShowGameScore);
  const changeShowGameScore = (on: boolean) => {
    setShowGameScore(on);
    try {
      localStorage.setItem(SCORE_KEY, on ? "on" : "off");
    } catch {
      // remembering the choice is a convenience only
    }
  };
  // Sections stay mounted once opened so switching tabs doesn't lose state or refetch.
  const [visited, setVisited] = useState<Set<SectionId>>(() => new Set([initialSection()]));

  const select = (id: SectionId) => {
    setActive(id);
    setVisited((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  };

  const show = (id: SectionId) => (active === id ? "" : "hidden");

  return (
    <div className="min-h-screen bg-gray-50 py-4 dark:bg-gray-900 sm:py-8">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-6">
        <div className="mb-4 flex items-center gap-4 sm:mb-6">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="border-orange-200 text-orange-700 hover:border-orange-300 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Swish Social</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Create share-ready graphics from your competition stats. Pick a template to get started.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 lg:mb-8 lg:grid-cols-4">
          {SECTIONS.map((s) => (
            <Tile key={s.id} section={s} active={active === s.id} onSelect={() => select(s.id)} />
          ))}
        </div>

        {visited.has("performances") && (
          <div className={show("performances")}>
            <TopPerformancesStudio />
          </div>
        )}
        {visited.has("team-of-the-week") && (
          <div className={show("team-of-the-week")}>
            <WeeklyAwardsStudio kind="team" showGameScore={showGameScore} onShowGameScoreChange={changeShowGameScore} />
          </div>
        )}
        {visited.has("player-of-the-week") && (
          <div className={show("player-of-the-week")}>
            <WeeklyAwardsStudio kind="player" showGameScore={showGameScore} onShowGameScoreChange={changeShowGameScore} />
          </div>
        )}
        {visited.has("photos") && (
          <div className={`${show("photos")} grid grid-cols-1 gap-6 lg:grid-cols-2`}>
            <PlayerPhotoUploader />
            <PlayerIdentityManager />
          </div>
        )}
      </div>
    </div>
  );
}
