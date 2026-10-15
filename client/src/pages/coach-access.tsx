import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { BadgeCheck, CalendarRange, Check, FileText, Lock, Search, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { fetchBillingConfig, fetchMyAccess, formatMoney, startCheckout, type PlanOffer } from "@/lib/billingApi";

/**
 * /coach-access: a coach picks their team and a plan, signs in (or makes a free
 * account), and pays on Stripe's own checkout page. Payment turns the coach role
 * on through the Stripe webhook (server/billing), so this page never grants
 * anything itself.
 */

interface TeamChoice { team_id: string; name: string; competition: string; season: string | null }

const WHAT_YOU_GET = [
  { icon: Users, text: "Your team's Coaches Hub: standings, lineups, trends and every game" },
  { icon: Sparkles, text: "An AI scouting report on every opponent, with the game plan and who to stop" },
  { icon: FileText, text: "Printable reports in your club's colours, with your own notes added" },
];

function useTeamSearch(query: string) {
  return useQuery<TeamChoice[]>({
    queryKey: ["coach-team-search", query],
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: teams } = await supabase.from("teams").select("team_id, name, league_id").ilike("name", `%${query.trim().replace(/[%_,]/g, "")}%`).limit(40);
      const ids = Array.from(new Set((teams || []).map((t: any) => t.league_id).filter(Boolean)));
      const { data: comps } = ids.length ? await supabase.from("competitions").select("league_id, name, season, is_public").in("league_id", ids) : { data: [] as any[] };
      const byId = new Map((comps || []).map((c: any) => [c.league_id, c]));
      return (teams || [])
        .map((t: any) => ({ t, c: byId.get(t.league_id) as any }))
        .filter(({ c }) => c && c.is_public)
        .map(({ t, c }) => ({ team_id: t.team_id, name: t.name, competition: c.name, season: c.season ?? null }))
        .sort((a, b) => (b.season || "").localeCompare(a.season || "") || a.name.localeCompare(b.name))
        .slice(0, 10);
    },
  });
}

