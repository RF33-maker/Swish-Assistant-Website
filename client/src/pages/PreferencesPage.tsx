import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, Search, X } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerSearchAvatar } from "@/components/PlayerSearchAvatar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { findFollow, followHref, useFollows, useToggleFollow, type Follow, type NewFollow } from "@/lib/follows";
import { BRAND_COLUMNS, COMP_COLUMNS, leagueKeys, withoutSeason, type LeagueBrandRow, type LeagueCompRow, type LeagueOption } from "@/lib/leagueKeys";
import { clubDisplayName, clubSlug } from "@shared/teamIdentity";
import { isYouthCompetition } from "@shared/youth";
import { foldName } from "@shared/playerNameKey";
import { playerPath } from "@shared/seo";
import { namesMatch } from "@/lib/fuzzyMatch";
import { isInitialOnlyName } from "@/lib/profileMatches";

/**
 * /preferences — pick the leagues, teams and players you follow. They lead
 * the app's Home and Feed (and, later, decide your notifications). Youth
 * competitions aren't offered.
 */

const day = 24 * 60 * 60 * 1000;

/** Public competitions, brands, and which competitions are playing now (60 days back, 30 ahead). */
function useLeagueDirectory() {
  return useQuery({
    queryKey: ["league-directory"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [{ data: comps }, { data: brands }] = await Promise.all([
        supabase.from("competitions").select(COMP_COLUMNS).eq("is_public", true),
        supabase.from("leagues").select(BRAND_COLUMNS),
      ]);
      const games: Array<{ league_id: string }> = [];
      for (let page = 0; page < 5; page++) {
        const { data } = await supabase
          .from("game_schedule")
          .select("league_id")
          .gte("matchtime", new Date(Date.now() - 60 * day).toISOString())
          .lte("matchtime", new Date(Date.now() + 30 * day).toISOString())
          .order("game_key")
          .range(page * 1000, page * 1000 + 999);
        games.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const gamesByComp = new Map<string, number>();
      for (const g of games) gamesByComp.set(g.league_id, (gamesByComp.get(g.league_id) ?? 0) + 1);

      const all = (comps ?? []) as LeagueCompRow[];
      const lk = leagueKeys(all, (brands ?? []) as LeagueBrandRow[]);
      const active = all.filter((c) => gamesByComp.has(c.league_id) && !isYouthCompetition(c));
      // Busiest leagues first.
      const weight = new Map<string, number>();
      for (const c of active) {
        const k = lk.keyOf(c);
        if (k) weight.set(k, (weight.get(k) ?? 0) + (gamesByComp.get(c.league_id) ?? 0));
      }
      const options = lk.options(active).sort((a, b) => (weight.get(b.key) ?? 0) - (weight.get(a.key) ?? 0));
      return { lk, active, options, compById: lk.compById };
    },
  });
}

// ── Bits ──────────────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  const id = title.toLowerCase();
  // The profile's "Edit" links land on /preferences#leagues, #teams or #players.
  useEffect(() => {
    if (window.location.hash === `#${id}`) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [id]);
  return (
    <section id={id} className="pt-7 scroll-mt-24">
      <h2 className="ch-display uppercase font-bold tracking-tight text-[1.5rem] leading-none text-[color:var(--ch-text)]">{title}</h2>
      {hint && <p className="mt-1.5 text-sm text-[color:var(--ch-text-2)]">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function FollowPill({ on, onClick, busy }: { on: boolean; onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold border transition-colors disabled:opacity-60 ${
        on
          ? "bg-[color:var(--ch-accent)] border-[color:var(--ch-accent)] text-white"
          : "border-[color:var(--ch-border-strong)] text-[color:var(--ch-text)]"
      }`}
    >
      {on ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
      {on ? "Following" : "Follow"}
    </button>
  );
}

function Row({ image, title, detail, action }: { image: ReactNode; title: string; detail?: string | null; action: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="shrink-0">{image}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-[color:var(--ch-text)] truncate">{title}</div>
        {detail && <div className="text-[12px] text-[color:var(--ch-muted)] truncate">{detail}</div>}
      </div>
      {action}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex items-center gap-2 rounded-full border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] px-3.5 py-2">
      <Search className="h-4 w-4 text-[color:var(--ch-muted)]" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent text-[15px] outline-none text-[color:var(--ch-text)] placeholder:text-[color:var(--ch-muted)]"
        autoCapitalize="words"
        autoCorrect="off"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search">
          <X className="h-4 w-4 text-[color:var(--ch-muted)]" />
        </button>
      )}
    </label>
  );
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ── Leagues ───────────────────────────────────────────────────────────────

function LeaguePicker({ options, follows }: { options: LeagueOption[]; follows: Follow[] }) {
  const toggle = useToggleFollow();
  const followed = new Map(follows.filter((f) => f.kind === "league").map((f) => [f.key, f]));
  // Leagues you follow that aren't playing right now still show, so they can be removed.
  const extra = Array.from(followed.values())
    .filter((f) => !options.some((o) => o.key === f.key))
    .map((f): LeagueOption => ({ key: f.key, label: f.label, logoUrl: f.image_url, leagueId: f.league_id ?? "", href: followHref(f) }));

  return (
    <div className="grid grid-cols-2 gap-2">
      {[...options, ...extra].map((o) => {
        const on = followed.has(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() =>
              toggle.mutate(
                {
                  following: on,
                  follow: { kind: "league", key: o.key, label: o.label, subtitle: null, image_url: o.logoUrl, league_id: o.leagueId || null, player_ids: [] },
                },
                { onError: () => toast({ title: "Couldn't save that league", description: "Try again in a moment." }) },
              )
            }
            className={`relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
              on ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)]" : "border-[color:var(--ch-border)]"
            }`}
          >
            <div className="h-9 w-9 shrink-0 rounded-lg bg-white grid place-items-center overflow-hidden">
              {o.logoUrl ? <img src={o.logoUrl} alt="" className="h-8 w-8 object-contain" /> : <span className="text-[11px] font-bold text-slate-500">{o.label.slice(0, 3)}</span>}
            </div>
            <span className="min-w-0 flex-1 text-[13px] font-semibold leading-tight text-[color:var(--ch-text)] line-clamp-2">{o.label}</span>
            {on && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-[color:var(--ch-accent)] grid place-items-center">
                <Check className="h-3 w-3 text-white" aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Teams ─────────────────────────────────────────────────────────────────

interface TeamChoice { name: string; leagueId: string; compSlug: string; compName: string; women: boolean }

/**
 * A side's name as a list shows it: "London Lions" in a women's competition
 * reads "London Lions Women" so it isn't mistaken for the men's side, and
 * "London Lions Senior Men II" reads "London Lions II". Display only: the
 * team page's slug still comes from clubSlug.
 */
const teamTitle = (t: TeamChoice) => {
  const name = clubDisplayName(t.name).replace(/\s+Senior\s+(Men|Women)\s+(I{2,3}|IV)$/i, (_m, g, n) => (/women/i.test(g) ? ` Women ${n}` : ` ${n}`));
  return t.women && !/\bwomen\b/i.test(name) ? `${name} Women` : name;
};

const isCup = (c: LeagueCompRow | undefined) => /\b(cup|trophy|play-?offs?)\b/i.test(c?.name ?? "");

/**
 * One row per club: the same club across a league and its cup is one choice,
 * named by its side in a competition playing now, and by its league over its cup run.
 */
function groupTeams(
  rows: Array<{ name: string; league_id: string }>,
  compById: Map<string, LeagueCompRow>,
  activeIds?: Set<string>,
): TeamChoice[] {
  const out = new Map<string, TeamChoice>();
  const rank = (id: string) => (activeIds && !activeIds.has(id) ? 2 : 0) + (isCup(compById.get(id)) ? 1 : 0);
  const ordered = [...rows].sort((a, b) => rank(a.league_id) - rank(b.league_id));
  for (const r of ordered) {
    const c = compById.get(r.league_id);
    if (!c || isYouthCompetition(c)) continue;
    const women = /^women/i.test(c.gender || "");
    const k = `${clubSlug(r.name)}|${women ? "w" : ""}`;
    if (!out.has(k)) out.set(k, { name: r.name, leagueId: r.league_id, compSlug: c.slug, compName: c.name, women });
  }
  // A last guard: never two rows that read the same.
  const seen = new Set<string>();
  return Array.from(out.values())
    .filter((t) => { const k = teamTitle(t).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => teamTitle(a).localeCompare(teamTitle(b)));
}

const teamFollowFor = (follows: Follow[], t: TeamChoice) =>
  follows.find((f) => f.kind === "team" && (f.label === t.name || f.key === clubSlug(t.name)));

function TeamRow({ team, follows }: { team: TeamChoice; follows: Follow[] }) {
  const toggle = useToggleFollow();
  const [busy, setBusy] = useState(false);
  const existing = teamFollowFor(follows, team);
  const onClick = async () => {
    if (existing) {
      toggle.mutate({ following: true, follow: existing });
      return;
    }
    setBusy(true);
    // The team page's own slug, so this follow and the page's Follow button agree.
    let key = clubSlug(team.name);
    try {
      const res = await fetch(`/api/public/team-page/${encodeURIComponent(key)}?competition=${encodeURIComponent(team.compSlug)}`);
      if (res.ok) key = (await res.json()).slug || key;
    } catch {
      /* fall back to the club slug */
    }
    toggle.mutate(
      { following: false, follow: { kind: "team", key, label: team.name, subtitle: team.compName, image_url: null, league_id: team.leagueId, player_ids: [] } },
      { onSettled: () => setBusy(false), onError: () => toast({ title: "Couldn't follow that team", description: "Try again in a moment." }) },
    );
  };
  return (
    <Row
      image={<TeamLogo teamName={team.name} leagueId={team.leagueId} size="sm" />}
      title={teamTitle(team)}
      detail={withoutSeason(team.compName)}
      action={<FollowPill on={!!existing} onClick={onClick} busy={busy} />}
    />
  );
}

function TeamPicker({ follows, directory }: { follows: Follow[]; directory: NonNullable<ReturnType<typeof useLeagueDirectory>["data"]> }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const leagueKeysFollowed = follows.filter((f) => f.kind === "league").map((f) => f.key);
  // A league's own clubs, not every lower-division side that met it in the cup;
  // a league that is only a cup keeps its whole draw.
  const leagueComps = directory.active.filter((c) => leagueKeysFollowed.includes(directory.lk.keyOf(c) ?? ""));
  const keysWithLeague = new Set(leagueComps.filter((c) => !isCup(c)).map((c) => directory.lk.keyOf(c)));
  const compIds = leagueComps
    .filter((c) => !isCup(c) || !keysWithLeague.has(directory.lk.keyOf(c)))
    .map((c) => c.league_id);

  const { data: inLeagues = [] } = useQuery({
    queryKey: ["prefs-teams", compIds.join(",")],
    enabled: compIds.length > 0 && !query,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("name, league_id").in("league_id", compIds).limit(1000);
      return groupTeams(data ?? [], directory.compById);
    },
  });
  const { data: found = [], isFetching } = useQuery({
    queryKey: ["prefs-team-search", query],
    enabled: query.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("name, league_id").ilike("name", `%${query}%`).limit(120);
      const activeIds = new Set(directory.active.map((c) => c.league_id));
      return groupTeams(data ?? [], directory.compById, activeIds).slice(0, 20);
    },
  });

  const followedTeams = follows.filter((f) => f.kind === "team");
  const list = query ? found : inLeagues;
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search any team" />
      {!query && followedTeams.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {followedTeams.map((f) => (
            <FollowedChip key={f.id} follow={f} />
          ))}
        </div>
      )}
      <div className="mt-2 divide-y divide-[color:var(--ch-border)]">
        {list.map((t) => (
          <TeamRow key={`${t.name}|${t.leagueId}`} team={t} follows={follows} />
        ))}
      </div>
      {!query && compIds.length === 0 && (
        <p className="mt-3 text-sm text-[color:var(--ch-muted)]">Pick a league above to see its teams here, or search.</p>
      )}
      {query.length >= 2 && !isFetching && found.length === 0 && (
        <p className="mt-3 text-sm text-[color:var(--ch-muted)]">No teams match "{query}".</p>
      )}
    </>
  );
}

function FollowedChip({ follow }: { follow: Follow }) {
  const toggle = useToggleFollow();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--ch-accent-soft)] pl-3 pr-1.5 py-1 text-[13px] font-semibold text-[color:var(--ch-text)]">
      <Link href={followHref(follow)} className="truncate max-w-[12rem]">{follow.kind === "team" ? clubDisplayName(follow.label) : follow.label}</Link>
      <button type="button" aria-label={`Unfollow ${follow.label}`} onClick={() => toggle.mutate({ following: true, follow })} className="p-0.5">
        <X className="h-3.5 w-3.5 text-[color:var(--ch-muted)]" />
      </button>
    </span>
  );
}

// ── Players ───────────────────────────────────────────────────────────────

interface Rec { full_name: string; team_name: string | null }
interface PlayerChoice { key: string; name: string; members: Rec[]; team: string | null; leagueId: string | null; ids: string[]; photo: string | null }

/** A name folded for comparison: case, accents and punctuation ignored. */
const personKey = (name: string) => foldName(name).replace(/[^a-z0-9]+/g, " ").trim();
const surnameOf = (name: string) => personKey(name).split(" ").pop() ?? "";

const firstOf = (name: string) => personKey(name).split(" ")[0] ?? "";

/**
 * Whether two records are the same person, by the rule their player page
 * uses to combine records (fuzzyMatch's namesMatch), held tighter for a list:
 * the same surname always; the same first name ("Marlee Ann Ball" is "Marlee
 * Ball"), or a different spelling of it only on the same club ("Tom" and
 * "Thomas" Browne together, but never "Nathan" and "Jonathan" Brown from
 * different teams). Abbreviated names ("M. Ball") only join an exact match;
 * the list hides them beside the full name.
 */
const samePerson = (a: Rec, b: Rec) => {
  if (personKey(a.full_name) === personKey(b.full_name)) return true;
  if (isInitialOnlyName(a.full_name) || isInitialOnlyName(b.full_name)) return false;
  if (surnameOf(a.full_name) !== surnameOf(b.full_name) || !namesMatch(a.full_name, b.full_name)) return false;
  if (firstOf(a.full_name) === firstOf(b.full_name)) return true;
  return !!a.team_name && !!b.team_name && clubSlug(a.team_name) === clubSlug(b.team_name);
};

/** The key their player page is found under, so this follow and the page's Follow button agree. */
const pageKey = (p: { slug: string | null; full_name: string; id: string }) => {
  const path = playerPath(p);
  return path ? decodeURIComponent(path.replace(/^\/player\//, "")) : p.id;
};

function PlayerPicker({ follows, directory }: { follows: Follow[]; directory: NonNullable<ReturnType<typeof useLeagueDirectory>["data"]> }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const toggle = useToggleFollow();
  const { data: found = [], isFetching } = useQuery({
    queryKey: ["prefs-player-search", query],
    enabled: query.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PlayerChoice[]> => {
      const { data } = await supabase
        .from("players")
        .select("id, slug, full_name, team_name, league_id, photo_path, photo_path_bg_removed")
        .ilike("full_name", `%${query}%`)
        .limit(200);
      const activeIds = new Set(directory.active.map((c) => c.league_id));
      // Which record speaks for the person: one from a league playing now,
      // then a cup playing now, then anything older.
      const rank = (leagueId: string) => {
        const c = directory.compById.get(leagueId);
        return (activeIds.has(leagueId) ? 0 : 2) + (isCup(c) ? 1 : 0);
      };
      type Rec = NonNullable<typeof data>[number];
      const groups: Array<{ recs: Rec[]; photo: string | null }> = [];
      for (const p of data ?? []) {
        const comp = p.league_id ? directory.compById.get(p.league_id) : undefined;
        if (!comp || isYouthCompetition(comp) || !p.full_name) continue;
        let g = groups.find((x) => x.recs.some((r) => samePerson(r, p)));
        if (!g) groups.push((g = { recs: [], photo: null }));
        g.recs.push(p);
        const path = p.photo_path_bg_removed || p.photo_path;
        if (!g.photo && path) g.photo = supabase.storage.from("player-photos").getPublicUrl(path).data.publicUrl;
      }
      const all = groups.map(({ recs, photo }) => {
        const best = [...recs].sort((a, b) => rank(a.league_id!) - rank(b.league_id!) || Number(!a.slug) - Number(!b.slug))[0];
        return {
          key: pageKey(best),
          name: best.full_name,
          members: recs.map((r) => ({ full_name: r.full_name, team_name: r.team_name })),
          team: best.team_name ? clubDisplayName(best.team_name) : null,
          leagueId: best.league_id,
          ids: recs.map((r) => r.id),
          photo,
          active: rank(best.league_id!) < 2,
        };
      });
      // The feed leaves "B. Dinkins" rows beside "Brittany Dinkins"; offer only the real one.
      const shadowed = (g: PlayerChoice) => {
        const m = g.name.match(/^([A-Z])\.\s*(.+)$/i);
        if (!m) return false;
        const [, initial, surname] = m;
        return all.some(
          (o) =>
            o !== g &&
            o.team === g.team &&
            o.name.toLowerCase().startsWith(initial.toLowerCase()) &&
            o.name.toLowerCase().endsWith(` ${surname.toLowerCase()}`) &&
            !/^[A-Z]\./i.test(o.name),
        );
      };
      return all
        .filter((g) => !shadowed(g))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
        .slice(0, 25);
    },
  });

  const followedPlayers = follows.filter((f) => f.kind === "player");
  const existingFor = (p: PlayerChoice) => findFollow(follows, "player", p.key, p.ids);
  const onToggle = async (p: PlayerChoice) => {
    const existing = existingFor(p);
    if (existing) return toggle.mutate({ following: true, follow: existing });
    // Every record of theirs, in every competition, so all their games count
    // (the search above only sees the first couple of hundred name matches).
    // Everyone with their surname, kept when they are the same person as any
    // name this row already stands for.
    const surname = (p.name.trim().split(/\s+/).pop() ?? p.name).replace(/[,()*%\\]/g, "");
    const { data } = await supabase
      .from("players")
      .select("id, full_name, team_name")
      .or(`full_name.ilike.${surname},full_name.ilike.% ${surname}`)
      .limit(500);
    const same = (data ?? []).filter((r) => r.full_name && p.members.some((m) => samePerson(m, r))).map((r) => r.id);
    const ids = Array.from(new Set([...p.ids, ...same]));
    const follow: NewFollow = { kind: "player", key: p.key, label: p.name, subtitle: p.team, image_url: p.photo, league_id: p.leagueId, player_ids: ids };
    toggle.mutate({ following: false, follow }, { onError: () => toast({ title: "Couldn't follow that player", description: "Try again in a moment." }) });
  };

  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search any player" />
      {!query && followedPlayers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {followedPlayers.map((f) => (
            <FollowedChip key={f.id} follow={f} />
          ))}
        </div>
      )}
      <div className="mt-2 divide-y divide-[color:var(--ch-border)]">
        {found.map((p) => (
          <Row
            key={p.key}
            image={<PlayerSearchAvatar name={p.name} photoUrl={p.photo} />}
            title={p.name}
            detail={p.team}
            action={<FollowPill on={!!existingFor(p)} onClick={() => void onToggle(p)} />}
          />
        ))}
      </div>
      {query.length >= 2 && !isFetching && found.length === 0 && (
        <p className="mt-3 text-sm text-[color:var(--ch-muted)]">No players match "{query}".</p>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: follows = [] } = useFollows();
  const { data: directory, isLoading } = useLeagueDirectory();
  const counts = useMemo(
    () => ({
      leagues: follows.filter((f) => f.kind === "league").length,
      teams: follows.filter((f) => f.kind === "team").length,
      players: follows.filter((f) => f.kind === "player").length,
    }),
    [follows],
  );

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <SiteHeader hideSearch />
      <main className="max-w-2xl mx-auto px-4 pt-5 pb-16">
        <h1 className="ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2rem] text-[color:var(--ch-text)]">Your preferences</h1>
        <p className="mt-1 text-sm text-[color:var(--ch-text-2)]">
          Pick the leagues, teams and players you follow.
        </p>

        {!authLoading && !user ? (
          <div className="mt-6">
            <p className="text-sm text-[color:var(--ch-text-2)]">Log in or create a free account to pick your leagues, teams and players.</p>
            <div className="mt-4 flex gap-2">
              <Link href="/auth?tab=register" className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white">Register free</Link>
              <Link href="/auth" className="rounded-full border border-[color:var(--ch-border)] px-4 py-2 text-sm font-semibold text-[color:var(--ch-text)]">Log in</Link>
            </div>
          </div>
        ) : isLoading || !directory ? (
          <p className="py-10 text-center text-sm text-[color:var(--ch-muted)]">Loading…</p>
        ) : (
          <>
            <Section title="Leagues" hint={counts.leagues ? `${counts.leagues} picked.` : "Tap the leagues you follow."}>
              <LeaguePicker options={directory.options} follows={follows} />
            </Section>
            <Section title="Teams" hint={counts.teams ? `Following ${counts.teams}.` : "Teams from your leagues, or search for any team."}>
              <TeamPicker follows={follows} directory={directory} />
            </Section>
            <Section title="Players" hint={counts.players ? `Following ${counts.players}.` : "Search for players to follow."}>
              <PlayerPicker follows={follows} directory={directory} />
            </Section>
          </>
        )}
      </main>
    </div>
  );
}
