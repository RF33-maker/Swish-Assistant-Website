import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { extractColorsFromImage } from "@/lib/colorExtractor";
import { usePublicLeagueBrandingBySlug } from "@/hooks/usePublicLeagueBranding";

function toHex(rgb?: { r: number; g: number; b: number } | null): string {
  if (!rgb) return "#f97316";
  return `#${[rgb.r, rgb.g, rgb.b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")}`;
}

const colourKey = (slug: string) => `weekly-awards-colour:${slug}`;

/**
 * Logo and card colour for a competition's social cards: the competition's own logo (else its
 * league brand's), a colour taken from that logo, and a per-competition override the admin
 * picks once and the browser remembers. The colour is shared with Team / Player of the Week.
 */
export function useCompetitionCardBrand(slug: string) {
  const [leagueLogoUrl, setLeagueLogoUrl] = useState<string | null>(null);
  const [logoColorHex, setLogoColorHex] = useState<string | null>(null);
  const [colorOverride, setColorOverride] = useState<string | null>(null);
  const { colors } = usePublicLeagueBrandingBySlug({ slug, enabled: !!slug });

  useEffect(() => {
    let cancelled = false;
    setLeagueLogoUrl(null);
    setLogoColorHex(null);
    try {
      setColorOverride(localStorage.getItem(colourKey(slug)));
    } catch {
      setColorOverride(null);
    }
    void (async () => {
      const { data: comp } = await supabase.from("competitions").select("logo_url, competition_id").eq("slug", slug).maybeSingle();
      let logo: string | null = comp?.logo_url || null;
      if (!logo && comp?.competition_id) {
        const { data: brandRow } = await supabase.from("leagues").select("logo_url").eq("id", comp.competition_id).maybeSingle();
        logo = brandRow?.logo_url || null;
      }
      if (cancelled) return;
      setLeagueLogoUrl(logo);
      if (logo) {
        const extracted = await extractColorsFromImage(logo).catch(() => null);
        if (!cancelled && extracted) setLogoColorHex(toHex(extracted.primaryRgb));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const updateColour = (hex: string) => {
    setColorOverride(hex);
    try {
      localStorage.setItem(colourKey(slug), hex);
    } catch {
      // remembering the colour is a convenience only
    }
  };
  const resetColour = () => {
    setColorOverride(null);
    try {
      localStorage.removeItem(colourKey(slug));
    } catch {
      // ignore
    }
  };

  return {
    leagueLogoUrl,
    primaryHex: colorOverride || logoColorHex || toHex(colors?.primaryRgb),
    colorOverride,
    updateColour,
    resetColour,
  };
}
