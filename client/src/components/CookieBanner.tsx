/**
 * CookieBanner
 *
 * A PECR/UK GDPR-aligned consent banner. It distinguishes:
 *   - Strictly necessary cookies (always active, no consent required)
 *   - Analytics / functional cookies (optional, opt-in)
 *
 * Consent choice is persisted in localStorage so the banner does not
 * reappear on subsequent visits. After a choice is made the component
 * dispatches a "cookieConsentChanged" CustomEvent so that other components
 * (e.g. the Analytics loader) can react immediately without a page reload.
 *
 * Note: the site must honour the stored choice when actually loading
 * analytics scripts. See useAnalyticsConsent() for the hook to use in App.tsx.
 * The legal review checklist in docs/LAUNCH_CHECKLIST.md covers verification.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

const STORAGE_KEY = "cookie_consent_v1";

type ConsentChoice = "all" | "essential" | null;

function getStoredChoice(): ConsentChoice {
  try {
    return (localStorage.getItem(STORAGE_KEY) as ConsentChoice) ?? null;
  } catch {
    return null;
  }
}

function storeChoice(choice: "all" | "essential"): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
    // Notify same-tab listeners (e.g. useAnalyticsConsent hook).
    window.dispatchEvent(new CustomEvent("cookieConsentChanged"));
  } catch {
    // localStorage unavailable — banner will reappear on next load.
  }
}

/**
 * Returns the current analytics consent (true = user accepted analytics).
 * Call this before loading any non-essential tracking scripts.
 * For reactive use inside React components, prefer useAnalyticsConsent().
 */
export function hasAnalyticsConsent(): boolean {
  return getStoredChoice() === "all";
}

export function CookieBanner() {
  const [choice, setChoice] = useState<ConsentChoice | undefined>(undefined);

  useEffect(() => {
    setChoice(getStoredChoice());
  }, []);

  // Don't render until we've read localStorage (avoids SSR flicker).
  if (choice === undefined) return null;
  // Banner already dismissed.
  if (choice !== null) return null;

  const accept = (c: "all" | "essential") => {
    storeChoice(c);
    setChoice(c);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg px-4 py-4 md:px-8 md:py-5"
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="false"
    >
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 text-sm text-gray-700">
          <p>
            <strong>We use cookies</strong> to keep you signed in and to
            understand how the site is used. Strictly necessary cookies are
            always active. With your permission, we also use analytics cookies
            to improve the experience.{" "}
            <Link href="/cookies" className="text-orange-600 hover:underline">
              Cookie Policy
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => accept("essential")}
            className="border-gray-300 text-gray-600 hover:bg-gray-50"
            data-testid="cookie-essential-only"
          >
            Essential only
          </Button>
          <Button
            size="sm"
            onClick={() => accept("all")}
            className="bg-orange-500 hover:bg-orange-600 text-white"
            data-testid="cookie-accept-all"
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
