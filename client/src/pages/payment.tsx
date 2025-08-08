
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowLeft } from "lucide-react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

interface PlanDetails {
  name: string;
  price: string;
  features: string[];
  stripeProductId?: string;
}

const PLAN_CONFIGS: Record<string, PlanDetails> = {
  individual: {
    name: "Individual",
    price: "£5",
    features: [
      "Public league hosting",
      "Full AI league assistant", 
      "1 scouting report/month",
      "Priority support"
    ],
    stripeProductId: "price_individual_monthly" // Replace with actual Stripe price ID
  },
  "all-access": {
    name: "All Access", 
    price: "£15",
    features: [
      "Multiple league creation",
      "Full AI assistant features",
      "Full league branding",
      "Unlimited scouting reports"
    ],
    stripeProductId: "price_all_access_monthly" // Replace with actual Stripe price ID
  }
};

export default function PaymentPage() {
  const [, setLocation] = useLocation();
  const [planDetails, setPlanDetails] = useState<PlanDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const plan = urlParams.get('plan');
    
    if (plan && PLAN_CONFIGS[plan]) {
      setPlanDetails(PLAN_CONFIGS[plan]);
    } else {
      // Invalid plan, redirect back
      setLocation('/');
    }
  }, [setLocation]);

  const handleStripeCheckout = async () => {
    if (!planDetails?.stripeProductId) return;
    
    setLoading(true);
    
    try {
      // This would integrate with your backend to create Stripe checkout session
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: planDetails.stripeProductId,
          successUrl: `${window.location.origin}/payment-success`,
          cancelUrl: `${window.location.origin}/payment`,
        }),
      });

      const { sessionId } = await response.json();
      
      // Redirect to Stripe Checkout
      // Note: You'll need to load Stripe.js library first
      // const stripe = await loadStripe('your_stripe_publishable_key');
      // stripe.redirectToCheckout({ sessionId });
      
      console.log('Redirect to Stripe checkout with sessionId:', sessionId);
      
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!planDetails) return null;

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

        {/* Payment Card */}
        <Card className="bg-white shadow-xl border-2 border-orange-200">
          <CardHeader className="text-center bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-lg">
            <CardTitle className="text-2xl">Complete Your Purchase</CardTitle>
            <CardDescription className="text-orange-100">
              You're upgrading to the {planDetails.name} plan
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-8">
            
            {/* Plan Summary */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">{planDetails.name} Plan</h3>
                <Badge className="bg-orange-500 text-white text-lg px-3 py-1">
                  {planDetails.price}/month
                </Badge>
              </div>
              
              <div className="space-y-2">
                {planDetails.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Button */}
            <Button 
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 text-lg font-semibold"
              onClick={handleStripeCheckout}
              disabled={loading}
            >
              {loading ? "Processing..." : `Subscribe for ${planDetails.price}/month`}
            </Button>
            
            <p className="text-center text-sm text-gray-500 mt-4">
              Secure payment powered by Stripe. Cancel anytime.
            </p>
          </CardContent>
        </Card>
        
        {/* Security Info */}
        <div className="text-center mt-8 text-sm text-gray-600">
          <p>🔒 Your payment information is secure and encrypted</p>
          <p className="mt-2">
            <a href="/privacy" className="text-orange-600 hover:underline">Privacy Policy</a>
            {" • "}
            <a href="/terms" className="text-orange-600 hover:underline">Terms of Service</a>
          </p>
        </div>
      </div>
    </div>
  );
}
