import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/button";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={`rounded-full hover:bg-orange-100 dark:hover:bg-gray-700 ${className}`}
      data-testid="theme-toggle"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5 text-slate-700 dark:text-slate-200" />
      ) : (
        <Sun className="h-5 w-5 text-yellow-400" />
      )}
    </Button>
  );
}
