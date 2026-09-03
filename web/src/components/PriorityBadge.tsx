import React from "react";
import { Icon, type IconName } from "./Icon";

// Jira-style priority: directional arrow + label.
const PRIORITY: Record<string, { label: string; cls: string; icon: IconName }> = {
  high: {
    label: "High",
    cls: "text-[color:var(--priority-high)] bg-[color-mix(in_srgb,var(--priority-high)_15%,transparent)] border-[color-mix(in_srgb,var(--priority-high)_30%,transparent)]",
    icon: "arrowUp",
  },
  medium: {
    label: "Medium",
    cls: "text-[color:var(--priority-med)] bg-[color-mix(in_srgb,var(--priority-med)_15%,transparent)] border-[color-mix(in_srgb,var(--priority-med)_30%,transparent)]",
    icon: "arrowFlat",
  },
  low: {
    label: "Low",
    cls: "text-[color:var(--priority-low)] bg-[color-mix(in_srgb,var(--priority-low)_15%,transparent)] border-[color-mix(in_srgb,var(--priority-low)_30%,transparent)]",
    icon: "arrowDown",
  },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITY[priority] || {
    label: priority,
    cls: "text-muted bg-surface border-border",
    icon: "arrowFlat" as IconName,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${p.cls}`}
    >
      <Icon name={p.icon} size={11} />
      {p.label}
    </span>
  );
}
