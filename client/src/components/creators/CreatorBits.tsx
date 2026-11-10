import { Link } from "wouter";
import { TeamLogo } from "@/components/TeamLogo";
import { PhotographerAvatar } from "@/components/media/PhotographerBits";
import { CRAFT_ORDER, CRAFTS, OPEN_TO, OPEN_TO_ORDER, craftTitle, type Craft, type OpenTo } from "@/lib/mediaSpotlight";
import { dayLabel, tipTime, type CreatorCard, type CreatorTeam, type Fixture } from "@/lib/creatorSpace";
import { clubDisplayName } from "@shared/teamIdentity";
import { teamPath } from "@shared/seo";

/** The teams a creator works with: badge, name and their role there, each linking to the team's page. */
export function LinkedTeams({ teams, className = "" }: { teams: Pick<CreatorTeam, "team_name" | "league_id" | "role">[]; className?: string }) {
  if (!teams.length) return null;
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-2 ${className}`}>
      {teams.map((t) => {
        const href = t.league_id ? teamPath(t.team_name) : null;
        const inner = (
          <>
            {t.league_id && <TeamLogo teamName={t.team_name} leagueId={t.league_id} size={22} />}
            <span className="min-w-0">
              <span className="font-semibold text-[color:var(--ch-text)]">{clubDisplayName(t.team_name)}</span>
              {t.role && <span className="text-[color:var(--ch-muted)]"> · {t.role}</span>}
            </span>
          </>
        );
        return (
          <li key={t.team_name} className="text-[14px]">
            {href ? (
              <Link href={href} className="inline-flex items-center gap-2 hover:underline underline-offset-4">{inner}</Link>
            ) : (
              <span className="inline-flex items-center gap-2">{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Pills to pick from a fixed set (crafts, what you're open to). */
export function PillPicker<T extends string>({ options, value, onChange, label }: { options: Array<{ id: T; label: string }>; value: T[]; onChange: (next: T[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              on
                ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-text)]"
                : "border-[color:var(--ch-border)] text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const CRAFT_OPTIONS = CRAFT_ORDER.map((id) => ({ id, label: CRAFTS[id].label }));
export const OPEN_TO_OPTIONS = OPEN_TO_ORDER.map((id) => ({ id, label: OPEN_TO[id] }));

export function OpenToLine({ openTo, className = "" }: { openTo: OpenTo[]; className?: string }) {
  const list = OPEN_TO_ORDER.filter((o) => openTo?.includes(o));
  if (!list.length) return null;
  return (
    <p className={`text-[13px] text-[color:var(--ch-text-2)] ${className}`}>
      <span className="text-[color:var(--ch-muted)]">Open to </span>
      {list.map((o) => OPEN_TO[o].toLowerCase()).join(", ")}
    </p>
  );
}

/** A creator's face and name, linking to their profile. `null` is a post from the Swish team. */
export function CreatorName({ creator, size = 36, sub }: { creator: CreatorCard | null; size?: number; sub?: React.ReactNode }) {
  if (!creator) {
    return (
      <span className="inline-flex items-center gap-2.5">
        <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-[color:var(--ch-accent)] font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">S</span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[14px] font-semibold text-[color:var(--ch-text)]">Swish Assistant</span>
          {sub && <span className="block text-[12px] text-[color:var(--ch-muted)]">{sub}</span>}
        </span>
      </span>
    );
  }
  return (
    <Link href={`/media/photographers/${creator.slug}`} className="group inline-flex min-w-0 items-center gap-2.5">
      <PhotographerAvatar photographer={creator} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[14px] font-semibold text-[color:var(--ch-text)] group-hover:underline underline-offset-4">{creator.display_name}</span>
        <span className="block truncate text-[12px] text-[color:var(--ch-muted)]">{sub ?? craftTitle(creator.crafts as Craft[])}</span>
      </span>
    </Link>
  );
}

/** A row of overlapping faces, for "who'll be there". */
export function FaceStack({ creators, max = 5, size = 26 }: { creators: CreatorCard[]; max?: number; size?: number }) {
  if (!creators.length) return null;
  const shown = creators.slice(0, max);
  return (
    <span className="inline-flex items-center" aria-label={creators.map((c) => c.display_name).join(", ")}>
      {shown.map((c, i) => (
        <span key={c.id} className="rounded-full ring-2 ring-[color:var(--ch-bg)]" style={{ marginLeft: i ? -size * 0.3 : 0 }} title={c.display_name}>
          <PhotographerAvatar photographer={c} size={size} />
        </span>
      ))}
      {creators.length > shown.length && <span className="ml-1.5 text-[12px] font-semibold text-[color:var(--ch-text-2)]">+{creators.length - shown.length}</span>}
    </span>
  );
}

/** "Hurricanes v Archers" with both badges, and when it tips off. */
export function FixtureLine({ game, className = "" }: { game: Pick<Fixture, "matchtime" | "hometeam" | "awayteam" | "league_id">; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] ${className}`}>
      <span className="shrink-0"><TeamLogo teamName={game.hometeam} leagueId={game.league_id} size={20} /></span>
      <span className="min-w-0 font-semibold text-[color:var(--ch-text)]">
        {clubDisplayName(game.hometeam)} <span className="font-normal text-[color:var(--ch-muted)]">v</span> {clubDisplayName(game.awayteam)}
      </span>
      <span className="shrink-0"><TeamLogo teamName={game.awayteam} leagueId={game.league_id} size={20} /></span>
      <span className="shrink-0 text-[13px] text-[color:var(--ch-text-2)]">{dayLabel(game.matchtime)} · <span className="tabular-nums">{tipTime(game.matchtime)}</span></span>
    </span>
  );
}
