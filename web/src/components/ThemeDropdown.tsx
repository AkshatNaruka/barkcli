import React from "react";
import { useTheme, type Theme } from "../lib/theme.tsx";

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "black", label: "Black", icon: "⬛" },
  { value: "light", label: "Light", icon: "⬜" },
  { value: "system", label: "System", icon: "🖥" },
];

export function ThemeDropdown() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="relative inline-block">
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
        className="appearance-none bg-surface border border-border text-muted hover:text-text hover:border-border-strong rounded-md text-xs px-2.5 py-1.5 pr-7 cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
        title="Theme"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted text-[10px]">
        ▾
      </span>
    </div>
  );
}
