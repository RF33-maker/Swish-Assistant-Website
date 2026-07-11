import { PlayerProfileContent } from "@/components/PlayerProfileContent";

interface InlinePlayerProfileProps {
  playerSlug: string;
  brandColor: string;
  onBack: () => void;
  leagueSlug?: string;
  linkedPlayerIds?: string[];
}

export function InlinePlayerProfile({ playerSlug, brandColor, onBack, linkedPlayerIds }: InlinePlayerProfileProps) {
  return (
    <PlayerProfileContent
      playerSlug={playerSlug}
      brandColorOverride={brandColor}
      onBack={onBack}
      linkedPlayerIds={linkedPlayerIds}
    />
  );
}
