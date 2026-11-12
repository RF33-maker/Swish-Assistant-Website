import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, Loader2, Search } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { CreatorName, FaceStack } from "@/components/creators/CreatorBits";
import { toast } from "@/hooks/use-toast";
import { withoutSeason } from "@/lib/leagueKeys";
import { craftTitle, type Craft, type Photographer } from "@/lib/mediaSpotlight";
import {
  coversFixture, dayKey, dayLabel, tipTime,
  useAttendance, useCompetitionIndex, useCreatorTeams, useSetAttendance, useUpcomingFixtures,
  type Attendance, type AttendanceStatus, type CreatorCard, type Fixture,
} from "@/lib/creatorSpace";
import { clubDisplayName } from "@shared/teamIdentity";
import { gamePath } from "@shared/seo";

const H2 = "ch-display text-[1.5rem] font-bold uppercase tracking-tight text-[color:var(--ch-text)]";

function byDay<T>(rows: T[], matchtime: (r: T) => string): Array<{ day: string; label: string; rows: T[] }> {
  const out: Array<{ day: string; label: string; rows: T[] }> = [];
  for (const r of rows) {
    const day = dayKey(matchtime(r));
    const last = out[out.length - 1];
    if (last?.day === day) last.rows.push(r);
    else out.push({ day, label: dayLabel(matchtime(r)), rows: [r] });
  }
  return out;
}

function Teams({ game }: { game: Pick<Fixture, "hometeam" | "awayteam" | "league_id"> }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0"><TeamLogo teamName={game.hometeam} leagueId={game.league_id} size={22} /></span>
      <span className="min-w-0 text-[15px] font-semibold leading-snug text-[color:var(--ch-text)]">
        {clubDisplayName(game.hometeam)} <span className="font-normal text-[color:var(--ch-muted)]">v</span> {clubDisplayName(game.awayteam)}
      </span>
      <span className="shrink-0"><TeamLogo teamName={game.awayteam} leagueId={game.league_id} size={22} /></span>
    </span>
  );
}

