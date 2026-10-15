import { Plus, Minus, Users, Target, CalendarRange } from 'lucide-react';
import { PlayerHeadshot } from '@/components/PlayerHeadshot';
import { describeStanding, ordinalOf, type Aspect, type Headshot, type PlayerProfile, type RosterEntry } from '@shared/scoutRoster';
import type { ScoutRosterResponse } from '@/hooks/useScoutRoster';

/**
 * The opponent's roster, and each rotation player's strengths and weaknesses
 * measured against the whole league. Sits under the game plan on the scouting
 * report. Numbers come from /api/scout-agent/roster (shared/scoutRoster.ts).
 */

const dash = (v: number | null) => (v == null ? '–' : String(v));

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

/**
 * A player's headshot when their record has one (face-framed thumbnail, falling
 * back to the original), otherwise their shirt number on the team colour.
 * `size` is the tile in px; the shirt number rides on the corner of a photo.
 */
function Avatar({ photo, shirt, name, color, size }: { photo?: Headshot | null; shirt: string | null; name: string; color: string; size: number }) {
  if (!photo) {
    return (
      <span
        className="shrink-0 rounded-[10px] flex items-center justify-center text-white font-bold ch-display"
        style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.45 }}
        aria-label={`${name}, number ${shirt || 'unknown'}`}
      >
        {shirt || initialsOf(name)}
      </span>
    );
  }
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span className="block w-full h-full rounded-[10px] overflow-hidden" style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, var(--ch-surface-2))` }}>
        <PlayerHeadshot
          src={photo.url}
          variant="thumb"
          alt={name}
          loading="lazy"
          className="w-full h-full object-cover"
          fallbackStyle={{ objectPosition: `50% ${photo.focusY ?? 12}%` }}
        />
      </span>
      {shirt && (
        <span
          className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-md text-[10.5px] leading-[18px] text-center font-bold text-white ch-display"
          style={{ backgroundColor: color, boxShadow: '0 0 0 2px var(--ch-surface)' }}
        >
          {shirt}
        </span>
      )}
    </span>
  );
}

function AspectRow({ a, kind }: { a: Aspect; kind: 'up' | 'down' }) {
  const tone = kind === 'up' ? 'var(--ch-win)' : 'var(--ch-loss)';
  return (
    <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start">
      <span
        className="mt-0.5 w-[22px] h-[22px] rounded-full flex items-center justify-center"
        style={{ color: tone, backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)` }}
        aria-hidden="true"
      >
        {kind === 'up' ? <Plus className="w-3 h-3" strokeWidth={3} /> : <Minus className="w-3 h-3" strokeWidth={3} />}
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white leading-snug">{a.label}</p>
        <p className="text-[13px] text-[color:var(--ch-text-2)]">{a.text}</p>
        <div className="flex items-center gap-2.5 mt-1.5">
          <span className="flex-1 min-w-[56px] h-1.5 rounded-full overflow-hidden bg-[color:var(--ch-surface-3)]">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(a.percentile, 3)}%`, backgroundColor: tone }} />
          </span>
          <span className="text-[12px] font-semibold tabular-nums whitespace-nowrap text-slate-900 dark:text-white">{ordinalOf(a.percentile)} percentile</span>
        </div>
        <p className="text-[12px] text-[color:var(--ch-muted)] mt-0.5">
          <span className="font-semibold" style={{ color: tone }}>{a.tier}</span> · {describeStanding(a)}
        </p>
      </div>
    </li>
  );
}

function ProfileCard({ p, color }: { p: PlayerProfile; color: string }) {
  return (
    <article className="ch-tile p-4 flex flex-col gap-4 min-w-0">
      <header className="flex items-center gap-3">
        <Avatar photo={p.photo} shirt={p.shirt} name={p.name} color={color} size={56} />
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white truncate">{p.name}</h4>
          <p className="text-[12.5px] text-[color:var(--ch-text-2)] tabular-nums">
            {p.mpg} min · {p.pts} pts · {p.reb} reb · {p.ast} ast · {p.gp} games
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
        <div className="min-w-0">
          <h5 className="ch-eyebrow mb-2">Strengths</h5>
          <ul className="space-y-3">
            {p.strengths.map((a) => <AspectRow key={a.key} a={a} kind="up" />)}
            {p.strengths.length === 0 && <li className="text-[13px] italic text-[color:var(--ch-muted)]">No league-level strength yet in this sample.</li>}
            {p.strengths.length > 0 && p.strengths.length < 3 && (
              <li className="text-[12.5px] italic text-[color:var(--ch-muted)]">Only {p.strengths.length} area{p.strengths.length === 1 ? '' : 's'} above the 60th percentile.</li>
            )}
          </ul>
        </div>
        <div className="min-w-0">
          <h5 className="ch-eyebrow mb-2">Weaknesses</h5>
          <ul className="space-y-3">
            {p.weaknesses.map((a) => <AspectRow key={a.key} a={a} kind="down" />)}
            {p.weaknesses.length === 0 && <li className="text-[13px] italic text-[color:var(--ch-muted)]">No league-level weakness yet in this sample.</li>}
            {p.weaknesses.length > 0 && p.weaknesses.length < 3 && (
              <li className="text-[12.5px] italic text-[color:var(--ch-muted)]">Only {p.weaknesses.length} area{p.weaknesses.length === 1 ? '' : 's'} below the 40th percentile.</li>
            )}
          </ul>
        </div>
      </div>
    </article>
  );
}

const SCALE = [
  { range: '90 and up', label: 'Elite', tone: 'var(--ch-win)' },
  { range: '60 to 89', label: 'Strength', tone: 'var(--ch-win)' },
  { range: '40 to 59', label: 'Average, not shown', tone: 'var(--ch-border-strong)' },
  { range: '11 to 39', label: 'Weakness', tone: 'var(--ch-loss)' },
  { range: '0 to 10', label: 'Among the worst', tone: 'var(--ch-loss)' },
];

/** Where the club's games came from, so a thin league record is not mistaken for thin data. */
function SeasonNote({ season, color }: { season: ScoutRosterResponse['season']; color: string }) {
  if (!season.wholeSeason || season.competitions.length === 0) return null;
  return (
    <div className="ch-tile flex items-start gap-2.5 p-3 mb-3 text-[13px] text-[color:var(--ch-text-2)]" style={{ borderLeft: `3px solid ${color}` }}>
      <CalendarRange className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
      <p>
        <strong className="text-slate-900 dark:text-white">{season.games} game{season.games === 1 ? '' : 's'} this season</strong>
        {season.competitions.length > 1 ? ', counted across every competition: ' : ' in '}
        {season.competitions.map((c, i) => (
          <span key={c.name}>{i > 0 ? ' · ' : ''}{c.name} {c.games}</span>
        ))}
        . Player numbers and league percentiles use all of them, so a club with few league games is not judged on one.
      </p>
    </div>
  );
}

function RosterTable({ roster }: { roster: RosterEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[color:var(--ch-border)]">
      <table className="w-full min-w-[640px] text-[13px] tabular-nums">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[color:var(--ch-muted)] bg-[color:var(--ch-surface-2)]">
            <th className="text-center font-semibold px-3 py-2 w-10">#</th>
            <th className="text-left font-semibold px-3 py-2">Player</th>
            {['GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG%', '3P%', 'FT%'].map((h) => (
              <th key={h} className="text-right font-semibold px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => (
            <tr key={r.playerId} className={`border-t border-[color:var(--ch-border)] ${r.profiled ? '' : 'text-[color:var(--ch-muted)]'}`}>
              <td className="text-center px-3 py-2 text-[color:var(--ch-muted)]">{r.shirt || ''}</td>
              <th scope="row" className={`text-left px-3 py-1.5 whitespace-nowrap ${r.profiled ? 'font-semibold text-slate-900 dark:text-white' : 'font-normal'}`}>
                <span className="inline-flex items-center gap-2.5">
                  <span className="shrink-0 w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-semibold bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]">
                    {r.photo ? (
                      <PlayerHeadshot src={r.photo.url} variant="thumb" alt="" loading="lazy" className="w-full h-full object-cover" fallbackStyle={{ objectPosition: `50% ${r.photo.focusY ?? 12}%` }} />
                    ) : (
                      initialsOf(r.name)
                    )}
                  </span>
                  {r.name}
                </span>
              </th>
              <td className="text-right px-3 py-2">{r.gp}</td>
              <td className="text-right px-3 py-2">{r.mpg}</td>
              <td className={`text-right px-3 py-2 ${r.profiled ? 'font-semibold' : ''}`}>{r.pts}</td>
              <td className="text-right px-3 py-2">{r.reb}</td>
              <td className="text-right px-3 py-2">{r.ast}</td>
              <td className="text-right px-3 py-2">{r.stl}</td>
              <td className="text-right px-3 py-2">{r.blk}</td>
              <td className="text-right px-3 py-2">{r.tov}</td>
              <td className="text-right px-3 py-2">{dash(r.fgPct)}</td>
              <td className="text-right px-3 py-2">{dash(r.threePct)}</td>
              <td className="text-right px-3 py-2">{dash(r.ftPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ScoutRoster({ data, opponentName, color }: { data: ScoutRosterResponse; opponentName: string; color: string }) {
  if (!data.roster.length) return null;
  const [lo, hi] = data.poolRange;
  return (
    <>
      <section className="ch-card p-4 md:p-6" aria-label={`${opponentName} roster`}>
        <div className="flex items-center gap-2.5 mb-1">
          <Users className="w-4 h-4" style={{ color }} />
          <h3 className="text-[15px] md:text-base font-semibold tracking-tight text-slate-900 dark:text-white">{opponentName} roster</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">
          Box-score per-game averages for the {data.season.label} season, most minutes first. Bold names are profiled below.
        </p>
        <SeasonNote season={data.season} color={color} />
        <RosterTable roster={data.roster} />
      </section>

      {data.profiles.length > 0 && (
        <section className="ch-card p-4 md:p-6" aria-label={`${opponentName} player profiles`}>
          <div className="flex items-center gap-2.5 mb-1">
            <Target className="w-4 h-4" style={{ color }} />
            <h3 className="text-[15px] md:text-base font-semibold tracking-tight text-slate-900 dark:text-white">Player profiles</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">
            Each player with 10+ minutes a game over 2+ games this season, set against all {data.poolSize} such players from the clubs in {data.leagueName || 'this league'}, with their games across competitions counted together.
          </p>

          <div className="ch-tile p-3.5 md:p-4 mb-4 space-y-3" style={{ borderLeft: `3px solid ${color}` }}>
            <h4 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">How to read this</h4>
            <p className="text-[13px] text-[color:var(--ch-text-2)] leading-relaxed">
              A percentile counts how many league players this player is ahead of. In a pool of {data.poolSize}, the 96th percentile means ahead of about {Math.round(0.96 * (data.poolSize - 1))} of the other {data.poolSize - 1}, and the 5th means ahead of only about {Math.round(0.05 * (data.poolSize - 1))}. Shooting percentages have fewer qualifying players ({lo} to {hi} depending on the stat), and each line under a bar uses its own pool. A longer bar is always better: green bars are strengths and red bars are weaknesses. For turnovers and fouls the bar already counts fewer as better.
            </p>
            <ul className="grid grid-cols-2 sm:grid-cols-5 gap-2" aria-label="Percentile scale">
              {SCALE.map((s) => (
                <li key={s.range} className="rounded-lg bg-[color:var(--ch-surface-2)] px-2.5 py-2 text-[12px] text-[color:var(--ch-text-2)]" style={{ borderBottom: `3px solid ${s.tone}` }}>
                  <b className="block text-[13px] text-slate-900 dark:text-white">{s.range}</b>
                  {s.label}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[color:var(--ch-muted)]">
              Counting stats are compared per 40 minutes, so bench players are not marked down for minutes. Early in a season the sample is small, so read these as early signs.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4">
            {data.profiles.map((p) => <ProfileCard key={p.playerId} p={p} color={color} />)}
          </div>
        </section>
      )}
    </>
  );
}
