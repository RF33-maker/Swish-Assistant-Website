import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useCompetitionCardBrand } from "@/hooks/useCompetitionCardBrand";
import { useStudioCard, useStudioCompetitions } from "@/hooks/useStudioCard";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { renderVennCard } from "@/lib/generateVennCard";
import { DEFAULT_VENN_IDS, VENN_CRITERIA, defaultTopCount } from "@/lib/vennLayout";
import type { LandscapeResponse } from "@/types/landscape";

const DEFAULT_SLUG = "nbl-division-1-2026-2027";
const SLUG_KEY = "weekly-awards-slug";
const SEATS = ["Top circle", "Bottom left circle", "Bottom right circle"];

function stripSeason(name: string): string {
  return name.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
}

/** Team Venn: three top lists overlapping, with each club's crest in the region for the lists it makes. */
export default function VennStudio() {
  const competitions = useStudioCompetitions();
  const [slug, setSlug] = useState(() => new URLSearchParams(window.location.search).get("slug") || readStoredCompetition(SLUG_KEY) || DEFAULT_SLUG);
  const [style, setStyle] = useCardStyle();
  const [data, setData] = useState<LandscapeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([...DEFAULT_VENN_IDS]);
  // null: follow the size of the league.
  const [topChoice, setTopChoice] = useState<number | null>(null);
  const [title, setTitle] = useState("WHO DOES IT ALL?");
  const [subtitle, setSubtitle] = useState("");
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const { leagueLogoUrl, primaryHex, colorOverride, updateColour, resetColour } = useCompetitionCardBrand(slug);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/league/${encodeURIComponent(slug)}/landscape`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Competition not found or not public" : `Request failed (${res.status})`);
        return (await res.json()) as LandscapeResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setSubtitle(stripSeason(json.league.name));
        setTopChoice(null);
      })
      .catch((err) => !cancelled && (setData(null), setLoadError(err.message)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLogos({});
    if (!data) return;
    void Promise.all(
      data.teams.map(async (t) => [t.id, await getTeamLogoCached({ leagueId: t.league_id, teamName: t.name }).catch(() => null)] as const),
    ).then((pairs) => !cancelled && setLogos(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [data]);

  const criteria = useMemo(() => picks.map((id) => VENN_CRITERIA.find((c) => c.id === id) ?? VENN_CRITERIA[0]), [picks]);
  const teams = data?.teams ?? [];
  const top = topChoice ?? defaultTopCount(teams.length);
  const banner = bannerText ?? (data ? `Through ${data.gamesCounted} game${data.gamesCounted === 1 ? "" : "s"}` : "");
  const notRecorded = criteria.some((c) => teams.length > 0 && teams.every((t) => t.metrics[c.metric] == null));
  const distinct = new Set(picks).size === 3;

  const brand = useMemo(() => ({ leagueName: subtitle, leagueLogoUrl, primaryHex }), [subtitle, leagueLogoUrl, primaryHex]);

  const render = useMemo(() => {
    if (!data || teams.length < 4 || !distinct || notRecorded) return null;
    return () =>
      renderVennCard({
        style,
        title,
        banner,
        brand,
        teams: data.teams,
        criteria,
        top,
        logos,
        footnote: data.minGames > 1 ? `Min. ${data.minGames} games` : undefined,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, style, title, banner, brand, criteria, top, logos, distinct, notRecorded]);

  const fileName = `venn-${picks.join("-")}-${slug}${style === "league" ? "" : `-${style}`}.png`;
  const card = useStudioCard(render, fileName);

  const choose = useCallback((seat: number, id: string) => {
    setPicks((prev) => prev.map((p, i) => (i === seat ? id : p)));
  }, []);

  const chooseSlug = (v: string) => {
    setSlug(v);
    setBannerText(null);
    rememberCompetition(SLUG_KEY, v);
  };

  const error = loadError || card.error;
  const empty = !distinct
    ? "Pick three different lists."
    : notRecorded
      ? "This competition's box scores don't record one of these stats. Try another."
      : "Not enough teams have played enough games yet.";

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title="Team Venn"
        description="Three top lists overlapping. The clubs that make all three sit in the middle."
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
      >
        <CompetitionField value={slug} onChange={chooseSlug} competitions={competitions} />

        {SEATS.map((seat, i) => (
          <Field key={seat} label={seat}>
            <Select value={picks[i]} onValueChange={(v) => choose(i, v)}>
              <SelectTrigger className={FIELD} data-testid={`select-venn-${i}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={SELECT_MENU}>
                {VENN_CRITERIA.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ))}

        {teams.length >= 4 && (
          <RangeField
            label="Teams on each list"
            display={`Top ${top} of ${teams.length}`}
            hint="Starts at a third of the league, so the card means the same in any size of league."
            value={top}
            onChange={setTopChoice}
            min={2}
            max={Math.max(3, Math.floor(teams.length / 2))}
            step={1}
            testId="slider-venn-top"
          />
        )}

        <Field label="Card title">
          <input value={title} onChange={(e) => setTitle(e.target.value.toUpperCase())} className={FIELD} data-testid="input-venn-title" />
        </Field>

        <Field label="Card subtitle">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={FIELD} />
        </Field>

        <Field label="Banner line" hint='For example "Through week 5". Clear it to go back to the games counted.'>
          <input value={banner} onChange={(e) => setBannerText(e.target.value || null)} className={FIELD} />
        </Field>

        <CardStylePicker value={style} onChange={setStyle} primaryHex={primaryHex} />

        {style !== "swish" && <ColourField value={primaryHex} custom={!!colorOverride} onChange={updateColour} onReset={resetColour} />}

        {error && <p className={ERROR}>{error}</p>}
      </Panel>

      <Panel className="order-1 lg:order-2" bodyClassName="!p-3 sm:!p-5">
        {loading && !data ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-accent)]" />
          </div>
        ) : (
          <Stage busy={card.rendering && !card.hasCard} empty={!render ? empty : undefined}>
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
          <p className={`text-center ${HINT}`}>
            {data ? `Based on ${data.gamesCounted} game${data.gamesCounted === 1 ? "" : "s"} · ` : ""}Card size: 1080×1350px (Instagram portrait)
          </p>
        </div>
      </Panel>
    </div>
  );
}
