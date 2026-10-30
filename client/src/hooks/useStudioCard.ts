import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CompetitionOption } from "@/components/social/studioUi";
import { canvasToBlob, ensureDisplayFont } from "@/lib/generateWeeklyCards";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";

/** The public competitions a studio can pick from. */
export function useStudioCompetitions(): CompetitionOption[] {
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    void ensureDisplayFont();
    void supabase
      .from("competitions")
      .select("slug, name")
      .eq("is_public", true)
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(120)
      .then(({ data: rows }) => {
        if (!cancelled && rows) setCompetitions((rows as CompetitionOption[]).filter((c) => c.slug && c.name));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return competitions;
}

/**
 * Draws a studio's card whenever `render` changes, shows it in `hostRef`, and looks after saving
 * it. Pass null while there's nothing to draw. `render` should be memoised on what it draws.
 */
export function useStudioCard(render: (() => Promise<HTMLCanvasElement>) | null, fileName: string) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const token = useRef(0);
  const [rendering, setRendering] = useState(false);
  const [hasCard, setHasCard] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mine = ++token.current;
    setShareFile(null);
    setError(null);
    if (!render) {
      canvasRef.current = null;
      hostRef.current?.replaceChildren();
      setHasCard(false);
      return;
    }
    setRendering(true);
    render()
      .then((canvas) => {
        if (mine !== token.current) return;
        canvas.style.cssText = "display:block;width:100%;height:auto;";
        canvasRef.current = canvas;
        hostRef.current?.replaceChildren(canvas);
        setHasCard(true);
        void canvasToBlob(canvas).then((blob) => {
          if (mine !== token.current || !blob) return;
          const file = new File([blob], fileName, { type: "image/png" });
          setShareFile(file);
          setCanShare(supportsFileSharing(file));
        });
      })
      .catch((err) => mine === token.current && setError(err?.message || "Could not draw the card"))
      .finally(() => mine === token.current && setRendering(false));
  }, [render, fileName]);

  const download = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    try {
      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error("Could not render the card");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [fileName]);

  const saveToPhotos = useCallback(async () => {
    if (!shareFile) return;
    if ((await shareImageFile(shareFile)) === "failed") setError("Couldn't open the share sheet. Use Download file instead.");
  }, [shareFile]);

  return { hostRef, hasCard, rendering, downloading, shareFile, canShare, error, download, saveToPhotos };
}
