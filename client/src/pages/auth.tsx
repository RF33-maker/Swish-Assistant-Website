import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertUserSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Layers, User, LucideGithub, Mail } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { SiLinkedin } from "react-icons/si";
import SwishAssistantLogo from "@/assets/Swish Assistant Logo.png";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"




const loginSchema = z.object({
  username: z.string().min(1, { message: "Email is required" }).email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
  rememberMe: z.boolean().optional(),
});

const registerSchema = insertUserSchema.extend({
  confirmPassword: z.string().min(1, { message: "Confirm password is required" }),
  terms: z.boolean().refine(val => val === true, { message: "You must accept the terms and conditions" }),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [_, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [planPrice, setPlanPrice] = useState<string | null>(null);
  const [isContactSales, setIsContactSales] = useState(false);

  console.log("User in AuthPage:", user);

  // Get plan from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const plan = urlParams.get('plan');
    const price = urlParams.get('price');
    const contact = urlParams.get('contact');
    
    if (plan) {
      setSelectedPlan(plan);
      setPlanPrice(price);
      setIsContactSales(contact === 'true');
    }
  }, []);

  // Redirect if user is already logged in
  useEffect(() => {
    if (user) {
      if (selectedPlan && selectedPlan !== 'free') {
        if (isContactSales) {
          // Redirect to contact sales page or show contact info
          setLocation("/contact-sales");
        } else {
          // Redirect to payment page with plan details
          setLocation(`/payment?plan=${selectedPlan}&price=${planPrice}`);
        }
      } else {
        setLocation("/dashboard");
      }
    }
  }, [user, setLocation, selectedPlan, planPrice, isContactSales]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
    },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  const onLoginSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({
      username: values.username,
      password: values.password,
    });
  };

  const onRegisterSubmit = (values: z.infer<typeof registerSchema>) => {
    registerMutation.mutate({
      username: values.username,
      password: values.password,
    });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left Column - Auth Forms */}
      <div className="w-full md:w-1/2 bg-gradient-to-br from-orange-100 via-white to-white p-4 md:p-8 flex items-center justify-center text-gray-800">
          <Card className="w-full max-w-md shadow-none border border-gray-200 bg-white">
          <CardHeader className="text-center">
            <div className="flex flex-col items-center gap-2 mb-4">
              <img src={SwishAssistantLogo} alt="Swish Assistant Logo" className="h-16" />
              <h1 className="text-xl font-bold text-swish-dark
">Swish Assistant</h1>
              <p className="text-sm text-muted-foreground text-center">
                Access your team’s AI-powered game insights — faster, smarter, and on your terms
              </p>
            </div>

          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-100 text-gray-600 rounded-md">
                <TabsTrigger value="login" className="data-[state=active]:bg-[#FFC285] data-[state=active]:text-white">
                  Login
                </TabsTrigger>
                <TabsTrigger value="register" className="data-[state=active]:bg-[#FFC285] data-[state=active]:text-white">
                  Register
                </TabsTrigger>
              </TabsList>

              
              <TabsContent value="login">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              placeholder="coach@email.com"
                              className="bg-white border border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-orange-300 focus:border-orange-400"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <FormLabel className="cursor-help">Password</FormLabel>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                Make it strong, Coach.
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder="••••••••"
                              className="bg-white border border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-orange-300 focus:border-orange-400"
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>

                      )}
                    />

                    <div className="flex items-center justify-between">
                      <FormField
                        control={loginForm.control}
                        name="rememberMe"
                        render={({ field }) => (
                          <div className="flex items-center space-x-2">
                            <Checkbox 
                              id="rememberMe" 
                              checked={field.value} 
                              onCheckedChange={field.onChange}
                            />
                            <label
                              htmlFor="rememberMe"
                              className="text-sm text-gray-600"
                            >
                              Remember me
                            </label>
                          </div>
                        )}
                      />
                      <a href="#" className="text-sm text-gray-500 hover:text-gray-700">
                        Need help subbing in?
                      </a>
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-[#FFC285] hover:bg-[#ffb76c] text-white font-medium"
                    >
                      Sign in
                    </Button>

                  </form>
                </Form>
              </TabsContent>
              
              <TabsContent value="register">
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="your@email.com" {...field} type="email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input placeholder="••••••••" {...field} type="password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input placeholder="••••••••" {...field} type="password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="terms"
                      render={({ field }) => (
                        <div className="flex items-start space-x-2 mt-4">
                          <Checkbox 
                            id="terms" 
                            checked={field.value} 
                            onCheckedChange={field.onChange}
                            className="mt-1"
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor="terms"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              I agree to the terms of service and privacy policy
                            </label>
                          </div>
                        </div>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full bg-[#FFC285] hover:bg-[#ffb76c] text-white font-medium"
                    >
                      Sign in
                    </Button>

                  </form>
                </Form>
              </TabsContent>
            </Tabs>

            <div className="relative mt-6">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full bg-orange-500 text-white hover:bg-orange-600" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="mt-6 text-center text-xs text-gray-400">Powered by Automated Athlete</span>
              </div>
            </div>

  
          </CardContent>
        </Card>
      </div>

      {/* Right Column - Hero */}
      {/* Right Column - Hero */}
      <div className="hidden md:block md:w-1/2 bg-white p-8 text-gray-800">
        <div className="h-full flex flex-col justify-center max-w-lg mx-auto">
          <h1 className="text-4xl font-bold mb-6 text-swish-dark">Game insights, simplified</h1>
          <p className="text-lg mb-8">
            Swish Assistant turns your stat sheets into instant coaching value — 
            from shot charts to player summaries, all powered by AI.
          </p>

          <div className="space-y-6">

            {/* Feature 1 */}
            <div className="flex items-start space-x-3">
              <div className="mt-1 bg-swish-peach p-2 rounded-full">
                <Mail size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-swish-dark">Ask questions, get answers</h3>
                <p className="text-sm text-gray-700">
                  Want to know how many 3s your top shooter hit last game? Just ask.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex items-start space-x-3">
              <div className="mt-1 bg-swish-peach p-2 rounded-full">
                <User size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-swish-dark">Quick Summaries</h3>
                <p className="text-sm text-gray-700">
                  Drop in your FIBA LiveStats PDF and generate visual scouting reports instantly..
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex items-start space-x-3">
              <div className="mt-1 bg-swish-peach p-2 rounded-full">
                <Layers size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-swish-dark">Custom team setup</h3>
                <p className="text-sm text-gray-700">Upload your logo, add team colors, and personalize the experience.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
      </div>
  );  
}