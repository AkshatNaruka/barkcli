import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { BrainView } from "./BrainView";

vi.mock("../lib/api", () => ({
  fetchBrain: vi.fn().mockResolvedValue({
    nodes: [
      { id: "node-1", name: "auth", kind: "service", tier: "l2", summary: "Authentication" },
    ],
    edges: [],
  }),
  fetchBrainNode: vi.fn().mockResolvedValue(null),
  fetchFacts: vi.fn().mockResolvedValue([]),
  fetchMemory: vi.fn().mockResolvedValue([]),
  fetchThreads: vi.fn().mockResolvedValue([]),
}));

vi.mock("./brain/Brain3DGraph", () => ({
  Brain3DGraph: () => <div data-testid="brain-3d-mock">3D Graph Mock</div>,
}));

vi.mock("./ContributionsPanel", () => ({
  ContributionsPanel: () => <div data-testid="contributions-panel-mock">Contributions Mock</div>,
}));

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: any) => <div data-testid="react-flow-mock">{children}</div>,
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  Controls: () => null,
  MiniMap: () => null,
}));

describe("BrainView mode switcher layout", () => {
  it("renders 3D Orbit, 2D Flow, and Contributions in fixed left-aligned position", async () => {
    render(<BrainView boardName="test-board" initialMode="3d" />);

    const orbitBtn = screen.getByRole("button", { name: /3D Orbit/i });
    const flowBtn = screen.getByRole("button", { name: /2D Flow/i });
    const contribBtn = screen.getByRole("button", { name: /Contributions/i });

    expect(orbitBtn).toBeInTheDocument();
    expect(flowBtn).toBeInTheDocument();
    expect(contribBtn).toBeInTheDocument();

    // Verify mode selector container is first child of command header with w-fit shrink-0
    const modeSelectorGroup = orbitBtn.closest(".rounded-lg");
    expect(modeSelectorGroup).toHaveClass("w-fit");
    expect(modeSelectorGroup).toHaveClass("shrink-0");

    const header = modeSelectorGroup?.parentElement;
    expect(header).toHaveClass("flex");
    expect(header?.firstElementChild).toBe(modeSelectorGroup);

    // Switch to Contributions
    fireEvent.click(contribBtn);
    expect(screen.getByTestId("contributions-panel-mock")).toBeInTheDocument();

    // Mode selector group remains the first child at fixed position
    expect(header?.firstElementChild).toBe(modeSelectorGroup);

    // Switch to 2D Flow
    fireEvent.click(flowBtn);
    expect(await screen.findByTestId("react-flow-mock")).toBeInTheDocument();
    expect(header?.firstElementChild).toBe(modeSelectorGroup);
  });
});
