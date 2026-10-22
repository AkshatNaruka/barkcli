import React from "react";

// ── Jira/Azure-style status lozenge: uppercase micro pill ──

const TONES: Record<string, string> = {
  gray: "text-muted bg-surface",
  blue: "text-accent bg-accent-soft",
  amber: "text-warning bg-warning-soft",
  green: "text-success bg-success-soft",
  red: "text-danger bg-danger-soft",
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
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function columnTone(col: string): "gray" | "blue" | "amber" | "green" {
  // Modern neutral columns (Linear-style): only done carries a success tone.
  // Doing/review intentionally match todo's neutral gray — status color lives
  // on card badges and dots, not on rainbow column headers.
  if (col === "done") return "green";
  return "gray";
}
