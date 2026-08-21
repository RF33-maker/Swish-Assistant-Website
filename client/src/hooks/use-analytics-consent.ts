/**
 * useAnalyticsConsent
 *
 * Returns true only when the user has explicitly accepted analytics cookies
 * via the cookie banner (localStorage key "cookie_consent_v1" === "all").
 *
 * Re-evaluates whenever localStorage is updated by the CookieBanner component
 * (which dispatches a "cookieConsentChanged" CustomEvent on window after every
 * choice so that components in the same tab are notified immediately).
 */
import { useEffect, useState } from "react";

const STORAGE_KEY = "cookie_consent_v1";

function readConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "all";
  } catch {
    return false;
  }
}

export function useAnalyticsConsent(): boolean {
  const [hasConsent, setHasConsent] = useState<boolean>(readConsent);

  useEffect(() => {
    const handler = () => setHasConsent(readConsent());
    window.addEventListener("cookieConsentChanged", handler);
    // Also handle cross-tab storage events.
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("cookieConsentChanged", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return hasConsent;
}
