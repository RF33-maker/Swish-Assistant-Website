
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Mail, Calendar } from "lucide-react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

export default function ContactSalesPage() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: ""
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/contact-sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSubmitted(true);
      }
    } catch (error) {
      console.error('Contact form error:', error);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex items-center justify-center py-12">
        <div className="bg-white shadow-2xl rounded-2xl border-2 border-green-200 max-w-md p-8 text-center">
          <div className="text-green-500 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
          <p className="text-gray-600 mb-6">
            We've received your message and will get back to you within 24 hours.
          </p>
          <Button 
            onClick={() => setLocation('/')} 
            className="bg-gradient-to-r from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white font-semibold shadow-md hover:shadow-lg transition-all"
          >
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white py-16">
      <div className="max-w-2xl mx-auto px-6">
        
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

        <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow border border-orange-100">
          <div className="text-center bg-gradient-to-r from-orange-500 to-amber-400 text-white rounded-t-xl py-6 px-8">
            <h1 className="text-2xl font-bold mb-2">Contact Our Support Team</h1>
            <p className="text-orange-50">
              Let's see how Swish Assistant can help you
            </p>
          </div>
          
          <div className="p-8">
            
            {/* Contact Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="text-center p-4 bg-slate-50 rounded-xl border border-orange-100">
                <Mail className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                <p className="font-semibold text-gray-900">Email</p>
                <a href="mailto:automatedathleteswa@gmail.com" className="text-sm text-orange-600 hover:text-orange-700 break-all">
                  automatedathleteswa@gmail.com
                </a>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-xl border border-orange-100">
                <Calendar className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                <p className="font-semibold text-gray-900">Demo</p>
                <a href="#demo" className="text-sm text-orange-600 hover:text-orange-700">
                  Book a Live Demo
                </a>
              </div>
            </div>

            {/* Contact Form */}
            <form onSubmit={handleSubmit} className="space-y-6 max-w-lg mx-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name *
                </label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Your name"
                  className="rounded-xl bg-slate-50 border-orange-200 focus:ring-2 focus:ring-orange-500 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <Input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="your@email.com"
                  className="rounded-xl bg-slate-50 border-orange-200 focus:ring-2 focus:ring-orange-500 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message *
                </label>
                <Textarea
                  required
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                  placeholder="Tell us how we can help you..."
                  rows={5}
                  className="rounded-xl bg-slate-50 border-orange-200 focus:ring-2 focus:ring-orange-500 text-slate-900"
                />
              </div>

              <Button 
                type="submit"
                className="w-full bg-gradient-to-r from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white py-3 text-lg font-semibold rounded-xl shadow-md hover:shadow-lg transition-all"
              >
                Send Message
              </Button>

              <p className="text-sm text-gray-500 mt-3 text-center">
                By submitting this form, you consent to being contacted by Swish Assistant regarding your inquiry. Your information will be handled in accordance with our{' '}
                <a href="/privacy" className="text-orange-600 hover:text-orange-700 underline">
                  Privacy Policy
                </a>
                .
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
