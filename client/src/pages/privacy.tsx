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
            onClick={() => setLocation('/')}
            className="text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>

        {/* Privacy Policy Content */}
        <div className="bg-white rounded-xl shadow-md border border-orange-100 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: October 2025</p>

          <div className="prose prose-slate max-w-none">
            <p className="text-gray-700 leading-relaxed mb-6">
              Swish Assistant ("we", "our", "us") is operated by Automated Athlete, a UK-based company dedicated to providing sports analytics and AI-powered tools for leagues, coaches, and players.
            </p>
            <p className="text-gray-700 leading-relaxed mb-8">
              We respect your privacy and are committed to protecting your personal data. This policy explains how we collect, use, and protect your information when you use our website or services.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. Information We Collect</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may collect and process the following types of information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Personal Information</strong> – such as your name, email address, and message details when you contact us or fill out a form.</li>
              <li><strong>Account Data</strong> – if you register or log in, we may store authentication and profile details.</li>
              <li><strong>Usage Data</strong> – including pages visited, actions taken, and general analytics data.</li>
              <li><strong>Cookies and Tracking</strong> – for performance monitoring and improving user experience.</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-6">
              We do not sell or share your data with third parties for marketing purposes.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. How We Use Your Information</h2>
            <p className="text-gray-700 leading-relaxed mb-4">We use your data to:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Respond to inquiries or support requests.</li>
              <li>Provide, improve, and personalize our services.</li>
              <li>Communicate updates about your account or features (only where consented).</li>
              <li>Monitor usage and maintain system security.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. Legal Basis for Processing</h2>
            <p className="text-gray-700 leading-relaxed mb-4">We process personal data under:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Consent</strong> – when you submit a form or opt in to communications.</li>
              <li><strong>Legitimate Interest</strong> – for analytics, security, and platform improvements.</li>
              <li><strong>Contract</strong> – when you use our paid or beta services.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. Data Retention</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              We retain your data only as long as necessary to fulfill the purposes above or comply with legal requirements.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. Data Security</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              We use encryption, secure storage, and controlled access to protect your data. However, no online system can be 100% secure, so you share data at your own risk.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. Your Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-4">Under UK GDPR, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
              <li>Access, correct, or delete your personal data.</li>
              <li>Withdraw consent at any time.</li>
              <li>Request a copy of your information.</li>
              <li>Lodge a complaint with the Information Commissioner's Office (ICO) if you believe your rights have been violated.</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-6">
              To exercise these rights, contact us at: <a href="mailto:automatedathleteswa@gmail.com" className="text-orange-600 hover:text-orange-700 underline">automatedathleteswa@gmail.com</a>
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">7. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              We may update this policy periodically. Any changes will be posted on this page with a revised "last updated" date.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">8. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              If you have any questions about this Privacy Policy, please contact:
            </p>
            <p className="text-gray-700 leading-relaxed">
              📧 <a href="mailto:automatedathleteswa@gmail.com" className="text-orange-600 hover:text-orange-700 underline">automatedathleteswa@gmail.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