function PlanCard({ offer, selected, onSelect, badge, note }: { offer: PlanOffer; selected: boolean; onSelect: () => void; badge?: string; note: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-testid={`plan-${offer.key}`}
      className={`relative text-left rounded-2xl border p-5 transition-all ${selected ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)] ring-2 ring-[color:var(--ch-accent)]" : "border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] hover:border-[color:var(--ch-border-strong)]"}`}
    >
      {badge && <span className="absolute -top-2.5 right-4 rounded-full bg-[color:var(--ch-accent)] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">{badge}</span>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[color:var(--ch-text)]">{offer.label}</span>
        <span className={`h-5 w-5 rounded-full border flex items-center justify-center ${selected ? "bg-[color:var(--ch-accent)] border-transparent text-white" : "border-[color:var(--ch-border-strong)]"}`}>
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="ch-display text-[2.4rem] font-bold leading-none tabular-nums text-[color:var(--ch-text)]">{formatMoney(offer.amount, offer.currency)}</span>
        <span className="text-sm text-[color:var(--ch-muted)]">{offer.interval === "month" ? "a month" : "once"}</span>
      </div>
      <p className="mt-2 text-[13px] text-[color:var(--ch-text-2)]">{note}</p>
    </button>
  );
}

export default function CoachAccessPage() {
  const { user, isLoading: authLoading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const [plan, setPlan] = useState<"monthly" | "season">(params.get("plan") === "monthly" ? "monthly" : "season");
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState<TeamChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = useQuery({ queryKey: ["billing-config"], queryFn: fetchBillingConfig, staleTime: 5 * 60_000 });
  const mine = useQuery({ queryKey: ["billing-mine", user?.id], queryFn: fetchMyAccess, enabled: !!user, staleTime: 30_000 });
  const results = useTeamSearch(search);

  // A team picked before signing in (or before a cancelled payment) comes back in the address.
  useEffect(() => {
    const id = params.get("team");
    if (!id || team) return;
    (async () => {
      const { data: t } = await supabase.from("teams").select("team_id, name, league_id").eq("team_id", id).maybeSingle();
      if (!t) return;
      const { data: c } = await supabase.from("competitions").select("name, season, is_public").eq("league_id", t.league_id).maybeSingle();
      if (c?.is_public) setTeam({ team_id: t.team_id, name: t.name, competition: c.name, season: c.season ?? null });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offers = config.data?.plans ?? [];
  const monthly = offers.find((o) => o.key === "monthly");
  const season = offers.find((o) => o.key === "season");
  const selected = plan === "monthly" ? monthly : season;
  const seasonEnd = config.data?.seasonEnds ? new Date(config.data.seasonEnds) : null;

  // What the season pass saves against paying monthly until the season ends.
  const monthsLeft = useMemo(() => (seasonEnd ? Math.max(1, Math.round((seasonEnd.getTime() - Date.now()) / (30.44 * 86_400_000))) : 0), [seasonEnd]);
  const saving = monthly && season && monthsLeft ? monthly.amount * monthsLeft - season.amount : 0;

  const returnTo = `/coach-access?plan=${plan}${team ? `&team=${team.team_id}` : ""}`;
  const live = mine.data?.access?.live;

  const checkout = async () => {
    if (!team || !selected) return;
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await startCheckout(plan, team.team_id));
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Coach access | Swish Assistant</title>
        <meta name="description" content="Give your team the Coaches Hub and an AI scouting report on every opponent. Monthly or a full season." />
      </Helmet>
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 md:px-6 pt-8 md:pt-14 pb-20">
        <div className="ch-rise text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">For coaches</div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.4rem] md:text-[3.4rem] text-[color:var(--ch-text)]">Know every opponent before tip-off</h1>
          <p className="mt-3 text-[15px] text-[color:var(--ch-text-2)] max-w-xl mx-auto">Your team's own page and an AI scouting report for every game, in your club's colours. Set up in about two minutes.</p>
        </div>

        {config.data?.testMode && (
          <div className="mt-6 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-[13px] text-amber-900 dark:text-amber-200" data-testid="test-mode-banner">
            <strong>Test mode.</strong> Nothing is charged. Pay with card <span className="font-mono">4242 4242 4242 4242</span>, any future expiry and any 3-digit CVC.
          </div>
        )}

        <ul className="ch-rise mt-8 grid gap-2.5" style={{ animationDelay: "40ms" }}>
          {WHAT_YOU_GET.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-[14px] text-[color:var(--ch-text-2)]">
              <span className="mt-0.5 h-6 w-6 shrink-0 rounded-lg flex items-center justify-center bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]"><Icon className="h-3.5 w-3.5" /></span>
              {text}
            </li>
          ))}
        </ul>

        {config.isLoading ? (
          <div className="mt-8 h-40 rounded-2xl bg-[color:var(--ch-surface-2)] animate-pulse" />
        ) : !config.data?.configured ? (
          <div className="ch-card mt-8 p-6 text-center">
            <Lock className="mx-auto h-6 w-6 text-[color:var(--ch-muted)]" />
            <p className="mt-2 font-semibold text-[color:var(--ch-text)]">Coach access opens soon</p>
            <p className="mt-1 text-sm text-[color:var(--ch-text-2)]">We are finishing payments. Get in touch and we will set your team up.</p>
            <Link href="/contact-sales?topic=coach" className="ch-btn ch-btn-primary h-10 px-5 mt-4 inline-flex">Talk to us</Link>
          </div>
        ) : live ? (
          <div className="ch-card mt-8 p-6 text-center" data-testid="already-subscribed">
            <BadgeCheck className="mx-auto h-7 w-7 text-[color:var(--ch-win)]" />
            <p className="mt-2 font-semibold text-[color:var(--ch-text)]">You already have coach access to {mine.data?.access?.teamName}</p>
            <Link href="/coaches-hub" className="ch-btn ch-btn-primary h-10 px-5 mt-4 inline-flex">Open your Coaches Hub</Link>
          </div>
        ) : (
          <section className="mt-8 space-y-7" aria-label="Choose your plan and team">
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--ch-text)] mb-3"><span className="text-[color:var(--ch-accent)] mr-1.5">1</span> Choose a plan</h2>
              <div role="radiogroup" aria-label="Plan" className="grid sm:grid-cols-2 gap-3.5">
                {season && (
                  <PlanCard
                    offer={season} selected={plan === "season"} onSelect={() => setPlan("season")}
                    badge={saving > 0 ? `Save ${formatMoney(saving, season.currency)}` : undefined}
                    note={`One payment. Covers you until ${seasonEnd ? seasonEnd.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "the end of the season"}.`}
                  />
                )}
                {monthly && <PlanCard offer={monthly} selected={plan === "monthly"} onSelect={() => setPlan("monthly")} note="Renews every month. Cancel any time and keep access to the end of the month." />}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[color:var(--ch-text)] mb-3"><span className="text-[color:var(--ch-accent)] mr-1.5">2</span> Find your team</h2>
              {team ? (
                <div className="ch-tile flex items-center justify-between gap-3 px-4 py-3" data-testid="chosen-team">
                  <div className="min-w-0">
                    <p className="font-semibold text-[color:var(--ch-text)] truncate">{team.name}</p>
                    <p className="text-xs text-[color:var(--ch-muted)] truncate">{team.competition}{team.season ? ` · ${team.season}` : ""}</p>
                  </div>
                  <button type="button" onClick={() => setTeam(null)} className="ch-btn ch-btn-ghost h-8 px-2.5 text-xs" aria-label="Choose a different team"><X className="h-3.5 w-3.5" /> Change</button>
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ch-muted)]" />
                    <input
                      value={search} onChange={(e) => setSearch(e.target.value)} type="search" autoComplete="off" data-testid="team-search"
                      placeholder="Search your team, for example Valur" className="ch-input h-11 w-full pl-9 pr-3 text-sm"
                    />
                  </div>
                  {search.trim().length >= 2 && (
                    <ul className="mt-2 divide-y divide-[color:var(--ch-border)] rounded-xl border border-[color:var(--ch-border)] overflow-hidden bg-[color:var(--ch-surface)]">
                      {(results.data ?? []).map((t) => (
                        <li key={t.team_id}>
                          <button type="button" onClick={() => { setTeam(t); setSearch(""); }} className="w-full text-left px-4 py-2.5 hover:bg-[color:var(--ch-surface-2)] flex items-center justify-between gap-3" data-testid="team-result">
                            <span className="font-medium text-[color:var(--ch-text)] truncate">{t.name}</span>
                            <span className="text-xs text-[color:var(--ch-muted)] truncate">{t.competition}{t.season ? ` · ${t.season}` : ""}</span>
                          </button>
                        </li>
                      ))}
                      {!results.isLoading && (results.data ?? []).length === 0 && <li className="px-4 py-3 text-sm text-[color:var(--ch-muted)]">No team found. Can't see yours? <Link href="/contact-sales?topic=coach" className="underline">Tell us</Link>.</li>}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-[color:var(--ch-muted)]">Pick the team in the league you coach in. Your access opens straight into that league.</p>
                </div>
              )}
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[color:var(--ch-text)] mb-3"><span className="text-[color:var(--ch-accent)] mr-1.5">3</span> Pay securely</h2>
              {authLoading ? null : !user ? (
                <div className="ch-card p-5 space-y-3" data-testid="signin-first">
                  <p className="text-sm text-[color:var(--ch-text-2)]">Create a free account (or sign in) so your access is tied to you. You will come straight back here.</p>
                  <div className="flex flex-wrap gap-3">
                    <Link href={`/auth?tab=register&next=${encodeURIComponent(returnTo)}`} className="ch-btn ch-btn-primary h-11 px-5">Create free account</Link>
                    <Link href={`/auth?next=${encodeURIComponent(returnTo)}`} className="ch-btn ch-btn-ghost h-11 px-5">I already have one</Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button" disabled={!team || !selected || busy} onClick={checkout} data-testid="checkout-button"
                    className="ch-btn ch-btn-primary w-full h-12 justify-center text-[15px] disabled:opacity-50"
                  >
                    <Lock className="h-4 w-4" />
                    {busy ? "Taking you to Stripe…" : !team ? "Choose your team to continue" : `Continue to payment: ${selected ? formatMoney(selected.amount, selected.currency) : ""}${plan === "monthly" ? " a month" : ""}`}
                  </button>
                  {error && <p className="text-sm text-[color:var(--ch-loss)]" role="alert" data-testid="checkout-error">{error}</p>}
                  <p className="flex items-center justify-center gap-1.5 text-xs text-[color:var(--ch-muted)]"><ShieldCheck className="h-3.5 w-3.5" /> Card details are taken by Stripe. We never see or store them.</p>
                </div>
              )}
              {params.get("cancelled") && <p className="mt-3 text-sm text-[color:var(--ch-text-2)]">Payment cancelled. Nothing was charged. You can pick up where you left off.</p>}
            </div>

            <p className="flex items-start gap-2 text-xs text-[color:var(--ch-muted)]"><CalendarRange className="h-4 w-4 shrink-0 mt-px" /> Season runs September to May. Questions, or coaching more than one team? <Link href="/contact-sales?topic=coach" className="underline">Talk to us</Link>.</p>
          </section>
        )}
      </main>
    </div>
  );
}
