import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, HelpCircle, User, LogOut, Settings, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import SwishAssistantLogo from "@/assets/Swish Assistant Logo.png";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";


export default function Header() {
  const { user, isAdmin, emailConfirmed, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);

  async function handleResendVerification() {
    if (resendLoading || resendCooldown) return;
    setResendLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/account/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: userEmail }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Could not resend email",
          description: json.error ?? "An unexpected error occurred.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Verification email sent",
          description: "Check your inbox and click the link to verify your account.",
          duration: 8000,
        });
        setResendCooldown(true);
        setTimeout(() => setResendCooldown(false), 60_000);
      }
    } catch {
      toast({
        title: "Could not resend email",
        description: "A network error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setResendLoading(false);
    }
  }
  
  // This function would normally be in a context or central state management
  // For demo purposes, we're exposing it here to be accessed by CustomizationSection
  window.updateTeamLogo = (newLogoSrc: string) => {
    setLogoSrc(newLogoSrc);
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const userEmail = (user as any)?.email ?? "";
  const userInitial = userEmail.charAt(0).toUpperCase() || "U";


  return (
    <header className="bg-white shadow-sm">
      <div className="w-full px-3 md:px-4 lg:px-8">
        <div className="flex justify-between h-14 md:h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              {/* Team logo */}
              <div className="flex items-center gap-2">
                <img
                  src={logoSrc || SwishAssistantLogo}
                  alt="Swish Assistant Logo"
                  className="h-6 md:h-8 w-auto"
                />
                <span className="text-base md:text-lg font-semibold text-neutral-800"></span>
              </div>

              <span className="ml-2 text-base md:text-lg font-semibold text-neutral-800"></span>
            </div>
            {user && isAdmin && (
              <div className="flex items-center gap-2 ml-3">
                <Link href="/coaches-hub">
                  <Button
                    className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-medium transition-colors text-xs md:text-sm"
                  >
                    Coaches Hub
                  </Button>
                </Link>
                <Link href="/league-management">
                  <Button
                    className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-medium transition-colors text-xs md:text-sm"
                  >
                    League Admin
                  </Button>
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2 md:space-x-3">
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5 text-neutral-500" />
            </Button>
            <Button variant="ghost" size="icon">
              <HelpCircle className="h-5 w-5 text-neutral-500" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative rounded-full h-8 w-8 p-0">
                  <Avatar>
                    <AvatarFallback>{userInitial}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userEmail}</p>
                    {isAdmin ? (
                      <p className="text-xs leading-none text-orange-600 font-medium">Owner</p>
                    ) : emailConfirmed ? (
                      <span className="inline-flex items-center gap-1 text-xs leading-none text-emerald-600 font-medium">
                        <CheckCircle className="h-3 w-3" />
                        Verified member
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs leading-none text-amber-600 font-medium">
                        <AlertCircle className="h-3 w-3" />
                        Email not verified
                      </span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!isAdmin && !emailConfirmed && (
                  <DropdownMenuItem
                    onClick={handleResendVerification}
                    disabled={resendLoading || resendCooldown}
                    className="text-amber-700 focus:text-amber-800 focus:bg-amber-50"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${resendLoading ? "animate-spin" : ""}`} />
                    <span>{resendCooldown ? "Email sent ✓" : resendLoading ? "Sending…" : "Resend verification email"}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
