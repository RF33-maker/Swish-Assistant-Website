/**
 * Settings page — redirects to the unified Account Centre (/profile).
 *
 * The account centre consolidates profile editing, password management,
 * consent preferences, data export, and deletion into one place.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function SettingsPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/profile", { replace: true });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
    </div>
  );
}
