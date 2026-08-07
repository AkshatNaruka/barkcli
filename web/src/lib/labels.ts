// Label color system — auto-assign from a 10-color palette by name hash.
// Colors come from CSS vars (--label-0 .. --label-9) so they adapt to theme.

export const LABEL_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#10b981", // emerald
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#94a3b8", // slate
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export interface LabelStyle {
  color: string;
  bg: string;
  className: string;
}

export function labelColor(name: string): LabelStyle {
  const idx = hashString(name.toLowerCase()) % LABEL_COLORS.length;
  const color = LABEL_COLORS[idx];
  return {
    color,
    bg: `color-mix(in srgb, ${color} 18%, transparent)`,
    className: "",
  };
}

/** Tailwind-friendly class string using arbitrary values with CSS vars */
export function labelClasses(name: string): string {
  const idx = hashString(name.toLowerCase()) % LABEL_COLORS.length;
  return `text-[var(--label-${idx})] bg-[color-mix(in_srgb,var(--label-${idx})_18%,transparent)]`;
}
