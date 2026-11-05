import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PlusGate } from "@/components/PlusGate";
import { authHeaders } from "@/lib/billingApi";

/**
 * Swish+: a team's clutch numbers (the last five minutes of the fourth quarter and overtime, with
 * the score within five), its players in clutch time, and the competition's clutch table.
 */

type ClutchPlayer = {
  key: string;
  id: string;
  name: string;
  games: number;
  minutes: number | null;
  onPlusMinus: number;
  boxGames: number;
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  ast: number;
  reb: number;
  tov: number;
};

type ClutchResponse = {
  league: { name: string; teams: { team_id: string; name: string; games: number; wins: number; losses: number; minutes: number | null; plusMinus: number; net: number | null }[] };
  team: { team_id: string; name: string } | null;
  rank: number | null;
  coverage: { games: number; teamTotals: number; lineups: number; credit: number };
  summary: {
    games: number;
    wins: number;
    losses: number;
    minutes: number | null;
    pf: number;
    pa: number;
    plusMinus: number;
    ortg: number | null;
    drtg: number | null;
    net: number | null;
    efg: number | null;
    oppEfg: number | null;
    tovPct: number | null;
    oppTovPct: number | null;
    orebPct: number | null;
    ftRate: number | null;
  } | null;
  players: ClutchPlayer[];
};

