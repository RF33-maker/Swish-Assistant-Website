
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Mail, Phone, Calendar } from "lucide-react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

export default function ContactSalesPage() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    organization: "",
    message: "",
    numberOfTeams: ""
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Here you would send the form data to your backend
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
        <Card className="bg-white shadow-xl border-2 border-green-200 max-w-md">
          <CardContent className="p-8 text-center">
            <div className="text-green-500 text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
            <p className="text-gray-600 mb-6">
              We've received your inquiry and will contact you within 24 hours to discuss your league's needs.
            </p>
            <Button onClick={() => setLocation('/')} className="bg-orange-500 hover:bg-orange-600">
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white py-12">
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
            Back to Plans
          </Button>
        </div>

        <Card className="bg-white shadow-xl border-2 border-orange-200">
          <CardHeader className="text-center bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-lg">
            <CardTitle className="text-2xl">Contact Our Sales Team</CardTitle>
            <CardDescription className="text-orange-100">
              Let's discuss how Swish Assistant can transform your entire league
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-8">
            
            {/* Contact Options */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <Mail className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                <p className="font-semibold text-gray-900">Email</p>
                <p className="text-sm text-gray-600">sales@swishassistant.com</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <Phone className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                <p className="font-semibold text-gray-900">Phone</p>
                <p className="text-sm text-gray-600">+44 20 1234 5678</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <Calendar className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                <p className="font-semibold text-gray-900">Demo</p>
                <p className="text-sm text-gray-600">Book a live demo</p>
              </div>
            </div>

            {/* Contact Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <Input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="your@email.com"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization *
                  </label>
                  <Input
                    required
                    value={formData.organization}
                    onChange={(e) => setFormData({...formData, organization: e.target.value})}
                    placeholder="League or organization name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Teams
                  </label>
                  <Input
                    value={formData.numberOfTeams}
                    onChange={(e) => setFormData({...formData, numberOfTeams: e.target.value})}
                    placeholder="How many teams?"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message
                </label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                  placeholder="Tell us about your league's needs..."
                  rows={4}
                />
              </div>

              <Button 
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 text-lg font-semibold"
              >
                Send Message
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
