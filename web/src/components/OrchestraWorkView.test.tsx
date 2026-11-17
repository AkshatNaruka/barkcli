import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrchestraWorkView } from "./OrchestraWorkView";
import type { OrchestraSnapshot, ProductPlan } from "../lib/types";

const api = vi.hoisted(() => ({
  approveOrchestraPlan: vi.fn(),
  approveRun: vi.fn(),
  answerOrchestraQuestion: vi.fn(),
  assignOrchestraTask: vi.fn(),
  cancelOrchestraPlan: vi.fn(),
  createOrchestraPlan: vi.fn(),
  dispatchOrchestraPlan: vi.fn(),
  fetchOrchestra: vi.fn(),
  fetchOrchestraAssignments: vi.fn(),
  mergeRun: vi.fn(),
  retryOrchestraTask: vi.fn(),
}));

vi.mock("../lib/api", () => api);

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: { children?: ReactNode }) => (
    <div data-testid="workflow-canvas">{children}</div>
  ),
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  MarkerType: { ArrowClosed: "arrowclosed" },
}));

function plan(overrides: Partial<ProductPlan> = {}): ProductPlan {
  return {
    id: "plan-1",
    board_name: "dev",
    parent_card_id: "card-1",
    parent_thread_id: "",
    title: "Ship OAuth login",
    summary: "Wire the redirect round-trip and land it behind a test gate.",
    assumptions: [],
    questions: [],
    acceptance_criteria: ["Login round-trip passes e2e"],
    tasks: [
      {
        id: "t1",
        title: "Build authorize endpoint",
        role: "builder",
        description: "",
        acceptance_criteria: [],
        files: [],
        depends_on: [],
        estimate: "2h",
        priority: "high",
        labels: [],
        status: "merged",
        previous_run_ids: [],
        gate_passed: true,
      },
      {
        id: "t2",
        title: "Add session cookie write",
        role: "builder",
        description: "",
        acceptance_criteria: [],
        files: [],
        depends_on: ["t1"],
        estimate: "1h",
        priority: "high",
        labels: [],
        status: "running",
        previous_run_ids: [],
        gate_passed: false,
      },
    ],
    risks: ["Cookie flags differ per browser"],
    recommended_team: ["builder"],
    first_slice: "t1",
    status: "awaiting_approval",
    source: "card",
    created_at: "2026-11-17T00:00:00Z",
    updated_at: "2026-11-17T00:00:00Z",
    ...overrides,
  };
}

function snapshot(plans: ProductPlan[]): OrchestraSnapshot {
  return {
    board_name: "dev",
    plans,
    team: [],
    capacity: {
      max_parallel: 2,
      active_tasks: 1,
      available_slots: 1,
      active_agents: 1,
      team_size: 1,
    },
    merge_train: [],
    pending_approvals: [],
    roles: [],
  };
}

describe("OrchestraWorkView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchOrchestra.mockResolvedValue(snapshot([plan()]));
  });

  it("shows the plan as a workflow graph by default", async () => {
    render(<OrchestraWorkView boardName="dev" board={null} />);

    expect(await screen.findByText("Ship OAuth login")).toBeInTheDocument();
    expect(await screen.findByTestId("workflow-canvas")).toBeInTheDocument();

    const group = screen.getByRole("group", { name: "Plan view" });
    expect(screen.getByRole("button", { name: "Workflow" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(group).toContainElement(screen.getByRole("button", { name: "List" }));
  });

  it("switches to the dense step list and keeps the graph out of the DOM", async () => {
    render(<OrchestraWorkView boardName="dev" board={null} />);
    await screen.findByTestId("workflow-canvas");

    await userEvent.click(screen.getByRole("button", { name: "List" }));

    expect(screen.queryByTestId("workflow-canvas")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Build authorize endpoint")).toBeInTheDocument();
  });

  it("reads the dependency order to screen readers", async () => {
    render(<OrchestraWorkView boardName="dev" board={null} />);
    await screen.findByTestId("workflow-canvas");

    const summary = document.querySelector(".sr-only");
    expect(summary?.textContent).toContain("Build authorize endpoint: Merged, no dependencies");
    expect(summary?.textContent).toContain("Add session cookie write: Running, after t1");
  });
});
