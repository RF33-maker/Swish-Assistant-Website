/**
 * The NBL National Cup knockout bracket.
 *
 * Basketball England publishes the whole draw up front (a numbered G1…G127 tree), so the
 * shape of the bracket is saved once in `cup_bracket_games` and results are filled in as
 * they come. Everything here is a pure function over those rows, so it can be tested
 * without the network or the database. Fetching lives in server/nationalCup.ts.
 *
 * A game's two sides are either named on the row (the opening round, or once Basketball
 * England lists the fixture) or "winner of game N", which `resolveBracket` works out.
 */

export type CupRound = "R1" | "R64" | "R32" | "R16" | "QF" | "SF" | "F";

/** A saved bracket game, as `cup_bracket_games` returns it. */
export type CupGameRow = {
  league_id: string;
  game_no: number;
  round: CupRound;
  game_date: string | null;
  tip_time: string | null;
  home_name: string | null;
  away_name: string | null;
  /** Game numbers whose winners play here, when the side isn't named yet. */
  home_from: number | null;
  away_from: number | null;
  /** The home side had no opponent in the opening round and went straight through. */
  is_bye: boolean;
  home_score: number | null;
  away_score: number | null;
  forfeit: boolean;
  /** Crests as Basketball England shows them, saved with each fixture. */
  home_logo_url?: string | null;
  away_logo_url?: string | null;
};

export type CupSide = {
  /** The team's name, or null while the game that feeds this side hasn't been decided. */
  name: string | null;
  /** The game this side is waiting on, when `name` is null. */
  waitingOn: number | null;
  score: number | null;
  winner: boolean;
};

export type ResolvedCupGame = {
  gameNo: number;
  round: CupRound;
  date: string | null;
  tipTime: string | null;
  home: CupSide;
  away: CupSide;
  isBye: boolean;
  forfeit: boolean;
  status: "bye" | "final" | "upcoming" | "waiting";
  /** Both teams are known, so the game can be looked up on the schedule. */
  ready: boolean;
};

export const CUP_ROUNDS: { round: CupRound; label: string; short: string }[] = [
  { round: "R1", label: "Round 1", short: "R1" },
  { round: "R64", label: "Round of 64", short: "R64" },
  { round: "R32", label: "Round of 32", short: "R32" },
  { round: "R16", label: "Round of 16", short: "R16" },
  { round: "QF", label: "Quarter-finals", short: "QF" },
  { round: "SF", label: "Semi-finals", short: "SF" },
  { round: "F", label: "Final", short: "Final" },
];

export function roundLabel(round: CupRound): string {
  return CUP_ROUNDS.find((r) => r.round === round)?.label ?? round;
}

/** 20–0 is how a forfeited game is recorded. */
export function isForfeitScore(home: number | null, away: number | null): boolean {
  return (home === 20 && away === 0) || (home === 0 && away === 20);
}

/**
 * Works out both sides of every game, following winners up the tree. Games are resolved in
 * number order, which is also bracket order, so a feeder is always done before the game it feeds.
 */
export function resolveBracket(rows: CupGameRow[]): ResolvedCupGame[] {
  const byNo = new Map<number, ResolvedCupGame>();

  const winnerOf = (gameNo: number | null): string | null => {
    if (gameNo === null) return null;
    const g = byNo.get(gameNo);
    if (!g) return null;
    if (g.home.winner) return g.home.name;
    if (g.away.winner) return g.away.name;
    return null;
  };

  const sorted = [...rows].sort((a, b) => a.game_no - b.game_no);
  for (const row of sorted) {
    const homeName = row.home_name ?? winnerOf(row.home_from);
    const awayName = row.is_bye ? null : row.away_name ?? winnerOf(row.away_from);
    const scored = row.home_score !== null && row.away_score !== null;
    let homeWins = false;
    let awayWins = false;
    if (row.is_bye) homeWins = !!homeName;
    else if (scored && row.home_score !== row.away_score) {
      homeWins = row.home_score! > row.away_score!;
      awayWins = !homeWins;
    }
    const ready = !!homeName && !!awayName && !row.is_bye;
    byNo.set(row.game_no, {
      gameNo: row.game_no,
      round: row.round,
      date: row.game_date,
      tipTime: row.tip_time,
      home: { name: homeName, waitingOn: homeName ? null : row.home_from, score: row.home_score, winner: homeWins },
      away: { name: awayName, waitingOn: awayName || row.is_bye ? null : row.away_from, score: row.away_score, winner: awayWins },
      isBye: row.is_bye,
      forfeit: row.forfeit || (scored && isForfeitScore(row.home_score, row.away_score)),
      status: row.is_bye ? "bye" : scored ? "final" : ready ? "upcoming" : "waiting",
      ready,
    });
  }
  return [...byNo.values()];
}

/** Groups resolved games by round, in bracket order. */
export function gamesByRound(games: ResolvedCupGame[]): { round: CupRound; label: string; games: ResolvedCupGame[] }[] {
  return CUP_ROUNDS.map(({ round, label }) => ({ round, label, games: games.filter((g) => g.round === round).sort((a, b) => a.gameNo - b.gameNo) })).filter(
    (r) => r.games.length > 0,
  );
}

/** The team that has won the final, if it has been played. */
export function champion(games: ResolvedCupGame[]): string | null {
  const final = games.find((g) => g.round === "F");
  if (!final) return null;
  return final.home.winner ? final.home.name : final.away.winner ? final.away.name : null;
}

/** Teams that have played in the cup and not yet lost a game. */
export function teamsRemaining(games: ResolvedCupGame[]): number {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const g of games) {
    for (const side of [g.home, g.away]) if (side.name) seen.add(side.name);
    if (g.home.winner && g.away.name) out.add(g.away.name);
    if (g.away.winner && g.home.name) out.add(g.home.name);
  }
  return [...seen].filter((n) => !out.has(n)).length;
}

