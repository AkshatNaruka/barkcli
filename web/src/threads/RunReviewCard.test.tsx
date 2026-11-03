import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RunReviewCard } from "./RunReviewCard";
import type { RunRecord } from "../lib/types";

describe("RunReviewCard", () => {
  const sampleRun: RunRecord = {
    id: "run-42",
    thread_id: "thread-1",
    card_id: "card-1",
    ordinal: 1,
    provider: "opencode",
    status: "needs_review",
    permission_mode: "auto",
    branch: "bark/task-oauth",
    head_sha: "a1b2c3d4e5",
    started_at: "2026-11-03T20:00:00Z",
    ended_at: "2026-11-03T20:00:45Z",
    diff_stats: {
      files: 3,
      additions: 84,
      deletions: 12,
    },
    files_touched: ["src/auth.ts", "src/token.ts", "tests/auth.test.ts"],
    gate: {
      passed: true,
      command: "cargo test",
      summary: "14 passed, 0 failed in 1.2s",
      finished_at: "2026-11-03T20:00:44Z",
      verification: {
        outcome: "passed",
        tested_head: "a1b2c3d4e5",
        target_head: "09bd5f7",
        exit_code: 0,
      },
    },
    usage: {
      input_tokens: 4200,
      output_tokens: 850,
    },
  };

  it("renders branch, commit sha, and diff stats", () => {
    render(<RunReviewCard run={sampleRun} onApprove={vi.fn()} />);
    expect(screen.getByText("bark/task-oauth")).toBeDefined();
    expect(screen.getByText(/a1b2c3d/)).toBeDefined();
    expect(screen.getByText(/3 files changed/)).toBeDefined();
    expect(screen.getByText("+84")).toBeDefined();
    expect(screen.getByText("-12")).toBeDefined();
  });

  it("renders gate verification receipt badge", () => {
    render(<RunReviewCard run={sampleRun} onApprove={vi.fn()} />);
    expect(screen.getByText(/Acceptance Gate Passed/)).toBeDefined();
    expect(screen.getByText(/cargo test/)).toBeDefined();
  });

  it("triggers approve & merge when primary button clicked", () => {
    const handleApprove = vi.fn();
    render(<RunReviewCard run={sampleRun} onApprove={handleApprove} />);
    const approveBtn = screen.getByRole("button", { name: /Approve & Merge/i });
    fireEvent.click(approveBtn);
    expect(handleApprove).toHaveBeenCalledWith("run-42");
  });

  it("toggles the files touched list when clicked", () => {
    render(<RunReviewCard run={sampleRun} onApprove={vi.fn()} />);
    const toggleBtn = screen.getByRole("button", { name: /View 3 changed files/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByText("src/auth.ts")).toBeDefined();
    expect(screen.getByText("tests/auth.test.ts")).toBeDefined();
  });
});
