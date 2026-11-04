import { useMemo } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import EntityLink from "@/components/EntityLink";
import { abbreviatePlayerName } from "@/lib/playerName";
import {
  boxSeconds,
  stintsForTeam,
  swingCallouts,
  teamGameOnOff,
  type GameOnOffPlayer,
  type OnOffStint,
  type TeamGameOnOff,
} from "@/lib/gameOnOff";
import { GameEmptyCard, GameSection } from "./GameOverview";
import type { MatchupColors } from "./GameScoreHero";

/**
 * The game page's On/Off tab: how each team did with every player on the
 * court and while they sat. The raw numbers are the official box score +/-
 * (see lib/gameOnOff.ts); net ratings are added where our lineup stints cover
 * the game.
 */

export interface GameOnOffBoxPlayer {
  name: string;
  href?: string | null;
  /** In-page handler for a plain click (the league page opens the player inline). */
  onSelect?: (() => void) | null;
  playerId?: string | null;
  teamId?: string | null;
  sminutes?: string | number | null;
  spoints?: number | null;
  splusminuspoints?: number | null;
}

type Colors = Pick<MatchupColors, "home" | "away">;

/** Under a minute off court is no sample at all. */
const MIN_OFF_SECONDS = 60;

function signed(v: number, decimals = 0): string {
  const rounded = Number(v.toFixed(decimals));
  const body = Math.abs(rounded).toFixed(decimals);
  return rounded > 0 ? `+${body}` : rounded < 0 ? `−${body}` : body;
}

