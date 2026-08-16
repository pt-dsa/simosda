import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="p-2.5 rounded-xl neuglass active:neuglass-pressed transition-all active:scale-95 focus:outline-none"
      title="Toggle Theme"
      aria-label="Toggle Theme"
    >
      {theme === "light" ? (
        <Moon size={22} className="text-blue-600 fill-blue-500/20 drop-shadow-[0_2px_4px_rgba(37,99,235,0.4)]" />
      ) : (
        <Sun size={22} className="text-amber-400 fill-amber-400/30 drop-shadow-[0_2px_6px_rgba(251,191,36,0.6)]" />
      )}
    </button>
  );
}
