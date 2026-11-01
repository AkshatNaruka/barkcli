import { describe, expect, it } from "vitest";
import type { QueueItem } from "../lib/types";
import { checkState } from "./CheckStatus";

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    card_id: "card-1",
    title: "Card",
    column: "review",
    branch: "feat/card-1",
    receipt_id: null,
    files: 1,
    additions: 4,
    deletions: 1,
    risk: { score: 10, tier: "skim", reasons: [] },
    ...overrides,
  };
}

describe("checkState", () => {
  it("never reports a missing receipt as passing", () => {
    const state = checkState(item());
    expect(state.tone).toBe("none");
    expect(state.label).toBe("No checks yet");
  });

  it("reports a skipped gate as skipped", () => {
    const state = checkState(
      item({
        checks: {
          gate_passed: false,
          gate_skipped: true,
          guard_errors: 0,
          guard_warnings: 0,
          receipt_verified: true,
          confidence: "low",
        },
      })
    );
    expect(state.tone).toBe("skipped");
    expect(state.label).toBe("Checks skipped");
  });

  it("reports a failed gate with its command", () => {
    const state = checkState(
      item({
        checks: {
          gate_passed: false,
          gate_skipped: false,
          gate_command: "cargo test",
          guard_errors: 0,
          guard_warnings: 0,
          receipt_verified: true,
          confidence: "low",
        },
      })
    );
    expect(state.tone).toBe("failed");
    expect(state.detail).toContain("cargo test");
  });

  it("marks a passing gate with a mismatched receipt as unverified", () => {
    const state = checkState(
      item({
        checks: {
          gate_passed: true,
          gate_skipped: false,
          guard_errors: 0,
          guard_warnings: 1,
          receipt_verified: false,
          confidence: "medium",
        },
      })
    );
    expect(state.tone).toBe("unverified");
  });

  it("reports a clean passing gate", () => {
    const state = checkState(
      item({
        checks: {
          gate_passed: true,
          gate_skipped: false,
          gate_command: "npm test",
          guard_errors: 0,
          guard_warnings: 0,
          receipt_verified: true,
          confidence: "high",
        },
      })
    );
    expect(state.tone).toBe("passed");
    expect(state.label).toBe("Checks passed");
  });
});
