import { createContext, useContext, ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type LoginData = {
  username: string;
  password: string;
};

type RegisterData = {
  username: string;
  password: string;
  marketingConsent?: boolean;
};

type AuthContextType = {
  user: any | null;
  /** True when the Supabase user has app_metadata.role === "admin". */
  isAdmin: boolean;
  /**
   * True when the Supabase user has app_metadata.role === "coach" — a paying
   * team's login, scoped to app_metadata.team_id (see `teamId` below).
   * Provisioned via POST /api/admin/provision-coach.
   */
  isCoach: boolean;
  /** The team this account is scoped to, when isCoach is true. Null otherwise. */
  teamId: string | null;
  /** True when the Supabase user has confirmed their email address. */
  emailConfirmed: boolean;
  /**
   * True when the account has free-member privileges: the user is signed in
   * AND has confirmed their email address (or is an admin).
   * Admins always satisfy the member check even without separate verification.
   */
  isMember: boolean;
  /**
   * Always false in this release — the chatbot is not yet available.
   * A future release will check a server-side entitlement before setting this.
   */
  chatbotEnabled: false;
  isLoading: boolean;
  error: Error | null;
  loginMutation: ReturnType<typeof useMutation<any, Error, LoginData>>;
  logoutMutation: ReturnType<typeof useMutation<void, Error, void>>;
  registerMutation: ReturnType<typeof useMutation<void, Error, RegisterData>>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Local "view as team" (dev server only) ────────────────────────────────
// Lets you build coach features from a team's point of view without signing
// in to that team's account: open any page with `?viewAsTeam=<team_id>` and
// the app treats you as that team's coach until `?viewAsTeam=off`. Gated on
// import.meta.env.DEV, so production builds drop it entirely. It only changes
// what the browser *thinks* the role is — the server never trusts it (coach
// data is read through public endpoints, admin endpoints check the real JWT).
const DEV_VIEW_AS_KEY = "swish:devViewAsTeam";

function readDevViewAsTeam(): string | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  try {
    const param = new URLSearchParams(window.location.search).get("viewAsTeam");
    if (param === "off") window.localStorage.removeItem(DEV_VIEW_AS_KEY);
    else if (param) window.localStorage.setItem(DEV_VIEW_AS_KEY, param);
    return window.localStorage.getItem(DEV_VIEW_AS_KEY);
  } catch {
    return null;
  }
}

function clearDevViewAsTeam() {
  try {
    window.localStorage.removeItem(DEV_VIEW_AS_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}

function useAuthProviderValue(): AuthContextType {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();

  const {
    data: realUser = null,
    error,
    isLoading,
  } = useQuery<any, Error>({
    queryKey: ["user"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) return null;
        return data?.user ?? null;
      } catch {
        return null;
      }
    },
    retry: false,
  });

  // Derive admin/coach and email-confirmed state from the Supabase user object.
  // app_metadata is authoritative — it can only be written server-side via the
  // service-role key, so it cannot be spoofed from the browser.
  const devViewAsTeam = readDevViewAsTeam();
  const user = devViewAsTeam
    ? {
        ...(realUser ?? { id: "00000000-0000-0000-0000-000000000000", email: "coach-preview@localhost" }),
        email_confirmed_at: realUser?.email_confirmed_at ?? new Date(0).toISOString(),
        app_metadata: { ...(realUser?.app_metadata ?? {}), role: "coach", team_id: devViewAsTeam },
      }
    : realUser;
  const isAdmin = user?.app_metadata?.role === "admin";
  const isCoach = user?.app_metadata?.role === "coach";
  const teamId = isCoach ? (user?.app_metadata?.team_id ?? null) : null;
  const emailConfirmed = !!user?.email_confirmed_at;
  // A member is a verified account: logged in + email confirmed, or admin.
  const isMember = !!user && (emailConfirmed || isAdmin);
  // Chatbot is not yet available in this release.
  const chatbotEnabled = false as const;

  const loginMutation = useMutation<any, Error, LoginData>({
    mutationFn: async ({ username, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username,
        password,
      });
      if (error) throw new Error(error.message);
      return data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["user"], user);
      setLocation("/dashboard");
      toast({ title: "Welcome back!", description: "Successfully logged in" });
    },
    onError: (error: Error) => {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    },
  });

  const registerMutation = useMutation<void, Error, RegisterData>({
    mutationFn: async ({ username, password, marketingConsent = false }) => {
      // Registration goes entirely through our server endpoint.
      // The server uses supabaseAdmin.auth.admin.createUser() to create the auth
      // user, then writes member_profiles and member_consents with the service-role
      // key. This guarantees consent records are only created via the UI flow and
      // cannot be fabricated by direct Supabase API calls.
      const res = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // termsAccepted is always true here — the client-side checkbox is
        // required and the registration button is disabled unless checked.
        // The server validates this flag and rejects requests without it.
        body: JSON.stringify({ email: username, password, marketingConsent, termsAccepted: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Registration failed (${res.status})`);
    },
    onSuccess: () => {
      toast({
        title: "Account created!",
        description:
          "Please check your inbox and click the verification link to activate your account.",
        duration: 8000,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const logoutMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      clearDevViewAsTeam();
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.setQueryData(["user"], null);
      setLocation("/");
      toast({ title: "Logged out", description: "Successfully logged out" });
    },
    onError: (error: Error) => {
      toast({ title: "Logout failed", description: error.message, variant: "destructive" });
    },
  });

  return {
    user,
    isAdmin,
    isCoach,
    teamId,
    emailConfirmed,
    isMember,
    chatbotEnabled,
    isLoading,
    error,
    loginMutation,
    logoutMutation,
    registerMutation,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthProviderValue();
  return (
    <AuthContext.Provider value={value}>
      {children}
      {import.meta.env.DEV && value.isCoach && value.user?.app_metadata?.team_id && readDevViewAsTeam() && (
        <a
          href="?viewAsTeam=off"
          className="fixed bottom-3 right-3 z-[10000] rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-amber-600"
          title="Local-only coach preview. Click to exit."
        >
          Viewing as team coach (local) · Exit
        </a>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
