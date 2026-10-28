import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Lock } from "lucide-react";
import type { LandscapeAxis } from "@/lib/landscapePresets";

/** The wording along one side of a landscape chart: the low end, the axis title and the better (or higher) end. */
export function AxisCaption({ axis, colour, upright = false }: { axis: LandscapeAxis<string>; colour: string; upright?: boolean }) {
  const [low, high] = axis.ends;
  const end = "flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]";
  return (
    <div
      className={`flex items-center justify-between gap-2 ${upright ? "h-full" : "w-full"}`}
      // Turned so it reads from the bottom of the chart to the top, the better end uppermost.
      style={upright ? { writingMode: "vertical-rl", transform: "rotate(180deg)" } : undefined}
    >
      <span className={`${end} text-[color:var(--ch-text-2)]`}>
        <ArrowLeft className={`h-3 w-3 flex-none ${upright ? "rotate-90" : ""}`} />
        {low}
      </span>
      <span className="hidden truncate text-[10px] font-medium uppercase tracking-widest text-[color:var(--ch-muted)] sm:block">
        {axis.title}
      </span>
      <span className={end} style={{ color: axis.neutral ? "var(--ch-text-2)" : colour }}>
        {high}
        <ArrowRight className={`h-3 w-3 flex-none ${upright ? "rotate-90" : ""}`} />
      </span>
    </div>
  );
}

type GateProps = {
  /** The locked chart asked for. */
  label: string;
  hint: string;
  /** How many charts a free account unlocks, this one included. */
  lockedCount: number;
  signedIn: boolean;
  accent: string;
  /** The chart the visitor goes back to. */
  backTo: string;
  onBack: () => void;
};

/** Over a members' chart that a visitor without a confirmed account asked for. */
export function LandscapeGate({ label, hint, lockedCount, signedIn, accent, backTo, onBack }: GateProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-3">
      <div className="w-full max-w-sm rounded-2xl border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] p-5 text-center shadow-2xl" data-testid="landscape-gate">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ backgroundColor: accent }}>
          <Lock className="h-4 w-4" />
        </span>
        <h4 className="mt-3 text-base font-bold text-[color:var(--ch-text)]">{label} is a members' chart</h4>
        <p className="mt-1 text-sm text-[color:var(--ch-text-2)]">
          {signedIn
            ? "Confirm your email address to unlock it, along with the rest of the league landscape."
            : `${hint} A free account unlocks it and ${lockedCount - 1} more.`}
        </p>
        {!signedIn && (
          <Link
            href="/auth?tab=register"
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            Create free account
          </Link>
        )}
        <div className="mt-3 flex items-center justify-center gap-4 text-xs">
          {!signedIn && (
            <Link href="/auth" className="font-medium text-[color:var(--ch-text-2)] underline-offset-2 hover:underline">
              Sign in
            </Link>
          )}
          <button type="button" onClick={onBack} className="font-medium text-[color:var(--ch-text-2)] underline-offset-2 hover:underline">
            Back to {backTo.toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
