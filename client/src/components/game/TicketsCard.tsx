import { ArrowUpRight, Ticket } from "lucide-react";
import type { MatchupColors } from "./GameScoreHero";

/**
 * Ticket sales for a game. A placeholder until clubs can add their ticket
 * link: once `ticketUrl` is set (e.g. from a future `game_schedule.ticket_url`
 * or a team's default ticket page) it becomes a "Get tickets" button.
 */
export default function TicketsCard({
  homeTeam, awayTeam, ticketUrl, colors,
}: {
  homeTeam: string;
  awayTeam: string;
  ticketUrl?: string | null;
  colors: MatchupColors;
}) {
  const live = !!ticketUrl;
  return (
    <section
      className="ch-card mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between md:px-5"
      style={{ background: `linear-gradient(110deg, color-mix(in srgb, ${colors.homeFill} 14%, var(--ch-surface)) 0%, var(--ch-surface) 55%)` }}
      aria-label="Tickets"
      data-testid="tickets-card"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ background: colors.homeFill }}
        >
          <Ticket className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="ch-eyebrow">Tickets</span>
            {!live && (
              <span className="rounded-full bg-[color:var(--ch-surface-3)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ch-text-2)]">
                Coming soon
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm font-semibold text-[color:var(--ch-text)] [text-wrap:balance]">
            {live ? `Be there: ${homeTeam} vs ${awayTeam}` : `Ticket sales for ${homeTeam} home games will appear here`}
          </p>
        </div>
      </div>
      {live ? (
        <a
          href={ticketUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="ch-btn h-10 shrink-0 px-4 font-semibold text-white shadow-sm hover:brightness-110"
          style={{ background: colors.homeFill }}
          data-testid="tickets-link"
        >
          Get tickets
          <ArrowUpRight className="h-4 w-4" />
        </a>
      ) : (
        <span
          className="ch-btn ch-btn-ghost h-10 shrink-0 cursor-not-allowed px-4 opacity-60"
          aria-disabled="true"
        >
          <Ticket className="h-4 w-4" />
          Get tickets
        </span>
      )}
    </section>
  );
}
