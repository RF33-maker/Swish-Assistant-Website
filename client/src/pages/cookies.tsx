import LegalPageShell from "@/components/layout/LegalPageShell";

export default function CookiePolicyPage() {
  return (
    <LegalPageShell
      title="Cookie Policy"
      path="/cookies"
      updated="Last updated: August 2026"
      draftNote={"This policy is a working draft pending legal review before launch."}
    >
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-6">
        This Cookie Policy explains what cookies and similar technologies Swish Assistant uses, why,
        and how you can manage your preferences. It applies alongside our{" "}
        <a href="/privacy" className="font-medium text-[color:var(--ch-accent)] underline underline-offset-2 hover:opacity-80">Privacy Policy</a>.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">1. What Are Cookies?</h2>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-6">
        Cookies are small text files stored on your device when you visit a website. They allow the
        site to recognise your device, maintain your session, and remember your preferences.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">2. Cookies We Use</h2>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm text-[color:var(--ch-text-2)] border-collapse">
          <thead>
            <tr className="bg-[color:var(--ch-surface-2)]">
              <th className="text-left p-3 border border-[color:var(--ch-border)] font-semibold text-[color:var(--ch-text)]">Category</th>
              <th className="text-left p-3 border border-[color:var(--ch-border)] font-semibold text-[color:var(--ch-text)]">Purpose</th>
              <th className="text-left p-3 border border-[color:var(--ch-border)] font-semibold text-[color:var(--ch-text)]">Consent required?</th>
              <th className="text-left p-3 border border-[color:var(--ch-border)] font-semibold text-[color:var(--ch-text)]">Set by</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-3 border border-[color:var(--ch-border)] font-medium text-[color:var(--ch-text)]">Strictly Necessary</td>
              <td className="p-3 border border-[color:var(--ch-border)]">
                Authentication session tokens, security headers, CSRF protection.
                The site cannot function without these.
              </td>
              <td className="p-3 border border-[color:var(--ch-border)] text-emerald-600 dark:text-emerald-400 font-medium">No</td>
              <td className="p-3 border border-[color:var(--ch-border)]">Supabase, our server</td>
            </tr>
            <tr className="bg-[color:var(--ch-surface-2)]">
              <td className="p-3 border border-[color:var(--ch-border)] font-medium text-[color:var(--ch-text)]">Functional</td>
              <td className="p-3 border border-[color:var(--ch-border)]">
                Remembers your cookie preference choice so the banner is not
                shown on every visit (stored in localStorage, not a cookie).
              </td>
              <td className="p-3 border border-[color:var(--ch-border)] text-emerald-600 dark:text-emerald-400 font-medium">No</td>
              <td className="p-3 border border-[color:var(--ch-border)]">Our site (localStorage)</td>
            </tr>
            <tr>
              <td className="p-3 border border-[color:var(--ch-border)] font-medium text-[color:var(--ch-text)]">Analytics</td>
              <td className="p-3 border border-[color:var(--ch-border)]">
                Aggregated page-view data to understand which features are used.
                We use Vercel Analytics (privacy-friendly, IP-anonymised).
              </td>
              <td className="p-3 border border-[color:var(--ch-border)] text-amber-600 dark:text-amber-400 font-medium">Yes</td>
              <td className="p-3 border border-[color:var(--ch-border)]">Vercel Analytics</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[color:var(--ch-text-2)] text-sm mb-6">
        We currently do <strong>not</strong> use advertising, retargeting, or social-media tracking
        cookies. If this changes, this policy will be updated and consent re-requested.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">3. Your Choices</h2>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-4">
        When you first visit the site you will see a consent banner. You can choose:
      </p>
      <ul className="list-disc pl-6 space-y-2 text-[color:var(--ch-text-2)] mb-4 marker:text-[color:var(--ch-muted)]">
        <li>
          <strong>Accept all</strong> — strictly necessary and analytics cookies are active.
        </li>
        <li>
          <strong>Essential only</strong> — only strictly necessary cookies are active; analytics
          cookies are blocked.
        </li>
      </ul>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-6">
        You can change your preference at any time by clearing the site data in your browser
        settings (which resets the banner) or by contacting us. You can also manage or block
        cookies directly in your browser's privacy settings — note that blocking strictly necessary
        cookies will prevent you from signing in.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">4. Retention</h2>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-6">
        Strictly necessary session cookies expire when you close your browser or sign out.
        Analytics identifiers are retained for up to 12 months.
        Your consent preference (localStorage) persists until you clear site data.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">5. Changes to This Policy</h2>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-6">
        We will update this policy if we add or change cookie use. Material changes will be
        accompanied by a new consent request.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">6. Contact</h2>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed">
        📧{" "}
        <a
          href="mailto:automatedathleteswa@gmail.com"
          className="font-medium text-[color:var(--ch-accent)] underline underline-offset-2 hover:opacity-80"
          data-testid="link-contact-email"
        >
          automatedathleteswa@gmail.com
        </a>
      </p>
    </LegalPageShell>
  );
}
