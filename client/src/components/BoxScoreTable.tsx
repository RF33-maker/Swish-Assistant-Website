import { TeamLogo } from '@/components/TeamLogo';
import { abbreviatePlayerName } from '@/lib/playerName';
import EntityLink from '@/components/EntityLink';

/**
 * Shared box score for a single team.
 *
 * Replaces three copies of the same table (GamePage, InlineGameDetail,
 * GameDetailModal) that had drifted apart.
 *
 * The layout follows the structure of a FIBA LiveStats box score, which
 * solves the problem long names caused on a phone: the shirt number gets its
 * own narrow column instead of sitting inside the name cell, and the name
 * column is a fixed width so every numeric column lines up at the same
 * offset no matter how long the names are. Both are pinned while the stats
 * scroll horizontally, so you can always see who a row belongs to.
 *
 * Names are abbreviated to an initial plus family name on small screens and
 * shown in full from `md` up, where there is room. The full name is always
 * on the cell's title attribute.
 *
 * The stat columns and their formatting are deliberately unchanged from the
 * previous tables.
 *
 * A Totals line closes the table. It is the sum of the player rows above it,
 * so every column adds up, with one addition: see `teamTotals`.
 */

export interface BoxScorePlayer {
  full_name?: string | null;
  player_name?: string | null;
  firstname?: string | null;
  familyname?: string | null;
  /**
   * The two callers normalise the squad number differently — GamePage keeps
   * the raw `shirtnumber` from player_stats, InlineGameDetail maps it to
   * `jersey_number`. Accept both rather than forcing one to change.
   */
  shirtnumber?: string | number | null;
  jersey_number?: string | number | null;
  sminutes?: string | number | null;
  spoints?: number | null;
  sreboundstotal?: number | null;
  sassists?: number | null;
  ssteals?: number | null;
  sblocks?: number | null;
  sturnovers?: number | null;
  sfoulspersonal?: number | null;
  sfieldgoalsmade?: number | null;
  sfieldgoalsattempted?: number | null;
  sthreepointersmade?: number | null;
  sthreepointersattempted?: number | null;
  sfreethrowsmade?: number | null;
  sfreethrowsattempted?: number | null;
  /** The player's page; their name becomes a real link (search engines follow these). */
  href?: string | null;
  /** In-page handler for a plain click (e.g. the league page opening the player inline). */
  onSelect?: (() => void) | null;
}

/**
 * A game's official team totals. Only rebounds and turnovers are read: those
 * two include events no player is credited with.
 */
export interface BoxScoreTeamTotals {
  tot_sreboundstotal?: number | null;
  tot_sturnovers?: number | null;
}

interface Props {
  players: BoxScorePlayer[];
  teamName: string;
  score?: number | null;
  leagueId?: string;
  /** Team colour for the card header; falls back to the site orange. */
  headerColor?: string;
  /**
   * Formats the raw minutes value. Each surface already has its own parser
   * with the same signature, so this matches theirs rather than widening it.
   */
  formatMinutes: (value: string | null | undefined) => string;
  /** The team's page, linked from the header. */
  teamHref?: string | null;
  /**
   * Official team totals for the game. Their rebounds and turnovers include
   * team rebounds and team turnovers, so they usually run a few above the sum
   * of the player rows. When they do, the gap is shown as a Team line and
   * counted in Totals, so the columns still add up and Totals matches the
   * Team Stats tab. Omit it and Totals is just the sum of the rows.
   */
  teamTotals?: BoxScoreTeamTotals | null;
}

function resolveName(player: BoxScorePlayer): string {
  return (
    player.full_name ||
    player.player_name ||
    `${player.firstname || ''} ${player.familyname || ''}`.trim() ||
    'Unknown'
  );
}

function squadNumber(player: BoxScorePlayer): string {
  const raw = player.shirtnumber ?? player.jersey_number;
  if (raw == null) return '';
  const text = String(raw).trim();
  return text;
}

