import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Receipt } from "../lib/types";
import { ReceiptPanel } from "./ReceiptPanel";

const receipt: Receipt = {
  version: 1,
  id: "rcpt_0123456789ab",
  card_id: "card-1",
  run_id: "run-1",
  intent: "Ship the trust layer without a new dependency.",
  agent: { provider: "opencode", model: "deepseek-v4" },
  workspace: {
    branch: "bark/trust-layer",
    base_sha: "base123",
    head_sha: "head456",
  },
  diff: {
    files: 4,
    additions: 120,
    deletions: 8,
    paths: [
      "barkcli-core/src/guard/mod.rs",
      "barkcli-core/src/guard/checks.rs",
      "barkcli-core/src/receipt/mod.rs",
      "barkcli-core/src/review_risk.rs",
    ],
    test_files: ["barkcli-core/src/guard/checks.rs"],
    tests_changed: true,
  },
  gate: {
    command: "cargo test",
    passed: true,
    skipped: false,
    duration_ms: 4200,
    finished_at: "2026-10-28T10:00:00Z",
  },
  guard: {
    ran: true,
    passed: true,
    errors: 1,
    warnings: 1,
    findings: [
      {
        check: "secret",
        severity: "error",
        path: "barkcli-core/src/config.rs",
        line: 12,
        message: "Looks like a hardcoded token.",
        suggestion: "Move it to an environment variable.",
      },
      {
        check: "large_diff",
        severity: "warn",
        path: "barkcli-core/src/guard",
        message: "Diff touches 4 files.",
      },
    ],
  },
  tests_changed: true,
  review: {
    open_comments: 0,
    resolved_comments: 2,
    viewed_files: 3,
    total_files: 4,
  },
  confidence: {
    level: "high",
    reasons: ["Gate passed.", "Guard found no errors.", "Tests changed."],
  },
  created_at: "2026-10-28T10:01:00Z",
  content_hash: "0123456789abcdef0123456789abcdef",
};

describe("ReceiptPanel", () => {
  it("renders high confidence and reasons", () => {
    render(<ReceiptPanel receipt={receipt} loading={false} onVerify={vi.fn()} />);

    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.getByText("Gate passed.")).toBeInTheDocument();
    expect(screen.getByText("Guard found no errors.")).toBeInTheDocument();
    expect(screen.getByText("Tests changed.")).toBeInTheDocument();
    expect(screen.getByText("4 files · +120 −8")).toBeInTheDocument();
    expect(screen.getByText("sha256 0123456789ab")).toBeInTheDocument();
  });

  it("renders guard errors and warnings", () => {
    render(<ReceiptPanel receipt={receipt} loading={false} onVerify={vi.fn()} />);

    expect(screen.getByText("Errors · 1")).toBeInTheDocument();
    expect(screen.getByText("Warnings · 1")).toBeInTheDocument();
    expect(screen.getByText("Looks like a hardcoded token.")).toBeInTheDocument();
    expect(screen.getByText("Move it to an environment variable.")).toBeInTheDocument();
    expect(screen.getByText("Diff touches 4 files.")).toBeInTheDocument();
  });

  it("shows empty state without receipt", () => {
    render(<ReceiptPanel receipt={null} loading={false} onVerify={vi.fn()} />);
    expect(
      screen.getByText(/No receipt yet\. One is written when this card's branch merges\./)
    ).toBeInTheDocument();
  });
});
