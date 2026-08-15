import { useEffect, useMemo, useState } from "react";
import {
  DARK_SURFACE,
  LIGHT_SURFACE,
  ensureContrast,
  normalizeHex,
} from "@/lib/colorContrast";

/**
 * Watches the `dark` class on the document root so the readable colour
 * recalculates when the user toggles the theme. Works regardless of which
 * theme provider (next-themes, the in-app ThemeProvider, etc.) is in scope.
 */
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export interface ReadableTeamColor {
  /** The original (normalised) team colour. Use this when the colour is the
   *  background of a filled banner/badge rather than text on the page. */
  raw: string;
  /** Body-text-safe variant — at least 4.5:1 against the current page surface. */
  body: string;
  /** Accent-safe variant for large text, icons, thin borders, and progress
   *  bar fills — at least 3:1 against the current page surface. */
  accent: string;
  /** Variant suitable as a *background* under white text (e.g. an active tab
   *  pill that uses white labels regardless of theme). Always darkened until
   *  white passes 4.5:1 against it, so very light brand colours like yellow
   *  no longer dissolve their own labels. */
  onWhite: string;
}

/**
 * Returns colour variants that stay readable on the page's card surface in
 * both light and dark mode. The variants only nudge the team colour as much
 * as is needed to clear the WCAG AA threshold, so the team colour is still
 * recognisable.
 */
export function useReadableTeamColor(
  rawColor: string | null | undefined,
): ReadableTeamColor {
  const isDark = useIsDarkMode();
  const surface = isDark ? DARK_SURFACE : LIGHT_SURFACE;

  return useMemo(() => {
    const raw = normalizeHex(rawColor);
    return {
      raw,
      body: ensureContrast(raw, surface, 4.5),
      accent: ensureContrast(raw, surface, 3.0),
      onWhite: ensureContrast(raw, LIGHT_SURFACE, 4.5),
    };
  }, [rawColor, surface]);
}