function tone(v: number | null | undefined, band = 0): string {
  if (v == null || Math.abs(v) <= band) return "text-[color:var(--ch-text-2)]";
  return v > 0 ? "text-[color:var(--ch-win)]" : "text-[color:var(--ch-loss)]";
}

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}`;

const HEAD = "text-center py-2 px-2 font-medium whitespace-nowrap";
const CELL = "text-center py-2 px-2 tabular-nums whitespace-nowrap";
const NAME_COL = "w-[7.5rem] min-w-[7.5rem] md:w-48 md:min-w-[12rem]";
const PINNED_BG = "bg-[color:var(--ch-bg)] group-hover:bg-[color:var(--ch-surface-2)]";

interface TeamSide {
  team: string;
  color: string;
  result: TeamGameOnOff;
  byKey: Map<string, GameOnOffBoxPlayer>;
}

function buildSide(
  team: string,
  color: string,
  players: GameOnOffBoxPlayer[],
  teamPoints: number,
  oppPoints: number,
  stints: OnOffStint[] | null | undefined,
): TeamSide {
  const keyed = players.map((p, i) => ({ key: p.playerId || `${i}|${p.name}`, p }));
  const teamStints = stintsForTeam(stints, players.map((p) => p.teamId), players.map((p) => p.playerId));
  const result = teamGameOnOff({
    teamPoints,
    oppPoints,
    players: keyed.map(({ key, p }) => ({
      key,
      playerId: p.playerId,
      seconds: boxSeconds(p.sminutes),
      plusMinus: p.splusminuspoints,
    })),
    stints: teamStints,
  });
  return { team, color, result, byKey: new Map(keyed.map(({ key, p }) => [key, p])) };
}

function PlayerName({ player }: { player: GameOnOffBoxPlayer | undefined }) {
  const name = player?.name || "Unknown";
  const inner = (
    <>
      <span className="md:hidden block truncate">{abbreviatePlayerName(name)}</span>
      <span className="hidden md:block truncate">{name}</span>
    </>
  );
  return player?.href ? (
    <EntityLink href={player.href} onNavigate={player.onSelect || undefined} className="block hover:underline underline-offset-2">{inner}</EntityLink>
  ) : inner;
}

function Callouts({ sides, leagueId }: { sides: TeamSide[]; leagueId?: string | null }) {
  const teams = sides
    .map((side) => ({ side, picks: swingCallouts(side.result.players) }))
    .filter((t): t is { side: TeamSide; picks: NonNullable<ReturnType<typeof swingCallouts>> } => t.picks != null);
  if (teams.length === 0) return null;
  return (
    <GameSection title="Biggest swings">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6" data-testid="on-off-callouts">
        {teams.map(({ side, picks }) => (
          <div key={side.team} className="border-t-[3px] pt-3" style={{ borderTopColor: side.color }}>
            <div className="mb-1 flex items-center gap-2">
              {leagueId && <TeamLogo teamName={side.team} leagueId={leagueId} size="xs" />}
              <span className="truncate text-sm font-semibold text-[color:var(--ch-text)]">{side.team}</span>
            </div>
            <ul className="divide-y divide-[color:var(--ch-border)]">
              {[{ player: picks.best, good: true }, { player: picks.worst, good: false }].map(({ player, good }) => {
                const box = side.byKey.get(player.key);
                return (
                  <li key={`${player.key}-${good}`} className="flex items-start gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-[color:var(--ch-text)]">
                          {box?.href ? <EntityLink href={box.href} onNavigate={box.onSelect || undefined} className="hover:underline underline-offset-2">{box.name}</EntityLink> : box?.name}
                        </span>
                        <span className={`text-xs font-semibold ${good ? "text-[color:var(--ch-win)]" : "text-[color:var(--ch-loss)]"}`}>
                          {good ? "Best on/off" : "Worst on/off"}
                        </span>
                      </div>
                      <p className="text-[13px] text-[color:var(--ch-text-2)]">
                        <span className={`font-semibold ${tone(player.on)}`}>{signed(player.on)}</span> in{" "}
                        {Math.round(player.seconds / 60)} minutes on court,{" "}
                        <span className={`font-semibold ${tone(player.off)}`}>{signed(player.off)}</span> in the{" "}
                        {Math.round(player.offSeconds / 60)} they sat
                      </p>
                    </div>
                    <span className={`ch-display ch-num shrink-0 text-lg font-bold ${tone(player.swing)}`} title="On minus off">
                      {signed(player.swing)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </GameSection>
  );
}

function TeamTable({ side, leagueId }: { side: TeamSide; leagueId?: string | null }) {
  const { result } = side;
  const withRatings = result.players.some((p) => p.ratings);
  return (
    <div>
      <div className="pb-2.5 mb-1 flex items-center gap-3 border-b-[3px] text-[color:var(--ch-text)]" style={{ borderBottomColor: side.color }}>
        {leagueId && <TeamLogo teamName={side.team} leagueId={leagueId} size="sm" />}
        <h4 className="ch-section-title flex-1 truncate">{side.team}</h4>
      </div>
      {!result.addsUp ? (
        <p className="py-4 text-sm text-[color:var(--ch-text-2)]">
          On/off isn't shown for {side.team}: the box score's +/- doesn't add up for this game.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="text-[color:var(--ch-text-2)]">
              <tr className="border-b border-[color:var(--ch-border-strong)]">
                <th className={`${NAME_COL} text-left py-2 px-2 sticky left-0 z-20 bg-[color:var(--ch-bg)] font-medium border-r border-[color:var(--ch-border)]`} scope="col">
                  PLAYER
                </th>
                <th className={HEAD} scope="col">MIN</th>
                <th className={HEAD} scope="col" title="Points scored minus conceded with the player on court (box score +/-)">ON</th>
                <th className={HEAD} scope="col" title="Points scored minus conceded while the player sat">OFF</th>
                <th className={HEAD} scope="col" title="On minus off">SWING</th>
                {withRatings && (
                  <>
                    <th className={HEAD} scope="col" title="Net rating per 100 possessions on court">NET ON</th>
                    <th className={HEAD} scope="col" title="Net rating per 100 possessions off court">NET OFF</th>
                    <th className={HEAD} scope="col" title="Net on minus net off">NET +/-</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="text-[color:var(--ch-text)]">
              {result.players.map((p: GameOnOffPlayer) => {
                const sat = p.offSeconds >= MIN_OFF_SECONDS;
                const r = p.ratings;
                return (
                  <tr key={p.key} className="group border-t border-[color:var(--ch-border)] hover:bg-[color:var(--ch-surface-2)]">
                    <td className={`${NAME_COL} py-2 px-2 sticky left-0 z-10 ${PINNED_BG} font-medium border-r border-[color:var(--ch-border)]`} title={side.byKey.get(p.key)?.name}>
                      <PlayerName player={side.byKey.get(p.key)} />
                    </td>
                    <td className={`${CELL} text-[color:var(--ch-text-2)]`}>{clock(p.seconds)}</td>
                    <td className={`${CELL} font-semibold ${tone(p.on)}`}>{signed(p.on)}</td>
                    <td className={`${CELL} ${sat ? tone(p.off) : "text-[color:var(--ch-muted)]"}`}>{sat ? signed(p.off) : "—"}</td>
                    <td className={`${CELL} font-semibold ${sat ? tone(p.swing) : "text-[color:var(--ch-muted)]"}`}>{sat ? signed(p.swing) : "—"}</td>
                    {withRatings && (
                      <>
                        <td className={`${CELL} text-[color:var(--ch-text-2)]`}>{r ? signed(r.onNet, 1) : "—"}</td>
                        <td className={`${CELL} text-[color:var(--ch-text-2)]`}>{r ? signed(r.offNet, 1) : "—"}</td>
                        <td className={`${CELL} font-semibold ${r ? tone(r.netSwing, 2) : "text-[color:var(--ch-muted)]"}`}>{r ? signed(r.netSwing, 1) : "—"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const boxPoints = (players: GameOnOffBoxPlayer[]) => players.reduce((s, p) => s + (p.spoints || 0), 0);

export default function GameOnOff({
  homeTeam, awayTeam, leagueId, homePlayers, awayPlayers, stints, colors,
}: {
  homeTeam: string;
  awayTeam: string;
  leagueId?: string | null;
  homePlayers: GameOnOffBoxPlayer[];
  awayPlayers: GameOnOffBoxPlayer[];
  /** lineup_stints rows for the game; null or empty when there are none. */
  stints?: OnOffStint[] | null;
  colors: Colors;
}) {
  // The margin comes from the box score's own points, which the +/- column is measured against.
  const sides = useMemo(() => {
    const home = boxPoints(homePlayers);
    const away = boxPoints(awayPlayers);
    return [
      buildSide(homeTeam, colors.home, homePlayers, home, away, stints),
      buildSide(awayTeam, colors.away, awayPlayers, away, home, stints),
    ];
  }, [homeTeam, awayTeam, homePlayers, awayPlayers, stints, colors.home, colors.away]);

  if (sides.every((s) => !s.result.addsUp)) {
    return <GameEmptyCard>On/off isn't available for this game: the box score has no +/- that adds up.</GameEmptyCard>;
  }
  const anyRatings = sides.some((s) => s.result.players.some((p) => p.ratings));

  return (
    <div className="space-y-8" data-testid="game-on-off">
      <p className="text-sm text-[color:var(--ch-text-2)]">
        How each team did with every player on the court and while they sat. On is the box score +/-, off is the
        rest of the game, and swing is the difference.
      </p>
      <Callouts sides={sides} leagueId={leagueId} />
      <div className="space-y-10">
        {sides.map((side) => <TeamTable key={side.team} side={side} leagueId={leagueId} />)}
      </div>
      {anyRatings && (
        <p className="text-xs text-[color:var(--ch-muted)]">
          Net ratings are points scored minus conceded per 100 possessions, from our lineup tracking of the play-by-play.
          They're shown when a player has at least 15 possessions both on and off the court, and can differ by a point or
          two from the official +/-.
        </p>
      )}
    </div>
  );
}
