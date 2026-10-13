import { timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { articleDocToPlainText, isCoverImageSrc, sanitizeArticleDoc, type ArticleDoc, type ArticleNode, type ArticleTag } from "@shared/newsArticle";
import {
  buildWeekendReport,
  isDateOnly,
  weekendContaining,
  weekendReportSummary,
  weekendReportTitle,
  type GameRow,
  type PlayerLine,
  type WeekendReportData,
} from "@shared/weekendReport";

/**
 * Weekend match reports: every Monday (and again on Thursday, once late stat
 * corrections have landed) each competition that played over the weekend gets
 * a round-up in News, built from its box scores by shared/weekendReport.ts.
 *
 * A report is one news article with a stable slug, so running this again
 * updates the same article rather than adding another. New reports are saved
 * as drafts for an admin to publish, unless WEEKEND_REPORTS_AUTO_PUBLISH=true.
 * A report that is already published is refreshed in place and stays
 * published, so a corrected stat line is corrected on the page too.
 *
 * Nothing here writes prose. The sentences come from templates over the
 * numbers; articles written by people are never touched.
 */

type AdminGuard = (req: Request, res: Response) => Promise<string | null>;

interface Deps {
  requireAdmin: AdminGuard;
  /** Tidies a name the way the rest of the site shows it. */
  formatName: (name: string) => string;
}

const DAY = 24 * 60 * 60 * 1000;
const CHUNK = 20;
const REPORT_SLUG_PREFIX = "weekend-report-";
const CANDIDATES = 8;

export const weekendReportSlug = (competitionSlug: string, to: string) => `${REPORT_SLUG_PREFIX}${competitionSlug}-${to}`;

interface CompetitionRow {
  league_id: string;
  slug: string | null;
  name: string | null;
  parent_league_id: string | null;
  is_public: boolean | null;
  banner_url: string | null;
}

export interface WeekendReportResult {
  competition: string;
  slug: string;
  games: number;
  outcome: "created" | "updated" | "skipped";
  published: boolean;
  articleId?: string;
  note?: string;
}

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function fetchCompletedGames(from: string, to: string): Promise<GameRow[]> {
  const start = new Date(`${from}T00:00:00Z`).toISOString();
  const end = new Date(Date.parse(`${to}T00:00:00Z`) + DAY).toISOString();
  const { data, error } = await supabaseAdmin
    .from("v_game_results")
    .select("game_key, league_id, home_team, away_team, home_score, away_score, match_time, home_q1, home_q2, home_q3, home_q4, away_q1, away_q2, away_q3, away_q4, game_status, schedule_status")
    .gte("match_time", start)
    .lt("match_time", end)
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .limit(1000);
  if (error) throw new Error(`Couldn't load the weekend's games: ${error.message}`);
  return ((data ?? []) as (GameRow & { game_status: string | null; schedule_status: string | null })[]).filter((g) =>
    /^final/i.test(String(g.game_status ?? g.schedule_status ?? "")),
  );
}

async function fetchCompetitions(leagueIds: string[]): Promise<Map<string, CompetitionRow>> {
  const byId = new Map<string, CompetitionRow>();
  let pending = Array.from(new Set(leagueIds));
  // A game's league can be a child competition; its report belongs to the parent.
  for (let depth = 0; depth < 3 && pending.length; depth++) {
    const { data, error } = await supabaseAdmin
      .from("competitions")
      .select("league_id, slug, name, parent_league_id, is_public, banner_url")
      .in("league_id", pending);
    if (error) throw new Error(`Couldn't load competitions: ${error.message}`);
    for (const row of (data ?? []) as CompetitionRow[]) byId.set(row.league_id, row);
    pending = Array.from(new Set(((data ?? []) as CompetitionRow[]).map((r) => r.parent_league_id).filter((id): id is string => !!id && !byId.has(id))));
  }
  return byId;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const numOrNull = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

async function fetchPlayerLines(gameKeys: string[], formatName: (name: string) => string): Promise<PlayerLine[]> {
  const rows: any[] = [];
  for (const keys of chunks(gameKeys, CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("vw_player_game_scores")
      .select("game_key, player_id, full_name, team_name, pts, reb, ast, stl, blk, tov, fga, fta, ts_pct, game_score")
      .in("game_key", keys)
      .limit(1000);
    if (error) throw new Error(`Couldn't load player lines: ${error.message}`);
    rows.push(...(data ?? []));
  }

  const playerIds = Array.from(new Set(rows.map((r) => r.player_id as string).filter(Boolean)));
  const players = new Map<string, any>();
  for (const ids of chunks(playerIds, 150)) {
    const { data } = await supabaseAdmin.from("players").select("id, full_name, slug, photo_path, photo_path_bg_removed").in("id", ids);
    for (const p of data ?? []) players.set((p as any).id, p);
  }

  const lines: PlayerLine[] = rows.map((r) => {
    const player = players.get(r.player_id);
    return {
      playerId: r.player_id,
      slug: player?.slug ?? null,
      name: formatName(player?.full_name || r.full_name || "Unknown player"),
      team: r.team_name ?? null,
      gameKey: r.game_key,
      pts: num(r.pts),
      reb: num(r.reb),
      ast: num(r.ast),
      stl: num(r.stl),
      blk: num(r.blk),
      tov: num(r.tov),
      fgm: null,
      fga: numOrNull(r.fga),
      tpm: null,
      tpa: null,
      ftm: null,
      fta: numOrNull(r.fta),
      tsPct: numOrNull(r.ts_pct),
      gameScore: numOrNull(r.game_score),
      photoPath: player?.photo_path ?? null,
      cutoutPath: player?.photo_path_bg_removed ?? null,
    };
  });
  return lines;
}

/** Shooting splits and borrowed photos, for the few lines that become cards. */
async function enrichCandidates(lines: PlayerLine[]): Promise<void> {
  const seen = new Set<string>();
  const candidates: PlayerLine[] = [];
  for (const l of [...lines].sort((a, b) => (b.gameScore ?? -1) - (a.gameScore ?? -1))) {
    if (l.gameScore == null || seen.has(l.playerId)) continue;
    seen.add(l.playerId);
    candidates.push(l);
    if (candidates.length >= CANDIDATES) break;
  }
  if (!candidates.length) return;

  const { data: stats } = await supabaseAdmin
    .from("player_stats")
    .select("game_key, player_id, sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, sfreethrowsmade, sfreethrowsattempted")
    .in("game_key", Array.from(new Set(candidates.map((c) => c.gameKey))))
    .in("player_id", candidates.map((c) => c.playerId));
  const statsByKey = new Map<string, any>((stats ?? []).map((s: any) => [`${s.game_key}_${s.player_id}`, s]));
  for (const c of candidates) {
    const s = statsByKey.get(`${c.gameKey}_${c.playerId}`);
    if (!s) continue;
    c.fgm = numOrNull(s.sfieldgoalsmade);
    c.fga = numOrNull(s.sfieldgoalsattempted) ?? c.fga;
    c.tpm = numOrNull(s.sthreepointersmade);
    c.tpa = numOrNull(s.sthreepointersattempted);
    c.ftm = numOrNull(s.sfreethrowsmade);
    c.fta = numOrNull(s.sfreethrowsattempted) ?? c.fta;
  }

  // A player whose own record has no photo can borrow one from another record of the same name.
  const needPhoto = candidates.filter((c) => !c.cutoutPath || !c.photoPath);
  if (!needPhoto.length) return;
  const { data: sameName } = await supabaseAdmin
    .from("players")
    .select("full_name, photo_path, photo_path_bg_removed")
    .in("full_name", Array.from(new Set(needPhoto.map((c) => c.name))))
    .or("photo_path.not.is.null,photo_path_bg_removed.not.is.null");
  const byName = new Map<string, any>();
  for (const p of sameName ?? []) {
    const key = String((p as any).full_name).toLowerCase();
    const have = byName.get(key) ?? {};
    byName.set(key, { photo_path: have.photo_path ?? (p as any).photo_path, photo_path_bg_removed: have.photo_path_bg_removed ?? (p as any).photo_path_bg_removed });
  }
  for (const c of needPhoto) {
    const borrowed = byName.get(c.name.toLowerCase());
    if (!borrowed) continue;
    c.photoPath = c.photoPath ?? borrowed.photo_path ?? null;
    c.cutoutPath = c.cutoutPath ?? borrowed.photo_path_bg_removed ?? null;
  }
}

function reportTags(data: WeekendReportData): ArticleTag[] {
  const tags: ArticleTag[] = [{ kind: "competition", key: data.competitionSlug, label: data.competitionName }];
  for (const g of data.games) {
    if (tags.length >= 30) break;
    tags.push({
      kind: "game",
      key: g.gameKey,
      label: `${g.home} v ${g.away}`,
      context: { competition_slug: g.competitionSlug ?? data.competitionSlug, ...(g.matchTime ? { matchtime: g.matchTime } : {}) },
    });
  }
  return tags;
}

const reportNode = (data: WeekendReportData): ArticleNode => ({ type: "weekendReport", attrs: { data } });

/** The stored body with its report replaced, keeping anything a person added around it. */
function withReport(existing: unknown, data: WeekendReportData, isDraft: boolean): ArticleDoc | null {
  const doc = sanitizeArticleDoc(existing);
  const index = doc?.content.findIndex((n) => n.type === "weekendReport") ?? -1;
  if (doc && index >= 0) {
    const content = [...doc.content];
    content[index] = reportNode(data);
    return sanitizeArticleDoc({ type: "doc", content });
  }
  // The report block was deleted by hand: leave a published article as it is.
  return isDraft || !doc ? sanitizeArticleDoc({ type: "doc", content: [reportNode(data)] }) : null;
}

async function saveReportArticle(data: WeekendReportData, bannerUrl: string | null, autoPublish: boolean): Promise<WeekendReportResult> {
  const slug = weekendReportSlug(data.competitionSlug, data.to);
  const base = { competition: data.competitionName, slug, games: data.games.length };

  const { data: existing, error: loadError } = await supabaseAdmin
    .from("news_articles")
    .select("id, article_type, is_published, content, first_published_at, image_url")
    .eq("slug", slug)
    .maybeSingle();
  if (loadError) throw new Error(`Couldn't look up ${slug}: ${loadError.message}`);
  if (existing && existing.article_type !== "roundup") {
    return { ...base, outcome: "skipped", published: false, note: "Another article already uses this URL." };
  }

  const now = new Date().toISOString();
  const doc = existing ? withReport(existing.content, data, !existing.is_published) : withReport(null, data, true);
  if (!doc) return { ...base, outcome: "skipped", published: !!existing?.is_published, articleId: existing?.id, note: "The report block was removed from this article." };

  const columns = {
    title: weekendReportTitle(data.competitionName, data.from, data.to),
    summary: weekendReportSummary(data),
    content: doc,
    body: articleDocToPlainText(doc) || null,
    article_type: "roundup",
    league: data.competitionName.slice(0, 100),
    updated_at: now,
  };

  // The competition's banner is the cover image. A cover someone chose by hand
  // (anything that isn't a banner) is left alone on later runs.
  const cover = bannerUrl && isCoverImageSrc(bannerUrl) ? bannerUrl : null;
  const coverColumns =
    cover && (!existing || !existing.image_url || /\/league-banners\//.test(existing.image_url))
      ? { image_url: cover, image_alt: `${data.competitionName} banner`, image_credit: null }
      : {};

  let articleId: string;
  let published: boolean;
  let outcome: WeekendReportResult["outcome"];
  if (existing) {
    const { error } = await supabaseAdmin.from("news_articles").update({ ...columns, ...coverColumns }).eq("id", existing.id);
    if (error) throw new Error(`Couldn't update ${slug}: ${error.message}`);
    articleId = existing.id;
    published = !!existing.is_published;
    outcome = "updated";
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("news_articles")
      .insert({
        ...columns,
        ...coverColumns,
        slug,
        is_published: autoPublish,
        published_at: now,
        first_published_at: autoPublish ? now : null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(`Couldn't create ${slug}: ${error?.message}`);
    articleId = created.id;
    published = autoPublish;
    outcome = "created";
  }

  const tags = reportTags(data);
  const { error: deleteError } = await supabaseAdmin.from("news_article_tags").delete().eq("article_id", articleId);
  if (deleteError) throw new Error(`Couldn't replace tags on ${slug}: ${deleteError.message}`);
  const { error: tagError } = await supabaseAdmin.from("news_article_tags").insert(
    tags.map((tag, index) => ({
      article_id: articleId,
      kind: tag.kind,
      key: tag.key,
      label: tag.label,
      context: tag.context ?? null,
      sort_order: index,
    })),
  );
  if (tagError) throw new Error(`Couldn't tag ${slug}: ${tagError.message}`);

  return { ...base, outcome, published, articleId };
}

export interface GenerateOptions {
  /** Any day in the weekend wanted; the default is the weekend just gone. */
  day?: string;
  /** Limit to one competition's slug. */
  competition?: string;
  autoPublish?: boolean;
  formatName: (name: string) => string;
  now?: Date;
}

/** Builds a report for every public competition that played over the weekend, without saving anything. */
export async function buildWeekendReports(
  options: GenerateOptions,
): Promise<{ from: string; to: string; reports: WeekendReportData[]; banners: Map<string, string | null> }> {
  const today = (options.now ?? new Date()).toISOString().slice(0, 10);
  const { from, to } = weekendContaining(options.day ?? today);

  const games = await fetchCompletedGames(from, to);
  const competitions = await fetchCompetitions(games.map((g) => g.league_id).filter((id): id is string => !!id));

  // Group games under the competition their page belongs to.
  const rootOf = (leagueId: string): CompetitionRow | null => {
    let row = competitions.get(leagueId) ?? null;
    for (let i = 0; row?.parent_league_id && i < 3; i++) row = competitions.get(row.parent_league_id) ?? row;
    return row;
  };
  const byRoot = new Map<string, { root: CompetitionRow; games: GameRow[] }>();
  for (const g of games) {
    if (!g.league_id) continue;
    const root = rootOf(g.league_id);
    if (!root || !root.is_public || !root.slug || !root.name) continue;
    if (options.competition && root.slug !== options.competition) continue;
    const entry = byRoot.get(root.league_id) ?? { root, games: [] };
    entry.games.push(g);
    byRoot.set(root.league_id, entry);
  }

  const competitionSlugByLeague: Record<string, string> = {};
  for (const [id, row] of Array.from(competitions)) if (row.slug) competitionSlugByLeague[id] = row.slug;

  const reports: WeekendReportData[] = [];
  const banners = new Map<string, string | null>();
  for (const { root, games: rootGames } of Array.from(byRoot.values())) {
    const lines = await fetchPlayerLines(rootGames.map((g) => g.game_key), options.formatName);
    await enrichCandidates(lines);
    const data = buildWeekendReport({
      competition: { name: root.name!, slug: root.slug! },
      from,
      to,
      games: rootGames,
      lines,
      competitionSlugByLeague,
      now: options.now,
    });
    if (data.games.length) {
      reports.push(data);
      banners.set(root.slug!, root.banner_url);
    }
  }
  return { from, to, reports, banners };
}

/** Builds and saves a report for every public competition that played over the weekend. */
export async function generateWeekendReports(options: GenerateOptions): Promise<{ from: string; to: string; results: WeekendReportResult[] }> {
  const { from, to, reports, banners: bannerByCompetition } = await buildWeekendReports(options);
  const results: WeekendReportResult[] = [];
  for (const data of reports) results.push(await saveReportArticle(data, bannerByCompetition.get(data.competitionSlug) ?? null, options.autoPublish === true));
  return { from, to, results };
}

function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(String(req.headers.authorization ?? ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function registerWeekendReportRoutes(app: Express, { requireAdmin, formatName }: Deps) {
  const autoPublish = () => process.env.WEEKEND_REPORTS_AUTO_PUBLISH === "true";

  // POST /api/admin/weekend-reports { day?, competition? } — build or refresh reports now
  app.post("/api/admin/weekend-reports", async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req, res);
      if (!userId) return;
      const day = typeof req.body?.day === "string" && req.body.day ? req.body.day : undefined;
      if (day && !isDateOnly(day)) return res.status(400).json({ error: "The day must look like 2026-10-11." });
      const competition = typeof req.body?.competition === "string" && req.body.competition ? req.body.competition : undefined;
      res.json(await generateWeekendReports({ day, competition, autoPublish: autoPublish(), formatName }));
    } catch (err: any) {
      console.error("[WeekendReports] admin run failed", err?.message);
      res.status(500).json({ error: err?.message || "Couldn't build the reports." });
    }
  });

  // GET /api/cron/weekend-reports — the Monday and Thursday run. Vercel sends CRON_SECRET as a bearer token.
  app.get("/api/cron/weekend-reports", async (req: Request, res: Response) => {
    if (!process.env.CRON_SECRET) return res.status(503).json({ error: "CRON_SECRET isn't set." });
    if (!cronAuthorised(req)) return res.status(401).json({ error: "Unauthorised" });
    try {
      const out = await generateWeekendReports({ autoPublish: autoPublish(), formatName });
      console.log(`[WeekendReports] ${out.from}..${out.to}`, out.results.map((r) => `${r.slug}:${r.outcome}`).join(", ") || "no games");
      res.json(out);
    } catch (err: any) {
      console.error("[WeekendReports] cron run failed", err?.message);
      res.status(500).json({ error: err?.message || "Couldn't build the reports." });
    }
  });
}
