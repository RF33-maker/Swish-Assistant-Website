import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clubDisplayName } from "@shared/teamIdentity";
import { formatGameDate, isUpcoming, searchGames, type PickedGame } from "./tagSearch";

/** Find a game to place in the article: by team name, or from the games around today. */
export default function GamePickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (game: PickedGame) => void;
}) {
  const [query, setQuery] = useState("");
  const [games, setGames] = useState<PickedGame[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setGames(null);
    setFailed(false);
    const timer = setTimeout(
      async () => {
        try {
          const found = await searchGames(query);
          if (!cancelled) setGames(found);
        } catch {
          if (!cancelled) setFailed(true);
        }
      },
      query ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const upcoming = (games ?? []).filter(isUpcoming);
  const played = (games ?? []).filter((g) => !isUpcoming(g));

  const group = (title: string, list: PickedGame[]) =>
    list.length > 0 && (
      <div>
        <div className="ch-eyebrow px-1 pb-1.5">{title}</div>
        <ul className="space-y-1">
          {list.map((game) => (
            <li key={game.gameKey}>
              <button
                type="button"
                onClick={() => {
                  onPick(game);
                  onOpenChange(false);
                }}
                className="w-full rounded-lg border border-transparent px-3 py-2.5 text-left hover:border-[color:var(--ch-border)] hover:bg-[color:var(--ch-surface-2)]"
                data-testid={`game-option-${game.gameKey}`}
              >
                <span className="block text-[14px] font-semibold text-[color:var(--ch-text)]">
                  {clubDisplayName(game.home)} <span className="font-normal text-[color:var(--ch-muted)]">v</span> {clubDisplayName(game.away)}
                </span>
                <span className="block truncate text-[12.5px] text-[color:var(--ch-text-2)]">
                  {formatGameDate(game.matchtime)} · {game.competitionName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sa-pro max-w-lg bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] border-[color:var(--ch-border)]">
        <DialogHeader>
          <DialogTitle>Add a game</DialogTitle>
          <DialogDescription className="text-[color:var(--ch-text-2)]">
            The game appears as a card with the teams and score, and the article is tagged with the game, its competition and both teams.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ch-muted)]" />
          <input
            autoFocus
            className="ch-input h-11 w-full pl-9 pr-3 text-[15px]"
            value={query}
            placeholder="Search by team name"
            aria-label="Search games by team name"
            onChange={(e) => setQuery(e.target.value)}
            data-testid="input-game-search"
          />
        </div>

        <div className="-mx-1 max-h-[50vh] min-h-[10rem] space-y-4 overflow-y-auto px-1">
          {failed ? (
            <p className="py-8 text-center text-sm text-[color:var(--ch-text-2)]">Couldn't load games. Check your connection and try again.</p>
          ) : games === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[color:var(--ch-muted)]" />
            </div>
          ) : games.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--ch-text-2)]">
              {query ? "No games found for that team." : "No games in the last ten days or the coming week. Search by team name."}
            </p>
          ) : (
            <>
              {group(query ? "Results" : "Recent results", played)}
              {group("Coming up", upcoming)}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
