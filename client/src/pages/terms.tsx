import LegalPageShell from "@/components/layout/LegalPageShell";

export default function TermsOfServicePage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      path="/terms"
      updated="Last updated: August 2026 (version 1)"
      draftNote={"These terms are a working draft. Final wording requires review and approval by a qualified legal adviser before public launch."}
    >
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-6">
        Welcome to Swish Assistant, a service operated by Automated Athlete ("we", "our", "us").
        By creating an account or using our website or service, you agree to these Terms of Service.
        If you do not agree, you must not use our service.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">1. Acceptance of Terms</h2>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-6">
        By creating an account you confirm that you have read, understood, and accepted these Terms
        and our{" "}
        <a href="/privacy" className="font-medium text-[color:var(--ch-accent)] underline underline-offset-2 hover:opacity-80">Privacy Policy</a>.
        Your acceptance is recorded with a timestamp at the point of registration. We store this
        record for our legal compliance; it cannot be deleted on request.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">2. Eligibility</h2>
      <ul className="list-disc pl-6 space-y-2 text-[color:var(--ch-text-2)] mb-6 marker:text-[color:var(--ch-muted)]">
        <li>You must be at least 18 years old (or the age of digital consent in your jurisdiction, whichever is higher) to create an account.</li>
        <li>You must provide a real, working email address. Accounts created with disposable or false email addresses may be suspended.</li>
        <li>One person may hold one account. Sharing accounts is not permitted.</li>
      </ul>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">3. Account Security and Verification</h2>
      <ul className="list-disc pl-6 space-y-2 text-[color:var(--ch-text-2)] mb-6 marker:text-[color:var(--ch-muted)]">
        <li>You must verify your email address before accessing member-only features.</li>
        <li>You are responsible for keeping your credentials confidential. Notify us immediately at{" "}
          <a href="mailto:automatedathleteswa@gmail.com" className="font-medium text-[color:var(--ch-accent)] underline underline-offset-2 hover:opacity-80">
            automatedathleteswa@gmail.com
          </a>{" "}
          if you suspect unauthorised access.
        </li>
        <li>We may suspend accounts that show signs of compromise, abuse, or policy violation.</li>
      </ul>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">4. Services Provided</h2>
      <ul className="list-disc pl-6 space-y-2 text-[color:var(--ch-text-2)] mb-6 marker:text-[color:var(--ch-muted)]">
        <li>Swish Assistant provides tools for uploading, viewing, and analysing basketball data, including AI-powered summaries and insights.</li>
        <li>We may update or modify these services at any time to improve functionality or performance.</li>
        <li>Some features may be in beta and subject to change. Beta features are provided without warranty of fitness for purpose.</li>
      </ul>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">5. Acceptable Use</h2>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-4">You agree not to:</p>
      <ul className="list-disc pl-6 space-y-2 text-[color:var(--ch-text-2)] mb-6 marker:text-[color:var(--ch-muted)]">
        <li>Use the service for unlawful, fraudulent, or abusive activity.</li>
        <li>Interfere with or disrupt the operation of the platform.</li>
        <li>Upload malicious content, malware, or material that infringes third-party rights.</li>
        <li>Attempt to access data belonging to other users.</li>
        <li>Scrape, copy, or redistribute the service's AI-generated outputs without permission.</li>
      </ul>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-6">
        We reserve the right to suspend or terminate access if misuse occurs.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">6. Your Data Rights</h2>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-4">
        As a member you may, at any time from your account:
      </p>
      <ul className="list-disc pl-6 space-y-2 text-[color:var(--ch-text-2)] mb-6 marker:text-[color:var(--ch-muted)]">
        <li>Update your profile and email preferences.</li>
        <li>Request a portable copy of your personal data.</li>
        <li>Request deletion of your account and associated personal data.</li>
      </ul>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-6">
        Public basketball statistics are not personal data owned by your account and are not
        affected by a deletion request. See our Privacy Policy for full details on data handling,
        retention, and your UK GDPR rights.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">7. Intellectual Property</h2>
      <ul className="list-disc pl-6 space-y-2 text-[color:var(--ch-text-2)] mb-6 marker:text-[color:var(--ch-muted)]">
        <li>All platform content, including logos, design, analytics visuals, and AI-generated summaries, is owned by Automated Athlete unless otherwise stated.</li>
        <li>You retain ownership of data you upload. By uploading you grant us a licence to process it to provide the service.</li>
        <li>You may not copy, reproduce, or redistribute any part of the service without written permission.</li>
      </ul>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">8. Disclaimer and Liability</h2>
      <ul className="list-disc pl-6 space-y-2 text-[color:var(--ch-text-2)] mb-6 marker:text-[color:var(--ch-muted)]">
        <li>Swish Assistant is provided on an "as-is" and "as-available" basis.</li>
        <li>We make no guarantees regarding accuracy, reliability, or uninterrupted availability.</li>
        <li>AI-generated summaries and insights are for informational purposes only and may contain errors.</li>
        <li>To the fullest extent permitted by law, we are not liable for indirect or consequential damages arising from use of our platform.</li>
      </ul>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">9. Termination</h2>
      <ul className="list-disc pl-6 space-y-2 text-[color:var(--ch-text-2)] mb-6 marker:text-[color:var(--ch-muted)]">
        <li>You may request account deletion at any time from your account settings.</li>
        <li>We may suspend or terminate accounts that breach these Terms, misuse the service, or remain inactive for an extended period.</li>
        <li>On termination, your personal data will be handled per our Privacy Policy.</li>
      </ul>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">10. Changes to These Terms</h2>
      <p className="text-[color:var(--ch-text-2)] leading-relaxed mb-6">
        We will notify registered members of material changes by email at least 14 days before they
        take effect. Continued use after that date constitutes acceptance of the updated Terms.
      </p>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">11. Governing Law</h2>
      <ul className="list-disc pl-6 space-y-2 text-[color:var(--ch-text-2)] mb-6 marker:text-[color:var(--ch-muted)]">
        <li>These Terms are governed by the laws of England and Wales.</li>
        <li>Any disputes will be subject to the exclusive jurisdiction of the courts of England and Wales.</li>
      </ul>

      <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] md:text-[1.55rem] text-[color:var(--ch-text)] mt-10 mb-3">12. Contact</h2>
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
