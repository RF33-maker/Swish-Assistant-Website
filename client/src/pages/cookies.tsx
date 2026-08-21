import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

export default function CookiePolicyPage() {
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
            data-testid="button-back-to-home"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>

        {/* Cookie Policy Content */}
        <div className="bg-white rounded-xl shadow-md border border-orange-100 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Cookie Policy</h1>
          <p className="text-sm text-gray-500 mb-2">Last updated: August 2026</p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-8">
            ⚠️ This policy is a working draft pending legal review before launch.
          </p>

          <div className="prose prose-slate max-w-none">

            <p className="text-gray-700 leading-relaxed mb-6">
              This Cookie Policy explains what cookies and similar technologies Swish Assistant uses, why,
              and how you can manage your preferences. It applies alongside our{" "}
              <a href="/privacy" className="text-orange-600 hover:text-orange-700 underline">Privacy Policy</a>.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. What Are Cookies?</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              Cookies are small text files stored on your device when you visit a website. They allow the
              site to recognise your device, maintain your session, and remember your preferences.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. Cookies We Use</h2>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm text-gray-700 border-collapse">
                <thead>
                  <tr className="bg-orange-50">
                    <th className="text-left p-3 border border-orange-100 font-semibold">Category</th>
                    <th className="text-left p-3 border border-orange-100 font-semibold">Purpose</th>
                    <th className="text-left p-3 border border-orange-100 font-semibold">Consent required?</th>
                    <th className="text-left p-3 border border-orange-100 font-semibold">Set by</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 border border-orange-100 font-medium">Strictly Necessary</td>
                    <td className="p-3 border border-orange-100">
                      Authentication session tokens, security headers, CSRF protection.
                      The site cannot function without these.
                    </td>
                    <td className="p-3 border border-orange-100 text-green-700 font-medium">No</td>
                    <td className="p-3 border border-orange-100">Supabase, our server</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-3 border border-orange-100 font-medium">Functional</td>
                    <td className="p-3 border border-orange-100">
                      Remembers your cookie preference choice so the banner is not
                      shown on every visit (stored in localStorage, not a cookie).
                    </td>
                    <td className="p-3 border border-orange-100 text-green-700 font-medium">No</td>
                    <td className="p-3 border border-orange-100">Our site (localStorage)</td>
                  </tr>
                  <tr>
                    <td className="p-3 border border-orange-100 font-medium">Analytics</td>
                    <td className="p-3 border border-orange-100">
                      Aggregated page-view data to understand which features are used.
                      We use Vercel Analytics (privacy-friendly, IP-anonymised).
                    </td>
                    <td className="p-3 border border-orange-100 text-amber-700 font-medium">Yes</td>
                    <td className="p-3 border border-orange-100">Vercel Analytics</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-gray-600 text-sm mb-6">
              We currently do <strong>not</strong> use advertising, retargeting, or social-media tracking
              cookies. If this changes, this policy will be updated and consent re-requested.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. Your Choices</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              When you first visit the site you will see a consent banner. You can choose:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
              <li>
                <strong>Accept all</strong> — strictly necessary and analytics cookies are active.
              </li>
              <li>
                <strong>Essential only</strong> — only strictly necessary cookies are active; analytics
                cookies are blocked.
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-6">
              You can change your preference at any time by clearing the site data in your browser
              settings (which resets the banner) or by contacting us. You can also manage or block
              cookies directly in your browser's privacy settings — note that blocking strictly necessary
              cookies will prevent you from signing in.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. Retention</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              Strictly necessary session cookies expire when you close your browser or sign out.
              Analytics identifiers are retained for up to 12 months.
              Your consent preference (localStorage) persists until you clear site data.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              We will update this policy if we add or change cookie use. Material changes will be
              accompanied by a new consent request.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. Contact</h2>
            <p className="text-gray-700 leading-relaxed">
              📧{" "}
              <a
                href="mailto:automatedathleteswa@gmail.com"
                className="text-orange-600 hover:text-orange-700 underline"
                data-testid="link-contact-email"
              >
                automatedathleteswa@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
