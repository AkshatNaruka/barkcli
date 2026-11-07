import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepExplorer, parseStepEvent } from "./StepExplorer";
import type { ThreadEvent } from "../lib/types";

describe("StepExplorer", () => {
  it("parses search, find, analyze, and command events correctly", () => {
    const searchEv: ThreadEvent = {
      id: "ev-1",
      card_id: "test",
      kind: "tool_call",
      author: "barkcli",
      text: "Ran search startThreadChat in codebase",
      created_at: new Date().toISOString(),
    };
    const parsedSearch = parseStepEvent(searchEv);
    expect(parsedSearch.kind).toBe("search");
    expect(parsedSearch.query).toBe("startThreadChat");
    expect(parsedSearch.scope).toBe("codebase");

    const analyzeEv: ThreadEvent = {
      id: "ev-2",
      card_id: "test",
      kind: "tool_call",
      author: "barkcli",
      text: "Analyzed ts api.ts #L1550-1600",
      created_at: new Date().toISOString(),
    };
    const parsedAnalyze = parseStepEvent(analyzeEv);
    expect(parsedAnalyze.kind).toBe("analyze");
    expect(parsedAnalyze.file).toBe("ts"); // or parsed file
    expect(parsedAnalyze.lineRange).toBe("#L1550-1600");
  });

  it("renders collapsible details for steps", () => {
    const events: ThreadEvent[] = [
      {
        id: "ev-1",
        card_id: "test",
        kind: "tool_call",
        author: "barkcli",
        text: "Ran search startThreadChat in codebase",
        created_at: new Date().toISOString(),
      },
      {
        id: "ev-2",
        card_id: "test",
        kind: "tool_call",
        author: "barkcli",
        text: "Analyzed api.ts",
        data: { input: { file: "api.ts", line_start: 1550, line_end: 1600 } },
        created_at: new Date().toISOString(),
      },
    ];

    render(<StepExplorer running={false} events={events} />);

    fireEvent.click(screen.getByText(/Steps · 2/));
    expect(screen.getAllByText("startThreadChat").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/api\.ts #L1550-1600/).length).toBeGreaterThan(0);
  });

  it("renders minimal running state with no fake steps", () => {
    render(<StepExplorer running={true} intent="test prompt" />);
    expect(screen.getByText("Working…")).toBeInTheDocument();
  });
});
