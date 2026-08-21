import { createContext, useContext, ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { InsertUser, User as SelectUser } from "@shared/schema";

type LoginData = {
  username: string;
  password: string;
};

type AuthContextType = {
  user: SelectUser | null;
  /** True when the Supabase user has app_metadata.role === "admin". */
  isAdmin: boolean;
  /** True when the Supabase user has confirmed their email address. */
  emailConfirmed: boolean;
  isLoading: boolean;
  error: Error | null;
  loginMutation: ReturnType<typeof useMutation>;
  logoutMutation: ReturnType<typeof useMutation>;
  registerMutation: ReturnType<typeof useMutation>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

function useAuthProviderValue(): AuthContextType {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<any, Error>({
    queryKey: ["user"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          return null;
        }
        return data?.user ?? null;
      } catch (err) {
        return null;
      }
    },
    retry: false,
  });

  // Derive admin and email-confirmed state from the Supabase user object.
  // app_metadata is authoritative — it can only be written server-side via the
  // service-role key, so it cannot be spoofed from the browser.
  const isAdmin = (user as any)?.app_metadata?.role === "admin";
  const emailConfirmed = !!(user as any)?.email_confirmed_at;

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: LoginData) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username,
        password,
      });

      if (error) throw new Error(error.message);
      return data.user as unknown as SelectUser;
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["user"], user);
      setLocation("/dashboard");
      toast({
        title: "Welcome back!",
        description: `Successfully logged in`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async ({ username, password }: InsertUser) => {
      const { data, error } = await supabase.auth.signUp({
        email: username,
        password,
      });

      if (error) throw new Error(error.message);
      return data.user as unknown as SelectUser;
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["user"], user);
      toast({
        title: "Registration successful",
        description: "Please check your email to verify your account",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.setQueryData(["user"], null);
      setLocation("/");
      toast({
        title: "Logged out",
        description: "Successfully logged out",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
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
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
