import React from "react";

// ── Jira/Azure-style status lozenge: uppercase micro pill ──

const TONES: Record<string, string> = {
  gray: "text-muted bg-surface border-border",
  blue: "text-accent bg-accent-soft border-accent/30",
  amber: "text-warning bg-warning-soft border-warning/30",
  green: "text-success bg-success-soft border-success/30",
  red: "text-danger bg-danger-soft border-danger/30",
};

export function Lozenge({
  tone = "gray",
  children,
  title,
}: {
  tone?: "gray" | "blue" | "amber" | "green" | "red";
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded border ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function columnTone(col: string): "gray" | "blue" | "amber" | "green" {
  if (col === "done") return "green";
  if (col === "doing") return "blue";
  if (col === "review") return "amber";
  return "gray";
}
