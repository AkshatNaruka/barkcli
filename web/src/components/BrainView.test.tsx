import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { BrainView } from "./BrainView";

const FIXTURES = vi.hoisted(() => ({
  nodes: [
    {
      id: "core",
      label: "Core subsystem",
      kind: "subsystem",
      tier: "long_term",
      importance: 0.9,
      access_count: 12,
      tags: ["core"],
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "storage",
      label: "Storage module",
      kind: "module",
      tier: "long_term",
      importance: 0.7,
      access_count: 4,
      tags: ["storage"],
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "queue",
      label: "Task queue",
      kind: "service",
      tier: "long_term",
      importance: 0.6,
      access_count: 3,
      tags: [],
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "http",
      label: "HTTP gateway",
      kind: "api",
      tier: "long_term",
      importance: 0.5,
      access_count: 2,
      tags: [],
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "mem-1",
      label: "Session memory one",
      kind: "memory",
      tier: "long_term",
      importance: 0.4,
      access_count: 2,
      tags: [],
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "mem-2",
      label: "Session memory two",
      kind: "memory",
      tier: "long_term",
      importance: 0.3,
      access_count: 1,
      tags: [],
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  edges: [
    { from: "core", to: "storage", kind: "contains", weight: 0.9 },
    { from: "core", to: "queue", kind: "contains", weight: 0.85 },
    { from: "storage", to: "mem-1", kind: "related", weight: 0.6 },
    { from: "queue", to: "mem-2", kind: "related", weight: 0.6 },
  ],
}));

vi.mock("../lib/api", () => ({
  fetchBrain: vi.fn().mockResolvedValue({
    nodes: FIXTURES.nodes,
    edges: FIXTURES.edges,
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

// Renders the nodes ReactFlow would draw so clicks can be driven from a test.
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes = [], onNodeClick, children }: any) => (
    <div data-testid="react-flow-mock">
      {nodes.map((node: any) => (
        <button
          key={node.id}
          type="button"
          data-testid={`rf-node-${node.id}`}
          onClick={(event) => onNodeClick?.(event, node)}
        >
          {node.data?.label}
        </button>
      ))}
      {children}
    </div>
  ),
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  Controls: () => null,
  MiniMap: () => <div data-testid="react-flow-minimap" />,
  Handle: () => null,
  Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
  MarkerType: { ArrowClosed: "arrowclosed" },
}));

async function openFlow() {
  render(<BrainView boardName="test-board" initialMode="3d" />);
  fireEvent.click(screen.getByRole("button", { name: /2D Flow/i }));
  await screen.findByTestId("react-flow-mock");
}

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

  it("opens on a small anchor map instead of the whole graph", async () => {
    await openFlow();

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText(/click a node to open its neighbourhood/i)).toBeInTheDocument();
    // A curated handful of nodes, not all six, and no minimap noise.
    expect(screen.queryByTestId("react-flow-minimap")).not.toBeInTheDocument();
    expect(screen.getByTestId("rf-node-core")).toBeInTheDocument();
    expect(screen.getByTestId("rf-node-storage")).toBeInTheDocument();
  });

  it("drills into a node's neighbourhood and comes back", async () => {
    await openFlow();

    fireEvent.click(screen.getByTestId("rf-node-core"));

    expect(screen.getByText("2 of 2 connections")).toBeInTheDocument();
    expect(screen.getByText("Connections · 2")).toBeInTheDocument();
    // The neighbourhood is the focus plus its neighbours, nothing else.
    expect(screen.getByTestId("rf-node-core")).toBeInTheDocument();
    expect(screen.getByTestId("rf-node-storage")).toBeInTheDocument();
    expect(screen.queryByTestId("rf-node-mem-1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByTestId("rf-node-mem-1")).toBeInTheDocument();
  });

  it("only shows the full map when asked, and only then shows the minimap", async () => {
    await openFlow();

    fireEvent.click(screen.getByRole("button", { name: /All \(6\)/i }));

    expect(screen.getByText("Full map")).toBeInTheDocument();
    expect(screen.getByTestId("react-flow-minimap")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.queryByTestId("react-flow-minimap")).not.toBeInTheDocument();
  });

  it("re-ranks the anchor map around a search instead of dimming everything", async () => {
    await openFlow();

    fireEvent.change(screen.getByPlaceholderText("Search graph…"), { target: { value: "storage" } });

    expect(screen.getByTestId("rf-node-storage")).toBeInTheDocument();
    expect(screen.queryByTestId("rf-node-core")).not.toBeInTheDocument();
    expect(screen.getByText(/1 match · showing 1/i)).toBeInTheDocument();
  });
});
