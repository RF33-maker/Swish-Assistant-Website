import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ImagePlus, Layers, Medal, Shield, Star, Trophy, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import TopPerformancesStudio from "@/components/social/TopPerformancesStudio";
import WeeklyAwardsStudio from "@/components/social/WeeklyAwardsStudio";
import LeadersStudio from "@/components/social/LeadersStudio";
import LineupsStudio from "@/components/social/LineupsStudio";
import { PlayerPhotoUploader } from "@/components/social/PlayerPhotoUploader";
import { PlayerIdentityManager } from "@/components/social/PlayerIdentityManager";

type SectionId = "performances" | "team-of-the-week" | "player-of-the-week" | "player-leaders" | "team-leaders" | "best-lineup" | "photos";

type Group = "Game cards" | "Weekly awards" | "League leaders" | "Lineups" | "Tools";

type Section = {
  id: SectionId;
  group: Group;
  label: string;
  icon: LucideIcon;
};

// Add a template here (under an existing group, or a new one in GROUPS) and it appears in the menu.
const GROUPS: Group[] = ["Game cards", "Weekly awards", "League leaders", "Lineups", "Tools"];

const SECTIONS: Section[] = [
  { id: "performances", group: "Game cards", label: "Top performances", icon: Trophy },
  { id: "team-of-the-week", group: "Weekly awards", label: "Team of the Week", icon: Users },
  { id: "player-of-the-week", group: "Weekly awards", label: "Player of the Week", icon: Star },
  { id: "player-leaders", group: "League leaders", label: "Player leaders", icon: Medal },
  { id: "team-leaders", group: "League leaders", label: "Team leaders", icon: Shield },
  { id: "best-lineup", group: "Lineups", label: "Best lineup", icon: Layers },
  { id: "photos", group: "Tools", label: "Player photos", icon: ImagePlus },
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
  const current = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];
  const CurrentIcon = current.icon;

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

        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Swish Social</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Create share-ready graphics from your competition stats.</p>
        </div>

        <div className="xl:grid xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start xl:gap-6">
          {/* Below wide screens: one compact menu */}
          <div className="mb-4 xl:hidden">
            <Select value={active} onValueChange={(v) => select(v as SectionId)}>
              <SelectTrigger className="border-orange-200 bg-white dark:border-orange-700 dark:bg-gray-800" data-testid="select-template">
                <span className="!flex items-center gap-2">
                  <CurrentIcon className="h-4 w-4 flex-none text-orange-600" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {GROUPS.map((group) => (
                  <SelectGroup key={group}>
                    <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-orange-600">{group}</SelectLabel>
                    {SECTIONS.filter((s) => s.group === group).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Wide screens: grouped sidebar */}
          <nav aria-label="Swish Social templates" className="hidden xl:sticky xl:top-4 xl:block">
            <div className="space-y-4 rounded-xl border border-orange-200 bg-white p-3 dark:border-orange-700 dark:bg-gray-800">
              {GROUPS.map((group) => (
                <div key={group}>
                  <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">{group}</div>
                  <div className="space-y-0.5">
                    {SECTIONS.filter((s) => s.group === group).map((s) => {
                      const Icon = s.icon;
                      const on = s.id === active;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => select(s.id)}
                          aria-pressed={on}
                          data-testid={`tab-${s.id}`}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition ${
                            on
                              ? "bg-orange-500 text-white shadow-sm"
                              : "text-gray-700 hover:bg-orange-50 dark:text-gray-200 dark:hover:bg-orange-900/20"
                          }`}
                        >
                          <Icon className={`h-4 w-4 flex-none ${on ? "text-white" : "text-orange-600 dark:text-orange-400"}`} />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          <div className="min-w-0">
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
            {visited.has("player-leaders") && (
              <div className={show("player-leaders")}>
                <LeadersStudio kind="player" />
              </div>
            )}
            {visited.has("team-leaders") && (
              <div className={show("team-leaders")}>
                <LeadersStudio kind="team" />
              </div>
            )}
            {visited.has("best-lineup") && (
              <div className={show("best-lineup")}>
                <LineupsStudio />
              </div>
            )}
            {visited.has("photos") && (
              <div className={`${show("photos")} grid grid-cols-1 gap-6 2xl:grid-cols-2`}>
                <PlayerPhotoUploader />
                <PlayerIdentityManager />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
