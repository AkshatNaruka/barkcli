import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  AssistantMessageCard,
  LiveAgentWorkingBubble,
  splitThinkingContent,
  formatBackendName,
} from "./AssistantMessageCard";
import type { ThreadEvent } from "../lib/types";

describe("AssistantMessageCard & LiveAgentWorkingBubble", () => {
  it("formats backend names correctly", () => {
    expect(formatBackendName("claude-code")).toBe("Claude Code");
    expect(formatBackendName("opencode")).toBe("OpenCode");
    expect(formatBackendName("codex")).toBe("OpenAI Codex");
    expect(formatBackendName("you")).toBe("Bark Agent");
    expect(formatBackendName("custom-agent")).toBe("Custom-agent");
  });

  it("splits thinking content properly", () => {
    const textWithThink = "<think>Analyzing user request...</think>Here is the solution.";
    const result = splitThinkingContent(textWithThink);
    expect(result.thinking).toBe("Analyzing user request...");
    expect(result.body).toBe("Here is the solution.");

    const textWithout = "Direct response without reasoning tags.";
    const result2 = splitThinkingContent(textWithout);
    expect(result2.thinking).toBeNull();
    expect(result2.body).toBe("Direct response without reasoning tags.");
  });

  it("renders LiveAgentWorkingBubble with waveform, status, elapsed seconds, and stop button", () => {
    const onStop = vi.fn();
    render(
      <LiveAgentWorkingBubble
        backend="opencode"
        statusText="Reading project structure…"
        elapsedSeconds={5}
        recentActivities={[
          { id: "1", label: "Read Cargo.toml", icon: "eye", color: "text-sky-400", time: "just now" },
        ]}
        onStop={onStop}
      />
    );

    expect(screen.getByText("OpenCode")).toBeInTheDocument();
    expect(screen.getAllByText("Reading project structure…").length).toBeGreaterThan(0);
    expect(screen.getByText("· 5s")).toBeInTheDocument();
    expect(screen.getByText("Read Cargo.toml")).toBeInTheDocument();

    const stopButton = screen.getByRole("button", { name: /stop/i });
    expect(stopButton).toBeInTheDocument();
    fireEvent.click(stopButton);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("renders AssistantMessageCard progressively with dynamic streaming", () => {
    vi.useFakeTimers();
    try {
      const event: ThreadEvent = {
        id: "evt-1",
        card_id: "card-1",
        seq: 1,
        kind: "assistant_delta",
        author: "opencode",
        text: "Hello world!",
        created_at: new Date().toISOString(),
      };

      render(
        <AssistantMessageCard
          event={event}
          isStreaming={true}
          isLatest={true}
          copied={false}
          onCopy={vi.fn()}
        >
          {(text) => <span>{text}</span>}
        </AssistantMessageCard>
      );

      expect(screen.getByText("OpenCode")).toBeInTheDocument();
      expect(screen.getByText("Streaming…")).toBeInTheDocument();

      // One tick types initial letters progressively
      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(screen.getByText("He")).toBeInTheDocument();

      // Run remaining steps to complete progressive typing
      for (let i = 0; i < 8; i++) {
        act(() => {
          vi.advanceTimersByTime(20);
        });
      }
      expect(screen.getByText("Hello world!")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders Copy button when not streaming", () => {
    const onCopy = vi.fn();
    const event: ThreadEvent = {
      id: "evt-2",
      card_id: "card-1",
      seq: 2,
      kind: "assistant",
      author: "claude-code",
      text: "Task completed successfully.",
      created_at: new Date().toISOString(),
    };

    render(
      <AssistantMessageCard
        event={event}
        isStreaming={false}
        isLatest={false}
        copied={false}
        onCopy={onCopy}
      >
        {(text) => <span>{text}</span>}
      </AssistantMessageCard>
    );

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Task completed successfully.")).toBeInTheDocument();
    const copyBtn = screen.getByRole("button", { name: /copy reply/i });
    fireEvent.click(copyBtn);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});
