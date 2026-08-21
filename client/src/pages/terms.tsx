import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

export default function TermsOfServicePage() {
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

        {/* Terms of Service Content */}
        <div className="bg-white rounded-xl shadow-md border border-orange-100 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-2">Last updated: August 2026 (version 1)</p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-8">
            ⚠️ These terms are a working draft. Final wording requires review and approval by a qualified
            legal adviser before public launch.
          </p>

          <div className="prose prose-slate max-w-none">

            <p className="text-gray-700 leading-relaxed mb-6">
              Welcome to Swish Assistant, a service operated by Automated Athlete ("we", "our", "us").
              By creating an account or using our website or service, you agree to these Terms of Service.
              If you do not agree, you must not use our service.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              By creating an account you confirm that you have read, understood, and accepted these Terms
              and our{" "}
              <a href="/privacy" className="text-orange-600 hover:text-orange-700 underline">Privacy Policy</a>.
              Your acceptance is recorded with a timestamp at the point of registration. We store this
              record for our legal compliance; it cannot be deleted on request.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. Eligibility</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>You must be at least 18 years old (or the age of digital consent in your jurisdiction, whichever is higher) to create an account.</li>
              <li>You must provide a real, working email address. Accounts created with disposable or false email addresses may be suspended.</li>
              <li>One person may hold one account. Sharing accounts is not permitted.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. Account Security and Verification</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>You must verify your email address before accessing member-only features.</li>
              <li>You are responsible for keeping your credentials confidential. Notify us immediately at{" "}
                <a href="mailto:automatedathleteswa@gmail.com" className="text-orange-600 hover:text-orange-700 underline">
                  automatedathleteswa@gmail.com
                </a>{" "}
                if you suspect unauthorised access.
              </li>
              <li>We may suspend accounts that show signs of compromise, abuse, or policy violation.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. Services Provided</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Swish Assistant provides tools for uploading, viewing, and analysing basketball data, including AI-powered summaries and insights.</li>
              <li>We may update or modify these services at any time to improve functionality or performance.</li>
              <li>Some features may be in beta and subject to change. Beta features are provided without warranty of fitness for purpose.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. Acceptable Use</h2>
            <p className="text-gray-700 leading-relaxed mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Use the service for unlawful, fraudulent, or abusive activity.</li>
              <li>Interfere with or disrupt the operation of the platform.</li>
              <li>Upload malicious content, malware, or material that infringes third-party rights.</li>
              <li>Attempt to access data belonging to other users.</li>
              <li>Scrape, copy, or redistribute the service's AI-generated outputs without permission.</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-6">
              We reserve the right to suspend or terminate access if misuse occurs.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. Your Data Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              As a member you may, at any time from your account:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Update your profile and email preferences.</li>
              <li>Request a portable copy of your personal data.</li>
              <li>Request deletion of your account and associated personal data.</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-6">
              Public basketball statistics are not personal data owned by your account and are not
              affected by a deletion request. See our Privacy Policy for full details on data handling,
              retention, and your UK GDPR rights.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">7. Intellectual Property</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>All platform content, including logos, design, analytics visuals, and AI-generated summaries, is owned by Automated Athlete unless otherwise stated.</li>
              <li>You retain ownership of data you upload. By uploading you grant us a licence to process it to provide the service.</li>
              <li>You may not copy, reproduce, or redistribute any part of the service without written permission.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">8. Disclaimer and Liability</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Swish Assistant is provided on an "as-is" and "as-available" basis.</li>
              <li>We make no guarantees regarding accuracy, reliability, or uninterrupted availability.</li>
              <li>AI-generated summaries and insights are for informational purposes only and may contain errors.</li>
              <li>To the fullest extent permitted by law, we are not liable for indirect or consequential damages arising from use of our platform.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">9. Termination</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>You may request account deletion at any time from your account settings.</li>
              <li>We may suspend or terminate accounts that breach these Terms, misuse the service, or remain inactive for an extended period.</li>
              <li>On termination, your personal data will be handled per our Privacy Policy.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">10. Changes to These Terms</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              We will notify registered members of material changes by email at least 14 days before they
              take effect. Continued use after that date constitutes acceptance of the updated Terms.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">11. Governing Law</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>These Terms are governed by the laws of England and Wales.</li>
              <li>Any disputes will be subject to the exclusive jurisdiction of the courts of England and Wales.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">12. Contact</h2>
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
