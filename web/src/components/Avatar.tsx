import React from "react";

const AVATAR_HUES = [
  210, 340, 20, 160, 270, 40, 300, 190, 120, 0,
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

interface Props {
  name: string;
  size?: "sm" | "md";
}

export function Avatar({ name, size = "sm" }: Props) {
  const hue = hueOf(name);
  const bg = `hsl(${hue} 65% 45%)`;
  const dim = size === "md" ? "w-7 h-7 text-xs" : "w-5 h-5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-semibold font-mono shrink-0 select-none ${dim}`}
      style={{ backgroundColor: bg }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}
