import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Check, ImagePlus, Loader2, UserRound } from "lucide-react";
import {
  applyPlayerPhoto,
  isPlayerId,
  listPlayerPhotos,
  photoChangeReaches,
  uploadPlayerPhoto,
  usePlayerPhotoChange,
  type PhotoChoice,
  type PlayerPhotoChange,
} from "@/lib/playerPhotos";
import { BTN_GHOST, BTN_PRIMARY, ERROR, HINT } from "./studioUi";

/**
 * Adding or swapping a player's photo from wherever the gap is noticed: on
 * the card being made, rather than in a separate tool followed by a reload.
 * The upload links to all of the player's records and every open studio
 * redraws by itself (lib/playerPhotos).
 */

type Player = { playerId?: string | null; playerName: string };

function friendly(err: unknown): string {
  const message = (err as { message?: string })?.message || "Something went wrong.";
  return /row-level security|not authorized|unauthorized/i.test(message)
    ? "You need to be signed in as an admin to add photos."
    : message;
}

function usePhotoActions({ playerId, playerName }: Player) {
  // "upload", or the path of the photo on file being switched to.
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<number | null>(null);

  const run = async (what: string, action: () => Promise<PlayerPhotoChange>) => {
    if (busy) return;
    setBusy(what);
    setError(null);
    setLinked(null);
    try {
      setLinked((await action()).playerIds.length);
    } catch (err) {
      console.error("[PlayerPhoto]", err);
      setError(friendly(err));
    } finally {
      setBusy(null);
    }
  };

  const upload = (file: File | null | undefined) => {
    if (!file || !playerId) return;
    void run("upload", () => uploadPlayerPhoto({ playerId, name: playerName }, file));
  };
  const switchTo = (path: string) => void run(path, () => applyPlayerPhoto({ playerId, name: playerName }, path));

  return { busy, error, linked, upload, switchTo };
}

const MAX_ON_FILE = 6;

