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
            onClick={() => setLocation('/')}
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
          <p className="text-sm text-gray-500 mb-8">Last updated: October 2025</p>

          <div className="prose prose-slate max-w-none">
            <p className="text-gray-700 leading-relaxed mb-6">
              Swish Assistant uses cookies to improve your browsing experience and ensure our site functions properly.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. What Are Cookies?</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              Cookies are small text files stored on your device when you visit our website. They help us remember your preferences, improve functionality, and analyze traffic.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. Types of Cookies We Use</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Essential Cookies</strong> – Required for the site to function (e.g., authentication, security).</li>
              <li><strong>Performance Cookies</strong> – Help us understand how visitors use our website (e.g., analytics).</li>
              <li><strong>Functional Cookies</strong> – Store preferences like language or theme.</li>
              <li><strong>Third-Party Cookies</strong> – Used by trusted tools (e.g., Supabase, Google Analytics, or social embeds).</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. Managing Cookies</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>You can manage or disable cookies in your browser settings.</li>
              <li>Be aware that disabling essential cookies may affect site functionality.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. Consent</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>By using our website, you consent to the use of cookies in accordance with this policy.</li>
              <li>On your first visit, you'll see a cookie consent banner allowing you to accept or adjust preferences.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. Updates</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              We may update this Cookie Policy periodically. The latest version will always be available on our website.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. Contact</h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              If you have questions about our use of cookies, contact us at:
            </p>
            <p className="text-gray-700 leading-relaxed">
              📧 <a href="mailto:automatedathleteswa@gmail.com" className="text-orange-600 hover:text-orange-700 underline" data-testid="link-contact-email">automatedathleteswa@gmail.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
