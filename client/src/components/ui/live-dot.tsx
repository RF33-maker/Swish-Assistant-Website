import { useState } from "react"

/** Length of one beat; must match the `live-ring` animation in tailwind.config.cjs. */
const BEAT_MS = 2000

/**
 * The one red "live" dot used everywhere: a solid dot with a soft ring that
 * spreads out and fades.
 *
 * Every dot is phase-locked to the wall clock, so all of them beat together.
 * Before, each dot started its animation when it mounted, so a card re-drawn
 * by the 30-second scores poll jumped back to the start of its cycle and fell
 * out of step with its neighbours, which read as flicker. The dot itself never
 * changes opacity, so a parent can fade it in and out without fighting the
 * animation. Reduced motion gets the solid dot only.
 */
export function LiveDot({ className = "h-1.5 w-1.5" }: { className?: string }) {
  // Negative delay starts the animation part-way through, at the same point
  // in the beat as every other dot on the page.
  const [delay] = useState(() => `${-(Date.now() % BEAT_MS)}ms`)
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 ${className}`}>
      <span
        className="absolute inset-0 rounded-full bg-red-500 opacity-0 motion-safe:animate-live-ring"
        style={{ animationDelay: delay }}
      />
      <span className="relative h-full w-full rounded-full bg-red-500" />
    </span>
  )
}
