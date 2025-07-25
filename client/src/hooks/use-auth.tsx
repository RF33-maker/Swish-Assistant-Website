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
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw new Error(error.message);
      return data?.user ?? null;
    },
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: LoginData) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username,
        password,
      });

      if (error) throw new Error(error.message);
      return data.user as SelectUser;
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
      return data.user as SelectUser;
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
