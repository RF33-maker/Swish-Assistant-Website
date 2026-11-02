import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ColourField,
  CompetitionField,
  ERROR,
  FIELD,
  Field,
  HINT,
  Panel,
  RangeField,
  readStoredCompetition,
  rememberCompetition,
  SaveActions,
  SELECT_MENU,
  Stage,
} from "@/components/social/studioUi";
import CardStylePicker, { useCardStyle } from "@/components/social/CardStylePicker";
import { usesLeagueColour } from "@/lib/cardStyle";
import { useCompetitionCardBrand } from "@/hooks/useCompetitionCardBrand";
import { useStudioCard, useStudioCompetitions } from "@/hooks/useStudioCard";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { extractTeamColors } from "@/lib/colorExtractor";
import { renderRankedBarsCard } from "@/lib/generateRankedBarsCard";
import type { LeadersResponse } from "@/types/leaders";

const DEFAULT_SLUG = "nbl-division-1-2026-2027";
const SLUG_KEY = "weekly-awards-slug";
const DEFAULT_CATEGORY = "facilitator";

/** The line under the title for a stat whose name doesn't say what it is. */
const STAT_BANNERS: Record<string, string> = { facilitator: "Assists minus bad passes, per game" };

function stripSeason(name: string): string {
  return name.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
}

/** Ranked bars: one number down a list of players, each bar in the player's team colour. */
export default function RankedBarsStudio() {
  const competitions = useStudioCompetitions();
  const [slug, setSlug] = useState(() => new URLSearchParams(window.location.search).get("slug") || readStoredCompetition(SLUG_KEY) || DEFAULT_SLUG);
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [count, setCount] = useState(10);
  const [minGamesText, setMinGamesText] = useState("");
  const [style, setStyle] = useCardStyle();
  const [data, setData] = useState<LeadersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState("");
  const [titleText, setTitleText] = useState<string | null>(null);
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const [colours, setColours] = useState<Record<string, string | null>>({});
  const { leagueLogoUrl, primaryHex, colorOverride, updateColour, resetColour } = useCompetitionCardBrand(slug);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ kind: "player", category, limit: String(count) });
    const minGames = Number(minGamesText);
    if (minGamesText && Number.isFinite(minGames) && minGames >= 1) params.set("minGames", String(Math.floor(minGames)));
    fetch(`/api/league/${encodeURIComponent(slug)}/leaders?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Competition not found or not public" : `Request failed (${res.status})`);
        return (await res.json()) as LeadersResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setSubtitle(stripSeason(json.league.name));
      })
      .catch((err) => !cancelled && (setData(null), setLoadError(err.message)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug, category, count, minGamesText]);

  useEffect(() => {
    let cancelled = false;
    setLogos({});
    setColours({});
    if (!data) return;
    void Promise.all(
      data.leaders.map(async (l) => {
        const name = l.team_name ?? "";
        const [logo, teamColours] = await Promise.all([
          getTeamLogoCached({ leagueId: l.league_id, teamName: name }).catch(() => null),
          extractTeamColors(name, l.league_id).catch(() => null),
        ]);
        return [l.id, logo, teamColours?.primary ?? null] as const;
      }),
    ).then((rows) => {
      if (cancelled) return;
      setLogos(Object.fromEntries(rows.map(([id, logo]) => [id, logo])));
      setColours(Object.fromEntries(rows.map(([id, , colour]) => [id, colour])));
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const title = titleText ?? (data?.category.title ?? "").toUpperCase();
  const banner = bannerText ?? (data ? (STAT_BANNERS[data.category.key] ?? `${data.category.short}, through ${data.gamesCounted} games`) : "");
  const brand = useMemo(() => ({ leagueName: subtitle, leagueLogoUrl, primaryHex }), [subtitle, leagueLogoUrl, primaryHex]);

  const render = useMemo(() => {
    if (!data || data.leaders.length === 0) return null;
    const footnote = [`Through ${data.gamesCounted} games`, data.minGames > 1 ? `Min. ${data.minGames} games` : ""].filter(Boolean).join("  ·  ");
    return () => renderRankedBarsCard({ style, title, banner, brand, leaders: data.leaders, logos, colours, footnote });
  }, [data, style, title, banner, brand, logos, colours]);

  const fileName = `ranked-${category}-${slug}${style === "league" ? "" : `-${style}`}.png`;
  const card = useStudioCard(render, fileName);

  const chooseSlug = (v: string) => {
    setSlug(v);
    setBannerText(null);
    rememberCompetition(SLUG_KEY, v);
  };

  const chooseCategory = (v: string) => {
    setCategory(v);
    setTitleText(null);
    setBannerText(null);
  };

  const error = loadError || card.error;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title="Ranked bars"
        description="One number down a list of players, each bar in the player's team colour."
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
      >
        <CompetitionField value={slug} onChange={chooseSlug} competitions={competitions} />

        <Field label="Stat">
          <Select value={category} onValueChange={chooseCategory}>
            <SelectTrigger className={FIELD} data-testid="select-bars-stat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {(data?.categories ?? []).map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <RangeField label="Players" display={count} value={count} onChange={setCount} min={5} max={10} step={1} testId="slider-bars-count" />

        <Field label={`Minimum games${data ? ` (auto: ${data.minGames})` : ""}`} hint="Leave empty for half of the most games anyone has played.">
          <input
            type="number"
            min={1}
            value={minGamesText}
            placeholder={data ? String(data.minGames) : "auto"}
            onChange={(e) => setMinGamesText(e.target.value)}
            className={FIELD}
            data-testid="input-bars-min-games"
          />
        </Field>

        <Field label="Card title">
          <input value={title} onChange={(e) => setTitleText(e.target.value.toUpperCase() || null)} className={FIELD} data-testid="input-bars-title" />
        </Field>

        <Field label="Card subtitle">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={FIELD} />
        </Field>

        <Field label="Banner line">
          <input value={banner} onChange={(e) => setBannerText(e.target.value || null)} className={FIELD} />
        </Field>

        <CardStylePicker value={style} onChange={setStyle} primaryHex={primaryHex} />

        {usesLeagueColour(style) && <ColourField value={primaryHex} custom={!!colorOverride} onChange={updateColour} onReset={resetColour} />}

        {error && <p className={ERROR}>{error}</p>}
      </Panel>

      <Panel className="order-1 lg:order-2" bodyClassName="!p-3 sm:!p-5">
        {loading && !data ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-accent)]" />
          </div>
        ) : (
          <Stage
            busy={card.rendering && !card.hasCard}
            empty={!render && !loading ? "No players qualify yet. This competition may not have play-by-play, or try a lower minimum." : undefined}
          >
            <div ref={card.hostRef} className="w-full" />
          </Stage>
        )}

        <div className="mx-auto mt-3 max-w-[640px] space-y-2">
          <SaveActions
            canShare={card.canShare}
            onSave={card.saveToPhotos}
            saveDisabled={!card.shareFile || card.rendering}
            onDownload={card.download}
            downloadDisabled={!card.hasCard || card.rendering || card.downloading}
            downloading={card.downloading}
          />
          <p className={`text-center ${HINT}`}>Card size: 1080×1350px (Instagram portrait)</p>
        </div>
      </Panel>
    </div>
  );
}
