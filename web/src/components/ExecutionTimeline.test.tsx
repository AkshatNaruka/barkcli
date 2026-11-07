import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutionTimeline } from "./ExecutionTimeline";
import type { RunTrace } from "../lib/types";

describe("ExecutionTimeline", () => {
  const sampleTrace: RunTrace = {
    run_id: "run-sample-1",
    total_duration_ms: 10000,
    spans: [
      {
        id: "span-1",
        phase: "input",
        label: "Context Intake",
        detail: "Packed 12 files, 4.2k tokens",
        start_ms: 0,
        duration_ms: 500,
        status: "success",
      },
      {
        id: "span-2",
        phase: "model",
        label: "Claude Code Thinking",
        detail: "Planning OAuth implementation",
        start_ms: 500,
        duration_ms: 4500,
        status: "success",
      },
      {
        id: "span-3",
        phase: "tool",
        label: "tool: read_file",
        detail: "src/auth/oauth.ts",
        start_ms: 5000,
        duration_ms: 300,
        status: "success",
      },
      {
        id: "span-4",
        phase: "tool",
        label: "tool: edit_file",
        detail: "src/auth/oauth.ts",
        start_ms: 5300,
        duration_ms: 700,
        status: "success",
      },
      {
        id: "span-5",
        phase: "gate",
        label: "Acceptance Gate: cargo test",
        detail: "14 passed, 0 failed (exit 0)",
        start_ms: 6000,
        duration_ms: 4000,
        status: "success",
      },
    ],
  };

  it("renders a minimal collapsed details summary", () => {
    render(<ExecutionTimeline trace={sampleTrace} />);
    expect(screen.getByText(/Execution trace/i)).toBeDefined();
    expect(screen.getByText("10.0s")).toBeDefined();
    expect(screen.getByText("2 calls")).toBeDefined();
  });

  it("renders lanes and allows selecting a span when expanded", () => {
    render(<ExecutionTimeline trace={sampleTrace} />);
    fireEvent.click(screen.getByText(/Execution trace/i));
    expect(screen.getByText("Input")).toBeDefined();
    expect(screen.getByText("Model")).toBeDefined();
    expect(screen.getByText("Tools")).toBeDefined();
    expect(screen.getByText("Gate")).toBeDefined();
    const toolSpan = screen.getByTitle(/tool: read_file/);
    fireEvent.click(toolSpan);
    expect(screen.getByText(/src\/auth\/oauth\.ts/)).toBeDefined();
  });

  it("renders nothing for empty or zero-duration traces", () => {
    const emptyTrace: RunTrace = { run_id: "run-empty", total_duration_ms: 0, spans: [] };
    const { container } = render(<ExecutionTimeline trace={emptyTrace} />);
    expect(container.firstChild).toBeNull();
  });
});
