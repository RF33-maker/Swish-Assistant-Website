import { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import BoardTab from "@/components/creators/BoardTab";
import GamesTab from "@/components/creators/GamesTab";
import PeopleTab from "@/components/creators/PeopleTab";
import IdeasTab from "@/components/creators/IdeasTab";
import { PhotographerAvatar } from "@/components/media/PhotographerBits";
import { useAttendance, useCreatorAccess } from "@/lib/creatorSpace";

type Tab = "board" | "games" | "people" | "ideas";
const TABS: { id: Tab; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "games", label: "Games" },
  { id: "people", label: "People" },
  { id: "ideas", label: "Content ideas" },
];

const KICKER = "text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]";
const H1 = "ch-display mt-1.5 text-[2.5rem] font-bold uppercase leading-[0.92] tracking-tight text-[color:var(--ch-text)] md:text-[3.75rem]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Creator space | Media Spotlight | Swish Assistant</title>
        <meta name="description" content="A members-only space for the photographers, videographers and designers around British basketball: share work, swap advice, and see who'll be at which game." />
        <link rel="canonical" href="https://swishassistant.com/media/creators" />
      </Helmet>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-6 md:pt-9">{children}</main>
    </div>
  );
}

/** What the space is, for anyone who isn't in it yet. */
function Door({ signedIn, pending }: { signedIn: boolean; pending: boolean }) {
  const inside: Array<[string, string]> = [
    ["A board that's just creators", "Share a frame you're proud of, ask how someone lit a gym, find a second shooter for Saturday."],
    ["Who's at which game", "Pick the teams you work with, say which fixtures you'll be at, and see who else will be courtside."],
    ["Content ideas from the numbers", "Every week, the stats worth building a post around for your teams and your games."],
    ["A profile that works for you", "Your work, the teams you cover and how to book you, in front of the players and fans who use Swish."],
    ["Swish+ on us", "Every creator's account gets Swish+ free. It's our thank you for what you give the game."],
  ];
  return (
    <div className="ch-rise max-w-3xl">
      <Link href="/media" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Media Spotlight
      </Link>
      <div className={`${KICKER} mt-5`}>For creators</div>
      <h1 className={H1}>Creator space</h1>
      <p className="mt-4 text-lg leading-relaxed text-[color:var(--ch-text-2)]">
        A room for the people who shoot, film and design around the game. Somewhere to talk, share work, help each other out and find out who else will be in the building.
      </p>

      {pending ? (
        <p className="mt-6 text-[15px] text-[color:var(--ch-text)]">Your creator profile isn't switched on yet. As soon as it is, this page opens for you.</p>
      ) : (
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Link href="/media#get-involved" className="ch-btn ch-btn-primary h-11 px-5 text-[15px]" data-testid="creator-space-apply">
            Ask to join <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {!signedIn && (
            <Link href="/auth" className="text-[15px] font-semibold text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]">Already a creator? Sign in</Link>
          )}
        </div>
      )}

      <dl className="mt-10 divide-y divide-[color:var(--ch-border)] border-y border-[color:var(--ch-border)]">
        {inside.map(([title, body]) => (
          <div key={title} className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6">
            <dt className="text-[15px] font-bold text-[color:var(--ch-text)]">{title}</dt>
            <dd className="text-[15px] leading-relaxed text-[color:var(--ch-text-2)]">{body}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-[13px] text-[color:var(--ch-muted)]">Joining is free and by invitation, so the room stays creators only. Tell us who you are and what you make and we'll set you up.</p>
    </div>
  );
}

/**
 * /media/creators — the creator space. Members (an account with a claimed
 * creator profile, or an admin) get the board, the games, the people and the
 * content ideas; everyone else sees what it is and how to join.
 */
export default function CreatorSpacePage() {
  const access = useCreatorAccess();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const tab = useMemo((): Tab => {
    const t = new URLSearchParams(search).get("tab");
    return TABS.some((x) => x.id === t) ? (t as Tab) : "board";
  }, [search]);
  const attendance = useAttendance(access.member);
  const myGames = useMemo(
    () =>
      (attendance.data ?? [])
        .filter((a) => a.photographer_id === access.me?.id && a.game)
        .sort((a, b) => a.game!.matchtime.localeCompare(b.game!.matchtime)),
    [attendance.data, access.me?.id],
  );

  if (access.loading) return <Shell><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div></Shell>;
  if (!access.member || !access.userId) return <Shell><Door signedIn={access.signedIn} pending={access.pending} /></Shell>;

  return (
    <Shell>
      <header className="ch-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/media" className={`${KICKER} hover:underline underline-offset-4`}>Media Spotlight</Link>
          <h1 className={H1}>Creator space</h1>
        </div>
        {access.me ? (
          <Link href="/media/dashboard" className="group inline-flex items-center gap-2.5 text-left">
            <PhotographerAvatar photographer={access.me} size={40} />
            <span className="leading-tight">
              <span className="block text-[14px] font-semibold text-[color:var(--ch-text)] group-hover:underline underline-offset-4">{access.me.display_name}</span>
              <span className="block text-[12px] text-[color:var(--ch-muted)]">Your profile and work</span>
            </span>
          </Link>
        ) : (
          <Link href="/admin/media" className="text-[14px] font-semibold text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]">Media admin</Link>
        )}
      </header>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-[color:var(--ch-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setLocation(t.id === "board" ? "/media/creators" : `/media/creators?tab=${t.id}`, { replace: true })}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] font-semibold transition-colors ${tab === t.id ? "border-[color:var(--ch-accent)] text-[color:var(--ch-text)]" : "border-transparent text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"}`}
            data-testid={`creator-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-7">
        {tab === "board" && <BoardTab viewer={{ userId: access.userId, folder: access.me?.id ?? "swish", isAdmin: access.isAdmin, myGames }} />}
        {tab === "games" && <GamesTab me={access.me} />}
        {tab === "people" && <PeopleTab myId={access.me?.id ?? null} />}
        {tab === "ideas" && <IdeasTab me={access.me} />}
      </div>
    </Shell>
  );
}