const signed = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`);
const fixed = (v: number | null | undefined, digits = 1) => (v == null ? "—" : v.toFixed(digits));
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const tone = (v: number | null | undefined) => (v == null || v === 0 ? undefined : v > 0 ? "var(--ch-win)" : "var(--ch-loss)");
const clubName = (name: string) => name.replace(/\s+Senior\s+Men(\s+I)?\s*$/i, "").trim();

type Props = { slug: string; teamName: string; accentColor: string };

export function TeamClutchPanel(props: Props) {
  return (
    <section aria-label="Clutch" data-testid="team-clutch">
      <div className="mb-4">
        <h2 className="ch-section-title flex items-center gap-2">
          Clutch
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)]">Swish+</span>
        </h2>
        <p className="mt-1.5 text-xs text-[color:var(--ch-text-2)] md:text-sm">
          The last five minutes of the fourth quarter and overtime, with the score within five. Who closes games, and how.
        </p>
      </div>
      <PlusGate what="Clutch numbers" detail="Record in close games, net rating in the last five minutes, and every player's clutch line." height={340}>
        <ClutchBody {...props} />
      </PlusGate>
    </section>
  );
}

function ClutchBody({ slug, teamName, accentColor }: Props) {
  const { data, isLoading, isError } = useQuery<ClutchResponse | null>({
    queryKey: ["team-clutch", slug, teamName],
    enabled: !!slug && !!teamName,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const params = new URLSearchParams({ team_name: teamName });
      const res = await fetch(`/api/league/${encodeURIComponent(slug)}/clutch?${params}`, { headers: await authHeaders() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as ClutchResponse;
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-[color:var(--ch-text-2)]">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: accentColor }} />
        Reading every close finish…
      </div>
    );
  }
  if (isError || !data) {
    return <p className="py-8 text-center text-sm text-[color:var(--ch-text-2)]">{isError ? "Couldn't load clutch numbers right now." : "Clutch numbers aren't available for this competition."}</p>;
  }
  const s = data.summary;
  if (!s || s.games === 0) {
    return (
      <p className="py-8 text-center text-sm text-[color:var(--ch-text-2)]">
        {data.coverage.games === 0 ? "No play-by-play has been recorded for this team yet." : "No close finishes yet: this team hasn't been within five in the last five minutes of a game."}
      </p>
    );
  }

  const players = data.players.filter((p) => (p.minutes ?? 0) > 0 || p.fga + p.fta > 0);
  const teams = data.league.teams;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          { label: "Close games", value: `${s.wins}–${s.losses}`, note: `${s.games} game${s.games === 1 ? "" : "s"} with clutch time` },
          { label: "Net rating", value: signed(s.net), note: data.rank ? `${ordinal(data.rank)} of ${teams.length}` : undefined, color: tone(s.net) },
          { label: "Points", value: `${s.pf}–${s.pa}`, note: `${signed(s.plusMinus, 0)} in ${fixed(s.minutes)} min` },
          { label: "Off / Def", value: `${fixed(s.ortg)} / ${fixed(s.drtg)}`, note: "per 100 possessions" },
        ].map((x) => (
          <div key={x.label}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ch-muted)]">{x.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-[color:var(--ch-text)]" style={x.color ? { color: x.color } : undefined}>{x.value}</div>
            {x.note && <div className="text-xs text-[color:var(--ch-text-2)]">{x.note}</div>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-[color:var(--ch-border)] py-3 text-sm text-[color:var(--ch-text-2)]">
        <span>eFG% <b className="text-[color:var(--ch-text)] tabular-nums">{fixed(s.efg)}</b> <span className="text-[color:var(--ch-muted)]">vs {fixed(s.oppEfg)} allowed</span></span>
        <span>TOV% <b className="text-[color:var(--ch-text)] tabular-nums">{fixed(s.tovPct)}</b> <span className="text-[color:var(--ch-muted)]">vs {fixed(s.oppTovPct)} forced</span></span>
        <span>OREB% <b className="text-[color:var(--ch-text)] tabular-nums">{fixed(s.orebPct)}</b></span>
        <span>FT/FGA <b className="text-[color:var(--ch-text)] tabular-nums">{fixed(s.ftRate)}</b></span>
      </div>

      {players.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ch-text)]">Players in clutch time</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm" data-testid="clutch-players">
              <thead>
                <tr className="border-b border-[color:var(--ch-border)] text-[11px] uppercase tracking-wide text-[color:var(--ch-muted)]">
                  <th className="py-2 pr-3 text-left font-semibold">Player</th>
                  <th className="px-1.5 py-2 text-right font-semibold" title="Clutch minutes on the floor">Min</th>
                  <th className="px-1.5 py-2 text-right font-semibold" title="Games with clutch minutes">GP</th>
                  <th className="px-1.5 py-2 text-right font-semibold" title="Points scored minus allowed while on the floor in clutch time">On +/-</th>
                  <th className="px-1.5 py-2 text-right font-semibold">Pts</th>
                  <th className="px-1.5 py-2 text-right font-semibold">FG</th>
                  <th className="px-1.5 py-2 text-right font-semibold">3P</th>
                  <th className="px-1.5 py-2 text-right font-semibold">FT</th>
                  <th className="px-1.5 py-2 text-right font-semibold">Ast</th>
                  <th className="px-1.5 py-2 text-right font-semibold">Reb</th>
                  <th className="px-1.5 py-2 text-right font-semibold">TO</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.key} className="border-b border-[color:var(--ch-border)]">
                    <td className="py-2.5 pr-3 text-[13px] text-[color:var(--ch-text)]">{p.name}</td>
                    <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">{fixed(p.minutes)}</td>
                    <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">{p.games}</td>
                    <td className="px-1.5 py-2.5 text-right font-semibold tabular-nums" style={{ color: tone(p.onPlusMinus) }}>{signed(p.onPlusMinus, 0)}</td>
                    <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text)]">{p.pts}</td>
                    <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">{p.fgm}/{p.fga}</td>
                    <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">{p.fg3m}/{p.fg3a}</td>
                    <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">{p.ftm}/{p.fta}</td>
                    <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">{p.ast}</td>
                    <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">{p.reb}</td>
                    <td className="px-1.5 py-2.5 text-right tabular-nums text-[color:var(--ch-text-2)]">{p.tov}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {teams.length > 1 && (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ch-text)]">Clutch table, {data.league.name}</h3>
          <div className="grid grid-cols-[2rem_1fr_auto_auto_auto] gap-x-3 border-b border-[color:var(--ch-border)] pb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ch-muted)]" aria-hidden="true">
            <span />
            <span>Team</span>
            <span title="Record in games with clutch time">W–L</span>
            <span className="w-12 text-right" title="Points scored minus allowed in clutch time">+/-</span>
            <span className="w-14 text-right" title="Net rating per 100 possessions in clutch time">Net</span>
          </div>
          <ol className="text-sm" data-testid="clutch-league">
            {teams.map((t, i) => {
              const mine = t.team_id === data.team?.team_id;
              return (
                <li key={t.team_id} className={`grid grid-cols-[2rem_1fr_auto_auto_auto] items-center gap-x-3 border-b border-[color:var(--ch-border)] py-2 ${mine ? "font-semibold text-[color:var(--ch-text)]" : "text-[color:var(--ch-text-2)]"}`}>
                  <span className="tabular-nums text-[color:var(--ch-muted)]">{i + 1}</span>
                  <span style={mine ? { color: accentColor } : undefined}>{clubName(t.name)}</span>
                  <span className="tabular-nums">{t.wins}–{t.losses}</span>
                  <span className="w-12 text-right tabular-nums">{signed(t.plusMinus, 0)}</span>
                  <span className="w-14 text-right tabular-nums" style={{ color: tone(t.net) }}>{signed(t.net)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <p className="text-xs text-[color:var(--ch-text-2)]">
        Uses the {data.coverage.teamTotals} of {data.coverage.games} games where the play-by-play adds up to the final score for both teams.
        {" "}Of those, on-floor minutes and +/- use the {data.coverage.lineups} where the lineup tracking matches the box score,
        {" "}and each player's own points and shooting the {data.coverage.credit} where every basket is credited to the same player as in the box score.
        {" "}Small samples swing a lot, so check the minutes.
      </p>
    </div>
  );
}