function efficiency(p: BoxScorePlayer): number {
  return (
    (p.spoints || 0) +
    (p.sreboundstotal || 0) +
    (p.sassists || 0) +
    (p.ssteals || 0) +
    (p.sblocks || 0) -
    ((p.sfieldgoalsattempted || 0) - (p.sfieldgoalsmade || 0)) -
    ((p.sfreethrowsattempted || 0) - (p.sfreethrowsmade || 0)) -
    (p.sturnovers || 0)
  );
}

/** Seconds in a "m:ss" string as returned by `formatMinutes`; anything else counts as zero. */
function clockToSeconds(text: string): number {
  const [minutes, seconds, ...rest] = text.split(':');
  if (seconds == null || rest.length > 0) return 0;
  return (parseInt(minutes, 10) || 0) * 60 + (parseInt(seconds, 10) || 0);
}

function secondsToClock(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Striping makes a long row easier to track across to the right-hand columns
// on a narrow screen.
//
// These must be fully opaque: the number and name cells are pinned, and a
// translucent background lets the stat columns scroll visibly underneath them.
function stripeBg(idx: number): string {
  return idx % 2 === 1 ? 'bg-orange-50 dark:bg-neutral-900' : 'bg-white dark:bg-neutral-800';
}

const STAT_HEAD = 'text-center py-2 px-2 font-medium';
const STAT_CELL = 'text-center py-2 px-2 text-slate-500 dark:text-slate-400 tabular-nums';

// Pinned column geometry. The name column's left offset has to match the
// number column's width exactly, or the two overlap while scrolling.
const NO_COL = 'w-10 min-w-[2.5rem]';
const NAME_COL = 'w-[7.5rem] min-w-[7.5rem] md:w-48 md:min-w-[12rem]';
const NAME_LEFT = 'left-10';

const TOTAL_BG = 'bg-orange-100 dark:bg-neutral-700';
const TOTAL_CELL = 'text-center py-2 px-2 tabular-nums';

export default function BoxScoreTable({
  players,
  teamName,
  score,
  leagueId,
  headerColor,
  formatMinutes,
  teamHref,
  teamTotals,
}: Props) {
  // Some competitions arrive with no squad numbers at all. Rather than show a
  // permanently blank column — which costs real width on a phone — drop it.
  const anyNumbers = players.some((p) => squadNumber(p) !== '');
  const nameLeft = anyNumbers ? NAME_LEFT : 'left-0';

  const sumOf = (pick: (p: BoxScorePlayer) => number | null | undefined) =>
    players.reduce((total, p) => total + (pick(p) || 0), 0);
  const playerRebounds = sumOf((p) => p.sreboundstotal);
  const playerTurnovers = sumOf((p) => p.sturnovers);
  // Official totals can also sit below the player rows (a correction not yet
  // applied to one side); never show a total smaller than the column it closes.
  const teamRebounds = Math.max(0, (teamTotals?.tot_sreboundstotal || 0) - playerRebounds);
  const teamTurnovers = Math.max(0, (teamTotals?.tot_sturnovers || 0) - playerTurnovers);
  const totals: BoxScorePlayer = {
    spoints: sumOf((p) => p.spoints),
    sreboundstotal: playerRebounds + teamRebounds,
    sassists: sumOf((p) => p.sassists),
    ssteals: sumOf((p) => p.ssteals),
    sblocks: sumOf((p) => p.sblocks),
    sturnovers: playerTurnovers + teamTurnovers,
    sfoulspersonal: sumOf((p) => p.sfoulspersonal),
    sfieldgoalsmade: sumOf((p) => p.sfieldgoalsmade),
    sfieldgoalsattempted: sumOf((p) => p.sfieldgoalsattempted),
    sthreepointersmade: sumOf((p) => p.sthreepointersmade),
    sthreepointersattempted: sumOf((p) => p.sthreepointersattempted),
    sfreethrowsmade: sumOf((p) => p.sfreethrowsmade),
    sfreethrowsattempted: sumOf((p) => p.sfreethrowsattempted),
  };
  const totalSeconds = players.reduce(
    (total, p) => total + clockToSeconds(formatMinutes(p.sminutes == null ? null : String(p.sminutes))),
    0,
  );
  const teamLineBg = stripeBg(players.length);

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-lg overflow-hidden border border-orange-100 dark:border-neutral-700">
      <div
        className="px-4 py-3 flex items-center gap-3 text-white"
        style={{ backgroundColor: headerColor || 'rgb(249, 115, 22)' }}
      >
        {leagueId && <TeamLogo teamName={teamName} leagueId={leagueId} size="sm" />}
        <h4 className="font-semibold flex-1 truncate">
          {teamHref ? <EntityLink href={teamHref} className="hover:underline underline-offset-2">{teamName}</EntityLink> : teamName}
        </h4>
        {score != null && <span className="ml-auto text-2xl font-bold tabular-nums">{score}</span>}
      </div>

      {players.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-orange-50 dark:bg-neutral-900 text-slate-600 dark:text-slate-400">
              <tr>
                {anyNumbers && (
                  <th
                    className={`${NO_COL} text-center py-2 px-1 sticky left-0 z-20 bg-orange-50 dark:bg-neutral-900 text-[11px] font-medium`}
                    scope="col"
                  >
                    NO.
                  </th>
                )}
                <th
                  className={`${NAME_COL} ${anyNumbers ? NAME_LEFT : 'left-0'} text-left py-2 px-2 sticky z-20 bg-orange-50 dark:bg-neutral-900 font-medium border-r border-orange-100 dark:border-neutral-700`}
                  scope="col"
                >
                  PLAYER
                </th>
                <th className={STAT_HEAD}>MIN</th>
                <th className={STAT_HEAD}>PTS</th>
                <th className={STAT_HEAD}>REB</th>
                <th className={STAT_HEAD}>AST</th>
                <th className={STAT_HEAD}>STL</th>
                <th className={STAT_HEAD}>BLK</th>
                <th className={STAT_HEAD}>TO</th>
                <th className={STAT_HEAD}>PF</th>
                <th className={STAT_HEAD}>FG</th>
                <th className={STAT_HEAD}>3PT</th>
                <th className={STAT_HEAD}>FT</th>
                <th className={STAT_HEAD}>EFF</th>
              </tr>
            </thead>
            <tbody className="text-slate-800 dark:text-slate-200">
              {players.map((player, idx) => {
                const name = resolveName(player);
                const number = squadNumber(player);
                const rowBg = stripeBg(idx);

                return (
                  <tr
                    key={idx}
                    className={`border-t border-orange-100 dark:border-neutral-700 ${rowBg} hover:bg-orange-50 dark:hover:bg-neutral-700/60`}
                  >
                    {anyNumbers && (
                      <td
                        className={`${NO_COL} text-center py-2 px-1 sticky left-0 z-10 ${rowBg} text-xs font-semibold text-slate-400 dark:text-slate-500 tabular-nums`}
                      >
                        {number}
                      </td>
                    )}
                    <td
                      className={`${NAME_COL} ${anyNumbers ? NAME_LEFT : 'left-0'} py-2 px-2 sticky z-10 ${rowBg} font-medium border-r border-orange-100 dark:border-neutral-700`}
                      title={name}
                    >
                      {player.href ? (
                        <EntityLink href={player.href} onNavigate={player.onSelect || undefined} className="block hover:underline underline-offset-2">
                          <span className="md:hidden block truncate">{abbreviatePlayerName(name)}</span>
                          <span className="hidden md:block truncate">{name}</span>
                        </EntityLink>
                      ) : (
                        <>
                          <span className="md:hidden block truncate">{abbreviatePlayerName(name)}</span>
                          <span className="hidden md:block truncate">{name}</span>
                        </>
                      )}
                    </td>
                    <td className={`${STAT_CELL} whitespace-nowrap`}>{formatMinutes(player.sminutes == null ? null : String(player.sminutes))}</td>
                    <td className="text-center py-2 px-2 font-semibold text-orange-500 tabular-nums">
                      {player.spoints || 0}
                    </td>
                    <td className="text-center py-2 px-2 tabular-nums">{player.sreboundstotal || 0}</td>
                    <td className="text-center py-2 px-2 tabular-nums">{player.sassists || 0}</td>
                    <td className={STAT_CELL}>{player.ssteals || 0}</td>
                    <td className={STAT_CELL}>{player.sblocks || 0}</td>
                    <td className={STAT_CELL}>{player.sturnovers || 0}</td>
                    <td className={STAT_CELL}>{player.sfoulspersonal || 0}</td>
                    <td className={`${STAT_CELL} whitespace-nowrap`}>
                      {player.sfieldgoalsmade || 0}/{player.sfieldgoalsattempted || 0}
                    </td>
                    <td className={`${STAT_CELL} whitespace-nowrap`}>
                      {player.sthreepointersmade || 0}/{player.sthreepointersattempted || 0}
                    </td>
                    <td className={`${STAT_CELL} whitespace-nowrap`}>
                      {player.sfreethrowsmade || 0}/{player.sfreethrowsattempted || 0}
                    </td>
                    <td className="text-center py-2 px-2 font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                      {efficiency(player)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-slate-800 dark:text-slate-200">
              {(teamRebounds > 0 || teamTurnovers > 0) && (
                <tr className={`border-t border-orange-100 dark:border-neutral-700 ${teamLineBg} text-slate-500 dark:text-slate-400`}>
                  {anyNumbers && <td className={`${NO_COL} sticky left-0 z-10 ${teamLineBg}`} />}
                  <td
                    className={`${NAME_COL} ${nameLeft} py-2 px-2 sticky z-10 ${teamLineBg} font-medium italic border-r border-orange-100 dark:border-neutral-700`}
                  >
                    Team
                  </td>
                  <td colSpan={2} />
                  <td className={TOTAL_CELL}>{teamRebounds || ''}</td>
                  <td colSpan={3} />
                  <td className={TOTAL_CELL}>{teamTurnovers || ''}</td>
                  <td colSpan={5} />
                </tr>
              )}
              <tr className={`border-t-2 border-orange-200 dark:border-neutral-600 ${TOTAL_BG} font-semibold`}>
                {anyNumbers && <td className={`${NO_COL} sticky left-0 z-10 ${TOTAL_BG}`} />}
                <td
                  className={`${NAME_COL} ${nameLeft} text-left py-2 px-2 sticky z-10 ${TOTAL_BG} border-r border-orange-200 dark:border-neutral-600`}
                >
                  Totals
                </td>
                <td className={`${TOTAL_CELL} whitespace-nowrap`}>{totalSeconds > 0 ? secondsToClock(totalSeconds) : ''}</td>
                <td className={`${TOTAL_CELL} text-orange-500`}>{totals.spoints}</td>
                <td className={TOTAL_CELL}>{totals.sreboundstotal}</td>
                <td className={TOTAL_CELL}>{totals.sassists}</td>
                <td className={TOTAL_CELL}>{totals.ssteals}</td>
                <td className={TOTAL_CELL}>{totals.sblocks}</td>
                <td className={TOTAL_CELL}>{totals.sturnovers}</td>
                <td className={TOTAL_CELL}>{totals.sfoulspersonal}</td>
                <td className={`${TOTAL_CELL} whitespace-nowrap`}>{totals.sfieldgoalsmade}/{totals.sfieldgoalsattempted}</td>
                <td className={`${TOTAL_CELL} whitespace-nowrap`}>{totals.sthreepointersmade}/{totals.sthreepointersattempted}</td>
                <td className={`${TOTAL_CELL} whitespace-nowrap`}>{totals.sfreethrowsmade}/{totals.sfreethrowsattempted}</td>
                <td className={TOTAL_CELL}>{efficiency(totals)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="p-4 text-slate-500 text-center italic">No player stats available</p>
      )}
    </div>
  );
}
