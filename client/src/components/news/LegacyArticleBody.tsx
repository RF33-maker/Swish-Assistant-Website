import GameEmbed from "@/components/GameEmbed";
import { isGameSlug } from "@/lib/gameSlug";

/**
 * Body renderer for articles written before the structured editor: plain
 * text, one paragraph per line, with a bare game URL on its own line shown as
 * a game card. Articles saved from the editor use ArticleBody instead.
 */

// Matches a game URL in any of its forms:
//   https://swishassistant.com/game/{slug}
//   /game/{slug}
const GAME_URL_SOURCE = "(?:https?:\\/\\/(?:www\\.)?swishassistant\\.com)?\\/game\\/([\\w-]+)";

// Returns the game slug if the entire trimmed line is a bare game URL, else null.
function extractBareGameSlug(line: string): string | null {
  const bare = /^(?:https?:\/\/(?:www\.)?swishassistant\.com)?\/game\/([\w-]+)\/?$/.exec(line.trim());
  if (!bare) return null;
  return isGameSlug(bare[1]) ? bare[1] : null;
}

// Renders a plain-text line, turning any inline game URLs into anchor hyperlinks.
function renderLineWithInlineLinks(line: string, lineKey: string): React.ReactNode {
  const re = new RegExp(GAME_URL_SOURCE, "g");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index));
    parts.push(
      <a
        key={`${lineKey}-link-${match.index}`}
        href={`/game/${match[1]}`}
        className="sa-article-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        {match[0]}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) parts.push(line.slice(lastIndex));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export default function LegacyArticleBody({ body }: { body: string }) {
  return (
    <div className="sa-article" data-testid="text-article-body">
      {body.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const gameSlug = extractBareGameSlug(trimmed);
        if (gameSlug) return <GameEmbed key={`embed-${i}`} slug={gameSlug} href={`/game/${gameSlug}`} />;
        return <p key={`p-${i}`}>{renderLineWithInlineLinks(line, `l${i}`)}</p>;
      })}
    </div>
  );
}
