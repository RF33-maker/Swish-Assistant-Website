import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Check, Copy, Loader2 } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { useTeamIdeas, type StatIdea } from "@/lib/teamIdeas";
import { useCompetitionIndex, useCreatorTeams, type CreatorTeam } from "@/lib/creatorSpace";
import { withoutSeason } from "@/lib/leagueKeys";
import type { Photographer } from "@/lib/mediaSpotlight";
import { clubDisplayName } from "@shared/teamIdentity";

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const H2 = "ch-display text-[1.5rem] font-bold uppercase tracking-tight text-[color:var(--ch-text)]";

function Idea({ idea }: { idea: StatIdea }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${idea.stat}\n${idea.detail}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable: the text is on screen to select */
    }
  };
  return (
    <li className="border-t border-[color:var(--ch-border)] py-5" data-testid="content-idea">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
        <span className="text-[color:var(--ch-accent)]">{idea.label}</span>
      </div>
      <p className="ch-display mt-1.5 text-[1.375rem] font-bold leading-[1.08] tracking-tight text-[color:var(--ch-text)] [overflow-wrap:anywhere] md:text-[1.5rem]">{idea.stat}</p>
      {idea.detail && <p className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--ch-text-2)]">{idea.detail}</p>}
      <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--ch-text)]">
        <span className="font-semibold">Make: </span>
        {idea.make}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-4 text-[13px] font-semibold">
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]">
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />} {copied ? "Copied" : "Copy the stat"}
        </button>
        <Link href={idea.href} className="inline-flex items-center gap-1 text-[color:var(--ch-accent)] hover:underline underline-offset-4">
          See the numbers <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

function Group({ id, title, intro, ideas }: { id: string; title: string; intro: string; ideas: StatIdea[] }) {
  if (!ideas.length) return null;
  return (
    <section aria-labelledby={id} className="mt-10 first:mt-0">
      <h2 id={id} className={H2}>{title}</h2>
      {intro && <p className="mt-1 text-[14px] text-[color:var(--ch-text-2)]">{intro}</p>}
      <ul className="mt-4 grid gap-x-10 md:grid-cols-2">
        {ideas.map((i) => <Idea key={i.key} idea={i} />)}
      </ul>
    </section>
  );
}

/** One team's ideas: its players, the team, and the league it plays in. */
function TeamIdeasView({ team }: { team: CreatorTeam }) {
  const { data: comps } = useCompetitionIndex();
  const stats = useTeamIdeas(team, comps);
  const name = clubDisplayName(team.team_name);

  if (!team.league_id) {
    return <p className="py-10 text-[15px] text-[color:var(--ch-text-2)]">{name} isn't on Swish yet, so there are no numbers to work from. When their games are, ideas will show here.</p>;
  }
  if (stats.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-[14px] text-[color:var(--ch-text-2)]">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" />
        Working through {name}'s season…
      </div>
    );
  }
  if (stats.isError || !stats.data) return <p className="py-12 text-center text-[15px] text-[color:var(--ch-text-2)]">The numbers couldn't load. Try again in a moment.</p>;

  const d = stats.data;
  const league = withoutSeason(d.competition.name);
  const none = !d.players.length && !d.teamIdeas.length && !d.league.length;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <TeamLogo teamName={team.team_name} leagueId={team.league_id} size={44} />
        <div>
          <p className="text-[18px] font-bold leading-tight text-[color:var(--ch-text)]">{name}</p>
          <p className="text-[13px] text-[color:var(--ch-text-2)]">
            {league}
            {d.record && <> · {d.record.w}–{d.record.l}{d.record.place ? `, ${ordinal(d.record.place)}` : ""}</>}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <Group id="ideas-players" title="The players" intro={`Individual numbers from ${name}'s season in ${league}.`} ideas={d.players} />
        <Group id="ideas-team" title="The team" intro="The latest result and what the team does well, as the numbers have it." ideas={d.teamIdeas} />
        <Group id="ideas-league" title={`Around ${league}`} intro={`Where ${name} sit, who's next, and the league's leaders.`} ideas={d.league} />
        {none && <p className="py-10 text-center text-[15px] text-[color:var(--ch-text-2)]">{name} haven't played in {league} yet. Ideas appear after their first game.</p>}
      </div>
    </div>
  );
}

/**
 * Content ideas, built around the team a creator works with: its players'
 * numbers, the team's, and the league it plays in. Each idea is a stat and an
 * angle; the words on the post stay the creator's own.
 */
export default function IdeasTab({ me }: { me: Photographer | null }) {
  const { data: teams = [], isLoading } = useCreatorTeams(me?.id);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (teams.length && !teams.some((t) => t.id === picked)) setPicked(teams[0].id);
  }, [teams, picked]);
  const team = teams.find((t) => t.id === picked) ?? teams[0];

  return (
    <div className="mx-auto max-w-5xl">
      <p className="max-w-3xl text-[15px] leading-relaxed text-[color:var(--ch-text-2)]">
        Numbers worth building a post around, from your team's season: the players, the team, and the league they're in. Each one is a stat and an angle. The caption is yours.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>
      ) : !me || !team ? (
        <p className="mt-6 text-[15px] text-[color:var(--ch-text-2)]">
          {me ? (
            <>
              <Link href="/media/dashboard" className="font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-4">Add the team you work with</Link>{" "}
              and this page is built around them: their players, their season and their league.
            </>
          ) : (
            "Content ideas are built around a creator's own team, so there's nothing to show for an admin account without a creator profile."
          )}
        </p>
      ) : (
        <>
          {teams.length > 1 && (
            <div className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Your teams">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === team.id}
                  onClick={() => setPicked(t.id)}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${t.id === team.id ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-text)]" : "border-[color:var(--ch-border)] text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"}`}
                >
                  {clubDisplayName(t.team_name)}
                </button>
              ))}
            </div>
          )}
          <div className="mt-7"><TeamIdeasView key={team.id} team={team} /></div>
        </>
      )}
    </div>
  );
}
