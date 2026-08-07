import React from "react";

const PRIORITY: Record<string, { label: string; cls: string; dot: string }> = {
  high: {
    label: "High",
    cls: "text-[color:var(--priority-high)] bg-[color-mix(in_srgb,var(--priority-high)_15%,transparent)] border-[color-mix(in_srgb,var(--priority-high)_30%,transparent)]",
    dot: "bg-[color:var(--priority-high)]",
  },
  medium: {
    label: "Medium",
    cls: "text-[color:var(--priority-med)] bg-[color-mix(in_srgb,var(--priority-med)_15%,transparent)] border-[color-mix(in_srgb,var(--priority-med)_30%,transparent)]",
    dot: "bg-[color:var(--priority-med)]",
  },
  low: {
    label: "Low",
    cls: "text-[color:var(--priority-low)] bg-[color-mix(in_srgb,var(--priority-low)_15%,transparent)] border-[color-mix(in_srgb,var(--priority-low)_30%,transparent)]",
    dot: "bg-[color:var(--priority-low)]",
  },
};

export function PriorityBadge({ priority, withDot = true }: { priority: string; withDot?: boolean }) {
  const p = PRIORITY[priority] || {
    label: priority,
    cls: "text-muted bg-surface border-border",
    dot: "bg-muted",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${p.cls}`}
    >
      {withDot && <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />}
      {p.label}
    </span>
  );
}
