import type { GateSummary, RunRecord } from "./types";

export function checksPassed(gate?: GateSummary | null): boolean {
  const proof = gate?.verification;
  return Boolean(gate?.passed && gate.command?.trim() && proof?.outcome === "passed" &&
    proof.exit_code === 0 && proof.tested_head && proof.target_head);
}

export function checkState(gate?: GateSummary | null): { label: string; tone: "success" | "danger" | "warning" | "muted" } {
  if (checksPassed(gate)) return { label: "Checks passed", tone: "success" };
  switch (gate?.verification?.outcome) {
    case "running": return { label: "Checking", tone: "muted" };
    case "failed": return { label: "Checks failed", tone: "danger" };
    case "error": return { label: "Checks could not run", tone: "danger" };
    case "stale": return { label: "Checks are out of date", tone: "warning" };
    default: return { label: "Not verified", tone: "warning" };
  }
}

export function isActiveRun(run: RunRecord): boolean {
  return ["queued", "starting", "running", "waiting", "needs_review"].includes(run.status);
}

export function runLabel(run: RunRecord): string {
  if (run.status === "merged") return "Merged";
  if (run.status === "interrupted" || run.status === "cancelled") return "Stopped";
  if (run.status === "waiting") return "Needs you";
  if (run.status === "queued") return "Queued";
  if (run.status === "starting") return "Starting";
  if (run.gate) return checkState(run.gate).label;
  if (run.status === "failed") return "Build failed";
  if (run.status === "running") return "Building";
  return "Not verified";
}

export function canReviewMerge(run?: RunRecord | null): boolean {
  return Boolean(run && run.status === "passed" && checksPassed(run.gate) &&
    run.head_sha === run.gate?.verification?.tested_head);
}
