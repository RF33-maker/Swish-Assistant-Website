import { PlayerProfileContent } from "@/components/PlayerProfileContent";

interface InlinePlayerProfileProps {
  playerSlug: string;
  brandColor: string;
  onBack: () => void;
  leagueSlug?: string;
}

export function InlinePlayerProfile({ playerSlug, brandColor, onBack }: InlinePlayerProfileProps) {
  return (
    <PlayerProfileContent
      playerSlug={playerSlug}
      brandColorOverride={brandColor}
      onBack={onBack}
    />
  );
}
