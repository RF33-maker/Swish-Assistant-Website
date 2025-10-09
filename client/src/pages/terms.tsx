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
            onClick={() => setLocation('/')}
            className="text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>

        {/* Terms of Service Content */}
        <div className="bg-white rounded-xl shadow-md border border-orange-100 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: October 2025</p>

          <div className="prose prose-slate max-w-none">
            <p className="text-gray-700 leading-relaxed mb-6">
              Welcome to Swish Assistant, a service operated by Automated Athlete ("we", "our", "us"). By using our website or any related service, you agree to these Terms of Service.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              By accessing or using Swish Assistant, you confirm that you accept these terms and agree to comply with them. If you do not agree, you must not use our site or services.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. Services Provided</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Swish Assistant provides tools for uploading, viewing, and analyzing basketball data, including AI-powered summaries and insights.</li>
              <li>We may update or modify these services at any time to improve functionality or performance.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. Use of the Platform</h2>
            <p className="text-gray-700 leading-relaxed mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
              <li>Use the site for unlawful or fraudulent activity.</li>
              <li>Interfere with or disrupt the operation of the platform.</li>
              <li>Upload harmful or malicious content.</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-6">
              We reserve the right to suspend or terminate access if misuse occurs.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. Intellectual Property</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>All platform content, including logos, design, analytics visuals, and AI-generated summaries, are owned by Automated Athlete unless otherwise stated.</li>
              <li>You may not copy, reproduce, or distribute any part of the service without written permission.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. Disclaimer and Liability</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Swish Assistant is provided on an "as-is" and "as-available" basis.</li>
              <li>We make no guarantees regarding accuracy, reliability, or uninterrupted availability.</li>
              <li>To the fullest extent permitted by law, we are not liable for indirect or consequential damages arising from use of our platform.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. Beta Access</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Some features may be in beta and subject to change.</li>
              <li>By using beta features, you acknowledge that functionality may be limited or experimental.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">7. Termination</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>We may suspend or disable accounts that breach these terms or misuse the service.</li>
              <li>You may stop using Swish Assistant at any time.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">8. Governing Law</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>These terms are governed by the laws of England and Wales.</li>
              <li>Any disputes will be handled exclusively in the courts of England and Wales.</li>
            </ul>

            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">9. Contact</h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              For any questions about these terms, please email:
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
