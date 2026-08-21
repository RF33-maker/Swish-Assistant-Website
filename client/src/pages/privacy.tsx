import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

export default function PrivacyPolicyPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white py-12">
      <div className="max-w-4xl mx-auto px-6">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={SwishLogo} alt="Swish Logo" className="h-12" />
            <span className="font-bold text-2xl text-orange-600">Swish Assistant</span>
          </div>
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>

        {/* Privacy Policy Content */}
        <div className="bg-white rounded-xl shadow-md border border-orange-100 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-2">Last updated: August 2026</p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-8">
            ⚠️ This policy is a working draft. Final wording, lawful bases, and retention periods
            require review and approval by a qualified legal/privacy adviser before public launch.
          </p>

          <div className="prose prose-slate max-w-none">

            <p className="text-gray-700 leading-relaxed mb-6">
              Swish Assistant ("we", "our", "us") is operated by Automated Athlete, a UK-based company. We are
              committed to protecting your personal data in line with the UK General Data Protection Regulation
              (UK GDPR), the Data Protection Act 2018, and the Privacy and Electronic Communications
              Regulations (PECR). This policy explains what data we collect, why, how long we keep it, and
              the rights you can exercise at any time.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. Who We Are</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              Automated Athlete is the data controller for personal data collected through Swish Assistant.
              Contact us at{" "}
              <a href="mailto:automatedathleteswa@gmail.com" className="text-orange-600 hover:text-orange-700 underline">
                automatedathleteswa@gmail.com
              </a>{" "}
              for any privacy-related enquiry.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. Data We Collect and Why</h2>

            <h3 className="text-lg font-semibold text-slate-800 mt-6 mb-3">2a. Account registration</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              When you create an account we collect:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Email address</strong> — to identify your account, send verification and security emails, and, if you consent, occasional product updates.</li>
              <li><strong>Password</strong> — stored as a salted hash; we never see the plaintext.</li>
              <li><strong>Display name</strong> (optional) — shown in your account area.</li>
              <li><strong>Consent records</strong> — a timestamped log of your acceptance of these Terms and Privacy Policy, and your marketing consent choice. This record is retained for legal compliance and cannot be deleted on request (see §6).</li>
            </ul>

            <h3 className="text-lg font-semibold text-slate-800 mt-6 mb-3">2b. Usage data</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Pages visited, features used, and general analytics (subject to your cookie preference).</li>
              <li>Device type and browser via cookies and similar technologies.</li>
            </ul>

            <h3 className="text-lg font-semibold text-slate-800 mt-6 mb-3">2c. Uploaded content</h3>
            <p className="text-gray-700 leading-relaxed mb-6">
              If you upload game-data files or PDFs, those files and any extracted data are processed to
              provide the service. Files are stored in Supabase-managed object storage.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. Lawful Basis for Processing</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We rely on the following lawful bases (final bases subject to legal review):
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Contract</strong> — processing your account and providing the service you signed up for.</li>
              <li><strong>Legal obligation</strong> — retaining consent audit records and responding to regulatory requests.</li>
              <li><strong>Legitimate interests</strong> — security monitoring, fraud prevention, and platform improvement.</li>
              <li><strong>Consent</strong> — optional marketing emails and non-essential analytics cookies. You can withdraw consent at any time.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. Marketing Communications</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              We send marketing emails only if you explicitly opted in during registration or later in your
              account settings. You can withdraw that consent at any time by unchecking the option in
              Account → Profile, or by replying to any email with "unsubscribe". Withdrawal does not affect
              service-essential emails (verification, security alerts, deletion confirmations).
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. Cookies and Tracking</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use strictly necessary cookies for authentication and session management. With your
              consent (captured via the cookie banner) we also use analytics cookies to understand
              usage patterns. See our{" "}
              <a href="/cookies" className="text-orange-600 hover:text-orange-700 underline">Cookie Policy</a>{" "}
              for full details and how to manage preferences.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. Data Retention</h2>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm text-gray-700 border-collapse">
                <thead>
                  <tr className="bg-orange-50">
                    <th className="text-left p-3 border border-orange-100 font-semibold">Data category</th>
                    <th className="text-left p-3 border border-orange-100 font-semibold">Retention period</th>
                    <th className="text-left p-3 border border-orange-100 font-semibold">Basis for retention</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 border border-orange-100">Account profile &amp; email</td>
                    <td className="p-3 border border-orange-100">Until deletion request is processed (30-day schedule)</td>
                    <td className="p-3 border border-orange-100">Contract</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-3 border border-orange-100">Consent audit log</td>
                    <td className="p-3 border border-orange-100">7 years (subject to legal review)</td>
                    <td className="p-3 border border-orange-100">Legal obligation / legitimate interests</td>
                  </tr>
                  <tr>
                    <td className="p-3 border border-orange-100">Uploaded game-data files</td>
                    <td className="p-3 border border-orange-100">Until account deletion; or 90 days after last access if account is inactive</td>
                    <td className="p-3 border border-orange-100">Contract</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-3 border border-orange-100">Security / abuse logs</td>
                    <td className="p-3 border border-orange-100">90 days rolling (subject to legal review)</td>
                    <td className="p-3 border border-orange-100">Legitimate interests</td>
                  </tr>
                  <tr>
                    <td className="p-3 border border-orange-100">Analytics cookies</td>
                    <td className="p-3 border border-orange-100">Per cookie policy (typically 12 months)</td>
                    <td className="p-3 border border-orange-100">Consent</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              <em>All retention periods are working estimates pending legal review before launch.</em>
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">7. Account Deletion</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can request account deletion from Account → Your data rights. On request:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Your account access is revoked immediately (you are signed out on all devices).</li>
              <li>A deletion record is created and your personal data (profile, email, uploaded files) is deleted by our operations team within 30 days. To request earlier deletion, email us.</li>
              <li>Consent audit records, security logs, and any data required by law are retained for the periods shown above and then deleted or anonymised by our team.</li>
              <li>Public basketball statistics are not personal data owned by your account and are not affected by a deletion request.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">8. Data Export (Portability)</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              You can request a copy of the personal data we hold about you from Account → Your data rights.
              Requests are reviewed and fulfilled manually by our team. We aim to compile and deliver your data
              by email within 72 hours of receiving the request. If you do not hear from us within 72 hours,
              please contact us at{" "}
              <a href="mailto:automatedathleteswa@gmail.com" className="text-orange-600 hover:text-orange-700 underline">
                automatedathleteswa@gmail.com
              </a>.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">9. Data Sharing and Transfers</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We do not sell your data. We share data only with:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Supabase</strong> — authentication and database hosting (data stored in EU region).</li>
              <li><strong>OpenAI</strong> — AI-generated summaries (data processed per OpenAI's API data policy).</li>
              <li><strong>Vercel Analytics</strong> — aggregated page-view analytics (if you accepted analytics cookies).</li>
              <li>Regulatory authorities, if required by law.</li>
            </ul>
            <p className="text-gray-600 text-sm mb-6">
              <em>International transfer safeguards (UK adequacy decisions, SCCs) to be confirmed by legal review.</em>
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">10. Your Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-4">Under UK GDPR you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
              <li><strong>Access</strong> — request a copy of your data (use the export feature or email us).</li>
              <li><strong>Rectification</strong> — correct inaccurate data in your account settings.</li>
              <li><strong>Erasure</strong> — request deletion of your account and personal data.</li>
              <li><strong>Portability</strong> — receive your data in a machine-readable format.</li>
              <li><strong>Restriction</strong> — ask us to pause processing while a dispute is resolved.</li>
              <li><strong>Object</strong> — object to processing based on legitimate interests.</li>
              <li><strong>Withdraw consent</strong> — withdraw marketing or analytics consent at any time.</li>
              <li><strong>Complain</strong> — lodge a complaint with the Information Commissioner's Office (ICO) at{" "}
                <a href="https://ico.org.uk" className="text-orange-600 hover:text-orange-700 underline" rel="noopener noreferrer">ico.org.uk</a>.
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-6">
              To exercise any right, contact:{" "}
              <a href="mailto:automatedathleteswa@gmail.com" className="text-orange-600 hover:text-orange-700 underline">
                automatedathleteswa@gmail.com
              </a>. We will respond within one calendar month.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">11. Security</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              Passwords are stored as bcrypt hashes. Data in transit is encrypted via TLS. Access to
              production data requires service-role authentication. No system can be 100% secure; you use
              the service at your own risk and should use a unique, strong password.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">12. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              We will notify registered members of material changes by email at least 14 days before they
              take effect. The "last updated" date at the top of this page reflects the most recent revision.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">13. Contact</h2>
            <p className="text-gray-700 leading-relaxed">
              📧{" "}
              <a href="mailto:automatedathleteswa@gmail.com" className="text-orange-600 hover:text-orange-700 underline">
                automatedathleteswa@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