/** One fixture the creator can say they'll be at, with who else is going. */
function MyFixture({ game, mine, others, creatorId }: { game: Fixture; mine: Attendance | undefined; others: Attendance[]; creatorId: string | undefined }) {
  const set = useSetAttendance(creatorId);
  const [note, setNote] = useState(mine?.note ?? "");
  const pick = (status: AttendanceStatus) =>
    set.mutate(
      { gameKey: game.game_key, status: mine?.status === status ? null : status },
      { onError: (e) => toast({ title: "Couldn't save that", description: e.message, variant: "destructive" }) },
    );
  const saveNote = () => {
    if (!mine || (mine.note ?? "") === note.trim()) return;
    set.mutate({ gameKey: game.game_key, status: mine.status, note });
  };
  const btn = (status: AttendanceStatus, label: string) => {
    const on = mine?.status === status;
    return (
      <button
        type="button"
        onClick={() => pick(status)}
        disabled={set.isPending || !creatorId}
        aria-pressed={on}
        className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold transition-colors disabled:opacity-60 sm:h-9 sm:px-3.5 sm:text-[13px] ${
          on ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent)] text-white" : "border-[color:var(--ch-border)] text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
        }`}
      >
        {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />} {label}
      </button>
    );
  };
  const going = others.filter((a) => a.creator);
  return (
    <li className="py-3.5" data-testid="creator-fixture">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="hidden w-12 shrink-0 text-[14px] font-semibold tabular-nums text-[color:var(--ch-text)] sm:block">{tipTime(game.matchtime)}</span>
        <div className="min-w-0 flex-1 basis-72">
          <Link href={gamePath(game.competitionSlug, game.game_key)} className="block hover:underline underline-offset-4"><Teams game={game} /></Link>
          <p className="mt-0.5 truncate text-[12px] text-[color:var(--ch-muted)]">
            {/* On a phone the tip-off time sits here, so the fixture gets the full width. */}
            <span className="sm:hidden"><span className="font-semibold tabular-nums text-[color:var(--ch-text)]">{tipTime(game.matchtime)}</span> · </span>
            {game.competition ? withoutSeason(game.competition) : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {btn("going", "I'll be there")}
          {btn("maybe", "Maybe")}
        </div>
      </div>
      {(mine || going.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-0 sm:pl-16">
          {going.length > 0 && (
            <span className="inline-flex items-center gap-2 text-[13px] text-[color:var(--ch-text-2)]">
              <FaceStack creators={going.map((a) => a.creator!)} />
              {going.length === 1 ? `${going[0].creator!.display_name} ${going[0].status === "maybe" ? "might be" : "is"} there too` : `${going.length} others ${going.every((a) => a.status === "maybe") ? "might be" : "will be"} there`}
            </span>
          )}
          {mine && (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              onBlur={saveNote}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="ch-input h-10 min-w-0 flex-1 basis-60 px-3 text-[16px] sm:h-9 sm:text-[13px]"
              placeholder="Add a note for other creators, e.g. shooting for the home side"
              aria-label="A note for other creators"
            />
          )}
        </div>
      )}
    </li>
  );
}

/** A game with creators at it: who, what they make, and any note they left. */
function CoveredGame({ game, rows }: { game: NonNullable<Attendance["game"]>; rows: Attendance[] }) {
  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="w-12 shrink-0 text-[14px] font-semibold tabular-nums text-[color:var(--ch-text)]">{tipTime(game.matchtime)}</span>
        <Teams game={game} />
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2.5 pl-0 sm:pl-16">
        {rows.map((a) => (
          <li key={a.id} className="min-w-0">
            <CreatorName
              creator={a.creator as CreatorCard}
              size={30}
              sub={<>{a.status === "maybe" ? "Maybe · " : ""}{a.note || craftTitle(a.creator?.crafts as Craft[])}</>}
            />
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Games: say which of your teams' fixtures you'll be at, find any other game,
 * and see where every other creator will be.
 */
export default function GamesTab({ me }: { me: Photographer | null }) {
  const fixtures = useUpcomingFixtures();
  const attendance = useAttendance();
  const { data: comps } = useCompetitionIndex();
  const { data: teams = [] } = useCreatorTeams(me?.id);
  const [q, setQ] = useState("");

  const byGame = useMemo(() => {
    const map = new Map<string, Attendance[]>();
    for (const a of attendance.data ?? []) (map.get(a.game_key) ?? map.set(a.game_key, []).get(a.game_key)!).push(a);
    return map;
  }, [attendance.data]);

  const all = fixtures.data ?? [];
  const mineAt = (key: string) => byGame.get(key)?.find((a) => a.photographer_id === me?.id);
  const othersAt = (key: string) => (byGame.get(key) ?? []).filter((a) => a.photographer_id !== me?.id);

  // Your teams' fixtures, plus anything else you've already said yes or maybe to.
  const mine = useMemo(
    () => all.filter((g) => teams.some((t) => coversFixture(t, g, comps)) || !!mineAt(g.game_key)),
    [all, teams, comps, byGame], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const query = q.trim().toLowerCase();
  const found = useMemo(
    () =>
      query.length < 2
        ? []
        : all
            .filter((g) => !mine.includes(g) && (clubDisplayName(g.hometeam).toLowerCase().includes(query) || clubDisplayName(g.awayteam).toLowerCase().includes(query)))
            .slice(0, 12),
    [all, mine, query],
  );

  // Every game someone's going to, soonest first.
  const covered = useMemo(() => {
    const games = new Map<string, { game: NonNullable<Attendance["game"]>; rows: Attendance[] }>();
    for (const a of attendance.data ?? []) {
      if (!a.game || !a.creator) continue;
      (games.get(a.game_key) ?? games.set(a.game_key, { game: a.game, rows: [] }).get(a.game_key)!).rows.push(a);
    }
    return Array.from(games.values()).sort((a, b) => a.game.matchtime.localeCompare(b.game.matchtime));
  }, [attendance.data]);

  if (fixtures.isLoading || attendance.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-labelledby="games-yours">
        <h2 id="games-yours" className={H2}>Your games</h2>
        <p className="mt-1 text-[14px] text-[color:var(--ch-text-2)]">
          {me ? "The next three weeks for the teams you work with. Say which ones you'll be at, and other creators will see you there." : "You're here as an admin. Creators mark their own games; you can see where everyone will be."}
        </p>

        {me && !teams.length && (
          <p className="mt-4 text-[14px] text-[color:var(--ch-text-2)]">
            You haven't added a team yet.{" "}
            <Link href="/media/dashboard" className="font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-4">Add the teams you work with</Link>{" "}
            and their fixtures show here. Or search for any game below.
          </p>
        )}
        {me && teams.length > 0 && !mine.length && <p className="mt-4 text-[14px] text-[color:var(--ch-text-2)]">No fixtures on the schedule for your teams in the next three weeks.</p>}

        {byDay(mine, (g) => g.matchtime).map((d) => (
          <div key={d.day} className="mt-5">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ch-accent)]">{d.label}</h3>
            <ul className="divide-y divide-[color:var(--ch-border)]">
              {d.rows.map((g) => <MyFixture key={`${g.game_key}-${mineAt(g.game_key)?.status ?? "none"}`} game={g} mine={mineAt(g.game_key)} others={othersAt(g.game_key)} creatorId={me?.id} />)}
            </ul>
          </div>
        ))}

        {me && (
          <div className="mt-8">
            <label htmlFor="games-search" className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ch-text-2)]">Going to a different game?</label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ch-muted)]" aria-hidden="true" />
              <input id="games-search" value={q} onChange={(e) => setQ(e.target.value)} className="ch-input h-10 w-full pl-9 pr-3 text-[16px] sm:text-[14px]" placeholder="Search by team" />
            </div>
            {query.length >= 2 && !found.length && <p className="mt-2 text-[13px] text-[color:var(--ch-muted)]">No upcoming fixtures match "{q.trim()}".</p>}
            {byDay(found, (g) => g.matchtime).map((d) => (
              <div key={d.day} className="mt-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ch-text-2)]">{d.label}</h3>
                <ul className="divide-y divide-[color:var(--ch-border)]">
                  {d.rows.map((g) => <MyFixture key={g.game_key} game={g} mine={undefined} others={othersAt(g.game_key)} creatorId={me.id} />)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="games-everyone">
        <h2 id="games-everyone" className={H2}>Who's where</h2>
        <p className="mt-1 text-[14px] text-[color:var(--ch-text-2)]">Every game a creator has said they'll be at. Shooting the same one? Say hello on the board first.</p>
        {!covered.length ? (
          <p className="mt-4 text-[14px] text-[color:var(--ch-text-2)]">Nobody has marked a game yet. Be the first.</p>
        ) : (
          byDay(covered, (c) => c.game.matchtime).map((d) => (
            <div key={d.day} className="mt-5">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ch-accent)]">{d.label}</h3>
              <ul className="divide-y divide-[color:var(--ch-border)]">
                {d.rows.map((c) => <CoveredGame key={c.game.game_key} game={c.game} rows={c.rows} />)}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

