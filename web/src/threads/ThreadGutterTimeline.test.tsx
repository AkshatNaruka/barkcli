import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ThreadGutterTimeline } from "./ThreadGutterTimeline";
import type { ThreadEvent, RunRecord } from "../lib/types";

describe("ThreadGutterTimeline", () => {
  const events: ThreadEvent[] = [
    {
      id: "ev-1",
      card_id: "card-1",
      seq: 1,
      kind: "user",
      author: "user",
      text: "i tried running plan in thread, it worked but we need more tests",
      created_at: "2026-11-09T10:00:00Z",
    },
    {
      id: "ev-2",
      card_id: "card-1",
      seq: 2,
      kind: "assistant",
      author: "assistant",
      text: "The plan/build succeeded with all test gates passing.",
      created_at: "2026-11-09T10:01:00Z",
    },
  ];

  const runs: RunRecord[] = [
    {
      id: "run_4884e85eb02943828fb4d42477157b6",
      thread_id: "th-1",
      card_id: "card-1",
      ordinal: 1,
      provider: "opencode",
      model: "crouton-alpha-free",
      status: "passed",
      permission_mode: "auto",
      started_at: "2026-11-09T10:00:00Z",
      ended_at: "2026-11-09T10:12:55Z",
      diff_stats: { files: 13, additions: 189, deletions: 59 },
      usage: { input_tokens: 100, output_tokens: 200 },
      files_touched: ["barkcli/web/src/lib/updater.ts"],
      summary: "The plan/build succeeded and verification receipts were generated.",
    },
  ];

  it("renders the vertical dashed line and tick elements", () => {
    const containerRef = { current: document.createElement("div") };
    const { container } = render(
      <ThreadGutterTimeline events={events} runs={runs} containerRef={containerRef} />
    );

    const timeline = screen.getByLabelText("Thread history timeline");
    expect(timeline).toBeInTheDocument();
    // Verify tick marks are present inside
    const ticks = container.querySelectorAll(".rounded-full");
    expect(ticks.length).toBeGreaterThan(10);
  });

  it("displays hover card with thread details on mouse move", async () => {
    const containerRef = { current: document.createElement("div") };
    render(
      <ThreadGutterTimeline events={events} runs={runs} containerRef={containerRef} />
    );

    const timeline = screen.getByLabelText("Thread history timeline");

    // Simulate mouse move over timeline
    fireEvent.mouseMove(timeline, { clientY: 50 });

    // Should display the user prompt title
    expect(await screen.findByText(/i tried running plan in thread/)).toBeInTheDocument();
    // Should display the assistant message text
    expect(screen.getByText(/The plan\/build succeeded with all test gates passing/)).toBeInTheDocument();
    // Should display duration
    expect(screen.getByText("12m 55s")).toBeInTheDocument();
    // Should display files changed and diff stats
    expect(screen.getByText("+189")).toBeInTheDocument();
    expect(screen.getByText("-59")).toBeInTheDocument();
    expect(screen.getByText("updater.ts")).toBeInTheDocument();
  });

  it("smoothly scrolls to turn element on click", () => {
    const scrollIntoViewMock = vi.fn();
    const targetElement = document.createElement("div");
    targetElement.id = "thread-event-ev-1";
    targetElement.scrollIntoView = scrollIntoViewMock;
    document.body.appendChild(targetElement);

    const containerRef = { current: document.createElement("div") };
    render(
      <ThreadGutterTimeline events={events} runs={runs} containerRef={containerRef} />
    );

    const timeline = screen.getByLabelText("Thread history timeline");
    fireEvent.mouseMove(timeline, { clientY: 50 });
    fireEvent.click(timeline);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });

    document.body.removeChild(targetElement);
  });
});
