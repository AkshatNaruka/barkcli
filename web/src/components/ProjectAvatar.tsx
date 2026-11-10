import React from "react";
import { getProjectBadge } from "../lib/projectBadge";

export interface ProjectAvatarProps {
  name?: string | null;
  path?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  favicon?: string | null;
}

export function ProjectAvatar({ name, path, size = "sm", className = "", favicon }: ProjectAvatarProps) {
  const badge = getProjectBadge(name);

  if (favicon) {
    const sizeClasses = {
      xs: "w-3.5 h-3.5 rounded-[3px]",
      sm: "w-4 h-4 rounded-[4px]",
      md: "w-5 h-5 rounded-[5px]",
      lg: "w-7 h-7 rounded-[6px]",
    }[size];
    return (
      <img
        src={favicon}
        alt={name || "Project"}
        className={`shrink-0 object-contain ${sizeClasses} ${className}`}
      />
    );
  }

  const sizeClasses = {
    xs: "w-3.5 h-3.5 text-[9px] rounded-[3px]",
    sm: "w-4 h-4 text-[9.5px] rounded-[4px]",
    md: "w-5 h-5 text-[11px] rounded-[5px]",
    lg: "w-7 h-7 text-[13px] rounded-[6px]",
  }[size];

  if (badge.isScratch) {
    return (
      <span
        aria-label="No project (scratch)"
        className={`inline-flex items-center justify-center shrink-0 border border-dashed border-muted-dim text-muted-dim ${sizeClasses} ${className}`}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2.5 2"
          className="w-full h-full p-0.5"
        >
          <rect x="2" y="2" width="12" height="12" rx="2.5" />
        </svg>
      </span>
    );
  }

  if (badge.isCustomIcon === "loop") {
    return (
      <span
        aria-label={name || "Project"}
        className={`inline-flex items-center justify-center shrink-0 ${badge.bgClass} ${badge.textClass} border ${badge.borderClass} ${sizeClasses} ${className}`}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3/4 h-3/4"
        >
          <path d="M5.5 5.5h5a2.5 2.5 0 0 1 0 5h-5a2.5 2.5 0 0 1 0-5z" />
          <path d="M4 8h8" />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-label={name || "Project"}
      className={`inline-flex items-center justify-center font-bold tracking-tight select-none shrink-0 ${badge.bgClass} ${badge.textClass} border ${badge.borderClass} ${sizeClasses} ${className}`}
    >
      {badge.initials}
    </span>
  );
}
