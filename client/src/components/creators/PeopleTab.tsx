import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Loader2, MapPin, Search } from "lucide-react";
import { LinkedTeams, OpenToLine } from "@/components/creators/CreatorBits";
import { PhotographerAvatar, SocialLinks } from "@/components/media/PhotographerBits";
import { CRAFT_ORDER, CRAFTS, OPEN_TO, OPEN_TO_ORDER, contactHref, craftTitle, type Craft, type OpenTo } from "@/lib/mediaSpotlight";
import { useMembers, type Member } from "@/lib/creatorSpace";
import { clubDisplayName } from "@shared/teamIdentity";

function Person({ m, isMe }: { m: Member; isMe: boolean }) {
  const contact = contactHref(m);
  return (
    <li className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:gap-5" data-testid="creator-member">
      <Link href={`/media/photographers/${m.slug}`} className="shrink-0" aria-label={m.display_name}>
        <PhotographerAvatar photographer={m} size={64} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <Link href={`/media/photographers/${m.slug}`} className="text-[17px] font-bold text-[color:var(--ch-text)] hover:underline underline-offset-4">{m.display_name}</Link>
          {isMe && <span className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ch-accent)]">You</span>}
          <span className="text-[13px] text-[color:var(--ch-text-2)]">{craftTitle(m.crafts)}</span>
          {m.location && (
            <span className="inline-flex items-center gap-1 text-[13px] text-[color:var(--ch-muted)]"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{m.location}</span>
          )}
        </div>
        {m.bio && <p className="mt-1.5 line-clamp-2 max-w-2xl text-[14px] leading-relaxed text-[color:var(--ch-text-2)]">{m.bio}</p>}
        <LinkedTeams teams={m.linked_teams} className="mt-2.5" />
        <OpenToLine openTo={m.open_to} className="mt-2" />
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
        {contact && !isMe && (
          <a href={contact.href} target={contact.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer" className="ch-btn ch-btn-ghost h-9 gap-1.5 px-3.5 text-[13px]">
            {contact.label} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
        <SocialLinks photographer={m} />
      </div>
    </li>
  );
}

/** Everyone in the room: who they are, what they make, who they work with and how to reach them. */
export default function PeopleTab({ myId }: { myId: string | null }) {
  const members = useMembers();
  const [q, setQ] = useState("");
  const [craft, setCraft] = useState<Craft | "all">("all");
  const [openTo, setOpenTo] = useState<OpenTo | "any">("any");

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (members.data ?? []).filter((m) => {
      if (craft !== "all" && !m.crafts?.includes(craft)) return false;
      if (openTo !== "any" && !m.open_to?.includes(openTo)) return false;
      if (!query) return true;
      const hay = [m.display_name, m.handle, m.location, ...m.linked_teams.map((t) => clubDisplayName(t.team_name)), ...(m.teams ?? [])].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(query);
    });
  }, [members.data, q, craft, openTo]);

  if (members.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>;

  const select = "ch-input h-10 min-w-0 flex-1 basis-40 px-3 text-[16px] sm:flex-none sm:basis-auto sm:text-[14px]";
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ch-muted)]" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="ch-input h-10 w-full pl-9 pr-3 text-[16px] sm:text-[14px]" placeholder="Search by name, team or place" aria-label="Search creators" />
        </div>
        <select value={craft} onChange={(e) => setCraft(e.target.value as Craft | "all")} className={select} aria-label="What they make">
          <option value="all">Everyone</option>
          {CRAFT_ORDER.map((c) => <option key={c} value={c}>{CRAFTS[c].label}</option>)}
        </select>
        <select value={openTo} onChange={(e) => setOpenTo(e.target.value as OpenTo | "any")} className={select} aria-label="Open to">
          <option value="any">Open to anything</option>
          {OPEN_TO_ORDER.map((o) => <option key={o} value={o}>Open to {OPEN_TO[o].toLowerCase()}</option>)}
        </select>
      </div>

      {!list.length ? (
        <p className="py-12 text-center text-[15px] text-[color:var(--ch-text-2)]">
          {members.data?.length ? "Nobody matches that yet." : "You're among the first here. More creators are on their way in."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[color:var(--ch-border)]">
          {list.map((m) => <Person key={m.id} m={m} isMe={m.id === myId} />)}
        </ul>
      )}
    </div>
  );
}
