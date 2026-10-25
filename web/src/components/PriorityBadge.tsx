import React from "react";

// Quiet chip: the label carries the weight, the tint stays soft. Matches the
// control-center mock's HIGH / BUG chips across Board, List, and Table.
const PRIORITY: Record<string, { label: string; cls: string }> = {
  high: { label: "High", cls: "text-danger bg-danger-soft" },
  medium: { label: "Med", cls: "text-warning bg-warning-soft" },
  low: { label: "Low", cls: "text-muted bg-white/[0.04]" },
};

export function PriorityBadge({ priority, iconOnly }: { priority: string; iconOnly?: boolean }) {
  const p = PRIORITY[priority] || { label: priority, cls: "text-muted bg-white/[0.04]" };
  return (
    <span
      title={`Priority: ${p.label}`}
      className={`inline-flex items-center text-[9px] font-semibold uppercase tracking-[0.08em] rounded px-1.5 py-0.5 shrink-0 ${p.cls}`}
    >
      {p.label}
    </span>
  );
}
