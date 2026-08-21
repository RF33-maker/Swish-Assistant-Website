import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { BarChart2, Download, Sparkles, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import SwishAssistantLogo from "@/assets/Swish Assistant Logo.png";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase";

// ── Schemas ────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  username: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
  rememberMe: z.boolean().optional(),
});

const registerSchema = z
  .object({
    username: z
      .string()
      .min(1, { message: "Email is required" })
      .email({ message: "Invalid email address" }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" }),
    confirmPassword: z
      .string()
      .min(1, { message: "Please confirm your password" }),
    terms: z
      .boolean()
      .refine((v) => v === true, {
        message: "You must accept the Terms and Privacy Policy to continue",
      }),
    marketingConsent: z.boolean().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

const forgotSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Invalid email address" }),
});

// ── Component ──────────────────────────────────────────────────────────────

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [_, setLocation] = useLocation();
  const [registrationSent, setRegistrationSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);
  const [resendError, setResendError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState("");
  // Pre-select the register tab when ?tab=register is in the URL
  const initialTab = new URLSearchParams(window.location.search).get("tab") === "register" ? "register" : "login";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  // ── Login form ──────────────────────────────────────────────────────────
  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "", rememberMe: false },
  });

  const onLoginSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({ username: values.username, password: values.password });
  };

  // ── Register form ───────────────────────────────────────────────────────
  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      terms: false,
      marketingConsent: false,
    },
  });

  const onRegisterSubmit = (values: z.infer<typeof registerSchema>) => {
    registerMutation.mutate(
      {
        username: values.username,
        password: values.password,
        marketingConsent: values.marketingConsent ?? false,
      } as any,
      {
        onSuccess: () => {
          setRegistrationSent(true);
        },
      }
    );
  };

  const handleResendVerification = async () => {
    if (resendLoading || resendCooldown) return;
    const email = registerForm.getValues("username");
    if (!email) return;
    setResendLoading(true);
    setResendError("");
    try {
      const res = await fetch("/api/account/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResendError((json as any).error ?? "Could not resend. Please try again.");
      } else {
        setResendCooldown(true);
        setTimeout(() => setResendCooldown(false), 60_000);
      }
    } catch {
      setResendError("A network error occurred. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  // ── Forgot-password form ────────────────────────────────────────────────
  const forgotForm = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const onForgotSubmit = async (values: z.infer<typeof forgotSchema>) => {
    setForgotError("");
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setForgotError(error.message);
    } else {
      setForgotSent(true);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left Column – Auth Forms */}
      <div className="w-full md:w-1/2 bg-gradient-to-br from-orange-100 via-white to-white p-4 md:p-8 flex items-center justify-center text-gray-800">
        <Card className="w-full max-w-full md:max-w-md shadow-none border border-gray-200 bg-white">
          <CardHeader className="text-center p-4 md:p-6 pb-2">
            <div className="flex flex-col items-center gap-2 mb-2">
              <img
                src={SwishAssistantLogo}
                alt="Swish Assistant Logo"
                className="h-12 md:h-16"
              />
              <h1 className="text-lg md:text-xl font-bold text-swish-dark">
                Swish Assistant
              </h1>
              <p className="text-sm text-muted-foreground text-center">
                Access your team's AI-powered game insights — faster, smarter,
                and on your terms
              </p>
            </div>
          </CardHeader>

          <CardContent className="pt-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="login">Sign in</TabsTrigger>
                <TabsTrigger value="register">Create account</TabsTrigger>
              </TabsList>

              {/* ── Sign in ── */}
              <TabsContent value="login">
                <Form {...loginForm}>
                  <form
                    onSubmit={loginForm.handleSubmit(onLoginSubmit)}
                    className="space-y-4"
                  >
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
                              data-testid="input-email"
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
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder="••••••••"
                              className="bg-white border border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-orange-300 focus:border-orange-400"
                              data-testid="input-password"
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
                              className="text-sm text-gray-600 cursor-pointer"
                            >
                              Remember me
                            </label>
                          </div>
                        )}
                      />
                      <button
                        type="button"
                        className="text-sm text-orange-600 hover:text-orange-700 hover:underline"
                        onClick={() => setActiveTab("forgot")}
                      >
                        Forgot password?
                      </button>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-[#FFC285] hover:bg-[#ffb76c] text-white font-medium"
                      disabled={loginMutation.isPending}
                      data-testid="button-signin"
                    >
                      {loginMutation.isPending ? "Signing in…" : "Sign in"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              {/* ── Create account ── */}
              <TabsContent value="register">
                {registrationSent ? (
                  <div className="space-y-3">
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        <strong>Check your inbox.</strong> We've sent a
                        verification link to your email address. Click it to
                        activate your account, then sign in.
                      </AlertDescription>
                    </Alert>
                    <div className="text-center space-y-1">
                      <p className="text-sm text-slate-500">
                        Didn't receive it? Check your spam folder or resend.
                      </p>
                      {resendError && (
                        <p className="text-xs text-red-600">{resendError}</p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResendVerification}
                        disabled={resendLoading || resendCooldown}
                        className="border-orange-200 text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 mr-1.5 ${resendLoading ? "animate-spin" : ""}`} />
                        {resendCooldown
                          ? "Email sent — check your inbox"
                          : resendLoading
                          ? "Sending…"
                          : "Resend verification email"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Form {...registerForm}>
                    <form
                      onSubmit={registerForm.handleSubmit(onRegisterSubmit)}
                      className="space-y-4"
                    >
                      <FormField
                        control={registerForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email address</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                placeholder="coach@email.com"
                                className="bg-white border border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-orange-300 focus:border-orange-400"
                                data-testid="input-register-email"
                              />
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
                              <Input
                                {...field}
                                type="password"
                                placeholder="At least 8 characters"
                                className="bg-white border border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-orange-300 focus:border-orange-400"
                                data-testid="input-register-password"
                              />
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
                            <FormLabel>Confirm password</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="password"
                                placeholder="••••••••"
                                className="bg-white border border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-orange-300 focus:border-orange-400"
                                data-testid="input-register-confirm"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Required: Terms + Privacy */}
                      <FormField
                        control={registerForm.control}
                        name="terms"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-start space-x-2">
                              <FormControl>
                                <Checkbox
                                  id="terms"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="mt-0.5"
                                  data-testid="checkbox-terms"
                                />
                              </FormControl>
                              <label
                                htmlFor="terms"
                                className="text-sm text-gray-600 leading-relaxed cursor-pointer"
                              >
                                I have read and agree to the{" "}
                                <Link
                                  href="/terms"
                                  className="text-orange-600 hover:text-orange-700 underline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Terms of Service
                                </Link>{" "}
                                and{" "}
                                <Link
                                  href="/privacy"
                                  className="text-orange-600 hover:text-orange-700 underline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Privacy Policy
                                </Link>
                                . <span className="text-red-500">*</span>
                              </label>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Optional: Marketing consent — unticked by default */}
                      <FormField
                        control={registerForm.control}
                        name="marketingConsent"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-start space-x-2">
                              <FormControl>
                                <Checkbox
                                  id="marketingConsent"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="mt-0.5"
                                  data-testid="checkbox-marketing"
                                />
                              </FormControl>
                              <label
                                htmlFor="marketingConsent"
                                className="text-sm text-gray-500 leading-relaxed cursor-pointer"
                              >
                                I'd like to receive occasional product news and
                                tips by email. You can change this preference at
                                any time in your account settings. (Optional)
                              </label>
                            </div>
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        className="w-full bg-[#FFC285] hover:bg-[#ffb76c] text-white font-medium"
                        disabled={registerMutation.isPending}
                        data-testid="button-register"
                      >
                        {registerMutation.isPending
                          ? "Creating account…"
                          : "Create account"}
                      </Button>

                      <p className="text-xs text-gray-400 text-center">
                        We'll send a verification email. You must verify your
                        address before accessing member features.
                      </p>
                    </form>
                  </Form>
                )}
              </TabsContent>

              {/* ── Forgot password ── */}
              <TabsContent value="forgot">
                {forgotSent ? (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      If that address has an account, we've sent a reset link.
                      Check your inbox (and spam folder).
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Form {...forgotForm}>
                    <form
                      onSubmit={forgotForm.handleSubmit(onForgotSubmit)}
                      className="space-y-4"
                    >
                      <p className="text-sm text-gray-600 mb-2">
                        Enter your email address and we'll send you a link to
                        reset your password.
                      </p>
                      {forgotError && (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-red-700">
                            {forgotError}
                          </AlertDescription>
                        </Alert>
                      )}
                      <FormField
                        control={forgotForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email address</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                placeholder="coach@email.com"
                                className="bg-white border border-gray-300 text-gray-800 placeholder-gray-400"
                                data-testid="input-forgot-email"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full bg-[#FFC285] hover:bg-[#ffb76c] text-white font-medium"
                        data-testid="button-forgot-submit"
                      >
                        Send reset link
                      </Button>
                      <button
                        type="button"
                        className="w-full text-sm text-gray-500 hover:text-gray-700"
                        onClick={() => setActiveTab("login")}
                      >
                        ← Back to sign in
                      </button>
                    </form>
                  </Form>
                )}
              </TabsContent>
            </Tabs>

            <div className="relative mt-6">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="mt-6 text-center text-xs text-gray-400">
                  Powered by Automated Athlete
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column – Hero */}
      <div className="hidden md:block md:w-1/2 bg-white p-8 text-gray-800">
        <div className="h-full flex flex-col justify-center max-w-lg mx-auto">
          <h1 className="text-4xl font-bold mb-6 text-swish-dark">
            Your league, all in one place
          </h1>
          <p className="text-lg mb-8 text-gray-600">
            Swish Assistant brings live scores, deep player stats, and
            shareable performance cards to every league — completely free.
          </p>

          <div className="space-y-6">
            <div className="flex items-start space-x-3">
              <div className="mt-1 bg-swish-peach p-2 rounded-full">
                <BarChart2 size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-swish-dark">
                  Live scores &amp; deep stats
                </h3>
                <p className="text-sm text-gray-600">
                  Follow game results, standings, shot charts, and player
                  leaders across every competition in your league.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="mt-1 bg-swish-peach p-2 rounded-full">
                <Download size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-swish-dark">
                  Download performance cards
                </h3>
                <p className="text-sm text-gray-600">
                  Save and share any player's game highlights as a card built
                  for Instagram, X, and beyond.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="mt-1 bg-swish-peach p-2 rounded-full">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-swish-dark">
                  AI chatbot — coming soon
                </h3>
                <p className="text-sm text-gray-600">
                  Members get first access when the Swish AI assistant launches.
                  Ask anything about your league's stats and get instant answers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
