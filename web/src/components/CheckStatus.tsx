import React from "react";
import type { QueueItem } from "../lib/types";
import { Icon, type IconName } from "./Icon";

type CheckTone = "passed" | "failed" | "skipped" | "unverified" | "none";

export interface CheckState {
  tone: CheckTone;
  label: string;
  detail: string;
  icon: IconName;
}

/**
 * Summarize the last recorded acceptance gate. This is evidence, not a merge
 * decision: a skipped or missing gate is never reported as a pass.
 */
export function checkState(item: QueueItem): CheckState {
  const checks = item.checks;
  if (!checks) {
    return {
      tone: "none",
      label: "No checks yet",
      detail: "No build receipt exists for this card, so no acceptance gate has run.",
      icon: "clock",
    };
  }
  if (checks.gate_skipped) {
    return {
      tone: "skipped",
      label: "Checks skipped",
      detail: "The agent skipped the acceptance gate. Verify the change manually before merging.",
      icon: "warn",
    };
  }
  if (!checks.gate_passed) {
    return {
      tone: "failed",
      label: "Checks failed",
      detail: checks.gate_command
        ? `Last recorded gate failed: ${checks.gate_command}`
        : "The last recorded acceptance gate failed.",
      icon: "x",
    };
  }
  if (checks.guard_errors > 0) {
    return {
      tone: "failed",
      label: `Guard: ${checks.guard_errors} error${checks.guard_errors === 1 ? "" : "s"}`,
      detail: "The gate passed, but the guard reported blocking errors.",
      icon: "warn",
    };
  }
  if (!checks.receipt_verified) {
    return {
      tone: "unverified",
      label: "Checks passed · receipt unverified",
      detail: "The gate passed, but the receipt hash does not match its contents.",
      icon: "warn",
    };
  }
  return {
    tone: "passed",
    label: "Checks passed",
    detail: checks.gate_command
      ? `Gate passed: ${checks.gate_command}`
      : "The recorded acceptance gate passed.",
    icon: "check",
  };
}

export function CheckChip({
  item,
  className = "",
}: {
  item: QueueItem;
  className?: string;
}) {
  const state = checkState(item);
  return (
    <span
      className={`check-chip is-${state.tone} ${className}`}
      title={state.detail}
    >
      <Icon name={state.icon} size={10} />
      {state.label}
    </span>
  );
}
