import React from "react";
import { useTheme, type Theme } from "../lib/theme.tsx";
import { QuietSelect } from "./QuietSelect";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "black", label: "Black" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

export function ThemeDropdown() {
  const { theme, setTheme } = useTheme();
  return (
    <QuietSelect
      value={theme}
      onChange={(e) => setTheme(e.target.value as Theme)}
      title="Theme"
      className="px-2.5 py-1.5"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </QuietSelect>
  );
}
