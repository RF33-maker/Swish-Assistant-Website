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
  /** True when the Supabase user has confirmed their email address. */
  emailConfirmed: boolean;
  isLoading: boolean;
  error: Error | null;
  loginMutation: ReturnType<typeof useMutation<any, Error, LoginData>>;
  logoutMutation: ReturnType<typeof useMutation<void, Error, void>>;
  registerMutation: ReturnType<typeof useMutation<void, Error, RegisterData>>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

function useAuthProviderValue(): AuthContextType {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();

  const {
    data: user = null,
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

  // Derive admin and email-confirmed state from the Supabase user object.
  // app_metadata is authoritative — it can only be written server-side via the
  // service-role key, so it cannot be spoofed from the browser.
  const isAdmin = user?.app_metadata?.role === "admin";
  const emailConfirmed = !!user?.email_confirmed_at;

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
    emailConfirmed,
    isLoading,
    error,
    loginMutation,
    logoutMutation,
    registerMutation,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthProviderValue();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
