import { useState } from "react";
import { ClipboardList, ImagePlus, Layers, Medal, ScatterChart, Shield, Star, Trophy, Users, type LucideIcon } from "lucide-react";
import AdminPageShell from "@/components/layout/AdminPageShell";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import TopPerformancesStudio from "@/components/social/TopPerformancesStudio";
import WeeklyAwardsStudio from "@/components/social/WeeklyAwardsStudio";
import LeadersStudio from "@/components/social/LeadersStudio";
import LineupsStudio from "@/components/social/LineupsStudio";
import LandscapeStudio from "@/components/social/LandscapeStudio";
import ScoresStudio from "@/components/social/ScoresStudio";
import { PlayerPhotoUploader } from "@/components/social/PlayerPhotoUploader";
import { PlayerIdentityManager } from "@/components/social/PlayerIdentityManager";
import { FIELD, SELECT_MENU } from "@/components/social/studioUi";

type SectionId = "performances" | "d2-results" | "team-of-the-week" | "player-of-the-week" | "player-leaders" | "team-leaders" | "team-landscape" | "best-lineup" | "photos";

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
  { id: "d2-results", group: "Game cards", label: "Division Two results", icon: ClipboardList },
  { id: "team-of-the-week", group: "Weekly awards", label: "Team of the Week", icon: Users },
  { id: "player-of-the-week", group: "Weekly awards", label: "Player of the Week", icon: Star },
  { id: "player-leaders", group: "League leaders", label: "Player leaders", icon: Medal },
  { id: "team-leaders", group: "League leaders", label: "Team leaders", icon: Shield },
  { id: "team-landscape", group: "League leaders", label: "Team landscape", icon: ScatterChart },
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
    <AdminPageShell title="Swish Social" description="Create share-ready graphics from your competition stats." width="max-w-[1500px]">
      {/* Phones: one compact menu */}
      <div className="mb-4 md:hidden">
        <Select value={active} onValueChange={(v) => select(v as SectionId)}>
          <SelectTrigger className={`${FIELD} !h-11`} data-testid="select-template">
            <span className="!flex items-center gap-2">
              <CurrentIcon className="h-4 w-4 flex-none text-[color:var(--ch-accent)]" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent className={SELECT_MENU}>
            {GROUPS.map((group) => (
              <SelectGroup key={group}>
                <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ch-accent)]">{group}</SelectLabel>
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

      {/* Wider screens: every template in one row, grouped */}
      <nav aria-label="Swish Social templates" className="ch-rise mb-5 hidden flex-wrap items-center gap-2 md:flex">
        {GROUPS.map((group, index) => (
          <div key={group} role="group" aria-label={group} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px bg-[color:var(--ch-border-strong)]" />}
            {SECTIONS.filter((s) => s.group === group).map((s) => {
              const Icon = s.icon;
              const on = s.id === active;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => select(s.id)}
                  data-active={on}
                  aria-pressed={on}
                  data-testid={`tab-${s.id}`}
                  className="ch-chip inline-flex h-9 items-center gap-1.5 px-3.5 text-[13px]"
                >
                  <Icon className="h-4 w-4 flex-none" />
                  {s.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="min-w-0">
        {visited.has("performances") && (
          <div className={show("performances")}>
            <TopPerformancesStudio />
          </div>
        )}
        {visited.has("d2-results") && (
          <div className={show("d2-results")}>
            <ScoresStudio />
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
        {visited.has("team-landscape") && (
          <div className={show("team-landscape")}>
            <LandscapeStudio />
          </div>
        )}
        {visited.has("best-lineup") && (
          <div className={show("best-lineup")}>
            <LineupsStudio />
          </div>
        )}
        {visited.has("photos") && (
          <div className={`${show("photos")} grid grid-cols-1 items-start gap-5 xl:grid-cols-2`}>
            <PlayerPhotoUploader />
            <PlayerIdentityManager />
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}
