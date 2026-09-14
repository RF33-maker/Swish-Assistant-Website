// Single source of truth for password requirements — imported by both the
// client (signup form, change-password form) and the server (registration
// endpoint) via the @shared alias, so the rule can't drift out of sync
// between where it's checked and where it's enforced.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p: string) => p.length >= PASSWORD_MIN_LENGTH },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
] as const;

/** Returns null when the password satisfies every requirement, otherwise the first unmet requirement's message. */
export function validatePassword(password: string): string | null {
  for (const { label, test } of PASSWORD_REQUIREMENTS) {
    if (!test(password)) return `Password needs: ${label.toLowerCase()}`;
  }
  return null;
}