/** A club as it reads on a bracket card: "Sussex Storm Senior Men I" -> "Sussex Storm", "London Lions Senior Men II" -> "London Lions II". */
export function displayTeamName(name: string): string {
  return name
    .replace(/\(withdrawn\)/gi, "")
    .replace(/\bSenior (Men|Women)\b/gi, "")
    .replace(/\s+I$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "2026-10-18" -> "Sun 18 Oct" */
export function formatCupDate(date: string | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

// ── matching Basketball England's fixtures to bracket games ─────────────────

/** A team name with the noise taken out, so "Sussex Storm Senior Men I" and "Sussex Storm" meet. */
export function teamKey(name: string): string {
  return name
    .replace(/\(withdrawn\)/gi, " ") // the site tags a team that pulled out
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["senior", "men", "women", "i", "ii", "iii", "the"].includes(w))
    .join(" ");
}

export type CupFixture = {
  gameDate: string;
  tipTime: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  reportId: string | null;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
};

/**
 * The bracket game a fixture belongs to: the one whose two sides are the fixture's two
 * teams, in either order. Only games from `fromRound` onward are considered, so a rematch
 * of an earlier-round pairing can't be matched twice.
 */
export function findGameForFixture(games: ResolvedCupGame[], fixture: Pick<CupFixture, "homeTeam" | "awayTeam" | "gameDate">): ResolvedCupGame | null {
  const a = teamKey(fixture.homeTeam);
  const b = teamKey(fixture.awayTeam);
  if (!a || !b) return null;
  const hits = games.filter((g) => {
    if (!g.ready) return false;
    const h = teamKey(g.home.name!);
    const aw = teamKey(g.away.name!);
    return (h === a && aw === b) || (h === b && aw === a);
  });
  if (hits.length <= 1) return hits[0] ?? null;
  // Same pairing twice in one bracket can only be a different round; take the one nearest the date.
  return hits.sort((x, y) => Math.abs(dayGap(x.date, fixture.gameDate)) - Math.abs(dayGap(y.date, fixture.gameDate)))[0];
}

function dayGap(a: string | null, b: string): number {
  if (!a) return Number.MAX_SAFE_INTEGER;
  return (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

// ── reading Basketball England's pages ──────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** The match days a division has, as YYYY-MM-DD, from getDateOptions.php. */
export function parseCupDates(html: string): string[] {
  return [...html.matchAll(/<option\b[^>]*\bvalue="(\d{4}-\d{2}-\d{2})"/gi)].map((m) => m[1]);
}

/**
 * Every fixture in one day's rows, played or not. A finished game has two ".score" spans; an
 * upcoming one has only a time.
 */
export function parseCupFixtures(html: string, gameDate: string): CupFixture[] {
  const out: CupFixture[] = [];
  for (const m of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const [, attrs, body] = m;
    const names = [...body.matchAll(/class="club-name">([^<]*)</gi)].map((n) => decodeEntities(n[1]));
    if (names.length !== 2 || !names[0] || !names[1]) continue;
    const scores = [...body.matchAll(/class="score[^"]*">\s*(\d+)\s*</gi)].map((s) => Number(s[1]));
    const scored = scores.length === 2;
    const logos = [...body.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*class="club-logo"/gi)].map((l) => upgradeCupLogo(l[1].replace(/&amp;/g, "&")));
    out.push({
      gameDate,
      tipTime: /class="time[^"]*">\s*(\d{1,2}:\d{2})\s*</i.exec(body)?.[1] ?? null,
      homeTeam: names[0],
      awayTeam: names[1],
      homeScore: scored ? scores[0] : null,
      awayScore: scored ? scores[1] : null,
      reportId: /report\/([0-9a-f-]{36})/i.exec(attrs)?.[1] ?? null,
      homeLogoUrl: logos[0] ?? null,
      awayLogoUrl: logos[1] ?? null,
    });
  }
  return out;
}

/** The site serves 64px squares, which look soft on a card; ask for a 128px, aspect-safe one. */
export function upgradeCupLogo(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/\/h_\d+,w_\d+\//, "/c_fit,h_128,w_128/");
}

/** Every team's crest, by name key, from whichever saved fixture has one. */
export function logoByTeam(rows: CupGameRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.home_name && r.home_logo_url) out.set(teamKey(r.home_name), r.home_logo_url);
    if (r.away_name && r.away_logo_url) out.set(teamKey(r.away_name), r.away_logo_url);
  }
  return out;
}

/** The fields to save on a bracket game when Basketball England lists its fixture. */
export function updateFromFixture(game: ResolvedCupGame, fixture: CupFixture) {
  // Keep the home/away order the bracket already has, unless the site lists them the other way round.
  const sameOrder = teamKey(game.home.name ?? "") === teamKey(fixture.homeTeam);
  const [homeScore, awayScore] = sameOrder
    ? [fixture.homeScore, fixture.awayScore]
    : [fixture.awayScore, fixture.homeScore];
  const [homeLogo, awayLogo] = sameOrder ? [fixture.homeLogoUrl, fixture.awayLogoUrl] : [fixture.awayLogoUrl, fixture.homeLogoUrl];
  return {
    game_date: fixture.gameDate,
    tip_time: fixture.tipTime,
    home_name: game.home.name,
    away_name: game.away.name,
    home_score: homeScore,
    away_score: awayScore,
    forfeit: isForfeitScore(homeScore, awayScore),
    home_logo_url: homeLogo,
    away_logo_url: awayLogo,
  };
}
