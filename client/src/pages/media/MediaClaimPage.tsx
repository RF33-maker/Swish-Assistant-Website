import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BadgeCheck, Camera, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthShell, { ERROR, LINK, SUBMIT } from "@/components/layout/AuthShell";
import { useAuth } from "@/hooks/use-auth";
import { MEDIA_QUERY_KEY, mediaApi } from "@/lib/mediaSpotlight";

type Preview =
  | { ok: true; photographer: { slug: string; display_name: string; handle: string | null } }
  | { ok: false; reason: "invalid" | "expired" | "used" | "claimed" };

const REASONS: Record<Exclude<Preview, { ok: true }>["reason"], string> = {
  invalid: "This invite link isn't valid. Check it was copied in full, or ask us for a new one.",
  expired: "This invite link has expired. Ask us for a new one and we'll send it straight over.",
  used: "This invite link has already been used.",
  claimed: "This profile has already been claimed.",
};

/**
 * /media/claim/:token — the link an admin sends a photographer. Sign in (or
 * register), then one tap links the profile to the account.
 */
export default function MediaClaimPage({ params }: { params: { token: string } }) {
  const { user, emailConfirmed, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const here = `/media/claim/${params.token}`;

  useEffect(() => {
    mediaApi<Preview>(`/api/media/invites/${params.token}`)
      .then(setPreview)
      .catch(() => setPreview({ ok: false, reason: "invalid" }));
  }, [params.token]);

  const claim = async () => {
    setClaiming(true);
    setError("");
    try {
      await mediaApi<{ ok: true; slug: string }>(`/api/media/invites/${params.token}/claim`, { method: "POST", body: {} });
      await queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
      setLocation("/media/dashboard?welcome=1");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setClaiming(false);
    }
  };

  if (isLoading || !preview) {
    return (
      <AuthShell title="Claim your profile">
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>
      </AuthShell>
    );
  }

  if (!preview.ok) {
    return (
      <AuthShell title="Claim your profile" icon={<AlertCircle className="h-10 w-10 text-[color:var(--ch-muted)]" />}>
        <p className="text-sm text-[color:var(--ch-text-2)]">{REASONS[preview.reason]}</p>
        <Link href="/media" className="ch-btn ch-btn-ghost mt-5 h-10 w-full justify-center">Media Spotlight</Link>
      </AuthShell>
    );
  }

  const name = preview.photographer.display_name;

  if (!user) {
    return (
      <AuthShell
        title="Claim your profile"
        intro={`You've been invited to claim ${name}'s photographer profile on Swish Assistant. Sign in or create a free account to continue.`}
        icon={<Camera className="h-10 w-10 text-[color:var(--ch-accent)]" />}
      >
        <div className="space-y-3">
          <Link href={`/auth?next=${encodeURIComponent(here)}`} className={SUBMIT}>Sign in to continue</Link>
          <p className="text-center text-sm text-[color:var(--ch-text-2)]">
            New here? <Link href={`/auth?tab=register&next=${encodeURIComponent(here)}`} className={LINK}>Create an account</Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  if (!emailConfirmed) {
    return (
      <AuthShell title="Confirm your email" intro="Confirm your email address first, then open this link again to claim your profile.">
        <p className="text-sm text-[color:var(--ch-text-2)]">
          We sent a confirmation link to <strong className="text-[color:var(--ch-text)]">{user.email}</strong>.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Claim ${name}`}
      intro="This links the profile to your account. You'll be able to edit it, upload photos, and choose how each one may be used."
      icon={<BadgeCheck className="h-10 w-10 text-[color:var(--ch-accent)]" />}
    >
      {error && (
        <Alert className={`${ERROR} mb-4`}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-[color:var(--ch-text-2)]">
        Signed in as <strong className="text-[color:var(--ch-text)]">{user.email}</strong>.
      </p>
      <button type="button" onClick={claim} disabled={claiming} className={`${SUBMIT} mt-4`} data-testid="media-claim-button">
        {claiming ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Claim this profile
      </button>
    </AuthShell>
  );
}
