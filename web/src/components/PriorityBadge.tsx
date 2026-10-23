import React from "react";
import { Icon, type IconName } from "./Icon";

// Quiet Linear-style priority: directional arrow + tinted text, no filled
// chip — the color carries the weight, the chip shells stay for status only.
const PRIORITY: Record<string, { label: string; cls: string; icon: IconName }> = {
  high: {
    label: "High",
    cls: "text-[color:var(--priority-high)]",
    icon: "arrowUp",
  },
  medium: {
    label: "Medium",
    cls: "text-[color:var(--priority-med)]",
    icon: "arrowFlat",
  },
  low: {
    label: "Low",
    cls: "text-[color:var(--priority-low)]",
    icon: "arrowDown",
  },
};

export function PriorityBadge({ priority, iconOnly }: { priority: string; iconOnly?: boolean }) {
  const p = PRIORITY[priority] || {
    label: priority,
    cls: "text-muted",
    icon: "arrowFlat" as IconName,
  };
  return (
    <span
      title={`Priority: ${p.label}`}
      className={`inline-flex items-center ${iconOnly ? "" : "gap-1 text-[10px] font-semibold uppercase tracking-wide"} ${p.cls}`}
    >
      <Icon name={p.icon} size={iconOnly ? 12 : 11} />
      {!iconOnly && p.label}
    </span>
  );
}
