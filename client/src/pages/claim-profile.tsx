import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, BadgeCheck, Clock, Loader2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthShell, { ERROR, INPUT, LABEL, LINK, SUBMIT } from "@/components/layout/AuthShell";
import { useAuth } from "@/hooks/use-auth";
import {
  type MyClaim,
  REDEEM_ERROR_MESSAGES,
  formatDob,
  getMyClaim,
  maxDobInputValue,
  redeemClaimCode,
} from "@/lib/playerClaims";

// Players never pick which profile to claim: the code we issued decides it,
// server-side. This page only collects the code and a date of birth, then
// shows the claim's status.

export default function ClaimProfilePage() {
  const { user, emailConfirmed, isLoading } = useAuth();
  const [claim, setClaim] = useState<MyClaim | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [code, setCode] = useState("");
  const [dob, setDob] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      setClaim(await getMyClaim());
    } catch (err: any) {
      setLoadError(err.message);
      setClaim(null);
    }
  };

  useEffect(() => {
    if (user && emailConfirmed) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, emailConfirmed]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await redeemClaimCode(code, dob);
      if (res.ok) {
        await refresh();
        setCode("");
        setDob("");
      } else {
        setError(REDEEM_ERROR_MESSAGES[res.error] ?? "Something went wrong. Please try again.");
        if (res.error === "already_pending" || res.error === "already_owns_profile") await refresh();
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || (user && emailConfirmed && claim === undefined)) {
    return (
      <AuthShell title="Claim your profile">
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" />
        </div>
      </AuthShell>
    );
  }

  if (!user) {
    return (
      <AuthShell
        title="Claim your profile"
        intro="Got a claim code from Swish Assistant? Sign in or create a free account to take ownership of your player profile."
        icon={<ShieldCheck className="h-10 w-10 text-[color:var(--ch-accent)]" />}
      >
        <div className="space-y-3">
          <Link href="/auth?next=/claim" className={SUBMIT}>
            Sign in to continue
          </Link>
          <p className="text-center text-sm text-[color:var(--ch-text-2)]">
            New here?{" "}
            <Link href="/auth?tab=register&next=/claim" className={LINK}>
              Create an account
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  if (!emailConfirmed) {
    return (
      <AuthShell title="Confirm your email" intro="Confirm your email address first, then come back here to enter your claim code.">
        <p className="text-sm text-[color:var(--ch-text-2)]">
          We sent a confirmation link to <strong className="text-[color:var(--ch-text)]">{user.email}</strong>.
        </p>
      </AuthShell>
    );
  }

  if (claim?.status === "approved") {
    return (
      <AuthShell
        title="Profile verified"
        intro={`You own ${claim.player_name}'s profile.`}
        icon={<BadgeCheck className="h-10 w-10 text-emerald-500" />}
      >
        <div className="space-y-3">
          <Link href="/my-profile/edit" className={SUBMIT}>
            Edit your profile
          </Link>
          {claim.profile_slug && (
            <p className="text-center text-sm text-[color:var(--ch-text-2)]">
              Your shareable link:{" "}
              <Link href={`/p/${claim.profile_slug}`} className={LINK}>
                swishassistant.com/p/{claim.profile_slug}
              </Link>
            </p>
          )}
        </div>
      </AuthShell>
    );
  }

  if (claim?.status === "pending") {
    return (
      <AuthShell
        title="Pending verification"
        intro="Thanks — we've received your claim and will verify it shortly."
        icon={<Clock className="h-10 w-10 text-amber-500" />}
      >
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[color:var(--ch-text-2)]">Profile</dt>
            <dd className="font-medium text-right">{claim.player_name}</dd>
          </div>
          {claim.team_name && (
            <div className="flex justify-between gap-4">
              <dt className="text-[color:var(--ch-text-2)]">Team</dt>
              <dd className="font-medium text-right">{claim.team_name}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-[color:var(--ch-text-2)]">Date of birth</dt>
            <dd className="font-medium text-right">{formatDob(claim.submitted_dob)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[13px] text-[color:var(--ch-text-2)]">
          You'll be able to edit your profile once it's approved. If the profile or date of birth is wrong, contact us and
          we'll correct it.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Claim your profile"
      intro="Enter the claim code we sent you and your date of birth. We'll verify it before your profile goes live."
      icon={<ShieldCheck className="h-10 w-10 text-[color:var(--ch-accent)]" />}
    >
      {claim?.status === "rejected" && (
        <Alert className={`${ERROR} mb-4`}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Your previous claim for {claim.player_name} wasn't approved
            {claim.rejection_reason ? `: ${claim.rejection_reason}` : "."} You can try again with a new code.
          </AlertDescription>
        </Alert>
      )}
      {loadError && (
        <Alert className={`${ERROR} mb-4`}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="claim-code" className={LABEL}>
            Claim code
          </label>
          <input
            id="claim-code"
            className={`${INPUT} mt-1.5 w-full font-mono uppercase tracking-[0.12em]`}
            placeholder="XXXX-XXXX-XX"
            value={code}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            required
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            data-testid="input-claim-code"
          />
        </div>
        <div>
          <label htmlFor="claim-dob" className={LABEL}>
            Your date of birth
          </label>
          <input
            id="claim-dob"
            type="date"
            className={`${INPUT} mt-1.5 w-full`}
            value={dob}
            min="1920-01-01"
            max={maxDobInputValue()}
            required
            onChange={(e) => setDob(e.target.value)}
            data-testid="input-claim-dob"
          />
          <p className="mt-1.5 text-[12px] text-[color:var(--ch-muted)]">
            Used to verify your age. Players under 18 keep a limited public profile; your date of birth is never shown
            publicly unless you're verified as 18 or over.
          </p>
        </div>

        {error && (
          <Alert className={ERROR}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <button type="submit" className={SUBMIT} disabled={submitting || !code || !dob} data-testid="button-submit-claim">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit claim"}
        </button>
      </form>
    </AuthShell>
  );
}
