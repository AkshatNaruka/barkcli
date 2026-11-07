import type { PlanStatus, PlanTaskStatus } from "../../lib/types";

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  running: "Running",
  needs_attention: "Needs attention",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_STATUS_LABEL: Record<PlanTaskStatus, string> = {
  waiting: "Waiting",
  ready: "Ready",
  running: "Running",
  review: "Needs review",
  merged: "Merged",
  failed: "Failed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

export function planTone(status: PlanStatus) {
  if (status === "running") return "text-accent-text bg-accent-soft border-accent/30";
  if (status === "completed") return "text-success bg-success-soft border-success/25";
  if (status === "needs_attention") return "text-warning bg-warning-soft border-warning/25";
  if (status === "cancelled") return "text-muted bg-white/[0.03] border-border";
  if (status === "awaiting_approval") return "text-warning bg-warning-soft border-warning/25";
  return "text-muted bg-white/[0.03] border-border";
}

export function taskTone(status: PlanTaskStatus) {
  if (status === "running") return "text-accent-text";
  if (status === "review") return "text-warning";
  if (status === "merged") return "text-success";
  if (status === "failed") return "text-danger";
  if (status === "ready") return "text-text";
  if (status === "cancelled") return "text-muted";
  return "text-muted";
}

export function taskDot(status: PlanTaskStatus) {
  if (status === "running") return "bg-accent animate-pulse";
  if (status === "review") return "bg-warning";
  if (status === "merged") return "bg-success";
  if (status === "failed") return "bg-danger";
  if (status === "ready") return "bg-text/60";
  if (status === "cancelled") return "bg-muted";
  return "bg-border-strong";
}

export function taskFill(status: PlanTaskStatus) {
  if (status === "running") return "var(--accent)";
  if (status === "review") return "var(--warning)";
  if (status === "merged") return "var(--success)";
  if (status === "failed") return "var(--danger)";
  if (status === "ready") return "color-mix(in srgb, var(--text) 55%, transparent)";
  return "var(--border-strong)";
}
