import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, BarChart2, Download, Sparkles, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { CHECKBOX, ERROR, INPUT, LABEL, LINK, SUBMIT, SUCCESS } from "@/components/layout/AuthShell";
import { supabase } from "@/lib/supabase";
import { Helmet } from "react-helmet-async";
import { PASSWORD_REQUIREMENTS, validatePassword } from "@shared/passwordPolicy";

// ── Copy ───────────────────────────────────────────────────────────────────

const HEADINGS: Record<string, { title: string; intro: string }> = {
  login: {
    title: "Welcome back",
    intro: "Sign in to see full game logs, download cards and follow your leagues.",
  },
  register: {
    title: "Create your free account",
    intro: "Free for fans, players and coaches. See every game and download any card.",
  },
  forgot: {
    title: "Reset your password",
    intro: "Enter your email and we'll send you a link to set a new one.",
  },
};

const PERKS = [
  {
    icon: BarChart2,
    title: "Live scores & deep stats",
    text: "Results, standings, shot charts and leaders across every competition we cover.",
  },
  {
    icon: Download,
    title: "Download performance cards",
    text: "Save any player's standout games as collectible cards, sized for Instagram and X.",
  },
  {
    icon: BadgeCheck,
    title: "Own your player page",
    text: "Request your page to update your details, add your own photo and download your cards.",
  },
  {
    icon: Sparkles,
    title: "AI assistant — coming soon",
    text: "Members get first access when the Swish AI assistant launches.",
  },
];

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
      .min(1, { message: "Password is required" })
      .refine((val) => validatePassword(val) === null, (val) => ({
        message: validatePassword(val) ?? "",
      })),
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

  // ?next= returns people to the page that sent them here (e.g. a player's
  // game log). Same-site paths only, never another origin.
  const nextPath = (() => {
    const next = new URLSearchParams(window.location.search).get("next");
    return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
  })();

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      setLocation(nextPath || "/dashboard");
    }
  }, [user, setLocation, nextPath]);

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
  const heading = HEADINGS[activeTab] ?? HEADINGS.login;

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>{`${activeTab === "register" ? "Create account" : activeTab === "forgot" ? "Reset password" : "Sign in"} | Swish Assistant`}</title>
      </Helmet>
      <SiteHeader hideSearch />

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
        {/* Forms */}
        <section className="lg:col-span-6 xl:col-span-5 ch-rise" aria-labelledby="auth-heading">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Swish Assistant</div>
          <h1 id="auth-heading" className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[2.75rem] text-[color:var(--ch-text)]">
            {heading.title}
          </h1>
          <p className="mt-2 text-sm md:text-[15px] text-[color:var(--ch-text-2)]">{heading.intro}</p>

          <div className="mt-6 ch-card p-5 md:p-7">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {activeTab !== "forgot" && (
                <TabsList className="ch-seg w-full h-auto mb-5 [&>button]:flex-1">
                  <TabsTrigger value="login" className="h-9 text-sm">Sign in</TabsTrigger>
                  <TabsTrigger value="register" className="h-9 text-sm">Create account</TabsTrigger>
                </TabsList>
              )}

              {/* ── Sign in ── */}
              <TabsContent value="login" className="mt-0">
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
                          <FormLabel className={LABEL}>Email</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              autoComplete="email"
                              placeholder="you@email.com"
                              className={INPUT}
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
                          <FormLabel className={LABEL}>Password</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              autoComplete="current-password"
                              placeholder="••••••••"
                              className={INPUT}
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
                              className={CHECKBOX}
                            />
                            <label
                              htmlFor="rememberMe"
                              className="text-sm text-[color:var(--ch-text-2)] cursor-pointer"
                            >
                              Remember me
                            </label>
                          </div>
                        )}
                      />
                      <button
                        type="button"
                        className={`text-sm ${LINK}`}
                        onClick={() => setActiveTab("forgot")}
                      >
                        Forgot password?
                      </button>
                    </div>

                    <button
                      type="submit"
                      className={SUBMIT}
                      disabled={loginMutation.isPending}
                      data-testid="button-signin"
                    >
                      {loginMutation.isPending ? "Signing in…" : "Sign in"}
                    </button>
                  </form>
                </Form>
              </TabsContent>

              {/* ── Create account ── */}
              <TabsContent value="register" className="mt-0">
                {registrationSent ? (
                  <div className="space-y-4">
                    <Alert className={SUCCESS}>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Check your inbox.</strong> We've sent a
                        verification link to your email address. Click it to
                        activate your account, then sign in.
                      </AlertDescription>
                    </Alert>
                    <div className="text-center space-y-2">
                      <p className="text-sm text-[color:var(--ch-muted)]">
                        Didn't receive it? Check your spam folder or resend.
                      </p>
                      {resendError && (
                        <p className="text-xs text-red-600 dark:text-red-400">{resendError}</p>
                      )}
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendLoading || resendCooldown}
                        className="ch-btn ch-btn-ghost h-9 px-4 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${resendLoading ? "animate-spin" : ""}`} />
                        {resendCooldown
                          ? "Email sent — check your inbox"
                          : resendLoading
                          ? "Sending…"
                          : "Resend verification email"}
                      </button>
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
                            <FormLabel className={LABEL}>Email address</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                autoComplete="email"
                                placeholder="you@email.com"
                                className={INPUT}
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
                            <FormLabel className={LABEL}>Password</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="password"
                                autoComplete="new-password"
                                placeholder="At least 8 characters"
                                className={INPUT}
                                data-testid="input-register-password"
                              />
                            </FormControl>
                            <ul className="text-xs text-[color:var(--ch-muted)] mt-1.5 space-y-0.5">
                              {PASSWORD_REQUIREMENTS.map((req) => {
                                const met = req.test(field.value ?? "");
                                return (
                                  <li
                                    key={req.label}
                                    className={met ? "text-emerald-600 dark:text-emerald-400 flex items-center gap-1" : "flex items-center gap-1"}
                                  >
                                    <CheckCircle className={`h-3 w-3 ${met ? "opacity-100" : "opacity-30"}`} />
                                    {req.label}
                                  </li>
                                );
                              })}
                            </ul>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registerForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={LABEL}>Confirm password</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="password"
                                autoComplete="new-password"
                                placeholder="••••••••"
                                className={INPUT}
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
                            <div className="flex items-start space-x-2.5">
                              <FormControl>
                                <Checkbox
                                  id="terms"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className={`mt-0.5 ${CHECKBOX}`}
                                  data-testid="checkbox-terms"
                                />
                              </FormControl>
                              <label
                                htmlFor="terms"
                                className="text-sm text-[color:var(--ch-text-2)] leading-relaxed cursor-pointer"
                              >
                                I have read and agree to the{" "}
                                <Link
                                  href="/terms"
                                  className={LINK}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Terms of Service
                                </Link>{" "}
                                and{" "}
                                <Link
                                  href="/privacy"
                                  className={LINK}
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
                            <div className="flex items-start space-x-2.5">
                              <FormControl>
                                <Checkbox
                                  id="marketingConsent"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className={`mt-0.5 ${CHECKBOX}`}
                                  data-testid="checkbox-marketing"
                                />
                              </FormControl>
                              <label
                                htmlFor="marketingConsent"
                                className="text-sm text-[color:var(--ch-muted)] leading-relaxed cursor-pointer"
                              >
                                I'd like to receive occasional product news and
                                tips by email. You can change this preference at
                                any time in your account settings. (Optional)
                              </label>
                            </div>
                          </FormItem>
                        )}
                      />

                      <button
                        type="submit"
                        className={SUBMIT}
                        disabled={registerMutation.isPending}
                        data-testid="button-register"
                      >
                        {registerMutation.isPending
                          ? "Creating account…"
                          : "Create account"}
                      </button>

                      <p className="text-xs text-[color:var(--ch-muted)] text-center">
                        We'll send a verification email. You must verify your
                        address before accessing member features.
                      </p>
                    </form>
                  </Form>
                )}
              </TabsContent>

              {/* ── Forgot password ── */}
              <TabsContent value="forgot" className="mt-0">
                {forgotSent ? (
                  <div className="space-y-4">
                    <Alert className={SUCCESS}>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        If that address has an account, we've sent a reset link.
                        Check your inbox (and spam folder).
                      </AlertDescription>
                    </Alert>
                    <button
                      type="button"
                      className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
                      onClick={() => setActiveTab("login")}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <Form {...forgotForm}>
                    <form
                      onSubmit={forgotForm.handleSubmit(onForgotSubmit)}
                      className="space-y-4"
                    >
                      {forgotError && (
                        <Alert className={ERROR}>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            {forgotError}
                          </AlertDescription>
                        </Alert>
                      )}
                      <FormField
                        control={forgotForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={LABEL}>Email address</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                autoComplete="email"
                                placeholder="you@email.com"
                                className={INPUT}
                                data-testid="input-forgot-email"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <button
                        type="submit"
                        className={SUBMIT}
                        disabled={forgotForm.formState.isSubmitting}
                        data-testid="button-forgot-submit"
                      >
                        {forgotForm.formState.isSubmitting ? "Sending…" : "Send reset link"}
                      </button>
                      <button
                        type="button"
                        className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
                        onClick={() => setActiveTab("login")}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        Back to sign in
                      </button>
                    </form>
                  </Form>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <p className="mt-4 text-center text-xs text-[color:var(--ch-muted)]">Powered by Automated Athlete</p>
        </section>

        {/* Why sign up */}
        <aside
          className="hidden lg:block lg:col-span-6 xl:col-span-7 ch-hero ch-force-dark ch-rise p-8 xl:p-10 text-white"
          style={{
            animationDelay: "80ms",
            background: "radial-gradient(120% 90% at 100% 0%, rgba(249,115,22,0.55) 0%, rgba(249,115,22,0.12) 45%, transparent 70%), #111317",
          }}
          aria-label="What you get with a free account"
        >
          <svg className="absolute inset-0 h-full w-full opacity-[0.08] pointer-events-none" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <g fill="none" stroke="#fff" strokeWidth="1.5">
              <circle cx="400" cy="0" r="120" />
              <circle cx="400" cy="0" r="40" />
              <path d="M180 0 A 220 220 0 0 0 400 220" />
            </g>
          </svg>
          <div className="relative">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-300">Free account</div>
            <h2 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.5rem] xl:text-[3rem]">
              Free to follow.<br />Yours to own.
            </h2>
            <p className="mt-3 text-[15px] text-white/75 max-w-md">
              Live scores, deep player stats and shareable performance cards for every league on Swish.
            </p>
            <ul className="mt-8 space-y-5">
              {PERKS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3.5">
                  <span className="h-10 w-10 shrink-0 rounded-xl bg-white/[0.08] border border-white/15 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-orange-300" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-sm text-white/70">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