/** The photo strip beside a card: what it is using, a button (or drop target) to change it, and anything already on file. */
export function PlayerPhotoControl({
  playerId,
  playerName,
  photoUrl,
  standIn = false,
  showAllOnFile = false,
  className = "",
}: Player & {
  /** The photo the card is drawing now, if any. */
  photoUrl?: string | null;
  /** The card found a picture in the player's folder (often the profile headshot) because no photo is linked yet. */
  standIn?: boolean;
  /** Beside a card only the newest few on file are offered; the Player photos tool lists them all. */
  showAllOnFile?: boolean;
  className?: string;
}) {
  const { busy, error, linked, upload, switchTo } = usePhotoActions({ playerId, playerName });
  const [onFile, setOnFile] = useState<{ current: string | null; choices: PhotoChoice[] }>({ current: null, choices: [] });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadToken = useRef(0);

  const loadOnFile = useCallback(() => {
    const token = ++loadToken.current;
    listPlayerPhotos({ playerId, name: playerName })
      .then((result) => token === loadToken.current && setOnFile(result))
      .catch(() => undefined);
  }, [playerId, playerName]);

  useEffect(() => {
    setOnFile({ current: null, choices: [] });
    loadOnFile();
  }, [loadOnFile]);

  // Whoever changed it (this strip or the Player photos tool), keep the list current.
  usePlayerPhotoChange((change) => {
    if (photoChangeReaches(change, playerId)) loadOnFile();
  });

  const others = onFile.choices.filter((c) => c.path !== onFile.current);
  const hasOwnPhoto = !!photoUrl && !standIn;
  const offered = showAllOnFile ? others : others.slice(0, MAX_ON_FILE);
  const canChange = isPlayerId(playerId);

  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (canChange) upload(Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/")) ?? e.dataTransfer.files[0]);
  };

  const status = !canChange
    ? "This stat line isn't tied to a player record, so a photo can't be attached from here."
    : busy === "upload"
      ? "Uploading and linking to their records…"
      : busy
        ? "Switching photo…"
        : hasOwnPhoto
          ? "Drop a new photo here to replace it."
          : standIn && photoUrl
            ? "The card is using a stand-in from their profile. Drop a photo here or choose a file."
            : "Drop a photo here or choose a file. The card redraws by itself.";

  return (
    <div
      onDragOver={(e) => {
        if (!canChange) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`rounded-xl border p-3 transition-colors ${
        dragging
          ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)]"
          : hasOwnPhoto
            ? "border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)]"
            : "border-dashed border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface-2)]"
      } ${className}`}
      data-testid="player-photo-control"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-lg bg-[color:var(--ch-surface-3)]">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-5 w-5 text-[color:var(--ch-muted)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[color:var(--ch-text)]">
            {hasOwnPhoto ? `${playerName}'s photo` : `No photo for ${playerName} yet`}
          </p>
          {linked != null && !busy ? (
            <p className="flex items-center gap-1 text-xs font-medium text-[color:var(--ch-win)]" data-testid="text-photo-linked">
              <Check className="h-3.5 w-3.5 flex-none" />
              Linked to {linked} record{linked === 1 ? "" : "s"}.
            </p>
          ) : (
            <p className={HINT}>{status}</p>
          )}
        </div>
        {canChange && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!!busy}
            className={`${hasOwnPhoto ? BTN_GHOST : BTN_PRIMARY} flex-none`}
            data-testid="button-add-player-photo"
          >
            {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {busy === "upload" ? "Adding…" : hasOwnPhoto ? "Replace" : "Add photo"}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = "";
          }}
          data-testid="input-add-player-photo"
        />
      </div>

      {canChange && others.length > 0 && (
        <div className="mt-3 border-t border-[color:var(--ch-border)] pt-3">
          <p className={HINT}>{hasOwnPhoto ? "Also on file. Pick one to switch to it:" : "Already on file for this player. Pick one to use it:"}</p>
          <div className="mt-2 flex flex-wrap gap-2" data-testid="grid-photo-choices">
            {offered.map((choice, idx) => (
              <button
                key={choice.path}
                type="button"
                onClick={() => switchTo(choice.path)}
                disabled={!!busy}
                title="Use this photo"
                className="relative h-14 w-14 overflow-hidden rounded-lg border border-[color:var(--ch-border-strong)] transition hover:border-[color:var(--ch-accent)] disabled:opacity-60"
                data-testid={`button-photo-choice-${idx}`}
              >
                <img src={choice.url} alt={`Photo ${idx + 1} on file`} loading="lazy" className="h-full w-full object-cover" />
                {busy === choice.path && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </span>
                )}
              </button>
            ))}
            {others.length > offered.length && (
              <span className={`self-center ${HINT}`}>+{others.length - offered.length} more in Player photos</span>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className={`mt-2 ${ERROR}`} role="alert" data-testid="text-photo-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** The same upload as a small button, for a player in a list. */
export function PlayerPhotoButton({ playerId, playerName, label = "Add photo" }: Player & { label?: string }) {
  const { busy, error, upload } = usePhotoActions({ playerId, playerName });
  const inputRef = useRef<HTMLInputElement>(null);
  if (!isPlayerId(playerId)) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.click();
        }}
        disabled={!!busy}
        title={error || `Add a photo for ${playerName}`}
        className={`inline-flex h-6 flex-none items-center gap-1 rounded-full border px-2 text-[11px] font-semibold transition disabled:opacity-60 ${
          error
            ? "border-[color:var(--ch-loss)] text-[color:var(--ch-loss)]"
            : "border-[color:var(--ch-border-strong)] text-[color:var(--ch-accent)] hover:border-[color:var(--ch-accent)]"
        }`}
        data-testid="button-add-player-photo-small"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
        {busy ? "Adding…" : error ? "Try again" : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}
